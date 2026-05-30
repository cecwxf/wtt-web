'use client'

import { ChevronDown, ChevronRight, ClipboardList, Cloud, Crown, Feather, Flame, Hash, Loader2, Lock, MessageCircle, MoreVertical, Plus, Power, Radio, Shield, Sparkles, Sun, Users, Waves, Zap, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import {
  AGENT_ROLE_TEMPLATES,
  buildRoleSystemPrompt,
  getAgentRoleTemplate,
  type AgentRoleTemplate,
  type AgentRoleTemplateId,
} from '@/lib/agent-role-templates'
import { AgentTerminalModal } from '@/components/ui/agent-terminal-modal'
import { useI18n } from '@/lib/i18n-provider'
import { wttApi } from '@/lib/api/wtt-client'

export interface TopicItem {
  topic_id: string
  name: string
  topic_type: 'broadcast' | 'discussion' | 'p2p' | 'collaborative'
  unread_count?: number
  can_delete?: boolean
  task_id?: string
  task_type?: string
  task_mode?: string
  exec_mode?: string
  runner_agent_id?: string
  is_default_p2p?: boolean
  last_activity_at?: string
  description?: string
  creator_agent_id?: string
}

interface AgentOption {
  agent_id: string
  display_name: string
  binding_method?: string
  bound_via?: string
  is_cloud_sandbox?: boolean
  cloud_host_agent_id?: string
}

export interface AgentRuntimeInfo {
  kind?: string
  adapter?: string
  model?: string
  model_id?: string
  current_model?: string
  reasoning_effort?: string
  workdir?: string
  workdir_name?: string
  hostname?: string
  platform?: string
  provider?: string
  host_agent_id?: string
  workspace_path?: string
  git?: {
    repo?: string
    branch?: string
    commit?: string
    dirty?: boolean
  } | null
  last_heartbeat_secs_ago?: number
}

interface TopicColumnProps {
  topics: TopicItem[]
  selectedTopicId: string | null
  onSelectTopic: (topicId: string | null) => void
  onLeaveTopic?: (topicId: string) => void
  onDeleteTopic?: (topicId: string) => void
  onCreateP2P?: (targetAgentId: string) => void | Promise<void>
  onRequestDiscuss?: (targetAgentId: string, topicName: string) => void | Promise<void>
  onSelectWorkerTopic?: (topicId: string, workerSession?: { workerId: string; personaMd: string; workerMd: string; isFirstSession: boolean; personaChanged?: boolean }) => void
  pinScopeKey?: string
  agentOptions?: AgentOption[]
  selectedAgentId?: string
  onSelectAgent?: (agentId: string) => void
  isSelectedAgentOnline?: boolean
  onlineAgentIds?: Set<string>
  agentRoleMap?: Record<string, string>
  agentRoleTemplateMap?: Record<string, AgentRoleTemplate>
  agentRuntimeMap?: Record<string, AgentRuntimeInfo>
  onAssignAgentRole?: (agentId: string, roleId: AgentRoleTemplateId) => void
  onSaveAgentRole?: (agentId: string, role: AgentRoleTemplate) => void
  onNewAgentFromHost?: (hostAgentId: string, role: AgentRoleTemplate, adapter: 'claude-code' | 'codex') => void | Promise<void>
  onCreateCloudAgent?: () => void | Promise<void>
  onSleepSandbox?: (hostAgentId: string) => void | Promise<void>
  onWakeSandbox?: (hostAgentId: string) => void | Promise<void>
  onRenameAgent?: (agentId: string, currentName: string) => void
  onUnclaimAgent?: (agentId: string) => void
  onCreateGeneralTask?: () => void
  onToggleSidebar?: () => void
  onStartAgentResize?: (event: ReactPointerEvent) => void
  localLibrarySlot?: ReactNode
  userToken?: string
  compactLayout?: boolean
}

function agentInitial(name: string) {
  return (name.trim()[0] || 'A').toUpperCase()
}

const ROLE_TONES = [
  {
    avatar: 'bg-sky-500 text-white',
    selected: 'border-sky-300 bg-sky-50 shadow-sm dark:border-sky-500/45 dark:bg-sky-500/15',
    idle: 'hover:border-sky-200 hover:bg-sky-50/80 dark:hover:border-sky-500/35 dark:hover:bg-sky-500/10',
    label: 'text-sky-700 dark:text-sky-200',
    ring: 'ring-sky-100 dark:ring-sky-500/25',
  },
  {
    avatar: 'bg-emerald-500 text-white',
    selected: 'border-emerald-300 bg-emerald-50 shadow-sm dark:border-emerald-500/45 dark:bg-emerald-500/15',
    idle: 'hover:border-emerald-200 hover:bg-emerald-50/80 dark:hover:border-emerald-500/35 dark:hover:bg-emerald-500/10',
    label: 'text-emerald-700 dark:text-emerald-200',
    ring: 'ring-emerald-100 dark:ring-emerald-500/25',
  },
  {
    avatar: 'bg-violet-500 text-white',
    selected: 'border-violet-300 bg-violet-50 shadow-sm dark:border-violet-500/45 dark:bg-violet-500/15',
    idle: 'hover:border-violet-200 hover:bg-violet-50/80 dark:hover:border-violet-500/35 dark:hover:bg-violet-500/10',
    label: 'text-violet-700 dark:text-violet-200',
    ring: 'ring-violet-100 dark:ring-violet-500/25',
  },
  {
    avatar: 'bg-amber-500 text-white',
    selected: 'border-amber-300 bg-amber-50 shadow-sm dark:border-amber-500/45 dark:bg-amber-500/15',
    idle: 'hover:border-amber-200 hover:bg-amber-50/80 dark:hover:border-amber-500/35 dark:hover:bg-amber-500/10',
    label: 'text-amber-700 dark:text-amber-200',
    ring: 'ring-amber-100 dark:ring-amber-500/25',
  },
  {
    avatar: 'bg-rose-500 text-white',
    selected: 'border-rose-300 bg-rose-50 shadow-sm dark:border-rose-500/45 dark:bg-rose-500/15',
    idle: 'hover:border-rose-200 hover:bg-rose-50/80 dark:hover:border-rose-500/35 dark:hover:bg-rose-500/10',
    label: 'text-rose-700 dark:text-rose-200',
    ring: 'ring-rose-100 dark:ring-rose-500/25',
  },
  {
    avatar: 'bg-cyan-600 text-white',
    selected: 'border-cyan-300 bg-cyan-50 shadow-sm dark:border-cyan-500/45 dark:bg-cyan-500/15',
    idle: 'hover:border-cyan-200 hover:bg-cyan-50/80 dark:hover:border-cyan-500/35 dark:hover:bg-cyan-500/10',
    label: 'text-cyan-700 dark:text-cyan-200',
    ring: 'ring-cyan-100 dark:ring-cyan-500/25',
  },
  {
    avatar: 'bg-fuchsia-500 text-white',
    selected: 'border-fuchsia-300 bg-fuchsia-50 shadow-sm dark:border-fuchsia-500/45 dark:bg-fuchsia-500/15',
    idle: 'hover:border-fuchsia-200 hover:bg-fuchsia-50/80 dark:hover:border-fuchsia-500/35 dark:hover:bg-fuchsia-500/10',
    label: 'text-fuchsia-700 dark:text-fuchsia-200',
    ring: 'ring-fuchsia-100 dark:ring-fuchsia-500/25',
  },
] as const

const HOST_FOLDER_TONES = [
  {
    god: 'Zeus',
    Icon: Zap,
    shell: 'border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50 text-emerald-800 ring-emerald-100 dark:border-emerald-500/25 dark:from-emerald-500/15 dark:via-zinc-950 dark:to-teal-500/10 dark:text-emerald-100 dark:ring-emerald-500/15',
    icon: 'from-amber-300 via-yellow-500 to-orange-600 text-white shadow-amber-900/30',
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-100',
  },
  {
    god: 'Poseidon',
    Icon: Waves,
    shell: 'border-sky-200 bg-gradient-to-br from-sky-50 via-white to-cyan-50 text-sky-800 ring-sky-100 dark:border-sky-500/25 dark:from-sky-500/15 dark:via-zinc-950 dark:to-cyan-500/10 dark:text-sky-100 dark:ring-sky-500/15',
    icon: 'from-cyan-300 via-sky-500 to-blue-700 text-white shadow-sky-900/30',
    badge: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-100',
  },
  {
    god: 'Athena',
    Icon: Shield,
    shell: 'border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50 text-amber-900 ring-amber-100 dark:border-amber-500/25 dark:from-amber-500/15 dark:via-zinc-950 dark:to-orange-500/10 dark:text-amber-100 dark:ring-amber-500/15',
    icon: 'from-stone-300 via-indigo-500 to-slate-800 text-white shadow-indigo-900/30',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-100',
  },
  {
    god: 'Aphrodite',
    Icon: Sparkles,
    shell: 'border-rose-200 bg-gradient-to-br from-rose-50 via-white to-pink-50 text-rose-800 ring-rose-100 dark:border-rose-500/25 dark:from-rose-500/15 dark:via-zinc-950 dark:to-pink-500/10 dark:text-rose-100 dark:ring-rose-500/15',
    icon: 'from-pink-300 via-rose-500 to-fuchsia-700 text-white shadow-rose-900/30',
    badge: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-100',
  },
  {
    god: 'Apollo',
    Icon: Sun,
    shell: 'border-orange-200 bg-gradient-to-br from-orange-50 via-white to-yellow-50 text-orange-900 ring-orange-100 dark:border-orange-500/25 dark:from-orange-500/15 dark:via-zinc-950 dark:to-yellow-500/10 dark:text-orange-100 dark:ring-orange-500/15',
    icon: 'from-yellow-200 via-orange-500 to-red-600 text-white shadow-orange-900/30',
    badge: 'bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-100',
  },
  {
    god: 'Hermes',
    Icon: Feather,
    shell: 'border-violet-200 bg-gradient-to-br from-violet-50 via-white to-sky-50 text-violet-900 ring-violet-100 dark:border-violet-500/25 dark:from-violet-500/15 dark:via-zinc-950 dark:to-sky-500/10 dark:text-violet-100 dark:ring-violet-500/15',
    icon: 'from-violet-300 via-indigo-500 to-sky-600 text-white shadow-indigo-900/30',
    badge: 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-100',
  },
  {
    god: 'Hephaestus',
    Icon: Flame,
    shell: 'border-red-200 bg-gradient-to-br from-red-50 via-white to-stone-50 text-red-900 ring-red-100 dark:border-red-500/25 dark:from-red-500/15 dark:via-zinc-950 dark:to-stone-500/10 dark:text-red-100 dark:ring-red-500/15',
    icon: 'from-red-400 via-orange-600 to-stone-900 text-white shadow-red-900/30',
    badge: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-100',
  },
  {
    god: 'Hera',
    Icon: Crown,
    shell: 'border-fuchsia-200 bg-gradient-to-br from-fuchsia-50 via-white to-purple-50 text-fuchsia-900 ring-fuchsia-100 dark:border-fuchsia-500/25 dark:from-fuchsia-500/15 dark:via-zinc-950 dark:to-purple-500/10 dark:text-fuchsia-100 dark:ring-fuchsia-500/15',
    icon: 'from-fuchsia-300 via-purple-600 to-indigo-900 text-white shadow-purple-900/30',
    badge: 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-500/15 dark:text-fuchsia-100',
  },
] as const

function hashText(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }
  return hash
}

function roleTone(agentId: string, role?: AgentRoleTemplate) {
  const key = `${role?.id || role?.label || 'agent'}:${agentId}`
  return ROLE_TONES[hashText(key) % ROLE_TONES.length] || ROLE_TONES[0]
}

function hostFolderTone(key: string) {
  return HOST_FOLDER_TONES[hashText(key) % HOST_FOLDER_TONES.length] || HOST_FOLDER_TONES[0]
}

function MythicAgentDirectoryIcon({ Icon }: { Icon: LucideIcon }) {
  return (
    <span className="relative flex h-7 w-7 items-center justify-center">
      <span className="absolute inset-0 rounded-full bg-white/25 blur-[1px]" />
      <span className="absolute inset-0 rotate-45 rounded-lg border border-white/35" />
      <span className="absolute inset-1 rounded-full border border-white/30" />
      <Icon className="relative h-4 w-4 drop-shadow" strokeWidth={2.5} />
    </span>
  )
}

function agentTooltip(agent: AgentOption, role: AgentRoleTemplate, runtime?: AgentRuntimeInfo) {
  const workdir = runtime?.workdir || runtime?.git?.repo || runtime?.workdir_name || ''
  const git = runtime?.git
  return [
    agent.display_name || agent.agent_id,
    `${role.label} / ${role.shortLabel}`,
    `agentID: ${agent.agent_id}`,
    workdir ? `workdir: ${workdir}` : '',
    git?.branch ? `branch: ${git.branch}${git.dirty ? ' (dirty)' : ''}` : '',
    runtime?.adapter || runtime?.kind ? `adapter: ${runtime.adapter || runtime.kind}` : '',
    runtime?.hostname ? `host: ${runtime.hostname}` : '',
  ].filter(Boolean).join('\n')
}

function stripTaskPrefix(name: string): string {
  return name.replace(/^TASK-[a-f0-9]{8}\s*/i, '')
}

function getTopicIcon(topic: TopicItem) {
  if (topic.task_id) return ClipboardList
  switch (topic.topic_type) {
    case 'p2p':
      return Lock
    case 'collaborative':
      return Users
    case 'broadcast':
      return Radio
    default:
      return Hash
  }
}

function getTopicKindLabel(topic: TopicItem, zh: boolean) {
  if (topic.task_id) return zh ? '任务' : 'Task'
  switch (topic.topic_type) {
    case 'p2p':
      return 'P2P'
    case 'collaborative':
      return zh ? '协作' : 'Collaborative'
    case 'broadcast':
      return zh ? '订阅' : 'Broadcast'
    default:
      return zh ? '讨论' : 'Discuss'
  }
}

function getTopicDisplayName(topic: TopicItem) {
  return topic.task_id ? stripTaskPrefix(topic.name) : topic.name
}

type TopicGroupKey = 'p2p' | 'task' | 'discuss' | 'subscriber'

function getTopicGroup(topic: TopicItem): TopicGroupKey {
  if (topic.topic_type === 'p2p') return 'p2p'
  if (topic.task_id) return 'task'
  if (topic.topic_type === 'broadcast') return 'subscriber'
  return 'discuss'
}

function getGroupLabel(group: TopicGroupKey, zh: boolean) {
  switch (group) {
    case 'p2p':
      return zh ? 'P2P 私聊' : 'P2P'
    case 'task':
      return zh ? '任务' : 'Tasks'
    case 'discuss':
      return zh ? '讨论' : 'Discuss'
    case 'subscriber':
      return zh ? '订阅' : 'Subscriptions'
  }
}

function getGroupIcon(group: TopicGroupKey) {
  switch (group) {
    case 'p2p':
      return Lock
    case 'task':
      return ClipboardList
    case 'discuss':
      return MessageCircle
    case 'subscriber':
      return Radio
  }
}

function getGroupTone(group: TopicGroupKey) {
  switch (group) {
    case 'p2p':
      return 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-200'
    case 'task':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200'
    case 'discuss':
      return 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-200'
    case 'subscriber':
      return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200'
  }
}

function formatRuntime(runtime?: AgentRuntimeInfo) {
  if (!runtime) return ''
  const workdir = runtime.workdir || runtime.git?.repo || runtime.workdir_name || ''
  const branch = runtime.git?.branch || ''
  const adapter = runtime.adapter || runtime.kind || ''
  const model = runtime.current_model || runtime.model_id || runtime.model || ''
  return [adapter, model, workdir, branch].filter(Boolean).join(' · ')
}

function normalizeNewAgentAdapter(runtime?: AgentRuntimeInfo) {
  const raw = String(runtime?.adapter || runtime?.kind || '').trim().toLowerCase()
  if (raw === 'codex') return 'codex'
  if (raw === 'claude' || raw === 'claude-code' || raw === 'claude_code') return 'claude-code'
  return ''
}

type AgentFolder = {
  key: string
  label: string
  subtitle: string
  agents: AgentOption[]
}

function cleanHostLabel(value: unknown) {
  return String(value || '').trim()
}

function isCloudSandboxRuntime(runtime?: AgentRuntimeInfo) {
  const provider = String(runtime?.provider || '').trim().toLowerCase()
  return provider.startsWith('cloudflare_sandbox')
}

function cloudHostAgentIdForAgent(agent: AgentOption, runtime?: AgentRuntimeInfo) {
  const explicitHostId = cleanHostLabel(agent.cloud_host_agent_id)
  if (explicitHostId) return explicitHostId

  const runtimeHostId = cleanHostLabel(runtime?.host_agent_id)
  if (agent.is_cloud_sandbox || isCloudSandboxRuntime(runtime)) {
    return runtimeHostId || agent.agent_id
  }

  return ''
}

export function TopicColumn(props: TopicColumnProps) {
  const {
    topics,
    selectedTopicId,
    onSelectTopic,
    onLeaveTopic,
    onDeleteTopic,
    agentOptions = [],
    selectedAgentId = '',
    onSelectAgent,
    isSelectedAgentOnline = false,
    onlineAgentIds,
    agentRoleMap,
    agentRoleTemplateMap,
    agentRuntimeMap,
    onAssignAgentRole,
    onSaveAgentRole,
    onNewAgentFromHost,
    onCreateCloudAgent,
    onSleepSandbox,
    onWakeSandbox,
    onRenameAgent,
    onUnclaimAgent,
    onCreateGeneralTask,
    onToggleSidebar,
    onStartAgentResize,
    userToken,
    compactLayout = false,
  } = props
  const [agentMenuFor, setAgentMenuFor] = useState<string | null>(null)
  const [folderMenuFor, setFolderMenuFor] = useState<string | null>(null)
  const [sandboxActionFor, setSandboxActionFor] = useState<string | null>(null)
  const [topicMenuFor, setTopicMenuFor] = useState<string | null>(null)
  const [mentionMuteByTopic, setMentionMuteByTopic] = useState<Record<string, boolean>>({})
  const [shellAgent, setShellAgent] = useState<AgentOption | null>(null)
  const [newAgentOpen, setNewAgentOpen] = useState(false)
  const [newAgentHostId, setNewAgentHostId] = useState('')
  const [newAgentRoleId, setNewAgentRoleId] = useState<AgentRoleTemplateId>('general')
  const [newAgentAdapter, setNewAgentAdapter] = useState<'claude-code' | 'codex'>('claude-code')
  const [newAgentBusy, setNewAgentBusy] = useState(false)
  const [newAgentError, setNewAgentError] = useState('')
  const [cloudAgentBusy, setCloudAgentBusy] = useState(false)
  const [roleEditor, setRoleEditor] = useState<{
    agentId: string
    sourceRole?: AgentRoleTemplate
    label: string
    description: string
    custom: boolean
  } | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<TopicGroupKey, boolean>>({
    p2p: false,
    task: false,
    discuss: false,
    subscriber: false,
  })
  const [collapsedAgentFolders, setCollapsedAgentFolders] = useState<Record<string, boolean>>({})
  const { locale, t } = useI18n()
  const zh = locale === 'zh'

  useEffect(() => {
    const closeMenus = () => {
      setTopicMenuFor(null)
      setAgentMenuFor(null)
      setFolderMenuFor(null)
    }
    window.addEventListener('click', closeMenus)
    return () => window.removeEventListener('click', closeMenus)
  }, [])

  useEffect(() => {
    if (!topicMenuFor || !selectedAgentId) return
    const topic = topics.find((item) => item.topic_id === topicMenuFor)
    if (!topic || topic.task_id || !['discussion', 'collaborative'].includes(topic.topic_type)) return
    let cancelled = false
    wttApi.getTopicMentionMutes(topic.topic_id, selectedAgentId, selectedAgentId, userToken)
      .then((rows) => {
        if (cancelled) return
        setMentionMuteByTopic((prev) => ({ ...prev, [topic.topic_id]: rows.length > 0 }))
      })
      .catch(() => {
        if (cancelled) return
        setMentionMuteByTopic((prev) => ({ ...prev, [topic.topic_id]: false }))
      })
    return () => {
      cancelled = true
    }
  }, [topicMenuFor, selectedAgentId, topics, userToken])

  const toggleTopicMentionMute = async (topic: TopicItem) => {
    if (!selectedAgentId) return
    const nextMuted = !mentionMuteByTopic[topic.topic_id]
    setMentionMuteByTopic((prev) => ({ ...prev, [topic.topic_id]: nextMuted }))
    setTopicMenuFor(null)
    try {
      await wttApi.setTopicMentionMute(topic.topic_id, selectedAgentId, selectedAgentId, nextMuted, userToken)
    } catch (error) {
      setMentionMuteByTopic((prev) => ({ ...prev, [topic.topic_id]: !nextMuted }))
      console.error('Failed to update topic mention mute', error)
    }
  }

  const saveRoleEditor = () => {
    if (!roleEditor || !onSaveAgentRole) return
    const label = roleEditor.label.trim()
    const description = roleEditor.description.trim()
    if (!label || !description) return
    const base = roleEditor.sourceRole
    const id = roleEditor.custom
      ? `custom-${Date.now().toString(36)}`
      : (base?.id || `custom-${Date.now().toString(36)}`)
    onSaveAgentRole(roleEditor.agentId, {
      id,
      label,
      shortLabel: label.slice(0, 8),
      description,
      skills: base?.skills?.length ? base.skills : ['custom_role'],
      systemPrompt: buildRoleSystemPrompt(label, description),
    })
    setRoleEditor(null)
    setAgentMenuFor(null)
  }

  const isAgentOnline = (agentId: string) => {
    if (onlineAgentIds) return onlineAgentIds.has(agentId)
    return agentId === selectedAgentId ? isSelectedAgentOnline : false
  }

  const newAgentHosts = useMemo(() => {
    if (!onNewAgentFromHost) return []
    return agentOptions.filter((agent) => {
      if (!isAgentOnline(agent.agent_id)) return false
      return Boolean(normalizeNewAgentAdapter(agentRuntimeMap?.[agent.agent_id]))
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentOptions, agentRuntimeMap, onlineAgentIds, selectedAgentId, isSelectedAgentOnline, onNewAgentFromHost])
  const hasCloudAgent = useMemo(
    () => agentOptions.some((agent) => (agent.binding_method || agent.bound_via || '') === 'cloud_trial'),
    [agentOptions],
  )

  const agentFolders = useMemo<AgentFolder[]>(() => {
    const folders = new Map<string, AgentFolder>()

    const ensureFolder = (key: string, label: string, subtitle: string) => {
      const existing = folders.get(key)
      if (existing) {
        if (!existing.label && label) existing.label = label
        if (!existing.subtitle && subtitle) existing.subtitle = subtitle
        return existing
      }
      const folder = { key, label, subtitle, agents: [] as AgentOption[] }
      folders.set(key, folder)
      return folder
    }

    for (const agent of agentOptions) {
      const runtime = agentRuntimeMap?.[agent.agent_id]
      const runtimeHost = cleanHostLabel(runtime?.hostname)

      if (runtimeHost) {
        ensureFolder(`host:${runtimeHost}`, runtimeHost, zh ? '主机' : 'Host').agents.push(agent)
        continue
      }

      ensureFolder('host:unknown', zh ? '未上报主机' : 'Unknown host', zh ? '无 hostname' : 'No hostname').agents.push(agent)
    }

    return Array.from(folders.values()).sort((a, b) => {
      const selectedA = a.agents.some((agent) => agent.agent_id === selectedAgentId)
      const selectedB = b.agents.some((agent) => agent.agent_id === selectedAgentId)
      if (selectedA && !selectedB) return -1
      if (!selectedA && selectedB) return 1
      return a.label.localeCompare(b.label)
    })
  }, [agentOptions, agentRuntimeMap, selectedAgentId, zh])

  const openNewAgentModal = () => {
    const selectedHost = newAgentHosts.find((agent) => agent.agent_id === selectedAgentId)
    const host = selectedHost || newAgentHosts[0]
    if (!host) return
    setNewAgentHostId(host.agent_id)
    setNewAgentAdapter((normalizeNewAgentAdapter(agentRuntimeMap?.[host.agent_id]) || 'claude-code') as 'claude-code' | 'codex')
    setNewAgentRoleId('general')
    setNewAgentError('')
    setNewAgentOpen(true)
  }

  const createNewAgentFromHost = async () => {
    if (!onNewAgentFromHost || !newAgentHostId) return
    const role = AGENT_ROLE_TEMPLATES.find((template) => template.id === newAgentRoleId) || getAgentRoleTemplate(newAgentRoleId)
    setNewAgentBusy(true)
    setNewAgentError('')
    try {
      await onNewAgentFromHost(newAgentHostId, role, newAgentAdapter)
      setNewAgentOpen(false)
    } catch (error) {
      setNewAgentError(error instanceof Error ? error.message : (zh ? '创建失败' : 'Failed to create agent'))
    } finally {
      setNewAgentBusy(false)
    }
  }

  const createCloudAgent = async () => {
    if (!onCreateCloudAgent || cloudAgentBusy) return
    setCloudAgentBusy(true)
    try {
      await onCreateCloudAgent()
    } finally {
      setCloudAgentBusy(false)
    }
  }

  const runSandboxFolderAction = async (hostAgentId: string, action: 'sleep' | 'wake') => {
    const handler = action === 'sleep' ? onSleepSandbox : onWakeSandbox
    if (!handler || !hostAgentId) return
    setSandboxActionFor(`${hostAgentId}:${action}`)
    try {
      await handler(hostAgentId)
      setFolderMenuFor(null)
    } finally {
      setSandboxActionFor(null)
    }
  }

  const groupedTopics = useMemo(() => {
    const order: TopicGroupKey[] = ['p2p', 'task', 'discuss', 'subscriber']
    const byGroup = new Map<TopicGroupKey, TopicItem[]>()
    for (const group of order) byGroup.set(group, [])

    topics.forEach((topic) => {
      byGroup.get(getTopicGroup(topic))?.push(topic)
    })

    for (const group of order) {
      const rows = byGroup.get(group) || []
      rows.sort((a, b) => {
        if (a.is_default_p2p && !b.is_default_p2p) return -1
        if (!a.is_default_p2p && b.is_default_p2p) return 1

        const unreadDiff = Number(b.unread_count || 0) - Number(a.unread_count || 0)
        if (unreadDiff !== 0) return unreadDiff

        const at = a.last_activity_at ? new Date(a.last_activity_at).getTime() : 0
        const bt = b.last_activity_at ? new Date(b.last_activity_at).getTime() : 0
        return bt - at
      })
    }

    return order
      .map((group) => ({ group, items: byGroup.get(group) || [] }))
  }, [topics])

  const renderTopicRow = (topic: TopicItem) => {
    const selected = topic.topic_id === selectedTopicId
    const Icon = getTopicIcon(topic)
    const unread = Number(topic.unread_count || 0)
    const menuOpen = topicMenuFor === topic.topic_id
    const displayName = getTopicDisplayName(topic)
    const canToggleMentionMute = !!selectedAgentId && !topic.task_id && ['discussion', 'collaborative'].includes(topic.topic_type)
    const mentionMuted = !!mentionMuteByTopic[topic.topic_id]
    const selectedAgentName = agentOptions.find((agent) => agent.agent_id === selectedAgentId)?.display_name || selectedAgentId

    return (
      <div
        key={topic.topic_id}
        className="relative"
        onContextMenu={(event) => {
          event.preventDefault()
          setTopicMenuFor(topic.topic_id)
        }}
      >
        <button
          type="button"
          onClick={() => onSelectTopic(topic.topic_id)}
          className={`group flex w-full items-start gap-2 rounded-xl border px-2.5 py-2 text-left transition ${
            selected
              ? 'border-[#d7cbb9] bg-[#efe8dc] shadow-sm dark:border-emerald-500/35 dark:bg-emerald-500/10'
              : 'border-transparent bg-transparent hover:border-[#e4dccf] hover:bg-white/75 dark:hover:border-zinc-700 dark:hover:bg-zinc-900'
          }`}
        >
          <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
            selected ? 'bg-[#28241f] text-[#f5ead8]' : 'bg-[#eee8dc] text-slate-500 dark:bg-zinc-800 dark:text-zinc-300'
          }`}>
            <Icon className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate text-sm font-bold text-slate-800 dark:text-zinc-100">
                {displayName}
              </span>
              {topic.is_default_p2p && (
                <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-black text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
                  default
                </span>
              )}
            </span>
            <span className="mt-1 flex items-center gap-2 text-[11px] text-slate-400 dark:text-zinc-500">
              <span>{getTopicKindLabel(topic, zh)}</span>
            </span>
          </span>
          {unread > 0 && (
            <span className="mt-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-black leading-none text-white">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
          <span
            role="button"
            tabIndex={0}
            onClick={(event) => {
              event.stopPropagation()
              setTopicMenuFor(menuOpen ? null : topic.topic_id)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                event.stopPropagation()
                setTopicMenuFor(menuOpen ? null : topic.topic_id)
              }
            }}
            className="mt-0.5 rounded-lg p-1 text-slate-400 opacity-60 transition hover:bg-[#f6f0e5] hover:text-slate-700 group-hover:opacity-100 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            title={zh ? 'Topic 设置' : 'Topic settings'}
          >
            <MoreVertical className="h-4 w-4" />
          </span>
        </button>

        {menuOpen && (
          <div
            className="absolute right-2 top-10 z-30 w-48 rounded-xl border border-[#ded6c8] bg-[#fffdf8] p-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
            onClick={(event) => event.stopPropagation()}
          >
            {canToggleMentionMute && (
              <button
                type="button"
                onClick={() => {
                  void toggleTopicMentionMute(topic)
                }}
                className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-600 transition hover:bg-[#f3eee5] dark:text-zinc-300 dark:hover:bg-zinc-800"
                title={selectedAgentName}
              >
                {mentionMuted ? (zh ? '开放 @' : 'Allow @') : (zh ? '屏蔽 @' : 'Mute @')}
              </button>
            )}
            {onLeaveTopic && (
              <button
                type="button"
                onClick={() => {
                  onLeaveTopic(topic.topic_id)
                  setTopicMenuFor(null)
                }}
                className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-600 transition hover:bg-[#f3eee5] dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {zh ? '离开 Topic' : 'Leave Topic'}
              </button>
            )}
            {onDeleteTopic && topic.can_delete && (
              <button
                type="button"
                onClick={() => {
                  onDeleteTopic(topic.topic_id)
                  setTopicMenuFor(null)
                }}
                className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-red-500 transition hover:bg-red-50 dark:hover:bg-red-500/10"
              >
                {zh ? '删除 Topic' : 'Delete Topic'}
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <aside className="flex w-[var(--wtt-agent-rail-width)] shrink-0 flex-col border-r border-[#d9cebd] bg-[radial-gradient(circle_at_30%_0%,#ffffff_0,#f7efe2_38%,#ece4d7_100%)] text-slate-800 dark:border-zinc-800 dark:bg-[radial-gradient(circle_at_30%_0%,#27272a_0,#111113_42%,#050506_100%)] dark:text-zinc-100">
        <div className="border-b border-[#e1d6c5] px-1.5 py-2 text-center dark:border-zinc-800">
          <div className="truncate text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 dark:text-zinc-400">
            Agent
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-1.5">
          {onCreateCloudAgent && (
            <button
              type="button"
              onClick={() => {
                void createCloudAgent()
              }}
              disabled={cloudAgentBusy}
              className="relative flex w-full flex-col items-center justify-center overflow-hidden rounded-2xl border border-sky-200 bg-gradient-to-b from-sky-300 via-sky-200 to-white px-1 py-2 text-center text-[9px] font-black leading-tight text-sky-900 shadow-sm shadow-sky-900/10 ring-1 ring-white/70 transition hover:-translate-y-0.5 hover:border-sky-300 hover:from-sky-200 hover:via-cyan-100 hover:to-white hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 dark:border-sky-400/45 dark:from-sky-500/35 dark:via-sky-400/20 dark:to-zinc-950 dark:text-sky-50 dark:ring-sky-200/20"
              title={hasCloudAgent
                ? (zh ? '已创建 Cloud Agent；点击可查看限制提示' : 'Cloud Agent already exists; click for details')
                : (zh ? '创建 Cloud Agent，需要 Plus / Pro 账户' : 'Create Cloud Agent, requires Plus / Pro')}
            >
              <span className="absolute -left-3 bottom-2 h-5 w-10 rounded-full bg-white/80 blur-[1px]" />
              <span className="absolute -right-4 top-2 h-6 w-12 rounded-full bg-white/70 blur-[1px]" />
              <span className="relative mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-white/85 text-sky-500 shadow-sm ring-1 ring-sky-100 dark:bg-white/90 dark:text-sky-600">
                <Cloud className="h-5 w-5" />
              </span>
              <span className="relative">Cloud</span>
              <span className="relative">Agent</span>
            </button>
          )}

          {agentOptions.length === 0 && (
            <div className="rounded-xl border border-dashed border-[#ded6c8] bg-white/55 p-2 text-center text-[10px] text-slate-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
              {zh ? '无 Agent' : 'No agents'}
            </div>
          )}

          {agentFolders.map((folder) => {
            const collapsed = collapsedAgentFolders[folder.key] ?? false
            const onlineCount = folder.agents.filter((agent) => isAgentOnline(agent.agent_id)).length
            const folderTone = hostFolderTone(folder.key)
            const FolderIcon = folderTone.Icon
            const cloudHostIds = Array.from(new Set(folder.agents
              .map((agent) => cloudHostAgentIdForAgent(agent, agentRuntimeMap?.[agent.agent_id]))
              .filter(Boolean)))
            const folderCloudHostId = cloudHostIds.length === 1 ? cloudHostIds[0] : ''
            const folderMenuOpen = folderMenuFor === folder.key
            const wakeBusy = Boolean(folderCloudHostId && sandboxActionFor === `${folderCloudHostId}:wake`)
            const sleepBusy = Boolean(folderCloudHostId && sandboxActionFor === `${folderCloudHostId}:sleep`)
            const sandboxActionBusy = wakeBusy || sleepBusy
            return (
              <section key={folder.key} className="space-y-1">
                <button
                  type="button"
                  onClick={() => setCollapsedAgentFolders((prev) => ({ ...prev, [folder.key]: !collapsed }))}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    setTopicMenuFor(null)
                    setAgentMenuFor(null)
                    setFolderMenuFor(folder.key)
                  }}
                  className={`flex w-full flex-col items-center rounded-2xl border px-1 py-1.5 text-center shadow-sm ring-1 transition hover:-translate-y-0.5 hover:shadow-md ${folderTone.shell}`}
                  title={[folder.label, folder.subtitle, folderCloudHostId ? (zh ? '右键管理 Sandbox' : 'Right-click to manage Sandbox') : ''].filter(Boolean).join(' · ')}
                >
                  <span className="flex items-center gap-1">
                    {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    <span className={`relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br shadow-md ring-1 ring-white/40 ${folderTone.icon}`}>
                      <span className="absolute -left-3 top-0 h-8 w-8 rounded-full bg-white/20" />
                      <span className="absolute -bottom-4 right-0 h-8 w-8 rounded-full bg-black/20" />
                      <MythicAgentDirectoryIcon Icon={FolderIcon} />
                    </span>
                  </span>
                  <span className="mt-1 max-w-full truncate text-[9px] font-black leading-tight">
                    {folder.label}
                  </span>
                  <span className={`mt-1 rounded-full px-1.5 py-0.5 text-[9px] font-black leading-none ${folderTone.badge}`}>
                    {onlineCount}/{folder.agents.length}
                  </span>
                </button>

                {folderMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setFolderMenuFor(null)} />
                    <div
                      className="fixed z-50 w-56 rounded-2xl border border-[#ded6c8] bg-[#fffdf8] p-2 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
                      style={{
                        left: 'var(--wtt-agent-rail-width)',
                        top: 'calc(var(--wtt-topbar-height) + 1rem)',
                      }}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="px-2 pb-2">
                        <div className="truncate text-xs font-black text-slate-700 dark:text-zinc-100" title={folder.label}>
                          {folder.label}
                        </div>
                        <div className="mt-0.5 truncate text-[10px] font-semibold text-slate-400 dark:text-zinc-500" title={folderCloudHostId || undefined}>
                          {folderCloudHostId || (cloudHostIds.length > 1
                            ? (zh ? '该目录包含多个 Sandbox' : 'Multiple Sandboxes in this folder')
                            : (zh ? '非 Cloud Sandbox 目录' : 'Not a Cloud Sandbox folder'))}
                        </div>
                      </div>
                      {folderCloudHostId ? (
                        <>
                          <button
                            type="button"
                            disabled={!onWakeSandbox || sandboxActionBusy}
                            onClick={() => {
                              void runSandboxFolderAction(folderCloudHostId, 'wake')
                            }}
                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-sky-700 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-sky-300 dark:hover:bg-sky-500/10"
                          >
                            {wakeBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                            {wakeBusy ? (zh ? '正在唤醒...' : 'Waking...') : (zh ? '唤醒 Sandbox' : 'Wake Sandbox')}
                          </button>
                          <button
                            type="button"
                            disabled={!onSleepSandbox || sandboxActionBusy}
                            onClick={() => {
                              void runSandboxFolderAction(folderCloudHostId, 'sleep')
                            }}
                            className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-amber-700 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-amber-300 dark:hover:bg-amber-500/10"
                          >
                            {sleepBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
                            {sleepBusy ? (zh ? '正在休眠...' : 'Sleeping...') : (zh ? '休眠 Sandbox' : 'Sleep Sandbox')}
                          </button>
                          {sandboxActionBusy && (
                            <div className="mt-2 rounded-xl bg-sky-50 px-3 py-2 text-[11px] font-semibold text-sky-700 dark:bg-sky-500/10 dark:text-sky-200">
                              {wakeBusy
                                ? (zh ? '正在启动 Sandbox 并等待 Agent 在线。' : 'Starting Sandbox and waiting for the agent to come online.')
                                : (zh ? '正在停止 Sandbox 并等待 Agent 离线。' : 'Stopping Sandbox and waiting for the agent to go offline.')}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500 dark:bg-zinc-800 dark:text-zinc-400">
                          {zh ? '只有 Cloud Agent Sandbox 目录支持休眠/唤醒。' : 'Only Cloud Agent Sandbox folders support sleep/wake.'}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {!collapsed && folder.agents.map((agent) => {
                  const selected = agent.agent_id === selectedAgentId
                  const online = isAgentOnline(agent.agent_id)
                  const role = agentRoleTemplateMap?.[agent.agent_id] || getAgentRoleTemplate(agentRoleMap?.[agent.agent_id])
                  const tone = roleTone(agent.agent_id, role)
                  const runtime = agentRuntimeMap?.[agent.agent_id]
                  const runtimeText = formatRuntime(runtime)
                  const hoverTitle = agentTooltip(agent, role, runtime)
                  const menuOpen = agentMenuFor === agent.agent_id

                  return (
              <div key={agent.agent_id} className="relative">
                <button
                  type="button"
                  onClick={() => {
                    onSelectAgent?.(agent.agent_id)
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    setAgentMenuFor(agent.agent_id)
                  }}
                  title={hoverTitle}
                  className={`group flex w-full flex-col items-center justify-center rounded-xl border px-1 py-1.5 text-center transition ${
                    selected
                      ? tone.selected
                      : `border-transparent bg-white/55 dark:bg-zinc-900/60 ${tone.idle}`
                  }`}
                >
                  <span className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-black shadow-sm ring-2 ${tone.avatar} ${tone.ring}`}>
                    {agentInitial(agent.display_name)}
                    <span
                      className={`absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-[#f6f3ed] dark:border-zinc-950 ${
                        online ? 'bg-emerald-400' : 'bg-slate-300 dark:bg-zinc-600'
                      }`}
                    />
                  </span>
                  <span className={`mt-1 max-w-full truncate text-[9px] font-black leading-none ${tone.label}`} title={hoverTitle}>
                    {role.shortLabel}
                  </span>

                  <span className="hidden min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-black text-slate-800 dark:text-zinc-100">
                        {agent.display_name || agent.agent_id}
                      </span>
                      <span className="shrink-0 rounded-full bg-[#dfe8d8] px-2 py-0.5 text-[10px] font-black text-[#46624b] dark:bg-emerald-500/15 dark:text-emerald-200">
                        {role.shortLabel}
                      </span>
                    </span>
                    {runtimeText && (
                      <span
                        className="mt-0.5 block truncate text-[10px] font-semibold text-slate-400 dark:text-zinc-500"
                        title={agentRuntimeMap?.[agent.agent_id]?.workdir || runtimeText}
                      >
                        {runtimeText}
                      </span>
                    )}
                  </span>

                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(event) => {
                      event.stopPropagation()
                      setAgentMenuFor(menuOpen ? null : agent.agent_id)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        event.stopPropagation()
                        setAgentMenuFor(menuOpen ? null : agent.agent_id)
                      }
                    }}
                    className="hidden rounded-lg p-1 text-slate-400 opacity-70 transition hover:bg-[#f6f0e5] hover:text-slate-700 group-hover:opacity-100 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                    title={zh ? 'Agent 设置' : 'Agent settings'}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </span>
                </button>

                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setAgentMenuFor(null)} />
                    <div
                      className="fixed z-50 overflow-y-auto rounded-2xl border border-[#ded6c8] bg-[#fffdf8] p-2 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
                      style={{
                        left: 'var(--wtt-agent-rail-width)',
                        top: 'calc(var(--wtt-topbar-height) + 1rem)',
                        maxHeight: 'calc(100dvh - var(--wtt-topbar-height) - 2rem)',
                        width: 'min(280px, calc(100vw - var(--wtt-agent-rail-width) - 16px))',
                      }}
                    >
                      <div className="px-2 pb-2 text-xs font-black uppercase tracking-[0.18em] text-slate-400 dark:text-zinc-500">
                        {zh ? '角色模板' : 'Role Templates'}
                      </div>
                      <div className="max-h-[50vh] overflow-y-auto">
                        {AGENT_ROLE_TEMPLATES.map((template) => {
                          const active = template.id === role.id
                          const displayDescription = active ? role.description : template.description
                          return (
                          <button
                            key={template.id}
                            type="button"
                            onContextMenu={(event) => {
                              event.preventDefault()
                              setRoleEditor({
                                agentId: agent.agent_id,
                                sourceRole: template,
                                label: template.label,
                                description: (active ? role.description : template.description) || template.description,
                                custom: false,
                              })
                            }}
                            onClick={() => {
                              onAssignAgentRole?.(agent.agent_id, template.id)
                              setAgentMenuFor(null)
                            }}
                            className={`w-full rounded-xl px-3 py-2 text-left transition ${
                              active
                                ? 'bg-[#e6f1df] text-[#385b3d] dark:bg-emerald-500/15 dark:text-emerald-200'
                                : 'text-slate-600 hover:bg-[#f3eee5] dark:text-zinc-300 dark:hover:bg-zinc-800'
                            }`}
                          >
                            <span className="block truncate text-sm font-black" title={template.label}>{template.label}</span>
                            <span className="mt-0.5 block line-clamp-2 text-xs opacity-75" title={displayDescription}>{displayDescription}</span>
                          </button>
                          )
                        })}
                        {role.id.startsWith('custom-') && (
                          <button
                            type="button"
                            onContextMenu={(event) => {
                              event.preventDefault()
                              setRoleEditor({
                                agentId: agent.agent_id,
                                sourceRole: role,
                                label: role.label,
                                description: role.description,
                                custom: false,
                              })
                            }}
                            onClick={() => {
                              setRoleEditor({
                                agentId: agent.agent_id,
                                sourceRole: role,
                                label: role.label,
                                description: role.description,
                                custom: false,
                              })
                            }}
                            className="w-full rounded-xl bg-[#e6f1df] px-3 py-2 text-left text-[#385b3d] transition dark:bg-emerald-500/15 dark:text-emerald-200"
                          >
                            <span className="block truncate text-sm font-black" title={role.label}>{role.label}</span>
                            <span className="mt-0.5 block line-clamp-2 text-xs opacity-75" title={role.description}>{role.description}</span>
                          </button>
                        )}
                      </div>

                      {onSaveAgentRole && (
                        <div className="mt-2 border-t border-[#eee6da] pt-2 dark:border-zinc-800">
                          <button
                            type="button"
                            onClick={() => {
                              setRoleEditor({
                                agentId: agent.agent_id,
                                label: '',
                                description: '',
                                custom: true,
                              })
                            }}
                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-sky-700 transition hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-500/10"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            {zh ? '新增自定义角色' : 'Add custom role'}
                          </button>
                          <p className="px-3 pt-1 text-[10px] text-slate-400 dark:text-zinc-500">
                            {zh ? '右键已有角色可编辑当前 Agent 的角色描述。' : 'Right-click a role to edit this agent role description.'}
                          </p>
                        </div>
                      )}

                      {((userToken && isAgentOnline(agent.agent_id)) || onRenameAgent || onUnclaimAgent) && (
                        <div className="mt-2 border-t border-[#eee6da] pt-2 dark:border-zinc-800">
                          {userToken && isAgentOnline(agent.agent_id) && (
                            <button
                              type="button"
                              onClick={() => {
                                setShellAgent(agent)
                                setAgentMenuFor(null)
                              }}
                              className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-600 transition hover:bg-[#f3eee5] dark:text-zinc-300 dark:hover:bg-zinc-800"
                            >
                              {zh ? '打开 Terminal' : 'Open Terminal'}
                            </button>
                          )}
                          {onRenameAgent && (
                            <button
                              type="button"
                              onClick={() => {
                                onRenameAgent(agent.agent_id, agent.display_name)
                                setAgentMenuFor(null)
                              }}
                              className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-600 transition hover:bg-[#f3eee5] dark:text-zinc-300 dark:hover:bg-zinc-800"
                            >
                              {zh ? '重命名 Agent' : 'Rename Agent'}
                            </button>
                          )}
                          {onUnclaimAgent && (
                            <button
                              type="button"
                              onClick={() => {
                                onUnclaimAgent(agent.agent_id)
                                setAgentMenuFor(null)
                              }}
                              className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-red-500 transition hover:bg-red-50 dark:hover:bg-red-500/10"
                            >
                              {t('agent.unclaim')}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
                  )
                })}
              </section>
            )
          })}
        </div>

        {newAgentHosts.length > 0 && (
          <div className="space-y-1.5 border-t border-[#e7e1d7] p-1.5 dark:border-zinc-800">
            <button
              type="button"
              onClick={openNewAgentModal}
              className="flex w-full flex-col items-center justify-center rounded-xl border border-emerald-400 bg-gradient-to-b from-emerald-500 to-teal-600 px-1 py-2 text-center text-[9px] font-black leading-tight text-white shadow-md shadow-emerald-900/15 ring-1 ring-emerald-200 transition hover:from-emerald-400 hover:to-teal-500 hover:shadow-lg dark:border-emerald-400/60 dark:from-emerald-500 dark:to-teal-600 dark:ring-emerald-400/25"
              title={zh ? '克隆当前在线 Codex / Claude Code 主机上的 Agent' : 'Clone an agent on an online Codex / Claude Code host'}
            >
              <Plus className="mb-1 h-4 w-4" />
              <span>Clone</span>
              <span>Agent</span>
            </button>
          </div>
        )}
      </aside>

      {onStartAgentResize && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize agent column"
          title={zh ? '拖拽调整 Agent 栏宽度' : 'Drag to resize agents'}
          onPointerDown={onStartAgentResize}
          className="group relative z-10 hidden w-1.5 shrink-0 cursor-col-resize items-stretch justify-center bg-[#e1d6c5] transition hover:bg-emerald-300 dark:bg-zinc-800 dark:hover:bg-emerald-500 md:flex"
        >
          <span className="my-auto h-10 w-0.5 rounded-full bg-[#a99d8d] opacity-0 transition group-hover:opacity-100 dark:bg-zinc-500" />
        </div>
      )}

      <aside className="flex w-[var(--wtt-topic-rail-width)] shrink-0 flex-col border-r border-[#e3ddd2] bg-[#fbfaf7] text-slate-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
        <div className={`flex items-center justify-between border-b border-[#e7e1d7] dark:border-zinc-800 ${compactLayout ? 'px-2 py-2' : 'px-3 py-3'}`}>
          <div>
            <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400 dark:text-zinc-500">
              Topics
            </div>
            <div className={`mt-1 text-sm font-semibold text-slate-600 dark:text-zinc-300 ${compactLayout ? 'hidden 2xl:block' : ''}`}>
              {zh ? '当前 Agent 的会话上下文' : 'Contexts for selected agent'}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {onCreateGeneralTask && (
              <button
                type="button"
                onClick={onCreateGeneralTask}
                className="rounded-lg border border-[#ded6c8] bg-white/80 p-1.5 text-slate-500 transition hover:bg-white hover:text-slate-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                title={zh ? '新建任务' : 'New task'}
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
            {onToggleSidebar && (
              <button
                type="button"
                onClick={onToggleSidebar}
                className="rounded-lg border border-[#ded6c8] bg-white/80 px-2 py-1.5 text-xs font-black text-slate-500 transition hover:bg-white hover:text-slate-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                title={zh ? '收起侧栏' : 'Collapse sidebar'}
              >
                {'<<'}
              </button>
            )}
          </div>
        </div>

        <div className={`min-h-0 flex-1 overflow-y-auto ${compactLayout ? 'p-1.5' : 'p-2.5'}`}>
          {!selectedAgentId && (
            <div className="rounded-2xl border border-dashed border-[#ded6c8] bg-white/60 p-4 text-sm text-slate-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
              {zh ? '先选择一个 Agent。' : 'Select an agent first.'}
            </div>
          )}

          {selectedAgentId && topics.length === 0 && (
            <div className="rounded-2xl border border-dashed border-[#ded6c8] bg-white/60 p-4 text-sm text-slate-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
              {zh ? '当前 Agent 暂无普通 topic。' : 'No regular topics for this agent.'}
            </div>
          )}

          <div className="space-y-3">
            {groupedTopics.map(({ group, items }) => {
              const collapsed = collapsedGroups[group]
              const GroupIcon = getGroupIcon(group)
              const unreadTopics = items.filter((topic) => Number(topic.unread_count || 0) > 0).length
              return (
                <section key={group} className="space-y-1.5">
                  <button
                    type="button"
                    onClick={() => setCollapsedGroups((prev) => ({ ...prev, [group]: !prev[group] }))}
                    className={`flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left shadow-sm transition hover:brightness-[0.98] ${getGroupTone(group)}`}
                  >
                    {collapsed ? <ChevronRight className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/70 dark:bg-zinc-950/40">
                      <GroupIcon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-black">
                      {getGroupLabel(group, zh)}
                    </span>
                    <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-black dark:bg-zinc-950/40">
                      {items.length}
                    </span>
                    {unreadTopics > 0 && (
                      <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-black leading-none text-white">
                        {unreadTopics > 99 ? '99+' : unreadTopics}
                      </span>
                    )}
                  </button>

                  {!collapsed && (
                    <div className="space-y-1.5">
                      {items.length > 0 ? (
                        items.map((topic) => renderTopicRow(topic))
                      ) : (
                        <div className="rounded-xl border border-dashed border-[#ded6c8] bg-white/45 px-3 py-2 text-xs font-semibold text-slate-400 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-500">
                          {zh ? '暂无该类型 topic' : 'No topics in this group'}
                        </div>
                      )}
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        </div>
      </aside>

      {roleEditor && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 p-4">
          <div className="w-full max-w-md rounded-2xl border border-[#ded6c8] bg-[#fffdf8] p-4 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
            <div className="mb-3">
              <h3 className="text-sm font-black text-slate-900 dark:text-zinc-100">
                {roleEditor.custom ? (zh ? '新增自定义角色' : 'Add Custom Role') : (zh ? '编辑角色描述' : 'Edit Role Description')}
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
                {zh ? '保存后会同步到后端，并在该 Agent 下一次执行时作为隐式角色提示。' : 'Saved changes sync to the backend and are injected on the next agent action.'}
              </p>
            </div>
            <label className="mb-3 block">
              <span className="mb-1 block text-xs font-black text-slate-500 dark:text-zinc-400">{zh ? '角色名称' : 'Role name'}</span>
              <input
                value={roleEditor.label}
                disabled={!roleEditor.custom}
                onChange={(event) => setRoleEditor((prev) => prev ? { ...prev, label: event.target.value } : prev)}
                placeholder={zh ? '例如：Linux 内核专家' : 'e.g. Linux Kernel Expert'}
                className="w-full rounded-xl border border-[#ded6c8] bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition focus:border-sky-400 disabled:bg-slate-100 disabled:text-slate-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:disabled:bg-zinc-800"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-black text-slate-500 dark:text-zinc-400">{zh ? '角色描述' : 'Role description'}</span>
              <textarea
                value={roleEditor.description}
                onChange={(event) => setRoleEditor((prev) => prev ? { ...prev, description: event.target.value } : prev)}
                rows={5}
                placeholder={zh ? '描述这个 Agent 应该关注的领域、判断标准、输出风格和边界。' : 'Describe focus areas, decision criteria, output style, and boundaries.'}
                className="w-full resize-none rounded-xl border border-[#ded6c8] bg-white px-3 py-2 text-sm leading-6 text-slate-800 outline-none transition focus:border-sky-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRoleEditor(null)}
                className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                {zh ? '取消' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={saveRoleEditor}
                disabled={!roleEditor.label.trim() || !roleEditor.description.trim()}
                className="rounded-xl bg-sky-600 px-3 py-2 text-sm font-black text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {zh ? '保存并同步' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {newAgentOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-[#ded6c8] bg-[#fffdf8] p-4 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
            <div className="mb-4">
              <h3 className="text-sm font-black text-slate-900 dark:text-zinc-100">
                {zh ? '克隆 Agent' : 'Clone Agent'}
              </h3>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-zinc-400">
                {zh ? '选择一个在线 Codex / Claude Code 主机和角色。系统会自动 clone 一个 agent，并在该主机上启动独立默认 workspace。' : 'Choose an online Codex / Claude Code host and role. WTT will clone an agent and start it with its own default workspace.'}
              </p>
            </div>

            <label className="mb-4 block">
              <span className="mb-1 block text-xs font-black text-slate-500 dark:text-zinc-400">{zh ? '运行主机' : 'Host'}</span>
              <select
                value={newAgentHostId}
                onChange={(event) => {
                  const hostId = event.target.value
                  setNewAgentHostId(hostId)
                  setNewAgentAdapter((normalizeNewAgentAdapter(agentRuntimeMap?.[hostId]) || 'claude-code') as 'claude-code' | 'codex')
                }}
                disabled={newAgentBusy}
                className="w-full rounded-xl border border-[#ded6c8] bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition focus:border-sky-400 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              >
                {newAgentHosts.map((agent) => {
                  const runtime = agentRuntimeMap?.[agent.agent_id]
                  const adapter = normalizeNewAgentAdapter(runtime)
                  const hostLabel = [agent.display_name || agent.agent_id, adapter, runtime?.hostname].filter(Boolean).join(' · ')
                  return (
                    <option key={agent.agent_id} value={agent.agent_id}>
                      {hostLabel}
                    </option>
                  )
                })}
              </select>
            </label>

            <div className="mb-4">
              <div className="mb-2 text-xs font-black text-slate-500 dark:text-zinc-400">{zh ? '运行 Adapter' : 'Adapter'}</div>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ['claude-code', 'Claude Code'],
                  ['codex', 'Codex'],
                ] as const).map(([id, label]) => {
                  const active = newAgentAdapter === id
                  return (
                    <button
                      key={id}
                      type="button"
                      disabled={newAgentBusy}
                      onClick={() => setNewAgentAdapter(id)}
                      className={`rounded-xl border px-3 py-2 text-left text-sm font-black transition ${
                        active
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/45 dark:bg-emerald-500/15 dark:text-emerald-200'
                          : 'border-[#eee6da] bg-white/70 text-slate-600 hover:border-[#ded6c8] hover:bg-[#f3eee5] dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-800'
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <div className="mb-2 text-xs font-black text-slate-500 dark:text-zinc-400">{zh ? '角色' : 'Role'}</div>
              <div className="grid max-h-[42vh] gap-2 overflow-y-auto sm:grid-cols-2">
                {AGENT_ROLE_TEMPLATES.map((template) => {
                  const active = template.id === newAgentRoleId
                  return (
                    <button
                      key={template.id}
                      type="button"
                      disabled={newAgentBusy}
                      onClick={() => setNewAgentRoleId(template.id)}
                      className={`rounded-xl border px-3 py-2 text-left transition ${
                        active
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/45 dark:bg-emerald-500/15 dark:text-emerald-200'
                          : 'border-[#eee6da] bg-white/70 text-slate-600 hover:border-[#ded6c8] hover:bg-[#f3eee5] dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <span className="block truncate text-sm font-black" title={template.label}>{template.label}</span>
                      <span className="mt-0.5 block line-clamp-2 text-xs opacity-75" title={template.description}>{template.description}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {newAgentError && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                {newAgentError}
              </div>
            )}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewAgentOpen(false)}
                disabled={newAgentBusy}
                className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 disabled:opacity-60 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                {zh ? '取消' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => {
                  void createNewAgentFromHost()
                }}
                disabled={newAgentBusy || !newAgentHostId}
                className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-black text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {newAgentBusy ? (zh ? '创建中...' : 'Creating...') : (zh ? '创建并启动' : 'Create & Start')}
              </button>
            </div>
          </div>
        </div>
      )}

      {shellAgent && (
        <AgentTerminalModal
          agentId={shellAgent.agent_id}
          agentName={shellAgent.display_name || shellAgent.agent_id}
          workdir={agentRuntimeMap?.[shellAgent.agent_id]?.workdir}
          token={userToken}
          onClose={() => setShellAgent(null)}
        />
      )}
    </>
  )
}
