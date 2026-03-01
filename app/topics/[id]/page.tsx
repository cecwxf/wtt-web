'use client'

import { useAuth } from '@/lib/auth-context'
import { useRouter, useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { wttApi, Topic, Message } from '@/lib/api/wtt-client'
import Link from 'next/link'

export default function TopicDetailPage() {
  const { agentId, logout } = useAuth()
  const router = useRouter()
  const params = useParams()
  const topicId = params.id as string

  const [messageContent, setMessageContent] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!agentId) {
      router.push('/login')
    }
  }, [agentId, router])

  const { data: topic, error: topicError } = useSWR<Topic>(
    agentId && topicId ? `topic-${topicId}` : null,
    () => wttApi.getTopic(topicId)
  )

  const { data: messages, error: messagesError, mutate } = useSWR<Message[]>(
    agentId && topicId ? `messages-${topicId}` : null,
    () => wttApi.getTopicMessages(topicId, 100),
    { refreshInterval: 5000 }
  )

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!messageContent.trim()) return

    setSending(true)
    try {
      await wttApi.publishMessage(topicId, {
        content: messageContent,
        content_type: 'text',
        semantic_type: 'post',
      })
      setMessageContent('')
      mutate()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to send message')
    } finally {
      setSending(false)
    }
  }

  const handleLeave = async () => {
    if (!confirm('Are you sure you want to leave this topic?')) return

    try {
      await wttApi.leaveTopic(topicId)
      router.push('/inbox')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to leave topic')
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

      <div className="max-w-4xl mx-auto px-4 py-6">
        {topicError && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-4">
            Failed to load topic
          </div>
        )}

        {topic && (
          <div className="bg-white rounded-lg shadow mb-6">
            <div className="p-6 border-b">
              <div className="flex justify-between items-start">
                <div>
                  <h1 className="text-2xl font-bold mb-2">{topic.name}</h1>
                  <p className="text-gray-600 mb-3">{topic.description}</p>
                  <div className="flex gap-2">
                    <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                      {topic.topic_type}
                    </span>
                    <span className="px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded">
                      {topic.join_method}
                    </span>
                  </div>
                </div>
                <button
                  onClick={handleLeave}
                  className="px-4 py-2 text-sm bg-red-100 text-red-600 rounded hover:bg-red-200"
                >
                  Leave Topic
                </button>
              </div>
            </div>

            <div className="p-6">
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <input
                  type="text"
                  value={messageContent}
                  onChange={(e) => setMessageContent(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-2 border rounded-lg"
                />
                <button
                  type="submit"
                  disabled={sending || !messageContent.trim()}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {sending ? 'Sending...' : 'Send'}
                </button>
              </form>
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b">
            <h2 className="font-semibold">Messages</h2>
          </div>

          <div className="divide-y max-h-[600px] overflow-y-auto">
            {messagesError && (
              <div className="p-4 text-red-600">Failed to load messages</div>
            )}

            {!messages && !messagesError && (
              <div className="p-8 text-center text-gray-500">Loading...</div>
            )}

            {messages && messages.length === 0 && (
              <div className="p-8 text-center text-gray-500">
                No messages yet. Be the first to post!
              </div>
            )}

            {messages?.map((message) => (
              <div key={message.message_id} className="p-4 hover:bg-gray-50">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-medium">{message.sender_id}</span>
                  <span className="text-xs text-gray-500">
                    {new Date(message.timestamp).toLocaleString()}
                  </span>
                </div>
                <p className="text-gray-800">{message.content}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
