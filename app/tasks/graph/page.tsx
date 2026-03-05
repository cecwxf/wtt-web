'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'
import { WttShellV2 } from '@/components/ui/wtt-shell-v2'
import { normalizeAndFilterAgents } from '@/lib/agents'

interface TaskNode {
  id: string
  title: string
  status: 'todo' | 'doing' | 'review' | 'done' | 'blocked'
  owner_agent_id?: string
  runner_agent_id?: string
}

interface TaskEdge {
  task_id: string
  depends_on_task_id: string
  mode?: string
  mapping?: string
  required?: boolean
}

export default function TasksGraphPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [depFromId, setDepFromId] = useState('')
  const [depToId, setDepToId] = useState('')
  const [agents, setAgents] = useState<Array<{ agent_id: string; display_name: string }>>([])

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
      if (list[0] && !selectedAgentId) setSelectedAgentId(list[0].agent_id)
    }
    load()
  }, [session?.accessToken, selectedAgentId])

  const { data, mutate } = useSWR(
    session?.accessToken ? ['tasks-graph', session.accessToken] : null,
    async () => {
      const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/graph`, { headers: { Authorization: `Bearer ${session?.accessToken}` } })
      if (!r.ok) throw new Error('failed to load graph')
      return r.json()
    },
    { refreshInterval: 5000 }
  )

  const nodes: TaskNode[] = useMemo(() => (Array.isArray(data?.nodes) ? data.nodes : []), [data])
  const edges: TaskEdge[] = useMemo(() => (Array.isArray(data?.edges) ? data.edges : []), [data])
  const selected = useMemo(() => nodes.find((n) => n.id === selectedTaskId) || null, [nodes, selectedTaskId])

  const runPipeline = async () => {
    const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/pipeline/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.accessToken ?? ''}` },
      body: JSON.stringify({ trigger_agent_id: selectedAgentId || 'pipeline-runner' }),
    })
    const j = await r.json()
    alert(`Pipeline started: ${j.count || 0} tasks`)
    mutate()
  }

  const addDependency = async () => {
    if (!depFromId || !depToId) return
    const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${depToId}/dependencies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.accessToken ?? ''}` },
      body: JSON.stringify({ depends_on_task_id: depFromId, mode: 'p2p', required: true }),
    })
    if (!r.ok) {
      const t = await r.text()
      alert(`Add dependency failed: ${t || r.status}`)
      return
    }
    await mutate()
  }

  const statusColor = (s: TaskNode['status']) => {
    if (s === 'doing') return 'border-[#2ea6ff]'
    if (s === 'done') return 'border-green-500/60'
    if (s === 'review') return 'border-yellow-500/60'
    if (s === 'blocked') return 'border-red-500/60'
    return 'border-white/20'
  }

  const agentItems = agents.map((a) => ({ ...a, unread_count: 0 }))

  return (
    <WttShellV2
      agents={agentItems}
      selectedAgentId={selectedAgentId}
      onAgentChange={setSelectedAgentId}
      topics={[]}
      selectedTopicId={null}
      onTopicChange={() => {}}
      onLogout={() => signOut({ callbackUrl: '/login' })}
    >
      <div className="h-full p-4 text-[#e8edf2]">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold">Tasks Graph</h1>
            <p className="text-xs text-[#8ca0b3]">DAG view for task dependencies</p>
          </div>
          <div className="flex items-center gap-2">
            <select value={depFromId} onChange={(e) => setDepFromId(e.target.value)} className="rounded border border-white/10 bg-[#111a25] px-2 py-1 text-xs">
              <option value="">From task</option>
              {nodes.map((n) => <option key={`from-${n.id}`} value={n.id}>{n.title}</option>)}
            </select>
            <select value={depToId} onChange={(e) => setDepToId(e.target.value)} className="rounded border border-white/10 bg-[#111a25] px-2 py-1 text-xs">
              <option value="">To task</option>
              {nodes.map((n) => <option key={`to-${n.id}`} value={n.id}>{n.title}</option>)}
            </select>
            <button onClick={addDependency} className="rounded-lg border border-white/10 bg-[#1d2a3a] px-3 py-2 text-xs">Add Edge</button>
            <button onClick={runPipeline} className="rounded-lg bg-[#2ea6ff] px-3 py-2 text-sm text-white">Run Pipeline</button>
          </div>
        </div>

        <div className="grid h-[calc(100%-52px)] grid-cols-[260px_1fr_340px] gap-3">
          <aside className="rounded-xl border border-white/10 bg-[#16202c] p-2">
            <p className="mb-2 text-sm font-semibold">Task Library</p>
            <div className="space-y-2 overflow-auto">
              {nodes.map((n) => (
                <button key={n.id} onClick={() => setSelectedTaskId(n.id)} className={`w-full rounded-lg border p-2 text-left ${statusColor(n.status)} bg-[#111a25]`}>
                  <p className="text-sm">{n.title}</p>
                  <p className="text-[10px] text-[#8ca0b3]">{n.status} · {n.owner_agent_id || '-'}</p>
                </button>
              ))}
            </div>
          </aside>

          <main className="rounded-xl border border-white/10 bg-[#0f1824] p-3">
            <p className="mb-2 text-sm font-semibold">DAG</p>
            <div className="grid grid-cols-2 gap-2">
              {nodes.map((n) => {
                const deps = edges
                  .filter((e) => e.task_id === n.id)
                  .map((e) => `${e.depends_on_task_id.slice(0, 6)}(${e.mode || 'p2p'})`)
                  .join(', ') || 'none'
                return (
                  <button key={n.id} onClick={() => setSelectedTaskId(n.id)} className={`rounded-lg border p-3 text-left ${statusColor(n.status)} bg-[#111a25]`}>
                    <p className="text-sm font-medium">{n.title}</p>
                    <p className="mt-1 text-[10px] text-[#8ca0b3]">depends on: {deps}</p>
                    <p className="text-[10px] text-[#8ca0b3]">runner: {n.runner_agent_id || '-'}</p>
                  </button>
                )
              })}
            </div>
          </main>

          <aside className="rounded-xl border border-white/10 bg-[#16202c] p-3">
            <p className="mb-2 text-sm font-semibold">Node Detail</p>
            {selected ? (
              <div className="space-y-2 text-sm">
                <p className="font-semibold">{selected.title}</p>
                <p className="text-xs">status: {selected.status}</p>
                <p className="text-xs">owner: {selected.owner_agent_id || '-'}</p>
                <p className="text-xs">runner: {selected.runner_agent_id || '-'}</p>
                <div className="rounded border border-white/10 bg-[#111a25] p-2">
                  <p className="mb-1 text-[11px] text-[#8ca0b3]">Inbound Dependencies</p>
                  <div className="space-y-1">
                    {edges.filter((e) => e.task_id === selected.id).map((e) => (
                      <p key={`${e.task_id}-${e.depends_on_task_id}`} className="text-[11px]">
                        {e.depends_on_task_id.slice(0, 8)} · {e.mode || 'p2p'} · {e.required ? 'required' : 'optional'}
                      </p>
                    ))}
                    {edges.filter((e) => e.task_id === selected.id).length === 0 && <p className="text-[11px] text-[#8ca0b3]">none</p>}
                  </div>
                </div>
                <button className="rounded border border-white/10 bg-[#1d2a3a] px-2 py-1 text-xs" onClick={() => router.push('/tasks')}>Open in Tasks Board</button>
              </div>
            ) : (
              <p className="text-xs text-[#8ca0b3]">Select a node</p>
            )}
          </aside>
        </div>
      </div>
    </WttShellV2>
  )
}
