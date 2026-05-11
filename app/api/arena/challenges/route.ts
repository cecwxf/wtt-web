import { backendListChallenges } from '@/lib/arena/backend'
import { listChallenges } from '@/lib/arena/store'

export const dynamic = 'force-dynamic'

export async function GET() {
  const backend = await backendListChallenges()
  return Response.json({ challenges: backend || listChallenges() })
}
