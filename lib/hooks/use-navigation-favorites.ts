'use client'

import { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'

export interface NavigationFavorite {
  kind: 'agent' | 'topic'
  target_id: string
  available: boolean
  agent_id?: string
  name?: string
  agent_name?: string
  adapter?: string
  host_name?: string
}

export const favoriteKey = (kind: NavigationFavorite['kind'], id: string) => `${kind}:${id}`

export function useNavigationFavorites(userId?: string, token?: string) {
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [writeFailed, setWriteFailed] = useState(false)
  const active = useRef(true)
  const operations = useRef(new Set<string>())
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const request = async (path = '', init?: RequestInit) => {
    const response = await fetch(`${CLIENT_WTT_API_BASE}/navigation/favorites${path}`, {
      ...init, cache: 'no-store', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
    if (!response.ok) throw new Error('Favorite request failed')
    return response.json()
  }
  const { data, error, isLoading, mutate } = useSWR<NavigationFavorite[]>(
    userId && token ? ['navigation-favorites', userId, token] : null,
    async () => {
      const result: unknown = await request()
      if (!Array.isArray(result) || result.length > 200 || result.some(row =>
        !row || !['agent', 'topic'].includes(row.kind) || typeof row.target_id !== 'string'
        || row.target_id.length > 255 || typeof row.available !== 'boolean'
        || (row.available && (typeof row.agent_id !== 'string' || typeof row.name !== 'string')))) {
        throw new Error('Invalid favorites response')
      }
      return result
    }, { shouldRetryOnError: false, revalidateOnFocus: true, revalidateOnReconnect: true },
  )
  const keys = new Set((data || []).map(row => favoriteKey(row.kind, row.target_id)))
  async function toggle(kind: NavigationFavorite['kind'], id: string, agentId: string) {
    const key = favoriteKey(kind, id)
    if (!userId || !token || !data || operations.current.has(key)) return
    operations.current.add(key)
    setPending(new Set(operations.current))
    setWriteFailed(false)
    try {
      const removing = keys.has(key)
      await request(`/${kind}/${encodeURIComponent(id)}`, {
        method: removing ? 'DELETE' : 'PUT',
        ...(removing ? {} : { body: JSON.stringify({ agent_id: agentId }) }),
      })
      if (active.current) await mutate()
    } catch {
      if (active.current) setWriteFailed(true)
    } finally {
      operations.current.delete(key)
      if (active.current) setPending(new Set(operations.current))
    }
  }
  return { favorites: data || [], keys, pending, failed: Boolean(error) || writeFailed,
    disabled: !data || isLoading, toggle, retry: () => { setWriteFailed(false); void mutate() } }
}
