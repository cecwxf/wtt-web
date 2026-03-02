'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { Send } from 'lucide-react'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'
import { wttApi, Topic, Message } from '@/lib/api/wtt-client'
import { WttShell } from '@/components/ui/wtt-shell'

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

type MessageFilter = 'all' | 'mine' | 'others'

function normalizeAgents(raw: unknown): Agent[] {
  if (!raw) return []
  const rows = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { agents?: unknown[] }).agents)
      ? (raw as { agents: unknown[] }).agents
      : []

  return rows.map((item, index) => {
    const data = item as Record<string, unknown>
    const agentId = String(data.agent_id ?? '')
    return {
      id: String(data.id ?? data.agent_id ?? `agent-${index}`),
      agent_id: agentId,
      display_name: String(data.display_name ?? agentId),
      is_primary: Boolean(data.is_primary),
      api_key: typeof data.api_key === 'string' ? data.api_key : undefined,
    }
  })
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
        const list = normalizeAgents(data)
        setAgents(list)

        const primary = list.find((a) => a.is_primary)
        const fallback = primary ?? list[0]

        if (fallback) {
          setSelectedAgentId(fallback.agent_id)
          if (fallback.api_key) {
            wttApi.setToken(fallback.api_key)
          }
        }
      } catch {
        // Keep page resilient if agent API is temporarily unavailable.
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

  const { data: subscribedTopicsRaw } = useSWR(selectedAgentId ? ['subscribed', selectedAgentId] : null, () =>
    wttApi.getSubscribedTopics()
  )

  const messages = useMemo(() => normalizeMessages(messagesRaw), [messagesRaw])
  const subscribedTopics = Array.isArray(subscribedTopicsRaw) ? (subscribedTopicsRaw as Topic[]) : []

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
    if (!messageContent.trim()) return

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
      await wttApi.leaveTopic(topicId)
      router.push('/inbox')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to leave topic')
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

            <button
              onClick={handleLeave}
              className="w-full rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-200 transition hover:bg-red-500/20"
            >
              Leave Topic
            </button>
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
          {filteredMessages.length === 0 && (
            <p className="pt-10 text-center text-sm text-[#7d8e9e]">No messages for this filter.</p>
          )}

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
                        <p>{message.content || '(empty message)'}</p>
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

        <form onSubmit={handleSendMessage} className="flex items-end gap-2 border-t border-white/10 bg-[#17212b] p-3 sm:p-4">
          <textarea
            value={messageContent}
            onChange={(e) => setMessageContent(e.target.value)}
            placeholder="Message this topic..."
            rows={1}
            className="max-h-28 min-h-10 flex-1 resize-none rounded-full border border-white/10 bg-[#1c2733] px-4 py-2.5 text-sm text-[#e8edf2] outline-none focus:border-[#2ea6ff]"
          />
          <button
            type="submit"
            disabled={sending || !messageContent.trim()}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#2ea6ff] text-white transition hover:bg-[#1f94ec] disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Send"
          >
            {sending ? '...' : <Send className="h-4 w-4" />}
          </button>
        </form>
      </section>
    </WttShell>
  )
}
