export const SOURCE_FLOW_HEADER = '┌─ 来源标识 ─────────────'
export const SOURCE_FLOW_FOOTER = '└────────────────────'

export function buildWttUserSourceFlow(senderName: string, content: string): string {
  const normalizedSender = senderName.trim() || 'User'
  return [
    SOURCE_FLOW_HEADER,
    `│ ${normalizedSender}`,
    SOURCE_FLOW_FOOTER,
    content,
  ].join('\n')
}
