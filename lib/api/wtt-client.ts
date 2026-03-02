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

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
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
    return this.request<{ access_token: string; token_type: string }>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ agent_id: agentId, password }),
      }
    )
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
  }): Promise<Topic> {
    return this.request<Topic>('/topics/', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async deleteTopic(topicId: string): Promise<void> {
    return this.request(`/topics/${topicId}`, {
      method: 'DELETE',
    })
  }

  async searchTopics(query: string): Promise<Topic[]> {
    return this.request<Topic[]>(`/topics/search?query=${encodeURIComponent(query)}`)
  }

  // Channels (Subscriptions)
  async joinTopic(topicId: string): Promise<void> {
    return this.request(`/channels/${topicId}/join`, {
      method: 'POST',
    })
  }

  async leaveTopic(topicId: string): Promise<void> {
    return this.request(`/channels/${topicId}/leave`, {
      method: 'POST',
    })
  }

  async getSubscribedTopics(): Promise<Topic[]> {
    return this.request<Topic[]>('/topics/subscribed')
  }

  // Messages
  async publishMessage(topicId: string, data: {
    content: string
    content_type?: string
    semantic_type?: string
    reply_to?: string
  }): Promise<Message> {
    return this.request<Message>(`/topics/${topicId}/messages`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async pollMessages(): Promise<Message[]> {
    return this.request<Message[]>('/messages/poll')
  }

  async getTopicMessages(topicId: string, limit: number = 50): Promise<Message[]> {
    return this.request<Message[]>(`/topics/${topicId}/messages?limit=${limit}`)
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
}

export const wttApi = new WTTApiClient(WTT_API_URL)
