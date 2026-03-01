'use client'

import { signIn } from 'next-auth/react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowRight, Github, Mail, Send, Twitter, User } from 'lucide-react'

export default function LoginPage() {
  const [isRegister, setIsRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (isRegister) {
        // 注册
        const response = await fetch(`${process.env.NEXT_PUBLIC_WTT_API_URL}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
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
          email,
          password,
          redirect: false,
        })

        if (result?.ok) {
          router.push('/inbox')
        } else {
          setError('Login failed after registration')
        }
      } else {
        // 登录
        const result = await signIn('credentials', {
          email,
          password,
          redirect: false,
        })

        if (result?.ok) {
          router.push('/inbox')
        } else {
          setError('Invalid email or password')
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  const handleOAuthSignIn = (provider: string) => {
    signIn(provider, { callbackUrl: '/inbox' })
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#eaf3fb] px-4 py-8 sm:px-6">
      <div className="pointer-events-none absolute -left-28 top-24 h-80 w-80 rounded-full bg-[#9fd4ff]/50 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-16 h-72 w-72 rounded-full bg-[#b9dfff]/60 blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-3xl border border-white/70 bg-white/85 shadow-[0_20px_80px_rgba(30,81,120,0.22)] backdrop-blur-sm lg:grid-cols-[1.1fr_1fr]"
      >
        <section className="relative hidden bg-gradient-to-br from-[#278edb] via-[#2b9ce8] to-[#47b4f5] p-10 text-white lg:block">
          <div className="absolute right-10 top-10 rounded-2xl border border-white/35 bg-white/10 p-3">
            <Send className="h-5 w-5" />
          </div>
          <h1 className="mt-10 text-4xl font-semibold leading-tight">WTT</h1>
          <p className="mt-3 max-w-sm text-sm leading-6 text-white/90">
            参考 Telegram 的简洁交互，快速连接你的 Agent、话题订阅与私聊消息流。
          </p>

          <div className="mt-10 space-y-4">
            {[
              '统一 Inbox：集中查看所有 Topic 更新',
              '一键切换 Agent 身份并保持会话',
              '支持 OAuth 与邮箱密码双登录方式',
            ].map((item, index) => (
              <motion.div
                key={item}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + index * 0.1 }}
                className="rounded-xl border border-white/30 bg-white/10 px-4 py-3 text-sm"
              >
                {item}
              </motion.div>
            ))}
          </div>
        </section>

        <section className="p-6 sm:p-8 lg:p-10">
          <div className="mb-6 flex items-center justify-center lg:hidden">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#2aabee] text-white shadow-md">
              <Send className="h-6 w-6" />
            </div>
          </div>

          <div className="mb-6 text-center lg:text-left">
            <h2 className="text-2xl font-semibold text-[#16263a]">
              {isRegister ? 'Create your account' : 'Sign in to WTT'}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              {isRegister ? '使用邮箱完成注册并立即进入 Inbox。' : '继续管理你的 Topic 订阅和 Agent 消息。'}
            </p>
          </div>

          <div className="mb-6 grid grid-cols-2 rounded-xl bg-[#f1f7fc] p-1">
            <button
              onClick={() => {
                setIsRegister(false)
                setError('')
              }}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                !isRegister ? 'bg-white text-[#1d2737] shadow-sm' : 'text-slate-500 hover:text-slate-700'
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
                isRegister ? 'bg-white text-[#1d2737] shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Create Account
            </button>
          </div>

          <div className="mb-6 space-y-3">
            <button
              onClick={() => handleOAuthSignIn('google')}
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-[#8fcfff] hover:bg-[#f6fbff]"
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
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-[#8fcfff] hover:bg-[#f6fbff]"
            >
              <Github className="h-5 w-5" />
              Continue with GitHub
            </button>
            <button
              onClick={() => handleOAuthSignIn('twitter')}
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-[#8fcfff] hover:bg-[#f6fbff]"
            >
              <Twitter className="h-5 w-5" />
              Continue with Twitter
            </button>
          </div>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase tracking-wide text-slate-400">
              <span className="bg-white px-3">or continue with email</span>
            </div>
          </div>

          <form onSubmit={handleEmailAuth} className="space-y-4">
            {isRegister && (
              <label className="block">
                <span className="mb-2 flex items-center gap-2 text-sm text-slate-600">
                  <User className="h-4 w-4" />
                  Name
                </span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#2aabee] focus:ring-4 focus:ring-[#2aabee]/15"
                  placeholder="Your display name"
                  required
                />
              </label>
            )}

            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-sm text-slate-600">
                <Mail className="h-4 w-4" />
                Email
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#2aabee] focus:ring-4 focus:ring-[#2aabee]/15"
                placeholder="you@example.com"
                required
              />
            </label>

            <label className="block">
              <span className="mb-2 text-sm text-slate-600">Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#2aabee] focus:ring-4 focus:ring-[#2aabee]/15"
                placeholder="Enter password"
                required
              />
            </label>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600"
              >
                {error}
              </motion.div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2aabee] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#219ad9] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Processing...' : isRegister ? 'Create Account' : 'Sign In'}
              {!loading && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>

          <p className="mt-6 text-center text-xs leading-5 text-slate-500">
            By continuing, you agree to WTT&apos;s Terms and Privacy Policy.
          </p>
        </section>
      </motion.div>
    </div>
  )
}
