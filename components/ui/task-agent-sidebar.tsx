'use client'

import { useCallback, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import useSWR from 'swr'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'
import { AgentColumn, AgentItem, AgentSubAgentMap, AgentStatsMap } from './agent-column'

interface TaskAgentSidebarProps {
  agents: AgentItem[]
  selectedAgentId: string
  onSelectAgent: (agentId: string) => void
  currentUserName?: string
  /** Start collapsed */
  defaultCollapsed?: boolean
}

/**
 * Collapsible agent sidebar for task pages (code, research).
 * Fetches worker stats and recent tasks automatically.
 * Matches the feed page AgentColumn.
 */
export function TaskAgentSidebar({
  agents,
  selectedAgentId,
  onSelectAgent,
  currentUserName,
  defaultCollapsed = false,
}: TaskAgentSidebarProps) {
  const { data: session } = useSession()
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  const fetcher = useCallback(async (url: string) => {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${session?.accessToken ?? ''}` },
    })
    if (!res.ok) throw new Error('fetch failed')
    return res.json()
  }, [session?.accessToken])

  // Fetch recent tasks for worker grouping
  const { data: tasksData } = useSWR(
    session?.accessToken ? `${CLIENT_WTT_API_BASE}/tasks?limit=50&sort=updated_at&order=desc` : null,
    fetcher,
    { refreshInterval: 30_000 },
  )

  // Fetch agent stats
  const { data: statsData } = useSWR(
    session?.accessToken ? `${CLIENT_WTT_API_BASE}/agents/stats` : null,
    fetcher,
    { refreshInterval: 30_000 },
  )

  const agentSubAgents = useMemo<AgentSubAgentMap>(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tasks: any[] = Array.isArray(tasksData) ? tasksData : tasksData?.tasks ?? tasksData?.items ?? []
    const map: AgentSubAgentMap = {}
    for (const t of tasks) {
      const aid = t.owner_agent_id || t.runner_agent_id
      if (!aid) continue
      if (!map[aid]) map[aid] = []
      map[aid].push({ id: t.id, title: t.title || 'Untitled', task_type: t.task_type || 'general', status: t.status || 'todo' })
    }
    return map
  }, [tasksData])

  const agentStats = useMemo<AgentStatsMap>(() => {
    if (!statsData?.agents) return {}
    return statsData.agents
  }, [statsData])

  const onlineAgentIds = useMemo(() => {
    const arr: string[] = statsData?.online_agents ?? []
    return new Set(arr)
  }, [statsData])

  const maxSubAgents = statsData?.max_sub_agents ?? 20

  if (collapsed) {
    return (
      <div className="flex w-10 shrink-0 flex-col items-center border-r border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 py-3">
        <button
          onClick={() => setCollapsed(false)}
          className="mb-3 rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-700 hover:text-slate-600 dark:hover:text-zinc-200"
          title="Show Agents"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        {agents.map((a) => (
          <button
            key={a.agent_id}
            onClick={() => { onSelectAgent(a.agent_id); setCollapsed(false) }}
            className={`mb-1.5 flex h-7 w-7 items-center justify-center rounded-lg text-sm transition ${
              a.agent_id === selectedAgentId
                ? 'bg-indigo-100 dark:bg-indigo-900/50 ring-1 ring-indigo-400'
                : 'hover:bg-slate-100 dark:hover:bg-zinc-700'
            }`}
            title={a.display_name}
          >
            🤖
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="relative flex shrink-0 flex-col">
      <button
        onClick={() => setCollapsed(true)}
        className="absolute right-1 top-2 z-10 rounded p-0.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-700 hover:text-slate-600 dark:hover:text-zinc-200"
        title="Collapse"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M8 3L4 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
      <AgentColumn
        agents={agents}
        selectedAgentId={selectedAgentId}
        onSelectAgent={onSelectAgent}
        currentUserName={currentUserName}
        agentSubAgents={agentSubAgents}
        maxSubAgents={maxSubAgents}
        agentStats={agentStats}
        onlineAgentIds={onlineAgentIds}
      />
    </div>
  )
}
