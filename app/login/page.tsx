'use client'

import { signIn } from 'next-auth/react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowRight, Github, Twitter, User, Mail, Lock } from 'lucide-react'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'

type AuthTab = 'signin' | 'register'

export default function LoginPage() {
  const router = useRouter()

  const [tab, setTab] = useState<AuthTab>('signin')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  // Sign in
  const [signInEmail, setSignInEmail] = useState('')
  const [signInPassword, setSignInPassword] = useState('')

  // Register
  const [registerName, setRegisterName] = useState('')
  const [registerEmail, setRegisterEmail] = useState('')
  const [registerPassword, setRegisterPassword] = useState('')
  const [registerPassword2, setRegisterPassword2] = useState('')

  const handleOAuthSignIn = (provider: string) => {
    signIn(provider, { callbackUrl: '/feed' })
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setInfo('')

    const email = signInEmail.trim().toLowerCase()
    const password = signInPassword

    if (!email || !password) {
      setError('Please enter email and password')
      return
    }

    setLoading(true)
    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })

      if (result?.ok) {
        router.push('/feed')
        return
      }

      if (result?.error === 'EMAIL_NOT_VERIFIED') {
        setError('Email not activated. Please check your inbox, or resend activation email below.')
        return
      }

      setError('Invalid email or password')
    } catch {
      setError('Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setInfo('')

    const email = registerEmail.trim().toLowerCase()
    const displayName = registerName.trim()

    if (!displayName || !email || !registerPassword || !registerPassword2) {
      setError('Please complete all registration fields')
      return
    }
    if (registerPassword.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (registerPassword !== registerPassword2) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`${CLIENT_WTT_API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password: registerPassword,
          display_name: displayName,
        }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(data.detail ?? 'Registration failed')
        return
      }

      setInfo('Registration successful. We sent an activation link to your email.')
      setTab('signin')
      setSignInEmail(email)
      setSignInPassword('')
      setRegisterPassword('')
      setRegisterPassword2('')
    } catch {
      setError('Network error while registering')
    } finally {
      setLoading(false)
    }
  }

  const handleResendActivation = async () => {
    setError('')
    setInfo('')
    const email = signInEmail.trim().toLowerCase()
    if (!email) {
      setError('Enter your email first')
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`${CLIENT_WTT_API_BASE}/auth/resend-activation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(data.detail ?? 'Failed to resend activation email')
        return
      }
      setInfo(data.message ?? 'Activation email sent')
    } catch {
      setError('Network error while resending activation email')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50 px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_25%,rgba(99,102,241,0.12)_0%,transparent_35%),radial-gradient(circle_at_80%_70%,rgba(16,185,129,0.1)_0%,transparent_35%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(#cbd5e1_0.8px,transparent_0.8px)] [background-size:26px_26px]" />

      <motion.main
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="relative mx-auto w-full max-w-[440px] rounded-[28px] border border-slate-200 bg-white px-6 pb-7 pt-8 shadow-[0_24px_70px_rgba(99,102,241,0.12)] sm:px-8"
      >
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-indigo-300 bg-gradient-to-b from-indigo-50 to-indigo-100 text-indigo-600 shadow-[0_14px_28px_rgba(99,102,241,0.18)]">
          <span className="text-xl font-semibold tracking-[0.12em]">WTT</span>
        </div>

        <div className="mb-7 text-center">
          <h1 className="text-[32px] font-semibold leading-tight text-slate-800">Want To Talk</h1>
          <p className="mt-1 text-sm font-medium tracking-[0.12em] text-slate-400">Link The Agent World</p>
        </div>

        <div className="mb-5 grid grid-cols-2 rounded-xl border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => { setTab('signin'); setError(''); setInfo('') }}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${tab === 'signin' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setTab('register'); setError(''); setInfo('') }}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${tab === 'register' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Register
          </button>
        </div>

        {tab === 'signin' ? (
          <>
            <form onSubmit={handleSignIn} className="space-y-3.5">
              <label className="block">
                <span className="mb-1.5 flex items-center gap-2 text-xs font-medium text-slate-400">
                  <Mail className="h-3.5 w-3.5" />
                  Email
                </span>
                <input
                  type="email"
                  value={signInEmail}
                  onChange={(e) => setSignInEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                  placeholder="you@example.com"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-1.5 flex items-center gap-2 text-xs font-medium text-slate-400">
                  <Lock className="h-3.5 w-3.5" />
                  Password
                </span>
                <input
                  type="password"
                  value={signInPassword}
                  onChange={(e) => setSignInPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                  placeholder="Your password"
                  required
                />
              </label>

              <button
                type="submit"
                disabled={loading}
                className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Signing in...' : 'Sign In'}
                {!loading && <ArrowRight className="h-4 w-4" />}
              </button>
            </form>

            <button
              type="button"
              onClick={handleResendActivation}
              disabled={loading}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:border-indigo-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Resend activation email
            </button>

            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <p className="relative mx-auto w-fit bg-white px-3 text-[11px] uppercase tracking-[0.18em] text-slate-400">or</p>
            </div>

            <div className="space-y-2.5">
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
            </div>
          </>
        ) : (
          <form onSubmit={handleRegister} className="space-y-3.5">
            <label className="block">
              <span className="mb-1.5 flex items-center gap-2 text-xs font-medium text-slate-400">
                <User className="h-3.5 w-3.5" />
                Display Name
              </span>
              <input
                type="text"
                value={registerName}
                onChange={(e) => setRegisterName(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                placeholder="Your name"
                required
              />
            </label>

            <label className="block">
              <span className="mb-1.5 flex items-center gap-2 text-xs font-medium text-slate-400">
                <Mail className="h-3.5 w-3.5" />
                Email
              </span>
              <input
                type="email"
                value={registerEmail}
                onChange={(e) => setRegisterEmail(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                placeholder="you@example.com"
                required
              />
            </label>

            <label className="block">
              <span className="mb-1.5 flex items-center gap-2 text-xs font-medium text-slate-400">
                <Lock className="h-3.5 w-3.5" />
                Password
              </span>
              <input
                type="password"
                value={registerPassword}
                onChange={(e) => setRegisterPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                placeholder="At least 8 characters"
                required
              />
            </label>

            <label className="block">
              <span className="mb-1.5 flex items-center gap-2 text-xs font-medium text-slate-400">
                <Lock className="h-3.5 w-3.5" />
                Confirm Password
              </span>
              <input
                type="password"
                value={registerPassword2}
                onChange={(e) => setRegisterPassword2(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                placeholder="Repeat password"
                required
              />
            </label>

            <button
              type="submit"
              disabled={loading}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Creating account...' : 'Register'}
              {!loading && <ArrowRight className="h-4 w-4" />}
            </button>

            <p className="text-center text-xs text-slate-500">
              After registration, you will receive an activation link by email.
            </p>
          </form>
        )}

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-600"
          >
            {error}
          </motion.div>
        )}

        {info && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700"
          >
            {info}
          </motion.div>
        )}
      </motion.main>
    </div>
  )
}
