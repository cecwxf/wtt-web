'use client'

import { Image as ImageIcon, Link as LinkIcon, Mic, Paperclip, Send } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
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
  const [urlPreview, setUrlPreview] = useState<{ url: string; title?: string; description?: string; site_name?: string } | null>(null)
  const [showSendPreview, setShowSendPreview] = useState(false)
  const [recentAssets, setRecentAssets] = useState<Array<{ url: string; kind: 'image' | 'audio' | 'file' }>>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const draftBlocksPreview = useMemo(() => {
    return draft
      .split(/\n\n+/)
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => {
        if (/^!\[\]\(https?:\/\//i.test(x)) return { type: 'image', value: x }
        if (/^\[audio\]\(https?:\/\//i.test(x)) return { type: 'audio', value: x }
        if (/^\[file\]\(https?:\/\//i.test(x)) return { type: 'file', value: x }
        if (/^\[link\]\(https?:\/\//i.test(x)) return { type: 'link', value: x }
        if (/^\[preview\]/i.test(x)) return { type: 'preview', value: x }
        return { type: 'markdown', value: x }
      })
  }, [draft])

  const handleSend = async () => {
    if (!draft.trim()) return

    setSending(true)
    try {
      await onSendMessage(draft.trim())
      setDraft('')
      setUrlPreview(null)
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
    try {
      const r = await fetch(`${CLIENT_WTT_API_BASE}/preview/url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: v }),
      })
      if (r.ok) {
        const j = await r.json()
        setUrlPreview(j)
      } else {
        setUrlPreview({ url: v })
      }
    } catch {
      setUrlPreview({ url: v })
    }
    setDraft((prev) => `${prev}${prev ? '\n\n' : ''}[link](${v})`)
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
                      <p className="whitespace-pre-wrap break-words">{message.content}</p>
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
            <div className="max-h-36 overflow-auto space-y-1">
              {draftBlocksPreview.map((b, i) => (
                <div key={`pv-${i}`} className="rounded border border-white/10 bg-[#111a24] px-2 py-1 text-[11px] text-[#cbd8e4]">
                  <span className="mr-1 text-[#8fb7d8]">[{b.type}]</span>
                  {b.value}
                </div>
              ))}
            </div>
          </div>
        )}

        {urlPreview && (
          <div className="mt-2 rounded-xl border border-white/10 bg-[#1a2632] p-2">
            <p className="text-[11px] text-[#7d8e9e]">URL Preview</p>
            <p className="text-sm text-[#dce8f3]">{urlPreview.title || urlPreview.url}</p>
            {urlPreview.description && <p className="text-xs text-[#9fb2c4]">{urlPreview.description}</p>}
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
