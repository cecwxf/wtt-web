/**
 * Timezone-aware time formatting utilities.
 *
 * Backend stores timestamps in UTC. These helpers convert to the user's
 * local timezone (auto-detected via Intl) for display.
 */

const userTz =
  typeof Intl !== 'undefined'
    ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : undefined

function safeDate(ts: string): Date | null {
  try {
    const d = new Date(ts)
    return Number.isNaN(d.getTime()) ? null : d
  } catch {
    return null
  }
}

/** "14:30" — hour + minute in user's local timezone */
export function formatTime(ts: string): string {
  const d = safeDate(ts)
  if (!d) return '--:--'
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: userTz })
}

/** "3/15" or "14:30" depending on whether the timestamp is today */
export function formatSmartTime(ts: string): string {
  const d = safeDate(ts)
  if (!d) return '--:--'

  const now = new Date()
  const fmt = (date: Date, opts: Intl.DateTimeFormatOptions) =>
    date.toLocaleDateString([], { ...opts, timeZone: userTz })

  const sameDay =
    fmt(d, { year: 'numeric', month: '2-digit', day: '2-digit' }) ===
    fmt(now, { year: 'numeric', month: '2-digit', day: '2-digit' })

  if (sameDay) return formatTime(ts)
  return d.toLocaleDateString([], { month: 'numeric', day: 'numeric', timeZone: userTz })
}

/** "Today" / "Yesterday" / "Mar 15, 2026" */
export function formatDateGroup(ts: string): string {
  const d = safeDate(ts)
  if (!d) return 'Unknown Date'

  const dayKey = (date: Date) =>
    date.toLocaleDateString('en-CA', { timeZone: userTz }) // "2026-03-15"

  const todayKey = dayKey(new Date())
  const yesterdayDate = new Date()
  yesterdayDate.setDate(yesterdayDate.getDate() - 1)
  const yesterdayKey = dayKey(yesterdayDate)

  const key = dayKey(d)
  if (key === todayKey) return 'Today'
  if (key === yesterdayKey) return 'Yesterday'

  return d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric', timeZone: userTz })
}

/** "just now" / "5m ago" / "3h ago" / "2d ago" / date string */
export function formatTimeAgo(ts: string): string {
  const d = safeDate(ts)
  if (!d) return 'recently'

  const seconds = Math.floor((Date.now() - d.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
  return d.toLocaleDateString([], { timeZone: userTz })
}

/** Full local date string, e.g. "2026/3/15 14:30:00" */
export function formatFullDateTime(ts: string): string {
  const d = safeDate(ts)
  if (!d) return ''
  return d.toLocaleString([], { timeZone: userTz })
}
