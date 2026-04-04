'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { CLIENT_WTT_API_BASE, WS_BASE_URL } from '@/lib/api/base-url'
import { WttShellV2 } from '@/components/ui/wtt-shell-v2'
import { normalizeAndFilterAgents } from '@/lib/agents'
import { ChatFileUpload, FileAttachmentPreview, stripFileTokens, PendingAttachments } from '@/components/ui/chat-file-upload'
import { useWebSocket, type WsMessage } from '@/lib/useWebSocket'
import type { AgentSubAgentMap, AgentStatsMap } from '@/components/ui/agent-column'
import { ShareDialog } from '@/components/ui/share-dialog'
import { useAgentId, buildAgentUrl } from '@/lib/hooks/use-agent-id'
import { useI18n } from '@/lib/i18n-provider'

interface Agent {
  id: string
  agent_id: string
  display_name: string
  is_primary: boolean
  api_key?: string
}

interface TaskItem {
  id: string
  title: string
  description?: string
  task_type: string
  task_mode?: string
  pipeline_id?: string
  priority: 'P0' | 'P1' | 'P2' | 'P3'
  status: 'todo' | 'doing' | 'review' | 'done' | 'blocked'
  owner_agent_id?: string
  runner_agent_id?: string
  created_by?: string
  topic_id?: string
  acceptance?: string
  exec_mode?: string
  due_at?: string
  estimate_hours?: number
  dependencies?: string
  notes?: string
  created_at?: string
  started_at?: string
  completed_at?: string
  updated_at?: string
}

const columns: Array<TaskItem['status']> = ['todo', 'doing', 'review', 'done', 'blocked']
const pieColors = ['#6366f1', '#52d1a8', '#ffd166', '#f78c6b', '#c792ea', '#7fd1f5', '#f5b4e6', '#9be564']

const toMs = (value?: string) => {
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : null
}

const formatDuration = (ms: number) => {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSec / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

const formatTokens = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

const arcPath = (cx: number, cy: number, r: number, start: number, end: number) => {
  const x1 = cx + r * Math.cos(start)
  const y1 = cy + r * Math.sin(start)
  const x2 = cx + r * Math.cos(end)
  const y2 = cy + r * Math.sin(end)
  const largeArc = end - start > Math.PI ? 1 : 0
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`
}


const actorSource = (session: unknown) => {
  const s = session as { userId?: string; user?: { name?: string | null; email?: string | null } } | null | undefined
  const uid = s?.userId || ''
  return s?.user?.name || s?.user?.email || (uid ? `user_${uid.slice(0, 8)}` : 'user_default')
}

const fallbackProgressByStatus = (status: TaskItem['status']) => {
  if (status === 'done') return 100
  if (status === 'review') return 90
  if (status === 'doing') return 12
  if (status === 'blocked') return 0
  return 0
}

export default function TasksPageWrapper() {
  return <Suspense fallback={null}><TasksPageInner /></Suspense>
}

function TasksPageInner() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { t } = useI18n()
  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgentId, setSelectedAgentId] = useAgentId()
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null)
  const [taskDraft, setTaskDraft] = useState<Partial<TaskItem>>({})
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null)
  const [taskContextMenu, setTaskContextMenu] = useState<{ x: number; y: number; task: TaskItem } | null>(null)
  const [shareTarget, setShareTarget] = useState<{ topicId: string; name: string } | null>(null)
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([])
  const [nowTs, setNowTs] = useState(Date.now())
  const [showNewTaskModal, setShowNewTaskModal] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskType, setNewTaskType] = useState<'code' | 'research' | 'common'>('common')
  const [newTaskAgentId, setNewTaskAgentId] = useState('')
  const [panelInput, setPanelInput] = useState('')
  const [panelSending, setPanelSending] = useState(false)
  const panelSendingRef = useRef(false)
  const [pendingAttachments, setPendingAttachments] = useState<string[]>([])
  const [queueIndicator, setQueueIndicator] = useState(false)
  const [panelAwaitingInference, setPanelAwaitingInference] = useState(false)
  const [lastPanelUserSendAt, setLastPanelUserSendAt] = useState<string | null>(null)
  const [taskTypeFilter, setTaskTypeFilter] = useState<'all' | 'general' | 'research' | 'code' | 'pipeline'>('all')
  const [kbLoading, setKbLoading] = useState(false)
  const chatScrollRef = useRef<HTMLDivElement>(null)

  const statusLabel = useCallback((status: TaskItem['status']) => {
    switch (status) {
      case 'todo':
        return t('chat.statusTodo')
      case 'doing':
        return t('chat.statusDoing')
      case 'review':
        return t('chat.statusReview')
      case 'done':
        return t('chat.statusDone')
      case 'blocked':
        return t('chat.statusBlocked')
      default:
        return status
    }
  }, [t])

  const loadAgents = useCallback(async () => {
    const response = await fetch(`${CLIENT_WTT_API_BASE}/agents/my`, {
      headers: { Authorization: `Bearer ${session?.accessToken ?? ''}` },
    })
    if (!response.ok) return
    const data = await response.json()
    const list = normalizeAndFilterAgents(data)
    setAgents(list)
    if (!selectedAgentId && list[0]) setSelectedAgentId(list[0].agent_id)
  }, [session?.accessToken, selectedAgentId])

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
      return
    }
    if (status === 'authenticated') loadAgents()
  }, [status, router, loadAgents])

  useEffect(() => {
    const timer = setInterval(() => setNowTs(Date.now()), 5000)
    return () => clearInterval(timer)
  }, [])

  const { data: subscribedTopicsRaw, mutate: mutateSubscribedTopics } = useSWR(
    selectedAgentId && session?.accessToken ? ['subscribed', selectedAgentId, session.accessToken] : null,
    async () => {
      const response = await fetch(`${CLIENT_WTT_API_BASE}/topics/subscribed?agent_id=${selectedAgentId}`, {
        headers: { Authorization: `Bearer ${session?.accessToken}` },
      })
      if (!response.ok) return []
      return response.json()
    }
  )

  const { data: tasksRaw, mutate: mutateTasks } = useSWR(
    selectedAgentId && session?.accessToken ? ['tasks', selectedAgentId, session.accessToken] : null,
    async () => {
      const response = await fetch(`${CLIENT_WTT_API_BASE}/tasks?owner_agent_id=${encodeURIComponent(selectedAgentId)}&limit=500`, {
        headers: { Authorization: `Bearer ${session?.accessToken}` },
      })
      if (!response.ok) throw new Error('Failed to load tasks')
      return response.json()
    },
    { refreshInterval: 5000 }
  )

  const tasks: TaskItem[] = useMemo(() => (Array.isArray(tasksRaw) ? tasksRaw : []), [tasksRaw])

  /* ─── WebSocket for real-time task status updates ─── */
  const wsUrl = selectedAgentId ? `${WS_BASE_URL}/ws/${selectedAgentId}` : ''
  const handleWsTaskStatus = useCallback(
    (msg: WsMessage) => {
      if (msg.type === 'task_status') {
        mutateTasks()
      }
    },
    [mutateTasks],
  )
  useWebSocket({
    url: wsUrl,
    enabled: !!selectedAgentId,
    token: session?.accessToken || undefined,
    onMessage: handleWsTaskStatus,
  })

  // Task panel should reflect owner-scoped task truth, independent of topic subscription state.
  const visibleTasks: TaskItem[] = useMemo(
    () => tasks.filter((t) => {
      // Pipeline filter (mode-based)
      if (taskTypeFilter === 'pipeline') return (t.task_mode || 'single') === 'pipeline'
      // Type filter
      if (taskTypeFilter === 'all') return true
      if (taskTypeFilter === 'general') return !t.task_type || t.task_type === 'general' || t.task_type === 'feature' || t.task_type === 'common'
      return t.task_type === taskTypeFilter
    }),
    [tasks, taskTypeFilter]
  )

  // Worker (sub-agent) grouping — same as feed page
  const agentSubAgents = useMemo<AgentSubAgentMap>(() => {
    const map: AgentSubAgentMap = {}
    for (const t of tasks) {
      const aid = t.owner_agent_id || t.runner_agent_id
      if (!aid) continue
      if (!map[aid]) map[aid] = []
      map[aid].push({ id: t.id, title: t.title || 'Untitled', task_type: t.task_type || 'general', status: t.status || 'todo' })
    }
    return map
  }, [tasks])

  // Agent stats from backend
  const { data: statsData } = useSWR(
    session?.accessToken ? `${CLIENT_WTT_API_BASE}/agents/stats` : null,
    async (url: string) => {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${session?.accessToken}` } })
      if (!r.ok) return null
      return r.json()
    },
    { refreshInterval: 30_000 }
  )
  const agentStats = useMemo<AgentStatsMap>(() => statsData?.agents ?? {}, [statsData])
  const onlineAgentIds = useMemo(() => {
    const arr: string[] = statsData?.online_agents ?? []
    return new Set(arr)
  }, [statsData])
  const maxSubAgents = statsData?.max_sub_agents ?? 20

  const { data: progressRaw } = useSWR(
    session?.accessToken && selectedAgentId ? ['tasks-progress', selectedAgentId, session.accessToken] : null,
    async () => {
      const response = await fetch(`${CLIENT_WTT_API_BASE}/tasks/progress?owner_agent_id=${encodeURIComponent(selectedAgentId)}`, {
        headers: { Authorization: `Bearer ${session?.accessToken}` },
      })
      if (!response.ok) return {}
      return response.json()
    },
    { refreshInterval: 5000 }
  )

  // Token consumption stats per task — scoped to selected agent
  const { data: tokenStatsRaw } = useSWR(
    session?.accessToken && selectedAgentId ? ['tasks-token-stats', selectedAgentId, session.accessToken] : null,
    async () => {
      const response = await fetch(`${CLIENT_WTT_API_BASE}/tasks/token-stats?owner_agent_id=${encodeURIComponent(selectedAgentId)}`, {
        headers: { Authorization: `Bearer ${session?.accessToken}` },
      })
      if (!response.ok) return {}
      return response.json()
    },
    { refreshInterval: 30_000 }
  )
  const tokenStats = useMemo<Record<string, { total_chars: number; estimated_tokens: number; message_count: number }>>(() => {
    if (!tokenStatsRaw || typeof tokenStatsRaw !== 'object') return {}
    return tokenStatsRaw as Record<string, { total_chars: number; estimated_tokens: number; message_count: number }>
  }, [tokenStatsRaw])

  const { data: timelineRaw } = useSWR(
    selectedTask?.topic_id && session?.accessToken ? ['task-timeline', selectedTask.topic_id, session.accessToken, selectedAgentId] : null,
    async () => {
      const agentQuery = selectedAgentId ? `&agent_id=${encodeURIComponent(selectedAgentId)}` : ''
      const response = await fetch(`${CLIENT_WTT_API_BASE}/topics/${selectedTask?.topic_id}/messages?limit=500${agentQuery}`, {
        headers: { Authorization: `Bearer ${session?.accessToken}` },
      })
      if (!response.ok) return []
      return response.json()
    },
    { refreshInterval: 5000 }
  )

  const timeline = useMemo(() => {
    const rows = Array.isArray(timelineRaw)
      ? timelineRaw
      : Array.isArray((timelineRaw as { messages?: unknown[] })?.messages)
        ? ((timelineRaw as { messages: unknown[] }).messages || [])
        : []
    return rows
      .map((x) => x as Record<string, unknown>)
      .map((x) => {
        const content = String(x.content || '')
        let kind: 'reasoned' | 'review' | 'normal' = 'normal'
        if (content.includes('[AUTO-REASONED]')) kind = 'reasoned'
        else if (content.includes('[TASK_REVIEW]')) kind = 'review'
        return {
          id: String(x.id || x.message_id || ''),
          sender: String(x.sender_id || 'unknown'),
          sender_type: String(x.sender_type || 'agent'),
          content,
          created_at: String(x.created_at || x.timestamp || ''),
          kind,
        }
      })
      .filter((x) => x.content)
  }, [timelineRaw])

  useEffect(() => {
    if (selectedTask) {
      const fresh = visibleTasks.find((t) => t.id === selectedTask.id)
      if (!fresh) {
        setSelectedTask(null)
        setTaskDraft({})
        return
      }
      setSelectedTask(fresh)
      setTaskDraft(fresh)
    }
  }, [visibleTasks, selectedTask])

  useEffect(() => {
    const taskSet = new Set(visibleTasks.map((t) => t.id))
    setSelectedTaskIds((prev) => prev.filter((id) => taskSet.has(id)))
  }, [visibleTasks])

  useEffect(() => {
    if (!taskContextMenu) return
    const onClose = () => setTaskContextMenu(null)
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTaskContextMenu(null)
    }
    window.addEventListener('click', onClose)
    window.addEventListener('contextmenu', onClose)
    window.addEventListener('keydown', onEsc)
    return () => {
      window.removeEventListener('click', onClose)
      window.removeEventListener('contextmenu', onClose)
      window.removeEventListener('keydown', onEsc)
    }
  }, [taskContextMenu])

  const grouped = useMemo(() => {
    const map: Record<string, TaskItem[]> = { todo: [], doing: [], review: [], done: [], blocked: [] }
    for (const t of visibleTasks) {
      if (t.status in map) map[t.status].push(t)
    }
    return map
  }, [visibleTasks])

  const taskDurationSummary = useMemo(() => {
    const now = Date.now()
    const rows = visibleTasks
      .map((task) => {
        // Only count doing→review time: started_at (entering doing) to completed_at (entering review)
        const start = toMs(task.started_at)
        if (!start) return null
        const end = toMs(task.completed_at) ?? (task.status === 'doing' ? now : null)
        if (!end) return null
        const durationMs = Math.max(0, end - start)
        return {
          id: task.id,
          title: task.title,
          status: task.status,
          durationMs,
        }
      })
      .filter((x): x is { id: string; title: string; status: TaskItem['status']; durationMs: number } => {
        if (!x) return false
        return x.durationMs > 0
      })
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, 8)

    const totalMs = rows.reduce((sum, item) => sum + item.durationMs, 0)
    let startAngle = -Math.PI / 2
    const slices = rows.map((item, index) => {
      const ratio = totalMs > 0 ? item.durationMs / totalMs : 0
      const endAngle = startAngle + ratio * Math.PI * 2
      const slice = {
        ...item,
        color: pieColors[index % pieColors.length],
        ratio,
        path: arcPath(60, 60, 52, startAngle, endAngle),
      }
      startAngle = endAngle
      return slice
    })

    return { totalMs, slices }
  }, [visibleTasks])

  const taskProgressMap = useMemo(() => {
    const map: Record<string, number> = {}

    if (progressRaw && typeof progressRaw === 'object') {
      for (const [taskId, value] of Object.entries(progressRaw as Record<string, unknown>)) {
        const p = Number(value)
        if (!Number.isFinite(p)) continue
        map[taskId] = Math.min(100, Math.max(0, p))
      }
    }

    for (const task of visibleTasks) {
      if (task.status === 'done') {
        map[task.id] = 100
        continue
      }
      if (map[task.id] === undefined) {
        map[task.id] = fallbackProgressByStatus(task.status)
      }
    }

    return map
  }, [visibleTasks, progressRaw])

  const topics = useMemo(() => {
    const topicMap = new Map<string, { topic_id: string; name: string; topic_type: 'broadcast' | 'discussion' | 'p2p' | 'collaborative'; unread_count: number; can_delete: boolean; is_default_p2p?: boolean }>()
    const human = actorSource(session)

    // 1. Add subscribed topics
    if (Array.isArray(subscribedTopicsRaw)) {
      for (const topic of subscribedTopicsRaw as { id: string; name: string; type?: string; my_role?: string }[]) {
        let displayName = topic.name
        const taskPrefixMatch = displayName.match(/^TASK-[a-f0-9]{8}\s+(.+)$/i)
        if (taskPrefixMatch) displayName = taskPrefixMatch[1]
        const topicType = (topic.type || 'discussion') as 'broadcast' | 'discussion' | 'p2p' | 'collaborative'
        const isDefaultP2P = topicType === 'p2p' && !!selectedAgentId && displayName.includes(selectedAgentId) && displayName.includes(human)
        topicMap.set(topic.id, {
          topic_id: topic.id,
          name: displayName,
          topic_type: topicType,
          unread_count: 0,
          can_delete: topic.my_role === 'owner' || topic.my_role === 'admin',
          is_default_p2p: isDefaultP2P,
        })
      }
    }

    return Array.from(topicMap.values())
  }, [subscribedTopicsRaw, selectedAgentId, session])

  const agentItems = useMemo(() => {
    return agents.map((a) => ({ agent_id: a.agent_id, display_name: a.display_name, unread_count: 0 }))
  }, [agents])

  const createTask = async () => {
    const title = newTaskTitle.trim()
    if (!title) return
    if (!newTaskAgentId) {
      alert(t('tasks.pickAgentFirst'))
      return
    }
    setShowNewTaskModal(false)
    setNewTaskTitle('')

    const taskType = newTaskType === 'code' ? 'code' : newTaskType === 'research' ? 'research' : 'feature'
    const tempId = `temp-${Date.now()}`
    const optimistic: TaskItem = {
      id: tempId,
      title,
      task_type: taskType,
      priority: 'P1',
      status: 'todo',
      exec_mode: 'reasoning',
      owner_agent_id: newTaskAgentId || undefined,
      runner_agent_id: newTaskAgentId || undefined,
    }
    mutateTasks((prev: TaskItem[] | undefined) => [...(prev || []), optimistic], { revalidate: false })
    try {
      const resp = await fetch(`${CLIENT_WTT_API_BASE}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.accessToken ?? ''}`,
        },
        body: JSON.stringify({
          title,
          task_mode: 'single',
          priority: 'P1',
          status: 'todo',
          task_type: taskType,
          exec_mode: 'reasoning',
          owner_agent_id: newTaskAgentId || undefined,
          runner_agent_id: newTaskAgentId || undefined,
          created_by: actorSource(session),
        }),
      })
      if (resp.ok) {
        const real = await resp.json()
        mutateTasks((prev: TaskItem[] | undefined) => (prev || []).map((t) => (t.id === tempId ? { ...t, ...real } : t)), { revalidate: false })

        // Navigate to the appropriate task page
        if (newTaskType === 'code') {
          router.push(buildAgentUrl(`/tasks/code/${real.id}`, selectedAgentId))
        } else if (newTaskType === 'research') {
          router.push(buildAgentUrl(`/tasks/research/${real.id}`, selectedAgentId))
        }
      } else {
        mutateTasks()
      }
    } catch {
      mutateTasks()
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const moveStatus = async (task: TaskItem, status: TaskItem['status']) => {
    await fetch(`${CLIENT_WTT_API_BASE}/tasks/${task.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.accessToken ?? ''}`,
      },
      body: JSON.stringify({ status }),
    })
    mutateTasks()
  }

  const cancelTask = async (task: TaskItem) => {
    const ok = window.confirm(t('tasks.cancelTaskConfirm', { title: task.title }))
    if (!ok) return

    const actingAgent = task.owner_agent_id || selectedAgentId
    const response = await fetch(
      `${CLIENT_WTT_API_BASE}/tasks/${task.id}?acting_as_agent_id=${encodeURIComponent(actingAgent)}&delete_topic=true`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session?.accessToken ?? ''}` },
      }
    )

    if (!response.ok) {
      const txt = await response.text()
      try {
        const detail = JSON.parse(txt)?.detail || txt
        alert(t('tasks.cancelTaskFailed', { detail }))
      } catch { alert(t('tasks.cancelTaskFailed', { detail: txt || response.status })) }
      return
    }

    if (selectedTask?.id === task.id) {
      setSelectedTask(null)
      setTaskDraft({})
    }

    setTaskContextMenu(null)
    // Optimistically remove from list immediately
    mutateTasks((prev: TaskItem[] | undefined) => (prev || []).filter(t => t.id !== task.id), { revalidate: true })
    await mutateSubscribedTopics()
  }

  const bulkRunTasks = async () => {
    if (!selectedTaskIds.length) return alert(t('tasks.selectTasksFirst'))
    const targets = tasks.filter((t) => selectedTaskIds.includes(t.id))
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.accessToken ?? ''}`,
    }
    const results = await Promise.allSettled(
      targets.map((t) =>
        fetch(`${CLIENT_WTT_API_BASE}/tasks/${t.id}/run`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            trigger_agent_id: actorSource(session) || 'task-runner',
            runner_agent_id: t.runner_agent_id || t.owner_agent_id || selectedAgentId,
          }),
        })
      )
    )
    const ok = results.filter((r) => r.status === 'fulfilled' && r.value.ok).length
    alert(t('tasks.bulkRunDone', { ok, total: targets.length }))
    await mutateTasks()
  }

  const bulkCancelTasks = async () => {
    if (!selectedTaskIds.length) return alert(t('tasks.selectTasksFirst'))
    if (!confirm(t('tasks.bulkCancelConfirm', { count: selectedTaskIds.length }))) return
    const headers = { Authorization: `Bearer ${session?.accessToken ?? ''}` }
    const results = await Promise.allSettled(
      selectedTaskIds.map((id) => {
        const task = tasks.find(t => t.id === id)
        const actingAgent = task?.owner_agent_id || selectedAgentId
        return fetch(`${CLIENT_WTT_API_BASE}/tasks/${id}?acting_as_agent_id=${encodeURIComponent(actingAgent)}&delete_topic=true`, {
          method: 'DELETE',
          headers,
        })
      })
    )
    const ok = results.filter((r) => r.status === 'fulfilled' && r.value.ok).length
    const deletedIds = new Set(selectedTaskIds)
    setSelectedTaskIds([])
    mutateTasks((prev: TaskItem[] | undefined) => (prev || []).filter(t => !deletedIds.has(t.id)), { revalidate: true })
    await mutateSubscribedTopics()
    alert(t('tasks.bulkCancelDone', { ok, total: results.length }))
  }

  const leaveTopicFromSidebar = async (topicId: string) => {
    if (!confirm(t('tasks.leaveTopicConfirm'))) return

    const response = await fetch(`${CLIENT_WTT_API_BASE}/topics/${topicId}/leave?agent_id=${encodeURIComponent(selectedAgentId)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session?.accessToken ?? ''}` },
    })

    if (!response.ok) {
      const txt = await response.text()
      alert(t('tasks.leaveTopicFailed', { detail: txt || response.status }))
      return
    }

    await mutateSubscribedTopics()
  }

  const deleteTopicFromSidebar = async (topicId: string) => {
    if (!confirm(t('tasks.deleteTopicConfirm'))) return

    const response = await fetch(`${CLIENT_WTT_API_BASE}/topics/${topicId}?agent_id=${encodeURIComponent(selectedAgentId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session?.accessToken ?? ''}` },
    })

    if (!response.ok) {
      const txt = await response.text()
      try {
        const detail = JSON.parse(txt)?.detail || txt
        alert(t('tasks.deleteTopicFailed', { detail }))
      } catch { alert(t('tasks.deleteTopicFailed', { detail: txt || response.status })) }
      return
    }

    await mutateSubscribedTopics()
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const assignCurrent = async (agentId: string) => {
    if (!selectedTask) return
    await fetch(`${CLIENT_WTT_API_BASE}/tasks/${selectedTask.id}/assign?agent_id=${encodeURIComponent(agentId)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session?.accessToken ?? ''}` },
    })
    mutateTasks()
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const runCurrent = async () => {
    if (!selectedTask) return
    setRunningTaskId(selectedTask.id)

    // Optimistic: show "doing" immediately
    mutateTasks(
      (prev: TaskItem[] | undefined) =>
        (prev || []).map((t) => (t.id === selectedTask.id ? { ...t, status: 'doing' as const } : t)),
      { revalidate: false },
    )

    try {
      const resp = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${selectedTask.id}/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.accessToken ?? ''}`,
        },
        body: JSON.stringify({
          trigger_agent_id: actorSource(session) || 'task-runner',
          runner_agent_id: selectedTask.runner_agent_id || selectedTask.owner_agent_id || selectedAgentId,
          exec_mode: selectedTask.exec_mode || 'reasoning',
        }),
      })
      if (!resp.ok) {
        const txt = await resp.text()
        alert(t('tasks.runFailed', { detail: txt || resp.status }))
        mutateTasks()
        return
      }
    } catch (e) {
      alert(t('tasks.runFailed', { detail: e instanceof Error ? e.message : 'unknown error' }))
      mutateTasks()
    } finally {
      setRunningTaskId(null)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const reviewCurrent = async (action: 'approve' | 'reject' | 'block') => {
    if (!selectedTask) return

    if (action === 'reject') {
      // Reject: post a plain message to the task topic feed
      const input = window.prompt(t('tasks.rejectPrompt'), '')
      if (input === null || !input.trim()) return
      if (selectedTask.topic_id) {
        await fetch(`${CLIENT_WTT_API_BASE}/topics/${selectedTask.topic_id}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.accessToken ?? ''}`,
          },
          body: JSON.stringify({
            sender_id: actorSource(session),
            sender_type: 'HUMAN',
            content: input.trim(),
            content_type: 'text',
            semantic_type: 'reply',
          }),
        })
      }
      mutateTasks()
      return
    }

    await fetch(`${CLIENT_WTT_API_BASE}/tasks/${selectedTask.id}/review`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.accessToken ?? ''}`,
      },
      body: JSON.stringify({ action, reviewer: actorSource(session), comment: '' }),
    })
    mutateTasks()
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const saveTaskDetails = async () => {
    if (!selectedTask) return
    await fetch(`${CLIENT_WTT_API_BASE}/tasks/${selectedTask.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.accessToken ?? ''}`,
      },
      body: JSON.stringify({
        description: taskDraft.description || null,
        acceptance: taskDraft.acceptance || null,
        runner_agent_id: taskDraft.runner_agent_id || null,
        exec_mode: taskDraft.exec_mode || null,
        due_at: taskDraft.due_at || null,
        estimate_hours: taskDraft.estimate_hours ?? null,
        dependencies: taskDraft.dependencies || null,
        notes: taskDraft.notes || null,
      }),
    })
    mutateTasks()
  }

  const sendPanelMessage = async () => {
    const attachmentText = pendingAttachments.join('\n')
    if (!selectedTask || (!panelInput.trim() && !attachmentText)) return
    if (panelSendingRef.current) return
    const text = panelInput.trim()
    setPanelInput('')
    setPendingAttachments([])
    panelSendingRef.current = true
    setPanelSending(true)

    const isUser = true
    const agentId = selectedAgentId || 'user'
    const senderType = 'HUMAN'
    const senderId = actorSource(session)
    if (panelAwaitingInference) {
      setQueueIndicator(true)
    }
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.accessToken ?? ''}`,
    }

    try {
      const fullContent = attachmentText ? `${attachmentText}\n\n${text}` : text
      // User sends always go through task chat API:
      // - todo => auto_run=true (todo->doing)
      // - doing/review/done => auto_run=false (no rerun task)
      if (isUser) {
        const autoRun = selectedTask.status === 'todo'
        const resp = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${selectedTask.id}/chat/send`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            content: fullContent,
            sender_type: 'HUMAN',
            sender_id: senderId,
            semantic_type: 'reply',
            auto_run: autoRun,
          }),
        })
        if (!resp.ok) {
          const err = await resp.text().catch(() => '')
          throw new Error(`send failed: ${resp.status} ${err}`)
        }
      } else if (selectedTask.topic_id) {
        const url = `${CLIENT_WTT_API_BASE}/topics/${selectedTask.topic_id}/messages?agent_id=${encodeURIComponent(agentId)}`
        const resp = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            sender_id: senderId,
            sender_type: senderType,
            content: fullContent,
            content_type: 'text',
            semantic_type: 'reply',
          }),
        })
        if (!resp.ok) {
          const err = await resp.text().catch(() => '')
          throw new Error(`send failed: ${resp.status} ${err}`)
        }
      }

      if (isUser) {
        setPanelAwaitingInference(true)
        setLastPanelUserSendAt(new Date().toISOString())
      }

      // If already waiting for a prior inference, show queued hint persistently
      if (panelAwaitingInference) {
        setQueueIndicator(true)
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'send failed')
    } finally {
      panelSendingRef.current = false
      setPanelSending(false)
      await mutateTasks()
    }
  }

  // Scroll chat to bottom when timeline changes
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
    }
  }, [timeline])

  // Clear queued/awaiting states once agent has replied after latest user send
  useEffect(() => {
    if (!panelAwaitingInference || !lastPanelUserSendAt) return
    const sentAt = Date.parse(lastPanelUserSendAt)
    if (!Number.isFinite(sentAt)) return
    const hasAgentReply = timeline.some((item) => {
      if ((item.sender_type || '').toUpperCase() !== 'AGENT') return false
      const t = Date.parse(item.created_at || '')
      if (!(Number.isFinite(t) && t > sentAt)) return false
      const content = String(item.content || '')
      // "Agent thinking..." should NOT be treated as final reply
      if (content.includes('Agent thinking')) return false
      return true
    })
    if (hasAgentReply) {
      setPanelAwaitingInference(false)
      setQueueIndicator(false)
    }
  }, [timeline, panelAwaitingInference, lastPanelUserSendAt])

  // Reset queue state when switching tasks
  useEffect(() => {
    setPanelAwaitingInference(false)
    setLastPanelUserSendAt(null)
    setQueueIndicator(false)
  }, [selectedTask?.id])

  const taskCardTone = (status: TaskItem['status']) => {
    if (status === 'doing') return 'border-indigo-300 bg-indigo-50'
    if (status === 'review') return 'border-yellow-500/40 bg-amber-50'
    if (status === 'done') return 'border-green-500/40 bg-emerald-50'
    if (status === 'blocked') return 'border-red-500/40 bg-red-50'
    return 'border-slate-200 bg-slate-50'
  }

  const progressBarTone = (status: TaskItem['status']) => {
    if (status === 'done') return 'bg-green-400'
    if (status === 'review') return 'bg-yellow-400 animate-pulse'
    if (status === 'blocked') return 'bg-red-400'
    if (status === 'doing') return 'task-progress-flow bg-indigo-500'
    return 'bg-indigo-500'
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const taskTickerText = (task: TaskItem) => {
    const progress = Math.round(taskProgressMap[task.id] ?? 0)
    const statusText = task.status.toUpperCase()
    const start = toMs(task.started_at) ?? toMs(task.created_at)
    const elapsed = start ? formatDuration(Math.max(0, nowTs - start)) : '--'
    const updated = task.updated_at ? task.updated_at.replace('T', ' ').slice(0, 16) : '--'
    return `状态 ${statusText} · 进度 ${progress}% · 已运行 ${elapsed} · 最近更新 ${updated}`
  }

  return (
    <WttShellV2
      agents={agentItems}
      selectedAgentId={selectedAgentId}
      onAgentChange={(id) => { setSelectedAgentId(id); setSelectedTask(null) }}
      topics={topics}
      selectedTopicId={null}
      onTopicChange={(topicId) => router.push(buildAgentUrl('/feed', selectedAgentId, topicId ? { topicId } : undefined))}
      onLeaveTopic={leaveTopicFromSidebar}
      onDeleteTopic={deleteTopicFromSidebar}
      onTopicsRefresh={() => mutateSubscribedTopics()}
      onLogout={() => signOut({ callbackUrl: '/login' })}
      currentUserName={actorSource(session)}
      agentSubAgents={agentSubAgents}
      maxSubAgents={maxSubAgents}
      agentStats={agentStats}
      onlineAgentIds={onlineAgentIds}
      userToken={session?.accessToken as string | undefined}
      hideTopics
      hideCreateTopic
    >
      <div className="h-full p-4 text-slate-800">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t('tasks.title')}</h1>
            <p className="text-xs text-slate-500">{t('tasks.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={bulkRunTasks} className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm text-indigo-500">{t('tasks.bulkRun')}</button>
            <button onClick={bulkCancelTasks} className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-600">{t('tasks.bulkCancel')}</button>
            <button onClick={() => { setNewTaskAgentId(''); setShowNewTaskModal(true) }} className="rounded-lg bg-indigo-500 px-3 py-2 text-sm text-white">+ {t('tasks.newTask')}</button>
          </div>
        </div>

        {/* Task type filter tabs (unified: type + pipeline) */}
        <div className="mb-3 flex items-center gap-1">
          {([
            ['all', `📋 ${t('tasks.filterAll')}`],
            ['general', `💬 ${t('tasks.filterGeneral')}`],
            ['code', `💻 ${t('tasks.filterCode')}`],
            ['research', `📄 ${t('tasks.filterResearch')}`],
            ['pipeline', `🔗 ${t('tasks.filterPipeline')}`],
          ] as const).map(([key, label]) => {
            const count = tasks.filter(t => {
              if (key === 'all') return true
              if (key === 'pipeline') return (t.task_mode || 'single') === 'pipeline'
              if (key === 'general') return !t.task_type || t.task_type === 'general' || t.task_type === 'feature' || t.task_type === 'common'
              return t.task_type === key
            }).length
            const isActive = taskTypeFilter === key
            return (
              <button
                key={key}
                onClick={() => setTaskTypeFilter(key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  isActive
                    ? key === 'pipeline' ? 'bg-violet-500 text-white shadow-sm' : 'bg-indigo-500 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                }`}
              >
                {label} <span className={`ml-1 ${isActive ? (key === 'pipeline' ? 'text-violet-200' : 'text-indigo-200') : 'text-slate-400'}`}>({count})</span>
              </button>
            )
          })}
          <div className="mx-2 h-5 w-px bg-slate-300 dark:bg-zinc-600" />
          <button
            disabled={kbLoading}
            onClick={async () => {
              setKbLoading(true)
              try {
                const resp = await fetch(`${CLIENT_WTT_API_BASE}/kb/personal`, {
                  headers: { Authorization: `Bearer ${session?.accessToken ?? ''}` },
                })
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
                const kb = await resp.json()
                router.push(buildAgentUrl(`/tasks/kb/${kb.id}`, selectedAgentId))
              } catch (e) {
                console.error('KB redirect failed:', e)
                alert('Failed to open Knowledge Root. Please ensure you are logged in.')
              } finally {
                setKbLoading(false)
              }
            }}
            className="rounded-lg bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-600 hover:shadow-md disabled:opacity-50"
          >
            {kbLoading ? '⏳...' : '📚 Knowledge Root'}
          </button>
        </div>

        <div className="grid h-[calc(100%-88px)] grid-cols-[1fr_380px] gap-3">
          <div className="grid min-h-0 grid-cols-5 gap-3">
            {columns.map((col) => (
              <div key={col} className="flex flex-col rounded-xl border border-slate-200 bg-slate-50 p-2 overflow-hidden">
                <div className="mb-2 flex shrink-0 items-center justify-between text-sm font-semibold capitalize">
                  <span>{statusLabel(col)}</span>
                  <span className="text-xs text-slate-500">{grouped[col].length}</span>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto">
                  {grouped[col].map((task) => (
                    <button
                      key={task.id}
                      onClick={(e) => {
                        setSelectedTask(task)
                        setTaskDraft(task)
                        if (e.metaKey || e.ctrlKey) {
                          setSelectedTaskIds((prev) =>
                            prev.includes(task.id) ? prev.filter((id) => id !== task.id) : Array.from(new Set([...prev, task.id]))
                          )
                        }
                      }}
                      onDoubleClick={() => {
                        if (task.task_type === 'code') router.push(buildAgentUrl(`/tasks/code/${task.id}`, selectedAgentId))
                        else if (task.task_type === 'research') router.push(buildAgentUrl(`/tasks/research/${task.id}`, selectedAgentId))
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        setTaskContextMenu({ x: e.clientX, y: e.clientY, task })
                      }}
                      className={`w-full rounded-lg border p-2 text-left hover:border-indigo-500/60 ${taskCardTone(task.status)} ${task.status === 'doing' ? 'task-card-glow' : ''} ${task.status === 'review' ? 'task-card-pulse' : ''} ${selectedTaskIds.includes(task.id) ? 'ring-2 ring-indigo-400 !bg-indigo-100/80' : ''}`}
                    >
                      <div className="mb-1 flex items-center gap-2">
                        {task.task_type === 'code' && <span className="shrink-0 rounded bg-cyan-100 px-1 text-[10px] font-medium text-cyan-700">💻</span>}
                        {task.task_type === 'research' && <span className="shrink-0 rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-700">📄</span>}
                        {task.task_mode === 'pipeline' && <span className="shrink-0 rounded bg-violet-100 px-1 text-[10px] font-medium text-violet-700">🔗 {t('tasks.filterPipeline')}</span>}
                        <p className="truncate text-sm font-medium leading-5" title={task.title}>{task.title}</p>
                      </div>
                      {task.topic_id && (
                        <div className="mb-1">
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => { e.stopPropagation(); router.push(buildAgentUrl('/feed', selectedAgentId, { topicId: task.topic_id! })) }}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); router.push(buildAgentUrl('/feed', selectedAgentId, { topicId: task.topic_id! })) } }}
                            className="inline-flex items-center gap-1 rounded border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-600 hover:bg-indigo-100 hover:border-indigo-300 cursor-pointer transition"
                            title={t('tasks.viewInFeed')}
                          >
                            📡 {t('tasks.feed')}
                          </span>
                        </div>
                      )}
                      {/* Token & timing badges */}
                      {(tokenStats[task.id] || task.started_at) && (
                        <div className="mb-1 flex items-center gap-1.5 flex-wrap">
                          {tokenStats[task.id] && tokenStats[task.id].estimated_tokens > 0 && (
                            <span className="inline-flex items-center gap-0.5 rounded bg-emerald-50 dark:bg-emerald-950/30 px-1 py-px text-[9px] font-medium text-emerald-600 dark:text-emerald-400" title={`${tokenStats[task.id].estimated_tokens.toLocaleString()} ${t('tasks.tokens')} (${tokenStats[task.id].message_count} ${t('tasks.messages')})`}>
                              🪙 {t('tasks.tokenCost')}: {formatTokens(tokenStats[task.id].estimated_tokens)}
                            </span>
                          )}
                          {task.started_at && (task.completed_at || task.status === 'doing') && (
                            <span className="inline-flex items-center gap-0.5 rounded bg-blue-50 dark:bg-blue-950/30 px-1 py-px text-[9px] font-medium text-blue-600 dark:text-blue-400" title={t('tasks.executionTimeHint')}>
                              ⏱ {formatDuration(Math.max(0, (toMs(task.completed_at) ?? Date.now()) - (toMs(task.started_at) ?? 0)))}
                            </span>
                          )}
                        </div>
                      )}
                      <div className="mt-2 flex items-center justify-between">
                        <div className="h-1.5 flex-1 rounded bg-slate-200">
                          <div className={`h-1.5 rounded transition-all duration-500 ease-out ${progressBarTone(task.status)}`} style={{ width: `${taskProgressMap[task.id] ?? 0}%` }} />
                        </div>
                        {(task.task_type === 'code' || task.task_type === 'research') && (
                          <span className="ml-2 shrink-0 text-[9px] text-slate-400">{t('tasks.doubleClickOpen')}</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <aside className={`flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-3 ${selectedTask?.status === 'doing' ? 'task-panel-flow' : ''} ${selectedTask?.status === 'review' ? 'task-panel-review' : ''}`}>
            <div className="mb-3 shrink-0 rounded-lg border border-slate-200 bg-slate-100 p-2">
              <p className="text-xs font-semibold text-slate-600">{t('tasks.durationPieTop8')}</p>
              {taskDurationSummary.slices.length > 0 ? (
                <>
                  <div className="mt-2 flex items-center gap-3">
                    <svg viewBox="0 0 120 120" className="h-28 w-28 shrink-0">
                      <circle cx="60" cy="60" r="52" fill="#f1f5f9" />
                      {taskDurationSummary.slices.map((slice) => (
                        <path key={slice.id} d={slice.path} fill={slice.color} />
                      ))}
                      <circle cx="60" cy="60" r="25" fill="#f8fafc" />
                      <text x="60" y="57" textAnchor="middle" className="fill-slate-500 text-[8px]">{t('tasks.totalDuration')}</text>
                      <text x="60" y="67" textAnchor="middle" className="fill-slate-600 text-[9px] font-semibold">{formatDuration(taskDurationSummary.totalMs)}</text>
                    </svg>
                    <div className="max-h-28 flex-1 space-y-1 overflow-auto pr-1">
                      {taskDurationSummary.slices.map((slice) => (
                        <div key={slice.id} className="flex items-center gap-1 text-[10px] text-slate-600">
                          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: slice.color }} />
                          <span className="truncate" title={slice.title}>{slice.title}</span>
                          <span className="ml-auto shrink-0 text-slate-700">{formatDuration(slice.durationMs)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <p className="mt-1 text-[10px] text-slate-500">{t('tasks.durationHint')}</p>
                </>
              ) : (
                <p className="mt-1 text-[11px] text-slate-400">{t('tasks.noDurationData')}</p>
              )}
              {/* Token consumption summary below pie chart */}
              {(() => {
                const tokenEntries = visibleTasks
                  .filter(t => tokenStats[t.id] && tokenStats[t.id].estimated_tokens > 0)
                  .map(t => ({ id: t.id, title: t.title, ...tokenStats[t.id] }))
                  .sort((a, b) => b.estimated_tokens - a.estimated_tokens)
                  .slice(0, 8)
                const totalTokens = tokenEntries.reduce((s, e) => s + e.estimated_tokens, 0)
                if (tokenEntries.length === 0) return null
                return (
                  <div className="mt-2 border-t border-slate-200 dark:border-zinc-700 pt-2">
                    <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 mb-1">🪙 {t('tasks.tokenTop8')}  {t('tasks.total')}: {formatTokens(totalTokens)}</p>
                    <div className="space-y-0.5 max-h-24 overflow-auto">
                      {tokenEntries.map((entry) => (
                        <div key={entry.id} className="flex items-center gap-1 text-[10px] text-slate-600 dark:text-zinc-400">
                          <div className="h-1.5 flex-1 rounded bg-slate-200 dark:bg-zinc-700">
                            <div className="h-1.5 rounded bg-emerald-400 dark:bg-emerald-600 transition-all" style={{ width: `${Math.max(2, (entry.estimated_tokens / (tokenEntries[0]?.estimated_tokens || 1)) * 100)}%` }} />
                          </div>
                          <span className="shrink-0 w-12 text-right font-medium text-emerald-600 dark:text-emerald-400">{formatTokens(entry.estimated_tokens)}</span>
                          <span className="shrink-0 truncate max-w-[80px]" title={entry.title}>{entry.title}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}
            </div>

            <h2 className="mb-2 shrink-0 text-sm font-semibold">{t('tasks.messagesPanel')}</h2>
            {selectedTask ? (
              <>
                {/* Task header */}
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className="text-sm font-semibold truncate flex-1">{selectedTask.title}</span>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    selectedTask.status === 'doing' ? 'bg-indigo-100 text-indigo-600' :
                    selectedTask.status === 'review' ? 'bg-amber-100 text-amber-600' :
                    selectedTask.status === 'done' ? 'bg-green-100 text-green-600' :
                    selectedTask.status === 'blocked' ? 'bg-red-100 text-red-600' :
                    'bg-slate-200 text-slate-600'
                  }`}>{statusLabel(selectedTask.status)}</span>
                  <button
                    onClick={async () => {
                      const rerunInput = prompt(t('tasks.rerunPrompt'), '1')
                      if (!rerunInput) return
                      const n = Math.max(1, Math.min(10, parseInt(rerunInput) || 1))
                      const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${selectedTask.id}/rerun?times=${n}`, {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${session?.accessToken ?? ''}` },
                      })
                      if (r.ok) mutateTasks()
                      else alert(t('tasks.rerunFailed'))
                    }}
                    className="shrink-0 rounded px-2 py-0.5 text-[10px] font-semibold text-amber-600 hover:bg-amber-50 border border-amber-300"
                    title={t('tasks.rerunTitle')}
                  >
                    ↻ {t('tasks.rerun')}
                  </button>
                  <div className="flex gap-1">
                    <button
                      className={`rounded-md px-2 py-0.5 text-[10px] ${(selectedTask.exec_mode || 'reasoning') !== 'plan' ? 'bg-indigo-500 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}
                      onClick={async () => {
                        await fetch(`${CLIENT_WTT_API_BASE}/tasks/${selectedTask.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.accessToken ?? ''}` },
                          body: JSON.stringify({ exec_mode: 'reasoning' }),
                        })
                        mutateTasks()
                      }}
                    >{t('tasks.agentMode')}</button>
                    <button
                      className={`rounded-md px-2 py-0.5 text-[10px] ${selectedTask.exec_mode === 'plan' ? 'bg-indigo-500 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}
                      onClick={async () => {
                        await fetch(`${CLIENT_WTT_API_BASE}/tasks/${selectedTask.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.accessToken ?? ''}` },
                          body: JSON.stringify({ exec_mode: 'plan' }),
                        })
                        mutateTasks()
                      }}
                    >{t('tasks.planMode')}</button>
                  </div>
                </div>

                {/* Message stream */}
                <div ref={chatScrollRef} className="flex-1 overflow-y-auto space-y-2 px-1 mb-2">
                  {timeline.length > 0 ? (
                    timeline.map((item) => {
                      const isHuman = item.sender_type.toUpperCase() === 'HUMAN'
                      const displayContent = item.content
                      return (
                        <div key={item.id || `${item.sender}-${item.created_at}`} className={`flex ${isHuman ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[85%] rounded-lg px-2.5 py-1.5 ${isHuman ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-800'}`}>
                            <p className={`text-[10px] mb-0.5 ${isHuman ? 'text-indigo-200' : 'text-slate-500'}`}>{isHuman ? t('tasks.you') : `🤖 ${item.sender}`}</p>
                            <p className="text-[11px] leading-4 whitespace-pre-wrap break-words">{stripFileTokens(displayContent) || displayContent}</p>
                            <FileAttachmentPreview content={displayContent} />
                            <p className={`text-[9px] mt-0.5 ${isHuman ? 'text-indigo-200' : 'text-slate-400'}`}>{item.created_at?.replace('T', ' ').slice(0, 19)}</p>
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <p className="text-[11px] text-slate-400 text-center py-4">{t('tasks.noMessages')}</p>
                  )}
                </div>

                {/* Send box */}
                <div className="shrink-0 border-t border-slate-200 pt-2 px-1">
                  <div className="mb-1 text-[10px] text-slate-500">{t('tasks.senderIdentity')}: 👤 {actorSource(session)}</div>
                  <PendingAttachments attachments={pendingAttachments} onRemove={(i) => setPendingAttachments(prev => prev.filter((_, j) => j !== i))} />
                  <div className="flex gap-1 items-center">
                    <ChatFileUpload
                      compact
                      onUploaded={(asset) => setPendingAttachments(prev => [...prev, asset.markdownToken])}
                      disabled={panelSending}
                    />
                    <input
                      className="flex-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-indigo-400"
                      placeholder={t('tasks.typeMessage')}
                      value={panelInput}
                      onChange={(e) => setPanelInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && (panelInput.trim() || pendingAttachments.length)) { e.preventDefault(); sendPanelMessage() } }}
                    />
                    <button
                      onClick={sendPanelMessage}
                      disabled={panelSending || (!panelInput.trim() && !pendingAttachments.length)}
                      className="shrink-0 rounded-md bg-indigo-500 px-3 py-1 text-xs text-white disabled:opacity-50"
                    >{panelSending ? '...' : t('tasks.send')}</button>
                  </div>
                  {queueIndicator && <p className="text-[10px] text-amber-500 mt-1">📨 {t('tasks.queuedHint')}</p>}
                  {(selectedTask.status === 'review' || selectedTask.status === 'doing') && (
                    <div className="mt-2 flex gap-1">
                      {selectedTask.status === 'review' && (
                        <button
                          onClick={() => reviewCurrent('approve')}
                          className="flex-1 rounded-md bg-green-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-600"
                        >✅ {t('tasks.approve')}</button>
                      )}
                      <button
                        onClick={() => reviewCurrent('reject')}
                        className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50"
                      >↩ {t('tasks.rejectSupplement')}</button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-500">{t('tasks.selectTaskHint')}</p>
            )}
          </aside>
        </div>
      </div>

      {taskContextMenu && (
        <div
          className="fixed z-50 min-w-44 rounded-lg border border-slate-200 bg-white p-1 shadow-2xl"
          style={{ left: taskContextMenu.x, top: taskContextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {(taskContextMenu.task.task_type === 'code' || taskContextMenu.task.task_type === 'research') && (
            <button
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-indigo-50"
              onClick={() => {
                const t = taskContextMenu.task
                setTaskContextMenu(null)
                if (t.task_type === 'code') router.push(buildAgentUrl(`/tasks/code/${t.id}`, selectedAgentId))
                else router.push(buildAgentUrl(`/tasks/research/${t.id}`, selectedAgentId))
              }}
            >
              {taskContextMenu.task.task_type === 'code' ? '💻' : '📄'} {t('tasks.openInIde')}
            </button>
          )}
          {taskContextMenu.task.topic_id && (
            <button
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-indigo-50"
              onClick={() => {
                const t = taskContextMenu.task
                setTaskContextMenu(null)
                setShareTarget({ topicId: t.topic_id!, name: t.title })
              }}
            >
              🔗 {t('tasks.shareTo')}
            </button>
          )}
          <button
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-red-500 hover:bg-red-50"
            onClick={() => cancelTask(taskContextMenu.task)}
          >
            🗑️ {t('tasks.cancelTask')}
          </button>
        </div>
      )}

      {shareTarget && (
        <ShareDialog
          open={!!shareTarget}
          onClose={() => setShareTarget(null)}
          topicId={shareTarget.topicId}
          agentId={selectedAgentId}
          topicName={shareTarget.name}
        />
      )}

      <style jsx>{`
        .task-progress-flow {
          background-image: linear-gradient(90deg, rgba(46,166,255,0.65) 0%, rgba(120,205,255,1) 50%, rgba(46,166,255,0.65) 100%);
          background-size: 180% 100%;
          animation: progressFlow 1.2s linear infinite;
        }
        @keyframes progressFlow {
          from { background-position: 100% 0; }
          to { background-position: 0 0; }
        }
        .task-card-glow {
          animation: taskCardGlow 1.6s ease-in-out infinite;
        }
        .task-card-pulse {
          animation: taskCardPulse 1.4s ease-in-out infinite;
        }
        .task-panel-flow {
          animation: taskPanelFlow 2.2s ease-in-out infinite;
        }
        .task-panel-review {
          animation: taskPanelReviewPulse 1.8s ease-in-out infinite;
        }
        .task-ticker-scroll {
          display: inline-block;
          min-width: 120%;
          animation: taskTickerScroll 10s linear infinite;
        }
        @keyframes taskCardGlow {
          0%, 100% { box-shadow: 0 0 0 rgba(46,166,255,0.0); }
          50% { box-shadow: 0 0 0.75rem rgba(46,166,255,0.35); }
        }
        @keyframes taskCardPulse {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-1px); }
        }
        @keyframes taskPanelFlow {
          0%, 100% { box-shadow: inset 0 0 0 1px rgba(46,166,255,0.16), 0 0 0 rgba(46,166,255,0); }
          50% { box-shadow: inset 0 0 0 1px rgba(46,166,255,0.38), 0 0 0.9rem rgba(46,166,255,0.22); }
        }
        @keyframes taskPanelReviewPulse {
          0%, 100% { box-shadow: inset 0 0 0 1px rgba(255,209,102,0.18), 0 0 0 rgba(255,209,102,0); }
          50% { box-shadow: inset 0 0 0 1px rgba(255,209,102,0.45), 0 0 0.9rem rgba(255,209,102,0.18); }
        }
        @keyframes taskTickerScroll {
          0% { transform: translateX(0%); }
          100% { transform: translateX(-45%); }
        }
      `}</style>

      {/* New Task Modal */}
      {showNewTaskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowNewTaskModal(false)}>
          <div className="w-[420px] rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-lg font-semibold text-slate-800">{t('tasks.newTask')}</h3>
            <input
              autoFocus
              className="mb-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              placeholder={t('tasks.taskTitlePlaceholder')}
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && newTaskTitle.trim()) createTask() }}
            />
            <p className="mb-2 text-xs font-medium text-slate-500">{t('tasks.assignAgent')}</p>
            <select
              className="mb-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              value={newTaskAgentId}
              onChange={(e) => setNewTaskAgentId(e.target.value)}
            >
              <option value="">{t('tasks.selectAgent')}</option>
              {agents.map((a) => (
                <option key={a.agent_id} value={a.agent_id}>{a.display_name || a.agent_id}</option>
              ))}
            </select>

            <p className="mb-2 text-xs font-medium text-slate-500">{t('tasks.taskType')}</p>
            <div className="mb-5 grid grid-cols-3 gap-3">
              {([
                { key: 'code' as const, icon: '💻', label: t('tasks.filterCode'), desc: t('tasks.codeDesc') },
                { key: 'research' as const, icon: '📄', label: t('tasks.filterResearch'), desc: t('tasks.researchDesc') },
                { key: 'common' as const, icon: '📋', label: t('tasks.filterGeneral'), desc: t('tasks.generalDesc') },
              ]).map((t) => (
                <button
                  key={t.key}
                  onClick={() => setNewTaskType(t.key)}
                  className={`rounded-xl border-2 p-3 text-left transition-all ${
                    newTaskType === t.key ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <p className="text-2xl">{t.icon}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">{t.label}</p>
                  <p className="text-[11px] text-slate-500">{t.desc}</p>
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowNewTaskModal(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600">{t('common.cancel')}</button>
              <button
                onClick={createTask}
                disabled={!newTaskTitle.trim() || !newTaskAgentId}
                className="rounded-lg bg-indigo-500 px-4 py-2 text-sm text-white disabled:opacity-50"
              >{t('tasks.create')}</button>
            </div>
          </div>
        </div>
      )}
    </WttShellV2>
  )
}
