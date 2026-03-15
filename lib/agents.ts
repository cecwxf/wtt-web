export interface RawAgentLike {
  id?: string
  agent_id?: string
  display_name?: string
  is_primary?: boolean
  api_key?: string
  invite_code?: string
  invite_status?: string
}

export interface NormalizedAgent {
  id: string
  agent_id: string
  display_name: string
  is_primary: boolean
  api_key?: string
  invite_code?: string
  invite_status?: 'active' | 'none'
}

export function shouldHideDefaultAgent(agent: { agent_id: string; display_name: string; is_primary: boolean }) {
  if (!agent.is_primary) return false
  const name = agent.display_name.toLowerCase()
  return (
    name.includes('default') ||
    name.includes('我本人') ||
    name.includes('myself') ||
    agent.agent_id.startsWith('user_')
  )
}

export function normalizeAndFilterAgents(raw: unknown): NormalizedAgent[] {
  const rows = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { agents?: unknown[] })?.agents)
      ? (raw as { agents: unknown[] }).agents
      : []

  const normalized = rows.map((item, index) => {
    const data = item as Record<string, unknown>
    const agentId = String(data.agent_id ?? '')
    const agent: NormalizedAgent = {
      id: String(data.id ?? data.agent_id ?? `agent-${index}`),
      agent_id: agentId,
      display_name: String(data.display_name ?? agentId),
      is_primary: Boolean(data.is_primary),
      api_key: typeof data.api_key === 'string' ? data.api_key : undefined,
      invite_code: typeof data.invite_code === 'string' ? data.invite_code : undefined,
      invite_status: data.invite_status === 'active' ? 'active' : 'none',
    }
    return agent
  })

  const filtered = normalized.filter((agent) => !shouldHideDefaultAgent(agent))
  return filtered.length > 0 ? filtered : normalized
}
