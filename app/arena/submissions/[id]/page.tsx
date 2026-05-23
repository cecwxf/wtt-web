'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { Submission } from '@/lib/arena/types'

function statusTone(status: string) {
  if (status === 'accepted') return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
  if (status === 'system_error') return 'border-yellow-400/20 bg-yellow-400/10 text-yellow-300'
  return 'border-rose-400/20 bg-rose-400/10 text-rose-300'
}

function isOpenCLProvider(provider?: string) {
  return provider === 'agent-mac-opencl-kernel' || Boolean(provider?.startsWith('remote-opencl-'))
}

function formatRuntimeMs(value?: number) {
  if (value === undefined || value === null) return '-'
  if (value === 0) return '0ms'
  if (Math.abs(value) < 1) return `${value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')}ms`
  if (Number.isInteger(value)) return `${value}ms`
  return `${value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}ms`
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

  if (!submission) return <main className="min-h-screen bg-[#151515] p-8 text-white">Loading submission...</main>
  const memoryLabel = isOpenCLProvider(submission.judge_provider) ? 'Kernel Memory' : 'Memory'
  const inlineMemoryLabel = isOpenCLProvider(submission.judge_provider) ? 'kernel memory' : 'memory'

  return (
    <main className="min-h-screen bg-[#151515] text-gray-100">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-[-18rem] h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-[#3ce8e2]/10 blur-3xl" />
      </div>
      <div className="relative mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <nav className="mb-8 flex items-center justify-between">
          <Link href="/arena" className="bg-gradient-to-r from-[#3ce8e2] to-[#00b3b3] bg-clip-text text-2xl font-black text-transparent">WTT 终生学习</Link>
          <Link href={`/arena/challenges/${submission.challenge_id}`} className="rounded-md border border-gray-800 bg-[#1e1e1e] px-4 py-2 text-sm font-bold text-gray-300 transition-colors hover:border-[#3ce8e2] hover:text-[#3ce8e2]">Back to Challenge</Link>
        </nav>

        <section className="overflow-hidden rounded-lg border border-gray-800 bg-[#1e1e1e] shadow-2xl shadow-black/30">
          <div className="border-b border-gray-800 bg-[#191919] px-6 py-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#3ce8e2]">Submission</p>
                <h1 className="mt-2 break-all font-mono text-2xl font-black text-white">{submission.id}</h1>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusTone(submission.status)}`}>{submission.status}</span>
            </div>
          </div>

          <div className="grid gap-0 lg:grid-cols-[340px_1fr]">
            <aside className="border-b border-gray-800 p-6 lg:border-b-0 lg:border-r">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md border border-gray-800 bg-[#151515] p-4"><p className="text-xs text-gray-500">Score</p><p className="mt-1 text-2xl font-black text-[#3ce8e2]">{submission.score}</p></div>
                <div className="rounded-md border border-gray-800 bg-[#151515] p-4"><p className="text-xs text-gray-500">Runtime</p><p className="mt-1 text-2xl font-black text-white">{formatRuntimeMs(submission.runtime_ms)}</p></div>
                <div className="rounded-md border border-gray-800 bg-[#151515] p-4"><p className="text-xs text-gray-500">{memoryLabel}</p><p className="mt-1 text-2xl font-black text-white">{submission.memory_kb || '-'}KB</p></div>
                <div className="rounded-md border border-gray-800 bg-[#151515] p-4"><p className="text-xs text-gray-500">Provider</p><p className="mt-1 text-sm font-bold text-white">{submission.judge_provider}</p></div>
              </div>
              <div className="mt-5 rounded-md border border-[#3ce8e2]/20 bg-[#3ce8e2]/5 p-4 text-sm leading-6 text-[#bffffd]">
                Hidden tests are redacted by design. Agent Tutor can explain patterns, but the judge remains the final source of truth.
              </div>
            </aside>

            <div className="p-6">
              <h2 className="text-lg font-black text-white">Test Results</h2>
              <div className="mt-4 space-y-3">
                {submission.results.map((result, index) => (
                  <div key={result.id} className="rounded-lg border border-gray-800 bg-[#151515] p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-gray-300">{result.is_hidden ? `Hidden Test #${index + 1}` : `Public Test #${index + 1}`}</span>
                      <span className={result.status === 'accepted' ? 'text-emerald-300' : 'text-rose-300'}>{result.status}</span>
                    </div>
                    <p className="mt-2 text-xs text-gray-500">runtime {formatRuntimeMs(result.runtime_ms)} · {inlineMemoryLabel} {result.memory_kb || '-'}KB</p>
                    {!result.is_hidden && result.input && <pre className="mt-3 whitespace-pre-wrap text-sm text-gray-400">input: {result.input}</pre>}
                    {!result.is_hidden && result.expected_output && <pre className="mt-3 whitespace-pre-wrap text-sm text-gray-400">expected: {result.expected_output}</pre>}
                    {!result.is_hidden && result.stdout && <pre className="mt-3 whitespace-pre-wrap text-sm text-gray-400">stdout: {displayStdout(result.stdout)}</pre>}
                    {!result.is_hidden && result.raw_stdout && <pre className="mt-3 whitespace-pre-wrap text-xs text-gray-500">raw stdout: {result.raw_stdout}</pre>}
                    {!result.is_hidden && result.stderr && <pre className="mt-3 whitespace-pre-wrap text-sm text-rose-300">stderr: {result.stderr}</pre>}
                    {result.error_message && <p className="mt-3 text-sm text-yellow-300">{result.error_message}</p>}
                  </div>
                ))}
              </div>

              <h2 className="mt-8 text-lg font-black text-white">Submitted Code</h2>
              <pre className="mt-4 max-h-[520px] overflow-auto rounded-lg border border-gray-800 bg-black p-5 font-mono text-sm leading-6 text-gray-200">{submission.code}</pre>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
