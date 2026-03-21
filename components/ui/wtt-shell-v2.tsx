'use client'

import { Menu } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { AgentColumn, AgentItem, AgentSubAgentMap, AgentStatsMap } from './agent-column'
import { TopicColumn, TopicItem } from './topic-column'
import { TopBar } from './top-bar'
import { WttSettingsModal } from './wtt-settings-modal'
import { CreateTopicModal } from './create-topic-modal'

interface P2PRequest {
  id: string
  from_user_id: string
  from_agent_id: string
  target_agent_id: string
  request_type?: string
  topic_name?: string
  status: string
  message: string
  created_at: string
}

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
  onOpenEditor?: () => void
  onQuickCreateTask?: (type?: 'code' | 'research' | 'general' | 'pipeline') => void
  onSubscribeTopic?: (topicId: string) => Promise<void>
  onCreateP2P?: (targetAgentId: string) => Promise<void>
  onRequestDiscuss?: (targetAgentId: string, topicName: string) => Promise<void>
  onSelectWorkerTopic?: (topicId: string, workerSession?: { workerId: string; personaMd: string; workerMd: string; isFirstSession: boolean; personaChanged?: boolean }) => void
  subscribedTopicIds?: string[]
  notificationCount?: number
  p2pRequests?: P2PRequest[]
  onAcceptP2PRequest?: (requestId: string) => Promise<void>
  onRejectP2PRequest?: (requestId: string) => Promise<void>
  hideTopics?: boolean
  hideCreateTopic?: boolean
  currentUserName?: string
  agentSubAgents?: AgentSubAgentMap
  maxSubAgents?: number
  agentStats?: AgentStatsMap
  onlineAgentIds?: Set<string>
  userToken?: string
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
  onOpenEditor,
  onQuickCreateTask,
  onSubscribeTopic,
  onCreateP2P,
  onRequestDiscuss,
  onSelectWorkerTopic,
  subscribedTopicIds,
  notificationCount = 0,
  p2pRequests = [],
  onAcceptP2PRequest,
  onRejectP2PRequest,
  hideTopics = false,
  hideCreateTopic = false,
  currentUserName,
  agentSubAgents,
  maxSubAgents,
  agentStats,
  onlineAgentIds,
  userToken,
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
    <div className="h-screen bg-slate-50 dark:bg-zinc-950 text-slate-800 dark:text-zinc-200">
      <div className="flex h-full flex-col">
        <TopBar
          onSelectTopic={(topicId) => onTopicChange(topicId)}
          onSubscribeTopic={onSubscribeTopic}
          subscribedTopicIds={subscribedTopicIds}
          onCreateTopic={() => setCreateTopicOpen(true)}
          onOpenEditor={onOpenEditor}
          hideCreateTopic={hideCreateTopic}
          notificationCount={notificationCount}
          p2pRequests={p2pRequests}
          onAcceptP2PRequest={onAcceptP2PRequest}
          onRejectP2PRequest={onRejectP2PRequest}
          agentId={selectedAgentId}
          userMenu={
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-zinc-600 bg-slate-50 dark:bg-zinc-800 px-3 py-2 text-sm text-slate-500 dark:text-zinc-300 transition hover:text-slate-900 dark:hover:text-zinc-100"
              >
                <Menu className="h-4 w-4" />
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-12 z-20 w-52 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-1 shadow-lg">
                  <button
                    onClick={() => openSettings('profile')}
                    className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-600 dark:text-zinc-300 transition hover:bg-slate-100 dark:hover:bg-zinc-700"
                  >
                    Profile
                  </button>
                  <button
                    onClick={() => openSettings('binding')}
                    className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-600 dark:text-zinc-300 transition hover:bg-slate-100 dark:hover:bg-zinc-700"
                  >
                    Agent Binding
                  </button>
                  <button
                    onClick={() => openSettings('notifications')}
                    className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-600 dark:text-zinc-300 transition hover:bg-slate-100 dark:hover:bg-zinc-700"
                  >
                    Notifications
                  </button>
                  <button
                    onClick={() => openSettings('api')}
                    className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-600 dark:text-zinc-300 transition hover:bg-slate-100 dark:hover:bg-zinc-700"
                  >
                    API & MCP
                  </button>
                  <button
                    onClick={() => {
                      window.location.href = '/admin/manage'
                    }}
                    className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-600 dark:text-zinc-300 transition hover:bg-slate-100 dark:hover:bg-zinc-700"
                  >
                    Manage Cleanup
                  </button>
                  <div className="my-1 h-px bg-slate-200 dark:bg-zinc-600" />
                  <button
                    onClick={onLogout}
                    className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-red-400 transition hover:bg-slate-100 dark:hover:bg-zinc-700"
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
              onSelectWorkerTopic={onSelectWorkerTopic}
              currentUserName={currentUserName}
              agentSubAgents={agentSubAgents}
              maxSubAgents={maxSubAgents}
              agentStats={agentStats}
              onlineAgentIds={onlineAgentIds}
              onQuickCreate={onQuickCreateTask}
            />

            {!hideTopics && (
              <TopicColumn
                topics={topics}
                selectedTopicId={selectedTopicId}
                onSelectTopic={onTopicChange}
                onLeaveTopic={onLeaveTopic}
                onDeleteTopic={onDeleteTopic}
                onQuickCreateTask={hideCreateTopic ? undefined : onQuickCreateTask}
                onCreateP2P={onCreateP2P}
                onRequestDiscuss={onRequestDiscuss}
                agentName={selectedAgent?.display_name}
                pinScopeKey={selectedAgentId}
              />
            )}
          </div>

          <main className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-br from-slate-50/80 via-white to-indigo-50/30 dark:from-zinc-900 dark:via-zinc-950 dark:to-zinc-900">
            {children}
          </main>
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
        userToken={userToken}
        onSuccess={() => {
          onTopicsRefresh?.()
        }}
      />
    </div>
  )
}
