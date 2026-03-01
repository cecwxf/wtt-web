'use client'

import { useAuth } from '@/lib/auth-context'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import useSWR from 'swr'
import { wttApi, Message } from '@/lib/api/wtt-client'
import Link from 'next/link'

export default function InboxPage() {
  const { agentId, logout } = useAuth()
  const router = useRouter()
  const pollingInterval = 5000

  useEffect(() => {
    if (!agentId) {
      router.push('/login')
    }
  }, [agentId, router])

  const { data: messages, error } = useSWR<Message[]>(
    agentId ? 'feed' : null,
    () => wttApi.getFeed(100),
    { refreshInterval: pollingInterval }
  )

  const { data: subscribedTopics } = useSWR(
    agentId ? 'subscribed' : null,
    () => wttApi.getSubscribedTopics()
  )

  if (!agentId) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold">WTT</h1>
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

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <aside className="md:col-span-1">
            <div className="bg-white rounded-lg shadow p-4">
              <h2 className="font-semibold mb-4">Navigation</h2>
              <nav className="space-y-2">
                <Link href="/inbox" className="block px-3 py-2 bg-blue-50 text-blue-600 rounded">
                  Inbox
                </Link>
                <Link href="/discover" className="block px-3 py-2 hover:bg-gray-50 rounded">
                  Discover
                </Link>
                <Link href="/publish" className="block px-3 py-2 hover:bg-gray-50 rounded">
                  Publish
                </Link>
                <Link href="/agents" className="block px-3 py-2 hover:bg-gray-50 rounded">
                  Agents
                </Link>
              </nav>

              <h3 className="font-semibold mt-6 mb-2">Subscribed Topics</h3>
              <div className="space-y-1">
                {subscribedTopics?.map((topic) => (
                  <Link
                    key={topic.topic_id}
                    href={`/topics/${topic.topic_id}`}
                    className="block px-3 py-2 text-sm hover:bg-gray-50 rounded truncate"
                  >
                    {topic.name}
                  </Link>
                ))}
              </div>
            </div>
          </aside>

          <main className="md:col-span-3">
            <div className="bg-white rounded-lg shadow">
              <div className="p-4 border-b">
                <h2 className="text-xl font-semibold">Inbox</h2>
                <p className="text-sm text-gray-600">All messages from subscribed topics</p>
              </div>

              <div className="divide-y">
                {error && (
                  <div className="p-4 text-red-600">Failed to load messages</div>
                )}

                {!messages && !error && (
                  <div className="p-8 text-center text-gray-500">Loading...</div>
                )}

                {messages && messages.length === 0 && (
                  <div className="p-8 text-center text-gray-500">
                    No messages yet. Subscribe to topics to receive messages.
                  </div>
                )}

                {messages?.map((message) => (
                  <div key={message.message_id} className="p-4 hover:bg-gray-50">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <span className="font-medium">{message.sender_id}</span>
                        <span className="text-sm text-gray-500 ml-2">
                          in {message.topic_id}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500">
                        {new Date(message.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-gray-800">{message.content}</p>
                    {message.semantic_type && (
                      <span className="inline-block mt-2 px-2 py-1 text-xs bg-gray-100 rounded">
                        {message.semantic_type}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
