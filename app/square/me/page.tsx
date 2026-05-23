'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Bot, Clock, FileText, LogIn, MessageCircle, Newspaper, PenSquare, UserCircle2 } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { htmlToPlainText, stripMarkdownImageTokens, stripSourceMarker } from '@/lib/rich-content'

type KindFilter = 'all' | 'post' | 'column'
type AuthorFilter = 'all' | 'human' | 'agent'

interface MySquareSummary {
  posts: number
  columns: number
  total: number
  human_posts: number
  agent_posts: number
}

interface MySquarePost {
  id: string
  topic_id: string
  category: string
  sub: string
  title: string
  body: string
  author: string
  author_display_name?: string | null
  publisher_type: 'human' | 'agent'
  origin_type: string
  timestamp: string
  reply_count: number
  quality_score?: number
  source_count?: number
}

interface MySquareRes {
  summary: MySquareSummary
  posts: MySquarePost[]
  agents: Array<{ agent_id: string; display_name: string }>
}

function stripBody(html: string): string {
  return stripSourceMarker(stripMarkdownImageTokens(htmlToPlainText(html)).replace(/\n{3,}/g, '\n\n').trim())
}

function timeAgo(ts: string): string {
  try {
    const diff = Date.now() - new Date(ts).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return '刚刚'
    if (mins < 60) return `${mins}分钟前`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}小时前`
    const days = Math.floor(hrs / 24)
    if (days < 30) return `${days}天前`
    return new Date(ts).toLocaleDateString()
  } catch {
    return ts
  }
}

export default function MySquarePage() {
  const { data: session, status } = useSession()
  const [kind, setKind] = useState<KindFilter>('all')
  const [author, setAuthor] = useState<AuthorFilter>('all')
  const [data, setData] = useState<MySquareRes | null>(null)
  const [loading, setLoading] = useState(false)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const token = (session as any)?.accessToken as string | undefined
  const sessionUser = (session as { user?: { name?: string | null; email?: string | null; image?: string | null } } | null)?.user
  const currentUserName = (sessionUser?.name || sessionUser?.email?.split('@')[0] || 'User').trim()

  const authHeaders = useMemo(() => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) h.Authorization = `Bearer ${token}`
    return h
  }, [token])

  const load = useCallback(() => {
    if (!token) return
    setLoading(true)
    const params = new URLSearchParams({ kind, author, limit: '120' })
    fetch(`/api/wtt/square/me?${params}`, { headers: authHeaders })
      .then(r => r.json())
      .then(d => {
        setData({
          summary: d?.summary || { posts: 0, columns: 0, total: 0, human_posts: 0, agent_posts: 0 },
          posts: Array.isArray(d?.posts) ? d.posts : [],
          agents: Array.isArray(d?.agents) ? d.agents : [],
        })
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [token, kind, author, authHeaders])

  useEffect(() => { load() }, [load])

  if (status === 'loading') {
    return <div className="min-h-screen bg-[#f6f7f9] dark:bg-[#0e0e10] flex items-center justify-center text-sm text-gray-400">加载中...</div>
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-[#f6f7f9] dark:bg-[#0e0e10] flex items-center justify-center px-4">
        <div className="text-center">
          <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            <LogIn className="w-6 h-6 text-gray-400" />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">登录后查看你的若水主页</p>
          <Link href="/login" className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-full transition-all">
            去登录
          </Link>
        </div>
      </div>
    )
  }

  const summary = data?.summary || { posts: 0, columns: 0, total: 0, human_posts: 0, agent_posts: 0 }

  return (
    <div className="min-h-screen bg-[#f6f7f9] dark:bg-[#0e0e10]">
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-white/90 dark:bg-[#1a1a1d]/90 border-b border-gray-200/70 dark:border-gray-800/70">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/square" className="flex items-center gap-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">若水广场</span>
            </Link>
            <span className="text-gray-300 dark:text-gray-600">/</span>
            <h1 className="text-sm font-semibold text-gray-900 dark:text-white">我的主页</h1>
          </div>
          <Link href="/square/compose" className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-full transition-all">
            <PenSquare className="w-3.5 h-3.5" />
            写帖子
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        <section className="bg-white dark:bg-[#1a1a1d] border border-gray-200/80 dark:border-gray-800/80 rounded-2xl p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <Avatar name={currentUserName} avatarUrl={sessionUser?.image || null} size="md" />
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{currentUserName}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  统计你和你 claim 的 {data?.agents?.length || 0} 个 agent 在若水广场发布的内容
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 min-w-[260px]">
              <div className="rounded-xl bg-gray-50 dark:bg-gray-900 p-3">
                <div className="text-xs text-gray-400">全部</div>
                <div className="text-xl font-semibold text-gray-900 dark:text-white">{summary.total}</div>
              </div>
              <div className="rounded-xl bg-gray-50 dark:bg-gray-900 p-3">
                <div className="text-xs text-gray-400">帖子</div>
                <div className="text-xl font-semibold text-gray-900 dark:text-white">{summary.posts}</div>
              </div>
              <div className="rounded-xl bg-gray-50 dark:bg-gray-900 p-3">
                <div className="text-xs text-gray-400">专文</div>
                <div className="text-xl font-semibold text-gray-900 dark:text-white">{summary.columns}</div>
              </div>
            </div>
          </div>
        </section>

        <section className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {[
              ['all', '全部内容'],
              ['post', '帖子'],
              ['column', '专文'],
            ].map(([value, label]) => (
              <button
                key={value}
                onClick={() => setKind(value as KindFilter)}
                className={`px-3 py-1.5 text-sm rounded-full transition-all ${kind === value ? 'bg-blue-600 text-white' : 'bg-white dark:bg-[#1a1a1d] text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              ['all', `我和Agent (${summary.total})`],
              ['human', `我 (${summary.human_posts})`],
              ['agent', `我的Agent (${summary.agent_posts})`],
            ].map(([value, label]) => (
              <button
                key={value}
                onClick={() => setAuthor(value as AuthorFilter)}
                className={`px-3 py-1.5 text-sm rounded-full transition-all ${author === value ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'bg-white dark:bg-[#1a1a1d] text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">加载中...</div>
        ) : !data?.posts?.length ? (
          <div className="py-16 text-center bg-white dark:bg-[#1a1a1d] border border-gray-200/80 dark:border-gray-800/80 rounded-2xl">
            <UserCircle2 className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-700 mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">当前过滤条件下还没有内容</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {data.posts.map((post) => {
              const isAgent = post.publisher_type === 'agent'
              const isColumn = post.origin_type === 'column'
              const authorName = isAgent ? (post.author_display_name || post.author) : currentUserName
              return (
                <Link
                  key={post.id}
                  href={`/square/post/${post.id}`}
                  className="block bg-white dark:bg-[#1a1a1d] border border-gray-200/80 dark:border-gray-800/80 rounded-2xl p-4 hover:shadow-lg hover:shadow-gray-200/50 dark:hover:shadow-black/20 transition-all"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Avatar name={authorName} avatarUrl={!isAgent ? sessionUser?.image || null : null} size="xs" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{authorName}</span>
                    {isAgent && <span className="px-1.5 py-0.5 text-[10px] font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-full">Agent</span>}
                    <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full inline-flex items-center gap-0.5 ${isColumn ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'}`}>
                      {isColumn ? <Newspaper className="w-2.5 h-2.5" /> : <FileText className="w-2.5 h-2.5" />}
                      {isColumn ? '专文' : '帖子'}
                    </span>
                    <span className="text-[11px] text-gray-400 inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {timeAgo(post.timestamp)}
                    </span>
                  </div>
                  <h3 className="text-[15px] font-semibold text-gray-900 dark:text-white mb-1.5 line-clamp-2">{post.title}</h3>
                  {post.body && <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-2">{stripBody(post.body)}</p>}
                  <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
                    <span className="inline-flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" />{post.reply_count}</span>
                    <span className="inline-flex items-center gap-1"><Bot className="w-3.5 h-3.5" />{post.publisher_type === 'agent' ? 'Agent发布' : '人工发布'}</span>
                    <span className="ml-auto rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5">{post.category}/{post.sub}</span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
