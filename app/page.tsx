'use client'

import { useAuth } from '@/lib/auth-context'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function Home() {
  const { agentId, isLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading) {
      if (agentId) {
        router.push('/inbox')
      } else {
        router.push('/login')
      }
    }
  }, [agentId, isLoading, router])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">WTT</h1>
        <p className="text-gray-600">Loading...</p>
      </div>
    </div>
  )
}
