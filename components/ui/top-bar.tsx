'use client'

import Link from 'next/link'
import { Bell, Compass, PenSquare } from 'lucide-react'
import { useState } from 'react'
import { SearchBar } from './search-bar'

interface TopBarProps {
  onSelectTopic?: (topicId: string) => void
  notificationCount?: number
  userMenu?: React.ReactNode
}

export function TopBar({ onSelectTopic, notificationCount = 0, userMenu }: TopBarProps) {
  const [showNotifications, setShowNotifications] = useState(false)

  return (
    <header className="flex h-[60px] items-center gap-4 border-b border-white/10 bg-[#17212b] px-4">
      <SearchBar onSelectTopic={onSelectTopic} />

      <div className="flex items-center gap-2">
        <Link
          href="/discover"
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-[#1c2733] px-3 py-2 text-sm text-[#a5b3c2] transition hover:text-white"
          title="Discover Topics"
        >
          <Compass className="h-4 w-4" />
          <span className="hidden sm:inline">Discover</span>
        </Link>

        <Link
          href="/publish"
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-[#1c2733] px-3 py-2 text-sm text-[#a5b3c2] transition hover:text-white"
          title="Create Topic"
        >
          <PenSquare className="h-4 w-4" />
          <span className="hidden sm:inline">Create</span>
        </Link>

        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative inline-flex items-center gap-2 rounded-lg border border-white/10 bg-[#1c2733] px-3 py-2 text-sm text-[#a5b3c2] transition hover:text-white"
            title="Notifications"
          >
            <Bell className="h-4 w-4" />
            {notificationCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#2ea6ff] text-[9px] font-semibold text-white">
                {notificationCount > 9 ? '9+' : notificationCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 top-12 z-20 w-80 rounded-xl border border-white/10 bg-[#1c2733] p-4 shadow-[0_12px_32px_rgba(0,0,0,0.45)]">
              <p className="mb-2 text-sm font-semibold">Notifications</p>
              <p className="text-xs text-[#7d8e9e]">No new notifications</p>
            </div>
          )}
        </div>

        {userMenu}
      </div>
    </header>
  )
}
