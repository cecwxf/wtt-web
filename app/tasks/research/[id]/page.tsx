'use client'

import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import dynamic from 'next/dynamic'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'
import { normalizeAndFilterAgents } from '@/lib/agents'
import { ChatFileUpload, FileAttachmentPreview, stripFileTokens, PendingAttachments } from '@/components/ui/chat-file-upload'
import { isDesktop, pickLocalFiles, readLocalFile, pickAndScanFolder, readFilesBatch, registerFileBridge } from '@/lib/desktop'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { TaskAgentSidebar } from '@/components/ui/task-agent-sidebar'
import { CircularProgress } from '@/components/ui/circular-progress'
import { stripMetaBlocks, isProgressMessage } from '@/components/ui/chat-view'
import { useAgentId, buildAgentUrl } from '@/lib/hooks/use-agent-id'
import { formatTime, formatFullDateTime } from '@/lib/time'

const PdfViewer = dynamic(() => import('@/components/ui/pdf-viewer'), { ssr: false })
const AnnotationOverlay = dynamic(() => import('@/components/ui/annotation-overlay'), { ssr: false })

/** Rewrite legacy http://170.106.109.4:8000 URLs to HTTPS domain */
function fixMediaUrl(url: string | null | undefined): string {
  if (!url) return ''
  return url.replace(/^http:\/\/170\.106\.109\.4:8000/, 'https://www.waxbyte.com')
}

/** Client-side cleanup for raw PDF text — fixes common extraction artifacts */
function cleanPdfText(text: string | null | undefined): string {
  if (!text) return ''
  let s = text
  // Fix hyphenated word breaks: "envi-\nronments" → "environments"
  s = s.replace(/(\w)-\n(\w)/g, '$1$2')
  // Fix inline hyphenation: "re- source" → "resource"
  s = s.replace(/(\w)- (\w)/g, '$1$2')
  // Merge mid-sentence line breaks (line not ending with .!? followed by lowercase)
  s = s.replace(/([^.!?\n])\n([a-z])/g, '$1 $2')
  // Collapse runs of whitespace (not newlines) into single space
  s = s.replace(/[^\S\n]+/g, ' ')
  // Normalize multiple blank lines
  s = s.replace(/\n{3,}/g, '\n\n')
  return s.trim()
}

import { buildActions, handleEditorKeyDown, EditorToolbar, MarkdownPreview, isMarkdownFile, readMarkdownFile } from '@/components/ui/markdown-editor'

// ── Types ──────────────────────────────────────────────
interface Agent {
  id: string
  agent_id: string
  display_name: string
  is_primary: boolean
}

interface Paper {
  id: string
  task_id: string
  title: string
  authors: string
  year: number | null
  journal: string
  doi: string
  abstract: string
  conclusion: string
  content_markdown?: string
  content_type: string
  source_url: string
  source_filename: string
  tags: string
  citation_count: number
  notes: string
  created_at: string
  updated_at: string
}

interface ChatMsg {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  sender_display_name?: string
}

// ── Helpers ────────────────────────────────────────────
const paperIcon = (type: string) => {
  const m: Record<string, string> = { pdf: '📕', md: '📝', markdown: '📝', bibtex: '📚', bib: '📚', txt: '📄', tex: '📐' }
  return m[type] || '📄'
}

const parseAuthors = (raw: string): string => {
  if (!raw) return ''
  try {
    const arr = JSON.parse(raw)
    if (Array.isArray(arr)) return arr.join(', ')
  } catch { /* ignore */ }
  return raw
}

// ── Citation Hover Preview Component ──────────────────
const CitationText = ({ text, papers }: { text: string; papers: Paper[] }) => {
  const parts = text.split(/(\[\d+\])/)
  return (
    <span>
      {parts.map((part, i) => {
        const match = part.match(/^\[(\d+)\]$/)
        if (match) {
          const idx = parseInt(match[1]) - 1
          const paper = papers[idx]
          if (paper) {
            return (
              <span key={i} className="relative group cursor-help text-indigo-500 font-medium">
                {part}
                <span className="absolute bottom-full left-0 mb-1 hidden group-hover:block w-64 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2 text-xs text-slate-600 dark:text-zinc-300 shadow-lg z-50">
                  <p className="font-medium text-slate-800">{paper.title}</p>
                  {paper.year && <p className="text-slate-400">{paper.year}</p>}
                  {paper.authors && <p className="text-slate-400 truncate">{parseAuthors(paper.authors)}</p>}
                </span>
              </span>
            )
          }
        }
        return <span key={i}>{part}</span>
      })}
    </span>
  )
}

// ── Main Component ─────────────────────────────────────
export default function ResearchTaskPageWrapper() {
  return <Suspense fallback={null}><ResearchTaskPageInner /></Suspense>
}

function ResearchTaskPageInner() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const taskId = params.id as string

  // L4 fullscreen mode
  const [l4Fullscreen, setL4Fullscreen] = useState(false)

  // Agent
  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgentId, setSelectedAgentId] = useAgentId()

  // Papers
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; pct: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Center panel
  const [centerTab, setCenterTab] = useState<'read' | 'write' | 'export'>('read')
  const [readingLevel, setReadingLevel] = useState<1 | 2 | 3 | 4 | 5>(2)
  const [l4View, setL4View] = useState<'native' | 'text'>('native')
  const [writeContent, setWriteContent] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem(`research-write-${params.id}`) || ''
    return ''
  })
  const [writeViewMode, setWriteViewMode] = useState<'edit' | 'split' | 'preview'>('split')
  const writeTextareaRef = useRef<HTMLTextAreaElement>(null)
  const writeFileRef = useRef<HTMLInputElement>(null)
  const writeActions = useMemo(() => buildActions(), [])

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([])
  const [chatInput, setChatInput] = useState('')
  const [sending, setSending] = useState(false)
  const [pendingAttachments, setPendingAttachments] = useState<string[]>([])
  const chatEndRef = useRef<HTMLDivElement>(null)
  const webFileRef = useRef<HTMLInputElement>(null)
  const webFolderRef = useRef<HTMLInputElement>(null)

  // Quote-to-chat & context menu
  const readerRef = useRef<HTMLDivElement>(null)
  const l4ScrollRef = useRef<HTMLDivElement>(null)
  const [quoteBtn, setQuoteBtn] = useState<{ x: number; y: number; text: string } | null>(null)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; text: string | null } | null>(null)
  const [notesOpen, setNotesOpen] = useState(false)
  const [noteDialog, setNoteDialog] = useState<{ quote: string; comment: string } | null>(null)
  const [showAnnotationTools, setShowAnnotationTools] = useState(0)
  const [annotationAnchor, setAnnotationAnchor] = useState<{ x: number; y: number } | null>(null)

  // Resize
  const [projectW, setProjectW] = useState(() => {
    if (typeof window !== 'undefined') return parseInt(localStorage.getItem('research-project-w') || '192') || 192
    return 192
  })
  const [leftW, setLeftW] = useState(() => {
    if (typeof window !== 'undefined') return parseInt(localStorage.getItem('research-left-w') || '280') || 280
    return 280
  })
  const [rightW, setRightW] = useState(() => {
    if (typeof window !== 'undefined') return parseInt(localStorage.getItem('research-right-w') || '420') || 420
    return 420
  })
  const resizingRef = useRef<'projects' | 'left' | 'right' | null>(null)
  const resizeStartXRef = useRef(0)
  const resizeStartWRef = useRef(0)

  // Export state
  const [exportTemplate, setExportTemplate] = useState('academic')
  const [selectedExportPapers, setSelectedExportPapers] = useState<Set<string>>(new Set())
  const [exportLang, setExportLang] = useState<'en' | 'zh'>('en')

  // Search filters
  const [yearFrom, setYearFrom] = useState<string>('')
  const [yearTo, setYearTo] = useState<string>('')
  const [sortBy, setSortBy] = useState('created_at')
  const [useFts, setUseFts] = useState(false)
  const [showFilters, setShowFilters] = useState(false)

  // Citation panel
  const [citationTab, setCitationTab] = useState<'refs' | 'cited'>('refs')

  // Project directory
  const [projectsCollapsed, setProjectsCollapsed] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('research-projects-collapsed') === 'true'
    return false
  })

  // Insert feedback
  const [insertFeedback, setInsertFeedback] = useState<string | null>(null)

  // ── Drag-and-drop ────────────────────────────────────
  const [dragOver, setDragOver] = useState(false)

  // ── Data fetching ────────────────────────────────────
  const authHeaders = useCallback(() => ({
    Authorization: `Bearer ${session?.accessToken ?? ''}`,
  }), [session?.accessToken])

  const { data: task, mutate: mutateTask } = useSWR(
    session?.accessToken ? [`task-${taskId}`, session.accessToken] : null,
    async () => {
      const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}`, { headers: authHeaders() })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    },
  )

  // Fetch all research tasks as "projects"
  type ProjectItem = { id: string; title: string; status: string; paper_count?: number; updated_at?: string }
  const { data: projectsRaw, mutate: mutateProjects } = useSWR(
    session?.accessToken && selectedAgentId ? ['research-projects', session.accessToken, selectedAgentId] : null,
    async () => {
      const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks?task_type=research&agent_id=${encodeURIComponent(selectedAgentId)}&limit=200`, { headers: authHeaders() })
      if (!r.ok) return []
      const data = await r.json()
      return (data.tasks || data || []) as ProjectItem[]
    },
    { refreshInterval: 60000, keepPreviousData: true },
  )
  const projects: ProjectItem[] = useMemo(() => (projectsRaw || []).filter((p: ProjectItem) => p.id !== 'default'), [projectsRaw])

  const createProject = async () => {
    const title = prompt('New Research Project name:')
    if (!title?.trim()) return
    const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ title: title.trim(), task_type: 'research', priority: 'P2', status: 'todo', owner_agent_id: selectedAgentId, runner_agent_id: selectedAgentId, created_by: selectedAgentId }),
    })
    if (!r.ok) { alert('Failed to create project'); return }
    const t = await r.json()
    mutateProjects()
    router.push(buildAgentUrl(`/tasks/research/${t.id}`, selectedAgentId))
  }

  const renameProject = async (pid: string, currentTitle: string) => {
    const title = prompt('Rename project:', currentTitle)
    if (!title?.trim() || title.trim() === currentTitle) return
    await fetch(`${CLIENT_WTT_API_BASE}/tasks/${pid}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ title: title.trim() }),
    })
    mutateProjects()
    if (pid === taskId) mutateTask()
  }

  const deleteProject = async (pid: string) => {
    if (!confirm('Delete this project and all its papers?')) return
    await fetch(`${CLIENT_WTT_API_BASE}/tasks/${pid}?agent_id=${encodeURIComponent(selectedAgentId)}&delete_topic=true`, {
      method: 'DELETE', headers: authHeaders(),
    })
    mutateProjects()
    if (pid === taskId && projects.length > 1) {
      const other = projects.find(p => p.id !== pid)
      if (other) router.push(buildAgentUrl(`/tasks/research/${other.id}`, selectedAgentId))
      else router.push(buildAgentUrl('/tasks', selectedAgentId))
    }
  }

  const { data: papersData, mutate: mutatePapers } = useSWR(
    session?.accessToken ? [`research-papers-${taskId}`, session.accessToken, searchQuery, yearFrom, yearTo, sortBy, useFts] : null,
    async () => {
      const q = searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ''
      const yf = yearFrom ? `&year_from=${encodeURIComponent(yearFrom)}` : ''
      const yt = yearTo ? `&year_to=${encodeURIComponent(yearTo)}` : ''
      const s = sortBy !== 'created_at' ? `&sort=${encodeURIComponent(sortBy)}` : ''
      const fts = useFts && searchQuery ? '&fts=true' : ''
      const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/research/papers?limit=200${q}${yf}${yt}${s}${fts}`, { headers: authHeaders() })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    },
    { refreshInterval: 30000, keepPreviousData: true },
  )

  const papers: Paper[] = useMemo(() => papersData?.papers || [], [papersData])

  const { data: selectedPaperFull, mutate: mutatePaperFull } = useSWR(
    selectedPaperId && session?.accessToken ? [`paper-full-${selectedPaperId}`, session.accessToken] : null,
    async () => {
      const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/research/papers/${selectedPaperId}`, { headers: authHeaders() })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    },
    { keepPreviousData: true },
  )

  const { data: citationsData, mutate: mutateCitations } = useSWR(
    selectedPaperId && session?.accessToken && readingLevel === 5
      ? [`paper-citations-${selectedPaperId}-${citationTab}`, session.accessToken]
      : null,
    async () => {
      const direction = citationTab === 'refs' ? 'references' : 'cited_by'
      const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/research/papers/${selectedPaperId}/citations?direction=${direction}`, { headers: authHeaders() })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    },
    { keepPreviousData: true },
  )

  const { data: topicMessages, mutate: mutateMessages } = useSWR(
    task?.topic_id && session?.accessToken ? [`research-chat-${task.topic_id}`, session.accessToken] : null,
    async () => {
      const r = await fetch(`${CLIENT_WTT_API_BASE}/topics/${task.topic_id}/messages?limit=200&agent_id=${selectedAgentId}`, { headers: authHeaders() })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    },
    { refreshInterval: 5000, keepPreviousData: true },
  )

  // ── Effects ──────────────────────────────────────────
  useEffect(() => {
    if (!topicMessages) return
    const mapped: ChatMsg[] = topicMessages.map((m: Record<string, string>) => ({
      id: m.message_id,
      role: m.sender_id === selectedAgentId ? 'user' : 'assistant',
      content: m.content,
      timestamp: m.timestamp,
      sender_display_name: m.sender_display_name || agents.find(a => a.agent_id === m.sender_id)?.display_name || m.sender_id,
    }))
    setChatMessages(mapped)
  }, [topicMessages, selectedAgentId])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  const loadAgents = useCallback(async () => {
    const r = await fetch(`${CLIENT_WTT_API_BASE}/agents/my`, { headers: authHeaders() })
    if (!r.ok) return
    const data = await r.json()
    const list = normalizeAndFilterAgents(data)
    setAgents(list)
    if (list.length > 0 && !selectedAgentId) {
      setSelectedAgentId(list.find((a: Agent) => a.is_primary)?.agent_id || list[0].agent_id)
    }
  }, [selectedAgentId, authHeaders])

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
    if (status === 'authenticated') loadAgents()
  }, [status, router, loadAgents])

  // Resize persistence
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('research-project-w', String(projectW))
      localStorage.setItem('research-left-w', String(leftW))
      localStorage.setItem('research-right-w', String(rightW))
    }
  }, [projectW, leftW, rightW])

  // Write content auto-save
  useEffect(() => {
    if (typeof window !== 'undefined' && taskId) {
      localStorage.setItem(`research-write-${taskId}`, writeContent)
    }
  }, [writeContent, taskId])

  // Resize handlers
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizingRef.current) return
      const dx = e.clientX - resizeStartXRef.current
      if (resizingRef.current === 'projects') {
        setProjectW(Math.max(120, Math.min(360, resizeStartWRef.current + dx)))
      } else if (resizingRef.current === 'left') {
        setLeftW(Math.max(200, Math.min(500, resizeStartWRef.current + dx)))
      } else {
        setRightW(Math.max(280, Math.min(700, resizeStartWRef.current - dx)))
      }
    }
    const onUp = () => {
      resizingRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  // ── Text selection → context menu (right-click) + floating button ──
  useEffect(() => {
    const handleSelection = () => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        setQuoteBtn(null)
        return
      }
      const node = sel.anchorNode
      if (!node || !readerRef.current?.contains(node)) {
        setQuoteBtn(null)
        return
      }
      const range = sel.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      setQuoteBtn({
        x: rect.left + rect.width / 2,
        y: rect.top - 8,
        text: sel.toString().trim()
      })
    }
    const handleContextMenu = (e: MouseEvent) => {
      if (!readerRef.current?.contains(e.target as Node)) return
      const sel = window.getSelection()
      const hasText = sel && !sel.isCollapsed && sel.toString().trim()
      // Show context menu with text actions (if text selected) or annotation-only
      e.preventDefault()
      setCtxMenu({ x: e.clientX, y: e.clientY, text: hasText ? sel!.toString().trim() : null })
      setQuoteBtn(null)
    }
    const dismissCtx = () => setCtxMenu(null)
    document.addEventListener('mouseup', handleSelection)
    document.addEventListener('contextmenu', handleContextMenu)
    document.addEventListener('click', dismissCtx)
    return () => {
      document.removeEventListener('mouseup', handleSelection)
      document.removeEventListener('contextmenu', handleContextMenu)
      document.removeEventListener('click', dismissCtx)
    }
  }, [])

  const quoteToChat = (text: string) => {
    const charCount = text.length
    const lineCount = text.split('\n').length
    const preview = text.slice(0, 100).replace(/\n/g, ' ').trim()
    const ellipsis = charCount > 100 ? '...' : ''
    const paperTitle = selectedPaperFull?.title || 'Current Document'
    // Compact reference — agent has paper context, just needs a locator
    const ref = `📌 [Paper Ref: "${paperTitle}" — ${charCount} chars, ${lineCount} lines]\n> "${preview}${ellipsis}"`
    setChatInput(prev => prev ? `${prev}\n\n${ref}\n\n` : `${ref}\n\n`)
    setQuoteBtn(null)
    setCtxMenu(null)
    window.getSelection()?.removeAllRanges()
    setTimeout(() => {
      const el = document.querySelector<HTMLTextAreaElement>('[data-chat-input]')
      el?.focus()
    }, 100)
  }

  const addToNotes = (text: string) => {
    setCtxMenu(null)
    setQuoteBtn(null)
    window.getSelection()?.removeAllRanges()
    setNoteDialog({ quote: text, comment: '' })
  }

  const saveNote = async () => {
    if (!selectedPaperId || !noteDialog) return
    const timestamp = formatFullDateTime(new Date().toISOString())
    const parts = [`\n---\n📌 ${timestamp}`]
    if (noteDialog.quote) parts.push(`> ${noteDialog.quote.split('\n').join('\n> ')}`)
    if (noteDialog.comment.trim()) parts.push(`\n${noteDialog.comment.trim()}`)
    const entry = parts.join('\n') + '\n'
    const updated = (selectedPaperFull?.notes || '') + entry
    try {
      await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/research/papers/${selectedPaperId}`, {
        method: 'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: updated }),
      })
      mutatePapers()
      setNotesOpen(true)
    } catch {}
    setNoteDialog(null)
  }

  const startResize = (which: 'projects' | 'left' | 'right', e: React.MouseEvent) => {
    resizingRef.current = which
    resizeStartXRef.current = e.clientX
    resizeStartWRef.current = which === 'projects' ? projectW : which === 'left' ? leftW : rightW
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  // ── Paper Upload ─────────────────────────────────────
  const uploadFiles = async (files: FileList | File[]) => {
    const fileArr = Array.from(files)
    setUploading(true)
    setUploadProgress({ current: 0, total: fileArr.length, pct: 0 })
    for (let i = 0; i < fileArr.length; i++) {
      const file = fileArr[i]
      setUploadProgress({ current: i + 1, total: fileArr.length, pct: 0 })
      try {
        // Use XHR for progress tracking on FormData upload
        const paper: Record<string, unknown> = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest()
          xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
              setUploadProgress(prev => prev ? { ...prev, pct: Math.round((e.loaded / e.total) * 100) } : prev)
            }
          })
          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try { resolve(JSON.parse(xhr.responseText)) } catch { resolve({}) }
            } else {
              reject(new Error(xhr.responseText || `Upload failed: ${xhr.status}`))
            }
          })
          xhr.addEventListener('error', () => reject(new Error('Upload failed')))
          xhr.open('POST', `${CLIENT_WTT_API_BASE}/tasks/${taskId}/research/papers/upload`)
          const hdrs = authHeaders()
          Object.entries(hdrs).forEach(([k, v]) => { if (k.toLowerCase() !== 'content-type') xhr.setRequestHeader(k, v as string) })
          const formData = new FormData()
          formData.append('file', file)
          xhr.send(formData)
        })

        // Notify agent via task topic
        if (task?.topic_id) {
          const paperTitle = (paper.title as string) || file.name
          const paperUrl = (paper.source_url as string) || ''
          const paperDoi = paper.doi ? ` | DOI: ${paper.doi}` : ''
          const paperAuthors = paper.authors ? ` | Authors: ${parseAuthors(paper.authors as string)}` : ''
          const paperYear = paper.year ? ` (${paper.year})` : ''
          const msg = `[📄 Paper Imported] ${paperTitle}${paperYear}${paperAuthors}${paperDoi}\nFile: ${paperUrl}\n\nPlease analyze this paper and provide key insights.`

          await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/chat/send`, {
            method: 'POST',
            headers: { ...authHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content: msg,
              sender_type: 'HUMAN',
              semantic_type: 'post',
              auto_run: task?.status === 'todo',
              include_task_context: false,
            }),
          })
        }
      } catch (err) {
        console.error('Upload error:', err)
      }
    }
    setUploading(false)
    setUploadProgress(null)
    mutatePapers()
    mutateMessages()
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) uploadFiles(e.target.files)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length > 0) uploadFiles(e.dataTransfer.files)
  }

  // ── Delete paper ─────────────────────────────────────
  const deletePaper = async (paperId: string) => {
    if (!confirm('Delete this paper?')) return
    await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/research/papers/${paperId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    })
    if (selectedPaperId === paperId) setSelectedPaperId(null)
    mutatePapers()
  }

  // ── Chat ─────────────────────────────────────────────
  const attachLocalFiles = async () => {
    const files = await pickLocalFiles({
      title: 'Attach files to research task',
      filters: [
        { name: 'Documents', extensions: ['pdf', 'md', 'txt', 'docx', 'html', 'csv', 'json'] },
        { name: 'Code', extensions: ['py', 'js', 'ts', 'tsx', 'go', 'rs', 'java', 'c', 'cpp', 'rb', 'sh'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      multiple: true,
    })
    if (!files || files.length === 0) return
    for (const f of files) {
      const content = await readLocalFile(f.path)
      if (!content) continue
      const truncated = content.length > 32000 ? content.slice(0, 32000) + '\n... (truncated)' : content
      const token = `📎 **${f.name}** (${(f.size / 1024).toFixed(1)} KB)\n\`\`\`\n${truncated}\n\`\`\``
      setPendingAttachments(prev => [...prev, token])
    }
  }

  const attachLocalFolder = async () => {
    const result = await pickAndScanFolder('Attach folder to research task')
    if (!result || result.files.length === 0) return
    // Register file bridge for on-demand agent access
    if (selectedAgentId) {
      registerFileBridge(taskId, selectedAgentId, result.path, result.files).catch(() => {})
    }
    const textFiles = result.files.filter(f => f.isText).slice(0, 20)
    const readResults = await readFilesBatch(textFiles.map(f => f.path))
    if (!readResults) return
    let attached = 0
    for (let i = 0; i < textFiles.length; i++) {
      const file = textFiles[i]
      const read = readResults[i]
      if (!read?.ok || !read.content) continue
      const truncated = read.content.length > 16000 ? read.content.slice(0, 16000) + '\n... (truncated)' : read.content
      const token = `📎 **${file.relativePath}** (${(file.size / 1024).toFixed(1)} KB)\n\`\`\`\n${truncated}\n\`\`\``
      setPendingAttachments(prev => [...prev, token])
      attached++
    }
    if (textFiles.length < result.files.length) {
      alert(`Attached ${attached} text files. ${result.files.length - textFiles.length} binary/extra files skipped (max 20).`)
    }
  }

  // Web fallback: attach files via <input type="file">
  const handleWebFileAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    for (const file of Array.from(files)) {
      if (file.size > 5 * 1024 * 1024) continue
      try {
        const content = await file.text()
        const truncated = content.length > 32000 ? content.slice(0, 32000) + '\n... (truncated)' : content
        const token = `📎 **${file.name}** (${(file.size / 1024).toFixed(1)} KB)\n\`\`\`\n${truncated}\n\`\`\``
        setPendingAttachments(prev => [...prev, token])
      } catch { /* binary file, skip */ }
    }
    if (e.target) e.target.value = ''
  }

  // Web fallback: attach folder via <input webkitdirectory>
  const handleWebFolderAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    const textFiles = Array.from(files).filter(f => f.size < 2 * 1024 * 1024 && f.size > 0).slice(0, 20)
    let attached = 0
    for (const file of textFiles) {
      try {
        const content = await file.text()
        const truncated = content.length > 16000 ? content.slice(0, 16000) + '\n... (truncated)' : content
        const relativePath = file.webkitRelativePath || file.name
        const token = `📎 **${relativePath}** (${(file.size / 1024).toFixed(1)} KB)\n\`\`\`\n${truncated}\n\`\`\``
        setPendingAttachments(prev => [...prev, token])
        attached++
      } catch { /* binary file, skip */ }
    }
    if (attached < Array.from(files).length) {
      alert(`Attached ${attached} text files. ${Array.from(files).length - attached} files skipped (binary/too large/max 20).`)
    }
    if (e.target) e.target.value = ''
  }

  const sendMessage = async (text?: string) => {
    const attachmentText = pendingAttachments.join('\n')
    const content = (text || chatInput).trim()
    if ((!content && !attachmentText) || !task?.topic_id || sending) return
    setSending(true)
    if (!text) setChatInput('')
    setPendingAttachments([])

    const userContent = attachmentText ? `${attachmentText}\n\n${content}` : content

    // Attach selected paper context
    let fullContent = userContent
    if (selectedPaperFull && centerTab === 'read') {
      const ctx = `[Context Paper: ${selectedPaperFull.title || 'Untitled'}]\nURL: ${selectedPaperFull.source_url || 'N/A'}\n${selectedPaperFull.doi ? `DOI: ${selectedPaperFull.doi}` : ''}\n---\n`
      fullContent = ctx + userContent
    }

    try {
      const resp = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/chat/send`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: fullContent,
          sender_type: 'HUMAN',
          semantic_type: 'post',
          auto_run: task?.status === 'todo',
        }),
      })
      if (!resp.ok) console.error('[Research] chat/send failed:', resp.status, await resp.text().catch(() => ''))
      mutateMessages()
    } catch { /* ignore */ } finally {
      setSending(false)
    }
  }

  // ── Quick actions (send to Agent) ────────────────────
  const quickAction = (action: string) => {
    const allPapersList = papers.map((p, i) => `${i + 1}. ${p.title || 'Untitled'} (${p.year || 'N/A'}) - URL: ${p.source_url}`).join('\n')

    const prompts: Record<string, string> = {
      summarize: selectedPaperFull
        ? `请总结这篇论文的核心内容：\n标题: ${selectedPaperFull.title}\nURL: ${selectedPaperFull.source_url}\n\n请提供：1) 研究问题 2) 方法 3) 主要发现 4) 贡献`
        : '请总结当前工作区中所有论文的核心内容。',
      review: `请基于以下论文生成一份文献综述：\n${allPapersList}\n\n请包括：1) 研究背景 2) 各论文核心观点 3) 方法对比 4) 研究空白 5) 未来方向`,
      compare: `请对比分析以下论文：\n${allPapersList}\n\n请从以下维度对比：1) 研究目标 2) 方法论 3) 数据集 4) 实验结果 5) 优缺点`,
      gap: `请分析以下论文集合中的研究空白：\n${allPapersList}\n\n请指出：1) 尚未解决的问题 2) 方法的局限 3) 潜在的研究方向`,
      translate: selectedPaperFull?.abstract
        ? `请将以下摘要翻译成中文，保留学术术语：\n\n${selectedPaperFull.abstract}`
        : '请帮我翻译选中论文的摘要。',
      draft: `请帮我起草一篇研究论文章节。以下是可用的论文素材：\n${allPapersList}\n\n请根据这些论文的核心发现，生成一个结构化的章节草稿，包含：引言、方法概述、主要发现、讨论。`,
      cite: `请将以下论文按照标准学术格式（APA或IEEE）生成参考文献列表：\n${allPapersList}`,
    }
    const prompt = prompts[action]
    if (prompt) sendMessage(prompt)
  }

  // ── Export ───────────────────────────────────────────

  // Step 1: Ask Agent to generate structured slide content
  // AI PPT: send prompt to Agent, Agent generates PPTX and uploads to WTT, returns download URL in chat
  const [pptGenerating, setPptGenerating] = useState(false)

  const generateAiPpt = async () => {
    if (!task?.topic_id || papers.length === 0) return
    setPptGenerating(true)

    const exportPapers = selectedExportPapers.size > 0
      ? papers.filter(p => selectedExportPapers.has(p.id))
      : papers

    const paperSummaries = exportPapers.map((p, i) => {
      let s = `${i + 1}. "${p.title || 'Untitled'}" (${p.year || 'N/A'})`
      if (p.authors) s += `\n   Authors: ${p.authors}`
      if (p.abstract) s += `\n   Abstract: ${p.abstract.slice(0, 500)}`
      return s
    }).join('\n\n')

    const lang = exportLang === 'zh' ? '中文' : 'English'
    const templateDesc = exportTemplate === 'academic' ? 'academic/scholarly' : exportTemplate === 'business' ? 'business/corporate' : 'clean/minimal'

    const prompt = `Generate a visually rich, NotebookLM-quality PowerPoint (PPTX) for these ${exportPapers.length} research papers. Language: ${lang}. Style: ${templateDesc}.

PAPERS:
${paperSummaries}

═══ SLIDE STRUCTURE ═══
1. **Title Slide** — Research topic, paper count, date. Use a gradient background (dark blue → teal) with large bold title.
2. **Table of Contents** — Visual agenda with numbered items and accent icons/emoji.
3. **Executive Summary** — 3-4 key takeaways in colored card-style boxes (each box a rounded rectangle shape with icon + text).
4. **Research Landscape** — A visual diagram showing research themes and their relationships. Use python-pptx shapes (RoundedRectangle, arrows/connectors) to draw a mind-map or cluster diagram. Color-code each theme differently.
5. **Timeline / Chronology** — If papers span multiple years, create a horizontal timeline using shapes (circles for milestones connected by lines), showing evolution of the field.
6. **Per-Paper "Key Findings" slides** — For each paper:
   - Left 60%: 3-5 bullet points with specific data, metrics, percentages
   - Right 40%: A visual element — a mini chart (bar/pie via python-pptx chart API), a comparison table, or a diagram illustrating the paper's core contribution
   - Use a colored sidebar accent strip on the left edge
7. ${exportPapers.length > 2 ? `**Comparative Analysis** — Create a formatted TABLE (python-pptx Table shape) comparing all papers across dimensions (Method, Dataset, Key Result, Limitation). Use alternating row colors and bold headers.\n8. ` : ''}**Research Gaps & Future Directions** — Visual roadmap using a horizontal process flow (shapes: rounded rectangles connected by arrows). Each step = one gap/opportunity with a short label.
${exportPapers.length > 2 ? '9' : '8'}. **Conclusion** — Summary with 3 large "stat cards" (big number + label in colored boxes) and 2-3 implication bullets.

═══ VISUAL DESIGN RULES ═══
- Use python-pptx to programmatically create ALL visual elements — do NOT rely on text-only slides
- Color palette: Pick a harmonious 4-color palette (e.g., #1B2A4A dark navy, #2196F3 blue, #26A69A teal, #FF7043 coral accent)
- Every slide MUST have at least one non-text visual element: a shape, chart, table, diagram, or colored box
- Charts: Use python-pptx chart API (BarChart, PieChart, LineChart) for any quantitative data — performance comparisons, accuracy numbers, dataset sizes
- Diagrams: Use grouped shapes (MSO_SHAPE.ROUNDED_RECTANGLE, CHEVRON, OVAL) with connectors to illustrate processes, architectures, or relationships
- Tables: Use the Table shape with header row styling, alternating row fills, and proper cell padding
- Typography: Title 28-32pt bold, subtitle 18-20pt, body 14-16pt. Consistent font throughout (Calibri or similar)
- Add subtle decorative elements: thin colored lines as dividers, small colored circles as bullet markers, accent bars
- Slide numbers in bottom-right corner
- White or very light background for content slides; dark gradient for title/section dividers

═══ UPLOAD INSTRUCTIONS ═══
After generating the PPTX, upload it to WTT and send me the download URL:

Step A: POST https://www.waxbyte.com/media/sign
  Body: {"filename": "research_presentation.pptx", "mime_type": "application/vnd.openxmlformats-officedocument.presentationml.presentation", "size": <file_size_bytes>}

Step B: PUT https://www.waxbyte.com{upload_url from step A}
  Content-Type: application/vnd.openxmlformats-officedocument.presentationml.presentation
  Body: raw PPTX bytes

Step C: POST https://www.waxbyte.com/media/commit
  Body: {"upload_token": "<token>"}

Step D: Reply with ONLY: 📎 Your presentation is ready: <download_url>

Do NOT dump PPTX content as text. Generate the file, upload it, send the URL.`

    try {
      await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/chat/send`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: prompt,
          sender_type: 'HUMAN',
          semantic_type: 'command',
          auto_run: task?.status === 'todo',
          metadata: { purpose: 'ppt_generation' },
        }),
      })
      mutateMessages()
    } catch (e) {
      alert(`Failed: ${e instanceof Error ? e.message : 'unknown'}`)
    } finally {
      setPptGenerating(false)
    }
  }

  const exportBibtex = async () => {
    try {
      const paperIds = selectedExportPapers.size > 0 ? `&paper_ids=${Array.from(selectedExportPapers).join(',')}` : ''
      const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/research/export/bibtex?x=1${paperIds}`, { headers: authHeaders() })
      if (!r.ok) throw new Error(await r.text())
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `research_${taskId.slice(0, 8)}.bib`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert(`Export failed: ${e instanceof Error ? e.message : 'unknown'}`)
    }
  }

  const exportMarkdown = () => {
    const content = writeContent || chatMessages.filter(m => m.role === 'assistant').map(m => m.content).join('\n\n---\n\n')
    if (!content) { alert('No content to export'); return }
    const blob = new Blob([content], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(task?.title || 'research').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_')}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Filtered papers ──────────────────────────────────
  const filteredPapers = useMemo(() => {
    if (!searchQuery) return papers
    const q = searchQuery.toLowerCase()
    return papers.filter(p =>
      (p.title || '').toLowerCase().includes(q) ||
      (p.authors || '').toLowerCase().includes(q) ||
      (p.journal || '').toLowerCase().includes(q) ||
      (p.tags || '').toLowerCase().includes(q)
    )
  }, [papers, searchQuery])

  // ── Render ───────────────────────────────────────────
  if (status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-white dark:bg-zinc-900">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
          <p className="mt-3 text-sm text-slate-400">Loading session…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-white dark:bg-zinc-900">
      {/* Top bar */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push(buildAgentUrl('/tasks', selectedAgentId))} className="text-sm text-indigo-500 hover:underline">← Tasks</button>
          <span className="text-sm font-semibold text-slate-700 dark:text-zinc-200 max-w-[300px] truncate">{task?.title || 'Research Task'}</span>
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">📄 Research</span>
          {task?.status && (
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
              task.status === 'doing' ? 'bg-amber-100 text-amber-700' :
              task.status === 'done' ? 'bg-green-100 text-green-700' :
              task.status === 'cancelled' ? 'bg-red-100 text-red-600' :
              'bg-slate-100 dark:bg-zinc-700 text-slate-500 dark:text-zinc-400'
            }`}>{task.status === 'doing' ? '⚡ Running' : task.status === 'done' ? '✅ Done' : task.status === 'cancelled' ? '🚫 Cancelled' : task.status}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400 dark:text-zinc-500">{papers.length} papers</span>
          <button
            onClick={() => router.push(buildAgentUrl(`/tasks/kb/${taskId}`, selectedAgentId))}
            className="text-[10px] px-2 py-1 rounded bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300 hover:bg-indigo-200"
          >
            📚 Knowledge Root
          </button>
          <ThemeToggle />
        </div>
      </div>

      {/* Three-panel area */}
      <div className="flex flex-1 overflow-hidden">

        {/* Agent sidebar */}
        <TaskAgentSidebar
          agents={agents.map((a) => ({ agent_id: a.agent_id, display_name: a.display_name }))}
          selectedAgentId={selectedAgentId}
          onSelectAgent={setSelectedAgentId}
          currentUserName={session?.user?.name ?? undefined}
          defaultCollapsed
        />

        {/* ═══ PROJECT DIRECTORY ═══ */}
        {!l4Fullscreen && (
          <div
            className={`flex flex-col border-r border-slate-200 dark:border-zinc-700 bg-slate-50/80 dark:bg-zinc-800/80 transition-all ${projectsCollapsed ? 'w-10' : ''}`}
            style={!projectsCollapsed ? { width: projectW } : undefined}
          >
            {projectsCollapsed ? (
              <button
                onClick={() => { setProjectsCollapsed(false); localStorage.setItem('research-projects-collapsed', 'false') }}
                className="flex h-full w-full flex-col items-center pt-3 text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700"
                title="Expand projects"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <span className="mt-2 text-[9px] font-medium" style={{ writingMode: 'vertical-rl' }}>Projects</span>
              </button>
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-700 px-2 py-1.5">
                  <span className="text-[11px] font-bold text-slate-600 dark:text-zinc-300">📁 Projects</span>
                  <div className="flex items-center gap-0.5">
                    <button onClick={createProject} className="rounded p-1 text-indigo-500 hover:bg-indigo-50" title="New Project">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 3v8M3 7h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                    </button>
                    <button
                      onClick={() => { setProjectsCollapsed(true); localStorage.setItem('research-projects-collapsed', 'true') }}
                      className="rounded p-1 text-slate-400 dark:text-zinc-500 hover:bg-slate-100 dark:hover:bg-zinc-700" title="Collapse"
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M8 4l-4 4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-1">
                  {projects.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => { if (p.id !== taskId) router.push(buildAgentUrl(`/tasks/research/${p.id}`, selectedAgentId)) }}
                      onDoubleClick={() => renameProject(p.id, p.title)}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        const action = confirm(`Rename "${p.title}"?\n\nOK = Rename\nCancel = Delete`) 
                          ? () => renameProject(p.id, p.title) 
                          : () => deleteProject(p.id)
                        action()
                      }}
                      className={`group mb-0.5 flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-left transition ${
                        p.id === taskId
                          ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-semibold'
                          : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-700'
                      }`}
                      title={`${p.title}\nDouble-click to rename · Right-click for options`}
                    >
                      <span className="shrink-0 text-xs">{p.id === taskId ? '📂' : '📁'}</span>
                      <span className="flex-1 truncate text-[11px]">{p.title}</span>
                      <span className={`shrink-0 rounded px-1 py-0.5 text-[8px] font-medium ${
                        p.status === 'doing' ? 'bg-amber-100 text-amber-600' :
                        p.status === 'done' ? 'bg-green-100 text-green-600' :
                        'bg-slate-200 dark:bg-zinc-700 text-slate-500 dark:text-zinc-400'
                      }`}>{p.status}</span>
                    </div>
                  ))}
                  {projects.length === 0 && (
                    <p className="px-2 py-4 text-center text-[10px] text-slate-400 dark:text-zinc-500">No projects yet</p>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Projects resize handle */}
        {!l4Fullscreen && !projectsCollapsed && (
          <div
            className="w-[3px] shrink-0 cursor-col-resize hover:bg-indigo-400 transition-colors bg-transparent"
            onMouseDown={(e) => startResize('projects', e)}
          />
        )}

        {/* ═══ LEFT: Library Panel ═══ */}
        {!l4Fullscreen && (<>
        <div className="flex flex-col border-r border-slate-200 dark:border-zinc-700 overflow-hidden" style={{ width: leftW }}>
          {/* Search + Import */}
          <div className="border-b border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-2 py-1.5">
            <div className="flex items-center gap-1">
              <input
                className="flex-1 rounded border border-slate-200 dark:border-zinc-600 bg-white dark:bg-zinc-800 dark:text-zinc-200 px-2 py-1 text-xs focus:border-indigo-400 focus:outline-none"
                placeholder="🔍 Search papers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`shrink-0 rounded border px-1.5 py-1 text-[11px] transition-colors ${showFilters ? 'border-indigo-300 bg-indigo-50 text-indigo-600' : 'border-slate-200 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-300'}`}
                title="Toggle filters"
              >
                ⚙
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="shrink-0 rounded bg-indigo-500 px-2 py-1 text-[11px] text-white hover:bg-indigo-600 disabled:opacity-50 flex items-center gap-1.5"
                title="Import PDF, Markdown, BibTeX"
              >
                {uploading ? (
                  <>
                    <CircularProgress value={uploadProgress?.pct} size={14} strokeWidth={2} color="#fff" trackColor="rgba(255,255,255,0.3)" />
                    <span>{uploadProgress ? `${uploadProgress.current}/${uploadProgress.total}` : '…'}</span>
                  </>
                ) : '+ Import'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.md,.txt,.tex,.bib,.csv,.json,.xml"
                className="hidden"
                onChange={handleFileInput}
              />
            </div>
            {showFilters && (
              <div className="mt-1.5 space-y-1.5 rounded border border-slate-200 dark:border-zinc-600 bg-white dark:bg-zinc-800 p-2">
                <div className="flex items-center gap-1">
                  <label className="text-[10px] text-slate-500 dark:text-zinc-400 w-10 shrink-0">Year</label>
                  <input
                    className="w-16 rounded border border-slate-200 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 px-1.5 py-0.5 text-[11px] focus:border-indigo-400 focus:outline-none"
                    placeholder="From"
                    value={yearFrom}
                    onChange={(e) => setYearFrom(e.target.value)}
                  />
                  <span className="text-[10px] text-slate-400">–</span>
                  <input
                    className="w-16 rounded border border-slate-200 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 px-1.5 py-0.5 text-[11px] focus:border-indigo-400 focus:outline-none"
                    placeholder="To"
                    value={yearTo}
                    onChange={(e) => setYearTo(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-1">
                  <label className="text-[10px] text-slate-500 dark:text-zinc-400 w-10 shrink-0">Sort</label>
                  <select
                    className="flex-1 rounded border border-slate-200 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 px-1.5 py-0.5 text-[11px]"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                  >
                    <option value="created_at">Date added</option>
                    <option value="title">Title</option>
                    <option value="year">Year</option>
                    <option value="citation_count">Citations</option>
                  </select>
                </div>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useFts}
                    onChange={(e) => setUseFts(e.target.checked)}
                    className="rounded border-slate-300 dark:border-zinc-600"
                  />
                  <span className="text-[10px] text-slate-600 dark:text-zinc-400">Full-text search</span>
                </label>
              </div>
            )}
          </div>

          {/* Paper list */}
          <div
            className={`flex-1 overflow-y-auto p-1.5 ${dragOver ? 'bg-indigo-50 ring-2 ring-inset ring-indigo-300' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            {filteredPapers.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center p-4">
                {papers.length === 0 ? (
                  <>
                    <p className="text-4xl">📚</p>
                    <p className="text-sm text-slate-500 dark:text-zinc-400">No papers yet</p>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="rounded-lg bg-indigo-500 px-4 py-2 text-sm text-white hover:bg-indigo-600"
                    >
                      Import Papers
                    </button>
                    <p className="text-[11px] text-slate-400 dark:text-zinc-500">Drop PDF, MD, or BibTeX files here</p>
                  </>
                ) : (
                  <p className="text-sm text-slate-400 dark:text-zinc-500">No matching papers</p>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                {filteredPapers.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => { setSelectedPaperId(p.id); setCenterTab('read') }}
                    className={`group cursor-pointer rounded-lg border p-2 transition-colors ${
                      selectedPaperId === p.id
                        ? 'border-indigo-300 bg-indigo-50'
                        : 'border-slate-200 dark:border-zinc-700 hover:border-slate-300 dark:hover:border-zinc-600 hover:bg-slate-50 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <div className="flex items-start gap-1.5">
                      <span className="mt-0.5 text-sm">{paperIcon(p.content_type)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium text-slate-700 dark:text-zinc-200 leading-tight line-clamp-2">{p.title || 'Untitled'}</p>
                        <div className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-400 dark:text-zinc-500">
                          {p.year && <span>{p.year}</span>}
                          {p.journal && <><span>·</span><span className="truncate max-w-[100px]">{p.journal}</span></>}
                          {p.citation_count > 0 && <><span>·</span><span>🔗{p.citation_count}</span></>}
                        </div>
                        {p.authors && (
                          <p className="mt-0.5 text-[10px] text-slate-400 truncate">{parseAuthors(p.authors)}</p>
                        )}
                        {p.tags && (
                          <div className="mt-1 flex flex-wrap gap-0.5">
                            {p.tags.split(',').filter(Boolean).map((t, i) => (
                              <span key={i} className="rounded bg-slate-100 dark:bg-zinc-700 px-1 py-0 text-[9px] text-slate-500 dark:text-zinc-400">{t.trim()}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); deletePaper(p.id) }}
                        className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 text-xs p-0.5"
                        title="Delete paper"
                      >✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Left resize handle */}
        <div
          className="w-[3px] shrink-0 cursor-col-resize hover:bg-indigo-400 transition-colors bg-transparent"
          onMouseDown={(e) => startResize('left', e)}
        />
        </>)}

        {/* ═══ CENTER: Reader / Writer / Export ═══ */}
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
          {/* Tab bar */}
          <div className="flex h-9 items-center justify-between border-b border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-3">
            <div className="flex items-center gap-1">
              {(['read', 'write', 'export'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setCenterTab(tab)}
                  className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    centerTab === tab ? 'bg-white dark:bg-zinc-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200'
                  }`}
                >
                  {tab === 'read' ? '📖 Read' : tab === 'write' ? '✏️ Write' : '📤 Export'}
                </button>
              ))}
            </div>
            {centerTab === 'read' && selectedPaperFull && (
              <div className="flex items-center gap-1">
                {([1, 2, 3, 4] as const).map((l) => (
                  <button
                    key={l}
                    onClick={() => setReadingLevel(l)}
                    className={`rounded px-1.5 py-0.5 text-[10px] ${
                      readingLevel >= l && readingLevel < 5 ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 font-medium' : 'text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300'
                    }`}
                  >
                    L{l}
                  </button>
                ))}
                <button
                  onClick={() => setReadingLevel(5)}
                  className={`rounded px-1.5 py-0.5 text-[10px] ${readingLevel === 5 ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-300 font-medium' : 'text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300'}`}
                >
                  📚 Citations
                </button>
              </div>
            )}
          </div>

          {/* Center content */}
          <div className="flex-1 overflow-y-auto relative">
            {centerTab === 'read' && (
              <div ref={readerRef} className="p-4 relative">
                {selectedPaperFull ? (
                  <div className="max-w-4xl mx-auto space-y-4 relative">
                    {/* L1: Metadata Card */}
                    <div className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-gradient-to-br from-slate-50 dark:from-zinc-800 to-white dark:to-zinc-800 p-5">
                      <h1 className="text-lg font-bold text-slate-800 dark:text-zinc-100 leading-snug">{selectedPaperFull.title || 'Untitled'}</h1>
                      <div className="mt-2 flex flex-wrap gap-2 text-sm text-slate-500">
                        {selectedPaperFull.authors && <span>👤 {parseAuthors(selectedPaperFull.authors)}</span>}
                        {selectedPaperFull.year && <span>📅 {selectedPaperFull.year}</span>}
                        {selectedPaperFull.journal && <span>📰 {selectedPaperFull.journal}</span>}
                        {selectedPaperFull.citation_count > 0 && <span>🔗 {selectedPaperFull.citation_count} citations</span>}
                      </div>
                      {selectedPaperFull.doi && (
                        <a href={`https://doi.org/${selectedPaperFull.doi}`} target="_blank" rel="noopener noreferrer"
                          className="mt-1 inline-block text-xs text-indigo-500 hover:underline">
                          DOI: {selectedPaperFull.doi} ↗
                        </a>
                      )}
                      {selectedPaperFull.source_url && (
                        <a href={fixMediaUrl(selectedPaperFull.source_url)} target="_blank" rel="noopener noreferrer"
                          className="ml-3 mt-1 inline-block text-xs text-emerald-500 hover:underline">
                          📥 Download source file
                        </a>
                      )}
                      <button
                        onClick={async () => {
                          try {
                            const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/research/papers/${selectedPaperId}/reprocess`, {
                              method: 'POST',
                              headers: authHeaders(),
                            })
                            if (r.ok) {
                              mutatePapers()
                              mutatePaperFull()
                            }
                          } catch {}
                        }}
                        className="ml-3 mt-1 inline-block text-xs text-orange-500 hover:text-orange-600 hover:underline cursor-pointer"
                      >
                        🔄 Reprocess text
                      </button>
                      {selectedPaperFull.tags && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {selectedPaperFull.tags.split(',').filter(Boolean).map((t: string, i: number) => (
                            <span key={i} className="rounded-full bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 text-[11px] text-indigo-600 dark:text-indigo-300">{t.trim()}</span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* L2: Abstract */}
                    {readingLevel >= 2 && selectedPaperFull.abstract && (
                      <div className="rounded-lg border border-blue-100 dark:border-blue-800/30 bg-blue-50/50 dark:bg-blue-950/20 p-4">
                        <h2 className="text-sm font-semibold text-blue-700 dark:text-blue-400 mb-2">📋 Abstract</h2>
                        <div className="prose prose-sm max-w-none text-slate-700 dark:text-zinc-200 leading-relaxed">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{cleanPdfText(selectedPaperFull.abstract)}</ReactMarkdown>
                        </div>
                      </div>
                    )}

                    {/* L3: Conclusion */}
                    {readingLevel >= 3 && selectedPaperFull.conclusion && (
                      <div className="rounded-lg border border-emerald-100 dark:border-emerald-800/30 bg-emerald-50/50 dark:bg-emerald-950/20 p-4">
                        <h2 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 mb-2">🎯 Conclusion</h2>
                        <div className="prose prose-sm max-w-none text-slate-700 dark:text-zinc-200 leading-relaxed">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{cleanPdfText(selectedPaperFull.conclusion)}</ReactMarkdown>
                        </div>
                      </div>
                    )}

                    {/* L4: Full Document — native format based on content_type */}
                    {readingLevel >= 4 && selectedPaperFull.source_url && (
                      <div
                        className={l4Fullscreen
                          ? 'fixed left-0 top-0 bottom-0 z-50 bg-white dark:bg-zinc-900 flex flex-col'
                          : 'rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4'
                        }
                        style={l4Fullscreen ? { right: `${Math.max(0, rightW + 3)}px` } : undefined}
                      >
                        <div className={`flex items-center justify-between ${l4Fullscreen ? 'px-4 py-2 border-b border-slate-200 dark:border-zinc-700 shrink-0' : 'mb-2'}`}>
                          <h2 className="text-sm font-semibold text-slate-600 dark:text-zinc-300">📄 Full Document</h2>
                          <div className="flex gap-1 items-center">
                            <button
                              onClick={() => setL4View('native')}
                              className={`rounded px-2 py-0.5 text-[10px] ${l4View === 'native' ? 'bg-slate-200 dark:bg-zinc-700 text-slate-700 dark:text-zinc-200 font-medium' : 'text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300'}`}
                            >
                              📑 Original
                            </button>
                            {selectedPaperFull.content_markdown && (
                              <button
                                onClick={() => setL4View('text')}
                                className={`rounded px-2 py-0.5 text-[10px] ${l4View === 'text' ? 'bg-slate-200 dark:bg-zinc-700 text-slate-700 dark:text-zinc-200 font-medium' : 'text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300'}`}
                              >
                                📝 Extracted Text
                              </button>
                            )}
                            <span className="mx-1 text-slate-300 dark:text-zinc-600">|</span>
                            <button
                              onClick={() => setL4Fullscreen(!l4Fullscreen)}
                              className="rounded px-2 py-0.5 text-[10px] text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-700"
                              title={l4Fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                            >
                              {l4Fullscreen ? '⊘ Exit' : '⛶ Expand'}
                            </button>
                          </div>
                        </div>
                        <div ref={l4ScrollRef} className={l4Fullscreen ? 'flex-1 overflow-auto p-2 min-h-0' : 'overflow-auto max-h-[75vh]'}>
                        <div className="relative min-h-full">
                        {l4View === 'native' ? (
                          (() => {
                            const ct = (selectedPaperFull.content_type || '').toLowerCase()
                            const url = fixMediaUrl(selectedPaperFull.source_url)
                            if (ct === 'pdf' || /\.pdf$/i.test(url)) {
                              return <PdfViewer url={url} expanded={l4Fullscreen} />
                            }
                            if (ct === 'md' || ct === 'markdown' || /\.md$/i.test(url)) {
                              return (
                                <div className={`prose prose-sm max-w-none text-slate-700 dark:text-zinc-200`}>
                                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {selectedPaperFull.content_markdown || ''}
                                  </ReactMarkdown>
                                </div>
                              )
                            }
                            if (ct === 'bib' || /\.bib$/i.test(url)) {
                              return (
                                <pre className={`rounded bg-slate-50 dark:bg-zinc-800 p-3 text-xs text-slate-600 dark:text-zinc-300 font-mono whitespace-pre-wrap`}>
                                  {selectedPaperFull.content_markdown || ''}
                                </pre>
                              )
                            }
                            if (['txt', 'tex', 'latex'].includes(ct) || /\.(txt|tex|latex)$/i.test(url)) {
                              return (
                                <pre className={`rounded bg-slate-50 dark:bg-zinc-800 p-3 text-sm text-slate-700 dark:text-zinc-200 whitespace-pre-wrap`}>
                                  {selectedPaperFull.content_markdown || ''}
                                </pre>
                              )
                            }
                            // Fallback
                            if (selectedPaperFull.content_markdown) {
                              return (
                                <div className={`prose prose-sm max-w-none text-slate-700 dark:text-zinc-200`}>
                                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {cleanPdfText(selectedPaperFull.content_markdown)}
                                  </ReactMarkdown>
                                </div>
                              )
                            }
                            return <PdfViewer url={url} expanded={l4Fullscreen} />
                          })()
                        ) : (
                          <div className={`prose prose-sm max-w-none text-slate-700 dark:text-zinc-200`}>
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {cleanPdfText(selectedPaperFull.content_markdown || '')}
                            </ReactMarkdown>
                          </div>
                        )}
                        {/* Annotation overlay — inside L4 scrollable content so drawings align with document */}
                        <AnnotationOverlay storageKey={`paper-${selectedPaperFull.id}`} showToolbar={showAnnotationTools} toolbarAnchor={annotationAnchor} />
                        </div>
                        </div>
                      </div>
                    )}

                    {/* Notes indicator — collapsible, shows saved highlights */}
                    {selectedPaperFull.notes && (
                      <div className="rounded-lg border border-amber-100 dark:border-amber-800/30 bg-amber-50/30 dark:bg-amber-950/20">
                        <button
                          onClick={() => setNotesOpen(!notesOpen)}
                          className="w-full flex items-center justify-between px-4 py-2 text-sm font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-50/50 dark:hover:bg-amber-950/30"
                        >
                          <span>📝 Notes ({selectedPaperFull.notes.split('📌').length - 1})</span>
                          <span className="text-xs">{notesOpen ? '▼' : '▶'}</span>
                        </button>
                        {notesOpen && (
                          <div className="px-4 pb-3 space-y-2 max-h-60 overflow-y-auto">
                            <div className="prose prose-sm max-w-none text-slate-600 dark:text-zinc-300">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {selectedPaperFull.notes}
                              </ReactMarkdown>
                            </div>
                            <button
                              onClick={async () => {
                                if (!confirm('Clear all notes?')) return
                                await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/research/papers/${selectedPaperId}`, {
                                  method: 'PATCH',
                                  headers: { ...authHeaders(), 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ notes: '' }),
                                })
                                mutatePapers()
                              }}
                              className="text-[10px] text-red-400 hover:text-red-600"
                            >🗑 Clear notes</button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* L5: Citations panel */}
                    {readingLevel === 5 && (
                      <div className="rounded-lg border border-violet-200 bg-violet-50/30 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <h2 className="text-sm font-semibold text-violet-700">📚 Citations</h2>
                          <button
                            onClick={async () => {
                              try {
                                await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/research/papers/${selectedPaperId}/resolve-citations`, {
                                  method: 'POST',
                                  headers: authHeaders(),
                                })
                                mutateCitations()
                              } catch { /* ignore */ }
                            }}
                            className="rounded bg-violet-500 px-2 py-0.5 text-[10px] text-white hover:bg-violet-600"
                          >
                            🔍 Resolve Citations
                          </button>
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => setCitationTab('refs')}
                            className={`rounded px-2 py-0.5 text-[11px] font-medium ${citationTab === 'refs' ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400' : 'text-slate-500 hover:text-slate-700'}`}
                          >
                            References
                          </button>
                          <button
                            onClick={() => setCitationTab('cited')}
                            className={`rounded px-2 py-0.5 text-[11px] font-medium ${citationTab === 'cited' ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400' : 'text-slate-500 hover:text-slate-700'}`}
                          >
                            Cited By
                          </button>
                        </div>
                        <div className="space-y-2 max-h-[400px] overflow-y-auto">
                          {Array.isArray(citationsData) && citationsData.length > 0 ? (
                            citationsData.map((c: Record<string, string | number | null>, i: number) => {
                              const matchedPaper = papers.find(p => p.doi && c.doi && p.doi === c.doi)
                              return (
                                <div key={i} className="rounded border border-slate-200 bg-white p-2 text-xs">
                                  <p className="font-medium text-slate-700 dark:text-zinc-200 leading-tight">{c.title || 'Unknown title'}</p>
                                  <div className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-400">
                                    {c.authors && <span className="truncate max-w-[200px]">{String(c.authors)}</span>}
                                    {c.year && <><span>·</span><span>{c.year}</span></>}
                                  </div>
                                  {matchedPaper && (
                                    <button
                                      onClick={() => { setSelectedPaperId(matchedPaper.id); setReadingLevel(2) }}
                                      className="mt-1 text-[10px] text-indigo-500 hover:underline"
                                    >
                                      📄 View in library
                                    </button>
                                  )}
                                </div>
                              )
                            })
                          ) : (
                            <p className="text-xs text-slate-400 py-4 text-center">
                              {citationsData === undefined ? 'Loading...' : 'No citations found. Click "Resolve Citations" to extract them.'}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                    {/* Annotation overlay removed from here — now inside L4 content wrapper */}
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center text-slate-400 min-h-[400px]">
                    <div className="text-center">
                      <p className="text-5xl">📖</p>
                      <p className="mt-3 text-sm">Select a paper to read</p>
                      <p className="mt-1 text-[11px]">L1 Metadata → L2 Abstract → L3 Conclusion → L4 Full Text</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Floating toolbar on text selection */}
            {quoteBtn && !ctxMenu && (
              <div
                className="fixed z-[100] flex items-center gap-0.5 rounded-lg bg-slate-800 shadow-lg -translate-x-1/2 -translate-y-full"
                style={{ left: quoteBtn.x, top: quoteBtn.y }}
                onMouseDown={(e) => e.preventDefault()}
              >
                <button
                  onClick={() => quoteToChat(quoteBtn.text)}
                  className="px-2.5 py-1.5 text-xs text-white hover:bg-slate-700 rounded-l-lg"
                >💬 Chat</button>
                <div className="w-px h-4 bg-slate-600" />
                <button
                  onClick={() => addToNotes(quoteBtn.text)}
                  className="px-2.5 py-1.5 text-xs text-white hover:bg-slate-700 rounded-r-lg"
                >📝 Note</button>
              </div>
            )}

            {/* Right-click context menu */}
            {ctxMenu && (
              <div
                className="fixed z-[100] rounded-lg bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 shadow-xl py-1 min-w-[160px]"
                style={{ left: ctxMenu.x, top: ctxMenu.y }}
                onMouseDown={(e) => e.preventDefault()}
              >
                {ctxMenu.text && (
                  <>
                    <button
                      onClick={() => quoteToChat(ctxMenu.text!)}
                      className="w-full text-left px-3 py-1.5 text-xs text-slate-700 dark:text-zinc-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-2"
                    >💬 Quote to Chat</button>
                    <button
                      onClick={() => addToNotes(ctxMenu.text!)}
                      className="w-full text-left px-3 py-1.5 text-xs text-slate-700 dark:text-zinc-300 hover:bg-amber-50 dark:hover:bg-amber-950/30 hover:text-amber-600 dark:hover:text-amber-400 flex items-center gap-2"
                    >📝 Add to Notes</button>
                    <button
                      onClick={() => { navigator.clipboard.writeText(ctxMenu.text!); setCtxMenu(null) }}
                      className="w-full text-left px-3 py-1.5 text-xs text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 flex items-center gap-2"
                    >📋 Copy</button>
                    <div className="border-t border-slate-100 dark:border-zinc-700 my-0.5" />
                  </>
                )}
                <button
                  onClick={() => { setAnnotationAnchor(ctxMenu ? { x: ctxMenu.x, y: ctxMenu.y } : null); setShowAnnotationTools(prev => prev + 1); setCtxMenu(null) }}
                  className="w-full text-left px-3 py-1.5 text-xs text-slate-700 dark:text-zinc-300 hover:bg-violet-50 dark:hover:bg-violet-950/30 hover:text-violet-600 dark:hover:text-violet-400 flex items-center gap-2"
                >🖊️ Annotate</button>
                <button
                  onClick={() => { setCenterTab('write'); setCtxMenu(null) }}
                  className="w-full text-left px-3 py-1.5 text-xs text-slate-700 dark:text-zinc-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 hover:text-emerald-600 dark:hover:text-emerald-400 flex items-center gap-2"
                >✏️ Edit Document</button>
              </div>
            )}

            {/* Add to Notes dialog */}
            {noteDialog && (
              <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30" onClick={() => setNoteDialog(null)}>
                <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-2xl w-[480px] max-w-[90vw] overflow-hidden" onClick={(e) => e.stopPropagation()}>
                  <div className="px-5 py-3 border-b border-slate-100 dark:border-zinc-700 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-200">📝 Add Note</h3>
                    <button onClick={() => setNoteDialog(null)} className="text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300 text-lg">✕</button>
                  </div>
                  <div className="px-5 py-4 space-y-3">
                    {noteDialog.quote && (
                      <div className="rounded-lg bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 px-3 py-2 text-xs text-slate-600 dark:text-zinc-400 max-h-32 overflow-y-auto">
                        <p className="text-[10px] text-slate-400 mb-1 font-medium">Selected text:</p>
                        <p className="italic leading-relaxed">{noteDialog.quote}</p>
                      </div>
                    )}
                    <textarea
                      autoFocus
                      className="w-full rounded-lg border border-slate-200 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 px-3 py-2 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none resize-none"
                      rows={4}
                      placeholder="Write your thoughts, annotations..."
                      value={noteDialog.comment}
                      onChange={(e) => setNoteDialog({ ...noteDialog, comment: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveNote() } }}
                    />
                    <p className="text-[10px] text-slate-400">⌘/Ctrl + Enter to save</p>
                  </div>
                  <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
                    <button onClick={() => setNoteDialog(null)} className="px-3 py-1.5 text-xs text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-700 rounded-lg">Cancel</button>
                    <button
                      onClick={saveNote}
                      disabled={!noteDialog.comment.trim() && !noteDialog.quote}
                      className="px-4 py-1.5 text-xs font-medium text-white bg-amber-500 hover:bg-amber-600 rounded-lg disabled:opacity-50"
                    >Save Note</button>
                  </div>
                </div>
              </div>
            )}

            {centerTab === 'write' && (
              <div className="flex flex-col h-full">
                <EditorToolbar
                  actions={writeActions}
                  textareaRef={writeTextareaRef}
                  viewMode={writeViewMode}
                  onViewModeChange={setWriteViewMode}
                  onImport={() => writeFileRef.current?.click()}
                />
                <input
                  ref={writeFileRef}
                  type="file"
                  accept=".md,.markdown,.mdx,.txt"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (file && isMarkdownFile(file)) {
                      const text = await readMarkdownFile(file)
                      setWriteContent(prev => prev ? `${prev}\n\n${text}` : text)
                    }
                    e.currentTarget.value = ''
                  }}
                />
                <div className="flex flex-1 overflow-hidden min-h-0">
                  {writeViewMode !== 'preview' && (
                    <textarea
                      ref={writeTextareaRef}
                      className={`${writeViewMode === 'split' ? 'w-1/2 border-r border-slate-200 dark:border-zinc-700' : 'w-full'} resize-none p-4 text-sm text-slate-700 dark:text-zinc-200 dark:bg-zinc-900 font-mono leading-relaxed focus:outline-none`}
                      placeholder="Start writing your research notes, literature review, analysis..."
                      value={writeContent}
                      onChange={(e) => setWriteContent(e.target.value)}
                      onKeyDown={(e) => handleEditorKeyDown(e, writeActions)}
                    />
                  )}
                  {writeViewMode !== 'edit' && (
                    <div className={`${writeViewMode === 'split' ? 'w-1/2' : 'w-full'} overflow-y-auto`}>
                      <MarkdownPreview content={writeContent} />
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between border-t border-slate-200 dark:border-zinc-700 px-3 py-1 text-[10px] text-slate-400 dark:text-zinc-500">
                  <span>{writeContent.trim() ? `${writeContent.trim().split(/\s+/).length} words · ${writeContent.length} chars` : 'Empty'}</span>
                  <span className="text-green-500">✓ Auto-saved</span>
                </div>
              </div>
            )}

            {centerTab === 'export' && (
              <div className="p-6 max-w-2xl mx-auto space-y-6">
                <h2 className="text-lg font-bold text-slate-700 dark:text-zinc-200">📤 Export Research</h2>

                {/* Paper selection */}
                {papers.length > 0 && (
                  <div className="rounded-xl border border-slate-200 dark:border-zinc-700 p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-200">📋 Select Papers to Export</h3>
                      <div className="flex gap-1">
                        <button
                          onClick={() => setSelectedExportPapers(new Set(papers.map(p => p.id)))}
                          className="text-[10px] text-indigo-500 hover:underline"
                        >Select all</button>
                        <span className="text-[10px] text-slate-300">|</span>
                        <button
                          onClick={() => setSelectedExportPapers(new Set())}
                          className="text-[10px] text-indigo-500 hover:underline"
                        >Clear</button>
                      </div>
                    </div>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {papers.map((p) => (
                        <label key={p.id} className="flex items-center gap-2 cursor-pointer rounded px-1.5 py-0.5 hover:bg-slate-50">
                          <input
                            type="checkbox"
                            checked={selectedExportPapers.has(p.id)}
                            onChange={(e) => {
                              const next = new Set(selectedExportPapers)
                              if (e.target.checked) next.add(p.id); else next.delete(p.id)
                              setSelectedExportPapers(next)
                            }}
                            className="rounded border-slate-300 dark:border-zinc-600"
                          />
                          <span className="text-xs text-slate-700 dark:text-zinc-200 truncate">{p.title || 'Untitled'}</span>
                          {p.year && <span className="text-[10px] text-slate-400 shrink-0">({p.year})</span>}
                        </label>
                      ))}
                    </div>
                    <p className="text-[10px] text-slate-400">{selectedExportPapers.size || papers.length} papers will be exported{selectedExportPapers.size === 0 ? ' (all)' : ''}</p>
                  </div>
                )}

                {/* AI-Powered Presentation */}
                <div className="rounded-xl border border-indigo-200 dark:border-indigo-800/40 bg-gradient-to-br from-indigo-50/50 to-violet-50/30 dark:from-indigo-950/20 dark:to-violet-950/10 p-5 space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-indigo-700 dark:text-indigo-400 flex items-center gap-1.5">
                      🤖 AI-Powered Presentation
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                      Agent analyzes your papers, generates a polished PPTX, uploads it, and sends you a download link in the chat
                    </p>
                  </div>

                  {/* Options row */}
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-slate-500 dark:text-zinc-400">Style:</label>
                      <select
                        className="rounded border border-slate-200 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 px-2 py-1 text-xs"
                        value={exportTemplate}
                        onChange={(e) => setExportTemplate(e.target.value)}
                      >
                        <option value="academic">🎓 Academic</option>
                        <option value="business">💼 Business</option>
                        <option value="minimal">◻️ Minimal</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-slate-500 dark:text-zinc-400">Language:</label>
                      <select
                        className="rounded border border-slate-200 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 px-2 py-1 text-xs"
                        value={exportLang}
                        onChange={(e) => setExportLang(e.target.value as 'en' | 'zh')}
                      >
                        <option value="en">🇺🇸 English</option>
                        <option value="zh">🇨🇳 中文</option>
                      </select>
                    </div>
                  </div>

                  {/* Generate button */}
                  <button
                    onClick={generateAiPpt}
                    disabled={pptGenerating || papers.length === 0}
                    className="w-full rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:from-indigo-600 hover:to-violet-600 disabled:opacity-50 transition-all"
                  >
                    {pptGenerating ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        Sending to Agent...
                      </span>
                    ) : '🤖 Generate AI Presentation'}
                  </button>
                  <p className="text-[10px] text-slate-400 dark:text-zinc-500 text-center">
                    Agent will generate PPTX and send the download URL in the chat panel →
                  </p>
                </div>

                {/* BibTeX Export */}
                <div className="rounded-xl border border-slate-200 dark:border-zinc-700 p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-200">📚 BibTeX</h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">Export reference list for LaTeX</p>
                  <button
                    onClick={exportBibtex}
                    disabled={papers.length === 0}
                    className="rounded-lg bg-emerald-500 px-4 py-2 text-sm text-white hover:bg-emerald-600 disabled:opacity-50"
                  >
                    ⬇️ Download .bib
                  </button>
                </div>

                {/* Markdown Export */}
                <div className="rounded-xl border border-slate-200 dark:border-zinc-700 p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-200">📝 Markdown</h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">Export your writing or Agent responses as Markdown</p>
                  <button
                    onClick={exportMarkdown}
                    className="rounded-lg bg-slate-600 dark:bg-zinc-600 px-4 py-2 text-sm text-white hover:bg-slate-700 dark:hover:bg-zinc-500"
                  >
                    ⬇️ Download .md
                  </button>
                </div>

                {/* Publish to Topic */}
                <div className="rounded-xl border border-indigo-200 dark:border-indigo-800/40 bg-indigo-50/50 dark:bg-indigo-950/20 p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-indigo-700 dark:text-indigo-400">🚀 Publish to Topic</h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">Share your research findings to a WTT topic</p>
                  <button
                    onClick={() => {
                      const content = writeContent || chatMessages.filter(m => m.role === 'assistant').map(m => m.content).join('\n\n')
                      if (!content) { alert('Write something first'); return }
                      navigator.clipboard.writeText(content)
                      alert('Content copied! Go to Feed → Write to publish.')
                    }}
                    className="rounded-lg bg-indigo-500 px-4 py-2 text-sm text-white hover:bg-indigo-600"
                  >
                    📋 Copy & Publish
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right resize handle */}
        <div
          className="w-[3px] shrink-0 cursor-col-resize hover:bg-indigo-400 transition-colors bg-transparent"
          onMouseDown={(e) => startResize('right', e)}
        />

        {/* ═══ RIGHT: AI Chat Panel ═══ */}
        <div className="flex flex-col border-l border-slate-200 dark:border-zinc-700 overflow-hidden" style={{ width: rightW }}>
          {/* Chat header */}
          <div className="flex h-9 items-center justify-between border-b border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-3">
            <span className="text-[11px] font-semibold text-slate-600 dark:text-zinc-300">🤖 Research Assistant</span>
            {task?.runner_agent_id && (
              <span className="rounded bg-indigo-100 dark:bg-indigo-900/40 px-1.5 py-0.5 text-[10px] text-indigo-600 dark:text-indigo-300 truncate max-w-[120px]">{task.runner_agent_id}</span>
            )}
          </div>

          {/* Quick actions */}
          <div className="flex flex-wrap gap-1 border-b border-slate-100 dark:border-zinc-700 bg-slate-50/50 dark:bg-zinc-800/50 px-2 py-1.5">
            {[
              { key: 'summarize', label: '📋 Summarize', tip: 'Summarize selected paper' },
              { key: 'review', label: '📝 Literature Review', tip: 'Generate review from all papers' },
              { key: 'compare', label: '📊 Compare', tip: 'Compare all papers' },
              { key: 'gap', label: '🔍 Gap Analysis', tip: 'Find research gaps' },
              { key: 'translate', label: '🌐 Translate', tip: 'Translate abstract' },
              { key: 'draft', label: '📄 Draft', tip: 'Draft a paper section' },
              { key: 'cite', label: '📎 Format Refs', tip: 'Format references in standard style' },
            ].map(({ key, label, tip }) => (
              <button
                key={key}
                onClick={() => quickAction(key)}
                disabled={sending}
                title={tip}
                className="rounded bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-600 px-2 py-0.5 text-[10px] text-slate-600 dark:text-zinc-300 hover:border-indigo-300 dark:hover:border-indigo-600 hover:text-indigo-600 dark:hover:text-indigo-400 disabled:opacity-50 transition-colors"
              >
                {label}
              </button>
            ))}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {chatMessages.length === 0 && (
              <div className="flex h-full items-center justify-center">
                <div className="text-center text-slate-400 px-4">
                  <p className="text-4xl">🔬</p>
                  <p className="mt-2 text-sm">Import papers and ask your Agent</p>
                  <p className="mt-1 text-[11px]">Papers are uploaded to WTT server.<br/>Agent downloads and analyzes them.</p>
                </div>
              </div>
            )}
            {chatMessages.filter(m => !isProgressMessage(m.content)).map((msg) => {
              const { meta: msgMeta, body: cleanBody } = stripMetaBlocks(msg.content || '')
              return (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[90%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed ${
                  msg.role === 'user'
                    ? 'border border-indigo-200 dark:border-indigo-800/40 bg-indigo-50/80 dark:bg-indigo-950/30 text-slate-800 dark:text-zinc-200 rounded-tr-md'
                    : 'border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 rounded-tl-md'
                }`}>
                  {msg.sender_display_name && (
                    <p className={`mb-0.5 text-[10px] font-semibold ${msg.role === 'user' ? 'text-indigo-500' : 'text-emerald-500'}`}>{msg.sender_display_name}</p>
                  )}
                  {msgMeta.length > 0 && (
                    <div className="mb-1.5 space-y-1">
                      {msgMeta.map((m, mi) => {
                        const entries = Object.entries(m.entries).filter(([, v]) => v !== '')
                        if (entries.length === 0) return null
                        return (
                          <div key={mi} className="rounded-md border border-slate-200/60 dark:border-zinc-700/40 bg-slate-50/60 dark:bg-zinc-900/30 px-2 py-1">
                            <div className="grid gap-x-3 gap-y-0.5" style={{ gridTemplateColumns: 'auto 1fr' }}>
                              {entries.map(([k, v]) => (
                                <div key={k} className="contents text-[11px]">
                                  <span className="text-slate-400 dark:text-zinc-500 whitespace-nowrap">{k}</span>
                                  <span className="font-medium truncate">{v}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  <div className="whitespace-pre-wrap break-words">
                    {msg.role === 'assistant' ? <CitationText text={cleanBody} papers={papers} /> : (stripFileTokens(cleanBody) || cleanBody)}
                  </div>
                  <FileAttachmentPreview content={msg.content} />
                  <p className="mt-1 text-[10px] text-slate-400">{formatTime(msg.timestamp)}</p>
                  {msg.role === 'assistant' && (
                    <button
                      onClick={() => {
                        setWriteContent(prev => prev ? prev + '\n\n---\n\n' + msg.content : msg.content)
                        setCenterTab('write')
                        setInsertFeedback(msg.id)
                        setTimeout(() => setInsertFeedback(null), 1500)
                      }}
                      className="mt-1 text-[10px] text-indigo-400 hover:text-indigo-600"
                      title="Insert into editor"
                    >
                      {insertFeedback === msg.id ? '✅ Inserted!' : '📝 Insert to Editor'}
                    </button>
                  )}
                </div>
              </div>
              )
            })}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-slate-200 bg-slate-50 p-2.5">
            {selectedPaperFull && centerTab === 'read' && (
              <div className="mb-1.5 flex items-center gap-1 rounded bg-amber-50 px-2 py-1 text-[10px] text-amber-600">
                <span>📎</span>
                <span className="truncate">{selectedPaperFull.title || 'Paper'}</span>
                <span className="text-slate-400 shrink-0">as context</span>
              </div>
            )}
            <div className="flex gap-1.5">
              <PendingAttachments attachments={pendingAttachments} onRemove={(i) => setPendingAttachments(prev => prev.filter((_, j) => j !== i))} />
            </div>
            <div className="flex gap-1.5 items-center">
              <ChatFileUpload
                compact
                onUploaded={(asset) => setPendingAttachments(prev => [...prev, asset.markdownToken])}
                disabled={sending}
              />
              {isDesktop() && (
                <>
                  <button
                    onClick={attachLocalFiles}
                    disabled={sending}
                    className="rounded-lg border border-emerald-300 px-2 py-2 text-xs text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
                    title="Attach local files"
                  >📄</button>
                  <button
                    onClick={attachLocalFolder}
                    disabled={sending}
                    className="rounded-lg border border-cyan-300 px-2 py-2 text-xs text-cyan-600 hover:bg-cyan-50 disabled:opacity-50"
                    title="Attach local folder"
                  >📂</button>
                </>
              )}
              {!isDesktop() && (
                <>
                  <button
                    onClick={() => webFileRef.current?.click()}
                    disabled={sending}
                    className="rounded-lg border border-emerald-300 px-2 py-2 text-xs text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
                    title="Attach local files (no upload)"
                  >📄</button>
                  <button
                    onClick={() => webFolderRef.current?.click()}
                    disabled={sending}
                    className="rounded-lg border border-cyan-300 px-2 py-2 text-xs text-cyan-600 hover:bg-cyan-50 disabled:opacity-50"
                    title="Attach local folder (no upload)"
                  >📂</button>
                  <input ref={webFileRef} type="file" multiple accept=".pdf,.md,.txt,.docx,.html,.csv,.json,.py,.js,.ts,.tsx,.go,.rs,.java,.c,.cpp,.rb,.sh" className="hidden" onChange={handleWebFileAttach} />
                  <input ref={webFolderRef} type="file" className="hidden" onChange={handleWebFolderAttach} {...{ webkitdirectory: '', directory: '' } as Record<string, string>} />
                </>
              )}
              <textarea
                data-chat-input
                className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none resize-none"
                rows={chatInput.includes('\n') ? Math.min(chatInput.split('\n').length, 5) : 1}
                placeholder="Ask about your papers..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                disabled={sending}
              />
              <button
                onClick={() => sendMessage()}
                disabled={sending || (!chatInput.trim() && !pendingAttachments.length)}
                className="rounded-lg bg-indigo-500 px-3 py-2 text-sm text-white disabled:opacity-50 hover:bg-indigo-600"
              >
                {sending ? '...' : '↑'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
