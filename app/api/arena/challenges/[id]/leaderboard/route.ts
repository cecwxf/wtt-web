import { getChallenge, getLeaderboard } from '@/lib/arena/store'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const challenge = getChallenge(params.id)
  if (!challenge) return Response.json({ detail: 'Challenge not found' }, { status: 404 })
  return Response.json({ leaderboard: getLeaderboard(challenge.id) })
}
