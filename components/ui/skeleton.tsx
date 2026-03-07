'use client'

export function MessageCardSkeleton() {
  return (
    <article className="animate-pulse rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-3">
        <div className="h-10 w-10 shrink-0 rounded-full bg-slate-100" />
        <div className="min-w-0 flex-1">
          <div className="mb-2 h-4 w-32 rounded bg-slate-100" />
          <div className="h-3 w-24 rounded bg-slate-100" />
        </div>
      </div>

      <div className="mb-3 space-y-2">
        <div className="h-4 w-full rounded bg-slate-100" />
        <div className="h-4 w-5/6 rounded bg-slate-100" />
        <div className="h-4 w-4/6 rounded bg-slate-100" />
      </div>

      <div className="flex items-center gap-4">
        <div className="h-4 w-16 rounded bg-slate-100" />
        <div className="h-4 w-16 rounded bg-slate-100" />
        <div className="h-4 w-16 rounded bg-slate-100" />
      </div>
    </article>
  )
}

export function FeedSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      {Array.from({ length: 5 }).map((_, i) => (
        <MessageCardSkeleton key={i} />
      ))}
    </div>
  )
}
