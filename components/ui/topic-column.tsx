'use client'

import { ChevronLeft, MoreVertical } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import {
  AGENT_ROLE_TEMPLATES,
  getAgentRoleTemplate,
  type AgentRoleTemplateId,
} from '@/lib/agent-role-templates'
import { useI18n } from '@/lib/i18n-provider'

export interface TopicItem {
  topic_id: string
  name: string
  topic_type: 'broadcast' | 'discussion' | 'p2p' | 'collaborative'
  unread_count?: number
  can_delete?: boolean
  task_id?: string
  task_type?: string
  task_mode?: string
  exec_mode?: string
  runner_agent_id?: string
  is_default_p2p?: boolean
  last_activity_at?: string
  description?: string
  creator_agent_id?: string
}

interface AgentOption {
  agent_id: string
  display_name: string
}

interface TopicColumnProps {
  topics: TopicItem[]
  selectedTopicId: string | null
  onSelectTopic: (topicId: string | null) => void
  onLeaveTopic?: (topicId: string) => void
  onDeleteTopic?: (topicId: string) => void
  onCreateP2P?: (targetAgentId: string) => void | Promise<void>
  onRequestDiscuss?: (targetAgentId: string, topicName: string) => void | Promise<void>
  pinScopeKey?: string
  agentOptions?: AgentOption[]
  selectedAgentId?: string
  onSelectAgent?: (agentId: string) => void
  isSelectedAgentOnline?: boolean
  onlineAgentIds?: Set<string>
  agentRoleMap?: Record<string, string>
  onAssignAgentRole?: (agentId: string, roleId: AgentRoleTemplateId) => void
  onRenameAgent?: (agentId: string, currentName: string) => void
  onUnclaimAgent?: (agentId: string) => void
  onCreateGeneralTask?: () => void
  onToggleSidebar?: () => void
  localLibrarySlot?: ReactNode
}

function agentInitial(name: string) {
  return (name.trim()[0] || 'A').toUpperCase()
}

export function TopicColumn(props: TopicColumnProps) {
  const {
    agentOptions = [],
    selectedAgentId = '',
    onSelectAgent,
    isSelectedAgentOnline = false,
    onlineAgentIds,
    agentRoleMap,
    onAssignAgentRole,
    onRenameAgent,
    onUnclaimAgent,
    onToggleSidebar,
  } = props
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const { locale, t } = useI18n()
  const zh = locale === 'zh'

  const isAgentOnline = (agentId: string) => {
    if (onlineAgentIds) return onlineAgentIds.has(agentId)
    return agentId === selectedAgentId ? isSelectedAgentOnline : false
  }

  return (
    <aside className="flex w-[292px] shrink-0 flex-col border-r border-[#e3ddd2] bg-[#f6f3ed] text-slate-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="flex items-center justify-between border-b border-[#e7e1d7] px-4 py-3 dark:border-zinc-800">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.22em] text-slate-400 dark:text-zinc-500">
            {zh ? '已 Claim Agent' : 'Claimed Agents'}
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-600 dark:text-zinc-300">
            {zh ? '选择 agent 进入对应工作区' : 'Select an agent workspace'}
          </div>
        </div>
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="rounded-lg border border-[#ded6c8] bg-white/70 p-1.5 text-slate-500 transition hover:bg-white hover:text-slate-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            title={zh ? '收起左栏' : 'Collapse sidebar'}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {agentOptions.length === 0 && (
          <div className="rounded-2xl border border-dashed border-[#ded6c8] bg-white/55 p-4 text-sm text-slate-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
            {t('agent.noAgents')}
          </div>
        )}

        {agentOptions.map((agent) => {
          const selected = agent.agent_id === selectedAgentId
          const online = isAgentOnline(agent.agent_id)
          const role = getAgentRoleTemplate(agentRoleMap?.[agent.agent_id])
          const menuOpen = menuFor === agent.agent_id

          return (
            <div key={agent.agent_id} className="relative">
              <button
                type="button"
                onClick={() => onSelectAgent?.(agent.agent_id)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  setMenuFor(agent.agent_id)
                }}
                className={`group flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition ${
                  selected
                    ? 'border-[#d7cbb9] bg-[#ebe5db] shadow-sm dark:border-emerald-500/35 dark:bg-emerald-500/10'
                    : 'border-transparent bg-white/55 hover:border-[#ded6c8] hover:bg-white/80 dark:bg-zinc-900/60 dark:hover:border-zinc-700 dark:hover:bg-zinc-900'
                }`}
              >
                <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#28241f] text-sm font-black text-[#f5ead8] shadow-sm dark:bg-zinc-800">
                  {agentInitial(agent.display_name)}
                  <span
                    className={`absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-[#f6f3ed] dark:border-zinc-950 ${
                      online ? 'bg-emerald-400' : 'bg-slate-300 dark:bg-zinc-600'
                    }`}
                  />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-black text-slate-800 dark:text-zinc-100">
                      {agent.display_name || agent.agent_id}
                    </span>
                    <span className="shrink-0 rounded-full bg-[#dfe8d8] px-2 py-0.5 text-[10px] font-black text-[#46624b] dark:bg-emerald-500/15 dark:text-emerald-200">
                      {role.shortLabel}
                    </span>
                  </span>
                  <span className="mt-1 block truncate text-[11px] text-slate-500 dark:text-zinc-400">
                    {role.description}
                  </span>
                  <span className="mt-2 flex flex-wrap gap-1">
                    {role.skills.slice(0, 2).map((skill) => (
                      <span
                        key={skill}
                        className="rounded-full border border-[#ded6c8] bg-[#faf8f2] px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400"
                      >
                        {skill}
                      </span>
                    ))}
                  </span>
                </span>

                <span
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation()
                    setMenuFor(menuOpen ? null : agent.agent_id)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      event.stopPropagation()
                      setMenuFor(menuOpen ? null : agent.agent_id)
                    }
                  }}
                  className="rounded-lg p-1 text-slate-400 opacity-70 transition hover:bg-[#f6f0e5] hover:text-slate-700 group-hover:opacity-100 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                  title={zh ? 'Agent 设置' : 'Agent settings'}
                >
                  <MoreVertical className="h-4 w-4" />
                </span>
              </button>

              {menuOpen && (
                <div className="absolute right-2 top-12 z-30 w-64 rounded-2xl border border-[#ded6c8] bg-[#fffdf8] p-2 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
                  <div className="px-2 pb-2 text-xs font-black uppercase tracking-[0.18em] text-slate-400 dark:text-zinc-500">
                    {zh ? '角色模板' : 'Role Templates'}
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {AGENT_ROLE_TEMPLATES.map((template) => {
                      const active = template.id === role.id
                      return (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() => {
                            onAssignAgentRole?.(agent.agent_id, template.id)
                            setMenuFor(null)
                          }}
                          className={`w-full rounded-xl px-3 py-2 text-left transition ${
                            active
                              ? 'bg-[#e6f1df] text-[#385b3d] dark:bg-emerald-500/15 dark:text-emerald-200'
                              : 'text-slate-600 hover:bg-[#f3eee5] dark:text-zinc-300 dark:hover:bg-zinc-800'
                          }`}
                        >
                          <span className="block text-sm font-black">{template.label}</span>
                          <span className="mt-0.5 block text-xs opacity-75">{template.description}</span>
                        </button>
                      )
                    })}
                  </div>

                  {(onRenameAgent || onUnclaimAgent) && (
                    <div className="mt-2 border-t border-[#eee6da] pt-2 dark:border-zinc-800">
                      {onRenameAgent && (
                        <button
                          type="button"
                          onClick={() => {
                            onRenameAgent(agent.agent_id, agent.display_name)
                            setMenuFor(null)
                          }}
                          className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-600 transition hover:bg-[#f3eee5] dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                          {zh ? '重命名 Agent' : 'Rename Agent'}
                        </button>
                      )}
                      {onUnclaimAgent && (
                        <button
                          type="button"
                          onClick={() => {
                            onUnclaimAgent(agent.agent_id)
                            setMenuFor(null)
                          }}
                          className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-red-500 transition hover:bg-red-50 dark:hover:bg-red-500/10"
                        >
                          {t('agent.unclaim')}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </aside>
  )
}
