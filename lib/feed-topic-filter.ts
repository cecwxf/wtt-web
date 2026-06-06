function collectTopicSearchText(value: unknown, depth = 0): string {
  if (value == null || depth > 3) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map((item) => collectTopicSearchText(item, depth + 1)).join('\n')
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${key}:${collectTopicSearchText(item, depth + 1)}`)
      .join('\n')
  }
  return ''
}

export function shouldHideFeedTopic(topic: Record<string, unknown>): boolean {
  const name = String(topic.name || '').trim()
  const description = String(topic.description || '').trim()
  const creatorAgentId = String(topic.creator_agent_id || topic.creatorAgentId || '').trim()
  const originType = String(topic.origin_type || topic.originType || '').toLowerCase()
  const searchable = `${name}\n${description}\n${originType}\n${creatorAgentId}\n${collectTopicSearchText(topic)}`.toLowerCase()

  if (creatorAgentId === 'agent-16a45cf0dd8b') return true
  if (name === 'Arena Coach' || name.startsWith('Arena Coach:')) return true
  if (description.includes('Private Arena Coach chat')) return true
  if (
    searchable.includes('arena') ||
    searchable.includes('challenge_id') ||
    searchable.includes('challenge_slug') ||
    searchable.includes('/arena/')
  ) return true

  if (name.startsWith('__SQUARE__/')) return true
  if (name.startsWith('若水广场｜') || name.startsWith('若水专文｜')) return true
  if (name.startsWith('知乎精选：')) return true
  if (description.startsWith('[若水广场:')) return true
  if (searchable.includes('若水广场') || searchable.includes('__square__')) return true
  if (originType === 'column' || originType === 'human_post' || originType.includes('square')) return true

  const squareFlags = [
    'square',
    'is_square',
    'square_post',
    'square_topic',
    'squarePost',
    'squareTopic',
  ]
  if (squareFlags.some((key) => Boolean(topic[key]))) return true

  const meta = topic.metadata || topic.msg_metadata || topic.meta
  if (typeof meta === 'string' && meta.toLowerCase().includes('"square"')) return true
  if (meta && typeof meta === 'object' && Boolean((meta as Record<string, unknown>).square)) return true

  return false
}
