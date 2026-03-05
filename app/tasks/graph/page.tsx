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
}

export default function TasksGraphPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [selectedAgentId, setSelectedAgentId] = useState('')
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
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Tasks Graph</h1>
            <p className="text-xs text-[#8ca0b3]">DAG view for task dependencies</p>
          </div>
          <button onClick={runPipeline} className="rounded-lg bg-[#2ea6ff] px-3 py-2 text-sm text-white">Run Pipeline</button>
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
                const deps = edges.filter((e) => e.task_id === n.id).map((e) => e.depends_on_task_id.slice(0, 6)).join(', ') || 'none'
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
