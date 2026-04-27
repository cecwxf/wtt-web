'use client'

import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import useSWR from 'swr'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'
import { normalizeAndFilterAgents } from '@/lib/agents'
import { ChatFileUpload, FileAttachmentPreview, stripFileTokens, PendingAttachments } from '@/components/ui/chat-file-upload'
import { isDesktop, pickLocalFiles, readLocalFile, pickAndScanFolder, scanLocalFolder, indexLocalProject, checkFileBridge } from '@/lib/desktop'
import { FileTreePanel, scannedToFileNodes, type FileNode } from '@/components/ui/file-tree'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { stripMetaBlocks, isProgressMessage } from '@/components/ui/chat-view'
import { useAgentId, buildAgentUrl } from '@/lib/hooks/use-agent-id'
import { formatTime } from '@/lib/time'

const PdfViewer = dynamic(() => import('@/components/ui/pdf-viewer'), { ssr: false })
const AnnotationOverlay = dynamic(() => import('@/components/ui/annotation-overlay'), { ssr: false })

// ── Types ──────────────────────────────────────────────
interface Agent { id: string; agent_id: string; display_name: string; is_primary: boolean }
interface ChatMsg {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  sender_display_name?: string
}

// ── Helpers ────────────────────────────────────────────
const isMarkdownPath = (p: string) => /\.(md|mdx|markdown)$/i.test(p)
const isBinaryPath = (p: string) => /\.(png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|zip|tar|gz|exe|dll|so|dylib|wasm|mp[34]|mov|avi|webm)$/i.test(p)
const isDocumentPath = (p: string) => /\.(pdf|docx?|xlsx?|pptx?)$/i.test(p)
const langFromExt = (p: string): string => {
  const ext = p.split('.').pop()?.toLowerCase() || ''
  const m: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', rs: 'rust', go: 'go', java: 'java', c: 'c', cpp: 'cpp',
    rb: 'ruby', sh: 'bash', yml: 'yaml', yaml: 'yaml', json: 'json',
    css: 'css', html: 'html', sql: 'sql', toml: 'toml', xml: 'xml',
  }
  return m[ext] || ''
}

// ── Text extraction helpers (for reading levels) ───────
const cleanPdfText = (text: string): string => {
  let s = text
  s = s.replace(/(\w)-\n(\w)/g, '$1$2')
  s = s.replace(/([^.!?\n])\n([a-z])/g, '$1 $2')
  s = s.replace(/[^\S\n]+/g, ' ')
  s = s.replace(/\n{3,}/g, '\n\n')
  return s.trim()
}

const extractAbstract = (content: string): string | null => {
  const m = content.match(/(?:^|\n)#{1,3}\s*Abstract\s*\n([\s\S]*?)(?=\n#{1,3}\s|\n\n\n|\n(?:Introduction|1[\.\s]))/i)
    || content.match(/(?:^|\n)Abstract[:\s]*\n([\s\S]*?)(?=\n\n\n|\n(?:Introduction|Keywords|1[\.\s]))/i)
  if (m) return cleanPdfText(m[1].trim()).slice(0, 3000)
  const lines = content.split('\n').filter(l => l.trim())
  if (lines.length > 3) {
    const excerpt = lines.slice(1, 12).join('\n').trim()
    if (excerpt.length > 80) return cleanPdfText(excerpt).slice(0, 1500)
  }
  return null
}

const extractConclusion = (content: string): string | null => {
  const m = content.match(/(?:^|\n)#{1,3}\s*(?:Conclusions?|Summary|Discussion and Conclusions?|Concluding Remarks)\s*\n([\s\S]*?)(?=\n#{1,3}\s*(?:References|Bibliography|Acknowledgments|Appendix)|\n\n\n|$)/i)
    || content.match(/(?:^|\n)(?:Conclusions?|Summary)\s*\n([\s\S]*?)(?=\n(?:References|Bibliography)|$)/i)
  if (m) return cleanPdfText(m[1].trim()).slice(0, 5000)
  const refIdx = content.search(/\n#{1,3}\s*References/i)
  const end = refIdx > 0 ? content.slice(Math.max(0, refIdx - 2000), refIdx) : content.slice(-2000)
  const cleaned = cleanPdfText(end)
  return cleaned.length > 100 ? cleaned : null
}

const LEVEL_LABELS = ['', '📋 Metadata', '📋 Abstract', '🎯 Conclusion', '📄 Full Text'] as const

// ── Page ───────────────────────────────────────────────
export default function ResearchTaskPageWrapper() {
  return <Suspense fallback={null}><ResearchTaskPageInner /></Suspense>
}

function ResearchTaskPageInner() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const taskId = params.id as string

  // Desktop-only guard
  useEffect(() => {
    if (typeof window !== 'undefined' && !isDesktop()) router.replace('/tasks')
  }, [router])

  // ── State ──────────────────────────────────────────
  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgentId, setSelectedAgentId] = useAgentId()

  // File tree
  const [fileTree, setFileTree] = useState<FileNode[]>([])
  const [localProjectRoot, setLocalProjectRoot] = useState<string | null>(null)
  const [projectIndexed, setProjectIndexed] = useState(false)
  const [selectedFilePath, setSelectedFilePath] = useState('')
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [fileLoading, setFileLoading] = useState(false)
  const [readingLevel, setReadingLevel] = useState<1 | 2 | 3 | 4>(4)
  const [bridgeOnline, setBridgeOnline] = useState(false)

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([])
  const [chatInput, setChatInput] = useState('')
  const [sending, setSending] = useState(false)
  const [pendingAttachments, setPendingAttachments] = useState<string[]>([])
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Layout — right panel width (left takes the rest)
  const [rightW, setRightW] = useState(420)
  const resizingRef = useRef(false)
  const resizeStartX = useRef(0)
  const resizeStartW = useRef(0)

  // PDF viewer
  const [pdfDataUrl, setPdfDataUrl] = useState<string | null>(null)
  const [docExpanded, setDocExpanded] = useState(false)

  // Quote-to-chat + context menu
  const readerRef = useRef<HTMLDivElement>(null)
  const [quoteBtn, setQuoteBtn] = useState<{ x: number; y: number; text: string } | null>(null)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; text: string | null } | null>(null)

  // Notes (localStorage per file)
  const [fileNotes, setFileNotes] = useState<Record<string, string>>({})
  const [notesOpen, setNotesOpen] = useState(false)
  const [noteDialog, setNoteDialog] = useState<{ quote: string; comment: string } | null>(null)

  // Annotation overlay
  const [showAnnotationTools, setShowAnnotationTools] = useState(0)
  const [annotationAnchor, setAnnotationAnchor] = useState<{ x: number; y: number } | null>(null)

  // ── Auth + Data fetching ───────────────────────────
  const authHeaders = useCallback(() => ({
    Authorization: `Bearer ${session?.accessToken ?? ''}`,
  }), [session?.accessToken])

  const { data: task } = useSWR(
    session?.accessToken ? [`task-${taskId}`, session.accessToken] : null,
    async () => {
      const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}`, { headers: authHeaders() })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    },
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

  // ── Effects ────────────────────────────────────────
  useEffect(() => {
    if (!topicMessages) return
    const mapped: ChatMsg[] = topicMessages
      .filter((m: Record<string, string>) => {
        if (!m.content) return false
        if ((m.semantic_type || '').toUpperCase() === 'PROJECT_INDEX') return false
        return true
      })
      .map((m: Record<string, string>) => ({
        id: m.message_id,
        role: m.sender_id === selectedAgentId ? 'user' : 'assistant',
        content: m.content,
        timestamp: m.timestamp,
        sender_display_name: m.sender_display_name || agents.find(a => a.agent_id === m.sender_id)?.display_name || m.sender_id,
      }))
    setChatMessages(mapped)
  }, [topicMessages, selectedAgentId, agents])

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
  }, [selectedAgentId, authHeaders, setSelectedAgentId])

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
    if (status === 'authenticated') loadAgents()
  }, [status, router, loadAgents])

  // Persist right-panel width
  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem('research-right-w', String(rightW))
  }, [rightW])

  // Load file notes from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const saved = localStorage.getItem(`research-notes-${taskId}`)
      if (saved) setFileNotes(JSON.parse(saved))
    } catch {}
  }, [taskId])

  // Restore last opened folder + file (per-task)
  useEffect(() => {
    if (typeof window === 'undefined' || !taskId || !isDesktop()) return
    if (status !== 'authenticated') return
    if (localProjectRoot) return
    let cancelled = false
    ;(async () => {
      let savedFolder: string | null = null
      let savedFile: string | null = null
      try {
        savedFolder = localStorage.getItem(`research-folder-${taskId}`)
        savedFile = localStorage.getItem(`research-file-${taskId}`)
      } catch {}
      if (!savedFolder) return
      const ok = await loadFolderFromPath(savedFolder, { silent: true })
      if (cancelled || !ok || !savedFile) return
      // Re-select the previously viewed file if still present
      setTimeout(() => {
        if (cancelled) return
        setFileTree(prev => {
          const findNode = (nodes: FileNode[]): FileNode | null => {
            for (const n of nodes) {
              if (n.kind === 'file' && n.path === savedFile) return n
              if (n.kind === 'folder' && n.children) {
                const found = findNode(n.children)
                if (found) return found
              }
            }
            return null
          }
          const target = findNode(prev)
          if (target) viewFile(target)
          return prev
        })
      }, 50)
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, status, selectedAgentId])

  // ── Open Folder ────────────────────────────────────
  const persistOpenedFolder = useCallback((folderPath: string) => {
    if (typeof window === 'undefined' || !taskId) return
    try { localStorage.setItem(`research-folder-${taskId}`, folderPath) } catch {}
  }, [taskId])

  const persistSelectedFile = useCallback((filePath: string) => {
    if (typeof window === 'undefined' || !taskId) return
    try {
      if (filePath) localStorage.setItem(`research-file-${taskId}`, filePath)
      else localStorage.removeItem(`research-file-${taskId}`)
    } catch {}
  }, [taskId])

  const loadFolderFromPath = useCallback(async (folderPath: string, opts?: { silent?: boolean }) => {
    const result = await scanLocalFolder(folderPath, { includeAll: true, maxFileSize: 50 * 1024 * 1024 })
    if (!result || result.files.length === 0) return false
    setFileTree(scannedToFileNodes(result.files))
    setLocalProjectRoot(result.path)
    setSelectedFilePath('')
    setFileContent(null)
    if (selectedAgentId) {
      indexLocalProject(taskId, selectedAgentId, result.path, result.files, CLIENT_WTT_API_BASE, {
        Authorization: `Bearer ${session?.accessToken ?? ''}`
      }).then(async (r) => {
        if (r.ok) setProjectIndexed(true)
        const status = await checkFileBridge(taskId, CLIENT_WTT_API_BASE)
        setBridgeOnline(status.online)
      }).catch(() => {})
    }
    if (!opts?.silent) {
      const folderName = result.path.split(/[/\\]/).pop() || result.path
      setChatMessages(prev => [...prev, {
        id: `import-${Date.now()}`,
        role: 'user' as const,
        content: `📁 Folder opened: **${folderName}** (${result.files.length} files)\n_Agent can read files on demand — no upload needed._`,
        timestamp: new Date().toISOString(),
        sender_display_name: session?.user?.name || 'You',
      }])
    }
    return true
  }, [taskId, selectedAgentId, session?.accessToken, session?.user?.name])

  const openFolder = async () => {
    const result = await pickAndScanFolder('Open folder for research', { includeAll: true, maxFileSize: 50 * 1024 * 1024 })
    if (!result || result.files.length === 0) return
    setFileTree(scannedToFileNodes(result.files))
    setLocalProjectRoot(result.path)
    setSelectedFilePath('')
    setFileContent(null)
    persistOpenedFolder(result.path)
    persistSelectedFile('')
    if (selectedAgentId) {
      indexLocalProject(taskId, selectedAgentId, result.path, result.files, CLIENT_WTT_API_BASE, {
        Authorization: `Bearer ${session?.accessToken ?? ''}`
      }).then(async (r) => {
        if (r.ok) {
          setProjectIndexed(true)
          console.log(`[Research] Indexed ${r.indexed_files} files`)
        }
        // Check file bridge status (WS relay for agent to read local files)
        const status = await checkFileBridge(taskId, CLIENT_WTT_API_BASE)
        setBridgeOnline(status.online)
        console.log(`[Research] File bridge: registered=${status.registered} online=${status.online}`)
      }).catch(() => {})
    }
    // Compact chat notification
    const folderName = result.path.split(/[/\\]/).pop() || result.path
    setChatMessages(prev => [...prev, {
      id: `import-${Date.now()}`,
      role: 'user' as const,
      content: `📁 Folder opened: **${folderName}** (${result.files.length} files)\n_Agent can read files on demand — no upload needed._`,
      timestamp: new Date().toISOString(),
      sender_display_name: session?.user?.name || 'You',
    }])
  }

  // Computed extractions for reading levels
  const abstractText = useMemo(() => (fileContent && !fileContent.startsWith('__DOCUMENT__')) ? extractAbstract(fileContent) : null, [fileContent])
  const conclusionText = useMemo(() => (fileContent && !fileContent.startsWith('__DOCUMENT__')) ? extractConclusion(fileContent) : null, [fileContent])
  const fileSizeStr = useMemo(() => {
    if (!fileContent || fileContent.startsWith('__DOCUMENT__')) return ''
    const bytes = new Blob([fileContent]).size
    return bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`
  }, [fileContent])

  // ── View a file ────────────────────────────────────
  const viewFile = async (node: FileNode) => {
    if (node.kind !== 'file' || isBinaryPath(node.path)) return
    const fullPath = localProjectRoot ? `${localProjectRoot}/${node.path}` : node.path
    setSelectedFilePath(node.path)
    persistSelectedFile(node.path)
    setFileLoading(true)
    setPdfDataUrl(null)
    if (isDocumentPath(node.path)) {
      const ext = node.path.split('.').pop()?.toUpperCase() || 'DOC'
      const name = node.path.split(/[/\\]/).pop() || node.path
      setFileContent(`__DOCUMENT__\n${ext}\n${name}\n${fullPath}`)
      setReadingLevel(1)
      // For PDFs, also try to load for inline viewing
      if (ext === 'PDF') {
        try {
          const base64 = await readLocalFile(fullPath, 'base64')
          if (base64) setPdfDataUrl(`data:application/pdf;base64,${base64}`)
        } catch { /* PDF inline view not available */ }
      }
      setFileLoading(false)
      return
    }
    try {
      const content = await readLocalFile(fullPath)
      setFileContent(content || '(empty file)')
      setReadingLevel(4)
    } catch {
      setFileContent('(failed to read file)')
      setReadingLevel(4)
    } finally {
      setFileLoading(false)
    }
  }

  // ── Share file references to agent ─────────────────
  const shareFilesToAgent = async (filePaths: string[]) => {
    if (!task?.topic_id || filePaths.length === 0) return
    const fileList = filePaths.map(p => `  📎 \`${p}\``).join('\n')
    const msg = `[RESEARCH_FILES]\n${fileList}\n\nPlease analyze these files. Use wtt_local_read to access their content.`
    setSending(true)
    try {
      await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/chat/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.accessToken ?? ''}` },
        body: JSON.stringify({ content: msg, sender_type: 'HUMAN', semantic_type: 'post', include_task_context: true }),
      })
      mutateMessages()
    } catch { /* ignore */ }
    setSending(false)
  }

  // ── Attach local files ────────────────────────────
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
    if (!files?.length) return
    if (projectIndexed) {
      const refs = files.map(f => `  📎 \`${f.name}\``).join('\n')
      setPendingAttachments(prev => [...prev, `[RESEARCH_FILES]\n${refs}\n\nPlease analyze these files. Use wtt_local_read to access their content.`])
    } else {
      for (const f of files) {
        const content = await readLocalFile(f.path)
        if (!content) continue
        const trunc = content.length > 32000 ? content.slice(0, 32000) + '\n... (truncated)' : content
        setPendingAttachments(prev => [...prev, `📎 **${f.name}** (${(f.size / 1024).toFixed(1)} KB)\n\`\`\`\n${trunc}\n\`\`\``])
      }
    }
  }

  // ── Send message ───────────────────────────────────
  const sendMessage = async (text?: string) => {
    const attachmentText = pendingAttachments.join('\n')
    const content = (text || chatInput).trim()
    if ((!content && !attachmentText) || !task?.topic_id || sending) return
    setSending(true)
    if (!text) setChatInput('')
    setPendingAttachments([])
    const userContent = attachmentText ? `${attachmentText}\n\n${content}` : content
    try {
      const resp = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/chat/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.accessToken ?? ''}` },
        body: JSON.stringify({
          content: userContent,
          sender_type: 'HUMAN',
          semantic_type: 'post',
          auto_run: task?.status === 'todo',
          include_task_context: task?.status === 'todo',
        }),
      })
      if (!resp.ok) console.error('[Research] chat/send failed:', resp.status)
      mutateMessages()
    } catch { /* ignore */ } finally {
      setSending(false)
    }
  }

  // ── Quick actions ──────────────────────────────────
  const quickAction = (action: string) => {
    const prompts: Record<string, string> = {
      summarize: 'Please summarize the key contents of the files in this project.',
      review: 'Please write a literature review based on the documents in this project.',
      compare: 'Please compare and analyze the different documents in this project.',
      gap: 'Please identify research gaps based on the documents in this project.',
      translate: selectedFilePath
        ? `Please translate the content of ${selectedFilePath} to Chinese.`
        : 'Please translate the selected document to Chinese.',
      draft: 'Based on the documents in this project, please draft a structured research section.',
      cite: 'Please format the references found in the project documents in APA style.',
    }
    const prompt = prompts[action]
    if (prompt) sendMessage(prompt)
  }

  // ── Quote to Chat ─────────────────────────────────
  const quoteToChat = (text: string) => {
    const charCount = text.length
    const lineCount = text.split('\n').length
    const preview = text.slice(0, 100).replace(/\n/g, ' ').trim()
    const ellipsis = charCount > 100 ? '...' : ''
    const fileName = selectedFilePath.split(/[/\\]/).pop() || 'Document'
    const ref = `📌 [Ref: "${fileName}" — ${charCount} chars, ${lineCount} lines]\n> "${preview}${ellipsis}"`
    setChatInput(prev => prev ? `${prev}\n\n${ref}\n\n` : `${ref}\n\n`)
    setQuoteBtn(null); setCtxMenu(null)
    window.getSelection()?.removeAllRanges()
  }

  // ── Notes ─────────────────────────────────────────
  const addToNotes = (text: string) => {
    setCtxMenu(null); setQuoteBtn(null)
    window.getSelection()?.removeAllRanges()
    setNoteDialog({ quote: text, comment: '' })
  }

  const saveFileNote = (filePath: string, noteEntry: string) => {
    const updated = { ...fileNotes, [filePath]: (fileNotes[filePath] || '') + noteEntry }
    setFileNotes(updated)
    try { localStorage.setItem(`research-notes-${taskId}`, JSON.stringify(updated)) } catch {}
  }

  const saveNote = () => {
    if (!selectedFilePath || !noteDialog) return
    const timestamp = new Date().toLocaleString()
    const parts = [`\n---\n📌 ${timestamp}`]
    if (noteDialog.quote) parts.push(`> ${noteDialog.quote.split('\n').join('\n> ')}`)
    if (noteDialog.comment.trim()) parts.push(`\n${noteDialog.comment.trim()}`)
    const entry = parts.join('\n') + '\n'
    saveFileNote(selectedFilePath, entry)
    setNotesOpen(true)
    setNoteDialog(null)
  }

  const clearFileNotes = () => {
    if (!selectedFilePath) return
    const updated = { ...fileNotes }
    delete updated[selectedFilePath]
    setFileNotes(updated)
    try { localStorage.setItem(`research-notes-${taskId}`, JSON.stringify(updated)) } catch {}
  }

  const currentNotes = selectedFilePath ? fileNotes[selectedFilePath] : null
  const noteCount = currentNotes ? (currentNotes.match(/📌/g) || []).length : 0

  // ── Resize handler (drag from left to adjust right panel width) ──
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault()
    resizingRef.current = true
    resizeStartX.current = e.clientX
    resizeStartW.current = rightW
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizingRef.current) return
      const dx = e.clientX - resizeStartX.current
      setRightW(Math.max(280, Math.min(700, resizeStartW.current - dx)))
    }
    const onUp = () => {
      resizingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  // ── Text selection: Quote to Chat + Context Menu ──
  useEffect(() => {
    const handleSelection = () => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        setQuoteBtn(null); return
      }
      const node = sel.anchorNode
      if (!node || !readerRef.current?.contains(node)) {
        setQuoteBtn(null); return
      }
      const range = sel.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      setQuoteBtn({ x: rect.left + rect.width / 2, y: rect.top - 8, text: sel.toString().trim() })
    }
    const handleContextMenu = (e: MouseEvent) => {
      if (!readerRef.current?.contains(e.target as Node)) return
      const sel = window.getSelection()
      const hasText = sel && !sel.isCollapsed && sel.toString().trim()
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

  // ── Render ─────────────────────────────────────────
  if (status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-white dark:bg-zinc-900">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
          <p className="mt-3 text-sm text-slate-400">Loading…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-white dark:bg-zinc-900">
      {/* ── Header ──────────────────────────────────── */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push(buildAgentUrl('/tasks', selectedAgentId))} className="text-sm text-indigo-500 hover:underline">← Tasks</button>
          <span className="text-sm font-semibold text-slate-700 dark:text-zinc-200 max-w-[300px] truncate">{task?.title || 'Research Task'}</span>
          <span className="rounded bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">📄 Research</span>
          {task?.status && (
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
              task.status === 'doing' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' :
              task.status === 'done' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
              task.status === 'cancelled' ? 'bg-red-100 text-red-600' :
              'bg-slate-100 dark:bg-zinc-700 text-slate-500 dark:text-zinc-400'
            }`}>{task.status === 'doing' ? '⚡ Running' : task.status === 'done' ? '✅ Done' : task.status === 'cancelled' ? '🚫 Cancelled' : task.status}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {localProjectRoot && (
            <>
              <span className="text-[10px] text-slate-400 dark:text-zinc-500 truncate max-w-[180px]" title={localProjectRoot}>
                📁 {localProjectRoot.split(/[/\\]/).pop()}
              </span>
              <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
                bridgeOnline
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                  : 'bg-slate-100 dark:bg-zinc-700 text-slate-400 dark:text-zinc-500'
              }`} title={bridgeOnline ? 'Agent can read local files via WS relay (no upload)' : 'File bridge not connected — agent cannot read local files'}>
                {bridgeOnline ? '🔗 Bridge' : '⚠ Offline'}
              </span>
            </>
          )}
          <button
            onClick={openFolder}
            className="flex items-center gap-1 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-2.5 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            title="Import local project folder for agent to index and access"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
              <path fillRule="evenodd" d="M3.75 3A1.75 1.75 0 002 4.75v10.5c0 .966.784 1.75 1.75 1.75h12.5A1.75 1.75 0 0018 15.25v-8.5A1.75 1.75 0 0016.25 5h-4.836a.25.25 0 01-.177-.073L9.823 3.513A1.75 1.75 0 008.586 3H3.75zM10 10.25a.75.75 0 01.75.75v1.5h1.5a.75.75 0 010 1.5h-1.5v1.5a.75.75 0 01-1.5 0v-1.5h-1.5a.75.75 0 010-1.5h1.5V11a.75.75 0 01.75-.75z" clipRule="evenodd" />
            </svg>
            {localProjectRoot ? 'Change Folder' : 'Import Folder'}
          </button>
          <ThemeToggle />
        </div>
      </div>

      {/* ── Main two-column area ──────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ═══ LEFT COLUMN: File tree + content viewer ═══ */}
        <div className="flex flex-1 overflow-hidden">
          {/* File tree sidebar */}
          {fileTree.length > 0 && !docExpanded && (
            <FileTreePanel
              fileTree={fileTree}
              projectRoot={localProjectRoot}
              selectedPath={selectedFilePath}
              onSelect={(node) => viewFile(node)}
              onShare={(node) => { if (node.kind === 'file') shareFilesToAgent([node.path]) }}
              onClose={() => {
                setFileTree([]); setLocalProjectRoot(null); setSelectedFilePath(''); setFileContent(null); setProjectIndexed(false)
                if (typeof window !== 'undefined' && taskId) {
                  try {
                    localStorage.removeItem(`research-folder-${taskId}`)
                    localStorage.removeItem(`research-file-${taskId}`)
                  } catch {}
                }
              }}
              onImportFolder={openFolder}
              title="📂 Files"
              width={220}
            />
          )}

          {/* Content viewer */}
          <div className="flex-1 overflow-hidden flex flex-col min-w-0">
            {fileContent !== null ? (
              <>
                {/* File header bar with L1-L4 buttons */}
                <div className="flex h-8 shrink-0 items-center justify-between border-b border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[11px] font-medium text-slate-600 dark:text-zinc-300 truncate">{selectedFilePath.split(/[/\\]/).pop()}</span>
                    {langFromExt(selectedFilePath) && (
                      <span className="rounded bg-slate-100 dark:bg-zinc-700 px-1 py-0.5 text-[9px] text-slate-500 dark:text-zinc-400">{langFromExt(selectedFilePath)}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Reading level buttons */}
                    <div className="flex items-center border border-slate-200 dark:border-zinc-600 rounded overflow-hidden mr-2">
                      {([1, 2, 3, 4] as const).map(level => (
                        <button
                          key={level}
                          onClick={() => setReadingLevel(level)}
                          className={`px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                            readingLevel === level
                              ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300'
                              : 'text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700'
                          }`}
                          title={LEVEL_LABELS[level]}
                        >L{level}</button>
                      ))}
                    </div>
                    <button
                      onClick={() => shareFilesToAgent([selectedFilePath])}
                      className="rounded px-1.5 py-0.5 text-[10px] text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
                      title="Send to agent for analysis"
                    >@Agent</button>
                    {fileTree.length > 0 && (
                      <button
                        onClick={() => setDocExpanded(v => !v)}
                        className="rounded px-1.5 py-0.5 text-[10px] text-slate-500 hover:bg-slate-100 dark:hover:bg-zinc-700 dark:text-zinc-400"
                        title={docExpanded ? '收起：显示文件树' : '展开：隐藏左侧文件树，文档铺满左半区'}
                      >{docExpanded ? '⤢ 收起' : '⤢ 展开'}</button>
                    )}
                    {currentNotes && (
                      <button
                        onClick={() => setNotesOpen(!notesOpen)}
                        className="rounded px-1.5 py-0.5 text-[10px] text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/30"
                      >📝 {noteCount}</button>
                    )}
                    <button
                      onClick={() => { setSelectedFilePath(''); setFileContent(null); persistSelectedFile('') }}
                      className="rounded px-1 py-0.5 text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300"
                    >✕</button>
                  </div>
                </div>

                {/* File content — reading-level aware */}
                <div ref={readerRef} className="flex-1 overflow-auto">
                  {fileLoading ? (
                    <div className="flex h-full items-center justify-center">
                      <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-500" />
                    </div>
                  ) : fileContent?.startsWith('__DOCUMENT__\n') ? (() => {
                    const lines = fileContent.split('\n')
                    const ext = lines[1] || 'DOC'
                    const name = lines[2] || 'Document'
                    const docPath = lines[3] || ''
                    const icons: Record<string, string> = { PDF: '📕', DOCX: '📘', DOC: '📘', XLSX: '📗', PPTX: '📙' }
                    return (
                      <div className="p-4 space-y-4">
                        {/* L1: Document metadata */}
                        <div className="rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50/80 dark:bg-zinc-800/50 p-4">
                          <div className="flex items-start gap-4">
                            <span className="text-5xl">{icons[ext] || '📄'}</span>
                            <div className="flex-1 min-w-0">
                              <h3 className="text-base font-semibold text-slate-700 dark:text-zinc-200">{name}</h3>
                              <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
                                <span className="text-slate-400">Type</span>
                                <span className="text-slate-600 dark:text-zinc-300">{ext} Document</span>
                                <span className="text-slate-400">Path</span>
                                <span className="text-slate-600 dark:text-zinc-300 truncate" title={docPath}>{docPath}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                        {/* Notes for current file (document) */}
                        {currentNotes && (
                          <div className="rounded-lg border border-amber-100 dark:border-amber-800/30 bg-amber-50/30 dark:bg-amber-950/20">
                            <button
                              onClick={() => setNotesOpen(!notesOpen)}
                              className="w-full flex items-center justify-between px-4 py-2 text-sm font-medium text-amber-700 dark:text-amber-400"
                            >
                              <span>📝 Notes ({noteCount})</span>
                              <span className="text-xs">{notesOpen ? '▼' : '▶'}</span>
                            </button>
                            {notesOpen && (
                              <div className="px-4 pb-3 space-y-2 max-h-60 overflow-y-auto">
                                <div className="prose prose-sm max-w-none text-slate-600 dark:text-zinc-300">
                                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{currentNotes}</ReactMarkdown>
                                </div>
                                <button onClick={() => { if (confirm('Clear all notes for this file?')) clearFileNotes() }} className="text-[10px] text-red-400 hover:text-red-600">🗑 Clear notes</button>
                              </div>
                            )}
                          </div>
                        )}
                        {/* L2: Agent summary prompt */}
                        {readingLevel >= 2 && readingLevel <= 3 && (
                          <div className="rounded-lg border border-blue-100 dark:border-blue-900/30 bg-blue-50/50 dark:bg-blue-950/20 p-4">
                            <h4 className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-2">
                              {readingLevel === 2 ? '📋 Abstract / Summary' : '🎯 Conclusion / Key Points'}
                            </h4>
                            <p className="text-[12px] text-blue-600/70 dark:text-blue-400/60 mb-3">
                              This is a binary document. Send it to your agent for {readingLevel === 2 ? 'summary extraction' : 'key points analysis'}.
                            </p>
                            <button
                              onClick={() => sendMessage(
                                readingLevel === 2
                                  ? `Please read the file \`${selectedFilePath}\` and extract its abstract or executive summary.`
                                  : `Please read the file \`${selectedFilePath}\` and extract the conclusion and key findings.`
                              )}
                              className="rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600"
                            >
                              🤖 Ask Agent to {readingLevel === 2 ? 'Extract Summary' : 'Extract Key Points'}
                            </button>
                          </div>
                        )}
                        {/* L4: PDF inline viewer or agent full-content prompt */}
                        {readingLevel >= 4 && (
                          pdfDataUrl ? (
                            <div className="rounded-lg border border-slate-200 dark:border-zinc-700 overflow-hidden relative">
                              <PdfViewer url={pdfDataUrl} />
                              <AnnotationOverlay storageKey={`research-${taskId}-${selectedFilePath}`} showToolbar={showAnnotationTools} toolbarAnchor={annotationAnchor} />
                            </div>
                          ) : (
                            <div className="rounded-lg border border-blue-100 dark:border-blue-900/30 bg-blue-50/50 dark:bg-blue-950/20 p-4">
                              <h4 className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-2">📄 Full Content</h4>
                              <p className="text-[12px] text-blue-600/70 dark:text-blue-400/60 mb-3">
                                This is a binary document. Send it to your agent for full content analysis.
                              </p>
                              <button
                                onClick={() => sendMessage(`Please read the file \`${selectedFilePath}\` and provide a comprehensive analysis of its full content.`)}
                                className="rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600"
                              >
                                🤖 Ask Agent to Analyze Full Content
                              </button>
                            </div>
                          )
                        )}
                      </div>
                    )
                  })() : readingLevel < 4 ? (
                    /* L1-L3: Progressive reading cards for text files */
                    <div className="p-4 space-y-4">
                      {/* L1: File metadata — always shown */}
                      <div className="rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50/80 dark:bg-zinc-800/50 p-4">
                        <h4 className="text-sm font-medium text-slate-600 dark:text-zinc-300 mb-2">📋 File Info</h4>
                        <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[12px]">
                          <span className="text-slate-400">Name</span>
                          <span className="font-medium text-slate-700 dark:text-zinc-200">{selectedFilePath.split(/[/\\]/).pop()}</span>
                          <span className="text-slate-400">Path</span>
                          <span className="text-slate-600 dark:text-zinc-300 truncate">{selectedFilePath}</span>
                          <span className="text-slate-400">Type</span>
                          <span className="text-slate-600 dark:text-zinc-300">{langFromExt(selectedFilePath) || selectedFilePath.split('.').pop()?.toUpperCase() || 'Text'}</span>
                          <span className="text-slate-400">Size</span>
                          <span className="text-slate-600 dark:text-zinc-300">{fileSizeStr}</span>
                          <span className="text-slate-400">Lines</span>
                          <span className="text-slate-600 dark:text-zinc-300">{fileContent.split('\n').length.toLocaleString()}</span>
                        </div>
                      </div>

                      {/* Notes for current file (text) */}
                      {currentNotes && (
                        <div className="rounded-lg border border-amber-100 dark:border-amber-800/30 bg-amber-50/30 dark:bg-amber-950/20">
                          <button
                            onClick={() => setNotesOpen(!notesOpen)}
                            className="w-full flex items-center justify-between px-4 py-2 text-sm font-medium text-amber-700 dark:text-amber-400"
                          >
                            <span>📝 Notes ({noteCount})</span>
                            <span className="text-xs">{notesOpen ? '▼' : '▶'}</span>
                          </button>
                          {notesOpen && (
                            <div className="px-4 pb-3 space-y-2 max-h-60 overflow-y-auto">
                              <div className="prose prose-sm max-w-none text-slate-600 dark:text-zinc-300">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{currentNotes}</ReactMarkdown>
                              </div>
                              <button onClick={() => { if (confirm('Clear all notes for this file?')) clearFileNotes() }} className="text-[10px] text-red-400 hover:text-red-600">🗑 Clear notes</button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* L2: Abstract / Summary */}
                      {readingLevel >= 2 && (
                        <div className="rounded-lg border border-blue-100 dark:border-blue-900/30 bg-blue-50/50 dark:bg-blue-950/20 p-4">
                          <h4 className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-2">📋 Abstract / Summary</h4>
                          {abstractText ? (
                            <div className="prose prose-sm dark:prose-invert max-w-none text-[13px] leading-relaxed">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{abstractText}</ReactMarkdown>
                            </div>
                          ) : (
                            <div>
                              <p className="text-[12px] text-blue-600/60 dark:text-blue-400/50 mb-2">No abstract detected. Ask your agent to summarize.</p>
                              <button
                                onClick={() => sendMessage(`Please read the file \`${selectedFilePath}\` and provide a brief abstract or summary.`)}
                                className="rounded bg-blue-500 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-blue-600"
                              >🤖 Generate Summary</button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* L3: Conclusion / Key Points */}
                      {readingLevel >= 3 && (
                        <div className="rounded-lg border border-emerald-100 dark:border-emerald-900/30 bg-emerald-50/50 dark:bg-emerald-950/20 p-4">
                          <h4 className="text-sm font-medium text-emerald-700 dark:text-emerald-300 mb-2">🎯 Conclusion / Key Points</h4>
                          {conclusionText ? (
                            <div className="prose prose-sm dark:prose-invert max-w-none text-[13px] leading-relaxed">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{conclusionText}</ReactMarkdown>
                            </div>
                          ) : (
                            <div>
                              <p className="text-[12px] text-emerald-600/60 dark:text-emerald-400/50 mb-2">No conclusion detected. Ask your agent to extract key points.</p>
                              <button
                                onClick={() => sendMessage(`Please read the file \`${selectedFilePath}\` and extract the conclusion or key findings.`)}
                                className="rounded bg-emerald-500 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-emerald-600"
                              >🤖 Extract Key Points</button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : isMarkdownPath(selectedFilePath) ? (
                    <div className="relative min-h-full">
                      <div className="prose prose-sm dark:prose-invert max-w-none p-4">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{fileContent}</ReactMarkdown>
                      </div>
                      <AnnotationOverlay storageKey={`research-${taskId}-${selectedFilePath}`} showToolbar={showAnnotationTools} toolbarAnchor={annotationAnchor} />
                    </div>
                  ) : langFromExt(selectedFilePath) ? (
                    <div className="relative min-h-full">
                      <pre className="p-4 text-[12px] leading-relaxed font-mono whitespace-pre-wrap break-words">
                        <code className={`language-${langFromExt(selectedFilePath)} text-slate-700 dark:text-zinc-300`}>{fileContent}</code>
                      </pre>
                      <AnnotationOverlay storageKey={`research-${taskId}-${selectedFilePath}`} showToolbar={showAnnotationTools} toolbarAnchor={annotationAnchor} />
                    </div>
                  ) : (
                    <div className="relative min-h-full">
                      <pre className="p-4 text-[12px] leading-relaxed text-slate-700 dark:text-zinc-300 font-mono whitespace-pre-wrap break-words">
                        {fileContent}
                      </pre>
                      <AnnotationOverlay storageKey={`research-${taskId}-${selectedFilePath}`} showToolbar={showAnnotationTools} toolbarAnchor={annotationAnchor} />
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* Empty state */
              <div className="flex flex-1 items-center justify-center">
                <div className="text-center px-6">
                  <p className="text-5xl">📂</p>
                  <p className="mt-3 text-sm font-medium text-slate-600 dark:text-zinc-400">
                    {fileTree.length > 0 ? 'Select a file to view' : 'Open a folder to browse files'}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400 dark:text-zinc-500 max-w-[240px] mx-auto">
                    Browse files with L1–L4 reading levels. L1 Metadata → L2 Abstract → L3 Key Points → L4 Full Text.
                  </p>
                  {fileTree.length === 0 && (
                    <button
                      onClick={openFolder}
                      className="mt-4 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-600"
                    >
                      Open Folder
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Resize handle ─────────────────────────── */}
        <div
          className="w-[3px] shrink-0 cursor-col-resize hover:bg-indigo-400 dark:hover:bg-indigo-600 active:bg-indigo-500 transition-colors bg-transparent"
          onMouseDown={startResize}
        />

        {/* ═══ RIGHT COLUMN: Chat panel ═══ */}
        <div className="flex flex-col overflow-hidden" style={{ width: rightW }}>
          {/* Chat header */}
          <div className="flex h-9 items-center justify-between border-b border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-3">
            <span className="text-[11px] font-semibold text-slate-600 dark:text-zinc-300">🤖 Research Assistant</span>
            {task?.runner_agent_id && (
              <span className="rounded bg-indigo-100 dark:bg-indigo-900/40 px-1.5 py-0.5 text-[10px] text-indigo-600 dark:text-indigo-300 truncate max-w-[120px]">{task.runner_agent_id}</span>
            )}
          </div>

          {/* Quick action buttons */}
          <div className="flex flex-wrap gap-1 border-b border-slate-100 dark:border-zinc-700 bg-slate-50/50 dark:bg-zinc-800/50 px-2 py-1.5">
            {[
              { key: 'summarize', label: '📋 Summarize', tip: 'Summarize project files' },
              { key: 'review', label: '📝 Literature Review', tip: 'Generate literature review' },
              { key: 'compare', label: '📊 Compare', tip: 'Compare documents' },
              { key: 'gap', label: '🔍 Gap Analysis', tip: 'Find research gaps' },
              { key: 'translate', label: '🌐 Translate', tip: 'Translate to Chinese' },
              { key: 'draft', label: '📄 Draft', tip: 'Draft a research section' },
              { key: 'cite', label: '📎 Format Refs', tip: 'Format references in APA style' },
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
                <div className="text-center text-slate-400 dark:text-zinc-500 px-4">
                  <p className="text-4xl">🔬</p>
                  <p className="mt-2 text-sm">Import files and ask your Agent</p>
                  <p className="mt-1 text-[11px]">Open a folder on the left, then ask questions here.</p>
                </div>
              </div>
            )}
            {chatMessages.filter(m => !isProgressMessage(m.content)).map((msg) => {
              const { meta, body: cleanBody } = stripMetaBlocks(msg.content || '')
              return (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-[1.42] shadow-[0_1px_0_rgba(0,0,0,0.08)] ${
                    msg.role === 'user'
                      ? 'bg-[#DCF8C6] dark:bg-emerald-900/45 text-slate-800 dark:text-zinc-100 rounded-br-md'
                      : 'bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-200 rounded-bl-md'
                  }`}>
                    {msg.sender_display_name && (
                      <p className={`mb-0.5 text-[10px] font-semibold ${msg.role === 'user' ? 'text-emerald-700 dark:text-emerald-300' : 'text-emerald-500'}`}>{msg.sender_display_name}</p>
                    )}
                    {meta.length > 0 && (
                      <div className="mb-1.5 space-y-1">
                        {meta.map((m, mi) => {
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
                    <div className="whitespace-pre-wrap break-words prose prose-sm dark:prose-invert max-w-none">
                      {msg.role === 'assistant' ? (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{cleanBody}</ReactMarkdown>
                      ) : (
                        stripFileTokens(cleanBody) || cleanBody
                      )}
                    </div>
                    <FileAttachmentPreview content={msg.content} />
                    <p className={`mt-1 text-[10px] ${msg.role === 'user' ? 'text-emerald-700/70 dark:text-emerald-300/70' : 'text-slate-400'}`}>{formatTime(msg.timestamp)}</p>
                  </div>
                </div>
              )
            })}
            <div ref={chatEndRef} />
          </div>

          {/* Input area */}
          <div className="border-t border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 p-2.5">
            {pendingAttachments.length > 0 && (
              <div className="mb-1.5">
                <PendingAttachments attachments={pendingAttachments} onRemove={(i) => setPendingAttachments(prev => prev.filter((_, j) => j !== i))} />
              </div>
            )}
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
                    className="rounded-lg border border-emerald-300 dark:border-emerald-700 px-2 py-2 text-xs text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 disabled:opacity-50"
                    title="Attach local files"
                  >📄</button>
                  <button
                    onClick={openFolder}
                    disabled={sending}
                    className="rounded-lg border border-cyan-300 dark:border-cyan-700 px-2 py-2 text-xs text-cyan-600 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-900/30 disabled:opacity-50"
                    title="Open local folder"
                  >📂</button>
                </>
              )}
              <textarea
                data-chat-input
                className="flex-1 rounded-lg border border-slate-200 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-slate-800 dark:text-zinc-200 focus:border-indigo-400 focus:outline-none resize-none"
                rows={chatInput.includes('\n') ? Math.min(chatInput.split('\n').length, 5) : 1}
                placeholder="Ask about your files…"
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
                {sending ? '…' : '↑'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Floating Quote Button ─────────────────── */}
      {quoteBtn && !ctxMenu && (
        <div
          className="fixed z-[100] flex items-center gap-0.5 rounded-lg bg-slate-800 shadow-lg -translate-x-1/2 -translate-y-full"
          style={{ left: quoteBtn.x, top: quoteBtn.y }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button onClick={() => quoteToChat(quoteBtn.text)} className="px-2.5 py-1.5 text-xs text-white hover:bg-slate-700 rounded-l-lg">💬 Chat</button>
          <div className="w-px h-4 bg-slate-600" />
          <button onClick={() => addToNotes(quoteBtn.text)} className="px-2.5 py-1.5 text-xs text-white hover:bg-slate-700 rounded-r-lg">📝 Note</button>
        </div>
      )}

      {/* ── Context Menu ──────────────────────────── */}
      {ctxMenu && (
        <div
          className="fixed z-[100] rounded-lg bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 shadow-xl py-1 min-w-[160px]"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {ctxMenu.text && (
            <>
              <button onClick={() => quoteToChat(ctxMenu.text!)} className="w-full text-left px-3 py-1.5 text-xs text-slate-700 dark:text-zinc-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 hover:text-indigo-600">💬 Quote to Chat</button>
              <button onClick={() => addToNotes(ctxMenu.text!)} className="w-full text-left px-3 py-1.5 text-xs text-slate-700 dark:text-zinc-300 hover:bg-amber-50 dark:hover:bg-amber-950/30 hover:text-amber-600">📝 Add to Notes</button>
            </>
          )}
          <button
            onClick={() => { setAnnotationAnchor(ctxMenu ? { x: ctxMenu.x, y: ctxMenu.y } : null); setShowAnnotationTools(prev => prev + 1); setCtxMenu(null) }}
            className="w-full text-left px-3 py-1.5 text-xs text-slate-700 dark:text-zinc-300 hover:bg-violet-50 dark:hover:bg-violet-950/30"
          >🖊️ Annotate</button>
        </div>
      )}

      {/* ── Note Dialog Modal ─────────────────────── */}
      {noteDialog && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30" onClick={() => setNoteDialog(null)}>
          <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-2xl w-[480px] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-slate-100 dark:border-zinc-700 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-200">📝 Add Note</h3>
              <button onClick={() => setNoteDialog(null)} className="text-lg text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="px-5 py-4 space-y-3">
              {noteDialog.quote && (
                <div className="rounded-lg bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 px-3 py-2 text-xs text-slate-600 dark:text-zinc-400 max-h-32 overflow-y-auto">
                  <p className="text-[10px] text-slate-400 mb-1 font-medium">Selected text:</p>
                  <p className="italic">{noteDialog.quote}</p>
                </div>
              )}
              <textarea
                autoFocus rows={4}
                className="w-full rounded-lg border border-slate-200 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none resize-none"
                placeholder="Write your thoughts, annotations..."
                value={noteDialog.comment}
                onChange={(e) => setNoteDialog({ ...noteDialog, comment: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveNote() } }}
              />
              <p className="text-[10px] text-slate-400">⌘/Ctrl + Enter to save</p>
            </div>
            <div className="px-5 py-3 border-t border-slate-100 dark:border-zinc-700 flex justify-end gap-2">
              <button onClick={() => setNoteDialog(null)} className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700">Cancel</button>
              <button
                onClick={saveNote}
                disabled={!noteDialog.comment.trim() && !noteDialog.quote}
                className="px-4 py-1.5 text-xs font-medium text-white bg-amber-500 hover:bg-amber-600 rounded-lg disabled:opacity-50"
              >Save Note</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
