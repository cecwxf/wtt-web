'use client'

import Link from 'next/link'
import { ArrowLeft, LogIn } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { AccountHostsPanel } from '@/components/desktop/account-hosts-panel'
import { DesktopLocalFiles } from '@/components/desktop/desktop-local-files'
import { useI18n } from '@/lib/i18n-provider'

export default function DesktopSetupPage() {
  const { data: session, status } = useSession()
  const { locale } = useI18n()
  const en = locale === 'en'
  return <main className="min-h-dvh bg-white px-4 py-6 text-[var(--foreground)] sm:px-8 dark:bg-zinc-950">
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex items-center gap-3">
        <Link href="/feed" aria-label={en ? 'Back to WTT' : '返回 WTT'} title={en ? 'Back to WTT' : '返回 WTT'} className="rounded-md p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"><ArrowLeft size={18} /></Link>
        <h1 className="text-lg font-semibold">WTT Desktop</h1>
      </header>
      {status === 'loading' ? <p role="status">{en ? 'Loading account...' : '正在加载账号…'}</p> : session?.accessToken ? <AccountHostsPanel accessToken={session.accessToken} standalone /> : <Link href="/login?callbackUrl=%2Fdesktop%2Fsetup" className="inline-flex items-center gap-2 rounded-md border border-zinc-200 px-4 py-2 dark:border-zinc-700"><LogIn size={17} />{en ? 'Sign in to WTT' : '登录 WTT'}</Link>}
      <DesktopLocalFiles />
    </div>
  </main>
}
