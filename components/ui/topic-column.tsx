'use client'

import { Bot, Hash, Lock, Plus, MoreVertical, Pin, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

export interface TopicItem {
  topic_id: string
  name: string
  topic_type: 'broadcast' | 'discussion' | 'p2p' | 'collaborative'
  unread_count?: number
  can_delete?: boolean
  task_id?: string
  task_type?: 'code' | 'research' | 'general' | 'pipeline'
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

function getTopicGroup(topic: TopicItem): TopicGroupKey {
  if (topic.topic_type === 'p2p') return 'p2p'
  if (topic.task_id) return 'task'
  if (topic.topic_type === 'broadcast') return 'subscriber'
  return 'discuss'
}

function getGroupLabel(group: TopicGroupKey): string {
  switch (group) {
    case 'p2p':
      return 'P2P'
    case 'task':
      return 'Task'
    case 'discuss':
      return 'Discuss'
    case 'subscriber':
      return 'Subscriber'
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
}: TopicColumnProps) {
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [pinnedTopicIds, setPinnedTopicIds] = useState<string[]>([])
  // Discuss topic request form
  const [showDiscussForm, setShowDiscussForm] = useState(false)
  const [discussAgentId, setDiscussAgentId] = useState('')
  const [discussTopicName, setDiscussTopicName] = useState('')
  const [creatingDiscuss, setCreatingDiscuss] = useState(false)

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

    return order
      .map((group) => ({ group, items: byGroup.get(group) || [] }))
      .filter((x) => x.items.length > 0)
  }, [topics, pinnedTopicIds])

  const summary = useMemo(() => {
    const counts: Record<TopicGroupKey, number> = { p2p: 0, task: 0, discuss: 0, subscriber: 0 }
    for (const topic of topics) counts[getTopicGroup(topic)] += 1
    return { total: topics.length, ...counts }
  }, [topics])

  return (
    <div className="flex h-full w-[250px] flex-col border-r border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
      <div className="border-b border-slate-200 dark:border-zinc-700 px-3 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          {agentName ? `${agentName}'s Topics` : 'Topics'}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {onQuickCreateTask && (
          <button
            onClick={onQuickCreateTask}
            className="mb-2 flex w-full items-center gap-2 rounded-lg border border-dashed border-indigo-300 dark:border-indigo-700 px-2 py-2.5 text-left text-sm font-medium text-indigo-500 dark:text-indigo-400 transition hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/20"
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span className="truncate">New Task</span>
          </button>
        )}

        <button
          onClick={() => onSelectTopic(null)}
          className={`mb-2 flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left transition ${
            selectedTopicId === null
              ? 'bg-slate-50 text-indigo-600'
              : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
          }`}
        >
          <Hash className="h-4 w-4 shrink-0" />
          <span className="truncate text-sm font-medium">All Topics</span>
        </button>

        {topics.length === 0 && <p className="px-2 py-4 text-xs text-slate-400">No subscribed topics</p>}

        {groupedTopics.map(({ group, items }) => (
          <div key={group} className="mb-1">
            <div className="mx-1 mb-1 flex items-center justify-between rounded-md bg-slate-50/70 dark:bg-zinc-800/50 px-2 py-1">
              <span className="text-[11px] font-medium text-slate-400">{getGroupLabel(group)}</span>
              {group === 'discuss' && onRequestDiscuss && (
                <button
                  onClick={() => setShowDiscussForm(!showDiscussForm)}
                  className="rounded p-0.5 text-slate-400 transition hover:bg-slate-200 dark:hover:bg-zinc-700 hover:text-indigo-500"
                  title="Request mutual discuss topic"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {group === 'discuss' && showDiscussForm && (
              <div className="mx-1 mb-2 space-y-1.5 rounded-md border border-indigo-200 dark:border-indigo-700 bg-white dark:bg-zinc-800 px-2 py-2">
                <input
                  type="text"
                  value={discussAgentId}
                  onChange={(e) => setDiscussAgentId(e.target.value)}
                  placeholder="Target Agent ID..."
                  autoFocus
                  className="w-full bg-transparent text-xs text-slate-700 dark:text-zinc-300 placeholder:text-slate-400 outline-none"
                />
                <input
                  type="text"
                  value={discussTopicName}
                  onChange={(e) => setDiscussTopicName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleRequestDiscuss(); if (e.key === 'Escape') { setShowDiscussForm(false); setDiscussAgentId(''); setDiscussTopicName('') } }}
                  placeholder="Topic name..."
                  className="w-full bg-transparent text-xs text-slate-700 dark:text-zinc-300 placeholder:text-slate-400 outline-none"
                />
                <div className="flex justify-end gap-1">
                  <button
                    onClick={() => { setShowDiscussForm(false); setDiscussAgentId(''); setDiscussTopicName('') }}
                    className="rounded px-2 py-0.5 text-[10px] text-slate-400 hover:text-slate-600"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRequestDiscuss}
                    disabled={!discussAgentId.trim() || !discussTopicName.trim() || creatingDiscuss}
                    className="rounded bg-indigo-500 px-2 py-0.5 text-[10px] font-semibold text-white transition hover:bg-indigo-600 disabled:opacity-50"
                  >
                    {creatingDiscuss ? '...' : 'Send Request'}
                  </button>
                </div>
              </div>
            )}
            {items.map((topic) => {
              const isSelected = topic.topic_id === selectedTopicId
              const Icon = getTopicIcon(topic.topic_type, !!topic.task_id)
              const isMenuOpen = menuFor === topic.topic_id
              const isPinned = !!topic.is_default_p2p || pinnedTopicIds.includes(topic.topic_id)

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
                    <Icon className={`h-4 w-4 shrink-0 ${isPinned ? 'text-amber-500' : ''}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{topic.is_default_p2p ? `【P2P】${topic.name}` : topic.name}</p>
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
                          {topic.is_default_p2p ? '📌 默认置顶' : isPinned ? '📌 取消置顶' : '📌 置顶'}
                        </button>
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
                          📋 Copy Link
                        </button>
                        <button
                          className="w-full rounded px-2 py-1.5 text-left text-xs text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700"
                          onClick={() => {
                            setMenuFor(null)
                            onLeaveTopic?.(topic.topic_id)
                          }}
                        >
                          Leave Topic
                        </button>
                        <button
                          className="w-full rounded px-2 py-1.5 text-left text-xs text-red-500 hover:bg-slate-100 dark:hover:bg-zinc-700"
                          onClick={() => {
                            setMenuFor(null)
                            onDeleteTopic?.(topic.topic_id)
                          }}
                        >
                          Delete Topic
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <div className="border-t border-slate-200 dark:border-zinc-700 px-3 py-2 text-[11px] text-slate-400">
        Total {summary.total} · P2P {summary.p2p} · Task {summary.task} · Discuss {summary.discuss} · Subscriber {summary.subscriber}
      </div>
    </div>
  )
}
