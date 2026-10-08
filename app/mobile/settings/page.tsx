'use client'

import { useSession } from 'next-auth/react'
import { signOut } from '@/lib/sign-out'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { Activity, ArrowLeft, Bot, CreditCard, ExternalLink, Globe, LogOut, Moon, Settings, Sun } from 'lucide-react'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'
import { AccountHostsPanel } from '@/components/desktop/account-hosts-panel'
import { MobileNotificationSettings } from '@/components/ui/mobile-notification-settings'
import { useI18n } from '@/lib/i18n-provider'

const ANDROID_RESET_SESSION_MESSAGE = 'WTT_ANDROID_RESET_SESSION'
type BillingMe = {
  entitlement?: { plan?: string; status?: string; ends_at?: string | null; is_trial?: boolean; limits?: { window_limit?: number; monthly_limit?: number } }
  cloud_agent_usage?: { window_count?: number; monthly_count?: number; blocked_until?: string | null }
}
const row = 'flex min-h-12 w-full items-center gap-3 border-b border-zinc-200 py-3 text-sm dark:border-zinc-800'
const muted = 'text-zinc-500 dark:text-zinc-400'

export default function MobileSettingsPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const { locale, setLocale } = useI18n()
  const { theme, setTheme } = useTheme()
  const en = locale === 'en'
  const token = session?.accessToken as string | undefined
  const [isApp, setIsApp] = useState(false)
  const [browserOnline, setBrowserOnline] = useState(true)
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
    const native = (window as Window & { ReactNativeWebView?: unknown }).ReactNativeWebView
    setIsApp(Boolean(native) || new URLSearchParams(window.location.search).get('source') === 'android')
  }, [])
  useEffect(() => {
    if (status !== 'unauthenticated') return
    const source = new URLSearchParams(window.location.search).get('source') === 'android' ? '&source=android' : ''
    router.replace(`/mobile/login?callbackUrl=/mobile/settings${source}`)
  }, [router, status])
  useEffect(() => {
    const updateOnline = () => setBrowserOnline(navigator.onLine !== false)
    updateOnline()
    window.addEventListener('online', updateOnline)
    window.addEventListener('offline', updateOnline)
    return () => { window.removeEventListener('online', updateOnline); window.removeEventListener('offline', updateOnline) }
  }, [])
  const { data: billing } = useSWR(token ? ['mobile-settings-billing', token] : null, async () => {
    const res = await fetch(`${CLIENT_WTT_API_BASE}/billing/me`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
    if (!res.ok) throw new Error(`Billing status unavailable (${res.status})`)
    return res.json() as Promise<BillingMe>
  })
  const plan = billing?.entitlement ? (billing.entitlement.plan?.toLowerCase() === 'pro' ? 'Pro' : 'Free') : '...'
  const trial = Boolean(billing?.entitlement?.is_trial)
  const endsAt = billing?.entitlement?.ends_at
  const days = endsAt ? Math.max(0, Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86400000)) : null
  const feedHref = isApp ? '/mobile/feed?source=android' : '/mobile/feed'
  const fullFeedHref = isApp ? '/feed?source=android' : '/feed'
  const upgradeHref = isApp ? '/upgrade?source=android' : '/upgrade?source=mobile'
  const callback = `/mobile/login?callbackUrl=/mobile/feed${isApp ? '&source=android' : ''}`
  function resetSession() {
    const bridge = (window as Window & { ReactNativeWebView?: { postMessage(message: string): void } }).ReactNativeWebView
    if (bridge) bridge.postMessage(ANDROID_RESET_SESSION_MESSAGE)
    else void signOut({ callbackUrl: callback })
  }
  return <main className="min-h-[100dvh] bg-white px-4 py-[max(1rem,env(safe-area-inset-top))] text-zinc-950 antialiased dark:bg-zinc-950 dark:text-zinc-100">
    <div className="mx-auto max-w-xl">
      <header className="flex items-center gap-3 border-b border-zinc-200 pb-4 dark:border-zinc-800">
        <button onClick={() => router.push(feedHref)} title={en ? 'Back' : '返回'} aria-label={en ? 'Back' : '返回'} className="p-2"><ArrowLeft size={20} /></button>
        <h1 className="text-lg font-semibold">{en ? 'Settings' : '设置'}</h1>
      </header>
      <section className="py-4">
        <div className="flex items-center gap-3"><Settings size={20} className={muted} />
          <div className="min-w-0"><p className="truncate text-sm font-semibold">{session?.user?.name || session?.user?.email || 'WTT'}</p><p className={`truncate text-xs ${muted}`}>{session?.user?.email || (en ? 'Signed in' : '已登录')}</p></div>
        </div>
      </section>
      <AccountHostsPanel accessToken={token} agentHref={agentId => `${feedHref}${isApp ? '&' : '?'}agent_id=${encodeURIComponent(agentId)}`} />
      <section className="border-y border-zinc-200 py-4 dark:border-zinc-800">
        <div className="flex items-center gap-3"><CreditCard size={20} className={muted} /><div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{trial ? (en ? 'Pro trial' : 'Pro 试用') : plan}</p>
          <p className={`mt-1 text-xs leading-5 ${muted}`}>{en ? 'Cloud Agent usage' : 'Cloud Agent 使用量'} · {billing?.cloud_agent_usage?.monthly_count || 0}/{billing?.entitlement?.limits?.monthly_limit || 500} {en ? 'this month' : '本月'}</p>
          <p className={`mt-1 text-xs leading-5 ${muted}`}>{en ? 'Current usage window' : '当前用量窗口'} · {billing?.cloud_agent_usage?.window_count || 0}/{billing?.entitlement?.limits?.window_limit || 100}</p>
          {trial && Number.isFinite(days) && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{days === 0 ? (en ? 'Trial ended' : '试用已结束') : en ? `${days} days remaining` : `剩余 ${days} 天`}</p>}
          {endsAt && <p className={`mt-1 text-xs ${muted}`}>{en ? 'Expires' : '有效期至'} {endsAt}</p>}
        </div></div>
        <a href={upgradeHref} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-medium text-white hover:bg-emerald-800"><CreditCard size={16} />{trial ? (en ? 'Upgrade to Pro' : '转为正式 Pro') : plan === 'Pro' ? (en ? 'Renew Pro' : '续费 Pro') : (en ? 'Upgrade to Pro' : '升级 Pro')}<ExternalLink size={14} /></a>
      </section>
      <section className="py-4">
        <label className="flex min-h-12 items-center justify-between gap-3 text-sm"><span className="flex items-center gap-2"><Globe size={18} />{en ? 'Language' : '语言'}</span>
          <select aria-label={en ? 'Language' : '语言'} value={locale} onChange={event => setLocale(event.target.value === 'en' ? 'en' : 'zh')} className="max-w-40 rounded-md border border-zinc-200 bg-transparent p-2 dark:border-zinc-700"><option value="zh">中文</option><option value="en">English</option></select>
        </label>
        <div className="flex min-h-12 items-center justify-between gap-3 text-sm"><span>{en ? 'Appearance' : '外观'}</span>
          <div className="flex rounded-md border border-zinc-200 dark:border-zinc-700">
            {[{ key: 'light', Icon: Sun, label: en ? 'Light' : '浅色' }, { key: 'dark', Icon: Moon, label: en ? 'Dark' : '深色' }].map(({ key, Icon, label }) => <button key={key} disabled={!mounted} onClick={() => setTheme(key)} title={label} aria-label={label} aria-pressed={mounted && theme === key} className={`flex h-10 w-10 items-center justify-center first:rounded-l-md last:rounded-r-md ${mounted && theme === key ? 'bg-zinc-200 dark:bg-zinc-700' : ''}`}><Icon size={18} /></button>)}
          </div>
        </div>
      </section>
      <MobileNotificationSettings userId={session?.userId} />
      <a href={fullFeedHref} className={row}><Bot size={18} /><span className="min-w-0 flex-1">{en ? 'Open full Web' : '打开完整 Web'}</span><ExternalLink size={16} className={muted} /></a>
      <section className="py-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><Activity size={18} />{en ? 'Connection' : '连接状态'}</h2>
        <p className={`mt-2 text-xs ${muted}`}>{isApp ? 'WTT App' : 'Mobile Web'} · {browserOnline ? (en ? 'Online' : '在线') : (en ? 'Offline' : '离线')} · {status === 'authenticated' ? (en ? 'Signed in' : '已登录') : status}</p>
      </section>
      {isApp && <button onClick={resetSession} className={row}>{en ? 'Reset local session' : '重置本机会话'}</button>}
      <button onClick={() => void signOut({ callbackUrl: callback })} className={`${row} text-red-700 dark:text-red-400`}><LogOut size={18} />{en ? 'Sign out' : '退出登录'}</button>
    </div>
  </main>
}
