'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'

interface AgentBinding {
  agent_id: string
  display_name: string
}

interface TopicRow {
  id: string
  name: string
  type: string
  creator_agent_id?: string
  member_agent_ids?: string[]
  my_role?: string
  task_id?: string | null
  is_active?: boolean
}

interface TaskRow {
  id: string
  title: string
  status: string
  task_type?: string
  topic_id?: string | null
  created_by?: string
  owner_agent_id?: string
  runner_agent_id?: string
}

export default function AdminManagePage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [agents, setAgents] = useState<AgentBinding[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [topics, setTopics] = useState<TopicRow[]>([])
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [keyword, setKeyword] = useState('')
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([])
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([])
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  const headers = useMemo(
    () => ({ Authorization: `Bearer ${session?.accessToken ?? ''}` }),
    [session?.accessToken]
  )

  const loadAll = async () => {
    if (!session?.accessToken) return
    try {
      const adminRes = await fetch(`${CLIENT_WTT_API_BASE}/manager/admin/overview?limit=800`, { headers })
      if (!adminRes.ok) {
        throw new Error(`admin overview failed: ${adminRes.status}`)
      }
      const data = await adminRes.json()

      const normalizedAgents = Array.isArray(data?.agents)
        ? data.agents
            .map((x: unknown) => String(x || '').trim())
            .filter(Boolean)
            .map((id: string) => ({ agent_id: id, display_name: id }))
        : []
      setAgents(normalizedAgents)
      setSelectedAgentId((prev) => (prev && normalizedAgents.some((a: { agent_id: string }) => a.agent_id === prev) ? prev : ''))

      setTopics(Array.isArray(data?.topics) ? data.topics : [])
      setTasks(Array.isArray(data?.tasks) ? data.tasks : [])
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.accessToken])

  const filteredTopics = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    return topics.filter((t) => {
      const byKeyword = !q || `${t.name} ${t.id} ${t.creator_agent_id || ''} ${(t.member_agent_ids || []).join(' ')} ${t.type || ''}`.toLowerCase().includes(q)
      if (!byKeyword) return false
      if (!selectedAgentId) return true
      const members = Array.isArray(t.member_agent_ids) ? t.member_agent_ids : []
      return t.creator_agent_id === selectedAgentId || members.includes(selectedAgentId)
    })
  }, [topics, keyword, selectedAgentId])

  const filteredTasks = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    return tasks.filter((t) => {
      const byKeyword = !q || `${t.title} ${t.id} ${t.created_by || ''} ${t.status || ''} ${t.owner_agent_id || ''} ${t.runner_agent_id || ''}`.toLowerCase().includes(q)
      if (!byKeyword) return false
      if (!selectedAgentId) return true
      return t.created_by === selectedAgentId || t.owner_agent_id === selectedAgentId || t.runner_agent_id === selectedAgentId
    })
  }, [tasks, keyword, selectedAgentId])

  const toggleTopic = (id: string) => {
    setSelectedTopicIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const toggleTask = (id: string) => {
    setSelectedTaskIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const toggleAgent = (id: string) => {
    setSelectedAgentIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const bulkDeleteAgents = async () => {
    if (!selectedAgentIds.length) return
    const ack = prompt(`将删除 ${selectedAgentIds.length} 个 agent 绑定/成员关系。请输入 DELETE 确认：`)
    if (ack !== 'DELETE') return

    setBusy(true)
    try {
      await Promise.allSettled(
        selectedAgentIds.map((id) =>
          fetch(`${CLIENT_WTT_API_BASE}/manager/admin/agents/${id}?hard=true`, {
            method: 'DELETE',
            headers,
          })
        )
      )
      setSelectedAgentIds([])
      await loadAll()
    } finally {
      setBusy(false)
    }
  }

  const bulkDeleteTopics = async () => {
    if (!selectedTopicIds.length) return
    const ack = prompt(`将删除 ${selectedTopicIds.length} 个 topic。请输入 DELETE 确认：`)
    if (ack !== 'DELETE') return

    setBusy(true)
    try {
      await Promise.allSettled(
        selectedTopicIds.map((id) =>
          fetch(`${CLIENT_WTT_API_BASE}/manager/admin/topics/${id}?hard=true`, {
            method: 'DELETE',
            headers,
          })
        )
      )
      setSelectedTopicIds([])
      await loadAll()
    } finally {
      setBusy(false)
    }
  }

  const bulkDeleteTasks = async () => {
    if (!selectedTaskIds.length) return
    const ack = prompt(`将取消/删除 ${selectedTaskIds.length} 个 task（含关联topic删除）。请输入 DELETE 确认：`)
    if (ack !== 'DELETE') return

    setBusy(true)
    try {
      await Promise.allSettled(
        selectedTaskIds.map((id) =>
          fetch(`${CLIENT_WTT_API_BASE}/manager/admin/tasks/${id}?delete_topic=true&hard=true`, {
            method: 'DELETE',
            headers,
          })
        )
      )
      setSelectedTaskIds([])
      await loadAll()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Admin / Manage Cleanup</h1>
      <p className="text-sm text-slate-500">
        登录方式：先访问 <span className="font-mono">/login</span> 登录，再进入此页面执行批量清理。
        注意：此页需要后端配置管理员白名单（环境变量 <span className="font-mono">WTT_ADMIN_USER_IDS</span>）。
      </p>

      <div className="rounded-lg border border-slate-200 bg-white p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="按标题/ID/创建者筛选"
          className="rounded border border-slate-300 px-3 py-2 text-sm md:col-span-2"
        />
        <select
          value={selectedAgentId}
          onChange={(e) => setSelectedAgentId(e.target.value)}
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All agents</option>
          {agents.map((a) => (
            <option key={a.agent_id} value={a.agent_id}>
              {a.display_name} ({a.agent_id})
            </option>
          ))}
        </select>
        <button onClick={loadAll} className="rounded bg-slate-900 text-white px-3 py-2 text-sm">刷新</button>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium">Agents ({agents.length})</h2>
          <button
            onClick={bulkDeleteAgents}
            disabled={busy || !selectedAgentIds.length}
            className="rounded bg-red-600 disabled:opacity-40 text-white px-3 py-1.5 text-sm"
          >
            删除选中 Agents ({selectedAgentIds.length})
          </button>
        </div>
        <div className="max-h-[220px] overflow-auto space-y-2">
          {agents.map((a) => (
            <label key={a.agent_id} className="flex items-start gap-2 rounded border border-slate-200 p-2 text-sm">
              <input type="checkbox" checked={selectedAgentIds.includes(a.agent_id)} onChange={() => toggleAgent(a.agent_id)} />
              <div className="min-w-0">
                <div className="truncate font-medium">{a.display_name}</div>
                <div className="text-xs text-slate-500 truncate">{a.agent_id}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium">Topics ({filteredTopics.length})</h2>
            <button
              onClick={bulkDeleteTopics}
              disabled={busy || !selectedTopicIds.length}
              className="rounded bg-red-600 disabled:opacity-40 text-white px-3 py-1.5 text-sm"
            >
              删除选中 Topics ({selectedTopicIds.length})
            </button>
          </div>
          <div className="max-h-[420px] overflow-auto space-y-2">
            {filteredTopics.map((t) => (
              <label key={t.id} className="flex items-start gap-2 rounded border border-slate-200 p-2 text-sm">
                <input type="checkbox" checked={selectedTopicIds.includes(t.id)} onChange={() => toggleTopic(t.id)} />
                <div className="min-w-0">
                  <div className="truncate font-medium">{t.name}</div>
                  <div className="text-xs text-slate-500 truncate">{t.id} · {t.type} · creator {t.creator_agent_id || '-'} · members {(t.member_agent_ids || []).length}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium">Tasks ({filteredTasks.length})</h2>
            <button
              onClick={bulkDeleteTasks}
              disabled={busy || !selectedTaskIds.length}
              className="rounded bg-red-600 disabled:opacity-40 text-white px-3 py-1.5 text-sm"
            >
              删除选中 Tasks ({selectedTaskIds.length})
            </button>
          </div>
          <div className="max-h-[420px] overflow-auto space-y-2">
            {filteredTasks.map((t) => (
              <label key={t.id} className="flex items-start gap-2 rounded border border-slate-200 p-2 text-sm">
                <input type="checkbox" checked={selectedTaskIds.includes(t.id)} onChange={() => toggleTask(t.id)} />
                <div className="min-w-0">
                  <div className="truncate font-medium">{t.title}</div>
                  <div className="text-xs text-slate-500 truncate">{t.id} · {t.status} · {t.task_type || '-'} · topic {t.topic_id || '-'}</div>
                </div>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
