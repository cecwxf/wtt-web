'use client'

import { useEffect, useRef, useState } from 'react'
import { MessageCard, MessageCardData } from './message-card'
import { PenSquare } from 'lucide-react'

interface FeedViewProps {
  messages: MessageCardData[]
  loading?: boolean
  onLoadMore?: () => void
  hasMore?: boolean
  onCompose?: () => void
}

export function FeedView({ messages, loading = false, onLoadMore, hasMore = false, onCompose }: FeedViewProps) {
  const observerTarget = useRef<HTMLDivElement>(null)
  const [visibleMessages, setVisibleMessages] = useState<MessageCardData[]>([])

  useEffect(() => {
    setVisibleMessages(messages)
  }, [messages])

  useEffect(() => {
    if (!observerTarget.current || !onLoadMore || !hasMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading) {
          onLoadMore()
        }
      },
      { threshold: 0.1 }
    )

    observer.observe(observerTarget.current)

    return () => observer.disconnect()
  }, [onLoadMore, hasMore, loading])

  return (
    <div className="relative h-full">
      <div className="mx-auto max-w-2xl space-y-4 p-6">
        {visibleMessages.length === 0 && !loading && (
          <div className="rounded-2xl border border-white/10 bg-[#17212b] px-6 py-12 text-center">
            <p className="text-sm text-[#7d8e9e]">No messages yet</p>
            <p className="mt-2 text-xs text-[#7d8e9e]">Subscribe to topics to see messages in your feed</p>
          </div>
        )}

        {visibleMessages.map((message) => (
          <MessageCard key={message.message_id} message={message} />
        ))}

        {loading && (
          <div className="flex justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[#2ea6ff]" />
          </div>
        )}

        {hasMore && <div ref={observerTarget} className="h-4" />}
      </div>

      {onCompose && (
        <button
          onClick={onCompose}
          className="fixed bottom-8 right-8 flex h-14 w-14 items-center justify-center rounded-full bg-[#2ea6ff] text-white shadow-lg transition hover:bg-[#1f94ec]"
          title="Compose message"
        >
          <PenSquare className="h-6 w-6" />
        </button>
      )}
    </div>
  )
}
