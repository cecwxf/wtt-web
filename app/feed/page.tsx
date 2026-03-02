'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'
import { wttApi } from '@/lib/api/wtt-client'
import { WttShellV2 } from '@/components/ui/wtt-shell-v2'
import { ChatView, ChatMessage } from '@/components/ui/chat-view'
import { AgentItem } from '@/components/ui/agent-column'
import { TopicItem } from '@/components/ui/topic-column'
import { KeyboardShortcuts } from '@/components/ui/keyboard-shortcuts'

interface Agent {
  id: string
  agent_id: string
  display_name: string
  is_primary: boolean
  api_key?: string
}

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

function normalizeFeed(raw: unknown): ChatMessage[] {
  if (!raw || typeof raw !== 'object') return []

  const rows = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { messages?: unknown[] }).messages)
      ? (raw as { messages: unknown[] }).messages
      : []

  return rows.map((row, index) => {
    const data = row as Record<string, unknown>
    return {
      message_id: String(data.message_id ?? data.id ?? `msg-${index}`),
      sender_id: String(data.sender_id ?? 'unknown'),
      sender_type: (data.sender_type === 'human' ? 'human' : 'agent') as 'human' | 'agent',
      content: String(data.content ?? ''),
      timestamp: String(data.timestamp ?? data.created_at ?? new Date().toISOString()),
      semantic_type: String(data.semantic_type ?? ''),
    }
  })
}

export default function FeedPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null)

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
        // Keep page resilient
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

  const { data: feedRaw, error, mutate } = useSWR(
    selectedAgentId && session?.accessToken && selectedTopicId
      ? ['topic-messages', selectedTopicId, session.accessToken]
      : null,
    async () => {
      const response = await fetch(`${CLIENT_WTT_API_BASE}/topics/${selectedTopicId}/messages?limit=100`, {
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
    {
      refreshInterval: 5000,
    }
  )

  const { data: subscribedTopicsRaw, mutate: mutateTopics } = useSWR(
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
    {
      refreshInterval: 10000, // Refresh every 10 seconds to detect topic changes
    }
  )

  const messages = useMemo(() => normalizeFeed(feedRaw), [feedRaw])

  const topics = useMemo<TopicItem[]>(() => {
    if (!subscribedTopicsRaw || !Array.isArray(subscribedTopicsRaw)) return []

    return subscribedTopicsRaw.map((topic: { id: string; name: string; type?: string }) => ({
      topic_id: topic.id,
      name: topic.name,
      topic_type: (topic.type || 'discussion') as 'broadcast' | 'discussion' | 'p2p' | 'collaborative',
      unread_count: 0,
    }))
  }, [subscribedTopicsRaw])

  const agentItems = useMemo<AgentItem[]>(() => {
    return agents.map((agent) => ({
      agent_id: agent.agent_id,
      display_name: agent.display_name,
      unread_count: 0,
    }))
  }, [agents])

  const selectedTopic = topics.find((t) => t.topic_id === selectedTopicId)

  const handleSendMessage = async (content: string) => {
    if (!selectedTopicId) return

    await wttApi.publishMessage(selectedTopicId, {
      content,
      content_type: 'text',
      semantic_type: 'post',
    })

    mutate()
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
    <>
      <KeyboardShortcuts onDiscover={() => router.push('/discover')} />

      <WttShellV2
        agents={agentItems}
        selectedAgentId={selectedAgentId}
        onAgentChange={setSelectedAgentId}
        topics={topics}
        selectedTopicId={selectedTopicId}
        onTopicChange={setSelectedTopicId}
        onLogout={() => signOut({ callbackUrl: '/login' })}
        onTopicsRefresh={() => mutateTopics()}
        notificationCount={0}
      >
        {selectedTopicId && selectedTopic ? (
          <ChatView
            topicName={selectedTopic.name}
            messages={messages}
            currentAgentId={selectedAgentId}
            onSendMessage={handleSendMessage}
            loading={!feedRaw && !error}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <p className="text-lg text-[#7d8e9e]">Select a topic to start chatting</p>
              <p className="mt-2 text-sm text-[#7d8e9e]">Choose a topic from the left sidebar</p>
            </div>
          </div>
        )}
      </WttShellV2>
    </>
  )
}
