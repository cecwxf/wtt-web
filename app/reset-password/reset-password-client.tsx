'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'

export default function ResetPasswordClient({ token }: { token: string }) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setInfo('')

    if (!token) {
      setError('Invalid reset link.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (password !== password2) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`${CLIENT_WTT_API_BASE}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: password }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(data.detail ?? 'Failed to reset password')
        return
      }

      setInfo(data.message ?? 'Password reset successful. You can now sign in.')
      setTimeout(() => router.push('/login'), 1200)
    } catch {
      setError('Network error while resetting password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-800">Reset Password</h1>
        <p className="mt-2 text-sm text-slate-500">Set a new password for your account.</p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            placeholder="New password (at least 8 chars)"
            required
          />
          <input
            type="password"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            placeholder="Confirm new password"
            required
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-600 disabled:opacity-60"
          >
            {loading ? 'Resetting...' : 'Reset Password'}
          </button>
        </form>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {info && <p className="mt-3 text-sm text-emerald-700">{info}</p>}

        <button
          onClick={() => router.push('/login')}
          className="mt-4 text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          Back to login
        </button>
      </div>
    </div>
  )
}
