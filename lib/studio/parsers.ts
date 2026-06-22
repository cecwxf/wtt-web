import type { StudioMessage, StudioProject, StudioProjectLinks, StudioTopic } from './types'

export const STUDIO_TOPIC_PREFIX = 'STUDIO:'

const MARKDOWN_LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi
const BARE_URL_RE = /https?:\/\/[^\s<>"')\]]+/gi

function cleanUrl(url: string) {
  return url.replace(/[),.;!?]+$/g, '')
}

export function isStudioTopic(topic: StudioTopic) {
  return String(topic.name || '').trim().toLowerCase().startsWith(STUDIO_TOPIC_PREFIX.toLowerCase())
}

export function studioTopicName(title: string) {
  const clean = String(title || '').trim().replace(/\s+/g, ' ')
  return `${STUDIO_TOPIC_PREFIX} ${clean || 'Untitled Site'}`
}

export function studioTitleFromTopicName(name?: string | null) {
  const raw = String(name || '').trim()
  if (raw.toLowerCase().startsWith(STUDIO_TOPIC_PREFIX.toLowerCase())) {
    return raw.slice(STUDIO_TOPIC_PREFIX.length).trim() || 'Untitled Site'
  }
  return raw || 'Untitled Site'
}

function scoreUrl(label: string, url: string): keyof StudioProjectLinks | '' {
  const text = `${label} ${url}`.toLowerCase()
  if (text.includes('github.com') && text.includes('/commit/')) return 'commitUrl'
  if (text.includes('github.com')) return 'githubRepoUrl'
  if (text.includes('published_site') || text.includes('published site') || text.includes('deploy') || text.includes('production')) {
    return 'publishedUrl'
  }
  if (
    text.includes('preview') ||
    text.includes('wtt-preview') ||
    text.includes('preview.ai-puppet.com') ||
    /\.preview\./.test(url)
  ) {
    return 'previewUrl'
  }
  return ''
}

export function extractStudioLinks(content?: string | null): StudioProjectLinks {
  const source = String(content || '')
  const links: StudioProjectLinks = {}

  MARKDOWN_LINK_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = MARKDOWN_LINK_RE.exec(source))) {
    const label = match[1] || ''
    const url = cleanUrl(match[2] || '')
    const key = scoreUrl(label, url)
    if (key && !links[key]) links[key] = url
  }

  BARE_URL_RE.lastIndex = 0
  while ((match = BARE_URL_RE.exec(source))) {
    const url = cleanUrl(match[0] || '')
    const key = scoreUrl('', url)
    if (key && !links[key]) links[key] = url
  }

  return links
}

export function projectFromTopic(topic: StudioTopic): StudioProject | null {
  const topicId = String(topic.topic_id || topic.id || '').trim()
  const topicName = String(topic.name || '').trim()
  if (!topicId || !isStudioTopic(topic)) return null
  const lastMessage = String(topic.latest_message_content || topic.last_message_content || '').trim()
  let memberAgentIds: string[] = []
  if (Array.isArray(topic.member_agent_ids)) {
    memberAgentIds = topic.member_agent_ids.map((agentId) => String(agentId || '').trim()).filter(Boolean)
  } else if (Array.isArray(topic.agent_ids)) {
    memberAgentIds = topic.agent_ids.map((agentId) => String(agentId || '').trim()).filter(Boolean)
  } else if (Array.isArray(topic.members)) {
    memberAgentIds = topic.members.map((member) => String(member.agent_id || '').trim()).filter(Boolean)
  }
  return {
    topicId,
    topicName,
    title: studioTitleFromTopicName(topicName),
    description: String(topic.description || '').trim(),
    topicType: String(topic.topic_type || topic.type || '').trim() || undefined,
    creatorAgentId: String(topic.creator_agent_id || '').trim() || undefined,
    memberAgentIds,
    createdAt: topic.created_at || undefined,
    updatedAt: topic.updated_at || topic.last_activity_at || topic.created_at || undefined,
    lastMessage: lastMessage || undefined,
    ...extractStudioLinks(lastMessage),
  }
}

export function enrichProjectWithMessages(project: StudioProject, messages: StudioMessage[]): StudioProject {
  const next: StudioProject = { ...project }
  for (const message of messages) {
    const content = String(message.content || '')
    const links = extractStudioLinks(content)
    if (links.previewUrl) next.previewUrl = links.previewUrl
    if (links.publishedUrl) next.publishedUrl = links.publishedUrl
    if (links.githubRepoUrl) next.githubRepoUrl = links.githubRepoUrl
    if (links.commitUrl) next.commitUrl = links.commitUrl
    if (content.trim()) {
      next.lastMessage = content.trim()
      next.updatedAt = message.timestamp || message.created_at || next.updatedAt
    }
  }
  return next
}

export function compactMessagePreview(content?: string | null, limit = 120) {
  const text = String(content || '').replace(/\s+/g, ' ').trim()
  if (!text) return 'No activity yet'
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text
}
