'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'
import { AgentWhiteboard } from '@/components/arena/agent-whiteboard'
import type { ArenaSessionState, ArenaTeachingIntent, ArenaUserProfile, Challenge, LeaderboardEntry, Submission } from '@/lib/arena/types'
import { extractWhiteboardPayload, makeWhiteboardPrompt, stripWhiteboardPayload, type WhiteboardDiagram } from '@/lib/arena/whiteboard'
import { gaokaoKnowledgeContextMarkdown } from '@/lib/arena/gaokao-knowledge'
import { normalizeMarkdownMath } from '@/lib/markdown-math'

const Editor = dynamic(() => import('@monaco-editor/react'), { ssr: false })

type Locale = 'zh' | 'en'
type Language = 'python' | 'cpp' | 'c'
type ChatMode = 'socratic' | 'interview_answer' | 'ask'
type ChatMessage = { id?: string; role: 'user' | 'agent'; content: string; createdAt: string }

type ChallengePayload = {
  challenge: Challenge
  public_cases: Array<{ id: string; input: string; expected_output: string; explanation?: string }>
  submissions: Array<Omit<Submission, 'code' | 'results'>>
}

type TopicMessage = { id?: string; message_id?: string; sender_type?: string; sender_id?: string; semantic_type?: string; content?: string; timestamp?: string; created_at?: string }

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

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
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
    mode: '模式',
    coachFlow: '教学编排', growth: '成长档案', weak: '薄弱点', next: '下一题', mastery: '掌握度', stage: '阶段',
    aiDesc: 'AI Kernel / CPU-sim 题。请实现指定函数，返回样例要求的 JSON 值。当前由远程 Agent/Runner 在 CPU 上模拟 CUDA/OpenCL 风格算子；后续同一题目契约可切换到真实硬件 runner。',
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
    mode: 'Mode',
    coachFlow: 'Teaching flow', growth: 'Growth profile', weak: 'Weak spots', next: 'Next', mastery: 'Mastery', stage: 'Stage',
    aiDesc: 'AI Kernel / CPU-sim challenge. Implement the target function and return the exact JSON value requested by the examples. The remote Agent/Runner currently simulates CUDA/OpenCL-style kernels on CPU; the same contract can later route to real hardware.',
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
  if (language === 'cpp') return 'cpp'
  if (language === 'c') return 'c'
  return 'python'
}

function starterFor(challenge: Challenge, language: Language) {
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
  if (mode === 'interview_answer') {
    return locale === 'zh'
      ? 'chat_mode: interview_answer\n请把用户输入当作候选人的面试回答来评审：先给 0-10 分，再指出亮点、缺口、误区，补充一版更强答案，并给一个下一轮追问。回复末尾仍必须输出 WHITEBOARD_DIAGRAM，白板展示评分维度、缺口、补充答案结构。'
      : 'chat_mode: interview_answer\nTreat the user input as a candidate interview answer. Give a 0-10 score, then identify strengths, gaps, misconceptions, provide a stronger answer skeleton, and ask one next follow-up. Still end with WHITEBOARD_DIAGRAM showing scoring dimensions, gaps, and improved answer structure.'
  }
  if (mode === 'ask') {
    return locale === 'zh'
      ? 'chat_mode: ask\n请直接回答用户问题，结构清晰、可操作，必要时给公式、示例、trade-off。回复末尾仍必须输出 WHITEBOARD_DIAGRAM，把答案要点同步展示到白板。'
      : 'chat_mode: ask\nAnswer the user question directly with a clear, actionable structure. Include formulas, examples, and trade-offs when needed. Still end with WHITEBOARD_DIAGRAM so the answer appears on the board.'
  }
  return locale === 'zh'
    ? 'chat_mode: socratic\n请使用苏格拉底式交互：根据用户输入判断当前卡点，优先提出 1-2 个高质量问题和少量提示，推动用户自己推理；不要直接倾倒完整答案，除非用户明确要求。回复末尾仍必须输出 WHITEBOARD_DIAGRAM，白板展示当前推理路径和下一步问题。'
    : 'chat_mode: socratic\nUse Socratic coaching. Diagnose the user’s current blocker, ask 1-2 high-quality questions with light hints, and help the user reason instead of dumping the full answer unless explicitly asked. Still end with WHITEBOARD_DIAGRAM showing the reasoning path and next question.'
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
  const [payload, setPayload] = useState<ChallengePayload | null>(null)
  const [locale, setLocale] = useState<Locale>('zh')
  const [language, setLanguage] = useState<Language>('python')
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
  const [leftPanelWidth, setLeftPanelWidth] = useState(420)
  const [chatPanelWidth, setChatPanelWidth] = useState(460)
  const layoutRef = useRef<HTMLDivElement | null>(null)
  const appliedWhiteboardMessageIdsRef = useRef(new Set<string>())

  function startPanelResize(panel: 'left' | 'chat') {
    return (event: React.PointerEvent<HTMLDivElement>) => {
      if (isCoding) return
      event.preventDefault()
      const bounds = layoutRef.current?.getBoundingClientRect()
      if (!bounds) return
      const handleMove = (moveEvent: PointerEvent) => {
        if (panel === 'left') {
          const available = bounds.width - chatPanelWidth - 120
          setLeftPanelWidth(clampNumber(moveEvent.clientX - bounds.left, 280, Math.max(300, available)))
          return
        }
        setChatPanelWidth(clampNumber(bounds.right - moveEvent.clientX, 340, Math.min(720, bounds.width - 420)))
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
        setCode(starterFor(data.challenge, language))
      })
      .catch(() => undefined)
    fetch(`/api/arena/challenges/${params.id}/leaderboard`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data: { leaderboard: LeaderboardEntry[] }) => alive && setLeaderboard(data.leaderboard || []))
      .catch(() => undefined)
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id])

  const challenge = payload?.challenge
  const arenaActor = arenaSessionActor(session as ArenaSession)
  const arenaSessionKey = challenge && session?.accessToken ? `${arenaActor}:${ARENA_AGENT_ID}:${challenge.id}` : ''
  const arenaTopicId = arenaSessionKey ? (arenaTopicByKey[arenaSessionKey] || '') : ''

  const authHeaders = useMemo(() => ({
    'Content-Type': 'application/json',
    ...(session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
  }), [session?.accessToken])

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

  const refreshArenaMessages = async (topicId = arenaTopicId) => {
    if (!topicId || !session?.accessToken || !challenge) return [] as ChatMessage[]
    let response = await fetch(`${CLIENT_WTT_API_BASE}/arena/agent-chat/messages?topic_id=${encodeURIComponent(topicId)}&limit=100`, { headers: authHeaders })
    if (!response.ok) {
      response = await fetch(`${CLIENT_WTT_API_BASE}/topics/${encodeURIComponent(topicId)}/messages?limit=100&agent_id=${encodeURIComponent(ARENA_AGENT_ID)}`, { headers: authHeaders })
    }
    if (!response.ok) return [] as ChatMessage[]
    const raw = await response.json()
    const rows: TopicMessage[] = Array.isArray(raw) ? raw : raw.messages || []
    const mapped = topicMessagesToChat(rows, ARENA_AGENT_ID)
    for (const row of [...rows].reverse()) {
      const senderType = String(row.sender_type || '').toUpperCase()
      const senderId = String(row.sender_id || '')
      const semantic = String(row.semantic_type || '').toLowerCase()
      const isAgent = senderType === 'AGENT' || senderId === ARENA_AGENT_ID
      const messageId = row.id || row.message_id || `${row.timestamp || row.created_at || ''}:${String(row.content || '').length}`
      if (semantic === 'notification') continue
      if (!isAgent || appliedWhiteboardMessageIdsRef.current.has(messageId)) continue
      const content = stripSourceBlock(String(row.content || ''))
      if (content.includes('Agent thinking')) continue
      if (isGaokaoVolunteerChallenge(challenge)) {
        appliedWhiteboardMessageIdsRef.current.add(messageId)
        setWhiteboardDiagram(null)
        break
      }
      const payload = extractWhiteboardPayload(content)
      appliedWhiteboardMessageIdsRef.current.add(messageId)
      if (payload?.diagram) {
        setWhiteboardDiagram(payload.diagram)
      } else {
        setWhiteboardDiagram(null)
      }
      break
    }
    setChatMessages(mapped)
    return mapped
  }


  useEffect(() => {
    setChatMessages([])
    setArenaSessionState(null)
    setArenaProfile(null)
    setWhiteboardDiagram(null)
    setWhiteboardExpanded(false)
    appliedWhiteboardMessageIdsRef.current.clear()
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

  useEffect(() => {
    if (isGaokaoVolunteer && chatMode !== 'ask') setChatMode('ask')
  }, [chatMode, isGaokaoVolunteer])

  function changeLanguage(next: Language) {
    setLanguage(next)
    if (challenge) setCode(starterFor(challenge, next))
  }

  async function submitCode() {
    if (!challenge || submitting) return
    setSubmitting(true)
    try {
      const response = await fetch(`/api/arena/challenges/${challenge.id}/submissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language, code, user_id: 'demo-user' }),
      })
      const data = await response.json()
      setSubmission(data.submission)
      setActiveTab('submissions')
      const board = await fetch(`/api/arena/challenges/${challenge.id}/leaderboard`, { cache: 'no-store' }).then((res) => res.json())
      setLeaderboard(board.leaderboard || [])
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
    const content = `${arenaChallengeContext(challenge, locale, language, code)}\n\n${modeInstruction(mode, locale, challenge)}\n${intent ? `teaching_intent: ${intent}\n` : ''}${userMessage}`
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
      const response = await fetch(`${CLIENT_WTT_API_BASE}/arena/agent-chat/send`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          topic_id: topicId,
          challenge_id: challenge.id,
          message,
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
      await refreshArenaMessages(topicId)
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
    const message = makeWhiteboardPrompt(challenge, locale, stepMode)
    if (!session?.accessToken) {
      setChatMessages((prev) => [...prev, { role: 'agent', content: t.chatLogin, createdAt: new Date().toISOString() }])
      return
    }
    setWhiteboardBusy(true)
    setChatSending(true)
    try {
      const topicId = await ensureArenaSession()
      const response = await fetch(`${CLIENT_WTT_API_BASE}/arena/agent-chat/send`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          topic_id: topicId,
          challenge_id: challenge.id,
          message,
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
      await refreshArenaMessages(topicId)
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
        ? `minmax(420px, 1fr) 6px ${chatPanelWidth}px`
        : `${leftPanelWidth}px 6px minmax(420px, 1fr) 6px ${chatPanelWidth}px`,
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
            <span className="rounded-full border border-[#3ce8e2]/20 bg-[#3ce8e2]/5 px-3 py-1 text-[#3ce8e2]">CPU-sim MVP</span>
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

                  {challenge.description_format === 'html' ? (
                    <div className="mt-6 rounded-lg border border-gray-800 bg-[#151515] p-5 text-sm leading-7 text-gray-300">
                      <div
                        className="space-y-4 [&_code]:rounded [&_code]:bg-black/40 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-white [&_li]:ml-5 [&_li]:list-disc [&_p]:leading-7 [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-gray-800 [&_pre]:bg-black/30 [&_pre]:p-4 [&_pre]:font-mono [&_pre]:text-gray-200 [&_table]:w-full [&_td]:border [&_td]:border-gray-800 [&_td]:p-2 [&_th]:border [&_th]:border-gray-800 [&_th]:p-2"
                        dangerouslySetInnerHTML={{ __html: challenge.description }}
                      />
                      {challenge.source_url && (
                        <p className="mt-6 border-t border-gray-800 pt-4 text-xs leading-5 text-gray-500">
                          Source: <a href={challenge.source_url} target="_blank" rel="noreferrer" className="text-[#3ce8e2] hover:underline">{challenge.source_name || 'LeetGPU'}</a>
                          {challenge.source_license ? ` · ${challenge.source_license}` : ''}
                        </p>
                      )}
                    </div>
                  ) : (
                    <pre className="mt-6 whitespace-pre-wrap rounded-lg border border-gray-800 bg-[#151515] p-5 text-sm leading-7 text-gray-300">{localizedDescription(challenge, locale)}</pre>
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
                      <p className="text-sm text-gray-500">{passedCount}/{submission.results.length} executed tests accepted · provider {submission.judge_provider}</p>
                      {submission.results.map((result, index) => (
                        <div key={result.id} className="rounded-lg border border-gray-800 bg-[#151515] p-4 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-gray-300">{result.is_hidden ? `Hidden Test #${index + 1}` : `Public Test #${index + 1}`}</span>
                            <span className={result.status === 'accepted' ? 'text-emerald-300' : 'text-rose-300'}>{result.status}</span>
                          </div>
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
              onPointerDown={startPanelResize('left')}
              className="-mx-1 cursor-col-resize rounded-full bg-transparent transition-colors hover:bg-[#3ce8e2]/50"
            />
          )}

          {isCoding ? (
            <section className="grid min-h-0 gap-3 lg:grid-rows-[1fr_210px]">
              <div className="min-h-0 overflow-hidden rounded-lg border border-gray-800 bg-[#1e1e1e]">
                <div className="flex items-center justify-between gap-3 border-b border-gray-800 bg-[#191919] px-4 py-3">
                  <div>
                    <p className="text-sm font-bold text-white">main.{language === 'python' ? 'py' : language === 'cpp' ? 'cpp' : 'c'}</p>
                    <p className="text-xs text-gray-500">Implement {challenge.function_name} · {t.runner}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500">{t.language}</label>
                    <select value={language} onChange={(event) => changeLanguage(event.target.value as Language)} className="rounded-md border border-gray-800 bg-[#101010] px-3 py-2 text-xs font-bold text-gray-200 outline-none focus:border-[#3ce8e2]">
                      <option value="python">Python</option>
                      <option value="cpp">C++</option>
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
          ) : isGaokaoVolunteer ? null : (
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
                busy={whiteboardBusy || chatSending || arenaSyncing}
                onExplain={() => requestWhiteboardExplain(false)}
                onToggleExpand={() => setWhiteboardExpanded((value) => !value)}
              />
            </div>
          )}

          {!isCoding && !isGaokaoVolunteer && (
            <div
              role="separator"
              aria-orientation="vertical"
              onPointerDown={startPanelResize('chat')}
              className="-mx-1 cursor-col-resize rounded-full bg-transparent transition-colors hover:bg-[#3ce8e2]/50"
            />
          )}

          <aside className={`flex min-h-0 flex-col overflow-hidden rounded-lg border border-gray-800 bg-[#1e1e1e] p-2 ${isGaokaoVolunteer ? '' : 'lg:col-span-2 xl:col-span-1'}`}>
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
                  <span className="rounded-full border border-[#3ce8e2]/20 bg-[#3ce8e2]/5 px-2.5 py-1 text-[11px] font-bold text-[#3ce8e2]">{ARENA_AGENT_ID}</span>
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
                {arenaSyncing && <p className="text-xs text-[#3ce8e2]">{t.chatSyncing}</p>}
                {chatSending && <p className="text-xs text-gray-500">{t.chatThinking}</p>}
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
        </div>
      </div>
    </main>
  )
}
