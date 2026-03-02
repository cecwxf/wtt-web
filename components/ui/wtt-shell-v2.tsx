'use client'

import { Menu, Settings } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { AgentColumn, AgentItem } from './agent-column'
import { TopicColumn, TopicItem } from './topic-column'
import { TopBar } from './top-bar'
import { WttSettingsModal } from './wtt-settings-modal'
import { CreateTopicModal } from './create-topic-modal'

interface WttShellV2Props {
  agents: AgentItem[]
  selectedAgentId: string
  onAgentChange: (agentId: string) => void
  topics: TopicItem[]
  selectedTopicId: string | null
  onTopicChange: (topicId: string | null) => void
  onLogout: () => void
  onTopicsRefresh?: () => void
  notificationCount?: number
  children: ReactNode
}

type SettingsPage = 'profile' | 'binding' | 'notifications' | 'poll' | 'privacy' | 'appearance' | 'api' | 'about'

export function WttShellV2({
  agents,
  selectedAgentId,
  onAgentChange,
  topics,
  selectedTopicId,
  onTopicChange,
  onLogout,
  onTopicsRefresh,
  notificationCount = 0,
  children,
}: WttShellV2Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsPage, setSettingsPage] = useState<SettingsPage>('profile')
  const [createTopicOpen, setCreateTopicOpen] = useState(false)

  const selectedAgent = agents.find((a) => a.agent_id === selectedAgentId)

  const openSettings = (page: SettingsPage) => {
    setSettingsPage(page)
    setSettingsOpen(true)
    setMenuOpen(false)
  }

  const agentOptions = agents.map((agent) => ({
    id: agent.agent_id,
    agent_id: agent.agent_id,
    display_name: agent.display_name,
    is_primary: false,
  }))

  return (
    <div className="h-screen bg-[#0e1621] text-[#e8edf2]">
      <div className="flex h-full flex-col">
        <TopBar
          onSelectTopic={onTopicChange}
          onCreateTopic={() => setCreateTopicOpen(true)}
          notificationCount={notificationCount}
          userMenu={
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-[#1c2733] px-3 py-2 text-sm text-[#a5b3c2] transition hover:text-white"
              >
                <Menu className="h-4 w-4" />
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-12 z-20 w-52 rounded-xl border border-white/10 bg-[#1c2733] p-1 shadow-[0_12px_32px_rgba(0,0,0,0.45)]">
                  <button
                    onClick={() => openSettings('profile')}
                    className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-[#c7d5e2] transition hover:bg-[#242f3d]"
                  >
                    Profile
                  </button>
                  <button
                    onClick={() => openSettings('binding')}
                    className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-[#c7d5e2] transition hover:bg-[#242f3d]"
                  >
                    Agent Binding
                  </button>
                  <button
                    onClick={() => openSettings('notifications')}
                    className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-[#c7d5e2] transition hover:bg-[#242f3d]"
                  >
                    Notifications
                  </button>
                  <button
                    onClick={() => openSettings('api')}
                    className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-[#c7d5e2] transition hover:bg-[#242f3d]"
                  >
                    API & MCP
                  </button>
                  <div className="my-1 h-px bg-white/10" />
                  <button
                    onClick={onLogout}
                    className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-red-400 transition hover:bg-[#242f3d]"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          }
        />

        <div className="flex min-h-0 flex-1">
          <div className="flex">
            <AgentColumn
              agents={agents}
              selectedAgentId={selectedAgentId}
              onSelectAgent={onAgentChange}
            />

            <TopicColumn
              topics={topics}
              selectedTopicId={selectedTopicId}
              onSelectTopic={onTopicChange}
              agentName={selectedAgent?.display_name}
            />
          </div>

          <main className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(ellipse_at_top_left,#2ea6ff0f_0%,transparent_42%),radial-gradient(ellipse_at_bottom_right,#00d4aa0f_0%,transparent_38%)]">
            {children}
          </main>
        </div>

        <div className="absolute bottom-4 left-4">
          <button
            onClick={() => openSettings('profile')}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-[#17212b] px-3 py-2 text-sm text-[#a5b3c2] shadow-lg transition hover:text-white"
          >
            <Settings className="h-4 w-4" />
            <span>Settings</span>
          </button>
        </div>
      </div>

      <WttSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        activePage={settingsPage}
        onPageChange={setSettingsPage}
        agents={agentOptions}
        selectedAgentId={selectedAgentId}
      />

      <CreateTopicModal
        open={createTopicOpen}
        onClose={() => setCreateTopicOpen(false)}
        onSuccess={() => {
          onTopicsRefresh?.()
        }}
      />
    </div>
  )
}
