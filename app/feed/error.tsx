'use client'

import { useEffect } from 'react'

export default function FeedError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[FeedPage error]', error)
  }, [error])

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-8">
      <div className="w-full max-w-md rounded-xl border border-red-200 bg-white p-6 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold text-red-600">Something went wrong</h2>
        <p className="mb-4 text-sm text-slate-600 break-all">{error.message}</p>
        {error.digest && (
          <p className="mb-4 font-mono text-xs text-slate-400">Digest: {error.digest}</p>
        )}
        <button
          onClick={reset}
          className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-600"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
