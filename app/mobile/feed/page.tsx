'use client'

import { signOut, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Bot, Camera, ChevronDown, Clock3, LocateFixed, LogOut, Menu, MessageSquare, Paperclip, Search, Send, Settings, X, Zap } from 'lucide-react'
import { CLIENT_WTT_API_BASE, WS_BASE_URL } from '@/lib/api/base-url'
import { useWebSocket, type WsMessage } from '@/lib/useWebSocket'

const STATUS_STALE_MS = 15 * 60 * 1000
const STATUS_MAX_LINES = 10
const COMPLETE_HOLD_MS = 4500
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024

type AgentRecord = {
  agent_id: string
  display_name?: string
  name?: string
  is_cloud_sandbox?: boolean
  cloud_host_agent_id?: string
  binding_method?: string
  bound_via?: string
}

type TopicRecord = {
  id?: string
  topic_id?: string
  name?: string
  description?: string
  type?: string
  topic_type?: string
  task_id?: string
  task_type?: string
  last_activity_at?: string
  last_message_at?: string
  created_at?: string
}

type ChatMessage = {
  message_id: string
  topic_id?: string
  sender_id: string
  sender_display_name?: string
  sender_type: 'human' | 'agent'
  content: string
  timestamp: string
}

type RuntimeInfo = {
  hostname?: string
  host_agent_id?: string
  provider?: string
  adapter?: string
  current_model?: string
  model?: string
}

type TypingState = {
  agentId: string
  agentName?: string
  adapter?: string
  model?: string
  statusText?: string
  statusKind?: string
  statusLines: Array<{ id: string; text: string; kind?: string; ts: number }>
  startedAt: number
  expiresAt: number
}

type BillingMe = {
  entitlement?: {
    plan?: string
    status?: string
    ends_at?: string | null
    limits?: {
      window_limit?: number
      monthly_limit?: number
    }
  }
  cloud_agent_usage?: {
    window_count?: number
    monthly_count?: number
    blocked_until?: string | null
  }
}

type PendingAsset = {
  url: string
  filename: string
  kind: 'image' | 'audio' | 'video' | 'file'
  token: string
}

function authHeaders(token?: string): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function topicId(topic?: TopicRecord | null): string {
  return String(topic?.topic_id || topic?.id || '').trim()
}

function topicTime(topic: TopicRecord): string {
  return String(topic.last_activity_at || topic.last_message_at || topic.created_at || '')
}

function displayName(agent?: AgentRecord | null): string {
  return String(agent?.display_name || agent?.name || agent?.agent_id || 'Agent')
}

function humanSender(session: unknown): string {
  const s = session as { userId?: string; user?: { name?: string | null; email?: string | null } } | null | undefined
  const uid = s?.userId || ''
  return s?.user?.name || s?.user?.email || (uid ? `user_${uid.slice(0, 8)}` : 'user_default')
}

function normalizeMessages(raw: unknown): ChatMessage[] {
  const rows = Array.isArray(raw) ? raw : []
  return rows.map((item) => {
    const rec = item as Record<string, unknown>
    const senderType = String(rec.sender_type || '').toLowerCase() === 'agent' ? 'agent' : 'human'
    return {
      message_id: String(rec.message_id || rec.id || `${rec.created_at || Date.now()}-${Math.random()}`),
      topic_id: String(rec.topic_id || ''),
      sender_id: String(rec.sender_id || ''),
      sender_display_name: rec.sender_display_name ? String(rec.sender_display_name) : undefined,
      sender_type: senderType,
      content: String(rec.content || ''),
      timestamp: String(rec.timestamp || rec.created_at || new Date().toISOString()),
    }
  })
}

function normalizeWsMessage(raw: unknown): ChatMessage | null {
  const rec = raw as Record<string, unknown>
  const msg = (rec.message && typeof rec.message === 'object' ? rec.message : rec) as Record<string, unknown>
  const id = String(msg.message_id || msg.id || '')
  const content = String(msg.content || '')
  if (!id || !content) return null
  return {
    message_id: id,
    topic_id: String(msg.topic_id || ''),
    sender_id: String(msg.sender_id || ''),
    sender_display_name: msg.sender_display_name ? String(msg.sender_display_name) : undefined,
    sender_type: String(msg.sender_type || '').toLowerCase() === 'agent' ? 'agent' : 'human',
    content,
    timestamp: String(msg.timestamp || msg.created_at || new Date().toISOString()),
  }
}

function collectNestedRecords(value: unknown, out: Record<string, unknown>[] = [], depth = 0): Record<string, unknown>[] {
  if (!value || typeof value !== 'object' || depth > 3) return out
  const record = value as Record<string, unknown>
  out.push(record)
  for (const key of ['payload', 'data', 'event', 'item', 'message', 'delta', 'metadata', 'detail']) {
    collectNestedRecords(record[key], out, depth + 1)
  }
  return out
}

function eventString(record: Record<string, unknown>, keys: string[]): string {
  const records = collectNestedRecords(record)
  for (const key of keys) {
    for (const source of records) {
      const value = source[key]
      if (value == null) continue
      if (typeof value === 'string' && value.trim()) return value.trim()
      if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    }
  }
  return ''
}

function statusTextFromTypingEvent(record: Record<string, unknown>): string | undefined {
  const direct = eventString(record, ['status_text', 'statusText', 'activity_text', 'activityText', 'message', 'detail', 'text', 'summary', 'description', 'progress'])
  if (direct) return direct
  const command = eventString(record, ['command', 'cmd', 'shell_command'])
  if (command) return `执行命令：${command}`
  const tool = eventString(record, ['tool', 'tool_name', 'toolName', 'name'])
  if (tool) return `调用工具：${tool}`
  const phase = eventString(record, ['phase', 'stage', 'step', 'status'])
  if (phase) return `阶段：${phase}`
  return undefined
}

function statusKindFromTypingEvent(record: Record<string, unknown>): string | undefined {
  return eventString(record, ['status_kind', 'statusKind', 'kind', 'event_kind', 'eventKind', 'phase', 'type', 'status']) || undefined
}

function appendTypingStatus(existing: TypingState | undefined, update: Partial<TypingState> & { ttlMs?: number }, now: number): TypingState {
  const text = String(update.statusText || '').trim()
  const kind = update.statusKind
  const lines = existing?.statusLines ? [...existing.statusLines] : []
  if (text) {
    const last = lines[lines.length - 1]
    if (last && last.text === text && last.kind === kind) lines[lines.length - 1] = { ...last, ts: now }
    else lines.push({ id: `${now}-${lines.length}-${kind || 'status'}`, text, kind, ts: now })
  }
  return {
    agentId: update.agentId || existing?.agentId || '',
    agentName: update.agentName || existing?.agentName,
    adapter: update.adapter || existing?.adapter,
    model: update.model || existing?.model,
    statusText: text || existing?.statusText,
    statusKind: kind || existing?.statusKind,
    statusLines: lines.slice(-STATUS_MAX_LINES),
    startedAt: existing?.startedAt || now,
    expiresAt: now + (update.ttlMs || STATUS_STALE_MS),
  }
}

function shortTime(raw: string): string {
  if (!raw) return ''
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function quotaText(billing?: BillingMe | null): string {
  const usage = billing?.cloud_agent_usage
  const limits = billing?.entitlement?.limits
  return `Cloud Agent ${usage?.monthly_count || 0}/${limits?.monthly_limit || 500} 月额度 · 连续 ${usage?.window_count || 0}/${limits?.window_limit || 30}`
}

export default function MobileFeedPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const token = session?.accessToken as string | undefined
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [selectedTopicId, setSelectedTopicId] = useState('')
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [selectorOpen, setSelectorOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [attachOpen, setAttachOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [pendingAssets, setPendingAssets] = useState<PendingAsset[]>([])
  const [typingByTopic, setTypingByTopic] = useState<Record<string, TypingState>>({})
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/mobile/login?callbackUrl=/mobile/feed')
    }
  }, [router, status])

  const { data: agentsRaw } = useSWR(
    token ? ['mobile-agents', token] : null,
    async () => {
      const res = await fetch(`${CLIENT_WTT_API_BASE}/agents/my`, { headers: authHeaders(token), cache: 'no-store' })
      if (!res.ok) return []
      return res.json() as Promise<AgentRecord[]>
    },
    { refreshInterval: 15000, revalidateOnFocus: true },
  )

  const agents = useMemo(() => Array.isArray(agentsRaw) ? agentsRaw : [], [agentsRaw])

  const { data: statsRaw } = useSWR(
    token ? ['mobile-agent-stats', token] : null,
    async () => {
      const res = await fetch(`${CLIENT_WTT_API_BASE}/agents/stats`, { headers: authHeaders(token), cache: 'no-store' })
      if (!res.ok) return null
      return res.json()
    },
    { refreshInterval: 10000, revalidateOnFocus: true },
  )

  const runtimeMap = useMemo(() => (((statsRaw as Record<string, unknown> | null)?.runtimes || {}) as Record<string, RuntimeInfo>), [statsRaw])
  const onlineAgents = useMemo(() => new Set(((statsRaw as Record<string, unknown> | null)?.online_agents as string[] | undefined) || []), [statsRaw])

  useEffect(() => {
    if (!selectedAgentId && agents.length) setSelectedAgentId(agents[0].agent_id)
    if (selectedAgentId && agents.length && !agents.some((a) => a.agent_id === selectedAgentId)) {
      setSelectedAgentId(agents[0].agent_id)
      setSelectedTopicId('')
    }
  }, [agents, selectedAgentId])

  const selectedAgent = useMemo(() => agents.find((a) => a.agent_id === selectedAgentId) || null, [agents, selectedAgentId])

  const { data: topicsRaw, mutate: mutateTopics } = useSWR(
    token && selectedAgentId ? ['mobile-topics', token, selectedAgentId] : null,
    async () => {
      const res = await fetch(`${CLIENT_WTT_API_BASE}/topics/subscribed?agent_id=${encodeURIComponent(selectedAgentId)}`, {
        headers: authHeaders(token),
        cache: 'no-store',
      })
      if (!res.ok) return []
      return res.json() as Promise<TopicRecord[]>
    },
    { refreshInterval: 12000, revalidateOnFocus: true },
  )

  const topics = useMemo(() => {
    const list = (Array.isArray(topicsRaw) ? topicsRaw : []).filter((t) => topicId(t))
    return [...list].sort((a, b) => new Date(topicTime(b)).getTime() - new Date(topicTime(a)).getTime())
  }, [topicsRaw])

  useEffect(() => {
    if (!selectedTopicId && topics.length) setSelectedTopicId(topicId(topics[0]))
    if (selectedTopicId && topics.length && !topics.some((t) => topicId(t) === selectedTopicId)) setSelectedTopicId(topicId(topics[0]))
  }, [selectedTopicId, topics])

  const selectedTopic = useMemo(() => topics.find((t) => topicId(t) === selectedTopicId) || null, [selectedTopicId, topics])
  const selectedTaskId = selectedTopic?.task_id ? String(selectedTopic.task_id) : ''

  const { data: messagesRaw, mutate: mutateMessages } = useSWR(
    token && selectedAgentId && selectedTopicId ? ['mobile-messages', token, selectedAgentId, selectedTopicId] : null,
    async () => {
      const params = new URLSearchParams({ limit: '80', agent_id: selectedAgentId })
      const res = await fetch(`${CLIENT_WTT_API_BASE}/topics/${selectedTopicId}/messages?${params.toString()}`, {
        headers: authHeaders(token),
        cache: 'no-store',
      })
      if (!res.ok) return []
      return res.json()
    },
    { refreshInterval: 0, revalidateOnFocus: true },
  )

  const messages = useMemo(() => normalizeMessages(messagesRaw), [messagesRaw])

  const { data: billing } = useSWR(
    token ? ['mobile-billing', token] : null,
    async () => {
      const res = await fetch(`${CLIENT_WTT_API_BASE}/billing/me`, { headers: authHeaders(token), cache: 'no-store' })
      if (!res.ok) return null
      return res.json() as Promise<BillingMe>
    },
    { refreshInterval: 5 * 60_000 },
  )

  const handleWsMessage = useCallback((msg: WsMessage) => {
    const rawEvent = msg as unknown as Record<string, unknown>
    if (rawEvent.type === 'typing') {
      const tid = String(rawEvent.topic_id || '')
      if (!tid) return
      if (String(rawEvent.state || 'start').toLowerCase() === 'stop') return
      const aid = String(rawEvent.agent_id || selectedAgentId)
      const now = Date.now()
      const ttlRaw = Number(rawEvent.ttl_ms || 0)
      const ttlMs = Number.isFinite(ttlRaw) && ttlRaw > 0 ? Math.max(ttlRaw, 30000) : undefined
      setTypingByTopic((prev) => ({
        ...prev,
        [tid]: appendTypingStatus(prev[tid], {
          agentId: aid,
          agentName: String(rawEvent.agent_display_name || '') || displayName(agents.find((a) => a.agent_id === aid)),
          adapter: String(rawEvent.adapter || '').trim() || undefined,
          model: String(rawEvent.model || rawEvent.model_id || rawEvent.current_model || '').trim() || undefined,
          statusText: statusTextFromTypingEvent(rawEvent),
          statusKind: statusKindFromTypingEvent(rawEvent),
          ttlMs,
        }, now),
      }))
      return
    }

    const incoming = normalizeWsMessage(rawEvent)
    if (!incoming) return
    if (incoming.topic_id === selectedTopicId) {
      void mutateMessages((current: unknown) => {
        const list = normalizeMessages(current)
        if (list.some((m) => m.message_id === incoming.message_id)) return current
        return [...list, incoming]
      }, false)
      if (incoming.sender_type === 'agent') {
        setTypingByTopic((prev) => ({
          ...prev,
          [incoming.topic_id || selectedTopicId]: appendTypingStatus(prev[incoming.topic_id || selectedTopicId], {
            agentId: incoming.sender_id || selectedAgentId,
            statusText: 'Agent 已回复',
            statusKind: 'response',
            ttlMs: COMPLETE_HOLD_MS,
          }, Date.now()),
        }))
      }
    }
    void mutateTopics()
  }, [agents, mutateMessages, mutateTopics, selectedAgentId, selectedTopicId])

  const wsUrl = selectedAgentId ? `${WS_BASE_URL}/ws/${selectedAgentId}?client=mobile-web` : ''
  const { state: wsState } = useWebSocket({ url: wsUrl, enabled: Boolean(token && selectedAgentId), token, onMessage: handleWsMessage })

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length, selectedTopicId])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now()
      setTypingByTopic((prev) => {
        let changed = false
        const next = { ...prev }
        for (const [key, value] of Object.entries(next)) {
          if (value.expiresAt < now) {
            delete next[key]
            changed = true
          }
        }
        return changed ? next : prev
      })
    }, 2500)
    return () => window.clearInterval(timer)
  }, [])

  const runStatus = selectedTopicId ? typingByTopic[selectedTopicId] : undefined

  const groupedAgents = useMemo(() => {
    const groups = new Map<string, AgentRecord[]>()
    for (const agent of agents) {
      const runtime = runtimeMap[agent.agent_id]
      const host = String(runtime?.hostname || runtime?.host_agent_id || agent.cloud_host_agent_id || 'Unknown').trim()
      const label = host.length > 18 ? `${host.slice(0, 16)}...` : host
      groups.set(label, [...(groups.get(label) || []), agent])
    }
    return Array.from(groups.entries()).map(([host, rows]) => ({ host, rows }))
  }, [agents, runtimeMap])

  const filteredTopics = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return topics
    return topics.filter((t) => `${t.name || ''} ${topicId(t)} ${t.description || ''}`.toLowerCase().includes(q))
  }, [search, topics])

  const sendMessage = useCallback(async () => {
    const attachmentContent = pendingAssets.map((asset) => asset.token).join('\n\n')
    const content = [draft.trim(), attachmentContent].filter(Boolean).join('\n\n')
    if (!content || !token || !selectedAgentId || !selectedTopicId || sending) return
    setSending(true)
    setDraft('')
    setPendingAssets([])
    const now = Date.now()
    setTypingByTopic((prev) => ({
      ...prev,
      [selectedTopicId]: appendTypingStatus(prev[selectedTopicId], {
        agentId: selectedAgentId,
        agentName: displayName(selectedAgent),
        statusText: '消息已发送，等待 Agent 接收',
        statusKind: 'queued',
      }, now),
    }))
    try {
      if (selectedTaskId) {
        await fetch(`${CLIENT_WTT_API_BASE}/tasks/${selectedTaskId}/chat/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
          body: JSON.stringify({
            content,
            sender_type: 'HUMAN',
            semantic_type: 'post',
            auto_run: true,
          }),
        })
      } else {
        await fetch(`${CLIENT_WTT_API_BASE}/topics/${selectedTopicId}/messages?agent_id=${encodeURIComponent(selectedAgentId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
          body: JSON.stringify({
            content,
            content_type: 'text',
            semantic_type: 'post',
            sender_type: 'HUMAN',
            sender_id: humanSender(session),
          }),
        })
      }
      await mutateMessages()
      await mutateTopics()
    } finally {
      setSending(false)
    }
  }, [draft, mutateMessages, mutateTopics, pendingAssets, selectedAgent, selectedAgentId, selectedTaskId, selectedTopicId, sending, session, token])

  const uploadAsset = useCallback(async (file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      alert(`文件过大，最大 100MB，当前 ${(file.size / (1024 * 1024)).toFixed(1)}MB`)
      return
    }
    setUploading(true)
    setUploadProgress(0)
    try {
      const sign = await fetch(`${CLIENT_WTT_API_BASE}/media/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, mime_type: file.type || 'application/octet-stream', size: file.size }),
      })
      if (!sign.ok) throw new Error(await sign.text())
      const signed = await sign.json()
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) setUploadProgress(Math.round((event.loaded / event.total) * 90))
        })
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve()
          else reject(new Error(xhr.responseText || `Upload failed: ${xhr.status}`))
        })
        xhr.addEventListener('error', () => reject(new Error('Upload failed')))
        xhr.open('PUT', `${CLIENT_WTT_API_BASE}${signed.upload_url}`)
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
        xhr.send(file)
      })
      setUploadProgress(95)
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
      const kind: PendingAsset['kind'] = isImage ? 'image' : isAudio ? 'audio' : isVideo ? 'video' : 'file'
      const token = isImage
        ? `![${file.name}](${asset.url})`
        : isAudio
          ? `[audio:${file.name}](${asset.url})`
          : isVideo
            ? `[video:${file.name}](${asset.url})`
            : `[file:${file.name}](${asset.url})`
      setPendingAssets((prev) => [...prev, { url: asset.url, filename: file.name, kind, token }])
      setUploadProgress(100)
    } catch (error) {
      alert(error instanceof Error ? error.message : '上传失败')
    } finally {
      setUploading(false)
      setUploadProgress(null)
    }
  }, [])

  const insertLocation = useCallback(() => {
    setAttachOpen(false)
    if (!navigator.geolocation) {
      alert('当前设备不支持定位')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        const token = `[location](https://maps.google.com/?q=${latitude},${longitude})`
        setDraft((prev) => `${prev}${prev ? '\n\n' : ''}${token}`)
      },
      (error) => alert(`定位失败：${error.message || 'permission denied'}`),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    )
  }, [])

  if (status === 'loading') {
    return <div className="flex min-h-[100dvh] items-center justify-center bg-[#f8f3ea] text-sm font-bold text-slate-500">Loading WTT...</div>
  }

  return (
    <main className="flex h-[100dvh] overflow-hidden bg-[#f8f3ea] text-slate-950">
      <section className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[#e5dac8] bg-white/90 px-3 backdrop-blur">
          <button onClick={() => setSelectorOpen(true)} className="rounded-2xl border border-slate-200 bg-slate-50 p-2 text-slate-700">
            <Menu className="h-5 w-5" />
          </button>
          <button onClick={() => setSelectorOpen(true)} className="min-w-0 flex-1 text-left">
            <div className="truncate text-sm font-black">{selectedTopic?.name || '选择 Topic'}</div>
            <div className="flex items-center gap-1 truncate text-[11px] font-semibold text-slate-500">
              <span className={`h-1.5 w-1.5 rounded-full ${onlineAgents.has(selectedAgentId) ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              <span className="truncate">{selectedAgent ? displayName(selectedAgent) : '选择 Agent'}</span>
              <ChevronDown className="h-3 w-3" />
            </div>
          </button>
          <button onClick={() => setSettingsOpen(true)} className="rounded-2xl border border-slate-200 bg-slate-50 p-2 text-slate-700">
            <Settings className="h-5 w-5" />
          </button>
        </header>

        {runStatus && (
          <div className="mx-3 mt-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs shadow-sm">
            <div className="flex items-center gap-2 font-black text-amber-900">
              <Zap className="h-3.5 w-3.5" />
              <span className="truncate">{runStatus.agentName || runStatus.agentId} 正在执行</span>
              <span className="ml-auto text-[10px] font-bold text-amber-700">{wsState}</span>
            </div>
            <div className="mt-1 max-h-20 space-y-1 overflow-hidden text-[11px] font-semibold leading-4 text-amber-800/85">
              {(runStatus.statusLines.length ? runStatus.statusLines : [{ id: 'status', text: runStatus.statusText || '等待 Agent 状态更新' }]).slice(-4).map((line) => (
                <p key={line.id} className="truncate">{line.text}</p>
              ))}
            </div>
          </div>
        )}

        <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4">
          {!selectedAgentId ? (
            <EmptyCard title="添加 Agent" desc="请先在 WTT Web 绑定已有 Agent 或创建云端 Agent，然后回到手机端指挥它工作。" />
          ) : !selectedTopicId ? (
            <EmptyCard title="选择 Topic" desc="点击左上角菜单，从当前 Agent 的 Topic 列表中选择一个对话。" />
          ) : messages.length === 0 ? (
            <EmptyCard title="开始对话" desc="发送第一条消息，Agent 的执行状态会显示在聊天区上方。" />
          ) : (
            messages.map((message) => (
              <article key={message.message_id} className={`flex ${message.sender_type === 'human' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[86%] rounded-3xl px-4 py-3 text-sm leading-6 shadow-sm ${
                  message.sender_type === 'human'
                    ? 'rounded-br-md bg-slate-950 text-white'
                    : 'rounded-bl-md border border-[#eadfce] bg-white text-slate-900'
                }`}>
                  {message.sender_type === 'agent' && (
                    <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-sky-600">{message.sender_display_name || message.sender_id || 'Agent'}</div>
                  )}
                  <div className="prose prose-sm max-w-none break-words prose-pre:overflow-auto prose-pre:rounded-2xl prose-pre:bg-slate-950 prose-pre:text-slate-100">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                  </div>
                  <div className={`mt-1 text-right text-[10px] ${message.sender_type === 'human' ? 'text-white/55' : 'text-slate-400'}`}>{shortTime(message.timestamp)}</div>
                </div>
              </article>
            ))
          )}
        </div>

        <footer className="shrink-0 border-t border-[#e5dac8] bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {pendingAssets.length > 0 && (
            <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
              {pendingAssets.map((asset, index) => (
                <div key={`${asset.url}-${index}`} className="flex max-w-[220px] shrink-0 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-2 py-2">
                  {asset.kind === 'image' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={asset.url} alt="" className="h-10 w-10 rounded-xl object-cover" />
                  ) : (
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-[10px] font-black text-sky-700">FILE</span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-black text-slate-800">{asset.filename}</span>
                    <span className="block text-[10px] font-bold uppercase text-slate-400">{asset.kind}</span>
                  </span>
                  <button onClick={() => setPendingAssets((prev) => prev.filter((_, i) => i !== index))} className="rounded-full bg-white p-1 text-slate-400">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {uploading && (
            <div className="mb-2 rounded-2xl bg-sky-50 px-3 py-2 text-xs font-black text-sky-700">
              正在上传 {uploadProgress ?? 0}%
            </div>
          )}
          <div className="flex items-end gap-2 rounded-3xl border border-slate-200 bg-slate-50 p-2">
            <div className="relative">
              <button onClick={() => setAttachOpen((v) => !v)} className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm">
                <Paperclip className="h-4 w-4" />
              </button>
              {attachOpen && (
                <div className="absolute bottom-full left-0 mb-2 w-44 overflow-hidden rounded-2xl border border-slate-200 bg-white text-xs font-black text-slate-700 shadow-xl">
                  <button onClick={() => { setAttachOpen(false); fileInputRef.current?.click() }} className="flex w-full items-center gap-2 px-3 py-3 text-left hover:bg-slate-50">
                    <Paperclip className="h-4 w-4" /> 文件/图片
                  </button>
                  <button onClick={() => { setAttachOpen(false); cameraInputRef.current?.click() }} className="flex w-full items-center gap-2 px-3 py-3 text-left hover:bg-slate-50">
                    <Camera className="h-4 w-4" /> 拍照
                  </button>
                  <button onClick={insertLocation} className="flex w-full items-center gap-2 px-3 py-3 text-left hover:bg-slate-50">
                    <LocateFixed className="h-4 w-4" /> 发送位置
                  </button>
                </div>
              )}
            </div>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  void sendMessage()
                }
              }}
              rows={1}
              placeholder="给 Agent 发送任务..."
              className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm font-semibold outline-none placeholder:text-slate-400"
            />
            <button
              onClick={() => void sendMessage()}
              disabled={(!draft.trim() && pendingAssets.length === 0) || sending || uploading || !selectedTopicId}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-600 text-white shadow-sm disabled:bg-slate-300"
            >
              <Send className="h-4 w-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*,audio/*,.pdf,.txt,.md,.doc,.docx,.ppt,.pptx,.xls,.xlsx,application/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void uploadAsset(file)
                event.currentTarget.value = ''
              }}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void uploadAsset(file)
                event.currentTarget.value = ''
              }}
            />
          </div>
        </footer>
      </section>

      {selectorOpen && (
        <MobileSheet title="选择 Agent / Topic" onClose={() => setSelectorOpen(false)}>
          <div className="sticky top-0 z-10 bg-white pb-3">
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
              <Search className="h-4 w-4 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索 Topic" className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none" />
            </div>
          </div>
          <div className="space-y-4">
            {groupedAgents.map((group) => {
              const online = group.rows.filter((a) => onlineAgents.has(a.agent_id)).length
              return (
                <section key={group.host} className="rounded-3xl border border-slate-200 bg-slate-50 p-2">
                  <div className="mb-2 flex items-center justify-between px-2 text-xs font-black text-slate-500">
                    <span>{group.host}</span>
                    <span>{online}/{group.rows.length}</span>
                  </div>
                  <div className="space-y-1">
                    {group.rows.map((agent) => {
                      const active = agent.agent_id === selectedAgentId
                      return (
                        <button
                          key={agent.agent_id}
                          onClick={() => {
                            setSelectedAgentId(agent.agent_id)
                            setSelectedTopicId('')
                          }}
                          className={`flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-sm font-bold ${active ? 'bg-sky-600 text-white' : 'bg-white text-slate-700'}`}
                        >
                          <Bot className="h-4 w-4 shrink-0" />
                          <span className="min-w-0 flex-1 truncate">{displayName(agent)}</span>
                          <span className={`h-2 w-2 rounded-full ${onlineAgents.has(agent.agent_id) ? 'bg-emerald-400' : 'bg-slate-300'}`} />
                        </button>
                      )
                    })}
                  </div>
                </section>
              )
            })}
            <section>
              <div className="mb-2 px-1 text-xs font-black uppercase tracking-wide text-slate-500">Topics</div>
              <div className="space-y-2">
                {filteredTopics.map((topic) => {
                  const id = topicId(topic)
                  return (
                    <button
                      key={id}
                      onClick={() => {
                        setSelectedTopicId(id)
                        setSelectorOpen(false)
                      }}
                      className={`w-full rounded-3xl border p-3 text-left ${id === selectedTopicId ? 'border-sky-300 bg-sky-50' : 'border-slate-200 bg-white'}`}
                    >
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 shrink-0 text-sky-600" />
                        <span className="min-w-0 flex-1 truncate text-sm font-black text-slate-900">{topic.name || id}</span>
                      </div>
                      <div className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-slate-500">{topic.description || topic.type || topic.topic_type || 'Topic'}</div>
                    </button>
                  )
                })}
              </div>
            </section>
          </div>
        </MobileSheet>
      )}

      {settingsOpen && (
        <MobileSheet title="设置" onClose={() => setSettingsOpen(false)}>
          <div className="space-y-3">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-slate-400">Account</p>
              <p className="mt-1 text-base font-black text-slate-900">{session?.user?.name || session?.user?.email || 'WTT User'}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">{billing?.entitlement?.plan === 'pro' ? 'Pro' : 'Free'} · {quotaText(billing)}</p>
            </div>
            <a href="/feed" className="block rounded-3xl border border-slate-200 bg-white p-4 text-sm font-black text-slate-900">打开完整 Web Feed</a>
            <a href="/mobile/settings" className="block rounded-3xl border border-slate-200 bg-white p-4 text-sm font-black text-slate-900">移动端设置页</a>
            <button onClick={() => signOut({ callbackUrl: '/mobile/login?callbackUrl=/mobile/feed' })} className="flex w-full items-center justify-center gap-2 rounded-3xl bg-slate-950 p-4 text-sm font-black text-white">
              <LogOut className="h-4 w-4" />
              退出登录
            </button>
          </div>
        </MobileSheet>
      )}
    </main>
  )
}

function EmptyCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="mx-auto mt-16 max-w-sm rounded-3xl border border-[#eadfce] bg-white/90 p-5 text-center shadow-sm">
      <Clock3 className="mx-auto h-8 w-8 text-sky-500" />
      <p className="mt-3 text-base font-black text-slate-900">{title}</p>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">{desc}</p>
    </div>
  )
}

function MobileSheet({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/35">
      <div className="absolute inset-x-0 bottom-0 max-h-[86dvh] overflow-hidden rounded-t-[2rem] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <p className="text-base font-black text-slate-900">{title}</p>
          <button onClick={onClose} className="rounded-full bg-slate-100 p-2 text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[calc(86dvh-3.5rem)] overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>
  )
}
