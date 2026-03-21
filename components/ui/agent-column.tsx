'use client'

import { ChevronDown, ChevronRight, MoreVertical, Plus, Trash2, Edit3, User } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'

export interface AgentItem {
  agent_id: string
  display_name: string
  unread_count?: number
}

export interface SubAgentTask {
  id: string
  title: string
  task_type: string
  status: string
}

export interface AgentSubAgentMap {
  [agentId: string]: SubAgentTask[]
}

export interface AgentStatsMap {
  [agentId: string]: { total: number; active: number; done: number; todo: number }
}

export interface WorkerItem {
  id: string
  agent_id: string
  name: string
  description: string
  skills_config: string[]
  personality: string
  model_config: Record<string, string>
  status: string
  topic_id?: string
}

interface AgentColumnProps {
  agents: AgentItem[]
  selectedAgentId: string
  onSelectAgent: (agentId: string) => void
  onRenameAgent?: (agentId: string, currentName: string) => void
  onUnclaimAgent?: (agentId: string) => void
  onSelectWorkerTopic?: (topicId: string, workerSession?: { workerId: string; personaMd: string; workerMd: string; isFirstSession: boolean; personaChanged?: boolean }) => void
  currentUserName?: string
  agentSubAgents?: AgentSubAgentMap
  maxSubAgents?: number
  agentStats?: AgentStatsMap
  onlineAgentIds?: Set<string>
  onQuickCreate?: (type: 'code' | 'research' | 'general' | 'pipeline') => void
}

const ICON_MAP: [RegExp, string][] = [
  [/lobster|龙虾|虾/i, '🦞'],
  [/cat|猫(?!头鹰)/i, '🐱'],
  [/dog|狗|犬/i, '🐕'],
  [/dragon|龙(?!虾)/i, '🐲'],
  [/fox|狐/i, '🦊'],
  [/bear|熊(?!猫)/i, '🐻'],
  [/panda|熊猫/i, '🐼'],
  [/owl|猫头鹰/i, '🦉'],
  [/eagle|鹰/i, '🦅'],
  [/whale|鲸/i, '🐋'],
  [/shark|鲨/i, '🦈'],
  [/octopus|章鱼/i, '🐙'],
  [/monkey|猴/i, '🐒'],
  [/fish|鱼/i, '🐟'],
  [/bird|鸟/i, '🐦'],
  [/butterfly|蝴蝶/i, '🦋'],
  [/bee|蜜蜂/i, '🐝'],
  [/ant|蚂蚁/i, '🐜'],
  [/rabbit|兔/i, '🐰'],
  [/wolf|狼/i, '🐺'],
  [/snake|蛇/i, '🐍'],
  [/penguin|企鹅/i, '🐧'],
  [/star|星/i, '⭐'],
  [/flame|火/i, '🔥'],
  [/thunder|雷|闪电/i, '⚡'],
  [/robot|机器人|bot/i, '🤖'],
  [/assistant|助手/i, '🧑‍💻'],
]

function getAgentIcon(name: string): string {
  for (const [pattern, emoji] of ICON_MAP) {
    if (pattern.test(name)) return emoji
  }
  return '🤖'
}

function getStatusColor(status: string) {
  switch (status) {
    case 'doing': return 'bg-indigo-400 dark:bg-indigo-500'
    case 'review': return 'bg-amber-400 dark:bg-amber-500'
    case 'done': return 'bg-emerald-400 dark:bg-emerald-500'
    case 'todo': return 'bg-slate-300 dark:bg-zinc-500'
    default: return 'bg-slate-200 dark:bg-zinc-600'
  }
}

function getStatusRing(status: string) {
  switch (status) {
    case 'doing': return 'ring-indigo-300 dark:ring-indigo-600'
    case 'review': return 'ring-amber-300 dark:ring-amber-600'
    case 'done': return 'ring-emerald-300 dark:ring-emerald-600'
    default: return ''
  }
}

const WORKER_ICONS = ['🧑‍💻', '👷', '🔧', '🎯', '📝', '🔬', '💻', '🎨', '📊', '🛡️']
function getWorkerIcon(index: number): string {
  return WORKER_ICONS[index % WORKER_ICONS.length]
}

const API_BASE = CLIENT_WTT_API_BASE

export function AgentColumn({
  agents,
  selectedAgentId,
  onSelectAgent,
  onRenameAgent,
  onUnclaimAgent,
  onSelectWorkerTopic,
  currentUserName,
  agentSubAgents,
  maxSubAgents = 20,
  agentStats,
  onlineAgentIds,
  onQuickCreate,
}: AgentColumnProps) {
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set())
  const [workersByAgent, setWorkersByAgent] = useState<Record<string, WorkerItem[]>>({})
  const [workerMenuFor, setWorkerMenuFor] = useState<string | null>(null)
  const [addingWorkerFor, setAddingWorkerFor] = useState<string | null>(null)
  const [newWorkerName, setNewWorkerName] = useState('')
  const [renamingWorker, setRenamingWorker] = useState<{ id: string; name: string } | null>(null)
  const [editingConfig, setEditingConfig] = useState<{ worker: WorkerItem; agentId: string } | null>(null)
  const [personaMd, setPersonaMd] = useState('')
  const [personaLoading, setPersonaLoading] = useState(false)

  const fetchWorkers = useCallback(async (agentId: string) => {
    try {
      const res = await fetch(`${API_BASE}/workers?agent_id=${agentId}`, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setWorkersByAgent(prev => ({ ...prev, [agentId]: data }))
      }
    } catch {}
  }, [])

  // Fetch workers when an agent is expanded
  useEffect(() => {
    expandedAgents.forEach(agentId => {
      if (!workersByAgent[agentId]) fetchWorkers(agentId)
    })
  }, [expandedAgents, fetchWorkers, workersByAgent])

  const toggleExpand = (agentId: string) => {
    setExpandedAgents(prev => {
      const next = new Set(prev)
      if (next.has(agentId)) next.delete(agentId)
      else next.add(agentId)
      return next
    })
  }

  const [creatingWorker, setCreatingWorker] = useState(false)

  const handleCreateWorker = async (agentId: string) => {
    if (!newWorkerName.trim() || creatingWorker) return
    setCreatingWorker(true)
    try {
      const res = await fetch(`${API_BASE}/workers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          agent_id: agentId,
          name: newWorkerName.trim(),
          skills_config: [],
          personality: '',
          model_config: {},
        }),
      })
      if (res.ok) await fetchWorkers(agentId)
    } catch {
      // silently ignore network errors
    } finally {
      setNewWorkerName('')
      setAddingWorkerFor(null)
      setCreatingWorker(false)
    }
  }

  const handleRenameWorker = async (workerId: string, newName: string, agentId: string) => {
    if (!newName.trim()) return
    try {
      await fetch(`${API_BASE}/workers/${workerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: newName.trim() }),
      })
      fetchWorkers(agentId)
    } catch {}
    setRenamingWorker(null)
  }

  const handleDeleteWorker = async (workerId: string, agentId: string) => {
    if (!confirm('Delete this worker?')) return
    try {
      await fetch(`${API_BASE}/workers/${workerId}`, { method: 'DELETE', credentials: 'include' })
      fetchWorkers(agentId)
    } catch {}
    setWorkerMenuFor(null)
  }

  const openPersonaEditor = async (worker: WorkerItem, agentId: string) => {
    setEditingConfig({ worker, agentId })
    setWorkerMenuFor(null)
    setPersonaLoading(true)
    try {
      const res = await fetch(`${API_BASE}/workers/${worker.id}/persona`, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setPersonaMd(data.persona_md || '')
      }
    } catch {}
    setPersonaLoading(false)
  }

  const savePersona = async () => {
    if (!editingConfig) return
    const { worker, agentId } = editingConfig
    try {
      await fetch(`${API_BASE}/workers/${worker.id}/persona`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ persona_md: personaMd }),
      })
      fetchWorkers(agentId)
    } catch {}
    setEditingConfig(null)
  }

  // Close menus on outside click
  useEffect(() => {
    const handler = () => { setMenuFor(null); setWorkerMenuFor(null) }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

  return (
    <div className="flex h-full w-[200px] flex-col border-r border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
      <div className="border-b border-slate-200 dark:border-zinc-700 px-3 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Agents</p>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {currentUserName && (
          <div className="mb-2 rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-2 py-2.5">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 dark:bg-zinc-600 text-white">
                <User className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900 dark:text-zinc-100">{currentUserName}</p>
                <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-zinc-400">Logged-in User</p>
              </div>
            </div>
          </div>
        )}

        {agents.length === 0 && <p className="px-2 py-4 text-xs text-slate-400">No agents bound</p>}

        {agents.map((agent) => {
          const isSelected = agent.agent_id === selectedAgentId
          const isMenuOpen = menuFor === agent.agent_id
          const isExpanded = expandedAgents.has(agent.agent_id)
          const agentIcon = getAgentIcon(agent.display_name)
          const tasks = agentSubAgents?.[agent.agent_id] ?? []
          const workers = workersByAgent[agent.agent_id] ?? []
          const stats = agentStats?.[agent.agent_id]
          const activeCount = stats?.active ?? tasks.filter(t => t.status === 'doing').length
          const totalCount = stats?.total ?? tasks.length
          const isOnline = onlineAgentIds?.has(agent.agent_id) ?? false

          return (
            <div
              key={agent.agent_id}
              className={`relative mt-1 rounded-lg transition-colors ${
                isSelected
                  ? 'bg-indigo-50/70 dark:bg-indigo-950/30'
                  : 'hover:bg-slate-50 dark:hover:bg-zinc-800'
              }`}
              onContextMenu={(e) => {
                e.preventDefault()
                setMenuFor(agent.agent_id)
              }}
            >
              {/* Main agent row */}
              <div className="flex items-center">
                <button
                  onClick={() => toggleExpand(agent.agent_id)}
                  className="shrink-0 pl-1.5 pr-0.5 py-3 text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300"
                  title={isExpanded ? 'Collapse' : 'Expand'}
                >
                  {isExpanded
                    ? <ChevronDown className="h-3 w-3" />
                    : <ChevronRight className="h-3 w-3" />
                  }
                </button>

                <button
                  onClick={() => onSelectAgent(agent.agent_id)}
                  className={`flex flex-1 items-center gap-2.5 rounded-lg pr-1 py-2 text-left transition ${
                    isSelected
                      ? 'text-indigo-600 dark:text-indigo-400'
                      : 'text-slate-600 dark:text-zinc-300 hover:text-slate-800 dark:hover:text-zinc-100'
                  }`}
                >
                  <div
                    className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl transition-all ${
                      isSelected
                        ? 'bg-indigo-100 dark:bg-indigo-900/50 shadow-sm ring-1 ring-indigo-200 dark:ring-indigo-800'
                        : 'bg-slate-100 dark:bg-zinc-800'
                    }`}
                  >
                    {agentIcon}
                    <span
                      className={`absolute -bottom-0.5 -left-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-zinc-900 ${
                        isOnline
                          ? 'bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.5)]'
                          : 'bg-slate-300 dark:bg-zinc-600'
                      }`}
                      title={isOnline ? 'Online' : 'Offline'}
                    />
                    {activeCount > 0 && (
                      <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-indigo-500 text-[7px] font-bold text-white ring-2 ring-white dark:ring-zinc-900">
                        {activeCount}
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold leading-tight">{agent.display_name}</p>
                    {/* Compact dot grid (collapsed) */}
                    {!isExpanded && totalCount > 0 && (
                      <div className="mt-1 flex flex-wrap gap-[3px]">
                        {tasks.slice(0, maxSubAgents).map((t) => {
                          const isTaskActive = t.status === 'doing'
                          return (
                            <span
                              key={t.id}
                              title={`${t.title} (${t.status})`}
                              className={`inline-block rounded-full transition ${getStatusColor(t.status)} ${
                                isTaskActive
                                  ? 'h-[8px] w-[8px] ring-1 ' + getStatusRing(t.status) + ' shadow-[0_0_4px_rgba(99,102,241,0.4)]'
                                  : 'h-[6px] w-[6px]'
                              }`}
                            />
                          )
                        })}
                      </div>
                    )}
                    {!isExpanded && (
                      <p className="mt-0.5 text-[9px] text-slate-400 dark:text-zinc-500">
                        {activeCount > 0
                          ? <><span className="font-semibold text-indigo-500 dark:text-indigo-400">{activeCount} active</span> · </>
                          : null
                        }
                        {workers.length} workers · {totalCount} tasks
                      </p>
                    )}
                    {agent.unread_count && agent.unread_count > 0 ? (
                      <span className="mt-0.5 inline-block rounded-full bg-indigo-500 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                        {agent.unread_count}
                      </span>
                    ) : null}
                  </div>

                  <span
                    className="shrink-0 text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300"
                    onClick={(e) => { e.stopPropagation(); setMenuFor(agent.agent_id) }}
                  >
                    <MoreVertical className="h-3.5 w-3.5" />
                  </span>
                </button>
              </div>

              {/* Expanded: Workers list */}
              {isExpanded && (
                <div className="pb-2 pl-5 pr-2 space-y-0.5">
                  {/* Workers section */}
                  {workers.length > 0 && (
                    <>
                      <p className="px-2 pt-1 pb-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                        Workers
                      </p>
                      {workers.map((w, idx) => (
                        <div
                          key={w.id}
                          className="group relative flex items-center gap-1.5 rounded-md px-2 py-1.5 hover:bg-white/80 dark:hover:bg-zinc-700/50 cursor-pointer"
                          onClick={async () => {
                            if (renamingWorker?.id === w.id) return
                            if (w.topic_id && onSelectWorkerTopic) {
                              // Still fetch session to get worker_md context
                              try {
                                const res = await fetch(`${API_BASE}/workers/${w.id}/session`, { method: 'POST', credentials: 'include' })
                                if (res.ok) {
                                  const data = await res.json()
                                  onSelectWorkerTopic(w.topic_id, {
                                    workerId: w.id,
                                    personaMd: data.persona_md || '',
                                    workerMd: data.worker_md || '',
                                    isFirstSession: data.is_first_session ?? false,
                                    personaChanged: data.persona_changed ?? false,
                                  })
                                  return
                                }
                              } catch { /* fallback below */ }
                              onSelectWorkerTopic(w.topic_id)
                              return
                            }
                            // Ensure session topic exists
                            try {
                              const res = await fetch(`${API_BASE}/workers/${w.id}/session`, { method: 'POST', credentials: 'include' })
                              if (res.ok) {
                                const data = await res.json()
                                if (data.topic_id) {
                                  setWorkersByAgent(prev => {
                                    const agentWorkers = prev[agent.agent_id] || []
                                    return { ...prev, [agent.agent_id]: agentWorkers.map(wk => wk.id === w.id ? { ...wk, topic_id: data.topic_id } : wk) }
                                  })
                                  onSelectWorkerTopic?.(data.topic_id, {
                                    workerId: w.id,
                                    personaMd: data.persona_md || '',
                                    workerMd: data.worker_md || '',
                                    isFirstSession: data.is_first_session ?? false,
                                    personaChanged: data.persona_changed ?? false,
                                  })
                                }
                              }
                            } catch { /* ignore */ }
                          }}
                          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setWorkerMenuFor(w.id) }}
                        >
                          {renamingWorker?.id === w.id ? (
                            <input
                              autoFocus
                              className="flex-1 rounded border border-indigo-300 bg-white dark:bg-zinc-800 px-1.5 py-0.5 text-[11px] text-slate-700 dark:text-zinc-200 outline-none"
                              value={renamingWorker.name}
                              onChange={(e) => setRenamingWorker({ ...renamingWorker, name: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleRenameWorker(w.id, renamingWorker.name, agent.agent_id)
                                if (e.key === 'Escape') setRenamingWorker(null)
                              }}
                            />
                          ) : (
                            <>
                              <span className="text-[11px]">{getWorkerIcon(idx)}</span>
                              <span className="flex-1 truncate text-[11px] font-medium text-slate-600 dark:text-zinc-300">
                                {w.name}
                              </span>
                              {w.skills_config?.length > 0 && (
                                <span className="text-[8px] text-slate-400 dark:text-zinc-500">{w.skills_config.length} skills</span>
                              )}
                              <span
                                className="invisible group-hover:visible shrink-0 text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300"
                                onClick={(e) => { e.stopPropagation(); setWorkerMenuFor(w.id) }}
                              >
                                <MoreVertical className="h-3 w-3" />
                              </span>
                            </>
                          )}

                          {/* Worker context menu */}
                          {workerMenuFor === w.id && (
                            <div
                              className="absolute right-0 top-6 z-40 w-32 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-1 shadow-lg"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-[11px] text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700"
                                onClick={() => { setWorkerMenuFor(null); setRenamingWorker({ id: w.id, name: w.name }) }}
                              >
                                <Edit3 className="h-3 w-3" /> Rename
                              </button>
                              <button
                                className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-[11px] text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700"
                                onClick={() => openPersonaEditor(w, agent.agent_id)}
                              >
                                <Edit3 className="h-3 w-3" /> Edit Persona
                              </button>
                              <button
                                className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-[11px] text-red-500 hover:bg-slate-100 dark:hover:bg-zinc-700"
                                onClick={() => handleDeleteWorker(w.id, agent.agent_id)}
                              >
                                <Trash2 className="h-3 w-3" /> Delete
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </>
                  )}

                  {/* Tasks section removed — tasks are managed in dedicated pages */}

                  {/* Add Worker inline form */}
                  {addingWorkerFor === agent.agent_id ? (
                    <div className="mt-1 flex items-center gap-1 px-1">
                      <input
                        autoFocus
                        className="flex-1 rounded border border-indigo-300 bg-white dark:bg-zinc-800 px-2 py-1 text-[11px] text-slate-700 dark:text-zinc-200 outline-none placeholder:text-slate-400"
                        placeholder="Worker name…"
                        value={newWorkerName}
                        onChange={(e) => setNewWorkerName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleCreateWorker(agent.agent_id)
                          if (e.key === 'Escape') { setAddingWorkerFor(null); setNewWorkerName('') }
                        }}
                      />
                      <button
                        className="rounded bg-indigo-500 px-2 py-1 text-[10px] font-semibold text-white hover:bg-indigo-600 disabled:opacity-50"
                        onClick={() => handleCreateWorker(agent.agent_id)}
                        disabled={creatingWorker}
                      >
                        {creatingWorker ? '...' : 'Add'}
                      </button>
                    </div>
                  ) : (
                    <button
                      className="mt-1 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium text-indigo-500 dark:text-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 transition"
                      onClick={() => setAddingWorkerFor(agent.agent_id)}
                    >
                      <Plus className="h-3 w-3" /> Add Worker
                    </button>
                  )}

                  <p className="px-2 pt-1 text-[9px] text-slate-300 dark:text-zinc-600">
                    {workers.length} workers · {totalCount} tasks
                  </p>
                </div>
              )}

              {/* Agent context menu */}
              {isMenuOpen && (
                <div className="absolute right-1 top-12 z-30 w-36 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-1 shadow-lg">
                  <button
                    className="w-full rounded px-2 py-1.5 text-left text-xs text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700"
                    onClick={() => {
                      setMenuFor(null)
                      onRenameAgent?.(agent.agent_id, agent.display_name)
                    }}
                  >
                    Rename
                  </button>
                  <button
                    className="w-full rounded px-2 py-1.5 text-left text-xs text-red-500 hover:bg-slate-100 dark:hover:bg-zinc-700"
                    onClick={() => {
                      setMenuFor(null)
                      onUnclaimAgent?.(agent.agent_id)
                    }}
                  >
                    Unclaim
                  </button>
                  <button
                    className="w-full rounded px-2 py-1.5 text-left text-xs text-slate-400 dark:text-zinc-500 hover:bg-slate-100 dark:hover:bg-zinc-700"
                    onClick={() => setMenuFor(null)}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Quick Create */}
      {onQuickCreate && (
        <div className="border-t border-slate-200 dark:border-zinc-700 px-2 py-2 space-y-1">
          <p className="px-1 text-[9px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500">Quick Create</p>
          <div className="grid grid-cols-2 gap-1">
            {([
              { type: 'general' as const, icon: '💬', label: 'Chat' },
              { type: 'code' as const, icon: '💻', label: 'Code' },
              { type: 'research' as const, icon: '🔬', label: 'Research' },
              { type: 'pipeline' as const, icon: '🔗', label: 'Pipeline' },
            ]).map((item) => (
              <button
                key={item.type}
                onClick={() => onQuickCreate(item.type)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1.5 text-left text-[11px] font-semibold text-slate-800 dark:text-zinc-100 transition hover:bg-slate-50 dark:hover:bg-zinc-700 hover:border-slate-300 dark:hover:border-zinc-600 active:scale-95"
                title={`New ${item.label}`}
              >
                <span className="text-xs">{item.icon}</span>
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Worker Persona Editor Modal */}
      {editingConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setEditingConfig(null)}>
          <div className="w-[520px] max-h-[80vh] flex flex-col rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-zinc-100">📝 Worker Persona</h3>
              <button onClick={() => setEditingConfig(null)} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>
            </div>
            <p className="px-4 text-xs text-slate-500 dark:text-zinc-400 truncate">👷 {editingConfig.worker.name} — worker.md</p>

            <div className="flex-1 overflow-hidden px-4 pt-2 pb-3">
              {personaLoading ? (
                <div className="flex items-center justify-center h-40 text-xs text-slate-400">Loading...</div>
              ) : (
                <textarea
                  value={personaMd}
                  onChange={e => setPersonaMd(e.target.value)}
                  className="w-full h-[400px] rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-3 py-2.5 text-xs text-slate-700 dark:text-zinc-200 outline-none resize-none font-mono leading-relaxed focus:border-indigo-300 dark:focus:border-indigo-600 transition"
                  placeholder={`# ${editingConfig.worker.name}\n\n## Personality\nDescribe this worker's behavior...\n\n## Skills\n- skill_1\n- skill_2\n\n## Memory\nKey facts to remember...\n\n## Notes\nAdditional context...`}
                  spellCheck={false}
                />
              )}
            </div>

            <div className="flex items-center justify-between px-4 pb-4">
              <span className="text-[10px] text-slate-400 dark:text-zinc-500">
                Sections: Personality · Skills · Memory · Notes
              </span>
              <div className="flex gap-2">
                <button
                  onClick={savePersona}
                  className="rounded-lg bg-indigo-500 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-600 transition"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingConfig(null)}
                  className="rounded-lg border border-slate-200 dark:border-zinc-700 px-3 py-2 text-xs text-slate-500 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-800 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
