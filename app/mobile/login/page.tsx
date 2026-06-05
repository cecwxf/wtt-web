'use client'

import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { FormEvent, Suspense, useEffect, useState } from 'react'
import { Github, Lock, Phone, Send, Sparkles, Twitter } from 'lucide-react'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'

function normalizeCallback(raw: string | null): string {
  if (!raw) return '/mobile/feed'
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw
  return '/mobile/feed'
}

function MobileLoginInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = normalizeCallback(searchParams.get('callbackUrl'))
  const [mode, setMode] = useState<'password' | 'code'>('password')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [sendingCode, setSendingCode] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  useEffect(() => {
    if (countdown <= 0) return
    const timer = window.setInterval(() => setCountdown((v) => Math.max(0, v - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [countdown])

  const sendPhoneCode = async () => {
    const normalized = phone.trim()
    if (!normalized) {
      setError('请输入手机号')
      return
    }
    setError('')
    setInfo('')
    setSendingCode(true)
    try {
      const res = await fetch(`${CLIENT_WTT_API_BASE}/auth/phone/send-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: normalized, purpose: 'login' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.detail || '验证码发送失败')
        return
      }
      setInfo(data.debug_code ? `验证码已发送。测试码：${data.debug_code}` : '验证码已发送')
      setCountdown(60)
    } catch {
      setError('网络异常，请稍后重试')
    } finally {
      setSendingCode(false)
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setInfo('')
    if (!phone.trim()) {
      setError('请输入手机号')
      return
    }
    if (mode === 'password' && !password) {
      setError('请输入密码')
      return
    }
    if (mode === 'code' && !code.trim()) {
      setError('请输入验证码')
      return
    }
    setLoading(true)
    try {
      const result = await signIn('credentials', {
        authType: mode === 'password' ? 'phone_password' : 'phone_code',
        phone: phone.trim(),
        ...(mode === 'password' ? { password } : { code: code.trim() }),
        redirect: false,
      })
      if (result?.ok) {
        router.replace(callbackUrl)
        return
      }
      setError(mode === 'password' ? '手机号或密码错误' : '手机号或验证码错误')
    } catch {
      setError('登录失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  const oauth = (provider: string) => {
    void signIn(provider, { callbackUrl })
  }

  return (
    <main className="flex min-h-[100dvh] flex-col bg-[radial-gradient(circle_at_20%_0%,#dff7ff_0,#f8f3ea_38%,#efe3d1_100%)] px-5 py-[max(1.5rem,env(safe-area-inset-top))] text-slate-950">
      <section className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">
        <div className="mb-7 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-slate-950 text-white shadow-lg">
            <Sparkles className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-3xl font-black tracking-tight">WTT Mobile</h1>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">登录后即可在手机上指挥你的远端 Agent 工作。</p>
        </div>

        <form onSubmit={submit} className="rounded-[2rem] border border-white/70 bg-white/90 p-4 shadow-xl shadow-sky-950/10 backdrop-blur">
          <div className="mb-3 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1 text-sm font-black">
            <button type="button" onClick={() => setMode('password')} className={`rounded-xl py-2 ${mode === 'password' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}>密码登录</button>
            <button type="button" onClick={() => setMode('code')} className={`rounded-xl py-2 ${mode === 'code' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}>验证码</button>
          </div>

          <label className="mb-3 flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
            <Phone className="h-4 w-4 text-slate-400" />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="手机号" className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none" />
          </label>

          {mode === 'password' ? (
            <label className="mb-3 flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
              <Lock className="h-4 w-4 text-slate-400" />
              <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="密码" className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none" />
            </label>
          ) : (
            <div className="mb-3 flex gap-2">
              <label className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                <Lock className="h-4 w-4 text-slate-400" />
                <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" placeholder="验证码" className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none" />
              </label>
              <button type="button" onClick={sendPhoneCode} disabled={sendingCode || countdown > 0} className="rounded-2xl bg-slate-950 px-3 text-xs font-black text-white disabled:bg-slate-300">
                {sendingCode ? '发送中' : countdown > 0 ? `${countdown}s` : '发验证码'}
              </button>
            </div>
          )}

          {error && <p className="mb-3 rounded-2xl bg-red-50 px-3 py-2 text-xs font-bold text-red-600">{error}</p>}
          {info && <p className="mb-3 rounded-2xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">{info}</p>}

          <button disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-600 py-3 text-sm font-black text-white shadow-lg shadow-sky-900/20 disabled:bg-slate-300">
            <Send className="h-4 w-4" />
            {loading ? '登录中...' : '进入 WTT'}
          </button>
        </form>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <button onClick={() => oauth('github')} className="flex items-center justify-center rounded-2xl border border-white/70 bg-white/80 py-3 shadow-sm"><Github className="h-5 w-5" /></button>
          <button onClick={() => oauth('google')} className="rounded-2xl border border-white/70 bg-white/80 py-3 text-sm font-black shadow-sm">G</button>
          <button onClick={() => oauth('twitter')} className="flex items-center justify-center rounded-2xl border border-white/70 bg-white/80 py-3 shadow-sm"><Twitter className="h-5 w-5" /></button>
        </div>
      </section>
    </main>
  )
}

export default function MobileLoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-[100dvh] items-center justify-center bg-[#f8f3ea] text-sm font-bold text-slate-500">Loading...</div>}>
      <MobileLoginInner />
    </Suspense>
  )
}
