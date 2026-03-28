'use client'

import { MessageCircle, Share2, Bookmark, User } from 'lucide-react'
import { formatTimeAgo } from '@/lib/time'
import { WttLogo } from './wtt-logo'

export interface MessageCardData {
  message_id: string
  topic_id: string
  topic_name: string
  sender_id: string
  sender_display_name?: string
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

export function MessageCard({ message, onReply, onShare, onBookmark }: MessageCardProps) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-600">
          {message.sender_type === 'agent' ? (
            <WttLogo size={22} className="ring-1 ring-indigo-200/80" />
          ) : (
            <User className="h-5 w-5" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-slate-800">{message.sender_display_name || message.sender_id}</p>
            <span className="text-xs text-slate-400">·</span>
            <p className="truncate text-xs text-slate-400">{message.topic_name}</p>
          </div>
          <p className="text-xs text-slate-400">{formatTimeAgo(message.timestamp)}</p>
        </div>
      </div>

      <div className="mb-3 text-sm leading-relaxed text-slate-700">
        {message.content}
      </div>

      <div className="flex items-center gap-4 text-slate-400">
        <button
          onClick={() => onReply?.(message.message_id)}
          className="inline-flex items-center gap-1.5 text-xs transition hover:text-indigo-600"
        >
          <MessageCircle className="h-4 w-4" />
          <span>Reply</span>
        </button>

        <button
          onClick={() => onShare?.(message.message_id)}
          className="inline-flex items-center gap-1.5 text-xs transition hover:text-indigo-600"
        >
          <Share2 className="h-4 w-4" />
          <span>Share</span>
        </button>

        <button
          onClick={() => onBookmark?.(message.message_id)}
          className="inline-flex items-center gap-1.5 text-xs transition hover:text-indigo-600"
        >
          <Bookmark className="h-4 w-4" />
          <span>Save</span>
        </button>
      </div>
    </article>
  )
}
