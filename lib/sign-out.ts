'use client'

import { signOut as nextAuthSignOut, type SignOutParams } from 'next-auth/react'
import { getDesktopBridge } from '@/lib/desktop'

export async function signOut<R extends boolean = true>(options?: SignOutParams<R>) {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem('__WTT_NATIVE_ACCESS_TOKEN__')
      const native = (window as Window & {
        __WTT_NATIVE_SESSION__?: { version: number; signOut: () => Promise<void> }
      }).__WTT_NATIVE_SESSION__
      if (native?.version === 1) await native.signOut()
    } catch {
      // Local and Web logout still complete when the native connection is unavailable.
    }
  }
  try {
    await getDesktopBridge()?.auth?.syncAccount()
  } catch {
    // Logout also completes if OS credential storage is temporarily unavailable.
  }
  try {
    // Run before NextAuth navigates away; a page unload cannot reliably await IPC.
    await getDesktopBridge()?.host?.signOut()
  } catch {
    // Native sign-out drops in-memory authorization before OS vault persistence.
    // A local storage write failure must not prevent ending the Web session.
  }
  return nextAuthSignOut(options)
}
