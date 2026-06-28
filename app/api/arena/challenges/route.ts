import type { NextRequest } from 'next/server'
import { backendListChallenges } from '@/lib/arena/backend'
import { listChallenges } from '@/lib/arena/store'
import type { Challenge } from '@/lib/arena/types'

export const dynamic = 'force-dynamic'

function mergeChallenges(primary: Challenge[] | null, fallback: Challenge[]) {
  const rows = [...(primary || [])]
  const ids = new Set(rows.map((challenge) => challenge.id))
  const slugs = new Set(rows.map((challenge) => challenge.slug))
  for (const challenge of fallback) {
    const existingIndex = rows.findIndex((row) => row.id === challenge.id || row.slug === challenge.slug)
    // Local AI Kernel / interview seed carries canonical statements and
    // teaching metadata; prefer it over older backend seed rows.
    if ((challenge.category === 'ai-kernel' || (challenge.challenge_type === 'qa' && challenge.category.endsWith('-interview'))) && existingIndex >= 0) rows[existingIndex] = challenge
    else if (!ids.has(challenge.id) && !slugs.has(challenge.slug)) rows.push(challenge)
  }
  return rows
}

function filterChallenges(rows: Challenge[], request: NextRequest) {
  const params = request.nextUrl.searchParams
  const section = String(params.get('section') || params.get('category') || '').trim()
  const slug = String(params.get('slug') || params.get('id') || '').trim()

  if (slug) {
    return rows.filter((challenge) => challenge.slug === slug || challenge.id === slug)
  }
  if (section === 'education') {
    return rows.filter((challenge) => String(challenge.category || '').startsWith('education'))
  }
  if (section) {
    return rows.filter((challenge) => String(challenge.category || '') === section)
  }
  return rows
}

export async function GET(request: NextRequest) {
  const local = listChallenges()
  const backend = await backendListChallenges()
  const merged = mergeChallenges(backend, local)
  return Response.json({ challenges: filterChallenges(merged, request) })
}
