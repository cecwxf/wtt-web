'use client'

import { ChevronDown, ChevronRight, ClipboardList, Hash, Lock, MessageCircle, MoreVertical, Plus, Radio, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AGENT_ROLE_TEMPLATES,
  getAgentRoleTemplate,
  type AgentRoleTemplateId,
} from '@/lib/agent-role-templates'
import { AgentTerminalModal } from '@/components/ui/agent-terminal-modal'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'
import { useI18n } from '@/lib/i18n-provider'

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
}

interface WorkerItem {
  id: string
  agent_id: string
  name: string
  description?: string
  skills_config?: string[]
  status?: string
  topic_id?: string
}

export interface AgentRuntimeInfo {
  kind?: string
  adapter?: string
  workdir?: string
  workdir_name?: string
  hostname?: string
  platform?: string
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
  agentRuntimeMap?: Record<string, AgentRuntimeInfo>
  onAssignAgentRole?: (agentId: string, roleId: AgentRoleTemplateId) => void
  onRenameAgent?: (agentId: string, currentName: string) => void
  onUnclaimAgent?: (agentId: string) => void
  onCreateGeneralTask?: () => void
  onToggleSidebar?: () => void
  localLibrarySlot?: ReactNode
  userToken?: string
}

function agentInitial(name: string) {
  return (name.trim()[0] || 'A').toUpperCase()
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
  return [workdir, branch, adapter].filter(Boolean).join(' · ')
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
    onSelectWorkerTopic,
    isSelectedAgentOnline = false,
    onlineAgentIds,
    agentRoleMap,
    agentRuntimeMap,
    onAssignAgentRole,
    onRenameAgent,
    onUnclaimAgent,
    onCreateGeneralTask,
    onToggleSidebar,
    userToken,
  } = props
  const [agentMenuFor, setAgentMenuFor] = useState<string | null>(null)
  const [topicMenuFor, setTopicMenuFor] = useState<string | null>(null)
  const [shellAgent, setShellAgent] = useState<AgentOption | null>(null)
  const [workersByAgent, setWorkersByAgent] = useState<Record<string, WorkerItem[]>>({})
  const [openingWorkerId, setOpeningWorkerId] = useState<string | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<TopicGroupKey, boolean>>({
    p2p: false,
    task: false,
    discuss: false,
    subscriber: false,
  })
  const { locale, t } = useI18n()
  const zh = locale === 'zh'

  const isAgentOnline = (agentId: string) => {
    if (onlineAgentIds) return onlineAgentIds.has(agentId)
    return agentId === selectedAgentId ? isSelectedAgentOnline : false
  }

  const fetchWorkers = useCallback(async (agentId: string) => {
    if (!agentId) return
    try {
      const headers: Record<string, string> = {}
      if (userToken) headers.Authorization = `Bearer ${userToken}`
      const response = await fetch(`${CLIENT_WTT_API_BASE}/workers?agent_id=${encodeURIComponent(agentId)}`, {
        credentials: 'include',
        headers,
      })
      if (!response.ok) return
      const data = await response.json()
      if (Array.isArray(data)) {
        setWorkersByAgent((prev) => ({ ...prev, [agentId]: data }))
      }
    } catch {
      // Worker shortcuts are best-effort; the topic list still works without them.
    }
  }, [userToken])

  useEffect(() => {
    if (!selectedAgentId) return
    void fetchWorkers(selectedAgentId)
  }, [selectedAgentId, fetchWorkers])

  const openWorkerTopic = async (agentId: string, worker: WorkerItem) => {
    if (!onSelectWorkerTopic || openingWorkerId) return
    setOpeningWorkerId(worker.id)
    try {
      const headers: Record<string, string> = {}
      if (userToken) headers.Authorization = `Bearer ${userToken}`
      const response = await fetch(`${CLIENT_WTT_API_BASE}/workers/${encodeURIComponent(worker.id)}/session`, {
        method: 'POST',
        credentials: 'include',
        headers,
      })
      if (!response.ok) throw new Error(await response.text())
      const data = await response.json()
      const topicId = String(data.topic_id || worker.topic_id || '')
      if (!topicId) return
      setWorkersByAgent((prev) => {
        const rows = prev[agentId] || []
        return { ...prev, [agentId]: rows.map((row) => row.id === worker.id ? { ...row, topic_id: topicId } : row) }
      })
      onSelectWorkerTopic(topicId, {
        workerId: worker.id,
        personaMd: String(data.persona_md || ''),
        workerMd: String(data.worker_md || ''),
        isFirstSession: Boolean(data.is_first_session ?? false),
        personaChanged: Boolean(data.persona_changed ?? false),
      })
    } catch {
      // Keep the UI quiet; failures still surface through the topic/chat path.
    } finally {
      setOpeningWorkerId(null)
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
          <div className="absolute right-2 top-10 z-30 w-40 rounded-xl border border-[#ded6c8] bg-[#fffdf8] p-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
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
      <aside className="flex w-[208px] shrink-0 flex-col border-r border-[#e3ddd2] bg-[#f6f3ed] text-slate-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
        <div className="border-b border-[#e7e1d7] px-3 py-3 dark:border-zinc-800">
          <div className="text-xs font-black uppercase tracking-[0.22em] text-slate-400 dark:text-zinc-500">
            {zh ? 'Agents' : 'Agents'}
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-600 dark:text-zinc-300">
            {zh ? '选择工作身份' : 'Choose workspace identity'}
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2.5">
          {agentOptions.length === 0 && (
            <div className="rounded-2xl border border-dashed border-[#ded6c8] bg-white/55 p-4 text-sm text-slate-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
              {t('agent.noAgents')}
            </div>
          )}

          {agentOptions.map((agent) => {
            const selected = agent.agent_id === selectedAgentId
            const online = isAgentOnline(agent.agent_id)
            const role = getAgentRoleTemplate(agentRoleMap?.[agent.agent_id])
            const runtimeText = selected ? formatRuntime(agentRuntimeMap?.[agent.agent_id]) : ''
            const menuOpen = agentMenuFor === agent.agent_id
            const workers = workersByAgent[agent.agent_id] || []

            return (
              <div key={agent.agent_id} className="relative">
                <button
                  type="button"
                  onClick={() => {
                    onSelectAgent?.(agent.agent_id)
                    void fetchWorkers(agent.agent_id)
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    setAgentMenuFor(agent.agent_id)
                  }}
                  className={`group flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition ${
                    selected
                      ? 'border-[#d7cbb9] bg-[#ebe5db] shadow-sm dark:border-emerald-500/35 dark:bg-emerald-500/10'
                      : 'border-transparent bg-white/55 hover:border-[#ded6c8] hover:bg-white/80 dark:bg-zinc-900/60 dark:hover:border-zinc-700 dark:hover:bg-zinc-900'
                  }`}
                >
                  <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#28241f] text-xs font-black text-[#f5ead8] shadow-sm dark:bg-zinc-800">
                    {agentInitial(agent.display_name)}
                    <span
                      className={`absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-[#f6f3ed] dark:border-zinc-950 ${
                        online ? 'bg-emerald-400' : 'bg-slate-300 dark:bg-zinc-600'
                      }`}
                    />
                  </span>

                  <span className="min-w-0 flex-1">
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
                    className="rounded-lg p-1 text-slate-400 opacity-70 transition hover:bg-[#f6f0e5] hover:text-slate-700 group-hover:opacity-100 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                    title={zh ? 'Agent 设置' : 'Agent settings'}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </span>
                </button>

                {selected && workers.length > 0 && (
                  <div className="ml-10 mt-1 space-y-1 pb-1 pr-1">
                    <div className="px-1 text-[9px] font-black uppercase tracking-[0.16em] text-slate-400 dark:text-zinc-500">
                      P2P Workers
                    </div>
                    {workers.map((worker) => (
                      <button
                        key={worker.id}
                        type="button"
                        onClick={() => openWorkerTopic(agent.agent_id, worker)}
                        className="flex w-full items-center gap-1.5 rounded-lg border border-transparent px-2 py-1.5 text-left text-[11px] font-semibold text-slate-500 transition hover:border-[#ded6c8] hover:bg-white/80 hover:text-slate-800 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
                        title={worker.description || worker.name}
                      >
                        <Lock className="h-3 w-3 shrink-0" />
                        <span className="min-w-0 flex-1 truncate">Worker: {worker.name}</span>
                        {openingWorkerId === worker.id && <span className="text-[10px] text-teal-600">...</span>}
                      </button>
                    ))}
                  </div>
                )}

                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setAgentMenuFor(null)} />
                    <div className="fixed left-[212px] top-20 z-50 max-h-[calc(100vh-6rem)] w-[min(280px,calc(100vw-224px))] overflow-y-auto rounded-2xl border border-[#ded6c8] bg-[#fffdf8] p-2 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
                      <div className="px-2 pb-2 text-xs font-black uppercase tracking-[0.18em] text-slate-400 dark:text-zinc-500">
                        {zh ? '角色模板' : 'Role Templates'}
                      </div>
                      <div className="max-h-[50vh] overflow-y-auto">
                        {AGENT_ROLE_TEMPLATES.map((template) => {
                          const active = template.id === role.id
                          return (
                          <button
                            key={template.id}
                            type="button"
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
                            <span className="mt-0.5 block line-clamp-2 text-xs opacity-75" title={template.description}>{template.description}</span>
                          </button>
                          )
                        })}
                      </div>

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
                              {zh ? '打开 Shell' : 'Open Shell'}
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
        </div>
      </aside>

      <aside className="flex w-[264px] shrink-0 flex-col border-r border-[#e3ddd2] bg-[#fbfaf7] text-slate-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
        <div className="flex items-center justify-between border-b border-[#e7e1d7] px-3 py-3 dark:border-zinc-800">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.22em] text-slate-400 dark:text-zinc-500">
              Topics
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-600 dark:text-zinc-300">
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

        <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
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
