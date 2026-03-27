'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'
import { useI18n } from '@/lib/i18n-provider'

type Status = 'loading' | 'success' | 'error'

export default function ActivateClient({ token }: { token: string }) {
  const router = useRouter()
  const { t } = useI18n()
  const [status, setStatus] = useState<Status>('loading')
  const [message, setMessage] = useState(t('activate.verifying'))

  useEffect(() => {
    let mounted = true

    const run = async () => {
      if (!token) {
        if (!mounted) return
        setStatus('error')
        setMessage(t('activate.invalidLink'))
        return
      }

      try {
        const r = await fetch(`${CLIENT_WTT_API_BASE}/auth/activate?token=${encodeURIComponent(token)}`)
        const data = await r.json().catch(() => ({}))
        if (!mounted) return

        if (r.ok) {
          setStatus('success')
          setMessage(t('activate.successDefault'))
        } else {
          setStatus('error')
          setMessage(data.detail ?? t('activate.failedDefault'))
        }
      } catch {
        if (!mounted) return
        setStatus('error')
        setMessage(t('activate.networkError'))
      }
    }

    run()
    return () => {
      mounted = false
    }
  }, [t, token])

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-800">{t('activate.title')}</h1>
        <p className={`mt-3 text-sm ${status === 'success' ? 'text-emerald-700' : status === 'error' ? 'text-red-600' : 'text-slate-500'}`}>
          {message}
        </p>

        <div className="mt-6">
          <button
            onClick={() => router.push('/login')}
            className="w-full rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-600"
          >
            {t('activate.goLogin')}
          </button>
        </div>
      </div>
    </div>
  )
}
