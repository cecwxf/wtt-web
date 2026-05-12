import { backendGetChallenge, backendListSubmissions } from '@/lib/arena/backend'
import { getChallenge, getChallengeTestCases, listSubmissions } from '@/lib/arena/store'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const localChallenge = getChallenge(params.id)
  const backendChallenge = await backendGetChallenge(params.id)
  // Prefer local AI Kernel metadata because it includes the canonical
  // LeetGPU statement/examples; keep backend submissions below.
  const challenge = localChallenge?.category === 'ai-kernel' ? localChallenge : (backendChallenge?.challenge || localChallenge)
  if (!challenge) return Response.json({ detail: 'Challenge not found' }, { status: 404 })
  const public_cases = getChallengeTestCases(challenge.id)
    .filter((testCase) => !testCase.is_hidden)
    .map(({ expected_output, input, ...rest }) => ({ ...rest, input, expected_output }))
  const sourceSubmissions = (await backendListSubmissions(challenge.id)) || backendChallenge?.submissions || listSubmissions(challenge.id)
  const submissions = sourceSubmissions.slice(0, 10).map((item) => ({
    id: item.id,
    challenge_id: item.challenge_id,
    user_id: item.user_id,
    language: item.language,
    status: item.status,
    score: item.score,
    runtime_ms: item.runtime_ms,
    memory_kb: item.memory_kb,
    judge_provider: item.judge_provider,
    judge_output_summary: item.judge_output_summary,
    agent_help_used: item.agent_help_used,
    hint_count: item.hint_count,
    created_at: item.created_at,
    updated_at: item.updated_at,
  }))
  return Response.json({ challenge, public_cases, submissions })
}
