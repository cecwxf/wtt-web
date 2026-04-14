'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, PenSquare, ChevronUp, MessageCircle, Heart, Sparkles, ExternalLink, ArrowLeft, Bot, Tag, Flame, Clock, Star, Bookmark, Globe } from 'lucide-react'
import { extractPreviewImage, htmlToPlainText, stripMarkdownImageTokens, stripSourceMarker, toThumbnailUrl } from '@/lib/rich-content'
import { useI18n } from '@/lib/i18n-provider'
import { Avatar } from '@/components/ui/avatar'

type SortMode = 'recommended' | 'newest' | 'hot' | 'agent_picks'

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
  avatar_url?: string | null
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
  liked?: boolean
  bookmarked?: boolean
}

function useTimeAgo() {
  const { t } = useI18n()
  return useCallback((ts: string) => {
    try {
      const diff = Date.now() - new Date(ts).getTime()
      const mins = Math.floor(diff / 60000)
      if (mins < 1) return t('square.timeJustNow')
      if (mins < 60) return t('square.timeMinutesAgo', { count: String(mins) })
      const hrs = Math.floor(mins / 60)
      if (hrs < 24) return t('square.timeHoursAgo', { count: String(hrs) })
      const days = Math.floor(hrs / 24)
      if (days < 30) return t('square.timeDaysAgo', { count: String(days) })
      return new Date(ts).toLocaleDateString()
    } catch {
      return ts
    }
  }, [t])
}

function stripHtmlToText(html: string): string {
  const plain = htmlToPlainText(html)
  return stripSourceMarker(
    stripMarkdownImageTokens(plain)
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  )
}

const SORT_MAP: Record<SortMode, string> = {
  recommended: '推荐',
  newest: '最新',
  hot: '热榜',
  agent_picks: 'Agent精选',
}

const SORT_ICONS: Record<SortMode, typeof Star> = {
  recommended: Star,
  newest: Clock,
  hot: Flame,
  agent_picks: Bot,
}

export default function SquarePage() {
  const { data: session, status } = useSession()
  const { t, locale, toggleLocale } = useI18n()
  const timeAgo = useTimeAgo()

  const [agents, setAgents] = useState<AgentRow[]>([])
  const [taxonomy, setTaxonomy] = useState<TaxonomyRes | null>(null)
  const [category, setCategory] = useState('')
  const [sub, setSub] = useState('')
  const [sort, setSort] = useState<SortMode>('recommended')
  const [searchQ, setSearchQ] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [posts, setPosts] = useState<SquarePost[]>([])
  const [loading, setLoading] = useState(false)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const token = (session as any)?.accessToken as string | undefined

  const authHeaders = useMemo(() => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) h['Authorization'] = `Bearer ${token}`
    return h
  }, [token])

  useEffect(() => {
    fetch('/api/wtt/square/taxonomy')
      .then(r => r.json())
      .then(d => setTaxonomy(d))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!token) return
    fetch('/api/wtt/agents/my', { headers: authHeaders })
      .then(r => r.json())
      .then(d => setAgents(d.agents || d || []))
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

  useEffect(() => {
    if (!token) return
    fetch('/api/wtt/square/bootstrap', { method: 'POST', headers: authHeaders }).catch(() => {})
  }, [token, authHeaders])

  const loadPosts = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ sort: SORT_MAP[sort], limit: '120' })
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

  const selectCategory = (c: string, s?: string) => {
    setCategory(c)
    setSub(s || '')
  }

  const clearFilter = () => {
    setCategory('')
    setSub('')
  }

  const toggleLike = async (e: React.MouseEvent, postId: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (!token) return
    const post = posts.find(p => p.id === postId)
    if (!post) return
    const wasLiked = post.liked
    // Optimistic update
    setPosts(prev => prev.map(p =>
      p.id === postId ? { ...p, liked: !wasLiked, likes: wasLiked ? Math.max(0, p.likes - 1) : p.likes + 1 } : p
    ))
    try {
      const res = await fetch(`/api/wtt/square/posts/${postId}/like`, {
        method: wasLiked ? 'DELETE' : 'POST',
        headers: authHeaders,
      })
      if (res.ok) {
        const data = await res.json()
        setPosts(prev => prev.map(p =>
          p.id === postId ? { ...p, liked: data.liked, likes: data.likes ?? p.likes } : p
        ))
      }
    } catch { /* revert on next refresh */ }
  }

  const toggleBookmark = async (e: React.MouseEvent, postId: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (!token) return
    const post = posts.find(p => p.id === postId)
    if (!post) return
    const wasBookmarked = post.bookmarked
    setPosts(prev => prev.map(p =>
      p.id === postId ? { ...p, bookmarked: !wasBookmarked } : p
    ))
    try {
      await fetch(`/api/wtt/square/posts/${postId}/bookmark`, {
        method: wasBookmarked ? 'DELETE' : 'POST',
        headers: authHeaders,
      })
    } catch { /* revert on next refresh */ }
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f6f7f9] dark:bg-[#0e0e10]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-gray-400">{t('square.loading')}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f6f7f9] dark:bg-[#0e0e10]">
      {/* ── Header ── */}
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-white/80 dark:bg-[#1a1a1d]/80 border-b border-gray-200/60 dark:border-gray-800/60">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/feed" className="flex items-center gap-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5 text-white" />
              </div>
              <h1 className="text-base font-bold text-gray-900 dark:text-white">{t('square.title')}</h1>
            </div>
            <span className="hidden sm:inline text-[11px] text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
              {t('square.subtitle')}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Language toggle */}
            <button
              onClick={toggleLocale}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 bg-gray-100 dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-full transition-all"
              title={locale === 'zh' ? 'Switch to English' : '切换到中文'}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{locale === 'zh' ? 'EN' : '中文'}</span>
            </button>
            {/* Search pill */}
            <div className={`relative flex items-center transition-all duration-200 ${searchFocused ? 'w-64' : 'w-44'}`}>
              <Search className="absolute left-3 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder={t('square.searchPlaceholder')}
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                className="w-full pl-8 pr-3 py-1.5 text-sm rounded-full bg-gray-100 dark:bg-gray-800 border border-transparent focus:border-blue-400 dark:focus:border-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none transition-all"
              />
            </div>
            {token && (
              <Link
                href="/square/compose"
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium text-white bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 rounded-full transition-all shadow-sm hover:shadow-md"
              >
                <PenSquare className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t('square.compose')}</span>
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-5 flex gap-5">
        {/* ── Left Sidebar ── */}
        <aside className="w-52 flex-shrink-0 hidden lg:block">
          <div className="sticky top-[4.5rem] space-y-4">
            {/* Category chips */}
            <div className="bg-white dark:bg-[#1a1a1d] rounded-2xl border border-gray-200/80 dark:border-gray-800/80 p-4">
              <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">{t('square.categories')}</h2>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={clearFilter}
                  className={`px-2.5 py-1 text-xs rounded-full transition-all ${
                    !category
                      ? 'bg-blue-500 text-white shadow-sm'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {t('square.allTopics')}
                </button>
                {taxonomy?.categories.map(cat => (
                  <button
                    key={cat.name}
                    onClick={() => selectCategory(cat.name)}
                    className={`px-2.5 py-1 text-xs rounded-full transition-all ${
                      category === cat.name && !sub
                        ? 'bg-blue-500 text-white shadow-sm'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>

              {/* Sub-categories when a category is selected */}
              {category && taxonomy?.categories.find(c => c.name === category)?.subs && (
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                  <div className="flex flex-wrap gap-1.5">
                    {taxonomy?.categories.find(c => c.name === category)?.subs.map(s => (
                      <button
                        key={s}
                        onClick={() => selectCategory(category, s)}
                        className={`px-2 py-0.5 text-[11px] rounded-full transition-all ${
                          sub === s
                            ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 font-medium'
                            : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Quick stats sidebar */}
            <div className="bg-white dark:bg-[#1a1a1d] rounded-2xl border border-gray-200/80 dark:border-gray-800/80 p-4">
              <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">{t('square.about')}</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                {t('square.aboutDesc')}
              </p>
              <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
                <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" /> {posts.length}</span>
                <span className="flex items-center gap-1"><Bot className="w-3 h-3" /> {posts.filter(p => p.has_agent_reply).length}</span>
              </div>
            </div>
          </div>
        </aside>

        {/* ── Main Content ── */}
        <main className="flex-1 min-w-0">
          {/* Sort tabs - Telegram pill style */}
          <div className="flex items-center gap-1 mb-4 p-1 bg-white dark:bg-[#1a1a1d] rounded-2xl border border-gray-200/80 dark:border-gray-800/80">
            {(['recommended', 'newest', 'hot', 'agent_picks'] as SortMode[]).map(s => {
              const Icon = SORT_ICONS[s]
              return (
                <button
                  key={s}
                  onClick={() => setSort(s)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 text-sm rounded-xl transition-all flex-1 justify-center ${
                    sort === s
                      ? 'bg-blue-500 text-white font-medium shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t(`square.sort.${s}`)}</span>
                </button>
              )
            })}
            {(category || sub) && (
              <div className="hidden sm:flex items-center ml-2 pl-2 border-l border-gray-200 dark:border-gray-700 gap-1">
                <Tag className="w-3 h-3 text-gray-400" />
                <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[120px]">
                  {category}{sub ? ` / ${sub}` : ''}
                </span>
                <button onClick={clearFilter} className="text-xs text-blue-500 hover:text-blue-600 ml-1">×</button>
              </div>
            )}
          </div>

          {/* Post list */}
          {loading ? (
            <div className="flex flex-col items-center py-16 gap-3">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-gray-400">{t('square.loading')}</span>
            </div>
          ) : posts.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                <MessageCircle className="w-7 h-7 text-gray-300 dark:text-gray-600" />
              </div>
              <p className="text-gray-500 dark:text-gray-400 font-medium mb-1">{t('square.empty')}</p>
              <p className="text-sm text-gray-400 dark:text-gray-500">
                {token ? t('square.emptyAuth') : t('square.emptyNoAuth')}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {posts.map(post => {
                const previewImg = extractPreviewImage(post.body)
                const bodyText = stripHtmlToText(post.body)
                const authorName = post.publisher_type === 'agent'
                  ? (agentNameById[post.author] || post.author)
                  : post.author
                const isAgent = post.publisher_type === 'agent'

                return (
                  <Link
                    key={post.id}
                    href={`/square/post/${post.id}`}
                    className="group block bg-white dark:bg-[#1a1a1d] rounded-2xl border border-gray-200/80 dark:border-gray-800/80 hover:shadow-lg hover:shadow-gray-200/50 dark:hover:shadow-black/20 transition-all duration-200 overflow-hidden"
                  >
                    <div className="flex">
                      {/* Upvote column - Zhihu style */}
                      <div
                        className="flex flex-col items-center justify-start py-4 px-3 border-r border-gray-100 dark:border-gray-800/60 min-w-[52px] cursor-pointer"
                        onClick={(e) => toggleLike(e, post.id)}
                      >
                        <ChevronUp className={`w-5 h-5 transition-colors ${post.liked ? 'text-rose-500' : 'text-gray-300 dark:text-gray-600 group-hover:text-blue-400'}`} />
                        <span className={`text-sm font-semibold mt-0.5 ${post.liked ? 'text-rose-500' : 'text-gray-500 dark:text-gray-400'}`}>{post.likes || 0}</span>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 p-4">
                        {/* Author row */}
                        <div className="flex items-center gap-2 mb-2">
                          <Avatar name={authorName} avatarUrl={post.avatar_url} size="xs" />
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate max-w-[160px]">
                            {authorName}
                          </span>
                          {isAgent && (
                            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-full">
                              Agent
                            </span>
                          )}
                          <span className="text-[11px] text-gray-400 dark:text-gray-500">{timeAgo(post.timestamp)}</span>
                        </div>

                        {/* Title */}
                        <h3 className="text-[15px] font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 mb-1.5 line-clamp-2 leading-snug transition-colors">
                          {post.title}
                        </h3>

                        {/* Body preview */}
                        {bodyText && (
                          <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-2.5 leading-relaxed">
                            {bodyText}
                          </p>
                        )}

                        {/* Footer */}
                        <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
                          <span className="flex items-center gap-1 hover:text-blue-500 transition-colors">
                            <MessageCircle className="w-3.5 h-3.5" />
                            {post.reply_count} {t('square.replies')}
                          </span>
                          <button
                            onClick={(e) => toggleLike(e, post.id)}
                            className={`flex items-center gap-1 transition-colors ${post.liked ? 'text-rose-500' : 'hover:text-rose-500'}`}
                          >
                            <Heart className={`w-3.5 h-3.5 ${post.liked ? 'fill-current' : ''}`} />
                            {post.likes > 0 && post.likes}
                          </button>
                          <button
                            onClick={(e) => toggleBookmark(e, post.id)}
                            className={`flex items-center gap-1 transition-colors ${post.bookmarked ? 'text-amber-500' : 'hover:text-amber-500'}`}
                          >
                            <Bookmark className={`w-3.5 h-3.5 ${post.bookmarked ? 'fill-current' : ''}`} />
                          </button>
                          {(post.quality_score ?? 0) > 0 && (
                            <span className="flex items-center gap-1 text-green-500 dark:text-green-400">
                              <Star className="w-3 h-3" />
                              {post.quality_score}
                            </span>
                          )}
                          {post.has_agent_reply && (
                            <span className="flex items-center gap-1 text-purple-500 dark:text-purple-400">
                              <Bot className="w-3 h-3" />
                              {t('square.agentJoined')}
                            </span>
                          )}
                          {(post.source_count ?? 0) > 0 && (
                            <span className="flex items-center gap-1">
                              <ExternalLink className="w-3 h-3" />
                              {post.source_count}
                            </span>
                          )}
                          <span className="hidden sm:inline-flex items-center gap-1 ml-auto bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full text-[10px]">
                            <Tag className="w-2.5 h-2.5" />
                            {post.category}/{post.sub}
                          </span>
                        </div>
                      </div>

                      {/* Thumbnail - right side (Zhihu style) */}
                      {previewImg && (
                        <div className="hidden sm:flex items-center pr-4 py-4">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={toThumbnailUrl(previewImg)}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="w-28 h-20 rounded-xl object-cover flex-shrink-0 border border-gray-200/60 dark:border-gray-700/60"
                          />
                        </div>
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
