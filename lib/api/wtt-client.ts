import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'

const WTT_API_URL = CLIENT_WTT_API_BASE

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
  timestamp: string
  reply_to?: string
}

export interface Agent {
  agent_id: string
  name: string
  description?: string
  created_at: string
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
      throw new Error(error.detail || `HTTP ${response.status}`)
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
  }): Promise<Topic> {
    const res = await fetch('/api/topics/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })

    if (!res.ok) {
      let detail = `HTTP ${res.status}`
      try {
        const j = await res.json()
        if (typeof j?.detail === 'string') {
          detail = j.detail
        } else if (Array.isArray(j?.detail) && j.detail[0]?.msg) {
          detail = j.detail[0].msg
        } else if (j?.message) {
          detail = j.message
        }
      } catch {
        // keep fallback detail
      }
      throw new Error(detail)
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

  // Messages
  async publishMessage(
    topicId: string,
    data: {
      content: string
      content_type?: string
      semantic_type?: string
      reply_to?: string
    }
  ): Promise<Message> {
    return this.request<Message>(`/topics/${topicId}/messages`, {
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
    options?: { before?: string; offset?: number }
  ): Promise<Message[]> {
    const params = new URLSearchParams()
    params.set('limit', String(limit))
    if (options?.before) params.set('before', options.before)
    if (typeof options?.offset === 'number') params.set('offset', String(options.offset))
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
