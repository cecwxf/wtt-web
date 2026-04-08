'use client'

import { useRouter, useParams } from 'next/navigation'
import { useState, useEffect, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import useSWR from 'swr'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useSession } from 'next-auth/react'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { isDesktop, pickLocalFiles, readLocalFile, pickAndScanFolder, readFilesBatch, watchLocalFolder, indexLocalProject, type ScannedFile } from '@/lib/desktop'
import 'katex/dist/katex.min.css'
import mermaid from 'mermaid'

mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'loose' })

/**
 * Sanitize article markdown to fix common agent output issues:
 * - Strip 4-space indentation on structural lines (headings, code fences, lists)
 * - Fix broken LaTeX: \f (form-feed) before "rac" → \frac
 * - Normalize math delimiters: ensure $$ blocks are not indented
 */
function sanitizeArticleMarkdown(raw: string): string {
  if (!raw) return raw
  let md = raw

  // Fix \f (form-feed char 0x0C) before "rac" → \frac  (agent's \frac gets mangled)
  md = md.replace(/\x0crac\{/g, '\\frac{')
  md = md.replace(/\x0crac /g, '\\frac ')

  // If any heading/code-fence/list is 4-space indented, strip the prefix from all indented lines
  const lines = md.split('\n')
  const hasIndentedStructure = lines.some(l =>
    /^    (#{1,6} |```|- |\* |\d+\. |\$\$)/.test(l)
  )
  if (hasIndentedStructure) {
    md = lines.map(l => l.startsWith('    ') ? l.slice(4) : l).join('\n')
  }

  // Ensure $$ math blocks are on their own lines (not indented)
  md = md.replace(/^[ \t]+(\$\$)$/gm, '$1')

  // Fix escaped underscores inside LaTeX that break rendering: \_ → _  inside $..$ blocks
  md = md.replace(/(\$\$[\s\S]*?\$\$|\$[^$\n]+?\$)/g, (match) => {
    return match.replace(/\\_/g, '_')
  })

  return md
}

function MermaidDiagram({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [svg, setSvg] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    const id = `mermaid-${Math.random().toString(36).slice(2, 10)}`
    mermaid.render(id, chart.trim()).then(({ svg: s }) => {
      if (!cancelled) setSvg(s)
    }).catch((e) => {
      if (!cancelled) setError(String(e))
    })
    return () => { cancelled = true }
  }, [chart])
  if (error) return <pre className="text-xs text-red-500 bg-red-50 dark:bg-red-950/20 p-3 rounded-lg overflow-auto">{chart}</pre>
  return <div ref={ref} className="my-4 flex justify-center overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} />
}

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false })

/* ── Types ── */
interface KBArticle {
  id: string; slug: string; title: string; summary: string | null
  category: string | null; tags: string; version: number
  compiled_by: string | null; created_at: string; updated_at: string
}
interface KBArticleFull extends KBArticle {
  content_markdown: string; content_markdown_zh?: string; source_ids: string; backlinks: string
}
interface TOCData {
  categories: Record<string, { slug: string; title: string; summary: string | null; tags: string; version: number }[]>
  article_count: number
  index_entries: { entry_type: string; key: string; summary: string; article_ids: string; source_ids: string }[]
}
interface KBStats {
  sources: { source_type: string; status: string; cnt: number }[]
  articles: { total: number; by_category: { cat: string; cnt: number }[] }
  queries: { total: number; answered: number }
  index_entries: number
  log?: { total: number; recent: { id: string; event_type: string; summary: string; created_at: string }[] }
}
interface SearchResult {
  id: string; title: string; slug?: string; snippet: string
  result_type: 'article' | 'source'; rank: number
  source_type?: string; category?: string
}
interface ChatMsg {
  message_id: string; sender_id: string; sender_type: string
  content: string; timestamp: string; semantic_type?: string
}
interface GraphNode {
  id: string; title: string; category: string; tags: string; connections: number
}
interface GraphEdge {
  source: string; target: string
}

/* ── Helpers ── */
const fetcher = async (url: string) => {
  const r = await fetch(url); if (!r.ok) throw new Error(`${r.status}`); return r.json()
}
const SOURCE_ICONS: Record<string, string> = {
  paper: '📄', url: '🔗', note: '📝', topic_export: '💬', image: '🖼️', file: '📁'
}
const STATUS_COLORS: Record<string, string> = {
  raw: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  processed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  compiled: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  stale: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
}

export default function KnowledgeBasePage() {
  const router = useRouter()
  const params = useParams()
  const taskId = params.id as string

  // Desktop-only: redirect to tasks board if accessed from browser
  useEffect(() => {
    if (typeof window !== 'undefined' && !isDesktop()) {
      router.replace('/tasks')
    }
  }, [router])

  /* ── Tabs ── */
  const [activeTab, setActiveTab] = useState<'wiki' | 'graph' | 'sources' | 'search' | 'stats' | 'qa' | 'schema' | 'log'>('wiki')
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchScope, setSearchScope] = useState<'all' | 'articles' | 'sources'>('all')
  const [clipUrl, setClipUrl] = useState('')
  const [clipLoading, setClipLoading] = useState(false)
  const [noteTitle, setNoteTitle] = useState('')
  const [noteContent, setNoteContent] = useState('')
  const [compileLoading, setCompileLoading] = useState(false)
  const [compileProgress, setCompileProgress] = useState<{ percent: number; compiled: number; total: number; article_count: number; error?: number } | null>(null)
  const compileTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [syncLoading, setSyncLoading] = useState(false)
  const [syncResult, setSyncResult] = useState<{ total_imported: number; skipped_duplicates: number } | null>(null)
  const [chatInput, setChatInput] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const [editMode, setEditMode] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [fileUploading, setFileUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const graphContainerRef = useRef<HTMLDivElement>(null)
  // Folder import state
  const [folderScan, setFolderScan] = useState<{ path: string; files: ScannedFile[] } | null>(null)
  const [folderSelected, setFolderSelected] = useState<Set<string>>(new Set())
  const [folderImporting, setFolderImporting] = useState(false)
  const [folderWatchCleanup, setFolderWatchCleanup] = useState<(() => void) | null>(null)
  // Local compile state (client-orchestrated, no server upload)
  interface LocalKBSource { path: string; name: string; relativePath: string; sourceType: string; size: number; hash: string; status: 'pending' | 'compiling' | 'compiled' | 'error' }
  const [localSources, setLocalSources] = useState<LocalKBSource[]>([])
  const [localCompiling, setLocalCompiling] = useState(false)
  const [localCompileProgress, setLocalCompileProgress] = useState<{ current: number; total: number } | null>(null)
  const localCompileCancelRef = useRef(false)
  const webFolderInputRef = useRef<HTMLInputElement>(null)
  const [wikiLang, setWikiLang] = useState<'en' | 'zh'>('en')
  const [schemaText, setSchemaText] = useState('')
  const [schemaSaving, setSchemaSaving] = useState(false)
  const [schemaLoaded, setSchemaLoaded] = useState(false)
  const { data: session } = useSession() as { data: { accessToken?: string } | null }
  const token = session?.accessToken ?? ''

  /* ── Data fetching ── */
  const base = CLIENT_WTT_API_BASE
  const { data: task } = useSWR(`${base}/tasks/${taskId}`, fetcher)
  const { data: tocData, mutate: mutateToc } = useSWR<TOCData>(
    `${base}/tasks/${taskId}/kb/toc`, fetcher, { refreshInterval: 10000 }
  )
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { data: _sourcesData, mutate: mutateSources } = useSWR(
    activeTab === 'sources' ? `${base}/tasks/${taskId}/kb/sources?limit=500` : null, fetcher
  )

  interface TreeSource { id: string; source_type: string; title?: string; url?: string; status: string; snippet?: string; created_at: string }
  interface TreeArticle { slug: string; title: string; category?: string; tags?: string; version: number; updated_at: string }
  interface TreeData { raw: TreeSource[]; wiki: TreeArticle[]; outputs: TreeSource[] }
  const { data: treeData, mutate: mutateTree } = useSWR<TreeData>(
    activeTab === 'sources' ? `${base}/tasks/${taskId}/kb/sources/tree` : null, fetcher
  )
  const { data: articleFull, mutate: mutateArticle } = useSWR<KBArticleFull>(
    selectedSlug ? `${base}/tasks/${taskId}/kb/articles/${selectedSlug}` : null, fetcher
  )
  const { data: searchResults } = useSWR<{ results: SearchResult[] }>(
    activeTab === 'search' && searchQuery.length >= 2
      ? `${base}/tasks/${taskId}/kb/search?q=${encodeURIComponent(searchQuery)}&scope=${searchScope}&limit=30`
      : null,
    fetcher
  )
  const { data: statsData } = useSWR<KBStats>(
    activeTab === 'stats' ? `${base}/tasks/${taskId}/kb/stats` : null, fetcher
  )
  const { data: graphData } = useSWR<{ nodes: GraphNode[]; edges: GraphEdge[] }>(
    activeTab === 'graph' ? `${base}/tasks/${taskId}/kb/graph` : null, fetcher
  )
  // Schema data
  const { data: schemaData } = useSWR<{ task_id: string; schema: string }>(
    activeTab === 'schema' ? `${base}/tasks/${taskId}/kb/schema` : null, fetcher
  )
  // Log data
  const { data: logData, mutate: mutateLog } = useSWR<{ entries: { id: string; event_type: string; summary: string; details: Record<string, unknown>; created_at: string }[]; total: number }>(
    activeTab === 'log' ? `${base}/tasks/${taskId}/kb/log?limit=100` : null, fetcher
  )
  // Chat messages — poll every 3s when on Q&A tab
  const { data: chatData, mutate: mutateChat } = useSWR<{ messages: ChatMsg[]; topic_id: string }>(
    activeTab === 'qa' ? `${base}/tasks/${taskId}/kb/messages?limit=100` : null,
    fetcher,
    { refreshInterval: 3000 }
  )

  const toc = tocData || { categories: {}, article_count: 0, index_entries: [] }
  const chatMessages: ChatMsg[] = chatData?.messages || []
  const stats: KBStats | null = statsData || null

  const refreshSources = useCallback(() => { mutateSources(); mutateTree() }, [mutateSources, mutateTree])

  // Load schema text when data arrives
  useEffect(() => {
    if (schemaData && !schemaLoaded) {
      setSchemaText(schemaData.schema || '')
      setSchemaLoaded(true)
    }
  }, [schemaData, schemaLoaded])
  // Reset loaded flag when switching away from schema tab
  useEffect(() => {
    if (activeTab !== 'schema') setSchemaLoaded(false)
  }, [activeTab])

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (activeTab === 'qa') chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages.length, activeTab])

  /* ── Actions ── */
  const sendChat = useCallback(async () => {
    const msg = chatInput.trim()
    if (!msg || chatSending) return
    setChatSending(true)
    setChatInput('')
    try {
      await fetch(`${base}/tasks/${taskId}/kb/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: msg }),
      })
      mutateChat()
    } catch (e) { console.error(e) }
    setChatSending(false)
  }, [chatInput, chatSending, base, taskId, token, mutateChat])

  const webClip = async () => {
    if (!clipUrl.trim()) return
    setClipLoading(true)
    try {
      await fetch(`${base}/tasks/${taskId}/kb/sources/clip`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: clipUrl.trim() }),
      })
      setClipUrl('')
      refreshSources()
    } catch (e) { console.error(e) }
    setClipLoading(false)
  }

  const addNote = async () => {
    if (!noteContent.trim()) return
    await fetch(`${base}/tasks/${taskId}/kb/sources`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_type: 'note', title: noteTitle || 'Untitled Note', content_markdown: noteContent }),
    })
    setNoteTitle(''); setNoteContent('')
    refreshSources()
  }

  const startProgressPolling = useCallback(() => {
    if (compileTimerRef.current) clearInterval(compileTimerRef.current)
    setCompileProgress({ percent: 0, compiled: 0, total: 0, article_count: 0 })
    compileTimerRef.current = setInterval(async () => {
      try {
        const r = await fetch(`${base}/tasks/${taskId}/kb/compile/progress`)
        if (r.ok) {
          const p = await r.json()
          setCompileProgress(p)
          // Stop polling when done (100%) or worker finished/cancelled
          if (p.percent >= 100 || (p.worker_status && p.worker_status !== 'running')) {
            if (compileTimerRef.current) clearInterval(compileTimerRef.current)
            compileTimerRef.current = null
            setCompileLoading(false)
            mutateToc()
          }
        }
      } catch {}
    }, 3000)
  }, [base, taskId, mutateToc])

  const stopProgressPolling = useCallback(() => {
    if (compileTimerRef.current) { clearInterval(compileTimerRef.current); compileTimerRef.current = null }
  }, [])

  useEffect(() => { return () => stopProgressPolling() }, [stopProgressPolling])

  // Restore compile progress if a compile is already in progress (e.g. after tab switch)
  useEffect(() => {
    let cancelled = false
    const checkOngoing = async () => {
      try {
        const r = await fetch(`${base}/tasks/${taskId}/kb/compile/progress`)
        if (r.ok && !cancelled) {
          const p = await r.json()
          // Auto-resume polling if compile is still running (either raw sources
          // remaining or background worker is active)
          if (p.total > 0 && p.percent < 100 && (p.raw > 0 || p.compiling > 0 || p.worker_status === 'running')) {
            setCompileLoading(true)
            setCompileProgress(p)
            startProgressPolling()
          }
        }
      } catch {}
    }
    checkOngoing()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId])

  const triggerCompile = async (incremental = true) => {
    setCompileLoading(true)
    try {
      const resp = await fetch(`${base}/tasks/${taskId}/kb/compile?incremental=${incremental}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!resp.ok) { alert(`Compile failed (${resp.status})`); setCompileLoading(false) }
      else { startProgressPolling(); setActiveTab('qa') }
    } catch (e) { console.error(e); setCompileLoading(false) }
    mutateChat()
  }

  const resetAndRecompile = async () => {
    if (!confirm('This will delete ALL wiki articles and recompile from sources. Continue?')) return
    // Stop background compile worker and frontend polling
    if (compileTimerRef.current) { clearInterval(compileTimerRef.current); compileTimerRef.current = null }
    try {
      await fetch(`${base}/tasks/${taskId}/kb/compile/stop`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      })
    } catch {}
    setCompileLoading(true)
    try {
      const delResp = await fetch(`${base}/tasks/${taskId}/kb/reset?reset_sources=true`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      })
      if (!delResp.ok) { alert(`Reset failed (${delResp.status})`); setCompileLoading(false); return }
      const compResp = await fetch(`${base}/tasks/${taskId}/kb/compile?incremental=false`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      })
      if (!compResp.ok) { alert(`Compile failed (${compResp.status})`); setCompileLoading(false) }
      else { startProgressPolling(); setActiveTab('qa') }
    } catch (e) { console.error(e); setCompileLoading(false) }
    mutateChat()
    mutateToc()
  }

  const triggerSync = async () => {
    setSyncLoading(true)
    setSyncResult(null)
    try {
      const resp = await fetch(`${base}/kb/sync`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (resp.ok) {
        const data = await resp.json()
        setSyncResult(data)
        refreshSources()
      }
    } catch (e) { console.error(e) }
    setSyncLoading(false)
  }

  const saveArticleEdit = async () => {
    if (!selectedSlug || !editContent.trim()) return
    setEditSaving(true)
    try {
      const field = wikiLang === 'zh' ? 'content_markdown_zh' : 'content_markdown'
      const resp = await fetch(`${base}/tasks/${taskId}/kb/articles/${selectedSlug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ [field]: editContent }),
      })
      if (resp.ok) {
        setEditMode(false)
        mutateArticle()
        mutateToc()
      } else {
        alert(`Save failed (${resp.status})`)
      }
    } catch (e) { console.error(e) }
    setEditSaving(false)
  }

  const uploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setFileUploading(true)
    let imported = 0
    let duped = 0
    for (const file of Array.from(files)) {
      try {
        const form = new FormData()
        form.append('file', file)
        const resp = await fetch(`${base}/tasks/${taskId}/kb/sources/upload`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        })
        if (resp.ok) {
          const data = await resp.json()
          if (data.deduplicated) duped++
          else imported++
        }
      } catch (e) { console.error('Upload failed:', file.name, e) }
    }
    setFileUploading(false)
    refreshSources()
    if (imported || duped) alert(`Imported ${imported} file(s)${duped ? `, ${duped} duplicate(s) skipped` : ''}`)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const importLocalFiles = async () => {
    const files = await pickLocalFiles({
      title: 'Import to Knowledge Base',
      filters: [
        { name: 'Documents', extensions: ['pdf', 'md', 'txt', 'docx', 'html', 'csv', 'json'] },
        { name: 'Code', extensions: ['py', 'js', 'ts', 'tsx', 'jsx', 'go', 'rs', 'java', 'c', 'cpp', 'rb', 'sh'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      multiple: true,
    })
    if (!files || files.length === 0) return
    setFileUploading(true)
    let imported = 0
    for (const f of files) {
      try {
        const content = await readLocalFile(f.path)
        if (!content) continue
        const resp = await fetch(`${base}/tasks/${taskId}/kb/sources`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: f.name, content_markdown: content, source_type: 'file' }),
        })
        if (resp.ok) imported++
      } catch (e) { console.error('Local import failed:', f.name, e) }
    }
    setFileUploading(false)
    refreshSources()
    if (imported) alert(`Imported ${imported} local file(s)`)
  }

  const scanFolder = async () => {
    const result = await pickAndScanFolder('Select folder to import to KB')
    if (!result) return
    setFolderScan(result)
    // Pre-select all text files
    setFolderSelected(new Set(result.files.filter(f => f.isText).map(f => f.path)))
    // Register file bridge for on-demand agent access
    const agentId = typeof window !== 'undefined' ? localStorage.getItem('wtt_selected_agent_id') || '' : ''
    if (agentId) {
      indexLocalProject(taskId, agentId, result.path, result.files, base, {
        Authorization: `Bearer ${token}`,
      }).catch(() => {})
    }
  }

  const importFolder = async (andCompile: boolean) => {
    if (!folderScan || folderSelected.size === 0) return
    setFolderImporting(true)
    try {
      const selectedFiles = folderScan.files.filter(f => folderSelected.has(f.path))
      // Read all selected text files in batch
      const textFiles = selectedFiles.filter(f => f.isText)
      const readResults = textFiles.length > 0 ? await readFilesBatch(textFiles.map(f => f.path)) : null

      // Build batch payload
      const batchFiles: Array<{ title: string; relative_path: string; content: string; source_type: string; content_hash: string; file_size: number }> = []
      if (readResults) {
        for (let i = 0; i < textFiles.length; i++) {
          const file = textFiles[i]
          const read = readResults[i]
          if (read?.ok && read.content) {
            batchFiles.push({
              title: file.name,
              relative_path: file.relativePath,
              content: read.content,
              source_type: file.extension.match(/^\.(py|js|ts|tsx|jsx|go|rs|java|c|cpp|h|hpp|rb|sh|css|scss|sql)$/) ? 'code' : 'file',
              content_hash: file.hash,
              file_size: file.size,
            })
          }
        }
      }

      // Send batch
      if (batchFiles.length > 0) {
        // Send in chunks of 50
        let totalImported = 0, totalSkipped = 0, totalUpdated = 0
        for (let i = 0; i < batchFiles.length; i += 50) {
          const chunk = batchFiles.slice(i, i + 50)
          const resp = await fetch(`${base}/tasks/${taskId}/kb/sources/batch`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ files: chunk }),
          })
          if (resp.ok) {
            const data = await resp.json()
            totalImported += data.imported || 0
            totalSkipped += data.skipped || 0
            totalUpdated += data.updated || 0
          }
        }

        refreshSources()
        const parts = [`${totalImported} imported`]
        if (totalUpdated) parts.push(`${totalUpdated} updated`)
        if (totalSkipped) parts.push(`${totalSkipped} unchanged`)
        alert(`Folder import: ${parts.join(', ')}`)
      }

      // Binary files (PDF, DOCX) — upload individually via existing endpoint
      const binaryFiles = selectedFiles.filter(f => !f.isText)
      if (binaryFiles.length > 0) {
        // Binary files need the upload endpoint which handles extraction
        alert(`${binaryFiles.length} binary file(s) (PDF/DOCX) need individual upload — use "Import Files" button`)
      }

      if (andCompile) {
        triggerCompile(true)
      }
    } catch (e: unknown) {
      console.error('Folder import failed:', e)
      alert('Folder import error: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setFolderImporting(false)
    }
  }

  const toggleFolderWatch = async () => {
    if (folderWatchCleanup) {
      folderWatchCleanup()
      setFolderWatchCleanup(null)
      return
    }
    if (!folderScan) return
    const cleanup = await watchLocalFolder(folderScan.path, async (event) => {
      if (!event.exists) return
      // Auto-sync changed file
      const file = folderScan.files.find(f => f.relativePath === event.filename)
      if (!file || !folderSelected.has(file.path)) return
      try {
        const results = await readFilesBatch([event.fullPath])
        if (results && results[0]?.ok && results[0].content) {
          await fetch(`${base}/tasks/${taskId}/kb/sources/batch`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ files: [{
              title: file.name,
              relative_path: file.relativePath,
              content: results[0].content,
              source_type: 'file',
              content_hash: event.hash || '',
              file_size: results[0].size || 0,
            }] }),
          })
          refreshSources()
        }
      } catch (e) { console.error('Watch sync error:', e) }
    })
    setFolderWatchCleanup(() => cleanup)
  }

  // ── Local Compile (client-orchestrated, no server upload) ──

  /** Build local source list from folder scan without uploading */
  const buildLocalSources = () => {
    if (!folderScan || folderSelected.size === 0) return
    const sources: LocalKBSource[] = folderScan.files
      .filter(f => folderSelected.has(f.path) && f.isText)
      .map(f => ({
        path: f.path,
        name: f.name,
        relativePath: f.relativePath,
        sourceType: f.extension.match(/^\.(py|js|ts|tsx|jsx|go|rs|java|c|cpp|h|hpp|rb|sh|css|scss|sql)$/) ? 'code' : 'file',
        size: f.size,
        hash: f.hash,
        status: 'pending' as const,
      }))
    setLocalSources(sources)
    return sources
  }

  /** Wait for a new article to appear in kb_articles after a compile message */
  /** Parse ---ARTICLE_START--- format from agent text response */
  const parseTextArticle = (text: string): { title: string; slug: string; content: string } | null => {
    const m = text.match(/---ARTICLE_START---\s*\n\s*TITLE:\s*(.+)\n\s*SLUG:\s*(.+)\n\s*---\n([\s\S]*?)---ARTICLE_END---/)
    if (!m) return null
    return { title: m[1].trim(), slug: m[2].trim(), content: m[3].trim() }
  }

  /** Save a text-based article directly via REST API */
  const saveArticleDirect = async (title: string, slug: string, content: string, sourceId: string): Promise<boolean> => {
    try {
      const resp = await fetch(`${base}/tasks/${taskId}/kb/articles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          slug, title, content_markdown: content,
          content_markdown_zh: content, source_ids: sourceId,
          summary: content.slice(0, 200), category: 'local',
        }),
      })
      return resp.ok
    } catch { return false }
  }

  const waitForArticle = async (startTime: number, timeoutMs: number, sourceId?: string): Promise<boolean> => {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (localCompileCancelRef.current) return false
      await new Promise(r => setTimeout(r, 5000))
      try {
        // Check if article was created via MCP tool
        const r = await fetch(`${base}/tasks/${taskId}/kb/toc`, { headers: { Authorization: `Bearer ${token}` } })
        if (r.ok) {
          const data = await r.json()
          const articles = data.articles || data.toc || []
          const recent = articles.find((a: { created_at?: string; updated_at?: string }) => {
            const t = new Date(a.updated_at || a.created_at || 0).getTime()
            return t > startTime - 3000
          })
          if (recent) return true
        }

        // Fallback: check chat messages for text-based article output
        const chatResp = await fetch(`${base}/tasks/${taskId}/kb/messages?limit=5`, { headers: { Authorization: `Bearer ${token}` } })
        if (chatResp.ok) {
          const msgs = await chatResp.json()
          const agentMsgs = (msgs.messages || msgs || []).filter(
            (m: { sender_type?: string; created_at?: string }) =>
              m.sender_type?.toUpperCase() === 'AGENT' &&
              new Date(m.created_at || 0).getTime() > startTime - 3000
          )
          for (const msg of agentMsgs) {
            const parsed = parseTextArticle(msg.content || '')
            if (parsed) {
              const saved = await saveArticleDirect(parsed.title, parsed.slug, parsed.content, sourceId || '')
              if (saved) return true
            }
          }
        }
      } catch { /* retry */ }
    }
    return false
  }

  /** Client-orchestrated compile: read files locally, send content in topic messages */
  const compileLocal = async (sources?: LocalKBSource[]) => {
    const srcs = sources || localSources
    if (srcs.length === 0 || !task?.topic_id) return
    setLocalCompiling(true)
    localCompileCancelRef.current = false
    setLocalCompileProgress({ current: 0, total: srcs.length })
    setActiveTab('qa')

    for (let i = 0; i < srcs.length; i++) {
      if (localCompileCancelRef.current) break
      const src = srcs[i]
      setLocalCompileProgress({ current: i + 1, total: srcs.length })
      setLocalSources(prev => prev.map(s => s.path === src.path ? { ...s, status: 'compiling' } : s))

      // Try to read file content locally as fallback (only used if MCP bridge unavailable)
      let fallbackContent = ''
      if (isDesktop()) {
        const content = await readLocalFile(src.path)
        if (content) {
          const maxLen = 30000
          fallbackContent = content.length > maxLen ? content.slice(0, maxLen) + '\n... (truncated)' : content
        }
      }

      // Build compile prompt with file reference (agent reads via MCP)
      const prompt = [
        `[AUTOMATED KB COMPILE — DO NOT GREET, JUST EXECUTE]`,
        ``,
        `You are a wiki compiler. Read the source file and write a comprehensive wiki article.`,
        ``,
        `STEP 1: Read the source file using MCP tool:`,
        `  wtt_local_read(task_id="${taskId}", file_path="${src.relativePath}")`,
        ``,
        `STEP 2: After reading, save the article using MCP tool:`,
        `  wtt_kb_write(task_id="${taskId}", slug="<url-friendly-slug>", title="<article title>", content_markdown="<full article in markdown>", source_ids="${src.relativePath}")`,
        ``,
        `If wtt_local_read is not available (no Desktop file bridge), use the content provided below.`,
        `If wtt_kb_write is not available, output in this format:`,
        `---ARTICLE_START---`,
        `TITLE: <article title>`,
        `SLUG: <url-friendly-slug>`,
        `---`,
        `<full article content in markdown>`,
        `---ARTICLE_END---`,
        ``,
        `Requirements:`,
        `- Write in Chinese, keep technical terms in English`,
        `- Minimum 2000 characters per article`,
        `- Include code examples if the source contains code`,
        `- Organize with clear headings (## / ###)`,
        ``,
        `Source: "${src.name}" (type: ${src.sourceType}, path: ${src.relativePath})`,
      ].join('\n')

      const fullPrompt = fallbackContent
        ? prompt + `\n\n---\nFallback content (use wtt_local_read instead if available):\n${fallbackContent}`
        : prompt

      const beforeSend = Date.now()
      try {
        const resp = await fetch(`${base}/tasks/${taskId}/kb/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ content: fullPrompt }),
        })
        if (!resp.ok) {
          console.error('[KB] compile chat/send failed:', resp.status)
          setLocalSources(prev => prev.map(s => s.path === src.path ? { ...s, status: 'error' } : s))
          continue
        }
      } catch (e) {
        console.error('Failed to send compile message:', e)
        setLocalSources(prev => prev.map(s => s.path === src.path ? { ...s, status: 'error' } : s))
        continue
      }

      // Wait for article creation (up to 2 minutes per source)
      const created = await waitForArticle(beforeSend, 120_000, src.relativePath)
      setLocalSources(prev => prev.map(s =>
        s.path === src.path ? { ...s, status: created ? 'compiled' : 'error' } : s
      ))
      if (created) mutateToc()
    }

    setLocalCompiling(false)
    mutateToc()
    mutateChat()
  }

  const cancelLocalCompile = () => { localCompileCancelRef.current = true }

  /** Folder scan + direct compile (no server upload) */
  const scanAndCompileLocal = async () => {
    if (!folderScan || folderSelected.size === 0) return
    const sources = buildLocalSources()
    if (sources && sources.length > 0) {
      compileLocal(sources)
    }
  }

  /** Web browser: scan folder via <input webkitdirectory> */
  const handleWebFolderScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files
    if (!fileList || fileList.length === 0) return
    const textExts = /\.(md|mdx|txt|rst|org|py|js|ts|tsx|jsx|go|rs|java|c|cpp|h|hpp|rb|sh|css|scss|sql|json|yaml|yml|toml|xml|csv|html|htm)$/i
    const files = Array.from(fileList).filter(f => textExts.test(f.name) && f.size > 0 && f.size < 5 * 1024 * 1024)
    if (files.length === 0) { alert('No supported text files found in folder.'); return }

    // Build local sources directly from web File objects (no server upload)
    const sources: LocalKBSource[] = []
    const webFileContents: Record<string, string> = {}
    for (const file of files.slice(0, 100)) {
      try {
        const content = await file.text()
        const relativePath = file.webkitRelativePath || file.name
        webFileContents[relativePath] = content
        sources.push({
          path: relativePath,
          name: file.name,
          relativePath,
          sourceType: file.name.match(/\.(py|js|ts|tsx|jsx|go|rs|java|c|cpp|h|hpp|rb|sh|css|scss|sql)$/) ? 'code' : 'file',
          size: file.size,
          hash: '',
          status: 'pending',
        })
      } catch { /* skip binary */ }
    }
    setLocalSources(sources)
    // Store content in a ref-like closure for compileLocalWeb
    if (sources.length > 0) {
      compileLocalWeb(sources, webFileContents)
    }
    if (e.target) e.target.value = ''
  }

  /** Web compile: files already read into memory, send inline */
  const compileLocalWeb = async (srcs: LocalKBSource[], contents: Record<string, string>) => {
    if (srcs.length === 0 || !task?.topic_id) return
    setLocalCompiling(true)
    localCompileCancelRef.current = false
    setLocalCompileProgress({ current: 0, total: srcs.length })
    setActiveTab('qa')

    for (let i = 0; i < srcs.length; i++) {
      if (localCompileCancelRef.current) break
      const src = srcs[i]
      setLocalCompileProgress({ current: i + 1, total: srcs.length })
      setLocalSources(prev => prev.map(s => s.path === src.path ? { ...s, status: 'compiling' } : s))

      const content = contents[src.relativePath]
      if (!content) {
        setLocalSources(prev => prev.map(s => s.path === src.path ? { ...s, status: 'error' } : s))
        continue
      }

      const maxLen = 60000
      const truncated = content.length > maxLen ? content.slice(0, maxLen) + '\n... (truncated)' : content
      const prompt = [
        `[AUTOMATED KB COMPILE — DO NOT GREET, JUST EXECUTE]`,
        ``,
        `You are a wiki compiler. Read the source content below and write a comprehensive wiki article.`,
        ``,
        `IMPORTANT: You MUST save the article using the wtt_kb_write MCP tool:`,
        `  wtt_kb_write(task_id="${taskId}", slug="<url-friendly-slug>", title="<article title>", content_markdown="<full article in markdown>", source_ids="${src.relativePath}")`,
        ``,
        `If the MCP tool is not available, output the article in this exact format:`,
        `---ARTICLE_START---`,
        `TITLE: <article title>`,
        `SLUG: <url-friendly-slug>`,
        `---`,
        `<full article content in markdown>`,
        `---ARTICLE_END---`,
        ``,
        `Requirements:`,
        `- Write in Chinese, keep technical terms in English`,
        `- Minimum 2000 characters per article`,
        `- Include code examples if the source contains code`,
        `- Organize with clear headings (## / ###)`,
        ``,
        `Source: "${src.name}" (type: ${src.sourceType}, path: ${src.relativePath})`,
        `---`,
        truncated,
      ].join('\n')

      const beforeSend = Date.now()
      try {
        const resp = await fetch(`${base}/tasks/${taskId}/kb/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ content: prompt }),
        })
        if (!resp.ok) {
          console.error('[KB] compile chat/send failed:', resp.status)
          setLocalSources(prev => prev.map(s => s.path === src.path ? { ...s, status: 'error' } : s))
          continue
        }
      } catch {
        setLocalSources(prev => prev.map(s => s.path === src.path ? { ...s, status: 'error' } : s))
        continue
      }

      const created = await waitForArticle(beforeSend, 120_000, src.relativePath)
      setLocalSources(prev => prev.map(s =>
        s.path === src.path ? { ...s, status: created ? 'compiled' : 'error' } : s
      ))
      if (created) mutateToc()
    }

    setLocalCompiling(false)
    mutateToc()
    mutateChat()
  }

  // Category colors for graph
  const CATEGORY_COLORS: Record<string, string> = {
    technology: '#6366f1', research: '#8b5cf6', engineering: '#3b82f6',
    business: '#10b981', culture: '#f59e0b', health: '#ef4444',
    geography: '#14b8a6', uncategorized: '#6b7280',
  }

  /* ── Render helpers ── */
  const tabCls = (tab: string) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
      activeTab === tab
        ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
    }`

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-zinc-950">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <button onClick={() => router.push('/tasks')} className="text-slate-400 hover:text-slate-600 dark:text-zinc-500">
          ← Tasks
        </button>
        <h1 className="text-lg font-semibold text-slate-800 dark:text-zinc-100 truncate">
          📚 {task?.title || 'Knowledge Root'}
        </h1>
        {syncResult && (
          <span className="text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded">
            +{syncResult.total_imported} imported, {syncResult.skipped_duplicates} skipped
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={triggerSync}
            disabled={syncLoading}
            className="text-xs px-3 py-1.5 rounded bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 font-medium"
          >
            {syncLoading ? '⏳ Syncing...' : '🔄 Sync Tasks'}
          </button>
          <button
            onClick={() => triggerCompile(true)}
            disabled={compileLoading}
            className="text-xs px-3 py-1.5 rounded bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-50"
          >
            {compileLoading ? '⏳ Compiling...' : '🧠 Compile'}
          </button>
          {compileLoading && (
            <button
              onClick={() => { setCompileLoading(false); if (compileTimerRef.current) { clearInterval(compileTimerRef.current); compileTimerRef.current = null } }}
              className="text-xs px-3 py-1.5 rounded bg-red-500 text-white hover:bg-red-600"
            >
              ✕ Stop
            </button>
          )}
          <ThemeToggle />
        </div>
      </div>

      {/* Compile progress bar */}
      {compileLoading && compileProgress && (
        <div className="px-4 py-2 bg-indigo-50 dark:bg-indigo-950/30 border-b border-indigo-200 dark:border-indigo-800">
          <div className="flex items-center gap-3">
            <div className="flex-1 h-3 bg-indigo-100 dark:bg-indigo-900 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                style={{ width: `${compileProgress.percent}%` }}
              />
            </div>
            <span className="text-xs font-mono text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
              {compileProgress.percent}% — {compileProgress.compiled}/{compileProgress.total} sources → {compileProgress.article_count} articles
              {(compileProgress.error ?? 0) > 0 && <span className="text-red-500 ml-1">({compileProgress.error} errors)</span>}
            </span>
          </div>
        </div>
      )}
      {localCompiling && localCompileProgress && (
        <div className="px-4 py-2 bg-emerald-50 dark:bg-emerald-950/30 border-b border-emerald-200 dark:border-emerald-800">
          <div className="flex items-center gap-3">
            <div className="flex-1 h-3 bg-emerald-100 dark:bg-emerald-900 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.round((localCompileProgress.current / localCompileProgress.total) * 100)}%` }}
              />
            </div>
            <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
              💻 Local: {localCompileProgress.current}/{localCompileProgress.total} sources
              ({localSources.filter(s => s.status === 'compiled').length} done, {localSources.filter(s => s.status === 'error').length} errors)
            </span>
            <button onClick={cancelLocalCompile} className="text-xs text-red-500 hover:text-red-600">⏹ Stop</button>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 px-4 py-2 border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-x-auto">
        {(['wiki', 'graph', 'sources', 'search', 'stats', 'qa', 'schema', 'log'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={tabCls(tab)}>
            {tab === 'wiki' ? '📖 Wiki' : tab === 'graph' ? '🕸️ Graph' : tab === 'sources' ? '📥 Sources' : tab === 'search' ? '🔍 Search' : tab === 'stats' ? '📊 Stats' : tab === 'qa' ? '❓ Q&A' : tab === 'schema' ? '📐 Schema' : '📋 Log'}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-400 dark:text-zinc-500 self-center whitespace-nowrap">
          {toc.article_count} articles
        </span>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden flex">

        {/* ═══ Wiki Tab ═══ */}
        {activeTab === 'wiki' && (
          <>
            {/* Left: TOC tree */}
            <div className="w-64 border-r border-slate-200 dark:border-zinc-800 overflow-y-auto bg-white dark:bg-zinc-900 p-3">
              <h3 className="text-xs font-bold uppercase text-slate-400 dark:text-zinc-500 mb-2">Table of Contents</h3>
              {Object.entries(toc.categories).length === 0 && (
                <p className="text-xs text-slate-400 dark:text-zinc-600 italic">No articles yet. Ingest sources and compile.</p>
              )}
              {Object.entries(toc.categories).map(([cat, articles]) => (
                <div key={cat} className="mb-3">
                  <div className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase mb-1">
                    {cat}
                  </div>
                  {articles.map(a => (
                    <button
                      key={a.slug}
                      onClick={() => setSelectedSlug(a.slug)}
                      className={`w-full text-left text-sm px-2 py-1 rounded truncate ${
                        selectedSlug === a.slug
                          ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                          : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800'
                      }`}
                    >
                      {a.title}
                      {a.version > 1 && <span className="ml-1 text-[10px] text-slate-400">v{a.version}</span>}
                    </button>
                  ))}
                </div>
              ))}
            </div>

            {/* Center: Article reader */}
            <div className="flex-1 overflow-y-auto p-6">
              {!selectedSlug && (
                <div className="text-center text-slate-400 dark:text-zinc-600 mt-20">
                  <div className="text-4xl mb-2">📚</div>
                  <p>Select an article from the sidebar</p>
                  <p className="text-sm mt-1">or ingest sources and compile the wiki</p>
                  {/* Auto-navigate to overview if it exists */}
                  {Object.values(toc.categories).flat().some(a => a.slug === 'overview') && (
                    <button
                      onClick={() => setSelectedSlug('overview')}
                      className="mt-4 px-4 py-2 text-sm bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 rounded-lg hover:bg-indigo-200"
                    >
                      📖 Open Overview
                    </button>
                  )}
                </div>
              )}
              {selectedSlug && articleFull && (
                <article className="max-w-3xl mx-auto">
                  <div className="flex items-center gap-2 mb-4">
                    <h1 className="text-2xl font-bold text-slate-800 dark:text-zinc-100">{articleFull.title}</h1>
                    <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400">
                      v{articleFull.version}
                    </span>
                    <button
                      onClick={() => setWikiLang(wikiLang === 'en' ? 'zh' : 'en')}
                      className={`text-xs px-2 py-1 rounded font-medium transition-colors ${
                        wikiLang === 'zh'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                          : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                      }`}
                      title="Switch language / 切换语言"
                    >
                      {wikiLang === 'en' ? '🌐 EN' : '🌐 中文'}
                    </button>
                    <button
                      onClick={() => { if (editMode) { setEditMode(false) } else { setEditContent(wikiLang === 'zh' && articleFull.content_markdown_zh ? articleFull.content_markdown_zh : articleFull.content_markdown); setEditMode(true) } }}
                      className="ml-auto text-xs px-3 py-1 rounded border border-slate-300 dark:border-zinc-600 text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800"
                    >
                      {editMode ? '✕ Cancel' : '✏️ Edit'}
                    </button>
                    {editMode && (
                      <button
                        onClick={saveArticleEdit}
                        disabled={editSaving}
                        className="text-xs px-3 py-1 rounded bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-50"
                      >
                        {editSaving ? '⏳' : '💾 Save'}
                      </button>
                    )}
                  </div>
                  {articleFull.summary && (
                    <p className="text-sm text-slate-500 dark:text-zinc-400 italic mb-4 border-l-2 border-indigo-300 pl-3">
                      {articleFull.summary}
                    </p>
                  )}
                  {articleFull.tags && (
                    <div className="flex gap-1 mb-4 flex-wrap">
                      {articleFull.tags.split(',').filter(Boolean).map(t => (
                        <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300">
                          {t.trim()}
                        </span>
                      ))}
                    </div>
                  )}
                  {editMode ? (
                    <textarea
                      value={editContent}
                      onChange={e => setEditContent(e.target.value)}
                      className="w-full h-[60vh] px-4 py-3 text-sm font-mono border rounded-lg dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-200 focus:ring-2 focus:ring-indigo-300 focus:outline-none resize-y"
                      placeholder="Edit article markdown..."
                    />
                  ) : (
                  <>
                  {wikiLang === 'zh' && !articleFull.content_markdown_zh && (
                    <div className="mb-4 px-3 py-2 rounded bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 text-sm">
                      ⚠️ 中文版本暂未生成。请重新编译 (Compile) 以生成双语内容。当前显示英文版。
                    </div>
                  )}
                  <div className="prose prose-slate dark:prose-invert prose-headings:scroll-mt-4 prose-h2:text-xl prose-h2:border-b prose-h2:border-slate-200 prose-h2:dark:border-zinc-700 prose-h2:pb-2 prose-h2:mt-8 prose-h3:text-lg prose-img:rounded-lg prose-img:shadow-md prose-table:text-sm prose-a:text-indigo-600 dark:prose-a:text-indigo-400 max-w-none">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkMath]}
                      rehypePlugins={[rehypeKatex, rehypeRaw]}
                      components={{
                        code({ className, children, ...props }) {
                          const match = /language-(\w+)/.exec(className || '')
                          const codeStr = String(children).replace(/\n$/, '')
                          if (match && match[1] === 'mermaid') {
                            return <MermaidDiagram chart={codeStr} />
                          }
                          if (match) {
                            return (
                              <div className="relative group">
                                <button
                                  onClick={() => { navigator.clipboard.writeText(codeStr) }}
                                  className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 text-[10px] rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600 z-10"
                                >Copy</button>
                                <SyntaxHighlighter style={oneDark} language={match[1]} PreTag="div"
                                  customStyle={{ borderRadius: '0.5rem', fontSize: '0.85rem' }}>
                                  {codeStr}
                                </SyntaxHighlighter>
                              </div>
                            )
                          }
                          return <code className="bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-sm font-mono text-indigo-700 dark:text-indigo-300" {...props}>{children}</code>
                        },
                        h1({ children, ...props }) {
                          const id = String(children).toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-')
                          return <h1 id={id} {...props}>{children}</h1>
                        },
                        h2({ children, ...props }) {
                          const id = String(children).toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-')
                          return <h2 id={id} className="group" {...props}><a href={`#${id}`} className="no-underline hover:underline">{children}</a></h2>
                        },
                        h3({ children, ...props }) {
                          const id = String(children).toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-')
                          return <h3 id={id} className="group" {...props}><a href={`#${id}`} className="no-underline hover:underline">{children}</a></h3>
                        },
                        // Convert [[slug]] wiki links to clickable buttons
                        p({ children, ...props }) {
                          if (typeof children === 'string' && children.includes('[[')) {
                            const parts = children.split(/(\[\[[\w-]+\]\])/)
                            return (
                              <p {...props}>
                                {parts.map((part, i) => {
                                  const m = part.match(/^\[\[([\w-]+)\]\]$/)
                                  if (m) return <button key={i} onClick={() => setSelectedSlug(m[1])} className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium">{m[1]}</button>
                                  return <span key={i}>{part}</span>
                                })}
                              </p>
                            )
                          }
                          return <p {...props}>{children}</p>
                        },
                        blockquote({ children, ...props }) {
                          return <blockquote className="border-l-4 border-indigo-300 dark:border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/20 pl-4 py-2 my-4 italic" {...props}>{children}</blockquote>
                        },
                        table({ children, ...props }) {
                          return <div className="overflow-x-auto my-4"><table className="min-w-full border-collapse border border-slate-300 dark:border-zinc-600" {...props}>{children}</table></div>
                        },
                        th({ children, ...props }) {
                          return <th className="border border-slate-300 dark:border-zinc-600 bg-slate-100 dark:bg-zinc-800 px-3 py-2 text-left text-sm font-semibold" {...props}>{children}</th>
                        },
                        td({ children, ...props }) {
                          return <td className="border border-slate-300 dark:border-zinc-600 px-3 py-2 text-sm" {...props}>{children}</td>
                        },
                        img({ src, alt, ...props }) {
                          return <figure className="my-4"><img src={src} alt={alt || ''} className="rounded-lg shadow-md max-w-full" {...props} />{alt && <figcaption className="text-center text-xs text-slate-400 mt-2">{alt}</figcaption>}</figure>
                        },
                        hr() {
                          return <hr className="my-8 border-slate-300 dark:border-zinc-600" />
                        },
                      }}
                    >
                      {sanitizeArticleMarkdown((wikiLang === 'zh' && articleFull.content_markdown_zh) ? articleFull.content_markdown_zh : articleFull.content_markdown)}
                    </ReactMarkdown>
                  </div>
                  </>
                  )}
                  {/* Backlinks */}
                  {articleFull.backlinks && (
                    <div className="mt-8 pt-4 border-t border-slate-200 dark:border-zinc-700">
                      <h3 className="text-sm font-semibold text-slate-500 dark:text-zinc-400 mb-2">🔗 Backlinks</h3>
                      <div className="flex flex-wrap gap-2">
                        {articleFull.backlinks.split(',').filter(Boolean).map(bl => (
                          <button
                            key={bl}
                            onClick={() => setSelectedSlug(bl.trim())}
                            className="text-xs px-2 py-1 rounded bg-slate-100 dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 hover:underline"
                          >
                            {bl.trim()}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="mt-4 text-xs text-slate-400 dark:text-zinc-600">
                    {articleFull.category && <span>Category: {articleFull.category} · </span>}
                    {articleFull.compiled_by && <span>Compiled by: {articleFull.compiled_by} · </span>}
                    Updated: {new Date(articleFull.updated_at).toLocaleString()}
                  </div>
                </article>
              )}
              {selectedSlug && !articleFull && (
                <div className="text-center text-slate-400 dark:text-zinc-600 mt-20">Loading...</div>
              )}
            </div>
          </>
        )}

        {/* ═══ Knowledge Graph Tab ═══ */}
        {activeTab === 'graph' && (
          <div className="flex-1 overflow-hidden relative" ref={graphContainerRef}>
            {(!graphData || graphData.nodes.length === 0) ? (
              <div className="flex items-center justify-center h-full text-slate-400 dark:text-zinc-600">
                <div className="text-center">
                  <div className="text-4xl mb-3">🕸️</div>
                  <p className="font-medium">Knowledge Graph</p>
                  <p className="text-sm mt-1">Compile wiki articles to see the knowledge graph</p>
                </div>
              </div>
            ) : (
              <>
                {/* Legend */}
                <div className="absolute top-3 left-3 z-10 bg-white/90 dark:bg-zinc-900/90 backdrop-blur rounded-lg p-3 shadow-lg border border-slate-200 dark:border-zinc-700">
                  <div className="text-xs font-semibold text-slate-600 dark:text-zinc-400 mb-2">Categories</div>
                  <div className="space-y-1">
                    {Array.from(new Set(graphData.nodes.map(n => n.category))).sort().map(cat => (
                      <div key={cat} className="flex items-center gap-2 text-xs text-slate-500 dark:text-zinc-400">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[cat] || '#6b7280' }} />
                        {cat}
                      </div>
                    ))}
                  </div>
                  <div className="text-[10px] text-slate-400 dark:text-zinc-600 mt-2 border-t pt-1">
                    {graphData.nodes.length} nodes · {graphData.edges.length} links
                  </div>
                </div>
                <ForceGraph2D
                  graphData={{ nodes: graphData.nodes.map(n => ({ ...n })), links: graphData.edges.map(e => ({ ...e })) }}
                  width={graphContainerRef.current?.clientWidth || 800}
                  height={graphContainerRef.current?.clientHeight || 600}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  nodeLabel={(node: any) => `${node.title} (${node.category})`}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  nodeColor={(node: any) => CATEGORY_COLORS[node.category] || '#6b7280'}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  nodeVal={(node: any) => Math.max(3, (node.connections || 0) + 2)}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
                    const size = Math.max(4, (node.connections || 0) + 3)
                    const color = CATEGORY_COLORS[node.category] || '#6b7280'
                    ctx.beginPath()
                    ctx.arc(node.x, node.y, size, 0, 2 * Math.PI)
                    ctx.fillStyle = color
                    ctx.fill()
                    ctx.strokeStyle = 'rgba(255,255,255,0.3)'
                    ctx.lineWidth = 0.5
                    ctx.stroke()
                    if (globalScale > 1.2) {
                      const label = node.title.length > 30 ? node.title.slice(0, 28) + '…' : node.title
                      ctx.font = `${Math.min(12, 11 / globalScale)}px Inter, system-ui, sans-serif`
                      ctx.textAlign = 'center'
                      ctx.textBaseline = 'top'
                      ctx.fillStyle = 'rgba(100,116,139,0.9)'
                      ctx.fillText(label, node.x, node.y + size + 2)
                    }
                  }}
                  linkColor={() => 'rgba(99,102,241,0.25)'}
                  linkWidth={1.5}
                  linkDirectionalParticles={1}
                  linkDirectionalParticleWidth={2}
                  linkDirectionalParticleColor={() => 'rgba(99,102,241,0.6)'}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  onNodeClick={(node: any) => { setSelectedSlug(node.id); setActiveTab('wiki') }}
                  backgroundColor="transparent"
                  cooldownTicks={100}
                  d3AlphaDecay={0.02}
                  d3VelocityDecay={0.3}
                />
              </>
            )}
          </div>
        )}

        {/* ═══ Sources Tab ═══ */}
        {activeTab === 'sources' && (
          <div className="flex-1 overflow-y-auto p-4">
            {/* Ingest toolbar */}
            <div className="max-w-3xl mx-auto space-y-4 mb-6">
              {/* Web clip */}
              <div className="flex gap-2">
                <input
                  value={clipUrl} onChange={e => setClipUrl(e.target.value)}
                  placeholder="Paste URL to clip..."
                  className="flex-1 px-3 py-2 text-sm border rounded-lg dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-200"
                  onKeyDown={e => e.key === 'Enter' && webClip()}
                />
                <button
                  onClick={webClip} disabled={clipLoading || !clipUrl.trim()}
                  className="px-4 py-2 text-sm rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-50"
                >
                  {clipLoading ? '⏳' : '📎 Clip'}
                </button>
              </div>
              {/* File import */}
              <div className="flex gap-2 items-center flex-wrap">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.md,.txt,.csv,.json,.py,.js,.ts,.tsx,.jsx,.html,.xml,.yaml,.yml,.toml,.rst,.docx,.c,.cpp,.go,.rs,.rb,.sh,.java"
                  onChange={e => uploadFiles(e.target.files)}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={fileUploading}
                  className="px-4 py-2 text-sm rounded-lg bg-violet-500 text-white hover:bg-violet-600 disabled:opacity-50"
                >
                  {fileUploading ? '⏳ Uploading...' : '📁 Import Files'}
                </button>
                {isDesktop() ? (
                  <>
                    <button
                      onClick={importLocalFiles}
                      disabled={fileUploading}
                      className="px-4 py-2 text-sm rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50"
                    >
                      💻 Browse Local
                    </button>
                    <button
                      onClick={scanFolder}
                      disabled={folderImporting || localCompiling}
                      className="px-4 py-2 text-sm rounded-lg bg-cyan-500 text-white hover:bg-cyan-600 disabled:opacity-50"
                    >
                      📂 Import Folder
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => webFolderInputRef.current?.click()}
                    disabled={localCompiling}
                    className="px-4 py-2 text-sm rounded-lg bg-cyan-500 text-white hover:bg-cyan-600 disabled:opacity-50"
                  >
                    📂 Local Folder
                  </button>
                )}
                <input ref={webFolderInputRef} type="file" className="hidden" onChange={handleWebFolderScan} {...{ webkitdirectory: '', directory: '' } as Record<string, string>} />
                <span className="text-xs text-slate-400 dark:text-zinc-500">
                  PDF, Markdown, TXT, Code, DOCX, CSV, JSON — up to 10MB each
                </span>
              </div>
              {/* Folder scan results (desktop only) */}
              {folderScan && (
                <div className="border rounded-lg dark:border-zinc-700 p-3 bg-zinc-50 dark:bg-zinc-900">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium dark:text-zinc-300">
                      📁 {folderScan.path}
                    </span>
                    <button onClick={() => { setFolderScan(null); setFolderSelected(new Set()); if (folderWatchCleanup) { folderWatchCleanup(); setFolderWatchCleanup(null) } }}
                      className="text-xs text-red-400 hover:text-red-500">✕ Close</button>
                  </div>
                  <div className="max-h-64 overflow-y-auto space-y-0.5 mb-3">
                    {folderScan.files.map(f => (
                      <label key={f.path} className="flex items-center gap-2 text-xs py-0.5 px-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={folderSelected.has(f.path)}
                          onChange={() => {
                            const next = new Set(folderSelected)
                            if (next.has(f.path)) next.delete(f.path); else next.add(f.path)
                            setFolderSelected(next)
                          }}
                          className="rounded"
                        />
                        <span className={`flex-1 truncate ${f.isText ? 'dark:text-zinc-300' : 'text-amber-500 dark:text-amber-400'}`}>
                          {f.relativePath}
                        </span>
                        <span className="text-zinc-400 whitespace-nowrap">
                          {f.size < 1024 ? `${f.size} B` : f.size < 1024 * 1024 ? `${(f.size / 1024).toFixed(1)} KB` : `${(f.size / 1024 / 1024).toFixed(1)} MB`}
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {folderSelected.size} of {folderScan.files.length} files selected
                      ({(folderScan.files.filter(f => folderSelected.has(f.path)).reduce((s, f) => s + f.size, 0) / 1024).toFixed(1)} KB)
                    </span>
                    <button
                      onClick={() => setFolderSelected(new Set(folderScan.files.map(f => f.path)))}
                      className="text-xs text-indigo-500 hover:underline">Select All</button>
                    <button
                      onClick={() => setFolderSelected(new Set())}
                      className="text-xs text-zinc-400 hover:underline">Select None</button>
                    <div className="flex-1" />
                    <button
                      onClick={() => importFolder(false)}
                      disabled={folderImporting || folderSelected.size === 0}
                      className="px-3 py-1.5 text-xs rounded bg-cyan-500 text-white hover:bg-cyan-600 disabled:opacity-50"
                    >
                      {folderImporting ? '⏳ Importing...' : '📥 Import Selected'}
                    </button>
                    <button
                      onClick={() => importFolder(true)}
                      disabled={folderImporting || folderSelected.size === 0}
                      className="px-3 py-1.5 text-xs rounded bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-50"
                    >
                      🚀 Import & Compile
                    </button>
                    <button
                      onClick={scanAndCompileLocal}
                      disabled={localCompiling || folderSelected.size === 0}
                      className="px-3 py-1.5 text-xs rounded bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50"
                      title="Compile directly — files stay local, only articles saved to server"
                    >
                      {localCompiling ? '⏳ Compiling...' : '💻 Compile Local'}
                    </button>
                    <button
                      onClick={toggleFolderWatch}
                      className={`px-3 py-1.5 text-xs rounded ${folderWatchCleanup ? 'bg-amber-500 hover:bg-amber-600' : 'bg-zinc-500 hover:bg-zinc-600'} text-white`}
                    >
                      {folderWatchCleanup ? '👁 Watching...' : '👁 Watch'}
                    </button>
                  </div>
                </div>
              )}
              {/* Quick note */}
              <details className="border rounded-lg dark:border-zinc-700 p-3">
                <summary className="text-sm font-medium text-slate-600 dark:text-zinc-400 cursor-pointer">📝 Add Note</summary>
                <div className="mt-2 space-y-2">
                  <input
                    value={noteTitle} onChange={e => setNoteTitle(e.target.value)}
                    placeholder="Note title..."
                    className="w-full px-3 py-1.5 text-sm border rounded dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-200"
                  />
                  <textarea
                    value={noteContent} onChange={e => setNoteContent(e.target.value)}
                    placeholder="Note content (markdown)..."
                    rows={4}
                    className="w-full px-3 py-1.5 text-sm border rounded dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-200"
                  />
                  <button
                    onClick={addNote} disabled={!noteContent.trim()}
                    className="px-3 py-1.5 text-sm rounded bg-green-500 text-white hover:bg-green-600 disabled:opacity-50"
                  >
                    💾 Save Note
                  </button>
                </div>
              </details>
            </div>

            {/* Three-section source tree */}
            <div className="max-w-3xl mx-auto space-y-6">

              {/* ── 💻 Local Sources (not uploaded) ── */}
              {localSources.length > 0 && (
                <details open className="border rounded-lg dark:border-zinc-700 overflow-hidden">
                  <summary className="flex items-center gap-2 px-4 py-3 bg-emerald-50 dark:bg-emerald-950/20 cursor-pointer select-none">
                    <span className="text-lg">💻</span>
                    <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Local Sources (not uploaded)</span>
                    <span className="ml-auto text-xs text-emerald-500 dark:text-emerald-400">
                      {localSources.filter(s => s.status === 'compiled').length}/{localSources.length} compiled
                    </span>
                  </summary>
                  <div className="p-3 space-y-1">
                    {localSources.map(s => (
                      <div key={s.path} className="flex items-center gap-2 px-2 py-1 rounded text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800">
                        <span>{s.status === 'compiled' ? '✅' : s.status === 'compiling' ? '🔄' : s.status === 'error' ? '❌' : '⏳'}</span>
                        <span className="flex-1 truncate text-slate-600 dark:text-zinc-400">{s.relativePath}</span>
                        <span className="text-zinc-400 whitespace-nowrap">
                          {s.size < 1024 ? `${s.size} B` : `${(s.size / 1024).toFixed(1)} KB`}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                          s.status === 'compiled' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300'
                            : s.status === 'compiling' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                            : s.status === 'error' ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                            : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                        }`}>{s.status}</span>
                      </div>
                    ))}
                    {!localCompiling && localSources.some(s => s.status === 'pending' || s.status === 'error') && (
                      <div className="flex gap-2 mt-2 pt-2 border-t dark:border-zinc-700">
                        <button
                          onClick={() => compileLocal()}
                          className="px-3 py-1.5 text-xs rounded bg-emerald-500 text-white hover:bg-emerald-600"
                        >
                          💻 Compile Remaining
                        </button>
                        <button
                          onClick={() => setLocalSources([])}
                          className="px-3 py-1.5 text-xs rounded bg-zinc-400 text-white hover:bg-zinc-500"
                        >
                          ✕ Clear
                        </button>
                      </div>
                    )}
                  </div>
                </details>
              )}

              {/* ── 📥 Raw Sources ── */}
              <details open className="border rounded-lg dark:border-zinc-700 overflow-hidden">
                <summary className="flex items-center gap-2 px-4 py-3 bg-slate-50 dark:bg-zinc-800/60 cursor-pointer select-none">
                  <span className="text-lg">📥</span>
                  <span className="text-sm font-semibold text-slate-700 dark:text-zinc-200">Raw Sources</span>
                  <span className="ml-auto text-xs text-slate-400 dark:text-zinc-500">{treeData?.raw?.length || 0} items</span>
                </summary>
                <div className="p-3 space-y-2">
                  {(treeData?.raw || []).map((s: TreeSource) => (
                    <div key={s.id} className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:shadow-sm">
                      <span className="text-lg">{SOURCE_ICONS[s.source_type] || '📄'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-700 dark:text-zinc-200 truncate">{s.title || s.id}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_COLORS[s.status] || ''}`}>{s.status}</span>
                        </div>
                        {s.snippet && <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1 line-clamp-2">{s.snippet}</p>}
                        <div className="text-[10px] text-slate-400 dark:text-zinc-600 mt-1">
                          {s.source_type} · {new Date(s.created_at).toLocaleDateString()}
                          {s.url && <> · <a href={s.url} target="_blank" rel="noopener" className="text-indigo-500 hover:underline">source ↗</a></>}
                        </div>
                      </div>
                    </div>
                  ))}
                  {(!treeData?.raw || treeData.raw.length === 0) && (
                    <p className="text-center text-sm text-slate-400 dark:text-zinc-600 py-4">No raw sources. Import files, clip URLs, or sync from tasks.</p>
                  )}
                </div>
              </details>

              {/* ── 📖 Wiki Articles ── */}
              <details open className="border rounded-lg dark:border-zinc-700 overflow-hidden">
                <summary className="flex items-center gap-2 px-4 py-3 bg-emerald-50 dark:bg-emerald-950/20 cursor-pointer select-none">
                  <span className="text-lg">📖</span>
                  <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Wiki Articles</span>
                  <span className="ml-auto text-xs text-emerald-500 dark:text-emerald-400">{treeData?.wiki?.length || 0} articles</span>
                </summary>
                <div className="p-3 space-y-2">
                  {(treeData?.wiki || []).map((a: TreeArticle) => (
                    <button
                      key={a.slug}
                      onClick={() => { setSelectedSlug(a.slug); setActiveTab('wiki') }}
                      className="w-full flex items-start gap-3 p-3 rounded-lg border border-emerald-200 dark:border-emerald-800/40 bg-white dark:bg-zinc-900 hover:shadow-sm hover:border-emerald-400 dark:hover:border-emerald-600 text-left transition-colors"
                    >
                      <span className="text-lg">📄</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-700 dark:text-zinc-200 truncate">{a.title}</span>
                          {a.category && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400">{a.category}</span>}
                        </div>
                        <div className="text-[10px] text-slate-400 dark:text-zinc-600 mt-1">
                          {a.slug} · v{a.version} · {a.tags ? a.tags.split(',').slice(0, 4).join(', ') : ''}
                        </div>
                      </div>
                    </button>
                  ))}
                  {(!treeData?.wiki || treeData.wiki.length === 0) && (
                    <p className="text-center text-sm text-slate-400 dark:text-zinc-600 py-4">No wiki articles yet. Compile sources to generate.</p>
                  )}
                </div>
              </details>

              {/* ── 💬 Q&A Outputs ── */}
              <details className="border rounded-lg dark:border-zinc-700 overflow-hidden">
                <summary className="flex items-center gap-2 px-4 py-3 bg-amber-50 dark:bg-amber-950/20 cursor-pointer select-none">
                  <span className="text-lg">💬</span>
                  <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">Q&A Archive</span>
                  <span className="ml-auto text-xs text-amber-500 dark:text-amber-400">{treeData?.outputs?.length || 0} items</span>
                </summary>
                <div className="p-3 space-y-2">
                  {(treeData?.outputs || []).map((s: TreeSource) => (
                    <div key={s.id} className="flex items-start gap-3 p-3 rounded-lg border border-amber-200 dark:border-amber-800/40 bg-white dark:bg-zinc-900 hover:shadow-sm">
                      <span className="text-lg">💬</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-700 dark:text-zinc-200 truncate">{s.title || 'Q&A'}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_COLORS[s.status] || ''}`}>{s.status}</span>
                        </div>
                        {s.snippet && <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1 line-clamp-2">{s.snippet}</p>}
                        <div className="text-[10px] text-slate-400 dark:text-zinc-600 mt-1">
                          {new Date(s.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  ))}
                  {(!treeData?.outputs || treeData.outputs.length === 0) && (
                    <p className="text-center text-sm text-slate-400 dark:text-zinc-600 py-4">No Q&A archive yet. Ask questions in the Q&A tab — answers get archived here.</p>
                  )}
                </div>
              </details>

            </div>
          </div>
        )}

        {/* ═══ Search Tab ═══ */}
        {activeTab === 'search' && (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="max-w-3xl mx-auto">
              <div className="flex gap-2 mb-4">
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search articles and sources..."
                  className="flex-1 px-3 py-2 text-sm border rounded-lg dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-200"
                />
                <select
                  value={searchScope}
                  onChange={e => setSearchScope(e.target.value as typeof searchScope)}
                  className="px-3 py-2 text-sm border rounded-lg dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-200"
                >
                  <option value="all">All</option>
                  <option value="articles">Articles</option>
                  <option value="sources">Sources</option>
                </select>
              </div>

              {searchResults?.results && searchResults.results.length > 0 && (
                <div className="space-y-2">
                  {searchResults.results.map(r => (
                    <div
                      key={r.id}
                      onClick={() => { if (r.slug) { setSelectedSlug(r.slug); setActiveTab('wiki') } }}
                      className={`p-3 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 ${r.slug ? 'cursor-pointer hover:shadow-sm' : ''}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${r.result_type === 'article' ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30' : 'bg-slate-100 text-slate-600 dark:bg-zinc-800'}`}>
                          {r.result_type}
                        </span>
                        <span className="text-sm font-medium text-slate-700 dark:text-zinc-200">{r.title}</span>
                        {r.category && <span className="text-[10px] text-slate-400">({r.category})</span>}
                      </div>
                      {r.snippet && (
                        <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1" dangerouslySetInnerHTML={{ __html: r.snippet }} />
                      )}
                    </div>
                  ))}
                </div>
              )}
              {searchQuery.length >= 2 && searchResults?.results?.length === 0 && (
                <p className="text-center text-slate-400 dark:text-zinc-600 mt-8">No results for &ldquo;{searchQuery}&rdquo;</p>
              )}
              {searchQuery.length < 2 && (
                <p className="text-center text-slate-400 dark:text-zinc-600 mt-8">Type at least 2 characters to search</p>
              )}
            </div>
          </div>
        )}


        {/* ═══ Stats Tab ═══ */}
        {activeTab === 'stats' && stats && (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="max-w-3xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Articles" value={stats.articles.total} icon="📖" />
              <StatCard label="Sources" value={stats.sources.reduce((s, r) => s + r.cnt, 0)} icon="📥" />
              <StatCard label="Questions" value={stats.queries.total} icon="❓" />
              <StatCard label="Answered" value={stats.queries.answered} icon="✅" />

              {/* Source breakdown */}
              <div className="col-span-2 p-4 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
                <h3 className="text-sm font-semibold text-slate-600 dark:text-zinc-400 mb-2">Sources by Type</h3>
                {stats.sources.map((s, i) => (
                  <div key={i} className="flex justify-between text-xs text-slate-500 dark:text-zinc-400">
                    <span>{SOURCE_ICONS[s.source_type] || '📄'} {s.source_type} ({s.status})</span>
                    <span>{s.cnt}</span>
                  </div>
                ))}
                {stats.sources.length === 0 && <p className="text-xs text-slate-400 italic">No sources</p>}
              </div>

              {/* Article categories */}
              <div className="col-span-2 p-4 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
                <h3 className="text-sm font-semibold text-slate-600 dark:text-zinc-400 mb-2">Articles by Category</h3>
                {stats.articles.by_category.map((c, i) => (
                  <div key={i} className="flex justify-between text-xs text-slate-500 dark:text-zinc-400">
                    <span>{c.cat}</span>
                    <span>{c.cnt}</span>
                  </div>
                ))}
                {stats.articles.by_category.length === 0 && <p className="text-xs text-slate-400 italic">No articles</p>}
              </div>

              {/* Index entries */}
              <div className="col-span-2 md:col-span-4 p-4 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
                <h3 className="text-sm font-semibold text-slate-600 dark:text-zinc-400 mb-2">Index Entries: {stats.index_entries}</h3>
                <div className="flex gap-3 flex-wrap">
                  <button
                    onClick={() => triggerCompile(true)}
                    disabled={compileLoading}
                    className="px-3 py-1.5 text-xs rounded bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-50"
                  >
                    🔄 Incremental Compile
                  </button>
                  <button
                    onClick={() => triggerCompile(false)}
                    disabled={compileLoading}
                    className="px-3 py-1.5 text-xs rounded bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
                  >
                    🔄 Full Recompile
                  </button>
                  <button
                    onClick={resetAndRecompile}
                    className="px-3 py-1.5 text-xs rounded bg-red-500 text-white hover:bg-red-600"
                  >
                    🗑️ Reset & Recompile
                  </button>
                </div>
              </div>

              {/* Recent activity log */}
              {stats.log && stats.log.recent.length > 0 && (
                <div className="col-span-2 md:col-span-4 p-4 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-slate-600 dark:text-zinc-400">Recent Activity ({stats.log.total} total)</h3>
                    <button onClick={() => setActiveTab('log')} className="text-xs text-indigo-500 hover:text-indigo-700">View all →</button>
                  </div>
                  <div className="space-y-1">
                    {stats.log.recent.slice(0, 5).map(entry => (
                      <div key={entry.id} className="flex items-center gap-2 text-xs text-slate-500 dark:text-zinc-400">
                        <span>{entry.event_type === 'ingest' ? '📥' : entry.event_type === 'query' ? '❓' : entry.event_type === 'lint' ? '🔍' : '📝'}</span>
                        <span className="truncate flex-1">{entry.summary}</span>
                        <span className="text-slate-400 dark:text-zinc-500 whitespace-nowrap">{new Date(entry.created_at).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        {activeTab === 'stats' && !stats && (
          <div className="flex-1 flex items-center justify-center text-slate-400">Loading stats...</div>
        )}

        {/* ═══ Q&A Tab ═══ */}
        {activeTab === 'qa' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto px-4 py-3">
              <div className="max-w-3xl mx-auto space-y-3">
                {chatMessages.length === 0 && (
                  <div className="text-center text-slate-400 dark:text-zinc-600 mt-16">
                    <div className="text-4xl mb-3">❓</div>
                    <p className="font-medium">Q&A — Ask your Knowledge Base</p>
                    <p className="text-sm mt-1">Ask any question about your imported sources. The agent will search the KB and respond with citations.</p>
                  </div>
                )}
                {chatMessages.map(msg => {
                  const isHuman = msg.sender_type === 'human'
                  return (
                    <div key={msg.message_id} className={`flex ${isHuman ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                        isHuman
                          ? 'bg-indigo-500 text-white'
                          : 'bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-800 dark:text-zinc-200'
                      }`}>
                        {!isHuman && (
                          <div className="text-[10px] font-medium text-indigo-500 dark:text-indigo-400 mb-1">
                            🤖 {msg.sender_id.length > 20 ? msg.sender_id.slice(0, 16) + '…' : msg.sender_id}
                          </div>
                        )}
                        <div className={`text-sm whitespace-pre-wrap break-words ${isHuman ? '' : 'prose prose-sm dark:prose-invert max-w-none prose-headings:text-base prose-p:my-1'}`}>
                          {isHuman ? msg.content : (
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm, remarkMath]}
                              rehypePlugins={[rehypeKatex]}
                              components={{
                                code({ className, children }) {
                                  const match = /language-(\w+)/.exec(className || '')
                                  if (match) return <SyntaxHighlighter style={oneDark} language={match[1]} PreTag="div" customStyle={{ borderRadius: '0.375rem', fontSize: '0.8rem' }}>{String(children).replace(/\n$/, '')}</SyntaxHighlighter>
                                  return <code className="bg-slate-100 dark:bg-zinc-700 px-1 py-0.5 rounded text-xs font-mono">{children}</code>
                                },
                              }}
                            >
                              {msg.content}
                            </ReactMarkdown>
                          )}
                        </div>
                        <div className={`text-[10px] mt-1 ${isHuman ? 'text-indigo-200' : 'text-slate-400 dark:text-zinc-500'}`}>
                          {new Date(msg.timestamp).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                  )
                })}
                <div ref={chatEndRef} />
              </div>
            </div>
            <div className="border-t border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3">
              <div className="max-w-3xl mx-auto flex gap-2">
                <input
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() } }}
                  placeholder="Ask a question about your knowledge base..."
                  className="flex-1 px-4 py-2.5 text-sm border rounded-full dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-200 focus:ring-2 focus:ring-indigo-300 focus:outline-none"
                />
                <button
                  onClick={sendChat}
                  disabled={!chatInput.trim() || chatSending}
                  className="px-5 py-2.5 text-sm font-medium rounded-full bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-50 transition-colors"
                >
                  {chatSending ? '⏳' : '↑'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ Schema Tab ═══ */}
        {activeTab === 'schema' && (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="max-w-3xl mx-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-800 dark:text-zinc-100">📐 Wiki Schema</h2>
                <button
                  onClick={async () => {
                    setSchemaSaving(true)
                    try {
                      await fetch(`${base}/tasks/${taskId}/kb/schema`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ schema_text: schemaText }),
                      })
                    } catch (e) { console.error(e) }
                    setSchemaSaving(false)
                  }}
                  disabled={schemaSaving}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-50"
                >
                  {schemaSaving ? '⏳ Saving...' : '💾 Save Schema'}
                </button>
              </div>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mb-3">
                This schema tells the agent how to organize your wiki — structure conventions, article format, ingest rules, and categories.
              </p>
              <textarea
                value={schemaText}
                onChange={e => setSchemaText(e.target.value)}
                rows={30}
                className="w-full font-mono text-sm p-4 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 dark:text-zinc-200 focus:ring-2 focus:ring-indigo-300 focus:outline-none resize-y"
                placeholder="# Knowledge Base Schema&#10;&#10;Define your wiki conventions here..."
              />
            </div>
          </div>
        )}

        {/* ═══ Log Tab ═══ */}
        {activeTab === 'log' && (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="max-w-3xl mx-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-800 dark:text-zinc-100">📋 Event Log</h2>
                <button
                  onClick={() => mutateLog()}
                  className="px-3 py-1.5 text-xs rounded bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-600 dark:text-zinc-300"
                >
                  🔄 Refresh
                </button>
              </div>
              {logData?.total === 0 && (
                <p className="text-center text-slate-400 dark:text-zinc-500 py-12">No log entries yet. Compile sources to see activity.</p>
              )}
              <div className="space-y-2">
                {(logData?.entries || []).map(entry => {
                  const typeIcon: Record<string, string> = { ingest: '📥', query: '❓', lint: '🔍', update: '✏️', file: '📄' }
                  const typeBg: Record<string, string> = {
                    ingest: 'bg-indigo-50 border-indigo-200 dark:bg-indigo-950/30 dark:border-indigo-800',
                    query: 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800',
                    lint: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800',
                    update: 'bg-slate-50 border-slate-200 dark:bg-zinc-900 dark:border-zinc-700',
                    file: 'bg-purple-50 border-purple-200 dark:bg-purple-950/30 dark:border-purple-800',
                  }
                  return (
                    <div key={entry.id} className={`p-3 rounded-lg border ${typeBg[entry.event_type] || typeBg.update}`}>
                      <div className="flex items-start gap-2">
                        <span className="text-lg">{typeIcon[entry.event_type] || '📝'}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium uppercase text-slate-500 dark:text-zinc-400">
                              {entry.event_type}
                            </span>
                            <span className="text-xs text-slate-400 dark:text-zinc-500">
                              {new Date(entry.created_at).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-sm text-slate-700 dark:text-zinc-300 mt-0.5">{entry.summary}</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              {(logData?.total || 0) > 0 && (
                <p className="text-center text-xs text-slate-400 dark:text-zinc-500 mt-4">
                  {logData?.total} total entries
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="p-4 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-center">
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-2xl font-bold text-slate-800 dark:text-zinc-100">{value}</div>
      <div className="text-xs text-slate-500 dark:text-zinc-400">{label}</div>
    </div>
  )
}
