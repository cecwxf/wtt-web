'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { WttShellV2 } from '@/components/ui/wtt-shell-v2'
import { normalizeAndFilterAgents } from '@/lib/agents'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'

/* ─── types ─── */
interface Pipeline {
  id: string
  name: string
  description?: string
  auto_review?: boolean
  created_at?: string
  stats?: { todo?: number; doing?: number; review?: number; done?: number; blocked?: number }
}

interface TaskNode {
  id: string
  title: string
  status: 'todo' | 'doing' | 'review' | 'done' | 'blocked'
  owner_agent_id?: string
  runner_agent_id?: string
  topic_id?: string
}

interface TaskEdge {
  task_id: string
  depends_on_task_id: string
  mode?: string
  mapping?: string
  required?: boolean
}

type NodeShape = 'rect' | 'circle' | 'ellipse'

interface NodeMeta { x: number; y: number; shape: NodeShape }

interface TaskDraft extends Partial<TaskNode> {
  description?: string
  priority?: string
  exec_mode?: string
  acceptance?: string
  notes?: string
}

/* ─── constants ─── */
const RECT_W = 220
const RECT_H = 80
const CIRCLE_D = 100
const ELLIPSE_W = 160
const ELLIPSE_H = 80

const shapeDims = (s: NodeShape) => {
  if (s === 'circle') return { w: CIRCLE_D, h: CIRCLE_D }
  if (s === 'ellipse') return { w: ELLIPSE_W, h: ELLIPSE_H }
  return { w: RECT_W, h: RECT_H }
}

/* ─── helpers ─── */
const statusBorder = (s: TaskNode['status']) => {
  if (s === 'doing') return 'border-indigo-500'
  if (s === 'done') return 'border-green-500/60'
  if (s === 'review') return 'border-yellow-500/60'
  if (s === 'blocked') return 'border-red-500/60'
  return 'border-slate-300'
}

const statusBg = (s: TaskNode['status']) => {
  if (s === 'doing') return 'bg-indigo-50'
  if (s === 'done') return 'bg-emerald-50'
  if (s === 'review') return 'bg-amber-50'
  if (s === 'blocked') return 'bg-red-50'
  return 'bg-slate-50'
}

const statusDot = (s: TaskNode['status']) => {
  if (s === 'doing') return 'bg-indigo-500'
  if (s === 'done') return 'bg-green-500'
  if (s === 'review') return 'bg-yellow-500'
  if (s === 'blocked') return 'bg-red-500'
  return 'bg-slate-400'
}

/* ─── edge anchor for each shape ─── */
function getAnchor(meta: NodeMeta, side: 'out' | 'in'): { x: number; y: number } {
  const { w, h } = shapeDims(meta.shape)
  if (meta.shape === 'circle') {
    const cx = meta.x + CIRCLE_D / 2
    const cy = meta.y + CIRCLE_D / 2
    return side === 'out' ? { x: cx + CIRCLE_D / 2, y: cy } : { x: cx - CIRCLE_D / 2, y: cy }
  }
  if (meta.shape === 'ellipse') {
    return side === 'out' ? { x: meta.x + w, y: meta.y + h / 2 } : { x: meta.x, y: meta.y + h / 2 }
  }
  return side === 'out' ? { x: meta.x + w, y: meta.y + h / 2 } : { x: meta.x, y: meta.y + h / 2 }
}

/* ─── page component ─── */
export default function PipelinesPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  /* auth & agents */
  const [agents, setAgents] = useState<Array<{ agent_id: string; display_name: string }>>([])
  const [selectedAgentId, setSelectedAgentId] = useState('')

  useEffect(() => { if (status === 'unauthenticated') router.push('/login') }, [status, router])

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

  /* ─── mode: list vs editor ─── */
  const [editingPipelineId, setEditingPipelineId] = useState<string | null>(null)

  /* ─── pipeline list data ─── */
  const { data: pipelinesRaw, mutate: mutatePipelines } = useSWR(
    session?.accessToken ? ['pipelines-page', session.accessToken] : null,
    async () => {
      const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/pipelines`, { headers: { Authorization: `Bearer ${session?.accessToken}` } })
      if (!r.ok) return []
      return r.json()
    }
  )
  const pipelines: Pipeline[] = useMemo(() => (Array.isArray(pipelinesRaw) ? pipelinesRaw : []), [pipelinesRaw])

  /* ─── graph data (editor mode) ─── */
  const { data: graphData, mutate: mutateGraph } = useSWR(
    session?.accessToken && editingPipelineId ? ['pipeline-graph', session.accessToken, editingPipelineId] : null,
    async () => {
      const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/graph?pipeline_id=${encodeURIComponent(editingPipelineId!)}`, { headers: { Authorization: `Bearer ${session?.accessToken}` } })
      if (!r.ok) throw new Error('failed')
      return r.json()
    },
    { refreshInterval: 5000 }
  )
  const nodes: TaskNode[] = useMemo(() => (Array.isArray(graphData?.nodes) ? graphData.nodes : []), [graphData])
  const edges: TaskEdge[] = useMemo(() => (Array.isArray(graphData?.edges) ? graphData.edges : []), [graphData])

  /* ─── canvas state ─── */
  const [positions, setPositions] = useState<Record<string, NodeMeta>>({})
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [panning, setPanning] = useState(false)
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const canvasRef = useRef<HTMLDivElement>(null)

  /* ─── node selection state ─── */
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([])
  const [connectFromId, setConnectFromId] = useState<string | null>(null)
  const [taskDraft, setTaskDraft] = useState<TaskDraft>({})

  const selected = useMemo(() => nodes.find((n) => n.id === selectedTaskId) || null, [nodes, selectedTaskId])
  useEffect(() => { if (selected) setTaskDraft(selected) }, [selected])

  /* ─── timeline for selected node ─── */
  const { data: timelineRaw } = useSWR(
    selected?.topic_id && session?.accessToken ? ['pipe-timeline', selected.topic_id, session.accessToken] : null,
    async () => {
      const r = await fetch(`${CLIENT_WTT_API_BASE}/topics/${selected?.topic_id}/messages?limit=30`, { headers: { Authorization: `Bearer ${session?.accessToken}` } })
      if (!r.ok) return []
      return r.json()
    },
    { refreshInterval: 5000 }
  )
  const timeline = useMemo(() => {
    const rows = Array.isArray(timelineRaw) ? timelineRaw : Array.isArray((timelineRaw as { messages?: unknown[] })?.messages) ? ((timelineRaw as { messages: unknown[] }).messages || []) : []
    return rows.map((x) => x as Record<string, unknown>).map((x) => ({ id: String(x.id || x.message_id || ''), sender: String(x.sender_id || 'unknown'), content: String(x.content || '') })).filter((x) => x.content.includes('[TASK_')).slice(-8).reverse()
  }, [timelineRaw])

  /* ─── persist positions in localStorage ─── */
  useEffect(() => {
    if (!editingPipelineId) return
    try {
      const raw = localStorage.getItem(`wtt_pipe_pos_v2:${editingPipelineId}`)
      setPositions(raw ? JSON.parse(raw) : {})
    } catch { setPositions({}) }
  }, [editingPipelineId])

  useEffect(() => {
    if (!editingPipelineId) return
    try { localStorage.setItem(`wtt_pipe_pos_v2:${editingPipelineId}`, JSON.stringify(positions)) } catch {}
  }, [positions, editingPipelineId])

  /* assign default positions for new nodes */
  useEffect(() => {
    if (!nodes.length) return
    setPositions((prev) => {
      const next = { ...prev }
      let idx = 0
      for (const n of nodes) {
        if (!next[n.id]) {
          const col = idx % 3
          const row = Math.floor(idx / 3)
          next[n.id] = { x: 80 + col * 300, y: 80 + row * 140, shape: 'rect' }
          idx += 1
        }
      }
      return next
    })
  }, [nodes])

  /* ─── wheel zoom via ref (non-passive) ─── */
  const wheelHandler = useCallback((e: WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.05 : 0.05
    setZoom((z) => Math.min(2, Math.max(0.3, +(z + delta).toFixed(2))))
  }, [])

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    el.addEventListener('wheel', wheelHandler, { passive: false })
    return () => el.removeEventListener('wheel', wheelHandler)
  }, [wheelHandler, editingPipelineId])

  /* ─── pipeline CRUD ─── */
  const createPipeline = async () => {
    const name = prompt('Pipeline name')?.trim()
    if (!name) return
    const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/pipelines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.accessToken ?? ''}` },
      body: JSON.stringify({ name }),
    })
    if (!r.ok) { alert(`Create failed: ${(await r.text()) || r.status}`); return }
    const j = await r.json()
    await mutatePipelines()
    setEditingPipelineId(j.id)
  }

  const renamePipeline = async (p: Pipeline) => {
    if (p.id === 'default') return
    const name = prompt('New pipeline name', p.name)?.trim()
    if (!name || name === p.name) return
    await fetch(`${CLIENT_WTT_API_BASE}/tasks/pipelines/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.accessToken ?? ''}` },
      body: JSON.stringify({ name }),
    })
    await mutatePipelines()
  }

  const deletePipeline = async (p: Pipeline) => {
    if (p.id === 'default') return
    if (!confirm(`Delete pipeline "${p.name}"? Tasks will move to default.`)) return
    await fetch(`${CLIENT_WTT_API_BASE}/tasks/pipelines/${p.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session?.accessToken ?? ''}` },
    })
    await mutatePipelines()
    if (editingPipelineId === p.id) setEditingPipelineId(null)
  }

  const toggleAutoReview = async (p: Pipeline) => {
    await fetch(`${CLIENT_WTT_API_BASE}/tasks/pipelines/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.accessToken ?? ''}` },
      body: JSON.stringify({ auto_review: !(p.auto_review ?? true) }),
    })
    await mutatePipelines()
  }

  /* ─── task / node CRUD ─── */
  const createTaskAt = async (x: number, y: number, shape: NodeShape = 'rect') => {
    const title = prompt('Node title')?.trim()
    if (!title) return
    const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.accessToken ?? ''}` },
      body: JSON.stringify({
        title,
        task_mode: 'pipeline',
        pipeline_id: editingPipelineId || 'default',
        task_type: 'feature',
        priority: 'P2',
        status: 'todo',
        owner_agent_id: selectedAgentId || undefined,
        runner_agent_id: selectedAgentId || undefined,
        created_by: selectedAgentId || 'user',
      }),
    })
    if (!r.ok) { alert(`Create task failed: ${(await r.text()) || r.status}`); return }
    const j = await r.json()
    setPositions((prev) => ({ ...prev, [j.id]: { x, y, shape } }))
    await mutateGraph()
    setSelectedTaskId(j.id)
  }

  const saveTaskDetail = async () => {
    if (!selected) return
    const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${selected.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.accessToken ?? ''}` },
      body: JSON.stringify({
        title: taskDraft.title,
        status: taskDraft.status,
        owner_agent_id: taskDraft.owner_agent_id,
        runner_agent_id: taskDraft.runner_agent_id,
        description: taskDraft.description,
        acceptance: taskDraft.acceptance,
        notes: taskDraft.notes,
        exec_mode: taskDraft.exec_mode,
      }),
    })
    if (!r.ok) { alert(`Save failed: ${(await r.text()) || r.status}`); return }
    await mutateGraph()
  }

  const deleteTask = async (taskId: string) => {
    if (!confirm('Delete this node?')) return
    await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session?.accessToken ?? ''}` },
    })
    setPositions((prev) => { const n = { ...prev }; delete n[taskId]; return n })
    if (selectedTaskId === taskId) setSelectedTaskId(null)
    setSelectedTaskIds((prev) => prev.filter((x) => x !== taskId))
    await mutateGraph()
  }

  /* ─── edge CRUD ─── */
  const addDependencyByIds = async (fromId: string, toId: string) => {
    if (!fromId || !toId || fromId === toId) return
    const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${toId}/dependencies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.accessToken ?? ''}` },
      body: JSON.stringify({ depends_on_task_id: fromId, mode: 'p2p', required: true }),
    })
    if (!r.ok) { alert(`Add edge failed: ${(await r.text()) || r.status}`); return }
    await mutateGraph()
  }

  const removeDependency = async (taskId: string, depId: string) => {
    await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/dependencies/${depId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session?.accessToken ?? ''}` },
    })
    await mutateGraph()
  }

  /* ─── pipeline execution ─── */
  const runPipeline = async (taskIds?: string[]) => {
    const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/pipeline/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.accessToken ?? ''}` },
      body: JSON.stringify({
        trigger_agent_id: selectedAgentId || 'pipeline-runner',
        pipeline_id: editingPipelineId || undefined,
        task_ids: taskIds && taskIds.length > 0 ? taskIds : undefined,
      }),
    })
    const j = await r.json()
    alert(`Pipeline started: ${j.count || 0} tasks`)
    mutateGraph()
  }

  /* ─── auto layout (topological sort) ─── */
  const autoLayout = () => {
    const inDeg: Record<string, number> = {}
    const adj: Record<string, string[]> = {}
    const nodeIdList = nodes.map((n) => n.id)
    const nodeIds = new Set(nodeIdList)
    nodeIdList.forEach((id) => { inDeg[id] = 0; adj[id] = [] })
    edges.forEach((e) => {
      if (nodeIds.has(e.depends_on_task_id) && nodeIds.has(e.task_id)) {
        adj[e.depends_on_task_id].push(e.task_id)
        inDeg[e.task_id] = (inDeg[e.task_id] || 0) + 1
      }
    })
    const layers: string[][] = []
    const visited = new Set<string>()
    let queue = Object.keys(inDeg).filter((id) => inDeg[id] === 0)
    while (queue.length > 0) {
      layers.push(queue)
      const next: string[] = []
      queue.forEach((id) => {
        visited.add(id)
        adj[id].forEach((child) => {
          inDeg[child]--
          if (inDeg[child] === 0 && !visited.has(child)) next.push(child)
        })
      })
      queue = next
    }
    // any remaining nodes (cycles) go into a final layer
    const remaining = nodes.filter((n) => !visited.has(n.id)).map((n) => n.id)
    if (remaining.length) layers.push(remaining)

    const next: Record<string, NodeMeta> = {}
    layers.forEach((layer, li) => {
      const totalH = layer.length * 130 - 30
      const startY = Math.max(40, (600 - totalH) / 2)
      layer.forEach((id, ni) => {
        next[id] = { x: 80 + li * 320, y: startY + ni * 130, shape: positions[id]?.shape || 'rect' }
      })
    })
    setPan({ x: 0, y: 0 })
    setZoom(1)
    setPositions(next)
  }

  /* ─── canvas interactions ─── */
  const onNodeClick = async (e: React.MouseEvent<HTMLButtonElement>, nodeId: string) => {
    if (e.shiftKey) {
      if (!connectFromId) {
        setConnectFromId(nodeId)
      } else {
        await addDependencyByIds(connectFromId, nodeId)
        setConnectFromId(null)
      }
      return
    }
    setSelectedTaskId(nodeId)
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
    setPositions((prev) => ({ ...prev, [draggingId]: { ...prev[draggingId], x: Math.max(0, x), y: Math.max(0, y) } }))
  }

  /* drag from palette */
  const onCanvasDragOver = (e: React.DragEvent) => e.preventDefault()
  const onCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const shape = e.dataTransfer.getData('application/wtt-shape') as NodeShape
    if (!shape || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const { w, h } = shapeDims(shape)
    const x = (e.clientX - rect.left - pan.x) / zoom - w / 2
    const y = (e.clientY - rect.top - pan.y) / zoom - h / 2
    createTaskAt(Math.max(0, x), Math.max(0, y), shape)
  }

  /* ─── render ─── */
  const editingPipeline = pipelines.find((p) => p.id === editingPipelineId)

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
      <div className="flex h-full flex-col text-slate-800">
        {/* ═══ LIST MODE ═══ */}
        {!editingPipelineId && (
          <div className="h-full overflow-auto p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">Pipelines</h1>
                <p className="text-xs text-slate-500">Create and manage DAG execution pipelines</p>
              </div>
              <button onClick={createPipeline} className="rounded-lg bg-indigo-500 px-3 py-2 text-sm text-white hover:bg-indigo-600">+ New Pipeline</button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {pipelines.map((p) => (
                <div key={p.id} className="group rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-indigo-400 hover:shadow-md">
                  <button onClick={() => setEditingPipelineId(p.id)} className="w-full text-left">
                    <p className="text-sm font-semibold">{p.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{p.description || 'No description'}</p>
                    <div className="mt-3 flex flex-wrap gap-1 text-[10px]">
                      <span className="rounded border border-slate-200 px-1.5 py-0.5 text-slate-500">todo {p.stats?.todo ?? 0}</span>
                      <span className="rounded border border-indigo-300 px-1.5 py-0.5 text-indigo-500">doing {p.stats?.doing ?? 0}</span>
                      <span className="rounded border border-yellow-400 px-1.5 py-0.5 text-amber-600">review {p.stats?.review ?? 0}</span>
                      <span className="rounded border border-green-400 px-1.5 py-0.5 text-green-600">done {p.stats?.done ?? 0}</span>
                      <span className="rounded border border-red-400 px-1.5 py-0.5 text-red-500">blocked {p.stats?.blocked ?? 0}</span>
                    </div>
                  </button>
                  <div className="mt-3 flex gap-1 border-t border-slate-100 pt-2">
                    <button onClick={() => toggleAutoReview(p)} className="rounded border border-slate-200 px-2 py-1 text-[10px] text-slate-500 hover:bg-slate-100">
                      AutoReview: {p.auto_review ?? true ? 'ON' : 'OFF'}
                    </button>
                    {p.id !== 'default' && (
                      <>
                        <button onClick={() => renamePipeline(p)} className="rounded border border-slate-200 px-2 py-1 text-[10px] text-slate-500 hover:bg-slate-100">Rename</button>
                        <button onClick={() => deletePipeline(p)} className="rounded border border-red-200 px-2 py-1 text-[10px] text-red-500 hover:bg-red-50">Delete</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {pipelines.length === 0 && <p className="text-sm text-slate-500">No pipelines yet. Create one to get started.</p>}
            </div>
          </div>
        )}

        {/* ═══ EDITOR MODE ═══ */}
        {editingPipelineId && (
          <>
            {/* top toolbar */}
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-4 py-2">
              <div className="flex items-center gap-3">
                <button onClick={() => { setEditingPipelineId(null); setSelectedTaskId(null); setSelectedTaskIds([]); setConnectFromId(null) }} className="rounded p-1 text-slate-500 hover:bg-slate-200" title="Back to list">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                </button>
                <div>
                  <p className="text-sm font-semibold">{editingPipeline?.name || 'Pipeline'}</p>
                  <p className="text-[10px] text-slate-500">{editingPipelineId.slice(0, 12)} · {nodes.length} nodes · {edges.length} edges</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {connectFromId && (
                  <span className="rounded border border-yellow-400 bg-yellow-50 px-2 py-1 text-[10px] text-yellow-700">
                    Connecting from: {nodes.find((n) => n.id === connectFromId)?.title?.slice(0, 15) || connectFromId.slice(0, 8)} — Shift+click target
                    <button onClick={() => setConnectFromId(null)} className="ml-1 text-yellow-500 hover:text-yellow-700">×</button>
                  </span>
                )}
                <button onClick={autoLayout} className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-100">Auto Layout</button>
                <button onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)))} className="rounded border border-slate-200 bg-white px-2 py-1 text-xs">+</button>
                <span className="text-[10px] text-slate-500">{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom((z) => Math.max(0.3, +(z - 0.1).toFixed(2)))} className="rounded border border-slate-200 bg-white px-2 py-1 text-xs">-</button>
                <div className="mx-1 h-4 w-px bg-slate-200" />
                <button
                  onClick={() => runPipeline(selectedTaskIds.length > 0 ? selectedTaskIds : undefined)}
                  className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
                >
                  Run Selected ({selectedTaskIds.length})
                </button>
                <button onClick={() => runPipeline()} className="rounded-lg bg-indigo-500 px-3 py-1.5 text-xs text-white hover:bg-indigo-600">
                  Run Pipeline
                </button>
              </div>
            </div>

            {/* main area: palette | canvas | detail */}
            <div className="grid flex-1 grid-cols-[72px_1fr_340px] gap-0 overflow-hidden">

              {/* ── shape palette ── */}
              <aside className="flex flex-col items-center gap-3 border-r border-slate-200 bg-slate-50 py-4">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Shapes</p>
                {/* rect */}
                <div
                  draggable
                  onDragStart={(e) => { e.dataTransfer.setData('application/wtt-shape', 'rect'); e.dataTransfer.effectAllowed = 'copy' }}
                  className="flex cursor-grab flex-col items-center gap-1 rounded-lg p-2 hover:bg-slate-100 active:cursor-grabbing"
                  title="Rectangle — Task Node"
                >
                  <div className="h-8 w-12 rounded border-2 border-slate-400 bg-white" />
                  <span className="text-[9px] text-slate-500">Task</span>
                </div>
                {/* circle */}
                <div
                  draggable
                  onDragStart={(e) => { e.dataTransfer.setData('application/wtt-shape', 'circle'); e.dataTransfer.effectAllowed = 'copy' }}
                  className="flex cursor-grab flex-col items-center gap-1 rounded-lg p-2 hover:bg-slate-100 active:cursor-grabbing"
                  title="Circle — Decision Node"
                >
                  <div className="h-10 w-10 rounded-full border-2 border-slate-400 bg-white" />
                  <span className="text-[9px] text-slate-500">Decision</span>
                </div>
                {/* ellipse */}
                <div
                  draggable
                  onDragStart={(e) => { e.dataTransfer.setData('application/wtt-shape', 'ellipse'); e.dataTransfer.effectAllowed = 'copy' }}
                  className="flex cursor-grab flex-col items-center gap-1 rounded-lg p-2 hover:bg-slate-100 active:cursor-grabbing"
                  title="Ellipse — Start/End Node"
                >
                  <div className="h-7 w-14 rounded-[50%] border-2 border-slate-400 bg-white" />
                  <span className="text-[9px] text-slate-500">Start/End</span>
                </div>

                <div className="my-2 h-px w-10 bg-slate-200" />
                <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Tips</p>
                <p className="px-1 text-center text-[8px] leading-3 text-slate-400">Drag shape to canvas</p>
                <p className="px-1 text-center text-[8px] leading-3 text-slate-400">Double-click canvas to add rect</p>
                <p className="px-1 text-center text-[8px] leading-3 text-slate-400">Shift+click two nodes to connect</p>
                <p className="px-1 text-center text-[8px] leading-3 text-slate-400">Scroll to zoom</p>
              </aside>

              {/* ── canvas ── */}
              <main
                ref={canvasRef}
                onMouseMove={onMouseMove}
                onMouseUp={() => { setDraggingId(null); setPanning(false) }}
                onMouseLeave={() => { setDraggingId(null); setPanning(false) }}
                onMouseDown={(e) => {
                  if ((e.target as HTMLElement).closest('button')) return
                  setPanning(true)
                  setPanStart({ x: e.clientX, y: e.clientY })
                }}
                onDoubleClick={(e) => {
                  if (!canvasRef.current || (e.target as HTMLElement).closest('button')) return
                  const rect = canvasRef.current.getBoundingClientRect()
                  const x = (e.clientX - rect.left - pan.x) / zoom - RECT_W / 2
                  const y = (e.clientY - rect.top - pan.y) / zoom - RECT_H / 2
                  createTaskAt(Math.max(0, x), Math.max(0, y), 'rect')
                }}
                onDragOver={onCanvasDragOver}
                onDrop={onCanvasDrop}
                className="relative overflow-hidden bg-slate-100"
                style={{ cursor: panning ? 'grabbing' : draggingId ? 'move' : 'default' }}
              >
                {/* grid pattern background */}
                <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-30">
                  <defs>
                    <pattern id="grid" width={40 * zoom} height={40 * zoom} patternUnits="userSpaceOnUse" x={pan.x % (40 * zoom)} y={pan.y % (40 * zoom)}>
                      <path d={`M ${40 * zoom} 0 L 0 0 0 ${40 * zoom}`} fill="none" stroke="#cbd5e1" strokeWidth="0.5" />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#grid)" />
                </svg>

                <div className="absolute inset-0" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
                  {/* SVG edges */}
                  <svg className="absolute inset-0 h-full w-full" style={{ pointerEvents: 'none' }}>
                    <defs>
                      <marker id="pipe-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
                        <path d="M0,0 L8,4 L0,8 z" fill="#6b7fa0" />
                      </marker>
                      <marker id="pipe-arrow-active" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
                        <path d="M0,0 L8,4 L0,8 z" fill="#6366f1" />
                      </marker>
                    </defs>
                    {edges.map((edge) => {
                      const fromMeta = positions[edge.depends_on_task_id]
                      const toMeta = positions[edge.task_id]
                      if (!fromMeta || !toMeta) return null
                      const p1 = getAnchor(fromMeta, 'out')
                      const p2 = getAnchor(toMeta, 'in')
                      const dx = Math.max(60, Math.abs(p2.x - p1.x) * 0.4)
                      const path = `M ${p1.x} ${p1.y} C ${p1.x + dx} ${p1.y}, ${p2.x - dx} ${p2.y}, ${p2.x} ${p2.y}`
                      const isActive = selectedTaskId === edge.task_id || selectedTaskId === edge.depends_on_task_id
                      const fromNode = nodes.find((n) => n.id === edge.depends_on_task_id)
                      return (
                        <g key={`e-${edge.task_id}-${edge.depends_on_task_id}`}>
                          <path
                            d={path}
                            fill="none"
                            stroke={isActive ? '#6366f1' : '#6b7fa0'}
                            strokeWidth={isActive ? 2.5 : 1.8}
                            markerEnd={isActive ? 'url(#pipe-arrow-active)' : 'url(#pipe-arrow)'}
                            className={fromNode?.status === 'doing' ? 'edge-flow' : ''}
                          />
                          <text x={(p1.x + p2.x) / 2} y={(p1.y + p2.y) / 2 - 8} fill={isActive ? '#6366f1' : '#94a3b8'} fontSize="10" textAnchor="middle">
                            {edge.mode || 'p2p'}
                          </text>
                        </g>
                      )
                    })}
                  </svg>

                  {/* edge delete buttons */}
                  {edges.map((edge) => {
                    const fromMeta = positions[edge.depends_on_task_id]
                    const toMeta = positions[edge.task_id]
                    if (!fromMeta || !toMeta) return null
                    const p1 = getAnchor(fromMeta, 'out')
                    const p2 = getAnchor(toMeta, 'in')
                    const mx = (p1.x + p2.x) / 2 - 8
                    const my = (p1.y + p2.y) / 2 + 4
                    return (
                      <button
                        key={`del-${edge.task_id}-${edge.depends_on_task_id}`}
                        onClick={() => removeDependency(edge.task_id, edge.depends_on_task_id)}
                        className="absolute rounded border border-red-400/50 bg-red-50 px-1 text-[9px] text-red-500 opacity-0 transition hover:opacity-100"
                        style={{ left: mx, top: my, pointerEvents: 'auto' }}
                        title="Remove edge"
                      >
                        ×
                      </button>
                    )
                  })}

                  {/* nodes */}
                  {nodes.map((n) => {
                    const meta = positions[n.id] || { x: 30, y: 30, shape: 'rect' as NodeShape }
                    const shape = meta.shape || 'rect'
                    const { w, h } = shapeDims(shape)
                    const isSelected = selectedTaskIds.includes(n.id)
                    const isConnecting = connectFromId === n.id

                    const shapeClass =
                      shape === 'circle' ? 'rounded-full'
                        : shape === 'ellipse' ? 'rounded-[50%]'
                          : 'rounded-lg'

                    const animClass =
                      n.status === 'doing' ? 'node-doing'
                        : n.status === 'review' ? 'node-review'
                          : n.status === 'blocked' ? 'node-blocked'
                            : ''

                    return (
                      <button
                        key={n.id}
                        onMouseDown={(e) => {
                          setSelectedTaskId(n.id)
                          const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
                          setDraggingId(n.id)
                          setDragOffset({ x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom })
                        }}
                        onClick={(e) => onNodeClick(e, n.id)}
                        className={[
                          'absolute border-2 text-left shadow-sm transition-shadow',
                          shapeClass,
                          statusBorder(n.status),
                          statusBg(n.status),
                          animClass,
                          isSelected ? 'ring-2 ring-indigo-400 ring-offset-1' : '',
                          isConnecting ? 'ring-2 ring-yellow-400' : '',
                          'hover:shadow-md',
                        ].filter(Boolean).join(' ')}
                        style={{ left: meta.x, top: meta.y, width: w, height: h }}
                      >
                        <div className={`flex h-full flex-col ${shape === 'circle' || shape === 'ellipse' ? 'items-center justify-center px-2 text-center' : 'justify-between p-2.5'}`}>
                          <div className={`flex items-center gap-1.5 ${shape !== 'rect' ? 'justify-center' : ''}`}>
                            <div className={`h-2 w-2 flex-shrink-0 rounded-full ${statusDot(n.status)}`} />
                            <p className={`font-medium leading-tight ${shape === 'rect' ? 'line-clamp-2 text-[12px]' : 'line-clamp-1 text-[10px]'}`}>{n.title}</p>
                          </div>
                          {shape === 'rect' && (
                            <p className="text-[9px] text-slate-500">{n.status} · {n.runner_agent_id?.slice(0, 12) || '-'}</p>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </main>

              {/* ── detail panel ── */}
              <aside className="overflow-y-auto border-l border-slate-200 bg-slate-50 p-3">
                {selected ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-slate-400">Node Detail</p>
                      <button onClick={() => deleteTask(selected.id)} className="text-[10px] text-red-400 hover:text-red-600">Delete</button>
                    </div>

                    <input value={taskDraft.title || ''} onChange={(e) => setTaskDraft((d) => ({ ...d, title: e.target.value }))} className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-sm font-semibold" placeholder="Title" />

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[9px] text-slate-400">Status</label>
                        <select value={taskDraft.status || 'todo'} onChange={(e) => setTaskDraft((d) => ({ ...d, status: e.target.value as TaskNode['status'] }))} className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs">
                          <option value="todo">todo</option><option value="doing">doing</option><option value="review">review</option><option value="done">done</option><option value="blocked">blocked</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[9px] text-slate-400">Shape</label>
                        <select
                          value={positions[selected.id]?.shape || 'rect'}
                          onChange={(e) => setPositions((prev) => ({ ...prev, [selected.id]: { ...prev[selected.id], shape: e.target.value as NodeShape } }))}
                          className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs"
                        >
                          <option value="rect">Rectangle (Task)</option>
                          <option value="circle">Circle (Decision)</option>
                          <option value="ellipse">Ellipse (Start/End)</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[9px] text-slate-400">Exec Mode</label>
                        <input value={taskDraft.exec_mode || ''} onChange={(e) => setTaskDraft((d) => ({ ...d, exec_mode: e.target.value }))} placeholder="reasoning" className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs" />
                      </div>
                      <div>
                        <label className="text-[9px] text-slate-400">Priority</label>
                        <input value={taskDraft.priority || ''} onChange={(e) => setTaskDraft((d) => ({ ...d, priority: e.target.value }))} placeholder="P2" className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs" />
                      </div>
                    </div>

                    <div>
                      <label className="text-[9px] text-slate-400">Owner Agent</label>
                      <input value={taskDraft.owner_agent_id || ''} onChange={(e) => setTaskDraft((d) => ({ ...d, owner_agent_id: e.target.value }))} className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs" />
                    </div>
                    <div>
                      <label className="text-[9px] text-slate-400">Runner Agent</label>
                      <input value={taskDraft.runner_agent_id || ''} onChange={(e) => setTaskDraft((d) => ({ ...d, runner_agent_id: e.target.value }))} className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs" />
                    </div>

                    <div>
                      <label className="text-[9px] text-slate-400">Description</label>
                      <textarea value={taskDraft.description || ''} onChange={(e) => setTaskDraft((d) => ({ ...d, description: e.target.value }))} className="min-h-14 w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs" />
                    </div>
                    <div>
                      <label className="text-[9px] text-slate-400">Acceptance Criteria</label>
                      <textarea value={taskDraft.acceptance || ''} onChange={(e) => setTaskDraft((d) => ({ ...d, acceptance: e.target.value }))} className="min-h-12 w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs" />
                    </div>
                    <div>
                      <label className="text-[9px] text-slate-400">Notes</label>
                      <textarea value={taskDraft.notes || ''} onChange={(e) => setTaskDraft((d) => ({ ...d, notes: e.target.value }))} className="min-h-10 w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs" />
                    </div>

                    <button onClick={saveTaskDetail} className="w-full rounded border border-indigo-300 bg-indigo-50 px-2 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-100">Save Node</button>

                    {/* dependencies */}
                    <div className="rounded border border-slate-200 bg-white p-2">
                      <p className="mb-1 text-[10px] font-medium text-slate-400">Inbound (depends on)</p>
                      <div className="space-y-1">
                        {edges.filter((e) => e.task_id === selected.id).map((e) => {
                          const dep = nodes.find((n) => n.id === e.depends_on_task_id)
                          return (
                            <div key={`in-${e.depends_on_task_id}`} className="flex items-center justify-between text-[10px]">
                              <span>{dep?.title?.slice(0, 20) || e.depends_on_task_id.slice(0, 8)} · {e.mode || 'p2p'}</span>
                              <button onClick={() => removeDependency(e.task_id, e.depends_on_task_id)} className="text-red-400 hover:text-red-600">×</button>
                            </div>
                          )
                        })}
                        {edges.filter((e) => e.task_id === selected.id).length === 0 && <p className="text-[10px] text-slate-400">none (root node)</p>}
                      </div>
                    </div>

                    <div className="rounded border border-slate-200 bg-white p-2">
                      <p className="mb-1 text-[10px] font-medium text-slate-400">Outbound (flows to)</p>
                      <div className="space-y-1">
                        {edges.filter((e) => e.depends_on_task_id === selected.id).map((e) => {
                          const target = nodes.find((n) => n.id === e.task_id)
                          return (
                            <div key={`out-${e.task_id}`} className="flex items-center justify-between text-[10px]">
                              <span>{target?.title?.slice(0, 20) || e.task_id.slice(0, 8)} · {e.mode || 'p2p'}</span>
                              <button onClick={() => removeDependency(e.task_id, e.depends_on_task_id)} className="text-red-400 hover:text-red-600">×</button>
                            </div>
                          )
                        })}
                        {edges.filter((e) => e.depends_on_task_id === selected.id).length === 0 && <p className="text-[10px] text-slate-400">none (leaf node)</p>}
                      </div>
                    </div>

                    {/* execution log */}
                    <div className="rounded border border-slate-200 bg-white p-2">
                      <p className="mb-1 text-[10px] font-medium text-slate-400">Execution Log</p>
                      <div className="max-h-32 space-y-1 overflow-auto">
                        {timeline.length > 0 ? timeline.map((m) => (
                          <p key={m.id} className="text-[10px] text-slate-600">
                            <span className="text-slate-400">{m.sender}:</span> {m.content.slice(0, 120)}
                          </p>
                        )) : <p className="text-[10px] text-slate-400">No execution log yet</p>}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button className="rounded border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-100" onClick={() => router.push('/tasks')}>Tasks Board</button>
                      {selected.topic_id && <button className="rounded border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-100" onClick={() => router.push(`/feed?topicId=${selected.topic_id}`)}>Topic Feed</button>}
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center text-slate-400">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-2 opacity-40"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 12h6M12 9v6" /></svg>
                    <p className="text-xs">Select a node to edit</p>
                    <p className="mt-1 text-[10px]">or drag shapes to canvas</p>
                  </div>
                )}
              </aside>
            </div>
          </>
        )}
      </div>

      <style jsx>{`
        .edge-flow {
          stroke-dasharray: 8 6;
          animation: edgeFlow 1.2s linear infinite;
        }
        .node-doing {
          animation: nodePulse 1.6s ease-in-out infinite;
        }
        .node-review {
          animation: nodeReview 1.9s ease-in-out infinite;
        }
        .node-blocked {
          animation: nodeBlocked 0.28s linear 0s 2;
        }
        @keyframes edgeFlow {
          from { stroke-dashoffset: 0; }
          to { stroke-dashoffset: -28; }
        }
        @keyframes nodePulse {
          0% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.35); }
          70% { box-shadow: 0 0 0 10px rgba(99, 102, 241, 0); }
          100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0); }
        }
        @keyframes nodeReview {
          0%, 100% { filter: brightness(1); }
          50% { filter: brightness(1.12); }
        }
        @keyframes nodeBlocked {
          0% { transform: translateX(0); }
          25% { transform: translateX(-1px); }
          75% { transform: translateX(1px); }
          100% { transform: translateX(0); }
        }
      `}</style>
    </WttShellV2>
  )
}
