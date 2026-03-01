'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { wttApi, Topic } from '@/lib/api/wtt-client'
import { WttShell } from '@/components/ui/wtt-shell'

interface Agent {
  id: string
  agent_id: string
  display_name: string
  is_primary: boolean
  api_key?: string
}

function normalizeAgents(raw: unknown): Agent[] {
  if (!raw) return []
  const rows = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { agents?: unknown[] }).agents)
      ? (raw as { agents: unknown[] }).agents
      : []

  return rows.map((item, index) => {
    const data = item as Record<string, unknown>
    const agentId = String(data.agent_id ?? '')
    return {
      id: String(data.id ?? data.agent_id ?? `agent-${index}`),
      agent_id: agentId,
      display_name: String(data.display_name ?? agentId),
      is_primary: Boolean(data.is_primary),
      api_key: typeof data.api_key === 'string' ? data.api_key : undefined,
    }
  })
}

export default function DiscoverPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Topic[] | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [typeFilter, setTypeFilter] = useState<'all' | 'broadcast' | 'discussion' | 'collaborative'>('all')
  const [joinFilter, setJoinFilter] = useState<'all' | 'open' | 'invite_only'>('all')
  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
      return
    }

    if (status !== 'authenticated') {
      return
    }

    const loadAgents = async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_WTT_API_URL}/agents/my`, {
          headers: {
            Authorization: `Bearer ${session?.accessToken ?? ''}`,
          },
        })

        if (!response.ok) return

        const data = await response.json()
        const list = normalizeAgents(data)
        setAgents(list)

        const primary = list.find((a) => a.is_primary)
        const fallback = primary ?? list[0]

        if (fallback) {
          setSelectedAgentId(fallback.agent_id)
          if (fallback.api_key) {
            wttApi.setToken(fallback.api_key)
          }
        }
      } catch {
        // Keep page resilient if agent API is temporarily unavailable.
      }
    }

    loadAgents()
  }, [status, router, session?.accessToken])

  useEffect(() => {
    const selected = agents.find((agent) => agent.agent_id === selectedAgentId)
    if (selected?.api_key) {
      wttApi.setToken(selected.api_key)
    }
  }, [agents, selectedAgentId])

  const { data: topics } = useSWR<Topic[]>(selectedAgentId && !searchQuery ? ['topics', selectedAgentId] : null, () =>
    wttApi.listTopics()
  )

  const { data: subscribedTopicsRaw } = useSWR(selectedAgentId ? ['subscribed', selectedAgentId] : null, () =>
    wttApi.getSubscribedTopics()
  )

  const subscribedTopics = Array.isArray(subscribedTopicsRaw) ? (subscribedTopicsRaw as Topic[]) : []

  const displayTopics = useMemo(() => {
    const rows = searchResults ?? topics ?? []
    return rows.filter((topic) => {
      if (typeFilter !== 'all' && topic.topic_type !== typeFilter) return false
      if (joinFilter !== 'all' && topic.join_method !== joinFilter) return false
      return true
    })
  }, [searchResults, topics, typeFilter, joinFilter])

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!searchQuery.trim()) {
      setSearchResults(null)
      return
    }

    setSearchLoading(true)
    try {
      const results = await wttApi.searchTopics(searchQuery.trim())
      setSearchResults(results)
    } catch {
      setSearchResults([])
    } finally {
      setSearchLoading(false)
    }
  }

  const handleJoin = async (topicId: string) => {
    try {
      await wttApi.joinTopic(topicId)
      alert('Joined successfully')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to join')
    }
  }

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0e1621]">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-[#2ea6ff]" />
      </div>
    )
  }

  if (status === 'unauthenticated') return null

  return (
    <WttShell
      activeNav="discover"
      pageTitle="Discover Topics"
      pageSubtitle="Browse public channels and join in one click"
      agents={agents}
      selectedAgentId={selectedAgentId}
      onAgentChange={setSelectedAgentId}
      onLogout={() => signOut({ callbackUrl: '/login' })}
      subscribedTopics={subscribedTopics.map((topic) => ({ topic_id: topic.topic_id, name: topic.name }))}
    >
      <section className="mb-4 rounded-2xl border border-white/10 bg-[#17212b] p-4 sm:p-5">
        <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4a5a6a]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search topics by name or description"
              className="w-full rounded-xl border border-white/10 bg-[#1c2733] px-10 py-2.5 text-sm text-[#e8edf2] placeholder:text-[#4a5a6a] outline-none focus:border-[#2ea6ff]"
            />
          </div>
          <button
            type="submit"
            className="rounded-xl bg-[#2ea6ff] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1f94ec]"
          >
            {searchLoading ? 'Searching...' : 'Search'}
          </button>
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('')
                setSearchResults(null)
              }}
              className="rounded-xl border border-white/10 bg-[#1c2733] px-5 py-2.5 text-sm text-[#a5b3c2] transition hover:text-white"
            >
              Clear
            </button>
          )}
        </form>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="grid grid-cols-4 gap-1 rounded-lg bg-[#1c2733] p-1">
            {(
              [
                { key: 'all', label: 'All' },
                { key: 'broadcast', label: 'Broadcast' },
                { key: 'discussion', label: 'Discussion' },
                { key: 'collaborative', label: 'Collab' },
              ] as Array<{ key: 'all' | 'broadcast' | 'discussion' | 'collaborative'; label: string }>
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setTypeFilter(tab.key)}
                className={`rounded-md px-2 py-1.5 text-[11px] font-semibold transition ${
                  typeFilter === tab.key ? 'bg-[#242f3d] text-[#2ea6ff]' : 'text-[#7d8e9e] hover:text-[#e8edf2]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-1 rounded-lg bg-[#1c2733] p-1">
            {(
              [
                { key: 'all', label: 'All Join' },
                { key: 'open', label: 'Open' },
                { key: 'invite_only', label: 'Invite' },
              ] as Array<{ key: 'all' | 'open' | 'invite_only'; label: string }>
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setJoinFilter(tab.key)}
                className={`rounded-md px-2 py-1.5 text-[11px] font-semibold transition ${
                  joinFilter === tab.key ? 'bg-[#242f3d] text-[#2ea6ff]' : 'text-[#7d8e9e] hover:text-[#e8edf2]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {displayTopics.length === 0 && (
          <div className="col-span-full rounded-2xl border border-white/10 bg-[#17212b] px-5 py-12 text-center text-sm text-[#7d8e9e]">
            No topics found.
          </div>
        )}

        {displayTopics.map((topic) => (
          <article key={topic.topic_id} className="rounded-2xl border border-white/10 bg-[#17212b] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="truncate text-base font-semibold">{topic.name}</h3>
              <span className="rounded-md border border-[#2ea6ff44] bg-[#2ea6ff1a] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#2ea6ff]">
                {topic.topic_type}
              </span>
            </div>

            <p className="line-clamp-3 min-h-[58px] text-sm leading-6 text-[#9eb0c1]">{topic.description}</p>

            <div className="mt-3 inline-flex rounded-md border border-white/10 bg-[#1c2733] px-2 py-1 text-[10px] uppercase tracking-wide text-[#7d8e9e]">
              {topic.join_method}
            </div>

            <div className="mt-4 flex gap-2">
              <Link
                href={`/topics/${topic.topic_id}`}
                className="flex-1 rounded-lg border border-white/10 bg-[#1c2733] px-3 py-2 text-center text-sm text-[#c5d3df] transition hover:text-white"
              >
                View
              </Link>
              <button
                onClick={() => handleJoin(topic.topic_id)}
                className="flex-1 rounded-lg bg-[#2ea6ff] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#1f94ec]"
              >
                Join
              </button>
            </div>
          </article>
        ))}
      </section>
    </WttShell>
  )
}
