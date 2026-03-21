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
import { ChatView, ChatMessage, ChatModelConfig } from '@/components/ui/chat-view'
import { AgentItem } from '@/components/ui/agent-column'
import { TopicItem } from '@/components/ui/topic-column'
import { KeyboardShortcuts } from '@/components/ui/keyboard-shortcuts'
import type { ContentFormat } from '@/components/ui/content-editor'
import type { EditorTopic } from '@/components/ui/markdown-editor'
import { normalizeAndFilterAgents } from '@/lib/agents'
import { useAgentId, buildAgentUrl } from '@/lib/hooks/use-agent-id'

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
  invite_code?: string
  invite_status?: 'active' | 'none'
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
      sender_display_name: data.sender_display_name ? String(data.sender_display_name) : undefined,
      sender_type: (data.sender_type === 'human' ? 'human' : 'agent') as 'human' | 'agent',
      content: String(data.content ?? ''),
      timestamp: String(data.timestamp ?? data.created_at ?? new Date().toISOString()),
      semantic_type: String(data.semantic_type ?? ''),
      task_id: data.task_id ? String(data.task_id) : undefined,
      task_status: data.task_status ? String(data.task_status) : undefined,
      task_title: data.task_title ? String(data.task_title) : undefined,
      runner_agent_id: data.runner_agent_id ? String(data.runner_agent_id) : undefined,
      exec_mode: data.exec_mode ? String(data.exec_mode) : undefined,
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
  const [selectedAgentId, setSelectedAgentId] = useAgentId()
  const [selectedTopicId, _setSelectedTopicId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('wtt_selected_topic_id') || null
    }
    return null
  })
  const setSelectedTopicId = useCallback((id: string | null) => {
    _setSelectedTopicId(id)
    try {
      if (id) localStorage.setItem('wtt_selected_topic_id', id)
      else localStorage.removeItem('wtt_selected_topic_id')
    } catch {}
  }, [])
  const [allMessages, setAllMessages] = useState<ChatMessage[]>([])
  const [hasOlder, setHasOlder] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [membersOpen, setMembersOpen] = useState(false)
  // Track newly created task that needs rename on first message
  const pendingRenameTaskRef = useRef<{ taskId: string; topicId: string } | null>(null)

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
        // Only override if current selection is empty or no longer valid
        if (!selectedAgentId || !list.some((a) => a.agent_id === selectedAgentId)) {
          setSelectedAgentId(fallback.agent_id)
        }
        if (fallback.api_key) {
          wttApi.setToken(fallback.api_key)
        }
      }
    } catch {
      // Keep page resilient
    }
  }, [session?.accessToken])

  // Lookup map: agent_id → display_name (for enriching chat messages)
  const agentNameMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const a of agents) map[a.agent_id] = a.display_name
    return map
  }, [agents])

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
    selectedAgentId && session?.accessToken && selectedTopicId ? ['topic-messages', selectedTopicId, selectedAgentId, session.accessToken] : null,
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
        sender_display_name: (msg.message as Record<string, string>).sender_display_name || agentNameMap[msg.message.sender_id] || undefined,
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
    [selectedTopicId, agentNameMap],
  )
  const { state: wsState, sendAction } = useWebSocket({
    url: wsUrl,
    enabled: !!selectedAgentId,
    token: session?.accessToken || undefined,
    onMessage: handleWsMessage,
  })

  const prevTopicRef = useRef(selectedTopicId)
  useEffect(() => {
    const normalized = normalizeFeed(feedRaw)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    const topicChanged = prevTopicRef.current !== selectedTopicId
    prevTopicRef.current = selectedTopicId
    if (topicChanged || normalized.length === 0) {
      // Full replace on topic switch or empty data
      setAllMessages(normalized)
    } else {
      setAllMessages((prev) => {
        if (prev.length === 0) return normalized
        // Merge: preserve DOM/scroll position during polling refreshes
        const existingIds = new Set(prev.map(m => m.message_id))
        const newMsgs = normalized.filter(m => !existingIds.has(m.message_id))
        if (newMsgs.length === 0 && prev.length === normalized.length) return prev
        const normalizedMap = new Map(normalized.map(m => [m.message_id, m]))
        const merged = prev
          .filter(m => normalizedMap.has(m.message_id))
          .map(m => normalizedMap.get(m.message_id)!)
        for (const m of newMsgs) merged.push(m)
        merged.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        return merged
      })
    }
    setHasOlder(normalized.length >= 100)
  }, [feedRaw, selectedTopicId])

  // Enrich messages: replace raw agent_id fallback with display_name from agentNameMap
  const enrichedMessages = useMemo(() => {
    return allMessages.map(m => {
      if (m.sender_display_name && m.sender_display_name !== m.sender_id) return m
      const name = agentNameMap[m.sender_id]
      if (name) return { ...m, sender_display_name: name }
      return m
    })
  }, [allMessages, agentNameMap])

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
    const humanSender = getHumanSender(session)

    const mapped = subscribedTopicsRaw.map((topic: { id: string; name: string; type?: string; my_role?: string; task_id?: string; runner_agent_id?: string; task_type?: string }) => {
      const topicType = (topic.type || 'discussion') as 'broadcast' | 'discussion' | 'p2p' | 'collaborative'
      const isDefaultP2P =
        topicType === 'p2p' &&
        !!selectedAgentId &&
        topic.name.includes(selectedAgentId) &&
        topic.name.includes(humanSender)

      return {
        topic_id: topic.id,
        name: topic.name,
        topic_type: topicType,
        unread_count: Number((topic as Record<string, unknown>).unread_count || 0),
        can_delete: topic.my_role === 'owner' || topic.my_role === 'admin',
        task_id: topic.task_id,
        task_type: topic.task_type as 'code' | 'research' | 'general' | 'pipeline' | undefined,
        runner_agent_id: topic.runner_agent_id,
        is_default_p2p: isDefaultP2P,
      }
    })

    return mapped.sort((a, b) => {
      if (a.is_default_p2p && !b.is_default_p2p) return -1
      if (!a.is_default_p2p && b.is_default_p2p) return 1
      if (a.topic_type === 'p2p' && b.topic_type !== 'p2p') return -1
      if (a.topic_type !== 'p2p' && b.topic_type === 'p2p') return 1
      return 0
    })
  }, [subscribedTopicsRaw, selectedAgentId, session])

  const agentItems = useMemo<AgentItem[]>(() => {
    return agents.map((agent) => ({
      agent_id: agent.agent_id,
      display_name: agent.display_name,
      unread_count: 0,
    }))
  }, [agents])

  const selectedTopic = topics.find((t) => t.topic_id === selectedTopicId)

  // Clear stale persisted topic if it no longer exists in the topics list
  useEffect(() => {
    if (selectedTopicId && topics.length > 0 && !topics.some(t => t.topic_id === selectedTopicId)) {
      setSelectedTopicId(null)
    }
  }, [topics, selectedTopicId, setSelectedTopicId])

  const shouldShowDiscussMembers = !!selectedTopic && ['discussion', 'collaborative'].includes(selectedTopic.topic_type) && !selectedTopic.task_id
  const { data: topicMembersRaw } = useSWR(
    shouldShowDiscussMembers && selectedTopicId && session?.accessToken
      ? ['topic-members', selectedTopicId, session.accessToken]
      : null,
    async () => {
      const response = await fetch(`${CLIENT_WTT_API_BASE}/topics/${selectedTopicId}/members`, {
        headers: { Authorization: `Bearer ${session?.accessToken}` },
      })
      if (!response.ok) return []
      return response.json()
    },
    { refreshInterval: 0 }
  )

  const topicMembers = useMemo(() => {
    if (!Array.isArray(topicMembersRaw)) return []
    return topicMembersRaw
      .map((m) => (m && typeof m === 'object' ? (m as Record<string, unknown>) : null))
      .filter(Boolean)
      .map((m) => ({
        agent_id: String((m as Record<string, unknown>).agent_id || ''),
        display_name: String((m as Record<string, unknown>).display_name || (m as Record<string, unknown>).agent_id || ''),
      }))
      .filter((m) => m.agent_id)
  }, [topicMembersRaw])

  const discussMemberCount = useMemo(() => topicMembers.length, [topicMembers])

  // Recent tasks for sidebar shortcuts
  const { data: recentTasksRaw, mutate: mutateRecentTasks } = useSWR(
    session?.accessToken ? ['recent-tasks', session.accessToken] : null,
    async () => {
      const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks?limit=50&sort=updated_at&order=desc`, {
        headers: { Authorization: `Bearer ${session?.accessToken}` },
      })
      if (!r.ok) return []
      return r.json()
    },
    { refreshInterval: 30000 }
  )

  // Build sub-agent map: each task = 1 sub-agent, grouped by owner agent
  const agentSubAgents = useMemo(() => {
    const map: Record<string, { id: string; title: string; task_type: string; status: string }[]> = {}
    if (Array.isArray(recentTasksRaw)) {
      for (const t of recentTasksRaw) {
        const raw = t as Record<string, unknown>
        if (!raw || raw.status === 'cancelled') continue
        const agentId = String(raw.owner_agent_id || raw.runner_agent_id || '')
        if (!agentId) continue
        if (!map[agentId]) map[agentId] = []
        map[agentId].push({
          id: String(raw.id || ''),
          title: String(raw.title || 'Untitled'),
          task_type: String(raw.task_type || 'general'),
          status: String(raw.status || 'todo'),
        })
      }
    }
    return map
  }, [recentTasksRaw])

  // Fetch real agent capacity & stats from backend
  const { data: agentStatsRaw } = useSWR(
    session?.accessToken ? ['agent-stats', session.accessToken] : null,
    async () => {
      const r = await fetch(`${CLIENT_WTT_API_BASE}/agents/stats`, {
        headers: { Authorization: `Bearer ${session?.accessToken}` },
      })
      if (!r.ok) return null
      return r.json()
    },
    { refreshInterval: 30000 }
  )
  const maxSubAgents = (agentStatsRaw as Record<string, unknown>)?.max_sub_agents as number | undefined ?? 20
  const agentStats = (agentStatsRaw as Record<string, unknown>)?.agents as Record<string, { total: number; active: number; done: number; todo: number }> | undefined
  const onlineAgentIds = useMemo(() => {
    const arr = (agentStatsRaw as Record<string, unknown>)?.online_agents as string[] | undefined
    return new Set(arr ?? [])
  }, [agentStatsRaw])

  useEffect(() => {
    setMembersOpen(false)
  }, [selectedTopicId])

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

  // Quick-create a General Task with no title (defaults to "New Task")
  const handleQuickCreateTask = async (type?: 'code' | 'research' | 'general' | 'pipeline') => {
    if (!selectedAgentId || !session?.accessToken) return
    const taskType = type ?? 'general'

    if (taskType === 'pipeline') {
      const title = prompt('New Pipeline\n\nEnter pipeline name:')
      if (!title?.trim()) return
      try {
        const r = await fetch(`${CLIENT_WTT_API_BASE}/pipelines`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}` },
          body: JSON.stringify({
            name: title.trim(),
            owner_agent_id: selectedAgentId,
          }),
        })
        if (!r.ok) { alert('Failed to create pipeline'); return }
        const pipeline = await r.json()
        router.push(buildAgentUrl(`/pipelines/${pipeline.id}`, selectedAgentId))
      } catch { alert('Failed to create pipeline') }
      return
    }

    if (taskType === 'code' || taskType === 'research') {
      const label = taskType === 'code' ? 'New Code Task' : 'New Research Task'
      const title = prompt(`${label}\n\nEnter task title:`)
      if (!title?.trim()) return
      try {
        const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}` },
          body: JSON.stringify({
            title: title.trim(),
            task_type: taskType,
            priority: 'P2',
            status: 'todo',
            owner_agent_id: selectedAgentId || undefined,
            runner_agent_id: selectedAgentId || undefined,
            created_by: selectedAgentId || undefined,
          }),
        })
        if (!r.ok) { alert('Failed to create task'); return }
        const task = await r.json()
        if (taskType === 'code') router.push(buildAgentUrl(`/tasks/code/${task.id}`, selectedAgentId))
        else router.push(buildAgentUrl(`/tasks/research/${task.id}`, selectedAgentId))
      } catch { alert('Failed to create task') }
      return
    }

    // General: instant create with auto-rename
    try {
      const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}` },
        body: JSON.stringify({
          title: 'New Task',
          task_type: 'general',
          priority: 'P2',
          status: 'todo',
          owner_agent_id: selectedAgentId,
          runner_agent_id: selectedAgentId,
          created_by: selectedAgentId,
        }),
      })
      if (!r.ok) { alert('Failed to create task'); return }
      const task = await r.json()
      if (task.id && task.topic_id) {
        pendingRenameTaskRef.current = { taskId: task.id, topicId: task.topic_id }
      }
      await mutateTopics()
      if (task.topic_id) {
        setSelectedTopicId(task.topic_id)
      }
    } catch {
      alert('Failed to create task')
    }
  }

  const handleSendMessage = async (content: string, modelConfig?: ChatModelConfig) => {
    if (!selectedTopicId || !selectedAgentId) return

    const isTask = !!selectedTopic?.task_id
    // Build metadata with model config so the agent knows which model/mode to use
    const metadata: Record<string, unknown> = {}
    if (modelConfig) {
      metadata.model_config = {
        model: modelConfig.model,
        reasoning_effort: modelConfig.reasoningEffort,
      }
    }

    if (isTask && selectedTopic?.task_id) {
      // Use task chat/send endpoint — it handles auto_run (todo→doing) automatically
      const sendResp = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${selectedTopic.task_id}/chat/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.accessToken ?? ''}` },
        body: JSON.stringify({
          content,
          sender_type: 'HUMAN',
          semantic_type: 'post',
          auto_run: true,
          ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
        }),
      })
      // Force topic list refresh so auto-renamed title appears immediately
      if (sendResp.ok) {
        pendingRenameTaskRef.current = null
        await mutateTopics()
      }
    } else {
      // Regular topic — use publishMessage
      await wttApi.publishMessage(selectedTopicId, {
        content,
        content_type: 'text',
        semantic_type: 'post',
        sender_type: 'HUMAN',
        sender_id: getHumanSender(session),
        ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
      })
    }

    mutate()
  }

  const handleExportTopic = (format: 'md' | 'pdf' | 'docx') => {
    if (!selectedTopicId) return
    const u = `${CLIENT_WTT_API_BASE}/export/topic/${selectedTopicId}?format=${format}`
    window.open(u, '_blank', 'noopener,noreferrer')
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
    // Defer confirm to next tick so the menu close render completes first
    await new Promise((r) => setTimeout(r, 0))
    if (!confirm(`Unclaim agent ${agentId}?`)) return
    try {
      const token = session?.accessToken as string | undefined
      if (!token) {
        alert('Session expired, please login again')
        return
      }
      const res = await fetch(`${CLIENT_WTT_API_BASE}/agents/${encodeURIComponent(agentId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ detail: 'Unknown error' }))
        throw new Error(data.detail || `HTTP ${res.status}`)
      }
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
      <KeyboardShortcuts onDiscover={() => router.push(buildAgentUrl('/discover', selectedAgentId))} />

      <WttShellV2
        agents={agentItems}
        selectedAgentId={selectedAgentId}
        onAgentChange={(id) => { setSelectedAgentId(id); setSelectedTopicId(null) }}
        topics={topics}
        selectedTopicId={selectedTopicId}
        onTopicChange={setSelectedTopicId}
        onRenameAgent={handleRenameAgent}
        onUnclaimAgent={handleUnclaimAgent}
        onLeaveTopic={handleLeaveTopic}
        onDeleteTopic={handleDeleteTopic}
        onOpenEditor={() => setEditorOpen(true)}
        onQuickCreateTask={handleQuickCreateTask}
        onLogout={() => signOut({ callbackUrl: '/login' })}
        onTopicsRefresh={() => mutateTopics()}
        onBindingChanged={loadAgents}
        notificationCount={0}
        currentUserName={getHumanSender(session)}
        agentSubAgents={agentSubAgents}
        maxSubAgents={maxSubAgents}
        agentStats={agentStats ?? undefined}
        onlineAgentIds={onlineAgentIds}
        userToken={session?.accessToken as string | undefined}
      >
        <div className="flex h-full">
          {/* Main content area */}
          <div className="min-w-0 flex-1">
            {selectedTopicId && selectedTopic ? (
              <ChatView
                topicName={selectedTopic.name}
                topicId={selectedTopic.topic_id}
                taskId={selectedTopic.task_id}
                messages={enrichedMessages.filter(m => !m.content.includes('[system:p2p_init]') && !m.content.includes('[System] P2P channel established'))}
                currentAgentId={selectedAgentId}
                onSendMessage={handleSendMessage}
                onLoadOlder={loadOlderMessages}
                onExport={handleExportTopic}
                hasOlder={hasOlder && !loadingOlder}
                loading={!feedRaw && !error}
                isTaskTopic={!!selectedTopic.task_id}
                taskType={selectedTopic.task_type || null}
                wsConnected={wsState === 'connected'}
                accessToken={session?.accessToken as string | undefined}
                onTaskCreated={() => mutateRecentTasks()}
                onTopicCreated={() => mutateTopics()}
                topicMembers={topicMembers}
                topicType={selectedTopic.topic_type}
                extraHeaderActions={
                  shouldShowDiscussMembers ? (
                    <div className="relative">
                      <button
                        onClick={() => setMembersOpen((v) => !v)}
                        onBlur={() => setTimeout(() => setMembersOpen(false), 150)}
                        className="flex items-center gap-1 rounded border border-slate-200 dark:border-zinc-600 px-2 py-1 text-[11px] text-slate-500 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 hover:text-slate-700 dark:hover:text-zinc-100"
                        title="Topic members"
                      >
                        👥 Members ({discussMemberCount}) ▾
                      </button>
                      {membersOpen && (
                        <div className="absolute right-0 top-full mt-1 z-30 min-w-[220px] max-w-[320px] rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 py-1 shadow-lg">
                          {topicMembers.length > 0 ? (
                            topicMembers.map((m) => (
                              <div
                                key={m.agent_id}
                                className="px-3 py-1.5 text-xs text-slate-600 dark:text-zinc-300 border-b border-slate-100 dark:border-zinc-700 last:border-b-0"
                                title={m.agent_id}
                              >
                                <div className="truncate font-medium">{m.display_name}</div>
                                <div className="truncate text-[10px] text-slate-400 dark:text-zinc-500">{m.agent_id}</div>
                              </div>
                            ))
                          ) : (
                            <div className="px-3 py-2 text-xs text-slate-400">No members</div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : undefined
                }
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-slate-400">
                <p className="text-lg">Select a topic to start chatting</p>
                <p className="mt-1 text-sm">Choose from the topic list or create a new task</p>
              </div>
            )}
          </div>

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
