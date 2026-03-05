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
  updated_at?: string
}

const columns: Array<TaskItem['status']> = ['todo', 'doing', 'review', 'blocked']

export default function TasksPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null)
  const [taskDraft, setTaskDraft] = useState<Partial<TaskItem>>({})
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null)

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

  const { data: subscribedTopicsRaw } = useSWR(
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

  const grouped = useMemo(() => {
    const map: Record<string, TaskItem[]> = { todo: [], doing: [], review: [], blocked: [] }
    for (const t of tasks) {
      if (t.status in map) map[t.status].push(t)
    }
    return map
  }, [tasks])

  const statusProgress = (status: TaskItem['status']) => {
    if (status === 'todo') return 5
    if (status === 'doing') return 55
    if (status === 'review') return 90
    if (status === 'done') return 100
    return 0
  }

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
          runner_agent_id: selectedTask.runner_agent_id || selectedTask.owner_agent_id || selectedAgentId || 'openclaw_mcp_test_agent',
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
    await fetch(`${CLIENT_WTT_API_BASE}/tasks/${selectedTask.id}/review`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.accessToken ?? ''}`,
      },
      body: JSON.stringify({ action, reviewer: selectedAgentId || 'reviewer' }),
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

  return (
    <WttShellV2
      agents={agentItems}
      selectedAgentId={selectedAgentId}
      onAgentChange={setSelectedAgentId}
      topics={topics}
      selectedTopicId={null}
      onTopicChange={(topicId) => router.push(topicId ? `/feed?topicId=${topicId}` : '/feed')}
      onLogout={() => signOut({ callbackUrl: '/login' })}
    >
      <div className="h-full p-4 text-[#e8edf2]">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Tasks</h1>
            <p className="text-xs text-[#8ca0b3]">Trigger · Assign · Review</p>
          </div>
          <button onClick={createTask} className="rounded-lg bg-[#2ea6ff] px-3 py-2 text-sm text-white">+ New Task</button>
        </div>

        <div className="grid h-[calc(100%-52px)] grid-cols-[1fr_320px] gap-3">
          <div className="grid grid-cols-4 gap-3">
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
                      className="w-full rounded-lg border border-white/10 bg-[#111a25] p-2 text-left hover:border-[#2ea6ff]/60"
                    >
                      <p className="text-sm font-medium leading-5">{task.title}</p>
                      <p className="mt-1 text-[10px] text-[#8ca0b3]">{task.priority} · owner:{task.owner_agent_id || 'unassigned'} · runner:{task.runner_agent_id || '-'}</p>
                      <div className="mt-1 h-1.5 w-full rounded bg-[#26384a]">
                        <div className="h-1.5 rounded bg-[#2ea6ff]" style={{ width: `${statusProgress(task.status)}%` }} />
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

          <aside className="rounded-xl border border-white/10 bg-[#16202c] p-3">
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
    </WttShellV2>
  )
}
