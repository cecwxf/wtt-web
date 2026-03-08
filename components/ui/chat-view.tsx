'use client'

import { Image as ImageIcon, Mic, Paperclip, Send } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'

export interface ChatMessage {
  message_id: string
  sender_id: string
  sender_type: 'human' | 'agent'
  content: string
  timestamp: string
  semantic_type?: string
}

interface ChatViewProps {
  topicName: string
  messages: ChatMessage[]
  currentAgentId: string
  onSendMessage: (content: string) => Promise<void>
  onLoadOlder?: () => Promise<void>
  onExport?: (format: 'md' | 'pdf' | 'docx') => void
  onRecall?: () => Promise<void>
  hasOlder?: boolean
  loading?: boolean
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

function classifyLine(line: string): ParsedRich {
  const c = line.trim()
  if (!c) return { kind: 'plain', text: '' }
  const imageMatch = c.match(/^!\[\]\((https?:\/\/[^)]+)\)$/i)
  if (imageMatch) return { kind: 'image', url: imageMatch[1] }
  const audioMatch = c.match(/^\[audio\]\((https?:\/\/[^)]+)\)$/i)
  if (audioMatch) return { kind: 'audio', url: audioMatch[1] }
  const videoMatch = c.match(/^\[video\]\((https?:\/\/[^)]+)\)$/i)
  if (videoMatch) return { kind: 'video', url: videoMatch[1] }
  const fileMatch = c.match(/^\[file(?::([^\]]*))?\]\((https?:\/\/[^)]+)\)$/i)
  if (fileMatch) return { kind: 'file', url: fileMatch[2], filename: fileMatch[1] || undefined }
  const linkMatch = c.match(/^\[link\]\((https?:\/\/[^)]+)\)$/i)
  if (linkMatch) return { kind: 'link', url: linkMatch[1] }
  const plainUrl = c.match(/^(https?:\/\/\S+)$/i)
  if (plainUrl) {
    const u = plainUrl[1].toLowerCase()
    if (/\.(mp4|webm|mov)(\?|$)/.test(u)) return { kind: 'video', url: plainUrl[1] }
    if (/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/.test(u)) return { kind: 'image', url: plainUrl[1] }
    if (/\.(mp3|wav|ogg)(\?|$)/.test(u)) return { kind: 'audio', url: plainUrl[1] }
    if (/\.(pdf)(\?|$)/.test(u)) return { kind: 'file', url: plainUrl[1], filename: undefined }
    if (/\.(docx|xlsx|csv|zip)(\?|$)/.test(u)) return { kind: 'file', url: plainUrl[1], filename: undefined }
    return { kind: 'link', url: plainUrl[1] }
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
    const image = (c.match(/Image:\s*(https?:\/\/\S+)/i)?.[1] || '').trim()
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
      for (const url of urls) {
        const u = url.toLowerCase()
        if (/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/.test(u)) {
          blocks.push({ kind: 'image', url })
        } else if (/\.(mp4|webm|mov)(\?|$)/.test(u)) {
          blocks.push({ kind: 'video', url })
        } else if (/\.(mp3|wav|ogg)(\?|$)/.test(u)) {
          blocks.push({ kind: 'audio', url })
        } else {
          blocks.push({ kind: 'link', url })
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

export function ChatView({
  topicName,
  messages,
  currentAgentId,
  onSendMessage,
  onLoadOlder,
  onExport,
  onRecall,
  hasOlder = false,
  loading,
}: ChatViewProps) {
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [recentAssets, setRecentAssets] = useState<Array<{ url: string; kind: 'image' | 'audio' | 'file' }>>([])
  const [previewCache, setPreviewCache] = useState<Record<string, CachedPreview>>({})
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

    setSending(true)
    try {
      await onSendMessage(draft.trim())
      setDraft('')
    } catch (error) {
      console.error('Failed to send message:', error)
      alert(error instanceof Error ? error.message : 'Failed to send message')
    } finally {
      setSending(false)
    }
  }

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
        ? `![](${asset.url})`
        : isAudio
          ? `[audio](${asset.url})`
          : isVideo
            ? `[video](${asset.url})`
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
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="truncate text-lg font-semibold">{topicName}</h2>
            <p className="mt-1 text-xs text-slate-400">{messages.length} messages loaded</p>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => onExport?.('md')} className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-500">MD</button>
            <button onClick={() => onExport?.('pdf')} className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-500">PDF</button>
            <button onClick={() => onExport?.('docx')} className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-500">DOCX</button>
            <button onClick={() => onRecall?.()} className="rounded border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] text-indigo-500">Recall</button>
          </div>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-slate-50/50 to-white px-4 py-4 sm:px-5"
      >
        <div className="mb-3 flex justify-center">
          <button
            onClick={handleLoadOlder}
            disabled={!hasOlder || loadingOlder}
            className="rounded-full border border-slate-200 bg-slate-50/85 px-3 py-1 text-xs text-slate-500 disabled:opacity-40"
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
              <span className="rounded-full bg-slate-50 px-3 py-1 text-[11px] text-slate-400">{group.label}</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            <div className="space-y-2">
              {group.messages.map((message) => {
                const isMine = message.sender_id === currentAgentId

                return (
                  <div key={message.message_id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                        isMine
                          ? 'bg-indigo-500 text-white'
                          : 'border border-slate-200 bg-slate-50/90 text-slate-700'
                      } ${isMine ? 'rounded-tr-md' : 'rounded-tl-md'}`}
                    >
                      {!isMine && <p className="mb-1 text-xs font-semibold text-indigo-600">{message.sender_id}</p>}
                      {(() => {
                        const task = parseTaskContent(message.content || '')
                        if (task.isTask) {
                          const titleMap: Record<string, string> = {
                            run: 'Task Meta',
                            status: 'Task Progress',
                            summary: 'Task Result',
                            blocked: 'Task Blocked',
                            asset: 'Task Asset',
                            review: 'Task Review',
                            other: 'Task Update',
                          }
                          return (
                            <div className="space-y-2 text-xs">
                              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-slate-700">
                                <p className="mb-1 font-semibold text-indigo-500">{titleMap[task.kind || 'other']}</p>
                                <p className="text-slate-600">task_id: {task.taskId || '-'}</p>
                                <p className="text-slate-600">session: {task.sessionId || '-'}</p>
                                <p className="text-slate-600">runner/executor: {(task.runner || '-') + '/' + (task.executor || '-')}</p>
                              </div>
                              {task.kind === 'status' && (
                                <div className="rounded-lg border border-slate-200 bg-slate-100 p-2 text-slate-700">
                                  <p className="font-semibold text-indigo-600">进度 {task.progress ? `${task.progress}%` : ''}</p>
                                  <p className="mt-1 whitespace-pre-wrap break-words text-slate-700">{task.body || '执行中'}</p>
                                </div>
                              )}
                              {(task.kind === 'summary' || task.kind === 'blocked' || task.kind === 'review') && (
                                <div className="rounded-lg border border-slate-200 bg-slate-100 p-2 text-slate-700">
                                  <p className="font-semibold text-indigo-600">结果</p>
                                  <p className="mt-1 whitespace-pre-wrap break-words text-slate-700">{task.body || '-'}</p>
                                </div>
                              )}
                              {task.kind === 'asset' && (
                                <div className="rounded-lg border border-slate-200 bg-slate-100 p-2 text-slate-700">
                                  <p className="font-semibold text-indigo-600">产物</p>
                                  {task.assetUrl ? (
                                    <a href={task.assetUrl} target="_blank" rel="noreferrer" className="text-indigo-500 underline break-all">{task.assetUrl}</a>
                                  ) : (
                                    <p className="break-all text-slate-700">{task.assetPath || task.body || '-'}</p>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        }

                        const blocks = parseRichBlocks(message.content || '')
                        return (
                          <div className="space-y-2">
                            {blocks.map((block, bi) => {
                              if (block.kind === 'image') {
                                return (
                                  <a key={bi} href={block.url} target="_blank" rel="noreferrer" className="block">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={block.url} alt="image" className="max-h-64 w-auto rounded-lg border border-slate-200" />
                                  </a>
                                )
                              }
                              if (block.kind === 'audio') {
                                return <audio key={bi} controls src={block.url} className="w-full max-w-xs" />
                              }
                              if (block.kind === 'video') {
                                return (
                                  <video key={bi} controls preload="metadata" className="max-h-72 w-full rounded-lg border border-slate-200">
                                    <source src={block.url} />
                                  </video>
                                )
                              }
                              if (block.kind === 'file') {
                                const url = block.url
                                const fname = block.filename || url.split('/').pop() || 'file'
                                const isPdf = /\.pdf(\?|$)/i.test(url)
                                if (isPdf) {
                                  return (
                                    <div key={bi} className="space-y-1">
                                      <iframe src={url} title={fname} className="h-80 w-full rounded-lg border border-slate-200" />
                                      <a href={url} target="_blank" rel="noreferrer" className="inline-block text-xs text-indigo-500 underline">Open PDF</a>
                                    </div>
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
                                  <div key={bi} className={`prose prose-sm max-w-none ${isMine ? 'prose-invert' : ''}`}>
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{block.text}</ReactMarkdown>
                                  </div>
                                )
                              }
                              if (block.kind === 'link') {
                                const pv = block.url ? previewCache[block.url]?.data : undefined
                                if (pv && (pv.title || pv.description || pv.image)) {
                                  return (
                                    <div key={bi} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
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
                                  <div key={bi} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
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
                              return <p key={bi} className="whitespace-pre-wrap break-words">{block.text}</p>
                            })}
                          </div>
                        )
                      })()}
                      <div className={`mt-2 text-[10px] ${isMine ? 'text-white/65' : 'text-slate-400'}`}>
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

      <div className="border-t border-slate-200 bg-white p-3 sm:p-4">
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-2 py-2">
          <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900">
            <Paperclip className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900">
            <ImageIcon className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900">
            <Mic className="h-4 w-4" />
          </button>

          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${topicName}...`}
            rows={1}
            className="max-h-28 min-h-10 flex-1 resize-none rounded-xl border border-transparent bg-transparent px-2 py-2 text-sm text-slate-800 outline-none"
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
