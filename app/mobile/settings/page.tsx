'use client'

import { signOut, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import useSWR from 'swr'
import { ArrowLeft, Bot, CreditCard, LogOut, Settings } from 'lucide-react'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'

type BillingMe = {
  entitlement?: {
    plan?: string
    status?: string
    ends_at?: string | null
    limits?: { window_limit?: number; monthly_limit?: number }
  }
  cloud_agent_usage?: {
    window_count?: number
    monthly_count?: number
    blocked_until?: string | null
  }
}

export default function MobileSettingsPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const token = session?.accessToken as string | undefined

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login?callbackUrl=/mobile/settings')
  }, [router, status])

  const { data: billing } = useSWR(
    token ? ['mobile-settings-billing', token] : null,
    async () => {
      const res = await fetch(`${CLIENT_WTT_API_BASE}/billing/me`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      if (!res.ok) return null
      return res.json() as Promise<BillingMe>
    },
  )

  const plan = String(billing?.entitlement?.plan || 'free').toLowerCase() === 'pro' ? 'Pro' : 'Free'

  return (
    <main className="min-h-[100dvh] bg-[#f8f3ea] px-4 py-[max(1rem,env(safe-area-inset-top))] text-slate-950">
      <header className="flex items-center gap-3">
        <button onClick={() => router.push('/mobile/feed')} className="rounded-2xl border border-slate-200 bg-white p-2">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <p className="text-lg font-black">设置</p>
          <p className="text-xs font-semibold text-slate-500">WTT Mobile</p>
        </div>
      </header>

      <section className="mt-6 space-y-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
              <Settings className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-base font-black">{session?.user?.name || session?.user?.email || 'WTT User'}</p>
              <p className="truncate text-xs font-semibold text-slate-500">{session?.user?.email || '已登录'}</p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
              <CreditCard className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-base font-black">{plan} 用户</p>
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                Cloud Agent 本月 {billing?.cloud_agent_usage?.monthly_count || 0}/{billing?.entitlement?.limits?.monthly_limit || 500} 次，连续 {billing?.cloud_agent_usage?.window_count || 0}/{billing?.entitlement?.limits?.window_limit || 30} 次。
              </p>
            </div>
          </div>
        </div>

        <a href="/feed" className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-white p-4 text-sm font-black shadow-sm">
          <Bot className="h-5 w-5 text-sky-600" />
          打开完整 Web：绑定已有 Agent / 新建云端 Agent
        </a>

        <button
          onClick={() => signOut({ callbackUrl: '/login?callbackUrl=/mobile/feed' })}
          className="flex w-full items-center justify-center gap-2 rounded-3xl bg-slate-950 p-4 text-sm font-black text-white shadow-sm"
        >
          <LogOut className="h-4 w-4" />
          退出登录
        </button>
      </section>
    </main>
  )
}
