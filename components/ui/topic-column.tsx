'use client'

import { Bot, Hash, Lock, Plus, MoreVertical, Pin, Users } from 'lucide-react'
import { useState } from 'react'

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

export function TopicColumn({
  topics,
  selectedTopicId,
  onSelectTopic,
  onLeaveTopic,
  onDeleteTopic,
  onQuickCreateTask,
  agentName,
}: TopicColumnProps) {
  const [menuFor, setMenuFor] = useState<string | null>(null)

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

        {topics.map((topic) => {
          const isSelected = topic.topic_id === selectedTopicId
          const Icon = getTopicIcon(topic.topic_type, !!topic.task_id)
          const isMenuOpen = menuFor === topic.topic_id
          const isP2P = topic.topic_type === 'p2p'

          return (
            <div
              key={topic.topic_id}
              className={`relative mt-1 rounded-lg ${isP2P ? 'border-l-[3px] border-l-indigo-400 dark:border-l-indigo-500' : ''} ${isSelected ? 'bg-slate-50' : 'hover:bg-slate-50'}`}
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
                <Icon className={`h-4 w-4 shrink-0 ${isP2P ? 'text-indigo-400 dark:text-indigo-500' : ''}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{topic.name}</p>
                </div>
                {isP2P && (
                  <Pin className="h-3 w-3 shrink-0 rotate-45 text-slate-300 dark:text-zinc-500" />
                )}
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
    </div>
  )
}
