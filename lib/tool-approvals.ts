export interface PrivateToolApproval {
  request_id: string
  agent_id: string
  topic_id: string
  tool_name: string
  input_sha256: string
  input: Record<string, unknown>
  expires_at: string
}

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i

export function normalizePrivateToolApprovals(value: unknown, topicId: string, now = Date.now()): PrivateToolApproval[] {
  if (!Array.isArray(value) || value.length > 32) return []
  return value.flatMap((row): PrivateToolApproval[] => {
    if (!row || typeof row !== 'object' || !uuid.test(row.request_id) || row.topic_id !== topicId
      || row.status !== 'pending' || !/^agent-[a-f0-9]{12}$/.test(row.agent_id)
      || typeof row.tool_name !== 'string' || !/^[A-Za-z0-9_.:-]{1,256}$/.test(row.tool_name)
      || !/^[a-f0-9]{64}$/.test(row.input_sha256) || !row.input || typeof row.input !== 'object' || Array.isArray(row.input)) return []
    const expires = Date.parse(row.expires_at)
    const serverNow = row.server_time === undefined ? now : Date.parse(row.server_time)
    const remaining = expires - serverNow
    if (!Number.isFinite(remaining) || remaining <= 0 || remaining > 301000) return []
    try {
      if (new TextEncoder().encode(JSON.stringify(row.input)).byteLength > 65536) return []
      return [{ ...row, expires_at: new Date(now + Math.min(remaining, 300000)).toISOString() }]
    } catch { return [] }
  })
}

export async function readPrivateApprovalResponse(response: Response): Promise<unknown> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Empty approval response')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 2200000) throw new Error('Approval response exceeds limit')
      chunks.push(value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return JSON.parse(new TextDecoder().decode(bytes))
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}
