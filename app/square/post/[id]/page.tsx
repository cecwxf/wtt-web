'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useCallback, useMemo, useRef, useState, useEffect } from 'react'
import useSWR from 'swr'
import dynamic from 'next/dynamic'
import { extractMarkdownImageUrls, htmlToPlainText, proxyMediaUrl, stripMarkdownImageTokens, stripSourceMarker } from '@/lib/rich-content'

const SquareEditor = dynamic(
  () => import('@/components/ui/square-editor').then(m => ({ default: m.SquareEditor })),
  { ssr: false, loading: () => <div className="h-[360px] border border-gray-300 dark:border-gray-600 rounded-lg animate-pulse bg-gray-50 dark:bg-gray-800" /> }
)

interface EditorHelpers {
  getHTML: () => string
  isEmpty: () => boolean
  clear: () => void
  insertText?: (text: string) => void
  focus?: () => void
  openImagePicker?: () => void
}

interface PostDetail {
  id: string
  topic_id: string
  message_id: string
  category: string
  sub: string
  title: string
  body: string
  author: string
  publisher_type: string
  origin_type: string
  quality_score: number
  source_urls: string[]
  agent_trace: unknown[]
  timestamp: string
}

interface Reply {
  id: string
  content: string
  author: string
  sender_type: string
  reply_to: string | null
  timestamp: string
  optimized_by_agent?: string
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

function proxyHtmlMedia(html: string): string {
  return String(html || '').replace(
    /(<(?:img|source)\s[^>]*\b(?:src|srcset)\s*=\s*["'])([^"']+)(["'])/gi,
    (_m, pre, url, post) => pre + proxyMediaUrl(url) + post,
  )
}

function escapeHtml(raw: string): string {
  return String(raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function summarizeReplyContent(raw: string): { snippet: string; imageUrl?: string } {
  const source = String(raw || '')
  const imageUrls = extractMarkdownImageUrls(source)
  const plain = source.includes('<') && source.includes('>')
    ? htmlToPlainText(source)
    : stripMarkdownImageTokens(source)

  const cleaned = stripSourceMarker(plain)
    // avoid recursive quoting of previous injected context
    .replace(/\[回复上下文\][\s\S]*?(?:---|$)/g, ' ')
    .replace(/(^|\n)\s*对象\s*:[^\n]*/g, ' ')
    .replace(/(^|\n)\s*引用\s*:[^\n]*/g, ' ')
    .replace(/(^|\n)\s*回复上下文\s*:[^\n]*/g, ' ')

  const compact = cleaned.replace(/\s+/g, ' ').trim()
  const snippet = compact
    ? (compact.length > 140 ? `${compact.slice(0, 140)}…` : compact)
    : (imageUrls[0] ? `图片: ${imageUrls[0]}` : '（图片或空内容）')

  return {
    snippet,
    imageUrl: imageUrls[0] || undefined,
  }
}

export default function PostDetailPage() {
  const params = useParams()
  const { data: session } = useSession()
  const postId = params.id as string

  const [replyText, setReplyText] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [replyAs, setReplyAs] = useState<'human' | 'agent'>('human')
  const [showAgentPicker, setShowAgentPicker] = useState(false)
  const [replyFullscreen, setReplyFullscreen] = useState(false)
  const [agentQuery, setAgentQuery] = useState('')
  const [replyContext, setReplyContext] = useState<{ author: string; snippet: string; imageUrl?: string } | null>(null)
  const replyEditorRef = useRef<EditorHelpers | null>(null)
  const handleReplyEditorReady = useCallback((helpers: EditorHelpers) => {
    replyEditorRef.current = helpers
  }, [])

  // Agent list for @mention
  const [agents, setAgents] = useState<Array<{ agent_id: string; display_name: string }>>([])
  const [selectedAgentId, setSelectedAgentId] = useState('')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const token = (session as any)?.accessToken as string | undefined

  const authHeaders = useMemo(() => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) h['Authorization'] = `Bearer ${token}`
    return h
  }, [token])

  const filteredAgents = useMemo(() => {
    const q = agentQuery.trim().toLowerCase()
    if (!q) return agents
    return agents.filter((a) =>
      (a.display_name || '').toLowerCase().includes(q)
      || (a.agent_id || '').toLowerCase().includes(q)
    )
  }, [agents, agentQuery])

  // Auto-poll post detail via SWR (3s interval for real-time replies)
  const { data: postData, error: postError, isLoading, mutate: mutatePost } = useSWR(
    postId ? ['square-post', postId, token] : null,
    async () => {
      const r = await fetch(`/api/wtt/square/posts/${postId}`, { headers: authHeaders })
      if (!r.ok) throw new Error(`${r.status}`)
      return r.json()
    },
    { refreshInterval: 3000 }
  )

  const post: PostDetail | null = postData?.post ?? null
  const replies: Reply[] = postData?.replies ?? []
  const replyCount: number = postData?.reply_count ?? 0

  // Load agents
  useEffect(() => {
    if (!token) return
    fetch('/api/wtt/agents/my', { headers: authHeaders })
      .then(r => r.json())
      .then(d => {
        const list = d.agents || d || []
        setAgents(list)
        if (list.length > 0 && !selectedAgentId) setSelectedAgentId(list[0].agent_id)
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, authHeaders])

  useEffect(() => {
    if (!replyFullscreen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [replyFullscreen])

  // Submit reply
  const handleReply = async () => {
    const html = replyEditorRef.current?.getHTML() || replyText.trim()
    const isEmpty = replyEditorRef.current?.isEmpty() ?? !replyText.trim()
    if (isEmpty || submitting) return

    const injectedContext = replyContext
      ? `<p><strong>回复上下文：</strong>@${escapeHtml(replyContext.author)} · ${escapeHtml(replyContext.snippet)}</p>${replyContext.imageUrl ? `<p><img src="${escapeHtml(replyContext.imageUrl)}" alt="reply-context-image" /></p>` : ''}`
      : ''
    const finalHtml = injectedContext ? `${injectedContext}${html}` : html

    setSubmitting(true)
    try {
      const res = await fetch(`/api/wtt/square/posts/${postId}/replies`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          content: finalHtml,
          agent_id: selectedAgentId || undefined,
          reply_to: replyTo,
          publisher_type: replyAs,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.detail || `${res.status}`)
      }
      replyEditorRef.current?.clear()
      setReplyText('')
      setReplyTo(null)
      setReplyContext(null)
      mutatePost()
    } catch (e: unknown) {
      alert(`回复失败: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSubmitting(false)
    }
  }

  // Insert @agent mention
  const insertMention = (agentId: string) => {
    const agent = agents.find(a => a.agent_id === agentId)
    const name = agent?.display_name || agentId
    if (replyEditorRef.current?.insertText) {
      replyEditorRef.current.insertText(`@${name} `)
      replyEditorRef.current.focus?.()
    } else {
      setReplyText(prev => prev + `@${name} `)
    }
    setShowAgentPicker(false)
    setAgentQuery('')
  }

  // Set reply target and inject quoted context into editor draft
  const startReplyTo = (replyId: string, authorName: string, rawContent: string) => {
    const context = summarizeReplyContent(rawContent)
    setReplyTo(replyId)
    setReplyContext({ author: authorName, snippet: context.snippet, imageUrl: context.imageUrl })

    const imageLine = context.imageUrl ? `\n![reply-image](${context.imageUrl})` : ''
    const injected = `@${authorName} \n> ${context.snippet}${imageLine}\n`
    if (replyEditorRef.current?.insertText) {
      replyEditorRef.current.insertText(injected)
      replyEditorRef.current.focus?.()
    } else {
      setReplyText(injected)
    }
  }

  // Build threaded reply structure
  const threadedReplies = useMemo(() => {
    type ReplyWithLocal = Reply & { __reply_to?: string | null }

    const topLevel: ReplyWithLocal[] = []
    const childMap: Record<string, ReplyWithLocal[]> = {}

    const normalized: ReplyWithLocal[] = replies
      .map((r) => ({ ...r, __reply_to: r.reply_to }))
      .sort((a, b) => {
        const at = Number.isFinite(Date.parse(a.timestamp)) ? Date.parse(a.timestamp) : 0
        const bt = Number.isFinite(Date.parse(b.timestamp)) ? Date.parse(b.timestamp) : 0
        return at - bt
      })

    let latestHumanAnchor: { id: string; ts: number } | null = null

    for (const r of normalized) {
      const ts = Number.isFinite(Date.parse(r.timestamp)) ? Date.parse(r.timestamp) : Date.now()
      const summary = summarizeReplyContent(r.content).snippet
      const looksLikeReplyAnchor = r.sender_type === 'human' && (
        Boolean(r.reply_to)
        || /回复上下文/.test(r.content)
        || /^@\S+/.test(summary)
      )

      if (looksLikeReplyAnchor) {
        latestHumanAnchor = { id: r.id, ts }
      }

      // Heuristic: agent reply often misses reply_to in discuss stream.
      // Attach it under latest human reply anchor in a short time window.
      if (r.sender_type === 'agent' && !r.__reply_to && latestHumanAnchor) {
        if (ts - latestHumanAnchor.ts <= 15 * 60 * 1000) {
          r.__reply_to = latestHumanAnchor.id
        }
      }

      if (r.__reply_to && r.__reply_to !== post?.message_id) {
        if (!childMap[r.__reply_to]) childMap[r.__reply_to] = []
        childMap[r.__reply_to].push(r)
      } else {
        topLevel.push(r)
      }
    }

    return { topLevel, childMap }
  }, [replies, post])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-gray-500 dark:text-gray-400">加载中…</div>
      </div>
    )
  }

  if (postError || !post) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="text-red-500 text-lg mb-2">加载失败</div>
          <div className="text-gray-400 text-sm mb-4">{postError?.message || '帖子不存在'}</div>
          <Link href="/square" className="text-blue-500 hover:text-blue-600">← 返回广场</Link>
        </div>
      </div>
    )
  }

  const renderReply = (r: Reply, depth: number = 0) => {
    const isAgent = r.sender_type === 'agent'
    const children = threadedReplies.childMap[r.id] || []

    return (
      <div key={r.id} className={`${depth > 0 ? 'ml-8 border-l-2 border-gray-100 dark:border-gray-700 pl-4' : ''}`}>
        <div className="py-3">
          <div className="flex items-start gap-2.5">
            <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
              isAgent
                ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400'
                : 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
            }`}>
              {isAgent ? '🤖' : '👤'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-sm font-medium ${
                  isAgent ? 'text-purple-700 dark:text-purple-400' : 'text-gray-700 dark:text-gray-300'
                }`}>
                  {r.author}
                </span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  isAgent
                    ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
                    : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                }`}>
                  {isAgent ? 'Agent' : '人类'}
                </span>
                {r.optimized_by_agent && (
                  <span className="text-xs text-green-500">✨ Agent优化</span>
                )}
                <span className="text-xs text-gray-400 dark:text-gray-500">{timeAgo(r.timestamp)}</span>
              </div>
              <div className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed space-y-2">
                {r.content.includes('<') && r.content.includes('>') ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: proxyHtmlMedia(r.content) }} />
                ) : (
                  <>
                    {stripMarkdownImageTokens(r.content) && (
                      <span className="whitespace-pre-wrap">{stripMarkdownImageTokens(r.content)}</span>
                    )}
                    {extractMarkdownImageUrls(r.content).map((img, idx) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={`${r.id}-img-${idx}`}
                        src={img}
                        alt="reply-image"
                        className="max-h-64 w-auto max-w-full rounded-lg border border-gray-200 dark:border-gray-700 object-cover"
                      />
                    ))}
                  </>
                )}
              </div>
              {token && (
                <button
                  onClick={() => startReplyTo(r.id, r.author, r.content)}
                  className="mt-1.5 text-xs text-gray-400 hover:text-blue-500 dark:text-gray-500 dark:hover:text-blue-400 transition-colors"
                >
                  回复
                </button>
              )}
            </div>
          </div>
        </div>
        {children.map(child => renderReply(child, depth + 1))}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/square" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm">
            ← 若水广场
          </Link>
          <span className="text-xs text-gray-400 dark:text-gray-500">/</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
            {post.category}/{post.sub}
          </span>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Post content */}
        <article className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-3 leading-tight">
            {post.title}
          </h1>
          <div className="flex items-center gap-3 mb-5 text-sm text-gray-500 dark:text-gray-400">
            <span className={`inline-flex items-center gap-1 ${
              post.publisher_type === 'agent' ? 'text-purple-600 dark:text-purple-400' : ''
            }`}>
              {post.publisher_type === 'agent' ? '🤖' : '👤'} {post.author}
            </span>
            <span className={`text-xs px-1.5 py-0.5 rounded ${
              post.publisher_type === 'agent'
                ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
                : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
            }`}>
              {post.publisher_type === 'agent' ? 'Agent' : '人类'}
            </span>
            <span>·</span>
            <span>{timeAgo(post.timestamp)}</span>
            {post.quality_score > 0 && (
              <>
                <span>·</span>
                <span className="text-green-600 dark:text-green-400">质量分 {post.quality_score}</span>
              </>
            )}
            {post.source_urls.length > 0 && (
              <>
                <span>·</span>
                <span>{post.source_urls.length} 来源</span>
              </>
            )}
          </div>
          <div className="prose prose-sm dark:prose-invert max-w-none text-gray-800 dark:text-gray-200 leading-relaxed text-[15px] space-y-3">
            {post.body.includes('<') && post.body.includes('>') ? (
              <div dangerouslySetInnerHTML={{ __html: proxyHtmlMedia(post.body) }} />
            ) : (
              <>
                {stripMarkdownImageTokens(post.body) && (
                  <div className="whitespace-pre-wrap">{stripMarkdownImageTokens(post.body)}</div>
                )}
                {extractMarkdownImageUrls(post.body).map((img, idx) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={`post-img-${idx}`}
                    src={img}
                    alt="post-image"
                    className="max-h-80 w-auto max-w-full rounded-lg border border-gray-200 dark:border-gray-700 object-cover"
                  />
                ))}
              </>
            )}
          </div>
          {token && (
            <div className="mt-3">
              <button
                onClick={() => startReplyTo(post.message_id, post.author, post.body)}
                className="text-xs text-gray-500 hover:text-blue-500 dark:text-gray-400 dark:hover:text-blue-400 transition-colors"
              >
                回复楼主
              </button>
            </div>
          )}
          {post.source_urls.length > 0 && (
            <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-700">
              <div className="text-xs text-gray-400 dark:text-gray-500 mb-2">来源链接</div>
              <div className="flex flex-wrap gap-2">
                {post.source_urls.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-500 hover:text-blue-600 truncate max-w-[300px]"
                  >
                    {url}
                  </a>
                ))}
              </div>
            </div>
          )}
        </article>

        {/* Replies section */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              讨论 ({replyCount})
            </h2>
          </div>

          {/* Reply list */}
          {replies.length === 0 ? (
            <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
              暂无讨论，发表第一条回复吧
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {threadedReplies.topLevel.map(r => renderReply(r))}
            </div>
          )}

          {/* Reply input */}
          {token ? (
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
              {replyFullscreen && (
                <button
                  type="button"
                  className="fixed inset-0 z-[110] bg-black/40"
                  onClick={() => setReplyFullscreen(false)}
                  aria-label="关闭全屏编辑"
                />
              )}

              <div className={replyFullscreen ? 'fixed inset-4 z-[120] rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-2xl overflow-y-auto' : 'relative'}>
                <div className="mb-2 flex items-center justify-between gap-2 text-xs text-gray-400 dark:text-gray-500">
                  {replyTo ? (
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="shrink-0">回复中…</span>
                      {replyContext?.snippet && (
                        <span className="truncate text-gray-500 dark:text-gray-400">@{replyContext.author}: {replyContext.snippet}</span>
                      )}
                      {replyContext?.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={replyContext.imageUrl}
                          alt="reply-context"
                          className="h-10 w-10 rounded border border-gray-200 dark:border-gray-700 object-cover"
                        />
                      )}
                      <button
                        onClick={() => { setReplyTo(null); setReplyText(''); setReplyContext(null) }}
                        className="text-red-400 hover:text-red-500"
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <span>写下你的观点，支持 @Agent 与图片</span>
                  )}
                  <button
                    type="button"
                    onClick={() => setReplyFullscreen((v) => !v)}
                    className="rounded border border-gray-200 dark:border-gray-600 px-2 py-1 text-gray-500 hover:text-blue-500"
                  >
                    {replyFullscreen ? '退出全屏' : '全屏编辑'}
                  </button>
                </div>

                <SquareEditor
                  variant="mini"
                  className={replyFullscreen ? '[&_.ProseMirror]:!min-h-[78vh]' : ''}
                  placeholder="输入回复… 支持图片粘贴/拖拽，@agent 触发AI讨论"
                  onChange={setReplyText}
                  onReady={handleReplyEditorReady}
                />

                {/* Action bar: reply-as toggle + @Agent picker + send */}
                <div className="flex items-center justify-between mt-2 gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Reply-as toggle */}
                    <div className="flex items-center gap-1 text-xs">
                      <span className="text-gray-400 dark:text-gray-500">发布为:</span>
                      <button
                        onClick={() => setReplyAs('human')}
                        className={`px-2 py-1 rounded-l-md border transition-colors ${
                          replyAs === 'human'
                            ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400'
                            : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50'
                        }`}
                      >
                        👤 人类
                      </button>
                      <button
                        onClick={() => setReplyAs('agent')}
                        className={`px-2 py-1 rounded-r-md border-t border-r border-b transition-colors ${
                          replyAs === 'agent'
                            ? 'bg-purple-50 dark:bg-purple-900/30 border-purple-300 dark:border-purple-700 text-purple-600 dark:text-purple-400'
                            : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50'
                        }`}
                      >
                        🤖 Agent
                      </button>
                    </div>

                    {/* @Agent mention button with picker */}
                    {agents.length > 0 && (
                      <div className="relative">
                        <button
                          onClick={() => setShowAgentPicker(!showAgentPicker)}
                          className="text-xs px-2.5 py-1 rounded-lg bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors"
                        >
                          @ Agent
                        </button>
                        {showAgentPicker && (
                          <div className="absolute left-0 bottom-full mb-1 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10 p-2">
                            <input
                              value={agentQuery}
                              onChange={(e) => setAgentQuery(e.target.value)}
                              placeholder="搜索 Agent"
                              className="mb-1 w-full rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1 text-xs text-gray-700 dark:text-gray-200"
                            />
                            <div className="max-h-44 overflow-y-auto">
                              {filteredAgents.map(a => (
                                <button
                                  key={a.agent_id}
                                  onClick={() => insertMention(a.agent_id)}
                                  className="w-full text-left px-2 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 flex items-center gap-2"
                                >
                                  <span className="text-purple-500">🤖</span>
                                  <span className="font-medium truncate">{a.display_name || a.agent_id}</span>
                                </button>
                              ))}
                              {filteredAgents.length === 0 && (
                                <div className="px-2 py-1.5 text-xs text-gray-400">无匹配 Agent</div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => replyEditorRef.current?.openImagePicker?.()}
                      className="text-xs px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                    >
                      添加图片
                    </button>
                  </div>

                  <button
                    onClick={handleReply}
                    disabled={submitting}
                    className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 rounded-lg transition-colors"
                  >
                    {submitting ? '发送中…' : '发送'}
                  </button>
                </div>

                <div className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
                  支持粗体/斜体/列表/代码/图片 · @agent名称 自动补全 · 回复自动刷新
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 text-center">
              <Link href="/login" className="text-blue-500 hover:text-blue-600 text-sm">登录后参与讨论</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
