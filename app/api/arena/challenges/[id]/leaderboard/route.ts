import { backendGetLeaderboard } from '@/lib/arena/backend'
import { getChallenge, getLeaderboard } from '@/lib/arena/store'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const challenge = getChallenge(params.id)
  if (!challenge) return Response.json({ detail: 'Challenge not found' }, { status: 404 })
  const backend = await backendGetLeaderboard(challenge.id)
  return Response.json({ leaderboard: backend || getLeaderboard(challenge.id) })
}
