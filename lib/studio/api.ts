import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'
import type { StudioBilling, StudioCloudAgent, StudioMessage, StudioTopic } from './types'

function headers(token?: string | null): HeadersInit {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

async function parseJson<T>(response: Response, fallback: string): Promise<T> {
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const detail = data && typeof data === 'object'
      ? ((data as { detail?: unknown; message?: unknown }).detail ?? (data as { message?: unknown }).message)
      : null
    throw new Error(typeof detail === 'string' ? detail : fallback)
  }
  return data as T
}

export async function fetchStudioBilling(token?: string | null) {
  const response = await fetch(`${CLIENT_WTT_API_BASE}/billing/me`, {
    headers: headers(token),
    cache: 'no-store',
  })
  return parseJson<StudioBilling>(response, 'Failed to load billing')
}

export async function fetchStudioCloudAgent(token?: string | null) {
  const response = await fetch(`${CLIENT_WTT_API_BASE}/cloud-agents/me?live=false`, {
    headers: headers(token),
    cache: 'no-store',
  })
  return parseJson<StudioCloudAgent>(response, 'Failed to load Cloud Agent')
}

export async function fetchStudioTopics(agentId: string, token?: string | null) {
  const response = await fetch(
    `${CLIENT_WTT_API_BASE}/topics/subscribed?agent_id=${encodeURIComponent(agentId)}&limit=5000`,
    { headers: headers(token), cache: 'no-store' },
  )
  return parseJson<StudioTopic[]>(response, 'Failed to load Studio projects')
}

export async function createStudioTopic(agentId: string, title: string, token?: string | null) {
  const response = await fetch(`${CLIENT_WTT_API_BASE}/topics/`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({
      name: `STUDIO: ${title.trim() || 'Untitled Site'}`,
      description: `WTT Studio project: ${title.trim() || 'Untitled Site'}`,
      type: 'discussion',
      visibility: 'private',
      join_method: 'invite_only',
      creator_agent_id: agentId,
    }),
  })
  return parseJson<StudioTopic>(response, 'Failed to create Studio project')
}

export async function fetchStudioMessages(topicId: string, agentId: string, token?: string | null) {
  const params = new URLSearchParams({ limit: '120', agent_id: agentId })
  const response = await fetch(`${CLIENT_WTT_API_BASE}/topics/${encodeURIComponent(topicId)}/messages?${params.toString()}`, {
    headers: headers(token),
    cache: 'no-store',
  })
  return parseJson<StudioMessage[]>(response, 'Failed to load Studio messages')
}

export async function sendStudioMessage(
  topicId: string,
  agentId: string,
  content: string,
  token?: string | null,
  metadata: Record<string, unknown> = {},
) {
  const response = await fetch(
    `${CLIENT_WTT_API_BASE}/topics/${encodeURIComponent(topicId)}/messages?agent_id=${encodeURIComponent(agentId)}`,
    {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify({
        content,
        content_type: 'text',
        semantic_type: 'post',
        sender_type: 'HUMAN',
        metadata: {
          source: 'wtt-studio',
          ...metadata,
        },
      }),
    },
  )
  return parseJson<StudioMessage>(response, 'Failed to send Studio message')
}
