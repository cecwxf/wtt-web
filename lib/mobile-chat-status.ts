const DEFAULT_STATUS_STALE_MS = 15 * 60 * 1000

export type MobileStatusLike = {
  statusKind?: string
  startedAt: number
  expiresAt: number
}

export type MobileAgentReplyLike = {
  id: string
  ts: number
}

export function isTerminalMobileStatusKind(kind?: string): boolean {
  const normalized = String(kind || '').toLowerCase()
  return normalized.includes('done')
    || normalized.includes('complete')
    || normalized.includes('review')
    || normalized.includes('blocked')
    || normalized.includes('cancelled')
    || normalized.includes('error')
    || normalized.includes('fail')
    || normalized.includes('response')
}

export function shouldPollMobileMessages(status?: MobileStatusLike | null, now = Date.now()): boolean {
  return Boolean(
    status
      && status.expiresAt > now
      && !isTerminalMobileStatusKind(status.statusKind),
  )
}

export function shouldCloseWaitingStatusFromAgentReply(
  status: MobileStatusLike | null | undefined,
  reply: MobileAgentReplyLike | null | undefined,
  now = Date.now(),
  staleMs = DEFAULT_STATUS_STALE_MS,
): boolean {
  return Boolean(
    status
      && reply?.id
      && !isTerminalMobileStatusKind(status.statusKind)
      && reply.ts + staleMs >= now
      && reply.ts + 5000 >= status.startedAt,
  )
}

export function normalizeMobileProgressStatusKind(group?: string, detail?: string, status?: string): string {
  const fallback = String(group || status || 'running').trim() || 'running'
  const combined = `${group || ''} ${detail || ''} ${status || ''}`.toLowerCase()
  if (combined.includes('cancelled')) return 'cancelled'
  if (combined.includes('blocked')) return 'blocked'
  if (combined.includes('error') || combined.includes('failed') || combined.includes('failure')) return 'error'
  if (combined.includes('completed') || combined.includes('complete') || combined.includes('done')) return 'complete'
  return fallback
}
