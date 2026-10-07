'use client'

import { SessionProvider } from 'next-auth/react'
import { DesktopSessionSync } from '@/components/desktop/desktop-session-sync'

export function NextAuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchInterval={5 * 60} refetchOnWindowFocus>
      <DesktopSessionSync />
      {children}
    </SessionProvider>
  )
}
