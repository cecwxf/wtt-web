'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
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
const pieColors = ['#2ea6ff', '#52d1a8', '#ffd166', '#f78c6b', '#c792ea', '#7fd1f5', '#f5b4e6', '#9be564']

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
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null)
  const [taskContextMenu, setTaskContextMenu] = useState<{ x: number; y: number; task: TaskItem } | null>(null)
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([])
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([])

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
      const response = await fetch(`${CLIENT_WTT_API_BASE}/topics/${selectedTask?.topic_id}/messages?limit=20`, {
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
          content,
          created_at: String(x.created_at || x.timestamp || ''),
          kind,
        }
      })
      .filter((x) => x.content)
      .slice(-8)
      .reverse()
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
    const rows = Array.isArray(subscribedTopicsRaw) ? subscribedTopicsRaw : []
    const topicSet = new Set(rows.map((t: { id: string }) => t.id))
    setSelectedTopicIds((prev) => prev.filter((id) => topicSet.has(id)))
  }, [subscribedTopicsRaw])

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
    return subscribedTopicsRaw.map((topic: { id: string; name: string; type?: string; my_role?: string }) => ({
      topic_id: topic.id,
      name: topic.name,
      topic_type: (topic.type || 'discussion') as 'broadcast' | 'discussion' | 'p2p' | 'collaborative',
      unread_count: 0,
      can_delete: topic.my_role === 'owner' || topic.my_role === 'admin',
    }))
  }, [subscribedTopicsRaw])

  const agentItems = useMemo(() => {
    return agents.map((a) => ({ agent_id: a.agent_id, display_name: a.display_name, unread_count: 0 }))
  }, [agents])

  const createTask = async () => {
    const title = prompt('Task title')?.trim()
    if (!title) return
    await fetch(`${CLIENT_WTT_API_BASE}/tasks`, {
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
        task_type: 'feature',
        owner_agent_id: selectedAgentId || undefined,
        runner_agent_id: selectedAgentId || undefined,
        created_by: selectedAgentId || 'user',
      }),
    })
    mutateTasks()
  }

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

  const invalidateAllTasks = async () => {
    if (!tasks.length) {
      alert('当前没有可取消的任务')
      return
    }

    const ok = window.confirm(`确认将当前全部 ${tasks.length} 个任务标记为无效并取消吗？\n操作后任务会从所有栏消失，关联 Topic 也会删除。`)
    if (!ok) return

    const headers = { Authorization: `Bearer ${session?.accessToken ?? ''}` }
    const results = await Promise.allSettled(
      tasks.map((t) =>
        fetch(
          `${CLIENT_WTT_API_BASE}/tasks/${t.id}?agent_id=${encodeURIComponent(selectedAgentId || 'reviewer')}&delete_topic=true`,
          { method: 'DELETE', headers }
        )
      )
    )

    let success = 0
    let failed = 0
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.ok) success += 1
      else failed += 1
    }

    setSelectedTask(null)
    setTaskDraft({})
    setTaskContextMenu(null)
    await mutateTasks()
    await mutateSubscribedTopics()

    if (failed > 0) alert(`无效化完成：成功 ${success}，失败 ${failed}`)
    else alert(`无效化完成：已取消 ${success} 个任务`)
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
            trigger_agent_id: selectedAgentId || 'task-runner',
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

  const bulkLeaveTopics = async () => {
    if (!selectedTopicIds.length) return alert('请先勾选Topic')
    const headers = { Authorization: `Bearer ${session?.accessToken ?? ''}` }
    const results = await Promise.allSettled(
      selectedTopicIds.map((id) =>
        fetch(`${CLIENT_WTT_API_BASE}/topics/${id}/leave?agent_id=${encodeURIComponent(selectedAgentId)}`, {
          method: 'POST',
          headers,
        })
      )
    )
    const ok = results.filter((r) => r.status === 'fulfilled' && r.value.ok).length
    setSelectedTopicIds([])
    await mutateSubscribedTopics()
    alert(`批量Leave完成：成功 ${ok} / ${results.length}`)
  }

  const bulkDeleteTopics = async () => {
    if (!selectedTopicIds.length) return alert('请先勾选Topic')
    if (!confirm(`确认删除已勾选 ${selectedTopicIds.length} 个Topic？`)) return
    const headers = { Authorization: `Bearer ${session?.accessToken ?? ''}` }
    const results = await Promise.allSettled(
      selectedTopicIds.map((id) =>
        fetch(`${CLIENT_WTT_API_BASE}/topics/${id}?agent_id=${encodeURIComponent(selectedAgentId)}`, {
          method: 'DELETE',
          headers,
        })
      )
    )
    const ok = results.filter((r) => r.status === 'fulfilled' && r.value.ok).length
    setSelectedTopicIds([])
    await mutateSubscribedTopics()
    alert(`批量Delete完成：成功 ${ok} / ${results.length}`)
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

  const assignCurrent = async (agentId: string) => {
    if (!selectedTask) return
    await fetch(`${CLIENT_WTT_API_BASE}/tasks/${selectedTask.id}/assign?agent_id=${encodeURIComponent(agentId)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session?.accessToken ?? ''}` },
    })
    mutateTasks()
  }

  const runCurrent = async () => {
    if (!selectedTask) return
    setRunningTaskId(selectedTask.id)
    try {
      const resp = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${selectedTask.id}/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.accessToken ?? ''}`,
        },
        body: JSON.stringify({
          trigger_agent_id: selectedAgentId || 'task-runner',
          runner_agent_id: selectedTask.runner_agent_id || selectedTask.owner_agent_id || selectedAgentId,
        }),
      })
      if (!resp.ok) {
        const txt = await resp.text()
        alert(`Run Task failed: ${txt || resp.status}`)
        return
      }
      await mutateTasks()
      alert('Run Task dispatched')
    } catch (e) {
      alert(`Run Task failed: ${e instanceof Error ? e.message : 'unknown error'}`)
    } finally {
      setRunningTaskId(null)
    }
  }

  const reviewCurrent = async (action: 'approve' | 'reject' | 'block') => {
    if (!selectedTask) return

    let comment = ''
    if (action === 'reject') {
      const input = window.prompt('请输入 Reject 意见（会回传给 Agent 重新执行）：', '')
      if (input === null) return
      comment = input.trim()
    }

    await fetch(`${CLIENT_WTT_API_BASE}/tasks/${selectedTask.id}/review`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.accessToken ?? ''}`,
      },
      body: JSON.stringify({ action, reviewer: selectedAgentId || 'reviewer', comment }),
    })
    mutateTasks()
  }

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

  const taskCardTone = (status: TaskItem['status']) => {
    if (status === 'doing') return 'border-[#2ea6ff]/50 bg-[#102033]'
    if (status === 'review') return 'border-yellow-500/40 bg-[#2a2416]'
    if (status === 'done') return 'border-green-500/40 bg-[#13281f]'
    if (status === 'blocked') return 'border-red-500/40 bg-[#2a1718]'
    return 'border-white/10 bg-[#111a25]'
  }

  const progressBarTone = (status: TaskItem['status']) => {
    if (status === 'done') return 'bg-green-400'
    if (status === 'review') return 'bg-yellow-400 animate-pulse'
    if (status === 'blocked') return 'bg-red-400'
    if (status === 'doing') return 'task-progress-flow bg-[#2ea6ff]'
    return 'bg-[#2ea6ff]'
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
    >
      <div className="h-full p-4 text-[#e8edf2]">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Tasks</h1>
            <p className="text-xs text-[#8ca0b3]">Trigger · Assign · Review</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={bulkRunTasks} className="rounded-lg border border-[#2ea6ff]/50 bg-[#17324a] px-3 py-2 text-sm text-[#9fd6ff]">批量Run任务</button>
            <button onClick={bulkCancelTasks} className="rounded-lg border border-red-500/50 bg-[#331a1d] px-3 py-2 text-sm text-red-200">批量取消任务</button>
            <button onClick={invalidateAllTasks} className="rounded-lg border border-red-500/50 bg-[#331a1d] px-3 py-2 text-sm text-red-200">无效全部任务</button>
            <button onClick={createTask} className="rounded-lg bg-[#2ea6ff] px-3 py-2 text-sm text-white">+ New Task</button>
          </div>
        </div>

        <div className="grid h-[calc(100%-52px)] grid-cols-[1fr_320px] gap-3">
          <div className="grid grid-cols-5 gap-3">
            {columns.map((col) => (
              <div key={col} className="rounded-xl border border-white/10 bg-[#16202c] p-2">
                <div className="mb-2 flex items-center justify-between text-sm font-semibold capitalize">
                  <span>{col}</span>
                  <span className="text-xs text-[#8ca0b3]">{grouped[col].length}</span>
                </div>
                <div className="space-y-2">
                  {grouped[col].map((task) => (
                    <button
                      key={task.id}
                      onClick={() => {
                        setSelectedTask(task)
                        setTaskDraft(task)
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        setTaskContextMenu({ x: e.clientX, y: e.clientY, task })
                      }}
                      className={`w-full rounded-lg border p-2 text-left hover:border-[#2ea6ff]/60 ${taskCardTone(task.status)} ${task.status === 'doing' ? 'task-card-glow' : ''} ${task.status === 'review' ? 'task-card-pulse' : ''}`}
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <p className="text-sm font-medium leading-5">{task.title}</p>
                        <input
                          type="checkbox"
                          checked={selectedTaskIds.includes(task.id)}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            const checked = e.target.checked
                            setSelectedTaskIds((prev) =>
                              checked ? Array.from(new Set([...prev, task.id])) : prev.filter((id) => id !== task.id)
                            )
                          }}
                        />
                      </div>
                      <p className="mt-1 text-[10px] text-[#8ca0b3]">{task.priority} · owner:{task.owner_agent_id || 'unassigned'} · runner:{task.runner_agent_id || '-'}</p>
                      <div className="mt-1 h-1.5 w-full rounded bg-[#26384a]">
                        <div className={`h-1.5 rounded transition-all duration-500 ease-out ${progressBarTone(task.status)}`} style={{ width: `${taskProgressMap[task.id] ?? 0}%` }} />
                      </div>
                      <div className="mt-2 flex gap-1">
                        {col !== 'todo' && <span onClick={(e) => { e.stopPropagation(); moveStatus(task, 'todo') }} className="cursor-pointer rounded border border-white/10 px-1 text-[10px]">Todo</span>}
                        {col !== 'doing' && <span onClick={(e) => { e.stopPropagation(); moveStatus(task, 'doing') }} className="cursor-pointer rounded border border-white/10 px-1 text-[10px]">Doing</span>}
                        {col !== 'review' && <span onClick={(e) => { e.stopPropagation(); moveStatus(task, 'review') }} className="cursor-pointer rounded border border-white/10 px-1 text-[10px]">Review</span>}
                        {col !== 'blocked' && <span onClick={(e) => { e.stopPropagation(); moveStatus(task, 'blocked') }} className="cursor-pointer rounded border border-white/10 px-1 text-[10px]">Blocked</span>}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <aside className={`rounded-xl border border-white/10 bg-[#16202c] p-3 ${selectedTask?.status === 'doing' ? 'task-panel-flow' : ''} ${selectedTask?.status === 'review' ? 'task-panel-review' : ''}`}>
            <div className="mb-3 rounded-lg border border-white/10 bg-[#111b28] p-2">
              <p className="text-xs font-semibold text-[#cfe4f8]">Task执行时间饼图（Top 8）</p>
              {taskDurationSummary.slices.length > 0 ? (
                <>
                  <div className="mt-2 flex items-center gap-3">
                    <svg viewBox="0 0 120 120" className="h-28 w-28 shrink-0">
                      <circle cx="60" cy="60" r="52" fill="#1f2c3a" />
                      {taskDurationSummary.slices.map((slice) => (
                        <path key={slice.id} d={slice.path} fill={slice.color} />
                      ))}
                      <circle cx="60" cy="60" r="25" fill="#0f1824" />
                      <text x="60" y="57" textAnchor="middle" className="fill-[#dbe9f7] text-[8px]">总耗时</text>
                      <text x="60" y="67" textAnchor="middle" className="fill-[#dbe9f7] text-[9px] font-semibold">{formatDuration(taskDurationSummary.totalMs)}</text>
                    </svg>
                    <div className="max-h-28 flex-1 space-y-1 overflow-auto pr-1">
                      {taskDurationSummary.slices.map((slice) => (
                        <div key={slice.id} className="flex items-center gap-1 text-[10px] text-[#b9cadc]">
                          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: slice.color }} />
                          <span className="truncate" title={slice.title}>{slice.title}</span>
                          <span className="ml-auto shrink-0 text-[#d6e8fa]">{formatDuration(slice.durationMs)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <p className="mt-1 text-[10px] text-[#8ca0b3]">按任务执行时长占比统计（进行中任务按当前时间持续累计）</p>
                </>
              ) : (
                <p className="mt-1 text-[11px] text-[#7d8e9e]">暂无可统计的执行时长</p>
              )}
            </div>

            <div className="mb-3 rounded-lg border border-white/10 bg-[#111b28] p-2">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold text-[#cfe4f8]">Topic 多选操作</p>
                <div className="flex gap-1">
                  <button onClick={bulkLeaveTopics} className="rounded border border-white/15 px-2 py-0.5 text-[10px]">批量Leave</button>
                  <button onClick={bulkDeleteTopics} className="rounded border border-red-500/40 px-2 py-0.5 text-[10px] text-red-300">批量Delete</button>
                </div>
              </div>
              <div className="max-h-24 space-y-1 overflow-auto pr-1 text-[11px]">
                {topics.length > 0 ? topics.map((tp) => (
                  <label key={tp.topic_id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedTopicIds.includes(tp.topic_id)}
                      onChange={(e) => {
                        const checked = e.target.checked
                        setSelectedTopicIds((prev) =>
                          checked ? Array.from(new Set([...prev, tp.topic_id])) : prev.filter((id) => id !== tp.topic_id)
                        )
                      }}
                    />
                    <span className="truncate" title={tp.name}>{tp.name}</span>
                  </label>
                )) : <p className="text-[#7d8e9e]">暂无Topic</p>}
              </div>
            </div>

            <h2 className="mb-2 text-sm font-semibold">Task Detail</h2>
            {selectedTask ? (
              <div className="space-y-2 text-sm">
                <p className="font-semibold">{selectedTask.title}</p>
                <p className="text-xs">Priority: {selectedTask.priority} · Status: {selectedTask.status}</p>
                <p className="text-xs">Owner: {selectedTask.owner_agent_id || 'unassigned'}</p>
                <p className="text-xs">Runner: {selectedTask.runner_agent_id || '-'}</p>
                {selectedTask.topic_id && (
                  <button
                    className="mt-1 rounded-md border border-white/10 bg-[#1d2a3a] px-2 py-1 text-xs"
                    onClick={() => router.push(`/feed?topicId=${selectedTask.topic_id}`)}
                  >
                    Open in Feed
                  </button>
                )}

                <div className="border-t border-white/10 pt-2">
                  <button
                    onClick={runCurrent}
                    disabled={runningTaskId === selectedTask.id}
                    className="rounded-md border border-[#2ea6ff]/50 bg-[#17324a] px-2 py-1 text-xs text-[#9fd6ff] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {runningTaskId === selectedTask.id ? 'Running...' : 'Run Task'}
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-2 border-t border-white/10 pt-2">
                  <textarea value={taskDraft.description || ''} onChange={(e) => setTaskDraft((d) => ({ ...d, description: e.target.value }))} placeholder="Task description" className="min-h-16 rounded border border-white/10 bg-[#0f1824] px-2 py-1 text-xs outline-none" />
                  <textarea value={taskDraft.acceptance || ''} onChange={(e) => setTaskDraft((d) => ({ ...d, acceptance: e.target.value }))} placeholder="Acceptance criteria" className="min-h-14 rounded border border-white/10 bg-[#0f1824] px-2 py-1 text-xs outline-none" />
                  <div className="grid grid-cols-2 gap-2">
                    <input value={taskDraft.runner_agent_id || ''} onChange={(e) => setTaskDraft((d) => ({ ...d, runner_agent_id: e.target.value }))} placeholder="Runner agent" className="rounded border border-white/10 bg-[#0f1824] px-2 py-1 text-xs outline-none" />
                    <input value={taskDraft.exec_mode || ''} onChange={(e) => setTaskDraft((d) => ({ ...d, exec_mode: e.target.value }))} placeholder="Exec mode" className="rounded border border-white/10 bg-[#0f1824] px-2 py-1 text-xs outline-none" />
                    <input value={taskDraft.due_at || ''} onChange={(e) => setTaskDraft((d) => ({ ...d, due_at: e.target.value }))} placeholder="Due at (ISO)" className="rounded border border-white/10 bg-[#0f1824] px-2 py-1 text-xs outline-none" />
                    <input value={taskDraft.estimate_hours ?? ''} onChange={(e) => setTaskDraft((d) => ({ ...d, estimate_hours: Number(e.target.value || 0) }))} placeholder="Estimate hours" className="rounded border border-white/10 bg-[#0f1824] px-2 py-1 text-xs outline-none" />
                    <input value={taskDraft.dependencies || ''} onChange={(e) => setTaskDraft((d) => ({ ...d, dependencies: e.target.value }))} placeholder="Dependencies" className="col-span-2 rounded border border-white/10 bg-[#0f1824] px-2 py-1 text-xs outline-none" />
                  </div>
                  <textarea value={taskDraft.notes || ''} onChange={(e) => setTaskDraft((d) => ({ ...d, notes: e.target.value }))} placeholder="Notes" className="min-h-12 rounded border border-white/10 bg-[#0f1824] px-2 py-1 text-xs outline-none" />
                  <button onClick={saveTaskDetails} className="rounded-md border border-[#2ea6ff]/50 bg-[#17324a] px-2 py-1 text-xs text-[#9fd6ff]">Save Details</button>
                </div>

                <div className="border-t border-white/10 pt-2">
                  <p className="mb-1 text-xs text-[#8ca0b3]">Assign</p>
                  <div className="flex flex-wrap gap-1">
                    {agents.slice(0, 6).map((a) => (
                      <button key={a.agent_id} onClick={() => assignCurrent(a.agent_id)} className="rounded border border-white/10 px-2 py-1 text-[10px]">
                        {a.display_name}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="border-t border-white/10 pt-2">
                  <p className="mb-1 text-xs text-[#8ca0b3]">Review</p>
                  <div className="flex gap-2">
                    <button onClick={() => reviewCurrent('approve')} className="rounded border border-green-500/40 px-2 py-1 text-xs text-green-300">Approve</button>
                    <button onClick={() => reviewCurrent('reject')} className="rounded border border-yellow-500/40 px-2 py-1 text-xs text-yellow-300">Reject</button>
                    <button onClick={() => reviewCurrent('block')} className="rounded border border-red-500/40 px-2 py-1 text-xs text-red-300">Block</button>
                  </div>
                </div>

                <div className="border-t border-white/10 pt-2">
                  <p className="mb-1 text-xs text-[#8ca0b3]">Execution Timeline</p>
                  <div className="max-h-40 space-y-1 overflow-auto rounded border border-white/10 bg-[#0f1824] p-2">
                    {timeline.length > 0 ? (
                      timeline.map((item) => (
                        <button
                          key={item.id || `${item.sender}-${item.created_at}`}
                          onClick={() => selectedTask?.topic_id && router.push(`/feed?topicId=${selectedTask.topic_id}`)}
                          className="w-full rounded border border-white/10 bg-[#111b28] p-1.5 text-left hover:border-[#2ea6ff]/60"
                        >
                          <p className="flex items-center gap-1 text-[10px] text-[#8ca0b3]">
                            <span>{item.sender}</span>
                            <span>·</span>
                            <span>{item.created_at?.replace('T', ' ').slice(0, 19)}</span>
                            <span className={`ml-auto rounded px-1 ${item.kind === 'reasoned' ? 'bg-[#214361] text-[#9fd6ff]' : item.kind === 'review' ? 'bg-[#3f3320] text-[#ffd792]' : 'bg-[#2a2f37] text-[#c3ced9]'}`}>
                              {item.kind === 'reasoned' ? 'AUTO' : item.kind === 'review' ? 'REVIEW' : 'MSG'}
                            </span>
                          </p>
                          <p className="mt-0.5 line-clamp-2 text-[11px] text-[#d8e5f2]">{item.content}</p>
                        </button>
                      ))
                    ) : (
                      <p className="text-[11px] text-[#7d8e9e]">No timeline yet</p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-[#8ca0b3]">Select a task card to review details.</p>
            )}
          </aside>
        </div>
      </div>

      {taskContextMenu && (
        <div
          className="fixed z-50 min-w-36 rounded-lg border border-white/15 bg-[#0f1824] p-1 shadow-2xl"
          style={{ left: taskContextMenu.x, top: taskContextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full rounded-md px-2 py-1.5 text-left text-xs text-[#ffb4b4] hover:bg-[#2a1718]"
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
      `}</style>
    </WttShellV2>
  )
}
