'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useCallback, useMemo, useRef, useState, useEffect } from 'react'
import useSWR from 'swr'
import dynamic from 'next/dynamic'
import { ArrowLeft, Bot, Star, ExternalLink, MessageCircle, ChevronDown, ChevronRight, Reply, ImagePlus, Maximize2, Minimize2, Send, Sparkles, Heart, Bookmark, X, ArrowUpDown, Globe, Coins, Loader2, Zap, AlertCircle, Pencil, Check } from 'lucide-react'
import { parseRichBlocks, summarizeForReply, toThumbnailUrl } from '@/lib/rich-content'
import { useI18n } from '@/lib/i18n-provider'
import { Avatar } from '@/components/ui/avatar'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'

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
  likes?: number
  liked?: boolean
  bookmarked?: boolean
}

interface ReplyData {
  id: string
  content: string
  author: string
  avatar_url?: string | null
  sender_type: string
  reply_to: string | null
  timestamp: string
  optimized_by_agent?: string
  likes?: number
  liked?: boolean
}

// ── i18n-aware timeAgo ──
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

function summarizeReplyContent(raw: string): { snippet: string; imageUrl?: string } {
  const summary = summarizeForReply(raw)
  return { snippet: summary.text, imageUrl: summary.thumbUrl }
}

// ── Image Lightbox ──
function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white/80 hover:bg-black/70 hover:text-white transition-colors"
      >
        <X className="h-5 w-5" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
        onClick={e => e.stopPropagation()}
      />
    </div>
  )
}

// ── Clickable Image ──
function ClickableImage({ src, className }: { src: string; className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={toThumbnailUrl(src)}
        alt=""
        loading="lazy"
        decoding="async"
        className={`cursor-zoom-in hover:opacity-90 transition-opacity ${className || ''}`}
        onClick={() => setOpen(true)}
      />
      {open && <ImageLightbox src={src} onClose={() => setOpen(false)} />}
    </>
  )
}

// ── Markdown Renderer ──
function MarkdownBlock({ text, className }: { text: string; className?: string }) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className: cn, children, ...props }) {
            const match = /language-(\w+)/.exec(cn || '')
            const codeStr = String(children).replace(/\n$/, '')
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
          table({ children, ...props }) {
            return <div className="overflow-x-auto my-4"><table className="min-w-full border-collapse border border-slate-300 dark:border-zinc-600" {...props}>{children}</table></div>
          },
          th({ children, ...props }) {
            return <th className="border border-slate-300 dark:border-zinc-600 bg-slate-100 dark:bg-zinc-800 px-3 py-2 text-left text-sm font-semibold" {...props}>{children}</th>
          },
          td({ children, ...props }) {
            return <td className="border border-slate-300 dark:border-zinc-600 px-3 py-2 text-sm" {...props}>{children}</td>
          },
          blockquote({ children, ...props }) {
            return <blockquote className="border-l-4 border-indigo-300 dark:border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/20 pl-4 py-2 my-4 italic" {...props}>{children}</blockquote>
          },
          img({ src, alt, ...props }) {
            return <figure className="my-4"><img src={src} alt={alt || ''} className="rounded-lg shadow-md max-w-full" {...props} />{alt && <figcaption className="text-center text-xs text-slate-400 mt-2">{alt}</figcaption>}</figure>
          },
          hr() {
            return <hr className="my-8 border-slate-300 dark:border-zinc-600" />
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}

export default function PostDetailPage() {
  const params = useParams()
  const { data: session } = useSession()
  const { t, locale, toggleLocale } = useI18n()
  const timeAgo = useTimeAgo()
  const postId = params.id as string

  const [replyText, setReplyText] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [showAgentPicker, setShowAgentPicker] = useState(false)
  const [replyFullscreen, setReplyFullscreen] = useState(false)
  const [agentQuery, setAgentQuery] = useState('')
  const [replyContext, setReplyContext] = useState<{ author: string; snippet: string; imageUrl?: string } | null>(null)
  const [collapsedThreads, setCollapsedThreads] = useState<Set<string>>(new Set())
  const [replySortByLikes, setReplySortByLikes] = useState(true)
  const replyEditorRef = useRef<EditorHelpers | null>(null)
  const lastReplyToRef = useRef<string | null>(null)
  const handleReplyEditorReady = useCallback((helpers: EditorHelpers) => {
    replyEditorRef.current = helpers
  }, [])

  const [agents, setAgents] = useState<Array<{ agent_id: string; display_name: string }>>([])
  const [selectedAgentId, setSelectedAgentId] = useState('')

  // @Agent dispatch state
  const [showDispatch, setShowDispatch] = useState(false)
  const [dispatchTags, setDispatchTags] = useState<string[]>([])
  const [dispatching, setDispatching] = useState(false)
  const [dispatchError, setDispatchError] = useState('')
  const [dispatchSuccess, setDispatchSuccess] = useState('')
  const [dailyRemaining, setDailyRemaining] = useState<number | null>(null)
  const [dailyLimit, setDailyLimit] = useState(10)
  const [availableTags, setAvailableTags] = useState<Array<{ key: string; label: string }>>([])

  // Edit state
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editBody, setEditBody] = useState('')
  const [saving, setSaving] = useState(false)
  const editEditorRef = useRef<EditorHelpers | null>(null)
  const handleEditEditorReady = useCallback((helpers: EditorHelpers) => {
    editEditorRef.current = helpers
  }, [])
  const TAG_ICONS: Record<string, string> = {
    coding: '💻', medical: '🏥', art: '🎨', emotional: '💝',
    research: '🔬', finance: '📊', education: '📚', writing: '✍️',
    translation: '🌐', legal: '⚖️',
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const token = (session as any)?.accessToken as string | undefined

  const authHeaders = useMemo(() => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) h['Authorization'] = `Bearer ${token}`
    return h
  }, [token])

  // Load economy data when dispatch modal opens
  useEffect(() => {
    if (!showDispatch || !token) return
    fetch('/api/wtt/economy/credits', { headers: authHeaders })
      .then(r => r.json())
      .then(d => {
        setDailyRemaining(d.daily_remaining ?? null)
        setDailyLimit(d.daily_limit ?? 10)
      })
      .catch(() => {})
    fetch('/api/wtt/economy/tags')
      .then(r => r.json())
      .then(d => setAvailableTags(d.tags || []))
      .catch(() => {})
  }, [showDispatch, token, authHeaders])

  const handleDispatchAgent = async () => {
    if (dispatchTags.length === 0) { setDispatchError(t('economy.requestSelectTags')); return }
    setDispatching(true)
    setDispatchError('')
    setDispatchSuccess('')
    try {
      const res = await fetch('/api/wtt/economy/request-agent', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ post_id: postId, tags: dispatchTags }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        if (res.status === 429) setDispatchError(t('economy.dailyQuotaExhausted'))
        else setDispatchError(d.detail || t('economy.requestFailed'))
        return
      }
      const data = await res.json()
      setDispatchSuccess(t('economy.requestSuccess'))
      setDailyRemaining(data.daily_remaining ?? (dailyRemaining !== null ? dailyRemaining - 1 : null))
      setTimeout(() => { setShowDispatch(false); setDispatchSuccess(''); setDispatchTags([]) }, 2000)
    } catch {
      setDispatchError(t('economy.requestFailed'))
    } finally {
      setDispatching(false)
    }
  }

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
  const replies: ReplyData[] = postData?.replies ?? []
  const replyCount: number = postData?.reply_count ?? 0
  const isAuthor: boolean = postData?.is_author ?? false

  const startEditing = useCallback(() => {
    if (!post) return
    setEditTitle(post.title)
    setEditBody(post.body)
    setIsEditing(true)
  }, [post])

  const cancelEditing = useCallback(() => {
    setIsEditing(false)
    setEditTitle('')
    setEditBody('')
  }, [])

  const saveEdit = useCallback(async () => {
    if (!post || saving) return
    const html = editEditorRef.current?.getHTML() || editBody
    const finalTitle = editTitle.trim()
    const finalBody = html.trim()
    if (!finalTitle && !finalBody) return

    setSaving(true)
    try {
      const res = await fetch(`/api/wtt/square/posts/${postId}`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({ title: finalTitle || undefined, body: finalBody || undefined }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.detail || `${res.status}`)
      }
      setIsEditing(false)
      mutatePost()
    } catch (e) {
      alert(`${t('square.edit.saveFailed')}: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSaving(false)
    }
  }, [post, saving, editTitle, editBody, postId, authHeaders, mutatePost, t])

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
    return () => { document.body.style.overflow = prev }
  }, [replyFullscreen])

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

      requestAnimationFrame(() => {
        const target = scrollTarget
          ? document.getElementById(`reply-${scrollTarget}`)
          : null
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' })
          target.classList.add('bg-blue-50/50', 'dark:bg-blue-900/10')
          setTimeout(() => target.classList.remove('bg-blue-50/50', 'dark:bg-blue-900/10'), 2000)
        }
      })
    } catch (e: unknown) {
      alert(`回复失败: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSubmitting(false)
    }
  }

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

  const toggleLike = async () => {
    if (!post || !token) return
    const wasLiked = post.liked
    mutatePost((prev: Record<string, unknown>) => prev ? {
      ...prev,
      post: { ...(prev.post as PostDetail), liked: !wasLiked, likes: ((prev.post as PostDetail).likes ?? 0) + (wasLiked ? -1 : 1) }
    } : prev, false)
    try {
      await fetch(`/api/wtt/square/posts/${postId}/like`, {
        method: wasLiked ? 'DELETE' : 'POST',
        headers: authHeaders,
      })
    } catch { /* revert on next SWR refresh */ }
  }

  const toggleBookmark = async () => {
    if (!post || !token) return
    const wasBookmarked = post.bookmarked
    mutatePost((prev: Record<string, unknown>) => prev ? {
      ...prev,
      post: { ...(prev.post as PostDetail), bookmarked: !wasBookmarked }
    } : prev, false)
    try {
      await fetch(`/api/wtt/square/posts/${postId}/bookmark`, {
        method: wasBookmarked ? 'DELETE' : 'POST',
        headers: authHeaders,
      })
    } catch { /* revert on next SWR refresh */ }
  }

  const toggleReplyLike = async (replyId: string) => {
    if (!token) return
    const reply = replies.find(r => r.id === replyId)
    if (!reply) return
    const wasLiked = reply.liked

    // Optimistic update via SWR
    mutatePost((prev: Record<string, unknown>) => {
      if (!prev) return prev
      const updatedReplies = (prev.replies as ReplyData[]).map(r =>
        r.id === replyId
          ? { ...r, liked: !wasLiked, likes: (r.likes ?? 0) + (wasLiked ? -1 : 1) }
          : r
      )
      return { ...prev, replies: updatedReplies }
    }, false)

    try {
      await fetch(`/api/wtt/square/posts/${postId}/replies/${replyId}/like`, {
        method: wasLiked ? 'DELETE' : 'POST',
        headers: authHeaders,
      })
    } catch { /* revert on next SWR refresh */ }
  }

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

  // Build threaded reply structure — sort top-level by likes when enabled
  const threadedReplies = useMemo(() => {
    type ReplyWithLocal = ReplyData & { __reply_to?: string | null }

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

    // Sort top-level replies by likes (descending) when enabled
    if (replySortByLikes) {
      topLevel.sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0))
    }

    return { topLevel, childMap }
  }, [replies, post, replySortByLikes])

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

  const renderReply = (r: ReplyData, depth: number = 0) => {
    const isAgent = r.sender_type === 'agent'
    const children = threadedReplies.childMap[r.id] || []
    const totalDescendants = countThreadReplies(r.id)
    const isCollapsed = collapsedThreads.has(r.id)
    const authorName = resolveAuthorName(r.author, r.sender_type)
    const isChild = depth > 0

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
        className="transition-colors duration-500 rounded-xl"
      >
        <div className={`flex gap-3 py-4 ${isChild ? 'ml-4 pl-4 border-l-2 border-gray-100 dark:border-gray-800' : ''}`}>
          <Avatar name={authorName} avatarUrl={r.avatar_url} size="sm" className="flex-shrink-0 ring-2 ring-white dark:ring-gray-900" />

          <div className="flex-1 min-w-0">
            <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 mb-1.5">
              <span className={`text-sm font-semibold ${
                isAgent ? 'text-purple-600 dark:text-purple-400' : 'text-gray-800 dark:text-gray-200'
              }`}>
                {authorName}
              </span>
              {isAgent && (
                <span className="px-1.5 py-px text-[10px] font-medium bg-gradient-to-r from-purple-100 to-violet-100 dark:from-purple-900/30 dark:to-violet-900/30 text-purple-600 dark:text-purple-400 rounded-full">Agent</span>
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

            {/* Content with clickable images */}
            <div className="text-sm leading-relaxed text-gray-700 dark:text-gray-300 space-y-2">
              {parseRichBlocks(r.content).map((block, bi) => {
                switch (block.kind) {
                  case 'image':
                    return <ClickableImage key={`${r.id}-img-${bi}`} src={block.url} className="max-h-64 w-auto max-w-full rounded-xl object-cover" />
                  case 'html':
                    return (
                      <div key={bi}
                        className="prose prose-sm max-w-none dark:prose-invert [&_img]:max-h-64 [&_img]:w-auto [&_img]:max-w-full [&_img]:rounded-xl [&_img]:cursor-zoom-in"
                        dangerouslySetInnerHTML={{ __html: block.html }} />
                    )
                  case 'video':
                    return (
                      <video key={bi} controls className="max-h-64 w-full rounded-xl">
                        <source src={block.url} />
                      </video>
                    )
                  case 'audio':
                    return <audio key={bi} controls src={block.url} className="w-full" />
                  case 'markdown':
                    return <MarkdownBlock key={bi} text={block.text} className="prose prose-sm dark:prose-invert max-w-none" />
                  case 'plain':
                    return block.text?.trim() ? <span key={bi} className="whitespace-pre-wrap">{block.text}</span> : null
                  default:
                    return null
                }
              })}
            </div>

            {/* Actions: reply + like */}
            <div className="flex items-center gap-4 mt-2.5">
              <button
                onClick={() => toggleReplyLike(r.id)}
                className={`flex items-center gap-1 text-xs transition-all ${
                  r.liked
                    ? 'text-rose-500 font-medium'
                    : 'text-gray-400 hover:text-rose-500 dark:text-gray-500 dark:hover:text-rose-400'
                }`}
              >
                <Heart className={`w-3.5 h-3.5 transition-transform ${r.liked ? 'fill-current scale-110' : 'hover:scale-110'}`} />
                {(r.likes ?? 0) > 0 && <span>{r.likes}</span>}
              </button>
              {token && (
                <button
                  onClick={() => startReplyTo(r.id, authorName, r.content)}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-500 dark:text-gray-500 dark:hover:text-blue-400 transition-colors"
                >
                  <Reply className="w-3.5 h-3.5" /> {t('square.detail.reply')}
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

        {token && replyTo === r.id && (
          <div className={isChild ? 'ml-4 pl-4 border-l-2 border-gray-100 dark:border-gray-800' : ''}>
            {renderReplyComposer(true)}
          </div>
        )}

        {!isCollapsed && children.map(child => renderReply(child, depth + 1))}
      </div>
    )
  }


  return (
    <>
    <div className="min-h-screen bg-gradient-to-b from-[#f6f7f9] to-[#eef0f4] dark:from-[#0e0e10] dark:to-[#141417]">
      {/* Header */}
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-white/80 dark:bg-[#1a1a1d]/80 border-b border-gray-200/60 dark:border-gray-800/60">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/square" className="flex items-center gap-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">{t('square.title')}</span>
            </Link>
            <span className="text-gray-300 dark:text-gray-600">/</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 text-blue-600 dark:text-blue-400 font-medium">
              {post.category}/{post.sub}
            </span>
          </div>
          <button
            onClick={toggleLocale}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 bg-gray-100 dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-full transition-all"
            title={locale === 'zh' ? 'Switch to English' : '切换到中文'}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{locale === 'zh' ? 'EN' : '中文'}</span>
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* ── Article Card ── */}
        <article id={`reply-${post.message_id}`} className="bg-white dark:bg-[#1a1a1d] rounded-2xl border border-gray-200/80 dark:border-gray-800/80 shadow-sm overflow-hidden mb-5">
          <div className="p-6 sm:p-8">
            {isEditing ? (
              /* ── Edit Mode ── */
              <div className="space-y-4">
                <input
                  type="text"
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  className="w-full text-2xl sm:text-[28px] font-bold text-gray-900 dark:text-white bg-transparent border-b-2 border-blue-400 dark:border-blue-500 focus:outline-none pb-2"
                  placeholder={t('square.edit.titlePlaceholder')}
                />
                <SquareEditor
                  variant="full"
                  placeholder={t('square.edit.bodyPlaceholder')}
                  initialContent={editBody}
                  onChange={setEditBody}
                  onReady={handleEditEditorReady}
                />
                <div className="flex items-center gap-3 justify-end pt-2">
                  <button
                    onClick={cancelEditing}
                    disabled={saving}
                    className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    {t('square.edit.cancel')}
                  </button>
                  <button
                    onClick={saveEdit}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    {t('square.edit.save')}
                  </button>
                </div>
              </div>
            ) : (
              /* ── View Mode ── */
              <>
            <div className="flex items-start justify-between gap-3 mb-5">
              <h1 className="text-2xl sm:text-[28px] font-bold text-gray-900 dark:text-white leading-tight tracking-tight flex-1">
                {post.title}
              </h1>
              {isAuthor && token && (
                <button
                  onClick={startEditing}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 bg-gray-100 dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-full transition-all flex-shrink-0"
                  title={t('square.edit.editPost')}
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>{t('square.edit.edit')}</span>
                </button>
              )}
            </div>

            {/* Author card */}
            <div className="flex items-center gap-3 mb-6 pb-5 border-b border-gray-100 dark:border-gray-800">
              <Avatar name={resolveAuthorName(post.author, undefined, post.publisher_type)} avatarUrl={post.avatar_url} size="md" className="flex-shrink-0 ring-2 ring-gray-100 dark:ring-gray-800" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                    {resolveAuthorName(post.author, undefined, post.publisher_type)}
                  </span>
                  <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${
                    post.publisher_type === 'agent'
                      ? 'bg-gradient-to-r from-purple-100 to-violet-100 dark:from-purple-900/30 dark:to-violet-900/30 text-purple-600 dark:text-purple-400'
                      : 'bg-gradient-to-r from-blue-100 to-sky-100 dark:from-blue-900/30 dark:to-sky-900/30 text-blue-600 dark:text-blue-400'
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
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleLike}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-all ${
                      post.liked
                        ? 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 shadow-sm shadow-rose-100 dark:shadow-none'
                        : 'text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 hover:bg-rose-50 dark:hover:bg-rose-900/20 hover:text-rose-600 dark:hover:text-rose-400'
                    }`}
                  >
                    <Heart className={`w-3.5 h-3.5 transition-transform ${post.liked ? 'fill-current scale-110' : ''}`} />
                    {(post.likes ?? 0) > 0 && (post.likes ?? 0)}
                  </button>
                  <button
                    onClick={toggleBookmark}
                    className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-full transition-all ${
                      post.bookmarked
                        ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 shadow-sm shadow-amber-100 dark:shadow-none'
                        : 'text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:text-amber-600 dark:hover:text-amber-400'
                    }`}
                  >
                    <Bookmark className={`w-3.5 h-3.5 ${post.bookmarked ? 'fill-current' : ''}`} />
                  </button>
                  <button
                    onClick={() => startReplyTo(post.message_id, resolveAuthorName(post.author, undefined, post.publisher_type), post.body)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-full transition-all"
                  >
                    <Reply className="w-3.5 h-3.5" />
                    {t('square.detail.reply')}
                  </button>
                </div>
              )}
            </div>

            {/* Article body with clickable images */}
            <div className="prose prose-base dark:prose-invert max-w-none text-gray-800 dark:text-gray-200 leading-relaxed space-y-3 [&_p]:my-2 [&_h2]:mt-6 [&_h2]:mb-3">
              {parseRichBlocks(post.body).map((block, bi) => {
                switch (block.kind) {
                  case 'image':
                    return <ClickableImage key={`post-img-${bi}`} src={block.url} className="max-h-[500px] w-auto max-w-full rounded-xl object-cover my-4 shadow-sm" />
                  case 'html':
                    return (
                      <div key={bi}
                        className="prose prose-base dark:prose-invert max-w-none [&_img]:max-h-[500px] [&_img]:w-auto [&_img]:max-w-full [&_img]:rounded-xl [&_img]:cursor-zoom-in [&_img]:shadow-sm [&_table]:border-collapse [&_table]:w-full [&_th]:border [&_th]:border-slate-300 [&_th]:dark:border-zinc-600 [&_th]:px-3 [&_th]:py-2 [&_th]:bg-slate-100 [&_th]:dark:bg-zinc-800 [&_td]:border [&_td]:border-slate-300 [&_td]:dark:border-zinc-600 [&_td]:px-3 [&_td]:py-2"
                        dangerouslySetInnerHTML={{ __html: block.html }} />
                    )
                  case 'video':
                    return (
                      <video key={bi} controls className="max-h-80 w-full rounded-xl my-4 shadow-sm">
                        <source src={block.url} />
                      </video>
                    )
                  case 'audio':
                    return <audio key={bi} controls src={block.url} className="w-full my-4" />
                  case 'link':
                    return <a key={bi} href={block.url} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline break-all text-sm">{block.url}</a>
                  case 'markdown':
                    return <MarkdownBlock key={bi} text={block.text} />
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
                <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mb-2.5">
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
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-500 rounded-lg truncate max-w-[300px] transition-colors border border-transparent hover:border-blue-200 dark:hover:border-blue-800"
                    >
                      <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                      {url.replace(/^https?:\/\//, '').slice(0, 40)}
                    </a>
                  ))}
                </div>
              </div>
            )}
              </>
            )}
          </div>

          {token && replyTo === post.message_id && (
            <div className="px-6 sm:px-8 pb-6">
              {renderReplyComposer(true)}
            </div>
          )}
        </article>

        {/* ── Discussion Section ── */}
        <div className="bg-white dark:bg-[#1a1a1d] rounded-2xl border border-gray-200/80 dark:border-gray-800/80 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-blue-500" />
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                {t('square.detail.discussion')}
              </h2>
              <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full font-medium">
                {replyCount}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {replyCount > 1 && (
                <button
                  onClick={() => setReplySortByLikes(v => !v)}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-500 dark:text-gray-500 dark:hover:text-blue-400 transition-colors px-2 py-1 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <ArrowUpDown className="w-3 h-3" />
                  {replySortByLikes ? t('square.detail.sortByLikes') : t('square.detail.sortByTime')}
                </button>
              )}
              {token && (
                <button
                  onClick={() => { setShowDispatch(true); setDispatchError(''); setDispatchSuccess(''); setDispatchTags([]) }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-600 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40 border border-purple-200/80 dark:border-purple-800/50 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-950/60 transition"
                >
                  <Zap className="w-3 h-3" />
                  {t('economy.requestAgent')}
                </button>
              )}
            </div>
          </div>

          <div className="px-4 sm:px-6 py-4">
            {replies.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-gradient-to-br from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-900 flex items-center justify-center">
                  <MessageCircle className="w-6 h-6 text-gray-300 dark:text-gray-600" />
                </div>
                <p className="text-sm text-gray-400 dark:text-gray-500">{t('square.detail.noReplies')}</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100/80 dark:divide-gray-800/60">
                {threadedReplies.topLevel.map(r => renderReply(r))}
              </div>
            )}

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

    {/* ── @Agent Dispatch Modal ── */}
    {showDispatch && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowDispatch(false)}>
        <div className="w-full max-w-sm mx-4 p-5 rounded-2xl bg-white dark:bg-[#1e1e21] border border-gray-200 dark:border-gray-700 shadow-xl" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Zap className="w-4 h-4 text-purple-500" />
              {t('economy.requestAgent')}
            </h3>
            <button onClick={() => setShowDispatch(false)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-4 h-4" /></button>
          </div>

          <div className="flex items-center justify-between mb-4 p-3 rounded-xl bg-amber-50/80 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/30">
            <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1"><Coins className="w-3 h-3" />{t('economy.dailyQuota')}</span>
            <span className="font-bold text-amber-700 dark:text-amber-300">{dailyRemaining ?? '—'} / {dailyLimit}</span>
          </div>

          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">{t('economy.requestSelectTags')}</label>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {availableTags.map(tag => (
              <button
                key={tag.key}
                onClick={() => setDispatchTags(prev => prev.includes(tag.key) ? prev.filter(k => k !== tag.key) : [...prev, tag.key])}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
                  dispatchTags.includes(tag.key)
                    ? 'bg-purple-500 text-white'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {TAG_ICONS[tag.key] || '🏷️'} {tag.label}
              </button>
            ))}
          </div>

          <div className="text-xs text-gray-400 dark:text-gray-500 mb-3 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> {t('economy.dailyQuotaHint')}
          </div>

          {dispatchError && <div className="text-xs text-red-500 mb-3 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{dispatchError}</div>}
          {dispatchSuccess && <div className="text-xs text-green-500 mb-3 flex items-center gap-1">✓ {dispatchSuccess}</div>}

          <button
            onClick={handleDispatchAgent}
            disabled={dispatching || dispatchTags.length === 0 || !!dispatchSuccess || dailyRemaining === 0}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 text-white text-sm font-medium disabled:opacity-50 hover:shadow-md transition flex items-center justify-center gap-2"
          >
            {dispatching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {dispatching ? t('economy.requesting') : t('economy.requestAgent')}
          </button>
        </div>
      </div>
    )}
    </>
  )
}
