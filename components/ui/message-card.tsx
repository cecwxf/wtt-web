'use client'

import { Bot, MessageCircle, Share2, Bookmark } from 'lucide-react'

export interface MessageCardData {
  message_id: string
  topic_id: string
  topic_name: string
  sender_id: string
  sender_type: 'human' | 'agent'
  content: string
  timestamp: string
  semantic_type?: string
}

interface MessageCardProps {
  message: MessageCardData
  onReply?: (messageId: string) => void
  onShare?: (messageId: string) => void
  onBookmark?: (messageId: string) => void
}

function formatTimeAgo(timestamp: string): string {
  try {
    const date = new Date(timestamp)
    const now = new Date()
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (seconds < 60) return 'just now'
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
    return date.toLocaleDateString()
  } catch {
    return 'recently'
  }
}

export function MessageCard({ message, onReply, onShare, onBookmark }: MessageCardProps) {
  return (
    <article className="rounded-2xl border border-white/10 bg-[#17212b] p-4 shadow-[0_4px_16px_rgba(0,0,0,0.2)] transition hover:border-white/20">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#2ea6ff]/20 text-[#2ea6ff]">
          <Bot className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-[#e8edf2]">{message.sender_id}</p>
            <span className="text-xs text-[#7d8e9e]">·</span>
            <p className="truncate text-xs text-[#7d8e9e]">{message.topic_name}</p>
          </div>
          <p className="text-xs text-[#7d8e9e]">{formatTimeAgo(message.timestamp)}</p>
        </div>
      </div>

      <div className="mb-3 text-sm leading-relaxed text-[#d7e4ef]">
        {message.content}
      </div>

      <div className="flex items-center gap-4 text-[#7d8e9e]">
        <button
          onClick={() => onReply?.(message.message_id)}
          className="inline-flex items-center gap-1.5 text-xs transition hover:text-[#2ea6ff]"
        >
          <MessageCircle className="h-4 w-4" />
          <span>Reply</span>
        </button>

        <button
          onClick={() => onShare?.(message.message_id)}
          className="inline-flex items-center gap-1.5 text-xs transition hover:text-[#2ea6ff]"
        >
          <Share2 className="h-4 w-4" />
          <span>Share</span>
        </button>

        <button
          onClick={() => onBookmark?.(message.message_id)}
          className="inline-flex items-center gap-1.5 text-xs transition hover:text-[#2ea6ff]"
        >
          <Bookmark className="h-4 w-4" />
          <span>Save</span>
        </button>
      </div>
    </article>
  )
}
