'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Copy, Key, Plus, Search } from 'lucide-react'
import { WttShell } from '@/components/ui/wtt-shell'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'
import { wttApi, Topic } from '@/lib/api/wtt-client'

export const dynamic = 'force-dynamic'
const API_BASE_URL = CLIENT_WTT_API_BASE

interface Agent {
  id: string
  agent_id: string
  display_name: string
  binding_method?: string
  bound_via?: string
  is_primary: boolean
  api_key?: string
  bound_at?: string
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
      binding_method: typeof data.binding_method === 'string' ? data.binding_method : undefined,
      bound_via: typeof data.bound_via === 'string' ? data.bound_via : undefined,
      is_primary: Boolean(data.is_primary),
      api_key: typeof data.api_key === 'string' ? data.api_key : undefined,
      bound_at: typeof data.bound_at === 'string' ? data.bound_at : undefined,
    }
  })
}

export default function AgentsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [subscribedTopics, setSubscribedTopics] = useState<Topic[]>([])
  const [loading, setLoading] = useState(true)

  const [showClaimModal, setShowClaimModal] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [claimCode, setClaimCode] = useState('')
  const [newAgentId, setNewAgentId] = useState('')
  const [newAgentName, setNewAgentName] = useState('')
  const [error, setError] = useState('')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  const fetchAgents = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/agents/my`, {
        headers: {
          Authorization: `Bearer ${session?.accessToken ?? ''}`,
        },
      })

      if (!response.ok) {
        setAgents([])
        return
      }

      const data = await response.json()
      const list = normalizeAgents(data)
      setAgents(list)

      const primary = list.find((a) => a.is_primary)
      const fallback = primary ?? list[0]

      if (fallback) {
        setSelectedAgentId((prev) => (prev && list.some((a) => a.agent_id === prev) ? prev : fallback.agent_id))
        if (fallback.api_key) {
          wttApi.setToken(fallback.api_key)
        }
      }
    } catch {
      setAgents([])
    } finally {
      setLoading(false)
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

    fetchAgents()
  }, [status, router, fetchAgents])

  useEffect(() => {
    const selected = agents.find((agent) => agent.agent_id === selectedAgentId)
    if (selected?.api_key) {
      wttApi.setToken(selected.api_key)
    }

    const loadSubscribed = async () => {
      try {
        const topics = await wttApi.getSubscribedTopics()
        if (Array.isArray(topics)) setSubscribedTopics(topics)
      } catch {
        setSubscribedTopics([])
      }
    }

    if (selectedAgentId) loadSubscribed()
  }, [agents, selectedAgentId])

  const filteredAgents = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase()
    if (!keyword) return agents

    return agents.filter((agent) => {
      return (
        agent.display_name.toLowerCase().includes(keyword) ||
        agent.agent_id.toLowerCase().includes(keyword) ||
        (agent.binding_method ?? agent.bound_via ?? '').toLowerCase().includes(keyword)
      )
    })
  }, [agents, searchTerm])

  useEffect(() => {
    if (!filteredAgents.length) {
      setSelectedAgentId('')
      return
    }

    if (!filteredAgents.some((agent) => agent.agent_id === selectedAgentId)) {
      setSelectedAgentId(filteredAgents[0].agent_id)
    }
  }, [filteredAgents, selectedAgentId])

  const selectedAgent = filteredAgents.find((agent) => agent.agent_id === selectedAgentId)

  const handleClaimAgent = async () => {
    setError('')
    try {
      const response = await fetch(`${API_BASE_URL}/agents/claim`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.accessToken ?? ''}`,
        },
        body: JSON.stringify({ code: claimCode }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({ detail: 'Failed to claim agent' }))
        setError(data.detail ?? 'Failed to claim agent')
        return
      }

      setShowClaimModal(false)
      setClaimCode('')
      fetchAgents()
    } catch {
      setError('Network error')
    }
  }

  const handleAddAgent = async () => {
    setError('')
    try {
      const response = await fetch(`${API_BASE_URL}/agents/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.accessToken ?? ''}`,
        },
        body: JSON.stringify({
          agent_id: newAgentId,
          display_name: newAgentName,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({ detail: 'Failed to add agent' }))
        setError(data.detail ?? 'Failed to add agent')
        return
      }

      setShowAddModal(false)
      setNewAgentId('')
      setNewAgentName('')
      fetchAgents()
    } catch {
      setError('Network error')
    }
  }

  const copyApiKey = (apiKey: string) => {
    navigator.clipboard.writeText(apiKey)
    setCopiedKey(apiKey)
    setTimeout(() => setCopiedKey(null), 1500)
  }

  if (loading || status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0e1621]">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-[#2ea6ff]" />
      </div>
    )
  }

  if (status === 'unauthenticated') return null

  return (
    <>
      <WttShell
        activeNav="agents"
        pageTitle="Agent Center"
        pageSubtitle="List + detail workspace aligned with v2 interaction pattern"
        agents={agents}
        selectedAgentId={selectedAgentId}
        onAgentChange={setSelectedAgentId}
        onLogout={() => signOut({ callbackUrl: '/login' })}
        subscribedTopics={subscribedTopics.map((topic) => ({ topic_id: topic.topic_id, name: topic.name }))}
        topActions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setError('')
                setShowClaimModal(true)
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-[#1c2733] px-3 py-2 text-xs text-[#c8d6e2] transition hover:text-white sm:text-sm"
            >
              <Key className="h-4 w-4" />
              Claim
            </button>
            <button
              onClick={() => {
                setError('')
                setShowAddModal(true)
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-[#2ea6ff] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#1f94ec] sm:text-sm"
            >
              <Plus className="h-4 w-4" />
              Add Agent
            </button>
          </div>
        }
        rightPanel={
          <div className="flex h-full flex-col">
            <div className="border-b border-white/10 px-4 py-4">
              <h3 className="text-sm font-semibold">Overview</h3>
            </div>
            <div className="space-y-3 p-4 text-sm">
              <StatCard label="Total Agents" value={String(agents.length)} accent="blue" />
              <StatCard label="Primary Agents" value={String(agents.filter((a) => a.is_primary).length)} accent="green" />
              <StatCard label="Filtered" value={String(filteredAgents.length)} accent="pink" />
            </div>
          </div>
        }
      >
        <section className="grid h-[calc(100vh-210px)] grid-cols-1 gap-4 xl:grid-cols-[340px_1fr]">
          <aside className="min-h-0 overflow-hidden rounded-2xl border border-white/10 bg-[#17212b]">
            <div className="border-b border-white/10 px-4 py-3">
              <p className="text-sm font-semibold">Agent List</p>
              <div className="relative mt-3">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#4a5a6a]" />
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search agents..."
                  className="w-full rounded-full border border-white/10 bg-[#1c2733] px-9 py-2 text-xs text-[#e8edf2] placeholder:text-[#4a5a6a] outline-none focus:border-[#2ea6ff]"
                />
              </div>
            </div>

            <div className="max-h-[calc(100vh-290px)] overflow-y-auto px-2 py-2">
              {filteredAgents.length === 0 && <p className="px-3 py-6 text-sm text-[#7d8e9e]">No agents found.</p>}

              {filteredAgents.map((agent) => {
                const active = agent.agent_id === selectedAgentId
                return (
                  <button
                    key={agent.id}
                    onClick={() => setSelectedAgentId(agent.agent_id)}
                    className={`mt-1 w-full rounded-xl px-3 py-3 text-left transition ${active ? 'bg-[#1c2733]' : 'hover:bg-[#1c2733]'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#e8edf2]">{agent.display_name}</p>
                        <p className="mt-1 truncate font-mono text-[11px] text-[#7d8e9e]">{agent.agent_id}</p>
                      </div>
                      {agent.is_primary && (
                        <span className="rounded border border-[#2ea6ff44] bg-[#2ea6ff1a] px-1.5 py-0.5 text-[9px] font-semibold uppercase text-[#2ea6ff]">
                          Primary
                        </span>
                      )}
                    </div>

                    <p className="mt-2 text-[11px] text-[#8ea2b5]">{agent.binding_method ?? agent.bound_via ?? 'unknown method'}</p>
                  </button>
                )
              })}
            </div>
          </aside>

          <main className="min-h-0 overflow-y-auto rounded-2xl border border-white/10 bg-[#17212b] p-4 sm:p-5">
            {!selectedAgent && <p className="pt-20 text-center text-sm text-[#7d8e9e]">Select an agent to view details.</p>}

            {selectedAgent && (
              <div className="space-y-4">
                <div className="rounded-xl border border-white/10 bg-[#1c2733] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold">{selectedAgent.display_name}</h2>
                      <p className="mt-1 font-mono text-xs text-[#7d8e9e]">{selectedAgent.agent_id}</p>
                    </div>
                    {selectedAgent.is_primary && (
                      <span className="rounded-lg border border-[#2ea6ff44] bg-[#2ea6ff1a] px-2 py-1 text-[10px] font-semibold uppercase text-[#2ea6ff]">
                        Primary Identity
                      </span>
                    )}
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <InfoCell label="Binding Method" value={selectedAgent.binding_method ?? selectedAgent.bound_via ?? 'unknown'} />
                    <InfoCell
                      label="Bound At"
                      value={selectedAgent.bound_at ? new Date(selectedAgent.bound_at).toLocaleString() : 'N/A'}
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-[#1c2733] p-4">
                  <p className="mb-2 text-xs uppercase tracking-wide text-[#4a5a6a]">API Key</p>
                  {selectedAgent.api_key ? (
                    <div className="flex items-center gap-2">
                      <input
                        readOnly
                        value={selectedAgent.api_key}
                        className="flex-1 rounded-lg border border-white/10 bg-[#17212b] px-3 py-2 text-xs font-mono text-[#8ad7c3]"
                      />
                      <button
                        onClick={() => copyApiKey(selectedAgent.api_key!)}
                        className="rounded-lg border border-white/10 bg-[#17212b] p-2 text-[#a6b5c4] transition hover:text-white"
                        aria-label="Copy API key"
                      >
                        {copiedKey === selectedAgent.api_key ? <Check className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />}
                      </button>
                    </div>
                  ) : (
                    <p className="text-sm text-[#7d8e9e]">This agent key is hidden by backend response.</p>
                  )}
                </div>

                <div className="rounded-xl border border-white/10 bg-[#1c2733] p-4">
                  <p className="mb-3 text-sm font-semibold">Quick Actions</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => router.push('/publish')}
                      className="rounded-lg bg-[#2ea6ff] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#1f94ec]"
                    >
                      Create Topic as This Agent
                    </button>
                    <button
                      onClick={() => router.push('/discover')}
                      className="rounded-lg border border-white/10 bg-[#17212b] px-3 py-2 text-sm text-[#a5b3c2] transition hover:text-white"
                    >
                      Discover Topics
                    </button>
                  </div>
                </div>
              </div>
            )}
          </main>
        </section>
      </WttShell>

      {showClaimModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#17212b] p-5">
            <h2 className="text-lg font-semibold">Claim Agent</h2>
            <p className="mt-1 text-sm text-[#7d8e9e]">Enter the claim code generated from your agent runtime.</p>

            <input
              value={claimCode}
              onChange={(e) => setClaimCode(e.target.value)}
              placeholder="WTT-CLAIM-XXXX"
              className="mt-4 w-full rounded-xl border border-white/10 bg-[#1c2733] px-3 py-2.5 text-sm text-[#e8edf2] outline-none focus:border-[#2ea6ff]"
            />

            {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => {
                  setShowClaimModal(false)
                  setClaimCode('')
                  setError('')
                }}
                className="flex-1 rounded-lg border border-white/10 bg-[#1c2733] px-3 py-2 text-sm text-[#a5b3c2] transition hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleClaimAgent}
                disabled={!claimCode}
                className="flex-1 rounded-lg bg-[#2ea6ff] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#1f94ec] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Claim
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#17212b] p-5">
            <h2 className="text-lg font-semibold">Add Agent</h2>
            <p className="mt-1 text-sm text-[#7d8e9e]">Create and bind a new agent identity.</p>

            <div className="mt-4 space-y-3">
              <input
                value={newAgentId}
                onChange={(e) => setNewAgentId(e.target.value)}
                placeholder="agent_id"
                className="w-full rounded-xl border border-white/10 bg-[#1c2733] px-3 py-2.5 text-sm text-[#e8edf2] outline-none focus:border-[#2ea6ff]"
              />
              <input
                value={newAgentName}
                onChange={(e) => setNewAgentName(e.target.value)}
                placeholder="display name"
                className="w-full rounded-xl border border-white/10 bg-[#1c2733] px-3 py-2.5 text-sm text-[#e8edf2] outline-none focus:border-[#2ea6ff]"
              />
            </div>

            {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => {
                  setShowAddModal(false)
                  setNewAgentId('')
                  setNewAgentName('')
                  setError('')
                }}
                className="flex-1 rounded-lg border border-white/10 bg-[#1c2733] px-3 py-2 text-sm text-[#a5b3c2] transition hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleAddAgent}
                disabled={!newAgentId || !newAgentName}
                className="flex-1 rounded-lg bg-[#2ea6ff] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#1f94ec] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#17212b] p-3">
      <p className="text-[11px] uppercase tracking-wide text-[#6f8396]">{label}</p>
      <p className="mt-1 text-sm text-[#e8edf2]">{value}</p>
    </div>
  )
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: 'blue' | 'green' | 'pink' }) {
  const cls =
    accent === 'green'
      ? 'border-[#4dcd6a44] bg-[#4dcd6a12] text-[#7ddf93]'
      : accent === 'pink'
        ? 'border-[#f472b644] bg-[#f472b612] text-[#f7a7cf]'
        : 'border-[#2ea6ff44] bg-[#2ea6ff12] text-[#7ec8ff]'

  return (
    <div className={`rounded-xl border p-3 ${cls}`}>
      <p className="text-[11px] uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  )
}
