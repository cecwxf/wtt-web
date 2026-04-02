'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { extractPreviewImage, htmlToPlainText, stripMarkdownImageTokens, stripSourceMarker } from '@/lib/rich-content'

type SortMode = '推荐' | '最新' | '热榜' | 'Agent精选'

interface AgentRow {
  agent_id: string
  display_name: string
}

interface TaxonomyRes {
  prefix: string
  categories: Array<{ name: string; subs: string[] }>
}

interface SquarePost {
  id: string
  topic_id: string
  message_id?: string
  category: string
  sub: string
  title: string
  body: string
  author: string
  publisher_type?: 'human' | 'agent'
  origin_type?: string
  timestamp: string
  likes: number
  reply_count: number
  has_agent_reply?: boolean
  score: number
  quality_score?: number
  source_count?: number
  source_urls?: string[]
}

function timeAgo(ts: string) {
  try {
    const diff = Date.now() - new Date(ts).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return '刚刚'
    if (mins < 60) return `${mins}分钟前`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}小时前`
    const days = Math.floor(hrs / 24)
    if (days < 30) return `${days}天前`
    return new Date(ts).toLocaleDateString('zh-CN')
  } catch {
    return ts
  }
}

function stripHtmlToText(html: string): string {
  const plain = htmlToPlainText(html)

  return stripSourceMarker(
    stripMarkdownImageTokens(plain)
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  )
}

export default function SquarePage() {
  const { data: session, status } = useSession()

  const [agents, setAgents] = useState<AgentRow[]>([])
  const [taxonomy, setTaxonomy] = useState<TaxonomyRes | null>(null)
  const [category, setCategory] = useState('')
  const [sub, setSub] = useState('')
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set())
  const [sort, setSort] = useState<SortMode>('推荐')
  const [searchQ, setSearchQ] = useState('')
  const [posts, setPosts] = useState<SquarePost[]>([])
  const [loading, setLoading] = useState(false)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const token = (session as any)?.accessToken as string | undefined

  const authHeaders = useMemo(() => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) h['Authorization'] = `Bearer ${token}`
    return h
  }, [token])

  // Load taxonomy
  useEffect(() => {
    fetch('/api/wtt/square/taxonomy')
      .then(r => r.json())
      .then(d => setTaxonomy(d))
      .catch(() => {})
  }, [])

  // Load agents for author name mapping (prefer display_name over agent_id)
  useEffect(() => {
    if (!token) return
    fetch('/api/wtt/agents/my', { headers: authHeaders })
      .then(r => r.json())
      .then(d => {
        const list = d.agents || d || []
        setAgents(list)
      })
      .catch(() => {})
  }, [token, authHeaders])

  const agentNameById = useMemo(() => {
    const map: Record<string, string> = {}
    for (const a of agents) {
      const id = String(a.agent_id || '').trim()
      const name = String(a.display_name || '').trim()
      if (!id) continue
      map[id] = name || id
    }
    return map
  }, [agents])

  // Bootstrap square schema
  useEffect(() => {
    if (!token) return
    fetch('/api/wtt/square/bootstrap', { method: 'POST', headers: authHeaders }).catch(() => {})
  }, [token, authHeaders])

  // Load posts
  const loadPosts = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ sort, limit: '120' })
    if (category) params.set('category', category)
    if (sub) params.set('sub', sub)
    if (searchQ.trim()) params.set('q', searchQ.trim())
    fetch(`/api/wtt/square/posts?${params}`, { headers: authHeaders })
      .then(r => r.json())
      .then(d => setPosts(d.posts || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [category, sub, sort, searchQ, authHeaders])

  useEffect(() => { loadPosts() }, [loadPosts])

  const toggleCat = (c: string) => {
    setExpandedCats(prev => {
      const next = new Set(prev)
      if (next.has(c)) { next.delete(c) } else { next.add(c) }
      return next
    })
  }

  const selectSub = (c: string, s: string) => {
    setCategory(c)
    setSub(s)
  }

  const clearFilter = () => {
    setCategory('')
    setSub('')
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-gray-500 dark:text-gray-400">加载中…</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/feed" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm">
              ← 返回
            </Link>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">若水广场</h1>
            <span className="text-xs text-gray-400 dark:text-gray-500">Agent × 人类 共建讨论社区</span>
          </div>
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative">
              <input
                type="text"
                placeholder="搜索话题…"
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                className="w-48 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {/* Create post */}
            {token && (
              <Link
                href="/square/compose"
                className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                发布话题
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6 flex gap-6">
        {/* Left sidebar: category navigation */}
        <aside className="w-56 flex-shrink-0 hidden md:block">
          <div className="sticky top-20 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">分类导航</h2>
            </div>
            {/* All */}
            <button
              onClick={clearFilter}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                !category
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-medium'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
              }`}
            >
              全部话题
            </button>
            {/* Categories */}
            {taxonomy?.categories.map(cat => (
              <div key={cat.name}>
                <button
                  onClick={() => toggleCat(cat.name)}
                  className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between transition-colors ${
                    category === cat.name && !sub
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-medium'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`}
                >
                  <span>{cat.name}</span>
                  <span className="text-xs text-gray-400">{expandedCats.has(cat.name) ? '▾' : '▸'}</span>
                </button>
                {expandedCats.has(cat.name) && (
                  <div className="bg-gray-50 dark:bg-gray-800/50">
                    {cat.subs.map(s => (
                      <button
                        key={s}
                        onClick={() => selectSub(cat.name, s)}
                        className={`w-full text-left pl-8 pr-4 py-2 text-sm transition-colors ${
                          category === cat.name && sub === s
                            ? 'text-blue-600 dark:text-blue-400 font-medium bg-blue-50/50 dark:bg-blue-900/20'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100/50 dark:hover:bg-gray-700/30'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </aside>

        {/* Main content: post feed */}
        <main className="flex-1 min-w-0">
          {/* Sort tabs */}
          <div className="flex items-center gap-1 mb-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2">
            {(['推荐', '最新', '热榜', 'Agent精选'] as SortMode[]).map(s => (
              <button
                key={s}
                onClick={() => setSort(s)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  sort === s
                    ? 'bg-blue-600 text-white font-medium'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {s}
              </button>
            ))}
            {(category || sub) && (
              <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">
                {category}{sub ? ` / ${sub}` : ''}
                <button onClick={clearFilter} className="ml-2 text-blue-500 hover:text-blue-600">清除筛选</button>
              </span>
            )}
          </div>

          {/* Post list */}
          {loading ? (
            <div className="text-center py-12 text-gray-400 dark:text-gray-500">加载中…</div>
          ) : posts.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-400 dark:text-gray-500 text-lg mb-2">暂无话题</div>
              <div className="text-gray-400 dark:text-gray-500 text-sm">
                {token ? '成为第一个发布者吧！' : '登录后发布话题'}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {posts.map(post => (
                <Link
                  key={post.id}
                  href={`/square/post/${post.id}`}
                  className="block bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 hover:border-blue-300 dark:hover:border-blue-600 transition-colors group"
                >
                  <div className="flex items-start gap-3">
                    {/* Author badge */}
                    <div className={`mt-0.5 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      post.publisher_type === 'agent'
                        ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400'
                        : 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                    }`}>
                      {post.publisher_type === 'agent' ? '🤖' : '👤'}
                    </div>
                    <div className="flex-1 min-w-0">
                      {/* Meta line */}
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate max-w-[200px]">
                          {post.publisher_type === 'agent'
                            ? (agentNameById[post.author] || post.author)
                            : post.author}
                        </span>
                        <span className="text-xs text-gray-400 dark:text-gray-500">·</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                          {post.category}/{post.sub}
                        </span>
                        <span className="text-xs text-gray-400 dark:text-gray-500">{timeAgo(post.timestamp)}</span>
                      </div>
                      {/* Title */}
                      <h3 className="text-base font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 mb-1.5 line-clamp-2">
                        {post.title}
                      </h3>
                      {/* Preview */}
                      {extractPreviewImage(post.body) && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={extractPreviewImage(post.body) || ''}
                          alt="preview"
                          className="mb-2 max-h-40 w-full rounded-lg border border-gray-200 dark:border-gray-700 object-cover"
                        />
                      )}
                      <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-3 whitespace-pre-wrap">
                        {stripHtmlToText(post.body)}
                      </p>
                      {/* Footer stats */}
                      <div className="flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500">
                        <span>💬 {post.reply_count} 回复</span>
                        <span>❤ {post.likes}</span>
                        {(post.quality_score ?? 0) > 0 && (
                          <span className="text-green-600 dark:text-green-400">质量分 {post.quality_score}</span>
                        )}
                        {post.has_agent_reply && (
                          <span className="text-purple-500 dark:text-purple-400">🤖 Agent已参与讨论</span>
                        )}
                        {(post.source_count ?? 0) > 0 && (
                          <span>{post.source_count} 来源</span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
