import { listChallenges } from '@/lib/arena/store'

export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json({ challenges: listChallenges() })
}
