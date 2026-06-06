'use client'

import { signOut, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { Activity, ArrowLeft, Bot, CreditCard, ExternalLink, LogOut, Settings } from 'lucide-react'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'

const ANDROID_RESET_SESSION_MESSAGE = 'WTT_ANDROID_RESET_SESSION'

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
  const [isAndroidWebView, setIsAndroidWebView] = useState(false)
  const [browserOnline, setBrowserOnline] = useState(true)

  useEffect(() => {
    if (status !== 'unauthenticated') return
    const source = typeof window !== 'undefined'
      ? String(new URLSearchParams(window.location.search).get('source') || '').toLowerCase()
      : ''
    router.replace(source === 'android'
      ? '/mobile/login?callbackUrl=/mobile/settings&source=android'
      : '/mobile/login?callbackUrl=/mobile/settings')
  }, [router, status])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setIsAndroidWebView(String(params.get('source') || '').toLowerCase() === 'android')
  }, [])

  useEffect(() => {
    const updateOnline = () => setBrowserOnline(navigator.onLine !== false)
    updateOnline()
    window.addEventListener('online', updateOnline)
    window.addEventListener('offline', updateOnline)
    return () => {
      window.removeEventListener('online', updateOnline)
      window.removeEventListener('offline', updateOnline)
    }
  }, [])

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
  const isPro = plan === 'Pro'
  const mobileFeedHref = isAndroidWebView ? '/mobile/feed?source=android' : '/mobile/feed'
  const mobileLoginCallback = isAndroidWebView
    ? '/mobile/login?callbackUrl=/mobile/feed&source=android'
    : '/mobile/login?callbackUrl=/mobile/feed'
  const resetAndroidSession = () => {
    const bridge = (window as Window & { ReactNativeWebView?: { postMessage: (message: string) => void } }).ReactNativeWebView
    if (bridge?.postMessage) {
      bridge.postMessage(ANDROID_RESET_SESSION_MESSAGE)
      return
    }
    signOut({ callbackUrl: mobileLoginCallback })
  }

  return (
    <main className="min-h-[100dvh] bg-[#f7f4ee] px-4 py-[max(1rem,env(safe-area-inset-top))] text-slate-950">
      <header className="flex items-center gap-3">
        <button onClick={() => router.push(mobileFeedHref)} className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <p className="text-lg font-black">设置</p>
          <p className="text-xs font-semibold text-slate-500">WTT Mobile</p>
        </div>
      </header>

      <section className="mt-6 space-y-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/5">
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

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
              <CreditCard className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-base font-black">{plan} 用户</p>
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                Cloud Agent 本月 {billing?.cloud_agent_usage?.monthly_count || 0}/{billing?.entitlement?.limits?.monthly_limit || 500} 次，连续 {billing?.cloud_agent_usage?.window_count || 0}/{billing?.entitlement?.limits?.window_limit || 30} 次。
              </p>
              {billing?.entitlement?.ends_at && (
                <p className="mt-1 text-[11px] font-bold text-slate-400">有效期至 {billing.entitlement.ends_at}</p>
              )}
            </div>
          </div>
        </div>

        <a href="/upgrade?source=mobile" className="flex items-center gap-3 rounded-2xl border border-sky-100 bg-sky-600 p-4 text-sm font-black text-white shadow-sm shadow-sky-900/15">
          <CreditCard className="h-5 w-5" />
          <span className="min-w-0 flex-1">{isPro ? '续费 Pro 会员' : '升级 Pro 会员'}</span>
          <ExternalLink className="h-4 w-4 opacity-80" />
        </a>

        <a href="/feed" className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm font-black shadow-sm shadow-slate-900/5">
          <Bot className="h-5 w-5 text-sky-600" />
          打开完整 Web：绑定已有 Agent / 新建云端 Agent
        </a>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
              <Activity className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-base font-black">运行诊断</p>
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                {isAndroidWebView ? 'Android WebView' : 'Mobile Web'} · {browserOnline ? '网络在线' : '网络离线'} · {status === 'authenticated' ? '已登录' : status}
              </p>
              <p className="mt-1 truncate text-[11px] font-bold text-slate-400">API {CLIENT_WTT_API_BASE}</p>
            </div>
          </div>
        </div>

        {isAndroidWebView && (
          <button
            onClick={resetAndroidSession}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm font-black text-slate-700 shadow-sm shadow-slate-900/5"
          >
            清缓存并重新登录
          </button>
        )}

        <button
          onClick={() => signOut({ callbackUrl: mobileLoginCallback })}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 p-4 text-sm font-black text-white shadow-sm shadow-slate-900/15"
        >
          <LogOut className="h-4 w-4" />
          退出登录
        </button>
      </section>
    </main>
  )
}
