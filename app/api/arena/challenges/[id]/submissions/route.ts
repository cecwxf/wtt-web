import { randomUUID } from 'node:crypto'
import { backendSaveSubmission } from '@/lib/arena/backend'
import { getChallenge, getChallengeTestCases, saveSubmission } from '@/lib/arena/store'
import { OPENCL_MAC_SKILL, isOpenCLJudgeProvider, judgeSubmission } from '@/lib/arena/judge'
import type { Submission } from '@/lib/arena/types'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const challenge = getChallenge(params.id)
  if (!challenge) return Response.json({ detail: 'Challenge not found' }, { status: 404 })

  let body: { code?: string; language?: string; user_id?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ detail: 'Invalid JSON body' }, { status: 400 })
  }

  const code = String(body.code || '').trimEnd()
  const language = String(body.language || 'python')
  const userId = String(body.user_id || 'demo-user')
  if (!code.trim()) return Response.json({ detail: 'Code is required' }, { status: 400 })
  if (code.length > 40_000) return Response.json({ detail: 'Code is too large' }, { status: 413 })

  const now = new Date().toISOString()
  const submissionId = randomUUID()
  const base: Submission = {
    id: submissionId,
    challenge_id: challenge.id,
    user_id: userId,
    language,
    code,
    status: 'judging',
    score: 0,
    judge_provider: 'pending',
    agent_help_used: false,
    hint_count: 0,
    created_at: now,
    updated_at: now,
    results: [],
  }
  saveSubmission(base)
  void backendSaveSubmission(base)

  try {
    const judged = await judgeSubmission({
      challenge,
      testCases: getChallengeTestCases(challenge.id),
      code,
      language,
      submissionId,
    })
    const acceptedCount = judged.results.filter((result) => result.status === 'accepted').length
    const judgedCaseCount = judged.results.length || getChallengeTestCases(challenge.id).length
    const metricSummary = [
      `${acceptedCount}/${judgedCaseCount} tests accepted`,
      `runtime ${judged.runtime_ms}ms`,
      judged.memory_kb ? `${isOpenCLJudgeProvider(judged.provider) ? 'kernel memory' : 'memory'} ${judged.memory_kb}KB` : undefined,
      judged.provider === OPENCL_MAC_SKILL ? `skill ${OPENCL_MAC_SKILL}` : undefined,
    ].filter(Boolean).join(' · ')
    const submission: Submission = {
      ...base,
      status: judged.status,
      score: judged.score,
      runtime_ms: judged.runtime_ms,
      memory_kb: judged.memory_kb,
      judge_provider: judged.provider,
      judge_output_summary: metricSummary,
      updated_at: new Date().toISOString(),
      results: judged.results,
    }
    saveSubmission(submission)
    void backendSaveSubmission(submission)
    return Response.json({ submission })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const submission: Submission = {
      ...base,
      status: 'system_error',
      judge_provider: 'wtt-arena',
      judge_output_summary: message,
      updated_at: new Date().toISOString(),
    }
    saveSubmission(submission)
    void backendSaveSubmission(submission)
    return Response.json({ submission }, { status: 200 })
  }
}
