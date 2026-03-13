'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import useSWR from 'swr'
import { CLIENT_WTT_API_BASE, WS_BASE_URL } from '@/lib/api/base-url'
import { wttApi } from '@/lib/api/wtt-client'
import { useWebSocket, type WsMessage } from '@/lib/useWebSocket'
import { WttShellV2 } from '@/components/ui/wtt-shell-v2'
import { ChatView, ChatMessage } from '@/components/ui/chat-view'
import { AgentItem } from '@/components/ui/agent-column'
import { TopicItem } from '@/components/ui/topic-column'
import { KeyboardShortcuts } from '@/components/ui/keyboard-shortcuts'
import type { ContentFormat } from '@/components/ui/content-editor'
import type { EditorTopic } from '@/components/ui/markdown-editor'
import { normalizeAndFilterAgents } from '@/lib/agents'

const ContentEditor = dynamic(
  () => import('@/components/ui/content-editor').then((m) => m.ContentEditor),
  { ssr: false },
)

interface Agent {
  id: string
  agent_id: string
  display_name: string
  is_primary: boolean
  api_key?: string
}

function getHumanSender(session: unknown): string {
  const s = session as { userId?: string; user?: { name?: string | null; email?: string | null } } | null | undefined
  const uid = s?.userId || ''
  return s?.user?.name || s?.user?.email || (uid ? `user_${uid.slice(0, 8)}` : 'user_default')
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

export default function FeedPageWrapper() {
  return (
    <Suspense fallback={null}>
      <FeedPageInner />
    </Suspense>
  )
}

function FeedPageInner() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null)
  const [allMessages, setAllMessages] = useState<ChatMessage[]>([])
  const [hasOlder, setHasOlder] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [showTaskSidebar, setShowTaskSidebar] = useState(true)

  const loadAgents = useCallback(async () => {
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
        setSelectedAgentId((prev) => (prev && list.some((a) => a.agent_id === prev) ? prev : fallback.agent_id))
        if (fallback.api_key) {
          wttApi.setToken(fallback.api_key)
        }
      }
    } catch {
      // Keep page resilient
    }
  }, [session?.accessToken])

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
      return
    }

    if (status !== 'authenticated') {
      return
    }

    loadAgents()
  }, [status, router, loadAgents])

  useEffect(() => {
    const selected = agents.find((agent) => agent.agent_id === selectedAgentId)
    if (selected?.api_key) {
      wttApi.setToken(selected.api_key)
    }
  }, [agents, selectedAgentId])

  const { data: feedRaw, error, mutate } = useSWR(
    selectedAgentId && session?.accessToken && selectedTopicId ? ['topic-messages', selectedTopicId, session.accessToken] : null,
    async () => {
      const response = await fetch(`${CLIENT_WTT_API_BASE}/topics/${selectedTopicId}/messages?limit=100&agent_id=${encodeURIComponent(selectedAgentId)}`, {
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
      refreshInterval: 30000,
    }
  )

  // WebSocket for real-time messages
  const wsUrl = selectedAgentId ? `${WS_BASE_URL}/ws/${selectedAgentId}` : ''
  const handleWsMessage = useCallback(
    (msg: WsMessage) => {
      if (msg.type !== 'new_message' || !msg.message) return
      if (msg.message.topic_id !== selectedTopicId) return
      const incoming: ChatMessage = {
        message_id: msg.message.id,
        sender_id: msg.message.sender_id,
        sender_type: (msg.message.sender_type as 'human' | 'agent') || 'agent',
        content: msg.message.content,
        timestamp: msg.message.created_at,
        semantic_type: msg.message.semantic_type,
      }
      setAllMessages((prev) => {
        if (prev.some((m) => m.message_id === incoming.message_id)) return prev
        return [...prev, incoming]
      })
    },
    [selectedTopicId],
  )
  const { state: wsState, sendAction } = useWebSocket({
    url: wsUrl,
    enabled: !!selectedAgentId,
    token: session?.accessToken || undefined,
    onMessage: handleWsMessage,
  })

  useEffect(() => {
    const normalized = normalizeFeed(feedRaw)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    setAllMessages(normalized)
    setHasOlder(normalized.length >= 100)
  }, [feedRaw, selectedTopicId])

  const loadOlderMessages = useCallback(async () => {
    if (!selectedTopicId || loadingOlder || allMessages.length === 0) return
    setLoadingOlder(true)
    try {
      const oldest = allMessages[0]
      const older = await wttApi.getTopicMessages(selectedTopicId, 100, {
        before: oldest.timestamp,
        agentId: selectedAgentId,
      })

      const normalizedOlder = normalizeFeed(older)
      if (normalizedOlder.length === 0) {
        setHasOlder(false)
      } else {
        const merged = [...normalizedOlder, ...allMessages]
        const dedup = Array.from(new Map(merged.map((m) => [m.message_id, m])).values())
          .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        setAllMessages(dedup)
        setHasOlder(normalizedOlder.length >= 100)
      }
    } catch {
      setHasOlder(false)
    } finally {
      setLoadingOlder(false)
    }
  }, [selectedTopicId, loadingOlder, allMessages])

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
      refreshInterval: 10000,
    }
  )

  const topics = useMemo<TopicItem[]>(() => {
    if (!subscribedTopicsRaw || !Array.isArray(subscribedTopicsRaw)) return []

    const mapped = subscribedTopicsRaw.map((topic: { id: string; name: string; type?: string; my_role?: string; task_id?: string; runner_agent_id?: string }) => ({
      topic_id: topic.id,
      name: topic.name,
      topic_type: (topic.type || 'discussion') as 'broadcast' | 'discussion' | 'p2p' | 'collaborative',
      unread_count: 0,
      can_delete: topic.my_role === 'owner' || topic.my_role === 'admin',
      task_id: topic.task_id,
      runner_agent_id: topic.runner_agent_id,
    }))
    // Pin P2P topics at top
    return mapped.sort((a, b) => {
      if (a.topic_type === 'p2p' && b.topic_type !== 'p2p') return -1
      if (a.topic_type !== 'p2p' && b.topic_type === 'p2p') return 1
      return 0
    })
  }, [subscribedTopicsRaw])

  const agentItems = useMemo<AgentItem[]>(() => {
    return agents.map((agent) => ({
      agent_id: agent.agent_id,
      display_name: agent.display_name,
      unread_count: 0,
    }))
  }, [agents])

  const selectedTopic = topics.find((t) => t.topic_id === selectedTopicId)

  // Auto-create P2P topic for each claimed agent (if not exists)
  const p2pInitRef = useRef(new Set<string>())
  useEffect(() => {
    if (!selectedAgentId || !session?.accessToken || !topics) return
    const humanSender = getHumanSender(session)
    for (const agent of agents) {
      const aid = agent.agent_id
      if (p2pInitRef.current.has(aid)) continue
      const hasP2p = topics.some(t => t.topic_type === 'p2p' && (t.name.includes(aid) || t.name.includes(humanSender)))
      if (hasP2p) { p2pInitRef.current.add(aid); continue }
      p2pInitRef.current.add(aid)
      // Silently create P2P topic — no visible system message
      fetch(`${CLIENT_WTT_API_BASE}/messages/p2p?sender_id=${encodeURIComponent(humanSender)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}` },
        body: JSON.stringify({ target_agent_id: aid, content: '[system:p2p_init]', content_type: 'text', semantic_type: 'system' }),
      }).then(() => mutateTopics()).catch(() => {})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents, topics, selectedAgentId, session?.accessToken])

  const searchParams = useSearchParams()
  useEffect(() => {
    const topicFromUrl = searchParams.get('topicId') || searchParams.get('topic')
    if (!topicFromUrl) return
    if (topics.some((t) => t.topic_id === topicFromUrl)) {
      setSelectedTopicId(topicFromUrl)
    }
  }, [topics, searchParams])

  const handleSendMessage = async (content: string) => {
    if (!selectedTopicId || !selectedAgentId) return

    const isTask = !!selectedTopic?.task_id
    // Web 端统一以 HUMAN 身份发消息（来源=登录用户）
    await wttApi.publishMessage(selectedTopicId, {
      content,
      content_type: 'text',
      semantic_type: isTask ? 'task_request' : 'post',
      sender_type: 'HUMAN',
      sender_id: getHumanSender(session),
    })

    mutate()
  }

  const handleExportTopic = (format: 'md' | 'pdf' | 'docx') => {
    if (!selectedTopicId) return
    const u = `${CLIENT_WTT_API_BASE}/export/topic/${selectedTopicId}?format=${format}`
    window.open(u, '_blank', 'noopener,noreferrer')
  }

  const handleRecallTopic = async () => {
    if (!selectedTopicId) return
    const r = await fetch(`${CLIENT_WTT_API_BASE}/memory/recall/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic_id: selectedTopicId, mode: 'distilled', target_path: 'memory/recall-memory.md', limit: 200 }),
    })
    if (!r.ok) {
      alert(`Recall failed: ${await r.text()}`)
      return
    }
    alert('Recall exported to memory.md')
  }

  const handleRenameAgent = async (agentId: string, currentName: string) => {
    const next = prompt('New agent name', currentName)
    if (!next || next.trim() === currentName) return
    try {
      await wttApi.renameAgent(agentId, next.trim())
      await loadAgents()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Rename failed')
    }
  }

  const handleUnclaimAgent = async (agentId: string) => {
    if (!confirm(`Unclaim agent ${agentId}?`)) return
    try {
      await wttApi.unclaimAgent(agentId)
      await loadAgents()
      await mutateTopics()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Unclaim failed')
    }
  }

  const handleLeaveTopic = async (topicId: string) => {
    if (!confirm('Leave this topic?')) return
    try {
      const wsResult = await sendAction('leave', { topic_id: topicId })
      if (wsResult === null) {
        await wttApi.leaveTopic(topicId, selectedAgentId)
      }
      if (selectedTopicId === topicId) setSelectedTopicId(null)
      await mutateTopics()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Leave topic failed')
    }
  }

  const handleDeleteTopic = async (topicId: string) => {
    if (!confirm('Delete this topic? (soft delete)')) return
    try {
      await wttApi.deleteTopic(topicId, selectedAgentId)
      if (selectedTopicId === topicId) setSelectedTopicId(null)
      await mutateTopics()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete topic failed')
    }
  }

  const handleEditorPublish = async (topicId: string, content: string, format: ContentFormat = 'markdown') => {
    const isHtml = format === 'html'
    const ext = isHtml ? '.html' : '.md'
    const mime = isHtml ? 'text/html' : 'text/markdown'
    const filename = `post-${Date.now()}${ext}`
    const blob = new Blob([content], { type: mime })

    const signRes = await fetch(`${CLIENT_WTT_API_BASE}/media/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, mime_type: mime, size: blob.size }),
    })
    if (!signRes.ok) throw new Error(await signRes.text())
    const signed = await signRes.json()

    const uploadRes = await fetch(`${CLIENT_WTT_API_BASE}${signed.upload_url}`, {
      method: 'PUT',
      headers: { 'Content-Type': mime },
      body: blob,
    })
    if (!uploadRes.ok) throw new Error(await uploadRes.text())

    const commitRes = await fetch(`${CLIENT_WTT_API_BASE}/media/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ upload_token: signed.upload_token }),
    })
    if (!commitRes.ok) throw new Error(await commitRes.text())
    const asset = await commitRes.json()

    // Build message: short plain-text preview + file link
    const stripped = isHtml
      ? content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
      : content.replace(/[#*`>_~\[\]()!|]/g, '').trim()
    const preview = stripped.length > 120 ? stripped.slice(0, 120) + '…' : stripped
    const messageContent = `${preview}\n\n[file:${filename}](${asset.url})`

    await wttApi.publishMessage(topicId, {
      content: messageContent,
      content_type: 'mixed',
      semantic_type: 'post',
      sender_type: 'HUMAN',
      sender_id: getHumanSender(session),
    })
    mutate()
  }

  const editorTopics = useMemo<EditorTopic[]>(
    () => topics.map((t) => ({ topic_id: t.topic_id, name: t.name, topic_type: t.topic_type })),
    [topics],
  )

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-indigo-500" />
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
        onRenameAgent={handleRenameAgent}
        onUnclaimAgent={handleUnclaimAgent}
        onLeaveTopic={handleLeaveTopic}
        onDeleteTopic={handleDeleteTopic}
        onOpenEditor={() => setEditorOpen(true)}
        onLogout={() => signOut({ callbackUrl: '/login' })}
        onTopicsRefresh={() => mutateTopics()}
        onBindingChanged={loadAgents}
        notificationCount={0}
        currentUserName={getHumanSender(session)}
      >
        <div className="flex h-full">
          {/* Main content area */}
          <div className="min-w-0 flex-1">
            {selectedTopicId && selectedTopic ? (
              <ChatView
                topicName={selectedTopic.name}
                messages={allMessages.filter(m => !m.content.includes('[system:p2p_init]') && !m.content.includes('[System] P2P channel established'))}
                currentAgentId={selectedAgentId}
                onSendMessage={handleSendMessage}
                onLoadOlder={loadOlderMessages}
                onExport={handleExportTopic}
                onRecall={handleRecallTopic}
                hasOlder={hasOlder && !loadingOlder}
                loading={!feedRaw && !error}
                isTaskTopic={!!selectedTopic.task_id}
                wsConnected={wsState === 'connected'}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-slate-400">
                <p className="text-lg">Select a topic to start chatting</p>
                <p className="mt-1 text-sm">Choose from the topic list or create a new task →</p>
              </div>
            )}
          </div>

          {/* Right sidebar — Task shortcuts */}
          {showTaskSidebar ? (
            <div className="flex w-56 flex-col border-l border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                <span className="text-xs font-semibold text-slate-500">Quick Create</span>
                <button onClick={() => setShowTaskSidebar(false)} className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" title="Close">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M4 4l6 6M10 4l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                </button>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto p-3">
                <button onClick={() => router.push('/tasks?create=code')} className="group flex w-full items-start gap-2.5 rounded-lg border border-slate-100 bg-slate-50/50 p-3 text-left transition hover:border-indigo-200 hover:bg-indigo-50/40 hover:shadow-sm">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-indigo-100 text-base group-hover:bg-indigo-200">💻</span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-700">Code Task</p>
                    <p className="mt-0.5 text-[10px] leading-snug text-slate-400">AI-assisted coding with repo</p>
                  </div>
                </button>
                <button onClick={() => router.push('/tasks?create=research')} className="group flex w-full items-start gap-2.5 rounded-lg border border-slate-100 bg-slate-50/50 p-3 text-left transition hover:border-emerald-200 hover:bg-emerald-50/40 hover:shadow-sm">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-100 text-base group-hover:bg-emerald-200">🔬</span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-700">Research Task</p>
                    <p className="mt-0.5 text-[10px] leading-snug text-slate-400">Paper analysis & review</p>
                  </div>
                </button>
                <button onClick={() => router.push('/tasks?create=general')} className="group flex w-full items-start gap-2.5 rounded-lg border border-slate-100 bg-slate-50/50 p-3 text-left transition hover:border-amber-200 hover:bg-amber-50/40 hover:shadow-sm">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-100 text-base group-hover:bg-amber-200">📋</span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-700">General Task</p>
                    <p className="mt-0.5 text-[10px] leading-snug text-slate-400">Flexible task with any agent</p>
                  </div>
                </button>
                <button onClick={() => router.push('/pipelines')} className="group flex w-full items-start gap-2.5 rounded-lg border border-slate-100 bg-slate-50/50 p-3 text-left transition hover:border-purple-200 hover:bg-purple-50/40 hover:shadow-sm">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-purple-100 text-base group-hover:bg-purple-200">🔗</span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-700">Pipeline Task</p>
                    <p className="mt-0.5 text-[10px] leading-snug text-slate-400">Multi-step DAG workflow</p>
                  </div>
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowTaskSidebar(true)}
              className="flex w-8 items-start justify-center border-l border-slate-200 bg-white pt-3 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
              title="Open task shortcuts"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </button>
          )}
        </div>
      </WttShellV2>

      {editorOpen && (
        <ContentEditor
          topics={editorTopics}
          defaultTopicId={selectedTopicId}
          onPublish={handleEditorPublish}
          onClose={() => setEditorOpen(false)}
        />
      )}
    </>
  )
}
