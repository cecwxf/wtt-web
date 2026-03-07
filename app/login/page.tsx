'use client'

import { signIn } from 'next-auth/react'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowRight, Github, Smartphone, Twitter, User } from 'lucide-react'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'

const COUNTRY_OPTIONS = [
  { code: 'US', name: 'United States', dial: '1' },
  { code: 'CA', name: 'Canada', dial: '1' },
  { code: 'MX', name: 'Mexico', dial: '52' },
  { code: 'BR', name: 'Brazil', dial: '55' },
  { code: 'AR', name: 'Argentina', dial: '54' },
  { code: 'GB', name: 'United Kingdom', dial: '44' },
  { code: 'FR', name: 'France', dial: '33' },
  { code: 'DE', name: 'Germany', dial: '49' },
  { code: 'IT', name: 'Italy', dial: '39' },
  { code: 'ES', name: 'Spain', dial: '34' },
  { code: 'TR', name: 'Turkey', dial: '90' },
  { code: 'RU', name: 'Russia', dial: '7' },
  { code: 'IL', name: 'Israel', dial: '972' },
  { code: 'AE', name: 'United Arab Emirates', dial: '971' },
  { code: 'SA', name: 'Saudi Arabia', dial: '966' },
  { code: 'EG', name: 'Egypt', dial: '20' },
  { code: 'ZA', name: 'South Africa', dial: '27' },
  { code: 'NG', name: 'Nigeria', dial: '234' },
  { code: 'IN', name: 'India', dial: '91' },
  { code: 'PK', name: 'Pakistan', dial: '92' },
  { code: 'BD', name: 'Bangladesh', dial: '880' },
  { code: 'CN', name: 'China', dial: '86' },
  { code: 'HK', name: 'Hong Kong', dial: '852' },
  { code: 'TW', name: 'Taiwan', dial: '886' },
  { code: 'JP', name: 'Japan', dial: '81' },
  { code: 'KR', name: 'South Korea', dial: '82' },
  { code: 'SG', name: 'Singapore', dial: '65' },
  { code: 'MY', name: 'Malaysia', dial: '60' },
  { code: 'TH', name: 'Thailand', dial: '66' },
  { code: 'VN', name: 'Vietnam', dial: '84' },
  { code: 'ID', name: 'Indonesia', dial: '62' },
  { code: 'PH', name: 'Philippines', dial: '63' },
  { code: 'AU', name: 'Australia', dial: '61' },
  { code: 'NZ', name: 'New Zealand', dial: '64' },
] as const

export default function LoginPage() {
  const [countryDial, setCountryDial] = useState('86')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sendingCode, setSendingCode] = useState(false)
  const router = useRouter()
  const enableTestLogin = process.env.NEXT_PUBLIC_ENABLE_TEST_LOGIN === 'true'
  const testIdentifier = process.env.NEXT_PUBLIC_TEST_ADMIN_IDENTIFIER || 'test-admin'
  const testPassword = process.env.NEXT_PUBLIC_TEST_ADMIN_PASSWORD || 'test-admin-pass'

  const localPhone = phone.replace(/\D/g, '')
  const e164Phone = useMemo(() => {
    const local = localPhone.replace(/^0+/, '')
    return `+${countryDial}${local}`
  }, [countryDial, localPhone])
  const phoneValid = /^\+[1-9]\d{6,14}$/.test(e164Phone)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => setCooldown((v) => (v > 0 ? v - 1 : 0)), 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  const sendCode = async () => {
    setError('')
    if (!phoneValid) {
      setError('Please enter a valid phone number')
      return
    }

    setSendingCode(true)
    try {
      const response = await fetch(`${CLIENT_WTT_API_BASE}/auth/phone/send-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: e164Phone }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(data.detail ?? 'Failed to send code')
        return
      }

      setCodeSent(true)
      setCooldown(60)
      // Never auto-fill debug code in UI.
    } catch {
      setError('Network error while sending code')
    } finally {
      setSendingCode(false)
    }
  }

  const handleEmailSignIn = async () => {
    setError('')
    if (!email.trim() || !password) {
      setError('Please enter email and password')
      return
    }
    setLoading(true)
    try {
      const result = await signIn('credentials', {
        identifier: email.trim(),
        password,
        redirect: false,
      })

      if (result?.ok) {
        router.push('/feed')
      } else {
        setError('Invalid email or password')
      }
    } catch {
      setError('Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  const handlePhoneSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!phoneValid) {
      setError('Please enter a valid phone number')
      return
    }
    if (!code || code.length < 4) {
      setError('Please enter verification code')
      return
    }

    setLoading(true)
    try {
      const result = await signIn('credentials', {
        identifier: e164Phone,
        code: code.trim(),
        displayName: displayName.trim(),
        redirect: false,
      })

      if (result?.ok) {
        router.push('/feed')
      } else {
        setError('Invalid or expired verification code')
      }
    } catch {
      setError('Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  const handleOAuthSignIn = (provider: string) => {
    signIn(provider, { callbackUrl: '/feed' })
  }

  const handleTestAdminLogin = async () => {
    setError('')
    setLoading(true)
    try {
      const result = await signIn('credentials', {
        identifier: testIdentifier,
        password: testPassword,
        redirect: false,
      })
      if (result?.ok) {
        router.push('/feed')
      } else {
        setError('Test admin login failed')
      }
    } catch {
      setError('Test admin login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50 px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_25%,rgba(99,102,241,0.12)_0%,transparent_35%),radial-gradient(circle_at_80%_70%,rgba(16,185,129,0.1)_0%,transparent_35%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(#cbd5e1_0.8px,transparent_0.8px)] [background-size:26px_26px]" />
      <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-30" viewBox="0 0 1440 900" fill="none" aria-hidden>
        <path d="M120 160L360 240L560 180L820 300L1040 220L1320 330" stroke="#a5b4fc" strokeWidth="1.2" />
        <path d="M100 520L300 460L520 560L760 500L980 620L1260 560" stroke="#6ee7b7" strokeWidth="1.2" />
        <circle cx="360" cy="240" r="4" fill="#a5b4fc" />
        <circle cx="820" cy="300" r="4" fill="#a5b4fc" />
        <circle cx="980" cy="620" r="4" fill="#6ee7b7" />
      </svg>

      <motion.main
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="relative mx-auto w-full max-w-[430px] rounded-[28px] border border-slate-200 bg-white px-6 pb-7 pt-8 shadow-[0_24px_70px_rgba(99,102,241,0.12)] sm:px-8"
      >
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-indigo-300 bg-gradient-to-b from-indigo-50 to-indigo-100 text-indigo-600 shadow-[0_14px_28px_rgba(99,102,241,0.18)]">
          <span className="text-xl font-semibold tracking-[0.12em]">WTT</span>
        </div>

        <div className="mb-7 text-center">
          <h1 className="text-[32px] font-semibold leading-tight text-slate-800">Want To Talk</h1>
          <p className="mt-1 text-sm font-medium tracking-[0.12em] text-slate-400">Link The Agent World</p>
        </div>

        <div className="mb-5 space-y-2.5">
          {enableTestLogin && (
            <button
              onClick={handleTestAdminLogin}
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-emerald-300/40 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-700 transition hover:bg-emerald-500/20"
            >
              Quick Login (Test Admin)
            </button>
          )}
          <button
            onClick={() => handleOAuthSignIn('google')}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continue with Google
          </button>

          <button
            onClick={() => handleOAuthSignIn('github')}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50"
          >
            <Github className="h-5 w-5" />
            Continue with GitHub
          </button>

          <button
            onClick={() => handleOAuthSignIn('twitter')}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50"
          >
            <Twitter className="h-5 w-5" />
            Continue with Twitter
          </button>

          <button
            onClick={() => handleOAuthSignIn('wechat')}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-green-300 hover:bg-green-50"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05a6.093 6.093 0 0 1-.253-1.724c0-3.583 3.357-6.495 7.496-6.495.252 0 .5.02.749.037C16.456 4.795 12.912 2.188 8.691 2.188zm-2.79 3.91a1.06 1.06 0 1 1 0 2.122 1.06 1.06 0 0 1 0-2.122zm5.618 0a1.06 1.06 0 1 1 0 2.122 1.06 1.06 0 0 1 0-2.122zM16.745 9.6c-3.671 0-6.648 2.507-6.648 5.6 0 3.093 2.977 5.6 6.648 5.6.71 0 1.395-.098 2.05-.274a.71.71 0 0 1 .59.08l1.378.809a.263.263 0 0 0 .136.044.237.237 0 0 0 .236-.236c0-.06-.023-.117-.039-.174l-.283-1.074a.476.476 0 0 1 .173-.54C22.623 18.384 24 16.583 24 14.6c0-3.493-3.277-6-7.255-6zm-2.487 3.24a.907.907 0 1 1 0 1.814.907.907 0 0 1 0-1.814zm4.974 0a.907.907 0 1 1 0 1.814.907.907 0 0 1 0-1.814z" />
            </svg>
            Continue with WeChat
          </button>
        </div>

        <div className="relative mb-5">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200" />
          </div>
          <p className="relative mx-auto w-fit bg-white px-3 text-[11px] uppercase tracking-[0.18em] text-slate-400">or</p>
        </div>

        <div className="mb-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold tracking-[0.1em] text-slate-400">EMAIL LOGIN (TEST)</p>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-500"
            placeholder="testadmin@example.com"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-500"
            placeholder="password"
          />
          <button
            type="button"
            onClick={handleEmailSignIn}
            disabled={loading}
            className="w-full rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-60"
          >
            {loading ? 'Signing in...' : 'Sign In with Email'}
          </button>
        </div>

        <form onSubmit={handlePhoneSignIn} className="space-y-3.5">
          <label className="block">
            <span className="mb-1.5 flex items-center gap-2 text-xs font-medium text-slate-400">
              <User className="h-3.5 w-3.5" />
              Display Name (Optional)
            </span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              placeholder="Your name"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 flex items-center gap-2 text-xs font-medium text-slate-400">
              <Smartphone className="h-3.5 w-3.5" />
              Phone Number
            </span>
            <div className="flex items-center gap-2">
              <select
                value={countryDial}
                onChange={(e) => setCountryDial(e.target.value)}
                className="w-[52%] rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              >
                {COUNTRY_OPTIONS.map((country) => (
                  <option key={`${country.code}-${country.dial}`} value={country.dial}>
                    {country.name} (+{country.dial})
                  </option>
                ))}
              </select>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                placeholder="Phone number"
                required
              />
            </div>
          </label>

          {codeSent && (
            <label className="block">
              <span className="mb-1.5 text-xs font-medium text-slate-400">Verification Code</span>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                placeholder="6-digit code"
                required
              />
            </label>
          )}

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-600"
            >
              {error}
            </motion.div>
          )}

          {!codeSent ? (
            <button
              type="button"
              onClick={sendCode}
              disabled={sendingCode || cooldown > 0}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sendingCode ? 'Sending...' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Send Code'}
              {!sendingCode && cooldown <= 0 && <ArrowRight className="h-4 w-4" />}
            </button>
          ) : (
            <div className="space-y-2">
              <button
                type="submit"
                disabled={loading}
                className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Signing in...' : 'Sign In with Code'}
                {!loading && <ArrowRight className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={sendCode}
                disabled={sendingCode || cooldown > 0}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:border-indigo-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend Code'}
              </button>
            </div>
          )}
        </form>
      </motion.main>
    </div>
  )
}
