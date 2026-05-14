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
    intent: 'debug',
    zh: 'Debug',
    en: 'Debug',
    promptZh: (challenge) => `请 debug 我对「${challenge.title}」的当前答案或代码，优先检查是否覆盖了“${extractChallengeFocus(challenge)}”，再指出一个最小修正方向。`,
    promptEn: (challenge) => `Debug my current answer or code for "${challenge.title}". First check whether it addresses this focus: ${extractChallengeFocus(challenge)}. Then identify one minimal correction.`,
  },
  {
    intent: 'follow_up',
    zh: '追问',
    en: 'Follow-up',
    promptZh: (challenge) => `请作为面试官，围绕「${challenge.title}」和“${extractChallengeFocus(challenge)}”提出一个真实追问。先不要给答案，等我回答。`,
    promptEn: (challenge) => `Act as the interviewer for "${challenge.title}" and ask one realistic follow-up grounded in this focus: ${extractChallengeFocus(challenge)}. Do not answer it yet.`,
  },
  {
    intent: 'concept',
    zh: '补课',
    en: 'Concept',
    promptZh: (challenge) => `请判断「${challenge.title}」里我最需要补的一个知识点，必须贴合“${extractChallengeFocus(challenge)}”。简短讲清楚后给我一个小检查问题。`,
    promptEn: (challenge) => `Pick the one prerequisite concept I most need for "${challenge.title}", grounded in this focus: ${extractChallengeFocus(challenge)}. Teach it briefly, then ask a quick check question.`,
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
    interviewMode: 'AI 面试练习模式', interviewHint: '这类题不需要提交代码。直接在右侧和 Arena Coach 进行多轮模拟面试、追问、复盘。', noExamples: '这是一道开放式面试题，无固定样例；请用右侧 Agent 对话练习结构化回答。',
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
    interviewMode: 'AI interview practice mode', interviewHint: 'No code submission is required. Use Arena Coach on the right for mock interview, follow-up questions, and review.', noExamples: 'This is an open-ended interview prompt with no fixed examples. Practice a structured answer with the Agent on the right.',
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
  return challenge.category === 'ai-interview' || challenge.category === 'ai-kernel'
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
  return `[Arena Challenge Context]\n` +
    `id: ${challenge.id}\n` +
    `title: ${challenge.title}\n` +
    `category: ${challenge.category}\n` +
    `difficulty: ${challenge.difficulty}\n` +
    `locale: ${locale}\n` +
    `language: ${language}\n` +
    `problem_constraints_do_not_copy_to_whiteboard:\n${challenge.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 4000)}\n` +
    (code ? `current_code:\n${code.slice(0, 4000)}\n` : '') +
    `[/Arena Challenge Context]`
}

function modeInstruction(mode: ChatMode, locale: Locale) {
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
  const appliedWhiteboardMessageIdsRef = useRef(new Set<string>())

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
  const currentChatMode = chatModes.find((mode) => mode.id === chatMode) || chatModes[0]
  const passedCount = useMemo(() => submission?.results.filter((result) => result.status === 'accepted').length || 0, [submission])

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
    const content = `${arenaChallengeContext(challenge, locale, language, code)}\n\n${modeInstruction(mode, locale)}\n${intent ? `teaching_intent: ${intent}\n` : ''}${userMessage}`
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
    const mode = explicitMessage ? modeForExplicitIntent(intent) : chatMode
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

        <div className="grid min-h-0 flex-1 gap-3 p-3 xl:grid-cols-[32%_1fr_480px] lg:grid-cols-[38%_62%]">
          {(isCoding || !whiteboardExpanded) && (
          <section className="min-h-0 overflow-hidden rounded-lg border border-gray-800 bg-[#1e1e1e]">
            <div className="flex items-center gap-2 overflow-x-auto border-b border-gray-800 bg-[#191919] px-4 py-3 text-sm">
              {[
                ['description', t.description],
                ['submissions', t.submissions],
                ['leaderboard', t.leaderboard],
              ].map(([id, label]) => (
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
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${difficultyTone(challenge.difficulty)}`}>{formatDifficulty(challenge.difficulty)}</span>
                    {challenge.tags.map((tag) => <span key={tag} className="rounded-full border border-gray-800 bg-[#151515] px-2.5 py-1 text-xs text-gray-400">{tag}</span>)}
                  </div>
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

                  <div className="mt-6 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border border-gray-800 bg-[#202020] p-4"><p className="text-xs text-gray-500">{t.function}</p><p className="mt-1 font-mono text-sm text-[#3ce8e2]">{challenge.function_name}</p></div>
                    <div className="rounded-lg border border-gray-800 bg-[#202020] p-4"><p className="text-xs text-gray-500">{t.timeLimit}</p><p className="mt-1 font-bold">{challenge.time_limit_ms}ms</p></div>
                    <div className="rounded-lg border border-gray-800 bg-[#202020] p-4"><p className="text-xs text-gray-500">{t.memory}</p><p className="mt-1 font-bold">{challenge.memory_limit_mb}MB</p></div>
                  </div>

                  {challenge.description_format !== 'html' && (
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
          ) : (
            <div className={whiteboardExpanded ? 'min-h-0 xl:col-span-3 lg:col-span-2' : 'grid min-h-0 gap-3 lg:grid-rows-[auto_1fr]'}>
              {!whiteboardExpanded && (
              <section className="overflow-hidden rounded-lg border border-violet-400/20 bg-gradient-to-br from-violet-500/10 via-[#1e1e1e] to-[#151515] p-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.26em] text-violet-300">{t.interviewMode}</p>
                    <h2 className="mt-2 text-2xl font-black tracking-tight text-white">{challenge.title}</h2>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-300">{t.interviewHint}</p>
                  </div>
                  <button onClick={() => setChatInput(locale === 'zh' ? `请作为 AI 面试官，围绕「${challenge.title}」对我进行模拟面试。先让我给出 high-level 方案，然后逐步追问。` : `Act as an AI interviewer for "${challenge.title}". Ask me for a high-level design first, then follow up on trade-offs.`)} className="rounded-md bg-gradient-to-r from-violet-300 to-fuchsia-500 px-4 py-2 text-xs font-black text-black transition-opacity hover:opacity-90">
                    {locale === 'zh' ? '生成模拟面试开场 →' : 'Start mock interview →'}
                  </button>
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
                onStep={() => requestWhiteboardExplain(true)}
                onToggleExpand={() => setWhiteboardExpanded((value) => !value)}
              />
            </div>
          )}

          {(isCoding || !whiteboardExpanded) && (
          <aside className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-gray-800 bg-[#1e1e1e] p-3 lg:col-span-2 xl:col-span-1">
            <div className="flex min-h-[520px] flex-1 flex-col overflow-hidden rounded-lg border border-gray-800 bg-[#151515]">
              <div className="border-b border-gray-800 px-4 py-3">
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
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {coachActions.map((action) => (
                    <button
                      key={action.intent}
                      type="button"
                      onClick={() => runCoachAction(action)}
                      disabled={chatSending || arenaSyncing}
                      className="rounded-md border border-gray-800 bg-[#202020] px-2 py-2 text-xs font-bold text-gray-300 transition-colors hover:border-[#3ce8e2] hover:text-[#3ce8e2] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {locale === 'zh' ? action.zh : action.en}
                    </button>
                  ))}
                </div>
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
              <form onSubmit={(event) => { event.preventDefault(); sendAgentChat() }} className="shrink-0 border-t border-gray-800 bg-[#151515] p-4">
                <textarea
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) sendAgentChat() }}
                  placeholder={t.chatPlaceholder}
                  rows={6}
                  className="min-h-[132px] w-full resize-y rounded-md border border-gray-800 bg-[#101010] p-3 text-sm leading-6 text-gray-200 outline-none placeholder:text-gray-600 focus:border-[#3ce8e2]"
                />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-600">
                  <span className="min-w-0 flex-1 truncate">{locale === 'zh' ? currentChatMode.hintZh : currentChatMode.hintEn}</span>
                  <div className="flex shrink-0 items-center gap-2">
                    <label className="text-xs font-bold text-gray-500">{t.mode}</label>
                    <select
                      value={chatMode}
                      onChange={(event) => setChatMode(event.target.value as ChatMode)}
                      className="rounded-md border border-gray-800 bg-[#101010] px-2 py-2 text-xs font-bold text-gray-200 outline-none focus:border-[#3ce8e2]"
                    >
                      {chatModes.map((mode) => (
                        <option key={mode.id} value={mode.id}>{locale === 'zh' ? mode.zh : mode.en}</option>
                      ))}
                    </select>
                    <button type="submit" disabled={!chatInput.trim() || chatSending || arenaSyncing} className="min-w-[96px] shrink-0 rounded-md bg-[#3ce8e2] px-4 py-2 text-sm font-black text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">{t.chatSend}</button>
                  </div>
                </div>
              </form>
            </div>
          </aside>
          )}
        </div>
      </div>
    </main>
  )
}
