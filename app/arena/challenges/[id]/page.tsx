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
  if (status === 'accepted') return 'border-emerald-300 bg-emerald-50 text-emerald-700'
  if (!status || status === 'pending' || status === 'judging') return 'border-slate-300 bg-slate-50 text-slate-600'
  if (status === 'system_error') return 'border-amber-300 bg-amber-50 text-amber-700'
  return 'border-red-300 bg-red-50 text-red-700'
}

export default function ArenaChallengePage({ params }: { params: { id: string } }) {
  const [payload, setPayload] = useState<ChallengePayload | null>(null)
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [tutorMessage, setTutorMessage] = useState('')

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
    return <main className="min-h-screen bg-slate-950 p-8 text-white">Loading Arena...</main>
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-5">
        <div className="mb-4 flex items-center justify-between">
          <Link href="/arena" className="text-sm text-indigo-300 hover:text-indigo-100">← Arena</Link>
          <div className="text-xs text-slate-500">MVP: Python · Judge0/local-dev · Hidden tests redacted</div>
        </div>
        <div className="grid gap-4 lg:grid-cols-[0.95fr_1.15fr_0.9fr]">
          <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-2xl font-black">{challenge.title}</h1>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">{challenge.difficulty}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {challenge.tags.map((tag) => <span key={tag} className="rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-300">#{tag}</span>)}
            </div>
            <pre className="mt-5 whitespace-pre-wrap rounded-xl bg-slate-900/80 p-4 text-sm leading-6 text-slate-200">{challenge.description}</pre>
            <div className="mt-5 space-y-3">
              <h2 className="font-bold">公开样例</h2>
              {payload.public_cases.map((testCase, index) => (
                <div key={testCase.id} className="rounded-xl border border-white/10 bg-slate-900/60 p-3 text-xs">
                  <p className="font-semibold text-slate-300">Sample {index + 1}</p>
                  <p className="mt-2 text-slate-400">Input</p>
                  <code className="mt-1 block break-all text-slate-200">{testCase.input}</code>
                  <p className="mt-2 text-slate-400">Expected</p>
                  <code className="mt-1 block text-slate-200">{testCase.expected_output}</code>
                </div>
              ))}
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div>
                <p className="text-sm font-bold">Python Editor</p>
                <p className="text-xs text-slate-500">实现 two_sum(nums, target)</p>
              </div>
              <button
                onClick={submitCode}
                disabled={submitting}
                className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? 'Judging...' : '提交运行'}
              </button>
            </div>
            <div className="h-[470px]">
              <Editor
                language="python"
                theme="vs-dark"
                value={code}
                onChange={(value) => setCode(value || '')}
                options={{ fontSize: 14, minimap: { enabled: false }, scrollBeyondLastLine: false, wordWrap: 'on' }}
              />
            </div>
            <div className="border-t border-white/10 p-4">
              <div className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${statusTone(submission?.status)}`}>
                {submission?.status || 'not_submitted'} · score {submission?.score ?? 0}
              </div>
              {submission && (
                <div className="mt-3 space-y-2 text-sm">
                  <p className="text-slate-400">{passedCount}/{submission.results.length} executed tests accepted · provider: {submission.judge_provider}</p>
                  {submission.results.map((result, index) => (
                    <div key={result.id} className="rounded-lg bg-slate-900/70 p-3 text-xs">
                      <div className="flex items-center justify-between">
                        <span>{result.is_hidden ? `Hidden #${index + 1}` : `Public #${index + 1}`}</span>
                        <span className={result.status === 'accepted' ? 'text-emerald-300' : 'text-red-300'}>{result.status}</span>
                      </div>
                      {!result.is_hidden && result.stdout && <pre className="mt-2 whitespace-pre-wrap text-slate-400">stdout: {result.stdout}</pre>}
                      {!result.is_hidden && result.stderr && <pre className="mt-2 whitespace-pre-wrap text-red-300">stderr: {result.stderr}</pre>}
                      {result.error_message && <p className="mt-2 text-amber-300">{result.error_message}</p>}
                    </div>
                  ))}
                  <Link href={`/arena/submissions/${submission.id}`} className="inline-flex text-xs font-semibold text-indigo-300 hover:text-indigo-100">查看提交详情 →</Link>
                </div>
              )}
            </div>
          </section>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <h2 className="text-lg font-black">Agent Tutor</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">Agent 负责提示、Debug、复盘；不作为最终判题器，也不泄露隐藏测试。</p>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <button onClick={() => askTutor('hint')} disabled={!submission} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold hover:bg-slate-700 disabled:opacity-40">Hint</button>
                <button onClick={() => askTutor('debug')} disabled={!submission} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold hover:bg-slate-700 disabled:opacity-40">Debug</button>
                <button onClick={() => askTutor('review')} disabled={!submission} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold hover:bg-slate-700 disabled:opacity-40">Review</button>
              </div>
              {tutorMessage && <div className="mt-4 rounded-xl border border-indigo-300/20 bg-indigo-500/10 p-3 text-sm leading-6 text-indigo-100">{tutorMessage}</div>}
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <h2 className="text-lg font-black">Leaderboard</h2>
              <div className="mt-3 space-y-2">
                {leaderboard.length === 0 && <p className="text-sm text-slate-500">暂无 AC 记录，拿下首个榜单位置。</p>}
                {leaderboard.map((entry, index) => (
                  <div key={`${entry.user_id}-${entry.best_submission_id}`} className="rounded-xl bg-slate-900/70 p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-bold">#{index + 1} {entry.user_id}</span>
                      <span className="text-emerald-300">AC</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">submits {entry.submission_count} · {entry.best_runtime_ms || '-'}ms · hint {entry.hint_count}</p>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  )
}
