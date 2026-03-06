'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { WttShellV2 } from '@/components/ui/wtt-shell-v2'
import { normalizeAndFilterAgents } from '@/lib/agents'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'

interface Pipeline {
  id: string
  name: string
  description?: string
  created_at?: string
}

export default function PipelinesPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [agents, setAgents] = useState<Array<{ agent_id: string; display_name: string }>>([])
  const [selectedAgentId, setSelectedAgentId] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  useEffect(() => {
    const load = async () => {
      if (!session?.accessToken) return
      const r = await fetch(`${CLIENT_WTT_API_BASE}/agents/my`, { headers: { Authorization: `Bearer ${session.accessToken}` } })
      if (!r.ok) return
      const list = normalizeAndFilterAgents(await r.json()).map((x) => ({ agent_id: x.agent_id, display_name: x.display_name }))
      setAgents(list)
      if (!selectedAgentId && list[0]) setSelectedAgentId(list[0].agent_id)
    }
    load()
  }, [session?.accessToken, selectedAgentId])

  const { data, mutate } = useSWR(
    session?.accessToken ? ['pipelines-page', session.accessToken] : null,
    async () => {
      const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/pipelines`, { headers: { Authorization: `Bearer ${session?.accessToken}` } })
      if (!r.ok) return []
      return r.json()
    }
  )

  const pipelines: Pipeline[] = useMemo(() => (Array.isArray(data) ? data : []), [data])

  const createPipeline = async () => {
    const name = prompt('Pipeline name')?.trim()
    if (!name) return
    const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/pipelines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.accessToken ?? ''}` },
      body: JSON.stringify({ name }),
    })
    if (!r.ok) {
      const t = await r.text()
      alert(`Create failed: ${t || r.status}`)
      return
    }
    const j = await r.json()
    await mutate()
    router.push(`/tasks/graph?pipeline=${encodeURIComponent(j.id)}`)
  }

  const renamePipeline = async (p: Pipeline) => {
    if (p.id === 'default') return
    const name = prompt('New pipeline name', p.name)?.trim()
    if (!name || name === p.name) return
    const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/pipelines/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.accessToken ?? ''}` },
      body: JSON.stringify({ name }),
    })
    if (!r.ok) {
      const t = await r.text()
      alert(`Rename failed: ${t || r.status}`)
      return
    }
    await mutate()
  }

  const deletePipeline = async (p: Pipeline) => {
    if (p.id === 'default') return
    if (!confirm(`Delete pipeline \"${p.name}\"? Tasks will move to default.`)) return
    const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/pipelines/${p.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session?.accessToken ?? ''}` },
    })
    if (!r.ok) {
      const t = await r.text()
      alert(`Delete failed: ${t || r.status}`)
      return
    }
    await mutate()
  }

  return (
    <WttShellV2
      agents={agents.map((a) => ({ ...a, unread_count: 0 }))}
      selectedAgentId={selectedAgentId}
      onAgentChange={setSelectedAgentId}
      topics={[]}
      selectedTopicId={null}
      onTopicChange={() => {}}
      onLogout={() => signOut({ callbackUrl: '/login' })}
    >
      <div className="h-full p-4 text-[#e8edf2]">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Pipelines</h1>
            <p className="text-xs text-[#8ca0b3]">Create and enter DAG execution pipelines</p>
          </div>
          <button onClick={createPipeline} className="rounded-lg bg-[#2ea6ff] px-3 py-2 text-sm text-white">+ New Pipeline</button>
        </div>

        <div className="grid grid-cols-1 gap-2">
          {pipelines.map((p) => (
            <div key={p.id} className="rounded-lg border border-white/10 bg-[#16202c] p-3 hover:border-[#2ea6ff]/60">
              <div className="flex items-start justify-between gap-2">
                <button onClick={() => router.push(`/tasks/graph?pipeline=${encodeURIComponent(p.id)}`)} className="text-left">
                  <p className="text-sm font-semibold">{p.name}</p>
                  <p className="mt-1 text-xs text-[#8ca0b3]">{p.description || 'No description'} · {p.id}</p>
                </button>
                <div className="flex gap-1">
                  {p.id !== 'default' && (
                    <>
                      <button onClick={() => renamePipeline(p)} className="rounded border border-white/10 px-2 py-1 text-[10px] text-[#a5b3c2]">Rename</button>
                      <button onClick={() => deletePipeline(p)} className="rounded border border-red-500/30 px-2 py-1 text-[10px] text-red-300">Delete</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
          {pipelines.length === 0 && <p className="text-sm text-[#8ca0b3]">No pipelines yet.</p>}
        </div>
      </div>
    </WttShellV2>
  )
}
