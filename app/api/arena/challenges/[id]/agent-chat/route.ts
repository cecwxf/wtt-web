import { backendGetSubmission, backendSaveSubmission } from '@/lib/arena/backend'
import { getChallenge, getSubmission, saveSubmission } from '@/lib/arena/store'
import type { Challenge, Submission } from '@/lib/arena/types'

export const dynamic = 'force-dynamic'

type Locale = 'zh' | 'en'

type ChatBody = {
  message?: string
  locale?: Locale
  language?: string
  code?: string
  submission_id?: string
  messages?: Array<{ role?: string; content?: string }>
}

function isZh(locale?: string) {
  return locale !== 'en'
}

function languageContract(language?: string, challenge?: Challenge) {
  const fn = challenge?.function_name || 'target_function'
  if (language === 'cpp') return `C++ contract: define string ${fn}(const string& payload_json) and return a JSON string.`
  if (language === 'c') return `C contract: define const char* ${fn}(const char* payload_json) and return a JSON string.`
  return `Python contract: define ${fn}(...) and return a JSON-serializable value.`
}

function knownHint(challenge: Challenge, zh: boolean) {
  if (challenge.slug === 'two-sum') return zh
    ? '思路：用哈希表记录已访问数字的位置。遍历 nums 时查 target - x 是否已经出现，命中就返回两个下标。重点处理重复值。'
    : 'Approach: keep a hash map from seen value to index. For each x, check whether target - x already exists. Pay attention to duplicate values.'
  if (challenge.slug === 'valid-palindrome') return zh
    ? '思路：双指针从两端向中间走；跳过非字母数字字符，比较时统一小写。'
    : 'Approach: use two pointers, skip non-alphanumeric characters, and compare lowercased characters.'
  if (challenge.slug === 'maximum-subarray') return zh
    ? '思路：Kadane DP。维护“以当前位置结尾的最大和”和“全局最大和”，全负数场景也要正确。'
    : 'Approach: Kadane DP. Track the best sum ending here and the global best; handle all-negative arrays correctly.'
  if (challenge.category === 'ai-kernel') return zh
    ? `思路：先把输入 JSON payload 解析成 ${challenge.input_keys.join(', ')}，再写 CPU-sim 版本验证数学定义。通过后再考虑并行/向量化。`
    : `Approach: first parse the JSON payload into ${challenge.input_keys.join(', ')}, then implement the CPU-sim math definition before thinking about parallelism/vectorization.`
  return zh
    ? `思路：先确认 ${challenge.function_name}(${challenge.input_keys.join(', ')}) 的输入输出契约，用公开样例手动推演一次，再编码。`
    : `Approach: confirm the ${challenge.function_name}(${challenge.input_keys.join(', ')}) I/O contract, manually trace public examples, then code.`
}

function summarizeSubmission(submission: Submission | null, zh: boolean) {
  if (!submission) return zh ? '当前还没有提交结果。可以先 Run & Submit 一次，我再结合 verdict 帮你调试。' : 'There is no submission yet. Run & Submit once, then I can debug with the verdict.'
  const firstFail = submission.results.find((result) => result.status !== 'accepted' && !result.is_hidden)
  if (submission.status === 'accepted') return zh
    ? `最近一次提交已 AC，score=${submission.score}，provider=${submission.judge_provider}。可以继续问复杂度、优化或复盘。`
    : `The latest submission is accepted, score=${submission.score}, provider=${submission.judge_provider}. Ask for complexity, optimization, or review.`
  if (firstFail) {
    const detail = firstFail.error_message || firstFail.stderr || firstFail.compile_output || firstFail.stdout || ''
    return zh
      ? `最近一次提交状态是 ${submission.status}。第一个公开失败点提示：${detail || '输出与期望不一致，请检查返回 JSON 类型和边界条件。'}`
      : `The latest submission status is ${submission.status}. First public failure: ${detail || 'output differs from expected; check JSON return type and edge cases.'}`
  }
  return zh
    ? `最近一次提交状态是 ${submission.status}。隐藏测试不会泄露，但可以从公开样例、返回类型、边界条件和复杂度方向排查。`
    : `The latest submission status is ${submission.status}. Hidden tests stay redacted; debug via public examples, return type, edge cases, and complexity.`
}

function buildReply(message: string, challenge: Challenge, submission: Submission | null, body: ChatBody) {
  const zh = isZh(body.locale)
  const lower = message.toLowerCase()
  const asksHint = lower.includes('hint') || message.includes('提示') || message.includes('思路') || message.includes('怎么入手')
  const asksDebug = lower.includes('debug') || lower.includes('wrong') || lower.includes('wa') || lower.includes('error') || message.includes('调试') || message.includes('报错') || message.includes('错')
  const asksContract = lower.includes('contract') || lower.includes('language') || lower.includes('json') || message.includes('契约') || message.includes('语言') || message.includes('返回')
  const asksComplexity = lower.includes('complex') || message.includes('复杂度') || message.includes('优化')

  if (asksDebug) {
    const summary = summarizeSubmission(submission, zh)
    return zh
      ? `${summary}\n\n建议按这个顺序查：1) 函数名必须是 ${challenge.function_name}；2) 返回值必须匹配 JSON 期望；3) 用公开样例逐步打印中间变量；4) 再补空输入、重复值、极值/全负数等边界。隐藏测试不会在聊天里泄露。`
      : `${summary}\n\nDebug order: 1) function name must be ${challenge.function_name}; 2) return value must match JSON expected output; 3) trace public examples with intermediate variables; 4) add edge cases such as empty input, duplicates, extremes/all-negative values. Hidden tests are not disclosed in chat.`
  }

  if (asksContract) {
    const contract = languageContract(body.language, challenge)
    return zh
      ? `${contract}\n\nRunner 会把测试输入转成 payload/参数，执行 ${challenge.function_name}，再按 JSON 精确比对输出。C/C++ 版本建议先返回最小可解析 JSON 字符串，例如数组用 "[1,2]"，布尔值用 "true/false"。`
      : `${contract}\n\nThe runner feeds the test payload/arguments into ${challenge.function_name}, then compares the JSON output exactly. For C/C++, start with a minimal valid JSON string such as "[1,2]" for arrays or "true/false" for booleans.`
  }

  if (asksComplexity) {
    return zh
      ? `复杂度目标取决于题型：当前题是 ${challenge.category} / ${challenge.difficulty}。先做正确的基线版本，再优化时间复杂度；如果是 AI Kernel 题，优先确认数学定义、内存访问模式、归约/广播边界，再谈并行化。`
      : `Complexity target depends on the category: this is ${challenge.category} / ${challenge.difficulty}. Build a correct baseline first, then optimize time complexity. For AI Kernel tasks, verify the math definition, memory access pattern, reduction/broadcast edges, then think about parallelization.`
  }

  if (asksHint) return knownHint(challenge, zh)

  const submissionSummary = summarizeSubmission(submission, zh)
  return zh
    ? `我在。当前题目是「${challenge.title}」，目标函数 ${challenge.function_name}。\n\n${submissionSummary}\n\n你可以继续问我：解题思路、某段代码为什么错、C/C++/Python 返回契约、复杂度优化，或让我根据最近一次提交做复盘。`
    : `I'm here. Current challenge: "${challenge.title}", target function ${challenge.function_name}.\n\n${submissionSummary}\n\nYou can ask for approach, why a code snippet fails, C/C++/Python return contract, complexity optimization, or a review of the latest submission.`
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const challenge = getChallenge(params.id)
  if (!challenge) return Response.json({ detail: 'Challenge not found' }, { status: 404 })

  let body: ChatBody = {}
  try { body = await request.json() } catch { /* ignore */ }
  const message = (body.message || '').trim()
  if (!message) return Response.json({ detail: 'message is required' }, { status: 400 })

  const submission = body.submission_id ? ((await backendGetSubmission(body.submission_id)) || getSubmission(body.submission_id)) : null
  if (submission) {
    const updated = { ...submission, agent_help_used: true, updated_at: new Date().toISOString() }
    saveSubmission(updated)
    await backendSaveSubmission(updated)
  }

  return Response.json({
    agent: {
      challenge_id: challenge.id,
      submission_id: submission?.id || null,
      message: buildReply(message, challenge, submission, body),
      hidden_tests_redacted: true,
      mode: 'chat',
    },
  })
}
