import { backendGetSubmission } from '@/lib/arena/backend'
import { getSubmission } from '@/lib/arena/store'
import type { Submission } from '@/lib/arena/types'

export const dynamic = 'force-dynamic'

function isTerminal(submission?: Submission | null) {
  return Boolean(submission && submission.status !== 'pending' && submission.status !== 'judging' && submission.judge_provider !== 'pending')
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const backendSubmission = await backendGetSubmission(params.id)
  const localSubmission = getSubmission(params.id)
  const submission = isTerminal(localSubmission) && !isTerminal(backendSubmission)
    ? localSubmission
    : backendSubmission || localSubmission
  if (!submission) return Response.json({ detail: 'Submission not found' }, { status: 404 })
  return Response.json({ submission })
}
