'use client'

import { useEffect, useRef, useState } from 'react'
import { MessageCard, MessageCardData } from './message-card'
import { FeedSkeleton } from './skeleton'
import { PenSquare } from 'lucide-react'
import { ArtifactPreviewPanel, type ArtifactPreview } from './artifact-preview-panel'

interface FeedViewProps {
  messages: MessageCardData[]
  loading?: boolean
  onLoadMore?: () => void
  hasMore?: boolean
  onCompose?: () => void
}

export function FeedView({ messages, loading = false, onLoadMore, hasMore = false, onCompose }: FeedViewProps) {
  const observerTarget = useRef<HTMLDivElement>(null)
  const [activeArtifact, setActiveArtifact] = useState<ArtifactPreview | null>(null)

  // Filter out status-stream messages (TASK_REQUEST, SYSTEM, NOTIFICATION)
  const STATUS_SEMANTIC_TYPES = new Set(['task_request', 'TASK_REQUEST', 'system', 'SYSTEM', 'notification', 'NOTIFICATION'])
  const visibleMessages = messages.filter(m => !STATUS_SEMANTIC_TYPES.has(m.semantic_type || ''))

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

  if (loading && messages.length === 0) {
    return (
      <div className="relative h-full">
        <FeedSkeleton />
      </div>
    )
  }

  return (
    <div className={`relative grid h-full min-h-0 overflow-hidden ${activeArtifact ? 'grid-cols-[minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_400px] 2xl:grid-cols-[minmax(0,1fr)_440px]' : 'grid-cols-[minmax(0,1fr)]'}`}>
      <div className="min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-3 p-3 sm:p-4 lg:space-y-4 xl:p-6">
        {visibleMessages.length === 0 && !loading && (
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center">
            <p className="text-sm text-slate-400">No messages yet</p>
            <p className="mt-2 text-xs text-slate-400">Subscribe to topics to see messages in your feed</p>
          </div>
        )}

        {visibleMessages.map((message) => (
          <MessageCard key={message.message_id} message={message} onArtifactOpen={setActiveArtifact} />
        ))}

        {loading && messages.length > 0 && (
          <div className="flex justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-indigo-500" />
          </div>
        )}

        {hasMore && <div ref={observerTarget} className="h-4" />}
      </div>
      </div>

      {activeArtifact && (
        <div className="hidden min-h-0 border-l border-slate-200 bg-slate-950 p-2 xl:block 2xl:p-3">
          <ArtifactPreviewPanel artifact={activeArtifact} onClose={() => setActiveArtifact(null)} className="h-full" />
        </div>
      )}

      {onCompose && (
        <button
          onClick={onCompose}
          className="fixed bottom-5 right-5 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-500 text-white shadow-lg transition hover:scale-110 hover:bg-indigo-600 lg:bottom-8 lg:right-8 lg:h-14 lg:w-14"
          title="Compose message"
        >
          <PenSquare className="h-6 w-6" />
        </button>
      )}
    </div>
  )
}
