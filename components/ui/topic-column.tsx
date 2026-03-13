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
}

interface TopicColumnProps {
  topics: TopicItem[]
  selectedTopicId: string | null
  onSelectTopic: (topicId: string | null) => void
  onLeaveTopic?: (topicId: string) => void
  onDeleteTopic?: (topicId: string) => void
  onQuickCreateTask?: () => void
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
  agentName,
  pinScopeKey,
}: TopicColumnProps) {
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [pinnedTopicIds, setPinnedTopicIds] = useState<string[]>([])

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

  const groupedTopics = useMemo(() => {
    const order: TopicGroupKey[] = ['p2p', 'task', 'discuss', 'subscriber']
    const byGroup = new Map<TopicGroupKey, TopicItem[]>()
    for (const group of order) byGroup.set(group, [])

    for (const topic of topics) {
      const group = getTopicGroup(topic)
      byGroup.get(group)?.push(topic)
    }

    for (const group of order) {
      const rows = byGroup.get(group) || []
      rows.sort((a, b) => {
        const ap = pinnedTopicIds.includes(a.topic_id)
        const bp = pinnedTopicIds.includes(b.topic_id)
        if (ap && !bp) return -1
        if (!ap && bp) return 1
        return 0
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
            <div className="mx-1 mb-1 rounded-md bg-slate-50/70 px-2 py-1 text-[11px] font-medium text-slate-400">
              {getGroupLabel(group)}
            </div>
            {items.map((topic) => {
              const isSelected = topic.topic_id === selectedTopicId
              const Icon = getTopicIcon(topic.topic_type, !!topic.task_id)
              const isMenuOpen = menuFor === topic.topic_id
              const isPinned = pinnedTopicIds.includes(topic.topic_id)

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
                      <p className="truncate text-sm font-medium">{topic.name}</p>
                    </div>
                    {isPinned && <Pin className="h-3 w-3 shrink-0 text-amber-500" />}
                    {topic.unread_count && topic.unread_count > 0 ? (
                      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-500 px-1 text-[9px] font-semibold text-white">
                        {topic.unread_count}
                      </span>
                    ) : null}
                    <span className="text-slate-400">
                      <MoreVertical className="h-4 w-4" />
                    </span>
                  </button>

                  {isMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-20" onClick={() => setMenuFor(null)} />
                      <div className="absolute right-1 top-11 z-30 w-36 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-1 shadow-lg">
                        <button
                          className="w-full rounded px-2 py-1.5 text-left text-xs text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700"
                          onClick={() => {
                            togglePinTopic(topic.topic_id)
                            setMenuFor(null)
                          }}
                        >
                          {isPinned ? '📌 取消置顶' : '📌 置顶'}
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
