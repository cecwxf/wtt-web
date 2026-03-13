'use client'

import { Download, Image as ImageIcon, Mic, Paperclip, Send } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CLIENT_WTT_API_BASE, DEFAULT_WTT_API_ORIGIN } from '@/lib/api/base-url'

export interface ChatMessage {
  message_id: string
  sender_id: string
  sender_display_name?: string
  sender_type: 'human' | 'agent'
  content: string
  timestamp: string
  semantic_type?: string
}

export interface ChatModelConfig {
  model: string
  reasoningEffort: 'off' | 'low' | 'medium' | 'high'
}

const AVAILABLE_MODELS = [
  { id: 'openai-codex/gpt-5.3-codex', label: 'GPT-5.3 Codex' },
]

const REASONING_EFFORTS = [
  { id: 'off', label: 'Off', icon: '💤' },
  { id: 'low', label: 'Low', icon: '⚡' },
  { id: 'medium', label: 'Medium', icon: '⚖️' },
  { id: 'high', label: 'High', icon: '🧠' },
] as const

export type TaskType = 'code' | 'research' | 'general' | 'pipeline' | null

const DEFAULT_EFFORT_BY_TASK: Record<string, 'off' | 'low' | 'medium' | 'high'> = {
  code: 'high',
  research: 'high',
  general: 'low',
  pipeline: 'low',
}

interface ChatViewProps {
  topicName: string
  messages: ChatMessage[]
  currentAgentId: string
  onSendMessage: (content: string, modelConfig?: ChatModelConfig) => Promise<void>
  onLoadOlder?: () => Promise<void>
  onExport?: (format: 'md' | 'pdf' | 'docx') => void
  hasOlder?: boolean
  loading?: boolean
  extraHeaderActions?: React.ReactNode
  isTaskTopic?: boolean
  taskType?: TaskType
  wsConnected?: boolean
}

function formatTime(timestamp: string): string {
  try {
    const date = new Date(timestamp)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return '--:--'
  }
}

type ParsedRich =
  | { kind: 'plain'; text: string }
  | { kind: 'image'; url: string }
  | { kind: 'audio'; url: string }
  | { kind: 'video'; url: string }
  | { kind: 'file'; url: string; filename?: string }
  | { kind: 'link'; url: string }
  | { kind: 'markdown'; text: string }
  | { kind: 'preview'; title?: string; desc?: string; url?: string; image?: string }

interface UrlPreview {
  url: string
  title?: string
  description?: string
  image?: string
  site_name?: string
}

interface CachedPreview {
  data: UrlPreview
  fetchedAt: number
}

type ParsedTask = {
  isTask: boolean
  kind?: 'run' | 'status' | 'summary' | 'blocked' | 'asset' | 'review' | 'other'
  taskId?: string
  sessionId?: string
  runner?: string
  executor?: string
  progress?: string
  body?: string
  assetUrl?: string
  assetPath?: string
}

function parseTaskContent(content: string): ParsedTask {
  const c = (content || '').replace(/\\n/g, '\n')
  if (!c.includes('[TASK_')) return { isTask: false }

  const pick = (re: RegExp) => (c.match(re)?.[1] || '').trim()
  const taskId = pick(/task_id=([^\s\n]+)/)
  const sessionId = pick(/session_id=([^\s\n]+)/)
  const runner = pick(/runner=([^\s\n]+)/)
  const executor = pick(/executor=([^\s\n]+)/)
  const progress = pick(/progress=(\d+)%/)
  const assetUrl = pick(/\nurl=(https?:\/\/\S+)/)
  const assetPath = pick(/\npath=([^\n]+)/)
  const body = c.includes('\n') ? c.split('\n').slice(1).join('\n').trim() : ''

  let kind: ParsedTask['kind'] = 'other'
  if (c.includes('[TASK_RUN]')) kind = 'run'
  else if (c.includes('[TASK_STATUS]')) kind = 'status'
  else if (c.includes('[TASK_SUMMARY]')) kind = 'summary'
  else if (c.includes('[TASK_BLOCKED]')) kind = 'blocked'
  else if (c.includes('[TASK_ASSET]')) kind = 'asset'
  else if (c.includes('[TASK_REVIEW]')) kind = 'review'

  return { isTask: true, kind, taskId, sessionId, runner, executor, progress, body, assetUrl, assetPath }
}

/** Rewrite absolute backend media URLs to go through the Next.js proxy so
 *  HTTPS pages can load HTTP resources without mixed-content blocking. */
function proxyUrl(url: string): string {
  if (url.startsWith(DEFAULT_WTT_API_ORIGIN)) {
    return url.replace(DEFAULT_WTT_API_ORIGIN, CLIENT_WTT_API_BASE)
  }
  // Also handle localhost / 127.0.0.1 backend origins (dev or stored URLs)
  const localBackend = url.match(/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\//)
  if (localBackend) {
    return url.replace(localBackend[0], CLIENT_WTT_API_BASE + '/')
  }
  return url
}

function classifyLine(line: string): ParsedRich {
  const c = line.trim()
  if (!c) return { kind: 'plain', text: '' }
  const imageMatch = c.match(/^!\[([^\]]*)\]\((https?:\/\/[^)]+)\)$/i)
  if (imageMatch) return { kind: 'image', url: proxyUrl(imageMatch[2]) }
  const audioMatch = c.match(/^\[audio(?::([^\]]*))?\]\((https?:\/\/[^)]+)\)$/i)
  if (audioMatch) return { kind: 'audio', url: proxyUrl(audioMatch[2]) }
  const videoMatch = c.match(/^\[video(?::([^\]]*))?\]\((https?:\/\/[^)]+)\)$/i)
  if (videoMatch) return { kind: 'video', url: proxyUrl(videoMatch[2]) }
  const fileMatch = c.match(/^\[file(?::([^\]]*))?\]\((https?:\/\/[^)]+)\)$/i)
  if (fileMatch) return { kind: 'file', url: proxyUrl(fileMatch[2]), filename: fileMatch[1] || undefined }
  const linkMatch = c.match(/^\[link\]\((https?:\/\/[^)]+)\)$/i)
  if (linkMatch) return { kind: 'link', url: proxyUrl(linkMatch[1]) }
  const plainUrl = c.match(/^(https?:\/\/\S+)$/i)
  if (plainUrl) {
    const raw = plainUrl[1]
    const u = raw.toLowerCase()
    if (/\.(mp4|webm|mov)(\?|$)/.test(u)) return { kind: 'video', url: proxyUrl(raw) }
    if (/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/.test(u)) return { kind: 'image', url: proxyUrl(raw) }
    if (/\.(mp3|wav|ogg)(\?|$)/.test(u)) return { kind: 'audio', url: proxyUrl(raw) }
    if (/\.(pdf)(\?|$)/.test(u)) return { kind: 'file', url: proxyUrl(raw), filename: undefined }
    if (/\.(docx|xlsx|csv|zip)(\?|$)/.test(u)) return { kind: 'file', url: proxyUrl(raw), filename: undefined }
    return { kind: 'link', url: raw }
  }
  return { kind: 'plain', text: line }
}

function parseRichBlocks(content: string): ParsedRich[] {
  const c = (content || '').trim()
  if (!c) return [{ kind: 'plain', text: '' }]

  // [preview] block — return as single block
  if (c.startsWith('[preview]')) {
    const title = (c.match(/Title:\s*(.*)/i)?.[1] || '').trim()
    const desc = (c.match(/Desc:\s*(.*)/i)?.[1] || '').trim()
    const url = (c.match(/URL:\s*(https?:\/\/\S+)/i)?.[1] || '').trim()
    const image = proxyUrl((c.match(/Image:\s*(https?:\/\/\S+)/i)?.[1] || '').trim())
    return [{ kind: 'preview', title, desc, url, image }]
  }

  // Detect markdown: has headings, bold, code blocks, tables
  const hasMarkdown = /(?:^#{1,6}\s|^\s*[-*+]\s.+|^\d+\.\s|\*\*.+\*\*|^\|.+\||```[\s\S]*```)/m.test(c)
  if (hasMarkdown && c.length > 30) return [{ kind: 'markdown', text: c }]

  // Split by lines / double newlines and classify each segment
  const segments = c.split(/\n/)
  const blocks: ParsedRich[] = []
  let textBuf: string[] = []

  const flushText = () => {
    if (textBuf.length > 0) {
      blocks.push({ kind: 'plain', text: textBuf.join('\n') })
      textBuf = []
    }
  }

  for (const seg of segments) {
    const classified = classifyLine(seg)
    if (classified.kind === 'plain') {
      textBuf.push(seg)
    } else {
      flushText()
      blocks.push(classified)
    }
  }
  flushText()

  // If only plain text, also extract inline URLs for preview
  if (blocks.length === 1 && blocks[0].kind === 'plain') {
    const urls = (blocks[0].text || '').match(/https?:\/\/\S+/gi)
    if (urls) {
      for (const raw of urls) {
        const u = raw.toLowerCase()
        if (/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/.test(u)) {
          blocks.push({ kind: 'image', url: proxyUrl(raw) })
        } else if (/\.(mp4|webm|mov)(\?|$)/.test(u)) {
          blocks.push({ kind: 'video', url: proxyUrl(raw) })
        } else if (/\.(mp3|wav|ogg)(\?|$)/.test(u)) {
          blocks.push({ kind: 'audio', url: proxyUrl(raw) })
        } else {
          blocks.push({ kind: 'link', url: raw })
        }
      }
    }
  }

  return blocks.length > 0 ? blocks : [{ kind: 'plain', text: content }]
}

function formatDateGroup(timestamp: string): string {
  try {
    const date = new Date(timestamp)
    const now = new Date()
    const yesterday = new Date(now)
    yesterday.setDate(now.getDate() - 1)

    const isToday =
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate()

    if (isToday) return 'Today'

    const isYesterday =
      date.getFullYear() === yesterday.getFullYear() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getDate() === yesterday.getDate()

    if (isYesterday) return 'Yesterday'

    return date.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return 'Unknown Date'
  }
}

function ThumbnailImage({ url, isMine }: { url: string; isMine: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const [failed, setFailed] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setExpanded(true)} className="block cursor-zoom-in">
        {failed ? (
          <div className={`flex h-20 w-20 items-center justify-center rounded-lg border bg-slate-100 ${isMine ? 'border-indigo-400' : 'border-slate-200'}`}>
            <ImageIcon className="h-6 w-6 text-slate-400" />
          </div>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={url}
            alt=""
            onError={() => setFailed(true)}
            className={`h-20 w-auto max-w-[160px] rounded-lg object-cover border ${isMine ? 'border-indigo-400' : 'border-slate-200'}`}
          />
        )}
      </button>
      {expanded && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setExpanded(false)}
        >
          {failed ? (
            <div className="rounded-lg bg-white p-8 text-center">
              <ImageIcon className="mx-auto h-12 w-12 text-slate-400" />
              <p className="mt-2 text-sm text-slate-500">Image failed to load</p>
              <a href={url} target="_blank" rel="noreferrer" className="mt-1 text-xs text-indigo-500 underline break-all">{url}</a>
            </div>
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={url} alt="" className="max-h-[90vh] max-w-[90vw] rounded-lg" />
          )}
        </div>
      )}
    </>
  )
}

function ThumbnailVideo({ url, isMine }: { url: string; isMine: boolean }) {
  const [playing, setPlaying] = useState(false)
  const thumbRef = useRef<HTMLVideoElement>(null)
  if (playing) {
    return (
      <video controls autoPlay className="max-h-72 w-full rounded-lg border border-slate-200">
        <source src={url} />
      </video>
    )
  }
  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      className={`group relative block overflow-hidden rounded-lg border ${isMine ? 'border-indigo-400' : 'border-slate-200'}`}
    >
      <video ref={thumbRef} src={url} preload="metadata" muted className="h-20 w-auto max-w-[160px] object-cover" />
      <div className="absolute inset-0 flex items-center justify-center bg-black/30 transition group-hover:bg-black/50">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90">
          <div className="ml-0.5 h-0 w-0 border-y-[6px] border-l-[10px] border-y-transparent border-l-indigo-500" />
        </div>
      </div>
    </button>
  )
}

export function ChatView({
  topicName,
  messages,
  currentAgentId,
  onSendMessage,
  onLoadOlder,
  onExport,
  hasOlder = false,
  loading,
  extraHeaderActions,
  isTaskTopic = false,
  taskType = null,
  wsConnected = false,
}: ChatViewProps) {
  const defaultEffort = (taskType && DEFAULT_EFFORT_BY_TASK[taskType]) || 'off'
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [awaitingAgent, setAwaitingAgent] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [selectedModel, setSelectedModel] = useState(AVAILABLE_MODELS[0].id)
  const [reasoningEffort, setReasoningEffort] = useState<'off' | 'low' | 'medium' | 'high'>(defaultEffort)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [isFirstMessage, setIsFirstMessage] = useState(true)
  // Track the last-sent model config to detect changes mid-conversation
  const lastSentConfigRef = useRef<{ model: string; effort: string } | null>(null)
  const [recentAssets, setRecentAssets] = useState<Array<{ url: string; kind: 'image' | 'audio' | 'file' }>>([])
  const [previewCache, setPreviewCache] = useState<Record<string, CachedPreview>>({})
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const prevMsgCountRef = useRef(0)
  const initialScrollDoneRef = useRef(false)

  // Scroll to bottom on initial load and topic change
  useEffect(() => {
    initialScrollDoneRef.current = false
    prevMsgCountRef.current = 0
  }, [topicName])

  useEffect(() => {
    if (!initialScrollDoneRef.current && messages.length > 0 && scrollRef.current) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
      })
      initialScrollDoneRef.current = true
      prevMsgCountRef.current = messages.length
    }
  }, [messages.length])

  // Auto-scroll when new messages are appended (not when older are prepended)
  useEffect(() => {
    if (!initialScrollDoneRef.current) return
    if (messages.length > prevMsgCountRef.current && scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 150
      if (isNearBottom) {
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
        })
      }
    }
    prevMsgCountRef.current = messages.length
  }, [messages.length])

  useEffect(() => {
    try {
      const raw = localStorage.getItem('wtt_preview_cache_v1')
      if (!raw) return
      const parsed = JSON.parse(raw) as Record<string, CachedPreview | UrlPreview>
      if (parsed && typeof parsed === 'object') {
        const normalized: Record<string, CachedPreview> = {}
        for (const [url, item] of Object.entries(parsed)) {
          if (!item || typeof item !== 'object') continue
          const maybeCached = item as CachedPreview
          if (typeof maybeCached.fetchedAt === 'number' && maybeCached.data) {
            normalized[url] = maybeCached
          } else {
            normalized[url] = { data: item as UrlPreview, fetchedAt: Date.now() }
          }
        }
        setPreviewCache(normalized)
      }
    } catch {
      // ignore cache parse errors
    }
  }, [])

  useEffect(() => {
    try {
      const entries = Object.entries(previewCache)
      // cap size to avoid unbounded growth
      const sliced = entries.slice(Math.max(0, entries.length - 200))
      localStorage.setItem('wtt_preview_cache_v1', JSON.stringify(Object.fromEntries(sliced)))
    } catch {
      // ignore storage errors
    }
  }, [previewCache])

  const handleSend = async () => {
    if (!draft.trim()) return

    const modelConfig: ChatModelConfig = { model: selectedModel, reasoningEffort }
    let content = draft.trim()

    const modelLabel = AVAILABLE_MODELS.find(m => m.id === selectedModel)?.label || selectedModel
    const lastCfg = lastSentConfigRef.current
    const configChanged = lastCfg && (lastCfg.model !== selectedModel || lastCfg.effort !== reasoningEffort)

    // Prepend model info on the first message OR when config changes mid-conversation
    if (isFirstMessage || configChanged) {
      const prefix = configChanged
        ? `[Switched → Model: ${modelLabel} | Effort: ${reasoningEffort}]`
        : `[Model: ${modelLabel} | Effort: ${reasoningEffort}]`
      content = `${prefix}\n\n${content}`
      if (isFirstMessage) setIsFirstMessage(false)
    }

    lastSentConfigRef.current = { model: selectedModel, effort: reasoningEffort }

    setSending(true)
    try {
      await onSendMessage(content, modelConfig)
      setDraft('')
      if (isTaskTopic) setAwaitingAgent(true)
    } catch (error) {
      console.error('Failed to send message:', error)
      alert(error instanceof Error ? error.message : 'Failed to send message')
    } finally {
      setSending(false)
    }
  }

  // Clear thinking indicator when a new agent message arrives
  useEffect(() => {
    if (!awaitingAgent || !isTaskTopic) return
    const lastMsg = messages[messages.length - 1]
    if (lastMsg && lastMsg.sender_id !== currentAgentId) {
      setAwaitingAgent(false)
    }
  }, [messages, awaitingAgent, isTaskTopic, currentAgentId])

  const uploadAssetAndInsert = async (file: File) => {
    setUploading(true)
    try {
      const sign = await fetch(`${CLIENT_WTT_API_BASE}/media/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, mime_type: file.type, size: file.size }),
      })
      if (!sign.ok) throw new Error(await sign.text())
      const signed = await sign.json()

      const upload = await fetch(`${CLIENT_WTT_API_BASE}${signed.upload_url}`, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      })
      if (!upload.ok) throw new Error(await upload.text())

      const commit = await fetch(`${CLIENT_WTT_API_BASE}/media/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upload_token: signed.upload_token }),
      })
      if (!commit.ok) throw new Error(await commit.text())
      const asset = await commit.json()

      const isImage = file.type.startsWith('image/')
      const isAudio = file.type.startsWith('audio/')
      const isVideo = file.type.startsWith('video/')
      const kind: 'image' | 'audio' | 'file' = isImage ? 'image' : isAudio ? 'audio' : 'file'
      const token = isImage
        ? `![${file.name}](${asset.url})`
        : isAudio
          ? `[audio:${file.name}](${asset.url})`
          : isVideo
            ? `[video:${file.name}](${asset.url})`
            : `[file:${file.name}](${asset.url})`
      setDraft((prev) => `${prev}${prev ? '\n\n' : ''}${token}`)
      setRecentAssets((prev) => [{ url: asset.url, kind }, ...prev].slice(0, 8))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleLoadOlder = async () => {
    if (!onLoadOlder || loadingOlder || !hasOlder) return
    setLoadingOlder(true)
    const prevHeight = scrollRef.current?.scrollHeight ?? 0
    await onLoadOlder()
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        const nextHeight = scrollRef.current.scrollHeight
        scrollRef.current.scrollTop = nextHeight - prevHeight
      }
    })
    setLoadingOlder(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  useEffect(() => {
    const TTL_MS = 24 * 60 * 60 * 1000
    const now = Date.now()
    const urls = new Set<string>()
    for (const m of messages) {
      const blocks = parseRichBlocks(m.content || '')
      for (const block of blocks) {
        const candidateUrl = block.kind === 'link' ? block.url : undefined
        if (candidateUrl) {
          const cached = previewCache[candidateUrl]
          const isFresh = cached && now - cached.fetchedAt < TTL_MS
          if (!isFresh) urls.add(candidateUrl)
        }
      }
    }
    if (urls.size === 0) return

    let cancelled = false
    ;(async () => {
      for (const url of Array.from(urls)) {
        try {
          const r = await fetch(`${CLIENT_WTT_API_BASE}/preview/url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
          })
          if (!r.ok) continue
          const j = await r.json()
          if (!cancelled) {
            setPreviewCache((prev) => ({ ...prev, [url]: { data: j, fetchedAt: Date.now() } }))
          }
        } catch {
          // ignore preview fetch failures
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [messages, previewCache])

  const groupedMessages: Array<{ label: string; messages: ChatMessage[] }> = []
  messages.forEach((message) => {
    const label = formatDateGroup(message.timestamp)
    const lastGroup = groupedMessages[groupedMessages.length - 1]
    if (!lastGroup || lastGroup.label !== label) {
      groupedMessages.push({ label, messages: [message] })
    } else {
      lastGroup.messages.push(message)
    }
  })

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 dark:border-zinc-700 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="truncate text-lg font-semibold dark:text-zinc-100">{topicName}</h2>
            <p className="mt-1 text-xs text-slate-400">
              {messages.length} messages loaded
              {wsConnected && (
                <span className="ml-2 inline-flex items-center gap-1 text-emerald-500">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  live
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {extraHeaderActions}
            <div className="relative">
              <button
                onClick={() => setExportOpen(!exportOpen)}
                onBlur={() => setTimeout(() => setExportOpen(false), 150)}
                className="flex items-center gap-1 rounded border border-slate-200 dark:border-zinc-600 px-2 py-1 text-[11px] text-slate-500 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 hover:text-slate-700 dark:hover:text-zinc-100"
              >
                <Download size={12} /> Export ▾
              </button>
              {exportOpen && (
                <div className="absolute right-0 top-full mt-1 z-30 min-w-[120px] rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 py-1 shadow-lg">
                  {(['md', 'pdf', 'docx'] as const).map(fmt => (
                    <button
                      key={fmt}
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => { onExport?.(fmt); setExportOpen(false) }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 hover:text-slate-800 dark:hover:text-zinc-100"
                    >
                      {fmt === 'md' ? '📝' : fmt === 'pdf' ? '📄' : '📑'} {fmt.toUpperCase()}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-slate-50/50 to-white dark:from-zinc-900/50 dark:to-zinc-950 px-4 py-4 sm:px-5"
      >
        <div className="mb-3 flex justify-center">
          <button
            onClick={handleLoadOlder}
            disabled={!hasOlder || loadingOlder}
            className="rounded-full border border-slate-200 dark:border-zinc-700 bg-slate-50/85 dark:bg-zinc-800/85 px-3 py-1 text-xs text-slate-500 disabled:opacity-40"
          >
            {loadingOlder ? 'Loading history...' : hasOlder ? 'Load older messages' : 'No older messages'}
          </button>
        </div>

        {loading && messages.length === 0 && (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-indigo-500" />
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="pt-20 text-center text-sm text-slate-400">No messages yet. Start the conversation!</div>
        )}

        {groupedMessages.map((group) => (
          <div key={group.label} className="mb-4">
            <div className="mb-3 flex items-center gap-3">
              <div className="h-px flex-1 bg-white/10" />
              <span className="rounded-full bg-slate-50 dark:bg-zinc-800 px-3 py-1 text-[11px] text-slate-400 dark:text-zinc-500">{group.label}</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            <div className="space-y-2">
              {group.messages.map((message) => {
                const isMine = message.sender_type === 'human'

                return (
                  <div key={message.message_id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[82%] rounded-2xl px-5 py-3.5 text-[14px] leading-relaxed tracking-[-0.01em] ${
                        isMine
                          ? 'border border-indigo-200 dark:border-indigo-800/50 bg-indigo-50/80 dark:bg-indigo-950/20 text-slate-800 dark:text-zinc-200'
                          : 'border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-300'
                      } ${isMine ? 'rounded-tr-md' : 'rounded-tl-md'} shadow-sm`}
                    >
                      {!isMine && <p className="mb-1 text-xs font-semibold text-indigo-600">{message.sender_display_name || message.sender_id}</p>}
                      {(() => {
                        const task = parseTaskContent(message.content || '')
                        if (task.isTask) {
                          const colorMap: Record<string, { border: string; badge: string; badgeText: string; bg: string }> = {
                            run: { border: 'border-l-indigo-500', badge: 'bg-indigo-100 text-indigo-700', badgeText: 'Task Meta', bg: 'bg-indigo-50/50' },
                            status: { border: 'border-l-amber-500', badge: 'bg-amber-100 text-amber-700', badgeText: 'Progress', bg: 'bg-amber-50/50' },
                            summary: { border: 'border-l-emerald-500', badge: 'bg-emerald-100 text-emerald-700', badgeText: 'Result', bg: 'bg-emerald-50/50' },
                            blocked: { border: 'border-l-red-500', badge: 'bg-red-100 text-red-700', badgeText: 'Blocked', bg: 'bg-red-50/50' },
                            asset: { border: 'border-l-violet-500', badge: 'bg-violet-100 text-violet-700', badgeText: 'Asset', bg: 'bg-violet-50/50' },
                            review: { border: 'border-l-sky-500', badge: 'bg-sky-100 text-sky-700', badgeText: 'Review', bg: 'bg-sky-50/50' },
                            other: { border: 'border-l-slate-400', badge: 'bg-slate-100 text-slate-600', badgeText: 'Update', bg: 'bg-slate-50/50' },
                          }
                          const colors = colorMap[task.kind || 'other']
                          const pct = task.progress ? parseInt(task.progress, 10) : undefined

                          return (
                            <div className="space-y-3">
                              {/* Header card: badge + task ID */}
                              <div className={`flex items-center justify-between gap-2 rounded-lg border border-l-4 ${colors.border} ${colors.bg} border-slate-200 px-3 py-2.5`}>
                                <span className="font-mono text-xs text-slate-500">{task.taskId || 'N/A'}</span>
                                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${colors.badge}`}>{colors.badgeText}</span>
                              </div>

                              {/* Metadata card */}
                              {(task.runner || task.executor || task.sessionId) && (
                                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Metadata</p>
                                  <div className="space-y-1 text-xs text-slate-600">
                                    {task.runner && <div className="flex justify-between"><span className="text-slate-400">Runner</span><span className="font-medium text-slate-700">{task.runner}</span></div>}
                                    {task.executor && <div className="flex justify-between"><span className="text-slate-400">Executor</span><span className="font-medium text-slate-700">{task.executor}</span></div>}
                                    {task.sessionId && <div className="flex justify-between"><span className="text-slate-400">Session</span><span className="font-mono text-slate-600">{task.sessionId.slice(0, 8)}</span></div>}
                                  </div>
                                </div>
                              )}

                              {/* Progress card */}
                              {task.kind === 'status' && (
                                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Progress</p>
                                  {pct !== undefined && (
                                    <div className="mb-2 flex items-center gap-2">
                                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                                        <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
                                      </div>
                                      <span className="text-xs font-medium text-amber-700">{pct}%</span>
                                    </div>
                                  )}
                                  {task.body && <p className="text-[13px] leading-relaxed text-slate-700 whitespace-pre-wrap break-words">{task.body}</p>}
                                </div>
                              )}

                              {/* Result / Blocked / Review card */}
                              {(task.kind === 'summary' || task.kind === 'blocked' || task.kind === 'review') && task.body && (
                                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                    {task.kind === 'summary' ? 'Result' : task.kind === 'blocked' ? 'Blocked' : 'Review'}
                                  </p>
                                  <p className="text-[13px] leading-relaxed text-slate-700 whitespace-pre-wrap break-words">{task.body}</p>
                                </div>
                              )}

                              {/* Asset card */}
                              {task.kind === 'asset' && (
                                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Asset</p>
                                  {task.assetUrl ? (
                                    <a href={task.assetUrl} target="_blank" rel="noreferrer" className="text-sm text-indigo-600 underline break-all hover:text-indigo-800">{task.assetUrl}</a>
                                  ) : (
                                    <p className="text-[13px] break-all text-slate-600">{task.assetPath || task.body || '—'}</p>
                                  )}
                                </div>
                              )}

                              {/* Run body card */}
                              {task.kind === 'run' && task.body && (
                                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Details</p>
                                  <p className="text-[13px] leading-relaxed text-slate-700 whitespace-pre-wrap break-words">{task.body}</p>
                                </div>
                              )}
                            </div>
                          )
                        }

                        const blocks = parseRichBlocks(message.content || '')

                        // Detect document message pattern: plain text preview + .md/.html file
                        const docFileIdx = blocks.findIndex(
                          (b) => b.kind === 'file' && b.url && (/\.md(\?|$)/i.test(b.url) || /\.html?(\?|$)/i.test(b.url) || /\.md(\?|$)/i.test(b.filename || '') || /\.html?(\?|$)/i.test(b.filename || ''))
                        )
                        const hasPreviewText = docFileIdx > 0 && blocks.slice(0, docFileIdx).some((b) => b.kind === 'plain' && b.text?.trim())
                        if (hasPreviewText && docFileIdx >= 0) {
                          const fileBlock = blocks[docFileIdx] as { kind: 'file'; url: string; filename?: string }
                          const fname = fileBlock.filename || fileBlock.url.split('/').pop() || 'file'
                          const isMdFile = /\.md(\?|$)/i.test(fname) || /\.md(\?|$)/i.test(fileBlock.url)
                          const previewText = blocks
                            .slice(0, docFileIdx)
                            .filter((b): b is { kind: 'plain'; text: string } => b.kind === 'plain' && !!b.text?.trim())
                            .map((b) => b.text.trim())
                            .join('\n')

                          return (
                            <div className="rounded-lg border border-slate-200 overflow-hidden">
                              <div className="bg-white px-4 py-3">
                                <p className="text-[13px] leading-relaxed text-slate-600 line-clamp-4">{previewText}</p>
                              </div>
                              <a
                                href={fileBlock.url}
                                download={fname}
                                className="flex items-center gap-3 border-t border-slate-100 dark:border-zinc-700 bg-slate-50/80 dark:bg-zinc-800/80 px-4 py-2.5 text-sm transition-colors hover:bg-slate-100 dark:hover:bg-zinc-700"
                              >
                                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-bold ${isMdFile ? 'bg-indigo-500/15 text-indigo-500' : 'bg-orange-500/15 text-orange-500'}`}>
                                  {isMdFile ? '.md' : '.html'}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-medium text-slate-700">{fname}</span>
                                </span>
                                <Download className="h-4 w-4 text-slate-400" />
                              </a>
                            </div>
                          )
                        }

                        return (
                          <div className="space-y-3">
                            {blocks.map((block, bi) => {
                              if (block.kind === 'image') {
                                return <ThumbnailImage key={bi} url={block.url} isMine={isMine} />
                              }
                              if (block.kind === 'audio') {
                                return <audio key={bi} controls src={block.url} className="w-full max-w-xs" />
                              }
                              if (block.kind === 'video') {
                                return <ThumbnailVideo key={bi} url={block.url} isMine={isMine} />
                              }
                              if (block.kind === 'file') {
                                const url = block.url
                                const fname = block.filename || url.split('/').pop() || 'file'
                                const isPdf = /\.pdf(\?|$)/i.test(url)
                                const isMd = /\.md(\?|$)/i.test(fname) || /\.md(\?|$)/i.test(url)
                                if (isPdf) {
                                  return (
                                    <div key={bi} className="space-y-1">
                                      <iframe src={url} title={fname} className="h-80 w-full rounded-lg border border-slate-200" />
                                      <a href={url} target="_blank" rel="noreferrer" className="inline-block text-xs text-indigo-500 underline">Open PDF</a>
                                    </div>
                                  )
                                }
                                if (isMd) {
                                  return (
                                    <a key={bi} href={url} download={fname} className={`flex items-center gap-3 rounded-lg border p-3 text-sm transition-colors ${isMine ? 'border-indigo-200 dark:border-indigo-800/40 bg-indigo-50/60 dark:bg-indigo-950/20 hover:bg-indigo-100/80 dark:hover:bg-indigo-950/30 text-slate-700 dark:text-zinc-300' : 'border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300'}`}>
                                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-500 text-xs font-bold">.md</span>
                                      <span className="min-w-0 flex-1">
                                        <span className="block truncate font-medium">{fname}</span>
                                        <span className={`block text-xs ${isMine ? 'text-indigo-400' : 'text-slate-400'}`}>Markdown · Click to download</span>
                                      </span>
                                    </a>
                                  )
                                }
                                const isHtml = /\.html?(\?|$)/i.test(fname) || /\.html?(\?|$)/i.test(url)
                                if (isHtml) {
                                  return (
                                    <a key={bi} href={url} download={fname} className={`flex items-center gap-3 rounded-lg border p-3 text-sm transition-colors ${isMine ? 'border-indigo-200 dark:border-indigo-800/40 bg-indigo-50/60 dark:bg-indigo-950/20 hover:bg-indigo-100/80 dark:hover:bg-indigo-950/30 text-slate-700 dark:text-zinc-300' : 'border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300'}`}>
                                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-500/15 text-orange-500 text-xs font-bold">.html</span>
                                      <span className="min-w-0 flex-1">
                                        <span className="block truncate font-medium">{fname}</span>
                                        <span className={`block text-xs ${isMine ? 'text-indigo-400' : 'text-slate-400'}`}>Rich Text · Click to download</span>
                                      </span>
                                    </a>
                                  )
                                }
                                return (
                                  <a key={bi} href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-sm text-indigo-500 hover:bg-slate-100">
                                    <Paperclip className="h-4 w-4 shrink-0" />
                                    <span className="truncate">{fname}</span>
                                  </a>
                                )
                              }
                              if (block.kind === 'markdown') {
                                return (
                                  <div key={bi} className="prose prose-sm max-w-none prose-slate">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{block.text}</ReactMarkdown>
                                  </div>
                                )
                              }
                              if (block.kind === 'link') {
                                const pv = block.url ? previewCache[block.url]?.data : undefined
                                if (pv && (pv.title || pv.description || pv.image)) {
                                  return (
                                    <div key={bi} className="rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 p-2">
                                      {pv.image && (
                                        <a href={block.url} target="_blank" rel="noreferrer" className="mb-2 block">
                                          {/* eslint-disable-next-line @next/next/no-img-element */}
                                          <img src={pv.image} alt={pv.title || 'preview'} className="max-h-52 w-full rounded-md border border-slate-200 object-cover" />
                                        </a>
                                      )}
                                      <p className="text-xs font-semibold text-slate-700">{pv.title || block.url}</p>
                                      {pv.description && <p className="mt-1 text-xs text-slate-500">{pv.description}</p>}
                                      <a href={block.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[11px] text-indigo-500 underline break-all">{block.url}</a>
                                    </div>
                                  )
                                }
                                return (
                                  <a key={bi} href={block.url} target="_blank" rel="noreferrer" className="block text-indigo-500 underline break-all">{block.url}</a>
                                )
                              }
                              if (block.kind === 'preview') {
                                return (
                                  <div key={bi} className="rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 p-2">
                                    {block.image && (
                                      <a href={block.url} target="_blank" rel="noreferrer" className="mb-2 block">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={block.image} alt={block.title || 'preview'} className="max-h-52 w-full rounded-md border border-slate-200 object-cover" />
                                      </a>
                                    )}
                                    <p className="text-xs font-semibold text-slate-700">{block.title || 'Link Preview'}</p>
                                    {block.desc && <p className="mt-1 text-xs text-slate-500">{block.desc}</p>}
                                    {block.url && <a href={block.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[11px] text-indigo-500 underline break-all">{block.url}</a>}
                                  </div>
                                )
                              }
                              // plain text
                              if (!block.text?.trim()) return null
                              return <p key={bi} className="whitespace-pre-wrap break-words leading-relaxed">{block.text}</p>
                            })}
                          </div>
                        )
                      })()}
                      <div className={`mt-2 text-[10px] ${isMine ? 'text-indigo-400' : 'text-slate-400'}`}>
                        {formatTime(message.timestamp)}
                        {message.semantic_type && ` · ${message.semantic_type}`}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {awaitingAgent && isTaskTopic && (
        <div className="flex items-center gap-3 border-t border-slate-100 dark:border-zinc-700 bg-slate-50/50 dark:bg-zinc-800/50 px-4 py-2.5">
          <div className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-indigo-400 [animation-delay:0ms]" />
            <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-indigo-400 [animation-delay:150ms]" />
            <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-indigo-400 [animation-delay:300ms]" />
          </div>
          <span className="text-xs text-slate-500 dark:text-zinc-400">Agent thinking…</span>
        </div>
      )}

      <div className="border-t border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3 sm:p-4">
        {/* Model & Reasoning effort selector */}
        <div className="mb-2 flex items-center gap-2 text-[11px]">
          <div className="relative">
            <button
              onClick={() => setModelMenuOpen(!modelMenuOpen)}
              onBlur={() => setTimeout(() => setModelMenuOpen(false), 150)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 transition"
            >
              <span className="text-[10px]">🤖</span>
              <span className="font-medium">{AVAILABLE_MODELS.find(m => m.id === selectedModel)?.label || selectedModel}</span>
              <span className="text-slate-400">▾</span>
            </button>
            {modelMenuOpen && (
              <div className="absolute bottom-full left-0 mb-1 z-30 min-w-[180px] rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 py-1 shadow-lg">
                {AVAILABLE_MODELS.map(m => (
                  <button
                    key={m.id}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => { setSelectedModel(m.id); setModelMenuOpen(false) }}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition ${
                      selectedModel === m.id
                        ? 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 font-medium'
                        : 'text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700'
                    }`}
                  >
                    {selectedModel === m.id && <span className="text-indigo-500">✓</span>}
                    {m.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center rounded-lg border border-slate-200 dark:border-zinc-600 bg-white dark:bg-zinc-800 overflow-hidden">
            {REASONING_EFFORTS.map(e => (
              <button
                key={e.id}
                onClick={() => setReasoningEffort(e.id)}
                className={`px-2.5 py-1.5 text-[11px] transition ${
                  reasoningEffort === e.id
                    ? 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 font-medium'
                    : 'text-slate-500 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-700'
                }`}
              >
                {e.icon} {e.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-2 py-2">
          <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-lg p-2 text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-700 hover:text-slate-900 dark:hover:text-zinc-100">
            <Paperclip className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-lg p-2 text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-700 hover:text-slate-900 dark:hover:text-zinc-100">
            <ImageIcon className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-lg p-2 text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-700 hover:text-slate-900 dark:hover:text-zinc-100">
            <Mic className="h-4 w-4" />
          </button>

          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${topicName}...`}
            rows={1}
            className="max-h-28 min-h-10 flex-1 resize-none rounded-xl border border-transparent bg-transparent px-2 py-2 text-sm text-slate-800 dark:text-zinc-200 placeholder:text-slate-400 outline-none"
          />
          <button
            onClick={handleSend}
            disabled={sending || uploading || !draft.trim() || !currentAgentId}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500 text-white transition hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Send"
          >
            {sending ? '...' : <Send className="h-4 w-4" />}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) uploadAssetAndInsert(f)
              e.currentTarget.value = ''
            }}
          />
        </div>

        {recentAssets.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {recentAssets.map((a, i) => {
              const token = a.kind === 'image' ? `![](${a.url})` : a.kind === 'audio' ? `[audio](${a.url})` : `[file](${a.url})`
              return (
                <button key={`${a.url}-${i}`} type="button" onClick={() => setDraft((p) => `${p}${p ? '\n\n' : ''}${token}`)} className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] text-indigo-500">
                  Insert {a.kind}
                </button>
              )
            })}
          </div>
        )}

        {(uploading || loadingOlder) && <p className="mt-2 text-xs text-slate-400">{uploading ? 'Uploading media…' : 'Loading history…'}</p>}
      </div>
    </div>
  )
}
