'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import type { Challenge, LeaderboardEntry, Submission } from '@/lib/arena/types'

const Editor = dynamic(() => import('@monaco-editor/react'), { ssr: false })

type ChallengePayload = {
  challenge: Challenge
  public_cases: Array<{ id: string; input: string; expected_output: string; explanation?: string }>
  submissions: Array<Omit<Submission, 'code' | 'results'>>
}

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

export default function ArenaChallengePage({ params }: { params: { id: string } }) {
  const [payload, setPayload] = useState<ChallengePayload | null>(null)
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [tutorMessage, setTutorMessage] = useState('')
  const [activeTab, setActiveTab] = useState<'description' | 'submissions' | 'leaderboard'>('description')

  useEffect(() => {
    let alive = true
    fetch(`/api/arena/challenges/${params.id}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data: ChallengePayload) => {
        if (!alive) return
        setPayload(data)
        setCode(data.challenge.starter_code)
      })
      .catch(() => undefined)
    fetch(`/api/arena/challenges/${params.id}/leaderboard`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data: { leaderboard: LeaderboardEntry[] }) => alive && setLeaderboard(data.leaderboard || []))
      .catch(() => undefined)
    return () => { alive = false }
  }, [params.id])

  const challenge = payload?.challenge
  const passedCount = useMemo(() => submission?.results.filter((result) => result.status === 'accepted').length || 0, [submission])

  async function submitCode() {
    if (!challenge || submitting) return
    setSubmitting(true)
    setTutorMessage('')
    try {
      const response = await fetch(`/api/arena/challenges/${challenge.id}/submissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: 'python', code, user_id: 'demo-user' }),
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
              <Link href="/arena" className="hover:text-[#3ce8e2]">Challenges</Link>
              <span>Playground</span>
              <span>Discuss</span>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className="rounded-full border border-[#3ce8e2]/20 bg-[#3ce8e2]/5 px-3 py-1 text-[#3ce8e2]">Python MVP</span>
            <span>Judge0 / Local Dev</span>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden p-3">
          <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[42%_58%]">
            <section className="min-h-0 overflow-hidden rounded-lg border border-gray-800 bg-[#1e1e1e]">
              <div className="flex items-center gap-2 overflow-x-auto border-b border-gray-800 bg-[#191919] px-4 py-3 text-sm">
                {[
                  ['description', 'Description'],
                  ['submissions', 'Submissions'],
                  ['leaderboard', 'Leaderboard'],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id as typeof activeTab)}
                    className={`rounded-md px-3 py-1.5 font-medium transition-colors ${activeTab === id ? 'bg-[#3ce8e2]/10 text-[#3ce8e2]' : 'text-gray-500 hover:bg-[#252525] hover:text-gray-300'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="h-full overflow-y-auto p-5 pb-24">
                {activeTab === 'description' && (
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h1 className="text-3xl font-black tracking-tight text-white">{challenge.title}</h1>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${difficultyTone(challenge.difficulty)}`}>{formatDifficulty(challenge.difficulty)}</span>
                          {challenge.tags.map((tag) => <span key={tag} className="rounded-full border border-gray-800 bg-[#151515] px-2.5 py-1 text-xs text-gray-400">{tag}</span>)}
                        </div>
                      </div>
                    </div>

                    <pre className="mt-6 whitespace-pre-wrap rounded-lg border border-gray-800 bg-[#151515] p-5 text-sm leading-7 text-gray-300">{challenge.description}</pre>

                    <div className="mt-6 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-lg border border-gray-800 bg-[#202020] p-4"><p className="text-xs text-gray-500">Function</p><p className="mt-1 font-mono text-sm text-[#3ce8e2]">{challenge.function_name}</p></div>
                      <div className="rounded-lg border border-gray-800 bg-[#202020] p-4"><p className="text-xs text-gray-500">Time Limit</p><p className="mt-1 font-bold">{challenge.time_limit_ms}ms</p></div>
                      <div className="rounded-lg border border-gray-800 bg-[#202020] p-4"><p className="text-xs text-gray-500">Memory</p><p className="mt-1 font-bold">{challenge.memory_limit_mb}MB</p></div>
                    </div>

                    <div className="mt-7 space-y-4">
                      <h2 className="text-lg font-bold text-white">Examples</h2>
                      {payload.public_cases.map((testCase, index) => (
                        <div key={testCase.id} className="rounded-lg border border-gray-800 bg-[#151515] p-4 text-sm">
                          <p className="font-semibold text-gray-300">Example {index + 1}</p>
                          <p className="mt-3 text-xs uppercase tracking-wider text-gray-500">Input</p>
                          <code className="mt-1 block break-all rounded bg-black/30 p-3 text-gray-200">{testCase.input}</code>
                          <p className="mt-3 text-xs uppercase tracking-wider text-gray-500">Expected</p>
                          <code className="mt-1 block rounded bg-black/30 p-3 text-gray-200">{testCase.expected_output}</code>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'submissions' && (
                  <div className="space-y-3">
                    {!submission && <p className="text-sm text-gray-500">提交后会在这里看到真实判题结果。历史提交也会持久化到 WTT 后端。</p>}
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
                        <Link href={`/arena/submissions/${submission.id}`} className="inline-flex text-sm font-semibold text-[#3ce8e2] hover:underline">Open full submission →</Link>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'leaderboard' && (
                  <div className="space-y-3">
                    {leaderboard.length === 0 && <p className="text-sm text-gray-500">暂无 AC 记录，拿下首个榜单位置。</p>}
                    {leaderboard.map((entry, index) => (
                      <div key={`${entry.user_id}-${entry.best_submission_id}`} className="flex items-center justify-between rounded-lg border border-gray-800 bg-[#151515] p-4">
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#252525] text-sm font-black text-[#3ce8e2]">#{index + 1}</span>
                          <div>
                            <p className="font-bold text-white">{entry.user_id}</p>
                            <p className="text-xs text-gray-500">submits {entry.submission_count} · hint {entry.hint_count}</p>
                          </div>
                        </div>
                        <div className="text-right text-sm">
                          <p className="font-bold text-emerald-300">AC</p>
                          <p className="text-xs text-gray-500">{entry.best_runtime_ms || '-'}ms</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className="grid min-h-0 gap-3 lg:grid-rows-[1fr_270px]">
              <div className="min-h-0 overflow-hidden rounded-lg border border-gray-800 bg-[#1e1e1e]">
                <div className="flex items-center justify-between border-b border-gray-800 bg-[#191919] px-4 py-3">
                  <div>
                    <p className="text-sm font-bold text-white">main.py</p>
                    <p className="text-xs text-gray-500">Implement {challenge.function_name}({challenge.input_keys.join(', ')})</p>
                  </div>
                  <button
                    onClick={submitCode}
                    disabled={submitting}
                    className="rounded-md bg-gradient-to-r from-[#2ee6e3] to-[#00b3b3] px-5 py-2 text-sm font-black text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submitting ? 'Judging...' : 'Run & Submit'}
                  </button>
                </div>
                <div className="h-[calc(100%-57px)] min-h-[360px]">
                  <Editor
                    language="python"
                    theme="vs-dark"
                    value={code}
                    onChange={(value) => setCode(value || '')}
                    options={{ fontSize: 14, minimap: { enabled: false }, scrollBeyondLastLine: false, wordWrap: 'on', padding: { top: 16 } }}
                  />
                </div>
              </div>

              <div className="grid min-h-0 gap-3 md:grid-cols-[1fr_1fr]">
                <section className="overflow-y-auto rounded-lg border border-gray-800 bg-[#1e1e1e] p-4">
                  <div className="flex items-center justify-between">
                    <h2 className="font-bold text-white">Console</h2>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusTone(submission?.status)}`}>{submission?.status || 'not_submitted'}</span>
                  </div>
                  {submission ? (
                    <div className="mt-4 space-y-2 text-sm text-gray-400">
                      <p>score: <span className="text-white">{submission.score}</span></p>
                      <p>runtime: <span className="text-white">{submission.runtime_ms || '-'}ms</span></p>
                      <p>provider: <span className="text-white">{submission.judge_provider}</span></p>
                      <p className="text-gray-500">Hidden tests are redacted.</p>
                    </div>
                  ) : <p className="mt-4 text-sm text-gray-500">点击 Run & Submit 后查看结果。</p>}
                </section>

                <section className="overflow-y-auto rounded-lg border border-gray-800 bg-[#1e1e1e] p-4">
                  <h2 className="font-bold text-white">Agent Tutor</h2>
                  <p className="mt-2 text-sm leading-6 text-gray-500">提示、Debug、复盘；不做最终判题。</p>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <button onClick={() => askTutor('hint')} disabled={!submission} className="rounded-md bg-[#252525] px-3 py-2 text-xs font-bold text-gray-300 transition-colors hover:text-[#3ce8e2] disabled:opacity-40">Hint</button>
                    <button onClick={() => askTutor('debug')} disabled={!submission} className="rounded-md bg-[#252525] px-3 py-2 text-xs font-bold text-gray-300 transition-colors hover:text-[#3ce8e2] disabled:opacity-40">Debug</button>
                    <button onClick={() => askTutor('review')} disabled={!submission} className="rounded-md bg-[#252525] px-3 py-2 text-xs font-bold text-gray-300 transition-colors hover:text-[#3ce8e2] disabled:opacity-40">Review</button>
                  </div>
                  {tutorMessage && <div className="mt-4 rounded-md border border-[#3ce8e2]/20 bg-[#3ce8e2]/5 p-3 text-sm leading-6 text-[#bffffd]">{tutorMessage}</div>}
                </section>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  )
}
