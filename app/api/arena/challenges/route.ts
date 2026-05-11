import { backendListChallenges } from '@/lib/arena/backend'
import { listChallenges } from '@/lib/arena/store'
import type { Challenge } from '@/lib/arena/types'

export const dynamic = 'force-dynamic'

function mergeChallenges(primary: Challenge[] | null, fallback: Challenge[]) {
  const rows = [...(primary || [])]
  const ids = new Set(rows.map((challenge) => challenge.id))
  const slugs = new Set(rows.map((challenge) => challenge.slug))
  for (const challenge of fallback) {
    if (!ids.has(challenge.id) && !slugs.has(challenge.slug)) rows.push(challenge)
  }
  return rows
}

export async function GET() {
  const local = listChallenges()
  const backend = await backendListChallenges()
  return Response.json({ challenges: mergeChallenges(backend, local) })
}
