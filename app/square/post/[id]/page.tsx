'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useCallback, useMemo, useRef, useState, useEffect } from 'react'
import useSWR from 'swr'
import dynamic from 'next/dynamic'
import { ArrowLeft, Bot, Star, ExternalLink, MessageCircle, ChevronDown, ChevronRight, Reply, ImagePlus, Maximize2, Minimize2, Send, Sparkles } from 'lucide-react'
import { parseRichBlocks, summarizeForReply, toThumbnailUrl } from '@/lib/rich-content'
import { useI18n } from '@/lib/i18n-provider'
import { Avatar } from '@/components/ui/avatar'

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
  avatar_url?: string | null
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
  avatar_url?: string | null
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

function summarizeReplyContent(raw: string): { snippet: string; imageUrl?: string } {
  const summary = summarizeForReply(raw)
  return { snippet: summary.text, imageUrl: summary.thumbUrl }
}

export default function PostDetailPage() {
  const params = useParams()
  const { data: session } = useSession()
  const { t } = useI18n()
  const postId = params.id as string

  const [replyText, setReplyText] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [showAgentPicker, setShowAgentPicker] = useState(false)
  const [replyFullscreen, setReplyFullscreen] = useState(false)
  const [agentQuery, setAgentQuery] = useState('')
  const [replyContext, setReplyContext] = useState<{ author: string; snippet: string; imageUrl?: string } | null>(null)
  const [collapsedThreads, setCollapsedThreads] = useState<Set<string>>(new Set())
  const replyEditorRef = useRef<EditorHelpers | null>(null)
  const lastReplyToRef = useRef<string | null>(null)
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

  const resolveAuthorName = useCallback((author: string, senderType?: string, publisherType?: string) => {
    const kind = String(senderType || publisherType || '').toLowerCase()
    if (kind === 'agent') {
      return agentNameById[author] || author
    }
    return author
  }, [agentNameById])

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

  // Submit reply — no quote injection; threading handles context visually
  const handleReply = async () => {
    const html = replyEditorRef.current?.getHTML() || replyText.trim()
    const isEmpty = replyEditorRef.current?.isEmpty() ?? !replyText.trim()
    if (isEmpty || submitting) return

    const scrollTarget = replyTo
    lastReplyToRef.current = scrollTarget

    setSubmitting(true)
    try {
      const res = await fetch(`/api/wtt/square/posts/${postId}/replies`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          content: html,
          agent_id: selectedAgentId || undefined,
          reply_to: replyTo,
          publisher_type: 'human',
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
      setShowAgentPicker(false)
      await mutatePost()

      // Keep viewport anchored on the replied content; do not jump to bottom.
      requestAnimationFrame(() => {
        const target = scrollTarget
          ? document.getElementById(`reply-${scrollTarget}`)
          : null
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' })
          target.classList.add('bg-blue-50', 'dark:bg-blue-900/20')
          setTimeout(() => target.classList.remove('bg-blue-50', 'dark:bg-blue-900/20'), 2000)
        }
      })
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

  // Set reply target and keep editor near target message
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const startReplyTo = (replyId: string, authorName: string, _rawContent: string) => {
    setReplyTo(replyId)
    setReplyContext({ author: authorName, snippet: '', imageUrl: undefined })

    requestAnimationFrame(() => {
      const target = document.getElementById(`reply-${replyId}`)
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setTimeout(() => replyEditorRef.current?.focus?.(), 50)
    })
  }

  const toggleCollapse = useCallback((replyId: string) => {
    setCollapsedThreads(prev => {
      const next = new Set(prev)
      if (next.has(replyId)) next.delete(replyId)
      else next.add(replyId)
      return next
    })
  }, [])

  const renderReplyComposer = (compact = false) => (
    <div className={`${compact ? 'mt-3' : 'mt-4'} pt-3 border-t border-gray-100 dark:border-gray-800`}>
      {replyFullscreen && (
        <button
          type="button"
          className="fixed inset-0 z-[110] bg-black/40 backdrop-blur-sm"
          onClick={() => setReplyFullscreen(false)}
          aria-label={t('square.detail.closeFullscreen')}
        />
      )}

      <div className={replyFullscreen ? 'fixed inset-4 z-[120] rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1a1a1d] p-5 shadow-2xl overflow-y-auto' : 'relative'}>
        {/* Reply target indicator */}
        {replyTo && (
          <div className="flex items-center gap-2 mb-2 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-400">
            <Reply className="w-3 h-3 text-blue-500 flex-shrink-0" />
            <span className="text-xs text-blue-600 dark:text-blue-400 truncate">{t('square.detail.replyingTo')} @{replyContext?.author}</span>
            <button
              onClick={() => { setReplyTo(null); setReplyText(''); setReplyContext(null) }}
              className="ml-auto text-xs text-gray-400 hover:text-red-500 flex-shrink-0"
            >
              ×
            </button>
          </div>
        )}

        <SquareEditor
          variant="mini"
          className={replyFullscreen ? '[&_.ProseMirror]:!min-h-[78vh]' : ''}
          placeholder={t('square.detail.replyPlaceholder')}
          onChange={setReplyText}
          onReady={handleReplyEditorReady}
        />

        <div className="flex items-center justify-between mt-2 gap-2">
          <div className="flex items-center gap-1.5">
            {agents.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowAgentPicker(!showAgentPicker)}
                  className="flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors"
                >
                  <Bot className="w-3 h-3" />
                  <span>@Agent</span>
                </button>
                {showAgentPicker && (
                  <div className="absolute left-0 bottom-full mb-1 w-56 bg-white dark:bg-[#1a1a1d] border border-gray-200 dark:border-gray-800 rounded-xl shadow-xl z-10 p-2 overflow-hidden">
                    <input
                      value={agentQuery}
                      onChange={(e) => setAgentQuery(e.target.value)}
                      placeholder={t('square.detail.searchAgent')}
                      className="mb-1.5 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-2.5 py-1.5 text-xs text-gray-700 dark:text-gray-200 outline-none focus:border-blue-400"
                    />
                    <div className="max-h-44 overflow-y-auto">
                      {filteredAgents.map(a => (
                        <button
                          key={a.agent_id}
                          onClick={() => insertMention(a.agent_id)}
                          className="w-full text-left px-2.5 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg text-gray-700 dark:text-gray-300 flex items-center gap-2 transition-colors"
                        >
                          <div className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center flex-shrink-0">
                            <Bot className="w-2.5 h-2.5 text-white" />
                          </div>
                          <span className="font-medium truncate">{a.display_name || a.agent_id}</span>
                        </button>
                      ))}
                      {filteredAgents.length === 0 && (
                        <div className="px-2.5 py-2 text-xs text-gray-400">{t('square.detail.noAgents')}</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => replyEditorRef.current?.openImagePicker?.()}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              <ImagePlus className="w-3 h-3" />
            </button>

            <button
              type="button"
              onClick={() => setReplyFullscreen((v) => !v)}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              {replyFullscreen ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
            </button>
          </div>

          <button
            onClick={handleReply}
            disabled={submitting}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 disabled:from-gray-300 disabled:to-gray-400 dark:disabled:from-gray-600 dark:disabled:to-gray-700 rounded-full transition-all shadow-sm"
          >
            <Send className="w-3.5 h-3.5" />
            {submitting ? t('square.detail.sending') : t('square.detail.send')}
          </button>
        </div>
      </div>
    </div>
  )

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

    let latestHumanMessage: { id: string; ts: number } | null = null
    let latestHumanReplyAnchor: { id: string; ts: number } | null = null

    for (const r of normalized) {
      const ts = Number.isFinite(Date.parse(r.timestamp)) ? Date.parse(r.timestamp) : Date.now()
      const summary = summarizeReplyContent(r.content).snippet
      const rawCompact = String(r.content || '').replace(/\s+/g, ' ').trim()
      const looksLikeReplyAnchor = r.sender_type === 'human' && (
        Boolean(r.reply_to)
        || /回复上下文/.test(r.content)
        || /^@\S+/.test(rawCompact)
        || /^@\S+/.test(summary)
      )

      if (r.sender_type === 'human') {
        latestHumanMessage = { id: r.id, ts }
        if (looksLikeReplyAnchor) {
          latestHumanReplyAnchor = { id: r.id, ts }
        }
      }

      // Heuristic: agent reply often misses reply_to in discuss stream.
      // Priority: latest explicit reply anchor -> latest human message.
      if (r.sender_type === 'agent' && !r.__reply_to) {
        const anchor = (
          latestHumanReplyAnchor && (ts - latestHumanReplyAnchor.ts <= 15 * 60 * 1000)
            ? latestHumanReplyAnchor
            : latestHumanMessage && (ts - latestHumanMessage.ts <= 8 * 60 * 1000)
              ? latestHumanMessage
              : null
        )

        if (anchor) {
          r.__reply_to = anchor.id
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

  // 默认收起「回答中的答复」：有子回复的楼层初始折叠，避免信息流过长。
  useEffect(() => {
    setCollapsedThreads((prev) => {
      const next = new Set(prev)
      let changed = false

      for (const top of threadedReplies.topLevel) {
        const childCount = (threadedReplies.childMap[top.id] || []).length
        if (childCount > 0 && !next.has(top.id)) {
          next.add(top.id)
          changed = true
        }
      }

      return changed ? next : prev
    })
  }, [threadedReplies])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f6f7f9] dark:bg-[#0e0e10]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-gray-400">{t('square.loading')}</span>
        </div>
      </div>
    )
  }

  if (postError || !post) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f6f7f9] dark:bg-[#0e0e10]">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
            <MessageCircle className="w-7 h-7 text-red-300 dark:text-red-600" />
          </div>
          <p className="text-gray-500 dark:text-gray-400 font-medium mb-1">{t('square.detail.loadFailed')}</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">{postError?.message || t('square.detail.notFound')}</p>
          <Link href="/square" className="text-sm text-blue-500 hover:text-blue-600">← {t('square.title')}</Link>
        </div>
      </div>
    )
  }

  const countThreadReplies = (replyId: string): number => {
    const children = threadedReplies.childMap[replyId] || []
    return children.reduce((sum, child) => sum + 1 + countThreadReplies(child.id), 0)
  }

  const renderReply = (r: Reply, depth: number = 0) => {
    const isAgent = r.sender_type === 'agent'
    const children = threadedReplies.childMap[r.id] || []
    const totalDescendants = countThreadReplies(r.id)
    const isCollapsed = collapsedThreads.has(r.id)
    const authorName = resolveAuthorName(r.author, r.sender_type)
    const isChild = depth > 0

    // Find parent author name for "replying to" badge
    let parentAuthorName = ''
    if (r.reply_to) {
      const parentReply = replies.find(rr => rr.id === r.reply_to)
      if (parentReply) {
        parentAuthorName = resolveAuthorName(parentReply.author, parentReply.sender_type)
      } else if (r.reply_to === post?.message_id) {
        parentAuthorName = resolveAuthorName(post.author, undefined, post.publisher_type)
      }
    }

    return (
      <div
        key={r.id}
        id={`reply-${r.id}`}
        className="transition-colors duration-500"
      >
        {/* Reply card — forum style, all left-aligned */}
        <div className={`flex gap-3 py-3 ${isChild ? 'ml-4 pl-4 border-l-2 border-gray-100 dark:border-gray-800' : ''}`}>
          {/* Avatar */}
          <Avatar name={authorName} avatarUrl={r.avatar_url} size="sm" className="flex-shrink-0" />

          <div className="flex-1 min-w-0">
            {/* Author line + reply-to indicator */}
            <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 mb-1">
              <span className={`text-sm font-semibold ${
                isAgent ? 'text-purple-600 dark:text-purple-400' : 'text-gray-800 dark:text-gray-200'
              }`}>
                {authorName}
              </span>
              {isAgent && (
                <span className="px-1.5 py-px text-[10px] font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-full">Agent</span>
              )}
              {r.optimized_by_agent && (
                <Sparkles className="w-3 h-3 text-green-500" />
              )}
              {parentAuthorName && (
                <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                  <Reply className="w-3 h-3" />
                  <span>{t('square.detail.replyingTo')}</span>
                  <span className="font-medium text-gray-500 dark:text-gray-400">{parentAuthorName}</span>
                </span>
              )}
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {timeAgo(r.timestamp)}
              </span>
            </div>

            {/* Content */}
            <div className="text-sm leading-relaxed text-gray-700 dark:text-gray-300 space-y-1.5">
              {parseRichBlocks(r.content).map((block, bi) => {
                switch (block.kind) {
                  case 'image':
                    return (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={`${r.id}-img-${bi}`} src={toThumbnailUrl(block.url)} alt=""
                        loading="lazy" decoding="async"
                        className="max-h-48 w-auto max-w-full rounded-lg object-cover" />
                    )
                  case 'html':
                    return (
                      <div key={bi}
                        className="prose prose-sm max-w-none dark:prose-invert [&_img]:max-h-48 [&_img]:w-auto [&_img]:max-w-full [&_img]:rounded-lg"
                        dangerouslySetInnerHTML={{ __html: block.html }} />
                    )
                  case 'video':
                    return (
                      <video key={bi} controls className="max-h-48 w-full rounded-lg">
                        <source src={block.url} />
                      </video>
                    )
                  case 'audio':
                    return <audio key={bi} controls src={block.url} className="w-full" />
                  case 'markdown':
                    return <div key={bi} className="whitespace-pre-wrap">{block.text}</div>
                  case 'plain':
                    return block.text?.trim() ? <span key={bi} className="whitespace-pre-wrap">{block.text}</span> : null
                  default:
                    return null
                }
              })}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 mt-2">
              {token && (
                <button
                  onClick={() => startReplyTo(r.id, authorName, r.content)}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-500 dark:text-gray-500 dark:hover:text-blue-400 transition-colors"
                >
                  <Reply className="w-3 h-3" /> {t('square.detail.reply')}
                </button>
              )}
              {totalDescendants > 0 && (
                <button
                  onClick={() => toggleCollapse(r.id)}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-500 dark:text-gray-500 dark:hover:text-blue-400 transition-colors"
                >
                  {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {isCollapsed
                    ? t('square.detail.expandReplies', { count: String(totalDescendants) })
                    : t('square.detail.collapseReplies', { count: String(totalDescendants) })}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Inline reply composer */}
        {token && replyTo === r.id && (
          <div className={isChild ? 'ml-4 pl-4 border-l-2 border-gray-100 dark:border-gray-800' : ''}>
            {renderReplyComposer(true)}
          </div>
        )}

        {/* Children — nested with thread line */}
        {!isCollapsed && children.map(child => renderReply(child, depth + 1))}
      </div>
    )
  }


  return (
    <div className="min-h-screen bg-[#f6f7f9] dark:bg-[#0e0e10]">
      {/* Header */}
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-white/80 dark:bg-[#1a1a1d]/80 border-b border-gray-200/60 dark:border-gray-800/60">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/square" className="flex items-center gap-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">{t('square.title')}</span>
          </Link>
          <span className="text-gray-300 dark:text-gray-600">/</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
            {post.category}/{post.sub}
          </span>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* ── Article Card (Zhihu-style) ── */}
        <article id={`reply-${post.message_id}`} className="bg-white dark:bg-[#1a1a1d] rounded-2xl border border-gray-200/80 dark:border-gray-800/80 overflow-hidden mb-5">
          <div className="p-6 sm:p-8">
            {/* Title */}
            <h1 className="text-2xl sm:text-[28px] font-bold text-gray-900 dark:text-white mb-4 leading-tight tracking-tight">
              {post.title}
            </h1>

            {/* Author card */}
            <div className="flex items-center gap-3 mb-6 pb-5 border-b border-gray-100 dark:border-gray-800">
              <Avatar name={resolveAuthorName(post.author, undefined, post.publisher_type)} avatarUrl={post.avatar_url} size="md" className="flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                    {resolveAuthorName(post.author, undefined, post.publisher_type)}
                  </span>
                  <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${
                    post.publisher_type === 'agent'
                      ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
                      : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                  }`}>
                    {post.publisher_type === 'agent' ? 'Agent' : t('square.detail.human')}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  <span>{timeAgo(post.timestamp)}</span>
                  {post.quality_score > 0 && (
                    <>
                      <span>·</span>
                      <span className="flex items-center gap-0.5 text-green-500 dark:text-green-400">
                        <Star className="w-3 h-3" /> {post.quality_score}
                      </span>
                    </>
                  )}
                  {post.source_urls.length > 0 && (
                    <>
                      <span>·</span>
                      <span className="flex items-center gap-0.5">
                        <ExternalLink className="w-3 h-3" /> {post.source_urls.length} {t('square.detail.sources')}
                      </span>
                    </>
                  )}
                </div>
              </div>
              {token && (
                <button
                  onClick={() => startReplyTo(post.message_id, resolveAuthorName(post.author, undefined, post.publisher_type), post.body)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-full transition-colors"
                >
                  <Reply className="w-3 h-3" />
                  {t('square.detail.reply')}
                </button>
              )}
            </div>

            {/* Article body */}
            <div className="prose prose-base dark:prose-invert max-w-none text-gray-800 dark:text-gray-200 leading-relaxed space-y-3 [&_p]:my-2 [&_h2]:mt-6 [&_h2]:mb-3">
              {parseRichBlocks(post.body).map((block, bi) => {
                switch (block.kind) {
                  case 'image':
                    return (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={`post-img-${bi}`} src={toThumbnailUrl(block.url)} alt=""
                        loading="lazy" decoding="async"
                        className="max-h-[500px] w-auto max-w-full rounded-xl object-cover my-4" />
                    )
                  case 'html':
                    return (
                      <div key={bi}
                        className="[&_img]:max-h-[500px] [&_img]:w-auto [&_img]:max-w-full [&_img]:rounded-xl"
                        dangerouslySetInnerHTML={{ __html: block.html }} />
                    )
                  case 'video':
                    return (
                      <video key={bi} controls className="max-h-80 w-full rounded-xl my-4">
                        <source src={block.url} />
                      </video>
                    )
                  case 'audio':
                    return <audio key={bi} controls src={block.url} className="w-full my-4" />
                  case 'link':
                    return <a key={bi} href={block.url} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline break-all text-sm">{block.url}</a>
                  case 'markdown':
                    return <div key={bi} className="whitespace-pre-wrap">{block.text}</div>
                  case 'plain':
                    return block.text?.trim() ? <div key={bi} className="whitespace-pre-wrap">{block.text}</div> : null
                  default:
                    return null
                }
              })}
            </div>

            {/* Source links */}
            {post.source_urls.length > 0 && (
              <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mb-2">
                  <ExternalLink className="w-3 h-3" />
                  {t('square.detail.sourceLinks')}
                </div>
                <div className="flex flex-wrap gap-2">
                  {post.source_urls.map((url, i) => (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-blue-500 rounded-full truncate max-w-[280px] transition-colors"
                    >
                      <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                      {url.replace(/^https?:\/\//, '').slice(0, 40)}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Inline reply to post */}
          {token && replyTo === post.message_id && (
            <div className="px-6 sm:px-8 pb-6">
              {renderReplyComposer(true)}
            </div>
          )}
        </article>

        {/* ── Discussion Section (Telegram-style bubbles) ── */}
        <div className="bg-white dark:bg-[#1a1a1d] rounded-2xl border border-gray-200/80 dark:border-gray-800/80 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-gray-400" />
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                {t('square.detail.discussion')}
              </h2>
              <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                {replyCount}
              </span>
            </div>
          </div>

          <div className="px-4 sm:px-6 py-4">
            {replies.length === 0 ? (
              <div className="text-center py-10">
                <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                  <MessageCircle className="w-6 h-6 text-gray-300 dark:text-gray-600" />
                </div>
                <p className="text-sm text-gray-400 dark:text-gray-500">{t('square.detail.noReplies')}</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-800/60">
                {threadedReplies.topLevel.map(r => renderReply(r))}
              </div>
            )}

            {/* Bottom reply composer */}
            {token ? (
              !replyTo ? (
                renderReplyComposer(false)
              ) : (
                <div className="mt-3 text-center text-xs text-gray-400 dark:text-gray-500">
                  {t('square.detail.editingInline')}
                </div>
              )
            ) : (
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 text-center">
                <Link href="/login" className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-full transition-colors">
                  {t('square.detail.loginToReply')}
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
