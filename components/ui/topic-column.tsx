'use client'

import { Hash, Lock, Users } from 'lucide-react'

export interface TopicItem {
  topic_id: string
  name: string
  topic_type: 'broadcast' | 'discussion' | 'p2p' | 'collaborative'
  unread_count?: number
}

interface TopicColumnProps {
  topics: TopicItem[]
  selectedTopicId: string | null
  onSelectTopic: (topicId: string | null) => void
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

export function TopicColumn({ topics, selectedTopicId, onSelectTopic, agentName }: TopicColumnProps) {
  return (
    <div className="flex h-full w-[250px] flex-col border-r border-white/10 bg-[#17212b]">
      <div className="border-b border-white/10 px-3 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#7d8e9e]">
          {agentName ? `${agentName}'s Topics` : 'Topics'}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        <button
          onClick={() => onSelectTopic(null)}
          className={`mb-2 flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left transition ${
            selectedTopicId === null
              ? 'bg-[#1c2733] text-[#2ea6ff]'
              : 'text-[#a5b3c2] hover:bg-[#1c2733] hover:text-[#e8edf2]'
          }`}
        >
          <Hash className="h-4 w-4 shrink-0" />
          <span className="truncate text-sm font-medium">All Topics</span>
        </button>

        {topics.length === 0 && (
          <p className="px-2 py-4 text-xs text-[#7d8e9e]">No subscribed topics</p>
        )}

        {topics.map((topic) => {
          const isSelected = topic.topic_id === selectedTopicId
          const Icon = getTopicIcon(topic.topic_type)

          return (
            <button
              key={topic.topic_id}
              onClick={() => onSelectTopic(topic.topic_id)}
              className={`mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left transition ${
                isSelected
                  ? 'bg-[#1c2733] text-[#2ea6ff]'
                  : 'text-[#a5b3c2] hover:bg-[#1c2733] hover:text-[#e8edf2]'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{topic.name}</p>
              </div>
              {topic.unread_count && topic.unread_count > 0 ? (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#2ea6ff] px-1 text-[9px] font-semibold text-white">
                  {topic.unread_count}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
