'use client'

import { Bot, Hash, Lock, Plus, MoreVertical, Pin, Users, ChevronDown, ChevronRight } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
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
}

interface TopicColumnProps {
  topics: TopicItem[]
  selectedTopicId: string | null
  onSelectTopic: (topicId: string | null) => void
  onLeaveTopic?: (topicId: string) => void
  onDeleteTopic?: (topicId: string) => void
  onQuickCreateTask?: () => void
  onCreateP2P?: (targetAgentId: string) => Promise<void>
  onRequestDiscuss?: (targetAgentId: string, topicName: string) => Promise<void>
  onRequestMember?: (targetAgentId: string, topicId: string) => Promise<void>
  agentName?: string
  pinScopeKey?: string
  agentOptions?: Array<{ agent_id: string; display_name: string }>
  selectedAgentId?: string
  onSelectAgent?: (agentId: string) => void
  isSelectedAgentOnline?: boolean
  onRenameAgent?: (agentId: string, currentName: string) => void
  onUnclaimAgent?: (agentId: string) => void
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
type TaskTypeKey = 'general' | 'code' | 'pipeline' | 'research'

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

function stripTaskPrefix(name: string): string {
  return name.replace(/^TASK-[a-f0-9]{8}\s*/i, '')
}

function normalizeTaskType(type?: string, taskMode?: string, execMode?: string): TaskTypeKey {
  const raw = `${String(type || '').toLowerCase()} ${String(taskMode || '').toLowerCase()} ${String(execMode || '').toLowerCase()}`
  if (raw.includes('pipeline')) return 'pipeline'
  if (raw.includes('research')) return 'research'
  if (raw.includes('code')) return 'code'
  return 'general'
}

function taskTypeInitial(type: TaskTypeKey): string {
  switch (type) {
    case 'code':
      return 'C'
    case 'pipeline':
      return 'P'
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
    case 'pipeline':
      return 'Pipeline Task'
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
    case 'pipeline':
      return 'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-900/40 dark:text-purple-300'
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
  onQuickCreateTask,
  onRequestDiscuss,
  agentName,
  pinScopeKey,
  agentOptions,
  selectedAgentId,
  onSelectAgent,
  isSelectedAgentOnline,
  onRenameAgent,
  onUnclaimAgent,
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
  const [creatingAgentWorker, setCreatingAgentWorker] = useState(false)
  const [agentActionMenuOpen, setAgentActionMenuOpen] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<TopicGroupKey, boolean>>({
    p2p: false,
    task: false,
    discuss: false,
    subscriber: false,
  })
  const [collapsedTaskTypeGroups, setCollapsedTaskTypeGroups] = useState<Record<TaskTypeKey, boolean>>({
    general: false,
    code: false,
    pipeline: false,
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

  const handleAddWorker = async () => {
    if (!selectedAgentId || creatingAgentWorker) return
    const suggested = agentOptions?.find((a) => a.agent_id === selectedAgentId)?.display_name || selectedAgentId
    const workerName = window.prompt('Worker name:', `${suggested}-worker`)
    if (!workerName || !workerName.trim()) return

    setCreatingAgentWorker(true)
    try {
      const response = await fetch(`${CLIENT_WTT_API_BASE}/workers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          agent_id: selectedAgentId,
          name: workerName.trim(),
          skills_config: [],
          personality: '',
          model_config: {},
        }),
      })
      if (!response.ok) throw new Error(await response.text())
    } catch {
      alert('Add Worker failed')
    } finally {
      setCreatingAgentWorker(false)
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
        className={`relative mt-1 rounded-lg ${isPinned ? 'border-l-[3px] border-l-amber-300 dark:border-l-amber-500' : ''} ${isSelected ? 'bg-slate-50' : 'hover:bg-slate-50'}`}
        onContextMenu={(e) => {
          e.preventDefault()
          setMenuFor(topic.topic_id)
        }}
      >
        <button
          onClick={() => onSelectTopic(topic.topic_id)}
          className={`flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left transition ${
            isSelected
              ? 'text-indigo-600 dark:text-indigo-400'
              : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200'
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
    <div className="flex h-full w-[250px] flex-col border-r border-slate-200/80 dark:border-zinc-700 bg-[#f7f5f2] dark:bg-zinc-900">
      <div className="border-b border-slate-200 dark:border-zinc-700 px-3 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          {agentName ? t('topic.agentsTopics', { name: agentName }) : t('topic.topics')}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {onQuickCreateTask && (
          <button
            onClick={onQuickCreateTask}
            className="mb-2 flex w-full items-center gap-2 rounded-lg border border-dashed border-indigo-300 dark:border-indigo-700 px-2 py-2.5 text-left text-sm font-medium text-indigo-500 dark:text-indigo-400 transition hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/20"
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span className="truncate">{t('topic.newTask')}</span>
          </button>
        )}

        {agentOptions && agentOptions.length > 0 && onSelectAgent && selectedAgentId ? (
          <div className="mb-2 rounded-lg border border-slate-200/80 dark:border-zinc-700 bg-white/70 dark:bg-zinc-800/40 px-2 py-2">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-zinc-500">{t('agent.agents')}</p>
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  isSelectedAgentOnline
                    ? 'bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.5)]'
                    : 'bg-slate-300 dark:bg-zinc-600'
                }`}
                title={isSelectedAgentOnline ? t('agent.online') : t('agent.offline')}
                aria-label={isSelectedAgentOnline ? t('agent.online') : t('agent.offline')}
              />
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <label className="sr-only">Select Agent</label>
              <select
                value={selectedAgentId}
                onChange={(e) => {
                  onSelectAgent(e.target.value)
                  setAgentActionMenuOpen(false)
                }}
                className="flex-1 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1.5 text-xs font-medium text-slate-600 dark:text-zinc-300"
              >
                {agentOptions.map((agent) => (
                  <option key={agent.agent_id} value={agent.agent_id}>
                    {agent.display_name || agent.agent_id}
                  </option>
                ))}
              </select>

              <div className="relative">
                <button
                  className="inline-flex items-center justify-center rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-1.5 text-slate-500 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700"
                  onClick={() => setAgentActionMenuOpen((v) => !v)}
                  aria-label="Agent actions"
                  title="Agent actions"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </button>

                {agentActionMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setAgentActionMenuOpen(false)} />
                    <div className="absolute right-0 top-8 z-30 w-36 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-1 shadow-lg">
                      <button
                        className="w-full rounded px-2 py-1.5 text-left text-xs text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700 disabled:opacity-50"
                        onClick={() => {
                          setAgentActionMenuOpen(false)
                          const currentName = agentOptions.find((a) => a.agent_id === selectedAgentId)?.display_name || selectedAgentId
                          onRenameAgent?.(selectedAgentId, currentName)
                        }}
                        disabled={!onRenameAgent}
                      >
                        {t('agent.rename')}
                      </button>
                      <button
                        className="w-full rounded px-2 py-1.5 text-left text-xs text-red-500 hover:bg-slate-100 dark:hover:bg-zinc-700 disabled:opacity-50"
                        onClick={() => {
                          setAgentActionMenuOpen(false)
                          onUnclaimAgent?.(selectedAgentId)
                        }}
                        disabled={!onUnclaimAgent}
                      >
                        {t('agent.unclaim')}
                      </button>
                      <button
                        className="w-full rounded px-2 py-1.5 text-left text-xs text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700 disabled:opacity-50"
                        onClick={async () => {
                          setAgentActionMenuOpen(false)
                          await handleAddWorker()
                        }}
                        disabled={creatingAgentWorker}
                      >
                        {creatingAgentWorker ? '...' : t('agent.addWorker')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : null}

        <button
          onClick={() => onSelectTopic(null)}
          className={`mb-2 flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left transition ${
            selectedTopicId === null
              ? 'bg-slate-50 text-indigo-600'
              : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
          }`}
        >
          <Hash className="h-4 w-4 shrink-0" />
          <span className="truncate text-sm font-medium">{t('topic.allTopics')}</span>
        </button>

        {topics.length === 0 && <p className="px-2 py-4 text-xs text-slate-400">{t('topic.noTopics')}</p>}

        {groupedTopics.map(({ group, items }) => {
          const collapsed = collapsedGroups[group]
          const unreadTopics = items.filter((it) => Number(it.unread_count || 0) > 0).length
          return (
          <div key={group} className="mb-1">
            <div className="mx-1 mb-1 flex items-center justify-between rounded-md bg-slate-50/70 dark:bg-zinc-800/50 px-2 py-1">
              <button
                onClick={() => toggleGroup(group)}
                className="inline-flex min-w-0 items-center gap-1.5 rounded px-0.5 py-0.5 text-[11px] font-medium text-slate-500 transition hover:text-slate-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                title={collapsed ? t('topic.expandGroup') : t('topic.collapseGroup')}
              >
                {collapsed ? <ChevronRight className="h-3 w-3 shrink-0" /> : <ChevronDown className="h-3 w-3 shrink-0" />}
                <span className="truncate">{t(getGroupLabelKey(group))}</span>
                <span className="rounded-full bg-slate-200/70 dark:bg-zinc-700 px-1.5 py-0 text-[10px] text-slate-500 dark:text-zinc-300">{items.length}</span>
                {unreadTopics > 0 && (
                  <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-semibold leading-none text-white shadow">
                    {unreadTopics > 99 ? '99+' : unreadTopics}
                  </span>
                )}
              </button>
              {group === 'discuss' && onRequestDiscuss && (
                <button
                  onClick={(e) => { e.stopPropagation(); setShowDiscussForm(!showDiscussForm) }}
                  className="rounded-md border border-slate-300/80 dark:border-zinc-600 p-0.5 text-slate-600 dark:text-zinc-300 transition hover:bg-slate-200 dark:hover:bg-zinc-700 hover:text-indigo-600"
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
                {(['general', 'code', 'pipeline', 'research'] as TaskTypeKey[]).map((taskType) => {
                  const taskItems = items.filter((it) => normalizeTaskType(it.task_type, it.task_mode, it.exec_mode) === taskType)
                  const taskCollapsed = collapsedTaskTypeGroups[taskType]
                  const unreadTaskTopics = taskItems.filter((it) => Number(it.unread_count || 0) > 0).length
                  return (
                    <div key={taskType} className="mx-1 mb-1">
                      <button
                        onClick={() => toggleTaskTypeGroup(taskType)}
                        className="mb-1 inline-flex w-full items-center justify-between rounded-md border border-slate-200/70 bg-white/70 px-2 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-white dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-300"
                      >
                        <span className="inline-flex items-center gap-1.5">
                          {taskCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full border text-[9px] font-bold ${taskTypeTone(taskType)}`}>
                            {taskTypeInitial(taskType)}
                          </span>
                          <span>{taskTypeLabel(taskType)}</span>
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="rounded-full bg-slate-200/70 px-1.5 py-0 text-[10px] text-slate-500 dark:bg-zinc-700 dark:text-zinc-300">{taskItems.length}</span>
                          {unreadTaskTopics > 0 && (
                            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-semibold leading-none text-white shadow">
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
