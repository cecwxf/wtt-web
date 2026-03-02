'use client'

import { Bot } from 'lucide-react'

export interface AgentItem {
  agent_id: string
  display_name: string
  unread_count?: number
}

interface AgentColumnProps {
  agents: AgentItem[]
  selectedAgentId: string
  onSelectAgent: (agentId: string) => void
}

export function AgentColumn({ agents, selectedAgentId, onSelectAgent }: AgentColumnProps) {
  return (
    <div className="flex h-full w-[200px] flex-col border-r border-white/10 bg-[#17212b]">
      <div className="border-b border-white/10 px-3 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#7d8e9e]">Agents</p>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {agents.length === 0 && (
          <p className="px-2 py-4 text-xs text-[#7d8e9e]">No agents bound</p>
        )}

        {agents.map((agent) => {
          const isSelected = agent.agent_id === selectedAgentId
          return (
            <button
              key={agent.agent_id}
              onClick={() => onSelectAgent(agent.agent_id)}
              className={`mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left transition ${
                isSelected
                  ? 'bg-[#1c2733] text-[#2ea6ff]'
                  : 'text-[#a5b3c2] hover:bg-[#1c2733] hover:text-[#e8edf2]'
              }`}
            >
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                isSelected ? 'bg-[#2ea6ff]/20 text-[#2ea6ff]' : 'bg-[#1c2733] text-[#7d8e9e]'
              }`}>
                <Bot className="h-4 w-4" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{agent.display_name}</p>
                {agent.unread_count && agent.unread_count > 0 ? (
                  <span className="mt-0.5 inline-block rounded-full bg-[#2ea6ff] px-1.5 py-0.5 text-[9px] font-semibold text-white">
                    {agent.unread_count}
                  </span>
                ) : null}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
