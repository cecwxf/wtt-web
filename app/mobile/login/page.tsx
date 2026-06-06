'use client'

import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { FormEvent, Suspense, useEffect, useState } from 'react'
import { Github, Lock, Phone, Send, Twitter, User } from 'lucide-react'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'
import { WttLogo } from '@/components/ui/wtt-logo'

type AuthTab = 'signin' | 'register'
type SignInMode = 'password' | 'code'
type PhoneCodePurpose = 'login' | 'register'

function normalizeCallback(raw: string | null): string {
  if (!raw) return '/mobile/feed'
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw
  return '/mobile/feed'
}

function MobileLoginInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = normalizeCallback(searchParams.get('callbackUrl'))
  const [tab, setTab] = useState<AuthTab>('signin')
  const [mode, setMode] = useState<SignInMode>('password')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [registerName, setRegisterName] = useState('')
  const [registerPhone, setRegisterPhone] = useState('')
  const [registerCode, setRegisterCode] = useState('')
  const [registerPassword, setRegisterPassword] = useState('')
  const [registerPassword2, setRegisterPassword2] = useState('')
  const [loading, setLoading] = useState(false)
  const [sendingCode, setSendingCode] = useState<PhoneCodePurpose | null>(null)
  const [countdown, setCountdown] = useState<Record<PhoneCodePurpose, number>>({ login: 0, register: 0 })
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  useEffect(() => {
    if (!Object.values(countdown).some((value) => value > 0)) return
    const timer = window.setInterval(() => {
      setCountdown((current) => ({
        login: Math.max(0, current.login - 1),
        register: Math.max(0, current.register - 1),
      }))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [countdown])

  const sendPhoneCode = async (targetPhone: string, purpose: PhoneCodePurpose) => {
    const normalized = targetPhone.trim()
    if (!normalized) {
      setError('请输入手机号')
      return
    }
    setError('')
    setInfo('')
    setSendingCode(purpose)
    try {
      const res = await fetch(`${CLIENT_WTT_API_BASE}/auth/phone/send-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: normalized, purpose }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.detail || '验证码发送失败')
        return
      }
      setInfo(data.debug_code ? `验证码已发送。测试码：${data.debug_code}` : '验证码已发送')
      setCountdown((current) => ({ ...current, [purpose]: 60 }))
    } catch {
      setError('网络异常，请稍后重试')
    } finally {
      setSendingCode(null)
    }
  }

  const switchTab = (next: AuthTab) => {
    setTab(next)
    setError('')
    setInfo('')
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

  const register = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setInfo('')
    const displayName = registerName.trim()
    if (!displayName || !registerPhone.trim() || !registerCode.trim() || !registerPassword || !registerPassword2) {
      setError('请完整填写注册信息')
      return
    }
    if (registerPassword.length < 8) {
      setError('密码至少 8 位')
      return
    }
    if (registerPassword !== registerPassword2) {
      setError('两次输入的密码不一致')
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`${CLIENT_WTT_API_BASE}/auth/phone/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: registerPhone.trim(),
          code: registerCode.trim(),
          password: registerPassword,
          display_name: displayName,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.detail || '注册失败')
        return
      }
      const result = await signIn('credentials', {
        authType: 'phone_password',
        phone: registerPhone.trim(),
        password: registerPassword,
        redirect: false,
      })
      if (result?.ok) {
        router.replace(callbackUrl)
        return
      }
      setInfo('注册成功，请使用手机号密码登录')
      setTab('signin')
      setMode('password')
      setPhone(registerPhone.trim())
      setPassword('')
    } catch {
      setError('注册失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  const oauth = (provider: string) => {
    void signIn(provider, { callbackUrl })
  }

  return (
    <main className="flex min-h-[100dvh] flex-col bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] text-[#0d0d0d] antialiased">
      <section className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">
        <div className="mb-7">
          <WttLogo size={48} className="ring-1 ring-slate-200" />
          <h1 className="mt-4 text-4xl font-semibold tracking-tight">WTT</h1>
          <p className="mt-2 text-sm font-medium leading-6 text-slate-500">Link Agents World.</p>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-medium leading-5 text-slate-600">
            <p className="font-semibold text-slate-900">移动端用于对话、远端 Agent Chat，以及控制远端 Agent 进行 remote work。</p>
            <p className="mt-1">备注提示：</p>
            <p className="mt-1">1. Agent 绑定以及云端 Agent 的创建请用 Web 端实现。</p>
            <p className="mt-1">2. 终生学习和若水广场功能请在 Web 端使用。</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 grid grid-cols-2 gap-1 rounded-full bg-slate-100 p-1 text-sm font-semibold">
            <button type="button" onClick={() => switchTab('signin')} className={`rounded-full py-2 transition ${tab === 'signin' ? 'bg-white text-[#0d0d0d] shadow-sm' : 'text-slate-500'}`}>登录</button>
            <button type="button" onClick={() => switchTab('register')} className={`rounded-full py-2 transition ${tab === 'register' ? 'bg-white text-[#0d0d0d] shadow-sm' : 'text-slate-500'}`}>注册</button>
          </div>

          {tab === 'signin' ? (
            <form onSubmit={submit}>
              <div className="mb-3 grid grid-cols-2 gap-1 rounded-full bg-slate-100 p-1 text-sm font-semibold">
                <button type="button" onClick={() => setMode('password')} className={`rounded-full py-2 transition ${mode === 'password' ? 'bg-white text-[#0d0d0d] shadow-sm' : 'text-slate-500'}`}>手机密码</button>
                <button type="button" onClick={() => setMode('code')} className={`rounded-full py-2 transition ${mode === 'code' ? 'bg-white text-[#0d0d0d] shadow-sm' : 'text-slate-500'}`}>验证码</button>
              </div>

              <label className="mb-3 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 focus-within:border-slate-400">
                <Phone className="h-4 w-4 text-slate-400" />
                <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="手机号" className="min-w-0 flex-1 bg-transparent text-base font-medium outline-none placeholder:text-slate-400" />
              </label>

              {mode === 'password' ? (
                <label className="mb-3 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 focus-within:border-slate-400">
                  <Lock className="h-4 w-4 text-slate-400" />
                  <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" placeholder="密码" className="min-w-0 flex-1 bg-transparent text-base font-medium outline-none placeholder:text-slate-400" />
                </label>
              ) : (
                <div className="mb-3 flex gap-2">
                  <label className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 focus-within:border-slate-400">
                    <Lock className="h-4 w-4 text-slate-400" />
                    <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="验证码" className="min-w-0 flex-1 bg-transparent text-base font-medium outline-none placeholder:text-slate-400" />
                  </label>
                  <button type="button" onClick={() => sendPhoneCode(phone, 'login')} disabled={sendingCode === 'login' || countdown.login > 0} className="min-w-20 rounded-2xl bg-[#0d0d0d] px-3 text-xs font-semibold text-white disabled:bg-slate-300">
                    {sendingCode === 'login' ? '发送中' : countdown.login > 0 ? `${countdown.login}s` : '发验证码'}
                  </button>
                </div>
              )}

              {error && <p className="mb-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-bold leading-5 text-red-600">{error}</p>}
              {info && <p className="mb-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-bold leading-5 text-emerald-700">{info}</p>}

              <button disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0d0d0d] py-3.5 text-sm font-semibold text-white disabled:bg-slate-300">
                <Send className="h-4 w-4" />
                {loading ? '登录中...' : '进入 WTT'}
              </button>
            </form>
          ) : (
            <form onSubmit={register}>
              <label className="mb-3 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 focus-within:border-slate-400">
                <User className="h-4 w-4 text-slate-400" />
                <input value={registerName} onChange={(e) => setRegisterName(e.target.value)} autoComplete="name" placeholder="昵称" className="min-w-0 flex-1 bg-transparent text-base font-medium outline-none placeholder:text-slate-400" />
              </label>

              <label className="mb-3 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 focus-within:border-slate-400">
                <Phone className="h-4 w-4 text-slate-400" />
                <input value={registerPhone} onChange={(e) => setRegisterPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="手机号" className="min-w-0 flex-1 bg-transparent text-base font-medium outline-none placeholder:text-slate-400" />
              </label>

              <div className="mb-3 flex gap-2">
                <label className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 focus-within:border-slate-400">
                  <Lock className="h-4 w-4 text-slate-400" />
                  <input value={registerCode} onChange={(e) => setRegisterCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="验证码" className="min-w-0 flex-1 bg-transparent text-base font-medium outline-none placeholder:text-slate-400" />
                </label>
                <button type="button" onClick={() => sendPhoneCode(registerPhone, 'register')} disabled={sendingCode === 'register' || countdown.register > 0} className="min-w-20 rounded-2xl bg-[#0d0d0d] px-3 text-xs font-semibold text-white disabled:bg-slate-300">
                  {sendingCode === 'register' ? '发送中' : countdown.register > 0 ? `${countdown.register}s` : '发验证码'}
                </button>
              </div>

              <label className="mb-3 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 focus-within:border-slate-400">
                <Lock className="h-4 w-4 text-slate-400" />
                <input value={registerPassword} onChange={(e) => setRegisterPassword(e.target.value)} type="password" autoComplete="new-password" placeholder="密码，至少 8 位" className="min-w-0 flex-1 bg-transparent text-base font-medium outline-none placeholder:text-slate-400" />
              </label>

              <label className="mb-3 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 focus-within:border-slate-400">
                <Lock className="h-4 w-4 text-slate-400" />
                <input value={registerPassword2} onChange={(e) => setRegisterPassword2(e.target.value)} type="password" autoComplete="new-password" placeholder="确认密码" className="min-w-0 flex-1 bg-transparent text-base font-medium outline-none placeholder:text-slate-400" />
              </label>

              {error && <p className="mb-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-bold leading-5 text-red-600">{error}</p>}
              {info && <p className="mb-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-bold leading-5 text-emerald-700">{info}</p>}

              <button disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0d0d0d] py-3.5 text-sm font-semibold text-white disabled:bg-slate-300">
                <Send className="h-4 w-4" />
                {loading ? '注册中...' : '注册并进入 WTT'}
              </button>
            </form>
          )}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <button aria-label="GitHub 登录" onClick={() => oauth('github')} className="flex h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-800"><Github className="h-5 w-5" /></button>
          <button aria-label="Google 登录" onClick={() => oauth('google')} className="h-12 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-800">G</button>
          <button aria-label="X 登录" onClick={() => oauth('twitter')} className="flex h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-800"><Twitter className="h-5 w-5" /></button>
        </div>
      </section>
    </main>
  )
}

export default function MobileLoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-[100dvh] items-center justify-center bg-white text-sm font-medium text-slate-500">Loading...</div>}>
      <MobileLoginInner />
    </Suspense>
  )
}
