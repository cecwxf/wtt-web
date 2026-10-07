'use client'

import { getProviders, signIn, useSession } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { ArrowRight, Github, LoaderCircle, Smartphone, Twitter } from 'lucide-react'
import { WttLogo } from '@/components/ui/wtt-logo'

type Provider = 'github' | 'google' | 'twitter'
const names = { github: 'GitHub', google: 'Google', twitter: 'X / Twitter' }

function NativeLogin() {
  const query = useSearchParams()
  const ticket = query.get('request') || ''
  const { data: session, status } = useSession()
  const [provider, setProvider] = useState<Provider | null>(null)
  const [providers, setProviders] = useState<string[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [expired, setExpired] = useState(false)
  const [callback, setCallback] = useState('')
  const [english, setEnglish] = useState(false)
  useEffect(() => { setEnglish(!navigator.language.startsWith('zh')) }, [])
  const label = (zh: string, en: string) => english ? en : zh
  const returnPath = '/native-login?' + new URLSearchParams({ request: ticket })

  useEffect(() => {
    const abort = new AbortController()
    let expiry: ReturnType<typeof setTimeout> | undefined
    setProvider(null); setError(''); setExpired(false); setCallback('')
    if (!ticket || ticket.length > 2048 || query.getAll('request').length !== 1) {
      setError('Invalid login request'); return () => abort.abort()
    }
    void fetch('/api/native-login/inspect', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_ticket: ticket }), signal: abort.signal, cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error('This login request has expired. Please restart from WTT.')
        const result = await response.json()
        if (abort.signal.aborted) return
        setProvider(result.provider)
        expiry = setTimeout(() => setExpired(true), Math.max(0, result.expiresAt - Date.now()))
      }).catch(reason => { if (!abort.signal.aborted) setError(reason.message) })
    void getProviders().then(result => { if (!abort.signal.aborted) setProviders(Object.keys(result || {})) })
      .catch(() => { if (!abort.signal.aborted) setError('Login providers are unavailable. Please retry.') })
    return () => { abort.abort(); if (expiry) clearTimeout(expiry) }
  }, [ticket, query])

  const approve = async () => {
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/native-login/approve', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request_ticket: ticket }),
        cache: 'no-store', signal: AbortSignal.timeout(12_000) })
      if (!response.ok) throw new Error('Unable to authorize WTT. Please restart login from the app.')
      const result = await response.json()
      setCallback(result.callbackUrl)
      window.location.assign(result.callbackUrl)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to authorize WTT') }
    finally { setBusy(false) }
  }

  return <main className="flex min-h-[100dvh] items-center justify-center bg-white px-6 py-12 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
    <section className="w-full max-w-sm space-y-6">
      <WttLogo size={48} />
      <div><h1 className="text-2xl font-semibold">{label('登录 WTT', 'Sign In to WTT')}</h1>
        <p className="mt-2 text-sm text-zinc-500">{label('授权此设备使用你的 WTT 账号', 'Authorize this device to use your WTT account')}</p></div>
      {error && <p role="alert" className="break-words text-sm leading-6 text-red-600 dark:text-red-400">{error}</p>}
      {expired && <p role="alert" className="text-sm text-red-600">{label('请求已过期，请返回 App 重新登录。', 'Request expired. Restart login from the app.')}</p>}
      {!provider && !error && <LoaderCircle aria-label="Loading" className="h-5 w-5 animate-spin" />}
      {provider && !expired && <>
        {status === 'loading' ? <LoaderCircle aria-label="Loading account" className="h-5 w-5 animate-spin" />
          : session?.userId && !session.mobileWebSessionId ? <>
            <div className="border-y border-zinc-200 py-4 dark:border-zinc-800">
              <p className="text-xs text-zinc-500">{label('当前账号', 'Current account')}</p>
              <p className="mt-1 break-words font-medium">{session.user?.name || session.user?.email || session.userId}</p>
            </div>
            <button onClick={approve} disabled={busy || !!callback} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 py-3 text-sm font-medium text-white disabled:opacity-50">
              {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
              {label('确认并返回 WTT', 'Confirm and Return to WTT')}
            </button>
          </> : null}
        {!callback && providers.includes(provider) && <button onClick={() => { void signIn(provider, { callbackUrl: returnPath }) }} disabled={busy || status === 'loading'}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-zinc-300 px-4 py-3 text-sm font-medium dark:border-zinc-700 disabled:opacity-50">
          {provider === 'github' ? <Github className="h-4 w-4" /> : provider === 'twitter' ? <Twitter className="h-4 w-4" /> : <span aria-hidden="true" className="font-semibold">G</span>}
          {label('使用', 'Continue with')} {names[provider]}
        </button>}
        {!callback && <a href={'/mobile/login?' + new URLSearchParams({ callbackUrl: returnPath })} className="flex min-h-10 items-center justify-center gap-2 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white">
          {label('使用手机号或其他账号', 'Use Phone or Another Account')}<ArrowRight className="h-4 w-4" />
        </a>}
      </>}
      {callback && <a href={callback} className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 py-3 text-sm text-white">
        <Smartphone className="h-4 w-4" />{label('返回 WTT App', 'Return to WTT App')}
      </a>}
    </section>
  </main>
}

export default function Page() { return <Suspense><NativeLogin /></Suspense> }
