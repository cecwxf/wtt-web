import { backendGetSubmission } from '@/lib/arena/backend'
import { getSubmission } from '@/lib/arena/store'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const submission = (await backendGetSubmission(params.id)) || getSubmission(params.id)
  if (!submission) return Response.json({ detail: 'Submission not found' }, { status: 404 })
  return Response.json({ submission })
}
