'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import { CLIENT_WTT_API_BASE, WS_BASE_URL } from '@/lib/api/base-url'
import { useAgentId } from '@/lib/hooks/use-agent-id'
import { useWebSocket, type WsMessage } from '@/lib/useWebSocket'
import { AgentWhiteboard } from '@/components/arena/agent-whiteboard'
import type { ArenaSessionState, ArenaTeachingIntent, ArenaUserProfile, Challenge, LeaderboardEntry, Submission } from '@/lib/arena/types'
import { extractWhiteboardPayload, makeWhiteboardFromAnswerPrompt, makeWhiteboardPrompt, stripWhiteboardPayload, type WhiteboardDiagram } from '@/lib/arena/whiteboard'
import { gaokaoKnowledgeContextMarkdown } from '@/lib/arena/gaokao-knowledge'
import { normalizeMarkdownMath } from '@/lib/markdown-math'

const Editor = dynamic(() => import('@monaco-editor/react'), { ssr: false })

type Locale = 'zh' | 'en'
type Language = 'opencl' | 'cuda' | 'triton' | 'cpp' | 'python' | 'c'
type KernelEnvironment = 'macos-opencl'
type ChatMode = 'socratic' | 'interview_answer' | 'ask'
type ChatMessage = { id?: string; role: 'user' | 'agent'; content: string; createdAt: string }

type ChallengePayload = {
  challenge: Challenge
  public_cases: Array<{ id: string; input: string; expected_output: string; explanation?: string }>
  submissions: Array<Omit<Submission, 'code' | 'results'>>
}

type TopicMessage = { id?: string; message_id?: string; sender_type?: string; sender_id?: string; semantic_type?: string; content?: string; timestamp?: string; created_at?: string }
type ArenaTypingState = { topicId: string; agentId: string; agentName?: string; startedAt: number; expiresAt: number }

function diagramHasHtml(diagram?: WhiteboardDiagram | null) {
  return Boolean(diagram?.html?.trim() || diagram?.steps?.some((step) => step.html?.trim()))
}

function mergeWhiteboardDiagram(previous: WhiteboardDiagram | null, next: WhiteboardDiagram) {
  if (!previous || diagramHasHtml(next) || !diagramHasHtml(previous)) return next
  return {
    ...next,
    html: next.html || previous.html,
    steps: next.steps?.map((step, index) => ({
      ...step,
      html: step.html || previous.steps?.[index]?.html,
    })) || previous.steps,
  }
}

const ARENA_AGENT_ID = 'agent-16a45cf0dd8b'

type ArenaSession = { accessToken?: string; userId?: string; user?: { name?: string | null; email?: string | null } | null }

type CoachAction = {
  intent: ArenaTeachingIntent
  zh: string
  en: string
  promptZh: (challenge: Challenge) => string
  promptEn: (challenge: Challenge) => string
}

function extractChallengeFocus(challenge: Challenge) {
  const match = challenge.description.match(/考察重点：([\s\S]+?)(?:\n\n|$)/)
  return match?.[1]?.trim() || challenge.description.split(/\n+/).find((line) => line.trim().length > 18)?.trim() || challenge.title
}

function explainPromptZh(challenge: Challenge) {
  const focus = extractChallengeFocus(challenge)
  const concepts = challenge.concepts?.slice(0, 4).join('、') || challenge.tags.slice(0, 4).join('、')
  const title = challenge.title

  if (challenge.whiteboard_template === 'inference_flow') {
    return `请讲解「${title}」。这题重点是：${focus} 请围绕 ${concepts}，说明关键机制、张量或缓存如何流动、主要性能瓶颈，以及如何用实验验证结论。`
  }

  if (challenge.whiteboard_template === 'evaluation_loop') {
    return `请讲解「${title}」。这题重点是：${focus} 请说明数据如何产生、优化目标如何设定、评测闭环如何建立，以及哪些样本或指标最容易误导判断。`
  }

  if (challenge.whiteboard_template === 'training_serving_consistency') {
    return `请讲解「${title}」。这题重点是：${focus} 请把训练侧、在线侧、状态同步、显存或吞吐压力，以及一致性校验路径讲清楚。`
  }

  if (challenge.whiteboard_template === 'system_architecture') {
    return `请讲解「${title}」。这题重点是：${focus} 请拆出关键组件、数据流向、在线/离线边界、反馈闭环和上线后的观测点。`
  }

  if (challenge.whiteboard_template === 'pipeline') {
    return `请讲解「${title}」。这题重点是：${focus} 请按输入准备、核心处理、关键瓶颈、验证方法和迭代路径展开，不要套通用系统设计模板。`
  }

  return `请讲解「${title}」。这题重点是：${focus} 请围绕本题的核心概念、推理步骤、边界条件和检查方法展开。`
}

function explainPromptEn(challenge: Challenge) {
  const focus = extractChallengeFocus(challenge)
  const concepts = challenge.concepts?.slice(0, 4).join(', ') || challenge.tags.slice(0, 4).join(', ')
  const title = challenge.title

  if (challenge.whiteboard_template === 'inference_flow') {
    return `Explain "${title}". Focus: ${focus} Cover ${concepts}, how tensors or cache state flows, the main performance bottleneck, and how to validate the conclusion experimentally.`
  }

  if (challenge.whiteboard_template === 'evaluation_loop') {
    return `Explain "${title}". Focus: ${focus} Cover how the data is produced, how the optimization target is defined, how evaluation closes the loop, and which samples or metrics can mislead the decision.`
  }

  if (challenge.whiteboard_template === 'training_serving_consistency') {
    return `Explain "${title}". Focus: ${focus} Connect training, serving, state synchronization, memory or throughput pressure, and consistency checks.`
  }

  if (challenge.whiteboard_template === 'system_architecture') {
    return `Explain "${title}". Focus: ${focus} Break down the core components, data flow, online/offline boundary, feedback loop, and production observability points.`
  }

  if (challenge.whiteboard_template === 'pipeline') {
    return `Explain "${title}". Focus: ${focus} Walk through input preparation, core processing, bottlenecks, validation, and iteration without using a generic system-design template.`
  }

  return `Explain "${title}". Focus: ${focus} Cover the core concepts, reasoning path, edge cases, and checks specific to this problem.`
}

const coachActions: CoachAction[] = [
  {
    intent: 'ask_hint',
    zh: '提示',
    en: 'Hint',
    promptZh: (challenge) => `我正在做「${challenge.title}」。请不要直接给标准答案，先围绕“${extractChallengeFocus(challenge)}”问一个能推动我继续思考的问题。`,
    promptEn: (challenge) => `I am working on "${challenge.title}". Do not give the final answer; ask one Socratic question grounded in this focus: ${extractChallengeFocus(challenge)}.`,
  },
  {
    intent: 'explain',
    zh: '讲答案',
    en: 'Explain',
    promptZh: explainPromptZh,
    promptEn: explainPromptEn,
  },
  {
    intent: 'recommend_next',
    zh: '类题迁移',
    en: 'Transfer',
    promptZh: (challenge) => `基于「${challenge.title}」的考察重点“${extractChallengeFocus(challenge)}”和我的当前状态，请推荐下一道练习题或迁移方向，并说明为什么。`,
    promptEn: (challenge) => `Based on "${challenge.title}", this focus: ${extractChallengeFocus(challenge)}, and my current state, recommend the next practice problem or transfer direction and explain why.`,
  },
]

const chatModes: Array<{ id: ChatMode; zh: string; en: string; hintZh: string; hintEn: string }> = [
  {
    id: 'socratic',
    zh: '苏格拉底',
    en: 'Socratic',
    hintZh: 'Agent 先追问和点拨，推动你自己推理。',
    hintEn: 'The Agent asks guiding questions and nudges your reasoning.',
  },
  {
    id: 'interview_answer',
    zh: '面试回答',
    en: 'Interview',
    hintZh: '你输入答案，Agent 评分、点评并补全。',
    hintEn: 'You answer; the Agent scores, critiques, and supplements it.',
  },
  {
    id: 'ask',
    zh: 'Ask',
    en: 'Ask',
    hintZh: '直接问答，Agent 给出清晰答案。',
    hintEn: 'Direct Q&A with a clear answer.',
  },
]

function ArenaChatMarkdown({ content }: { content: string }) {
  return (
    <div className="max-w-none text-sm leading-6 text-gray-300 [&_.katex-display]:my-3 [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_a]:text-[#3ce8e2] [&_a]:underline [&_code]:rounded [&_code]:bg-black/30 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-gray-100 [&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-black [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-black [&_h3]:mb-1.5 [&_h3]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_ol>li]:list-decimal [&_p]:my-2 [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-black/40 [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs [&_td]:border [&_td]:border-gray-700 [&_td]:p-2 [&_th]:border [&_th]:border-gray-700 [&_th]:bg-gray-800 [&_th]:p-2 [&_th]:text-left">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{normalizeMarkdownMath(content)}</ReactMarkdown>
    </div>
  )
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&le;/g, '<=')
    .replace(/&ge;/g, '>=')
    .replace(/&times;/g, 'x')
}

function stripHtmlTags(value: string) {
  return decodeHtmlEntities(value.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).trim()
}

function htmlDescriptionToMarkdown(html: string) {
  const rawBlocks: string[] = []
  const stashRawBlock = (block: string) => {
    const token = `@@ARENA_RAW_BLOCK_${rawBlocks.length}@@`
    rawBlocks.push(block)
    return `\n\n${token}\n\n`
  }

  let markdown = String(html || '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, (block) => stashRawBlock(block))
    .replace(/<table[\s\S]*?<\/table>/gi, (block) => stashRawBlock(block))
    .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_match, body: string) => {
      const code = stripHtmlTags(body.replace(/<\/?code[^>]*>/gi, ''))
      return `\n\n\`\`\`\n${code}\n\`\`\`\n\n`
    })
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_match, level: string, body: string) => `\n\n${'#'.repeat(Number(level))} ${stripHtmlTags(body)}\n\n`)
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/?(ul|ol)[^>]*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<p[^>]*>/gi, '\n\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, (_match, body: string) => `**${stripHtmlTags(body)}**`)
    .replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, (_match, body: string) => `**${stripHtmlTags(body)}**`)
    .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, (_match, body: string) => `_${stripHtmlTags(body)}_`)
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_match, body: string) => `\`${stripHtmlTags(body)}\``)
    .replace(/<[^>]+>/g, '')

  markdown = decodeHtmlEntities(markdown)
  rawBlocks.forEach((block, index) => {
    markdown = markdown.replace(`@@ARENA_RAW_BLOCK_${index}@@`, block)
  })
  return markdown.replace(/\n{3,}/g, '\n\n').trim()
}

function descriptionMarkdown(challenge: Challenge, locale: Locale) {
  const description = localizedDescription(challenge, locale)
  return challenge.description_format === 'html' ? htmlDescriptionToMarkdown(description) : description
}

function ArenaDescriptionMarkdown({ content }: { content: string }) {
  return (
    <div className="mt-6 rounded-lg border border-gray-800 bg-[#151515] p-5 text-sm leading-7 text-gray-300">
      <div className="max-w-none space-y-4 [&_.katex-display]:my-4 [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_a]:text-[#3ce8e2] [&_a]:underline [&_code]:rounded [&_code]:bg-black/40 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_h1]:mt-2 [&_h1]:text-2xl [&_h1]:font-black [&_h1]:text-white [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-white [&_h3]:mt-5 [&_h3]:font-bold [&_h3]:text-white [&_li]:ml-5 [&_li]:list-disc [&_ol>li]:list-decimal [&_p]:leading-7 [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-gray-800 [&_pre]:bg-black/30 [&_pre]:p-4 [&_pre]:font-mono [&_pre]:text-gray-200 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_svg]:mx-auto [&_svg]:my-5 [&_svg]:max-w-full [&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-gray-800 [&_td]:p-2 [&_th]:border [&_th]:border-gray-800 [&_th]:bg-gray-900 [&_th]:p-2 [&_th]:text-left">
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeRaw, rehypeKatex]}>
          {normalizeMarkdownMath(content)}
        </ReactMarkdown>
      </div>
    </div>
  )
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function isSubmissionTerminal(submission?: Submission | null) {
  return Boolean(submission && submission.status !== 'pending' && submission.status !== 'judging' && submission.judge_provider !== 'pending')
}

function isOpenCLProvider(provider?: string) {
  return provider === 'agent-mac-opencl-kernel' || Boolean(provider?.startsWith('remote-opencl-'))
}

const copy = {
  zh: {
    challenges: '题库', playground: '训练场', discuss: '讨论', runner: 'Agent Runner 执行', description: '题目', submissions: '提交', leaderboard: '排行榜',
    function: '函数', timeLimit: '时间限制', memory: '内存', examples: '样例', input: '输入', expected: '期望输出',
    language: '语言', run: '交给 Agent 运行并提交', judging: 'Agent 运行中...', console: '运行结果', notSubmitted: '未提交', hidden: '隐藏测试已脱敏',
    noSubmission: '提交后会在这里看到真实 Agent/Runner 判题结果。历史提交会持久化到 WTT 后端。', firstAc: '暂无 AC 记录，拿下首个榜单位置。',
    agentTitle: 'Agent 对话', agentRole: '固定使用 Codex Arena Coach：agent-16a45cf0dd8b。所有登录用户都可使用，不需要 claim 该 Agent。',
    agentWaiting: '直接在下面和 Agent 对话。', openFull: '打开完整提交 →',
    chatTitle: 'Arena Coach', chatIntro: '真实 WTT Agent 会话；Agent 会读取 Arena 题库长期记忆和当前题目上下文。', chatPlaceholder: '问 Agent：这题怎么入手？为什么 WA？', chatSend: '发送', chatThinking: 'Agent 思考中...', chatFallback: 'Agent 暂时没有返回，请稍后再试。', chatLogin: '登录后可对话。', chatSyncing: '正在连接固定 Arena Agent...',
    chatWorking: 'Agent 正在思考 / 输出中', whiteboardWorking: 'Agent 正在生成白板',
    mode: '模式',
    coachFlow: '教学编排', growth: '成长档案', weak: '薄弱点', next: '下一题', mastery: '掌握度', stage: '阶段',
    aiDesc: 'AI Kernel 题默认使用完整 OpenCL C 程序：包含 platform/device 选择、program build、kernel arg、enqueue、readback 和 JSON 输出。提交后由 agent-mac-opencl-kernel 在 Mac mini 上编译运行 example/hidden case，并返回时间和 kernel memory；CUDA C++ / Triton 作为目标语言保留给远程硬件 runner。',
    interviewMode: 'AI 面试练习模式', interviewHint: '开放式面试题，直接在右侧和 Arena Coach 练习结构化回答。', noExamples: '这是一道开放式面试题，无固定样例；请用右侧 Agent 对话练习结构化回答。',
    consultation: '咨询说明', gaokaoIntro: '高考志愿 Ask 咨询。不是刷题 Problem；请直接输入省份、科类/选科、分数、位次、专业兴趣和城市偏好。',
  },
  en: {
    challenges: 'Challenges', playground: 'Playground', discuss: 'Discuss', runner: 'Agent Runner', description: 'Description', submissions: 'Submissions', leaderboard: 'Leaderboard',
    function: 'Function', timeLimit: 'Time Limit', memory: 'Memory', examples: 'Examples', input: 'Input', expected: 'Expected',
    language: 'Language', run: 'Run & Submit via Agent', judging: 'Agent running...', console: 'Console', notSubmitted: 'not_submitted', hidden: 'Hidden tests are redacted.',
    noSubmission: 'Submit once to see the real Agent/Runner verdict. Submissions are persisted in the WTT backend.', firstAc: 'No accepted run yet. Take the first spot.',
    agentTitle: 'Agent Chat', agentRole: 'Fixed Codex Arena Coach: agent-16a45cf0dd8b. Every signed-in user can use it without claiming this Agent.',
    agentWaiting: 'Chat with the Agent below.', openFull: 'Open full submission →',
    chatTitle: 'Arena Coach', chatIntro: 'Real WTT Agent session. The Agent reads persistent Arena question-bank memory plus the current challenge context.', chatPlaceholder: 'Ask Agent: how should I start? why WA?', chatSend: 'Send', chatThinking: 'Agent is thinking...', chatFallback: 'Agent did not respond. Please try again.', chatLogin: 'Sign in to chat.', chatSyncing: 'Connecting fixed Arena Agent...',
    chatWorking: 'Agent is thinking / writing', whiteboardWorking: 'Agent is generating the whiteboard',
    mode: 'Mode',
    coachFlow: 'Teaching flow', growth: 'Growth profile', weak: 'Weak spots', next: 'Next', mastery: 'Mastery', stage: 'Stage',
    aiDesc: 'AI Kernel challenge. Complete OpenCL C programs are the default: platform/device selection, program build, kernel args, enqueue, readback, and JSON output. The agent-mac-opencl-kernel skill compiles and runs example/hidden cases on the Mac mini and reports runtime plus kernel memory; CUDA C++ / Triton remain target languages for remote hardware runners.',
    interviewMode: 'AI interview practice mode', interviewHint: 'Open-ended interview prompt. Practice a structured answer with Arena Coach on the right.', noExamples: 'This is an open-ended interview prompt with no fixed examples. Practice a structured answer with the Agent on the right.',
    consultation: 'Consultation', gaokaoIntro: 'Gaokao volunteer Ask consultation. This is not a problem; describe province, subject track, score, rank, interests, and city preferences.',
  },
} as const

function statusTone(status?: string) {
  if (status === 'accepted') return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
  if (!status || status === 'pending' || status === 'judging') return 'border-gray-700 bg-[#202020] text-gray-400'
  if (status === 'system_error') return 'border-yellow-400/20 bg-yellow-400/10 text-yellow-300'
  return 'border-rose-400/20 bg-rose-400/10 text-rose-300'
}

function difficultyTone(difficulty: string) {
  if (difficulty === 'easy') return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
  if (difficulty === 'medium') return 'border-yellow-400/20 bg-yellow-400/10 text-yellow-300'
  return 'border-rose-400/20 bg-rose-400/10 text-rose-300'
}

function formatDifficulty(difficulty: string) {
  return difficulty.charAt(0).toUpperCase() + difficulty.slice(1)
}

function editorLanguage(language: Language) {
  if (language === 'opencl') return 'c'
  if (language === 'cuda') return 'cpp'
  if (language === 'triton') return 'python'
  if (language === 'cpp') return 'cpp'
  if (language === 'c') return 'c'
  return 'python'
}

function hasAnyTag(challenge: Challenge, tags: string[]) {
  return tags.some((tag) => challenge.tags.includes(tag))
}

const openClArrayExampleTags = [
  'vector-add',
  'invert',
  'conv1d',
  'reverse',
  'relu',
  'leaky-relu',
  'sigmoid',
  'clip',
  'softmax',
  'prefix-sum',
  'sort',
  'topk',
  'grayscale',
  'interleave',
]

const openClScalarExampleTags = ['sum', 'dot', 'silu', 'max-subarray']

function openClOutputKind(challenge: Challenge, mode: string) {
  if (mode === 'copy') return 'copy_object'
  if (mode !== 'vector') return 'matrix'
  if (hasAnyTag(challenge, openClScalarExampleTags)) return 'scalar'
  if (hasAnyTag(challenge, openClArrayExampleTags)) return 'array'
  return 'checksum_object'
}

function kernelMode(challenge: Challenge) {
  return challenge.tags.includes('matmul') || challenge.tags.includes('gemm')
    ? 'gemm'
    : challenge.tags.includes('matrix-add')
      ? 'matrix_add'
      : challenge.tags.includes('transpose')
        ? 'transpose'
        : challenge.tags.includes('copy')
          ? 'copy'
          : 'vector'
}

function exampleOutputN(challenge: Challenge) {
  if (challenge.tags.includes('conv1d')) return 4
  if (challenge.tags.includes('softmax')) return 4
  if (challenge.tags.includes('topk')) return 3
  if (challenge.tags.includes('grayscale')) return 1
  if (challenge.tags.includes('interleave')) return 6
  if (hasAnyTag(challenge, openClScalarExampleTags)) return 1
  if (!hasAnyTag(challenge, openClArrayExampleTags)) return 1
  return 5
}

function exampleVectorGlobalSize(challenge: Challenge) {
  if (challenge.tags.includes('softmax')) return 4
  return Math.max(5, exampleOutputN(challenge))
}

function openClKernelSource(challenge: Challenge) {
  if (challenge.tags.includes('matmul') || challenge.tags.includes('gemm')) {
    return `// Device kernel: GEMM, row-major, C[M,N] = A[M,K] * B[K,N].
// Supported local GEMM signature:
//   kernel_name(A, B, C, M, N, K), row-major, C[M,N] = A[M,K] * B[K,N]
__kernel void ${challenge.function_name}(__global const float* A,
                                         __global const float* B,
                                         __global float* C,
                                         const int M,
                                         const int N,
                                         const int K) {
    const int col = get_global_id(0);
    const int row = get_global_id(1);
    if (row >= M || col >= N) return;

    float acc = 0.0f;
    for (int kk = 0; kk < K; ++kk) {
        acc += A[row * K + kk] * B[kk * N + col];
    }
    C[row * N + col] = acc;
}
`
  }

  if (challenge.tags.includes('matrix-add')) {
    return `// Device kernel: matrix add, row-major, C = A + B.
// Supported signature:
//   kernel_name(A, B, C, rows, cols), row-major, C = A + B
__kernel void ${challenge.function_name}(__global const float* A,
                                         __global const float* B,
                                         __global float* C,
                                         const int rows,
                                         const int cols) {
    const int col = get_global_id(0);
    const int row = get_global_id(1);
    if (row >= rows || col >= cols) return;
    const int idx = row * cols + col;
    C[idx] = A[idx] + B[idx];
}
`
  }

  if (challenge.tags.includes('transpose')) {
    return `// Device kernel: matrix transpose.
// Supported signature:
//   kernel_name(input, output, rows, cols), row-major, output[cols,rows] = transpose(input[rows,cols])
__kernel void ${challenge.function_name}(__global const float* input,
                                         __global float* output,
                                         const int rows,
                                         const int cols) {
    const int out_col = get_global_id(0);
    const int out_row = get_global_id(1);
    if (out_row >= cols || out_col >= rows) return;
    output[out_row * rows + out_col] = input[out_col * cols + out_row];
}
`
  }

  if (challenge.tags.includes('copy')) {
    return `// Device kernel: matrix copy.
// Supported signature:
//   kernel_name(input, output, rows, cols), row-major
__kernel void ${challenge.function_name}(__global const float* input,
                                         __global float* output,
                                         const int rows,
                                         const int cols) {
    const int col = get_global_id(0);
    const int row = get_global_id(1);
    if (row >= rows || col >= cols) return;
    const int idx = row * cols + col;
    output[idx] = input[idx];
}
`
  }

  const body = (() => {
    if (challenge.tags.includes('vector-add')) return '    output[gid] = values[gid] + (float)gid;'
    if (challenge.tags.includes('invert')) return '    float x = values[gid] + 128.0f;\n    if (x < 0.0f) x = 0.0f;\n    if (x > 255.0f) x = 255.0f;\n    output[gid] = 255.0f - x;'
    if (challenge.tags.includes('conv1d')) return '    if (gid + 1 < n) output[gid] = values[gid] - values[gid + 1];'
    if (challenge.tags.includes('reverse')) return '    output[gid] = values[n - 1 - gid];'
    if (challenge.tags.includes('relu')) return '    float x = values[gid];\n    output[gid] = x > 0.0f ? x : 0.0f;'
    if (challenge.tags.includes('leaky-relu')) return '    float x = values[gid];\n    output[gid] = x >= 0.0f ? x : x * 0.1f;'
    if (challenge.tags.includes('silu')) return '    if (gid == 0) {\n        float acc = 0.0f;\n        for (int i = 0; i < n; ++i) acc += values[i] / (1.0f + exp(-values[i]));\n        output[0] = round(acc * 10000.0f) / 10000.0f;\n    }'
    if (challenge.tags.includes('sigmoid')) return '    float y = 1.0f / (1.0f + exp(-values[gid]));\n    output[gid] = round(y * 10000.0f) / 10000.0f;'
    if (challenge.tags.includes('clip')) return '    float x = values[gid];\n    if (x < -2.0f) x = -2.0f;\n    if (x > 4.0f) x = 4.0f;\n    output[gid] = x;'
    if (challenge.tags.includes('sum')) return '    if (gid == 0) {\n        float acc = 0.0f;\n        for (int i = 0; i < n; ++i) acc += values[i];\n        output[0] = acc;\n    }'
    if (challenge.tags.includes('dot')) return '    if (gid == 0) {\n        float acc = 0.0f;\n        for (int i = 0; i < n; ++i) acc += values[i] * (float)(i + 1);\n        output[0] = acc;\n    }'
    if (challenge.tags.includes('softmax')) return '    float max_value = values[0];\n    for (int i = 1; i < n; ++i) max_value = fmax(max_value, values[i]);\n    float denom = 0.0f;\n    for (int i = 0; i < n; ++i) denom += exp(values[i] - max_value);\n    output[gid] = exp(values[gid] - max_value) / denom;'
    if (challenge.tags.includes('prefix-sum')) return '    float acc = 0.0f;\n    for (int i = 0; i <= gid && i < n; ++i) acc += values[i];\n    output[gid] = acc;'
    if (challenge.tags.includes('sort')) return '    if (gid == 0) {\n        int used[64];\n        for (int i = 0; i < 64; ++i) used[i] = 0;\n        for (int rank = 0; rank < n; ++rank) {\n            float best = 3.402823e38f;\n            int best_i = 0;\n            for (int i = 0; i < n; ++i) {\n                if (!used[i] && values[i] < best) { best = values[i]; best_i = i; }\n            }\n            used[best_i] = 1;\n            output[rank] = best;\n        }\n    }'
    if (challenge.tags.includes('topk')) return '    if (gid == 0) {\n        int used[64];\n        for (int i = 0; i < 64; ++i) used[i] = 0;\n        int limit = n < 3 ? n : 3;\n        for (int rank = 0; rank < limit; ++rank) {\n            float best = -3.402823e38f;\n            int best_i = 0;\n            for (int i = 0; i < n; ++i) {\n                if (!used[i] && values[i] > best) { best = values[i]; best_i = i; }\n            }\n            used[best_i] = 1;\n            output[rank] = best;\n        }\n    }'
    if (challenge.tags.includes('max-subarray')) return '    if (gid == 0) {\n        float best = values[0];\n        float cur = values[0];\n        for (int i = 1; i < n; ++i) {\n            cur = fmax(values[i], cur + values[i]);\n            best = fmax(best, cur);\n        }\n        output[0] = best;\n    }'
    if (challenge.tags.includes('grayscale')) return '    if (gid == 0) output[0] = round(0.299f * 120.0f + 0.587f * (values[0] + 80.0f) + 0.114f * 40.0f);'
    if (challenge.tags.includes('interleave')) return '    if (gid == 0) output[0] = values[0];\n    else if (gid == 1) output[1] = 10.0f;\n    else if (gid == 2) output[2] = values[1];\n    else if (gid == 3) output[3] = 20.0f;\n    else if (gid == 4) output[4] = values[2];\n    else if (gid == 5) output[5] = 30.0f;'
    return '    // Generic deterministic checksum example for larger AI-kernel tasks.\n    if (gid == 0) {\n        int checksum = 0;\n        for (int i = 0; i < n; ++i) checksum += ((int)(values[i] * 1000.0f)) * (i + 1);\n        output[0] = (float)checksum;\n    }'
  })()

  return `// Device kernel: vector/scalar AI operator.
// Supported local signature:
//   kernel_name(__global const float* values, __global float* output, int n)
// For scalar/object-style tasks, write the scalar or checksum into output[0].
__kernel void ${challenge.function_name}(__global const float* values,
                                         __global float* output,
                                         const int n) {
    const int gid = get_global_id(0);
    ${challenge.tags.includes('interleave') ? 'if (gid >= 6) return;' : 'if (gid >= n) return;'}
${body}
}
`
}

function openClStarter(challenge: Challenge) {
  const kernelSource = openClKernelSource(challenge)
  const mode = kernelMode(challenge)
  const outputKind = openClOutputKind(challenge, mode)
  const outputN = exampleOutputN(challenge)
  const globalN = exampleVectorGlobalSize(challenge)
  const fixedSoftmax = challenge.tags.includes('softmax')
  const hostBody = mode === 'gemm'
    ? `  const int M = 2, N = 2, K = 2;
  float A[4] = { 1.0f, 2.0f, 3.0f, 4.0f };
  float B[4] = { 1.0f, 2.0f, 3.0f, 4.0f };
  float C[4] = {0};

  cl_mem a_buf = clCreateBuffer(context, CL_MEM_READ_ONLY | CL_MEM_COPY_HOST_PTR, sizeof(A), A, &err);
  if (err != CL_SUCCESS) fail("clCreateBuffer(A)", err);
  cl_mem b_buf = clCreateBuffer(context, CL_MEM_READ_ONLY | CL_MEM_COPY_HOST_PTR, sizeof(B), B, &err);
  if (err != CL_SUCCESS) fail("clCreateBuffer(B)", err);
  cl_mem c_buf = clCreateBuffer(context, CL_MEM_WRITE_ONLY, sizeof(C), NULL, &err);
  if (err != CL_SUCCESS) fail("clCreateBuffer(C)", err);
  clSetKernelArg(kernel, 0, sizeof(cl_mem), &a_buf);
  clSetKernelArg(kernel, 1, sizeof(cl_mem), &b_buf);
  clSetKernelArg(kernel, 2, sizeof(cl_mem), &c_buf);
  clSetKernelArg(kernel, 3, sizeof(int), &M);
  clSetKernelArg(kernel, 4, sizeof(int), &N);
  clSetKernelArg(kernel, 5, sizeof(int), &K);
  size_t global[2] = { (size_t)N, (size_t)M };
  err = clEnqueueNDRangeKernel(queue, kernel, 2, NULL, global, NULL, 0, NULL, NULL);
  if (err != CL_SUCCESS) fail("clEnqueueNDRangeKernel", err);
  clFinish(queue);
  clEnqueueReadBuffer(queue, c_buf, CL_TRUE, 0, sizeof(C), C, 0, NULL, NULL);
  printf("output = [[");
  print_number(C[0]); printf(","); print_number(C[1]); printf("],[");
  print_number(C[2]); printf(","); print_number(C[3]); printf("]]\\n");
  clReleaseMemObject(c_buf);
  clReleaseMemObject(b_buf);
  clReleaseMemObject(a_buf);`
    : mode === 'matrix_add'
      ? `  const int rows = 2, cols = 2;
  float A[4] = { 1.0f, 2.0f, 3.0f, 4.0f };
  float B[4] = { 1.0f, 2.0f, 3.0f, 4.0f };
  float C[4] = {0};

  cl_mem a_buf = clCreateBuffer(context, CL_MEM_READ_ONLY | CL_MEM_COPY_HOST_PTR, sizeof(A), A, &err);
  if (err != CL_SUCCESS) fail("clCreateBuffer(A)", err);
  cl_mem b_buf = clCreateBuffer(context, CL_MEM_READ_ONLY | CL_MEM_COPY_HOST_PTR, sizeof(B), B, &err);
  if (err != CL_SUCCESS) fail("clCreateBuffer(B)", err);
  cl_mem c_buf = clCreateBuffer(context, CL_MEM_WRITE_ONLY, sizeof(C), NULL, &err);
  if (err != CL_SUCCESS) fail("clCreateBuffer(C)", err);
  clSetKernelArg(kernel, 0, sizeof(cl_mem), &a_buf);
  clSetKernelArg(kernel, 1, sizeof(cl_mem), &b_buf);
  clSetKernelArg(kernel, 2, sizeof(cl_mem), &c_buf);
  clSetKernelArg(kernel, 3, sizeof(int), &rows);
  clSetKernelArg(kernel, 4, sizeof(int), &cols);
  size_t global[2] = { (size_t)cols, (size_t)rows };
  err = clEnqueueNDRangeKernel(queue, kernel, 2, NULL, global, NULL, 0, NULL, NULL);
  if (err != CL_SUCCESS) fail("clEnqueueNDRangeKernel", err);
  clFinish(queue);
  clEnqueueReadBuffer(queue, c_buf, CL_TRUE, 0, sizeof(C), C, 0, NULL, NULL);
  printf("output = [[");
  print_number(C[0]); printf(","); print_number(C[1]); printf("],[");
  print_number(C[2]); printf(","); print_number(C[3]); printf("]]\\n");
  clReleaseMemObject(c_buf);
  clReleaseMemObject(b_buf);
  clReleaseMemObject(a_buf);`
      : mode === 'transpose' || mode === 'copy'
        ? `  const int rows = 2, cols = 2;
  float input[4] = { 1.0f, 2.0f, 3.0f, 4.0f };
  float output[4] = {0};

  cl_mem input_buf = clCreateBuffer(context, CL_MEM_READ_ONLY | CL_MEM_COPY_HOST_PTR, sizeof(input), input, &err);
  if (err != CL_SUCCESS) fail("clCreateBuffer(input)", err);
  cl_mem output_buf = clCreateBuffer(context, CL_MEM_WRITE_ONLY, sizeof(output), NULL, &err);
  if (err != CL_SUCCESS) fail("clCreateBuffer(output)", err);
  clSetKernelArg(kernel, 0, sizeof(cl_mem), &input_buf);
  clSetKernelArg(kernel, 1, sizeof(cl_mem), &output_buf);
  clSetKernelArg(kernel, 2, sizeof(int), &rows);
  clSetKernelArg(kernel, 3, sizeof(int), &cols);
  size_t global[2] = { (size_t)${mode === 'transpose' ? 'rows' : 'cols'}, (size_t)${mode === 'transpose' ? 'cols' : 'rows'} };
  err = clEnqueueNDRangeKernel(queue, kernel, 2, NULL, global, NULL, 0, NULL, NULL);
  if (err != CL_SUCCESS) fail("clEnqueueNDRangeKernel", err);
  clFinish(queue);
  clEnqueueReadBuffer(queue, output_buf, CL_TRUE, 0, sizeof(output), output, 0, NULL, NULL);
  printf("output = [[");
  print_number(output[0]); printf(","); print_number(output[1]); printf("],[");
  print_number(output[2]); printf(","); print_number(output[3]); printf("]]\\n");
  clReleaseMemObject(output_buf);
  clReleaseMemObject(input_buf);`
        : `  const int n = ${challenge.tags.includes('softmax') ? 4 : 5};
  const int output_n = ${outputN};
  float values[5] = { 1.0f, 2.0f, -1.0f, 2.0f, 0.0f };
  float output[${outputN}] = {0};

  cl_mem values_buf = clCreateBuffer(context, CL_MEM_READ_ONLY | CL_MEM_COPY_HOST_PTR, sizeof(values), values, &err);
  if (err != CL_SUCCESS) fail("clCreateBuffer(values)", err);
  cl_mem output_buf = clCreateBuffer(context, CL_MEM_WRITE_ONLY, sizeof(output), NULL, &err);
  if (err != CL_SUCCESS) fail("clCreateBuffer(output)", err);
  clSetKernelArg(kernel, 0, sizeof(cl_mem), &values_buf);
  clSetKernelArg(kernel, 1, sizeof(cl_mem), &output_buf);
  clSetKernelArg(kernel, 2, sizeof(int), &n);
  size_t global = ${globalN};
  err = clEnqueueNDRangeKernel(queue, kernel, 1, NULL, &global, NULL, 0, NULL, NULL);
  if (err != CL_SUCCESS) fail("clEnqueueNDRangeKernel", err);
  clFinish(queue);
  clEnqueueReadBuffer(queue, output_buf, CL_TRUE, 0, sizeof(output), output, 0, NULL, NULL);
  ${outputKind === 'scalar' || outputKind === 'checksum_object'
    ? 'printf("output = "); print_number(output[0]); printf("\\n");'
    : 'printf("output = ["); for (int i = 0; i < output_n; ++i) { if (i) printf(","); print_number(output[i]); } printf("]\\n");'}
  clReleaseMemObject(output_buf);
  clReleaseMemObject(values_buf);`

  return `// Complete OpenCL C example for this kernel only.
// Build locally:
//   clang main.c -framework OpenCL -o runner
// Run:
//   ./runner
// The host below validates only the hard-coded example input.
#include <OpenCL/opencl.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>

static const char* KERNEL_NAME = "${challenge.function_name}";

#define OPENCL_KERNEL_SOURCE(...) #__VA_ARGS__

// Edit the device kernel inside this block. It is stringified for
// clCreateProgramWithSource, but remains readable as normal OpenCL C.
static const char* KERNEL_SOURCE = OPENCL_KERNEL_SOURCE(
${kernelSource.trim()}
);

static void fail(const char* label, cl_int err) {
  fprintf(stderr, "%s failed: %d\\n", label, err);
  exit(2);
}

static void print_number(float value) {
  if (${fixedSoftmax ? '1' : '0'}) printf("%.6f", value);
  else if (fabsf(value - roundf(value)) < 0.00001f) printf("%.0f", value);
  else printf("%.6g", value);
}

int main(void) {
  cl_int err = CL_SUCCESS;
  cl_platform_id platform = NULL;
  cl_device_id device = NULL;
  cl_context context = NULL;
  cl_command_queue queue = NULL;
  cl_program program = NULL;
  cl_kernel kernel = NULL;

  err = clGetPlatformIDs(1, &platform, NULL);
  if (err != CL_SUCCESS) fail("clGetPlatformIDs", err);
  err = clGetDeviceIDs(platform, CL_DEVICE_TYPE_GPU, 1, &device, NULL);
  if (err != CL_SUCCESS) err = clGetDeviceIDs(platform, CL_DEVICE_TYPE_DEFAULT, 1, &device, NULL);
  if (err != CL_SUCCESS) fail("clGetDeviceIDs", err);

  context = clCreateContext(NULL, 1, &device, NULL, NULL, &err);
  if (err != CL_SUCCESS) fail("clCreateContext", err);
  queue = clCreateCommandQueue(context, device, 0, &err);
  if (err != CL_SUCCESS) fail("clCreateCommandQueue", err);
  program = clCreateProgramWithSource(context, 1, &KERNEL_SOURCE, NULL, &err);
  if (err != CL_SUCCESS) fail("clCreateProgramWithSource", err);
  err = clBuildProgram(program, 1, &device, "", NULL, NULL);
  if (err != CL_SUCCESS) {
    size_t log_size = 0;
    clGetProgramBuildInfo(program, device, CL_PROGRAM_BUILD_LOG, 0, NULL, &log_size);
    char* log = (char*)calloc(log_size + 1, 1);
    clGetProgramBuildInfo(program, device, CL_PROGRAM_BUILD_LOG, log_size, log, NULL);
    fprintf(stderr, "%s", log);
    free(log);
    return 1;
  }
  kernel = clCreateKernel(program, KERNEL_NAME, &err);
  if (err != CL_SUCCESS) fail("clCreateKernel", err);

${hostBody}

  clReleaseKernel(kernel);
  clReleaseProgram(program);
  clReleaseCommandQueue(queue);
  clReleaseContext(context);
  return 0;
}
`
}

function cudaStarter(challenge: Challenge) {
  const mode = kernelMode(challenge)
  const outputKind = openClOutputKind(challenge, mode)
  const outputN = exampleOutputN(challenge)
  const globalN = exampleVectorGlobalSize(challenge)
  const body = (() => {
    if (challenge.tags.includes('vector-add')) return '    output[gid] = values[gid] + (float)gid;'
    if (challenge.tags.includes('invert')) return '    float x = values[gid] + 128.0f;\n    x = fminf(255.0f, fmaxf(0.0f, x));\n    output[gid] = 255.0f - x;'
    if (challenge.tags.includes('conv1d')) return '    if (gid + 1 < n) output[gid] = values[gid] - values[gid + 1];'
    if (challenge.tags.includes('reverse')) return '    output[gid] = values[n - 1 - gid];'
    if (challenge.tags.includes('relu')) return '    float x = values[gid];\n    output[gid] = x > 0.0f ? x : 0.0f;'
    if (challenge.tags.includes('leaky-relu')) return '    float x = values[gid];\n    output[gid] = x >= 0.0f ? x : x * 0.1f;'
    if (challenge.tags.includes('silu')) return '    if (gid == 0) {\n        float acc = 0.0f;\n        for (int i = 0; i < n; ++i) acc += values[i] / (1.0f + expf(-values[i]));\n        output[0] = roundf(acc * 10000.0f) / 10000.0f;\n    }'
    if (challenge.tags.includes('sigmoid')) return '    float y = 1.0f / (1.0f + expf(-values[gid]));\n    output[gid] = roundf(y * 10000.0f) / 10000.0f;'
    if (challenge.tags.includes('clip')) return '    output[gid] = fminf(4.0f, fmaxf(-2.0f, values[gid]));'
    if (challenge.tags.includes('sum')) return '    if (gid == 0) {\n        float acc = 0.0f;\n        for (int i = 0; i < n; ++i) acc += values[i];\n        output[0] = acc;\n    }'
    if (challenge.tags.includes('dot')) return '    if (gid == 0) {\n        float acc = 0.0f;\n        for (int i = 0; i < n; ++i) acc += values[i] * (float)(i + 1);\n        output[0] = acc;\n    }'
    if (challenge.tags.includes('softmax')) return '    float max_value = values[0];\n    for (int i = 1; i < n; ++i) max_value = fmaxf(max_value, values[i]);\n    float denom = 0.0f;\n    for (int i = 0; i < n; ++i) denom += expf(values[i] - max_value);\n    output[gid] = expf(values[gid] - max_value) / denom;'
    if (challenge.tags.includes('prefix-sum')) return '    float acc = 0.0f;\n    for (int i = 0; i <= gid && i < n; ++i) acc += values[i];\n    output[gid] = acc;'
    if (challenge.tags.includes('sort')) return '    if (gid == 0) {\n        int used[64];\n        for (int i = 0; i < 64; ++i) used[i] = 0;\n        for (int rank = 0; rank < n; ++rank) {\n            float best = 3.402823e38f;\n            int best_i = 0;\n            for (int i = 0; i < n; ++i) if (!used[i] && values[i] < best) { best = values[i]; best_i = i; }\n            used[best_i] = 1;\n            output[rank] = best;\n        }\n    }'
    if (challenge.tags.includes('topk')) return '    if (gid == 0) {\n        int used[64];\n        for (int i = 0; i < 64; ++i) used[i] = 0;\n        int limit = n < 3 ? n : 3;\n        for (int rank = 0; rank < limit; ++rank) {\n            float best = -3.402823e38f;\n            int best_i = 0;\n            for (int i = 0; i < n; ++i) if (!used[i] && values[i] > best) { best = values[i]; best_i = i; }\n            used[best_i] = 1;\n            output[rank] = best;\n        }\n    }'
    if (challenge.tags.includes('max-subarray')) return '    if (gid == 0) {\n        float best = values[0];\n        float cur = values[0];\n        for (int i = 1; i < n; ++i) {\n            cur = fmaxf(values[i], cur + values[i]);\n            best = fmaxf(best, cur);\n        }\n        output[0] = best;\n    }'
    if (challenge.tags.includes('grayscale')) return '    if (gid == 0) output[0] = roundf(0.299f * 120.0f + 0.587f * (values[0] + 80.0f) + 0.114f * 40.0f);'
    if (challenge.tags.includes('interleave')) return '    if (gid == 0) output[0] = values[0];\n    else if (gid == 1) output[1] = 10.0f;\n    else if (gid == 2) output[2] = values[1];\n    else if (gid == 3) output[3] = 20.0f;\n    else if (gid == 4) output[4] = values[2];\n    else if (gid == 5) output[5] = 30.0f;'
    return '    if (gid == 0) {\n        int checksum = 0;\n        for (int i = 0; i < n; ++i) checksum += ((int)(values[i] * 1000.0f)) * (i + 1);\n        output[0] = (float)checksum;\n    }'
  })()
  const hostBody = mode === 'gemm'
    ? `    const int M = 2, N = 2, K = 2;
    float A[4] = {1.0f, 2.0f, 3.0f, 4.0f};
    float B[4] = {1.0f, 2.0f, 3.0f, 4.0f};
    float C[4] = {0};
    float *dA = nullptr, *dB = nullptr, *dC = nullptr;
    CHECK_CUDA(cudaMalloc(&dA, sizeof(A)));
    CHECK_CUDA(cudaMalloc(&dB, sizeof(B)));
    CHECK_CUDA(cudaMalloc(&dC, sizeof(C)));
    CHECK_CUDA(cudaMemcpy(dA, A, sizeof(A), cudaMemcpyHostToDevice));
    CHECK_CUDA(cudaMemcpy(dB, B, sizeof(B), cudaMemcpyHostToDevice));
    dim3 block(16, 16), grid(1, 1);
    ${challenge.function_name}_gemm<<<grid, block>>>(dA, dB, dC, M, N, K);
    CHECK_CUDA(cudaGetLastError());
    CHECK_CUDA(cudaDeviceSynchronize());
    CHECK_CUDA(cudaMemcpy(C, dC, sizeof(C), cudaMemcpyDeviceToHost));
    std::printf("output = [["); printNumber(C[0]); std::printf(","); printNumber(C[1]); std::printf("],["); printNumber(C[2]); std::printf(","); printNumber(C[3]); std::printf("]]\\n");
    cudaFree(dC); cudaFree(dB); cudaFree(dA);`
    : mode === 'matrix_add'
      ? `    const int rows = 2, cols = 2;
    float A[4] = {1.0f, 2.0f, 3.0f, 4.0f};
    float B[4] = {1.0f, 2.0f, 3.0f, 4.0f};
    float C[4] = {0};
    float *dA = nullptr, *dB = nullptr, *dC = nullptr;
    CHECK_CUDA(cudaMalloc(&dA, sizeof(A)));
    CHECK_CUDA(cudaMalloc(&dB, sizeof(B)));
    CHECK_CUDA(cudaMalloc(&dC, sizeof(C)));
    CHECK_CUDA(cudaMemcpy(dA, A, sizeof(A), cudaMemcpyHostToDevice));
    CHECK_CUDA(cudaMemcpy(dB, B, sizeof(B), cudaMemcpyHostToDevice));
    dim3 block(16, 16), grid(1, 1);
    ${challenge.function_name}_matrix<<<grid, block>>>(dA, dB, dC, rows, cols);
    CHECK_CUDA(cudaGetLastError());
    CHECK_CUDA(cudaDeviceSynchronize());
    CHECK_CUDA(cudaMemcpy(C, dC, sizeof(C), cudaMemcpyDeviceToHost));
    std::printf("output = [["); printNumber(C[0]); std::printf(","); printNumber(C[1]); std::printf("],["); printNumber(C[2]); std::printf(","); printNumber(C[3]); std::printf("]]\\n");
    cudaFree(dC); cudaFree(dB); cudaFree(dA);`
      : mode === 'transpose' || mode === 'copy'
        ? `    const int rows = 2, cols = 2;
    float input[4] = {1.0f, 2.0f, 3.0f, 4.0f};
    float output[4] = {0};
    float *dInput = nullptr, *dOutput = nullptr;
    CHECK_CUDA(cudaMalloc(&dInput, sizeof(input)));
    CHECK_CUDA(cudaMalloc(&dOutput, sizeof(output)));
    CHECK_CUDA(cudaMemcpy(dInput, input, sizeof(input), cudaMemcpyHostToDevice));
    dim3 block(16, 16), grid(1, 1);
    ${challenge.function_name}_matrix<<<grid, block>>>(dInput, nullptr, dOutput, rows, cols);
    CHECK_CUDA(cudaGetLastError());
    CHECK_CUDA(cudaDeviceSynchronize());
    CHECK_CUDA(cudaMemcpy(output, dOutput, sizeof(output), cudaMemcpyDeviceToHost));
    std::printf("output = [["); printNumber(output[0]); std::printf(","); printNumber(output[1]); std::printf("],["); printNumber(output[2]); std::printf(","); printNumber(output[3]); std::printf("]]\\n");
    cudaFree(dOutput); cudaFree(dInput);`
        : `    const int n = ${challenge.tags.includes('softmax') ? 4 : 5};
    const int outputN = ${outputN};
    float values[5] = {1.0f, 2.0f, -1.0f, 2.0f, 0.0f};
    float output[${outputN}] = {0};
    float *dValues = nullptr, *dOutput = nullptr;
    CHECK_CUDA(cudaMalloc(&dValues, sizeof(values)));
    CHECK_CUDA(cudaMalloc(&dOutput, sizeof(output)));
    CHECK_CUDA(cudaMemcpy(dValues, values, sizeof(values), cudaMemcpyHostToDevice));
    int threads = 128;
    int blocks = (${globalN} + threads - 1) / threads;
    ${challenge.function_name}_vector<<<blocks, threads>>>(dValues, dOutput, n);
    CHECK_CUDA(cudaGetLastError());
    CHECK_CUDA(cudaDeviceSynchronize());
    CHECK_CUDA(cudaMemcpy(output, dOutput, sizeof(output), cudaMemcpyDeviceToHost));
    ${outputKind === 'scalar' || outputKind === 'checksum_object'
      ? 'std::printf("output = "); printNumber(output[0]); std::printf("\\n");'
      : 'std::printf("output = ["); for (int i = 0; i < outputN; ++i) { if (i) std::printf(","); printNumber(output[i]); } std::printf("]\\n");'}
    cudaFree(dOutput); cudaFree(dValues);`

  return `// Complete CUDA C++ example for this kernel only.
// Build locally on a CUDA machine:
//   nvcc main.cu -O2 -o runner
// Run:
//   ./runner
#include <cuda_runtime.h>
#include <cmath>
#include <cstdio>
#include <iostream>

#define CHECK_CUDA(call) do { \\
    cudaError_t err__ = (call); \\
    if (err__ != cudaSuccess) { \\
        std::cerr << #call << " failed: " << cudaGetErrorString(err__) << "\\n"; \\
        return 2; \\
    } \\
} while (0)

__global__ void ${challenge.function_name}_vector(const float* values, float* output, int n) {
    int gid = blockIdx.x * blockDim.x + threadIdx.x;
    ${challenge.tags.includes('interleave') ? 'if (gid >= 6) return;' : 'if (gid >= n) return;'}
${body}
}

__global__ void ${challenge.function_name}_gemm(const float* A, const float* B, float* C, int M, int N, int K) {
    int col = blockIdx.x * blockDim.x + threadIdx.x;
    int row = blockIdx.y * blockDim.y + threadIdx.y;
    if (row >= M || col >= N) return;
    float acc = 0.0f;
    for (int kk = 0; kk < K; ++kk) acc += A[row * K + kk] * B[kk * N + col];
    C[row * N + col] = acc;
}

__global__ void ${challenge.function_name}_matrix(const float* A, const float* B, float* C, int rows, int cols) {
    int col = blockIdx.x * blockDim.x + threadIdx.x;
    int row = blockIdx.y * blockDim.y + threadIdx.y;
    if (row >= rows || col >= cols) return;
    ${mode === 'matrix_add'
      ? 'C[row * cols + col] = A[row * cols + col] + B[row * cols + col];'
      : mode === 'transpose'
        ? 'C[col * rows + row] = A[row * cols + col];'
        : 'C[row * cols + col] = A[row * cols + col];'}
}

static void printNumber(float value) {
    if (std::fabs(value - std::round(value)) < 0.00001f) std::printf("%.0f", value);
    else std::printf("%.6g", value);
}

int main() {
${hostBody}
    return 0;
}
`
}

function tritonStarter(challenge: Challenge) {
  const mode = kernelMode(challenge)
  const outputKind = openClOutputKind(challenge, mode)
  const outputN = exampleOutputN(challenge)
  const blockN = exampleVectorGlobalSize(challenge)
  const vectorBody = (() => {
    if (challenge.tags.includes('vector-add')) return '    y = x + offs.to(tl.float32)\n    tl.store(output + offs, y, mask=offs < output_n)'
    if (challenge.tags.includes('relu')) return '    y = tl.maximum(x, 0.0)\n    tl.store(output + offs, y, mask=offs < output_n)'
    if (challenge.tags.includes('softmax')) return '    m = tl.max(x, axis=0)\n    e = tl.exp(x - m)\n    y = e / tl.sum(e, axis=0)\n    tl.store(output + offs, y, mask=offs < output_n)'
    if (challenge.tags.includes('sum')) return '    tl.store(output, tl.sum(x, axis=0))'
    if (challenge.tags.includes('dot')) return '    tl.store(output, tl.sum(x * (offs + 1).to(tl.float32), axis=0))'
    if (challenge.tags.includes('clip')) return '    y = tl.minimum(4.0, tl.maximum(-2.0, x))\n    tl.store(output + offs, y, mask=offs < output_n)'
    if (challenge.tags.includes('reverse')) return '    rx = tl.load(values + (n - 1 - offs), mask=offs < n, other=0.0)\n    tl.store(output + offs, rx, mask=offs < output_n)'
    return '    checksum = tl.sum((x * 1000.0).to(tl.int32) * (offs + 1), axis=0)\n    tl.store(output, checksum.to(tl.float32))'
  })()

  if (mode === 'gemm') {
    return `# Complete Triton example for this kernel only.
# Run on a CUDA/Triton machine:
#   python main.py
import torch
import triton
import triton.language as tl

@triton.jit
def ${challenge.function_name}(a, b, c, BLOCK: tl.constexpr):
    offs = tl.arange(0, BLOCK)
    mask = offs < 4
    av = tl.load(a + offs, mask=mask, other=0.0)
    bv = tl.load(b + offs, mask=mask, other=0.0)
    tl.store(c + 0, av[0] * bv[0] + av[1] * bv[2])
    tl.store(c + 1, av[0] * bv[1] + av[1] * bv[3])
    tl.store(c + 2, av[2] * bv[0] + av[3] * bv[2])
    tl.store(c + 3, av[2] * bv[1] + av[3] * bv[3])

def print_number(value):
    value = float(value)
    if abs(value - round(value)) < 1e-5:
        return str(int(round(value)))
    return f"{value:.6g}"


def main():
    device = "cuda"
    a = torch.tensor([1.0, 2.0, 3.0, 4.0], device=device, dtype=torch.float32)
    b = torch.tensor([1.0, 2.0, 3.0, 4.0], device=device, dtype=torch.float32)
    out = torch.empty((4,), device=device, dtype=torch.float32)
    ${challenge.function_name}[(1,)](a, b, out, BLOCK=4)
    torch.cuda.synchronize()
    h = out.cpu().tolist()
    print(f"output = [[{print_number(h[0])},{print_number(h[1])}],[{print_number(h[2])},{print_number(h[3])}]]")


if __name__ == "__main__":
    main()
`
  }

  if (mode !== 'vector') {
    const modeCode = mode === 'matrix_add' ? 1 : mode === 'transpose' ? 2 : 3
    return `# Complete Triton example for this kernel only.
# Run on a CUDA/Triton machine:
#   python main.py
import torch
import triton
import triton.language as tl

@triton.jit
def ${challenge.function_name}(a, b, c, mode: tl.constexpr, BLOCK: tl.constexpr):
    offs = tl.arange(0, BLOCK)
    mask = offs < 4
    av = tl.load(a + offs, mask=mask, other=0.0)
    bv = tl.load(b + offs, mask=mask, other=0.0)
    if mode == 1:
        tl.store(c + offs, av + bv, mask=mask)
    elif mode == 2:
        tl.store(c + 0, av[0])
        tl.store(c + 1, av[2])
        tl.store(c + 2, av[1])
        tl.store(c + 3, av[3])
    else:
        tl.store(c + offs, av, mask=mask)

def print_number(value):
    value = float(value)
    if abs(value - round(value)) < 1e-5:
        return str(int(round(value)))
    return f"{value:.6g}"

def main():
    device = "cuda"
    a = torch.tensor([1.0, 2.0, 3.0, 4.0], device=device, dtype=torch.float32)
    b = torch.tensor([1.0, 2.0, 3.0, 4.0], device=device, dtype=torch.float32)
    out = torch.empty((4,), device=device, dtype=torch.float32)
    ${challenge.function_name}[(1,)](a, b, out, ${modeCode}, BLOCK=4)
    torch.cuda.synchronize()
    h = out.cpu().tolist()
    print(f"output = [[{print_number(h[0])},{print_number(h[1])}],[{print_number(h[2])},{print_number(h[3])}]]")

if __name__ == "__main__":
    main()
`
  }

  return `# Complete Triton example for this kernel only.
# Run on a CUDA/Triton machine:
#   python main.py
import torch
import triton
import triton.language as tl

@triton.jit
def ${challenge.function_name}(values, output, n: tl.constexpr, output_n: tl.constexpr, BLOCK: tl.constexpr):
    offs = tl.arange(0, BLOCK)
    mask = offs < n
    x = tl.load(values + offs, mask=mask, other=0.0)
${vectorBody}

def print_number(value):
    value = float(value)
    if abs(value - round(value)) < 1e-5:
        return str(int(round(value)))
    return f"{value:.6g}"

def main():
    device = "cuda"
    values = torch.tensor([1.0, 2.0, -1.0, 2.0, 0.0], device=device, dtype=torch.float32)
    out = torch.empty((${outputN},), device=device, dtype=torch.float32)
    ${challenge.function_name}[(1,)](values, out, 5, ${outputN}, BLOCK=${blockN})
    torch.cuda.synchronize()
    h = out.cpu().tolist()
    ${outputKind === 'scalar' || outputKind === 'checksum_object'
      ? 'print("output = " + print_number(h[0]))'
      : 'print("output = [" + ",".join(print_number(v) for v in h) + "]")'}

if __name__ == "__main__":
    main()
`
}

function starterFor(challenge: Challenge, language: Language) {
  if (language === 'opencl') return openClStarter(challenge)
  if (language === 'cuda') return cudaStarter(challenge)
  if (language === 'triton') return tritonStarter(challenge)
  if (language === 'python') return challenge.starter_code
  if (language === 'cpp') {
    return `#include <bits/stdc++.h>
using namespace std;

// Agent/Runner passes the raw JSON test payload to this function.
// Return a JSON string, e.g. "[1,2,3]" or "{\\"answer\\":42}".
string ${challenge.function_name}(const string& payload_json) {
    // TODO: parse payload_json and compute the answer.
    return "null";
}
`
  }
  return `#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// Agent/Runner passes the raw JSON test payload to this function.
// Return a JSON string. Static storage is OK for small Arena examples.
const char* ${challenge.function_name}(const char* payload_json) {
    // TODO: parse payload_json and compute the answer.
    return "null";
}
`
}

function defaultLanguageFor(challenge: Challenge): Language {
  return challenge.category === 'ai-kernel' ? 'opencl' : 'python'
}

function sourceFilename(language: Language) {
  if (language === 'opencl') return 'main.c'
  if (language === 'cuda') return 'main.cu'
  if (language === 'triton') return 'main.py'
  if (language === 'python') return 'main.py'
  if (language === 'cpp') return 'main.cpp'
  return 'main.c'
}

function localizedDescription(challenge: Challenge, locale: Locale) {
  if (challenge.category === 'ai-kernel') return challenge.description
  if (locale === 'en') {
    const known: Record<string, string> = {
      'two-sum': 'Given an integer array nums and a target, return the indices of two numbers that add up to target. Return order does not matter.',
      'valid-palindrome': 'Return true if the string is a palindrome after keeping only alphanumeric characters and ignoring case.',
      'maximum-subarray': 'Given an integer array nums, return the largest sum of a contiguous subarray. Prefer the O(n) Kadane-style solution.',
    }
    return known[challenge.slug] || challenge.description
  }
  return challenge.description
}

function stripSourceBlock(content: string) {
  return (content || '')
    .replace(/^┌─ 来源标识 ─+\n(?:│[^\n]*\n)?└─+\n?/, '')
    .replace(/^\[Worker Context[\s\S]*?---\n/, '')
    .replace(/^\[Arena Challenge Context[\s\S]*?\[\/Arena Challenge Context\]\n*/m, '')
    .trim()
}

async function responseError(response: Response, fallback: string) {
  const text = await response.text().catch(() => '')
  if (!text) return `${fallback}: ${response.status}`
  try {
    const data = JSON.parse(text)
    return `${fallback}: ${response.status} ${data.detail || data.message || text}`
  } catch {
    return `${fallback}: ${response.status} ${text}`
  }
}

function arenaSessionActor(session: ArenaSession | null | undefined) {
  return session?.userId || session?.user?.email || session?.user?.name || 'arena-human'
}

function isLocalArenaChallenge(challenge: Challenge) {
  return challenge.category === 'ai-kernel' || challenge.category === 'gaokao-volunteer' || challenge.category.startsWith('education-') || (challenge.challenge_type === 'qa' && challenge.category.endsWith('-interview'))
}

function isGaokaoVolunteerChallenge(challenge?: Challenge | null) {
  return challenge?.category === 'gaokao-volunteer'
}

function stageLabel(stage: string | undefined, locale: Locale) {
  const labels: Record<string, { zh: string; en: string }> = {
    diagnose: { zh: '诊断', en: 'Diagnose' },
    hint: { zh: '提示', en: 'Hint' },
    attempt: { zh: '尝试', en: 'Attempt' },
    debug: { zh: 'Debug', en: 'Debug' },
    explain: { zh: '讲解', en: 'Explain' },
    follow_up: { zh: '追问', en: 'Follow-up' },
    recommend: { zh: '推荐', en: 'Recommend' },
  }
  const row = labels[stage || 'diagnose'] || labels.diagnose
  return locale === 'zh' ? row.zh : row.en
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-hidden="true">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#3ce8e2] [animation-delay:-0.2s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#3ce8e2] [animation-delay:-0.1s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#3ce8e2]" />
    </span>
  )
}

function arenaChallengeContext(challenge: Challenge, locale: Locale, language: Language, code: string) {
  const gaokaoKnowledge = isGaokaoVolunteerChallenge(challenge)
    ? `\n[Gaokao Local Knowledge]\n${gaokaoKnowledgeContextMarkdown()}\n[/Gaokao Local Knowledge]\n`
    : ''
  return `[Arena Challenge Context]\n` +
    `id: ${challenge.id}\n` +
    `title: ${challenge.title}\n` +
    `category: ${challenge.category}\n` +
    `difficulty: ${challenge.difficulty}\n` +
    `locale: ${locale}\n` +
    `language: ${language}\n` +
    `problem_constraints_do_not_copy_to_whiteboard:\n${challenge.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 4000)}\n` +
    gaokaoKnowledge +
    (code ? `current_code:\n${code.slice(0, 4000)}\n` : '') +
    `[/Arena Challenge Context]`
}

const gaokaoVolunteerSkillZh = [
  'chat_mode: ask',
  '高考志愿专用模式：只使用 Ask 模式，不输出 WHITEBOARD_DIAGRAM，不使用白板。',
  '你是高考志愿顾问，不是模板生成器。回答要真实、谨慎、有人味：解释为什么适合这个学生，哪里可能踩坑，下一步怎么核验。',
  '先确认省份、年份、科类/选科、分数、全省位次、兴趣专业、城市偏好、家庭预算、是否考研、就业地域和是否接受中外合作/提前批/地方专项/定向等。',
  '缺少省份、科类或位次时，不给确定院校结论；只能给信息收集清单、估算方法和需要核验的数据入口。',
  '推荐必须按冲/稳/保分层，并说明近 3 年专业录取分数线、最低位次、招生计划、选科要求的来源年份和不确定性。',
  '每个重点推荐都要覆盖：985/211/双一流/普通标签、年度经费或预算、就业去向、升学去向、选调情况、目标专业强老师/团队、奖学金、城市机会、调剂/退档风险。',
  '数据来源优先级：省教育考试院、阳光高考、学校本科招生网、学校预算/决算公开、就业质量报告、院系师资页、省级定向选调公告、学校就业指导中心。',
  '不能核验的数据必须写“待核验”，不要编具体分数、经费、就业单位、老师姓名或奖学金额度。',
  '输出结构：用户画像 -> 数据置信度表 -> 冲稳保推荐表 -> 重点院校逐项分析 -> 志愿顺序/是否服从调剂 -> 大学四年课程/竞赛/科研/实习路线 -> 就业或读研建议 -> 待核验清单。',
].join('\n')

const gaokaoVolunteerSkillEn = [
  'chat_mode: ask',
  'Gaokao volunteer advisor mode: Ask mode only. Do not output WHITEBOARD_DIAGRAM and do not use the whiteboard.',
  'Be a careful advisor, not a template generator. Explain fit, risks, and verification steps in a human, candid way.',
  'First confirm province, year, subject track, score, provincial rank, interests, city constraints, family budget, graduate-school intent, employment preference, and special admission preferences.',
  'If province, subject track, or rank is missing, do not give definitive university recommendations.',
  'Use reach/match/safety tiers and cite or qualify recent admission ranks, major scores, plan counts, subject requirements, funding, employment outcomes, graduate-school destinations, selected-graduate eligibility, faculty/team strength, and scholarships.',
  'Preferred sources: provincial exam authority, Sunshine Gaokao, university admissions site, university budget/final-account disclosure, employment quality report, department faculty pages, provincial selected-graduate notices, and career center pages.',
  'If data is not verifiable, mark it as pending verification instead of inventing numbers, employers, professors, or scholarship amounts.',
].join('\n')

function modeInstruction(mode: ChatMode, locale: Locale, challenge?: Challenge | null) {
  if (isGaokaoVolunteerChallenge(challenge)) {
    return locale === 'zh' ? gaokaoVolunteerSkillZh : gaokaoVolunteerSkillEn
  }
  const whiteboardProtocol = locale === 'zh'
    ? '本轮先输出正常 Arena Chat 回答，然后在末尾必须附带一个 WHITEBOARD_DIAGRAM JSON 协议块；前端会隐藏协议块，只在 chat 中显示正文，并同步渲染右侧 Markdown/HTML 白板。WHITEBOARD_DIAGRAM 必须包含 format/title/summary/mermaid/html/steps 字段。steps[0].mermaid 必须有第一段局部诊断/流程图；steps 中 architecture_concepts 必须有局部架构图，decomposition 或 complete_answer 必须有局部流程图。html 必须基于你刚刚写出的回答生成，不要按 Markdown 四步标题组织；要绘制大尺寸 SVG 主图（viewBox 至少约 1200x560，宽度 100%，主图高度不少于 420px），必须有真实 CSS 动画（@keyframes、stroke-dasharray/stroke-dashoffset 或 transform/opacity），箭头/路径动画结束后要完整可见；必须包含图旁文字说明、公式逐项说明、一个简单示例、动画说明和结论检查清单。不要使用通用模板、占位文字、script、JavaScript、iframe、外链资源、网络图片或表单。'
    : 'First output the normal Arena Chat answer, then append one WHITEBOARD_DIAGRAM JSON protocol block at the end. The frontend hides the protocol block from chat and renders the Markdown/HTML board on the right. WHITEBOARD_DIAGRAM must include format/title/summary/mermaid/html/steps. steps[0].mermaid must include the first-section local diagnosis/flow diagram; architecture_concepts must include a local architecture diagram, and decomposition or complete_answer must include a local flow diagram. The html must be generated from the answer you just wrote and must not use the four Markdown step headings. Draw a large SVG main diagram with a viewBox of at least about 1200x560, width 100%, and main diagram height at least 420px. Include real CSS animation using @keyframes, stroke-dasharray/stroke-dashoffset, or transform/opacity; arrow/path animation must end fully visible. Include adjacent text explanations, formula-by-formula explanation, one simple example, animation explanation, and conclusion checklist. Do not use generic templates, placeholders, script, JavaScript, iframe, external resources, network images, or forms.'
  if (mode === 'interview_answer') {
    return locale === 'zh'
      ? `chat_mode: interview_answer\n请把用户输入当作候选人的面试回答来评审：先给 0-10 分，再指出亮点、缺口、误区，补充一版更强答案，并给一个下一轮追问。${whiteboardProtocol}`
      : `chat_mode: interview_answer\nTreat the user input as a candidate interview answer. Give a 0-10 score, then identify strengths, gaps, misconceptions, provide a stronger answer skeleton, and ask one next follow-up. ${whiteboardProtocol}`
  }
  if (mode === 'ask') {
    return locale === 'zh'
      ? `chat_mode: ask\n请直接回答用户问题，结构清晰、可操作，必要时给公式、示例、trade-off。${whiteboardProtocol}`
      : `chat_mode: ask\nAnswer the user question directly with a clear, actionable structure. Include formulas, examples, and trade-offs when needed. ${whiteboardProtocol}`
  }
  return locale === 'zh'
    ? `chat_mode: socratic\n请使用苏格拉底式交互：根据用户输入判断当前卡点，优先提出 1-2 个高质量问题和少量提示，推动用户自己推理；不要直接倾倒完整答案，除非用户明确要求。${whiteboardProtocol}`
    : `chat_mode: socratic\nUse Socratic coaching. Diagnose the user’s current blocker, ask 1-2 high-quality questions with light hints, and help the user reason instead of dumping the full answer unless explicitly asked. ${whiteboardProtocol}`
}

function arenaAgentPromptContext(challenge: Challenge, locale: Locale, language: Language, code: string, mode: ChatMode, intent?: ArenaTeachingIntent) {
  const sameTurnWhiteboard = isGaokaoVolunteerChallenge(challenge)
    ? ''
    : locale === 'zh'
      ? 'whiteboard_delivery: same_response\n首轮回答必须是“正文 + WHITEBOARD_DIAGRAM”同一次输出，不要等第二次白板请求才生成 html。WHITEBOARD_DIAGRAM.html 和 Markdown/Mermaid 必须基于同一轮正文同时返回。'
      : 'whiteboard_delivery: same_response\nThe first reply must be one same-turn output: normal answer plus WHITEBOARD_DIAGRAM. Do not wait for a second whiteboard request to generate html. Return WHITEBOARD_DIAGRAM.html and Markdown/Mermaid from the same answer.'
  return [
    arenaChallengeContext(challenge, locale, language, code),
    modeInstruction(mode, locale, challenge),
    intent ? `teaching_intent: ${intent}` : '',
    sameTurnWhiteboard,
  ].filter(Boolean).join('\n\n')
}

function intentForChatMode(mode: ChatMode): ArenaTeachingIntent {
  if (mode === 'interview_answer') return 'interview_answer'
  if (mode === 'ask') return 'ask'
  return 'socratic'
}

function modeForExplicitIntent(intent?: ArenaTeachingIntent): ChatMode {
  if (intent === 'ask_hint' || intent === 'follow_up' || intent === 'socratic') return 'socratic'
  if (intent === 'debug' || intent === 'interview_answer') return 'interview_answer'
  return 'ask'
}

function topicMessagesToChat(messages: TopicMessage[], agentId: string): ChatMessage[] {
  return (messages || [])
    .filter((message) => {
      const semantic = String(message.semantic_type || '').toLowerCase()
      const content = String(message.content || '')
      if (semantic === 'system') return false
      if (semantic === 'notification') return false
      if (content.includes('[system:p2p_init]')) return false
      if (content.includes('Agent thinking')) return false
      if (content.includes('[whiteboard_render_request:auto]')) return false
      return !!stripWhiteboardPayload(stripSourceBlock(content))
    })
    .map((message) => {
      const senderType = String(message.sender_type || '').toUpperCase()
      const senderId = String(message.sender_id || '')
      return {
        id: message.id || message.message_id,
        role: senderType === 'AGENT' || senderId === agentId ? 'agent' : 'user',
        content: stripWhiteboardPayload(stripSourceBlock(String(message.content || ''))),
        createdAt: message.timestamp || message.created_at || new Date().toISOString(),
      }
    })
}


export default function ArenaChallengePage({ params }: { params: { id: string } }) {
  const { data: session } = useSession()
  const [selectedAgentId, setSelectedAgentId] = useAgentId()
  const [payload, setPayload] = useState<ChallengePayload | null>(null)
  const [locale, setLocale] = useState<Locale>('zh')
  const [language, setLanguage] = useState<Language>('opencl')
  const [kernelEnvironment, setKernelEnvironment] = useState<KernelEnvironment>('macos-opencl')
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatMode, setChatMode] = useState<ChatMode>('socratic')
  const [chatSending, setChatSending] = useState(false)
  const [arenaTopicByKey, setArenaTopicByKey] = useState<Record<string, string>>({})
  const [arenaSessionState, setArenaSessionState] = useState<ArenaSessionState | null>(null)
  const [, setArenaProfile] = useState<ArenaUserProfile | null>(null)
  const [arenaSyncing, setArenaSyncing] = useState(false)
  const [activeTab, setActiveTab] = useState<'description' | 'submissions' | 'leaderboard'>('description')
  const [whiteboardDiagram, setWhiteboardDiagram] = useState<WhiteboardDiagram | null>(null)
  const [whiteboardExpanded, setWhiteboardExpanded] = useState(false)
  const [whiteboardBusy, setWhiteboardBusy] = useState(false)
  const [arenaTyping, setArenaTyping] = useState<ArenaTypingState | null>(null)
  const [leftPanelWidth, setLeftPanelWidth] = useState(360)
  const layoutRef = useRef<HTMLDivElement | null>(null)
  const chatEndRef = useRef<HTMLDivElement | null>(null)
  const appliedWhiteboardMessageIdsRef = useRef(new Set<string>())
  const appliedWhiteboardHtmlMessageIdsRef = useRef(new Set<string>())
  const autoWhiteboardSourceKeysRef = useRef(new Set<string>())

  function startPanelResize() {
    return (event: React.PointerEvent<HTMLDivElement>) => {
      if (isCoding) return
      event.preventDefault()
      const bounds = layoutRef.current?.getBoundingClientRect()
      if (!bounds) return
      const handleMove = (moveEvent: PointerEvent) => {
        const available = bounds.width - 760
        setLeftPanelWidth(clampNumber(moveEvent.clientX - bounds.left, 280, Math.max(300, available)))
      }
      const stop = () => {
        window.removeEventListener('pointermove', handleMove)
        window.removeEventListener('pointerup', stop)
      }
      window.addEventListener('pointermove', handleMove)
      window.addEventListener('pointerup', stop)
    }
  }

  useEffect(() => {
    let alive = true
    fetch(`/api/arena/challenges/${params.id}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data: ChallengePayload) => {
        if (!alive) return
        setPayload(data)
        const defaultLanguage = defaultLanguageFor(data.challenge)
        setLanguage(defaultLanguage)
        setCode(starterFor(data.challenge, defaultLanguage))
      })
      .catch(() => undefined)
    fetch(`/api/arena/challenges/${params.id}/leaderboard`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data: { leaderboard: LeaderboardEntry[] }) => alive && setLeaderboard(data.leaderboard || []))
      .catch(() => undefined)
    return () => { alive = false }
  }, [params.id])

  const challenge = payload?.challenge
  const arenaActor = arenaSessionActor(session as ArenaSession)
  const arenaSessionKey = challenge && session?.accessToken ? `${arenaActor}:${ARENA_AGENT_ID}:${challenge.id}` : ''
  const arenaTopicId = arenaSessionKey ? (arenaTopicByKey[arenaSessionKey] || '') : ''

  const authHeaders = useMemo(() => ({
    'Content-Type': 'application/json',
    ...(session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
  }), [session?.accessToken])

  useEffect(() => {
    if (!session?.accessToken || selectedAgentId) return
    let alive = true
    fetch(`${CLIENT_WTT_API_BASE}/agents/my`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!alive || !data) return
        const agents = Array.isArray(data)
          ? data
          : Array.isArray(data.agents)
          ? data.agents
          : Array.isArray(data.items)
          ? data.items
          : []
        const firstAgentId = agents
          .map((agent: Record<string, unknown>) => String(agent.agent_id || agent.id || ''))
          .find(Boolean)
        if (firstAgentId) setSelectedAgentId(firstAgentId)
      })
      .catch(() => undefined)
    return () => { alive = false }
  }, [selectedAgentId, session?.accessToken, setSelectedAgentId])

  function rememberArenaTopic(topicId: string) {
    if (!arenaSessionKey || !topicId) return
    setArenaTopicByKey((prev) => ({ ...prev, [arenaSessionKey]: topicId }))
  }

  const refreshArenaState = async () => {
    if (!challenge || !session?.accessToken) return
    const [sessionResponse, profileResponse] = await Promise.all([
      fetch(`${CLIENT_WTT_API_BASE}/arena/sessions/${encodeURIComponent(challenge.id)}`, { headers: authHeaders }),
      fetch(`${CLIENT_WTT_API_BASE}/arena/profile/me`, { headers: authHeaders }),
    ])
    if (sessionResponse.ok) {
      const data = await sessionResponse.json()
      if (data.session) {
        setArenaSessionState(data.session)
        if (data.session.topic_id) rememberArenaTopic(data.session.topic_id)
      }
    }
    if (profileResponse.ok) {
      const data = await profileResponse.json()
      if (data.profile) setArenaProfile(data.profile)
    }
  }

  async function fetchArenaMessageRows(topicId: string) {
    if (!topicId || !session?.accessToken) return [] as TopicMessage[]
    let response = await fetch(`${CLIENT_WTT_API_BASE}/arena/agent-chat/messages?topic_id=${encodeURIComponent(topicId)}&limit=100`, { headers: authHeaders })
    if (!response.ok) {
      response = await fetch(`${CLIENT_WTT_API_BASE}/topics/${encodeURIComponent(topicId)}/messages?limit=100&agent_id=${encodeURIComponent(ARENA_AGENT_ID)}`, { headers: authHeaders })
    }
    if (!response.ok) return [] as TopicMessage[]
    const raw = await response.json()
    return Array.isArray(raw) ? raw : raw.messages || []
  }

  function topicMessageKey(row: TopicMessage) {
    return row.id || row.message_id || `${row.timestamp || row.created_at || ''}:${String(row.content || '').length}`
  }

  function isArenaAgentTopicMessage(row: TopicMessage) {
    const senderType = String(row.sender_type || '').toUpperCase()
    const senderId = String(row.sender_id || '')
    return senderType === 'AGENT' || senderId === ARENA_AGENT_ID
  }

  function applyLatestWhiteboardFromRows(rows: TopicMessage[]) {
    for (const row of [...rows].reverse()) {
      const semantic = String(row.semantic_type || '').toLowerCase()
      const messageId = topicMessageKey(row)
      if (semantic === 'notification') continue
      if (!isArenaAgentTopicMessage(row) || appliedWhiteboardMessageIdsRef.current.has(messageId)) continue
      const content = stripSourceBlock(String(row.content || ''))
      if (content.includes('Agent thinking')) continue
      if (isGaokaoVolunteerChallenge(challenge)) {
        appliedWhiteboardMessageIdsRef.current.add(messageId)
        setWhiteboardDiagram(null)
        return false
      }
      const payload = extractWhiteboardPayload(content)
      if (payload?.diagram) {
        appliedWhiteboardMessageIdsRef.current.add(messageId)
        if (diagramHasHtml(payload.diagram)) appliedWhiteboardHtmlMessageIdsRef.current.add(messageId)
        setWhiteboardDiagram((previous) => mergeWhiteboardDiagram(previous, payload.diagram!))
        return true
      }
    }
    return false
  }

  function hasNewAppliedWhiteboard(baselineWhiteboardIds: Set<string>) {
    return Array.from(appliedWhiteboardMessageIdsRef.current).some((id) => !baselineWhiteboardIds.has(id))
  }

  function hasNewAppliedWhiteboardHtml(baselineWhiteboardHtmlIds: Set<string>) {
    return Array.from(appliedWhiteboardHtmlMessageIdsRef.current).some((id) => !baselineWhiteboardHtmlIds.has(id))
  }

  const refreshArenaMessages = async (topicId = arenaTopicId) => {
    if (!topicId || !session?.accessToken || !challenge) return [] as ChatMessage[]
    const rows = await fetchArenaMessageRows(topicId)
    const mapped = topicMessagesToChat(rows, ARENA_AGENT_ID)
    applyLatestWhiteboardFromRows(rows)
    setChatMessages(mapped)
    return mapped
  }

  function chatMessageKey(message: ChatMessage) {
    return message.id || `${message.role}:${message.createdAt}:${message.content.length}`
  }

  function hasNewAgentMessage(messages: ChatMessage[], baselineKeys: Set<string>) {
    return messages.some((message) => message.role === 'agent' && !baselineKeys.has(chatMessageKey(message)))
  }

  function latestNewAgentMessage(messages: ChatMessage[], baselineKeys: Set<string>) {
    return [...messages].reverse().find((message) => message.role === 'agent' && !baselineKeys.has(chatMessageKey(message)))
  }

  function sleep(ms: number) {
    return new Promise((resolve) => window.setTimeout(resolve, ms))
  }

  async function waitForArenaAgentMessage(topicId: string, baselineKeys: Set<string>, timeoutMs = 180000) {
    const startedAt = Date.now()
    let latest = await refreshArenaMessages(topicId)
    if (hasNewAgentMessage(latest, baselineKeys)) return true

    while (Date.now() - startedAt < timeoutMs) {
      await sleep(1500)
      latest = await refreshArenaMessages(topicId)
      if (hasNewAgentMessage(latest, baselineKeys)) return true
    }

    return false
  }

  async function waitForArenaWhiteboardPayload(topicId: string, baselineWhiteboardIds: Set<string>, timeoutMs = 240000, requireHtml = false) {
    const hasNewWhiteboardPayload = async () => {
      const rows = await fetchArenaMessageRows(topicId)
      const found = [...rows].reverse().some((row) => {
        const semantic = String(row.semantic_type || '').toLowerCase()
        const messageId = topicMessageKey(row)
        if (semantic === 'notification') return false
        if (!isArenaAgentTopicMessage(row) || baselineWhiteboardIds.has(messageId)) return false
        const content = stripSourceBlock(String(row.content || ''))
        if (content.includes('Agent thinking')) return false
        const diagram = extractWhiteboardPayload(content)?.diagram
        return Boolean(diagram && (!requireHtml || diagramHasHtml(diagram)))
      })
      if (found) await refreshArenaMessages(topicId)
      return found
    }

    const startedAt = Date.now()
    if (await hasNewWhiteboardPayload()) return true

    while (Date.now() - startedAt < timeoutMs) {
      await sleep(1500)
      if (await hasNewWhiteboardPayload()) return true
    }

    await refreshArenaMessages(topicId)
    return false
  }

  function handleArenaWsMessage(msg: WsMessage) {
    const rawEvent = msg as unknown as Record<string, unknown>

    if (rawEvent.type === 'typing') {
      const topicId = String(rawEvent.topic_id || '')
      if (!topicId || topicId !== arenaTopicId) return

      const state = String(rawEvent.state || 'start').toLowerCase()
      if (state === 'stop') {
        setArenaTyping((prev) => {
          if (!prev || prev.topicId !== topicId) return prev
          return {
            ...prev,
            expiresAt: Math.max(prev.expiresAt, Date.now() + 900),
          }
        })
        return
      }

      const ttlMsRaw = Number(rawEvent.ttl_ms)
      const ttlMs = Number.isFinite(ttlMsRaw) ? Math.max(1500, Math.min(30000, ttlMsRaw)) : 6000
      const now = Date.now()
      setArenaTyping({
        topicId,
        agentId: String(rawEvent.agent_id || ARENA_AGENT_ID),
        agentName: String(rawEvent.agent_display_name || '') || undefined,
        startedAt: now,
        expiresAt: now + ttlMs,
      })
      return
    }

    if (msg.type !== 'new_message' || !msg.message) return
    const incomingTopicId = msg.message.topic_id
    if (!incomingTopicId || incomingTopicId !== arenaTopicId) return

    const senderType = String(msg.message.sender_type || '').toUpperCase()
    const senderId = String(msg.message.sender_id || '')
    if (senderType === 'AGENT' || senderId === ARENA_AGENT_ID) {
      setArenaTyping((prev) => {
        if (!prev || prev.topicId !== incomingTopicId) return prev
        return {
          ...prev,
          expiresAt: Math.max(prev.expiresAt, Date.now() + 350),
        }
      })
    }

    void refreshArenaMessages(incomingTopicId)
    void refreshArenaState()
  }

  useWebSocket({
    url: selectedAgentId ? `${WS_BASE_URL}/ws/${selectedAgentId}` : '',
    enabled: !!selectedAgentId && !!session?.accessToken,
    token: session?.accessToken || undefined,
    onMessage: handleArenaWsMessage,
  })

  useEffect(() => {
    setArenaTyping((prev) => (prev && prev.topicId === arenaTopicId ? prev : null))
  }, [arenaTopicId])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now()
      setArenaTyping((prev) => (prev && prev.expiresAt <= now ? null : prev))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])


  useEffect(() => {
    setChatMessages([])
    setArenaSessionState(null)
    setArenaProfile(null)
    setWhiteboardDiagram(null)
    setWhiteboardExpanded(false)
    appliedWhiteboardMessageIdsRef.current.clear()
    autoWhiteboardSourceKeysRef.current.clear()
  }, [arenaSessionKey])

  useEffect(() => {
    if (!challenge || !session?.accessToken) return
    refreshArenaState().catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challenge?.id, session?.accessToken])

  useEffect(() => {
    if (!arenaTopicId) return
    let alive = true
    refreshArenaMessages(arenaTopicId)
    const timer = window.setInterval(() => {
      if (alive) refreshArenaMessages(arenaTopicId)
    }, 3000)
    return () => { alive = false; window.clearInterval(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arenaTopicId, arenaSessionKey, session?.accessToken])

  const t = copy[locale]
  const isCoding = challenge?.challenge_type === 'coding'
  const isGaokaoVolunteer = isGaokaoVolunteerChallenge(challenge)
  const availableChatModes = isGaokaoVolunteer ? chatModes.filter((mode) => mode.id === 'ask') : chatModes
  const currentChatMode = availableChatModes.find((mode) => mode.id === chatMode) || availableChatModes[0]
  const passedCount = useMemo(() => submission?.results.filter((result) => result.status === 'accepted').length || 0, [submission])
  const arenaTypingActive = !!arenaTyping && arenaTyping.topicId === arenaTopicId
  const agentBusy = arenaTypingActive || chatSending || arenaSyncing || whiteboardBusy
  const agentBusyLabel = arenaSyncing
    ? t.chatSyncing
    : whiteboardBusy
    ? t.whiteboardWorking
    : arenaTypingActive
    ? `${arenaTyping.agentName || 'Agent'} ${locale === 'zh' ? '正在输入...' : 'is typing...'}`
    : t.chatWorking

  useEffect(() => {
    if (isGaokaoVolunteer && chatMode !== 'ask') setChatMode('ask')
  }, [chatMode, isGaokaoVolunteer])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [chatMessages.length, agentBusy, whiteboardBusy])

  function changeLanguage(next: Language) {
    setLanguage(next)
    if (challenge) setCode(starterFor(challenge, next))
  }

  async function waitForSubmissionResult(initial: Submission, timeoutMs = 240000) {
    if (isSubmissionTerminal(initial)) return initial
    const startedAt = Date.now()
    let latest = initial
    while (Date.now() - startedAt < timeoutMs) {
      await sleep(1500)
      const response = await fetch(`/api/arena/submissions/${initial.id}`, { cache: 'no-store' })
      const data = await response.json().catch(() => null) as { submission?: Submission } | null
      if (response.ok && data?.submission) {
        latest = data.submission
        setSubmission(latest)
        if (isSubmissionTerminal(latest)) return latest
      }
    }
    throw new Error(locale === 'zh' ? 'Agent Runner 执行超时，仍未返回最终结果。' : 'Agent Runner timed out before returning a final result.')
  }

  async function submitCode() {
    if (!challenge || submitting) return
    const now = new Date().toISOString()
    const optimisticSubmission: Submission = {
      id: `local-judging-${Date.now()}`,
      challenge_id: challenge.id,
      user_id: 'demo-user',
      language,
      code,
      status: 'judging',
      score: 0,
      judge_provider: 'pending',
      judge_output_summary: locale === 'zh' ? '提交已发送，等待 Agent Runner 返回结果。' : 'Submission sent. Waiting for Agent Runner result.',
      agent_help_used: false,
      hint_count: 0,
      created_at: now,
      updated_at: now,
      results: [],
    }
    setSubmission(optimisticSubmission)
    setActiveTab('submissions')
    setSubmitting(true)
    try {
      const response = await fetch(`/api/arena/challenges/${challenge.id}/submissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language, environment: kernelEnvironment, code, user_id: 'demo-user' }),
      })
      const data = await response.json().catch(() => null) as { submission?: Submission; detail?: string } | null
      if (!response.ok || !data?.submission) {
        throw new Error(data?.detail || `Arena submission failed: HTTP ${response.status}`)
      }
      const finalSubmission = await waitForSubmissionResult(data.submission)
      setSubmission(finalSubmission)
      const board = await fetch(`/api/arena/challenges/${challenge.id}/leaderboard`, { cache: 'no-store' }).then((res) => res.json())
      setLeaderboard(board.leaderboard || [])
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setSubmission({
        ...optimisticSubmission,
        status: 'system_error',
        judge_provider: 'wtt-arena',
        judge_output_summary: message,
        updated_at: new Date().toISOString(),
        results: [],
      })
    } finally {
      setSubmitting(false)
    }
  }


  async function ensureArenaSession() {
    if (!session?.accessToken) throw new Error('missing login session')
    if (!challenge || !arenaSessionKey) throw new Error('missing Arena challenge/session key')
    if (arenaTopicId) return arenaTopicId
    setArenaSyncing(true)
    try {
      const response = await fetch(`${CLIENT_WTT_API_BASE}/arena/agent-chat/session`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ challenge_id: challenge.id }),
      })
      if (!response.ok) throw new Error(await responseError(response, 'failed to connect Arena Agent'))
      const data = await response.json()
      if (data.session) setArenaSessionState(data.session)
      const topicId = data.topic_id as string
      if (!topicId) throw new Error('failed to connect Arena Agent: missing topic_id')
      rememberArenaTopic(topicId)
      return topicId
    } finally {
      setArenaSyncing(false)
    }
  }

  async function publishArenaFallback(topicId: string, userMessage: string, intent?: ArenaTeachingIntent, mode: ChatMode = chatMode) {
    if (!challenge) throw new Error('missing challenge')
    const content = `${arenaAgentPromptContext(challenge, locale, language, code, mode, intent)}\n\n${userMessage}`
    const response = await fetch(`${CLIENT_WTT_API_BASE}/topics/${encodeURIComponent(topicId)}/messages?agent_id=${encodeURIComponent(ARENA_AGENT_ID)}`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        content,
        content_type: 'text',
        semantic_type: 'post',
        sender_type: 'HUMAN',
      }),
    })
    if (!response.ok) throw new Error(await responseError(response, 'failed to publish Arena fallback message'))
  }

  async function publishArenaRaw(topicId: string, content: string) {
    const response = await fetch(`${CLIENT_WTT_API_BASE}/topics/${encodeURIComponent(topicId)}/messages?agent_id=${encodeURIComponent(ARENA_AGENT_ID)}`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        content,
        content_type: 'text',
        semantic_type: 'post',
        sender_type: 'HUMAN',
      }),
    })
    if (!response.ok) throw new Error(await responseError(response, 'failed to publish Arena message'))
  }

  async function requestAutoWhiteboardFromAnswer(topicId: string, answerMessage: ChatMessage, sourceUserMessage: string) {
    if (!challenge || whiteboardBusy || isCoding || isGaokaoVolunteerChallenge(challenge)) return
    const sourceKey = chatMessageKey(answerMessage)
    if (autoWhiteboardSourceKeysRef.current.has(sourceKey)) return
    autoWhiteboardSourceKeysRef.current.add(sourceKey)
    const message = makeWhiteboardFromAnswerPrompt(challenge, locale, answerMessage.content, sourceUserMessage)
    setWhiteboardBusy(true)
    try {
      await refreshArenaMessages(topicId)
      const baselineWhiteboardIds = new Set(appliedWhiteboardMessageIdsRef.current)
      const promptContext = arenaAgentPromptContext(challenge, locale, language, code, 'ask', 'whiteboard')
      const response = await fetch(`${CLIENT_WTT_API_BASE}/arena/agent-chat/send`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          topic_id: topicId,
          challenge_id: challenge.id,
          message,
          prompt_context: promptContext,
          arena_context: promptContext,
          system_instruction: promptContext,
          whiteboard_delivery: 'same_response',
          whiteboard_required: true,
          whiteboard_require_html: true,
          locale,
          language,
          code,
          submission_id: submission?.id,
          intent: 'whiteboard',
          mode: 'whiteboard_auto',
          whiteboard_step_mode: false,
          source_message_id: answerMessage.id,
        }),
      })
      if (!response.ok) {
        if (!isLocalArenaChallenge(challenge)) throw new Error(await responseError(response, 'failed to send Arena whiteboard request'))
        await publishArenaRaw(topicId, message)
      }
      const data = await response.json().catch(() => ({}))
      if (data.session) setArenaSessionState(data.session)
      await waitForArenaWhiteboardPayload(topicId, baselineWhiteboardIds, 240000, true)
      await refreshArenaState().catch(() => undefined)
    } catch {
      autoWhiteboardSourceKeysRef.current.delete(sourceKey)
    } finally {
      setWhiteboardBusy(false)
    }
  }

  async function sendAgentChat(intent?: ArenaTeachingIntent, explicitMessage?: string) {
    const message = (explicitMessage ?? chatInput).trim()
    const mode = isGaokaoVolunteerChallenge(challenge) ? 'ask' : explicitMessage ? modeForExplicitIntent(intent) : chatMode
    const effectiveIntent = intent || intentForChatMode(mode)
    if (!challenge || !message || chatSending) return
    if (!session?.accessToken) {
      setChatMessages((prev) => [...prev, { role: 'agent', content: t.chatLogin, createdAt: new Date().toISOString() }])
      return
    }
    if (!explicitMessage) setChatInput('')
    setChatSending(true)
    try {
      const topicId = await ensureArenaSession()
      const baselineMessages = await refreshArenaMessages(topicId)
      const baselineKeys = new Set(baselineMessages.map(chatMessageKey))
      const baselineWhiteboardIds = new Set(appliedWhiteboardMessageIdsRef.current)
      const baselineWhiteboardHtmlIds = new Set(appliedWhiteboardHtmlMessageIdsRef.current)
      const promptContext = arenaAgentPromptContext(challenge, locale, language, code, mode, effectiveIntent)
      const requiresWhiteboard = !isCoding && !isGaokaoVolunteerChallenge(challenge)
      const response = await fetch(`${CLIENT_WTT_API_BASE}/arena/agent-chat/send`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          topic_id: topicId,
          challenge_id: challenge.id,
          message,
          prompt_context: promptContext,
          arena_context: promptContext,
          system_instruction: promptContext,
          whiteboard_delivery: requiresWhiteboard ? 'same_response' : 'disabled',
          whiteboard_required: requiresWhiteboard,
          whiteboard_require_html: requiresWhiteboard,
          locale,
          language,
          code,
          submission_id: submission?.id,
          intent: effectiveIntent,
          chat_mode: mode,
        }),
      })
      if (!response.ok) {
        if (!isLocalArenaChallenge(challenge)) throw new Error(await responseError(response, 'failed to send Arena chat'))
        await publishArenaFallback(topicId, message, effectiveIntent, mode)
      }
      const data = await response.json().catch(() => ({}))
      if (data.session) setArenaSessionState(data.session)
      await waitForArenaAgentMessage(topicId, baselineKeys)
      if (requiresWhiteboard) {
        await waitForArenaWhiteboardPayload(topicId, baselineWhiteboardIds, 45000, true)
      }
      const latestMessages = await refreshArenaMessages(topicId)
      const newAgentAnswer = latestNewAgentMessage(latestMessages, baselineKeys)
      const whiteboardApplied = hasNewAppliedWhiteboard(baselineWhiteboardIds)
      const whiteboardHtmlApplied = hasNewAppliedWhiteboardHtml(baselineWhiteboardHtmlIds)
      if (newAgentAnswer?.content.trim() && requiresWhiteboard && (!whiteboardApplied || !whiteboardHtmlApplied)) {
        void requestAutoWhiteboardFromAnswer(topicId, newAgentAnswer, message)
      }
      await refreshArenaState().catch(() => undefined)
    } catch (error) {
      setChatMessages((prev) => [...prev, { role: 'agent', content: `${t.chatFallback}${error instanceof Error ? ` (${error.message})` : ''}`, createdAt: new Date().toISOString() }])
    } finally {
      setChatSending(false)
    }
  }

  async function requestWhiteboardExplain(stepMode = false) {
    if (!challenge || whiteboardBusy) return
    setWhiteboardDiagram(null)
    const latestAgentAnswer = [...chatMessages].reverse().find((message) => message.role === 'agent' && message.content.trim())
    const message = latestAgentAnswer
      ? makeWhiteboardFromAnswerPrompt(challenge, locale, latestAgentAnswer.content)
      : makeWhiteboardPrompt(challenge, locale, stepMode)
    if (!session?.accessToken) {
      setChatMessages((prev) => [...prev, { role: 'agent', content: t.chatLogin, createdAt: new Date().toISOString() }])
      return
    }
    setWhiteboardBusy(true)
    setChatSending(true)
    try {
      const topicId = await ensureArenaSession()
      await refreshArenaMessages(topicId)
      const baselineWhiteboardIds = new Set(appliedWhiteboardMessageIdsRef.current)
      const promptContext = arenaAgentPromptContext(challenge, locale, language, code, 'ask', 'whiteboard')
      const response = await fetch(`${CLIENT_WTT_API_BASE}/arena/agent-chat/send`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          topic_id: topicId,
          challenge_id: challenge.id,
          message,
          prompt_context: promptContext,
          arena_context: promptContext,
          system_instruction: promptContext,
          whiteboard_delivery: 'same_response',
          whiteboard_required: true,
          whiteboard_require_html: true,
          locale,
          language,
          code,
          submission_id: submission?.id,
          intent: 'whiteboard',
          mode: 'whiteboard_explain',
          whiteboard_step_mode: stepMode,
        }),
      })
      if (!response.ok) {
        if (!isLocalArenaChallenge(challenge)) throw new Error(await responseError(response, 'failed to send Arena whiteboard request'))
        await publishArenaFallback(topicId, message, 'whiteboard')
      }
      const data = await response.json().catch(() => ({}))
      if (data.session) setArenaSessionState(data.session)
      await waitForArenaWhiteboardPayload(topicId, baselineWhiteboardIds, 240000, true)
      await refreshArenaState().catch(() => undefined)
    } catch (error) {
      setChatMessages((prev) => [...prev, { role: 'agent', content: `${t.chatFallback}${error instanceof Error ? ` (${error.message})` : ''}`, createdAt: new Date().toISOString() }])
    } finally {
      setWhiteboardBusy(false)
      setChatSending(false)
    }
  }

  function runCoachAction(action: CoachAction) {
    if (!challenge) return
    const message = locale === 'zh' ? action.promptZh(challenge) : action.promptEn(challenge)
    sendAgentChat(action.intent, message)
  }


  if (!payload || !challenge) {
    return <main className="min-h-screen bg-[#151515] p-8 text-white">Loading Arena...</main>
  }

  const arenaLayoutStyle = !isCoding
    ? {
      gridTemplateColumns: isGaokaoVolunteer
        ? `${leftPanelWidth}px minmax(560px, 1fr)`
        : whiteboardExpanded
        ? 'minmax(0, 1fr) minmax(0, 1fr)'
        : `${leftPanelWidth}px 6px minmax(0, 1fr) minmax(0, 1fr)`,
    }
    : undefined

  return (
    <main className="min-h-screen bg-[#151515] text-gray-100">
      <div className="flex h-screen flex-col overflow-hidden">
        <header className="flex shrink-0 items-center justify-between border-b border-gray-800 bg-[#151515]/95 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-5">
            <Link href="/arena" className="bg-gradient-to-r from-[#3ce8e2] to-[#00b3b3] bg-clip-text text-2xl font-black text-transparent">WTT Arena</Link>
            <div className="hidden items-center gap-4 text-sm text-gray-500 md:flex">
              <Link href="/arena" className="hover:text-[#3ce8e2]">{t.challenges}</Link>
              <span>{t.playground}</span>
              <span>{t.discuss}</span>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <button onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')} className="rounded-md border border-gray-800 bg-[#202020] px-3 py-1 font-bold text-gray-300 hover:border-[#3ce8e2] hover:text-[#3ce8e2]">
              {locale === 'zh' ? 'English' : '中文'}
            </button>
            <span className="rounded-full border border-[#3ce8e2]/20 bg-[#3ce8e2]/5 px-3 py-1 text-[#3ce8e2]">OpenCL · Mac runner</span>
            <span>{t.runner}</span>
          </div>
        </header>

        <div
          ref={layoutRef}
          className={`grid min-h-0 flex-1 gap-3 overflow-hidden p-3 ${isCoding ? 'xl:grid-cols-[32%_1fr_480px] lg:grid-cols-[38%_62%]' : ''}`}
          style={arenaLayoutStyle}
        >
          {(isCoding || !whiteboardExpanded) && (
          <section className="min-h-0 overflow-hidden rounded-lg border border-gray-800 bg-[#1e1e1e]">
            <div className="flex items-center gap-2 overflow-x-auto border-b border-gray-800 bg-[#191919] px-4 py-3 text-sm">
              {(isGaokaoVolunteer
                ? [['description', t.consultation]]
                : [
                  ['description', t.description],
                  ['submissions', t.submissions],
                  ['leaderboard', t.leaderboard],
                ]).map(([id, label]) => (
                <button key={id} onClick={() => setActiveTab(id as typeof activeTab)} className={`rounded-md px-3 py-1.5 font-medium transition-colors ${activeTab === id ? 'bg-[#3ce8e2]/10 text-[#3ce8e2]' : 'text-gray-500 hover:bg-[#252525] hover:text-gray-300'}`}>
                  {label}
                </button>
              ))}
            </div>

            <div className="h-full overflow-y-auto p-5 pb-24">
              {activeTab === 'description' && (
                <div>
                  <h1 className="text-3xl font-black tracking-tight text-white">{challenge.title}</h1>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {isGaokaoVolunteer ? (
                      <span className="rounded-full border border-blue-400/20 bg-blue-400/10 px-2.5 py-1 text-xs font-semibold text-blue-200">Ask 咨询</span>
                    ) : (
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${difficultyTone(challenge.difficulty)}`}>{formatDifficulty(challenge.difficulty)}</span>
                    )}
                    {challenge.tags.map((tag) => <span key={tag} className="rounded-full border border-gray-800 bg-[#151515] px-2.5 py-1 text-xs text-gray-400">{tag}</span>)}
                  </div>
                  {isGaokaoVolunteer && (
                    <p className="mt-4 rounded-lg border border-blue-400/20 bg-blue-400/10 p-4 text-sm leading-6 text-blue-100">{t.gaokaoIntro}</p>
                  )}
                  {!!challenge.concepts?.length && (
                    <div className="mt-4 rounded-lg border border-gray-800 bg-[#151515] p-4">
                      <p className="text-xs font-black uppercase tracking-[0.22em] text-[#3ce8e2]">Skillset</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {challenge.concepts.slice(0, 8).map((concept) => (
                          <span key={concept} className="rounded-md border border-gray-800 bg-[#202020] px-2.5 py-1 text-xs text-gray-300">{concept}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  <ArenaDescriptionMarkdown content={descriptionMarkdown(challenge, locale)} />
                  {challenge.source_url && (
                    <p className="mt-3 rounded-lg border border-gray-800 bg-[#151515] px-5 py-3 text-xs leading-5 text-gray-500">
                      Source: <a href={challenge.source_url} target="_blank" rel="noreferrer" className="text-[#3ce8e2] hover:underline">{challenge.source_name || 'LeetGPU'}</a>
                      {challenge.source_license ? ` · ${challenge.source_license}` : ''}
                    </p>
                  )}

                  {!isGaokaoVolunteer && <div className="mt-6 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border border-gray-800 bg-[#202020] p-4"><p className="text-xs text-gray-500">{t.function}</p><p className="mt-1 font-mono text-sm text-[#3ce8e2]">{challenge.function_name}</p></div>
                    <div className="rounded-lg border border-gray-800 bg-[#202020] p-4"><p className="text-xs text-gray-500">{t.timeLimit}</p><p className="mt-1 font-bold">{challenge.time_limit_ms}ms</p></div>
                    <div className="rounded-lg border border-gray-800 bg-[#202020] p-4"><p className="text-xs text-gray-500">{t.memory}</p><p className="mt-1 font-bold">{challenge.memory_limit_mb}MB</p></div>
                  </div>}

                  {challenge.description_format !== 'html' && !isGaokaoVolunteer && (
                    <div className="mt-7 space-y-4">
                      <h2 className="text-lg font-bold text-white">{t.examples}</h2>
                      {payload.public_cases.length === 0 && <p className="rounded-lg border border-dashed border-gray-800 bg-[#151515] p-4 text-sm leading-6 text-gray-500">{t.noExamples}</p>}
                      {payload.public_cases.map((testCase, index) => (
                        <div key={testCase.id} className="rounded-lg border border-gray-800 bg-[#151515] p-4 text-sm">
                          <p className="font-semibold text-gray-300">Example {index + 1}</p>
                          <p className="mt-3 text-xs uppercase tracking-wider text-gray-500">{t.input}</p>
                          <code className="mt-1 block break-all rounded bg-black/30 p-3 text-gray-200">{testCase.input}</code>
                          <p className="mt-3 text-xs uppercase tracking-wider text-gray-500">{t.expected}</p>
                          <code className="mt-1 block rounded bg-black/30 p-3 text-gray-200">{testCase.expected_output}</code>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'submissions' && (
                <div className="space-y-3">
                  {!submission && <p className="text-sm text-gray-500">{t.noSubmission}</p>}
                  {submission && (
                    <div className="space-y-3">
                      <div className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${statusTone(submission.status)}`}>{submission.status} · score {submission.score}</div>
                      <p className="text-sm text-gray-500">{passedCount}/{submission.results.length} executed tests accepted · provider {submission.judge_provider} · runtime {submission.runtime_ms || '-'}ms · {isOpenCLProvider(submission.judge_provider) ? 'kernel memory' : 'memory'} {submission.memory_kb || '-'}KB</p>
                      {submission.results.map((result, index) => (
                        <div key={result.id} className="rounded-lg border border-gray-800 bg-[#151515] p-4 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-gray-300">{result.is_hidden ? `Hidden Test #${index + 1}` : `Public Test #${index + 1}`}</span>
                            <span className={result.status === 'accepted' ? 'text-emerald-300' : 'text-rose-300'}>{result.status}</span>
                          </div>
                          <p className="mt-2 text-xs text-gray-500">runtime {result.runtime_ms || '-'}ms · {isOpenCLProvider(submission.judge_provider) ? 'kernel memory' : 'memory'} {result.memory_kb || '-'}KB</p>
                          {!result.is_hidden && result.input && <pre className="mt-3 whitespace-pre-wrap text-gray-400">input: {result.input}</pre>}
                          {!result.is_hidden && result.expected_output && <pre className="mt-3 whitespace-pre-wrap text-gray-400">expected: {result.expected_output}</pre>}
                          {!result.is_hidden && result.stdout && <pre className="mt-3 whitespace-pre-wrap text-gray-400">stdout: {result.stdout}</pre>}
                          {!result.is_hidden && result.stderr && <pre className="mt-3 whitespace-pre-wrap text-rose-300">stderr: {result.stderr}</pre>}
                          {result.error_message && <p className="mt-3 text-yellow-300">{result.error_message}</p>}
                        </div>
                      ))}
                      <Link href={`/arena/submissions/${submission.id}`} className="inline-flex text-sm font-semibold text-[#3ce8e2] hover:underline">{t.openFull}</Link>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'leaderboard' && (
                <div className="space-y-3">
                  {leaderboard.length === 0 && <p className="text-sm text-gray-500">{t.firstAc}</p>}
                  {leaderboard.map((entry, index) => (
                    <div key={`${entry.user_id}-${entry.best_submission_id}`} className="flex items-center justify-between rounded-lg border border-gray-800 bg-[#151515] p-4">
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#252525] text-sm font-black text-[#3ce8e2]">#{index + 1}</span>
                        <div><p className="font-bold text-white">{entry.user_id}</p><p className="text-xs text-gray-500">submits {entry.submission_count} · hint {entry.hint_count}</p></div>
                      </div>
                      <div className="text-right text-sm"><p className="font-bold text-emerald-300">AC</p><p className="text-xs text-gray-500">{entry.best_runtime_ms || '-'}ms</p></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
          )}

          {!isCoding && !isGaokaoVolunteer && !whiteboardExpanded && (
            <div
              role="separator"
              aria-orientation="vertical"
              onPointerDown={startPanelResize()}
              className="-mx-1 cursor-col-resize rounded-full bg-transparent transition-colors hover:bg-[#3ce8e2]/50"
            />
          )}

          {isCoding ? (
            <section className="grid min-h-0 gap-3 lg:grid-rows-[1fr_210px]">
              <div className="min-h-0 overflow-hidden rounded-lg border border-gray-800 bg-[#1e1e1e]">
                <div className="flex items-center justify-between gap-3 border-b border-gray-800 bg-[#191919] px-4 py-3">
                  <div>
                    <p className="text-sm font-bold text-white">{sourceFilename(language)}</p>
                    <p className="text-xs text-gray-500">
                      {challenge.category === 'ai-kernel' && language === 'opencl'
                        ? `Complete OpenCL host + ${challenge.function_name} · ${t.runner}`
                        : `Implement ${challenge.function_name} · ${t.runner}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {challenge.category === 'ai-kernel' && (
                      <>
                        <label className="text-xs text-gray-500">{locale === 'zh' ? '环境' : 'Env'}</label>
                        <select value={kernelEnvironment} onChange={(event) => setKernelEnvironment(event.target.value as KernelEnvironment)} className="rounded-md border border-gray-800 bg-[#101010] px-3 py-2 text-xs font-bold text-gray-200 outline-none focus:border-[#3ce8e2]">
                          <option value="macos-opencl">Mac mini · OpenCL</option>
                        </select>
                      </>
                    )}
                    <label className="text-xs text-gray-500">{t.language}</label>
                    <select value={language} onChange={(event) => changeLanguage(event.target.value as Language)} className="rounded-md border border-gray-800 bg-[#101010] px-3 py-2 text-xs font-bold text-gray-200 outline-none focus:border-[#3ce8e2]">
                      {challenge.category === 'ai-kernel' && <option value="opencl">OpenCL C</option>}
                      {challenge.category === 'ai-kernel' && <option value="cuda">CUDA C++</option>}
                      {challenge.category === 'ai-kernel' && <option value="triton">Triton</option>}
                      <option value="cpp">C++</option>
                      <option value="python">Python</option>
                      <option value="c">C</option>
                    </select>
                    <button onClick={submitCode} disabled={submitting} className="rounded-md bg-gradient-to-r from-[#2ee6e3] to-[#00b3b3] px-4 py-2 text-sm font-black text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
                      {submitting ? t.judging : t.run}
                    </button>
                  </div>
                </div>
                <div className="h-[calc(100%-57px)] min-h-[360px]">
                  <Editor language={editorLanguage(language)} theme="vs-dark" value={code} onChange={(value: string | undefined) => setCode(value || '')} options={{ fontSize: 14, minimap: { enabled: false }, scrollBeyondLastLine: false, wordWrap: 'on', padding: { top: 16 } }} />
                </div>
              </div>

              <section className="overflow-y-auto rounded-lg border border-gray-800 bg-[#1e1e1e] p-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-white">{t.console}</h2>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusTone(submission?.status)}`}>{submission?.status || t.notSubmitted}</span>
                </div>
                {submission ? (
                  <div className="mt-4 grid gap-2 text-sm text-gray-400 sm:grid-cols-2">
                    <p>score: <span className="text-white">{submission.score}</span></p>
                    <p>runtime: <span className="text-white">{submission.runtime_ms || '-'}ms</span></p>
                    <p>language: <span className="text-white">{submission.language}</span></p>
                    <p>provider: <span className="text-white">{submission.judge_provider}</span></p>
                    <p className="sm:col-span-2 text-gray-500">{t.hidden}</p>
                  </div>
              ) : <p className="mt-4 text-sm text-gray-500">{locale === 'zh' ? '点击 Run & Submit 后查看 Agent 执行结果。' : 'Click Run & Submit to see Agent execution results.'}</p>}
              </section>
            </section>
          ) : null}

          <aside className={`flex min-h-0 flex-col overflow-hidden rounded-lg border border-gray-800 bg-[#1e1e1e] p-2 ${isCoding ? 'lg:col-span-2 xl:col-span-1' : ''}`}>
            <div className="flex min-h-[520px] flex-1 flex-col overflow-hidden rounded-lg border border-gray-800 bg-[#151515]">
              <div className="border-b border-gray-800 px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-black text-white">{t.chatTitle}</h3>
                    <p className="mt-1 text-xs leading-5 text-gray-500">
                      {t.stage}: <span className="font-bold text-gray-300">{stageLabel(arenaSessionState?.stage, locale)}</span>
                      {arenaSessionState ? ` · hint ${arenaSessionState.hint_level}` : ''}
                      {` · ${t.mastery} ${Math.round((arenaSessionState?.mastery_estimate || 0) * 100)}%`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {agentBusy && (
                      <span className="inline-flex items-center gap-2 rounded-full border border-[#3ce8e2]/30 bg-[#3ce8e2]/10 px-2.5 py-1 text-[11px] font-black text-[#bffffd]">
                        <TypingDots />
                        {agentBusyLabel}
                      </span>
                    )}
                    <span className="rounded-full border border-[#3ce8e2]/20 bg-[#3ce8e2]/5 px-2.5 py-1 text-[11px] font-bold text-[#3ce8e2]">{ARENA_AGENT_ID}</span>
                  </div>
                </div>
                {!isGaokaoVolunteer && <div className="mt-2 grid grid-cols-3 gap-1.5">
                  {coachActions.map((action) => (
                    <button
                      key={action.intent}
                      type="button"
                      onClick={() => runCoachAction(action)}
                      disabled={chatSending || arenaSyncing}
                      className="rounded-md border border-[#3ce8e2]/30 bg-[#3ce8e2]/15 px-2 py-1.5 text-[11px] font-black text-[#bffffd] transition-colors hover:border-[#3ce8e2] hover:bg-[#3ce8e2] hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {locale === 'zh' ? action.zh : action.en}
                    </button>
                  ))}
                </div>}
              </div>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                {chatMessages.length === 0 && (
                  <div className="rounded-lg border border-dashed border-gray-800 bg-[#101010] p-3 text-xs leading-5 text-gray-500">{t.chatIntro}</div>
                )}
                {chatMessages.map((message, index) => (
                  <div key={`${message.createdAt}-${index}`} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-6 ${message.role === 'user' ? 'bg-[#3ce8e2] text-black' : 'border border-gray-800 bg-[#202020] text-gray-300'}`}>
                      {message.role === 'agent' ? <ArenaChatMarkdown content={message.content} /> : <span className="whitespace-pre-wrap break-words">{message.content}</span>}
                    </div>
                  </div>
                ))}
                {agentBusy && (
                  <div className="flex justify-start">
                    <div className="max-w-[88%] rounded-2xl border border-[#3ce8e2]/25 bg-[#102727] px-3 py-2 text-sm leading-6 text-[#dffffe] shadow-[0_0_24px_rgba(60,232,226,0.08)]">
                      <div className="flex items-center gap-2 font-black">
                        <TypingDots />
                        <span>{agentBusyLabel}</span>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-[#8bcfcc]">
                        {locale === 'zh' ? '请求已发送，等待 Agent 返回并同步到对话。' : 'Request sent. Waiting for the Agent response to sync into chat.'}
                      </p>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              <form onSubmit={(event) => { event.preventDefault(); sendAgentChat() }} className="shrink-0 border-t border-gray-800 bg-[#151515] p-3">
                <textarea
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) sendAgentChat() }}
                  placeholder={t.chatPlaceholder}
                  rows={4}
                  className="min-h-[96px] w-full resize-y rounded-md border border-gray-800 bg-[#101010] p-3 text-sm leading-6 text-gray-200 outline-none placeholder:text-gray-600 focus:border-[#3ce8e2]"
                />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-600">
                  <span className="min-w-0 flex-1 truncate">{locale === 'zh' ? currentChatMode.hintZh : currentChatMode.hintEn}</span>
                  <div className="flex shrink-0 items-center gap-2">
                    <label className="text-xs font-bold text-gray-500">{t.mode}</label>
                    {isGaokaoVolunteer ? (
                      <span className="rounded-md border border-blue-400/30 bg-blue-400/10 px-3 py-2 text-xs font-black text-blue-200">Ask</span>
                    ) : (
                    <select
                      value={chatMode}
                      onChange={(event) => setChatMode(event.target.value as ChatMode)}
                      className="rounded-md border border-gray-800 bg-[#101010] px-2 py-2 text-xs font-bold text-gray-200 outline-none focus:border-[#3ce8e2]"
                    >
                      {availableChatModes.map((mode) => (
                        <option key={mode.id} value={mode.id}>{locale === 'zh' ? mode.zh : mode.en}</option>
                      ))}
                    </select>
                    )}
                    <button type="submit" disabled={!chatInput.trim() || chatSending || arenaSyncing} className="min-w-[96px] shrink-0 rounded-md bg-[#3ce8e2] px-4 py-2 text-sm font-black text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">{t.chatSend}</button>
                  </div>
                </div>
              </form>
            </div>
          </aside>

          {!isCoding && !isGaokaoVolunteer && (
            <div className="grid min-h-0 gap-2 lg:grid-rows-[auto_1fr]">
              {!whiteboardExpanded && (
              <section className="overflow-hidden rounded-lg border border-violet-400/20 bg-[#1e1e1e] px-3 py-2">
                <div className="flex min-w-0 items-center gap-3">
                  <p className="shrink-0 text-[11px] font-black uppercase tracking-[0.18em] text-violet-300">{t.interviewMode}</p>
                  <p className="min-w-0 truncate text-xs text-gray-400">{t.interviewHint}</p>
                </div>
              </section>
              )}
              <AgentWhiteboard
                challengeId={`${ARENA_AGENT_ID}:${challenge.id}:${arenaTopicId || 'pending'}`}
                locale={locale}
                diagram={whiteboardDiagram}
                expanded={whiteboardExpanded}
                busy={whiteboardBusy || agentBusy}
                onExplain={() => requestWhiteboardExplain(false)}
                onToggleExpand={() => setWhiteboardExpanded((value) => !value)}
              />
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
