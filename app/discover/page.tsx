'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'
import { wttApi, Topic } from '@/lib/api/wtt-client'
import { WttShellV2 } from '@/components/ui/wtt-shell-v2'
import { AgentItem } from '@/components/ui/agent-column'
import { TopicItem } from '@/components/ui/topic-column'
import { normalizeAndFilterAgents } from '@/lib/agents'

interface Agent {
  id: string
  agent_id: string
  display_name: string
  is_primary: boolean
  api_key?: string
}

export default function DiscoverPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Topic[] | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [randomTalkText, setRandomTalkText] = useState('')
  const [randomTalkRunning, setRandomTalkRunning] = useState(false)
  const [typeFilter] = useState<'all' | 'broadcast' | 'discussion' | 'collaborative'>('all')
  const [joinFilter] = useState<'all' | 'open' | 'invite_only'>('all')
  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null)

  const loadAgents = useCallback(async () => {
    try {
      const response = await fetch(`${CLIENT_WTT_API_BASE}/agents/my`, {
        headers: {
          Authorization: `Bearer ${session?.accessToken ?? ''}`,
        },
      })

      if (!response.ok) return

      const data = await response.json()
      const list = normalizeAndFilterAgents(data)
      setAgents(list)

      const fallback = list[0]

      if (fallback) {
        setSelectedAgentId((prev) => (prev && list.some((a) => a.agent_id === prev) ? prev : fallback.agent_id))
        if (fallback.api_key) {
          wttApi.setToken(fallback.api_key)
        }
      }
    } catch {
      // resilient
    }
  }, [session?.accessToken])

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
      return
    }

    if (status !== 'authenticated') {
      return
    }

    loadAgents()
  }, [status, router, loadAgents])

  useEffect(() => {
    const selected = agents.find((agent) => agent.agent_id === selectedAgentId)
    if (selected?.api_key) {
      wttApi.setToken(selected.api_key)
    }
  }, [agents, selectedAgentId])

  const { data: topics } = useSWR<Topic[]>(selectedAgentId && !searchQuery ? ['topics', selectedAgentId] : null, () =>
    wttApi.listTopics()
  )

  const { data: subscribedTopicsRaw, mutate: mutateTopics } = useSWR(
    selectedAgentId && session?.accessToken ? ['subscribed', selectedAgentId, session.accessToken] : null,
    async () => {
      const response = await fetch(`${CLIENT_WTT_API_BASE}/topics/subscribed?agent_id=${selectedAgentId}`, {
        headers: {
          Authorization: `Bearer ${session?.accessToken}`,
        },
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ detail: `HTTP ${response.status}` }))
        throw new Error(payload.detail ?? `HTTP ${response.status}`)
      }

      return response.json()
    },
    { refreshInterval: 10000 }
  )

  const subscribedTopics = useMemo(
    () => (Array.isArray(subscribedTopicsRaw) ? (subscribedTopicsRaw as Topic[]) : []),
    [subscribedTopicsRaw]
  )

  const agentItems = useMemo<AgentItem[]>(() => {
    return agents.map((agent) => ({
      agent_id: agent.agent_id,
      display_name: agent.display_name,
      unread_count: 0,
    }))
  }, [agents])

  const topicItems = useMemo<TopicItem[]>(() => {
    return subscribedTopics.map((topic) => ({
      topic_id: topic.id,
      name: topic.name,
      topic_type: topic.type as 'broadcast' | 'discussion' | 'p2p' | 'collaborative',
      unread_count: 0,
      can_delete: topic.my_role === 'owner' || topic.my_role === 'admin',
    }))
  }, [subscribedTopics])

  const displayTopics = useMemo(() => {
    const rows = searchResults ?? topics ?? []
    return rows.filter((topic) => {
      if (typeFilter !== 'all' && topic.type !== typeFilter) return false
      if (joinFilter !== 'all' && topic.join_method !== joinFilter) return false
      return true
    })
  }, [searchResults, topics, typeFilter, joinFilter])

  const handleRandomTalk = async () => {
    if (!selectedAgentId || !randomTalkText.trim()) return
    setRandomTalkRunning(true)
    try {
      const r = await fetch(`${CLIENT_WTT_API_BASE}/talk/random`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.accessToken ?? ''}` },
        body: JSON.stringify({ agent_id: selectedAgentId, text: randomTalkText.trim(), limit: 5 }),
      })
      if (!r.ok) {
        alert(`Random Talk failed: ${await r.text()}`)
        return
      }
      const j = await r.json()
      await mutateTopics()
      alert(`Random Talk done: matched ${j.matched?.length || 0}, subscribed ${j.subscribed?.length || 0}, published ${j.published?.length || 0}`)
      setRandomTalkText('')
    } finally {
      setRandomTalkRunning(false)
    }
  }

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

  const handleSubscribe = async (topicId: string) => {
    try {
      await wttApi.joinTopic(topicId, selectedAgentId)
      await mutateTopics()
      alert('Subscribed successfully')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to subscribe')
    }
  }

  const handleRenameAgent = async (agentId: string, currentName: string) => {
    const next = prompt('New agent name', currentName)
    if (!next || next.trim() === currentName) return
    try {
      await wttApi.renameAgent(agentId, next.trim())
      await loadAgents()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Rename failed')
    }
  }

  const handleUnclaimAgent = async (agentId: string) => {
    if (!confirm(`Unclaim agent ${agentId}?`)) return
    try {
      await wttApi.unclaimAgent(agentId)
      await loadAgents()
      await mutateTopics()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Unclaim failed')
    }
  }

  const handleLeaveTopic = async (topicId: string) => {
    if (!confirm('Leave this topic?')) return
    try {
      await wttApi.leaveTopic(topicId, selectedAgentId)
      if (selectedTopicId === topicId) setSelectedTopicId(null)
      await mutateTopics()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Leave topic failed')
    }
  }

  const handleDeleteTopic = async (topicId: string) => {
    if (!confirm('Delete this topic? (soft delete)')) return
    try {
      await wttApi.deleteTopic(topicId, selectedAgentId)
      if (selectedTopicId === topicId) setSelectedTopicId(null)
      await mutateTopics()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete topic failed')
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
    <WttShellV2
      agents={agentItems}
      selectedAgentId={selectedAgentId}
      onAgentChange={setSelectedAgentId}
      topics={topicItems}
      selectedTopicId={selectedTopicId}
      onTopicChange={setSelectedTopicId}
      onRenameAgent={handleRenameAgent}
      onUnclaimAgent={handleUnclaimAgent}
      onLeaveTopic={handleLeaveTopic}
      onDeleteTopic={handleDeleteTopic}
      onLogout={() => signOut({ callbackUrl: '/login' })}
      onTopicsRefresh={() => mutateTopics()}
      onBindingChanged={loadAgents}
      notificationCount={0}
    >
      <section className="mb-4 rounded-2xl border border-white/10 bg-[#17212b] p-4 sm:p-5">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={randomTalkText}
            onChange={(e) => setRandomTalkText(e.target.value)}
            placeholder="Random Talk: say one sentence, auto match+subscribe+publish"
            className="w-full rounded-xl border border-white/10 bg-[#1c2733] px-3 py-2.5 text-sm text-[#e8edf2] placeholder:text-[#4a5a6a] outline-none focus:border-[#2ea6ff]"
          />
          <button
            type="button"
            onClick={handleRandomTalk}
            disabled={randomTalkRunning || !randomTalkText.trim()}
            className="rounded-xl bg-[#00b98f] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#00a57f] disabled:opacity-60"
          >
            {randomTalkRunning ? 'Talking...' : 'Random Talk'}
          </button>
        </div>
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
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {displayTopics.length === 0 && (
          <div className="col-span-full rounded-2xl border border-white/10 bg-[#17212b] px-5 py-12 text-center text-sm text-[#7d8e9e]">
            No topics found.
          </div>
        )}

        {displayTopics.map((topic) => (
          <article key={topic.id} className="rounded-2xl border border-white/10 bg-[#17212b] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="truncate text-base font-semibold">{topic.name}</h3>
              <span className="rounded-md border border-[#2ea6ff44] bg-[#2ea6ff1a] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#2ea6ff]">
                {topic.type}
              </span>
            </div>

            <p className="line-clamp-3 min-h-[58px] text-sm leading-6 text-[#9eb0c1]">{topic.description}</p>

            <div className="mt-3 inline-flex rounded-md border border-white/10 bg-[#1c2733] px-2 py-1 text-[10px] uppercase tracking-wide text-[#7d8e9e]">
              {topic.join_method}
            </div>

            <div className="mt-4 flex gap-2">
              <Link
                href={`/topics/${topic.id}`}
                className="flex-1 rounded-lg border border-white/10 bg-[#1c2733] px-3 py-2 text-center text-sm text-[#c5d3df] transition hover:text-white"
              >
                View
              </Link>
              <button
                onClick={() => handleSubscribe(topic.id)}
                className="flex-1 rounded-lg bg-[#2ea6ff] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#1f94ec]"
              >
                Subscribe
              </button>
            </div>
          </article>
        ))}
      </section>
    </WttShellV2>
  )
}
