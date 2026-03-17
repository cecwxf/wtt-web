'use client'

import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'wtt_selected_agent_id'

/**
 * Persists selectedAgentId across pages via URL param + localStorage fallback.
 * Reading: URL param > localStorage > ''
 * Writing: updates URL param (shallow) + localStorage.
 */
export function useAgentId(): [string, (id: string) => void] {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const paramValue = searchParams.get('agentId') || ''

  const [agentId, setAgentIdState] = useState<string>(() => {
    if (paramValue) return paramValue
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEY) || ''
    }
    return ''
  })

  // Sync from URL param changes (e.g., back/forward navigation)
  useEffect(() => {
    if (paramValue && paramValue !== agentId) {
      setAgentIdState(paramValue)
      localStorage.setItem(STORAGE_KEY, paramValue)
    }
  }, [paramValue]) // eslint-disable-line react-hooks/exhaustive-deps

  const setAgentId = useCallback(
    (id: string) => {
      setAgentIdState(id)
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, id)
      }
      // Update URL param without full navigation
      const params = new URLSearchParams(searchParams.toString())
      if (id) {
        params.set('agentId', id)
      } else {
        params.delete('agentId')
      }
      const qs = params.toString()
      router.replace(`${pathname}${qs ? '?' + qs : ''}`, { scroll: false })
    },
    [pathname, router, searchParams],
  )

  return [agentId, setAgentId]
}

/**
 * Build a URL preserving the agentId param.
 */
export function buildAgentUrl(path: string, agentId: string, extraParams?: Record<string, string>): string {
  const params = new URLSearchParams(extraParams)
  if (agentId) params.set('agentId', agentId)
  const qs = params.toString()
  return `${path}${qs ? '?' + qs : ''}`
}
