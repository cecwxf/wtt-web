export interface HistoryEntry {
  role: 'user' | 'assistant'
  content: string
  source_timestamp?: string
}
export interface HistoryArchive {
  source_format: 'codex' | 'claude-code' | 'paseo' | 'chat-json'
  source_sha256: string
  title: string
  messages: HistoryEntry[]
  ignored: number
}

const bytes = (value: string) => new TextEncoder().encode(value).length
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
function text(value: unknown): string {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return ''
  return value.map(object).filter(part => ['text', 'input_text', 'output_text'].includes(String(part.type)))
    .map(part => typeof part.text === 'string' ? part.text : '').join('\n')
}

/** Parse only an explicitly picked transcript; never resolve session IDs or scan directories. */
export async function parseHistoryArchive(raw: string, name: string): Promise<HistoryArchive> {
  if (bytes(raw) > 16 * 1024 * 1024) throw new Error('Transcript exceeds 16 MiB')
  const trimmed = raw.replace(/^\uFEFF/, '').trim()
  let decoded: unknown
  try { decoded = JSON.parse(trimmed) } catch {
    decoded = trimmed.split(/\r?\n/).filter(line => line.trim()).map((line, index) => {
      try { return JSON.parse(line) } catch { throw new Error(`Invalid JSON at line ${index + 1}`) }
    })
  }
  const document = object(decoded)
  const rows: unknown[] = Array.isArray(decoded) ? decoded
    : Array.isArray(document.messages) ? document.messages : Array.isArray(document.rows) ? document.rows : []
  if (!rows.length || rows.length > 100000) throw new Error('Unsupported or empty transcript')
  const records = rows.map(object)
  const source_format = records.some(row => row.type === 'session_meta' || row.type === 'response_item') ? 'codex'
    : records.some(row => ['user', 'assistant'].includes(String(row.type)) && row.message) ? 'claude-code'
      : records.some(row => ['user_message', 'assistant_message'].includes(String(object(row.item).type))) ? 'paseo' : 'chat-json'
  const messages: HistoryEntry[] = []
  let ignored = 0
  for (const row of records) {
    let message = row
    let role = String(row.role || '')
    if (source_format === 'codex') {
      message = object(row.payload); role = String(message.role || '')
      if (row.type !== 'response_item' || message.type !== 'message' || message.phase === 'commentary') { ignored++; continue }
    } else if (source_format === 'claude-code') {
      message = object(row.message); role = String(message.role || row.type || '')
      if (!['user', 'assistant'].includes(String(row.type)) || row.isSidechain === true) { ignored++; continue }
    } else if (source_format === 'paseo') {
      message = object(row.item)
      role = message.type === 'user_message' ? 'user' : message.type === 'assistant_message' ? 'assistant' : ''
    }
    const content = text(message.content ?? message.text)
    if (!['user', 'assistant'].includes(role) || !content.trim()) { ignored++; continue }
    if (content.length > 200000) throw new Error('A transcript message exceeds 200,000 characters')
    const sourceTimestamp = String(row.timestamp || row.created_at || '')
    messages.push({ role: role as HistoryEntry['role'], content,
      ...(sourceTimestamp && Number.isFinite(Date.parse(sourceTimestamp)) ? { source_timestamp: sourceTimestamp } : {}) })
    if (messages.length > 2000) throw new Error('Transcript exceeds 2,000 text messages; export a smaller session')
  }
  if (!messages.length) throw new Error('No supported text messages in this transcript')
  // Keep the explicit upload below the existing frontend proxy payload limit.
  if (bytes(JSON.stringify(messages)) > 3 * 1024 * 1024) throw new Error('Imported text exceeds 3 MiB; export a smaller session')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
  return { source_format, source_sha256: Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join(''),
    title: name.replace(/\.(jsonl?|ndjson)$/i, '').slice(0, 120) || 'Imported history', messages, ignored }
}

export function importedHistorySource(value: unknown): string | undefined {
  try {
    const metadata = object(typeof value === 'string' ? JSON.parse(value) : value)
    const source = object(metadata.history_import).source_format
    return ['codex', 'claude-code', 'paseo', 'chat-json'].includes(String(source)) ? String(source) : undefined
  } catch { return undefined }
}
