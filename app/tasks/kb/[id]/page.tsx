'use client'

import { useRouter, useParams } from 'next/navigation'
import { useState } from 'react'
import useSWR from 'swr'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useSession } from 'next-auth/react'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'
import { ThemeToggle } from '@/components/ui/theme-toggle'

/* ── Types ── */
interface KBSource {
  id: string; source_type: string; title: string; url: string | null
  status: string; snippet: string; metadata_json: string
  created_at: string; updated_at: string
}
interface KBArticle {
  id: string; slug: string; title: string; summary: string | null
  category: string | null; tags: string; version: number
  compiled_by: string | null; created_at: string; updated_at: string
}
interface KBArticleFull extends KBArticle {
  content_markdown: string; source_ids: string; backlinks: string
}
interface KBQuery {
  id: string; question: string; answer_preview: string | null
  articles_cited: string; sources_cited: string
  filed_as_article_id: string | null; created_at: string
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
  const [activeTab, setActiveTab] = useState<'wiki' | 'sources' | 'search' | 'qa' | 'stats'>('wiki')
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchScope, setSearchScope] = useState<'all' | 'articles' | 'sources'>('all')
  const [clipUrl, setClipUrl] = useState('')
  const [clipLoading, setClipLoading] = useState(false)
  const [qaInput, setQaInput] = useState('')
  const [noteTitle, setNoteTitle] = useState('')
  const [noteContent, setNoteContent] = useState('')
  const [compileLoading, setCompileLoading] = useState(false)
  const [syncLoading, setSyncLoading] = useState(false)
  const [syncResult, setSyncResult] = useState<{ total_imported: number; skipped_duplicates: number } | null>(null)
  const { data: session } = useSession() as { data: { accessToken?: string } | null }

  /* ── Data fetching ── */
  const base = CLIENT_WTT_API_BASE
  const { data: task } = useSWR(`${base}/tasks/${taskId}`, fetcher)
  const { data: tocData } = useSWR<TOCData>(
    `${base}/tasks/${taskId}/kb/toc`, fetcher, { refreshInterval: 10000 }
  )
  const { data: sourcesData, mutate: mutateSources } = useSWR(
    activeTab === 'sources' ? `${base}/tasks/${taskId}/kb/sources?limit=100` : null, fetcher
  )
  const { data: articleFull } = useSWR<KBArticleFull>(
    selectedSlug ? `${base}/tasks/${taskId}/kb/articles/${selectedSlug}` : null, fetcher
  )
  const { data: searchResults } = useSWR<{ results: SearchResult[] }>(
    activeTab === 'search' && searchQuery.length >= 2
      ? `${base}/tasks/${taskId}/kb/search?q=${encodeURIComponent(searchQuery)}&scope=${searchScope}&limit=30`
      : null,
    fetcher
  )
  const { data: qaData, mutate: mutateQa } = useSWR(
    activeTab === 'qa' ? `${base}/tasks/${taskId}/kb/queries?limit=50` : null, fetcher
  )
  const { data: statsData } = useSWR<KBStats>(
    activeTab === 'stats' ? `${base}/tasks/${taskId}/kb/stats` : null, fetcher
  )

  const toc = tocData || { categories: {}, article_count: 0, index_entries: [] }
  const sources: KBSource[] = sourcesData?.sources || []
  const queries: KBQuery[] = qaData?.queries || []
  const stats: KBStats | null = statsData || null

  /* ── Actions ── */
  const webClip = async () => {
    if (!clipUrl.trim()) return
    setClipLoading(true)
    try {
      await fetch(`${base}/tasks/${taskId}/kb/sources/clip`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: clipUrl.trim() }),
      })
      setClipUrl('')
      mutateSources()
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
    mutateSources()
  }

  const triggerCompile = async (incremental = true) => {
    setCompileLoading(true)
    try {
      await fetch(`${base}/tasks/${taskId}/kb/compile?incremental=${incremental}`, { method: 'POST' })
    } catch (e) { console.error(e) }
    setCompileLoading(false)
  }

  const triggerSync = async () => {
    setSyncLoading(true)
    setSyncResult(null)
    try {
      const resp = await fetch(`${base}/kb/sync`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.accessToken ?? ''}` },
      })
      if (resp.ok) {
        const data = await resp.json()
        setSyncResult(data)
        mutateSources()
      }
    } catch (e) { console.error(e) }
    setSyncLoading(false)
  }

  const askQuestion = async () => {
    if (!qaInput.trim()) return
    await fetch(`${base}/tasks/${taskId}/kb/queries`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: qaInput.trim() }),
    })
    setQaInput('')
    mutateQa()
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
          📚 {task?.title || 'Knowledge Base'}
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
            {syncLoading ? '⏳ Syncing...' : '🔄 Sync All Tasks'}
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

      {/* Tab bar */}
      <div className="flex gap-1 px-4 py-2 border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        {(['wiki', 'sources', 'search', 'qa', 'stats'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={tabCls(tab)}>
            {tab === 'wiki' ? '📖 Wiki' : tab === 'sources' ? '📥 Sources' : tab === 'search' ? '🔍 Search' : tab === 'qa' ? '❓ Q&A' : '📊 Stats'}
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
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {articleFull.content_markdown}
                    </ReactMarkdown>
                  </div>
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

            {/* Source list */}
            <div className="max-w-3xl mx-auto space-y-2">
              <h3 className="text-sm font-semibold text-slate-500 dark:text-zinc-400">
                {sources.length} sources
              </h3>
              {sources.map(s => (
                <div
                  key={s.id}
                  className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:shadow-sm"
                >
                  <span className="text-lg">{SOURCE_ICONS[s.source_type] || '📄'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-700 dark:text-zinc-200 truncate">
                        {s.title || s.id}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_COLORS[s.status] || ''}`}>
                        {s.status}
                      </span>
                    </div>
                    {s.snippet && (
                      <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1 line-clamp-2">
                        {s.snippet}
                      </p>
                    )}
                    <div className="text-[10px] text-slate-400 dark:text-zinc-600 mt-1">
                      {s.source_type} · {new Date(s.created_at).toLocaleDateString()}
                      {s.url && <> · <a href={s.url} target="_blank" rel="noopener" className="text-indigo-500 hover:underline">source ↗</a></>}
                    </div>
                  </div>
                </div>
              ))}
              {sources.length === 0 && (
                <p className="text-center text-slate-400 dark:text-zinc-600 mt-8">
                  No sources yet. Clip a URL, add a note, or import from a topic.
                </p>
              )}
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

        {/* ═══ Q&A Tab ═══ */}
        {activeTab === 'qa' && (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="max-w-3xl mx-auto">
              <div className="flex gap-2 mb-6">
                <input
                  value={qaInput}
                  onChange={e => setQaInput(e.target.value)}
                  placeholder="Ask a question against the knowledge base..."
                  className="flex-1 px-3 py-2 text-sm border rounded-lg dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-200"
                  onKeyDown={e => e.key === 'Enter' && askQuestion()}
                />
                <button
                  onClick={askQuestion}
                  disabled={!qaInput.trim()}
                  className="px-4 py-2 text-sm rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-50"
                >
                  Ask
                </button>
              </div>

              <div className="space-y-3">
                {queries.map(q => (
                  <div key={q.id} className="p-3 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
                    <p className="text-sm font-medium text-slate-700 dark:text-zinc-200">❓ {q.question}</p>
                    {q.answer_preview ? (
                      <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">{q.answer_preview}</p>
                    ) : (
                      <p className="text-xs text-yellow-500 mt-1 italic">⏳ Awaiting agent answer...</p>
                    )}
                    <div className="text-[10px] text-slate-400 dark:text-zinc-600 mt-1">
                      {new Date(q.created_at).toLocaleString()}
                      {q.filed_as_article_id && <span className="ml-2 text-green-500">✅ Filed as article</span>}
                    </div>
                  </div>
                ))}
                {queries.length === 0 && (
                  <p className="text-center text-slate-400 dark:text-zinc-600 mt-8">No questions yet. Ask something!</p>
                )}
              </div>
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
                <div className="flex gap-3">
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
                </div>
              </div>
            </div>
          </div>
        )}
        {activeTab === 'stats' && !stats && (
          <div className="flex-1 flex items-center justify-center text-slate-400">Loading stats...</div>
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
