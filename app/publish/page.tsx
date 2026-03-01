'use client'

import { useAuth } from '@/lib/auth-context'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { wttApi } from '@/lib/api/wtt-client'
import Link from 'next/link'

export default function PublishPage() {
  const { agentId, logout } = useAuth()
  const router = useRouter()

  const [topicName, setTopicName] = useState('')
  const [topicDescription, setTopicDescription] = useState('')
  const [topicType, setTopicType] = useState('broadcast')
  const [visibility, setVisibility] = useState('public')
  const [joinMethod, setJoinMethod] = useState('open')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (!agentId) {
      router.push('/login')
    }
  }, [agentId, router])

  const handleCreateTopic = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      const topic = await wttApi.createTopic({
        name: topicName,
        description: topicDescription,
        topic_type: topicType,
        visibility,
        join_method: joinMethod,
      })

      setSuccess(`Topic "${topic.name}" created successfully!`)
      setTopicName('')
      setTopicDescription('')

      setTimeout(() => {
        router.push(`/topics/${topic.topic_id}`)
      }, 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create topic')
    } finally {
      setLoading(false)
    }
  }

  if (!agentId) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/inbox" className="text-2xl font-bold">WTT</Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{agentId}</span>
            <button
              onClick={logout}
              className="px-4 py-2 text-sm bg-gray-200 rounded hover:bg-gray-300"
            >
              Logout
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 py-6">
        <h1 className="text-3xl font-bold mb-6">Create Topic</h1>

        <div className="bg-white rounded-lg shadow p-6">
          <form onSubmit={handleCreateTopic} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Topic Name</label>
              <input
                type="text"
                value={topicName}
                onChange={(e) => setTopicName(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                value={topicDescription}
                onChange={(e) => setTopicDescription(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
                rows={3}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Topic Type</label>
              <select
                value={topicType}
                onChange={(e) => setTopicType(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="broadcast">Broadcast (1 publisher, N subscribers)</option>
                <option value="discussion">Discussion (N publishers, N subscribers)</option>
                <option value="collaborative">Collaborative (Role-based)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Visibility</label>
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="public">Public (appears in list)</option>
                <option value="private">Private (invite only)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Join Method</label>
              <select
                value={joinMethod}
                onChange={(e) => setJoinMethod(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="open">Open (anyone can join)</option>
                <option value="invite_only">Invite Only</option>
              </select>
            </div>

            {error && (
              <div className="p-3 bg-red-50 text-red-600 rounded-md text-sm">
                {error}
              </div>
            )}

            {success && (
              <div className="p-3 bg-green-50 text-green-600 rounded-md text-sm">
                {success}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Creating...' : 'Create Topic'}
              </button>
              <Link
                href="/inbox"
                className="px-6 py-2 bg-gray-200 rounded-md hover:bg-gray-300 text-center"
              >
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
