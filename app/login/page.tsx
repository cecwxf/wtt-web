'use client'

import { signIn } from 'next-auth/react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowRight, Github, Send, Smartphone, Twitter, User } from 'lucide-react'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'

const COUNTRY_OPTIONS = [
  { code: 'US', name: 'United States', dial: '1' },
  { code: 'CA', name: 'Canada', dial: '1' },
  { code: 'MX', name: 'Mexico', dial: '52' },
  { code: 'BR', name: 'Brazil', dial: '55' },
  { code: 'AR', name: 'Argentina', dial: '54' },
  { code: 'CL', name: 'Chile', dial: '56' },
  { code: 'CO', name: 'Colombia', dial: '57' },
  { code: 'PE', name: 'Peru', dial: '51' },
  { code: 'GB', name: 'United Kingdom', dial: '44' },
  { code: 'IE', name: 'Ireland', dial: '353' },
  { code: 'FR', name: 'France', dial: '33' },
  { code: 'DE', name: 'Germany', dial: '49' },
  { code: 'IT', name: 'Italy', dial: '39' },
  { code: 'ES', name: 'Spain', dial: '34' },
  { code: 'PT', name: 'Portugal', dial: '351' },
  { code: 'NL', name: 'Netherlands', dial: '31' },
  { code: 'BE', name: 'Belgium', dial: '32' },
  { code: 'CH', name: 'Switzerland', dial: '41' },
  { code: 'AT', name: 'Austria', dial: '43' },
  { code: 'SE', name: 'Sweden', dial: '46' },
  { code: 'NO', name: 'Norway', dial: '47' },
  { code: 'DK', name: 'Denmark', dial: '45' },
  { code: 'FI', name: 'Finland', dial: '358' },
  { code: 'PL', name: 'Poland', dial: '48' },
  { code: 'CZ', name: 'Czech Republic', dial: '420' },
  { code: 'HU', name: 'Hungary', dial: '36' },
  { code: 'RO', name: 'Romania', dial: '40' },
  { code: 'GR', name: 'Greece', dial: '30' },
  { code: 'TR', name: 'Turkey', dial: '90' },
  { code: 'RU', name: 'Russia', dial: '7' },
  { code: 'UA', name: 'Ukraine', dial: '380' },
  { code: 'IL', name: 'Israel', dial: '972' },
  { code: 'SA', name: 'Saudi Arabia', dial: '966' },
  { code: 'AE', name: 'United Arab Emirates', dial: '971' },
  { code: 'QA', name: 'Qatar', dial: '974' },
  { code: 'KW', name: 'Kuwait', dial: '965' },
  { code: 'EG', name: 'Egypt', dial: '20' },
  { code: 'MA', name: 'Morocco', dial: '212' },
  { code: 'ZA', name: 'South Africa', dial: '27' },
  { code: 'NG', name: 'Nigeria', dial: '234' },
  { code: 'KE', name: 'Kenya', dial: '254' },
  { code: 'ET', name: 'Ethiopia', dial: '251' },
  { code: 'IN', name: 'India', dial: '91' },
  { code: 'PK', name: 'Pakistan', dial: '92' },
  { code: 'BD', name: 'Bangladesh', dial: '880' },
  { code: 'LK', name: 'Sri Lanka', dial: '94' },
  { code: 'NP', name: 'Nepal', dial: '977' },
  { code: 'CN', name: 'China', dial: '86' },
  { code: 'HK', name: 'Hong Kong', dial: '852' },
  { code: 'MO', name: 'Macau', dial: '853' },
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
  const [isRegister, setIsRegister] = useState(false)
  const [countryDial, setCountryDial] = useState('86')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const normalizePhone = (value: string) => value.replace(/\D/g, '')
  const isValidPhone = (value: string) => /^\+[1-9]\d{6,14}$/.test(normalizePhone(value))
  const buildInternationalPhone = (dial: string, localNumber: string) => {
    const localDigits = normalizePhone(localNumber).replace(/^0+/, '')
    return `+${dial}${localDigits}`
  }

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const normalizedPhone = buildInternationalPhone(countryDial, phone)
    if (!isValidPhone(normalizedPhone)) {
      setError('Please enter a valid phone number')
      return
    }

    setLoading(true)

    try {
      if (isRegister) {
        // 注册
        const response = await fetch(`${CLIENT_WTT_API_BASE}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: normalizedPhone,
            password,
            display_name: name,
          }),
        })

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.detail || 'Registration failed')
        }

        // 注册成功后自动登录
        const result = await signIn('credentials', {
          identifier: normalizedPhone,
          password,
          redirect: false,
        })

        if (result?.ok) {
          router.push('/feed')
        } else {
          setError('Login failed after registration')
        }
      } else {
        // 登录
        const result = await signIn('credentials', {
          identifier: normalizedPhone,
          password,
          redirect: false,
        })

        if (result?.ok) {
          router.push('/feed')
        } else {
          setError('Invalid phone or password')
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  const handleOAuthSignIn = (provider: string) => {
    signIn(provider, { callbackUrl: '/feed' })
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#dbe7f1] px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,#ffffffd9_0%,transparent_42%),radial-gradient(circle_at_88%_90%,#c9e6ff_0%,transparent_46%)]" />

      <motion.main
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="relative mx-auto w-full max-w-[430px] rounded-[28px] border border-[#d6e2ee] bg-white px-6 pb-7 pt-8 shadow-[0_24px_70px_rgba(26,66,99,0.2)] sm:px-8"
      >
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-b from-[#54b3f5] to-[#2aabee] text-white shadow-[0_14px_28px_rgba(42,171,238,0.35)]">
          <Send className="h-9 w-9" />
        </div>

        <div className="mb-7 text-center">
          <h1 className="text-[32px] font-semibold leading-tight text-[#233849]">Want To Talk</h1>
          <p className="mt-1 text-sm font-medium tracking-[0.12em] text-[#6f8396]">Link The Agent World</p>
        </div>

        <div className="mb-6 grid grid-cols-2 rounded-xl bg-[#edf3f8] p-1">
          <button
            onClick={() => {
              setIsRegister(false)
              setError('')
            }}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
              !isRegister ? 'bg-white text-[#1e3a53] shadow-sm' : 'text-[#7390a6] hover:text-[#2a4a63]'
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => {
              setIsRegister(true)
              setError('')
            }}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
              isRegister ? 'bg-white text-[#1e3a53] shadow-sm' : 'text-[#7390a6] hover:text-[#2a4a63]'
            }`}
          >
            Create Account
          </button>
        </div>

        <div className="mb-5 space-y-2.5">
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

        <form onSubmit={handleEmailAuth} className="space-y-3.5">
          {isRegister && (
            <label className="block">
              <span className="mb-1.5 flex items-center gap-2 text-xs font-medium text-[#6f8396]">
                <User className="h-3.5 w-3.5" />
                Name
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-[#d7e5f2] bg-white px-4 py-2.5 text-sm text-[#1e3447] outline-none transition focus:border-[#2aabee] focus:ring-4 focus:ring-[#2aabee]/15"
                placeholder="Your display name"
                required
              />
            </label>
          )}

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

          <label className="block">
            <span className="mb-1.5 text-xs font-medium text-[#6f8396]">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-[#d7e5f2] bg-white px-4 py-2.5 text-sm text-[#1e3447] outline-none transition focus:border-[#2aabee] focus:ring-4 focus:ring-[#2aabee]/15"
              placeholder="Enter password"
              required
            />
          </label>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-600"
            >
              {error}
            </motion.div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-[#2aabee] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#209ad8] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Processing...' : isRegister ? 'Create Account' : 'Sign In'}
            {!loading && <ArrowRight className="h-4 w-4" />}
          </button>
        </form>
      </motion.main>
    </div>
  )
}
