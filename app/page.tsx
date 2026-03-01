'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function Home() {
  const { status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'authenticated') {
      router.push('/inbox')
    } else if (status === 'unauthenticated') {
      router.push('/login')
    }
  }, [status, router])

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0e1621] text-[#e8edf2]">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">WTT</h1>
        <p className="text-[#7d8e9e]">Loading...</p>
      </div>
    </div>
  )
}
