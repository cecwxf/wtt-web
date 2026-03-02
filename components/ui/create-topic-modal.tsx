'use client'

import { X } from 'lucide-react'
import { useState } from 'react'
import { wttApi } from '@/lib/api/wtt-client'

interface CreateTopicModalProps {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
}

type TopicType = 'broadcast' | 'discussion' | 'collaborative'
type Visibility = 'public' | 'private'
type JoinMethod = 'open' | 'invite_only'

export function CreateTopicModal({ open, onClose, onSuccess }: CreateTopicModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [topicType, setTopicType] = useState<TopicType>('discussion')
  const [visibility, setVisibility] = useState<Visibility>('public')
  const [joinMethod, setJoinMethod] = useState<JoinMethod>('open')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim() || !description.trim()) {
      setError('Please fill in all required fields')
      return
    }

    setCreating(true)
    setError('')

    try {
      await wttApi.createTopic({
        name: name.trim(),
        description: description.trim(),
        topic_type: topicType,
        visibility,
        join_method: joinMethod,
      })

      setName('')
      setDescription('')
      setTopicType('discussion')
      setVisibility('public')
      setJoinMethod('open')
      onSuccess?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create topic')
    } finally {
      setCreating(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#17212b] shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-lg font-semibold">Create New Topic</h2>
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
              Topic Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., AI News Daily"
              className="w-full rounded-lg border border-white/10 bg-[#1c2733] px-3 py-2 text-sm text-[#e8edf2] outline-none focus:border-[#2ea6ff]"
              required
            />
          </div>

          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-[#a5b3c2]">
              Description <span className="text-red-400">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this topic is about..."
              rows={3}
              className="w-full resize-none rounded-lg border border-white/10 bg-[#1c2733] px-3 py-2 text-sm text-[#e8edf2] outline-none focus:border-[#2ea6ff]"
              required
            />
          </div>

          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-[#a5b3c2]">Topic Type</label>
            <select
              value={topicType}
              onChange={(e) => setTopicType(e.target.value as TopicType)}
              className="w-full rounded-lg border border-white/10 bg-[#1c2733] px-3 py-2 text-sm text-[#e8edf2] outline-none focus:border-[#2ea6ff]"
            >
              <option value="broadcast">Broadcast (1 publisher, N subscribers)</option>
              <option value="discussion">Discussion (N publishers, N subscribers)</option>
              <option value="collaborative">Collaborative (Role-based)</option>
            </select>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-[#a5b3c2]">Visibility</label>
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as Visibility)}
                className="w-full rounded-lg border border-white/10 bg-[#1c2733] px-3 py-2 text-sm text-[#e8edf2] outline-none focus:border-[#2ea6ff]"
              >
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-[#a5b3c2]">Join Method</label>
              <select
                value={joinMethod}
                onChange={(e) => setJoinMethod(e.target.value as JoinMethod)}
                className="w-full rounded-lg border border-white/10 bg-[#1c2733] px-3 py-2 text-sm text-[#e8edf2] outline-none focus:border-[#2ea6ff]"
              >
                <option value="open">Open (Anyone can join)</option>
                <option value="invite_only">Invite Only</option>
              </select>
            </div>
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
              disabled={creating || !name.trim() || !description.trim()}
              className="flex-1 rounded-lg bg-[#2ea6ff] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1f94ec] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating ? 'Creating...' : 'Create Topic'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
