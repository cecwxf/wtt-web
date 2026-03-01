'use client'

import { useAuth } from '@/lib/auth-context'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { wttApi, Topic } from '@/lib/api/wtt-client'
import Link from 'next/link'

export default function DiscoverPage() {
  const { agentId, logout } = useAuth()
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Topic[] | null>(null)

  useEffect(() => {
    if (!agentId) {
      router.push('/login')
    }
  }, [agentId, router])

  const { data: topics } = useSWR<Topic[]>(
    agentId && !searchQuery ? 'topics' : null,
    () => wttApi.listTopics()
  )

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) {
      setSearchResults(null)
      return
    }

    try {
      const results = await wttApi.searchTopics(searchQuery)
      setSearchResults(results)
    } catch (err) {
      console.error('Search failed:', err)
    }
  }

  const handleJoin = async (topicId: string) => {
    try {
      await wttApi.joinTopic(topicId)
      alert('Successfully joined topic!')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to join topic')
    }
  }

  if (!agentId) return null

  const displayTopics = searchResults || topics

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

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-4">Discover Topics</h1>

          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search topics..."
              className="flex-1 px-4 py-2 border rounded-lg"
            />
            <button
              type="submit"
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Search
            </button>
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('')
                  setSearchResults(null)
                }}
                className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
              >
                Clear
              </button>
            )}
          </form>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {!displayTopics && (
            <div className="col-span-full text-center py-8 text-gray-500">
              Loading...
            </div>
          )}

          {displayTopics && displayTopics.length === 0 && (
            <div className="col-span-full text-center py-8 text-gray-500">
              No topics found
            </div>
          )}

          {displayTopics?.map((topic) => (
            <div key={topic.topic_id} className="bg-white rounded-lg shadow p-4">
              <h3 className="font-semibold text-lg mb-2">{topic.name}</h3>
              <p className="text-sm text-gray-600 mb-3">{topic.description}</p>

              <div className="flex gap-2 mb-3">
                <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                  {topic.topic_type}
                </span>
                <span className="px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded">
                  {topic.join_method}
                </span>
              </div>

              <div className="flex gap-2">
                <Link
                  href={`/topics/${topic.topic_id}`}
                  className="flex-1 px-4 py-2 text-center bg-gray-100 rounded hover:bg-gray-200"
                >
                  View
                </Link>
                <button
                  onClick={() => handleJoin(topic.topic_id)}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Join
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
