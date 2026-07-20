const DEFAULT_HISTORY_CACHE_TTL_MS = 10 * 60 * 1000

function messageKey(message: object, index: number): string {
  const row = message as Record<string, unknown>
  const id = String(row.message_id ?? row.id ?? '').trim()
  if (id) return `id:${id}`

  return [
    'fallback',
    String(row.topic_id ?? ''),
    String(row.sender_id ?? ''),
    String(row.timestamp ?? row.created_at ?? ''),
    String(row.semantic_type ?? ''),
    String(row.content ?? ''),
    String(index),
  ].join(':')
}

function messageTime(message: object): number {
  const row = message as Record<string, unknown>
  const parsed = new Date(String(row.timestamp ?? row.created_at ?? '')).getTime()
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER
}

/**
 * Topic message endpoints return windows, not authoritative snapshots. Merge by
 * identity so a refresh cannot erase older pages or transiently absent rows.
 */
export function mergeMessageHistory<T extends object>(
  previous: readonly T[] | null | undefined,
  incoming: readonly T[] | null | undefined,
): T[] {
  const before = Array.isArray(previous) ? previous : []
  const next = Array.isArray(incoming) ? incoming : []
  if (before.length === 0) return [...next]
  if (next.length === 0) return [...before]

  const merged = new Map<string, T>()
  before.forEach((message, index) => merged.set(messageKey(message, index), message))
  next.forEach((message, index) => merged.set(messageKey(message, index), message))

  return Array.from(merged.values())
    .map((message, index) => ({ message, index }))
    .sort((a, b) => messageTime(a.message) - messageTime(b.message) || a.index - b.index)
    .map(({ message }) => message)
}

function cacheKey(scope: string, topicId: string, agentId: string): string {
  return `wtt:chat-history:v2:${scope}:${topicId}:${agentId}`
}

export function readCachedMessageHistory(
  scope: string,
  topicId?: string | null,
  agentId?: string | null,
  ttlMs = DEFAULT_HISTORY_CACHE_TTL_MS,
): unknown[] | undefined {
  if (typeof window === 'undefined' || !topicId || !agentId) return undefined
  try {
    const raw = window.sessionStorage.getItem(cacheKey(scope, topicId, agentId))
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as { ts?: number; data?: unknown }
    if (!parsed.ts || Date.now() - parsed.ts > ttlMs || !Array.isArray(parsed.data)) return undefined
    return parsed.data
  } catch {
    return undefined
  }
}

export function writeCachedMessageHistory(
  scope: string,
  topicId?: string | null,
  agentId?: string | null,
  data?: unknown,
): void {
  if (typeof window === 'undefined' || !topicId || !agentId || !Array.isArray(data)) return
  try {
    window.sessionStorage.setItem(cacheKey(scope, topicId, agentId), JSON.stringify({ ts: Date.now(), data }))
  } catch {
    // Browsers can reject sessionStorage in private mode or when the quota is full.
  }
}
