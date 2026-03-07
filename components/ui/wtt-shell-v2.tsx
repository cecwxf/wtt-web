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
  onBindingChanged?: () => void
  onRenameAgent?: (agentId: string, currentName: string) => void
  onUnclaimAgent?: (agentId: string) => void
  onLeaveTopic?: (topicId: string) => void
  onDeleteTopic?: (topicId: string) => void
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
  onBindingChanged,
  onRenameAgent,
  onUnclaimAgent,
  onLeaveTopic,
  onDeleteTopic,
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
    <div className="h-screen bg-slate-50 text-slate-800">
      <div className="flex h-full flex-col">
        <TopBar
          onSelectTopic={(topicId) => onTopicChange(topicId)}
          onCreateTopic={() => setCreateTopicOpen(true)}
          notificationCount={notificationCount}
          userMenu={
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 transition hover:text-slate-900"
              >
                <Menu className="h-4 w-4" />
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-12 z-20 w-52 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                  <button
                    onClick={() => openSettings('profile')}
                    className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-600 transition hover:bg-slate-100"
                  >
                    Profile
                  </button>
                  <button
                    onClick={() => openSettings('binding')}
                    className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-600 transition hover:bg-slate-100"
                  >
                    Agent Binding
                  </button>
                  <button
                    onClick={() => openSettings('notifications')}
                    className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-600 transition hover:bg-slate-100"
                  >
                    Notifications
                  </button>
                  <button
                    onClick={() => openSettings('api')}
                    className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-600 transition hover:bg-slate-100"
                  >
                    API & MCP
                  </button>
                  <div className="my-1 h-px bg-slate-200" />
                  <button
                    onClick={onLogout}
                    className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-red-400 transition hover:bg-slate-100"
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
              onRenameAgent={onRenameAgent}
              onUnclaimAgent={onUnclaimAgent}
            />

            <TopicColumn
              topics={topics}
              selectedTopicId={selectedTopicId}
              onSelectTopic={onTopicChange}
              onLeaveTopic={onLeaveTopic}
              onDeleteTopic={onDeleteTopic}
              agentName={selectedAgent?.display_name}
            />
          </div>

          <main className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-br from-slate-50/80 via-white to-indigo-50/30">
            {children}
          </main>
        </div>

        <div className="absolute bottom-4 left-4">
          <button
            onClick={() => openSettings('profile')}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 shadow-lg transition hover:text-slate-900"
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
        onBindingChanged={onBindingChanged}
      />

      <CreateTopicModal
        open={createTopicOpen}
        onClose={() => setCreateTopicOpen(false)}
        creatorAgentId={selectedAgentId}
        agentOptions={agents.map((a) => ({ agent_id: a.agent_id, display_name: a.display_name }))}
        onSuccess={() => {
          onTopicsRefresh?.()
        }}
      />
    </div>
  )
}
