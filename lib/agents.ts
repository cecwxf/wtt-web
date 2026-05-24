export interface RawAgentLike {
  id?: string
  agent_id?: string
  display_name?: string
  is_primary?: boolean
  api_key?: string
  invite_code?: string
  invite_status?: string
  binding_method?: string
  bound_via?: string
  role_template_id?: string
  role_template?: Record<string, unknown>
}

export interface NormalizedAgent {
  id: string
  agent_id: string
  display_name: string
  is_primary: boolean
  api_key?: string
  invite_code?: string
  invite_status?: 'active' | 'none'
  binding_method?: string
  bound_via?: string
  role_template_id?: string
  role_template?: Record<string, unknown>
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
      binding_method: typeof data.binding_method === 'string' ? data.binding_method : undefined,
      bound_via: typeof data.bound_via === 'string' ? data.bound_via : undefined,
      role_template_id: typeof data.role_template_id === 'string' ? data.role_template_id : undefined,
      role_template: data.role_template && typeof data.role_template === 'object'
        ? data.role_template as Record<string, unknown>
        : undefined,
    }
    return agent
  })

  return normalized.filter((agent) => agent.agent_id.trim().length > 0)
}
