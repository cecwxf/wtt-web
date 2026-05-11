import { getChallenge, getSubmission, saveSubmission } from '@/lib/arena/store'

export const dynamic = 'force-dynamic'

function buildTutorMessage(mode: string, status: string) {
  if (mode === 'hint') {
    return '提示：先想想如何用一个哈希表记录已经看过的数字。遍历 nums 时，对当前值 x，检查 target - x 是否已经出现过。'
  }
  if (mode === 'review' && status === 'accepted') {
    return '复盘：这道题的最优思路是一次遍历 + 哈希表，时间复杂度 O(n)，空间复杂度 O(n)。注意返回的是下标，不是数值；同一个元素不能重复使用。你可以继续挑战 LRU Cache 或 TopK，训练哈希结构的变体应用。'
  }
  if (status === 'wrong_answer') {
    return 'Debug 建议：当前代码至少有一个测试点输出不符合预期。重点检查：1）你返回的是下标还是数值；2）是否处理了重复数字；3）是否在同一轮里错误复用了当前元素。隐藏测试不会暴露，但通常会覆盖重复值、负数和 0。'
  }
  if (status === 'runtime_error' || status === 'compile_error') {
    return 'Debug 建议：先看公开测试的 stderr/compile output。请确保定义了函数 two_sum(nums, target)，并返回可 JSON 序列化的下标列表，例如 [0, 1]。'
  }
  if (status === 'system_error') {
    return '系统提示：当前判题后端不可用或未配置。请配置 JUDGE0_URL，或在本地开发环境设置 WTT_ARENA_ENABLE_LOCAL_PYTHON_JUDGE=1 后重试。'
  }
  return '建议：先用公开样例手动走一遍变量变化，再提交。Agent Tutor 不会泄露隐藏测试，但会帮助你定位常见边界条件。'
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const submission = getSubmission(params.id)
  if (!submission) return Response.json({ detail: 'Submission not found' }, { status: 404 })
  const challenge = getChallenge(submission.challenge_id)
  let body: { mode?: string } = {}
  try { body = await request.json() } catch { /* ignore */ }
  const mode = body.mode || (submission.status === 'accepted' ? 'review' : 'debug')
  const updated = {
    ...submission,
    agent_help_used: true,
    hint_count: mode === 'hint' ? submission.hint_count + 1 : submission.hint_count,
    updated_at: new Date().toISOString(),
  }
  saveSubmission(updated)
  return Response.json({
    tutor: {
      mode,
      challenge_id: challenge?.id || submission.challenge_id,
      submission_id: submission.id,
      message: buildTutorMessage(mode, submission.status),
      hidden_tests_redacted: true,
    },
  })
}
