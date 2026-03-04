'use client'

import { Image as ImageIcon, Link as LinkIcon, Mic, Paperclip, Send } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  | { kind: 'file'; url: string }
  | { kind: 'link'; url: string }
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

function extractFirstUrl(content: string): string | null {
  const m = (content || '').match(/https?:\/\/\S+/i)
  return m ? m[0] : null
}

function parseRichContent(content: string): ParsedRich {
  const c = (content || '').trim()
  const imageMatch = c.match(/^!\[\]\((https?:\/\/[^)]+)\)$/i)
  if (imageMatch) return { kind: 'image', url: imageMatch[1] }
  const audioMatch = c.match(/^\[audio\]\((https?:\/\/[^)]+)\)$/i)
  if (audioMatch) return { kind: 'audio', url: audioMatch[1] }
  const fileMatch = c.match(/^\[file\]\((https?:\/\/[^)]+)\)$/i)
  if (fileMatch) return { kind: 'file', url: fileMatch[1] }
  const linkMatch = c.match(/^\[link\]\((https?:\/\/[^)]+)\)$/i)
  if (linkMatch) return { kind: 'link', url: linkMatch[1] }
  const plainUrl = c.match(/^(https?:\/\/\S+)$/i)
  if (plainUrl) return { kind: 'link', url: plainUrl[1] }

  if (c.startsWith('[preview]')) {
    const title = (c.match(/Title:\s*(.*)/i)?.[1] || '').trim()
    const desc = (c.match(/Desc:\s*(.*)/i)?.[1] || '').trim()
    const url = (c.match(/URL:\s*(https?:\/\/\S+)/i)?.[1] || '').trim()
    const image = (c.match(/Image:\s*(https?:\/\/\S+)/i)?.[1] || '').trim()
    return { kind: 'preview', title, desc, url, image }
  }

  return { kind: 'plain', text: content }
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
  const [showSendPreview, setShowSendPreview] = useState(false)
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

  type DraftBlock = {
    type: 'image' | 'audio' | 'file' | 'link' | 'preview' | 'markdown'
    value: string
    title?: string
    desc?: string
    url?: string
    image?: string
  }

  const parseDraftBlocks = useCallback((text: string): DraftBlock[] => {
    return text
      .split(/\n\n+/)
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => {
        const image = x.match(/^!\[\]\((https?:\/\/[^)]+)\)$/i)
        if (image) return { type: 'image', value: x, url: image[1] }
        const audio = x.match(/^\[audio\]\((https?:\/\/[^)]+)\)$/i)
        if (audio) return { type: 'audio', value: x, url: audio[1] }
        const file = x.match(/^\[file\]\((https?:\/\/[^)]+)\)$/i)
        if (file) return { type: 'file', value: x, url: file[1] }
        const link = x.match(/^\[link\]\((https?:\/\/[^)]+)\)$/i)
        if (link) return { type: 'link', value: x, url: link[1] }
        if (/^\[preview\]/i.test(x)) {
          const title = (x.match(/Title:\s*(.*)/i)?.[1] || '').trim()
          const desc = (x.match(/Desc:\s*(.*)/i)?.[1] || '').trim()
          const url = (x.match(/URL:\s*(https?:\/\/\S+)/i)?.[1] || '').trim()
          const image = (x.match(/Image:\s*(https?:\/\/\S+)/i)?.[1] || '').trim()
          return { type: 'preview', value: x, title, desc, url, image }
        }
        return { type: 'markdown', value: x }
      })
  }, [])

  const blocksToDraft = (blocks: DraftBlock[]) => {
    return blocks
      .map((b) => {
        if (b.type === 'preview') {
          return `[preview]\nTitle: ${b.title || ''}\nDesc: ${b.desc || ''}\nURL: ${b.url || ''}\nImage: ${b.image || ''}`
        }
        return b.value
      })
      .filter(Boolean)
      .join('\n\n')
  }

  const draftBlocksPreview = useMemo(() => parseDraftBlocks(draft), [draft, parseDraftBlocks])

  const moveDraftBlock = (idx: number, dir: -1 | 1) => {
    const blocks = parseDraftBlocks(draft)
    const to = idx + dir
    if (to < 0 || to >= blocks.length) return
    const next = [...blocks]
    ;[next[idx], next[to]] = [next[to], next[idx]]
    setDraft(blocksToDraft(next))
  }

  const removeDraftBlock = (idx: number) => {
    const blocks = parseDraftBlocks(draft)
    if (idx < 0 || idx >= blocks.length) return
    const next = [...blocks.slice(0, idx), ...blocks.slice(idx + 1)]
    setDraft(blocksToDraft(next))
  }

  const updatePreviewBlock = (idx: number, field: 'title' | 'desc' | 'url' | 'image', value: string) => {
    const blocks = parseDraftBlocks(draft)
    if (idx < 0 || idx >= blocks.length) return
    const b = blocks[idx]
    if (b.type !== 'preview') return
    const next = [...blocks]
    next[idx] = { ...b, [field]: value }
    setDraft(blocksToDraft(next))
  }

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
      const kind: 'image' | 'audio' | 'file' = isImage ? 'image' : isAudio ? 'audio' : 'file'
      const token = isImage ? `![](${asset.url})` : isAudio ? `[audio](${asset.url})` : `[file](${asset.url})`
      setDraft((prev) => `${prev}${prev ? '\n\n' : ''}${token}`)
      setRecentAssets((prev) => [{ url: asset.url, kind }, ...prev].slice(0, 8))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const insertUrlWithPreview = async () => {
    const url = prompt('Paste URL')
    if (!url) return
    const v = url.trim()

    let title = ''
    let desc = ''
    let image = ''
    try {
      const r = await fetch(`${CLIENT_WTT_API_BASE}/preview/url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: v }),
      })
      if (r.ok) {
        const j = await r.json()
        title = j?.title || ''
        desc = j?.description || ''
        image = j?.image || ''
      }
    } catch {
      // fallback to plain link block
    }

    const block = title || desc || image
      ? `[preview]\nTitle: ${title}\nDesc: ${desc}\nURL: ${v}\nImage: ${image}`
      : `[link](${v})`

    setDraft((prev) => `${prev}${prev ? '\n\n' : ''}${block}`)
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
      const parsed = parseRichContent(m.content || '')
      const candidateUrl = parsed.kind === 'link' ? parsed.url : extractFirstUrl(m.content || '')
      if (candidateUrl) {
        const cached = previewCache[candidateUrl]
        const isFresh = cached && now - cached.fetchedAt < TTL_MS
        if (!isFresh) urls.add(candidateUrl)
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
      <div className="border-b border-white/10 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="truncate text-lg font-semibold">{topicName}</h2>
            <p className="mt-1 text-xs text-[#7d8e9e]">{messages.length} messages loaded</p>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => onExport?.('md')} className="rounded border border-white/10 px-2 py-1 text-[11px] text-[#a5b3c2]">MD</button>
            <button onClick={() => onExport?.('pdf')} className="rounded border border-white/10 px-2 py-1 text-[11px] text-[#a5b3c2]">PDF</button>
            <button onClick={() => onExport?.('docx')} className="rounded border border-white/10 px-2 py-1 text-[11px] text-[#a5b3c2]">DOCX</button>
            <button onClick={() => onRecall?.()} className="rounded border border-[#2ea6ff44] bg-[#2ea6ff14] px-2 py-1 text-[11px] text-[#9fd6ff]">Recall</button>
          </div>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto bg-[url('/themes/cn-ink-abstract.svg'),radial-gradient(ellipse_at_20%_80%,#2ea6ff0f_0%,transparent_60%),radial-gradient(ellipse_at_80%_20%,#00d4aa0f_0%,transparent_60%)] bg-cover bg-fixed bg-center px-4 py-4 sm:px-5"
      >
        <div className="mb-3 flex justify-center">
          <button
            onClick={handleLoadOlder}
            disabled={!hasOlder || loadingOlder}
            className="rounded-full border border-white/15 bg-[#1c2733]/85 px-3 py-1 text-xs text-[#b6c7d7] disabled:opacity-40"
          >
            {loadingOlder ? 'Loading history...' : hasOlder ? 'Load older messages' : 'No older messages'}
          </button>
        </div>

        {loading && messages.length === 0 && (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[#2ea6ff]" />
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="pt-20 text-center text-sm text-[#7d8e9e]">No messages yet. Start the conversation!</div>
        )}

        {groupedMessages.map((group) => (
          <div key={group.label} className="mb-4">
            <div className="mb-3 flex items-center gap-3">
              <div className="h-px flex-1 bg-white/10" />
              <span className="rounded-full bg-[#1c2733] px-3 py-1 text-[11px] text-[#6f8396]">{group.label}</span>
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
                          ? 'bg-[#2b5278] text-white'
                          : 'border border-white/10 bg-[#1c2733]/90 text-[#d7e4ef]'
                      } ${isMine ? 'rounded-tr-md' : 'rounded-tl-md'}`}
                    >
                      {!isMine && <p className="mb-1 text-xs font-semibold text-[#2ea6ff]">{message.sender_id}</p>}
                      {(() => {
                        const parsed = parseRichContent(message.content || '')
                        if (parsed.kind === 'image') {
                          return (
                            <a href={parsed.url} target="_blank" rel="noreferrer" className="block">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={parsed.url} alt="image" className="max-h-64 w-auto rounded-lg border border-white/10" />
                            </a>
                          )
                        }
                        if (parsed.kind === 'audio') {
                          return <audio controls src={parsed.url} className="w-full max-w-xs" />
                        }
                        if (parsed.kind === 'file') {
                          return (
                            <a href={parsed.url} target="_blank" rel="noreferrer" className="text-[#8fd6ff] underline break-all">
                              Download file
                            </a>
                          )
                        }
                        if (parsed.kind === 'link') {
                          const pv = parsed.url ? previewCache[parsed.url]?.data : undefined
                          if (pv && (pv.title || pv.description || pv.image)) {
                            return (
                              <div className="rounded-lg border border-white/15 bg-[#0f1b27] p-2">
                                {pv.image && (
                                  <a href={parsed.url} target="_blank" rel="noreferrer" className="mb-2 block">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={pv.image} alt={pv.title || 'preview'} className="max-h-52 w-full rounded-md border border-white/10 object-cover" />
                                  </a>
                                )}
                                <p className="text-xs font-semibold text-[#dce8f3]">{pv.title || parsed.url}</p>
                                {pv.description && <p className="mt-1 text-xs text-[#9fb2c4]">{pv.description}</p>}
                                <a href={parsed.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[11px] text-[#8fd6ff] underline break-all">
                                  {parsed.url}
                                </a>
                              </div>
                            )
                          }
                          return (
                            <a href={parsed.url} target="_blank" rel="noreferrer" className="text-[#8fd6ff] underline break-all">
                              {parsed.url}
                            </a>
                          )
                        }
                        if (parsed.kind === 'preview') {
                          return (
                            <div className="rounded-lg border border-white/15 bg-[#0f1b27] p-2">
                              {parsed.image && (
                                <a href={parsed.url} target="_blank" rel="noreferrer" className="mb-2 block">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={parsed.image} alt={parsed.title || 'preview'} className="max-h-52 w-full rounded-md border border-white/10 object-cover" />
                                </a>
                              )}
                              <p className="text-xs font-semibold text-[#dce8f3]">{parsed.title || 'Link Preview'}</p>
                              {parsed.desc && <p className="mt-1 text-xs text-[#9fb2c4]">{parsed.desc}</p>}
                              {parsed.url && (
                                <a href={parsed.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[11px] text-[#8fd6ff] underline break-all">
                                  {parsed.url}
                                </a>
                              )}
                            </div>
                          )
                        }
                        const inlineUrl = extractFirstUrl(parsed.text || '')
                        const inlinePv = inlineUrl ? previewCache[inlineUrl]?.data : undefined
                        return (
                          <div>
                            <p className="whitespace-pre-wrap break-words">{parsed.text}</p>
                            {inlineUrl && inlinePv && (inlinePv.title || inlinePv.description || inlinePv.image) && (
                              <div className="mt-2 rounded-lg border border-white/15 bg-[#0f1b27] p-2">
                                {inlinePv.image && (
                                  <a href={inlineUrl} target="_blank" rel="noreferrer" className="mb-2 block">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={inlinePv.image} alt={inlinePv.title || 'preview'} className="max-h-52 w-full rounded-md border border-white/10 object-cover" />
                                  </a>
                                )}
                                <p className="text-xs font-semibold text-[#dce8f3]">{inlinePv.title || inlineUrl}</p>
                                {inlinePv.description && <p className="mt-1 text-xs text-[#9fb2c4]">{inlinePv.description}</p>}
                                <a href={inlineUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[11px] text-[#8fd6ff] underline break-all">
                                  {inlineUrl}
                                </a>
                              </div>
                            )}
                          </div>
                        )
                      })()}
                      <div className={`mt-2 text-[10px] ${isMine ? 'text-white/65' : 'text-[#6f8396]'}`}>
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

      <div className="border-t border-white/10 bg-[#17212b] p-3 sm:p-4">
        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-[#1c2733] px-2 py-2">
          <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-lg p-2 text-[#8ca0b3] hover:bg-[#243140] hover:text-white">
            <Paperclip className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-lg p-2 text-[#8ca0b3] hover:bg-[#243140] hover:text-white">
            <ImageIcon className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-lg p-2 text-[#8ca0b3] hover:bg-[#243140] hover:text-white">
            <Mic className="h-4 w-4" />
          </button>
          <button type="button" onClick={insertUrlWithPreview} className="rounded-lg p-2 text-[#8ca0b3] hover:bg-[#243140] hover:text-white">
            <LinkIcon className="h-4 w-4" />
          </button>

          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${topicName}...`}
            rows={1}
            className="max-h-28 min-h-10 flex-1 resize-none rounded-xl border border-transparent bg-transparent px-2 py-2 text-sm text-[#e8edf2] outline-none"
          />
          <button
            onClick={handleSend}
            disabled={sending || uploading || !draft.trim() || !currentAgentId}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#2ea6ff] text-white transition hover:bg-[#1f94ec] disabled:cursor-not-allowed disabled:opacity-60"
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

        <div className="mt-2 flex items-center gap-2">
          <button type="button" onClick={() => setShowSendPreview((v) => !v)} className="rounded-md border border-white/10 bg-[#1c2733] px-2 py-1 text-[11px] text-[#9fb2c4]">
            {showSendPreview ? 'Hide Send Preview' : 'Show Send Preview'}
          </button>
        </div>

        {showSendPreview && draftBlocksPreview.length > 0 && (
          <div className="mt-2 rounded-xl border border-white/10 bg-[#1a2632] p-2">
            <p className="mb-2 text-[11px] text-[#7d8e9e]">Send preview ({draftBlocksPreview.length} blocks)</p>
            <div className="max-h-44 overflow-auto space-y-1">
              {draftBlocksPreview.map((b, i) => (
                <div key={`pv-${i}`} className="rounded border border-white/10 bg-[#111a24] px-2 py-1 text-[11px] text-[#cbd8e4]">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="mr-1 text-[#8fb7d8]">[{b.type}]</span>
                      <span className="truncate">{b.value}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => moveDraftBlock(i, -1)} className="rounded border border-white/10 px-1 text-[10px] text-[#9fb2c4]">↑</button>
                      <button type="button" onClick={() => moveDraftBlock(i, 1)} className="rounded border border-white/10 px-1 text-[10px] text-[#9fb2c4]">↓</button>
                      <button type="button" onClick={() => removeDraftBlock(i)} className="rounded border border-red-500/30 px-1 text-[10px] text-red-300">×</button>
                    </div>
                  </div>
                  {b.type === 'preview' && (
                    <div className="mt-2 grid grid-cols-1 gap-1">
                      <input value={b.title || ''} onChange={(e) => updatePreviewBlock(i, 'title', e.target.value)} placeholder="Preview title" className="rounded border border-white/10 bg-[#0b1420] px-2 py-1 text-[10px] text-[#dce8f3] outline-none" />
                      <input value={b.desc || ''} onChange={(e) => updatePreviewBlock(i, 'desc', e.target.value)} placeholder="Preview description" className="rounded border border-white/10 bg-[#0b1420] px-2 py-1 text-[10px] text-[#9fb2c4] outline-none" />
                      <input value={b.url || ''} onChange={(e) => updatePreviewBlock(i, 'url', e.target.value)} placeholder="Preview URL" className="rounded border border-white/10 bg-[#0b1420] px-2 py-1 text-[10px] text-[#8fd6ff] outline-none" />
                      <input value={b.image || ''} onChange={(e) => updatePreviewBlock(i, 'image', e.target.value)} placeholder="Preview image URL" className="rounded border border-white/10 bg-[#0b1420] px-2 py-1 text-[10px] text-[#9fd6ff] outline-none" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {recentAssets.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {recentAssets.map((a, i) => {
              const token = a.kind === 'image' ? `![](${a.url})` : a.kind === 'audio' ? `[audio](${a.url})` : `[file](${a.url})`
              return (
                <button key={`${a.url}-${i}`} type="button" onClick={() => setDraft((p) => `${p}${p ? '\n\n' : ''}${token}`)} className="rounded border border-white/10 bg-[#1c2733] px-2 py-1 text-[10px] text-[#9fd6ff]">
                  Insert {a.kind}
                </button>
              )
            })}
          </div>
        )}

        {(uploading || loadingOlder) && <p className="mt-2 text-xs text-[#7d8e9e]">{uploading ? 'Uploading media…' : 'Loading history…'}</p>}
      </div>
    </div>
  )
}
