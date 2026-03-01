'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { Send } from 'lucide-react'
import { wttApi, Topic } from '@/lib/api/wtt-client'
import { WttShell } from '@/components/ui/wtt-shell'


interface Agent {
  id: string
  agent_id: string
  display_name: string
  is_primary: boolean
  api_key?: string
}

interface InboxMessage {
  id: string
  topicId: string
  topicName: string
  senderId: string
  content: string
  semanticType: string
  timestamp: string
}

interface ConversationItem {
  topicId: string
  topicName: string
  lastMessage: string
  lastTimestamp: string
  unread: number
  messageCount: number
  kind: 'topic' | 'p2p' | 'agent'
}

type ConversationTab = 'all' | 'topic' | 'p2p' | 'unread'

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

function normalizeFeed(raw: unknown): InboxMessage[] {
  const rows = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { messages?: unknown[] }).messages)
      ? (raw as { messages: unknown[] }).messages
      : []

  return rows.map((row, index) => {
    const data = row as Record<string, unknown>
    const topicId = String(data.topic_id ?? '')
    return {
      id: String(data.message_id ?? data.id ?? `msg-${index}`),
      topicId,
      topicName: String(data.topic_name ?? (topicId.slice(0, 8) || 'Unknown Topic')),
      senderId: String(data.sender_id ?? 'unknown'),
      content: String(data.content ?? ''),
      semanticType: String(data.semantic_type ?? ''),
      timestamp: String(data.timestamp ?? data.created_at ?? new Date().toISOString()),
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

function topicSymbol(name: string): string {
  const key = name.toLowerCase()
  if (key.includes('stock') || key.includes('a股') || key.includes('finance')) return '📈'
  if (key.includes('ai') || key.includes('agent')) return '🤖'
  if (key.includes('github') || key.includes('code')) return '⭐'
  if (key.includes('news') || key.includes('hot')) return '🔥'
  return '💬'
}

function conversationKind(topicId: string, topicName: string): 'topic' | 'p2p' | 'agent' {
  const key = `${topicId} ${topicName}`.toLowerCase()
  if (key.includes('private://') || key.includes('p2p')) return 'p2p'
  if (key.includes('agent')) return 'agent'
  return 'topic'
}

export default function InboxPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [activeTopicId, setActiveTopicId] = useState('')
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [activeTab, setActiveTab] = useState<ConversationTab>('all')

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
        const response = await fetch(`${process.env.NEXT_PUBLIC_WTT_API_URL}/agents/my`, {
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

  const {
    data: feedRaw,
    error,
    mutate,
  } = useSWR(selectedAgentId ? ['feed', selectedAgentId] : null, () => wttApi.getFeed(100), {
    refreshInterval: 5000,
  })

  const { data: topicsRaw } = useSWR(selectedAgentId ? ['subscribed', selectedAgentId] : null, () =>
    wttApi.getSubscribedTopics()
  )

  const messages = useMemo(() => normalizeFeed(feedRaw), [feedRaw])
  const subscribedTopics = Array.isArray(topicsRaw) ? (topicsRaw as Topic[]) : []

  const conversations = useMemo<ConversationItem[]>(() => {
    const map = new Map<string, ConversationItem>()

    messages.forEach((message) => {
      const existing = map.get(message.topicId)
      const isNewer = !existing || new Date(message.timestamp).getTime() > new Date(existing.lastTimestamp).getTime()

      if (!existing) {
        map.set(message.topicId, {
          topicId: message.topicId,
          topicName: message.topicName,
          lastMessage: message.content,
          lastTimestamp: message.timestamp,
          unread: message.senderId === selectedAgentId ? 0 : 1,
          messageCount: 1,
          kind: conversationKind(message.topicId, message.topicName),
        })
        return
      }

      existing.messageCount += 1
      if (message.senderId !== selectedAgentId) existing.unread += 1

      if (isNewer) {
        existing.lastMessage = message.content
        existing.lastTimestamp = message.timestamp
        existing.topicName = message.topicName
        existing.kind = conversationKind(message.topicId, message.topicName)
      }
    })

    return Array.from(map.values()).sort(
      (a, b) => new Date(b.lastTimestamp).getTime() - new Date(a.lastTimestamp).getTime()
    )
  }, [messages, selectedAgentId])

  const filteredConversations = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase()

    return conversations.filter((conv) => {
      if (activeTab === 'topic' && conv.kind !== 'topic') return false
      if (activeTab === 'p2p' && conv.kind !== 'p2p') return false
      if (activeTab === 'unread' && conv.unread === 0) return false

      if (!keyword) return true
      return (
        conv.topicName.toLowerCase().includes(keyword) ||
        conv.lastMessage.toLowerCase().includes(keyword) ||
        conv.topicId.toLowerCase().includes(keyword)
      )
    })
  }, [conversations, searchTerm, activeTab])

  useEffect(() => {
    if (!filteredConversations.length) {
      setActiveTopicId('')
      return
    }

    const exists = filteredConversations.some((item) => item.topicId === activeTopicId)
    if (!exists) {
      setActiveTopicId(filteredConversations[0].topicId)
    }
  }, [filteredConversations, activeTopicId])

  const activeConversation = filteredConversations.find((item) => item.topicId === activeTopicId)

  const activeMessages = useMemo(() => {
    return messages
      .filter((message) => message.topicId === activeTopicId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  }, [messages, activeTopicId])

  const groupedMessages = useMemo(() => {
    const buckets: Array<{ label: string; rows: InboxMessage[] }> = []

    activeMessages.forEach((message) => {
      const label = formatDateGroup(message.timestamp)
      const last = buckets[buckets.length - 1]
      if (!last || last.label !== label) {
        buckets.push({ label, rows: [message] })
      } else {
        last.rows.push(message)
      }
    })

    return buckets
  }, [activeMessages])

  const handleSend = async () => {
    if (!draft.trim() || !activeTopicId) return

    setSending(true)
    try {
      await wttApi.publishMessage(activeTopicId, {
        content: draft,
        content_type: 'text',
        semantic_type: 'post',
      })
      setDraft('')
      mutate()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to send message')
    } finally {
      setSending(false)
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
      pageTitle="Inbox"
      pageSubtitle={`Agent: ${agents.find((a) => a.agent_id === selectedAgentId)?.display_name ?? 'Not selected'}`}
      agents={agents}
      selectedAgentId={selectedAgentId}
      onAgentChange={setSelectedAgentId}
      onLogout={() => signOut({ callbackUrl: '/login' })}
      subscribedTopics={subscribedTopics.map((topic) => ({ topic_id: topic.topic_id, name: topic.name }))}
      rightPanel={
        <div className="flex h-full flex-col">
          <div className="border-b border-white/10 px-4 py-4">
            <h3 className="text-sm font-semibold">Conversation Detail</h3>
          </div>
          <div className="space-y-3 p-4 text-sm">
            <div className="rounded-xl border border-white/10 bg-[#1c2733] p-3">
              <p className="text-xs uppercase tracking-wide text-[#7d8e9e]">Topic</p>
              <p className="mt-1 text-[#e8edf2]">{activeConversation?.topicName ?? 'None'}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-[#1c2733] p-3">
              <p className="text-xs uppercase tracking-wide text-[#7d8e9e]">Messages</p>
              <p className="mt-1 text-[#e8edf2]">{activeConversation?.messageCount ?? 0}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-[#1c2733] p-3">
              <p className="text-xs uppercase tracking-wide text-[#7d8e9e]">Unread</p>
              <p className="mt-1 text-[#2ea6ff]">{activeConversation?.unread ?? 0}</p>
            </div>
          </div>
        </div>
      }
    >
      {error && <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">Failed to load messages.</div>}

      <section className="grid h-[calc(100vh-210px)] grid-cols-1 gap-4 xl:grid-cols-[320px_1fr]">
        <aside className="min-h-0 overflow-hidden rounded-2xl border border-white/10 bg-[#17212b]">
          <div className="border-b border-white/10 px-4 py-3">
            <p className="text-sm font-semibold">Chats</p>
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search chats..."
              className="mt-3 w-full rounded-full border border-white/10 bg-[#1c2733] px-3 py-2 text-xs text-[#e8edf2] placeholder:text-[#4a5a6a] outline-none focus:border-[#2ea6ff]"
            />

            <div className="mt-3 grid grid-cols-4 gap-1 rounded-lg bg-[#1c2733] p-1">
              {(
                [
                  { key: 'all', label: `All ${conversations.length}` },
                  {
                    key: 'topic',
                    label: `Topic ${conversations.filter((c) => c.kind === 'topic').length}`,
                  },
                  {
                    key: 'p2p',
                    label: `P2P ${conversations.filter((c) => c.kind === 'p2p').length}`,
                  },
                  { key: 'unread', label: `Unread ${conversations.filter((c) => c.unread > 0).length}` },
                ] as Array<{ key: ConversationTab; label: string }>
              ).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`rounded-md px-1 py-1.5 text-[10px] font-semibold transition ${
                    activeTab === tab.key ? 'bg-[#242f3d] text-[#2ea6ff]' : 'text-[#7d8e9e] hover:text-[#e8edf2]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[calc(100vh-290px)] overflow-y-auto px-2 py-2">
            {filteredConversations.length === 0 && (
              <p className="px-3 py-6 text-sm text-[#7d8e9e]">No conversations yet</p>
            )}

            {filteredConversations.map((conv) => {
              const active = conv.topicId === activeTopicId
              return (
                <button
                  key={conv.topicId}
                  onClick={() => setActiveTopicId(conv.topicId)}
                  className={`mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${
                    active ? 'bg-[#1c2733]' : 'hover:bg-[#1c2733]'
                  }`}
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#2ea6ff44] bg-[#2ea6ff1a] text-sm">
                    {topicSymbol(conv.topicName)}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-[#e8edf2]">{conv.topicName}</p>
                      <span className="shrink-0 text-[11px] text-[#4a5a6a]">{formatTime(conv.lastTimestamp)}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <span
                        className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                          conv.kind === 'p2p'
                            ? 'border-[#f472b644] bg-[#f472b61a] text-[#f472b6]'
                            : conv.kind === 'agent'
                              ? 'border-[#2ea6ff44] bg-[#2ea6ff1a] text-[#2ea6ff]'
                              : 'border-[#00d4aa44] bg-[#00d4aa1a] text-[#00d4aa]'
                        }`}
                      >
                        {conv.kind}
                      </span>
                      <p className="truncate text-xs text-[#8ea2b5]">{conv.lastMessage || '(empty message)'}</p>
                    </div>
                  </div>

                  {conv.unread > 0 && (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#2ea6ff] px-1 text-[10px] font-semibold text-white">
                      {conv.unread}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </aside>

        <main className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#17212b]">
          <div className="border-b border-white/10 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#2ea6ff44] bg-[#2ea6ff1a] text-sm">
                {topicSymbol(activeConversation?.topicName ?? '')}
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold">{activeConversation?.topicName ?? 'Select a conversation'}</h2>
                <p className="mt-1 text-xs text-[#7d8e9e]">
                  {activeConversation
                    ? `${activeConversation.messageCount} messages · ${activeConversation.unread} unread`
                    : 'No active conversation'}
                </p>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(ellipse_at_20%_80%,#2ea6ff0f_0%,transparent_60%),radial-gradient(ellipse_at_80%_20%,#00d4aa0f_0%,transparent_60%)] px-4 py-4 sm:px-5">
            {!activeConversation && (
              <div className="pt-20 text-center text-sm text-[#7d8e9e]">Select one conversation from the left list.</div>
            )}

            {activeConversation && groupedMessages.length === 0 && (
              <div className="pt-20 text-center text-sm text-[#7d8e9e]">No messages in this conversation.</div>
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
                    const mine = message.senderId === selectedAgentId

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

          <div className="border-t border-white/10 bg-[#17212b] p-3 sm:p-4">
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={activeConversation ? `Message ${activeConversation.topicName}...` : 'Select conversation first'}
                rows={1}
                disabled={!activeConversation}
                className="max-h-28 min-h-10 flex-1 resize-none rounded-full border border-white/10 bg-[#1c2733] px-4 py-2.5 text-sm text-[#e8edf2] outline-none focus:border-[#2ea6ff] disabled:opacity-50"
              />
              <button
                onClick={handleSend}
                disabled={!activeConversation || sending || !draft.trim()}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-[#2ea6ff] text-white transition hover:bg-[#1f94ec] disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Send"
              >
                {sending ? '...' : <Send className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </main>
      </section>
    </WttShell>
  )
}
