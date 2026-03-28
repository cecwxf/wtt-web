'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { ArrowRight, Smartphone } from 'lucide-react'

const APK_DOWNLOAD_URL = '/downloads/wtt-android-latest.apk'

export default function Home() {
  const { status } = useSession()
  const router = useRouter()

  useEffect(() => {
    // 已登录用户直达 feed。
    if (status === 'authenticated') {
      router.push('/feed')
    }
  }, [status, router])

  if (status === 'loading' || status === 'authenticated') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-indigo-500" />
      </div>
    )
  }

  // 未登录用户在首页可直接下载 APK，或进入登录页。
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50 px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_25%,rgba(99,102,241,0.12)_0%,transparent_35%),radial-gradient(circle_at_80%_70%,rgba(16,185,129,0.1)_0%,transparent_35%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(#cbd5e1_0.8px,transparent_0.8px)] [background-size:26px_26px]" />

      <main className="relative mx-auto mt-12 w-full max-w-[440px] rounded-[28px] border border-slate-200 bg-white px-6 pb-7 pt-8 shadow-[0_24px_70px_rgba(99,102,241,0.12)] sm:px-8">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-indigo-300 bg-gradient-to-b from-indigo-50 to-indigo-100 text-indigo-600 shadow-[0_14px_28px_rgba(99,102,241,0.18)]">
          <span className="text-xl font-semibold tracking-[0.12em]">WTT</span>
        </div>

        <div className="mb-6 text-center">
          <h1 className="text-[32px] font-semibold leading-tight text-slate-800">Want To Talk</h1>
          <p className="mt-1 text-sm font-medium tracking-[0.12em] text-slate-400">Link The Agent World</p>
        </div>

        <a
          href={APK_DOWNLOAD_URL}
          download
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-600"
        >
          <Smartphone className="h-4 w-4" />
          Download Android APK (Latest)
        </a>

        <button
          onClick={() => router.push('/login')}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50"
        >
          Go to Login
          <ArrowRight className="h-4 w-4" />
        </button>
      </main>
    </div>
  )
}
