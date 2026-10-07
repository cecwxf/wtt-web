'use client'

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { getDesktopBridge } from '@/lib/desktop'

/** Shared across routes, including login. No native host credential enters React. */
export function DesktopSessionSync() {
  const { data: session, status } = useSession()
  const token = session?.accessToken || ''
  useEffect(() => {
    const host = getDesktopBridge()?.host
    if (!host || status === 'loading') return
    let current = true
    void (async () => {
      const state = await host.status()
      // v3 verifies the WTT account for local file permissions even when host
      // execution onboarding is disabled. Older shells keep their old behavior.
      if (!current || (!state.enabled && (state.protocolVersion ?? 0) < 3)) return
      if (status === 'authenticated' && token) await host.resume?.(token)
      else await host.signOut()
    })().catch(() => {
      // Native state becomes unavailable; the host panel offers a retry. Do not
      // log account tokens, clear recoverable credentials, or log out a newer session.
    })
    return () => { current = false }
  }, [status, token])
  return null
}
