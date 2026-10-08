export type MobileSelection = { agentId: string; topicId: string }

type MobileConversation = {
  id?: string
  topic_id?: string
  type?: string
  topic_type?: string
  primary_agent_id?: string
  creator_agent_id?: string
  member_agent_ids?: string[]
  agent_ids?: string[]
}

export function defaultMobileTopicId(topics: MobileConversation[], subscribed: MobileConversation[]): string {
  const ids = new Set(subscribed.map(topic => topic.topic_id || topic.id))
  const topic = topics.find(item => ids.has(item.topic_id || item.id))
  return topic?.topic_id || topic?.id || ''
}

export function mobileConversationAgentId(topic: MobileConversation | null, selectedAgentId: string, ownedAgentIds: string[], subscribedTopicIds: string[] = []): string {
  if (!topic || String(topic.topic_type || topic.type || '').toLowerCase() !== 'p2p') return selectedAgentId
  const owned = new Set(ownedAgentIds)
  if (owned.has(selectedAgentId) && subscribedTopicIds.includes(topic.topic_id || topic.id || '')) return selectedAgentId
  const members = topic.member_agent_ids || topic.agent_ids || []
  if (members.includes(selectedAgentId) && owned.has(selectedAgentId)) return selectedAgentId
  return [topic.primary_agent_id, ...members, topic.creator_agent_id]
    .find((id): id is string => Boolean(id && owned.has(id))) || selectedAgentId
}

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
