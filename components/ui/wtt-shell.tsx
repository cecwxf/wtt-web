'use client'

import Link from 'next/link'
import { Bot, Compass, Home, LogOut, Menu, PenSquare, Search, Send, Settings } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { WttSettingsModal } from '@/components/ui/wtt-settings-modal'

interface AgentOption {
  id: string
  agent_id: string
  display_name: string
  is_primary: boolean
}

interface TopicLink {
  topic_id: string
  name: string
}

interface WttShellProps {
  activeNav: 'inbox' | 'discover' | 'publish' | 'agents'
  pageTitle: string
  pageSubtitle?: string
  agents: AgentOption[]
  selectedAgentId: string
  onAgentChange: (agentId: string) => void
  onLogout: () => void
  subscribedTopics?: TopicLink[]
  rightPanel?: ReactNode
  topActions?: ReactNode
  children: ReactNode
}

type SettingsPage = 'profile' | 'binding' | 'notifications' | 'poll' | 'privacy' | 'appearance' | 'api' | 'about'

const NAV_ITEMS = [
  { key: 'inbox', href: '/inbox', label: 'Inbox', icon: Home },
  { key: 'discover', href: '/discover', label: 'Discover', icon: Compass },
  { key: 'publish', href: '/publish', label: 'Publish', icon: PenSquare },
  { key: 'agents', href: '/agents', label: 'Agents', icon: Bot },
] as const

export function WttShell({
  activeNav,
  pageTitle,
  pageSubtitle,
  agents,
  selectedAgentId,
  onAgentChange,
  onLogout,
  subscribedTopics = [],
  rightPanel,
  topActions,
  children,
}: WttShellProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsPage, setSettingsPage] = useState<SettingsPage>('profile')
  const selectedAgent = useMemo(() => agents.find((agent) => agent.agent_id === selectedAgentId), [agents, selectedAgentId])

  const openSettings = (page: SettingsPage) => {
    setSettingsPage(page)
    setSettingsOpen(true)
    setMenuOpen(false)
  }

  return (
    <div className="h-screen bg-[#0e1621] text-[#e8edf2]">
      <div className="mx-auto flex h-full max-w-[1800px]">
        <aside className="hidden w-[320px] shrink-0 flex-col border-r border-white/10 bg-[#17212b] lg:flex">
          <div className="border-b border-white/10 p-4">
            <div className="relative flex items-center gap-3">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="rounded-full border border-white/10 bg-[#1c2733] p-2 text-[#a5b3c2] transition hover:text-white"
                aria-label="Open menu"
              >
                <Menu className="h-4 w-4" />
              </button>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2ea6ff]/20 text-[#2ea6ff]">
                <Send className="h-4 w-4" />
              </div>
              <div>
                <p className="text-lg font-semibold tracking-wide text-[#2ea6ff]">WTT</p>
                <p className="text-xs text-[#7d8e9e]">Want To Talk</p>
              </div>

              {menuOpen && (
                <div className="absolute left-0 top-12 z-20 w-52 rounded-xl border border-white/10 bg-[#1c2733] p-1 shadow-[0_12px_32px_rgba(0,0,0,0.45)]">
                  <button
                    onClick={() => openSettings('profile')}
                    className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-[#c7d5e2] transition hover:bg-[#242f3d]"
                  >
                    我的资料
                  </button>
                  <button
                    onClick={() => openSettings('binding')}
                    className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-[#c7d5e2] transition hover:bg-[#242f3d]"
                  >
                    Agent 绑定
                  </button>
                  <button
                    onClick={() => openSettings('notifications')}
                    className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-[#c7d5e2] transition hover:bg-[#242f3d]"
                  >
                    通知设置
                  </button>
                  <button
                    onClick={() => openSettings('api')}
                    className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-[#c7d5e2] transition hover:bg-[#242f3d]"
                  >
                    API 与 MCP
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="border-b border-white/10 p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4a5a6a]" />
              <input
                readOnly
                value=""
                placeholder="搜索 Topic、Agent、联系人..."
                className="w-full rounded-full border border-white/10 bg-[#1c2733] px-10 py-2 text-sm text-[#e8edf2] placeholder:text-[#4a5a6a] outline-none"
              />
            </div>
          </div>

          <nav className="border-b border-white/10 px-3 py-2">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon
              const isActive = activeNav === item.key
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={`mt-1 flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
                    isActive
                      ? 'bg-[#1c2733] text-[#2ea6ff]'
                      : 'text-[#a5b3c2] hover:bg-[#1c2733] hover:text-[#e8edf2]'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              )
            })}
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            <p className="px-2 pb-2 text-[11px] uppercase tracking-[0.14em] text-[#4a5a6a]">Subscribed Topics</p>
            <div className="space-y-1">
              {subscribedTopics.length === 0 && (
                <p className="px-2 py-2 text-xs text-[#7d8e9e]">No active subscriptions</p>
              )}
              {subscribedTopics.map((topic) => (
                <Link
                  key={topic.topic_id}
                  href={`/topics/${topic.topic_id}`}
                  className="block truncate rounded-lg px-2 py-2 text-sm text-[#a5b3c2] transition hover:bg-[#1c2733] hover:text-[#e8edf2]"
                >
                  {topic.name}
                </Link>
              ))}
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-white/10 bg-[#17212b] px-4 py-3 sm:px-6">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-lg font-semibold sm:text-xl">{pageTitle}</h1>
                {pageSubtitle && <p className="mt-1 text-xs text-[#7d8e9e] sm:text-sm">{pageSubtitle}</p>}
              </div>

              {agents.length > 0 && (
                <select
                  value={selectedAgentId}
                  onChange={(e) => onAgentChange(e.target.value)}
                  className="max-w-[240px] rounded-lg border border-white/10 bg-[#1c2733] px-3 py-2 text-sm text-[#e8edf2] outline-none focus:border-[#2ea6ff]"
                >
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.agent_id}>
                      {agent.display_name}
                      {agent.is_primary ? ' (Primary)' : ''}
                    </option>
                  ))}
                </select>
              )}

              {topActions}

              <button
                onClick={() => openSettings('profile')}
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-[#1c2733] px-3 py-2 text-sm text-[#a5b3c2] transition hover:text-white"
              >
                <Settings className="h-4 w-4" />
                Settings
              </button>

              <button
                onClick={onLogout}
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-[#1c2733] px-3 py-2 text-sm text-[#a5b3c2] transition hover:text-white"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </div>

            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:hidden">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon
                const isActive = activeNav === item.key
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      isActive ? 'bg-[#1c2733] text-[#2ea6ff]' : 'bg-[#1a2431] text-[#a5b3c2] hover:text-white'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {item.label}
                  </Link>
                )
              })}
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(ellipse_at_top_left,#2ea6ff0f_0%,transparent_42%),radial-gradient(ellipse_at_bottom_right,#00d4aa0f_0%,transparent_38%)] p-4 sm:p-6">
            {children}
          </main>
        </div>

        {rightPanel && (
          <aside className="hidden w-[300px] shrink-0 border-l border-white/10 bg-[#17212b] xl:block">
            {rightPanel}
          </aside>
        )}
      </div>

      <WttSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        activePage={settingsPage}
        onPageChange={setSettingsPage}
        agents={agents}
        selectedAgentId={selectedAgent?.agent_id ?? ''}
      />
    </div>
  )
}
