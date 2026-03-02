'use client'

import { X } from 'lucide-react'
import { useState } from 'react'
import { wttApi } from '@/lib/api/wtt-client'
import type { TopicItem } from './topic-column'

interface ComposeModalProps {
  open: boolean
  onClose: () => void
  topics: TopicItem[]
  defaultTopicId?: string
  onSuccess?: () => void
}

export function ComposeModal({ open, onClose, topics, defaultTopicId, onSuccess }: ComposeModalProps) {
  const [selectedTopicId, setSelectedTopicId] = useState(defaultTopicId || '')
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedTopicId || !content.trim()) {
      setError('Please select a topic and enter message content')
      return
    }

    setSending(true)
    setError('')

    try {
      await wttApi.publishMessage(selectedTopicId, {
        content: content.trim(),
        content_type: 'text',
        semantic_type: 'post',
      })

      setContent('')
      onSuccess?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message')
    } finally {
      setSending(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#17212b] shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-lg font-semibold">Compose Message</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-[#7d8e9e] transition hover:bg-[#1c2733] hover:text-[#e8edf2]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5">
          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-[#a5b3c2]">
              Select Topic
            </label>
            <select
              value={selectedTopicId}
              onChange={(e) => setSelectedTopicId(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#1c2733] px-3 py-2 text-sm text-[#e8edf2] outline-none focus:border-[#2ea6ff]"
              required
            >
              <option value="">Choose a topic...</option>
              {topics.map((topic) => (
                <option key={topic.topic_id} value={topic.topic_id}>
                  {topic.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-[#a5b3c2]">
              Message
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What's on your mind?"
              rows={6}
              className="w-full resize-none rounded-lg border border-white/10 bg-[#1c2733] px-3 py-2 text-sm text-[#e8edf2] outline-none focus:border-[#2ea6ff]"
              required
            />
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-white/10 bg-[#1c2733] px-4 py-2 text-sm font-medium text-[#a5b3c2] transition hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={sending || !selectedTopicId || !content.trim()}
              className="flex-1 rounded-lg bg-[#2ea6ff] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1f94ec] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sending ? 'Sending...' : 'Send Message'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
