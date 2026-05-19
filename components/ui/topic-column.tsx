'use client'

import { Bot, ClipboardList, Hash, Lock, MessageCircle, MoreVertical, Pin, Plus, Radio, Users, ChevronDown, ChevronRight } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/lib/i18n-provider'
import { AGENT_ROLE_TEMPLATES, getAgentRoleTemplate } from '@/lib/agent-role-templates'

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

interface TopicColumnProps {
  topics: TopicItem[]
  selectedTopicId: string | null
  onSelectTopic: (topicId: string | null) => void
  onLeaveTopic?: (topicId: string) => void
  onDeleteTopic?: (topicId: string) => void
  onCreateP2P?: (targetAgentId: string) => Promise<void>
  onRequestDiscuss?: (targetAgentId: string, topicName: string) => Promise<void>
  onRequestMember?: (targetAgentId: string, topicId: string) => Promise<void>
  pinScopeKey?: string
  agentOptions?: Array<{ agent_id: string; display_name: string }>
  selectedAgentId?: string
  onSelectAgent?: (agentId: string) => void
  isSelectedAgentOnline?: boolean
  onlineAgentIds?: Set<string>
  agentRoleMap?: Record<string, string>
  onAssignAgentRole?: (agentId: string, roleId: string) => void
  onRenameAgent?: (agentId: string, currentName: string) => void
  onUnclaimAgent?: (agentId: string) => void
  onCreateGeneralTask?: () => void
  onToggleSidebar?: () => void
  localLibrarySlot?: React.ReactNode
}

function getTopicIcon(type: string, isTask?: boolean) {
  if (isTask) return Bot
  switch (type) {
    case 'p2p':
      return Lock
    case 'collaborative':
      return Users
    default:
      return Hash
  }
}

type TopicGroupKey = 'p2p' | 'task' | 'discuss' | 'subscriber'
type TaskTypeKey = 'general' | 'code' | 'research'

function getTopicGroup(topic: TopicItem): TopicGroupKey {
  if (topic.topic_type === 'p2p') return 'p2p'
  if (topic.task_id) return 'task'
  if (topic.topic_type === 'broadcast') return 'subscriber'
  return 'discuss'
}

function getGroupLabelKey(group: TopicGroupKey): string {
  switch (group) {
    case 'p2p':
      return 'topic.group.p2p'
    case 'task':
      return 'topic.group.task'
    case 'discuss':
      return 'topic.group.discuss'
    case 'subscriber':
      return 'topic.group.subscriber'
  }
}

function getGroupChrome(group: TopicGroupKey) {
  switch (group) {
    case 'p2p':
      return {
        Icon: Lock,
        header: 'border-transparent bg-transparent text-[#7a766e] dark:text-zinc-400',
        icon: 'bg-[#ece8df] text-[#6c675d] dark:bg-zinc-800 dark:text-zinc-300',
        count: 'bg-[#ece8df] text-[#7a766e] dark:bg-zinc-800 dark:text-zinc-300',
      }
    case 'task':
      return {
        Icon: ClipboardList,
        header: 'border-transparent bg-transparent text-[#7a766e] dark:text-zinc-400',
        icon: 'bg-[#ece8df] text-[#6c675d] dark:bg-zinc-800 dark:text-zinc-300',
        count: 'bg-[#ece8df] text-[#7a766e] dark:bg-zinc-800 dark:text-zinc-300',
      }
    case 'discuss':
      return {
        Icon: MessageCircle,
        header: 'border-transparent bg-transparent text-[#7a766e] dark:text-zinc-400',
        icon: 'bg-[#ece8df] text-[#6c675d] dark:bg-zinc-800 dark:text-zinc-300',
        count: 'bg-[#ece8df] text-[#7a766e] dark:bg-zinc-800 dark:text-zinc-300',
      }
    case 'subscriber':
      return {
        Icon: Radio,
        header: 'border-transparent bg-transparent text-[#7a766e] dark:text-zinc-400',
        icon: 'bg-[#ece8df] text-[#6c675d] dark:bg-zinc-800 dark:text-zinc-300',
        count: 'bg-[#ece8df] text-[#7a766e] dark:bg-zinc-800 dark:text-zinc-300',
      }
  }
}

function stripTaskPrefix(name: string): string {
  return name.replace(/^TASK-[a-f0-9]{8}\s*/i, '')
}

function normalizeTaskType(type?: string, taskMode?: string, execMode?: string): TaskTypeKey {
  const raw = `${String(type || '').toLowerCase()} ${String(taskMode || '').toLowerCase()} ${String(execMode || '').toLowerCase()}`
  if (raw.includes('research')) return 'research'
  if (raw.includes('code')) return 'code'
  return 'general'
}

function taskTypeInitial(type: TaskTypeKey): string {
  switch (type) {
    case 'code':
      return 'C'
    case 'research':
      return 'R'
    default:
      return 'G'
  }
}

function taskTypeLabel(type: TaskTypeKey): string {
  switch (type) {
    case 'code':
      return 'Code Task'
    case 'research':
      return 'Research Task'
    default:
      return 'General Task'
  }
}

function taskTypeTone(type: TaskTypeKey): string {
  switch (type) {
    case 'code':
      return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
    case 'research':
      return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
    default:
      return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
  }
}

export function TopicColumn({
  topics,
  selectedTopicId,
  onSelectTopic,
  onLeaveTopic,
  onDeleteTopic,
  onRequestDiscuss,
  pinScopeKey,
  agentOptions,
  selectedAgentId,
  onSelectAgent,
  isSelectedAgentOnline,
  onlineAgentIds,
  agentRoleMap,
  onAssignAgentRole,
  onRenameAgent,
  onUnclaimAgent,
  onCreateGeneralTask,
  onToggleSidebar,
  localLibrarySlot,
}: TopicColumnProps) {
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [pinnedTopicIds, setPinnedTopicIds] = useState<string[]>([])
  const [topicAliases, setTopicAliases] = useState<Record<string, string>>({})
  const [renamingTopicId, setRenamingTopicId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  // Discuss topic request form
  const [showDiscussForm, setShowDiscussForm] = useState(false)
  const [discussAgentId, setDiscussAgentId] = useState('')
  const [discussTopicName, setDiscussTopicName] = useState('')
  const [creatingDiscuss, setCreatingDiscuss] = useState(false)
  const [agentMenuFor, setAgentMenuFor] = useState<string | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<TopicGroupKey, boolean>>({
    p2p: false,
    task: false,
    discuss: false,
    subscriber: false,
  })
  const [collapsedTaskTypeGroups, setCollapsedTaskTypeGroups] = useState<Record<TaskTypeKey, boolean>>({
    general: false,
    code: false,
    research: false,
  })
  const { t } = useI18n()

  // Load pinned topics
  useEffect(() => {
    const key = `wtt:pinned-topics:${pinScopeKey || 'default'}`
    try {
      const raw = localStorage.getItem(key)
      const parsed = raw ? (JSON.parse(raw) as unknown) : []
      if (Array.isArray(parsed)) {
        setPinnedTopicIds(parsed.filter((x): x is string => typeof x === 'string'))
      } else {
        setPinnedTopicIds([])
      }
    } catch {
      setPinnedTopicIds([])
    }
  }, [pinScopeKey])

  // Load local topic aliases
  useEffect(() => {
    const key = `wtt:topic-aliases:${pinScopeKey || 'default'}`
    try {
      const raw = localStorage.getItem(key)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object') setTopicAliases(parsed as Record<string, string>)
      }
    } catch { /* ignore */ }
  }, [pinScopeKey])

  const saveTopicAlias = (topicId: string, alias: string) => {
    const key = `wtt:topic-aliases:${pinScopeKey || 'default'}`
    setTopicAliases(prev => {
      const next = { ...prev }
      if (alias.trim()) next[topicId] = alias.trim()
      else delete next[topicId]
      try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }

  const togglePinTopic = (topicId: string) => {
    const key = `wtt:pinned-topics:${pinScopeKey || 'default'}`
    setPinnedTopicIds((prev) => {
      const next = prev.includes(topicId) ? prev.filter((id) => id !== topicId) : [topicId, ...prev]
      try {
        localStorage.setItem(key, JSON.stringify(next))
      } catch {
        // ignore storage failure
      }
      return next
    })
  }

  const handleRequestDiscuss = async () => {
    const agent = discussAgentId.trim()
    const name = discussTopicName.trim()
    if (!agent || !name || !onRequestDiscuss) return
    setCreatingDiscuss(true)
    try {
      await onRequestDiscuss(agent, name)
      setDiscussAgentId('')
      setDiscussTopicName('')
      setShowDiscussForm(false)
    } catch {
      // error handled by caller
    } finally {
      setCreatingDiscuss(false)
    }
  }

  const toggleGroup = (group: TopicGroupKey) => {
    setCollapsedGroups((prev) => ({ ...prev, [group]: !prev[group] }))
  }

  const toggleTaskTypeGroup = (group: TaskTypeKey) => {
    setCollapsedTaskTypeGroups((prev) => ({ ...prev, [group]: !prev[group] }))
  }

  const groupedTopics = useMemo(() => {
    const order: TopicGroupKey[] = ['p2p', 'task', 'discuss', 'subscriber']
    const byGroup = new Map<TopicGroupKey, Array<TopicItem & { __idx: number }>>()
    for (const group of order) byGroup.set(group, [])

    topics.forEach((topic, idx) => {
      const group = getTopicGroup(topic)
      byGroup.get(group)?.push({ ...(topic as TopicItem), __idx: idx })
    })

    for (const group of order) {
      const rows = byGroup.get(group) || []
      rows.sort((a, b) => {
        const aDefaultP2P = !!a.is_default_p2p
        const bDefaultP2P = !!b.is_default_p2p
        if (aDefaultP2P && !bDefaultP2P) return -1
        if (!aDefaultP2P && bDefaultP2P) return 1

        const ap = aDefaultP2P || pinnedTopicIds.includes(a.topic_id)
        const bp = bDefaultP2P || pinnedTopicIds.includes(b.topic_id)
        if (ap && !bp) return -1
        if (!ap && bp) return 1

        const au = Number(a.unread_count || 0)
        const bu = Number(b.unread_count || 0)
        if (au > 0 && bu <= 0) return -1
        if (au <= 0 && bu > 0) return 1
        if (bu !== au) return bu - au

        return a.__idx - b.__idx
      })
      byGroup.set(group, rows)
    }

    return order.map((group) => ({ group, items: byGroup.get(group) || [] }))
  }, [topics, pinnedTopicIds])

  const summary = useMemo(() => {
    const counts: Record<TopicGroupKey, number> = { p2p: 0, task: 0, discuss: 0, subscriber: 0 }
    for (const topic of topics) counts[getTopicGroup(topic)] += 1
    return { total: topics.length, ...counts }
  }, [topics])

  const selectedWorkspace = useMemo(() => {
    const agent = agentOptions?.find((item) => item.agent_id === selectedAgentId)
    const role = getAgentRoleTemplate(selectedAgentId ? agentRoleMap?.[selectedAgentId] : undefined)
    const online = selectedAgentId ? (onlineAgentIds?.has(selectedAgentId) ?? !!isSelectedAgentOnline) : false
    const activeTopics = topics.filter((topic) => Number(topic.unread_count || 0) > 0).length
    return {
      agent,
      role,
      online,
      activeTopics,
    }
  }, [agentOptions, selectedAgentId, agentRoleMap, onlineAgentIds, isSelectedAgentOnline, topics])

  const renderTopicRow = (topic: TopicItem) => {
    const isSelected = topic.topic_id === selectedTopicId
    const Icon = getTopicIcon(topic.topic_type, !!topic.task_id)
    const isMenuOpen = menuFor === topic.topic_id
    const isPinned = !!topic.is_default_p2p || pinnedTopicIds.includes(topic.topic_id)
    const displayName = topicAliases[topic.topic_id] || (topic.task_id ? stripTaskPrefix(topic.name) : topic.name)
    const taskGroup = topic.task_id ? normalizeTaskType(topic.task_type, topic.task_mode, topic.exec_mode) : null

    return (
      <div
        key={topic.topic_id}
        className={`relative mt-0.5 rounded-md ${isPinned ? 'border-l-[3px] border-l-[#f87500]' : ''} ${isSelected ? 'bg-[#ebe7df]' : 'hover:bg-[#efebe4] dark:hover:bg-zinc-800/80'}`}
        onContextMenu={(e) => {
          e.preventDefault()
          setMenuFor(topic.topic_id)
        }}
      >
        <button
          onClick={() => onSelectTopic(topic.topic_id)}
          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition ${
            isSelected
              ? 'text-[#1f2328] dark:text-zinc-100'
              : 'text-[#615d55] hover:text-[#1f2328] dark:text-zinc-400 dark:hover:text-zinc-100'
          }`}
        >
          {taskGroup ? (
            <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${taskTypeTone(taskGroup)}`}>
              {taskTypeInitial(taskGroup)}
            </span>
          ) : (
            <Icon className={`h-4 w-4 shrink-0 ${isPinned ? 'text-amber-500' : ''}`} />
          )}
          <div className="min-w-0 flex-1">
            {renamingTopicId === topic.topic_id ? (
              <input
                type="text"
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    saveTopicAlias(topic.topic_id, renameValue)
                    setRenamingTopicId(null)
                  }
                  if (e.key === 'Escape') setRenamingTopicId(null)
                }}
                onBlur={() => {
                  saveTopicAlias(topic.topic_id, renameValue)
                  setRenamingTopicId(null)
                }}
                onClick={(e) => e.stopPropagation()}
                className="w-full bg-transparent text-sm font-medium text-slate-700 dark:text-zinc-200 outline-none border-b border-indigo-400"
              />
            ) : (
              <p className="truncate text-sm font-medium">
                {topic.is_default_p2p ? `【P2P】${displayName}` : displayName}
              </p>
            )}
          </div>
          {isPinned && <Pin className="h-3 w-3 shrink-0 text-amber-500" />}
          <span className="text-slate-400">
            <MoreVertical className="h-4 w-4" />
          </span>
        </button>

        {topic.unread_count && topic.unread_count > 0 ? (
          <span className="pointer-events-none absolute bottom-1.5 right-7 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-semibold leading-none text-white shadow">
            {topic.unread_count > 99 ? '99+' : topic.unread_count}
          </span>
        ) : null}

        {isMenuOpen && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setMenuFor(null)} />
            <div className="absolute right-1 top-11 z-30 w-36 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-1 shadow-lg">
              <button
                className="w-full rounded px-2 py-1.5 text-left text-xs text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={!!topic.is_default_p2p}
                onClick={() => {
                  togglePinTopic(topic.topic_id)
                  setMenuFor(null)
                }}
              >
                {topic.is_default_p2p ? t('topic.pinDefault') : isPinned ? t('topic.unpin') : t('topic.pin')}
              </button>
              <button
                className="w-full rounded px-2 py-1.5 text-left text-xs text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700"
                onClick={() => {
                  setMenuFor(null)
                  setRenameValue(topicAliases[topic.topic_id] || topic.name)
                  setRenamingTopicId(topic.topic_id)
                }}
              >
                ✏️ {t('topic.renameLocal')}
              </button>
              {topicAliases[topic.topic_id] && (
                <button
                  className="w-full rounded px-2 py-1.5 text-left text-xs text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700"
                  onClick={() => {
                    setMenuFor(null)
                    saveTopicAlias(topic.topic_id, '')
                  }}
                >
                  🔄 {t('topic.resetName')}
                </button>
              )}
              <button
                className="w-full rounded px-2 py-1.5 text-left text-xs text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700"
                onClick={() => {
                  setMenuFor(null)
                  let url: string
                  if (topic.task_id && topic.task_type === 'code') url = `${window.location.origin}/tasks/code/${topic.task_id}`
                  else if (topic.task_id && topic.task_type === 'research') url = `${window.location.origin}/tasks/research/${topic.task_id}`
                  else url = `${window.location.origin}/feed?topicId=${topic.topic_id}`
                  navigator.clipboard.writeText(url).catch(() => {})
                }}
              >
                📋 {t('topic.copyLink')}
              </button>
              <button
                className="w-full rounded px-2 py-1.5 text-left text-xs text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700"
                onClick={() => {
                  setMenuFor(null)
                  onLeaveTopic?.(topic.topic_id)
                }}
              >
                {t('topic.leaveTopic')}
              </button>
              <button
                className="w-full rounded px-2 py-1.5 text-left text-xs text-red-500 hover:bg-slate-100 dark:hover:bg-zinc-700"
                onClick={() => {
                  setMenuFor(null)
                  onDeleteTopic?.(topic.topic_id)
                }}
              >
                {t('topic.deleteTopic')}
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full w-[292px] flex-col border-r border-[#e5e0d8] bg-[#f6f3ed] dark:border-zinc-800 dark:bg-zinc-950">
      {localLibrarySlot}
      <div className="border-b border-[#e5e0d8] px-3 py-3 dark:border-zinc-800">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9488] dark:text-zinc-500">
          {t('agent.agents')} · Workspace
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {agentOptions && agentOptions.length > 0 && onSelectAgent && selectedAgentId ? (
          <div className="mb-3 rounded-xl border border-[#e5e0d8] bg-white/60 p-1.5 dark:border-zinc-800 dark:bg-zinc-900/60">
            <div className="mb-1 flex items-center justify-between px-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#9b9488] dark:text-zinc-500">Claimed Agents</p>
              <span className="text-[10px] text-[#aaa298]">{agentOptions.length}</span>
            </div>
            <div className="space-y-1">
              {agentOptions.map((agent) => {
                const isSelected = agent.agent_id === selectedAgentId
                const role = getAgentRoleTemplate(agentRoleMap?.[agent.agent_id])
                const online = onlineAgentIds?.has(agent.agent_id) ?? (isSelected ? !!isSelectedAgentOnline : false)
                return (
                  <div
                    key={agent.agent_id}
                    className="relative"
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setAgentMenuFor(agent.agent_id)
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onSelectAgent(agent.agent_id)
                        setAgentMenuFor(null)
                      }}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition ${
                        isSelected
                          ? 'bg-[#ebe7df] text-[#1f2328]'
                          : 'text-[#615d55] hover:bg-[#efebe4] hover:text-[#1f2328] dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'
                      }`}
                    >
                      <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#e2ddd4] bg-[#f7f5f0] text-xs font-bold dark:border-zinc-800 dark:bg-zinc-950">
                        {(agent.display_name || agent.agent_id).slice(0, 1).toUpperCase()}
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-white dark:border-zinc-950 ${
                            online ? 'bg-emerald-400' : 'bg-slate-300 dark:bg-zinc-600'
                          }`}
                          title={online ? t('agent.online') : t('agent.offline')}
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{agent.display_name || agent.agent_id}</span>
                        <span className="mt-0.5 flex items-center gap-1">
                          <span className="rounded bg-[#f4f1eb] px-1.5 py-0.5 text-[10px] font-semibold text-[#8a8378] dark:bg-zinc-800 dark:text-zinc-400">
                            {role.shortLabel}
                          </span>
                          <span className="truncate text-[10px] text-[#aaa298]">{role.skills.slice(0, 2).join(' / ')}</span>
                        </span>
                      </span>
                      <MoreVertical className="h-3.5 w-3.5 shrink-0 text-[#aaa298]" />
                    </button>

                    {agentMenuFor === agent.agent_id && (
                      <>
                        <div className="fixed inset-0 z-20" onClick={() => setAgentMenuFor(null)} />
                        <div className="absolute right-1 top-10 z-30 w-56 rounded-xl border border-[#e5e0d8] bg-white p-1.5 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                          <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#9b9488]">角色模板</p>
                          {AGENT_ROLE_TEMPLATES.map((template) => (
                            <button
                              key={template.id}
                              className={`w-full rounded-lg px-2 py-1.5 text-left text-xs transition hover:bg-[#f4f1eb] dark:hover:bg-zinc-800 ${
                                role.id === template.id ? 'text-[#9a4b00]' : 'text-[#615d55] dark:text-zinc-300'
                              }`}
                              onClick={() => {
                                onAssignAgentRole?.(agent.agent_id, template.id)
                                setAgentMenuFor(null)
                              }}
                              title={template.description}
                            >
                              <span className="block font-semibold">{template.label}</span>
                              <span className="block truncate text-[10px] text-[#aaa298]">{template.skills.join(' / ')}</span>
                            </button>
                          ))}
                          <div className="my-1 h-px bg-[#eee9df] dark:bg-zinc-800" />
                          <button
                            className="w-full rounded-lg px-2 py-1.5 text-left text-xs text-[#615d55] hover:bg-[#f4f1eb] dark:text-zinc-300 dark:hover:bg-zinc-800 disabled:opacity-50"
                            onClick={() => {
                              setAgentMenuFor(null)
                              onRenameAgent?.(agent.agent_id, agent.display_name || agent.agent_id)
                            }}
                            disabled={!onRenameAgent}
                          >
                            {t('agent.rename')}
                          </button>
                          <button
                            className="w-full rounded-lg px-2 py-1.5 text-left text-xs text-red-500 hover:bg-[#f4f1eb] dark:hover:bg-zinc-800 disabled:opacity-50"
                            onClick={() => {
                              setAgentMenuFor(null)
                              onUnclaimAgent?.(agent.agent_id)
                            }}
                            disabled={!onUnclaimAgent}
                          >
                            {t('agent.unclaim')}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}

        {selectedWorkspace.agent && (
          <div className="mb-3 rounded-xl border border-[#e5e0d8] bg-[#fbfaf7] p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#9b9488]">Current Workspace</p>
                <p className="mt-1 truncate text-sm font-extrabold text-[#1f2328] dark:text-zinc-100">
                  {selectedWorkspace.agent.display_name || selectedWorkspace.agent.agent_id}
                </p>
              </div>
              <span className={`mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                selectedWorkspace.online
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-400'
              }`}>
                {selectedWorkspace.online ? t('agent.online') : t('agent.offline')}
              </span>
            </div>

            <div className="rounded-lg bg-[#f4f1eb] px-2.5 py-2 dark:bg-zinc-800">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#615d55] dark:text-zinc-200">{selectedWorkspace.role.label}</span>
                <span className="rounded bg-white/70 px-1.5 py-0.5 text-[10px] font-semibold text-[#8a8378] dark:bg-zinc-900 dark:text-zinc-400">
                  role template
                </span>
              </div>
              <p className="line-clamp-2 text-[11px] leading-4 text-[#7a766e] dark:text-zinc-400">{selectedWorkspace.role.description}</p>
            </div>

            <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
              <div className="rounded-lg border border-[#eee9df] bg-white/70 px-1.5 py-1.5 dark:border-zinc-800 dark:bg-zinc-950">
                <p className="text-sm font-extrabold text-[#1f2328] dark:text-zinc-100">{summary.discuss}</p>
                <p className="text-[9px] font-semibold uppercase text-[#aaa298]">topics</p>
              </div>
              <div className="rounded-lg border border-[#eee9df] bg-white/70 px-1.5 py-1.5 dark:border-zinc-800 dark:bg-zinc-950">
                <p className="text-sm font-extrabold text-[#1f2328] dark:text-zinc-100">{summary.task}</p>
                <p className="text-[9px] font-semibold uppercase text-[#aaa298]">tasks</p>
              </div>
              <div className="rounded-lg border border-[#eee9df] bg-white/70 px-1.5 py-1.5 dark:border-zinc-800 dark:bg-zinc-950">
                <p className="text-sm font-extrabold text-[#1f2328] dark:text-zinc-100">{selectedWorkspace.activeTopics}</p>
                <p className="text-[9px] font-semibold uppercase text-[#aaa298]">unread</p>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap gap-1">
              {selectedWorkspace.role.skills.slice(0, 4).map((skill) => (
                <span key={skill} className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-[#8a8378] ring-1 ring-[#eee9df] dark:bg-zinc-950 dark:text-zinc-400 dark:ring-zinc-800">
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}

        {onCreateGeneralTask && (
          <button
            onClick={onCreateGeneralTask}
            className="mb-2 flex w-full items-center gap-2 rounded-lg border border-[#ead7bf] bg-[#fff8ed] px-2 py-2 text-left text-[#9a4b00] transition hover:bg-[#fff1d9] dark:border-zinc-800 dark:bg-zinc-900 dark:text-amber-300 dark:hover:bg-zinc-800"
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span className="truncate text-sm font-medium">{t('topic.newTask')}</span>
          </button>
        )}

        <div className="mb-2 flex items-center gap-1.5">
          <button
            onClick={() => onSelectTopic(null)}
            className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2.5 text-left transition ${
              selectedTopicId === null
                ? 'bg-[#ebe7df] text-[#1f2328]'
                : 'text-[#615d55] hover:bg-[#efebe4] hover:text-[#1f2328]'
            }`}
          >
            <Hash className="h-4 w-4 shrink-0" />
            <span className="truncate text-sm font-medium">{t('topic.allTopics')}</span>
          </button>

          {onToggleSidebar && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleSidebar() }}
              className="rounded-lg border border-slate-200 dark:border-zinc-700 px-2 py-2 text-xs text-slate-500 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700 transition"
              title="Collapse sidebar"
            >
              {'<<'}
            </button>
          )}
        </div>

        {topics.length === 0 && <p className="px-2 py-4 text-xs text-slate-400">{t('topic.noTopics')}</p>}

        {groupedTopics.map(({ group, items }) => {
          const collapsed = collapsedGroups[group]
          const unreadTopics = items.filter((it) => Number(it.unread_count || 0) > 0).length
          const chrome = getGroupChrome(group)
          const GroupIcon = chrome.Icon
          return (
          <div key={group} className="mb-2.5">
            <div className={`mx-1 mb-1 flex items-center justify-between rounded-md border px-1.5 py-1 ${chrome.header}`}>
              <button
                onClick={() => toggleGroup(group)}
                className="inline-flex min-w-0 flex-1 items-center gap-2 rounded-lg text-left text-[13px] font-bold leading-none transition hover:opacity-80"
                title={collapsed ? t('topic.expandGroup') : t('topic.collapseGroup')}
              >
                {collapsed ? <ChevronRight className="h-4 w-4 shrink-0 opacity-70" /> : <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />}
                <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${chrome.icon}`}>
                  <GroupIcon className="h-3.5 w-3.5" />
                </span>
                <span className="truncate tracking-[0.01em]">{t(getGroupLabelKey(group))}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none ${chrome.count}`}>{items.length}</span>
                {unreadTopics > 0 && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold leading-none text-white shadow">
                    {unreadTopics > 99 ? '99+' : unreadTopics}
                  </span>
                )}
              </button>
              {group === 'discuss' && onRequestDiscuss && (
                <button
                  onClick={(e) => { e.stopPropagation(); setShowDiscussForm(!showDiscussForm) }}
                  className="ml-2 rounded-lg border border-white/70 bg-white/70 p-1 text-current shadow-sm transition hover:-translate-y-px hover:bg-white dark:border-zinc-700 dark:bg-zinc-900/60"
                  title={t('topic.requestDiscuss')}
                >
                  <Plus className="h-4 w-4 stroke-[3]" />
                </button>
              )}
            </div>
            {group === 'discuss' && showDiscussForm && !collapsed && (
              <div className="mx-1 mb-2 space-y-1.5 rounded-md border border-indigo-200 dark:border-indigo-700 bg-white dark:bg-zinc-800 px-2 py-2">
                <input
                  type="text"
                  value={discussAgentId}
                  onChange={(e) => setDiscussAgentId(e.target.value)}
                  placeholder={t('topic.targetAgentPlaceholder')}
                  autoFocus
                  className="w-full bg-transparent text-xs text-slate-700 dark:text-zinc-300 placeholder:text-slate-400 outline-none"
                />
                <input
                  type="text"
                  value={discussTopicName}
                  onChange={(e) => setDiscussTopicName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleRequestDiscuss(); if (e.key === 'Escape') { setShowDiscussForm(false); setDiscussAgentId(''); setDiscussTopicName('') } }}
                  placeholder={t('topic.topicNamePlaceholder')}
                  className="w-full bg-transparent text-xs text-slate-700 dark:text-zinc-300 placeholder:text-slate-400 outline-none"
                />
                <div className="flex justify-end gap-1">
                  <button
                    onClick={() => { setShowDiscussForm(false); setDiscussAgentId(''); setDiscussTopicName('') }}
                    className="rounded px-2 py-0.5 text-[10px] text-slate-400 hover:text-slate-600"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={handleRequestDiscuss}
                    disabled={!discussAgentId.trim() || !discussTopicName.trim() || creatingDiscuss}
                    className="rounded bg-indigo-500 px-2 py-0.5 text-[10px] font-semibold text-white transition hover:bg-indigo-600 disabled:opacity-50"
                  >
                    {creatingDiscuss ? '...' : t('topic.sendRequest')}
                  </button>
                </div>
              </div>
            )}
            {!collapsed && group !== 'task' && items.map((topic) => renderTopicRow(topic))}

            {!collapsed && group === 'task' && (
              <div className="space-y-1">
                {(['general', 'code', 'research'] as TaskTypeKey[]).map((taskType) => {
                  const taskItems = items.filter((it) => normalizeTaskType(it.task_type, it.task_mode, it.exec_mode) === taskType)
                  const taskCollapsed = collapsedTaskTypeGroups[taskType]
                  const unreadTaskTopics = taskItems.filter((it) => Number(it.unread_count || 0) > 0).length
                  return (
                    <div key={taskType} className="mx-1 mb-1">
                      <button
                        onClick={() => toggleTaskTypeGroup(taskType)}
                        className="mb-1 inline-flex w-full items-center justify-between rounded-lg border border-slate-200/80 bg-white/80 px-2.5 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-white dark:border-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-300"
                      >
                        <span className="inline-flex items-center gap-1.5">
                          {taskCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold ${taskTypeTone(taskType)}`}>
                            {taskTypeInitial(taskType)}
                          </span>
                          <span>{taskTypeLabel(taskType)}</span>
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-[10px] font-semibold leading-none text-slate-500 dark:bg-zinc-700 dark:text-zinc-300">{taskItems.length}</span>
                          {unreadTaskTopics > 0 && (
                            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white shadow">
                              {unreadTaskTopics > 99 ? '99+' : unreadTaskTopics}
                            </span>
                          )}
                        </span>
                      </button>
                      {!taskCollapsed && taskItems.map((topic) => renderTopicRow(topic))}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          )
        })}
      </div>

      <div className="border-t border-slate-200 dark:border-zinc-700 px-3 py-2 text-[11px] text-slate-400">
        {t('topic.totalSummary', { total: summary.total, p2p: summary.p2p, task: summary.task, discuss: summary.discuss, subscriber: summary.subscriber })}
      </div>
    </div>
  )
}
