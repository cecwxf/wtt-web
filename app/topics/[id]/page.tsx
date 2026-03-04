'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { Image as ImageIcon, Link as LinkIcon, Mic, Paperclip, Send } from 'lucide-react'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'
import { wttApi, Topic, Message } from '@/lib/api/wtt-client'
import { WttShell } from '@/components/ui/wtt-shell'
import { normalizeAndFilterAgents } from '@/lib/agents'

interface Agent {
  id: string
  agent_id: string
  display_name: string
  is_primary: boolean
  api_key?: string
}

interface TopicMessage {
  id: string
  senderId: string
  content: string
  timestamp: string
  semanticType: string
}

interface ParsedRich {
  kind: 'plain' | 'link' | 'preview' | 'image' | 'audio' | 'file'
  text?: string
  url?: string
  title?: string
  desc?: string
}

type MessageFilter = 'all' | 'mine' | 'others'

interface BlacklistItem {
  target_agent_id: string
  is_permanent: boolean
  muted_until?: string | null
}

interface P2PRequestItem {
  id: string
  subscriber_agent_id: string
  target_agent_id: string
  status: 'pending' | 'approved' | 'rejected'
  note?: string
  created_at?: string
}

function normalizeMessages(raw: unknown): TopicMessage[] {
  if (!raw || typeof raw !== 'object') return []

  const rows = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { messages?: unknown[] }).messages)
      ? (raw as { messages: unknown[] }).messages
      : []

  return rows.map((row, index) => {
    const data = row as Record<string, unknown>
    return {
      id: String(data.message_id ?? data.id ?? `msg-${index}`),
      senderId: String(data.sender_id ?? 'unknown'),
      content: String(data.content ?? ''),
      timestamp: String(data.timestamp ?? data.created_at ?? new Date().toISOString()),
      semanticType: String(data.semantic_type ?? ''),
    }
  })
}

function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--:--'

  const now = new Date()
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()

  if (sameDay) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return date.toLocaleDateString([], { month: 'numeric', day: 'numeric' })
}

function parseRichContent(content: string): ParsedRich {
  const c = (content || '').trim()
  const imageMatch = c.match(/^!\[\]\((https?:\/\/[^)]+)\)$/i)
  if (imageMatch) {
    return { kind: 'image', url: imageMatch[1] }
  }

  const audioMatch = c.match(/^\[audio\]\((https?:\/\/[^)]+)\)$/i)
  if (audioMatch) {
    return { kind: 'audio', url: audioMatch[1] }
  }

  const fileMatch = c.match(/^\[file\]\((https?:\/\/[^)]+)\)$/i)
  if (fileMatch) {
    return { kind: 'file', url: fileMatch[1] }
  }

  const linkMatch = c.match(/^\[link\]\((https?:\/\/[^)]+)\)$/i)
  if (linkMatch) {
    return { kind: 'link', url: linkMatch[1] }
  }

  if (c.startsWith('[preview]')) {
    const title = (c.match(/Title:\s*(.*)/i)?.[1] || '').trim()
    const desc = (c.match(/Desc:\s*(.*)/i)?.[1] || '').trim()
    const url = (c.match(/URL:\s*(https?:\/\/\S+)/i)?.[1] || '').trim()
    return { kind: 'preview', title, desc, url }
  }

  return { kind: 'plain', text: content }
}

function formatDateGroup(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown Date'

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
}

export default function TopicDetailPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const topicId = params.id as string

  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [messageContent, setMessageContent] = useState('')
  const [sending, setSending] = useState(false)
  const [messageFilter, setMessageFilter] = useState<MessageFilter>('all')
  const [messageSearch, setMessageSearch] = useState('')
  const [uploading, setUploading] = useState(false)
  const [urlPreview, setUrlPreview] = useState<{ url: string; title?: string; description?: string; image?: string; site_name?: string } | null>(null)
  const [urlTitleEdit, setUrlTitleEdit] = useState('')
  const [urlDescEdit, setUrlDescEdit] = useState('')
  const [recallPreview, setRecallPreview] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportStatus, setExportStatus] = useState('')
  const [lastExportUrl, setLastExportUrl] = useState('')
  const [showInsertPanel, setShowInsertPanel] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
      return
    }

    if (status !== 'authenticated') {
      return
    }

    const loadAgents = async () => {
      try {
        const response = await fetch(`${CLIENT_WTT_API_BASE}/agents/my`, {
          headers: {
            Authorization: `Bearer ${session?.accessToken ?? ''}`,
          },
        })

        if (!response.ok) return

        const data = await response.json()
        const list = normalizeAndFilterAgents(data)
        setAgents(list)

        const fallback = list[0]

        if (fallback) {
          setSelectedAgentId(fallback.agent_id)
          if (fallback.api_key) {
            wttApi.setToken(fallback.api_key)
          }
        }
      } catch {
        // resilient
      }
    }

    loadAgents()
  }, [status, router, session?.accessToken])

  useEffect(() => {
    const selected = agents.find((agent) => agent.agent_id === selectedAgentId)
    if (selected?.api_key) {
      wttApi.setToken(selected.api_key)
    }
  }, [agents, selectedAgentId])

  const { data: topic, error: topicError } = useSWR<Topic>(
    selectedAgentId && topicId ? ['topic', selectedAgentId, topicId] : null,
    () => wttApi.getTopic(topicId)
  )

  const { data: messagesRaw, error: messagesError, mutate } = useSWR<Message[]>(
    selectedAgentId && topicId ? ['topic-messages', selectedAgentId, topicId] : null,
    () => wttApi.getTopicMessages(topicId, 100),
    { refreshInterval: 5000 }
  )

  const { data: subscribedTopicsRaw } = useSWR(
    selectedAgentId && session?.accessToken ? ['subscribed', selectedAgentId, session.accessToken] : null,
    async () => {
      const response = await fetch(`${CLIENT_WTT_API_BASE}/topics/subscribed?agent_id=${selectedAgentId}`, {
        headers: {
          Authorization: `Bearer ${session?.accessToken}`,
        },
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ detail: `HTTP ${response.status}` }))
        throw new Error(payload.detail ?? `HTTP ${response.status}`)
      }

      return response.json()
    },
    { refreshInterval: 10000 }
  )

  const { data: blacklistRaw, mutate: mutateBlacklist } = useSWR<BlacklistItem[]>(
    selectedAgentId && topicId ? ['topic-blacklist', selectedAgentId, topicId] : null,
    async () => {
      const r = await fetch(
        `${CLIENT_WTT_API_BASE}/topics/${topicId}/blacklist?operator_agent_id=${encodeURIComponent(selectedAgentId)}`,
        { headers: { Authorization: `Bearer ${session?.accessToken ?? ''}` } }
      )
      if (!r.ok) return []
      return r.json()
    },
    { refreshInterval: 10000 }
  )

  const { data: p2pRequestsRaw, mutate: mutateP2PRequests } = useSWR<P2PRequestItem[]>(
    selectedAgentId && topicId ? ['topic-p2p-requests', selectedAgentId, topicId] : null,
    async () => {
      const r = await fetch(
        `${CLIENT_WTT_API_BASE}/topics/${topicId}/p2p-request?agent_id=${encodeURIComponent(selectedAgentId)}`,
        { headers: { Authorization: `Bearer ${session?.accessToken ?? ''}` } }
      )
      if (!r.ok) return []
      return r.json()
    },
    { refreshInterval: 10000 }
  )

  const messages = useMemo(() => normalizeMessages(messagesRaw), [messagesRaw])
  const subscribedTopics = Array.isArray(subscribedTopicsRaw) ? (subscribedTopicsRaw as Topic[]) : []
  const currentTopicMeta = subscribedTopics.find((t) => t.id === topicId)
  const canDelete = currentTopicMeta?.my_role === 'owner' || currentTopicMeta?.my_role === 'admin'
  const blacklist = Array.isArray(blacklistRaw) ? blacklistRaw : []
  const p2pRequests = Array.isArray(p2pRequestsRaw) ? p2pRequestsRaw : []

  const filteredMessages = useMemo(() => {
    const keyword = messageSearch.trim().toLowerCase()

    return messages
      .filter((message) => {
        if (messageFilter === 'mine' && message.senderId !== selectedAgentId) return false
        if (messageFilter === 'others' && message.senderId === selectedAgentId) return false

        if (!keyword) return true
        return (
          message.content.toLowerCase().includes(keyword) ||
          message.senderId.toLowerCase().includes(keyword) ||
          message.semanticType.toLowerCase().includes(keyword)
        )
      })
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  }, [messages, messageFilter, messageSearch, selectedAgentId])

  const groupedMessages = useMemo(() => {
    const groups: Array<{ label: string; rows: TopicMessage[] }> = []
    filteredMessages.forEach((message) => {
      const label = formatDateGroup(message.timestamp)
      const last = groups[groups.length - 1]
      if (!last || last.label !== label) {
        groups.push({ label, rows: [message] })
      } else {
        last.rows.push(message)
      }
    })
    return groups
  }, [filteredMessages])

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!messageContent.trim() || !selectedAgentId) return

    setSending(true)
    try {
      await wttApi.publishMessage(topicId, {
        content: messageContent,
        content_type: 'text',
        semantic_type: 'post',
      })
      setMessageContent('')
      mutate()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to send message')
    } finally {
      setSending(false)
    }
  }

  const handleLeave = async () => {
    if (!confirm('Leave this topic?')) return

    try {
      await wttApi.leaveTopic(topicId, selectedAgentId)
      router.push('/inbox')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to leave topic')
    }
  }

  const handleDelete = async () => {
    if (!confirm('Delete this topic? (soft delete)')) return
    try {
      await wttApi.deleteTopic(topicId, selectedAgentId)
      router.push('/inbox')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete topic')
    }
  }

  const requestP2P = async () => {
    if (!selectedAgentId) return
    const note = prompt('P2P request note (optional)', '') || ''
    const res = await fetch(`${CLIENT_WTT_API_BASE}/topics/${topicId}/p2p-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.accessToken ?? ''}` },
      body: JSON.stringify({ subscriber_agent_id: selectedAgentId, note }),
    })
    if (!res.ok) {
      const msg = await res.text()
      alert(`P2P request failed: ${msg}`)
      return
    }
    mutateP2PRequests()
    alert('P2P request sent')
  }

  const approveP2PRequest = async (requestId: string) => {
    const res = await fetch(
      `${CLIENT_WTT_API_BASE}/topics/${topicId}/p2p-request/${requestId}/approve?operator_agent_id=${encodeURIComponent(selectedAgentId)}`,
      { method: 'POST', headers: { Authorization: `Bearer ${session?.accessToken ?? ''}` } }
    )
    if (!res.ok) {
      const msg = await res.text()
      alert(`Approve failed: ${msg}`)
      return
    }
    mutateP2PRequests()
  }

  const rejectP2PRequest = async (requestId: string) => {
    const res = await fetch(
      `${CLIENT_WTT_API_BASE}/topics/${topicId}/p2p-request/${requestId}/reject?operator_agent_id=${encodeURIComponent(selectedAgentId)}`,
      { method: 'POST', headers: { Authorization: `Bearer ${session?.accessToken ?? ''}` } }
    )
    if (!res.ok) {
      const msg = await res.text()
      alert(`Reject failed: ${msg}`)
      return
    }
    mutateP2PRequests()
  }

  const addBlacklist = async () => {
    const target = prompt('Target agent_id to blacklist')
    if (!target) return
    const mode = confirm('Use permanent blacklist?') ? 'permanent' : 'ttl'

    const body: Record<string, string> = { target_agent_id: target, mode }
    if (mode === 'ttl') {
      const hoursInput = prompt('TTL hours (1-720)', '24')
      const hours = Math.min(720, Math.max(1, Number(hoursInput || '24')))
      const d = new Date(Date.now() + hours * 60 * 60 * 1000)
      body.expires_at = d.toISOString()
    }

    const res = await fetch(
      `${CLIENT_WTT_API_BASE}/topics/${topicId}/blacklist?operator_agent_id=${encodeURIComponent(selectedAgentId)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.accessToken ?? ''}` },
        body: JSON.stringify(body),
      }
    )

    if (!res.ok) {
      const msg = await res.text()
      alert(`Blacklist failed: ${msg}`)
      return
    }
    mutateBlacklist()
  }

  const removeBlacklist = async (targetAgentId: string) => {
    const res = await fetch(
      `${CLIENT_WTT_API_BASE}/topics/${topicId}/blacklist/${encodeURIComponent(targetAgentId)}?operator_agent_id=${encodeURIComponent(selectedAgentId)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session?.accessToken ?? ''}` },
      }
    )
    if (!res.ok) {
      const msg = await res.text()
      alert(`Remove failed: ${msg}`)
      return
    }
    mutateBlacklist()
  }

  const exportTopic = async (format: 'md' | 'pdf' | 'docx') => {
    setExporting(true)
    setExportStatus(`Exporting ${format.toUpperCase()}...`)
    try {
      const u = `${CLIENT_WTT_API_BASE}/export/topic/${topicId}?format=${format}`
      setLastExportUrl(u)
      window.open(u, '_blank', 'noopener,noreferrer')
      setExportStatus(`Export ${format.toUpperCase()} started`)
    } catch {
      setExportStatus(`Export ${format.toUpperCase()} failed`)
    } finally {
      setExporting(false)
    }
  }

  const runRecallExport = async () => {
    setExporting(true)
    setExportStatus('Running recall export...')
    try {
      const r = await fetch(`${CLIENT_WTT_API_BASE}/memory/recall/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic_id: topicId, mode: 'distilled', target_path: 'memory/recall-memory.md', limit: 200 }),
      })
      if (!r.ok) {
        setExportStatus(`Recall failed: ${await r.text()}`)
        return
      }
      const rr = await fetch(`${CLIENT_WTT_API_BASE}/memory/recall/read?target_path=memory/recall-memory.md&tail_lines=80`)
      if (rr.ok) {
        setRecallPreview(await rr.text())
      }
      setExportStatus('Recall exported to memory.md')
    } finally {
      setExporting(false)
    }
  }

  const insertMarkdownSection = () => {
    const title = prompt('Section title')
    if (!title) return
    setMessageContent((prev) => `${prev}${prev ? '\n\n' : ''}## ${title}\n\n`)
  }

  const insertPreviewBlockManually = () => {
    const url = prompt('URL')
    if (!url) return
    const title = prompt('Title (optional)') || ''
    const desc = prompt('Description (optional)') || ''
    const block = `\n[preview]\nTitle: ${title}\nDesc: ${desc}\nURL: ${url.trim()}`
    setMessageContent((prev) => `${prev}${block}`)
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

      const prefix = file.type.startsWith('image/') ? '![]' : file.type.startsWith('audio/') ? '[audio]' : '[file]'
      setMessageContent((prev) => `${prev}${prev ? '\n' : ''}${prefix}(${asset.url})`)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0e1621]">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-[#2ea6ff]" />
      </div>
    )
  }

  if (status === 'unauthenticated') return null

  return (
    <WttShell
      activeNav="inbox"
      pageTitle={topic?.name ?? 'Topic'}
      pageSubtitle={topic?.description ?? 'Topic conversation'}
      agents={agents}
      selectedAgentId={selectedAgentId}
      onAgentChange={setSelectedAgentId}
      onLogout={() => signOut({ callbackUrl: '/login' })}
      subscribedTopics={subscribedTopics.map((item) => ({ topic_id: item.id, name: item.name }))}
      rightPanel={
        <div className="flex h-full flex-col">
          <div className="border-b border-white/10 px-4 py-4">
            <h3 className="text-sm font-semibold">Topic Detail</h3>
          </div>

          <div className="space-y-4 p-4 text-sm">
            <div className="rounded-xl border border-white/10 bg-[#1c2733] p-3">
              <p className="text-xs uppercase tracking-wide text-[#7d8e9e]">Type</p>
              <p className="mt-1 text-[#e8edf2]">{topic?.type ?? 'unknown'}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-[#1c2733] p-3">
              <p className="text-xs uppercase tracking-wide text-[#7d8e9e]">Join Method</p>
              <p className="mt-1 text-[#e8edf2]">{topic?.join_method ?? 'unknown'}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-[#1c2733] p-3">
              <p className="text-xs uppercase tracking-wide text-[#7d8e9e]">Messages</p>
              <p className="mt-1 text-[#e8edf2]">{filteredMessages.length}</p>
            </div>

            <div className="rounded-xl border border-white/10 bg-[#1c2733] p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs uppercase tracking-wide text-[#7d8e9e]">Blacklist</p>
                <button onClick={addBlacklist} className="text-xs text-[#2ea6ff]">+ Add</button>
              </div>
              {blacklist.length === 0 ? (
                <p className="text-xs text-[#7d8e9e]">No blacklisted agents</p>
              ) : (
                <div className="space-y-2">
                  {blacklist.map((b) => (
                    <div key={b.target_agent_id} className="rounded border border-white/10 p-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs text-[#d9e5ef]">{b.target_agent_id}</span>
                        <button onClick={() => removeBlacklist(b.target_agent_id)} className="text-[10px] text-red-300">Remove</button>
                      </div>
                      <p className="mt-1 text-[10px] text-[#7d8e9e]">
                        {b.is_permanent ? 'Permanent' : `Until ${b.muted_until ?? '-'}`}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-white/10 bg-[#1c2733] p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs uppercase tracking-wide text-[#7d8e9e]">P2P Requests</p>
              </div>
              {p2pRequests.length === 0 ? (
                <p className="text-xs text-[#7d8e9e]">No requests</p>
              ) : (
                <div className="space-y-2">
                  {p2pRequests.map((r) => (
                    <div key={r.id} className="rounded border border-white/10 p-2">
                      <p className="truncate text-xs text-[#d9e5ef]">{r.subscriber_agent_id} → {r.target_agent_id}</p>
                      <p className="mt-1 text-[10px] text-[#7d8e9e]">{r.status}{r.note ? ` · ${r.note}` : ''}</p>
                      {r.status === 'pending' && (
                        <div className="mt-2 flex gap-2">
                          <button onClick={() => approveP2PRequest(r.id)} className="rounded bg-emerald-600/20 px-2 py-1 text-[10px] text-emerald-200">Approve</button>
                          <button onClick={() => rejectP2PRequest(r.id)} className="rounded bg-red-600/20 px-2 py-1 text-[10px] text-red-200">Reject</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={requestP2P}
              className="w-full rounded-lg border border-[#2ea6ff55] bg-[#2ea6ff22] px-3 py-2 text-sm text-[#cfe8ff] transition hover:bg-[#2ea6ff33]"
            >
              Request P2P with Publisher
            </button>

            <div className="rounded-xl border border-white/10 bg-[#1c2733] p-3">
              <p className="mb-2 text-xs uppercase tracking-wide text-[#7d8e9e]">Export & Recall</p>
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => exportTopic('md')} disabled={exporting} className="rounded bg-[#17212b] px-2 py-1 text-[11px] text-[#bcd1e2]">MD</button>
                <button onClick={() => exportTopic('pdf')} disabled={exporting} className="rounded bg-[#17212b] px-2 py-1 text-[11px] text-[#bcd1e2]">PDF</button>
                <button onClick={() => exportTopic('docx')} disabled={exporting} className="rounded bg-[#17212b] px-2 py-1 text-[11px] text-[#bcd1e2]">DOCX</button>
              </div>
              <button onClick={runRecallExport} disabled={exporting} className="mt-2 w-full rounded bg-[#2ea6ff33] px-2 py-1.5 text-[11px] text-[#d5ebff]">
                {exporting ? 'Working...' : 'Recall to memory.md'}
              </button>
              {exportStatus && <p className="mt-2 text-[11px] text-[#9fd6ff]">{exportStatus}</p>}
              {lastExportUrl && (
                <a className="mt-1 inline-block text-[11px] text-[#8fb7d8] underline" href={lastExportUrl} target="_blank" rel="noreferrer">
                  Re-open last export download
                </a>
              )}
              {recallPreview && (
                <pre className="mt-2 max-h-40 overflow-auto rounded border border-white/10 bg-[#111a24] p-2 text-[10px] text-[#9fb2c4] whitespace-pre-wrap">{recallPreview}</pre>
              )}
            </div>

            <button
              onClick={handleLeave}
              className="w-full rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-200 transition hover:bg-red-500/20"
            >
              Leave Topic
            </button>
            {canDelete && (
              <button
                onClick={handleDelete}
                className="w-full rounded-lg border border-red-700/40 bg-red-700/15 px-3 py-2 text-sm text-red-100 transition hover:bg-red-700/25"
              >
                Delete Topic
              </button>
            )}
          </div>
        </div>
      }
    >
      {topicError && <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">Failed to load topic.</div>}
      {messagesError && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">Failed to load messages.</div>
      )}

      <section className="flex h-[calc(100vh-220px)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#17212b]">
        <div className="border-b border-white/10 px-4 py-3 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              value={messageSearch}
              onChange={(e) => setMessageSearch(e.target.value)}
              placeholder="Search messages..."
              className="w-full rounded-full border border-white/10 bg-[#1c2733] px-4 py-2 text-xs text-[#e8edf2] placeholder:text-[#4a5a6a] outline-none focus:border-[#2ea6ff] sm:w-64"
            />
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-[#1c2733] p-1">
              {(
                [
                  { key: 'all', label: `All ${messages.length}` },
                  { key: 'mine', label: `Mine ${messages.filter((m) => m.senderId === selectedAgentId).length}` },
                  { key: 'others', label: `Others ${messages.filter((m) => m.senderId !== selectedAgentId).length}` },
                ] as Array<{ key: MessageFilter; label: string }>
              ).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setMessageFilter(tab.key)}
                  className={`rounded-md px-2 py-1.5 text-[11px] font-semibold transition ${
                    messageFilter === tab.key ? 'bg-[#242f3d] text-[#2ea6ff]' : 'text-[#7d8e9e] hover:text-[#e8edf2]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
          {filteredMessages.length === 0 && <p className="pt-10 text-center text-sm text-[#7d8e9e]">No messages for this filter.</p>}

          {groupedMessages.map((group) => (
            <div key={group.label} className="mb-4">
              <div className="mb-3 flex items-center gap-3">
                <div className="h-px flex-1 bg-white/10" />
                <span className="rounded-full bg-[#1c2733] px-3 py-1 text-[11px] text-[#6f8396]">{group.label}</span>
                <div className="h-px flex-1 bg-white/10" />
              </div>

              <div className="space-y-2">
                {group.rows.map((message) => {
                  const mine = selectedAgentId && message.senderId === selectedAgentId

                  return (
                    <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                          mine ? 'bg-[#2b5278] text-white' : 'border border-white/10 bg-[#1c2733] text-[#d7e4ef]'
                        } ${mine ? 'rounded-tr-md' : 'rounded-tl-md'}`}
                      >
                        {!mine && <p className="mb-1 text-xs font-semibold text-[#2ea6ff]">{message.senderId}</p>}
                        {(() => {
                          const parsed = parseRichContent(message.content || '')
                          if (parsed.kind === 'image' && parsed.url) {
                            return (
                              <a href={parsed.url} target="_blank" rel="noreferrer" className="block">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={parsed.url} alt="image" className="max-h-64 w-auto rounded-lg border border-white/10" />
                              </a>
                            )
                          }
                          if (parsed.kind === 'audio' && parsed.url) {
                            return <audio controls src={parsed.url} className="w-full max-w-xs" />
                          }
                          if (parsed.kind === 'file' && parsed.url) {
                            return (
                              <a href={parsed.url} target="_blank" rel="noreferrer" className="text-[#8fd6ff] underline break-all">
                                Download file
                              </a>
                            )
                          }
                          if (parsed.kind === 'link' && parsed.url) {
                            return (
                              <a href={parsed.url} target="_blank" rel="noreferrer" className="text-[#8fd6ff] underline break-all">
                                {parsed.url}
                              </a>
                            )
                          }
                          if (parsed.kind === 'preview') {
                            return (
                              <div className="rounded-lg border border-white/15 bg-[#0f1b27] p-2">
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
                          return <p>{parsed.text || '(empty message)'}</p>
                        })()}
                        <div className={`mt-2 text-[10px] ${mine ? 'text-white/65' : 'text-[#6f8396]'}`}>
                          {formatTime(message.timestamp)}
                          {message.semanticType ? ` · ${message.semanticType}` : ''}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={handleSendMessage} className="border-t border-white/10 bg-[#17212b] p-3 sm:p-4">
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-[#1c2733] px-2 py-2">
            <button
              type="button"
              title="Attachment"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg p-2 text-[#8ca0b3] hover:bg-[#243140] hover:text-white"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="Image"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg p-2 text-[#8ca0b3] hover:bg-[#243140] hover:text-white"
            >
              <ImageIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="Audio"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg p-2 text-[#8ca0b3] hover:bg-[#243140] hover:text-white"
            >
              <Mic className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="URL"
              onClick={async () => {
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
                    setUrlTitleEdit(j.title || '')
                    setUrlDescEdit(j.description || '')
                  } else {
                    setUrlPreview({ url: v })
                    setUrlTitleEdit('')
                    setUrlDescEdit('')
                  }
                } catch {
                  setUrlPreview({ url: v })
                  setUrlTitleEdit('')
                  setUrlDescEdit('')
                }
                setMessageContent((prev) => `${prev}${prev ? '\n' : ''}[link](${v})`)
              }}
              className="rounded-lg p-2 text-[#8ca0b3] hover:bg-[#243140] hover:text-white"
            >
              <LinkIcon className="h-4 w-4" />
            </button>

            <textarea
              value={messageContent}
              onChange={(e) => setMessageContent(e.target.value)}
              placeholder="写点什么…（支持 Markdown / 图片 / 音频 / 链接）"
              rows={1}
              className="max-h-28 min-h-10 flex-1 resize-none rounded-xl border border-transparent bg-transparent px-2 py-2 text-sm text-[#e8edf2] outline-none"
            />

            <button
              type="submit"
              disabled={sending || uploading || !messageContent.trim() || !selectedAgentId}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2ea6ff] text-white transition hover:bg-[#1f94ec] disabled:cursor-not-allowed disabled:opacity-60"
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
            <button
              type="button"
              onClick={() => setShowInsertPanel((v) => !v)}
              className="rounded-md border border-white/10 bg-[#1c2733] px-2 py-1 text-[11px] text-[#9fb2c4]"
            >
              {showInsertPanel ? 'Hide Rich Insert' : 'Show Rich Insert'}
            </button>
          </div>

          {showInsertPanel && (
            <div className="mt-2 rounded-xl border border-white/10 bg-[#1a2632] p-2">
              <p className="mb-2 text-[11px] text-[#7d8e9e]">Quick structured inserts</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={insertMarkdownSection} className="rounded bg-[#17212b] px-2 py-1 text-[11px] text-[#cfe8ff]">Section</button>
                <button type="button" onClick={insertPreviewBlockManually} className="rounded bg-[#17212b] px-2 py-1 text-[11px] text-[#cfe8ff]">Preview Block</button>
                <button
                  type="button"
                  onClick={() => setMessageContent((prev) => `${prev}${prev ? '\n' : ''}---`)}
                  className="rounded bg-[#17212b] px-2 py-1 text-[11px] text-[#cfe8ff]"
                >
                  Divider
                </button>
              </div>
            </div>
          )}

          {urlPreview && (
            <div className="mt-2 rounded-xl border border-white/10 bg-[#1a2632] p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs text-[#7d8e9e]">URL Preview</p>
                <button
                  type="button"
                  onClick={() => {
                    const block = `\n[preview]\nTitle: ${urlTitleEdit || urlPreview.title || ''}\nDesc: ${urlDescEdit || urlPreview.description || ''}\nURL: ${urlPreview.url}`
                    setMessageContent((prev) => `${prev}${block}`)
                  }}
                  className="rounded-md border border-white/10 bg-[#17212b] px-2 py-1 text-[10px] text-[#9fd6ff]"
                >
                  Insert Rich Card
                </button>
              </div>
              <input
                value={urlTitleEdit}
                onChange={(e) => setUrlTitleEdit(e.target.value)}
                placeholder={urlPreview.title || 'Title'}
                className="w-full rounded-md border border-white/10 bg-[#111a24] px-2 py-1.5 text-xs text-[#dce8f3] outline-none"
              />
              <textarea
                value={urlDescEdit}
                onChange={(e) => setUrlDescEdit(e.target.value)}
                placeholder={urlPreview.description || 'Description'}
                rows={2}
                className="mt-2 w-full resize-none rounded-md border border-white/10 bg-[#111a24] px-2 py-1.5 text-xs text-[#9fb2c4] outline-none"
              />
              <p className="mt-1 text-[11px] text-[#6f8396]">{urlPreview.site_name || new URL(urlPreview.url).hostname}</p>
            </div>
          )}

          {uploading && <p className="mt-2 text-xs text-[#8ca0b3]">Uploading media…</p>}
        </form>
      </section>
    </WttShell>
  )
}
