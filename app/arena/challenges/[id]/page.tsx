'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'
import { AgentWhiteboard } from '@/components/arena/agent-whiteboard'
import type { ArenaSessionState, ArenaTeachingIntent, ArenaUserProfile, Challenge, LeaderboardEntry, Submission } from '@/lib/arena/types'
import { extractWhiteboardPayload, makeInterviewWhiteboardOps, makeWhiteboardPrompt, stripWhiteboardPayload, type WhiteboardOp } from '@/lib/arena/whiteboard'

const Editor = dynamic(() => import('@monaco-editor/react'), { ssr: false })

type Locale = 'zh' | 'en'
type Language = 'python' | 'cpp' | 'c'
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
  promptZh: (title: string) => string
  promptEn: (title: string) => string
}

const coachActions: CoachAction[] = [
  {
    intent: 'ask_hint',
    zh: '提示',
    en: 'Hint',
    promptZh: (title) => `我正在做「${title}」。请不要直接给标准答案，先用苏格拉底式问题给我一个下一步提示。`,
    promptEn: (title) => `I am working on "${title}". Do not give the final answer; ask one Socratic question that gives me the next hint.`,
  },
  {
    intent: 'explain',
    zh: '讲答案',
    en: 'Explain',
    promptZh: (title) => `请完整讲解「${title}」的面试答案结构：目标、架构/推导、trade-off、指标和失败场景。`,
    promptEn: (title) => `Explain a complete interview answer for "${title}": goal, architecture/derivation, trade-offs, metrics, and failure modes.`,
  },
  {
    intent: 'debug',
    zh: 'Debug',
    en: 'Debug',
    promptZh: (title) => `请 debug 我对「${title}」的当前答案或代码，指出最可能的问题和一个最小修正方向。`,
    promptEn: (title) => `Debug my current answer or code for "${title}". Identify the most likely issue and one minimal correction.`,
  },
  {
    intent: 'follow_up',
    zh: '追问',
    en: 'Follow-up',
    promptZh: (title) => `请作为面试官，围绕「${title}」提出一个真实追问。先不要给答案，等我回答。`,
    promptEn: (title) => `Act as the interviewer for "${title}" and ask one realistic follow-up. Do not answer it yet.`,
  },
  {
    intent: 'concept',
    zh: '补课',
    en: 'Concept',
    promptZh: (title) => `请判断「${title}」里我最需要补的一个知识点，简短讲清楚后给我一个小检查问题。`,
    promptEn: (title) => `Pick the one prerequisite concept I most need for "${title}", teach it briefly, then ask a quick check question.`,
  },
  {
    intent: 'recommend_next',
    zh: '类题迁移',
    en: 'Transfer',
    promptZh: (title) => `基于「${title}」和我的当前状态，请推荐下一道练习题或迁移方向，并说明为什么。`,
    promptEn: (title) => `Based on "${title}" and my current state, recommend the next practice problem or transfer direction and explain why.`,
  },
]

const copy = {
  zh: {
    challenges: '题库', playground: '训练场', discuss: '讨论', runner: 'Agent Runner 执行', description: '题目', submissions: '提交', leaderboard: '排行榜',
    function: '函数', timeLimit: '时间限制', memory: '内存', examples: '样例', input: '输入', expected: '期望输出',
    language: '语言', run: '交给 Agent 运行并提交', judging: 'Agent 运行中...', console: '运行结果', notSubmitted: '未提交', hidden: '隐藏测试已脱敏',
    noSubmission: '提交后会在这里看到真实 Agent/Runner 判题结果。历史提交会持久化到 WTT 后端。', firstAc: '暂无 AC 记录，拿下首个榜单位置。',
    agentTitle: 'Agent 对话', agentRole: '固定使用 Codex Arena Coach：agent-16a45cf0dd8b。所有登录用户都可使用，不需要 claim 该 Agent。',
    agentWaiting: '直接在下面和 Agent 对话。', openFull: '打开完整提交 →',
    chatTitle: 'Arena Coach', chatIntro: '真实 WTT Agent 会话；Agent 会读取 Arena 题库长期记忆和当前题目上下文。', chatPlaceholder: '问 Agent：这题怎么入手？为什么 WA？', chatSend: '发送', chatThinking: 'Agent 思考中...', chatFallback: 'Agent 暂时没有返回，请稍后再试。', chatLogin: '登录后可对话。', chatSyncing: '正在连接固定 Arena Agent...',
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

function topicMessagesToChat(messages: TopicMessage[], agentId: string): ChatMessage[] {
  return (messages || [])
    .filter((message) => {
      const semantic = String(message.semantic_type || '').toLowerCase()
      const content = String(message.content || '')
      if (semantic === 'system') return false
      if (content.includes('[system:p2p_init]')) return false
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
  const [chatSending, setChatSending] = useState(false)
  const [arenaTopicByKey, setArenaTopicByKey] = useState<Record<string, string>>({})
  const [arenaSessionState, setArenaSessionState] = useState<ArenaSessionState | null>(null)
  const [arenaProfile, setArenaProfile] = useState<ArenaUserProfile | null>(null)
  const [arenaSyncing, setArenaSyncing] = useState(false)
  const [activeTab, setActiveTab] = useState<'description' | 'submissions' | 'leaderboard'>('description')
  const [whiteboardOps, setWhiteboardOps] = useState<WhiteboardOp[]>([])
  const [whiteboardRenderMode, setWhiteboardRenderMode] = useState<'full' | 'step'>('full')
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
    window.localStorage.setItem(`wtt-arena-topic:${arenaSessionKey}`, topicId)
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
    if (!topicId || !session?.accessToken) return [] as ChatMessage[]
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
      const isAgent = senderType === 'AGENT' || senderId === ARENA_AGENT_ID
      const messageId = row.id || row.message_id || `${row.timestamp || row.created_at || ''}:${String(row.content || '').length}`
      if (!isAgent || appliedWhiteboardMessageIdsRef.current.has(messageId)) continue
      const payload = extractWhiteboardPayload(stripSourceBlock(String(row.content || '')))
      if (payload?.ops?.length) {
        appliedWhiteboardMessageIdsRef.current.add(messageId)
        setWhiteboardRenderMode('step')
        setWhiteboardOps(payload.ops)
        break
      }
    }
    setChatMessages(mapped)
    return mapped
  }


  useEffect(() => {
    setChatMessages([])
    setArenaSessionState(null)
    setArenaProfile(null)
    appliedWhiteboardMessageIdsRef.current.clear()
    if (!arenaSessionKey) return
    const cached = window.localStorage.getItem(`wtt-arena-topic:${arenaSessionKey}`)
    if (cached) setArenaTopicByKey((prev) => ({ ...prev, [arenaSessionKey]: cached }))
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
    const cached = window.localStorage.getItem(`wtt-arena-topic:${arenaSessionKey}`)
    if (cached) {
      rememberArenaTopic(cached)
      return cached
    }
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

  async function publishArenaFallback(topicId: string, userMessage: string, intent?: ArenaTeachingIntent) {
    if (!challenge) throw new Error('missing challenge')
    const content = `${arenaChallengeContext(challenge, locale, language, code)}\n\n${intent ? `teaching_intent: ${intent}\n` : ''}${userMessage}`
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
          intent,
        }),
      })
      if (!response.ok) {
        if (!isLocalArenaChallenge(challenge)) throw new Error(await responseError(response, 'failed to send Arena chat'))
        await publishArenaFallback(topicId, message, intent)
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
    setWhiteboardRenderMode('step')
    const fallbackOps = makeInterviewWhiteboardOps(challenge, locale)
    setWhiteboardOps(fallbackOps)
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
    const message = locale === 'zh' ? action.promptZh(challenge.title) : action.promptEn(challenge.title)
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
            <div className="grid min-h-0 gap-3 lg:grid-rows-[auto_1fr]">
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
              <AgentWhiteboard
                challengeId={challenge.id}
                locale={locale}
                ops={whiteboardOps}
                renderMode={whiteboardRenderMode}
                busy={whiteboardBusy || chatSending || arenaSyncing}
                onExplain={() => requestWhiteboardExplain(false)}
                onStep={() => requestWhiteboardExplain(true)}
              />
            </div>
          )}

          <aside className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-gray-800 bg-[#1e1e1e] p-5 lg:col-span-2 xl:col-span-1">
            <div className="rounded-lg border border-[#3ce8e2]/20 bg-[#3ce8e2]/5 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#3ce8e2]">Agent</p>
              <h2 className="mt-2 text-xl font-black text-white">{t.agentTitle}</h2>
              <p className="mt-3 text-sm leading-6 text-[#bffffd]">{t.agentRole}</p>
            </div>
            <div className="mt-4 rounded-lg border border-gray-800 bg-[#151515] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-300">{t.coachFlow}</p>
                  <p className="mt-1 text-sm text-gray-400">
                    {t.stage}: <span className="font-bold text-white">{stageLabel(arenaSessionState?.stage, locale)}</span>
                    {arenaSessionState ? ` · hint ${arenaSessionState.hint_level}` : ''}
                  </p>
                </div>
                <div className="text-right text-xs text-gray-500">
                  <p>{t.mastery}</p>
                  <p className="font-mono text-[#3ce8e2]">{Math.round((arenaSessionState?.mastery_estimate || 0) * 100)}%</p>
                </div>
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
              {(arenaProfile?.weak_concepts?.length || arenaProfile?.recommended_next_challenges?.length) ? (
                <div className="mt-4 grid gap-3 text-xs text-gray-500 sm:grid-cols-2 xl:grid-cols-1">
                  {!!arenaProfile?.weak_concepts?.length && (
                    <div>
                      <p className="font-bold text-gray-300">{t.weak}</p>
                      <p className="mt-1 leading-5">{arenaProfile.weak_concepts.slice(0, 4).join(' · ')}</p>
                    </div>
                  )}
                  {!!arenaProfile?.recommended_next_challenges?.length && (
                    <div>
                      <p className="font-bold text-gray-300">{t.next}</p>
                      <p className="mt-1 leading-5">{arenaProfile.recommended_next_challenges.slice(0, 3).join(' · ')}</p>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
            <div className="mt-4 flex min-h-[520px] flex-1 flex-col overflow-hidden rounded-lg border border-gray-800 bg-[#151515]">
              <div className="border-b border-gray-800 px-4 py-3">
                <h3 className="text-sm font-black text-white">{t.chatTitle}</h3>
                <p className="mt-1 text-xs leading-5 text-gray-500">{t.chatIntro}</p>
              </div>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                {chatMessages.length === 0 && (
                  <div className="rounded-lg border border-dashed border-gray-800 bg-[#101010] p-3 text-xs leading-5 text-gray-500">{t.chatIntro}</div>
                )}
                {chatMessages.map((message, index) => (
                  <div key={`${message.createdAt}-${index}`} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-6 ${message.role === 'user' ? 'bg-[#3ce8e2] text-black' : 'border border-gray-800 bg-[#202020] text-gray-300'}`}>
                      {message.content}
                    </div>
                  </div>
                ))}
                {arenaSyncing && <p className="text-xs text-[#3ce8e2]">{t.chatSyncing}</p>}
                {chatSending && <p className="text-xs text-gray-500">{t.chatThinking}</p>}
              </div>
              <form onSubmit={(event) => { event.preventDefault(); sendAgentChat() }} className="border-t border-gray-800 p-3">
                <textarea value={chatInput} onChange={(event) => setChatInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) sendAgentChat() }} placeholder={t.chatPlaceholder} rows={4} className="w-full resize-none rounded-md border border-gray-800 bg-[#101010] p-3 text-sm text-gray-200 outline-none placeholder:text-gray-600 focus:border-[#3ce8e2]" />
                <div className="mt-2 flex items-center justify-between gap-3 text-xs text-gray-600">
                  <span>{session?.accessToken ? `Agent: ${ARENA_AGENT_ID}` : t.chatLogin}</span>
                  <button type="submit" disabled={!chatInput.trim() || chatSending || arenaSyncing} className="rounded-md bg-[#3ce8e2] px-3 py-1.5 font-black text-black disabled:cursor-not-allowed disabled:opacity-40">{t.chatSend}</button>
                </div>
              </form>
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}
