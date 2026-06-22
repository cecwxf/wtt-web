'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useTheme } from 'next-themes'
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import {
  ArrowLeft,
  ExternalLink,
  Github,
  Globe2,
  Languages,
  Loader2,
  Maximize2,
  Minimize2,
  Monitor,
  Moon,
  PlugZap,
  RefreshCw,
  Smartphone,
  Sparkles,
  Sun,
} from 'lucide-react'
import { ChatView, type ChatMessage, type ChatRunStatus, type ChatSendOptions } from '@/components/ui/chat-view'
import { StudioConnectorsPanel } from '@/components/studio/studio-connectors-panel'
import { WS_BASE_URL } from '@/lib/api/base-url'
import { useWebSocket, type WsMessage } from '@/lib/useWebSocket'
import {
  fetchStudioAgentStats,
  fetchStudioAgents,
  fetchStudioBilling,
  fetchStudioCloudAgent,
  fetchStudioConnectorPromptContext,
  fetchStudioMessages,
  fetchStudioTopics,
  sendStudioMessage,
} from '@/lib/studio/api'
import {
  enrichProjectWithMessages,
  projectFromTopic,
  studioTitleFromTopicName,
} from '@/lib/studio/parsers'
import {
  buildFollowupStudioPrompt,
  buildGithubPrompt,
  buildPreviewPrompt,
  studioWorkspace,
} from '@/lib/studio/prompts'
import type { StudioAgent, StudioAgentStats, StudioBilling, StudioCloudAgent, StudioMessage, StudioProject } from '@/lib/studio/types'
import { useI18n } from '@/lib/i18n-provider'

const AGENT_TYPING_STALE_MS = 15 * 60 * 1000
const AGENT_STATUS_CARD_MAX_LINES = 14
const AGENT_STATUS_COMPLETE_HOLD_MS = 4500
const STUDIO_PANE_WIDTH_KEY = 'wtt:studio:chat-pane-width'

type TopicTypingState = {
  agentId: string
  agentName?: string
  statusText?: string
  statusKind?: string
  adapter?: string
  model?: string
  statusLines?: ChatRunStatus['lines']
  startedAt: number
  expiresAt: number
}

function sessionToken(session: unknown) {
  return (session as { accessToken?: string } | null)?.accessToken || ''
}

function isCloudAgent(agent: StudioAgent, stats: StudioAgentStats | null) {
  const runtime = stats?.runtimes?.[agent.agent_id]
  return (
    String(agent.binding_method || agent.bound_via || '') === 'cloud_trial' ||
    Boolean(agent.is_cloud_sandbox) ||
    Boolean(agent.cloud_host_agent_id) ||
    String(runtime?.provider || '').includes('cloudflare_sandbox')
  )
}

function onlineAgentIds(stats: StudioAgentStats | null) {
  const ids = new Set((stats?.online_agents || []).map(String))
  for (const [agentId, runtime] of Object.entries(stats?.runtimes || {})) {
    if (typeof runtime.last_heartbeat_secs_ago === 'number' && runtime.last_heartbeat_secs_ago <= 90) {
      ids.add(agentId)
    }
  }
  return ids
}

function chooseStudioAgent(agents: StudioAgent[], stats: StudioAgentStats | null, cloudAgent: StudioCloudAgent | null) {
  const cloudAgents = agents.filter((agent) => isCloudAgent(agent, stats))
  const onlineIds = onlineAgentIds(stats)
  return (
    cloudAgents.find((agent) => onlineIds.has(agent.agent_id))?.agent_id ||
    String(cloudAgent?.agent_id || '').trim() ||
    cloudAgents[0]?.agent_id ||
    ''
  )
}

function chooseProjectAgent(
  project: StudioProject | null,
  agents: StudioAgent[],
  stats: StudioAgentStats | null,
  cloudAgent: StudioCloudAgent | null,
) {
  const cloudAgents = agents.filter((agent) => isCloudAgent(agent, stats))
  const cloudIds = new Set(cloudAgents.map((agent) => agent.agent_id))
  const onlineIds = onlineAgentIds(stats)
  const projectMembers = project?.memberAgentIds?.filter((agentId) => cloudIds.has(agentId)) || []
  const creatorAgentId = String(project?.creatorAgentId || '').trim()

  return (
    projectMembers.find((agentId) => onlineIds.has(agentId)) ||
    (creatorAgentId && cloudIds.has(creatorAgentId) ? creatorAgentId : '') ||
    chooseStudioAgent(agents, stats, cloudAgent)
  )
}

function appendTypingStatus(
  existing: TopicTypingState | null,
  update: {
    agentId?: string
    agentName?: string
    statusText?: string
    statusKind?: string
    adapter?: string
    model?: string
    ttlMs?: number
  },
  now: number,
): TopicTypingState {
  const text = String(update.statusText || '').trim()
  const kind = String(update.statusKind || '').trim() || undefined
  const lines = existing?.statusLines ? [...existing.statusLines] : []

  if (text) {
    const last = lines[lines.length - 1]
    if (last && last.text === text && last.kind === kind) {
      lines[lines.length - 1] = { ...last, ts: now }
    } else {
      lines.push({ id: `${now}-${lines.length}-${kind || 'status'}`, text, kind, ts: now })
    }
  }

  return {
    agentId: update.agentId || existing?.agentId || '',
    agentName: update.agentName || existing?.agentName,
    statusText: text || existing?.statusText,
    statusKind: kind || existing?.statusKind,
    adapter: update.adapter || existing?.adapter,
    model: update.model || existing?.model,
    statusLines: lines.slice(-AGENT_STATUS_CARD_MAX_LINES),
    startedAt: existing?.startedAt || now,
    expiresAt: now + (update.ttlMs || AGENT_TYPING_STALE_MS),
  }
}

function completeTypingStatus(existing: TopicTypingState | null, agentId?: string, messageTimestamp?: string) {
  if (!existing) return null
  if (agentId && existing.agentId && existing.agentId !== agentId) return existing
  if (messageTimestamp) {
    const messageTime = new Date(messageTimestamp).getTime()
    if (Number.isFinite(messageTime) && messageTime + 2000 < existing.startedAt) return existing
  }
  return appendTypingStatus(existing, {
    agentId: agentId || existing.agentId,
    statusText: 'Agent 已回复',
    statusKind: 'response',
    ttlMs: AGENT_STATUS_COMPLETE_HOLD_MS,
  }, Date.now())
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

function clampStudioPaneWidth(value: number) {
  return Math.min(70, Math.max(32, value))
}

function studioMetadata(message: StudioMessage): Record<string, unknown> {
  const raw = message.metadata
  if (!raw) return {}
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
    } catch {
      return {}
    }
  }
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
}

function legacyStudioDisplayContent(content: string) {
  const text = String(content || '').trim()
  if (!text.includes('[WTT_STUDIO_')) return text
  const userNeed = text.match(/用户需求：\s*([\s\S]*)$/)
  if (userNeed?.[1]?.trim()) return userNeed[1].trim()
  if (text.includes('[WTT_STUDIO_PREVIEW]')) return '生成或刷新预览链接'
  if (text.includes('[WTT_STUDIO_GITHUB]')) return '提交当前网站到 GitHub'

  const withoutHeader = text
    .replace(/\[WTT_STUDIO_[^\]]+\][\s\S]*?\[\/WTT_STUDIO_[^\]]+\]\s*/g, '')
    .trim()
  const blocks = withoutHeader.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean)
  return blocks[blocks.length - 1] || text
}

function displayStudioMessageContent(message: StudioMessage) {
  const metadata = studioMetadata(message)
  const displayContent = metadata.display_content ?? metadata.displayContent
  if (typeof displayContent === 'string' && displayContent.trim()) return displayContent.trim()
  const senderType = String(message.sender_type || '').toLowerCase()
  const content = String(message.content || '')
  return senderType === 'human' ? legacyStudioDisplayContent(content) : content
}

function toChatMessage(message: StudioMessage): ChatMessage {
  return {
    message_id: String(message.message_id || message.id || `${message.timestamp || message.created_at || ''}:${String(message.content || '').length}`),
    topic_id: message.topic_id,
    sender_id: String(message.sender_id || ''),
    sender_display_name: message.sender_display_name || undefined,
    sender_type: String(message.sender_type || '').toLowerCase() === 'human' ? 'human' : 'agent',
    content: displayStudioMessageContent(message),
    encrypted: false,
    timestamp: String(message.timestamp || message.created_at || new Date().toISOString()),
    semantic_type: String((message as { semantic_type?: string }).semantic_type || 'post'),
  }
}

export function StudioBuilder({ topicId }: { topicId: string }) {
  const { data: session, status } = useSession()
  const { theme, setTheme } = useTheme()
  const { locale, setLocale } = useI18n()
  const token = sessionToken(session)
  const [agentStats, setAgentStats] = useState<StudioAgentStats | null>(null)
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [project, setProject] = useState<StudioProject | null>(null)
  const [messages, setMessages] = useState<StudioMessage[]>([])
  const [typingState, setTypingState] = useState<TopicTypingState | null>(null)
  const [billing, setBilling] = useState<StudioBilling | null>(null)
  const [cloudAgentState, setCloudAgentState] = useState<StudioCloudAgent | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [connectorsOpen, setConnectorsOpen] = useState(false)
  const [chatPaneWidth, setChatPaneWidth] = useState(48)
  const [chatFullscreen, setChatFullscreen] = useState(false)
  const [previewFullscreen, setPreviewFullscreen] = useState(false)

  const enrichedProject = useMemo(() => {
    const fallback: StudioProject = {
      topicId,
      topicName: 'STUDIO: Untitled Site',
      title: 'Untitled Site',
      description: '',
    }
    return enrichProjectWithMessages(project || fallback, messages)
  }, [messages, project, topicId])

  const chatMessages = useMemo(() => messages.map(toChatMessage), [messages])
  const selectedRuntime = selectedAgentId ? agentStats?.runtimes?.[selectedAgentId] : undefined
  const isSelectedOnline = selectedAgentId ? onlineAgentIds(agentStats).has(selectedAgentId) : false
  const fullscreenMode = chatFullscreen ? 'chat' : previewFullscreen ? 'preview' : null
  const zh = locale === 'zh'
  const copy = zh ? {
    loading: '正在加载 WTT Studio...',
    signInTitle: '登录后继续',
    signInDesc: 'WTT Studio 复用你的 WTT 账号、Cloud Agent 和会员权益。',
    signIn: '登录',
    noAgent: '没有可用 Cloud Agent',
    online: '在线',
    offline: '离线',
    connectors: 'Connectors',
    emptyEyebrow: 'WTT Studio',
    emptyTitle: '用你的 Cloud Agent 开始构建',
    emptyDesc: '输入你要生成或修改的网站。Studio 会把任务作为普通 Cloud Agent 对话发送，并把 connector context 注入到任务中。',
    preview: 'Preview',
    github: 'GitHub',
    chatMax: 'Chat 全屏',
    chatExit: '退出 Chat 全屏',
    max: 'Max',
    exit: 'Exit',
    resize: '拖拽调整 Chat / Preview 宽度',
    livePreview: 'Live Preview',
    previewReady: 'Cloud Agent Preview URL',
    previewWaiting: '等待 Preview URL',
    previewMax: 'Preview 全屏',
    previewExit: '退出 Preview 全屏',
    noPreview: '还没有预览',
    noPreviewDesc: '让 Agent 启动 dev server 并返回 Cloud Agent Preview URL，最新 URL 会自动显示在这里。',
    requestPreview: '请求预览',
    themeTitle: '切换明暗模式',
    langTitle: 'Switch to English',
  } : {
    loading: 'Loading WTT Studio...',
    signInTitle: 'Sign in to continue',
    signInDesc: 'WTT Studio reuses your WTT account, Cloud Agent, and membership.',
    signIn: 'Sign in',
    noAgent: 'No Cloud Agent available',
    online: 'online',
    offline: 'offline',
    connectors: 'Connectors',
    emptyEyebrow: 'WTT Studio',
    emptyTitle: 'Start building with your Cloud Agent',
    emptyDesc: 'Describe the website you want to generate or modify. Studio sends it as a normal Cloud Agent chat and injects connector context.',
    preview: 'Preview',
    github: 'GitHub',
    chatMax: 'Maximize Chat',
    chatExit: 'Exit Chat fullscreen',
    max: 'Max',
    exit: 'Exit',
    resize: 'Drag to resize Chat / Preview',
    livePreview: 'Live Preview',
    previewReady: 'Cloud Agent Preview URL',
    previewWaiting: 'Waiting for preview URL',
    previewMax: 'Maximize Preview',
    previewExit: 'Exit Preview fullscreen',
    noPreview: 'No preview yet',
    noPreviewDesc: 'Ask the Agent to start a dev server and return a Cloud Agent Preview URL. The latest URL will render here automatically.',
    requestPreview: 'Request preview',
    themeTitle: 'Toggle light/dark mode',
    langTitle: '切换为中文',
  }

  useEffect(() => {
    const saved = window.localStorage.getItem(STUDIO_PANE_WIDTH_KEY)
    const parsed = saved ? Number(saved) : NaN
    if (Number.isFinite(parsed)) setChatPaneWidth(clampStudioPaneWidth(parsed))
  }, [])

  useEffect(() => {
    window.localStorage.setItem(STUDIO_PANE_WIDTH_KEY, String(Math.round(chatPaneWidth)))
  }, [chatPaneWidth])

  const startPaneResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const container = event.currentTarget.parentElement
    if (!container) return
    const rect = container.getBoundingClientRect()
    if (!rect.width) return

    const handleMove = (moveEvent: PointerEvent) => {
      const nextWidth = ((moveEvent.clientX - rect.left) / rect.width) * 100
      setChatPaneWidth(clampStudioPaneWidth(nextWidth))
    }

    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp, { once: true })
  }, [])

  const handleWsMessage = useCallback((msg: WsMessage) => {
    const rawEvent = msg as unknown as Record<string, unknown>
    const incomingTopicId = String(rawEvent.topic_id || (rawEvent.message as { topic_id?: string } | undefined)?.topic_id || '')
    if (incomingTopicId && incomingTopicId !== topicId) return

    if (rawEvent.type === 'typing') {
      const state = String(rawEvent.state || 'start').toLowerCase()
      if (state === 'stop') return
      const agentId = String(rawEvent.agent_id || selectedAgentId || '')
      const agentName = String(rawEvent.agent_display_name || '') || agentId || undefined
      const ttlMsRaw = Number(rawEvent.ttl_ms || 0)
      const ttlMs = Number.isFinite(ttlMsRaw) && ttlMsRaw > 0 ? Math.max(ttlMsRaw, 30000) : undefined
      setTypingState((prev) => appendTypingStatus(prev, {
        agentId,
        agentName,
        statusText: statusTextFromTypingEvent(rawEvent),
        statusKind: statusKindFromTypingEvent(rawEvent),
        adapter: String(rawEvent.adapter || '').trim() || undefined,
        model: String(rawEvent.model || rawEvent.model_id || rawEvent.current_model || '').trim() || undefined,
        ttlMs,
      }, Date.now()))
      return
    }

    if (rawEvent.type === 'new_message' && rawEvent.message && typeof rawEvent.message === 'object') {
      const message = rawEvent.message as Record<string, unknown>
      const senderType = String(message.sender_type || '').toLowerCase()
      const senderId = String(message.sender_id || '')
      if (senderType === 'agent' || (!!selectedAgentId && senderId === selectedAgentId)) {
        setTypingState((prev) => completeTypingStatus(prev, senderId, String(message.created_at || '')))
      }
    }
  }, [selectedAgentId, topicId])

  const { state: wsState } = useWebSocket({
    url: selectedAgentId ? `${WS_BASE_URL}/ws/${selectedAgentId}?client=web` : '',
    enabled: !!selectedAgentId && !!token,
    token,
    onMessage: handleWsMessage,
  })

  const runStatus = useMemo<ChatRunStatus | null>(() => {
    if (!typingState) return null
    const lines = typingState.statusLines?.length
      ? typingState.statusLines
      : typingState.statusText
        ? [{ id: `${typingState.startedAt}-status`, text: typingState.statusText, kind: typingState.statusKind, ts: typingState.startedAt }]
        : []
    return {
      agentId: typingState.agentId,
      agentName: typingState.agentName || typingState.agentId || 'Agent',
      adapter: typingState.adapter,
      model: typingState.model,
      wsState,
      statusText: typingState.statusText || '等待 Agent 状态更新',
      statusKind: typingState.statusKind,
      startedAt: typingState.startedAt,
      lines,
    }
  }, [typingState, wsState])

  const refreshMessages = useCallback(async (agentId = selectedAgentId) => {
    if (!token || !agentId) return
    const loaded = await fetchStudioMessages(topicId, agentId, token)
    setMessages(loaded)
  }, [selectedAgentId, token, topicId])

  useEffect(() => {
    if (status === 'loading') return
    if (!token) {
      setLoading(false)
      return
    }
    let cancelled = false
    async function loadBase() {
      setLoading(true)
      setError('')
      try {
        const [cloud, agents, stats, billingState] = await Promise.all([
          fetchStudioCloudAgent(token),
          fetchStudioAgents(token).catch(() => []),
          fetchStudioAgentStats(token).catch(() => null),
          fetchStudioBilling(token).catch(() => null),
        ])
        if (cancelled) return
        setCloudAgentState(cloud)
        setAgentStats(stats)
        if (billingState) setBilling(billingState)
        const initialAgent = chooseStudioAgent(agents, stats, cloud)
        if (!initialAgent) {
          setLoading(false)
          return
        }
        let topics = await fetchStudioTopics(initialAgent, token).catch(async () => {
          const fallbackAgent = String(cloud.agent_id || '').trim()
          return fallbackAgent && fallbackAgent !== initialAgent ? fetchStudioTopics(fallbackAgent, token) : []
        })
        const fallbackAgent = String(cloud.agent_id || '').trim()
        if (fallbackAgent && fallbackAgent !== initialAgent && !topics.some((topic) => String(topic.topic_id || topic.id || '') === topicId)) {
          const fallbackTopics = await fetchStudioTopics(fallbackAgent, token).catch(() => [])
          const seen = new Set(topics.map((topic) => String(topic.topic_id || topic.id || '')))
          topics = [...topics, ...fallbackTopics.filter((topic) => !seen.has(String(topic.topic_id || topic.id || '')))]
        }
        if (cancelled) return
        const found = topics.map(projectFromTopic).filter(Boolean).find((item) => item?.topicId === topicId) || null
        const nextProject = found || {
          topicId,
          topicName: 'STUDIO: Untitled Site',
          title: studioTitleFromTopicName('Untitled Site'),
        }
        setProject(nextProject)
        setTypingState(null)
        const projectAgent = chooseProjectAgent(nextProject, agents, stats, cloud)
        setSelectedAgentId(projectAgent)
        if (!projectAgent) {
          setLoading(false)
          return
        }
        const loadedMessages = await fetchStudioMessages(topicId, projectAgent, token)
        if (!cancelled) setMessages(loadedMessages)
        setLoading(false)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load project')
          setLoading(false)
        }
      }
    }
    loadBase()
    return () => {
      cancelled = true
    }
  }, [status, token, topicId])

  useEffect(() => {
    if (!token || !selectedAgentId) return
    const timer = window.setInterval(async () => {
      try {
        const [stats, loaded, billingState] = await Promise.all([
          fetchStudioAgentStats(token).catch(() => null),
          fetchStudioMessages(topicId, selectedAgentId, token),
          fetchStudioBilling(token).catch(() => null),
        ])
        if (stats) setAgentStats(stats)
        setMessages(loaded)
        if (billingState) setBilling(billingState)
      } catch {
        // Keep Studio usable during transient backend or sandbox wake delays.
      }
    }, sending ? 2500 : 30000)
    return () => window.clearInterval(timer)
  }, [selectedAgentId, sending, token, topicId])

  async function connectorContext() {
    if (!token) return ''
    return fetchStudioConnectorPromptContext(topicId, token)
      .then((data) => data.prompt_context)
      .catch(() => '')
  }

  async function submitPrompt(content: string, action: string, replyTo?: string, options?: ChatSendOptions, displayContent?: string) {
    if (!token || !selectedAgentId || sending || !content.trim()) return
    setSending(true)
    setError('')
    try {
      const payload = content.trim()
      await sendStudioMessage(topicId, selectedAgentId, payload, token, {
        studio_action: action,
        studio_topic_id: topicId,
        reply_to: replyTo,
        display_content: displayContent?.trim() || content.trim(),
        ...(options?.slashType ? { slash_type: options.slashType, slash_command: options.slashCommand || content } : {}),
      })
      await refreshMessages(selectedAgentId)
      const billingState = await fetchStudioBilling(token).catch(() => null)
      if (billingState) setBilling(billingState)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message')
    } finally {
      setSending(false)
    }
  }

  const handleChatSend = async (content: string, replyTo?: string, options?: ChatSendOptions) => {
    if (options?.slashType === 'agent_passthrough' && content.trim().startsWith('/')) {
      await submitPrompt(content, 'slash', replyTo, options, content)
      return
    }
    await submitPrompt(buildFollowupStudioPrompt(topicId, content, await connectorContext()), 'followup', replyTo, options, content)
  }

  if (status === 'loading' || loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f6f1e8] text-slate-950 dark:bg-[#0c1117] dark:text-white">
        <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
          <Loader2 className="h-5 w-5 animate-spin text-cyan-600 dark:text-cyan-200" />
          {copy.loading}
        </div>
      </main>
    )
  }

  if (!token) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f6f1e8] px-4 text-slate-950 dark:bg-[#0c1117] dark:text-white">
        <div className="max-w-md rounded-3xl border border-slate-200 bg-white/80 p-6 text-center shadow-xl dark:border-white/10 dark:bg-white/[0.06]">
          <Sparkles className="mx-auto h-8 w-8 text-cyan-600 dark:text-cyan-200" />
          <h1 className="mt-4 text-2xl font-semibold">{copy.signInTitle}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{copy.signInDesc}</p>
          <Link href={`/login?callbackUrl=/studio/projects/${encodeURIComponent(topicId)}`} className="mt-5 inline-flex rounded-full bg-slate-950 px-5 py-3 text-sm font-bold text-white dark:bg-white dark:text-slate-950">
            {copy.signIn}
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className={`flex h-screen min-h-screen flex-col overflow-hidden bg-[#f6f1e8] text-slate-950 dark:bg-[#0b1117] dark:text-white ${fullscreenMode ? 'fixed inset-0 z-[90]' : ''}`}>
      <header className={`${fullscreenMode ? 'hidden' : 'flex'} h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white/85 px-4 backdrop-blur dark:border-white/10 dark:bg-[#0e151d]/95`}>
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/studio" className="rounded-full border border-slate-200 bg-white p-2 text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-transparent dark:text-slate-300 dark:hover:bg-white/10">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-950 dark:text-white">{enrichedProject.title}</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-500">
              {selectedAgentId ? `Agent ${selectedAgentId}${isSelectedOnline ? ` · ${copy.online}` : ` · ${copy.offline}`}` : copy.noAgent} · {studioWorkspace(topicId)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {enrichedProject.githubRepoUrl && (
            <a href={enrichedProject.githubRepoUrl} target="_blank" rel="noreferrer" className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-transparent dark:text-slate-200 dark:hover:bg-white/10 sm:inline-flex">
              <Github className="h-3.5 w-3.5" />
              {copy.github}
            </a>
          )}
          <button
            type="button"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="rounded-full border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-transparent dark:text-slate-300 dark:hover:bg-white/10"
            title={copy.themeTitle}
          >
            {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => setLocale(zh ? 'en' : 'zh')}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-transparent dark:text-slate-300 dark:hover:bg-white/10"
            title={copy.langTitle}
          >
            <Languages className="h-3.5 w-3.5" />
            {zh ? '中' : 'EN'}
          </button>
          <button
            type="button"
            onClick={() => setConnectorsOpen(true)}
            className="inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-700 hover:bg-cyan-100 dark:border-cyan-200/20 dark:bg-transparent dark:text-cyan-100 dark:hover:bg-cyan-200/10"
          >
            <PlugZap className="h-3.5 w-3.5" />
            {copy.connectors}
          </button>
        </div>
      </header>

      <div
        className="flex min-h-0 flex-1 flex-col lg:flex-row"
        style={{ '--studio-chat-width': `${chatPaneWidth}%` } as CSSProperties}
      >
        <section className={[
          'min-h-0 overflow-hidden bg-[#fbfaf7] text-slate-950 dark:bg-[#111315] dark:text-white',
          chatFullscreen ? 'flex-1 border-r-0' : '',
          previewFullscreen ? 'hidden' : '',
          !fullscreenMode ? 'border-r border-white/10 lg:basis-[var(--studio-chat-width)] lg:shrink-0' : '',
        ].filter(Boolean).join(' ')}>
          {error && <p className="m-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">{error}</p>}
          <ChatView
            topicName={enrichedProject.title}
            topicId={topicId}
            messages={chatMessages}
            currentAgentId={selectedAgentId}
            onSendMessage={handleChatSend}
            loading={loading && chatMessages.length === 0}
            wsConnected={wsState === 'connected' || isSelectedOnline}
            accessToken={token}
            topicType="p2p"
            runStatus={runStatus}
            compactUi
            enableCameraCapture
            currentAgentIsCloud
            cloudSandboxBilling={selectedAgentId ? {
              ...((cloudAgentState as { sandbox_billing?: Record<string, unknown> } | null)?.sandbox_billing || {}),
              cloud_agent_usage: billing?.cloud_agent_usage,
              entitlement: billing?.entitlement,
            } : null}
            workspaceAgentName={selectedAgentId || undefined}
            workspaceWorkdir={studioWorkspace(topicId)}
            currentAgentRuntime={{
              adapter: selectedRuntime?.adapter || 'cloud-agent',
              model: selectedRuntime?.current_model || selectedRuntime?.model_id || selectedRuntime?.model || 'studio-agent',
              reasoning_effort: selectedRuntime?.reasoning_effort || 'medium',
            }}
            agentRoleLabelMap={selectedAgentId ? { [selectedAgentId]: 'WTT Studio Agent' } : {}}
            emptyState={(
              <div className="mx-auto max-w-xl rounded-3xl border border-dashed border-cyan-300/40 bg-cyan-50 p-5 text-left dark:border-cyan-300/20 dark:bg-cyan-950/20">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-700 dark:text-cyan-200">{copy.emptyEyebrow}</p>
                <h2 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">{copy.emptyTitle}</h2>
                <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{copy.emptyDesc}</p>
              </div>
            )}
            extraHeaderActions={(
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={async () => submitPrompt(buildPreviewPrompt(topicId, await connectorContext()), 'preview', undefined, undefined, '生成或刷新预览链接')}
                  disabled={sending || !selectedAgentId}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-black text-slate-600 hover:border-cyan-300 disabled:opacity-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {copy.preview}
                </button>
                <button
                  type="button"
                  onClick={async () => submitPrompt(buildGithubPrompt(topicId, enrichedProject.title, await connectorContext()), 'github', undefined, undefined, '提交当前网站到 GitHub')}
                  disabled={sending || !selectedAgentId}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-black text-slate-600 hover:border-cyan-300 disabled:opacity-50"
                >
                  <Github className="h-3.5 w-3.5" />
                  {copy.github}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPreviewFullscreen(false)
                    setChatFullscreen((value) => !value)
                  }}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-black text-slate-600 hover:border-cyan-300"
                  title={chatFullscreen ? copy.chatExit : copy.chatMax}
                >
                  {chatFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                  {chatFullscreen ? copy.exit : copy.max}
                </button>
              </div>
            )}
          />
        </section>

        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize chat and preview panes"
          title={copy.resize}
          onPointerDown={startPaneResize}
          className={`${fullscreenMode ? 'hidden' : 'hidden lg:flex'} w-2 shrink-0 cursor-col-resize items-center justify-center border-x border-slate-200 bg-slate-100 transition hover:bg-cyan-100 dark:border-white/10 dark:bg-[#0d141b] dark:hover:bg-cyan-300/15`}
        >
          <span className="h-12 w-0.5 rounded-full bg-slate-400/50 dark:bg-white/25" />
        </div>

        <section className={[
          'min-h-0 flex-1 flex-col bg-slate-100 dark:bg-[#070b10]',
          chatFullscreen ? 'hidden' : '',
          previewFullscreen ? 'flex' : 'hidden lg:flex',
        ].filter(Boolean).join(' ')}>
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white/80 px-4 dark:border-white/10 dark:bg-transparent">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-emerald-100 p-2 text-emerald-700 dark:bg-emerald-300/10 dark:text-emerald-100">
                <Globe2 className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-950 dark:text-white">{copy.livePreview}</p>
                <p className="text-xs text-slate-500">{enrichedProject.previewUrl ? copy.previewReady : copy.previewWaiting}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDevice(device === 'desktop' ? 'mobile' : 'desktop')}
                className="rounded-full border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-transparent dark:text-slate-300 dark:hover:bg-white/10"
              >
                {device === 'desktop' ? <Monitor className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
              </button>
              {enrichedProject.previewUrl && (
                <a href={enrichedProject.previewUrl} target="_blank" rel="noreferrer" className="rounded-full border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-transparent dark:text-slate-300 dark:hover:bg-white/10">
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
              <button
                type="button"
                onClick={() => {
                  setChatFullscreen(false)
                  setPreviewFullscreen((value) => !value)
                }}
                className="rounded-full border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-transparent dark:text-slate-300 dark:hover:bg-white/10"
                title={previewFullscreen ? copy.previewExit : copy.previewMax}
              >
                {previewFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className={`grid min-h-0 flex-1 place-items-center overflow-auto ${previewFullscreen ? 'p-2' : 'p-5'}`}>
            {enrichedProject.previewUrl ? (
              <div className={device === 'mobile' ? 'h-full w-[390px] max-w-full' : 'h-full w-full'}>
                <iframe
                  key={enrichedProject.previewUrl}
                  src={enrichedProject.previewUrl}
                  className={[
                    'h-full w-full bg-white shadow-2xl',
                    previewFullscreen ? 'min-h-0 rounded-xl border border-white/10' : 'min-h-[720px] rounded-[1.6rem] border border-white/10',
                  ].join(' ')}
                  title={`${enrichedProject.title} preview`}
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
                />
              </div>
            ) : (
              <div className="max-w-md rounded-[2rem] border border-slate-200 bg-white/80 p-8 text-center dark:border-white/10 dark:bg-white/[0.04]">
                <Globe2 className="mx-auto h-10 w-10 text-cyan-600 dark:text-cyan-200" />
                <h2 className="mt-4 text-2xl font-semibold tracking-[-0.04em] text-slate-950 dark:text-white">{copy.noPreview}</h2>
                <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-400">{copy.noPreviewDesc}</p>
                <button
                  type="button"
                  onClick={async () => submitPrompt(buildPreviewPrompt(topicId, await connectorContext()), 'preview', undefined, undefined, '生成或刷新预览链接')}
                  disabled={sending || !selectedAgentId}
                  className="mt-5 inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-bold text-white disabled:opacity-50 dark:bg-white dark:text-slate-950"
                >
                  <RefreshCw className="h-4 w-4" />
                  {copy.requestPreview}
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
      {token && (
        <StudioConnectorsPanel
          open={connectorsOpen}
          token={token}
          projectTopicId={topicId}
          onClose={() => setConnectorsOpen(false)}
        />
      )}
    </main>
  )
}
