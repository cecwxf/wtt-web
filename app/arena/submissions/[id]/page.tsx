'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArenaNav } from '@/components/arena/arena-nav'
import type { Submission } from '@/lib/arena/types'

function statusTone(status: string) {
  if (status === 'accepted') return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
  if (status === 'system_error') return 'border-yellow-400/20 bg-yellow-400/10 text-yellow-300'
  return 'border-rose-400/20 bg-rose-400/10 text-rose-300'
}

function displayStdout(stdout?: string) {
  const text = (stdout || '').trim()
  const pattern = /(?:^|\n)\s*output\s*=\s*([^\n]+)\s*/g
  let output = ''
  let match: RegExpExecArray | null = pattern.exec(text)
  while (match) {
    output = match[1]
    match = pattern.exec(text)
  }
  return (output || text).trim()
}

export default function ArenaSubmissionPage({ params }: { params: { id: string } }) {
  const [submission, setSubmission] = useState<Submission | null>(null)
  useEffect(() => {
    fetch(`/api/arena/submissions/${params.id}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data: { submission: Submission }) => setSubmission(data.submission))
      .catch(() => undefined)
  }, [params.id])

  if (!submission) return <main className="min-h-screen bg-[#f7f5f0] p-8 text-slate-900 dark:bg-[#151515] dark:text-white">Loading submission...</main>

  return (
    <main className="min-h-screen bg-[#f7f5f0] text-slate-900 dark:bg-[#151515] dark:text-gray-100">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-[-18rem] h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-[#3ce8e2]/20 blur-3xl dark:bg-[#3ce8e2]/10" />
      </div>
      <div className="relative mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <ArenaNav
          subtitle="Submission"
          right={<Link href={`/arena/challenges/${submission.challenge_id}`} className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 transition-colors hover:border-[#3ce8e2] hover:text-[#008b8b] dark:border-gray-800 dark:bg-[#1e1e1e] dark:text-gray-300 dark:hover:border-[#3ce8e2] dark:hover:text-[#3ce8e2]">Back to Challenge</Link>}
        />

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-gray-800 dark:bg-[#1e1e1e] dark:shadow-2xl dark:shadow-black/30">
          <div className="border-b border-slate-200 bg-[#fbfaf7] px-6 py-5 dark:border-gray-800 dark:bg-[#191919]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#3ce8e2]">Submission</p>
                <h1 className="mt-2 break-all font-mono text-2xl font-black text-slate-950 dark:text-white">{submission.id}</h1>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusTone(submission.status)}`}>{submission.status}</span>
            </div>
          </div>

          <div className="grid gap-0 lg:grid-cols-[340px_1fr]">
            <aside className="border-b border-slate-200 p-6 dark:border-gray-800 lg:border-b-0 lg:border-r">
              <div className="grid gap-3">
                <div className="rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-gray-800 dark:bg-[#151515]"><p className="text-xs text-slate-500 dark:text-gray-500">Score</p><p className="mt-1 text-2xl font-black text-[#008b8b] dark:text-[#3ce8e2]">{submission.score}</p></div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-gray-800 dark:bg-[#151515]"><p className="text-xs text-slate-500 dark:text-gray-500">Provider</p><p className="mt-1 break-all text-sm font-bold text-slate-950 dark:text-white">{submission.judge_provider}</p></div>
              </div>
              <div className="mt-5 rounded-md border border-[#3ce8e2]/20 bg-[#3ce8e2]/5 p-4 text-sm leading-6 text-[#007777] dark:text-[#bffffd]">
                Hidden tests are redacted by design. Agent Tutor can explain patterns, but the judge remains the final source of truth.
              </div>
            </aside>

            <div className="p-6">
              <h2 className="text-lg font-black text-slate-950 dark:text-white">Test Results</h2>
              <div className="mt-4 space-y-3">
                {submission.results.map((result, index) => (
                  <div key={result.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-gray-800 dark:bg-[#151515]">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-700 dark:text-gray-300">{result.is_hidden ? `Hidden Test #${index + 1}` : `Public Test #${index + 1}`}</span>
                      <span className={result.status === 'accepted' ? 'text-emerald-300' : 'text-rose-300'}>{result.status}</span>
                    </div>
                    {!result.is_hidden && result.input && <pre className="mt-3 whitespace-pre-wrap text-sm text-slate-600 dark:text-gray-400">input: {result.input}</pre>}
                    {!result.is_hidden && result.expected_output && <pre className="mt-3 whitespace-pre-wrap text-sm text-slate-600 dark:text-gray-400">expected: {result.expected_output}</pre>}
                    {!result.is_hidden && result.stdout && <pre className="mt-3 whitespace-pre-wrap text-sm text-slate-600 dark:text-gray-400">stdout: {displayStdout(result.stdout)}</pre>}
                    {!result.is_hidden && result.raw_stdout && <pre className="mt-3 whitespace-pre-wrap text-xs text-slate-500 dark:text-gray-500">raw stdout: {result.raw_stdout}</pre>}
                    {!result.is_hidden && result.stderr && <pre className="mt-3 whitespace-pre-wrap text-sm text-rose-300">stderr: {result.stderr}</pre>}
                    {result.error_message && <p className="mt-3 text-sm text-yellow-300">{result.error_message}</p>}
                  </div>
                ))}
              </div>

              <h2 className="mt-8 text-lg font-black text-slate-950 dark:text-white">Submitted Code</h2>
              <pre className="mt-4 max-h-[520px] overflow-auto rounded-lg border border-slate-200 bg-slate-950 p-5 font-mono text-sm leading-6 text-gray-100 dark:border-gray-800 dark:bg-black dark:text-gray-200">{submission.code}</pre>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
