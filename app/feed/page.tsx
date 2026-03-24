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
import { useI18n } from '@/lib/i18n-provider'
import { cacheKeyFromBase64, clearCachedKey, decryptReceived, encryptForSend, getCachedKey } from '@/lib/e2e-crypto'

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

function normalizeSenderType(
  rawType: unknown,
  senderId?: string,
  knownAgentIds?: Set<string>,
  senderDisplayName?: string,
): 'human' | 'agent' {
  const t = String(rawType ?? '').trim().toLowerCase()
  if (t === 'human' || t === 'user' || t === 'person') return 'human'
  if (t === 'agent' || t === 'bot' || t === 'assistant' || t === 'system') return 'agent'

  const sid = String(senderId ?? '').trim()
  const sidLower = sid.toLowerCase()

  if (knownAgentIds?.has(sid)) return 'agent'
  if (sidLower.startsWith('agent_') || sidLower.startsWith('agent-')) return 'agent'

  if (sidLower.startsWith('user_') || sidLower.startsWith('human_')) return 'human'
  if (/^\d{5,}$/.test(sid)) return 'human'

  const name = String(senderDisplayName ?? '').trim().toLowerCase()
  if (name.startsWith('user ') || name.startsWith('wtt user') || name.includes('群众')) return 'human'

  return 'agent'
}

function normalizeFeed(raw: unknown, knownAgentIds?: Set<string>): ChatMessage[] {
  if (!raw || typeof raw !== 'object') return []

  const rows = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { messages?: unknown[] }).messages)
      ? (raw as { messages: unknown[] }).messages
      : []

  return rows.map((row, index) => {
    const data = row as Record<string, unknown>
    const senderId = String(data.sender_id ?? 'unknown')
    const senderDisplayName = data.sender_display_name ? String(data.sender_display_name) : undefined
    return {
      message_id: String(data.message_id ?? data.id ?? `msg-${index}`),
      topic_id: String(data.topic_id ?? ''),
      sender_id: senderId,
      sender_display_name: senderDisplayName,
      sender_type: normalizeSenderType(data.sender_type, senderId, knownAgentIds, senderDisplayName),
      sender_avatar_url: data.sender_avatar_url ? String(data.sender_avatar_url) : undefined,
      content: String(data.content ?? ''),
      encrypted: Boolean(data.encrypted),
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

// Inline member row
function MemberRow({ member, isSelf, onRequestPrivateDiscuss }: {
  member: { agent_id: string; display_name: string }
  isSelf: boolean
  onRequestPrivateDiscuss?: (targetAgentId: string, targetDisplayName: string) => void
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-600 dark:text-zinc-300 border-b border-slate-100 dark:border-zinc-700 last:border-b-0" title={member.agent_id}>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{member.display_name}</div>
        <div className="truncate text-[10px] text-slate-400 dark:text-zinc-500">{member.agent_id}</div>
      </div>
      {!isSelf && onRequestPrivateDiscuss && (
        <button
          onClick={(e) => { e.stopPropagation(); onRequestPrivateDiscuss(member.agent_id, member.display_name) }}
          className="rounded bg-slate-100 dark:bg-zinc-700 px-1.5 py-0.5 text-[10px] text-slate-500 dark:text-zinc-400 transition hover:bg-slate-200 dark:hover:bg-zinc-600 shrink-0"
          title={`Request private discuss with ${member.display_name}`}
        >
          💬
        </button>
      )}
    </div>
  )
}

function FeedPageInner() {
  const { data: session, status } = useSession()
  const { t } = useI18n()
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
  const [typingByTopic, setTypingByTopic] = useState<Record<string, { agentId: string; agentName?: string; startedAt: number; expiresAt: number }>>({})
  // Cache successful decrypt results by message_id + ciphertext to avoid repeated CPU work.
  const decryptCacheRef = useRef<Map<string, string>>(new Map())
  // Keep feed polling fallback enabled only when realtime WS is not healthy.
  const [wsConnectedForPoll, setWsConnectedForPoll] = useState(false)
  const [hasOlder, setHasOlder] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [membersOpen, setMembersOpen] = useState(false)
  const [inviteMemberOpen, setInviteMemberOpen] = useState(false)
  const [inviteAgentId, setInviteAgentId] = useState('')
  const [invitingMember, setInvitingMember] = useState(false)
  // Track newly created task that needs rename on first message
  const pendingRenameTaskRef = useRef<{ taskId: string; topicId: string } | null>(null)
  // Track active worker session context for persona injection
  const activeWorkerSessionRef = useRef<{
    workerId: string
    personaMd: string
    workerMd: string
    isFirstSession: boolean
    personaChanged: boolean
    topicId: string
  } | null>(null)

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

  const knownAgentIds = useMemo(() => new Set(agents.map((a) => a.agent_id)), [agents])

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
      // WS-first: disable regular polling when websocket is healthy.
      // Keep 5s fallback only while WS is disconnected/unhealthy.
      refreshInterval: wsConnectedForPoll ? 0 : 5000,
    }
  )

  // WebSocket for real-time messages
  const wsUrl = selectedAgentId ? `${WS_BASE_URL}/ws/${selectedAgentId}` : ''
  const subscribedTopicsRef = useRef<{ raw: unknown[] | null; mutate: (data?: unknown, revalidate?: boolean) => void }>({ raw: null, mutate: () => {} })
  const decryptMessageForDisplay = useCallback(async (message: ChatMessage): Promise<ChatMessage> => {
    if (!message.encrypted) return message

    const cacheKey = `${message.message_id}:${message.content}`
    const cached = decryptCacheRef.current.get(cacheKey)
    if (cached !== undefined) {
      return { ...message, content: cached }
    }

    const dec = await decryptReceived(message.content, true)
    // Cache only successful decrypts so key bootstrap can recover locked messages immediately.
    if (!dec.decryptFailed) {
      decryptCacheRef.current.set(cacheKey, dec.text)
      if (decryptCacheRef.current.size > 5000) {
        const firstKey = decryptCacheRef.current.keys().next().value
        if (firstKey) decryptCacheRef.current.delete(firstKey)
      }
    }
    return { ...message, content: dec.text }
  }, [])

  const decryptMessagesForDisplay = useCallback(async (messages: ChatMessage[]): Promise<ChatMessage[]> => {
    return Promise.all(messages.map((m) => decryptMessageForDisplay(m)))
  }, [decryptMessageForDisplay])

  const handleWsMessage = useCallback(
    (msg: WsMessage) => {
      const rawEvent = msg as unknown as Record<string, unknown>

      if (rawEvent.type === 'typing') {
        const topicId = String(rawEvent.topic_id || '')
        if (!topicId) return

        const state = String(rawEvent.state || 'start').toLowerCase()
        if (state === 'stop') {
          // Keep indicator briefly visible to avoid start/stop arriving in the same paint frame.
          setTypingByTopic((prev) => {
            const existing = prev[topicId]
            if (!existing) return prev
            return {
              ...prev,
              [topicId]: {
                ...existing,
                expiresAt: Math.max(existing.expiresAt, Date.now() + 900),
              },
            }
          })
          return
        }

        const ttlMsRaw = Number(rawEvent.ttl_ms)
        const ttlMs = Number.isFinite(ttlMsRaw) ? Math.max(1500, Math.min(30000, ttlMsRaw)) : 6000
        const agentId = String(rawEvent.agent_id || '')
        const agentName = String(rawEvent.agent_display_name || '') || agentNameMap[agentId] || undefined

        const now = Date.now()
        setTypingByTopic((prev) => ({
          ...prev,
          [topicId]: {
            agentId,
            agentName,
            startedAt: now,
            expiresAt: now + ttlMs,
          },
        }))
        return
      }

      if (rawEvent.type === 'task_status') {
        const topicId = String(rawEvent.topic_id || '')
        const status = String(rawEvent.status || '').toLowerCase()
        if (!topicId || !status) return

        const taskId = String(rawEvent.task_id || '')
        const title = String(rawEvent.title || '')
        const runnerAgentId = String(rawEvent.runner_agent_id || rawEvent.owner_agent_id || '') || undefined
        const senderId = runnerAgentId || 'task-system'
        const senderName = runnerAgentId ? (agentNameMap[runnerAgentId] || runnerAgentId) : 'Task System'

        const statusMsgId = `ws-task-status:${taskId || topicId}:${status}`
        const synthetic: ChatMessage = {
          message_id: statusMsgId,
          sender_id: senderId,
          sender_display_name: senderName,
          sender_type: 'agent',
          content: '',
          timestamp: new Date().toISOString(),
          semantic_type: 'task_status',
          task_id: taskId || undefined,
          task_status: status,
          task_title: title || undefined,
          runner_agent_id: runnerAgentId,
          exec_mode: rawEvent.exec_mode ? String(rawEvent.exec_mode) : undefined,
        }

        if (topicId === selectedTopicId) {
          setAllMessages((prev) => {
            const idx = prev.findIndex((m) => m.message_id === statusMsgId)
            if (idx >= 0) {
              const next = [...prev]
              next[idx] = { ...next[idx], ...synthetic }
              return next
            }
            return [...prev, synthetic]
          })
        }

        return
      }

      if (msg.type !== 'new_message' || !msg.message) return
      const incomingTopicId = msg.message.topic_id

      // Bump activity for the topic that received the message (optimistic sort)
      const { raw, mutate: mutateSubs } = subscribedTopicsRef.current
      if (raw && Array.isArray(raw)) {
        const now = new Date().toISOString()
        mutateSubs(
          raw.map((t) => {
            const rec = t as Record<string, unknown>
            return rec.id === incomingTopicId ? { ...rec, last_activity_at: now } : t
          }),
          false,
        )
      }

      if (incomingTopicId !== selectedTopicId) return
      const senderId = String(msg.message.sender_id || 'unknown')
      const senderDisplayName = (msg.message as Record<string, unknown>).sender_display_name
        ? String((msg.message as Record<string, unknown>).sender_display_name)
        : agentNameMap[senderId] || undefined
      const incomingBase: ChatMessage = {
        message_id: msg.message.id,
        topic_id: incomingTopicId,
        sender_id: senderId,
        sender_display_name: senderDisplayName,
        sender_type: normalizeSenderType((msg.message as Record<string, unknown>).sender_type, senderId, knownAgentIds, senderDisplayName),
        sender_avatar_url: (msg.message as Record<string, unknown>).sender_avatar_url ? String((msg.message as Record<string, unknown>).sender_avatar_url) : undefined,
        content: msg.message.content,
        encrypted: Boolean((msg.message as Record<string, unknown>).encrypted),
        timestamp: msg.message.created_at,
        semantic_type: msg.message.semantic_type,
      }

      if (incomingBase.sender_type === 'agent') {
        setTypingByTopic((prev) => {
          const existing = prev[incomingTopicId]
          if (!existing) return prev
          return {
            ...prev,
            [incomingTopicId]: {
              ...existing,
              expiresAt: Math.max(existing.expiresAt, Date.now() + 350),
            },
          }
        })
      }

      void (async () => {
        const incoming = await decryptMessageForDisplay(incomingBase)
        setAllMessages((prev) => {
          if (prev.some((m) => m.message_id === incoming.message_id)) return prev
          return [...prev, incoming]
        })
      })()
    },
    [selectedTopicId, agentNameMap, knownAgentIds, decryptMessageForDisplay],
  )
  const { state: wsState, sendAction } = useWebSocket({
    url: wsUrl,
    enabled: !!selectedAgentId,
    token: session?.accessToken || undefined,
    onMessage: handleWsMessage,
  })

  const prevWsStateRef = useRef<string>('disconnected')
  useEffect(() => {
    const connected = wsState === 'connected'
    setWsConnectedForPoll(connected)

    // After reconnect, run one immediate HTTP backfill to avoid missed messages
    // during transient WS outages.
    if (connected && prevWsStateRef.current !== 'connected') {
      void mutate()
    }
    prevWsStateRef.current = wsState
  }, [wsState, mutate])

  const e2eBootstrapRequestedRef = useRef<string | null>(null)
  const e2eBootstrapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const e2eRetryDelayRef = useRef(3000)
  const lastE2EAgentRef = useRef<string | null>(null)
  const [e2eBootstrapSeq, setE2eBootstrapSeq] = useState(0)

  useEffect(() => {
    if (!selectedAgentId) return

    // On first mount, keep existing cached key (it may already match this agent).
    if (!lastE2EAgentRef.current) {
      lastE2EAgentRef.current = selectedAgentId
      return
    }

    if (lastE2EAgentRef.current === selectedAgentId) return
    lastE2EAgentRef.current = selectedAgentId

    // Agent really changed: clear cached key and force re-bootstrap.
    clearCachedKey()
    decryptCacheRef.current.clear()
    e2eBootstrapRequestedRef.current = null
    e2eRetryDelayRef.current = 3000
  }, [selectedAgentId])

  useEffect(() => {
    if (!selectedAgentId) return
    if (!session?.accessToken) return
    if (getCachedKey()) return
    if (e2eBootstrapRequestedRef.current === selectedAgentId) return

    e2eBootstrapRequestedRef.current = selectedAgentId
    void (async () => {
      let bootstrapped = false

      // Single HTTP bootstrap path (server bridges to plugin over WS).
      try {
        const resp = await fetch(
          `${CLIENT_WTT_API_BASE}/agents/e2e-key?agent_id=${encodeURIComponent(selectedAgentId)}`,
          { headers: { Authorization: `Bearer ${session.accessToken}` } },
        )
        if (resp.ok) {
          const payload = (await resp.json()) as { key_b64?: string }
          const keyB64 = String(payload?.key_b64 || '')
          if (keyB64 && cacheKeyFromBase64(keyB64)) {
            bootstrapped = true
            e2eRetryDelayRef.current = 3000
            // Force one refresh so previously locked encrypted rows can re-render decrypted.
            void mutate()
          }
        }
      } catch {
        // ignore and retry below
      }

      if (!bootstrapped) {
        // best-effort bootstrap (plugin offline / auth race / no peer plugin)
        e2eBootstrapRequestedRef.current = null
        if (e2eBootstrapTimerRef.current) clearTimeout(e2eBootstrapTimerRef.current)
        const retryDelay = e2eRetryDelayRef.current
        e2eRetryDelayRef.current = Math.min(retryDelay * 2, 30000)
        e2eBootstrapTimerRef.current = setTimeout(() => {
          setE2eBootstrapSeq((n) => n + 1)
        }, retryDelay)
      }
    })()

    return () => {
      if (e2eBootstrapTimerRef.current) {
        clearTimeout(e2eBootstrapTimerRef.current)
        e2eBootstrapTimerRef.current = null
      }
    }
  }, [selectedAgentId, session?.accessToken, e2eBootstrapSeq, mutate])

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now()
      setTypingByTopic((prev) => {
        let changed = false
        const next: Record<string, { agentId: string; agentName?: string; startedAt: number; expiresAt: number }> = {}
        for (const [topicId, v] of Object.entries(prev)) {
          if (v.expiresAt > now) next[topicId] = v
          else changed = true
        }
        return changed ? next : prev
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const prevTopicRef = useRef(selectedTopicId)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const normalizedRaw = normalizeFeed(feedRaw, knownAgentIds)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      const normalized = await decryptMessagesForDisplay(normalizedRaw)
      if (cancelled) return

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
    })()

    return () => {
      cancelled = true
    }
  }, [feedRaw, selectedTopicId, knownAgentIds, decryptMessagesForDisplay])

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

      const normalizedOlderRaw = normalizeFeed(older, knownAgentIds)
      const normalizedOlder = await decryptMessagesForDisplay(normalizedOlderRaw)
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
  }, [selectedTopicId, loadingOlder, allMessages, knownAgentIds, decryptMessagesForDisplay, selectedAgentId])

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
      // WS updates topic activity; keep low-frequency polling as safety net.
      refreshInterval: wsState === 'connected' ? 60000 : 10000,
    }
  )

  // Keep ref in sync for WS handler (avoids circular dependency)
  useEffect(() => {
    subscribedTopicsRef.current = { raw: subscribedTopicsRaw ?? null, mutate: mutateTopics }
  }, [subscribedTopicsRaw, mutateTopics])

  // Poll pending P2P requests for notifications
  // session.userId is the WTT backend UUID; session.user.id may not be set by NextAuth
  const wttUserId = (session as Record<string, unknown> | null)?.userId as string | undefined
  const { data: p2pRequests, mutate: mutateP2pRequests } = useSWR(
    session?.accessToken && wttUserId
      ? ['p2p-requests', wttUserId, session.accessToken]
      : null,
    async () => {
      if (!wttUserId) return []
      const res = await fetch(`${CLIENT_WTT_API_BASE}/p2p-requests/for-user?user_id=${encodeURIComponent(wttUserId)}&status=pending`, {
        headers: { Authorization: `Bearer ${session?.accessToken}` },
      })
      if (!res.ok) return []
      return res.json()
    },
    { refreshInterval: wsState === 'connected' ? 120000 : 30000 }
  )
  const pendingP2pCount = Array.isArray(p2pRequests) ? p2pRequests.length : 0

  const topics = useMemo<TopicItem[]>(() => {
    if (!subscribedTopicsRaw || !Array.isArray(subscribedTopicsRaw)) return []
    const humanSender = getHumanSender(session)

    const mapped = subscribedTopicsRaw.map((topic: { id: string; name: string; type?: string; my_role?: string; task_id?: string; runner_agent_id?: string; task_type?: string; last_activity_at?: string }) => {
      const topicType = ((topic.type || 'discussion').toLowerCase()) as 'broadcast' | 'discussion' | 'p2p' | 'collaborative'
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
        last_activity_at: topic.last_activity_at || '',
      }
    })

    return mapped.sort((a, b) => {
      // Default P2P always pinned at top
      if (a.is_default_p2p && !b.is_default_p2p) return -1
      if (!a.is_default_p2p && b.is_default_p2p) return 1
      // Then sort by most recent activity
      if (a.last_activity_at && b.last_activity_at) {
        const diff = new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime()
        if (diff !== 0) return diff
      }
      return 0
    })
  }, [subscribedTopicsRaw, selectedAgentId, session])

  const subscribedTopicIds = useMemo(() => topics.map(t => t.topic_id), [topics])

  const agentItems = useMemo<AgentItem[]>(() => {
    return agents.map((agent) => ({
      agent_id: agent.agent_id,
      display_name: agent.display_name,
      unread_count: 0,
    }))
  }, [agents])

  const selectedTopic = topics.find((t) => t.topic_id === selectedTopicId)

  const selectedTopicTypingText = useMemo(() => {
    if (!selectedTopicId) return null
    const typing = typingByTopic[selectedTopicId]
    if (!typing) return null
    const name = typing.agentName || agentNameMap[typing.agentId] || typing.agentId || 'Agent'
    return `${name} ${t('feed.typing')}`
  }, [selectedTopicId, typingByTopic, agentNameMap, t])

  // Clear stale persisted topic if it no longer exists in the topics list
  useEffect(() => {
    if (selectedTopicId && topics.length > 0 && !topics.some(t => t.topic_id === selectedTopicId)) {
      setSelectedTopicId(null)
    }
  }, [topics, selectedTopicId, setSelectedTopicId])

  const shouldShowDiscussMembers = !!selectedTopic && ['discussion', 'collaborative'].includes(selectedTopic.topic_type) && !selectedTopic.task_id
  const { data: topicMembersRaw, mutate: mutateMembers } = useSWR(
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
    { refreshInterval: wsState === 'connected' ? 120000 : 30000 }
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
    { refreshInterval: wsState === 'connected' ? 120000 : 30000 }
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
      const title = prompt(t('feed.newPipelinePrompt'))
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
        if (!r.ok) { alert(t('feed.failedCreatePipeline')); return }
        const pipeline = await r.json()
        router.push(buildAgentUrl(`/pipelines/${pipeline.id}`, selectedAgentId))
      } catch { alert(t('feed.failedCreatePipeline')) }
      return
    }

    if (taskType === 'code' || taskType === 'research') {
      const label = taskType === 'code' ? t('feed.newCodeTaskPrompt') : t('feed.newResearchTaskPrompt')
      const title = prompt(label)
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
        if (!r.ok) { alert(t('feed.failedCreateTask')); return }
        const task = await r.json()
        if (taskType === 'code') router.push(buildAgentUrl(`/tasks/code/${task.id}`, selectedAgentId))
        else router.push(buildAgentUrl(`/tasks/research/${task.id}`, selectedAgentId))
      } catch { alert(t('feed.failedCreateTask')) }
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
      if (!r.ok) { alert(t('feed.failedCreateTask')); return }
      const task = await r.json()
      if (task.id && task.topic_id) {
        pendingRenameTaskRef.current = { taskId: task.id, topicId: task.topic_id }
      }
      await mutateTopics()
      if (task.topic_id) {
        setSelectedTopicId(task.topic_id)
      }
    } catch {
      alert(t('feed.failedCreateTask'))
    }
  }

  const handleSendMessage = async (content: string, modelConfig?: ChatModelConfig) => {
    if (!selectedTopicId || !selectedAgentId) return

    const isTask = !!selectedTopic?.task_id
    const isSlashCommand = content.trim().startsWith('/')
    const isNonTaskDiscuss = selectedTopic?.topic_type === 'discussion' && !isTask

    // Build metadata with model config so the agent knows which model/mode to use
    const metadata: Record<string, unknown> = {}
    if (modelConfig) {
      metadata.model_config = {
        model: modelConfig.model,
        reasoning_effort: modelConfig.reasoningEffort,
      }
    }

    if (isSlashCommand && isNonTaskDiscuss) {
      metadata.command_scope = 'single_agent'
      metadata.command_target_agent_id = selectedAgentId
    }

    // Check if this is a first-time worker session — inject persona.md as system context
    // Also re-inject if persona.md has changed since last injection
    const ws = activeWorkerSessionRef.current
    let augmentedContent = content
    if (ws && ws.topicId === selectedTopicId && (ws.isFirstSession || ws.personaChanged) && ws.personaMd) {
      const isReinject = ws.personaChanged && !ws.isFirstSession
      const personaPrompt = isReinject
        ? [
            `[Worker Persona Updated — please re-read and update your identity]`,
            ws.personaMd,
            `---`,
            `Your persona has been updated. Please acknowledge the changes and adjust accordingly. The user's message follows:`,
            ``,
            content,
          ].join('\n')
        : [
            `[Worker Persona — please read and internalize this as your identity]`,
            ws.personaMd,
            `---`,
            `Based on the persona above, please introduce yourself briefly and confirm your skills and role. The user's message follows:`,
            ``,
            content,
          ].join('\n')
      augmentedContent = personaPrompt
      // Mark as no longer first session / persona change handled
      activeWorkerSessionRef.current = { ...ws, isFirstSession: false, personaChanged: false }
      // Persist worker.md with persona content so future sessions have context
      // Also updates persona_hash on backend to mark injection done
      fetch(`${CLIENT_WTT_API_BASE}/workers/${ws.workerId}/worker-md`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.accessToken ?? ''}` },
        body: JSON.stringify({ worker_md: ws.personaMd }),
      }).catch(() => {})
    } else if (ws && ws.topicId === selectedTopicId && ws.workerMd) {
      // Subsequent session — add worker.md as context if messages are empty (session start)
      if (allMessages.length === 0) {
        augmentedContent = [
          `[Worker Context — your persistent memory and skills]`,
          ws.workerMd,
          `---`,
          content,
        ].join('\n')
      }
    }

    if (isTask && selectedTopic?.task_id) {
      // Use task chat/send endpoint with auto_run disabled.
      // auto_run can trigger an additional task-run lane and cause duplicate-style replies in task topics.
      const sendResp = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${selectedTopic.task_id}/chat/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.accessToken ?? ''}` },
        body: JSON.stringify({
          content: augmentedContent,
          sender_type: 'HUMAN',
          semantic_type: 'post',
          auto_run: false,
          ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
        }),
      })
      // Force topic list refresh so auto-renamed title appears immediately
      if (sendResp.ok) {
        pendingRenameTaskRef.current = null
        await mutateTopics()
      }
    } else {
      // Regular topic — use publishMessage (may include worker persona context)
      let outboundContent = augmentedContent
      let encrypted = false
      if (selectedTopic?.topic_type === 'p2p') {
        const messageId = `web-p2p-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
        const enc = await encryptForSend(augmentedContent, messageId)
        outboundContent = enc.content
        encrypted = enc.encrypted
      }

      await wttApi.publishMessage(selectedTopicId, {
        content: outboundContent,
        content_type: 'text',
        semantic_type: 'post',
        sender_type: 'HUMAN',
        sender_id: getHumanSender(session),
        ...(encrypted ? { encrypted: true } : {}),
        ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
      }, {
        agentId: selectedAgentId || undefined,
      })
    }

    // Optimistically bump topic to top of activity sort
    if (subscribedTopicsRaw && Array.isArray(subscribedTopicsRaw)) {
      const now = new Date().toISOString()
      mutateTopics(
        subscribedTopicsRaw.map((t) => {
          const rec = t as Record<string, unknown>
          return rec.id === selectedTopicId ? { ...rec, last_activity_at: now } : t
        }),
        false
      )
    }

    mutate()
  }

  const exportPlaintextTopicMarkdown = async () => {
    if (!selectedTopicId) return
    const token = session?.accessToken
    if (!token) {
      alert('Session expired. Please re-login and try again.')
      return
    }

    const pageSize = 500
    const maxPages = 60
    let offset = 0
    const rows: ChatMessage[] = []

    for (let page = 0; page < maxPages; page++) {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(offset),
      })
      if (selectedAgentId) params.set('agent_id', selectedAgentId)

      const res = await fetch(`${CLIENT_WTT_API_BASE}/topics/${selectedTopicId}/messages?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        throw new Error(`Export fetch failed: HTTP ${res.status}`)
      }

      const batchRaw = await res.json() as unknown
      if (!Array.isArray(batchRaw) || batchRaw.length === 0) break

      const normalized = normalizeFeed(batchRaw, knownAgentIds)
      const decrypted = await decryptMessagesForDisplay(normalized)
      rows.push(...decrypted)

      if (batchRaw.length < pageSize) break
      offset += batchRaw.length
    }

    if (rows.length === 0) {
      alert('No messages to export in this topic.')
      return
    }

    const sorted = [...rows].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    const unresolved = sorted.filter((m) => m.content.includes('[🔒'))

    const header = [
      `# ${selectedTopic?.name || `Topic ${selectedTopicId}`}`,
      '',
      `- Topic ID: \`${selectedTopicId}\``,
      `- Type: \`${selectedTopic?.topic_type || 'unknown'}\``,
      `- Exported At: \`${new Date().toISOString()}\``,
      `- Export Mode: \`client-side plaintext\``,
      '',
      '---',
      '',
    ]

    const body: string[] = []
    for (const m of sorted) {
      const sender = m.sender_display_name || m.sender_id || 'unknown'
      body.push(`## ${m.timestamp} · ${sender}`)
      body.push('')
      body.push(m.content || '')
      body.push('')
    }

    const markdown = [...header, ...body].join('\n')
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const baseName = (selectedTopic?.name || `topic_${selectedTopicId}`).replace(/[\\/:*?"<>|]+/g, '_')
    a.href = url
    a.download = `${baseName}_plaintext.md`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)

    if (unresolved.length > 0) {
      alert(`Export completed with ${unresolved.length} locked/decrypt-failed messages.`)
    }
  }

  const handleExportTopic = async (format: 'md') => {
    if (!selectedTopicId) return

    // For P2P E2E topics, export plaintext on client side.
    if (format === 'md' && selectedTopic?.topic_type === 'p2p') {
      try {
        await exportPlaintextTopicMarkdown()
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Plaintext export failed')
      }
      return
    }

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
    if (!confirm(`Unclaim agent ${agentId}?`)) return
    try {
      const token = session?.accessToken as string | undefined
      if (!token) {
        alert(t('settings.sessionExpired'))
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
      alert(t('feed.agentUnclaimed'))
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

  const handleSubscribeTopic = async (topicId: string) => {
    if (!selectedAgentId || !session?.accessToken) return
    const wsResult = await sendAction('join', { topic_id: topicId })
    if (wsResult === null) {
      await wttApi.joinTopic(topicId, selectedAgentId)
    }
    await mutateTopics()
  }

  const handleCreateP2P = async (targetAgentId: string) => {
    if (!session?.accessToken) return
    const humanSender = getHumanSender(session)
    const fromUserId = wttUserId || humanSender
    // Send a P2P request instead of directly creating a topic
    const res = await fetch(`${CLIENT_WTT_API_BASE}/p2p-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}` },
      body: JSON.stringify({
        from_user_id: fromUserId,
        from_agent_id: selectedAgentId,
        target_agent_id: targetAgentId,
        message: `P2P chat request from ${humanSender}`,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed' }))
      throw new Error(err.detail || 'Failed to send P2P request')
    }
    alert(t('feed.p2pRequestSent'))
  }

  const handleRequestDiscuss = async (targetAgentId: string, topicName: string) => {
    if (!session?.accessToken) return
    const humanSender = getHumanSender(session)
    const fromUserId = wttUserId || humanSender
    const res = await fetch(`${CLIENT_WTT_API_BASE}/p2p-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}` },
      body: JSON.stringify({
        from_user_id: fromUserId,
        from_agent_id: selectedAgentId,
        target_agent_id: targetAgentId,
        request_type: 'discuss',
        topic_name: topicName,
        message: `Discussion topic invite from ${humanSender}`,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed' }))
      throw new Error(err.detail || 'Failed to send discuss request')
    }
    alert(t('feed.discussRequestSent'))
  }

  const handleInviteMember = async (agentId: string) => {
    if (!session?.accessToken || !selectedTopicId) return
    setInvitingMember(true)
    try {
      const res = await fetch(`${CLIENT_WTT_API_BASE}/topics/${selectedTopicId}/join?agent_id=${encodeURIComponent(agentId)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.accessToken}` },
      })
      if (res.ok) {
        mutateMembers()
        setInviteAgentId('')
        setInviteMemberOpen(false)
      } else {
        const err = await res.json().catch(() => ({ detail: 'Failed' }))
        alert(err.detail || t('feed.privateDiscussFailed'))
      }
    } catch {
      alert(t('feed.networkError'))
    } finally {
      setInvitingMember(false)
    }
  }

  const handleSelectWorkerTopic = (topicId: string, workerSession?: { workerId: string; personaMd: string; workerMd: string; isFirstSession: boolean; personaChanged?: boolean }) => {
    if (workerSession) {
      activeWorkerSessionRef.current = { ...workerSession, personaChanged: workerSession.personaChanged ?? false, topicId }
    }
    mutateTopics().then(() => {
      setSelectedTopicId(topicId)
    })
  }

  const handleRequestPrivateDiscuss = async (targetAgentId: string, targetDisplayName?: string) => {
    if (!session?.accessToken) return
    const humanSender = getHumanSender(session)
    const fromUserId = wttUserId || humanSender
    const targetName = targetDisplayName || targetAgentId
    try {
      const res = await fetch(`${CLIENT_WTT_API_BASE}/p2p-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}` },
        body: JSON.stringify({
          from_user_id: fromUserId,
          from_agent_id: selectedAgentId,
          target_agent_id: targetAgentId,
          request_type: 'discuss',
          topic_name: `${humanSender} & ${targetName}`,
          message: `Private discuss request from ${humanSender}`,
        }),
      })
      if (res.ok) {
        alert(t('feed.privateDiscussSent'))
      } else {
        const err = await res.json().catch(() => ({ detail: 'Failed' }))
        alert(err.detail || t('feed.privateDiscussFailed'))
      }
    } catch {
      alert(t('feed.networkError'))
    }
  }

  const handleAcceptP2PRequest = async (requestId: string) => {
    if (!session?.accessToken) return
    const res = await fetch(`${CLIENT_WTT_API_BASE}/p2p-requests/${requestId}/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.accessToken}` },
    })
    if (res.ok) {
      const data = await res.json()
      await mutateTopics()
      await mutateP2pRequests()
      if (data.topic_id) setSelectedTopicId(data.topic_id)
    }
  }

  const handleRejectP2PRequest = async (requestId: string) => {
    if (!session?.accessToken) return
    await fetch(`${CLIENT_WTT_API_BASE}/p2p-requests/${requestId}/reject`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.accessToken}` },
    })
    await mutateP2pRequests()
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
        onSubscribeTopic={handleSubscribeTopic}
        onCreateP2P={handleCreateP2P}
        onRequestDiscuss={handleRequestDiscuss}
        subscribedTopicIds={subscribedTopicIds}
        onOpenEditor={() => setEditorOpen(true)}
        onQuickCreateTask={handleQuickCreateTask}
        onLogout={() => signOut({ callbackUrl: '/login' })}
        onTopicsRefresh={() => mutateTopics()}
        onBindingChanged={loadAgents}
        notificationCount={pendingP2pCount}
        p2pRequests={Array.isArray(p2pRequests) ? p2pRequests : []}
        onAcceptP2PRequest={handleAcceptP2PRequest}
        onRejectP2PRequest={handleRejectP2PRequest}
        onSelectWorkerTopic={handleSelectWorkerTopic}
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
                typingIndicatorText={selectedTopicTypingText}
                onRequestPrivateDiscuss={handleRequestPrivateDiscuss}
                extraHeaderActions={
                  shouldShowDiscussMembers ? (
                    <div className="relative">
                      <button
                        onClick={() => setMembersOpen((v) => !v)}
                        className="flex items-center gap-1 rounded border border-slate-200 dark:border-zinc-600 px-2 py-1 text-[11px] text-slate-500 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 hover:text-slate-700 dark:hover:text-zinc-100"
                        title={t('feed.members')}
                      >
                        👥 {t('feed.members')} ({discussMemberCount}) ▾
                      </button>
                      {membersOpen && (
                        <>
                          <div className="fixed inset-0 z-20" onClick={() => setMembersOpen(false)} />
                          <div className="absolute right-0 top-full mt-1 z-30 min-w-[280px] max-w-[380px] rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 py-1 shadow-lg">
                            {topicMembers.length > 0 ? (
                              topicMembers.map((m) => (
                                <MemberRow
                                  key={m.agent_id}
                                  member={m}
                                  isSelf={m.agent_id === selectedAgentId || m.agent_id === getHumanSender(session)}
                                  onRequestPrivateDiscuss={handleRequestPrivateDiscuss}
                                />
                              ))
                            ) : (
                              <div className="px-3 py-2 text-xs text-slate-400">{t('feed.noMembers')}</div>
                            )}
                            {/* Invite member */}
                            <div className="border-t border-slate-100 dark:border-zinc-700 px-3 py-1.5">
                              {inviteMemberOpen ? (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="text"
                                    autoFocus
                                    value={inviteAgentId}
                                    onChange={(e) => setInviteAgentId(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && inviteAgentId.trim()) handleInviteMember(inviteAgentId.trim())
                                      if (e.key === 'Escape') { setInviteMemberOpen(false); setInviteAgentId('') }
                                    }}
                                    placeholder={t('feed.agentIdPlaceholder')}
                                    className="flex-1 bg-transparent text-xs text-slate-700 dark:text-zinc-200 placeholder:text-slate-400 outline-none border-b border-indigo-400"
                                  />
                                  <button
                                    onClick={() => { if (inviteAgentId.trim()) handleInviteMember(inviteAgentId.trim()) }}
                                    disabled={!inviteAgentId.trim() || invitingMember}
                                    className="rounded bg-indigo-500 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-indigo-600 disabled:opacity-50"
                                  >
                                    {invitingMember ? '...' : t('feed.add')}
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setInviteMemberOpen(true)}
                                  className="flex items-center gap-1 text-[11px] font-medium text-indigo-500 dark:text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 transition"
                                >
                                  <span className="text-sm">+</span> {t('feed.inviteMember')}
                                </button>
                              )}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  ) : undefined
                }
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-slate-400">
                <p className="text-lg">{t('feed.selectTopic')}</p>
                <p className="mt-1 text-sm">{t('feed.selectTopicHint')}</p>
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
