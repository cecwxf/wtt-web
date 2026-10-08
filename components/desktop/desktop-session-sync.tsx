'use client'

import { useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { getDesktopBridge } from '@/lib/desktop'

/** Shared across routes, including login. No native host credential enters React. */
export function DesktopSessionSync() {
  const { data: session, status } = useSession()
  const token = session?.accessToken || ''
  const wasAuthenticated = useRef(false)
  useEffect(() => {
    const bridge = getDesktopBridge()
    const host = bridge?.host
    if (!host || status === 'loading') return
    const loggedOut = wasAuthenticated.current && status === 'unauthenticated'
    wasAuthenticated.current = status === 'authenticated'
    let current = true
    void (async () => {
      const state = await host.status()
      // v3 verifies the WTT account for local file permissions even when host
      // execution onboarding is disabled. Older shells keep their old behavior.
      if (!current || (!state.enabled && (state.protocolVersion ?? 0) < 3)) return
      if (status === 'authenticated' && token) {
        const verified = await host.resume?.(token)
        if (current && verified?.userId) await bridge?.auth?.syncAccount(verified.userId)
      } else {
        // NextAuth also returns null after a failed session fetch. Lock access
        // without erasing enrollment; explicit disconnect/revoke still erases it.
        // Initial login may have an external browser authorization pending.
        if (loggedOut) void bridge?.auth?.syncAccount().catch(() => {})
        await (host.suspend ? host.suspend() : host.signOut())
      }
    })().catch(() => {
      // Native state becomes unavailable; the host panel offers a retry. Do not
      // log account tokens, clear recoverable credentials, or log out a newer session.
    })
    return () => { current = false }
  }, [status, token])
  return null
}
