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
    <div className="relative min-h-screen overflow-hidden bg-[#0a1524] px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_25%,#2ea6ff44_0%,transparent_35%),radial-gradient(circle_at_80%_70%,#00d4aa33_0%,transparent_35%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(#79b9ff_0.8px,transparent_0.8px)] [background-size:26px_26px]" />
      <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-30" viewBox="0 0 1440 900" fill="none" aria-hidden>
        <path d="M120 160L360 240L560 180L820 300L1040 220L1320 330" stroke="#77c1ff" strokeWidth="1.2" />
        <path d="M100 520L300 460L520 560L760 500L980 620L1260 560" stroke="#65e0c0" strokeWidth="1.2" />
        <circle cx="360" cy="240" r="4" fill="#9dd2ff" />
        <circle cx="820" cy="300" r="4" fill="#9dd2ff" />
        <circle cx="980" cy="620" r="4" fill="#82e6cd" />
      </svg>

      <motion.main
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="relative mx-auto w-full max-w-[430px] rounded-[28px] border border-[#d6e2ee] bg-white px-6 pb-7 pt-8 shadow-[0_24px_70px_rgba(26,66,99,0.2)] sm:px-8"
      >
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-[#7cc6f5] bg-gradient-to-b from-[#e6f5ff] to-[#ccecff] text-[#1f84c5] shadow-[0_14px_28px_rgba(42,171,238,0.22)]">
          <span className="text-xl font-semibold tracking-[0.12em]">WTT</span>
        </div>

        <div className="mb-7 text-center">
          <h1 className="text-[32px] font-semibold leading-tight text-[#233849]">Want To Talk</h1>
          <p className="mt-1 text-sm font-medium tracking-[0.12em] text-[#6f8396]">Link The Agent World</p>
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
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-[#d7e5f2] bg-[#f8fbfe] px-4 py-2.5 text-sm font-medium text-[#2a3e51] transition hover:border-[#9fcdf2] hover:bg-[#f1f8fe]"
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
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-[#d7e5f2] bg-[#f8fbfe] px-4 py-2.5 text-sm font-medium text-[#2a3e51] transition hover:border-[#9fcdf2] hover:bg-[#f1f8fe]"
          >
            <Github className="h-5 w-5" />
            Continue with GitHub
          </button>

          <button
            onClick={() => handleOAuthSignIn('twitter')}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-[#d7e5f2] bg-[#f8fbfe] px-4 py-2.5 text-sm font-medium text-[#2a3e51] transition hover:border-[#9fcdf2] hover:bg-[#f1f8fe]"
          >
            <Twitter className="h-5 w-5" />
            Continue with Twitter
          </button>
        </div>

        <div className="relative mb-5">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[#e2ebf3]" />
          </div>
          <p className="relative mx-auto w-fit bg-white px-3 text-[11px] uppercase tracking-[0.18em] text-[#90a2b3]">or</p>
        </div>

        <form onSubmit={handlePhoneSignIn} className="space-y-3.5">
          <label className="block">
            <span className="mb-1.5 flex items-center gap-2 text-xs font-medium text-[#6f8396]">
              <User className="h-3.5 w-3.5" />
              Display Name (Optional)
            </span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-xl border border-[#d7e5f2] bg-white px-4 py-2.5 text-sm text-[#1e3447] outline-none transition focus:border-[#2aabee] focus:ring-4 focus:ring-[#2aabee]/15"
              placeholder="Your name"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 flex items-center gap-2 text-xs font-medium text-[#6f8396]">
              <Smartphone className="h-3.5 w-3.5" />
              Phone Number
            </span>
            <div className="flex items-center gap-2">
              <select
                value={countryDial}
                onChange={(e) => setCountryDial(e.target.value)}
                className="w-[52%] rounded-xl border border-[#d7e5f2] bg-white px-3 py-2.5 text-sm text-[#1e3447] outline-none transition focus:border-[#2aabee] focus:ring-4 focus:ring-[#2aabee]/15"
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
                className="w-full rounded-xl border border-[#d7e5f2] bg-white px-4 py-2.5 text-sm text-[#1e3447] outline-none transition focus:border-[#2aabee] focus:ring-4 focus:ring-[#2aabee]/15"
                placeholder="Phone number"
                required
              />
            </div>
          </label>

          {codeSent && (
            <label className="block">
              <span className="mb-1.5 text-xs font-medium text-[#6f8396]">Verification Code</span>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full rounded-xl border border-[#d7e5f2] bg-white px-4 py-2.5 text-sm text-[#1e3447] outline-none transition focus:border-[#2aabee] focus:ring-4 focus:ring-[#2aabee]/15"
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
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-[#2aabee] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#209ad8] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sendingCode ? 'Sending...' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Send Code'}
              {!sendingCode && cooldown <= 0 && <ArrowRight className="h-4 w-4" />}
            </button>
          ) : (
            <div className="space-y-2">
              <button
                type="submit"
                disabled={loading}
                className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-[#2aabee] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#209ad8] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Signing in...' : 'Sign In with Code'}
                {!loading && <ArrowRight className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={sendCode}
                disabled={sendingCode || cooldown > 0}
                className="w-full rounded-xl border border-[#d7e5f2] bg-white px-4 py-2.5 text-sm font-medium text-[#3c5770] transition hover:border-[#9fcdf2] disabled:cursor-not-allowed disabled:opacity-60"
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
