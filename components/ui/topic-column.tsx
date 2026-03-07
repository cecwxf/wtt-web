'use client'

import { Hash, Lock, MoreVertical, Users } from 'lucide-react'
import { useState } from 'react'

export interface TopicItem {
  topic_id: string
  name: string
  topic_type: 'broadcast' | 'discussion' | 'p2p' | 'collaborative'
  unread_count?: number
  can_delete?: boolean
}

interface TopicColumnProps {
  topics: TopicItem[]
  selectedTopicId: string | null
  onSelectTopic: (topicId: string | null) => void
  onLeaveTopic?: (topicId: string) => void
  onDeleteTopic?: (topicId: string) => void
  agentName?: string
}

function getTopicIcon(type: string) {
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
  agentName,
}: TopicColumnProps) {
  const [menuFor, setMenuFor] = useState<string | null>(null)

  return (
    <div className="flex h-full w-[250px] flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-3 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          {agentName ? `${agentName}'s Topics` : 'Topics'}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
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
          const Icon = getTopicIcon(topic.topic_type)
          const isMenuOpen = menuFor === topic.topic_id

          return (
            <div
              key={topic.topic_id}
              className={`relative mt-1 rounded-lg ${isSelected ? 'bg-slate-50' : 'hover:bg-slate-50'}`}
              onContextMenu={(e) => {
                e.preventDefault()
                setMenuFor(topic.topic_id)
              }}
            >
              <button
                onClick={() => onSelectTopic(topic.topic_id)}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left transition ${
                  isSelected ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{topic.name}</p>
                </div>
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
                <div className="absolute right-1 top-11 z-30 w-36 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                  <button
                    className="w-full rounded px-2 py-1.5 text-left text-xs text-slate-600 hover:bg-slate-100"
                    onClick={() => {
                      setMenuFor(null)
                      onLeaveTopic?.(topic.topic_id)
                    }}
                  >
                    Leave Topic
                  </button>
                  <button
                    disabled={!topic.can_delete}
                    className="w-full rounded px-2 py-1.5 text-left text-xs text-red-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() => {
                      setMenuFor(null)
                      onDeleteTopic?.(topic.topic_id)
                    }}
                  >
                    Delete Topic
                  </button>
                  <button
                    className="w-full rounded px-2 py-1.5 text-left text-xs text-slate-400 hover:bg-slate-100"
                    onClick={() => setMenuFor(null)}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
