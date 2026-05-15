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

export async function GET() {
  const local = listChallenges()
  const backend = await backendListChallenges()
  return Response.json({ challenges: mergeChallenges(backend, local) })
}
