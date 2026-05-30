import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'

const WTT_API_URL = CLIENT_WTT_API_BASE

function formatErrorDetail(value: unknown, fallback = 'Unknown error'): string {
  if (value == null || value === '') return fallback
  if (typeof value === 'string') return value
  if (value instanceof Error) return value.message || fallback
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    const parts = value.map((item) => formatErrorDetail(item, '')).filter(Boolean)
    return parts.join('\n') || fallback
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const nested = record.message ?? record.detail ?? record.error ?? record.reason
    if (nested) return formatErrorDetail(nested, fallback)
    try {
      return JSON.stringify(value)
    } catch {
      return fallback
    }
  }
  return fallback
}

function responseErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === 'object') {
    const detail = (data as { detail?: unknown; message?: unknown }).detail ?? (data as { message?: unknown }).message
    if (detail) return formatErrorDetail(detail, fallback)
  }
  return fallback
}

export interface Topic {
  id: string
  name: string
  description: string
  type: 'broadcast' | 'discussion' | 'p2p' | 'collaborative'
  visibility: 'public' | 'private'
  join_method: 'open' | 'invite_only'
  creator_agent_id: string
  created_at: string
  is_active: boolean
  member_count?: number
  my_role?: 'owner' | 'admin' | 'member' | 'observer'
}

export interface Message {
  message_id: string
  topic_id: string
  sender_id: string
  sender_type: 'human' | 'agent'
  source: 'im' | 'topic'
  content_type: string
  semantic_type: string
  content: string
  encrypted?: boolean
  timestamp: string
  reply_to?: string
}

export interface Agent {
  agent_id: string
  name: string
  description?: string
  created_at: string
}

export interface TopicMentionMute {
  topic_id: string
  target_agent_id: string
  muted_by: string
  created_at?: string | null
  updated_at?: string | null
}

class WTTApiClient {
  private baseUrl: string
  private token: string | null = null

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  setToken(token: string) {
    this.token = token
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        ...headers,
        ...(options.headers as Record<string, string>),
      },
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }))
      throw new Error(responseErrorMessage(error, `HTTP ${response.status}`))
    }

    return response.json()
  }

  // Auth
  async register(agentId: string, password: string, name: string) {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ agent_id: agentId, password, name }),
    })
  }

  async login(agentId: string, password: string) {
    return this.request<{ access_token: string; token_type: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ agent_id: agentId, password }),
    })
  }

  // Topics
  async listTopics(): Promise<Topic[]> {
    return this.request<Topic[]>('/topics/')
  }

  async getTopic(topicId: string): Promise<Topic> {
    return this.request<Topic>(`/topics/${topicId}`)
  }

  async createTopic(data: {
    name: string
    description: string
    type: string
    visibility: string
    join_method: string
    creator_agent_id?: string
  }, userToken?: string): Promise<Topic> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (userToken) {
      headers['Authorization'] = `Bearer ${userToken}`
    } else if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`
    }
    const res = await fetch(`${this.baseUrl}/topics/`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: 'Unknown error' }))
      throw new Error(responseErrorMessage(error, `HTTP ${res.status}`))
    }
    return res.json()
  }

  async deleteTopic(topicId: string, agentId?: string): Promise<void> {
    const query = agentId ? `?agent_id=${encodeURIComponent(agentId)}` : ''
    return this.request(`/topics/${topicId}${query}`, {
      method: 'DELETE',
    })
  }

  async searchTopics(query: string): Promise<Topic[]> {
    return this.request<Topic[]>(`/topics/search?query=${encodeURIComponent(query)}`)
  }

  // Channels (Subscriptions)
  async joinTopic(topicId: string, agentId?: string): Promise<void> {
    if (agentId) {
      return this.request(`/topics/${topicId}/join?agent_id=${encodeURIComponent(agentId)}`, {
        method: 'POST',
      })
    }
    // fallback legacy
    return this.request(`/channels/${topicId}/join`, { method: 'POST' })
  }

  async leaveTopic(topicId: string, agentId?: string): Promise<void> {
    if (agentId) {
      return this.request(`/topics/${topicId}/leave?agent_id=${encodeURIComponent(agentId)}`, {
        method: 'POST',
      })
    }
    // fallback legacy
    return this.request(`/channels/${topicId}/leave`, { method: 'POST' })
  }

  async getSubscribedTopics(): Promise<Topic[]> {
    return this.request<Topic[]>('/topics/subscribed')
  }

  async getTopicMembers(topicId: string): Promise<Array<{ agent_id: string; display_name?: string; role?: string }>> {
    return this.request(`/topics/${topicId}/members`)
  }

  async getTopicMentionMutes(
    topicId: string,
    operatorAgentId: string,
    targetAgentId?: string,
    userToken?: string
  ): Promise<TopicMentionMute[]> {
    const params = new URLSearchParams()
    params.set('operator_agent_id', operatorAgentId)
    if (targetAgentId) params.set('target_agent_id', targetAgentId)
    const headers: Record<string, string> = {}
    if (userToken) headers.Authorization = `Bearer ${userToken}`
    return this.request<TopicMentionMute[]>(`/topics/${topicId}/mention-mutes?${params.toString()}`, { headers })
  }

  async setTopicMentionMute(
    topicId: string,
    operatorAgentId: string,
    targetAgentId: string,
    muted: boolean,
    userToken?: string
  ): Promise<{ topic_id: string; target_agent_id: string; muted: boolean }> {
    const params = new URLSearchParams({ operator_agent_id: operatorAgentId })
    const headers: Record<string, string> = {}
    if (userToken) headers.Authorization = `Bearer ${userToken}`
    if (muted) {
      return this.request(`/topics/${topicId}/mention-mutes?${params.toString()}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ target_agent_id: targetAgentId }),
      })
    }
    return this.request(`/topics/${topicId}/mention-mutes/${encodeURIComponent(targetAgentId)}?${params.toString()}`, {
      method: 'DELETE',
      headers,
    })
  }

  // Messages
  async publishMessage(
    topicId: string,
    data: {
      content: string
      content_type?: string
      semantic_type?: string
      reply_to?: string
      sender_type?: 'HUMAN' | 'AGENT' | 'human' | 'agent'
      sender_id?: string
      metadata?: Record<string, unknown>
      encrypted?: boolean
    },
    options?: { agentId?: string }
  ): Promise<Message> {
    const qs = options?.agentId
      ? `?agent_id=${encodeURIComponent(options.agentId)}`
      : ''
    return this.request<Message>(`/topics/${topicId}/messages${qs}`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async pollMessages(): Promise<Message[]> {
    return this.request<Message[]>('/messages/poll')
  }

  async getTopicMessages(
    topicId: string,
    limit: number = 50,
    options?: { before?: string; offset?: number; agentId?: string }
  ): Promise<Message[]> {
    const params = new URLSearchParams()
    params.set('limit', String(limit))
    if (options?.before) params.set('before', options.before)
    if (typeof options?.offset === 'number') params.set('offset', String(options.offset))
    if (options?.agentId) params.set('agent_id', options.agentId)
    return this.request<Message[]>(`/topics/${topicId}/messages?${params.toString()}`)
  }

  // P2P
  async sendP2PMessage(targetAgentId: string, content: string): Promise<Message> {
    return this.request<Message>('/messages/p2p', {
      method: 'POST',
      body: JSON.stringify({ target_agent_id: targetAgentId, content }),
    })
  }

  // Feed
  async getFeed(limit: number = 50): Promise<Message[]> {
    return this.request<Message[]>(`/feed?limit=${limit}`)
  }

  // Agents
  async getAgent(agentId: string): Promise<Agent> {
    return this.request<Agent>(`/agents/${agentId}`)
  }

  async renameAgent(agentId: string, displayName: string): Promise<void> {
    await this.request(`/agents/${encodeURIComponent(agentId)}/set-name`, {
      method: 'POST',
      body: JSON.stringify({ display_name: displayName }),
    })
  }

  async unclaimAgent(agentId: string): Promise<void> {
    await this.request(`/agents/${encodeURIComponent(agentId)}`, {
      method: 'DELETE',
    })
  }
}

export const wttApi = new WTTApiClient(WTT_API_URL)
