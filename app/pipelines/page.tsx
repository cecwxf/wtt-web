'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { WttShellV2 } from '@/components/ui/wtt-shell-v2'
import type { AgentSubAgentMap, AgentStatsMap } from '@/components/ui/agent-column'
import { normalizeAndFilterAgents } from '@/lib/agents'
import { CLIENT_WTT_API_BASE, WS_BASE_URL } from '@/lib/api/base-url'
import { analyzeDAG, agentColor, agentBgColor, type DAGAnalysis } from '@/lib/dag-analysis'
import { useWebSocket, type WsMessage } from '@/lib/useWebSocket'
import { ShareDialog } from '@/components/ui/share-dialog'
import { formatTime } from '@/lib/time'
import { useAgentId, buildAgentUrl } from '@/lib/hooks/use-agent-id'

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
  description?: string
  status: 'todo' | 'doing' | 'review' | 'done' | 'blocked'
  owner_agent_id?: string
  runner_agent_id?: string
  created_by?: string
  topic_id?: string
  output?: string
  task_type?: string
}

interface TaskEdge {
  task_id: string
  depends_on_task_id: string
  mode?: string
  mapping?: string
  required?: boolean
}

type NodeShape = 'rect' | 'circle' | 'ellipse' | 'diamond' | 'parallelogram' | 'hexagon'
type LineStyle = 'solid' | 'dashed' | 'dotted'

interface NodeMeta { x: number; y: number; shape: NodeShape; color?: string; label?: string }

interface TaskDraft extends Partial<TaskNode> {
  description?: string
  priority?: string
  exec_mode?: string
  acceptance?: string
  notes?: string
  task_type?: string
  due_at?: string
  estimate_hours?: number | null
  dependencies?: string
  timeout_minutes?: number | null
  tags?: string
  worker_id?: string
  model_config?: { model?: string; reasoning_effort?: string }
}

interface ChatMessage {
  id: string
  sender_id: string
  content: string
  sender_type?: string
  created_at?: string
}

type RightTab = 'chat' | 'detail'

/* ─── constants ─── */
const RECT_W = 220, RECT_H = 100
const CIRCLE_D = 100
const ELLIPSE_W = 160, ELLIPSE_H = 80
const DIAMOND_S = 110
const PARA_W = 200, PARA_H = 70
const HEX_W = 160, HEX_H = 80
const PIPELINE_MODEL_OPTIONS = [
  { id: 'deepseek-v4-pro[1m]', label: 'DeepSeek V4 Pro', supports_reasoning: true },
  { id: 'anthropic/claude-opus-4.7', label: 'Claude Opus 4.7', supports_reasoning: true },
  { id: 'anthropic/claude-sonnet-4.7', label: 'Claude Sonnet 4.7', supports_reasoning: true },
  { id: 'openai-codex/gpt-5.6-sol', label: 'GPT-5.6 Sol', supports_reasoning: true },
  { id: 'openai-codex/gpt-5.5', label: 'GPT-5.5', supports_reasoning: true },
]
const PIPELINE_MODEL_IDS = new Set(PIPELINE_MODEL_OPTIONS.map((model) => model.id))

const actorSource = (session: unknown, selectedAgentId: string) => {
  const s = session as { userId?: string; user?: { name?: string | null; email?: string | null } } | null | undefined
  const uid = s?.userId || ''
  return s?.user?.name || s?.user?.email || (uid ? `user_${uid.slice(0, 8)}` : selectedAgentId || 'user')
}

const shapeDims = (s: NodeShape) => {
  if (s === 'circle') return { w: CIRCLE_D, h: CIRCLE_D }
  if (s === 'ellipse') return { w: ELLIPSE_W, h: ELLIPSE_H }
  if (s === 'diamond') return { w: DIAMOND_S, h: DIAMOND_S }
  if (s === 'parallelogram') return { w: PARA_W, h: PARA_H }
  if (s === 'hexagon') return { w: HEX_W, h: HEX_H }
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

/* edge anchor by shape */
function getAnchor(meta: NodeMeta, side: 'out' | 'in'): { x: number; y: number } {
  const { w, h } = shapeDims(meta.shape)
  const cx = meta.x + w / 2
  const cy = meta.y + h / 2
  if (meta.shape === 'circle') {
    return side === 'out' ? { x: cx + CIRCLE_D / 2, y: cy } : { x: cx - CIRCLE_D / 2, y: cy }
  }
  if (meta.shape === 'diamond') {
    return side === 'out' ? { x: meta.x + DIAMOND_S, y: cy } : { x: meta.x, y: cy }
  }
  return side === 'out' ? { x: meta.x + w, y: cy } : { x: meta.x, y: cy }
}

/* line style stroke attrs */
const lineStrokeAttrs = (style: LineStyle) => {
  if (style === 'dashed') return { strokeDasharray: '10 5' }
  if (style === 'dotted') return { strokeDasharray: '3 4' }
  return {}
}

/* node color presets */
/* ─── SVG clip paths for special shapes ─── */
function DiamondClip({ id, s }: { id: string; s: number }) {
  const half = s / 2
  return (
    <clipPath id={id}>
      <polygon points={`${half},0 ${s},${half} ${half},${s} 0,${half}`} />
    </clipPath>
  )
}

function HexClip({ id, w, h }: { id: string; w: number; h: number }) {
  const inset = w * 0.2
  return (
    <clipPath id={id}>
      <polygon points={`${inset},0 ${w - inset},0 ${w},${h / 2} ${w - inset},${h} ${inset},${h} 0,${h / 2}`} />
    </clipPath>
  )
}

function ParaClip({ id, w, h }: { id: string; w: number; h: number }) {
  const skew = w * 0.12
  return (
    <clipPath id={id}>
      <polygon points={`${skew},0 ${w},0 ${w - skew},${h} 0,${h}`} />
    </clipPath>
  )
}

/* ─── page component ─── */
export default function PipelinesPageWrapper() {
  return <Suspense fallback={null}><PipelinesPageInner /></Suspense>
}

function PipelinesPageInner() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [agents, setAgents] = useState<Array<{ agent_id: string; display_name: string }>>([])
  const [selectedAgentId, setSelectedAgentId] = useAgentId()

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
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null)

  /* ─── pipeline list data ─── */
  const { data: pipelinesRaw, mutate: mutatePipelines } = useSWR(
    session?.accessToken && selectedAgentId ? ['pipelines-page', session.accessToken, selectedAgentId] : null,
    async () => {
      const url = selectedAgentId
        ? `${CLIENT_WTT_API_BASE}/tasks/pipelines?creator_agent_id=${encodeURIComponent(selectedAgentId)}`
        : `${CLIENT_WTT_API_BASE}/tasks/pipelines`
      const r = await fetch(url, { headers: { Authorization: `Bearer ${session?.accessToken}` } })
      if (!r.ok) return []
      return r.json()
    }
  )
  const pipelines: Pipeline[] = useMemo(() => (Array.isArray(pipelinesRaw) ? pipelinesRaw : []).filter(p => p.id !== 'default'), [pipelinesRaw])

  /* ─── pipeline running state ─── */
  const [pipelineRunning, setPipelineRunning] = useState(false)

  /* ─── graph data (editor mode) ─── */
  const { data: graphData, mutate: mutateGraph } = useSWR(
    session?.accessToken && editingPipelineId ? ['pipeline-graph', session.accessToken, editingPipelineId] : null,
    async () => {
      const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/graph?pipeline_id=${encodeURIComponent(editingPipelineId!)}`, { headers: { Authorization: `Bearer ${session?.accessToken}` } })
      if (!r.ok) throw new Error('failed')
      return r.json()
    },
    { refreshInterval: pipelineRunning ? 2000 : 5000 }
  )
  const nodes: TaskNode[] = useMemo(() => (Array.isArray(graphData?.nodes) ? graphData.nodes : []), [graphData])
  const edges: TaskEdge[] = useMemo(() => (Array.isArray(graphData?.edges) ? graphData.edges : []), [graphData])

  /* ─── WebSocket for real-time task status updates ─── */
  const wsUrl = selectedAgentId ? `${WS_BASE_URL}/ws/${selectedAgentId}` : ''
  const handleWsMessage = useCallback(
    (msg: WsMessage) => {
      if (msg.type === 'task_status') {
        mutateGraph()
        mutatePipelines()
      }
    },
    [mutateGraph, mutatePipelines],
  )
  useWebSocket({
    url: wsUrl,
    enabled: !!selectedAgentId,
    token: session?.accessToken || undefined,
    onMessage: handleWsMessage,
  })

  /* ─── agent stats / online status (sync with feed & tasks sidebar) ─── */
  const { data: statsData } = useSWR(
    session?.accessToken ? `${CLIENT_WTT_API_BASE}/agents/stats` : null,
    async (url: string) => {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${session?.accessToken}` } })
      if (!r.ok) return null
      return r.json()
    },
    { refreshInterval: 30_000 },
  )
  const agentStats = useMemo<AgentStatsMap>(() => statsData?.agents ?? {}, [statsData])
  const onlineAgentIds = useMemo(() => new Set<string>(statsData?.online_agents ?? []), [statsData])
  const maxSubAgents = statsData?.max_sub_agents ?? 20

  // Build agentSubAgents from pipeline graph nodes
  const agentSubAgents = useMemo<AgentSubAgentMap>(() => {
    const map: AgentSubAgentMap = {}
    for (const n of nodes) {
      const aid = n.owner_agent_id || n.runner_agent_id
      if (!aid) continue
      if (!map[aid]) map[aid] = []
      map[aid].push({ id: n.id, title: n.title || 'Untitled', task_type: n.task_type || 'general', status: n.status || 'todo' })
    }
    return map
  }, [nodes])

  const loadAgents = useCallback(async () => {
    if (!session?.accessToken) return
    const r = await fetch(`${CLIENT_WTT_API_BASE}/agents/my`, { headers: { Authorization: `Bearer ${session.accessToken}` } })
    if (!r.ok) return
    const list = normalizeAndFilterAgents(await r.json()).map((x) => ({ agent_id: x.agent_id, display_name: x.display_name }))
    setAgents(list)
    if (!selectedAgentId && list[0]) setSelectedAgentId(list[0].agent_id)
  }, [session?.accessToken, selectedAgentId])

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
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null)
  const [shareTarget, setShareTarget] = useState<{ topicId: string; name: string } | null>(null)
  const [connectLineStyle, setConnectLineStyle] = useState<LineStyle>('solid')
  const [taskDraft, setTaskDraft] = useState<TaskDraft>({})
  const [availableModels, setAvailableModels] = useState<Array<{ id: string; label: string; supports_reasoning?: boolean }>>(PIPELINE_MODEL_OPTIONS)
  const [agentWorkers, setAgentWorkers] = useState<Array<{ id: string; name: string; model_config?: Record<string, string> }>>([])
  const [workerDropOpen, setWorkerDropOpen] = useState(false)
  const [modelDropOpen, setModelDropOpen] = useState(false)

  // Fetch available models
  useEffect(() => {
    fetch(`${CLIENT_WTT_API_BASE}/workers/models/available`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.models) {
          const models = d.models.filter((model: { id?: string }) => model.id && PIPELINE_MODEL_IDS.has(model.id))
          setAvailableModels(models.length ? models : PIPELINE_MODEL_OPTIONS)
        }
      })
      .catch(() => {})
  }, [])

  // Fetch workers for current agent
  useEffect(() => {
    if (!selectedAgentId) return
    fetch(`${CLIENT_WTT_API_BASE}/workers?agent_id=${selectedAgentId}`)
      .then(r => r.ok ? r.json() : [])
      .then(d => setAgentWorkers(d))
      .catch(() => {})
  }, [selectedAgentId])

  /* ─── draft (unsaved) nodes on canvas ─── */
  const [draftNodes, setDraftNodes] = useState<Record<string, TaskDraft & { _shape: NodeShape }>>({})
  const allNodes: TaskNode[] = useMemo(() => {
    const drafts: TaskNode[] = Object.entries(draftNodes).map(([id, d]) => {
      // For the currently selected draft, use live taskDraft values (avoids useEffect sync + flicker)
      const isEditing = id === selectedTaskId
      return {
        id,
        title: (isEditing ? taskDraft.title : d.title) || 'Untitled',
        description: isEditing ? taskDraft.description : d.description,
        status: 'todo' as const,
        owner_agent_id: isEditing ? taskDraft.owner_agent_id : d.owner_agent_id,
        runner_agent_id: isEditing ? taskDraft.runner_agent_id : d.runner_agent_id,
      }
    })
    return [...nodes, ...drafts]
  }, [nodes, draftNodes, selectedTaskId, taskDraft.title, taskDraft.description, taskDraft.owner_agent_id, taskDraft.runner_agent_id])

  /* ─── drag-to-connect state ─── */
  const [dragLine, setDragLine] = useState<{ fromId: string; fromX: number; fromY: number; toX: number; toY: number } | null>(null)

  /* ─── local (draft) edges for connections involving drafts ─── */
  const [localEdges, setLocalEdges] = useState<TaskEdge[]>([])
  const allEdges: TaskEdge[] = useMemo(() => {
    // Deduplicate: API edges take priority over local edges with same endpoints
    const apiKeys = new Set(edges.map(e => `${e.depends_on_task_id}->${e.task_id}`))
    const deduped = localEdges.filter(e => !apiKeys.has(`${e.depends_on_task_id}->${e.task_id}`))
    return [...edges, ...deduped]
  }, [edges, localEdges])

  /* ─── edge styles persisted alongside positions ─── */
  const [edgeStyles, setEdgeStyles] = useState<Record<string, LineStyle>>({})

  /* ─── right panel tab ─── */
  const [rightTab, setRightTab] = useState<RightTab>('chat')

  /* ─── chat target: 'agent' (P2P with selected agent) or 'node' (selected node topic) ─── */
  type ChatTarget = 'agent' | 'node'
  const [chatTarget, setChatTarget] = useState<ChatTarget>('agent')
  const [chatInput, setChatInput] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  /* ─── P2P topics: per-agent map of topic IDs ─── */
  const [agentP2pTopics, setAgentP2pTopics] = useState<Record<string, string>>({})
  const [chatAgentId, setChatAgentId] = useState<string>(selectedAgentId || '')
  useEffect(() => { if (selectedAgentId && !chatAgentId) setChatAgentId(selectedAgentId) }, [selectedAgentId, chatAgentId])
  const agentP2pTopicId = chatAgentId ? (agentP2pTopics[chatAgentId] || null) : null

  /* ─── pipeline + selected node topic for chat ─── */
  const editingPipeline = pipelines.find((p) => p.id === editingPipelineId)
  const pipelineTopicId = (editingPipeline as Pipeline & { topic_id?: string })?.topic_id || null
  const selectedNodeTopicId = useMemo(() => {
    if (!selectedTaskId) return null
    const n = allNodes.find(n => n.id === selectedTaskId)
    return n?.topic_id || null
  }, [selectedTaskId, allNodes])
  const activeChatTopicId = chatTarget === 'node' ? (selectedNodeTopicId || pipelineTopicId) : agentP2pTopicId

  /* ─── chat messages ─── */
  const { data: chatMessagesRaw, mutate: mutateChat } = useSWR(
    activeChatTopicId && session?.accessToken ? ['pipe-chat', activeChatTopicId, session.accessToken] : null,
    async () => {
      const r = await fetch(`${CLIENT_WTT_API_BASE}/topics/${activeChatTopicId}/messages?limit=50`, { headers: { Authorization: `Bearer ${session?.accessToken}` } })
      if (!r.ok) return []
      return r.json()
    },
    { refreshInterval: 3000 }
  )
  const chatMessages: ChatMessage[] = useMemo(() => {
    const raw = Array.isArray(chatMessagesRaw) ? chatMessagesRaw : Array.isArray((chatMessagesRaw as { messages?: unknown[] })?.messages) ? (chatMessagesRaw as { messages: unknown[] }).messages : []
    return raw.map((x) => x as Record<string, unknown>).map((x) => ({
      id: String(x.id || x.message_id || ''),
      sender_id: String(x.sender_id || 'unknown'),
      content: String(x.content || ''),
      sender_type: String(x.sender_type || ''),
      created_at: String(x.created_at || ''),
    }))
  }, [chatMessagesRaw])

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatMessages.length])

  /* ─── DAG analysis (computed from allNodes + allEdges) ─── */
  const dagAnalysis: DAGAnalysis | null = useMemo(() => {
    if (!allNodes.length) return null
    const titleMap = new Map(allNodes.map(n => [n.id, n.title]))
    return analyzeDAG(
      allNodes.map(n => ({ id: n.id, status: n.status, runner_agent_id: n.runner_agent_id })),
      allEdges,
      titleMap,
    )
  }, [allNodes, allEdges])

  const involvedAgents = useMemo(() => {
    if (!dagAnalysis) return [] as string[]
    return Array.from(dagAnalysis.agentWorkload.keys()).filter(a => a !== 'unassigned')
  }, [dagAnalysis])

  const selected = useMemo(() => allNodes.find((n) => n.id === selectedTaskId) || null, [allNodes, selectedTaskId])
  const isDraft = selectedTaskId ? !!draftNodes[selectedTaskId] : false

  // Helper: sync taskDraft from a node/draft when selection changes
  const syncDraftForNode = useCallback((nodeId: string) => {
    const draft = draftNodes[nodeId]
    if (draft) {
      setTaskDraft(draft as TaskDraft)
    } else {
      const node = nodes.find(n => n.id === nodeId)
      if (node) setTaskDraft(node as TaskDraft)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, draftNodes])

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

  /* ─── persist positions & edge styles in localStorage ─── */
  useEffect(() => {
    if (!editingPipelineId) return
    try {
      const raw = localStorage.getItem(`wtt_pipe_v3:${editingPipelineId}`)
      if (raw) {
        const parsed = JSON.parse(raw)
        setPositions(parsed.positions || {})
        setEdgeStyles(parsed.edgeStyles || {})
      } else {
        setPositions({})
        setEdgeStyles({})
      }
    } catch { setPositions({}); setEdgeStyles({}) }
  }, [editingPipelineId])

  useEffect(() => {
    if (!editingPipelineId) return
    try { localStorage.setItem(`wtt_pipe_v3:${editingPipelineId}`, JSON.stringify({ positions, edgeStyles })) } catch {}
  }, [positions, edgeStyles, editingPipelineId])

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
      body: JSON.stringify({ name, creator_agent_id: selectedAgentId || undefined }),
    })
    if (!r.ok) {
      const body = await r.json().catch(() => null)
      alert(body?.detail || `Create failed: ${r.statusText}`)
      return
    }
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
    if (!confirm(`Delete pipeline "${p.name}" and all its tasks? This cannot be undone.`)) return
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
  const createDraftAt = (x: number, y: number, shape: NodeShape = 'rect') => {
    const shapeLabel = shape === 'rect' ? 'Task' : shape === 'circle' ? 'Decision' : shape === 'ellipse' ? 'Start/End' : shape === 'diamond' ? 'Condition' : shape === 'hexagon' ? 'Process' : 'Node'
    const draftId = `draft-${Date.now()}`
    const title = `New ${shapeLabel} ${allNodes.length + 1}`
    setDraftNodes((prev) => ({ ...prev, [draftId]: { title, _shape: shape, task_type: 'feature', priority: 'P2', runner_agent_id: selectedAgentId || undefined, owner_agent_id: selectedAgentId || undefined } }))
    setPositions((prev) => ({ ...prev, [draftId]: { x, y, shape } }))
    setSelectedTaskId(draftId)
    setRightTab('detail')
    setTaskDraft({ title, task_type: 'feature', priority: 'P2', runner_agent_id: selectedAgentId || undefined, owner_agent_id: selectedAgentId || undefined })
  }

  const commitDraft = async (draftId: string) => {
    const draft = draftNodes[draftId]
    if (!draft) return
    const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.accessToken ?? ''}` },
      body: JSON.stringify({
        title: taskDraft.title || draft.title || 'Untitled',
        task_mode: 'pipeline',
        pipeline_id: editingPipelineId || 'default',
        task_type: taskDraft.task_type || 'feature',
        priority: taskDraft.priority || 'P2',
        status: 'todo',
        owner_agent_id: taskDraft.owner_agent_id || selectedAgentId || undefined,
        runner_agent_id: taskDraft.runner_agent_id || selectedAgentId || undefined,
        created_by: actorSource(session, selectedAgentId),
        description: taskDraft.description,
        acceptance: taskDraft.acceptance,
        notes: taskDraft.notes,
        exec_mode: taskDraft.exec_mode,
        worker_id: taskDraft.worker_id || undefined,
        model_config: taskDraft.model_config || undefined,
      }),
    })
    if (!r.ok) { alert(`Create task failed: ${(await r.json().catch(() => ({}))).detail || r.statusText}`); return }
    const j = await r.json()

    // Copy draft position to real node ID, remove draft position
    const pos = positions[draftId]
    setPositions((prev: Record<string, NodeMeta>) => {
      const next: Record<string, NodeMeta> = { ...prev, [j.id]: pos || { x: 80, y: 80, shape: draft._shape } }
      delete next[draftId]
      return next
    })

    // Commit local edges involving this draft to the API (fire-and-forget)
    const draftEdges = localEdges.filter(e => e.task_id === draftId || e.depends_on_task_id === draftId)
    for (const le of draftEdges) {
      const realFrom = le.depends_on_task_id === draftId ? j.id : le.depends_on_task_id
      const realTo = le.task_id === draftId ? j.id : le.task_id
      if (realFrom.startsWith('draft-') || realTo.startsWith('draft-')) continue
      fetch(`${CLIENT_WTT_API_BASE}/tasks/${realTo}/dependencies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.accessToken ?? ''}` },
        body: JSON.stringify({ depends_on_task_id: realFrom, mode: 'p2p', required: true }),
      }).catch(() => {})
    }

    // Remap local edges from draft ID to real ID
    setLocalEdges((prev) => prev.map(e => ({
      ...e,
      task_id: e.task_id === draftId ? j.id : e.task_id,
      depends_on_task_id: e.depends_on_task_id === draftId ? j.id : e.depends_on_task_id,
    })))

    // Remove draft immediately
    setDraftNodes((prev) => { const next = { ...prev }; delete next[draftId]; return next })

    // CRITICAL: Optimistic SWR update — inject new node into cache SYNCHRONOUSLY
    // This guarantees the real node appears in `nodes` in the SAME render cycle
    // that the draft is removed, so the node never disappears from the canvas.
    await mutateGraph(
      (current: { nodes: Record<string, unknown>[]; edges: Record<string, unknown>[] } | undefined) => {
        if (!current) return { nodes: [j], edges: [] }
        return { ...current, nodes: [...current.nodes, j] }
      },
      { revalidate: true },
    )

    setSelectedTaskId(j.id)
    setTaskDraft(j as TaskDraft)
  }

  const saveTaskDetail = async () => {
    if (!selectedTaskId) return
    // draft node → commit to API
    if (draftNodes[selectedTaskId]) {
      await commitDraft(selectedTaskId)
      return
    }
    // real node → PATCH update
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
        task_type: taskDraft.task_type,
        priority: taskDraft.priority,
        due_at: taskDraft.due_at || null,
        estimate_hours: taskDraft.estimate_hours ?? null,
        dependencies: taskDraft.dependencies || null,
        worker_id: taskDraft.worker_id || null,
        model_config: taskDraft.model_config || null,
      }),
    })
    if (!r.ok) { alert(`Save failed: ${(await r.text()) || r.status}`); return }
    await mutateGraph()
  }

  const deleteTask = async (taskId: string) => {
    // draft node → just remove locally
    if (draftNodes[taskId]) {
      setDraftNodes((prev) => { const n = { ...prev }; delete n[taskId]; return n })
      setPositions((prev) => { const n = { ...prev }; delete n[taskId]; return n })
      setLocalEdges((prev) => prev.filter(e => e.task_id !== taskId && e.depends_on_task_id !== taskId))
      if (selectedTaskId === taskId) setSelectedTaskId(null)
      return
    }
    if (!confirm('Delete this node?')) return
    const node = nodes.find(n => n.id === taskId)
    const actingAgent = node?.owner_agent_id || selectedAgentId
    await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}?acting_as_agent_id=${encodeURIComponent(actingAgent)}&delete_topic=true`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session?.accessToken ?? ''}` },
    })
    setPositions((prev) => { const n = { ...prev }; delete n[taskId]; return n })
    if (selectedTaskId === taskId) setSelectedTaskId(null)
    await mutateGraph()
  }

  const duplicateTask = async () => {
    if (!selected) return
    const meta = positions[selected.id]
    const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.accessToken ?? ''}` },
      body: JSON.stringify({
        title: `${selected.title} (copy)`,
        task_mode: 'pipeline',
        pipeline_id: editingPipelineId || 'default',
        task_type: (taskDraft.task_type as string) || 'feature',
        priority: taskDraft.priority || 'P2',
        status: 'todo',
        owner_agent_id: selected.owner_agent_id,
        runner_agent_id: selected.runner_agent_id,
        created_by: actorSource(session, selectedAgentId),
        description: taskDraft.description,
        acceptance: taskDraft.acceptance,
        notes: taskDraft.notes,
      }),
    })
    if (!r.ok) return
    const j = await r.json()
    setPositions((prev) => ({ ...prev, [j.id]: { x: (meta?.x || 40) + 30, y: (meta?.y || 40) + 30, shape: meta?.shape || 'rect', color: meta?.color, label: meta?.label } }))
    await mutateGraph()
    setSelectedTaskId(j.id)
    setTaskDraft(j as TaskDraft)
  }

  /* ─── rerun task ─── */
  const rerunTask = async (taskId: string, times: number = 1) => {
    const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/rerun?times=${times}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session?.accessToken ?? ''}` },
    })
    if (!r.ok) { alert('ReRun failed'); return }
    await mutateGraph()
  }

  /* ─── edge CRUD ─── */
  const addDependencyByIds = async (fromId: string, toId: string, style: LineStyle = 'solid') => {
    if (!fromId || !toId || fromId === toId) return
    const fromIsDraft = fromId.startsWith('draft-')
    const toIsDraft = toId.startsWith('draft-')
    const edgeKey = `${fromId}->${toId}`
    if (fromIsDraft || toIsDraft) {
      // Store locally for draft nodes
      setLocalEdges((prev) => {
        if (prev.some(e => e.task_id === toId && e.depends_on_task_id === fromId)) return prev
        return [...prev, { task_id: toId, depends_on_task_id: fromId, mode: 'p2p', required: true }]
      })
      setEdgeStyles((prev) => ({ ...prev, [edgeKey]: style }))
      return
    }
    const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${toId}/dependencies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.accessToken ?? ''}` },
      body: JSON.stringify({ depends_on_task_id: fromId, mode: 'p2p', required: true }),
    })
    if (!r.ok) { alert(`Add edge failed: ${(await r.text()) || r.status}`); return }
    setEdgeStyles((prev) => ({ ...prev, [edgeKey]: style }))
    await mutateGraph()
  }

  const removeDependency = async (taskId: string, depId: string) => {
    await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/dependencies/${depId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session?.accessToken ?? ''}` },
    })
    setEdgeStyles((prev) => { const n = { ...prev }; delete n[`${depId}->${taskId}`]; return n })
    await mutateGraph()
  }

  /* ─── batch delete selected nodes ─── */
  const deleteSelectedNodes = async () => {
    const ids = selectedTaskIds.length > 0 ? selectedTaskIds : selectedTaskId ? [selectedTaskId] : []
    if (ids.length === 0) return
    if (!confirm(`Delete ${ids.length} node(s)?`)) return
    for (const id of ids) {
      if (draftNodes[id]) {
        setDraftNodes((prev) => { const n = { ...prev }; delete n[id]; return n })
        continue
      }
      const node = nodes.find(n => n.id === id)
      const actingAgent = node?.owner_agent_id || selectedAgentId
      await fetch(`${CLIENT_WTT_API_BASE}/tasks/${id}?acting_as_agent_id=${encodeURIComponent(actingAgent)}&delete_topic=true`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session?.accessToken ?? ''}` },
      })
    }
    setPositions((prev) => {
      const n = { ...prev }
      ids.forEach((id) => delete n[id])
      return n
    })
    setSelectedTaskId(null)
    setSelectedTaskIds([])
    await mutateGraph()
  }

  /* ─── clear all nodes in pipeline ─── */
  const clearAllNodes = async () => {
    if (allNodes.length === 0) return
    if (!confirm(`Clear all ${allNodes.length} nodes from this pipeline?`)) return
    for (const n of nodes) {
      const actingAgent = n.owner_agent_id || selectedAgentId
      await fetch(`${CLIENT_WTT_API_BASE}/tasks/${n.id}?acting_as_agent_id=${encodeURIComponent(actingAgent)}&delete_topic=true`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session?.accessToken ?? ''}` },
      })
    }
    setDraftNodes({})
    setPositions({})
    setSelectedTaskId(null)
    setSelectedTaskIds([])
    await mutateGraph()
  }

  /* ─── select all nodes ─── */
  const selectAllNodes = () => {
    setSelectedTaskIds(allNodes.map((n) => n.id))
  }

  /* ─── keyboard shortcuts ─── */
  useEffect(() => {
    if (!editingPipelineId) return
    const handler = (e: KeyboardEvent) => {
      // Delete / Backspace to delete selected nodes
      if ((e.key === 'Delete' || e.key === 'Backspace') && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement)) {
        e.preventDefault()
        deleteSelectedNodes()
      }
      // Escape to deselect / cancel connect
      if (e.key === 'Escape') {
        setConnectFromId(null)
        setContextMenu(null)
        setSelectedTaskIds([])
      }
      // Ctrl+A to select all
      if ((e.ctrlKey || e.metaKey) && e.key === 'a' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault()
        selectAllNodes()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingPipelineId, selectedTaskIds, selectedTaskId, nodes])

  /* ─── pipeline execution ─── */
  const runPipeline = async () => {
    const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/pipeline/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.accessToken ?? ''}` },
      body: JSON.stringify({
        trigger_agent_id: actorSource(session, selectedAgentId) || 'pipeline-runner',
        pipeline_id: editingPipelineId || undefined,
      }),
    })
    const j = await r.json()
    setPipelineRunning(true)
    alert(`Pipeline started: ${j.count || 0} tasks (dependency order)`)
    mutateGraph()
  }

  // Auto-stop fast polling when all nodes are done
  useEffect(() => {
    if (!pipelineRunning || nodes.length === 0) return
    const allDone = nodes.every(n => n.status === 'done' || n.status === 'blocked')
    if (allDone) setPipelineRunning(false)
  }, [pipelineRunning, nodes])

  /* ─── auto layout (using DAG analysis) ─── */
  const autoLayout = () => {
    if (!dagAnalysis) return
    const next: Record<string, NodeMeta> = {}
    dagAnalysis.levels.forEach((lvl) => {
      const totalH = lvl.nodeIds.length * 130 - 30
      const startY = Math.max(40, (600 - totalH) / 2)
      lvl.nodeIds.forEach((id, ni) => {
        next[id] = { x: 80 + lvl.level * 320, y: startY + ni * 130, shape: positions[id]?.shape || 'rect', color: positions[id]?.color, label: positions[id]?.label }
      })
    })
    // place any un-leveled nodes (cycle)
    const placed = new Set(Object.keys(next))
    const cx = 80 + (dagAnalysis.maxLevel + 1) * 320
    allNodes.filter(n => !placed.has(n.id)).forEach((n, i) => {
      next[n.id] = { x: cx, y: 40 + i * 130, shape: positions[n.id]?.shape || 'rect', color: positions[n.id]?.color, label: positions[n.id]?.label }
    })
    setPan({ x: 0, y: 0 })
    setZoom(1)
    setPositions(next)
  }

  /* ─── chat: send message ─── */
  const sendChatMessage = async () => {
    if (!chatInput.trim() || chatSending) return
    setChatSending(true)
    const content = chatInput.trim()
    setChatInput('')

    try {
      let topicId = activeChatTopicId
      const targetAgent = chatAgentId || selectedAgentId

      if (chatTarget === 'agent' && !topicId && targetAgent) {
        // Use /messages/p2p — auto-creates P2P topic + sends first message
        const userActor = actorSource(session, selectedAgentId)
        const p2pR = await fetch(`${CLIENT_WTT_API_BASE}/messages/p2p?sender_id=${encodeURIComponent(userActor)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.accessToken ?? ''}` },
          body: JSON.stringify({
            target_agent_id: targetAgent,
            content,
            content_type: 'text',
            semantic_type: 'post',
            sender_type: 'HUMAN',
          }),
        })
        if (p2pR.ok) {
          const res = await p2pR.json()
          topicId = res.topic_id
          setAgentP2pTopics(prev => ({ ...prev, [targetAgent]: topicId! }))
          await mutateChat()
        } else {
          const errTxt = await p2pR.text().catch(() => '')
          alert(`P2P message failed: ${errTxt || p2pR.status}`)
        }
        return
      }

      if (chatTarget === 'node' && !topicId && editingPipelineId) {
        // Create a pipeline discussion topic for node chat
        const pName = editingPipeline?.name || 'Pipeline'
        const createR = await fetch(`${CLIENT_WTT_API_BASE}/topics`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.accessToken ?? ''}` },
          body: JSON.stringify({
            name: `pipeline:${pName}`,
            description: `Chat for pipeline ${pName}`,
            type: 'discussion',
            visibility: 'private',
            creator_agent_id: selectedAgentId || actorSource(session, selectedAgentId),
          }),
        })
        if (createR.ok) {
          const t = await createR.json()
          topicId = t.id
          await fetch(`${CLIENT_WTT_API_BASE}/tasks/pipelines/${editingPipelineId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.accessToken ?? ''}` },
            body: JSON.stringify({ topic_id: topicId }),
          })
          await mutatePipelines()
        }
      }

      if (!topicId) return

      // Send to existing topic
      await fetch(`${CLIENT_WTT_API_BASE}/topics/${topicId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.accessToken ?? ''}` },
        body: JSON.stringify({
          content,
          sender_id: actorSource(session, selectedAgentId),
          sender_type: 'HUMAN',
          content_type: 'text',
          semantic_type: 'post',
        }),
      })
      await mutateChat()
    } finally {
      setChatSending(false)
    }
  }

  /* ─── parse pipeline_actions from chat messages ─── */
  const parsePipelineActions = useCallback(async (msg: ChatMessage) => {
    const match = msg.content.match(/```json\s*(\{[\s\S]*?"pipeline_actions"[\s\S]*?\})\s*```/)
    if (!match) return
    try {
      const parsed = JSON.parse(match[1])
      const actions = parsed.pipeline_actions
      if (!Array.isArray(actions)) return
      const titleToId = new Map<string, string>()
      allNodes.forEach(n => titleToId.set(n.title, n.id))

      for (const action of actions) {
        if (action.type === 'create_node') {
          const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.accessToken ?? ''}` },
            body: JSON.stringify({
              title: action.title,
              task_mode: 'pipeline',
              pipeline_id: editingPipelineId || 'default',
              task_type: action.task_type || 'feature',
              priority: action.priority || 'P2',
              status: 'todo',
              owner_agent_id: selectedAgentId || undefined,
              runner_agent_id: action.runner_agent_id || selectedAgentId || undefined,
              created_by: actorSource(session, selectedAgentId),
              description: action.description,
            }),
          })
          if (r.ok) {
            const j = await r.json()
            titleToId.set(action.title, j.id)
          }
        } else if (action.type === 'add_edge') {
          const fromId = titleToId.get(action.from_title) || action.from_id
          const toId = titleToId.get(action.to_title) || action.to_id
          if (fromId && toId) {
            await fetch(`${CLIENT_WTT_API_BASE}/tasks/${toId}/dependencies`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.accessToken ?? ''}` },
              body: JSON.stringify({ depends_on_task_id: fromId, mode: 'p2p', required: true }),
            })
          }
        } else if (action.type === 'assign_agent') {
          const taskId = titleToId.get(action.node_title) || action.node_id
          if (taskId && action.runner_agent_id) {
            await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.accessToken ?? ''}` },
              body: JSON.stringify({ runner_agent_id: action.runner_agent_id }),
            })
          }
        }
      }
      await mutateGraph()
      autoLayout()
    } catch { /* ignore malformed JSON */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, editingPipelineId, session?.accessToken, selectedAgentId])

  /* ─── canvas interactions ─── */
  const onNodeClick = async (e: React.MouseEvent<HTMLButtonElement>, nodeId: string) => {
    setContextMenu(null)
    // If in connecting mode, this click completes the connection
    if (connectFromId) {
      if (connectFromId !== nodeId) {
        await addDependencyByIds(connectFromId, nodeId, connectLineStyle)
      }
      setConnectFromId(null)
      return
    }
    // Ctrl/Cmd click for multi-select
    if (e.ctrlKey || e.metaKey) {
      setSelectedTaskIds((prev) => prev.includes(nodeId) ? prev.filter((x) => x !== nodeId) : [...prev, nodeId])
      return
    }
    const wasEmpty = !selectedTaskId
    setSelectedTaskId(nodeId)
    setSelectedTaskIds([])
    if (nodeId !== selectedTaskId) syncDraftForNode(nodeId)
    if (wasEmpty) setRightTab('detail')
  }

  /* clicking a line style in palette: if a node is selected, enter connect mode from that node */
  const onLineStyleClick = (style: LineStyle) => {
    setConnectLineStyle(style)
    if (selectedTaskId) {
      setConnectFromId(selectedTaskId)
    }
  }

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canvasRef.current) return
    // dragging a connection line from port
    if (dragLine) {
      const rect = canvasRef.current.getBoundingClientRect()
      const x = (e.clientX - rect.left - pan.x) / zoom
      const y = (e.clientY - rect.top - pan.y) / zoom
      setDragLine((prev) => prev ? { ...prev, toX: x, toY: y } : null)
      return
    }
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

  /* find node at canvas position */
  const findNodeAt = (canvasX: number, canvasY: number): string | null => {
    for (const n of allNodes) {
      const meta = positions[n.id]
      if (!meta) continue
      const { w, h } = shapeDims(meta.shape || 'rect')
      if (canvasX >= meta.x && canvasX <= meta.x + w && canvasY >= meta.y && canvasY <= meta.y + h) {
        return n.id
      }
    }
    return null
  }

  const onCanvasMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    // finish drag-to-connect
    if (dragLine && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect()
      const x = (e.clientX - rect.left - pan.x) / zoom
      const y = (e.clientY - rect.top - pan.y) / zoom
      const targetId = findNodeAt(x, y)
      if (targetId && targetId !== dragLine.fromId) {
        addDependencyByIds(dragLine.fromId, targetId, connectLineStyle)
      }
      setDragLine(null)
    }
    setDraggingId(null)
    setPanning(false)
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
    createDraftAt(Math.max(0, x), Math.max(0, y), shape)
  }

  /* ─── shape SVG helpers for rendering special shapes ─── */
  const renderShapeOutline = (n: TaskNode, meta: NodeMeta, w: number, h: number) => {
    const shape = meta.shape || 'rect'
    const bg = meta.color || undefined
    if (shape === 'diamond') {
      const half = DIAMOND_S / 2
      return (
        <svg className="absolute inset-0" width={w} height={h}>
          <polygon points={`${half},2 ${DIAMOND_S - 2},${half} ${half},${DIAMOND_S - 2} 2,${half}`}
            fill={bg || (statusBg(n.status) === 'bg-slate-50' ? '#f8fafc' : statusBg(n.status) === 'bg-indigo-50' ? '#eef2ff' : statusBg(n.status) === 'bg-emerald-50' ? '#ecfdf5' : statusBg(n.status) === 'bg-amber-50' ? '#fffbeb' : '#fef2f2')}
            stroke={n.status === 'doing' ? '#6366f1' : n.status === 'done' ? '#22c55e' : n.status === 'review' ? '#eab308' : n.status === 'blocked' ? '#ef4444' : '#cbd5e1'}
            strokeWidth="2" />
        </svg>
      )
    }
    if (shape === 'hexagon') {
      const inset = w * 0.2
      return (
        <svg className="absolute inset-0" width={w} height={h}>
          <polygon points={`${inset},1 ${w - inset},1 ${w - 1},${h / 2} ${w - inset},${h - 1} ${inset},${h - 1} 1,${h / 2}`}
            fill={bg || '#f8fafc'} stroke={n.status === 'doing' ? '#6366f1' : n.status === 'done' ? '#22c55e' : n.status === 'review' ? '#eab308' : n.status === 'blocked' ? '#ef4444' : '#cbd5e1'}
            strokeWidth="2" />
        </svg>
      )
    }
    if (shape === 'parallelogram') {
      const skew = w * 0.12
      return (
        <svg className="absolute inset-0" width={w} height={h}>
          <polygon points={`${skew},1 ${w - 1},1 ${w - skew},${h - 1} 1,${h - 1}`}
            fill={bg || '#f8fafc'} stroke={n.status === 'doing' ? '#6366f1' : n.status === 'done' ? '#22c55e' : n.status === 'review' ? '#eab308' : n.status === 'blocked' ? '#ef4444' : '#cbd5e1'}
            strokeWidth="2" />
        </svg>
      )
    }
    return null
  }

  /* ─── render ─── */

  /* palette shape definitions */
  const shapeItems: { shape: NodeShape; icon: React.ReactNode; label: string; title: string }[] = [
    { shape: 'rect', label: 'Task', title: 'Rectangle — Task Node', icon: <div className="h-7 w-11 rounded border-2 border-slate-400 bg-white" /> },
    { shape: 'circle', label: 'Decision', title: 'Circle — Decision Node', icon: <div className="h-9 w-9 rounded-full border-2 border-slate-400 bg-white" /> },
    { shape: 'ellipse', label: 'Start/End', title: 'Ellipse — Start/End Node', icon: <div className="h-6 w-12 rounded-[50%] border-2 border-slate-400 bg-white" /> },
    { shape: 'diamond', label: 'Condition', title: 'Diamond — Condition/Gate', icon: <svg width="36" height="36" viewBox="0 0 36 36"><polygon points="18,2 34,18 18,34 2,18" fill="white" stroke="#94a3b8" strokeWidth="2" /></svg> },
    { shape: 'parallelogram', label: 'I/O', title: 'Parallelogram — Input/Output', icon: <svg width="44" height="28" viewBox="0 0 44 28"><polygon points="8,1 43,1 36,27 1,27" fill="white" stroke="#94a3b8" strokeWidth="2" /></svg> },
    { shape: 'hexagon', label: 'Process', title: 'Hexagon — Subprocess', icon: <svg width="44" height="28" viewBox="0 0 44 28"><polygon points="9,1 35,1 43,14 35,27 9,27 1,14" fill="white" stroke="#94a3b8" strokeWidth="2" /></svg> },
  ]

  const lineItems: { style: LineStyle; label: string; title: string; dash: string }[] = [
    { style: 'solid', label: 'Solid', title: 'Solid Line — Strong Dependency', dash: '' },
    { style: 'dashed', label: 'Dashed', title: 'Dashed Line — Weak Dependency', dash: '8 4' },
    { style: 'dotted', label: 'Dotted', title: 'Dotted Line — Optional/Async', dash: '3 4' },
  ]

  return (
    <WttShellV2
      agents={agents.map((a) => ({ ...a, unread_count: 0 }))}
      selectedAgentId={selectedAgentId}
      onAgentChange={(id) => { setSelectedAgentId(id); setEditingPipelineId(null) }}
      topics={[]}
      selectedTopicId={null}
      onTopicChange={() => {}}
      onLogout={() => signOut({ callbackUrl: '/login' })}
      currentUserName={actorSource(session, '')}
      agentSubAgents={agentSubAgents}
      maxSubAgents={maxSubAgents}
      agentStats={agentStats}
      onlineAgentIds={onlineAgentIds}
      onBindingChanged={loadAgents}
      userToken={session?.accessToken as string | undefined}
      hideTopics
      hideCreateTopic
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
                <div
                  key={p.id}
                  onClick={() => setSelectedPipelineId(selectedPipelineId === p.id ? null : p.id)}
                  onDoubleClick={() => setEditingPipelineId(p.id)}
                  className={`group cursor-pointer rounded-xl border p-4 transition hover:border-indigo-400 hover:shadow-md ${selectedPipelineId === p.id ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-300' : 'border-slate-200 bg-slate-50'}`}
                >
                  <div className="w-full text-left">
                    <p className="text-sm font-semibold">{p.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{p.description || 'No description'}</p>
                    <div className="mt-3 flex flex-wrap gap-1 text-[10px]">
                      <span className="rounded border border-slate-200 px-1.5 py-0.5 text-slate-500">todo {p.stats?.todo ?? 0}</span>
                      <span className="rounded border border-indigo-300 px-1.5 py-0.5 text-indigo-500">doing {p.stats?.doing ?? 0}</span>
                      <span className="rounded border border-yellow-400 px-1.5 py-0.5 text-amber-600">review {p.stats?.review ?? 0}</span>
                      <span className="rounded border border-green-400 px-1.5 py-0.5 text-green-600">done {p.stats?.done ?? 0}</span>
                      <span className="rounded border border-red-400 px-1.5 py-0.5 text-red-500">blocked {p.stats?.blocked ?? 0}</span>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-slate-100 pt-2">
                    <button onClick={(e) => { e.stopPropagation(); setEditingPipelineId(p.id) }} className="rounded border border-indigo-300 bg-indigo-50 px-2 py-1 text-[10px] font-medium text-indigo-600 hover:bg-indigo-100">▶ Open</button>
                    <button onClick={(e) => { e.stopPropagation(); toggleAutoReview(p) }} className="rounded border border-slate-200 px-2 py-1 text-[10px] text-slate-500 hover:bg-slate-100">AutoReview: {p.auto_review ?? true ? 'ON' : 'OFF'}</button>
                    {selectedPipelineId === p.id && (
                      <button
                        onClick={async (e) => {
                          e.stopPropagation()
                          if (!confirm(`ReRun pipeline "${p.name}"? All tasks will be reset to todo and re-executed.`)) return
                          const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/pipelines/${p.id}/rerun`, {
                            method: 'POST',
                            headers: { Authorization: `Bearer ${session?.accessToken ?? ''}` },
                          })
                          if (r.ok) { const j = await r.json(); alert(`Pipeline ReRun started: ${j.count || 0} tasks`); mutatePipelines() }
                          else alert('ReRun failed')
                        }}
                        className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-600 hover:bg-amber-100"
                      >↻ ReRun Pipeline</button>
                    )}
                    {p.id !== 'default' && (
                      <>
                        <button onClick={(e) => { e.stopPropagation(); renamePipeline(p) }} className="rounded border border-slate-200 px-2 py-1 text-[10px] text-slate-500 hover:bg-slate-100">Rename</button>
                        <button onClick={(e) => { e.stopPropagation(); deletePipeline(p) }} className="rounded border border-red-200 px-2 py-1 text-[10px] text-red-500 hover:bg-red-50">Delete</button>
                      </>
                    )}
                  </div>
                  <p className="mt-2 text-center text-[9px] text-slate-400 opacity-0 group-hover:opacity-100 transition">double-click to open editor</p>
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
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-700 bg-slate-50/80 dark:bg-zinc-800/80 px-4 py-2">
              <div className="flex items-center gap-3">
                <button onClick={() => { setEditingPipelineId(null); setSelectedTaskId(null); setSelectedTaskIds([]); setConnectFromId(null) }} className="rounded p-1 text-slate-500 hover:bg-slate-200" title="Back to list">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                </button>
                <div>
                  <p className="text-sm font-semibold">{editingPipeline?.name || 'Pipeline'}</p>
                  <p className="text-[10px] text-slate-500">{editingPipelineId.slice(0, 12)} · {allNodes.length} nodes · {allEdges.length} edges</p>
                </div>
                {/* pipeline management */}
                {editingPipeline && (
                  <div className="flex items-center gap-1 border-l border-slate-200 pl-3">
                    <button onClick={() => renamePipeline(editingPipeline)} className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-500 hover:bg-slate-100">Rename</button>
                    <button onClick={() => toggleAutoReview(editingPipeline)} className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-500 hover:bg-slate-100">
                      AutoReview: {editingPipeline.auto_review ?? true ? 'ON' : 'OFF'}
                    </button>
                    <button onClick={clearAllNodes} className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-500 hover:bg-slate-100" title="Clear all nodes">Clear All</button>
                    {editingPipeline.id !== 'default' && (
                      <button onClick={() => deletePipeline(editingPipeline)} className="rounded border border-red-200 bg-white px-2 py-1 text-[10px] text-red-500 hover:bg-red-50">Delete Pipeline</button>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {connectFromId && (
                  <span className="rounded border border-yellow-400 bg-yellow-50 px-2 py-1 text-[10px] text-yellow-700">
                    Connecting from: {allNodes.find((n) => n.id === connectFromId)?.title?.slice(0, 15) || connectFromId.slice(0, 8)} — Shift+click target
                    <button onClick={() => setConnectFromId(null)} className="ml-1 text-yellow-500 hover:text-yellow-700">×</button>
                  </span>
                )}
                {selectedTaskIds.length > 0 && (
                  <span className="flex items-center gap-1 rounded border border-indigo-300 bg-indigo-50 px-2 py-1 text-[10px] text-indigo-600">
                    {selectedTaskIds.length} selected
                    <button onClick={deleteSelectedNodes} className="ml-1 text-red-400 hover:text-red-600" title="Delete selected nodes">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                    </button>
                    <button onClick={() => setSelectedTaskIds([])} className="text-slate-400 hover:text-slate-600">×</button>
                  </span>
                )}
                <button onClick={autoLayout} className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-100">Auto Layout</button>
                <button onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)))} className="rounded border border-slate-200 bg-white px-2 py-1 text-xs">+</button>
                <span className="text-[10px] text-slate-500">{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom((z) => Math.max(0.3, +(z - 0.1).toFixed(2)))} className="rounded border border-slate-200 bg-white px-2 py-1 text-xs">-</button>
                <div className="mx-1 h-4 w-px bg-slate-200" />
                {editingPipeline && editingPipeline.id !== 'default' && (
                  <button onClick={() => deletePipeline(editingPipeline)} className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50">
                    Delete Pipeline
                  </button>
                )}
                <button onClick={pipelineRunning ? () => setPipelineRunning(false) : runPipeline} className={`rounded-lg px-4 py-1.5 text-xs font-medium text-white ${pipelineRunning ? 'bg-orange-500 hover:bg-orange-600' : 'bg-indigo-500 hover:bg-indigo-600'}`}>
                  {pipelineRunning ? '⏹ Stop Watching' : '▶ Run Pipeline'}
                </button>
              </div>
            </div>

            {/* main area: palette | canvas | detail */}
            <div className="grid flex-1 grid-cols-[64px_minmax(0,1fr)_320px] gap-0 overflow-hidden 2xl:grid-cols-[80px_minmax(0,1fr)_380px]">

              {/* ── shape & line palette ── */}
              <aside className="flex flex-col items-center gap-1 overflow-y-auto border-r border-slate-200 bg-slate-50 py-3">
                <p className="mb-1 text-[8px] font-bold uppercase tracking-widest text-slate-400">Nodes</p>
                {shapeItems.map((item) => (
                  <div
                    key={item.shape}
                    draggable
                    onDragStart={(e) => { e.dataTransfer.setData('application/wtt-shape', item.shape); e.dataTransfer.effectAllowed = 'copy' }}
                    className="flex cursor-grab flex-col items-center gap-0.5 rounded-lg p-1.5 hover:bg-slate-100 active:cursor-grabbing"
                    title={item.title}
                  >
                    {item.icon}
                    <span className="text-[8px] text-slate-500">{item.label}</span>
                  </div>
                ))}

                <div className="my-1.5 h-px w-10 bg-slate-200" />
                <p className="mb-1 text-[8px] font-bold uppercase tracking-widest text-slate-400">Lines</p>
                {lineItems.map((item) => (
                  <button
                    key={item.style}
                    onClick={() => onLineStyleClick(item.style)}
                    className={`flex w-full flex-col items-center gap-0.5 rounded-lg p-1.5 ${connectLineStyle === item.style ? 'bg-indigo-100 ring-1 ring-indigo-300' : 'hover:bg-slate-100'}`}
                    title={`${item.title}${selectedTaskId ? ' — click to start connecting from selected node' : ''}`}
                  >
                    <svg width="48" height="16" viewBox="0 0 48 16">
                      <line x1="4" y1="8" x2="44" y2="8" stroke="#6b7fa0" strokeWidth="2" strokeDasharray={item.dash} />
                      <polygon points="40,4 48,8 40,12" fill="#6b7fa0" />
                    </svg>
                    <span className="text-[8px] text-slate-500">{item.label}</span>
                  </button>
                ))}

                <div className="my-1.5 h-px w-10 bg-slate-200" />
                <p className="px-1 text-center text-[7px] leading-3 text-slate-400">Drag shapes to canvas</p>
                <p className="px-1 text-center text-[7px] leading-3 text-slate-400">Drag port dot to connect nodes</p>
                <p className="px-1 text-center text-[7px] leading-3 text-slate-400">Or: select node → click line → click target</p>
                <p className="px-1 text-center text-[7px] leading-3 text-slate-400">Scroll to zoom</p>
              </aside>

              {/* ── canvas ── */}
              <main
                ref={canvasRef}
                onMouseMove={onMouseMove}
                onMouseUp={onCanvasMouseUp}
                onMouseLeave={() => { setDraggingId(null); setPanning(false); setDragLine(null) }}
                onMouseDown={(e) => {
                  setContextMenu(null)
                  if ((e.target as HTMLElement).closest('button')) return
                  setPanning(true)
                  setPanStart({ x: e.clientX, y: e.clientY })
                }}
                onDoubleClick={(e) => {
                  if (!canvasRef.current || (e.target as HTMLElement).closest('button')) return
                  const rect = canvasRef.current.getBoundingClientRect()
                  const x = (e.clientX - rect.left - pan.x) / zoom - RECT_W / 2
                  const y = (e.clientY - rect.top - pan.y) / zoom - RECT_H / 2
                  createDraftAt(Math.max(0, x), Math.max(0, y), 'rect')
                }}
                onDragOver={onCanvasDragOver}
                onDrop={onCanvasDrop}
                className="relative overflow-hidden bg-slate-100"
                style={{ cursor: dragLine ? 'crosshair' : connectFromId ? 'crosshair' : panning ? 'grabbing' : draggingId ? 'move' : 'default' }}
              >
                {/* grid background */}
                <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-30">
                  <defs>
                    <pattern id="grid" width={40 * zoom} height={40 * zoom} patternUnits="userSpaceOnUse" x={pan.x % (40 * zoom)} y={pan.y % (40 * zoom)}>
                      <path d={`M ${40 * zoom} 0 L 0 0 0 ${40 * zoom}`} fill="none" stroke="#cbd5e1" strokeWidth="0.5" />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#grid)" />
                </svg>

                <div className="absolute inset-0" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
                  {/* clip path defs for special shapes */}
                  <svg width="0" height="0" style={{ position: 'absolute' }}>
                    <defs>
                      <DiamondClip id="clip-diamond" s={DIAMOND_S} />
                      <HexClip id="clip-hex" w={HEX_W} h={HEX_H} />
                      <ParaClip id="clip-para" w={PARA_W} h={PARA_H} />
                      <marker id="pipe-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
                        <path d="M0,0 L8,4 L0,8 z" fill="#6b7fa0" />
                      </marker>
                      <marker id="pipe-arrow-active" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
                        <path d="M0,0 L8,4 L0,8 z" fill="#6366f1" />
                      </marker>
                      <marker id="pipe-arrow-critical" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
                        <path d="M0,0 L8,4 L0,8 z" fill="#ef4444" />
                      </marker>
                    </defs>
                  </svg>

                  {/* SVG edges */}
                  <svg className="absolute inset-0 h-full w-full" style={{ pointerEvents: 'none' }}>
                    {allEdges.map((edge) => {
                      const fromMeta = positions[edge.depends_on_task_id]
                      const toMeta = positions[edge.task_id]
                      if (!fromMeta || !toMeta) return null
                      const p1 = getAnchor(fromMeta, 'out')
                      const p2 = getAnchor(toMeta, 'in')
                      const dx = Math.max(60, Math.abs(p2.x - p1.x) * 0.4)
                      const path = `M ${p1.x} ${p1.y} C ${p1.x + dx} ${p1.y}, ${p2.x - dx} ${p2.y}, ${p2.x} ${p2.y}`
                      const isActive = selectedTaskId === edge.task_id || selectedTaskId === edge.depends_on_task_id
                      const isCritical = dagAnalysis?.criticalPath.has(edge.task_id) && dagAnalysis?.criticalPath.has(edge.depends_on_task_id)
                      const fromNode = allNodes.find((n) => n.id === edge.depends_on_task_id)
                      const edgeKey = `${edge.depends_on_task_id}->${edge.task_id}`
                      const style = edgeStyles[edgeKey] || 'solid'
                      const edgeColor = isActive ? '#6366f1' : isCritical ? '#ef4444' : '#6b7fa0'
                      const edgeWidth = isActive ? 2.5 : isCritical ? 2.2 : 1.8
                      return (
                        <g key={`e-${edge.task_id}-${edge.depends_on_task_id}`}>
                          <path
                            d={path}
                            fill="none"
                            stroke={edgeColor}
                            strokeWidth={edgeWidth}
                            markerEnd={isActive ? 'url(#pipe-arrow-active)' : isCritical ? 'url(#pipe-arrow-critical)' : 'url(#pipe-arrow)'}
                            className={fromNode?.status === 'doing' ? 'edge-flow' : ''}
                            {...lineStrokeAttrs(style)}
                          />
                          <text x={(p1.x + p2.x) / 2} y={(p1.y + p2.y) / 2 - 8} fill={isActive ? '#6366f1' : '#94a3b8'} fontSize="10" textAnchor="middle">
                            {edge.mode || 'p2p'}
                          </text>
                        </g>
                      )
                    })}
                  </svg>

                  {/* edge delete buttons */}
                  {allEdges.map((edge) => {
                    const fromMeta = positions[edge.depends_on_task_id]
                    const toMeta = positions[edge.task_id]
                    if (!fromMeta || !toMeta) return null
                    const p1 = getAnchor(fromMeta, 'out')
                    const p2 = getAnchor(toMeta, 'in')
                    return (
                      <button
                        key={`del-${edge.task_id}-${edge.depends_on_task_id}`}
                        onClick={() => removeDependency(edge.task_id, edge.depends_on_task_id)}
                        className="absolute rounded border border-red-400/50 bg-red-50 px-1 text-[9px] text-red-500 opacity-0 transition hover:opacity-100"
                        style={{ left: (p1.x + p2.x) / 2 - 8, top: (p1.y + p2.y) / 2 + 4, pointerEvents: 'auto' }}
                        title="Remove edge"
                      >
                        ×
                      </button>
                    )
                  })}

                  {/* nodes */}
                  {allNodes.map((n) => {
                    const meta = positions[n.id] || { x: 30, y: 30, shape: 'rect' as NodeShape }
                    const shape = meta.shape || 'rect'
                    const { w, h } = shapeDims(shape)
                    const isConnecting = connectFromId === n.id
                    const isActive = selectedTaskId === n.id
                    const isMultiSelected = selectedTaskIds.includes(n.id)
                    const isDraftNode = !!draftNodes[n.id]

                    const isSpecial = shape === 'diamond' || shape === 'hexagon' || shape === 'parallelogram'
                    const shapeClass = shape === 'circle' ? 'rounded-full'
                      : shape === 'ellipse' ? 'rounded-[50%]'
                        : isSpecial ? ''
                          : 'rounded-lg'

                    const animClass = n.status === 'doing' ? 'node-doing' : n.status === 'review' ? 'node-review' : n.status === 'blocked' ? 'node-blocked' : ''

                    const bgStyle = meta.color ? { backgroundColor: meta.color } : undefined

                    return (
                      <div key={n.id} className="group/node absolute" style={{ left: meta.x, top: meta.y, width: w, height: h }}>
                        {/* input port (left) */}
                        <div
                          className="absolute z-10 flex h-4 w-4 cursor-crosshair items-center justify-center opacity-0 transition-opacity group-hover/node:opacity-100"
                          style={{ left: -8, top: h / 2 - 8 }}
                          title="Input — drag a line here from another node"
                        >
                          <div className="h-2.5 w-2.5 rounded-full border-2 border-indigo-400 bg-white shadow-sm" />
                        </div>
                        {/* output port (right) — drag from here to connect */}
                        <div
                          className="absolute z-10 flex h-4 w-4 cursor-crosshair items-center justify-center opacity-0 transition-opacity group-hover/node:opacity-100"
                          style={{ right: -8, top: h / 2 - 8 }}
                          title="Output — drag to another node to connect"
                          onMouseDown={(e) => {
                            e.stopPropagation()
                            e.preventDefault()
                            const anchor = getAnchor(meta, 'out')
                            setDragLine({ fromId: n.id, fromX: anchor.x, fromY: anchor.y, toX: anchor.x, toY: anchor.y })
                          }}
                        >
                          <div className="h-2.5 w-2.5 rounded-full border-2 border-indigo-500 bg-indigo-100 shadow-sm" />
                        </div>
                        <button
                          onMouseDown={(e) => {
                            if (e.button === 2) return
                            if (n.id !== selectedTaskId) { setSelectedTaskId(n.id); syncDraftForNode(n.id) }
                            const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
                            setDraggingId(n.id)
                            setDragOffset({ x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom })
                          }}
                          onClick={(e) => onNodeClick(e, n.id)}
                          onContextMenu={(e) => {
                            e.preventDefault()
                            if (n.id !== selectedTaskId) { setSelectedTaskId(n.id); syncDraftForNode(n.id) }
                            setContextMenu({ x: e.clientX, y: e.clientY, nodeId: n.id })
                          }}
                          className={[
                            'h-full w-full text-left shadow-sm transition-shadow',
                            isSpecial ? '' : isDraftNode ? 'border-2 border-dashed' : 'border-2',
                            isSpecial ? '' : shapeClass,
                            isSpecial ? '' : isDraftNode ? 'border-amber-400 bg-amber-50' : statusBorder(n.status),
                            isSpecial || isDraftNode ? '' : statusBg(n.status),
                            animClass,
                            isActive ? 'ring-2 ring-indigo-400 ring-offset-1' : '',
                            isMultiSelected ? 'ring-2 ring-indigo-400/60 ring-offset-1' : '',
                            isConnecting ? 'ring-2 ring-yellow-400' : '',
                            'hover:shadow-md',
                          ].filter(Boolean).join(' ')}
                          style={{ ...(!isSpecial && bgStyle ? bgStyle : {}) }}
                        >
                          {isSpecial && renderShapeOutline(n, meta, w, h)}
                          <div
                            className={`relative flex h-full flex-col ${shape === 'circle' || shape === 'ellipse' ? 'items-center justify-center px-2 text-center' : isSpecial ? 'items-center justify-center px-4 text-center' : 'justify-between p-2.5'}`}
                            style={isSpecial ? { clipPath: shape === 'diamond' ? 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' : undefined } : undefined}
                          >
                            <div className={`flex items-center gap-1.5 ${shape === 'rect' ? '' : 'justify-center'}`}>
                              {isDraftNode ? <span className="rounded bg-amber-200 px-1 text-[8px] font-bold text-amber-700">DRAFT</span> : <div className={`h-2 w-2 flex-shrink-0 rounded-full ${statusDot(n.status)}`} />}
                              <p className={`font-medium leading-tight ${shape === 'rect' ? 'line-clamp-2 text-[12px]' : 'line-clamp-1 text-[10px]'}`}>{n.title}</p>
                              {n.status === 'doing' && <span className="rounded bg-indigo-500 px-1 text-[7px] font-bold text-white">▶ RUN</span>}
                              {n.status === 'done' && <span className="rounded bg-emerald-500 px-1 text-[7px] font-bold text-white">✓</span>}
                            </div>
                            {shape === 'rect' && n.description && (
                              <p className="mt-0.5 line-clamp-2 text-[10px] leading-tight text-slate-500">{n.description}</p>
                            )}
                            {shape === 'rect' && (
                              <div className="flex items-center justify-between">
                                <p className="flex items-center gap-1 text-[9px] text-slate-500">
                                  {n.runner_agent_id && involvedAgents.includes(n.runner_agent_id) && (
                                    <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: agentColor(n.runner_agent_id, involvedAgents) }} />
                                  )}
                                  {n.status}
                                  {dagAnalysis && <span className="text-slate-400">L{dagAnalysis.nodeLevel.get(n.id) ?? '?'}</span>}
                                  · {n.runner_agent_id?.slice(0, 10) || '-'}
                                </p>
                                <div className="flex items-center gap-0.5">
                                  {n.output && <span className="rounded bg-emerald-100 px-0.5 text-[7px] text-emerald-600" title={n.output.slice(0, 200)}>📤</span>}
                                  {dagAnalysis?.criticalPath.has(n.id) && <span className="rounded bg-red-100 px-0.5 text-[7px] text-red-500">CP</span>}
                                  {meta.label && <span className="rounded bg-indigo-100 px-1 text-[8px] text-indigo-600">{meta.label}</span>}
                                </div>
                              </div>
                            )}
                          </div>
                        </button>
                      </div>
                    )
                  })}

                  {/* temporary drag line while connecting */}
                  {dragLine && (
                    <svg className="pointer-events-none absolute inset-0 h-full w-full" style={{ zIndex: 50 }}>
                      <line
                        x1={dragLine.fromX} y1={dragLine.fromY}
                        x2={dragLine.toX} y2={dragLine.toY}
                        stroke="#6366f1" strokeWidth="2" strokeDasharray="6 4"
                        markerEnd="url(#pipe-arrow-active)"
                      />
                      <circle cx={dragLine.toX} cy={dragLine.toY} r="6" fill="#6366f1" fillOpacity="0.3" stroke="#6366f1" strokeWidth="1.5" />
                    </svg>
                  )}
                </div>
                {/* right-click context menu */}
                {contextMenu && (
                  <div
                    className="fixed z-50 rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                    onMouseLeave={() => setContextMenu(null)}
                  >
                    {(() => {
                      const ctxNode = allNodes.find((n) => n.id === contextMenu.nodeId)
                      return (
                        <>
                          <button onClick={() => { setSelectedTaskId(contextMenu.nodeId); setContextMenu(null) }} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-600 hover:bg-slate-100">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                            Edit
                          </button>
                          <button onClick={() => { setSelectedTaskIds((prev) => prev.includes(contextMenu.nodeId) ? prev : [...prev, contextMenu.nodeId]); setContextMenu(null) }} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-600 hover:bg-slate-100">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>
                            Select
                          </button>
                          <button onClick={() => { if (ctxNode) { setSelectedTaskId(ctxNode.id); duplicateTask() }; setContextMenu(null) }} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-600 hover:bg-slate-100">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
                            Duplicate
                          </button>
                          <button onClick={() => { setConnectFromId(contextMenu.nodeId); setContextMenu(null) }} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-600 hover:bg-slate-100">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                            Connect from here
                          </button>
                          <button onClick={() => {
                            const ctxN = allNodes.find((n) => n.id === contextMenu.nodeId)
                            setContextMenu(null)
                            if (ctxN?.topic_id) setShareTarget({ topicId: ctxN.topic_id, name: ctxN.title || ctxN.id })
                          }} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-600 hover:bg-indigo-50">
                            🔗 Share to...
                          </button>
                          <div className="my-1 h-px bg-slate-100" />
                          <button onClick={() => { deleteTask(contextMenu.nodeId); setContextMenu(null) }} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-red-500 hover:bg-red-50">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                            Delete Node
                          </button>
                          {selectedTaskIds.length > 1 && (
                            <button onClick={() => { deleteSelectedNodes(); setContextMenu(null) }} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-red-500 hover:bg-red-50">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
                              Delete Selected ({selectedTaskIds.length})
                            </button>
                          )}
                        </>
                      )
                    })()}
                  </div>
                )}
              </main>

              {/* ── right panel: Chat / Detail dual tab ── */}
              <aside className="flex flex-col overflow-hidden border-l border-slate-200 bg-slate-50">
                {/* tab bar */}
                <div className="flex border-b border-slate-200 bg-white">
                  <button onClick={() => setRightTab('chat')} className={`flex-1 px-3 py-2 text-xs font-medium transition ${rightTab === 'chat' ? 'border-b-2 border-indigo-500 text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>
                    💬 Chat
                  </button>
                  <button onClick={() => setRightTab('detail')} className={`flex-1 px-3 py-2 text-xs font-medium transition ${rightTab === 'detail' ? 'border-b-2 border-indigo-500 text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>
                    📝 Detail {selected ? `· ${selected.title.slice(0, 12)}` : ''}
                  </button>
                </div>

                {/* ─ Chat Tab ─ */}
                {rightTab === 'chat' && (
                  <div className="flex flex-1 flex-col overflow-hidden">
                    {/* Chat target selector */}
                    <div className="flex items-center gap-1 border-b border-slate-200 bg-white px-2 py-1.5">
                      <button
                        onClick={() => setChatTarget('agent')}
                        className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition ${chatTarget === 'agent' ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                      >
                        🤖 Agent
                      </button>
                      {chatTarget === 'agent' && involvedAgents.length > 0 && (
                        <select
                          value={chatAgentId}
                          onChange={(e) => setChatAgentId(e.target.value)}
                          className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-600"
                        >
                          {involvedAgents.map(a => (
                            <option key={a} value={a}>{a.slice(0, 20)}</option>
                          ))}
                        </select>
                      )}
                      {selected && (
                        <button
                          onClick={() => setChatTarget('node')}
                          className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition ${chatTarget === 'node' ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                        >
                          📋 {selected.title.slice(0, 14)}
                        </button>
                      )}
                      {!selected && pipelineTopicId && (
                        <button
                          onClick={() => setChatTarget('node')}
                          className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition ${chatTarget === 'node' ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                        >
                          📋 Pipeline
                        </button>
                      )}
                    </div>
                    {/* DAG summary bar */}
                    {dagAnalysis && chatTarget === 'agent' && (
                      <div className="border-b border-slate-200 bg-white px-3 py-2">
                        <div className="flex items-center gap-2 text-[10px]">
                          <span className="font-medium text-slate-600">DAG</span>
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">{dagAnalysis.maxLevel + 1} levels</span>
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">{dagAnalysis.criticalPath.size} critical</span>
                          {dagAnalysis.hasCycle && <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-600">⚠ Cycle</span>}
                          {dagAnalysis.parallelGroups.length > 0 && (
                            <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-indigo-600">{dagAnalysis.parallelGroups.length} parallel</span>
                          )}
                        </div>
                        {involvedAgents.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {involvedAgents.map(a => {
                              const wl = dagAnalysis.agentWorkload.get(a)
                              const doingCount = wl?.tasks.filter(t => t.status === 'doing').length || 0
                              return (
                                <span key={a} className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium" style={{ backgroundColor: agentBgColor(a, involvedAgents), color: agentColor(a, involvedAgents) }}>
                                  🤖 {a.slice(0, 12)}
                                  <span className="opacity-70">{wl?.tasks.length || 0}t</span>
                                  {doingCount > 0 && <span className="animate-pulse">●</span>}
                                </span>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}
                    {/* messages */}
                    <div className="flex-1 overflow-y-auto px-3 py-2">
                      {!activeChatTopicId && chatMessages.length === 0 ? (
                        <div className="flex h-full flex-col items-center justify-center text-slate-400">
                          {chatTarget === 'agent' ? (
                            <>
                              <p className="text-xs">💬 Chat with {chatAgentId?.slice(0, 16) || selectedAgentId?.slice(0, 16) || 'agent'}</p>
                              <p className="mt-1 text-[10px]">Send a message to start a P2P conversation. The agent can help you create nodes, parse dependencies, and generate the pipeline.</p>
                            </>
                          ) : (
                            <>
                              <p className="text-xs">{selected ? `Chat about ${selected.title}` : 'Pipeline Chat'}</p>
                              <p className="mt-1 text-[10px]">Send a message to start a topic conversation.</p>
                            </>
                          )}
                        </div>
                      ) : chatMessages.length === 0 ? (
                        <div className="flex h-full flex-col items-center justify-center text-slate-400">
                          <p className="text-xs">No messages yet</p>
                          <p className="mt-1 text-[10px]">{chatTarget === 'agent' ? `Send a message to ${selectedAgentId?.slice(0, 16) || 'the agent'}` : 'Start a conversation'}</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {chatMessages.map((m) => {
                            const isMe = m.sender_type === 'HUMAN' || m.sender_id === actorSource(session, selectedAgentId)
                            const hasActions = /```json\s*\{[\s\S]*?"pipeline_actions"/.test(m.content)
                            return (
                              <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] rounded-lg px-3 py-2 text-xs ${isMe ? 'bg-indigo-500 text-white' : 'bg-white text-slate-700 shadow-sm border border-slate-200'}`}>
                                  <p className={`text-[9px] font-medium ${isMe ? 'text-indigo-200' : 'text-slate-400'}`}>{m.sender_id.slice(0, 16)}</p>
                                  <p className="mt-0.5 whitespace-pre-wrap break-words">{m.content.slice(0, 800)}</p>
                                  {hasActions && !isMe && (
                                    <button
                                      onClick={() => parsePipelineActions(m)}
                                      className="mt-1 rounded bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-600 hover:bg-indigo-200"
                                    >
                                      ▶ Apply Pipeline Actions
                                    </button>
                                  )}
                                  {m.created_at && <p className={`mt-1 text-[8px] ${isMe ? 'text-indigo-200' : 'text-slate-400'}`}>{formatTime(m.created_at)}</p>}
                                </div>
                              </div>
                            )
                          })}
                          <div ref={chatEndRef} />
                        </div>
                      )}
                    </div>
                    {/* send box — always enabled */}
                    <div className="border-t border-slate-200 bg-white p-2">
                      <div className="flex gap-1.5">
                        <input
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage() } }}
                          className="flex-1 rounded border border-slate-200 px-2 py-1.5 text-xs focus:border-indigo-400 focus:outline-none"
                          placeholder={chatTarget === 'agent' ? `Chat with ${selectedAgentId?.slice(0, 14) || 'agent'} to generate pipeline...` : selected ? `Message about ${selected.title.slice(0, 14)}...` : 'Pipeline message...'}
                          disabled={chatSending}
                        />
                        <button onClick={sendChatMessage} disabled={chatSending || !chatInput.trim()} className="rounded bg-indigo-500 px-3 py-1.5 text-xs text-white hover:bg-indigo-600 disabled:opacity-40">
                          {chatSending ? '...' : 'Send'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ─ Detail Tab ─ */}
                {rightTab === 'detail' && (
                  <div className="flex-1 overflow-y-auto p-3">
                    {selected ? (
                      <div className="space-y-2.5 text-sm">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-slate-500">Node Detail</p>
                          <div className="flex gap-2">
                            {!isDraft && (selected.status === 'done' || selected.status === 'review' || selected.status === 'blocked') && (
                              <button onClick={() => {
                                const t = prompt('ReRun times (1-10)', '1')
                                if (!t) return
                                const n = Math.max(1, Math.min(10, parseInt(t) || 1))
                                rerunTask(selected.id, n)
                              }} className="text-[10px] text-amber-500 hover:text-amber-700">↻ ReRun</button>
                            )}
                            <button onClick={duplicateTask} className="text-[10px] text-indigo-400 hover:text-indigo-600">Duplicate</button>
                            <button onClick={() => deleteTask(selected.id)} className="text-[10px] text-red-400 hover:text-red-600">Delete</button>
                          </div>
                        </div>

                        <input value={taskDraft.title || ''} onChange={(e) => setTaskDraft((d) => ({ ...d, title: e.target.value }))} className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-sm font-semibold" placeholder="Title" />

                        <div>
                          <label className="text-[9px] text-slate-400">Description</label>
                          <textarea value={taskDraft.description || ''} onChange={(e) => setTaskDraft((d) => ({ ...d, description: e.target.value }))} className="min-h-[200px] w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs leading-relaxed" placeholder="Describe what this node should do, inputs, outputs, acceptance criteria..." />
                        </div>

                        {/* Worker & Model selectors */}
                        <div className="flex gap-2">
                          {/* Worker selector */}
                          <div className="flex-1 relative">
                            <label className="text-[9px] text-slate-400">Worker</label>
                            <button
                              onClick={() => { setWorkerDropOpen(!workerDropOpen); setModelDropOpen(false) }}
                              onBlur={() => setTimeout(() => setWorkerDropOpen(false), 150)}
                              className="flex w-full items-center justify-between rounded border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-600 hover:bg-slate-50"
                            >
                              <span className="truncate">{agentWorkers.find(w => w.id === taskDraft.worker_id)?.name || 'Default (no worker)'}</span>
                              <span className="text-slate-400 ml-1">▾</span>
                            </button>
                            {workerDropOpen && (
                              <div className="absolute top-full left-0 mt-0.5 z-40 w-full max-h-[160px] overflow-y-auto rounded border border-slate-200 bg-white shadow-lg py-0.5">
                                <button
                                  onMouseDown={e => e.preventDefault()}
                                  onClick={() => { setTaskDraft(d => ({ ...d, worker_id: undefined })); setWorkerDropOpen(false) }}
                                  className={`w-full px-2 py-1.5 text-left text-[11px] hover:bg-slate-50 ${!taskDraft.worker_id ? 'text-indigo-600 font-medium' : 'text-slate-600'}`}
                                >
                                  Default (no worker)
                                </button>
                                {agentWorkers.map(w => (
                                  <button
                                    key={w.id}
                                    onMouseDown={e => e.preventDefault()}
                                    onClick={() => { setTaskDraft(d => ({ ...d, worker_id: w.id })); setWorkerDropOpen(false) }}
                                    className={`w-full px-2 py-1.5 text-left text-[11px] hover:bg-slate-50 ${taskDraft.worker_id === w.id ? 'text-indigo-600 font-medium bg-indigo-50' : 'text-slate-600'}`}
                                  >
                                    👷 {w.name}
                                  </button>
                                ))}
                                {agentWorkers.length === 0 && <p className="px-2 py-1 text-[10px] text-slate-400 italic">No workers — add via sidebar</p>}
                              </div>
                            )}
                          </div>

                          {/* Model selector */}
                          <div className="flex-1 relative">
                            <label className="text-[9px] text-slate-400">Model</label>
                            <button
                              onClick={() => { setModelDropOpen(!modelDropOpen); setWorkerDropOpen(false) }}
                              onBlur={() => setTimeout(() => setModelDropOpen(false), 150)}
                              className="flex w-full items-center justify-between rounded border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-600 hover:bg-slate-50"
                            >
                              <span className="truncate">{availableModels.find(m => m.id === taskDraft.model_config?.model)?.label || 'Default'}</span>
                              <span className="text-slate-400 ml-1">▾</span>
                            </button>
                            {modelDropOpen && (
                              <div className="absolute top-full left-0 mt-0.5 z-40 w-full max-h-[200px] overflow-y-auto rounded border border-slate-200 bg-white shadow-lg py-0.5">
                                <button
                                  onMouseDown={e => e.preventDefault()}
                                  onClick={() => { setTaskDraft(d => ({ ...d, model_config: undefined })); setModelDropOpen(false) }}
                                  className={`w-full px-2 py-1.5 text-left text-[11px] hover:bg-slate-50 ${!taskDraft.model_config?.model ? 'text-indigo-600 font-medium' : 'text-slate-600'}`}
                                >
                                  Default
                                </button>
                                {availableModels.map(m => (
                                  <button
                                    key={m.id}
                                    onMouseDown={e => e.preventDefault()}
                                    onClick={() => { setTaskDraft(d => ({ ...d, model_config: { ...d.model_config, model: m.id } })); setModelDropOpen(false) }}
                                    className={`w-full px-2 py-1.5 text-left text-[11px] hover:bg-slate-50 ${taskDraft.model_config?.model === m.id ? 'text-indigo-600 font-medium bg-indigo-50' : 'text-slate-600'}`}
                                  >
                                    🤖 {m.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Reasoning effort selector (if model supports it) */}
                        {taskDraft.model_config?.model && (
                          <div>
                            <label className="text-[9px] text-slate-400">Reasoning Effort</label>
                            <div className="flex rounded border border-slate-200 overflow-hidden mt-0.5">
                              {(['off', 'low', 'medium', 'high'] as const).map(level => (
                                <button
                                  key={level}
                                  onClick={() => setTaskDraft(d => ({ ...d, model_config: { ...d.model_config, reasoning_effort: level } }))}
                                  className={`flex-1 py-1.5 text-[10px] font-medium transition ${
                                    (taskDraft.model_config?.reasoning_effort || 'off') === level
                                      ? 'bg-indigo-50 text-indigo-600'
                                      : 'text-slate-500 hover:bg-slate-50'
                                  }`}
                                >
                                  {level === 'off' ? '💤' : level === 'low' ? '⚡' : level === 'medium' ? '⚖️' : '🧠'} {level.charAt(0).toUpperCase() + level.slice(1)}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Output (read-only for committed tasks) */}
                        {!isDraft && selected.output && (
                          <div className="rounded border border-emerald-200 bg-emerald-50 p-2">
                            <label className="text-[9px] font-medium text-emerald-600">📤 Task Output</label>
                            <p className="mt-1 whitespace-pre-wrap text-[11px] leading-snug text-slate-700">{selected.output}</p>
                          </div>
                        )}

                        {/* Upstream outputs (inputs for this node) */}
                        {(() => {
                          const inEdges = allEdges.filter(e => e.task_id === selected.id)
                          const upOuts = inEdges.map(e => allNodes.find(n => n.id === e.depends_on_task_id)).filter(n => n?.output)
                          if (upOuts.length === 0) return null
                          return (
                            <div className="rounded border border-blue-200 bg-blue-50 p-2">
                              <label className="text-[9px] font-medium text-blue-600">📥 Upstream Outputs (Inputs)</label>
                              {upOuts.map(n => (
                                <div key={n!.id} className="mt-1">
                                  <p className="text-[9px] font-medium text-slate-500">{n!.title}</p>
                                  <p className="whitespace-pre-wrap text-[10px] leading-snug text-slate-600">{n!.output!.slice(0, 500)}</p>
                                </div>
                              ))}
                            </div>
                          )
                        })()}

                        <button onClick={saveTaskDetail} className={`w-full rounded border px-2 py-1.5 text-xs font-medium ${isDraft ? 'border-amber-400 bg-amber-50 text-amber-700 hover:bg-amber-100' : 'border-indigo-300 bg-indigo-50 text-indigo-600 hover:bg-indigo-100'}`}>{isDraft ? '✓ Create Task' : 'Save Node'}</button>

                        {/* dependencies */}
                        <div className="rounded border border-slate-200 bg-white p-2">
                          <p className="mb-1 text-[10px] font-medium text-slate-500">Inbound (depends on)</p>
                          <div className="space-y-1">
                            {allEdges.filter((e) => e.task_id === selected.id).map((e) => {
                              const dep = allNodes.find((n) => n.id === e.depends_on_task_id)
                              const edgeKey = `${e.depends_on_task_id}->${e.task_id}`
                              const style = edgeStyles[edgeKey] || 'solid'
                              return (
                                <div key={`in-${e.depends_on_task_id}`} className="flex items-center justify-between text-[10px]">
                                  <span className="flex items-center gap-1">
                                    <svg width="20" height="8"><line x1="0" y1="4" x2="16" y2="4" stroke="#6b7fa0" strokeWidth="1.5" strokeDasharray={style === 'dashed' ? '4 2' : style === 'dotted' ? '2 2' : ''} /><polygon points="14,1 20,4 14,7" fill="#6b7fa0" /></svg>
                                    {dep?.title?.slice(0, 20) || e.depends_on_task_id.slice(0, 8)} · {e.mode || 'p2p'}
                                  </span>
                                  <button onClick={() => removeDependency(e.task_id, e.depends_on_task_id)} className="text-red-400 hover:text-red-600">×</button>
                                </div>
                              )
                            })}
                            {allEdges.filter((e) => e.task_id === selected.id).length === 0 && <p className="text-[10px] text-slate-400">none (root node)</p>}
                          </div>
                        </div>

                        <div className="rounded border border-slate-200 bg-white p-2">
                          <p className="mb-1 text-[10px] font-medium text-slate-500">Outbound (flows to)</p>
                          <div className="space-y-1">
                            {allEdges.filter((e) => e.depends_on_task_id === selected.id).map((e) => {
                              const target = allNodes.find((n) => n.id === e.task_id)
                              const edgeKey = `${e.depends_on_task_id}->${e.task_id}`
                              const style = edgeStyles[edgeKey] || 'solid'
                              return (
                                <div key={`out-${e.task_id}`} className="flex items-center justify-between text-[10px]">
                                  <span className="flex items-center gap-1">
                                    <svg width="20" height="8"><line x1="0" y1="4" x2="16" y2="4" stroke="#6b7fa0" strokeWidth="1.5" strokeDasharray={style === 'dashed' ? '4 2' : style === 'dotted' ? '2 2' : ''} /><polygon points="14,1 20,4 14,7" fill="#6b7fa0" /></svg>
                                    {target?.title?.slice(0, 20) || e.task_id.slice(0, 8)} · {e.mode || 'p2p'}
                                  </span>
                                  <button onClick={() => removeDependency(e.task_id, e.depends_on_task_id)} className="text-red-400 hover:text-red-600">×</button>
                                </div>
                              )
                            })}
                            {allEdges.filter((e) => e.depends_on_task_id === selected.id).length === 0 && <p className="text-[10px] text-slate-400">none (leaf node)</p>}
                          </div>
                        </div>

                        {/* execution log */}
                        <div className="rounded border border-slate-200 bg-white p-2">
                          <p className="mb-1 text-[10px] font-medium text-slate-500">Execution Log</p>
                          <div className="max-h-32 space-y-1 overflow-auto">
                            {timeline.length > 0 ? timeline.map((m) => (
                              <p key={m.id} className="text-[10px] text-slate-600">
                                <span className="text-slate-400">{m.sender}:</span> {m.content.slice(0, 120)}
                              </p>
                            )) : <p className="text-[10px] text-slate-400">No execution log yet</p>}
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button className="rounded border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-100" onClick={() => router.push(buildAgentUrl('/tasks', selectedAgentId))}>Tasks Board</button>
                          {selected.topic_id && <button className="rounded border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-100" onClick={() => router.push(buildAgentUrl('/feed', selectedAgentId, { topicId: selected.topic_id! }))}>Topic Feed</button>}
                        </div>

                        <p className="text-[9px] text-slate-400">ID: {selected.id}</p>
                      </div>
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center text-slate-400">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-2 opacity-40"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 12h6M12 9v6" /></svg>
                        <p className="text-xs">Select a node to edit</p>
                        <p className="mt-1 text-[10px]">or drag shapes from palette</p>
                      </div>
                    )}
                  </div>
                )}
              </aside>
            </div>

            {/* ── bottom agent status bar ── */}
            {dagAnalysis && involvedAgents.length > 0 && (
              <div className="flex items-center gap-3 border-t border-slate-200 bg-white px-4 py-1.5 text-[10px]">
                <span className="font-medium text-slate-500">Agents:</span>
                {involvedAgents.map(a => {
                  const wl = dagAnalysis.agentWorkload.get(a)
                  const doing = wl?.tasks.filter(t => t.status === 'doing') || []
                  const todo = wl?.tasks.filter(t => t.status === 'todo') || []
                  const done = wl?.tasks.filter(t => t.status === 'done') || []
                  return (
                    <span key={a} className="flex items-center gap-1.5 rounded-full border px-2 py-0.5" style={{ borderColor: agentColor(a, involvedAgents) + '60' }}>
                      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: agentColor(a, involvedAgents) }} />
                      <span className="font-medium" style={{ color: agentColor(a, involvedAgents) }}>{a.slice(0, 14)}</span>
                      {doing.length > 0 && <span className="rounded bg-indigo-100 px-1 text-indigo-600">{doing.length} doing</span>}
                      {todo.length > 0 && <span className="rounded bg-slate-100 px-1 text-slate-500">{todo.length} todo</span>}
                      {done.length > 0 && <span className="rounded bg-green-100 px-1 text-green-600">{done.length} done</span>}
                    </span>
                  )
                })}
                {dagAnalysis.agentWorkload.has('unassigned') && (
                  <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-yellow-700">
                    ⚠ {dagAnalysis.agentWorkload.get('unassigned')!.tasks.length} unassigned
                  </span>
                )}
              </div>
            )}
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
          border-color: #6366f1 !important;
          background-color: #eef2ff !important;
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

      {shareTarget && (
        <ShareDialog
          open={!!shareTarget}
          onClose={() => setShareTarget(null)}
          topicId={shareTarget.topicId}
          agentId={selectedAgentId}
          topicName={shareTarget.name}
        />
      )}
    </WttShellV2>
  )
}
