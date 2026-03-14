'use client'

import { ChevronDown, ChevronRight, MoreVertical, User } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

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

const MAX_SUB_AGENTS = 20

interface AgentColumnProps {
  agents: AgentItem[]
  selectedAgentId: string
  onSelectAgent: (agentId: string) => void
  onRenameAgent?: (agentId: string, currentName: string) => void
  onUnclaimAgent?: (agentId: string) => void
  currentUserName?: string
  agentSubAgents?: AgentSubAgentMap
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

export function AgentColumn({
  agents,
  selectedAgentId,
  onSelectAgent,
  onRenameAgent,
  onUnclaimAgent,
  currentUserName,
  agentSubAgents,
}: AgentColumnProps) {
  const router = useRouter()
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set())

  const toggleExpand = (agentId: string) => {
    setExpandedAgents(prev => {
      const next = new Set(prev)
      if (next.has(agentId)) next.delete(agentId)
      else next.add(agentId)
      return next
    })
  }

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
          const activeCount = tasks.filter(t => t.status === 'doing' || t.status === 'review').length
          const totalCount = tasks.length

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
                  title={isExpanded ? 'Collapse' : `Expand ${totalCount} sub-agents`}
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
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl transition-all ${
                      isSelected
                        ? 'bg-indigo-100 dark:bg-indigo-900/50 shadow-sm ring-1 ring-indigo-200 dark:ring-indigo-800'
                        : 'bg-slate-100 dark:bg-zinc-800'
                    }`}
                  >
                    {agentIcon}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold leading-tight">{agent.display_name}</p>
                    {/* Compact sub-agent dot grid (collapsed view) */}
                    {!isExpanded && totalCount > 0 && (
                      <div className="mt-1 flex flex-wrap gap-[3px]">
                        {tasks.slice(0, MAX_SUB_AGENTS).map((t) => (
                          <span
                            key={t.id}
                            title={`${t.title} (${t.status})`}
                            className={`inline-block h-[6px] w-[6px] rounded-full transition ${getStatusColor(t.status)} ${
                              (t.status === 'doing' || t.status === 'review') ? 'ring-1 ' + getStatusRing(t.status) : ''
                            }`}
                          />
                        ))}
                        {/* Empty slots */}
                        {Array.from({ length: Math.max(0, Math.min(MAX_SUB_AGENTS, 8) - totalCount) }).map((_, i) => (
                          <span
                            key={`empty-${i}`}
                            className="inline-block h-[6px] w-[6px] rounded-full bg-slate-100 dark:bg-zinc-700"
                          />
                        ))}
                      </div>
                    )}
                    {!isExpanded && totalCount > 0 && (
                      <p className="mt-0.5 text-[9px] text-slate-400 dark:text-zinc-500">
                        {activeCount > 0 ? `${activeCount} active · ` : ''}{totalCount}/{MAX_SUB_AGENTS}
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

              {/* Expanded: each task as a sub-agent */}
              {isExpanded && (
                <div className="pb-2 pl-5 pr-2 space-y-0.5">
                  {tasks.length === 0 && (
                    <p className="px-2 py-1.5 text-[10px] text-slate-400 dark:text-zinc-500 italic">No sub-agents yet</p>
                  )}
                  {tasks.slice(0, MAX_SUB_AGENTS).map((t) => {
                    const isActive = t.status === 'doing' || t.status === 'review'
                    const isDone = t.status === 'done'
                    const href = t.task_type === 'code' ? `/tasks/code/${t.id}`
                      : t.task_type === 'research' ? `/tasks/research/${t.id}`
                      : t.task_type === 'pipeline' ? '/pipelines'
                      : `/tasks`
                    return (
                      <button
                        key={t.id}
                        onClick={() => router.push(href)}
                        className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left transition hover:bg-white/80 dark:hover:bg-zinc-700/50 ${
                          isActive ? 'bg-white/60 dark:bg-zinc-700/30' : ''
                        }`}
                        title={`${t.title} — ${t.status}`}
                      >
                        <span className={`text-[11px] transition ${isDone ? 'opacity-40' : isActive ? '' : 'opacity-60'}`}>
                          {agentIcon}
                        </span>
                        <span className={`flex-1 truncate text-[11px] font-medium ${
                          isActive
                            ? 'text-slate-700 dark:text-zinc-200'
                            : isDone
                              ? 'text-slate-400 dark:text-zinc-500 line-through'
                              : 'text-slate-500 dark:text-zinc-400'
                        }`}>
                          {t.title}
                        </span>
                        <span className={`shrink-0 h-[6px] w-[6px] rounded-full ${getStatusColor(t.status)} ${
                          isActive ? 'ring-1 ' + getStatusRing(t.status) : ''
                        }`} />
                      </button>
                    )
                  })}
                  {/* Empty slot indicator */}
                  {totalCount < MAX_SUB_AGENTS && (
                    <p className="px-2 pt-0.5 text-[9px] text-slate-300 dark:text-zinc-600">
                      {MAX_SUB_AGENTS - totalCount} slots available
                    </p>
                  )}
                </div>
              )}

              {/* Context menu */}
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
    </div>
  )
}
