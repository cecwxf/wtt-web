'use client'

import Link from 'next/link'
import { Bell, FileEdit, PenSquare, KanbanSquare, Workflow } from 'lucide-react'
import { useState } from 'react'
import { SearchBar } from './search-bar'

interface TopBarProps {
  onSelectTopic?: (topicId: string) => void
  onCreateTopic?: () => void
  onOpenEditor?: () => void
  hideCreateTopic?: boolean
  notificationCount?: number
  userMenu?: React.ReactNode
}

export function TopBar({ onSelectTopic, onCreateTopic, onOpenEditor, hideCreateTopic, notificationCount = 0, userMenu }: TopBarProps) {
  const [showNotifications, setShowNotifications] = useState(false)

  return (
    <header className="flex h-[60px] items-center gap-4 border-b border-slate-200 bg-white px-4">
      <SearchBar onSelectTopic={onSelectTopic} />

      <div className="ml-auto flex items-center gap-2">
        <Link
          href="/tasks"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 transition hover:text-slate-900"
          title="Tasks Board"
        >
          <KanbanSquare className="h-4 w-4" />
          <span className="hidden sm:inline">Tasks</span>
        </Link>

        <Link
          href="/pipelines"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 transition hover:text-slate-900"
          title="Pipelines"
        >
          <Workflow className="h-4 w-4" />
          <span className="hidden sm:inline">Pipelines</span>
        </Link>

        {!hideCreateTopic && (
          <button
            onClick={onOpenEditor}
            className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-600 transition hover:bg-indigo-100 hover:text-indigo-700"
            title="Markdown Editor"
          >
            <FileEdit className="h-4 w-4" />
            <span className="hidden sm:inline">Editor</span>
          </button>
        )}

        {!hideCreateTopic && (
          <button
            onClick={onCreateTopic}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 transition hover:text-slate-900"
            title="Create Topic"
          >
            <PenSquare className="h-4 w-4" />
            <span className="hidden sm:inline">Create Topic</span>
          </button>
        )}

        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 transition hover:text-slate-900"
            title="Notifications"
          >
            <Bell className="h-4 w-4" />
            {notificationCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500 text-[9px] font-semibold text-white">
                {notificationCount > 9 ? '9+' : notificationCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 top-12 z-20 w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
              <p className="mb-2 text-sm font-semibold">Notifications</p>
              <p className="text-xs text-slate-400">No new notifications</p>
            </div>
          )}
        </div>

        {userMenu}
      </div>
    </header>
  )
}
