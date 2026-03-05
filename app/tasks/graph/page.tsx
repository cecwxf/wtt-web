'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
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

interface Pos {
  x: number
  y: number
}

const NODE_W = 240
const NODE_H = 90

export default function TasksGraphPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [depFromId, setDepFromId] = useState('')
  const [depToId, setDepToId] = useState('')
  const [agents, setAgents] = useState<Array<{ agent_id: string; display_name: string }>>([])
  const [positions, setPositions] = useState<Record<string, Pos>>({})
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState<Pos>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState<Pos>({ x: 0, y: 0 })
  const [panning, setPanning] = useState(false)
  const [panStart, setPanStart] = useState<Pos>({ x: 0, y: 0 })
  const canvasRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    try {
      const raw = localStorage.getItem('wtt_tasks_graph_positions_v1')
      if (raw) setPositions(JSON.parse(raw))
    } catch {}
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('wtt_tasks_graph_positions_v1', JSON.stringify(positions))
    } catch {}
  }, [positions])

  useEffect(() => {
    if (!nodes.length) return
    setPositions((prev) => {
      const next = { ...prev }
      let idx = 0
      for (const n of nodes) {
        if (!next[n.id]) {
          const col = idx % 3
          const row = Math.floor(idx / 3)
          next[n.id] = { x: 30 + col * 300, y: 30 + row * 140 }
          idx += 1
        }
      }
      return next
    })
  }, [nodes])

  const runPipeline = async (taskIds?: string[]) => {
    const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/pipeline/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.accessToken ?? ''}` },
      body: JSON.stringify({ trigger_agent_id: selectedAgentId || 'pipeline-runner', task_ids: taskIds && taskIds.length > 0 ? taskIds : undefined }),
    })
    const j = await r.json()
    alert(`Pipeline started: ${j.count || 0} tasks`)
    mutate()
  }

  const toggleSelectTask = (taskId: string) => {
    setSelectedTaskIds((prev) => (prev.includes(taskId) ? prev.filter((x) => x !== taskId) : [...prev, taskId]))
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

  const removeDependency = async (taskId: string, dependsOnTaskId: string) => {
    const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/dependencies/${dependsOnTaskId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session?.accessToken ?? ''}` },
    })
    if (!r.ok) {
      const t = await r.text()
      alert(`Remove dependency failed: ${t || r.status}`)
      return
    }
    await mutate()
  }

  const autoLayout = () => {
    const next: Record<string, Pos> = {}
    nodes.forEach((n, i) => {
      const col = i % 3
      const row = Math.floor(i / 3)
      next[n.id] = { x: 30 + col * 300, y: 30 + row * 140 }
    })
    setPan({ x: 0, y: 0 })
    setZoom(1)
    setPositions(next)
  }

  const statusColor = (s: TaskNode['status']) => {
    if (s === 'doing') return 'border-[#2ea6ff]'
    if (s === 'done') return 'border-green-500/60'
    if (s === 'review') return 'border-yellow-500/60'
    if (s === 'blocked') return 'border-red-500/60'
    return 'border-white/20'
  }

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canvasRef.current) return

    if (panning) {
      const dx = e.clientX - panStart.x
      const dy = e.clientY - panStart.y
      setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }))
      setPanStart({ x: e.clientX, y: e.clientY })
      return
    }

    if (!draggingId) return
    const rect = canvasRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left - pan.x) / zoom - dragOffset.x
    const y = (e.clientY - rect.top - pan.y) / zoom - dragOffset.y
    setPositions((prev) => ({ ...prev, [draggingId]: { x: Math.max(0, x), y: Math.max(0, y) } }))
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
            <button onClick={autoLayout} className="rounded-lg border border-white/10 bg-[#1d2a3a] px-3 py-2 text-xs">Auto Layout</button>
            <button onClick={() => setZoom((z) => Math.min(2, Number((z + 0.1).toFixed(2))))} className="rounded-lg border border-white/10 bg-[#1d2a3a] px-2 py-2 text-xs">+</button>
            <button onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.1).toFixed(2))))} className="rounded-lg border border-white/10 bg-[#1d2a3a] px-2 py-2 text-xs">-</button>
            <select value={depFromId} onChange={(e) => setDepFromId(e.target.value)} className="rounded border border-white/10 bg-[#111a25] px-2 py-1 text-xs">
              <option value="">From task</option>
              {nodes.map((n) => <option key={`from-${n.id}`} value={n.id}>{n.title}</option>)}
            </select>
            <select value={depToId} onChange={(e) => setDepToId(e.target.value)} className="rounded border border-white/10 bg-[#111a25] px-2 py-1 text-xs">
              <option value="">To task</option>
              {nodes.map((n) => <option key={`to-${n.id}`} value={n.id}>{n.title}</option>)}
            </select>
            <button onClick={addDependency} className="rounded-lg border border-white/10 bg-[#1d2a3a] px-3 py-2 text-xs">Add Edge</button>
            <button onClick={() => runPipeline(selectedTaskIds)} className="rounded-lg border border-white/10 bg-[#1d2a3a] px-3 py-2 text-xs">Run Selected ({selectedTaskIds.length})</button>
            <button onClick={() => runPipeline()} className="rounded-lg bg-[#2ea6ff] px-3 py-2 text-sm text-white">Run Pipeline</button>
          </div>
        </div>

        <div className="grid h-[calc(100%-52px)] grid-cols-[260px_1fr_340px] gap-3">
          <aside className="rounded-xl border border-white/10 bg-[#16202c] p-2">
            <p className="mb-2 text-sm font-semibold">Task Library</p>
            <div className="space-y-2 overflow-auto">
              {nodes.map((n) => (
                <div key={n.id} className={`w-full rounded-lg border p-2 text-left ${statusColor(n.status)} bg-[#111a25]`}>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <button onClick={() => setSelectedTaskId(n.id)} className="truncate text-left text-sm hover:text-[#9fd6ff]">{n.title}</button>
                    <input type="checkbox" checked={selectedTaskIds.includes(n.id)} onChange={() => toggleSelectTask(n.id)} />
                  </div>
                  <p className="text-[10px] text-[#8ca0b3]">{n.status} · {n.owner_agent_id || '-'}</p>
                </div>
              ))}
            </div>
          </aside>

          <main
            ref={canvasRef}
            onMouseMove={onMouseMove}
            onMouseUp={() => {
              setDraggingId(null)
              setPanning(false)
            }}
            onMouseLeave={() => {
              setDraggingId(null)
              setPanning(false)
            }}
            onMouseDown={(e) => {
              if ((e.target as HTMLElement).closest('button')) return
              setPanning(true)
              setPanStart({ x: e.clientX, y: e.clientY })
            }}
            className="relative overflow-hidden rounded-xl border border-white/10 bg-[#0f1824]"
          >
            <div
              className="absolute inset-0"
              style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}
            >
              <svg className="absolute inset-0 h-full w-full">
                <defs>
                  <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
                    <path d="M0,0 L8,4 L0,8 z" fill="#4d6a85" />
                  </marker>
                </defs>
                {edges.map((e) => {
                  const from = positions[e.depends_on_task_id]
                  const to = positions[e.task_id]
                  if (!from || !to) return null
                  const x1 = from.x + NODE_W
                  const y1 = from.y + NODE_H / 2
                  const x2 = to.x
                  const y2 = to.y + NODE_H / 2
                  return (
                    <g key={`${e.task_id}-${e.depends_on_task_id}`}>
                      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#4d6a85" strokeWidth="2" markerEnd="url(#arrow)" />
                      <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6} fill="#8ca0b3" fontSize="10">
                        {e.mode || 'p2p'}
                      </text>
                    </g>
                  )
                })}
              </svg>

              {edges.map((e) => {
                const from = positions[e.depends_on_task_id]
                const to = positions[e.task_id]
                if (!from || !to) return null
                const x = (from.x + NODE_W + to.x) / 2 - 11
                const y = (from.y + NODE_H / 2 + to.y + NODE_H / 2) / 2 + 2
                return (
                  <button
                    key={`del-${e.task_id}-${e.depends_on_task_id}`}
                    onClick={() => removeDependency(e.task_id, e.depends_on_task_id)}
                    className="absolute rounded border border-red-500/40 bg-[#2a1618] px-1 text-[10px] text-red-300"
                    style={{ left: x, top: y }}
                    title="Remove edge"
                  >
                    ×
                  </button>
                )
              })}

              {nodes.map((n) => {
                const p = positions[n.id] || { x: 30, y: 30 }
                return (
                  <button
                    key={n.id}
                    onMouseDown={(e) => {
                      setSelectedTaskId(n.id)
                      const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
                      setDraggingId(n.id)
                      setDragOffset({ x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom })
                    }}
                    onClick={() => setSelectedTaskId(n.id)}
                    className={`absolute rounded-lg border p-3 text-left ${statusColor(n.status)} ${selectedTaskIds.includes(n.id) ? 'ring-2 ring-[#2ea6ff]/60' : ''} bg-[#111a25] shadow-sm`}
                    style={{ left: p.x, top: p.y, width: NODE_W, height: NODE_H }}
                  >
                    <p className="line-clamp-1 text-sm font-medium">{n.title}</p>
                    <p className="mt-1 text-[10px] text-[#8ca0b3]">{n.status} · runner: {n.runner_agent_id || '-'}</p>
                    <p className="text-[10px] text-[#8ca0b3]">{n.id.slice(0, 8)}</p>
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
