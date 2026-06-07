'use client'

import { signOut, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Suspense, useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import {
  Activity,
  ArrowRight,
  Bot,
  Clock3,
  Cpu,
  Gauge,
  GitBranch,
  MessageCircle,
  Network,
  Radio,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'
import { normalizeAndFilterAgents, type NormalizedAgent } from '@/lib/agents'
import { buildAgentUrl, useAgentId } from '@/lib/hooks/use-agent-id'
import { WttShellV2 } from '@/components/ui/wtt-shell-v2'
import type { AgentSubAgentMap, AgentStatsMap } from '@/components/ui/agent-column'
import type { AgentRuntimeInfo, TopicItem } from '@/components/ui/topic-column'

type TaskStatus = 'todo' | 'running' | 'in_progress' | 'doing' | 'review' | 'done' | 'blocked' | string

interface TaskItem {
  id: string
  title?: string
  description?: string
  task_type?: string
  status?: TaskStatus
  owner_agent_id?: string
  runner_agent_id?: string
  topic_id?: string
  created_at?: string
  started_at?: string
  completed_at?: string
  updated_at?: string
  usage_total_tokens?: number
}

interface TokenStat {
  total_chars?: number
  estimated_tokens?: number
  message_count?: number
  exact_tokens?: number
}

interface RawTopicRecord {
  id?: string
  topic_id?: string
  name?: string
  type?: string
  topic_type?: string
  unread_count?: number
  my_role?: string
  task_id?: string
  task_type?: string
  task_mode?: string
  exec_mode?: string
  runner_agent_id?: string
  last_activity_at?: string
  description?: string
  creator_agent_id?: string
  member_agent_ids?: unknown[]
}

interface ChatMessage {
  id: string
  sender_id: string
  sender_type: string
  content: string
  created_at: string
}

interface HostGroup {
  id: string
  label: string
  subtitle: string
  color: string
  agents: NormalizedAgent[]
  online: number
  total: number
  busy: number
  idle: number
  tasks: TaskItem[]
  runningTasks: TaskItem[]
  tokenTotal: number
  executionMs: number
  runtimeCount: number
}

const HOST_COLORS = [
  'from-sky-400 via-cyan-300 to-blue-500',
  'from-emerald-400 via-teal-300 to-cyan-500',
  'from-amber-400 via-orange-300 to-rose-400',
  'from-fuchsia-400 via-violet-400 to-indigo-500',
  'from-lime-400 via-emerald-300 to-green-500',
  'from-slate-500 via-slate-400 to-zinc-600',
]

const EXECUTING_STATUSES = new Set(['running', 'in_progress', 'doing', 'executing', 'active'])

function authHeaders(token?: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function fetchJson<T>(url: string, token: string | undefined, fallback: T): Promise<T> {
  const response = await fetch(url, {
    headers: authHeaders(token),
    cache: 'no-store',
  })
  if (!response.ok) return fallback
  return response.json() as Promise<T>
}

function toMs(value?: string) {
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : null
}

function formatDuration(ms: number) {
  const minutes = Math.max(0, Math.round(ms / 60000))
  if (minutes >= 60 * 24) return `${Math.floor(minutes / 1440)}d ${Math.floor((minutes % 1440) / 60)}h`
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
  return `${minutes}m`
}

function formatTokens(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return String(Math.max(0, Math.round(value)))
}

function formatRelative(value?: string) {
  const ms = toMs(value)
  if (!ms) return '暂无活动'
  const delta = Math.max(0, Date.now() - ms)
  const minutes = Math.floor(delta / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}小时前`
  return `${Math.floor(hours / 24)}天前`
}

function shortId(id: string) {
  if (!id) return ''
  if (id.length <= 14) return id
  return `${id.slice(0, 8)}…${id.slice(-4)}`
}

function cleanHostLabel(value?: string) {
  const raw = String(value || '').trim()
  if (!raw || raw.toLowerCase() === 'unknown') return ''
  // Normalise macOS hostnames (strip .local suffix, lowercase)
  return raw.replace(/\.local$/i, '').toLowerCase()
}

function isCloudRuntime(runtime?: AgentRuntimeInfo) {
  const provider = String(runtime?.provider || '').toLowerCase()
  const hostname = String(runtime?.hostname || '').toLowerCase()
  return provider.includes('cloudflare') || provider.includes('sandbox') || hostname.includes('cloudchamber')
}

function hostKeyForAgent(agent: NormalizedAgent, runtime?: AgentRuntimeInfo) {
  // 1. Cloud sandbox agents: always group by cloud_host_agent_id.
  //    The API guarantees this field for all agents inside a sandbox,
  //    including child/clone agents created via cloud_sandbox_clone.
  if (agent.is_cloud_sandbox || agent.cloud_host_agent_id) {
    const sandboxHost = cleanHostLabel(agent.cloud_host_agent_id) || 'cloud-sandbox'
    return sandboxHost
  }

  // 2. Self-hosted agents: group by runtime hostname (normalised).
  const hostname = cleanHostLabel(runtime?.hostname)
  if (hostname) return hostname

  // 3. No runtime available — group all offline self-hosted agents together.
  return 'other-self-hosted'
}

function hostLabelForKey(key: string, runtime?: AgentRuntimeInfo, hostAgents?: NormalizedAgent[]) {
  if (key === 'cloud-sandbox') return 'Cloud Sandbox'
  if (key === 'unknown-host' || key === 'other-self-hosted') return 'Other Agents'

  // For self-hosted: if we have a hostname-based key, capitalise nicely
  if (hostAgents) {
    const cloudAgent = hostAgents.find((a) => a.is_cloud_sandbox)
    if (cloudAgent && cloudAgent.display_name) return cloudAgent.display_name
  }
  if (isCloudRuntime(runtime)) return 'Cloud Sandbox'

  // Pretty-print hostnames
  if (/^agent-[a-f0-9]+$/.test(key)) return cloudLabelForHostKey(key, hostAgents)
  return key
}

/** Derive a stable display name for a cloud sandbox host key. */
function cloudLabelForHostKey(key: string, hostAgents?: NormalizedAgent[]) {
  if (hostAgents) {
    const host = hostAgents.find((a) => a.agent_id === key)
    if (host) return host.display_name || 'Cloud Sandbox'
    // If key is a sandbox host agent, try to find any child agent that references it
    for (const a of hostAgents) {
      if (a.cloud_host_agent_id === key) return a.display_name || 'Cloud Sandbox'
    }
  }
  return 'Cloud Sandbox'
}

function topicType(raw?: string): TopicItem['topic_type'] {
  const value = String(raw || 'discussion').toLowerCase()
  if (value === 'broadcast' || value === 'p2p' || value === 'collaborative') return value
  return 'discussion'
}

function mapRawTopicToItem(topic: RawTopicRecord): TopicItem {
  const topicId = String(topic.id || topic.topic_id || '').trim()
  return {
    topic_id: topicId,
    name: String(topic.name || topicId || 'Topic'),
    topic_type: topicType(topic.type || topic.topic_type),
    unread_count: Number(topic.unread_count || 0),
    can_delete: topic.my_role === 'owner' || topic.my_role === 'admin',
    task_id: topic.task_id,
    task_type: topic.task_type,
    task_mode: topic.task_mode,
    exec_mode: topic.exec_mode,
    runner_agent_id: topic.runner_agent_id,
    last_activity_at: topic.last_activity_at || '',
    description: topic.description,
    creator_agent_id: topic.creator_agent_id,
    member_agent_ids: Array.isArray(topic.member_agent_ids) ? topic.member_agent_ids.map(String).filter(Boolean) : undefined,
  }
}

function isDiscussionGroupTopic(topic: TopicItem) {
  const name = String(topic.name || '').trim()
  const description = String(topic.description || '').toLowerCase()
  if (!['discussion', 'collaborative'].includes(topic.topic_type)) return false
  if (topic.task_id || topic.task_type || topic.task_mode || topic.exec_mode || topic.runner_agent_id) return false
  if (/^TASK-[a-f0-9]{8}\b/i.test(name)) return false
  if (description.includes('general task') || description.includes('task_id') || description.includes('task type')) return false
  return true
}

function taskAgentId(task: TaskItem) {
  return task.runner_agent_id || task.owner_agent_id || ''
}

function isRunningTask(task: TaskItem) {
  const status = String(task.status || '').toLowerCase()
  // 'review' means the agent output is waiting for human review — agent is idle
  if (status === 'review') return false
  return EXECUTING_STATUSES.has(status)
}

/** Track agent typing state: typing within 90s → busy. */
function agentIsTyping(agentId: string, runtimeMap: Record<string, AgentRuntimeInfo>): boolean {
  const rt = runtimeMap[agentId]
  if (!rt?.typing_at) return false
  return Date.now() / 1000 - Number(rt.typing_at) < 90
}

function taskDurationMs(task: TaskItem) {
  const start = toMs(task.started_at)
  const end = toMs(task.completed_at)
  if (!start || !end) return 0
  return Math.max(0, end - start)
}

function pointsForSparkline(seed: string, activeScore: number) {
  let hash = 0
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) % 9973
  return Array.from({ length: 14 }, (_, index) => {
    const wave = Math.sin((hash + index * 37) / 19) * 11
    const lift = Math.min(34, activeScore * 3)
    const y = Math.max(8, Math.min(46, 42 - lift - wave))
    return `${index * 12},${y.toFixed(1)}`
  }).join(' ')
}

function newestTimestamp(tasks: TaskItem[], topics: TopicItem[]) {
  const values = [
    ...tasks.map((task) => toMs(task.updated_at || task.completed_at || task.started_at || task.created_at) || 0),
    ...topics.map((topic) => toMs(topic.last_activity_at) || 0),
  ]
  return Math.max(0, ...values)
}

function initialHostId(hosts: HostGroup[], selected: string) {
  if (selected && hosts.some((host) => host.id === selected)) return selected
  return hosts[0]?.id || ''
}

export default function TasksPageWrapper() {
  return (
    <Suspense fallback={null}>
      <TasksPageInner />
    </Suspense>
  )
}

function TasksPageInner() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [selectedAgentId, setSelectedAgentId] = useAgentId()
  const [selectedHostId, setSelectedHostId] = useState('')
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const token = session?.accessToken as string | undefined

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [router, status])

  const { data: agents = [], mutate: mutateAgents } = useSWR(
    token ? ['tasks-agents', token] : null,
    async () => normalizeAndFilterAgents(await fetchJson<unknown>(`${CLIENT_WTT_API_BASE}/agents/my`, token, [])),
    { refreshInterval: 30_000, revalidateOnFocus: true, dedupingInterval: 5_000 },
  )

  const { data: statsData = null, mutate: mutateStats } = useSWR(
    token ? ['tasks-agent-stats', token] : null,
    async () => fetchJson<Record<string, unknown> | null>(`${CLIENT_WTT_API_BASE}/agents/stats`, token, null),
    { refreshInterval: 10_000, revalidateOnFocus: true, dedupingInterval: 3_000 },
  )

  const { data: tasks = [], mutate: mutateTasks } = useSWR(
    token ? ['tasks-runtime-map-tasks', token] : null,
    async () => fetchJson<TaskItem[]>(`${CLIENT_WTT_API_BASE}/tasks?limit=500`, token, []),
    { refreshInterval: 15_000, revalidateOnFocus: true, dedupingInterval: 5_000 },
  )

  const { data: tokenStatsRaw = {} } = useSWR(
    token ? ['tasks-runtime-map-token-stats', token] : null,
    async () => fetchJson<Record<string, TokenStat>>(`${CLIENT_WTT_API_BASE}/tasks/token-stats`, token, {}),
    { refreshInterval: 30_000, revalidateOnFocus: true, dedupingInterval: 10_000 },
  )

  const { data: groupsRaw = [], mutate: mutateGroups } = useSWR(
    token ? ['tasks-my-groups', token] : null,
    async () => fetchJson<RawTopicRecord[]>(`${CLIENT_WTT_API_BASE}/topics/my-groups`, token, []),
    { refreshInterval: 30_000, revalidateOnFocus: true, dedupingInterval: 5_000 },
  )

  const { data: billingRaw = null } = useSWR(
    token ? ['tasks-billing', token] : null,
    async () => fetchJson<Record<string, unknown> | null>(`${CLIENT_WTT_API_BASE}/billing/me`, token, null),
    { refreshInterval: 60_000, dedupingInterval: 20_000 },
  )

  const agentRuntimeMap = useMemo(
    () => ((statsData?.runtimes || {}) as Record<string, AgentRuntimeInfo>),
    [statsData],
  )

  const onlineAgentIds = useMemo(() => {
    const ids = new Set<string>(Array.isArray(statsData?.online_agents) ? (statsData?.online_agents as string[]) : [])
    for (const [agentId, runtime] of Object.entries(agentRuntimeMap)) {
      if (typeof runtime.last_heartbeat_secs_ago === 'number' && runtime.last_heartbeat_secs_ago <= 90) {
        ids.add(agentId)
      }
    }
    return ids
  }, [agentRuntimeMap, statsData])

  const groupTopics = useMemo(
    () => groupsRaw.map(mapRawTopicToItem).filter(isDiscussionGroupTopic),
    [groupsRaw],
  )

  useEffect(() => {
    if (!selectedAgentId && agents[0]?.agent_id) setSelectedAgentId(agents[0].agent_id)
  }, [agents, selectedAgentId, setSelectedAgentId])

  useEffect(() => {
    if (!selectedGroupId && groupTopics[0]?.topic_id) setSelectedGroupId(groupTopics[0].topic_id)
  }, [groupTopics, selectedGroupId])

  const agentTasks = useMemo(() => {
    const map: Record<string, TaskItem[]> = {}
    for (const task of tasks) {
      const agentId = taskAgentId(task)
      if (!agentId) continue
      if (!map[agentId]) map[agentId] = []
      map[agentId].push(task)
    }
    return map
  }, [tasks])

  const agentSubAgents = useMemo<AgentSubAgentMap>(() => {
    const map: AgentSubAgentMap = {}
    for (const [agentId, rows] of Object.entries(agentTasks)) {
      map[agentId] = rows.slice(0, 12).map((task) => ({
        id: task.id,
        title: task.title || task.id,
        task_type: task.task_type || 'general',
        status: task.status || 'todo',
      }))
    }
    return map
  }, [agentTasks])

  const agentStats = useMemo<AgentStatsMap>(() => {
    const raw = (statsData?.agents || {}) as AgentStatsMap
    return raw || {}
  }, [statsData])

  const hostGroups = useMemo<HostGroup[]>(() => {
    const map = new Map<string, HostGroup>()

    agents.forEach((agent) => {
      const runtime = agentRuntimeMap[agent.agent_id]
      const key = hostKeyForAgent(agent, runtime)
      if (!map.has(key)) {
        const color = HOST_COLORS[map.size % HOST_COLORS.length]
        map.set(key, {
          id: key,
          label: hostLabelForKey(key, runtime),
          subtitle: isCloudRuntime(runtime) || agent.is_cloud_sandbox ? 'Cloud Sandbox Host' : 'Self-hosted Runtime',
          color,
          agents: [],
          online: 0,
          total: 0,
          busy: 0,
          idle: 0,
          tasks: [],
          runningTasks: [],
          tokenTotal: 0,
          executionMs: 0,
          runtimeCount: 0,
        })
      }
      const host = map.get(key)
      if (!host) return
      host.agents.push(agent)
    })

    for (const host of Array.from(map.values())) {
      const hostAgentIds = new Set(host.agents.map((agent) => agent.agent_id))
      const hostTasks = tasks.filter((task) => hostAgentIds.has(taskAgentId(task)))
      const runningTasks = hostTasks.filter(isRunningTask)
      host.total = host.agents.length
      host.online = host.agents.filter((agent) => onlineAgentIds.has(agent.agent_id)).length
      host.busy = host.agents.filter((agent) => agentIsTyping(agent.agent_id, agentRuntimeMap)).length
      host.idle = Math.max(0, host.online - host.busy)
      host.tasks = hostTasks
      host.runningTasks = runningTasks
      host.tokenTotal = host.agents.reduce((sum, agent) => {
        const stat = agentStats[agent.agent_id]
        return sum + (stat?.total || 0)
      }, 0)
      host.executionMs = hostTasks.reduce((sum, task) => sum + taskDurationMs(task), 0)
      host.runtimeCount = host.agents.filter((agent) => Boolean(agentRuntimeMap[agent.agent_id])).length
    }

    const unknownAgents = agents.filter((agent) => !map.has(hostKeyForAgent(agent, agentRuntimeMap[agent.agent_id])))
    if (unknownAgents.length) {
      const color = HOST_COLORS[map.size % HOST_COLORS.length]
      map.set('unknown-host', {
        id: 'unknown-host',
        label: 'Unknown Host',
        subtitle: 'Last known runtime unavailable',
        color,
        agents: unknownAgents,
        online: 0,
        total: unknownAgents.length,
        busy: 0,
        idle: 0,
        tasks: [],
        runningTasks: [],
        tokenTotal: 0,
        executionMs: 0,
        runtimeCount: 0,
      })
    }

    return Array.from(map.values()).sort((a, b) => {
      if (a.online !== b.online) return b.online - a.online
      if (a.busy !== b.busy) return b.busy - a.busy
      return a.label.localeCompare(b.label)
    })
  }, [agentRuntimeMap, agentTasks, agents, onlineAgentIds, tasks, tokenStatsRaw])

  useEffect(() => {
    setSelectedHostId((current) => initialHostId(hostGroups, current))
  }, [hostGroups])

  const selectedHost = useMemo(
    () => hostGroups.find((host) => host.id === selectedHostId) || hostGroups[0],
    [hostGroups, selectedHostId],
  )

  const selectedGroup = useMemo(
    () => groupTopics.find((topic) => topic.topic_id === selectedGroupId) || groupTopics[0],
    [groupTopics, selectedGroupId],
  )

  const selectedGroupAgent = selectedGroup?.member_agent_ids?.find((agentId) => agents.some((agent) => agent.agent_id === agentId))
    || selectedAgentId
    || agents[0]?.agent_id
    || ''

  const { data: selectedGroupMessagesRaw = [] } = useSWR(
    token && selectedGroup?.topic_id
      ? ['tasks-group-messages', selectedGroup.topic_id, selectedGroupAgent, token]
      : null,
    async () => {
      const agentQuery = selectedGroupAgent ? `?limit=8&agent_id=${encodeURIComponent(selectedGroupAgent)}` : '?limit=8'
      const data = await fetchJson<unknown>(`${CLIENT_WTT_API_BASE}/topics/${selectedGroup?.topic_id}/messages${agentQuery}`, token, [])
      if (Array.isArray(data)) return data as ChatMessage[]
      const messages = (data as { messages?: unknown[] })?.messages
      return Array.isArray(messages) ? messages as ChatMessage[] : []
    },
    { refreshInterval: 12_000, revalidateOnFocus: true, dedupingInterval: 4_000 },
  )

  const totalTokens = hostGroups.reduce((sum, host) => sum + host.tokenTotal, 0)
  const totalExecutionMs = hostGroups.reduce((sum, host) => sum + host.executionMs, 0)
  const activeHosts = hostGroups.filter((host) => host.online > 0).length
  const newestActivity = newestTimestamp(tasks, groupTopics)
  const planLabel = String(((billingRaw?.entitlement as Record<string, unknown> | undefined)?.plan || 'free')).toLowerCase() === 'pro' ? 'Pro' : 'Free'

  const refreshAll = async () => {
    await Promise.allSettled([
      mutateAgents(),
      mutateStats(),
      mutateTasks(),
      mutateGroups(),
    ])
  }

  const openAgent = (agentId: string) => {
    setSelectedAgentId(agentId)
    // Navigate to the feed page which will auto-create and auto-select
    // the default P2P topic for this agent, opening directly into chat.
    router.push(buildAgentUrl('/feed', agentId))
  }

  const openGroup = (topic: TopicItem) => {
    const agentId = topic.member_agent_ids?.find((id) => agents.some((agent) => agent.agent_id === id)) || selectedAgentId
    router.push(buildAgentUrl('/feed', agentId, { topicId: topic.topic_id }))
  }

  if (status === 'loading') {
    return <div className="h-[100dvh] bg-[#fbfaf7] dark:bg-zinc-950" />
  }

  const shellAgents = agents.map((agent) => ({
    agent_id: agent.agent_id,
    display_name: agent.display_name,
    unread_count: 0,
    binding_method: agent.binding_method,
    bound_via: agent.bound_via,
    is_cloud_sandbox: agent.is_cloud_sandbox,
    cloud_host_agent_id: agent.cloud_host_agent_id,
  }))

  return (
    <WttShellV2
      agents={shellAgents}
      selectedAgentId={selectedAgentId}
      onAgentChange={openAgent}
      topics={[]}
      groupTopics={groupTopics}
      selectedTopicId={null}
      onTopicChange={(topicId) => {
        if (!topicId) return
        const topic = groupTopics.find((item) => item.topic_id === topicId)
        if (topic) openGroup(topic)
      }}
      onLogout={() => signOut({ callbackUrl: '/login' })}
      onTopicsRefresh={refreshAll}
      currentUserName={session?.user?.name || session?.user?.email || 'user'}
      agentSubAgents={agentSubAgents}
      agentStats={agentStats}
      onlineAgentIds={onlineAgentIds}
      agentRuntimeMap={agentRuntimeMap}
      userToken={token}
      planLabel={planLabel}
      hideTopics
      hideCreateTopic
    >
      <div className="runtime-map min-h-full overflow-hidden bg-[#f5efe4] text-slate-900 dark:bg-[#090b10] dark:text-zinc-100">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="runtime-orb runtime-orb-a" />
          <div className="runtime-orb runtime-orb-b" />
          <div className="runtime-grid" />
        </div>

        <div className="relative z-10 mx-auto flex min-h-full max-w-[1680px] flex-col gap-5 p-4 md:p-6">
          <header className="overflow-hidden rounded-[28px] border border-white/70 bg-white/70 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/72">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-4xl">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.22em] text-sky-700 dark:border-sky-700/60 dark:bg-sky-950/40 dark:text-sky-200">
                  <Network className="h-3.5 w-3.5" />
                  WTT Runtime Map
                </div>
                <h1 className="text-3xl font-black tracking-tight text-slate-950 dark:text-white md:text-5xl">
                  分布式 Agent Fabric 任务视图
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 dark:text-zinc-300">
                  按主机、团队/群聊、Token 与执行时长聚合当前 WTT 工作负载。这里用于观察运行态和快速跳转，真正对话仍在 Feed Chat 中完成。
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[560px]">
                <MetricCard icon={<Radio className="h-4 w-4" />} label="在线主机" value={`${activeHosts}/${hostGroups.length}`} tone="sky" />
                <MetricCard icon={<Bot className="h-4 w-4" />} label="Agent" value={`${onlineAgentIds.size}/${agents.length}`} tone="emerald" />
                <MetricCard icon={<Zap className="h-4 w-4" />} label="Token" value={formatTokens(totalTokens)} tone="amber" />
                <MetricCard icon={<Clock3 className="h-4 w-4" />} label="执行时长" value={formatDuration(totalExecutionMs)} tone="violet" />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-zinc-400">
              <span>最近活动：{newestActivity ? formatRelative(new Date(newestActivity).toISOString()) : '暂无'}</span>
              <button
                onClick={refreshAll}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-600 shadow-sm transition hover:border-sky-300 hover:text-sky-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
              >
                刷新运行图
              </button>
            </div>
          </header>

          <main className="grid min-h-0 flex-1 gap-5 xl:grid-cols-[minmax(360px,1.08fr)_minmax(420px,1fr)] 2xl:grid-cols-[minmax(520px,1.12fr)_minmax(520px,0.88fr)]">
            <section className="min-h-0 rounded-[28px] border border-white/70 bg-white/75 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.10)] backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/72">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black">Host Fabric</h2>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">第一维度：按运行主机聚合 Agent 状态</p>
                </div>
                <Gauge className="h-5 w-5 text-sky-500" />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {hostGroups.length === 0 && (
                  <div className="col-span-full rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-zinc-700 dark:text-zinc-400">
                    暂无绑定 Agent。请先在 Feed 左侧绑定已有 Agent 或新建云端 Agent。
                  </div>
                )}
                {hostGroups.map((host) => (
                  <button
                    key={host.id}
                    onClick={() => setSelectedHostId(host.id)}
                    className={`group relative overflow-hidden rounded-3xl border p-4 text-left shadow-sm transition duration-300 hover:-translate-y-0.5 hover:shadow-xl ${
                      selectedHost?.id === host.id
                        ? 'border-sky-300 bg-sky-50/80 ring-2 ring-sky-200 dark:border-sky-500/60 dark:bg-sky-950/25 dark:ring-sky-500/20'
                        : 'border-slate-200 bg-white/78 hover:border-slate-300 dark:border-zinc-800 dark:bg-zinc-950/45 dark:hover:border-zinc-700'
                    }`}
                  >
                    <div className={`absolute -right-10 -top-12 h-32 w-32 rounded-full bg-gradient-to-br ${host.color} opacity-20 blur-2xl transition group-hover:opacity-35`} />
                    <div className="relative flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${host.color} text-white shadow-lg shadow-slate-300/40 dark:shadow-black/30`}>
                            <Cpu className="h-5 w-5" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black" title={host.label}>{host.label}</p>
                            <p className="truncate text-[11px] text-slate-500 dark:text-zinc-400">{host.subtitle}</p>
                          </div>
                        </div>
                      </div>
                      <span className="rounded-full bg-slate-950 px-2 py-1 text-[10px] font-black text-white dark:bg-white dark:text-zinc-950">
                        {host.online}/{host.total}
                      </span>
                    </div>

                    <svg viewBox="0 0 156 54" className="mt-4 h-14 w-full overflow-visible">
                      <polyline
                        points={pointsForSparkline(host.id, host.online + host.busy + host.runningTasks.length)}
                        fill="none"
                        stroke="url(#hostLine)"
                        strokeWidth="4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <defs>
                        <linearGradient id="hostLine" x1="0" x2="156" y1="0" y2="0">
                          <stop stopColor="#38bdf8" />
                          <stop offset="0.55" stopColor="#22c55e" />
                          <stop offset="1" stopColor="#f59e0b" />
                        </linearGradient>
                      </defs>
                    </svg>

                    <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                      <MiniStat label="在线" value={host.online} />
                      <MiniStat label="空闲" value={host.idle} />
                      <MiniStat label="执行" value={host.busy} />
                      <MiniStat label="任务" value={host.tasks.length} />
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <section className="grid min-h-0 gap-5 lg:grid-rows-[minmax(300px,0.95fr)_minmax(280px,1.05fr)]">
              <div className="min-h-0 rounded-[28px] border border-white/70 bg-white/75 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.10)] backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/72">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-black">{selectedHost?.label || 'Host Detail'}</h2>
                    <p className="text-xs text-slate-500 dark:text-zinc-400">Agent 状态、空闲/执行态、模型与工作目录</p>
                  </div>
                  <Activity className="h-5 w-5 text-emerald-500" />
                </div>

                <div className="grid max-h-[42vh] gap-2 overflow-y-auto pr-1 md:grid-cols-2">
                  {(selectedHost?.agents || []).map((agent) => {
                    const runtime = agentRuntimeMap[agent.agent_id]
                    const typing = agentIsTyping(agent.agent_id, agentRuntimeMap)
                    const online = onlineAgentIds.has(agent.agent_id)
                    const model = runtime?.current_model || runtime?.model_id || runtime?.model || ''
                    const adapter = runtime?.adapter || runtime?.kind || (agent.is_cloud_sandbox ? 'cloud-agent' : 'agent')
                    const roleTemplate = agent.role_template as Record<string, string> | undefined
                    const roleLabel = agent.role_template_id
                      ? String(roleTemplate?.shortLabel || roleTemplate?.label || '')
                      : ''
                    return (
                      <button
                        key={agent.agent_id}
                        onClick={() => openAgent(agent.agent_id)}
                        className="group rounded-2xl border border-slate-200 bg-white/85 p-3 text-left transition hover:border-sky-300 hover:bg-sky-50/70 dark:border-zinc-800 dark:bg-zinc-950/55 dark:hover:border-sky-700 dark:hover:bg-sky-950/20"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`h-2.5 w-2.5 rounded-full ${
                                !online ? 'bg-slate-300 dark:bg-zinc-600'
                                : typing ? 'bg-amber-400 shadow-[0_0_0_4px_rgba(251,191,36,0.18)]'
                                : 'bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,0.18)]'
                              }`} />
                              <p className="truncate text-sm font-black" title={agent.display_name}>{agent.display_name}</p>
                              {roleLabel && (
                                <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500 dark:bg-zinc-800 dark:text-zinc-400">{roleLabel}</span>
                              )}
                            </div>
                            <p className="mt-1 text-[11px] text-slate-500 dark:text-zinc-400">{shortId(agent.agent_id)}</p>
                          </div>
                          <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:border-zinc-700 dark:text-zinc-400">
                            {!online ? '离线' : typing ? '执行中' : '空闲'}
                          </span>
                        </div>
                        <div className="mt-3 space-y-1.5 text-[11px] text-slate-500 dark:text-zinc-400">
                          <p className="truncate"><span className="font-bold text-slate-700 dark:text-zinc-200">Adapter:</span> {adapter}</p>
                          {model && <p className="truncate"><span className="font-bold text-slate-700 dark:text-zinc-200">Model:</span> {model}</p>}
                          <p className="truncate"><span className="font-bold text-slate-700 dark:text-zinc-200">Workdir:</span> {runtime?.workdir || runtime?.workdir_name || runtime?.git?.repo || '-'}</p>
                        </div>
                        <div className="mt-3 flex items-center justify-between text-[11px]">
                          <span className="text-slate-500 dark:text-zinc-400">{typing ? '正在执行' : online ? '空闲中' : '离线'}</span>
                          <span className="inline-flex items-center gap-1 font-bold text-sky-600 dark:text-sky-300">
                            打开对话 <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="grid min-h-0 gap-5 lg:grid-cols-[minmax(260px,0.92fr)_minmax(260px,1.08fr)]">
                <div className="min-h-0 rounded-[28px] border border-white/70 bg-white/75 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.10)] backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/72">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-black">团队 / 群聊</h2>
                      <p className="text-xs text-slate-500 dark:text-zinc-400">第二维度：协作 Topic 活跃度</p>
                    </div>
                    <Users className="h-5 w-5 text-violet-500" />
                  </div>
                  <div className="max-h-[34vh] space-y-2 overflow-y-auto pr-1">
                    {groupTopics.length === 0 && (
                      <p className="rounded-2xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500 dark:border-zinc-700 dark:text-zinc-400">
                        暂无团队/群聊。可以在 Feed 左侧新建群聊或团队。
                      </p>
                    )}
                    {groupTopics.map((topic) => {
                      const active = selectedGroup?.topic_id === topic.topic_id
                      const memberCount = topic.member_agent_ids?.length || 0
                      return (
                        <button
                          key={topic.topic_id}
                          onClick={() => setSelectedGroupId(topic.topic_id)}
                          onDoubleClick={() => openGroup(topic)}
                          className={`w-full overflow-hidden rounded-2xl border p-3 text-left transition ${
                            active
                              ? 'border-violet-300 bg-violet-50/75 ring-2 ring-violet-200 dark:border-violet-600 dark:bg-violet-950/20 dark:ring-violet-600/20'
                              : 'border-slate-200 bg-white/82 hover:border-violet-200 dark:border-zinc-800 dark:bg-zinc-950/45 dark:hover:border-violet-700'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-black" title={topic.name}>{topic.name}</p>
                              <p className="mt-1 text-[11px] text-slate-500 dark:text-zinc-400">{memberCount} agents · {formatRelative(topic.last_activity_at)}</p>
                            </div>
                            {Number(topic.unread_count || 0) > 0 && (
                              <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-black text-white">{topic.unread_count}</span>
                            )}
                          </div>
                          <svg viewBox="0 0 156 50" className="mt-2 h-10 w-full">
                            <polyline
                              points={pointsForSparkline(topic.topic_id, memberCount + Number(topic.unread_count || 0))}
                              fill="none"
                              stroke={active ? '#8b5cf6' : '#94a3b8'}
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="min-h-0 rounded-[28px] border border-white/70 bg-white/75 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.10)] backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/72">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-black">{selectedGroup?.name || '最近聊天'}</h2>
                      <p className="text-xs text-slate-500 dark:text-zinc-400">最近消息预览，双击群聊卡片进入完整对话</p>
                    </div>
                    <MessageCircle className="h-5 w-5 text-amber-500" />
                  </div>
                  <div className="max-h-[34vh] space-y-2 overflow-y-auto pr-1">
                    {!selectedGroup && (
                      <p className="rounded-2xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500 dark:border-zinc-700 dark:text-zinc-400">选择一个团队/群聊查看最近消息。</p>
                    )}
                    {selectedGroup && selectedGroupMessagesRaw.length === 0 && (
                      <p className="rounded-2xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500 dark:border-zinc-700 dark:text-zinc-400">暂无最近消息。</p>
                    )}
                    {selectedGroupMessagesRaw.slice(-8).map((message) => (
                      <div key={message.id || `${message.sender_id}-${message.created_at}`} className="rounded-2xl border border-slate-200 bg-white/80 p-3 dark:border-zinc-800 dark:bg-zinc-950/45">
                        <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
                          <span className="truncate font-black text-slate-700 dark:text-zinc-200">{message.sender_type === 'HUMAN' ? 'Human' : shortId(message.sender_id)}</span>
                          <span className="shrink-0 text-slate-400">{formatRelative(message.created_at)}</span>
                        </div>
                        <p className="line-clamp-3 whitespace-pre-wrap text-xs leading-5 text-slate-600 dark:text-zinc-300">
                          {message.content}
                        </p>
                      </div>
                    ))}
                    {selectedGroup && (
                      <button
                        onClick={() => openGroup(selectedGroup)}
                        className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-sky-600 dark:bg-white dark:text-zinc-950 dark:hover:bg-sky-200"
                      >
                        进入完整群聊 <ArrowRight className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </main>

          <section className="grid gap-4 rounded-[28px] border border-white/70 bg-white/75 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.10)] backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/72 md:grid-cols-3">
            <UsagePanel
              icon={<Sparkles className="h-4 w-4" />}
              title="第三维度：Token 消耗"
              value={formatTokens(totalTokens)}
              detail="按任务消息与 runtime usage 聚合到主机"
            />
            <UsagePanel
              icon={<Clock3 className="h-4 w-4" />}
              title="执行任务时间"
              value={formatDuration(totalExecutionMs)}
              detail="started_at / completed_at / active status 计算"
            />
            <UsagePanel
              icon={<GitBranch className="h-4 w-4" />}
              title="Fabric 活跃度"
              value={`${tasks.filter(isRunningTask).length} active`}
              detail={`${tasks.length} tasks · ${groupTopics.length} collaboration topics`}
            />
          </section>
        </div>

        <style jsx global>{`
          .runtime-map {
            position: relative;
          }
          .runtime-grid {
            position: absolute;
            inset: 0;
            background-image:
              linear-gradient(rgba(14, 165, 233, 0.08) 1px, transparent 1px),
              linear-gradient(90deg, rgba(14, 165, 233, 0.08) 1px, transparent 1px);
            background-size: 34px 34px;
            mask-image: radial-gradient(circle at 50% 10%, black 0, transparent 68%);
          }
          .runtime-orb {
            position: absolute;
            border-radius: 9999px;
            filter: blur(22px);
            opacity: 0.55;
            animation: runtimeFloat 10s ease-in-out infinite alternate;
          }
          .runtime-orb-a {
            left: -8rem;
            top: -6rem;
            width: 22rem;
            height: 22rem;
            background: rgba(56, 189, 248, 0.32);
          }
          .runtime-orb-b {
            right: -10rem;
            bottom: 4rem;
            width: 26rem;
            height: 26rem;
            background: rgba(168, 85, 247, 0.20);
            animation-delay: -3s;
          }
          @keyframes runtimeFloat {
            from { transform: translate3d(0, 0, 0) scale(1); }
            to { transform: translate3d(2rem, 1.5rem, 0) scale(1.08); }
          }
        `}</style>
      </div>
    </WttShellV2>
  )
}

function MetricCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: 'sky' | 'emerald' | 'amber' | 'violet' }) {
  const toneClass = {
    sky: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-200',
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200',
    violet: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-200',
  }[tone]
  return (
    <div className={`rounded-2xl border border-white/70 p-3 shadow-sm dark:border-white/10 ${toneClass}`}>
      <div className="mb-2 flex items-center justify-between">
        {icon}
        <span className="text-[10px] font-black uppercase tracking-[0.18em] opacity-65">{label}</span>
      </div>
      <p className="text-xl font-black">{value}</p>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-slate-100/80 px-2 py-2 dark:bg-zinc-900/70">
      <p className="text-sm font-black">{value}</p>
      <p className="text-[10px] text-slate-500 dark:text-zinc-400">{label}</p>
    </div>
  )
}

function UsagePanel({ icon, title, value, detail }: { icon: React.ReactNode; title: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/78 p-4 dark:border-zinc-800 dark:bg-zinc-950/45">
      <div className="mb-3 flex items-center gap-2 text-slate-500 dark:text-zinc-400">
        {icon}
        <span className="text-xs font-black uppercase tracking-[0.14em]">{title}</span>
      </div>
      <p className="text-2xl font-black text-slate-950 dark:text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">{detail}</p>
    </div>
  )
}
