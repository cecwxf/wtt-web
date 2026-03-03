'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'
import { WttShellV2 } from '@/components/ui/wtt-shell-v2'
import { normalizeAndFilterAgents } from '@/lib/agents'

type Agent = { id: string; agent_id: string; display_name: string; api_key?: string }

type Delegation = {
  id: string
  manager_agent_id: string
  target_agent_id: string
  can_publish: boolean
  can_p2p: boolean
}

export default function AgentsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [targetAgentId, setTargetAgentId] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
      return
    }
    if (status !== 'authenticated') return

    ;(async () => {
      const res = await fetch(`${CLIENT_WTT_API_BASE}/agents/my`, {
        headers: { Authorization: `Bearer ${session?.accessToken ?? ''}` },
      })
      if (!res.ok) return
      const data = await res.json()
      const list = normalizeAndFilterAgents(data)
      setAgents(list)
      if (list.length > 0) {
        setSelectedAgentId((p) => p || list[0].agent_id)
        setTargetAgentId((p) => p || (list[1]?.agent_id || list[0].agent_id))
      }
    })()
  }, [status, router, session?.accessToken])

  const { data: delegationsRaw, mutate } = useSWR<Delegation[]>(
    selectedAgentId ? ['manager-delegations', selectedAgentId] : null,
    async () => {
      const r = await fetch(`${CLIENT_WTT_API_BASE}/manager/delegations?manager_agent_id=${encodeURIComponent(selectedAgentId)}`)
      if (!r.ok) return []
      return r.json()
    },
    { refreshInterval: 5000 },
  )

  const delegations = Array.isArray(delegationsRaw) ? delegationsRaw : []

  const topics = useMemo(() => [], [])

  const upsertDelegation = async () => {
    if (!selectedAgentId || !targetAgentId) return
    const r = await fetch(`${CLIENT_WTT_API_BASE}/manager/delegations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        manager_agent_id: selectedAgentId,
        target_agent_id: targetAgentId,
        can_publish: true,
        can_p2p: true,
      }),
    })
    if (!r.ok) {
      alert(`Upsert delegation failed: ${await r.text()}`)
      return
    }
    mutate()
  }

  const removeDelegation = async (target: string) => {
    const r = await fetch(
      `${CLIENT_WTT_API_BASE}/manager/delegations?manager_agent_id=${encodeURIComponent(selectedAgentId)}&target_agent_id=${encodeURIComponent(target)}`,
      { method: 'DELETE' },
    )
    if (!r.ok) {
      alert(`Delete delegation failed: ${await r.text()}`)
      return
    }
    mutate()
  }

  if (status === 'loading') return <div className="p-8">Loading...</div>
  if (status === 'unauthenticated') return null

  return (
    <WttShellV2
      agents={agents.map((a) => ({ agent_id: a.agent_id, display_name: a.display_name }))}
      selectedAgentId={selectedAgentId}
      onAgentChange={setSelectedAgentId}
      topics={topics}
      selectedTopicId={null}
      onTopicChange={() => {}}
      onLogout={() => signOut({ callbackUrl: '/login' })}
      notificationCount={0}
    >
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="rounded-2xl border border-white/10 bg-[#17212b] p-4">
          <h2 className="mb-3 text-sm font-semibold text-[#cfe0ef]">Agent Manager Delegations</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              className="rounded-lg border border-white/10 bg-[#1c2733] px-3 py-2 text-sm"
            >
              {agents.map((a) => (
                <option key={a.agent_id} value={a.agent_id}>{a.display_name} ({a.agent_id})</option>
              ))}
            </select>
            <select
              value={targetAgentId}
              onChange={(e) => setTargetAgentId(e.target.value)}
              className="rounded-lg border border-white/10 bg-[#1c2733] px-3 py-2 text-sm"
            >
              {agents.map((a) => (
                <option key={a.agent_id} value={a.agent_id}>{a.display_name} ({a.agent_id})</option>
              ))}
            </select>
          </div>
          <button onClick={upsertDelegation} className="mt-3 rounded-lg bg-[#2ea6ff] px-3 py-2 text-sm font-semibold">
            Grant Manager Delegation
          </button>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#17212b] p-4">
          <h3 className="mb-3 text-sm font-semibold text-[#cfe0ef]">Current Delegations ({delegations.length})</h3>
          <div className="space-y-2">
            {delegations.length === 0 && <p className="text-xs text-[#7d8e9e]">No delegations yet.</p>}
            {delegations.map((d) => (
              <div key={d.id} className="flex items-center justify-between rounded border border-white/10 px-3 py-2">
                <div className="text-xs text-[#d9e5ef]">
                  <div>manager: {d.manager_agent_id}</div>
                  <div>target: {d.target_agent_id}</div>
                </div>
                <button onClick={() => removeDelegation(d.target_agent_id)} className="rounded bg-red-600/20 px-2 py-1 text-xs text-red-200">
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </WttShellV2>
  )
}
