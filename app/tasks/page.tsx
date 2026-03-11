'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'
import { WttShellV2 } from '@/components/ui/wtt-shell-v2'
import { normalizeAndFilterAgents } from '@/lib/agents'

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
  priority: 'P0' | 'P1' | 'P2' | 'P3'
  status: 'todo' | 'doing' | 'review' | 'done' | 'blocked'
  owner_agent_id?: string
  runner_agent_id?: string
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

const arcPath = (cx: number, cy: number, r: number, start: number, end: number) => {
  const x1 = cx + r * Math.cos(start)
  const y1 = cy + r * Math.sin(start)
  const x2 = cx + r * Math.cos(end)
  const y2 = cy + r * Math.sin(end)
  const largeArc = end - start > Math.PI ? 1 : 0
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`
}


const actorSource = (session: unknown, selectedAgentId: string) => {
  const s = session as { userId?: string; user?: { name?: string | null; email?: string | null } } | null | undefined
  const uid = s?.userId || ''
  return s?.user?.name || s?.user?.email || (uid ? `user_${uid.slice(0, 8)}` : selectedAgentId || 'user')
}

const fallbackProgressByStatus = (status: TaskItem['status']) => {
  if (status === 'done') return 100
  if (status === 'review') return 90
  if (status === 'doing') return 12
  if (status === 'blocked') return 0
  return 0
}

export default function TasksPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null)
  const [taskDraft, setTaskDraft] = useState<Partial<TaskItem>>({})
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null)
  const [taskContextMenu, setTaskContextMenu] = useState<{ x: number; y: number; task: TaskItem } | null>(null)
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([])
  const [nowTs, setNowTs] = useState(Date.now())
  const [showNewTaskModal, setShowNewTaskModal] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskType, setNewTaskType] = useState<'code' | 'research' | 'common'>('common')
  const [panelInput, setPanelInput] = useState('')
  const [panelSending, setPanelSending] = useState(false)
  const [queueIndicator, setQueueIndicator] = useState(false)
  const [panelSendAs, setPanelSendAs] = useState<'user' | string>('user') // 'user' or agent_id
  const chatScrollRef = useRef<HTMLDivElement>(null)

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
    session?.accessToken ? ['tasks', session.accessToken] : null,
    async () => {
      const response = await fetch(`${CLIENT_WTT_API_BASE}/tasks`, {
        headers: { Authorization: `Bearer ${session?.accessToken}` },
      })
      if (!response.ok) throw new Error('Failed to load tasks')
      return response.json()
    },
    { refreshInterval: 5000 }
  )

  const tasks: TaskItem[] = useMemo(() => (Array.isArray(tasksRaw) ? tasksRaw : []), [tasksRaw])

  const { data: progressRaw } = useSWR(
    session?.accessToken ? ['tasks-progress', session.accessToken] : null,
    async () => {
      const response = await fetch(`${CLIENT_WTT_API_BASE}/tasks/progress`, {
        headers: { Authorization: `Bearer ${session?.accessToken}` },
      })
      if (!response.ok) return {}
      return response.json()
    },
    { refreshInterval: 5000 }
  )

  const { data: timelineRaw } = useSWR(
    selectedTask?.topic_id && session?.accessToken ? ['task-timeline', selectedTask.topic_id, session.accessToken] : null,
    async () => {
      const response = await fetch(`${CLIENT_WTT_API_BASE}/topics/${selectedTask?.topic_id}/messages?limit=500`, {
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
      const fresh = tasks.find((t) => t.id === selectedTask.id) || selectedTask
      setSelectedTask(fresh)
      setTaskDraft(fresh)
    }
  }, [tasks, selectedTask])

  useEffect(() => {
    const taskSet = new Set(tasks.map((t) => t.id))
    setSelectedTaskIds((prev) => prev.filter((id) => taskSet.has(id)))
  }, [tasks])

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
    for (const t of tasks) {
      if (t.status in map) map[t.status].push(t)
    }
    return map
  }, [tasks])

  const taskDurationSummary = useMemo(() => {
    const now = Date.now()
    const rows = tasks
      .map((task) => {
        const start = toMs(task.started_at) ?? toMs(task.created_at) ?? toMs(task.updated_at)
        if (!start) return null
        const end = toMs(task.completed_at) ?? (task.status === 'done' ? toMs(task.updated_at) : null) ?? now
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
  }, [tasks])

  const taskProgressMap = useMemo(() => {
    const map: Record<string, number> = {}

    if (progressRaw && typeof progressRaw === 'object') {
      for (const [taskId, value] of Object.entries(progressRaw as Record<string, unknown>)) {
        const p = Number(value)
        if (!Number.isFinite(p)) continue
        map[taskId] = Math.min(100, Math.max(0, p))
      }
    }

    for (const task of tasks) {
      if (task.status === 'done') {
        map[task.id] = 100
        continue
      }
      if (map[task.id] === undefined) {
        map[task.id] = fallbackProgressByStatus(task.status)
      }
    }

    return map
  }, [tasks, progressRaw])

  const topics = useMemo(() => {
    if (!Array.isArray(subscribedTopicsRaw)) return []
    return subscribedTopicsRaw.map((topic: { id: string; name: string; type?: string; my_role?: string }) => {
      // Strip "TASK-xxxxxxxx " prefix from task topic names
      let displayName = topic.name
      const taskPrefixMatch = displayName.match(/^TASK-[a-f0-9]{8}\s+(.+)$/i)
      if (taskPrefixMatch) {
        displayName = taskPrefixMatch[1]
      }

      return {
        topic_id: topic.id,
        name: displayName,
        topic_type: (topic.type || 'discussion') as 'broadcast' | 'discussion' | 'p2p' | 'collaborative',
        unread_count: 0,
        can_delete: topic.my_role === 'owner' || topic.my_role === 'admin',
      }
    })
  }, [subscribedTopicsRaw])

  const agentItems = useMemo(() => {
    return agents.map((a) => ({ agent_id: a.agent_id, display_name: a.display_name, unread_count: 0 }))
  }, [agents])

  const createTask = async () => {
    const title = newTaskTitle.trim()
    if (!title) return
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
      owner_agent_id: selectedAgentId || undefined,
      runner_agent_id: selectedAgentId || undefined,
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
          owner_agent_id: selectedAgentId || undefined,
          runner_agent_id: selectedAgentId || undefined,
          created_by: actorSource(session, selectedAgentId),
        }),
      })
      if (resp.ok) {
        const real = await resp.json()
        mutateTasks((prev: TaskItem[] | undefined) => (prev || []).map((t) => (t.id === tempId ? { ...t, ...real } : t)), { revalidate: false })

        // Navigate to the appropriate task page
        if (newTaskType === 'code') {
          router.push(`/tasks/code/${real.id}`)
        } else if (newTaskType === 'research') {
          router.push(`/tasks/research/${real.id}`)
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
    const ok = window.confirm(`确认取消任务「${task.title}」吗？取消后任务和关联 Topic 都会消失。`)
    if (!ok) return

    const response = await fetch(
      `${CLIENT_WTT_API_BASE}/tasks/${task.id}?agent_id=${encodeURIComponent(selectedAgentId || 'reviewer')}&delete_topic=true`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session?.accessToken ?? ''}` },
      }
    )

    if (!response.ok) {
      const txt = await response.text()
      alert(`Cancel Task failed: ${txt || response.status}`)
      return
    }

    if (selectedTask?.id === task.id) {
      setSelectedTask(null)
      setTaskDraft({})
    }

    setTaskContextMenu(null)
    await mutateTasks()
    await mutateSubscribedTopics()
  }

  const bulkRunTasks = async () => {
    if (!selectedTaskIds.length) return alert('请先勾选任务')
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
            trigger_agent_id: actorSource(session, selectedAgentId) || 'task-runner',
            runner_agent_id: t.runner_agent_id || t.owner_agent_id || selectedAgentId,
          }),
        })
      )
    )
    const ok = results.filter((r) => r.status === 'fulfilled' && r.value.ok).length
    alert(`批量运行完成：成功 ${ok} / ${targets.length}`)
    await mutateTasks()
  }

  const bulkCancelTasks = async () => {
    if (!selectedTaskIds.length) return alert('请先勾选任务')
    if (!confirm(`确认取消已勾选 ${selectedTaskIds.length} 个任务？将同时删除关联Topic。`)) return
    const headers = { Authorization: `Bearer ${session?.accessToken ?? ''}` }
    const results = await Promise.allSettled(
      selectedTaskIds.map((id) =>
        fetch(`${CLIENT_WTT_API_BASE}/tasks/${id}?agent_id=${encodeURIComponent(selectedAgentId || 'reviewer')}&delete_topic=true`, {
          method: 'DELETE',
          headers,
        })
      )
    )
    const ok = results.filter((r) => r.status === 'fulfilled' && r.value.ok).length
    setSelectedTaskIds([])
    await mutateTasks()
    await mutateSubscribedTopics()
    alert(`批量取消完成：成功 ${ok} / ${results.length}`)
  }

  const leaveTopicFromSidebar = async (topicId: string) => {
    if (!confirm('Leave this topic?')) return

    const response = await fetch(`${CLIENT_WTT_API_BASE}/topics/${topicId}/leave?agent_id=${encodeURIComponent(selectedAgentId)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session?.accessToken ?? ''}` },
    })

    if (!response.ok) {
      const txt = await response.text()
      alert(`Leave topic failed: ${txt || response.status}`)
      return
    }

    await mutateSubscribedTopics()
  }

  const deleteTopicFromSidebar = async (topicId: string) => {
    if (!confirm('Delete this topic? (soft delete)')) return

    const response = await fetch(`${CLIENT_WTT_API_BASE}/topics/${topicId}?agent_id=${encodeURIComponent(selectedAgentId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session?.accessToken ?? ''}` },
    })

    if (!response.ok) {
      const txt = await response.text()
      alert(`Delete topic failed: ${txt || response.status}`)
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
          trigger_agent_id: actorSource(session, selectedAgentId) || 'task-runner',
          runner_agent_id: selectedTask.runner_agent_id || selectedTask.owner_agent_id || selectedAgentId,
          exec_mode: selectedTask.exec_mode || 'reasoning',
        }),
      })
      if (!resp.ok) {
        const txt = await resp.text()
        alert(`Run Task failed: ${txt || resp.status}`)
        mutateTasks()
        return
      }
    } catch (e) {
      alert(`Run Task failed: ${e instanceof Error ? e.message : 'unknown error'}`)
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
      const input = window.prompt('请输入 Reject 意见：', '')
      if (input === null || !input.trim()) return
      if (selectedTask.topic_id) {
        await fetch(`${CLIENT_WTT_API_BASE}/topics/${selectedTask.topic_id}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.accessToken ?? ''}`,
          },
          body: JSON.stringify({
            sender_id: actorSource(session, selectedAgentId),
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
      body: JSON.stringify({ action, reviewer: selectedAgentId || 'reviewer', comment: '' }),
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
    if (!selectedTask || !panelInput.trim()) return
    const text = panelInput.trim()
    setPanelInput('')
    setPanelSending(true)
    setQueueIndicator(false)

    const isUser = panelSendAs === 'user'
    const agentId = isUser ? (selectedAgentId || 'user') : panelSendAs
    const senderType = isUser ? 'HUMAN' : 'AGENT'
    const senderId = isUser ? actorSource(session, selectedAgentId) : agentId
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.accessToken ?? ''}`,
    }

    try {
      // If task is in "todo" status, run it first
      if (selectedTask.status === 'todo') {
        await fetch(`${CLIENT_WTT_API_BASE}/tasks/${selectedTask.id}/run`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            runner_agent_id: selectedTask.runner_agent_id || selectedTask.owner_agent_id || selectedAgentId,
            exec_mode: selectedTask.exec_mode || 'reasoning',
          }),
        })
        await mutateTasks()
      }

      if (selectedTask.topic_id) {
        const url = isUser
          ? `${CLIENT_WTT_API_BASE}/topics/${selectedTask.topic_id}/messages`
          : `${CLIENT_WTT_API_BASE}/topics/${selectedTask.topic_id}/messages?agent_id=${encodeURIComponent(agentId)}`
        await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            sender_id: senderId,
            sender_type: senderType,
            content: text,
            content_type: 'text',
            semantic_type: 'reply',
          }),
        })
      }

      // Show queue indicator if task is actively running
      if (selectedTask.status === 'doing') {
        setQueueIndicator(true)
        setTimeout(() => setQueueIndicator(false), 4000)
      }
    } catch {
      // ignore
    } finally {
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
      onAgentChange={setSelectedAgentId}
      topics={topics}
      selectedTopicId={null}
      onTopicChange={(topicId) => router.push(topicId ? `/feed?topicId=${topicId}` : '/feed')}
      onLeaveTopic={leaveTopicFromSidebar}
      onDeleteTopic={deleteTopicFromSidebar}
      onTopicsRefresh={() => mutateSubscribedTopics()}
      onLogout={() => signOut({ callbackUrl: '/login' })}
      currentUserName={actorSource(session, '')}
      hideCreateTopic
    >
      <div className="h-full p-4 text-slate-800">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Tasks</h1>
            <p className="text-xs text-slate-500">Trigger · Assign · Review</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={bulkRunTasks} className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm text-indigo-500">批量Run任务</button>
            <button onClick={bulkCancelTasks} className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-600">批量取消任务</button>
            <button onClick={() => setShowNewTaskModal(true)} className="rounded-lg bg-indigo-500 px-3 py-2 text-sm text-white">+ New Task</button>
          </div>
        </div>

        <div className="grid h-[calc(100%-52px)] grid-cols-[1fr_380px] gap-3">
          <div className="grid min-h-0 grid-cols-5 gap-3">
            {columns.map((col) => (
              <div key={col} className="flex flex-col rounded-xl border border-slate-200 bg-slate-50 p-2 overflow-hidden">
                <div className="mb-2 flex shrink-0 items-center justify-between text-sm font-semibold capitalize">
                  <span>{col}</span>
                  <span className="text-xs text-slate-500">{grouped[col].length}</span>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto">
                  {grouped[col].map((task) => (
                    <button
                      key={task.id}
                      onClick={(e) => {
                        if (task.task_type === 'code') {
                          router.push(`/tasks/code/${task.id}`)
                          return
                        }
                        if (task.task_type === 'research') {
                          router.push(`/tasks/research/${task.id}`)
                          return
                        }
                        setSelectedTask(task)
                        setTaskDraft(task)
                        if (e.metaKey || e.ctrlKey) {
                          setSelectedTaskIds((prev) =>
                            prev.includes(task.id) ? prev.filter((id) => id !== task.id) : Array.from(new Set([...prev, task.id]))
                          )
                        }
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
                        <p className="truncate text-sm font-medium leading-5" title={task.title}>{task.title}</p>
                      </div>
                      <div className="mt-2 h-1.5 w-full rounded bg-slate-200">
                        <div className={`h-1.5 rounded transition-all duration-500 ease-out ${progressBarTone(task.status)}`} style={{ width: `${taskProgressMap[task.id] ?? 0}%` }} />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <aside className={`flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-3 ${selectedTask?.status === 'doing' ? 'task-panel-flow' : ''} ${selectedTask?.status === 'review' ? 'task-panel-review' : ''}`}>
            <div className="mb-3 shrink-0 rounded-lg border border-slate-200 bg-slate-100 p-2">
              <p className="text-xs font-semibold text-slate-600">Task执行时间饼图（Top 8）</p>
              {taskDurationSummary.slices.length > 0 ? (
                <>
                  <div className="mt-2 flex items-center gap-3">
                    <svg viewBox="0 0 120 120" className="h-28 w-28 shrink-0">
                      <circle cx="60" cy="60" r="52" fill="#f1f5f9" />
                      {taskDurationSummary.slices.map((slice) => (
                        <path key={slice.id} d={slice.path} fill={slice.color} />
                      ))}
                      <circle cx="60" cy="60" r="25" fill="#f8fafc" />
                      <text x="60" y="57" textAnchor="middle" className="fill-slate-500 text-[8px]">总耗时</text>
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
                  <p className="mt-1 text-[10px] text-slate-500">按任务执行时长占比统计（进行中任务按当前时间持续累计）</p>
                </>
              ) : (
                <p className="mt-1 text-[11px] text-slate-400">暂无可统计的执行时长</p>
              )}
            </div>

            <h2 className="mb-2 shrink-0 text-sm font-semibold">Messages</h2>
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
                  }`}>{selectedTask.status}</span>
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
                    >Agent</button>
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
                    >Plan</button>
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
                            <p className={`text-[10px] mb-0.5 ${isHuman ? 'text-indigo-200' : 'text-slate-500'}`}>{isHuman ? 'You' : `🤖 ${item.sender}`}</p>
                            <p className="text-[11px] leading-4 whitespace-pre-wrap break-words">{displayContent}</p>
                            <p className={`text-[9px] mt-0.5 ${isHuman ? 'text-indigo-200' : 'text-slate-400'}`}>{item.created_at?.replace('T', ' ').slice(0, 19)}</p>
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <p className="text-[11px] text-slate-400 text-center py-4">No messages yet</p>
                  )}
                </div>

                {/* Send box */}
                <div className="shrink-0 border-t border-slate-200 pt-2 px-1">
                  <div className="flex items-center gap-1 mb-1">
                    <select
                      className="flex-1 rounded border border-slate-200 bg-slate-100 px-1.5 py-1 text-[11px] outline-none"
                      value={panelSendAs}
                      onChange={(e) => setPanelSendAs(e.target.value)}
                    >
                      <option value="user">👤 {actorSource(session, selectedAgentId)}</option>
                      {agents.map((a) => (
                        <option key={a.agent_id} value={a.agent_id}>🤖 {a.display_name}</option>
                      ))}
                    </select>
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {panelSendAs === 'user' ? '👤 User' : '🤖 Agent'}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <input
                      className="flex-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-indigo-400"
                      placeholder="Type a message..."
                      value={panelInput}
                      onChange={(e) => setPanelInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && panelInput.trim()) { e.preventDefault(); sendPanelMessage() } }}
                    />
                    <button
                      onClick={sendPanelMessage}
                      disabled={panelSending || !panelInput.trim()}
                      className="shrink-0 rounded-md bg-indigo-500 px-3 py-1 text-xs text-white disabled:opacity-50"
                    >{panelSending ? '...' : 'Send'}</button>
                  </div>
                  {queueIndicator && <p className="text-[10px] text-amber-500 mt-1">📨 Message queued, will be processed after current reasoning</p>}
                  {selectedTask.status === 'review' && (
                    <div className="mt-2 flex gap-1">
                      <button
                        onClick={() => reviewCurrent('approve')}
                        className="flex-1 rounded-md bg-green-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-600"
                      >✅ Approve</button>
                      <button
                        onClick={() => reviewCurrent('reject')}
                        className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50"
                      >↩ Reject</button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-500">Select a task to start chatting.</p>
            )}
          </aside>
        </div>
      </div>

      {taskContextMenu && (
        <div
          className="fixed z-50 min-w-36 rounded-lg border border-slate-200 bg-slate-100 p-1 shadow-2xl"
          style={{ left: taskContextMenu.x, top: taskContextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full rounded-md px-2 py-1.5 text-left text-xs text-red-500 hover:bg-red-50"
            onClick={() => cancelTask(taskContextMenu.task)}
          >
            取消任务（删除Topic）
          </button>
        </div>
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
            <h3 className="mb-4 text-lg font-semibold text-slate-800">New Task</h3>
            <input
              autoFocus
              className="mb-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              placeholder="Task title..."
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && newTaskTitle.trim()) createTask() }}
            />
            <p className="mb-2 text-xs font-medium text-slate-500">Task Type</p>
            <div className="mb-5 grid grid-cols-3 gap-3">
              {([
                { key: 'code' as const, icon: '💻', label: 'Code Task', desc: 'IDE + Agent coding' },
                { key: 'research' as const, icon: '📄', label: 'Research', desc: 'Papers & reports' },
                { key: 'common' as const, icon: '📋', label: 'Common', desc: 'General task' },
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
              <button onClick={() => setShowNewTaskModal(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600">Cancel</button>
              <button
                onClick={createTask}
                disabled={!newTaskTitle.trim()}
                className="rounded-lg bg-indigo-500 px-4 py-2 text-sm text-white disabled:opacity-50"
              >Create</button>
            </div>
          </div>
        </div>
      )}
    </WttShellV2>
  )
}
