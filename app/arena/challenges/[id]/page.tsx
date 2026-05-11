'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import type { Challenge, LeaderboardEntry, Submission } from '@/lib/arena/types'

const Editor = dynamic(() => import('@monaco-editor/react'), { ssr: false })

type Locale = 'zh' | 'en'
type Language = 'python' | 'cpp' | 'c'
type ChatMessage = { role: 'user' | 'agent'; content: string; createdAt: string }

type ChallengePayload = {
  challenge: Challenge
  public_cases: Array<{ id: string; input: string; expected_output: string; explanation?: string }>
  submissions: Array<Omit<Submission, 'code' | 'results'>>
}

const copy = {
  zh: {
    challenges: '题库', playground: '训练场', discuss: '讨论', runner: 'Agent Runner 执行', description: '题目', submissions: '提交', leaderboard: '排行榜',
    function: '函数', timeLimit: '时间限制', memory: '内存', examples: '样例', input: '输入', expected: '期望输出',
    language: '语言', run: '交给 Agent 运行并提交', judging: 'Agent 运行中...', console: '运行结果', notSubmitted: '未提交', hidden: '隐藏测试已脱敏',
    noSubmission: '提交后会在这里看到真实 Agent/Runner 判题结果。历史提交会持久化到 WTT 后端。', firstAc: '暂无 AC 记录，拿下首个榜单位置。',
    agentTitle: 'Agent 执行与辅导', agentRole: 'Run & Submit 会把你的代码交给远程 Agent/Runner 编译、运行、比对公开/隐藏测试，再把 verdict 回写到 WTT。Tutor 只做提示、Debug、复盘，不泄露隐藏测试。',
    hint: '提示', debug: '调试', review: '复盘', agentWaiting: '先提交一次，Agent 会在这里解释结果。', openFull: '打开完整提交 →',
    chatTitle: 'Agent 对话', chatIntro: '可以直接问思路、边界条件、报错原因、复杂度或代码契约。', chatPlaceholder: '问 Agent：这题怎么入手？为什么 WA？', chatSend: '发送', chatThinking: 'Agent 思考中...', chatFallback: 'Agent 暂时没有返回，请稍后再试。',
    aiDesc: 'AI Kernel / CPU-sim 题。请实现指定函数，返回样例要求的 JSON 值。当前由远程 Agent/Runner 在 CPU 上模拟 CUDA/OpenCL 风格算子；后续同一题目契约可切换到真实硬件 runner。',
  },
  en: {
    challenges: 'Challenges', playground: 'Playground', discuss: 'Discuss', runner: 'Agent Runner', description: 'Description', submissions: 'Submissions', leaderboard: 'Leaderboard',
    function: 'Function', timeLimit: 'Time Limit', memory: 'Memory', examples: 'Examples', input: 'Input', expected: 'Expected',
    language: 'Language', run: 'Run & Submit via Agent', judging: 'Agent running...', console: 'Console', notSubmitted: 'not_submitted', hidden: 'Hidden tests are redacted.',
    noSubmission: 'Submit once to see the real Agent/Runner verdict. Submissions are persisted in the WTT backend.', firstAc: 'No accepted run yet. Take the first spot.',
    agentTitle: 'Agent Execution & Tutor', agentRole: 'Run & Submit sends your code to a remote Agent/Runner, which compiles, executes, checks public/hidden tests, and writes the verdict back to WTT. Tutor gives hints/debug/review without leaking hidden tests.',
    hint: 'Hint', debug: 'Debug', review: 'Review', agentWaiting: 'Submit once and the Agent will explain the result here.', openFull: 'Open full submission →',
    chatTitle: 'Agent Chat', chatIntro: 'Ask about approach, edge cases, errors, complexity, or the code contract.', chatPlaceholder: 'Ask Agent: how should I start? why WA?', chatSend: 'Send', chatThinking: 'Agent is thinking...', chatFallback: 'Agent did not respond. Please try again.',
    aiDesc: 'AI Kernel / CPU-sim challenge. Implement the target function and return the exact JSON value requested by the examples. The remote Agent/Runner currently simulates CUDA/OpenCL-style kernels on CPU; the same contract can later route to real hardware.',
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
  if (challenge.category === 'ai-kernel') return `${copy[locale].aiDesc}\n\n${locale === 'zh' ? '函数' : 'Function'}: ${challenge.function_name}(${challenge.input_keys.join(', ')})`
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

export default function ArenaChallengePage({ params }: { params: { id: string } }) {
  const [payload, setPayload] = useState<ChallengePayload | null>(null)
  const [locale, setLocale] = useState<Locale>('zh')
  const [language, setLanguage] = useState<Language>('python')
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [tutorMessage, setTutorMessage] = useState('')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const [activeTab, setActiveTab] = useState<'description' | 'submissions' | 'leaderboard'>('description')

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

  const t = copy[locale]
  const challenge = payload?.challenge
  const passedCount = useMemo(() => submission?.results.filter((result) => result.status === 'accepted').length || 0, [submission])

  function changeLanguage(next: Language) {
    setLanguage(next)
    if (challenge) setCode(starterFor(challenge, next))
  }

  async function submitCode() {
    if (!challenge || submitting) return
    setSubmitting(true)
    setTutorMessage('')
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

  async function askTutor(mode: 'hint' | 'debug' | 'review') {
    if (!submission) return
    const response = await fetch(`/api/arena/submissions/${submission.id}/tutor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    })
    const data = await response.json()
    setTutorMessage(data.tutor?.message || '')
  }

  async function sendAgentChat() {
    const message = chatInput.trim()
    if (!challenge || !message || chatSending) return
    const nextMessages: ChatMessage[] = [...chatMessages, { role: 'user', content: message, createdAt: new Date().toISOString() }]
    setChatMessages(nextMessages)
    setChatInput('')
    setChatSending(true)
    try {
      const response = await fetch(`/api/arena/challenges/${challenge.id}/agent-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          messages: nextMessages.slice(-8),
          locale,
          language,
          code,
          submission_id: submission?.id,
        }),
      })
      const data = await response.json()
      setChatMessages([...nextMessages, { role: 'agent', content: data.agent?.message || t.chatFallback, createdAt: new Date().toISOString() }])
    } catch {
      setChatMessages([...nextMessages, { role: 'agent', content: t.chatFallback, createdAt: new Date().toISOString() }])
    } finally {
      setChatSending(false)
    }
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

        <div className="grid min-h-0 flex-1 gap-3 p-3 xl:grid-cols-[38%_1fr_320px] lg:grid-cols-[42%_58%]">
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

                  <pre className="mt-6 whitespace-pre-wrap rounded-lg border border-gray-800 bg-[#151515] p-5 text-sm leading-7 text-gray-300">{localizedDescription(challenge, locale)}</pre>

                  <div className="mt-6 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border border-gray-800 bg-[#202020] p-4"><p className="text-xs text-gray-500">{t.function}</p><p className="mt-1 font-mono text-sm text-[#3ce8e2]">{challenge.function_name}</p></div>
                    <div className="rounded-lg border border-gray-800 bg-[#202020] p-4"><p className="text-xs text-gray-500">{t.timeLimit}</p><p className="mt-1 font-bold">{challenge.time_limit_ms}ms</p></div>
                    <div className="rounded-lg border border-gray-800 bg-[#202020] p-4"><p className="text-xs text-gray-500">{t.memory}</p><p className="mt-1 font-bold">{challenge.memory_limit_mb}MB</p></div>
                  </div>

                  <div className="mt-7 space-y-4">
                    <h2 className="text-lg font-bold text-white">{t.examples}</h2>
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
                <Editor language={editorLanguage(language)} theme="vs-dark" value={code} onChange={(value) => setCode(value || '')} options={{ fontSize: 14, minimap: { enabled: false }, scrollBeyondLastLine: false, wordWrap: 'on', padding: { top: 16 } }} />
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

          <aside className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-gray-800 bg-[#1e1e1e] p-5 lg:col-span-2 xl:col-span-1">
            <div className="rounded-lg border border-[#3ce8e2]/20 bg-[#3ce8e2]/5 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#3ce8e2]">Agent</p>
              <h2 className="mt-2 text-xl font-black text-white">{t.agentTitle}</h2>
              <p className="mt-3 text-sm leading-6 text-[#bffffd]">{t.agentRole}</p>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <button onClick={() => askTutor('hint')} disabled={!submission} className="rounded-md bg-[#252525] px-3 py-2 text-xs font-bold text-gray-300 transition-colors hover:text-[#3ce8e2] disabled:opacity-40">{t.hint}</button>
              <button onClick={() => askTutor('debug')} disabled={!submission} className="rounded-md bg-[#252525] px-3 py-2 text-xs font-bold text-gray-300 transition-colors hover:text-[#3ce8e2] disabled:opacity-40">{t.debug}</button>
              <button onClick={() => askTutor('review')} disabled={!submission} className="rounded-md bg-[#252525] px-3 py-2 text-xs font-bold text-gray-300 transition-colors hover:text-[#3ce8e2] disabled:opacity-40">{t.review}</button>
            </div>
            <div className="mt-4 rounded-lg border border-gray-800 bg-[#151515] p-4 text-sm leading-6 text-gray-400">
              {tutorMessage || (submission ? `${submission.status} · ${submission.judge_output_summary || ''}` : t.agentWaiting)}
            </div>
            <div className="mt-4 flex min-h-[320px] flex-1 flex-col overflow-hidden rounded-lg border border-gray-800 bg-[#151515]">
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
                    <div className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-6 ${message.role === 'user' ? 'bg-[#3ce8e2] text-black' : 'border border-gray-800 bg-[#202020] text-gray-300'}`}>
                      {message.content}
                    </div>
                  </div>
                ))}
                {chatSending && <p className="text-xs text-gray-500">{t.chatThinking}</p>}
              </div>
              <form onSubmit={(event) => { event.preventDefault(); sendAgentChat() }} className="border-t border-gray-800 p-3">
                <textarea value={chatInput} onChange={(event) => setChatInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) sendAgentChat() }} placeholder={t.chatPlaceholder} rows={3} className="w-full resize-none rounded-md border border-gray-800 bg-[#101010] p-3 text-sm text-gray-200 outline-none placeholder:text-gray-600 focus:border-[#3ce8e2]" />
                <div className="mt-2 flex items-center justify-between gap-3 text-xs text-gray-600">
                  <span>{locale === 'zh' ? '⌘/Ctrl + Enter 快速发送' : '⌘/Ctrl + Enter to send'}</span>
                  <button type="submit" disabled={!chatInput.trim() || chatSending} className="rounded-md bg-[#3ce8e2] px-3 py-1.5 font-black text-black disabled:cursor-not-allowed disabled:opacity-40">{t.chatSend}</button>
                </div>
              </form>
            </div>
            {submission?.results?.length ? (
              <div className="mt-4 space-y-2">
                {submission.results.map((result, index) => <div key={result.id} className="rounded-md border border-gray-800 bg-[#151515] p-3 text-xs"><div className="flex justify-between"><span>{result.is_hidden ? `Hidden #${index + 1}` : `Public #${index + 1}`}</span><span className={result.status === 'accepted' ? 'text-emerald-300' : 'text-rose-300'}>{result.status}</span></div></div>)}
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </main>
  )
}
