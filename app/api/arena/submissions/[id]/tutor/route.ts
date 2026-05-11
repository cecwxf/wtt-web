import { backendGetSubmission, backendSaveSubmission } from '@/lib/arena/backend'
import { getChallenge, getSubmission, saveSubmission } from '@/lib/arena/store'

export const dynamic = 'force-dynamic'

function buildTutorMessage(mode: string, status: string, challenge?: { slug: string; function_name: string; input_keys: string[] }) {
  const signature = challenge ? `${challenge.function_name}(${challenge.input_keys.join(', ')})` : '目标函数'
  const hints: Record<string, string> = {
    'two-sum': '提示：先想想如何用一个哈希表记录已经看过的数字。遍历 nums 时，对当前值 x，检查 target - x 是否已经出现过。',
    'valid-palindrome': '提示：可以用双指针从两端向中间移动。遇到非字母数字字符就跳过，比较时统一转小写。',
    'maximum-subarray': '提示：维护“以当前位置结尾的最大子数组和”和“全局最大值”。如果之前的和变成负数，就从当前元素重新开始。',
  }
  if (mode === 'hint') {
    return challenge ? (hints[challenge.slug] || `提示：先确认 ${signature} 的输入输出，再用公开样例手动推演一次。`) : '提示：先用公开样例手动推演一次。'
  }
  if (mode === 'review' && status === 'accepted') {
    return `复盘：${signature} 已通过真实测试。建议继续总结：核心数据结构/状态定义是什么、边界条件有哪些、时间复杂度和空间复杂度是多少。下一步可以做同标签题，训练迁移能力。`
  }
  if (status === 'wrong_answer') {
    return `Debug 建议：当前 ${signature} 至少有一个测试点输出不符合预期。重点检查返回值类型、边界条件、重复值/空白字符/全负数等隐藏场景。隐藏测试不会暴露，但会覆盖常见边界。`
  }
  if (status === 'runtime_error' || status === 'compile_error') {
    return `Debug 建议：先看公开测试的 stderr/compile output。请确保定义了函数 ${signature}，并返回可 JSON 序列化的结果。`
  }
  if (status === 'system_error') {
    return '系统提示：当前判题后端不可用或未配置。请配置 JUDGE0_URL，或在本地开发环境设置 WTT_ARENA_ENABLE_LOCAL_PYTHON_JUDGE=1 后重试。'
  }
  return '建议：先用公开样例手动走一遍变量变化，再提交。Agent Tutor 不会泄露隐藏测试，但会帮助你定位常见边界条件。'
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const submission = (await backendGetSubmission(params.id)) || getSubmission(params.id)
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
  await backendSaveSubmission(updated)
  return Response.json({
    tutor: {
      mode,
      challenge_id: challenge?.id || submission.challenge_id,
      submission_id: submission.id,
      message: buildTutorMessage(mode, submission.status, challenge || undefined),
      hidden_tests_redacted: true,
    },
  })
}
