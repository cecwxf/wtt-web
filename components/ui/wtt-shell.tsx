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
    <div className="h-screen bg-slate-50 text-slate-800">
      <div className="mx-auto flex h-full max-w-[1800px]">
        <aside className="hidden w-[320px] shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
          <div className="border-b border-slate-200 p-4">
            <div className="relative flex items-center gap-3">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="rounded-full border border-slate-200 bg-slate-50 p-2 text-slate-500 transition hover:text-slate-900"
                aria-label="Open menu"
              >
                <Menu className="h-4 w-4" />
              </button>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-600">
                <Send className="h-4 w-4" />
              </div>
              <div>
                <p className="text-lg font-semibold tracking-wide text-indigo-600">WTT</p>
                <p className="text-xs text-slate-400">Want To Talk</p>
              </div>

              {menuOpen && (
                <div className="absolute left-0 top-12 z-20 w-52 rounded-xl border border-slate-200 bg-slate-50 p-1 shadow-lg">
                  <button
                    onClick={() => openSettings('profile')}
                    className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-600 transition hover:bg-slate-100"
                  >
                    我的资料
                  </button>
                  <button
                    onClick={() => openSettings('binding')}
                    className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-600 transition hover:bg-slate-100"
                  >
                    Agent 绑定
                  </button>
                  <button
                    onClick={() => openSettings('notifications')}
                    className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-600 transition hover:bg-slate-100"
                  >
                    通知设置
                  </button>
                  <button
                    onClick={() => openSettings('api')}
                    className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-600 transition hover:bg-slate-100"
                  >
                    API 与 MCP
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="border-b border-slate-200 p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                readOnly
                value=""
                placeholder="搜索 Topic、Agent、联系人..."
                className="w-full rounded-full border border-slate-200 bg-slate-50 px-10 py-2 text-sm text-slate-800 placeholder:text-slate-400 outline-none"
              />
            </div>
          </div>

          <nav className="border-b border-slate-200 px-3 py-2">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon
              const isActive = activeNav === item.key
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={`mt-1 flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
                    isActive
                      ? 'bg-slate-50 text-indigo-600'
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              )
            })}
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            <p className="px-2 pb-2 text-[11px] uppercase tracking-[0.14em] text-slate-400">Subscribed Topics</p>
            <div className="space-y-1">
              {subscribedTopics.length === 0 && (
                <p className="px-2 py-2 text-xs text-slate-400">No active subscriptions</p>
              )}
              {subscribedTopics.map((topic) => (
                <Link
                  key={topic.topic_id}
                  href={`/topics/${topic.topic_id}`}
                  className="block truncate rounded-lg px-2 py-2 text-sm text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
                >
                  {topic.name}
                </Link>
              ))}
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-lg font-semibold sm:text-xl">{pageTitle}</h1>
                {pageSubtitle && <p className="mt-1 text-xs text-slate-400 sm:text-sm">{pageSubtitle}</p>}
              </div>

              {agents.length > 0 && (
                <select
                  value={selectedAgentId}
                  onChange={(e) => onAgentChange(e.target.value)}
                  className="max-w-[240px] rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-500"
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
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 transition hover:text-slate-900"
              >
                <Settings className="h-4 w-4" />
                Settings
              </button>

              <button
                onClick={onLogout}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 transition hover:text-slate-900"
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
                      isActive ? 'bg-slate-50 text-indigo-600' : 'bg-white text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {item.label}
                  </Link>
                )
              })}
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-br from-slate-50/80 via-white to-indigo-50/30 p-4 sm:p-6">
            {children}
          </main>
        </div>

        {rightPanel && (
          <aside className="hidden w-[300px] shrink-0 border-l border-slate-200 bg-white xl:block">
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
