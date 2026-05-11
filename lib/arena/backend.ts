import { DEFAULT_WTT_API_ORIGIN } from '@/lib/api/base-url'
import type { Challenge, LeaderboardEntry, Submission } from './types'

const BACKEND_BASE =
  process.env.WTT_ARENA_BACKEND_URL ||
  process.env.WTT_API_URL ||
  process.env.NEXT_PUBLIC_WTT_API_URL ||
  DEFAULT_WTT_API_ORIGIN

const DISABLED = process.env.WTT_ARENA_BACKEND_DISABLED === '1'


function backendUrl(path: string) {
  return `${BACKEND_BASE.replace(/\/+$/, '')}${path}`
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T | null> {
  if (DISABLED) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(backendUrl(path), {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
      signal: controller.signal,
      cache: 'no-store',
    })
    if (!response.ok) return null
    return (await response.json()) as T
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function backendListChallenges() {
  const data = await requestJson<{ challenges?: Challenge[] }>('/arena/challenges')
  return Array.isArray(data?.challenges) ? data.challenges : null
}

export async function backendGetChallenge(idOrSlug: string) {
  const data = await requestJson<{ challenge?: Challenge; submissions?: Submission[] }>(`/arena/challenges/${encodeURIComponent(idOrSlug)}`)
  return data?.challenge ? data : null
}

export async function backendListSubmissions(challengeId: string) {
  const data = await requestJson<{ submissions?: Submission[] }>(`/arena/challenges/${encodeURIComponent(challengeId)}/submissions`)
  return Array.isArray(data?.submissions) ? data.submissions : null
}

export async function backendGetLeaderboard(challengeId: string) {
  const data = await requestJson<{ leaderboard?: LeaderboardEntry[] }>(`/arena/challenges/${encodeURIComponent(challengeId)}/leaderboard`)
  return Array.isArray(data?.leaderboard) ? data.leaderboard : null
}

export async function backendGetSubmission(id: string) {
  const data = await requestJson<{ submission?: Submission }>(`/arena/submissions/${encodeURIComponent(id)}`)
  return data?.submission || null
}

export async function backendSaveSubmission(submission: Submission) {
  const data = await requestJson<{ submission?: Submission }>('/arena/submissions', {
    method: 'POST',
    body: JSON.stringify(submission),
  })
  return data?.submission || null
}
