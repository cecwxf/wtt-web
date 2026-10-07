'use client'

import { signOut as nextAuthSignOut, type SignOutParams } from 'next-auth/react'
import { getDesktopBridge } from '@/lib/desktop'

export async function signOut<R extends boolean = true>(options?: SignOutParams<R>) {
  try {
    // Run before NextAuth navigates away; a page unload cannot reliably await IPC.
    await getDesktopBridge()?.host?.signOut()
  } catch {
    // Native sign-out drops in-memory authorization before OS vault persistence.
    // A keyring write failure must not prevent the user from ending the Web session.
  }
  return nextAuthSignOut(options)
}
