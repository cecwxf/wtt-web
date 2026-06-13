export type StreamChatMessage = {
  message_id: string
  topic_id?: string
  sender_id: string
  sender_display_name?: string
  sender_type: 'human' | 'agent'
  content: string
  timestamp: string
  semantic_type?: string
  is_streaming?: boolean
  stream_id?: string
}

export type MessageStreamEvent = {
  type: 'message_stream'
  topic_id: string
  stream_id: string
  sender_id: string
  sender_type?: string
  state: 'start' | 'delta' | 'snapshot' | 'done' | 'error'
  delta?: string
  full_text?: string
  error?: string
  seq?: number
  ts?: number
}

export function parseMessageStreamEvent(raw: unknown): MessageStreamEvent | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  if (record.type !== 'message_stream') return null
  const topicId = String(record.topic_id || '').trim()
  const streamId = String(record.stream_id || '').trim()
  const senderId = String(record.sender_id || '').trim()
  const state = String(record.state || '').trim().toLowerCase()
  if (!topicId || !streamId || !senderId) return null
  if (!['start', 'delta', 'snapshot', 'done', 'error'].includes(state)) return null
  return {
    type: 'message_stream',
    topic_id: topicId,
    stream_id: streamId,
    sender_id: senderId,
    sender_type: String(record.sender_type || 'agent'),
    state: state as MessageStreamEvent['state'],
    delta: typeof record.delta === 'string' ? record.delta : undefined,
    full_text: typeof record.full_text === 'string' ? record.full_text : undefined,
    error: typeof record.error === 'string' ? record.error : undefined,
    seq: Number(record.seq || 0) || 0,
    ts: Number(record.ts || 0) || Date.now(),
  }
}

export function streamIdFromMetadata(metadata: unknown): string {
  const obj = metadataToObject(metadata)
  return String(obj.stream_id || obj.streamId || '').trim()
}

export function streamIdFromMessageRecord(record: unknown): string {
  if (!record || typeof record !== 'object') return ''
  const row = record as Record<string, unknown>
  return streamIdFromMetadata(row.metadata || row.msg_metadata || row.meta)
}

export function applyMessageStreamEvent<T extends StreamChatMessage>(
  current: T[],
  event: MessageStreamEvent,
  options: {
    topicId?: string
    displayName?: (senderId: string) => string | undefined
    errorPrefix?: string
  } = {},
): T[] {
  if (options.topicId && event.topic_id !== options.topicId) return current

  const idx = current.findIndex((message) => message.stream_id === event.stream_id || message.message_id === `stream:${event.stream_id}`)
  const existing = idx >= 0 ? current[idx] : undefined
  let content = existing?.content || ''

  if (event.state === 'start') {
    if (!existing) return current
  } else if (event.state === 'delta') {
    const delta = event.delta || ''
    if (!delta && !existing) return current
    content = `${content}${delta}`
  } else if (event.state === 'snapshot' || event.state === 'done') {
    const full = event.full_text || ''
    if (!full && !existing) return current
    content = full || content
  } else if (event.state === 'error') {
    content = `${options.errorPrefix || '执行失败'}：${event.error || 'stream error'}`
  }

  const nextMessage = {
    ...(existing || {}),
    message_id: existing?.message_id || `stream:${event.stream_id}`,
    topic_id: event.topic_id,
    sender_id: event.sender_id,
    sender_display_name: existing?.sender_display_name || options.displayName?.(event.sender_id),
    sender_type: 'agent',
    content,
    timestamp: existing?.timestamp || new Date(event.ts || Date.now()).toISOString(),
    semantic_type: 'CHAT_REPLY',
    is_streaming: event.state !== 'done' && event.state !== 'error',
    stream_id: event.stream_id,
  } as T

  if (idx >= 0) {
    const next = [...current]
    next[idx] = nextMessage
    return next
  }
  return [...current, nextMessage]
}

export function removeStreamPlaceholderForFinalMessage<T extends StreamChatMessage>(current: T[], finalMessage: unknown): T[] {
  const streamId = streamIdFromMessageRecord(finalMessage)
  if (!streamId) return current
  return current.filter((message) => !(message.stream_id === streamId && message.message_id.startsWith('stream:')))
}

export function mergePersistedMessagesWithStreaming<T extends StreamChatMessage>(
  persisted: T[],
  previous: T[],
  topicId?: string,
): T[] {
  const finalStreamIds = new Set(persisted.map((message) => message.stream_id).filter(Boolean) as string[])
  const streaming = previous.filter((message) => {
    if (!message.stream_id || !message.message_id.startsWith('stream:')) return false
    if (topicId && message.topic_id && message.topic_id !== topicId) return false
    return !finalStreamIds.has(message.stream_id)
  })
  return [...persisted, ...streaming]
}

function metadataToObject(metadata: unknown): Record<string, unknown> {
  if (!metadata) return {}
  if (typeof metadata === 'object' && !Array.isArray(metadata)) return metadata as Record<string, unknown>
  if (typeof metadata === 'string') {
    try {
      const parsed = JSON.parse(metadata)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>
    } catch {
      return {}
    }
  }
  return {}
}
