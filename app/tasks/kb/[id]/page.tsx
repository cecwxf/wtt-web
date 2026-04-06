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
import 'katex/dist/katex.min.css'
import mermaid from 'mermaid'

mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'loose' })

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

  /* ── Tabs ── */
  const [activeTab, setActiveTab] = useState<'wiki' | 'graph' | 'sources' | 'search' | 'stats' | 'qa'>('wiki')
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchScope, setSearchScope] = useState<'all' | 'articles' | 'sources'>('all')
  const [clipUrl, setClipUrl] = useState('')
  const [clipLoading, setClipLoading] = useState(false)
  const [noteTitle, setNoteTitle] = useState('')
  const [noteContent, setNoteContent] = useState('')
  const [compileLoading, setCompileLoading] = useState(false)
  const [compileProgress, setCompileProgress] = useState<{ percent: number; compiled: number; total: number; article_count: number } | null>(null)
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
  const [wikiLang, setWikiLang] = useState<'en' | 'zh'>('en')
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
          if (p.percent >= 100) {
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
          if (p.total > 0 && p.percent < 100 && p.raw > 0) {
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
            </span>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 px-4 py-2 border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        {(['wiki', 'graph', 'sources', 'search', 'stats', 'qa'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={tabCls(tab)}>
            {tab === 'wiki' ? '📖 Wiki' : tab === 'graph' ? '🕸️ Graph' : tab === 'sources' ? '📥 Sources' : tab === 'search' ? '🔍 Search' : tab === 'stats' ? '📊 Stats' : '❓ Q&A'}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-400 dark:text-zinc-500 self-center">
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
                              <SyntaxHighlighter style={oneDark} language={match[1]} PreTag="div"
                                customStyle={{ borderRadius: '0.5rem', fontSize: '0.85rem' }}>
                                {codeStr}
                              </SyntaxHighlighter>
                            )
                          }
                          return <code className="bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-sm font-mono text-indigo-700 dark:text-indigo-300" {...props}>{children}</code>
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
                          return <div className="overflow-x-auto my-4"><table className="min-w-full" {...props}>{children}</table></div>
                        },
                        img({ src, alt, ...props }) {
                          return <figure className="my-4"><img src={src} alt={alt || ''} className="rounded-lg shadow-md max-w-full" {...props} />{alt && <figcaption className="text-center text-xs text-slate-400 mt-2">{alt}</figcaption>}</figure>
                        },
                      }}
                    >
                      {(wikiLang === 'zh' && articleFull.content_markdown_zh) ? articleFull.content_markdown_zh : articleFull.content_markdown}
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
              <div className="flex gap-2 items-center">
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
                <span className="text-xs text-slate-400 dark:text-zinc-500">
                  PDF, Markdown, TXT, Code, DOCX, CSV, JSON — up to 10MB each
                </span>
              </div>
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
                    disabled={compileLoading}
                    className="px-3 py-1.5 text-xs rounded bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
                  >
                    🗑️ Reset & Recompile
                  </button>
                </div>
              </div>
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
