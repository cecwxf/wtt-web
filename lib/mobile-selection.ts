export type MobileSelection = { agentId: string; topicId: string }

function storageKey(accountId: string): string {
  return `wtt:mobile-selection:v1:${encodeURIComponent(accountId)}`
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 && value.trim() === value
}

export function readMobileSelection(accountId: string): MobileSelection | null {
  if (!accountId || typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(storageKey(accountId))
    if (!raw) return null
    const value = JSON.parse(raw)
    if (value?.version !== 1 || !validId(value.agentId) || !validId(value.topicId)) return null
    return { agentId: value.agentId, topicId: value.topicId }
  } catch {
    return null
  }
}

export function writeMobileSelection(accountId: string, selection: MobileSelection): void {
  if (!accountId || typeof window === 'undefined' || !validId(selection.agentId) || !validId(selection.topicId)) return
  try {
    window.localStorage.setItem(storageKey(accountId), JSON.stringify({ version: 1, ...selection }))
  } catch {
    // Private mode or full storage must not prevent using the conversation.
  }
}
