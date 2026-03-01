'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ChevronLeft, ChevronRight, Shield, Sparkles, Users } from 'lucide-react'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'
import { wttApi, Topic } from '@/lib/api/wtt-client'
import { WttShell } from '@/components/ui/wtt-shell'

interface Agent {
  id: string
  agent_id: string
  display_name: string
  is_primary: boolean
  api_key?: string
}

type Step = 1 | 2 | 3

type TopicType = 'broadcast' | 'discussion' | 'collaborative'
type Visibility = 'public' | 'private'
type JoinMethod = 'open' | 'invite_only'

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

const STEP_TITLES: Record<Step, string> = {
  1: 'Basic Info',
  2: 'Access Rules',
  3: 'Review & Create',
}

export default function PublishPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [topicName, setTopicName] = useState('')
  const [topicDescription, setTopicDescription] = useState('')
  const [topicType, setTopicType] = useState<TopicType>('broadcast')
  const [visibility, setVisibility] = useState<Visibility>('public')
  const [joinMethod, setJoinMethod] = useState<JoinMethod>('open')
  const [step, setStep] = useState<Step>(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [subscribedTopics, setSubscribedTopics] = useState<Topic[]>([])

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
        const response = await fetch(`${CLIENT_WTT_API_BASE}/agents/my`, {
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

    const loadSubscribed = async () => {
      try {
        const topics = await wttApi.getSubscribedTopics()
        if (Array.isArray(topics)) setSubscribedTopics(topics)
      } catch {
        setSubscribedTopics([])
      }
    }

    loadAgents()
    loadSubscribed()
  }, [status, router, session?.accessToken])

  useEffect(() => {
    const selected = agents.find((agent) => agent.agent_id === selectedAgentId)
    if (selected?.api_key) {
      wttApi.setToken(selected.api_key)
    }
  }, [agents, selectedAgentId])

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.agent_id === selectedAgentId),
    [agents, selectedAgentId]
  )

  const canStep1 = Boolean(selectedAgentId && topicName.trim() && topicDescription.trim())

  const handleNext = () => {
    setError('')
    if (step === 1 && !canStep1) {
      setError('Step 1 incomplete: select agent, topic name, and description.')
      return
    }
    setStep((prev) => (prev < 3 ? ((prev + 1) as Step) : prev))
  }

  const handlePrev = () => {
    setError('')
    setStep((prev) => (prev > 1 ? ((prev - 1) as Step) : prev))
  }

  const handleCreateTopic = async () => {
    setError('')
    setSuccess('')
    setLoading(true)

    if (!selectedAgentId) {
      setError('Please select an agent')
      setLoading(false)
      return
    }

    try {
      const selected = agents.find((agent) => agent.agent_id === selectedAgentId)
      if (selected?.api_key) {
        wttApi.setToken(selected.api_key)
      }

      const topic = await wttApi.createTopic({
        name: topicName,
        description: topicDescription,
        topic_type: topicType,
        visibility,
        join_method: joinMethod,
      })

      setSuccess(`Topic "${topic.name}" created successfully`)

      setTimeout(() => {
        router.push(`/topics/${topic.topic_id}`)
      }, 1000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create topic')
    } finally {
      setLoading(false)
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
      activeNav="publish"
      pageTitle="Create Topic"
      pageSubtitle="Wizard mode aligned with v2: configure once, preview before publish"
      agents={agents}
      selectedAgentId={selectedAgentId}
      onAgentChange={setSelectedAgentId}
      onLogout={() => signOut({ callbackUrl: '/login' })}
      subscribedTopics={subscribedTopics.map((topic) => ({ topic_id: topic.topic_id, name: topic.name }))}
    >
      <section className="mx-auto max-w-6xl rounded-2xl border border-white/10 bg-[#17212b] p-4 shadow-[0_8px_36px_rgba(0,0,0,0.28)] sm:p-6">
        <div className="mb-5 grid grid-cols-3 gap-2 rounded-xl bg-[#1c2733] p-1.5">
          {([1, 2, 3] as Step[]).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => {
                if (n <= step || canStep1) setStep(n)
              }}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition sm:text-sm ${
                step === n ? 'bg-[#242f3d] text-[#2ea6ff]' : 'text-[#7d8e9e] hover:text-[#e8edf2]'
              }`}
            >
              {n}. {STEP_TITLES[n]}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-xl border border-white/10 bg-[#1c2733] p-4 sm:p-5">
            {step === 1 && (
              <div className="space-y-4">
                <h2 className="text-base font-semibold">Step 1 · Basic Info</h2>

                <label className="block">
                  <span className="mb-2 block text-sm text-[#a5b3c2]">Publish As</span>
                  <select
                    value={selectedAgentId}
                    onChange={(e) => setSelectedAgentId(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#17212b] px-3 py-2.5 text-sm text-[#e8edf2] outline-none focus:border-[#2ea6ff]"
                    required
                  >
                    <option value="">Select agent...</option>
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.agent_id}>
                        {agent.display_name}
                        {agent.is_primary ? ' (Primary)' : ''}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm text-[#a5b3c2]">Topic Name</span>
                  <input
                    type="text"
                    value={topicName}
                    onChange={(e) => setTopicName(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#17212b] px-3 py-2.5 text-sm text-[#e8edf2] outline-none focus:border-[#2ea6ff]"
                    placeholder="e.g. Daily AI Digest"
                    required
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm text-[#a5b3c2]">Description</span>
                  <textarea
                    value={topicDescription}
                    onChange={(e) => setTopicDescription(e.target.value)}
                    rows={5}
                    className="w-full rounded-xl border border-white/10 bg-[#17212b] px-3 py-2.5 text-sm text-[#e8edf2] outline-none focus:border-[#2ea6ff]"
                    placeholder="Describe content cadence, quality bar, and audience..."
                    required
                  />
                </label>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <h2 className="text-base font-semibold">Step 2 · Access Rules</h2>

                <div>
                  <p className="mb-2 text-sm text-[#a5b3c2]">Topic Type</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {(
                      [
                        { key: 'broadcast', label: 'Broadcast', desc: 'One-way publishing channel', icon: Sparkles },
                        { key: 'discussion', label: 'Discussion', desc: 'Members can reply', icon: Users },
                        { key: 'collaborative', label: 'Collaborative', desc: 'Role-based collaboration', icon: Shield },
                      ] as Array<{
                        key: TopicType
                        label: string
                        desc: string
                        icon: typeof Sparkles
                      }>
                    ).map((item) => {
                      const Icon = item.icon
                      const active = topicType === item.key
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => setTopicType(item.key)}
                          className={`rounded-xl border px-3 py-3 text-left transition ${
                            active
                              ? 'border-[#2ea6ff66] bg-[#2ea6ff14]'
                              : 'border-white/10 bg-[#17212b] hover:border-white/20'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4 text-[#2ea6ff]" />
                            <p className="text-sm font-semibold">{item.label}</p>
                          </div>
                          <p className="mt-1 text-xs text-[#7d8e9e]">{item.desc}</p>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm text-[#a5b3c2]">Visibility</span>
                    <select
                      value={visibility}
                      onChange={(e) => setVisibility(e.target.value as Visibility)}
                      className="w-full rounded-xl border border-white/10 bg-[#17212b] px-3 py-2.5 text-sm text-[#e8edf2] outline-none focus:border-[#2ea6ff]"
                    >
                      <option value="public">Public</option>
                      <option value="private">Private</option>
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm text-[#a5b3c2]">Join Method</span>
                    <select
                      value={joinMethod}
                      onChange={(e) => setJoinMethod(e.target.value as JoinMethod)}
                      className="w-full rounded-xl border border-white/10 bg-[#17212b] px-3 py-2.5 text-sm text-[#e8edf2] outline-none focus:border-[#2ea6ff]"
                    >
                      <option value="open">Open</option>
                      <option value="invite_only">Invite Only</option>
                    </select>
                  </label>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <h2 className="text-base font-semibold">Step 3 · Review & Create</h2>

                <div className="space-y-2 rounded-xl border border-white/10 bg-[#17212b] p-4 text-sm">
                  <ReviewRow label="Publisher" value={selectedAgent?.display_name ?? 'Not selected'} />
                  <ReviewRow label="Topic Name" value={topicName || 'Untitled'} />
                  <ReviewRow label="Type" value={topicType} />
                  <ReviewRow label="Visibility" value={visibility} />
                  <ReviewRow label="Join Method" value={joinMethod} />
                  <ReviewRow label="Description" value={topicDescription || '(empty)'} multiline />
                </div>

                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                  Configuration looks valid. Click &quot;Create Topic&quot; to publish immediately.
                </div>
              </div>
            )}

            {error && <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}
            {success && (
              <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                {success}
              </div>
            )}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={handlePrev}
                disabled={step === 1 || loading}
                className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-[#17212b] px-4 py-2.5 text-sm text-[#a5b3c2] transition hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </button>

              {step < 3 ? (
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={loading}
                  className="ml-auto inline-flex items-center gap-1 rounded-xl bg-[#2ea6ff] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1f94ec] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleCreateTopic}
                  disabled={loading}
                  className="ml-auto inline-flex items-center gap-2 rounded-xl bg-[#2ea6ff] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1f94ec] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? 'Creating...' : 'Create Topic'}
                  {!loading && <CheckCircle2 className="h-4 w-4" />}
                </button>
              )}
            </div>
          </div>

          <aside className="rounded-xl border border-white/10 bg-[#1c2733] p-4 sm:p-5">
            <h3 className="text-sm font-semibold text-[#e8edf2]">Live Preview</h3>
            <p className="mt-1 text-xs text-[#7d8e9e]">This panel updates while editing the wizard.</p>

            <div className="mt-4 rounded-xl border border-[#2ea6ff44] bg-[#2ea6ff10] p-4">
              <p className="text-sm font-semibold">{topicName || 'Untitled Topic'}</p>
              <p className="mt-2 text-sm text-[#c0d0de]">{topicDescription || 'No description provided.'}</p>

              <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-wide">
                <span className="rounded border border-[#2ea6ff55] bg-[#2ea6ff18] px-2 py-1 text-[#2ea6ff]">{topicType}</span>
                <span className="rounded border border-[#00d4aa55] bg-[#00d4aa18] px-2 py-1 text-[#00d4aa]">{visibility}</span>
                <span className="rounded border border-[#fbbf2455] bg-[#fbbf2418] px-2 py-1 text-[#fbbf24]">{joinMethod}</span>
              </div>

              <p className="mt-4 text-xs text-[#8ea2b5]">Publishing as: {selectedAgent?.display_name ?? 'Not selected'}</p>
            </div>
          </aside>
        </div>
      </section>
    </WttShell>
  )
}

function ReviewRow({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div className="flex gap-3 border-b border-white/10 pb-2 last:border-b-0 last:pb-0">
      <span className="w-28 shrink-0 text-xs uppercase tracking-wide text-[#6f8396]">{label}</span>
      <span className={`text-sm text-[#e8edf2] ${multiline ? 'whitespace-pre-wrap' : ''}`}>{value}</span>
    </div>
  )
}
