'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { Submission } from '@/lib/arena/types'

export default function ArenaSubmissionPage({ params }: { params: { id: string } }) {
  const [submission, setSubmission] = useState<Submission | null>(null)
  useEffect(() => {
    fetch(`/api/arena/submissions/${params.id}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data: { submission: Submission }) => setSubmission(data.submission))
      .catch(() => undefined)
  }, [params.id])

  if (!submission) return <main className="min-h-screen bg-slate-950 p-8 text-white">Loading submission...</main>

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <Link href={`/arena/challenges/${submission.challenge_id}`} className="text-sm text-indigo-300 hover:text-indigo-100">← Back to challenge</Link>
        <div className="mt-5 rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm text-slate-500">Submission</p>
              <h1 className="mt-1 text-2xl font-black">{submission.id}</h1>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${submission.status === 'accepted' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{submission.status}</span>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <div className="rounded-xl bg-slate-900/70 p-4"><p className="text-xs text-slate-500">Score</p><p className="mt-1 text-xl font-bold">{submission.score}</p></div>
            <div className="rounded-xl bg-slate-900/70 p-4"><p className="text-xs text-slate-500">Runtime</p><p className="mt-1 text-xl font-bold">{submission.runtime_ms || '-'}ms</p></div>
            <div className="rounded-xl bg-slate-900/70 p-4"><p className="text-xs text-slate-500">Memory</p><p className="mt-1 text-xl font-bold">{submission.memory_kb || '-'}KB</p></div>
            <div className="rounded-xl bg-slate-900/70 p-4"><p className="text-xs text-slate-500">Provider</p><p className="mt-1 text-xl font-bold">{submission.judge_provider}</p></div>
          </div>
          <h2 className="mt-6 text-lg font-bold">Results</h2>
          <div className="mt-3 space-y-3">
            {submission.results.map((result, index) => (
              <div key={result.id} className="rounded-xl border border-white/10 bg-slate-900/70 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{result.is_hidden ? `Hidden Test #${index + 1}` : `Public Test #${index + 1}`}</span>
                  <span className={result.status === 'accepted' ? 'text-emerald-300' : 'text-red-300'}>{result.status}</span>
                </div>
                {!result.is_hidden && result.stdout && <pre className="mt-3 whitespace-pre-wrap text-sm text-slate-400">stdout: {result.stdout}</pre>}
                {!result.is_hidden && result.stderr && <pre className="mt-3 whitespace-pre-wrap text-sm text-red-300">stderr: {result.stderr}</pre>}
                {result.error_message && <p className="mt-3 text-sm text-amber-300">{result.error_message}</p>}
              </div>
            ))}
          </div>
          <h2 className="mt-6 text-lg font-bold">Code</h2>
          <pre className="mt-3 overflow-auto rounded-xl bg-black p-4 text-sm text-slate-200">{submission.code}</pre>
        </div>
      </div>
    </main>
  )
}
