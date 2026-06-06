'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import useSWR from 'swr'
import { CLIENT_WTT_API_BASE, WS_BASE_URL } from '@/lib/api/base-url'
import { wttApi } from '@/lib/api/wtt-client'
import { useWebSocket, type WsMessage } from '@/lib/useWebSocket'
import { WttShellV2 } from '@/components/ui/wtt-shell-v2'
import { ChatView, ChatMessage, ChatModelConfig, ChatSendOptions, ChatRunStatus, isProgressMessage } from '@/components/ui/chat-view'
import { AgentItem } from '@/components/ui/agent-column'
import { AgentRuntimeInfo, TopicItem, type CloudAgentCreateOptions } from '@/components/ui/topic-column'
import { KeyboardShortcuts } from '@/components/ui/keyboard-shortcuts'
import type { ContentFormat } from '@/components/ui/content-editor'
import type { EditorTopic } from '@/components/ui/markdown-editor'
import { normalizeAndFilterAgents } from '@/lib/agents'
import { useAgentId, buildAgentUrl } from '@/lib/hooks/use-agent-id'
import { useI18n } from '@/lib/i18n-provider'
import { cacheKeyFromBase64, clearCachedKey, decryptReceived, encryptForSend, getCachedKey } from '@/lib/e2e-crypto'
import {
  getAgentRoleTemplate,
  roleTemplateFromPayload,
  serializeAgentRoleTemplate,
  type AgentRoleTemplate,
} from '@/lib/agent-role-templates'

const P2P_E2E_WEB_ENABLED = process.env.NEXT_PUBLIC_WTT_P2P_E2E === '1'
const AGENT_TYPING_STALE_MS = 15 * 60 * 1000
const AGENT_STATUS_CARD_MAX_LINES = 14
const AGENT_STATUS_COMPLETE_HOLD_MS = 4500
const TOPIC_MESSAGES_CACHE_TTL_MS = 10 * 60 * 1000

type TopicTypingState = {
  agentId: string
  agentName?: string
  statusText?: string
  statusKind?: string
  adapter?: string
  model?: string
  statusLines?: ChatRunStatus['lines']
  startedAt: number
  expiresAt: number
}

const ContentEditor = dynamic(
  () => import('@/components/ui/content-editor').then((m) => m.ContentEditor),
  { ssr: false },
)

interface Agent {
  id: string
  agent_id: string
  display_name: string
  is_primary: boolean
  api_key?: string
  invite_code?: string
  invite_status?: 'active' | 'none'
  binding_method?: string
  bound_via?: string
  is_cloud_sandbox?: boolean
  cloud_host_agent_id?: string
  role_template_id?: string
  role_template?: Record<string, unknown>
}

interface CloudAgentState {
  has_cloud_agent?: boolean
  agent_id?: string
  host_agent_id?: string
  status?: string
  provider?: string
  children?: Record<string, unknown>
  child_agents?: Array<{ agent_id?: string } | string>
  orchestrator_status?: {
    children?: Record<string, unknown>
    child_agents?: Array<{ agent_id?: string } | string>
  } | null
  sandbox_billing?: {
    active_minutes?: number
    estimated_rmb?: number
    currency?: string
    pricing_note?: string
    cloud_agent_usage?: {
      window_count?: number
      monthly_count?: number
      blocked_until?: string | null
    }
    entitlement?: {
      limits?: {
        window_limit?: number
        monthly_limit?: number
      }
    }
  }
}

type BillingMe = {
  entitlement?: {
    plan?: string
    limits?: {
      window_limit?: number
      monthly_limit?: number
    }
  }
  cloud_agent_usage?: {
    window_count?: number
    monthly_count?: number
    blocked_until?: string | null
  }
}

type WttConnectAdapter = 'codex' | 'claude-code' | 'gemini'

type AgentOperationJob = {
  job_id?: string
  operation_type?: string
  status?: string
  phase?: string
  result?: Record<string, unknown>
  error_message?: string
}

function cloudSandboxExpectedAgentIds(state: CloudAgentState | Record<string, unknown> | null | undefined, hostAgentId: string) {
  const ids = new Set<string>()
  const host = String(hostAgentId || '').trim()
  if (host) ids.add(host)
  const record = (state || {}) as CloudAgentState
  const addChildAgents = (items: CloudAgentState['child_agents']) => {
    if (!Array.isArray(items)) return
    for (const item of items) {
      const id = typeof item === 'string' ? item : String(item?.agent_id || '')
      if (id.trim()) ids.add(id.trim())
    }
  }
  const addChildren = (children?: Record<string, unknown>) => {
    if (!children || typeof children !== 'object') return
    for (const id of Object.keys(children)) {
      if (id.trim()) ids.add(id.trim())
    }
  }
  addChildren(record.children)
  addChildAgents(record.child_agents)
  addChildren(record.orchestrator_status?.children)
  addChildAgents(record.orchestrator_status?.child_agents)
  return Array.from(ids)
}

function topicMessagesCacheKey(topicId?: string | null, agentId?: string | null): string {
  return `wtt:topic-messages:v1:${topicId || ''}:${agentId || ''}`
}

function readCachedTopicMessages(topicId?: string | null, agentId?: string | null): unknown[] | undefined {
  if (typeof window === 'undefined' || !topicId || !agentId) return undefined
  try {
    const raw = window.sessionStorage.getItem(topicMessagesCacheKey(topicId, agentId))
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as { ts?: number; data?: unknown }
    if (!parsed?.ts || Date.now() - parsed.ts > TOPIC_MESSAGES_CACHE_TTL_MS) return undefined
    return Array.isArray(parsed.data) ? parsed.data : undefined
  } catch {
    return undefined
  }
}

function writeCachedTopicMessages(topicId?: string | null, agentId?: string | null, data?: unknown): void {
  if (typeof window === 'undefined' || !topicId || !agentId || !Array.isArray(data)) return
  try {
    window.sessionStorage.setItem(topicMessagesCacheKey(topicId, agentId), JSON.stringify({ ts: Date.now(), data }))
  } catch {
    // Ignore quota/private-mode storage failures.
  }
}

function normalizeWttConnectAdapter(raw: unknown): WttConnectAdapter | '' {
  const value = String(raw || '').trim().toLowerCase()
  if (value === 'codex') return 'codex'
  if (value === 'claude' || value === 'claude-code' || value === 'claude_code') return 'claude-code'
  if (value === 'gemini' || value === 'gemini-cli') return 'gemini'
  return ''
}

function adapterDisplayName(raw: unknown): string {
  const adapter = normalizeWttConnectAdapter(raw)
  if (adapter === 'codex') return 'Codex'
  if (adapter === 'claude-code') return 'Claude Code'
  if (adapter === 'gemini') return 'Gemini'
  return 'Agent'
}

function responseErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === 'object') {
    const detail = (data as { detail?: unknown; message?: unknown }).detail ?? (data as { message?: unknown }).message
    if (detail) return formatErrorDetail(detail, fallback)
  }
  return fallback
}

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

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function fetchJsonWithTimeout(input: string, init: RequestInit, timeoutMs = 25_000): Promise<{ response: Response; data: unknown }> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(input, { ...init, signal: controller.signal })
    const data = await response.json().catch(() => ({}))
    return { response, data }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`)
    }
    throw error
  } finally {
    window.clearTimeout(timer)
  }
}

function isRetryableOperationStatus(status: number): boolean {
  return status === 408 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504
}

function isRetryableOperationError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    return message.includes('timed out') || message.includes('failed to fetch') || message.includes('network')
  }
  return false
}

function newClientOperationId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`
  }
}

function getHumanSender(session: unknown): string {
  const s = session as { userId?: string; user?: { name?: string | null; email?: string | null } } | null | undefined
  const uid = s?.userId || ''
  return s?.user?.name || s?.user?.email || (uid ? `user_${uid.slice(0, 8)}` : 'user_default')
}

function agentRoleDisplayLabel(role?: AgentRoleTemplate | null): string {
  if (!role || role.id === 'general') return ''
  return String(role.shortLabel || role.label || '').trim()
}

function normalizeSenderType(
  rawType: unknown,
  senderId?: string,
  knownAgentIds?: Set<string>,
  senderDisplayName?: string,
): 'human' | 'agent' {
  const t = String(rawType ?? '').trim().toLowerCase()
  if (t === 'human' || t === 'user' || t === 'person') return 'human'
  if (t === 'agent' || t === 'bot' || t === 'assistant' || t === 'system') return 'agent'

  const sid = String(senderId ?? '').trim()
  const sidLower = sid.toLowerCase()

  if (knownAgentIds?.has(sid)) return 'agent'
  if (sidLower.startsWith('agent_') || sidLower.startsWith('agent-')) return 'agent'

  if (sidLower.startsWith('user_') || sidLower.startsWith('human_')) return 'human'
  if (/^\d{5,}$/.test(sid)) return 'human'

  const name = String(senderDisplayName ?? '').trim().toLowerCase()
  if (name.startsWith('user ') || name.startsWith('wtt user') || name.includes('群众')) return 'human'

  return 'agent'
}

function stripSourceMarker(content: string): string {
  const text = String(content || '')
  if (!text.startsWith('┌─ 来源标识')) return text
  const markerEnd = text.indexOf('\n└────────────────────\n')
  if (markerEnd === -1) return text
  return text.slice(markerEnd + '\n└────────────────────\n'.length)
}

function shouldDisplayMessage(semanticTypeRaw: unknown, contentRaw: unknown): boolean {
  const semantic = String(semanticTypeRaw ?? '').trim().toLowerCase()
  if (semantic === 'system' || semantic === 'notification' || semantic === 'command') return false

  const content = String(contentRaw ?? '')
  if (!content.trim()) return false
  if (content.includes('[system:p2p_init]')) return false
  if (content.includes('[System] P2P channel established')) return false
  if (isProgressMessage(content)) return false

  return true
}

function clearTypingAfterAgentReply(
  prev: Record<string, TopicTypingState>,
  topicId: string,
  agentId?: string,
  messageTimestamp?: string,
): Record<string, TopicTypingState> {
  const existing = prev[topicId]
  if (!existing) return prev
  if (agentId && existing.agentId && existing.agentId !== agentId) return prev

  if (messageTimestamp) {
    const messageTime = new Date(messageTimestamp).getTime()
    if (Number.isFinite(messageTime) && messageTime + 2000 < existing.startedAt) return prev
  }

  const now = Date.now()
  return {
    ...prev,
    [topicId]: appendTypingStatus(existing, {
      agentId: agentId || existing.agentId,
      statusText: 'Agent 已回复',
      statusKind: 'response',
      ttlMs: AGENT_STATUS_COMPLETE_HOLD_MS,
    }, now),
  }
}

function appendTypingStatus(
  existing: TopicTypingState | undefined,
  update: {
    agentId?: string
    agentName?: string
    statusText?: string
    statusKind?: string
    adapter?: string
    model?: string
    ttlMs?: number
  },
  now: number,
): TopicTypingState {
  const text = String(update.statusText || '').trim()
  const kind = String(update.statusKind || '').trim() || undefined
  const lines = existing?.statusLines ? [...existing.statusLines] : []

  if (text) {
    const last = lines[lines.length - 1]
    if (last && last.text === text && last.kind === kind) {
      lines[lines.length - 1] = { ...last, ts: now }
    } else {
      lines.push({
        id: `${now}-${lines.length}-${kind || 'status'}`,
        text,
        kind,
        ts: now,
      })
    }
  }

  return {
    agentId: update.agentId || existing?.agentId || '',
    agentName: update.agentName || existing?.agentName,
    statusText: text || existing?.statusText,
    statusKind: kind || existing?.statusKind,
    adapter: update.adapter || existing?.adapter,
    model: update.model || existing?.model,
    statusLines: lines.slice(-AGENT_STATUS_CARD_MAX_LINES),
    startedAt: existing?.startedAt || now,
    // Safety fallback only. Normal lifecycle is cleared by the agent reply.
    expiresAt: now + (update.ttlMs || AGENT_TYPING_STALE_MS),
  }
}

function collectNestedRecords(value: unknown, out: Record<string, unknown>[] = [], depth = 0): Record<string, unknown>[] {
  if (!value || typeof value !== 'object' || depth > 3) return out
  const record = value as Record<string, unknown>
  out.push(record)
  for (const key of ['payload', 'data', 'event', 'item', 'message', 'delta', 'metadata', 'detail']) {
    collectNestedRecords(record[key], out, depth + 1)
  }
  return out
}

function eventString(record: Record<string, unknown>, keys: string[]): string {
  const records = collectNestedRecords(record)
  for (const key of keys) {
    for (const source of records) {
      const value = source[key]
      if (value == null) continue
      if (typeof value === 'string' && value.trim()) return value.trim()
      if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    }
  }
  return ''
}

function statusTextFromTypingEvent(record: Record<string, unknown>): string | undefined {
  const direct = eventString(record, ['status_text', 'statusText', 'activity_text', 'activityText', 'message', 'detail', 'text', 'summary', 'description', 'progress'])
  if (direct) return direct
  const command = eventString(record, ['command', 'cmd', 'shell_command'])
  if (command) return `执行命令：${command}`
  const tool = eventString(record, ['tool', 'tool_name', 'toolName', 'name'])
  if (tool) return `调用工具：${tool}`
  const phase = eventString(record, ['phase', 'stage', 'step', 'status'])
  if (phase) return `阶段：${phase}`
  return undefined
}

function statusKindFromTypingEvent(record: Record<string, unknown>): string | undefined {
  return eventString(record, ['status_kind', 'statusKind', 'kind', 'event_kind', 'eventKind', 'phase', 'type', 'status']) || undefined
}

function statusFromProgressMessage(contentRaw: unknown, adapterRaw?: unknown): { text: string; kind: string } | null {
  const content = String(contentRaw || '').trim()
  if (!content.startsWith('[TASK_STATUS]')) return null
  const action = content.match(/\baction=([^\n\r]+)/)?.[1]?.trim() || ''
  const status = content.match(/\bstatus=([^\s\n\r]+)/)?.[1]?.trim() || ''
  if (!action && !status) return null

  const [group, detail = ''] = action.split(/:(.+)/)
  const kind = group || status || 'running'
  const actor = adapterDisplayName(adapterRaw)
  if (group === 'session') {
    if (detail.includes('thread.started') || detail.includes('turn.started')) {
      return { text: `${actor} 会话已启动`, kind: 'session' }
    }
    if (detail.includes('completed')) return { text: `${actor} 会话已完成`, kind: 'session' }
    return { text: `${actor} 会话状态：${detail || status}`, kind: 'session' }
  }
  if (group === 'response') {
    const output = detail.trim()
    return { text: output ? `${actor} 输出：${output.slice(0, 120)}` : `${actor} 正在输出`, kind: 'response' }
  }
  if (group === 'command') return { text: `${actor} 执行命令：${detail || status}`, kind: 'command' }
  if (group === 'tool') return { text: `${actor} 调用工具：${detail || status}`, kind: 'tool' }
  return { text: `Agent 状态：${action || status}`, kind }
}

function shouldHideFeedTopic(topic: Record<string, unknown>): boolean {
  const name = String(topic.name || '').trim()
  const description = String(topic.description || '').trim()
  const creatorAgentId = String(topic.creator_agent_id || topic.creatorAgentId || '').trim()
  const originType = String(topic.origin_type || topic.originType || '').toLowerCase()
  const searchable = `${name}\n${description}\n${originType}\n${creatorAgentId}\n${collectTopicSearchText(topic)}`.toLowerCase()

  // Arena and Square topics have gone through a few naming/metadata revisions.
  // Keep the filter intentionally redundant so older subscribed rows disappear too.
  if (creatorAgentId === 'agent-16a45cf0dd8b') return true
  if (name === 'Arena Coach' || name.startsWith('Arena Coach:')) return true
  if (description.includes('Private Arena Coach chat')) return true
  if (
    searchable.includes('arena') ||
    searchable.includes('challenge_id') ||
    searchable.includes('challenge_slug') ||
    searchable.includes('/arena/')
  ) return true

  if (name.startsWith('__SQUARE__/')) return true
  if (name.startsWith('若水广场｜') || name.startsWith('若水专文｜')) return true
  if (name.startsWith('知乎精选：')) return true
  if (description.startsWith('[若水广场:')) return true
  if (searchable.includes('若水广场') || searchable.includes('__square__')) return true
  if (originType === 'column' || originType === 'human_post' || originType.includes('square')) return true

  const squareFlags = [
    'square',
    'is_square',
    'square_post',
    'square_topic',
    'squarePost',
    'squareTopic',
  ]
  if (squareFlags.some((key) => Boolean(topic[key]))) return true

  const meta = topic.metadata || topic.msg_metadata || topic.meta
  if (typeof meta === 'string' && meta.toLowerCase().includes('"square"')) return true
  if (meta && typeof meta === 'object' && Boolean((meta as Record<string, unknown>).square)) return true

  return false
}

type RawTopicRecord = {
  id?: string
  topic_id?: string
  name?: string
  description?: string
  type?: string
  topic_type?: string
  my_role?: string
  task_id?: string
  runner_agent_id?: string
  task_type?: string
  task_mode?: string
  exec_mode?: string
  last_activity_at?: string
  creator_agent_id?: string
  unread_count?: number
  member_agent_ids?: string[]
}

function mapRawTopicToItem(
  topic: RawTopicRecord,
  options?: { selectedAgentId?: string; humanSender?: string; p2pTopicByAgentId?: Record<string, string> },
): TopicItem {
  const topicId = String(topic.id || topic.topic_id || '').trim()
  const topicType = String(topic.type || topic.topic_type || 'discussion').toLowerCase() as TopicItem['topic_type']
  const selectedAgentId = options?.selectedAgentId || ''
  const humanSender = options?.humanSender || ''
  const p2pTopicByAgentId = options?.p2pTopicByAgentId || {}
  const isDefaultP2P =
    topicType === 'p2p' &&
    !!selectedAgentId &&
    (
      p2pTopicByAgentId[selectedAgentId] === topicId ||
      (String(topic.name || '').includes(selectedAgentId) && String(topic.name || '').includes(humanSender))
    )

  return {
    topic_id: topicId,
    name: String(topic.name || topicId || 'Topic'),
    topic_type: topicType,
    unread_count: Number(topic.unread_count || 0),
    can_delete: topic.my_role === 'owner' || topic.my_role === 'admin',
    task_id: topic.task_id,
    task_type: topic.task_type ? String(topic.task_type) : undefined,
    task_mode: topic.task_mode ? String(topic.task_mode) : undefined,
    exec_mode: topic.exec_mode ? String(topic.exec_mode) : undefined,
    runner_agent_id: topic.runner_agent_id,
    is_default_p2p: isDefaultP2P,
    last_activity_at: topic.last_activity_at || '',
    description: topic.description,
    creator_agent_id: topic.creator_agent_id,
    member_agent_ids: Array.isArray(topic.member_agent_ids) ? topic.member_agent_ids.map(String).filter(Boolean) : undefined,
  }
}

function isDiscussionGroupTopicItem(topic: TopicItem) {
  const name = String(topic.name || '').trim()
  const description = String(topic.description || '').toLowerCase()
  if (!['discussion', 'collaborative'].includes(topic.topic_type)) return false
  if (topic.task_id || topic.task_type || topic.task_mode || topic.exec_mode || topic.runner_agent_id) return false
  if (/^TASK-[a-f0-9]{8}\b/i.test(name)) return false
  if (description.includes('general task') || description.includes('task_id') || description.includes('task type')) return false
  return true
}

function collectTopicSearchText(value: unknown, depth = 0): string {
  if (value == null || depth > 3) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map((item) => collectTopicSearchText(item, depth + 1)).join('\n')
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${key}:${collectTopicSearchText(item, depth + 1)}`)
      .join('\n')
  }
  return ''
}

function toChatTaskType(taskTypeRaw?: string, taskModeRaw?: string, execModeRaw?: string): 'code' | 'research' | 'general' | null {
  const raw = `${String(taskTypeRaw || '').toLowerCase()} ${String(taskModeRaw || '').toLowerCase()} ${String(execModeRaw || '').toLowerCase()}`
  if (raw.includes('research')) return 'research'
  if (raw.includes('code')) return 'code'
  if (raw.includes('general')) return 'general'
  return null
}

function parseModelHintFromMetadata(metaRaw: unknown): { model_hint?: string; reasoning_hint?: 'off' | 'low' | 'medium' | 'high' } {
  let meta: Record<string, unknown> | null = null

  if (metaRaw && typeof metaRaw === 'object') {
    meta = metaRaw as Record<string, unknown>
  } else if (typeof metaRaw === 'string' && metaRaw.trim()) {
    try {
      const parsed = JSON.parse(metaRaw)
      if (parsed && typeof parsed === 'object') meta = parsed as Record<string, unknown>
    } catch {
      // ignore malformed metadata
    }
  }

  if (!meta) return {}

  const cfgRaw = meta.model_config
  const cfg = (cfgRaw && typeof cfgRaw === 'object') ? (cfgRaw as Record<string, unknown>) : null
  if (!cfg) return {}

  const model = String(cfg.model || '').trim()
  const effortRaw = String(cfg.reasoning_effort || cfg.reasoningEffort || '').trim().toLowerCase()
  const reasoning = (['off', 'low', 'medium', 'high'].includes(effortRaw)
    ? effortRaw
    : '') as '' | 'off' | 'low' | 'medium' | 'high'

  return {
    ...(model ? { model_hint: model } : {}),
    ...(reasoning ? { reasoning_hint: reasoning } : {}),
  }
}

function normalizeFeed(raw: unknown, knownAgentIds?: Set<string>): ChatMessage[] {
  if (!raw || typeof raw !== 'object') return []

  const rows = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { messages?: unknown[] }).messages)
      ? (raw as { messages: unknown[] }).messages
      : []

  const normalized: ChatMessage[] = []

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index]
    const data = row as Record<string, unknown>
    const semanticType = String(data.semantic_type ?? '')
    const cleanedContent = stripSourceMarker(String(data.content ?? ''))
    if (!shouldDisplayMessage(semanticType, cleanedContent)) continue

    const senderId = String(data.sender_id ?? 'unknown')
    const senderDisplayName = data.sender_display_name ? String(data.sender_display_name) : undefined
    const modelHint = parseModelHintFromMetadata(data.metadata)
    normalized.push({
      message_id: String(data.message_id ?? data.id ?? `msg-${index}`),
      topic_id: String(data.topic_id ?? ''),
      sender_id: senderId,
      sender_display_name: senderDisplayName,
      sender_type: normalizeSenderType(data.sender_type, senderId, knownAgentIds, senderDisplayName),
      sender_avatar_url: data.sender_avatar_url ? String(data.sender_avatar_url) : undefined,
      content: cleanedContent,
      encrypted: Boolean(data.encrypted),
      timestamp: String(data.timestamp ?? data.created_at ?? new Date().toISOString()),
      semantic_type: semanticType,
      task_id: data.task_id ? String(data.task_id) : undefined,
      task_status: data.task_status ? String(data.task_status) : undefined,
      task_title: data.task_title ? String(data.task_title) : undefined,
      runner_agent_id: data.runner_agent_id ? String(data.runner_agent_id) : undefined,
      exec_mode: data.exec_mode ? String(data.exec_mode) : undefined,
      reply_to: data.reply_to ? String(data.reply_to) : undefined,
      ...modelHint,
    })
  }

  return normalized
}

function feedRows(raw: unknown): Record<string, unknown>[] {
  if (!raw || typeof raw !== 'object') return []
  const rows = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { messages?: unknown[] }).messages)
      ? (raw as { messages: unknown[] }).messages
      : []
  return rows.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'))
}

export default function FeedPageWrapper() {
  return (
    <Suspense fallback={null}>
      <FeedPageInner />
    </Suspense>
  )
}

// Inline member row
function MemberRow({ member, isSelf, onRequestPrivateDiscuss }: {
  member: { agent_id: string; display_name: string }
  isSelf: boolean
  onRequestPrivateDiscuss?: (targetAgentId: string, targetDisplayName: string) => void
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-600 dark:text-zinc-300 border-b border-slate-100 dark:border-zinc-700 last:border-b-0" title={member.agent_id}>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{member.display_name}</div>
        <div className="truncate text-[10px] text-slate-400 dark:text-zinc-500">{member.agent_id}</div>
      </div>
      {!isSelf && onRequestPrivateDiscuss && (
        <button
          onClick={(e) => { e.stopPropagation(); onRequestPrivateDiscuss(member.agent_id, member.display_name) }}
          className="rounded bg-slate-100 dark:bg-zinc-700 px-1.5 py-0.5 text-[10px] text-slate-500 dark:text-zinc-400 transition hover:bg-slate-200 dark:hover:bg-zinc-600 shrink-0"
          title={`Request private discuss with ${member.display_name}`}
        >
          💬
        </button>
      )}
    </div>
  )
}

function FeedPageInner() {
  const { data: session, status } = useSession()
  const { t } = useI18n()
  const router = useRouter()
  const [agents, setAgents] = useState<Agent[]>([])
  const [agentsLoaded, setAgentsLoaded] = useState(false)
  const [selectedAgentId, setSelectedAgentId] = useAgentId()
  const [agentRoleMap, setAgentRoleMap] = useState<Record<string, string>>({})
  const [agentRoleTemplateMap, setAgentRoleTemplateMap] = useState<Record<string, AgentRoleTemplate>>({})
  const [selectedTopicId, _setSelectedTopicId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('wtt_selected_topic_id') || null
    }
    return null
  })
  const [p2pTopicByAgentId, setP2pTopicByAgentId] = useState<Record<string, string>>({})
  const setSelectedTopicId = useCallback((id: string | null) => {
    _setSelectedTopicId(id)
    try {
      if (id) localStorage.setItem('wtt_selected_topic_id', id)
      else localStorage.removeItem('wtt_selected_topic_id')
    } catch {}
  }, [])
  const [composerFocusNonce, setComposerFocusNonce] = useState(0)
  const [pendingComposerFocusTopicId, setPendingComposerFocusTopicId] = useState<string | null>(null)
  const [allMessages, setAllMessages] = useState<ChatMessage[]>([])
  const [typingByTopic, setTypingByTopic] = useState<Record<string, TopicTypingState>>({})
  const typingBaselineAgentMessageIdsRef = useRef<Record<string, Set<string>>>({})
  // Cache successful decrypt results by message_id + ciphertext to avoid repeated CPU work.
  const decryptCacheRef = useRef<Map<string, string>>(new Map())
  // Keep feed polling fallback enabled only when realtime WS is not healthy.
  const [wsConnectedForPoll, setWsConnectedForPoll] = useState(false)
  const [hasOlder, setHasOlder] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem('wtt:feed-agent-role-map')
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') setAgentRoleMap(parsed as Record<string, string>)
    } catch {
      // ignore local role-map errors
    }
  }, [])

  const persistAgentRole = useCallback((agentId: string, role: AgentRoleTemplate) => {
    setAgentRoleMap((prev) => {
      const next = { ...prev, [agentId]: role.id }
      if (role.id === 'general') delete next[agentId]
      try {
        localStorage.setItem('wtt:feed-agent-role-map', JSON.stringify(next))
      } catch {
        // ignore local storage failures
      }
      return next
    })
    setAgentRoleTemplateMap((prev) => {
      const next = { ...prev }
      if (role.id === 'general') delete next[agentId]
      else next[agentId] = role
      return next
    })
    if (session?.accessToken) {
      fetch(`${CLIENT_WTT_API_BASE}/agents/${encodeURIComponent(agentId)}/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}` },
        body: JSON.stringify({
          role_template_id: role.id === 'general' ? '' : role.id,
          role_template: role.id === 'general' ? {} : serializeAgentRoleTemplate(role),
        }),
      })
        .then((res) => {
          if (res.ok) {
            setAgents((prev) => prev.map((agent) => (
              agent.agent_id === agentId
                ? {
                    ...agent,
                    role_template_id: role.id === 'general' ? '' : role.id,
                    role_template: role.id === 'general' ? {} : serializeAgentRoleTemplate(role),
                  }
                : agent
            )))
          }
        })
        .catch(() => {})
    }
  }, [session?.accessToken])

  const handleAssignAgentRole = useCallback((agentId: string, roleId: string) => {
    persistAgentRole(agentId, getAgentRoleTemplate(roleId))
  }, [persistAgentRole])

  const handleSaveAgentRole = useCallback((agentId: string, role: AgentRoleTemplate) => {
    persistAgentRole(agentId, role)
  }, [persistAgentRole])

  const [kbLoading, setKbLoading] = useState(false)
  const handleOpenKnowledgeRoot = useCallback(async () => {
    if (kbLoading) return
    if (!session?.accessToken) {
      alert('Please log in first')
      return
    }
    setKbLoading(true)
    try {
      const resp = await fetch(`${CLIENT_WTT_API_BASE}/kb/personal`, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      })
      if (!resp.ok) {
        const errText = await resp.text().catch(() => '')
        console.error('KB personal error:', resp.status, errText)
        alert(`Failed to open Knowledge Root (${resp.status})`)
        return
      }
      const kb = await resp.json()
      if (kb?.id) {
        router.push(`/tasks/kb/${kb.id}`)
      } else {
        alert('Failed to create Knowledge Root')
      }
    } catch (e) {
      console.error('KB redirect failed:', e)
      alert('Network error opening Knowledge Root')
    } finally {
      setKbLoading(false)
    }
  }, [session?.accessToken, router, kbLoading])
  const [membersOpen, setMembersOpen] = useState(false)
  const [inviteMemberOpen, setInviteMemberOpen] = useState(false)
  const [inviteAgentId, setInviteAgentId] = useState('')
  const [invitingMember, setInvitingMember] = useState(false)
  const [forceOpenSettingsPage, setForceOpenSettingsPage] = useState<'binding' | 'profile' | 'membership' | null>(null)
  const lastReadSyncRef = useRef<{ topicId: string; ts: number } | null>(null)
  // Track newly created task that needs rename on first message
  const pendingRenameTaskRef = useRef<{ taskId: string; topicId: string } | null>(null)
  // Track active worker session context for persona injection
  const activeWorkerSessionRef = useRef<{
    workerId: string
    personaMd: string
    workerMd: string
    isFirstSession: boolean
    personaChanged: boolean
    topicId: string
  } | null>(null)

  const loadAgents = useCallback(async () => {
    try {
      const response = await fetch(`${CLIENT_WTT_API_BASE}/agents/my`, {
        headers: {
          Authorization: `Bearer ${session?.accessToken ?? ''}`,
        },
      })

      if (!response.ok) return

      const data = await response.json()
      const list = normalizeAndFilterAgents(data)
      setAgents(list)

      const storedRoleMap: Record<string, string> = {}
      try {
        const rawRoleMap = localStorage.getItem('wtt:feed-agent-role-map')
        const parsedRoleMap = rawRoleMap ? JSON.parse(rawRoleMap) : null
        if (parsedRoleMap && typeof parsedRoleMap === 'object') {
          for (const [agentId, roleId] of Object.entries(parsedRoleMap)) {
            if (typeof roleId === 'string') storedRoleMap[agentId] = roleId
          }
        }
      } catch {
        // ignore local role-map errors
      }

      const nextRoleMap = { ...storedRoleMap }
      const nextRoleTemplateMap: Record<string, AgentRoleTemplate> = {}
      const roleMigrations: Array<{ agentId: string; role: ReturnType<typeof getAgentRoleTemplate> }> = []
      for (const agent of list) {
        if (agent.role_template_id) {
          nextRoleMap[agent.agent_id] = agent.role_template_id
          nextRoleTemplateMap[agent.agent_id] = roleTemplateFromPayload(agent.role_template_id, agent.role_template)
          continue
        }

        const localRoleId = nextRoleMap[agent.agent_id]
        const localRole = localRoleId ? getAgentRoleTemplate(localRoleId) : null
        if (localRole && localRole.id !== 'general') {
          roleMigrations.push({ agentId: agent.agent_id, role: localRole })
          continue
        }

        delete nextRoleMap[agent.agent_id]
      }
      setAgentRoleMap(nextRoleMap)
      setAgentRoleTemplateMap(nextRoleTemplateMap)
      try {
        localStorage.setItem('wtt:feed-agent-role-map', JSON.stringify(nextRoleMap))
      } catch {
        // ignore local storage failures
      }
      if (session?.accessToken && roleMigrations.length > 0) {
        for (const item of roleMigrations) {
          fetch(`${CLIENT_WTT_API_BASE}/agents/${encodeURIComponent(item.agentId)}/profile`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}` },
            body: JSON.stringify({
              role_template_id: item.role.id,
              role_template: serializeAgentRoleTemplate(item.role),
            }),
          }).catch(() => {})
        }
      }

      const fallback = list[0]

      if (fallback) {
        // Only override if current selection is empty or no longer valid
        if (!selectedAgentId || !list.some((a) => a.agent_id === selectedAgentId)) {
          setSelectedAgentId(fallback.agent_id)
        }
        if (fallback.api_key) {
          wttApi.setToken(fallback.api_key)
        }
      }
    } catch {
      // Keep page resilient
    } finally {
      setAgentsLoaded(true)
    }
  }, [selectedAgentId, session?.accessToken, setSelectedAgentId])

  // Lookup map: agent_id → display_name (for enriching chat messages)
  const agentNameMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const a of agents) map[a.agent_id] = a.display_name
    return map
  }, [agents])

  const knownAgentIds = useMemo(() => new Set(agents.map((a) => a.agent_id)), [agents])
  const cloudSandboxAgentIds = useMemo(() => {
    const ids = new Set<string>()
    for (const agent of agents) {
      const hostId = String(agent.cloud_host_agent_id || '').trim()
      if (agent.is_cloud_sandbox || hostId) {
        ids.add(agent.agent_id)
        if (hostId) ids.add(hostId)
      }
    }
    return ids
  }, [agents])

  const agentRoleLabelMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const agent of agents) {
      const role = agentRoleTemplateMap[agent.agent_id] || getAgentRoleTemplate(agentRoleMap[agent.agent_id])
      const label = agentRoleDisplayLabel(role)
      if (label) map[agent.agent_id] = label
    }
    return map
  }, [agents, agentRoleMap, agentRoleTemplateMap])

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
      return
    }

    if (status !== 'authenticated') {
      return
    }

    loadAgents()
  }, [status, router, loadAgents])

  useEffect(() => {
    const selected = agents.find((agent) => agent.agent_id === selectedAgentId)
    if (selected?.api_key) {
      wttApi.setToken(selected.api_key)
    }
  }, [agents, selectedAgentId])

  const { data: feedRaw, error, mutate } = useSWR(
    selectedAgentId && session?.accessToken && selectedTopicId ? ['topic-messages', selectedTopicId, selectedAgentId, session.accessToken] : null,
    async () => {
      const response = await fetch(`${CLIENT_WTT_API_BASE}/topics/${selectedTopicId}/messages?limit=100&agent_id=${encodeURIComponent(selectedAgentId)}`, {
        headers: {
          Authorization: `Bearer ${session?.accessToken}`,
        },
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ detail: `HTTP ${response.status}` }))
        throw new Error(responseErrorMessage(payload, `HTTP ${response.status}`))
      }

      return response.json()
    },
    {
      // WS-first: disable regular polling when websocket is healthy.
      // Keep 5s fallback only while WS is disconnected/unhealthy.
      refreshInterval: wsConnectedForPoll ? 0 : 5000,
      dedupingInterval: 10000,
      revalidateOnFocus: false,
      keepPreviousData: true,
      fallbackData: readCachedTopicMessages(selectedTopicId, selectedAgentId),
      onSuccess: (data) => writeCachedTopicMessages(selectedTopicId, selectedAgentId, data),
    }
  )

  // WebSocket for real-time messages
  const wsUrl = selectedAgentId ? `${WS_BASE_URL}/ws/${selectedAgentId}?client=web` : ''
  const subscribedTopicsRef = useRef<{ raw: unknown[] | null; mutate: (data?: unknown, revalidate?: boolean) => void }>({ raw: null, mutate: () => {} })
  const decryptMessageForDisplay = useCallback(async (message: ChatMessage): Promise<ChatMessage> => {
    if (!message.encrypted) return message

    const cacheKey = `${message.message_id}:${message.content}`
    const cached = decryptCacheRef.current.get(cacheKey)
    if (cached !== undefined) {
      return { ...message, content: cached }
    }

    const dec = await decryptReceived(message.content, true)
    // Cache only successful decrypts so key bootstrap can recover locked messages immediately.
    if (!dec.decryptFailed) {
      decryptCacheRef.current.set(cacheKey, dec.text)
      if (decryptCacheRef.current.size > 5000) {
        const firstKey = decryptCacheRef.current.keys().next().value
        if (firstKey) decryptCacheRef.current.delete(firstKey)
      }
    }
    return { ...message, content: dec.text }
  }, [])

  const decryptMessagesForDisplay = useCallback(async (messages: ChatMessage[]): Promise<ChatMessage[]> => {
    return Promise.all(messages.map((m) => decryptMessageForDisplay(m)))
  }, [decryptMessageForDisplay])

  const handleWsMessage = useCallback(
    (msg: WsMessage) => {
      const rawEvent = msg as unknown as Record<string, unknown>

      if (rawEvent.type === 'typing') {
        const topicId = String(rawEvent.topic_id || '')
        if (!topicId) return

        const state = String(rawEvent.state || 'start').toLowerCase()
        if (state === 'stop') {
          // Agent-side stop events can arrive before the actual reply is persisted
          // and pushed to Web. Keep the indicator until a real agent message arrives.
          return
        }

        const agentId = String(rawEvent.agent_id || '')
        const agentName = String(rawEvent.agent_display_name || '') || agentNameMap[agentId] || undefined
        const statusText = statusTextFromTypingEvent(rawEvent)
        const statusKind = statusKindFromTypingEvent(rawEvent)
        const adapter = String(rawEvent.adapter || '').trim() || undefined
        const model = String(rawEvent.model || rawEvent.model_id || rawEvent.current_model || '').trim() || undefined
        const ttlMsRaw = Number(rawEvent.ttl_ms || 0)
        const ttlMs = Number.isFinite(ttlMsRaw) && ttlMsRaw > 0 ? Math.max(ttlMsRaw, 30000) : undefined

        const now = Date.now()
        setTypingByTopic((prev) => ({
          ...prev,
          [topicId]: appendTypingStatus(prev[topicId], {
            agentId,
            agentName,
            statusText,
            statusKind,
            adapter,
            model,
            ttlMs,
          }, now),
        }))
        return
      }

      if (rawEvent.type === 'task_status') {
        const topicId = String(rawEvent.topic_id || '')
        const status = String(rawEvent.status || '').toLowerCase()
        if (!topicId || !status) return

        const taskId = String(rawEvent.task_id || '')
        const title = String(rawEvent.title || '')
        const runnerAgentId = String(rawEvent.runner_agent_id || rawEvent.owner_agent_id || '') || undefined
        const senderId = runnerAgentId || 'task-system'
        const senderName = runnerAgentId ? (agentNameMap[runnerAgentId] || runnerAgentId) : 'Task System'

        const statusMsgId = `ws-task-status:${taskId || topicId}:${status}`
        const synthetic: ChatMessage = {
          message_id: statusMsgId,
          sender_id: senderId,
          sender_display_name: senderName,
          sender_type: 'agent',
          content: '',
          timestamp: new Date().toISOString(),
          semantic_type: 'task_status',
          task_id: taskId || undefined,
          task_status: status,
          task_title: title || undefined,
          runner_agent_id: runnerAgentId,
          exec_mode: rawEvent.exec_mode ? String(rawEvent.exec_mode) : undefined,
        }

        if (topicId === selectedTopicId) {
          setAllMessages((prev) => {
            const idx = prev.findIndex((m) => m.message_id === statusMsgId)
            if (idx >= 0) {
              const next = [...prev]
              next[idx] = { ...next[idx], ...synthetic }
              return next
            }
            return [...prev, synthetic]
          })
        }

        return
      }

      if (msg.type !== 'new_message' || !msg.message) return
      const incomingTopicId = msg.message.topic_id

      const semanticType = String((msg.message as Record<string, unknown>).semantic_type ?? '')
      const rawContent = String((msg.message as Record<string, unknown>).content ?? '')
      const cleanedContent = stripSourceMarker(rawContent)
      const displayable = shouldDisplayMessage(semanticType, cleanedContent)

      // Bump activity and unread counters for the topic that received the message.
      const { raw, mutate: mutateSubs } = subscribedTopicsRef.current
      if (raw && Array.isArray(raw)) {
        const now = new Date().toISOString()
        mutateSubs(
          raw.map((t) => {
            const rec = t as Record<string, unknown>
            if (rec.id !== incomingTopicId) return t

            const currentUnread = Number(rec.unread_count || 0)
            if (incomingTopicId === selectedTopicId) {
              return { ...rec, last_activity_at: now, unread_count: 0 }
            }
            return {
              ...rec,
              last_activity_at: now,
              unread_count: displayable ? currentUnread + 1 : currentUnread,
            }
          }),
          false,
        )
      }

      if (incomingTopicId !== selectedTopicId) return
      if (cleanedContent.trim().startsWith('[TASK_STATUS]')) {
        const senderId = String(msg.message.sender_id || '')
        const senderDisplayName = (msg.message as Record<string, unknown>).sender_display_name
          ? String((msg.message as Record<string, unknown>).sender_display_name)
          : agentNameMap[senderId] || undefined
        const senderType = normalizeSenderType((msg.message as Record<string, unknown>).sender_type, senderId, knownAgentIds, senderDisplayName)
        if (senderType === 'agent') {
          const now = Date.now()
          setTypingByTopic((prev) => {
            const existing = prev[incomingTopicId]
            if (!existing) return prev
            const progressStatus = statusFromProgressMessage(cleanedContent, existing.adapter)
            if (!progressStatus) return prev
            return {
              ...prev,
              [incomingTopicId]: appendTypingStatus(existing, {
                agentId: senderId || existing.agentId,
                agentName: senderDisplayName || existing.agentName,
                statusText: progressStatus.text,
                statusKind: progressStatus.kind,
                adapter: existing.adapter,
                ttlMs: 60000,
              }, now),
            }
          })
        }
      }
      if (!displayable) return

      const senderId = String(msg.message.sender_id || 'unknown')
      const senderDisplayName = (msg.message as Record<string, unknown>).sender_display_name
        ? String((msg.message as Record<string, unknown>).sender_display_name)
        : agentNameMap[senderId] || undefined
      const modelHint = parseModelHintFromMetadata((msg.message as Record<string, unknown>).metadata)
      const incomingBase: ChatMessage = {
        message_id: msg.message.id,
        topic_id: incomingTopicId,
        sender_id: senderId,
        sender_display_name: senderDisplayName,
        sender_type: normalizeSenderType((msg.message as Record<string, unknown>).sender_type, senderId, knownAgentIds, senderDisplayName),
        sender_avatar_url: (msg.message as Record<string, unknown>).sender_avatar_url ? String((msg.message as Record<string, unknown>).sender_avatar_url) : undefined,
        content: cleanedContent,
        encrypted: Boolean((msg.message as Record<string, unknown>).encrypted),
        timestamp: msg.message.created_at,
        semantic_type: semanticType,
        reply_to: (msg.message as Record<string, unknown>).reply_to ? String((msg.message as Record<string, unknown>).reply_to) : undefined,
        ...modelHint,
      }

      if (incomingBase.sender_type === 'agent') {
        delete typingBaselineAgentMessageIdsRef.current[incomingTopicId]
        setTypingByTopic((prev) => clearTypingAfterAgentReply(prev, incomingTopicId, senderId, incomingBase.timestamp))
      }

      void (async () => {
        const incoming = await decryptMessageForDisplay(incomingBase)
        setAllMessages((prev) => {
          if (prev.some((m) => m.message_id === incoming.message_id)) return prev
          return [...prev, incoming]
        })
      })()
    },
    [selectedTopicId, agentNameMap, knownAgentIds, decryptMessageForDisplay],
  )
  const { state: wsState, sendAction } = useWebSocket({
    url: wsUrl,
    enabled: !!selectedAgentId,
    token: session?.accessToken || undefined,
    onMessage: handleWsMessage,
  })

  const prevWsStateRef = useRef<string>('disconnected')
  useEffect(() => {
    const connected = wsState === 'connected'
    setWsConnectedForPoll(connected)

    // After reconnect, run one immediate HTTP backfill to avoid missed messages
    // during transient WS outages.
    if (connected && prevWsStateRef.current !== 'connected') {
      void mutate()
    }
    prevWsStateRef.current = wsState
  }, [wsState, mutate])

  const e2eBootstrapRequestedRef = useRef<string | null>(null)
  const e2eBootstrapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const e2eRetryDelayRef = useRef(3000)
  const lastE2EAgentRef = useRef<string | null>(null)
  const [e2eBootstrapSeq, setE2eBootstrapSeq] = useState(0)

  useEffect(() => {
    if (P2P_E2E_WEB_ENABLED) return
    clearCachedKey()
    decryptCacheRef.current.clear()
    e2eBootstrapRequestedRef.current = null
  }, [])

  useEffect(() => {
    if (!selectedAgentId) return

    if (!P2P_E2E_WEB_ENABLED) {
      clearCachedKey()
      decryptCacheRef.current.clear()
      e2eBootstrapRequestedRef.current = null
      return
    }

    // On first mount, keep existing cached key (it may already match this agent).
    if (!lastE2EAgentRef.current) {
      lastE2EAgentRef.current = selectedAgentId
      return
    }

    if (lastE2EAgentRef.current === selectedAgentId) return
    lastE2EAgentRef.current = selectedAgentId

    // Agent really changed: clear cached key and force re-bootstrap.
    clearCachedKey()
    decryptCacheRef.current.clear()
    e2eBootstrapRequestedRef.current = null
    e2eRetryDelayRef.current = 3000
  }, [selectedAgentId])

  useEffect(() => {
    if (!P2P_E2E_WEB_ENABLED) return
    if (!selectedAgentId) return
    if (!session?.accessToken) return
    if (getCachedKey()) return
    if (e2eBootstrapRequestedRef.current === selectedAgentId) return

    e2eBootstrapRequestedRef.current = selectedAgentId
    void (async () => {
      let bootstrapped = false

      // Single HTTP bootstrap path (server bridges to plugin over WS).
      try {
        const resp = await fetch(
          `${CLIENT_WTT_API_BASE}/agents/e2e-key?agent_id=${encodeURIComponent(selectedAgentId)}`,
          { headers: { Authorization: `Bearer ${session.accessToken}` } },
        )
        if (resp.ok) {
          const payload = (await resp.json()) as { key_b64?: string }
          const keyB64 = String(payload?.key_b64 || '')
          if (keyB64 && cacheKeyFromBase64(keyB64)) {
            bootstrapped = true
            e2eRetryDelayRef.current = 3000
            // Force one refresh so previously locked encrypted rows can re-render decrypted.
            void mutate()
          }
        }
      } catch {
        // ignore and retry below
      }

      if (!bootstrapped) {
        // best-effort bootstrap (plugin offline / auth race / no peer plugin)
        e2eBootstrapRequestedRef.current = null
        if (e2eBootstrapTimerRef.current) clearTimeout(e2eBootstrapTimerRef.current)
        const retryDelay = e2eRetryDelayRef.current
        e2eRetryDelayRef.current = Math.min(retryDelay * 2, 30000)
        e2eBootstrapTimerRef.current = setTimeout(() => {
          setE2eBootstrapSeq((n) => n + 1)
        }, retryDelay)
      }
    })()

    return () => {
      if (e2eBootstrapTimerRef.current) {
        clearTimeout(e2eBootstrapTimerRef.current)
        e2eBootstrapTimerRef.current = null
      }
    }
  }, [selectedAgentId, session?.accessToken, e2eBootstrapSeq, mutate])

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now()
      setTypingByTopic((prev) => {
        let changed = false
        const next: Record<string, TopicTypingState> = {}
        for (const [topicId, v] of Object.entries(prev)) {
          if (v.expiresAt > now) next[topicId] = v
          else changed = true
        }
        return changed ? next : prev
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const prevTopicRef = useRef(selectedTopicId)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const normalizedRaw = normalizeFeed(feedRaw, knownAgentIds)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      const normalized = await decryptMessagesForDisplay(normalizedRaw)
      if (cancelled) return

      const topicChanged = prevTopicRef.current !== selectedTopicId
      prevTopicRef.current = selectedTopicId
      if (topicChanged || normalized.length === 0) {
        // Full replace on topic switch or empty data
        setAllMessages(normalized)
      } else {
        setAllMessages((prev) => {
          if (prev.length === 0) return normalized
          // Merge: preserve DOM/scroll position during polling refreshes
          const existingIds = new Set(prev.map(m => m.message_id))
          const newMsgs = normalized.filter(m => !existingIds.has(m.message_id))
          if (newMsgs.length === 0 && prev.length === normalized.length) return prev
          const normalizedMap = new Map(normalized.map(m => [m.message_id, m]))
          const merged = prev
            .filter(m => normalizedMap.has(m.message_id))
            .map(m => normalizedMap.get(m.message_id)!)
          for (const m of newMsgs) merged.push(m)
          merged.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
          return merged
        })
      }
      setHasOlder(normalized.length >= 100)
      if (selectedTopicId) {
        setTypingByTopic((prev) => {
          const existing = prev[selectedTopicId]
          if (!existing) return prev
          const progressRows = feedRows(feedRaw)
          let nextState = existing
          for (const row of progressRows) {
            const rowTopicId = String(row.topic_id ?? '')
            if (rowTopicId && rowTopicId !== selectedTopicId) continue
            const senderId = String(row.sender_id ?? '')
            const senderDisplayName = row.sender_display_name ? String(row.sender_display_name) : agentNameMap[senderId] || undefined
            const senderType = normalizeSenderType(row.sender_type, senderId, knownAgentIds, senderDisplayName)
            if (senderType !== 'agent') continue
            if (existing.agentId && senderId && senderId !== existing.agentId) continue
            const rowTime = new Date(String(row.timestamp ?? row.created_at ?? '')).getTime()
            if (!Number.isFinite(rowTime) || rowTime + 2000 < existing.startedAt) continue
            const progress = statusFromProgressMessage(stripSourceMarker(String(row.content ?? '')), nextState.adapter)
            if (!progress) continue
            nextState = appendTypingStatus(nextState, {
              agentId: senderId || nextState.agentId,
              agentName: senderDisplayName || nextState.agentName,
              statusText: progress.text,
              statusKind: progress.kind,
              adapter: nextState.adapter,
              ttlMs: 60000,
            }, Math.max(Date.now(), rowTime))
          }
          const baselineIds = typingBaselineAgentMessageIdsRef.current[selectedTopicId]
          const reply = normalized.find((m) => (
            m.sender_type === 'agent' &&
            (!nextState.agentId || m.sender_id === nextState.agentId) &&
            (!baselineIds || !baselineIds.has(m.message_id)) &&
            new Date(m.timestamp).getTime() + 2000 >= nextState.startedAt
          ))
          if (!reply) {
            return nextState === existing ? prev : { ...prev, [selectedTopicId]: nextState }
          }
          delete typingBaselineAgentMessageIdsRef.current[selectedTopicId]
          return clearTypingAfterAgentReply(prev, selectedTopicId, reply.sender_id, reply.timestamp)
        })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [feedRaw, selectedTopicId, knownAgentIds, decryptMessagesForDisplay, agentNameMap])

  // Enrich messages: replace raw agent_id fallback with display_name from agentNameMap
  const enrichedMessages = useMemo(() => {
    return allMessages.map(m => {
      const name = agentNameMap[m.sender_id]
      const isCloud = cloudSandboxAgentIds.has(m.sender_id)
      if (m.sender_display_name && m.sender_display_name !== m.sender_id) {
        return m.is_cloud_sandbox === isCloud ? m : { ...m, is_cloud_sandbox: isCloud }
      }
      if (name) return { ...m, sender_display_name: name, is_cloud_sandbox: isCloud }
      return m.is_cloud_sandbox === isCloud ? m : { ...m, is_cloud_sandbox: isCloud }
    })
  }, [allMessages, agentNameMap, cloudSandboxAgentIds])

  const loadOlderMessages = useCallback(async () => {
    if (!selectedTopicId || loadingOlder || allMessages.length === 0) return
    setLoadingOlder(true)
    try {
      const oldest = allMessages[0]
      const older = await wttApi.getTopicMessages(selectedTopicId, 100, {
        before: oldest.timestamp,
        agentId: selectedAgentId,
      })

      const normalizedOlderRaw = normalizeFeed(older, knownAgentIds)
      const normalizedOlder = await decryptMessagesForDisplay(normalizedOlderRaw)
      if (normalizedOlder.length === 0) {
        setHasOlder(false)
      } else {
        const merged = [...normalizedOlder, ...allMessages]
        const dedup = Array.from(new Map(merged.map((m) => [m.message_id, m])).values())
          .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        setAllMessages(dedup)
        setHasOlder(normalizedOlder.length >= 100)
      }
    } catch {
      setHasOlder(false)
    } finally {
      setLoadingOlder(false)
    }
  }, [selectedTopicId, loadingOlder, allMessages, knownAgentIds, decryptMessagesForDisplay, selectedAgentId])

  const { data: subscribedTopicsRaw, mutate: mutateTopics } = useSWR(
    selectedAgentId && session?.accessToken ? ['subscribed', selectedAgentId, session.accessToken] : null,
    async () => {
      const response = await fetch(`${CLIENT_WTT_API_BASE}/topics/subscribed?agent_id=${selectedAgentId}`, {
        headers: {
          Authorization: `Bearer ${session?.accessToken}`,
        },
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ detail: `HTTP ${response.status}` }))
        throw new Error(payload.detail ?? `HTTP ${response.status}`)
      }

      return response.json()
    },
    {
      // WS updates topic activity; keep low-frequency polling as safety net.
      refreshInterval: wsState === 'connected' ? 15000 : 5000,
      revalidateOnFocus: true,
      dedupingInterval: 3000,
    }
  )

  const { data: groupTopicsRaw, mutate: mutateGroupTopics } = useSWR(
    session?.accessToken ? ['my-group-topics', session.accessToken] : null,
    async () => {
      const response = await fetch(`${CLIENT_WTT_API_BASE}/topics/my-groups`, {
        headers: {
          Authorization: `Bearer ${session?.accessToken}`,
        },
      })
      if (!response.ok) return []
      return response.json()
    },
    {
      refreshInterval: wsState === 'connected' ? 60000 : 30000,
      revalidateOnFocus: true,
      dedupingInterval: 5000,
    },
  )

  // Keep ref in sync for WS handler (avoids circular dependency)
  useEffect(() => {
    subscribedTopicsRef.current = { raw: subscribedTopicsRaw ?? null, mutate: mutateTopics }
  }, [subscribedTopicsRaw, mutateTopics])

  // After topic messages are loaded (which marks latest as read server-side),
  // sync subscribed topic list to clear unread badges after refresh.
  useEffect(() => {
    if (!selectedTopicId) return
    if (!Array.isArray(feedRaw) || feedRaw.length === 0) return

    const now = Date.now()
    const prev = lastReadSyncRef.current
    if (prev && prev.topicId === selectedTopicId && now - prev.ts < 5000) return

    lastReadSyncRef.current = { topicId: selectedTopicId, ts: now }
    void mutateTopics()
  }, [selectedTopicId, feedRaw, mutateTopics])

  // Poll pending P2P requests for notifications
  // session.userId is the WTT backend UUID; session.user.id may not be set by NextAuth
  const wttUserId = (session as Record<string, unknown> | null)?.userId as string | undefined
  const { data: p2pRequests, mutate: mutateP2pRequests } = useSWR(
    session?.accessToken && wttUserId
      ? ['p2p-requests', wttUserId, session.accessToken]
      : null,
    async () => {
      if (!wttUserId) return []
      const res = await fetch(`${CLIENT_WTT_API_BASE}/p2p-requests/for-user?user_id=${encodeURIComponent(wttUserId)}&status=pending`, {
        headers: { Authorization: `Bearer ${session?.accessToken}` },
      })
      if (!res.ok) return []
      return res.json()
    },
    { refreshInterval: wsState === 'connected' ? 60000 : 15000, revalidateOnFocus: true, dedupingInterval: 5000 }
  )
  const pendingP2pCount = Array.isArray(p2pRequests) ? p2pRequests.length : 0

  const topics = useMemo<TopicItem[]>(() => {
    if (!subscribedTopicsRaw || !Array.isArray(subscribedTopicsRaw)) return []
    const humanSender = getHumanSender(session)

    const mapped = subscribedTopicsRaw
      .filter((topic: RawTopicRecord & { origin_type?: string; originType?: string }) => {
        return !shouldHideFeedTopic(topic as Record<string, unknown>)
      })
      .map((topic: RawTopicRecord) => mapRawTopicToItem(topic, { selectedAgentId, humanSender, p2pTopicByAgentId }))

    return mapped.sort((a, b) => {
      // Default P2P always pinned at top
      if (a.is_default_p2p && !b.is_default_p2p) return -1
      if (!a.is_default_p2p && b.is_default_p2p) return 1
      // Then sort by most recent activity
      if (a.last_activity_at && b.last_activity_at) {
        const diff = new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime()
        if (diff !== 0) return diff
      }
      return 0
    })
  }, [subscribedTopicsRaw, selectedAgentId, session, p2pTopicByAgentId])

  const groupTopics = useMemo<TopicItem[]>(() => {
    if (!Array.isArray(groupTopicsRaw)) return []
    const seen = new Set<string>()
    return groupTopicsRaw
      .filter((topic: RawTopicRecord & { origin_type?: string; originType?: string }) => !shouldHideFeedTopic(topic as Record<string, unknown>))
      .map((topic: RawTopicRecord) => mapRawTopicToItem(topic))
      .filter(isDiscussionGroupTopicItem)
      .filter((topic) => {
        if (!topic.topic_id || seen.has(topic.topic_id)) return false
        seen.add(topic.topic_id)
        return true
      })
      .sort((a, b) => {
        const unreadDiff = Number(b.unread_count || 0) - Number(a.unread_count || 0)
        if (unreadDiff !== 0) return unreadDiff
        const at = a.last_activity_at ? new Date(a.last_activity_at).getTime() : 0
        const bt = b.last_activity_at ? new Date(b.last_activity_at).getTime() : 0
        return bt - at
      })
  }, [groupTopicsRaw])

  const subscribedTopicIds = useMemo(() => topics.map(t => t.topic_id), [topics])

  const agentItems = useMemo<AgentItem[]>(() => {
    return agents.map((agent) => ({
      agent_id: agent.agent_id,
      display_name: agent.display_name,
      unread_count: 0,
      binding_method: agent.binding_method,
      bound_via: agent.bound_via,
      is_cloud_sandbox: agent.is_cloud_sandbox,
      cloud_host_agent_id: agent.cloud_host_agent_id,
    }))
  }, [agents])

  const selectedTopic = topics.find((t) => t.topic_id === selectedTopicId) || groupTopics.find((t) => t.topic_id === selectedTopicId)

  const selectedTopicRunStatus = useMemo<ChatRunStatus | null>(() => {
    if (!selectedTopicId) return null
    const typing = typingByTopic[selectedTopicId]
    if (!typing) return null
    const name = typing.agentName || agentNameMap[typing.agentId] || typing.agentId || 'Agent'
    const lines = typing.statusLines?.length
      ? typing.statusLines
      : typing.statusText
        ? [{ id: `${typing.startedAt}-status`, text: typing.statusText, kind: typing.statusKind, ts: typing.startedAt }]
        : []
    return {
      agentId: typing.agentId,
      agentName: name,
      adapter: typing.adapter,
      model: typing.model,
      wsState,
      statusText: typing.statusText || '等待 Agent 状态更新',
      statusKind: typing.statusKind,
      startedAt: typing.startedAt,
      lines,
    }
  }, [selectedTopicId, typingByTopic, agentNameMap, wsState])

  // Clear stale persisted topic if it no longer exists in the topics list
  useEffect(() => {
    if (
      selectedTopicId &&
      Array.isArray(subscribedTopicsRaw) &&
      !topics.some(t => t.topic_id === selectedTopicId) &&
      !groupTopics.some(t => t.topic_id === selectedTopicId)
    ) {
      setSelectedTopicId(null)
    }
  }, [groupTopics, topics, selectedTopicId, setSelectedTopicId, subscribedTopicsRaw])

  const selectedTopicTaskHint = useMemo(() => {
    const direct = selectedTopic?.task_id
    if (direct) return direct

    const name = String(selectedTopic?.name || '')
    const match = /^TASK-([a-f0-9]{8})\b/i.exec(name)
    return match ? match[1].toLowerCase() : undefined
  }, [selectedTopic?.task_id, selectedTopic?.name])

  const shouldShowDiscussMembers = !!selectedTopic && ['discussion', 'collaborative'].includes(selectedTopic.topic_type) && !selectedTopicTaskHint
  const { data: topicMembersRaw, mutate: mutateMembers } = useSWR(
    shouldShowDiscussMembers && selectedTopicId && session?.accessToken
      ? ['topic-members', selectedTopicId, session.accessToken]
      : null,
    async () => {
      const response = await fetch(`${CLIENT_WTT_API_BASE}/topics/${selectedTopicId}/members`, {
        headers: { Authorization: `Bearer ${session?.accessToken}` },
      })
      if (!response.ok) return []
      return response.json()
    },
    { refreshInterval: 0, revalidateOnFocus: false, dedupingInterval: 30000 }
  )

  const topicMembers = useMemo(() => {
    if (!Array.isArray(topicMembersRaw)) return []
    return topicMembersRaw
      .map((m) => (m && typeof m === 'object' ? (m as Record<string, unknown>) : null))
      .filter(Boolean)
      .map((m) => {
        const row = m as Record<string, unknown>
        const agentId = String(row.agent_id || '')
        const rawRoleTemplate = row.role_template && typeof row.role_template === 'object'
          ? row.role_template as Record<string, unknown>
          : undefined
        const rawRoleId = String(row.role_template_id || rawRoleTemplate?.id || '').trim()
        const role = rawRoleId || rawRoleTemplate
          ? roleTemplateFromPayload(rawRoleId || undefined, rawRoleTemplate)
          : agentRoleTemplateMap[agentId] || getAgentRoleTemplate(agentRoleMap[agentId])
        return {
          agent_id: agentId,
          display_name: String(row.display_name || row.agent_id || ''),
          roleLabel: agentRoleDisplayLabel(role),
        }
      })
      .filter((m) => m.agent_id)
  }, [agentRoleMap, agentRoleTemplateMap, topicMembersRaw])

  const discussMemberCount = useMemo(() => topicMembers.length, [topicMembers])

  // Recent tasks for sidebar shortcuts
  const { data: recentTasksRaw, mutate: mutateRecentTasks } = useSWR(
    session?.accessToken ? ['recent-tasks', session.accessToken] : null,
    async () => {
      const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks?limit=50&sort=updated_at&order=desc`, {
        headers: { Authorization: `Bearer ${session?.accessToken}` },
      })
      if (!r.ok) return []
      return r.json()
    },
    { refreshInterval: wsState === 'connected' ? 60000 : 15000, revalidateOnFocus: true, dedupingInterval: 5000 }
  )

  const selectedTopicTaskId = useMemo(() => {
    if (!selectedTopicTaskHint) return undefined
    if (selectedTopicTaskHint.length > 8) return selectedTopicTaskHint
    if (!Array.isArray(recentTasksRaw)) return undefined

    for (const item of recentTasksRaw) {
      const raw = item as Record<string, unknown>
      const id = String(raw.id || '')
      if (id.toLowerCase().startsWith(selectedTopicTaskHint)) return id
    }
    return undefined
  }, [selectedTopicTaskHint, recentTasksRaw])

  // Build sub-agent map: each task = 1 sub-agent, grouped by owner agent
  const agentSubAgents = useMemo(() => {
    const map: Record<string, { id: string; title: string; task_type: string; status: string }[]> = {}
    if (Array.isArray(recentTasksRaw)) {
      for (const t of recentTasksRaw) {
        const raw = t as Record<string, unknown>
        if (!raw || raw.status === 'cancelled') continue
        const agentId = String(raw.owner_agent_id || raw.runner_agent_id || '')
        if (!agentId) continue
        if (!map[agentId]) map[agentId] = []
        map[agentId].push({
          id: String(raw.id || ''),
          title: String(raw.title || 'Untitled'),
          task_type: String(raw.task_type || 'general'),
          status: String(raw.status || 'todo'),
        })
      }
    }
    return map
  }, [recentTasksRaw])

  // Fetch real agent capacity & stats from backend
  const { data: agentStatsRaw, mutate: mutateAgentStats } = useSWR(
    session?.accessToken ? ['agent-stats', session.accessToken] : null,
    async () => {
      const r = await fetch(`${CLIENT_WTT_API_BASE}/agents/stats`, {
        headers: { Authorization: `Bearer ${session?.accessToken}` },
      })
      if (!r.ok) return null
      return r.json()
    },
    { refreshInterval: wsState === 'connected' ? 10000 : 5000, revalidateOnFocus: true, dedupingInterval: 3000 }
  )
  const maxSubAgents = (agentStatsRaw as Record<string, unknown>)?.max_sub_agents as number | undefined ?? 20
  const agentStats = (agentStatsRaw as Record<string, unknown>)?.agents as Record<string, { total: number; active: number; done: number; todo: number }> | undefined
  const agentRuntimeMap = useMemo(
    () => (((agentStatsRaw as Record<string, unknown>)?.runtimes || {}) as Record<string, AgentRuntimeInfo>),
    [agentStatsRaw]
  )
  const { data: cloudAgentStateRaw, mutate: mutateCloudAgentState } = useSWR(
    session?.accessToken ? ['cloud-agent-state', session.accessToken] : null,
    async () => {
      const r = await fetch(`${CLIENT_WTT_API_BASE}/cloud-agents/me?live=false`, {
        headers: { Authorization: `Bearer ${session?.accessToken}` },
        cache: 'no-store',
      })
      if (!r.ok) return null
      return r.json()
    },
    { refreshInterval: wsState === 'connected' ? 15000 : 5000, revalidateOnFocus: true, dedupingInterval: 3000 }
  )

  const handleSidebarRefresh = useCallback(async () => {
    await Promise.allSettled([
      loadAgents(),
      mutateTopics(),
      mutateGroupTopics(),
      mutateAgentStats(),
      mutateCloudAgentState(),
      mutateP2pRequests(),
      mutateRecentTasks(),
    ])
  }, [loadAgents, mutateAgentStats, mutateCloudAgentState, mutateGroupTopics, mutateP2pRequests, mutateRecentTasks, mutateTopics])

  useEffect(() => {
    if (!selectedAgentId) return
    void mutateAgentStats()
    void mutateCloudAgentState()
  }, [mutateAgentStats, mutateCloudAgentState, selectedAgentId])

  const { data: billingRaw } = useSWR(
    session?.accessToken ? ['billing-me', session.accessToken] : null,
    async () => {
      const response = await fetch(`${CLIENT_WTT_API_BASE}/billing/me`, {
        headers: { Authorization: `Bearer ${session?.accessToken}` },
      })
      if (!response.ok) return null
      return response.json() as Promise<BillingMe>
    },
    { refreshInterval: 5 * 60_000, revalidateOnFocus: false, dedupingInterval: 60_000 }
  )
  const planLabel = useMemo(() => {
    const plan = String(billingRaw?.entitlement?.plan || 'free').toLowerCase()
    if (plan === 'pro') return 'Pro'
    return 'Free'
  }, [billingRaw?.entitlement?.plan])
  const hasCloudAgentRecord = useMemo(
    () => agents.some((agent) => (
      (agent.binding_method || agent.bound_via || '') === 'cloud_trial'
      || agent.is_cloud_sandbox
      || Boolean(agent.cloud_host_agent_id)
    )),
    [agents],
  )
  const billingPlan = String(billingRaw?.entitlement?.plan || '').toLowerCase()
  const billingLoaded = Boolean(billingRaw?.entitlement)
  const cloudAgentNeedsRenewal = billingLoaded && hasCloudAgentRecord && billingPlan !== 'pro'
  const sleepingCloudHostIds = useMemo(() => {
    const state = (cloudAgentStateRaw || {}) as CloudAgentState
    const status = String(state.status || '').toLowerCase()
    const hostAgentId = String(state.host_agent_id || state.agent_id || '').trim()
    if (!hostAgentId || !['stopping', 'sleeping', 'stopped'].includes(status)) return new Set<string>()
    return new Set([hostAgentId])
  }, [cloudAgentStateRaw])
  const suppressedCloudAgentIds = useMemo(() => {
    const ids = new Set<string>(Array.from(sleepingCloudHostIds))
    if (ids.size === 0) return ids
    for (const agent of agents) {
      const hostId = String(agent.cloud_host_agent_id || '').trim()
      if (hostId && sleepingCloudHostIds.has(hostId)) ids.add(agent.agent_id)
      if (sleepingCloudHostIds.has(agent.agent_id)) ids.add(agent.agent_id)
    }
    for (const [agentId, runtime] of Object.entries(agentRuntimeMap)) {
      const hostId = String(runtime.host_agent_id || '').trim()
      if (hostId && sleepingCloudHostIds.has(hostId)) ids.add(agentId)
    }
    return ids
  }, [agentRuntimeMap, agents, sleepingCloudHostIds])
  const selectedAgent = selectedAgentId ? agents.find((agent) => agent.agent_id === selectedAgentId) : undefined
  const selectedAgentRuntime = selectedAgentId ? agentRuntimeMap?.[selectedAgentId] : undefined
  const selectedAgentIsCloud = Boolean(selectedAgent?.is_cloud_sandbox)
    || String(selectedAgentRuntime?.provider || '').includes('cloudflare_sandbox')
  const onlineAgentIds = useMemo(() => {
    const arr = (agentStatsRaw as Record<string, unknown>)?.online_agents as string[] | undefined
    const ids = new Set(arr ?? [])
    for (const [agentId, runtime] of Object.entries(agentRuntimeMap)) {
      if (typeof runtime.last_heartbeat_secs_ago === 'number' && runtime.last_heartbeat_secs_ago <= 90) {
        ids.add(agentId)
      }
    }
    for (const agentId of Array.from(suppressedCloudAgentIds)) {
      ids.delete(agentId)
    }
    return ids
  }, [agentStatsRaw, agentRuntimeMap, suppressedCloudAgentIds])

  const submitAgentOperation = useCallback(async (
    operationType: 'cloud_agent_create' | 'cloud_sandbox_clone' | 'local_host_clone',
    payload: Record<string, unknown>,
    idempotencyKey?: string,
  ): Promise<AgentOperationJob> => {
    const token = session?.accessToken as string | undefined
    if (!token) throw new Error(t('settings.sessionExpired'))

    let createRes: Response | null = null
    let createData: unknown = null
    let lastCreateError: unknown = null
    const operationBody = JSON.stringify({
      operation_type: operationType,
      idempotency_key: idempotencyKey,
      payload,
    })

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const result = await fetchJsonWithTimeout(`${CLIENT_WTT_API_BASE}/agent-operations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: operationBody,
        })
        createRes = result.response
        createData = result.data
        if (createRes.ok || !isRetryableOperationStatus(createRes.status) || attempt === 2) {
          break
        }
      } catch (error) {
        lastCreateError = error
        if (!isRetryableOperationError(error) || attempt === 2) {
          throw error
        }
      }
      await delay(650 * (attempt + 1))
    }

    if (!createRes) {
      if (lastCreateError instanceof Error) throw lastCreateError
      throw new Error('Agent operation request failed')
    }
    if (!createRes.ok) {
      throw new Error(responseErrorMessage(createData, `Agent operation failed (${createRes.status})`))
    }
    const jobId = String((createData as AgentOperationJob).job_id || '').trim()
    if (!jobId) throw new Error('Agent operation did not return a job id')
    let job = createData as AgentOperationJob
    const startedAt = Date.now()
    while (Date.now() - startedAt < 240_000) {
      const status = String(job.status || '').toLowerCase()
      if (status === 'succeeded') return job
      if (status === 'failed' || status === 'timeout' || status === 'cancelled') {
        throw new Error(job.error_message || `Agent operation ${status}`)
      }
      await delay(1500)
      const { response: pollRes, data: pollData } = await fetchJsonWithTimeout(`${CLIENT_WTT_API_BASE}/agent-operations/${encodeURIComponent(jobId)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      if (!pollRes.ok) {
        throw new Error(responseErrorMessage(pollData, `Agent operation polling failed (${pollRes.status})`))
      }
      job = pollData as AgentOperationJob
    }
    throw new Error('Agent operation is still running; refresh the Agent list to check progress.')
  }, [session?.accessToken, t])

  const handleNewAgentFromHost = useCallback(async (
    hostAgentId: string,
    role: AgentRoleTemplate,
    requestedAdapter?: WttConnectAdapter,
    options?: { select?: boolean; alert?: boolean },
  ) => {
    const token = session?.accessToken as string | undefined
    if (!token) throw new Error(t('settings.sessionExpired'))

    const runtime = agentRuntimeMap[hostAgentId]
    const hostAdapter = normalizeWttConnectAdapter(runtime?.adapter || runtime?.kind)
    if (!hostAdapter) {
      throw new Error('Clone Agent only supports online codex / claude-code / gemini hosts')
    }
    const adapter = requestedAdapter || hostAdapter
    const hostAgent = agents.find((agent) => agent.agent_id === hostAgentId)
    const hostIsCloudSandbox = Boolean(hostAgent?.is_cloud_sandbox)
      || String(hostAgent?.cloud_host_agent_id || '').trim().length > 0
      || String(runtime?.provider || '').toLowerCase().includes('cloudflare_sandbox')
      || String(runtime?.host_agent_id || '').trim().length > 0

    const displayName = role.id === 'general'
      ? `${adapter} Agent`
      : (role.shortLabel || role.label || `${adapter} Agent`)

    const modelId = hostIsCloudSandbox && adapter === hostAdapter
      ? String(runtime?.current_model || runtime?.model_id || runtime?.model || '').trim()
      : ''
    const job = await submitAgentOperation(
      hostIsCloudSandbox ? 'cloud_sandbox_clone' : 'local_host_clone',
      {
        host_agent_id: hostAgentId,
        adapter,
        display_name: displayName,
        model_id: modelId || undefined,
        role_template_id: role.id === 'general' ? '' : role.id,
        role_template: role.id === 'general' ? {} : serializeAgentRoleTemplate(role),
        client_operation_id: newClientOperationId(),
      },
    )
    const newAgentId = String(job.result?.agent_id || '').trim()
    if (!newAgentId) {
      throw new Error('Clone operation succeeded but did not return agent_id')
    }

    await loadAgents()
    if (options?.select !== false) {
      setSelectedAgentId(newAgentId)
      setSelectedTopicId(null)
    }
    void mutateTopics()
    window.setTimeout(() => {
      void loadAgents()
      void mutateTopics()
    }, 2500)
    if (options?.alert !== false) {
      alert(`Clone Agent started: ${newAgentId}`)
    }
    return newAgentId
  }, [agentRuntimeMap, agents, loadAgents, mutateTopics, session?.accessToken, setSelectedAgentId, setSelectedTopicId, submitAgentOperation, t])

  const handleCreateCloudAgent = useCallback(async (options?: CloudAgentCreateOptions) => {
    const token = session?.accessToken as string | undefined
    if (!token) {
      alert(t('settings.sessionExpired'))
      return
    }
    try {
      const billingRes = await fetch(`${CLIENT_WTT_API_BASE}/billing/me`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      if (billingRes.ok) {
        const billing = await billingRes.json().catch(() => ({}))
        const plan = String((billing as { entitlement?: { plan?: unknown } }).entitlement?.plan || 'free')
        const alreadyHasCloudAgent = agents.some((agent) => (
          (agent.binding_method || agent.bound_via || '') === 'cloud_trial'
          || agent.is_cloud_sandbox
          || Boolean(agent.cloud_host_agent_id)
        ))
        if (alreadyHasCloudAgent && plan !== 'pro') {
          alert('你已经创建过 Cloud Agent，但当前 Pro 会员已到期。请到 设置中心 > 账户升级 续费后继续使用。')
          setForceOpenSettingsPage('membership')
          return
        }
        if (alreadyHasCloudAgent) {
          alert('该账号已经创建过 Cloud Agent，每个账号只能创建一个。')
          return
        }
        if (plan !== 'pro') {
          alert('Cloud Agent 需要升级为 Pro 账户后才能使用。请到 设置中心 > 账户升级 开通。')
          setForceOpenSettingsPage('membership')
          return
        }
      } else {
        alert('暂时无法校验会员状态，请稍后重试。')
        return
      }
    } catch {
      alert('暂时无法校验会员状态，请稍后重试。')
      return
    }
    const adapterLabel = options?.adapter === 'codex' ? 'Codex' : options?.adapter === 'gemini' ? 'Gemini' : 'DeepSeek + Claude Code'
    const accepted = window.confirm([
      'Cloud Agent 会在 Cloudflare Sandbox 中运行。',
      '每个用户只有一个 Cloud Sandbox；需要更多 Agent 请使用 Clone Agent，它们会运行在同一个 Sandbox 中。',
      `默认运行时：${adapterLabel}`,
      options?.adapter === 'claude-code' ? 'DeepSeek + Claude Code 每小时额外 ¥0.5；Pro 额度为 30 次连续请求、本月共 500 次。' : 'API Key 可选；不填可创建后在 Terminal 中配置/登录。',
      'Agent 运行在隔离 Sandbox 中，workspace 独立但不建议存放敏感信息。',
      '请勿进行挖矿、攻击、扫描、绕过限制等恶意操作，违规会封号。',
      '',
      '确认创建 Cloud Agent？',
    ].filter(Boolean).join('\n'))
    if (!accepted) return

    try {
      const job = await submitAgentOperation(
        'cloud_agent_create',
        {
          accepted_terms: true,
          display_name: options?.displayName || 'Cloud Agent',
          agent_type: options?.adapter || 'claude-code',
          adapter: options?.adapter || 'claude-code',
          provider_plan: options?.providerPlan || 'deepseek',
          default_model: options?.model || 'deepseek-v4-pro[1m]',
          model: options?.model || 'deepseek-v4-pro[1m]',
          api_key: options?.apiKey || undefined,
          llm_api_key: options?.apiKey || undefined,
          pricing_addon_rmb_per_hour: options?.adapter === 'claude-code' ? 0.5 : 0,
        },
        'cloud-agent-create',
      )

      const newAgentId = String(job.result?.agent_id || '').trim()
      await loadAgents()
      if (newAgentId) {
        setSelectedAgentId(newAgentId)
        setSelectedTopicId(null)
      }
      void mutateTopics()
      window.setTimeout(() => {
        void loadAgents()
        void mutateTopics()
      }, 2500)
      alert(`Cloud Agent created: ${newAgentId || 'success'}`)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Cloud Agent failed')
    }
  }, [agents, loadAgents, mutateTopics, session?.accessToken, setSelectedAgentId, setSelectedTopicId, submitAgentOperation, t])

  const runCloudSandboxAction = useCallback(async (hostAgentId: string, action: 'sleep' | 'wake') => {
    const token = session?.accessToken as string | undefined
    if (!token) {
      alert(t('settings.sessionExpired'))
      return
    }

    const cleanHostAgentId = String(hostAgentId || '').trim()
    if (!cleanHostAgentId) {
      alert('Cloud Sandbox host agent_id is missing')
      return
    }

    if (action === 'sleep') {
      const accepted = window.confirm([
        '确认关机这个 Cloud Sandbox？',
        '系统会允许 Cloudflare 在短暂空闲后停止计费，之后可从同一菜单开机。',
      ].join('\n'))
      if (!accepted) return
    }

    try {
      const res = await fetch(`${CLIENT_WTT_API_BASE}/cloud-agents/${encodeURIComponent(cleanHostAgentId)}/${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(responseErrorMessage(data, `Cloud Sandbox ${action} failed (${res.status})`))
      }
      void mutateCloudAgentState((prev: CloudAgentState | null | undefined) => ({
        ...(prev || {}),
        has_cloud_agent: true,
        agent_id: cleanHostAgentId,
        status: action === 'wake' ? 'waking' : 'stopping',
        provider: (prev || {}).provider || 'cloudflare_sandbox',
      }), false)

      const deadline = Date.now() + (action === 'wake' ? 300000 : 180000)
      let lastStatus = ''
      let lastOnline = false
      let lastMissingAgents: string[] = []
      let lastExpectedAgents: string[] = [cleanHostAgentId]
      while (Date.now() < deadline) {
        const [stateResp, statsResp] = await Promise.all([
          fetch(`${CLIENT_WTT_API_BASE}/cloud-agents/me?live=false`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
          }),
          fetch(`${CLIENT_WTT_API_BASE}/agents/stats`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
          }),
        ])
        const state = await stateResp.json().catch(() => ({}))
        const stats = await statsResp.json().catch(() => ({}))
        lastStatus = String((state as { status?: unknown }).status || '').toLowerCase()
        const online = (stats as { online_agents?: unknown }).online_agents
        const onlineIds = new Set(Array.isArray(online) ? online.map(String) : [])
        const expectedIds = new Set(cloudSandboxExpectedAgentIds(state as CloudAgentState, cleanHostAgentId))
        for (const agent of agents) {
          if (String(agent.cloud_host_agent_id || '').trim() === cleanHostAgentId || agent.agent_id === cleanHostAgentId) {
            expectedIds.add(agent.agent_id)
          }
        }
        lastExpectedAgents = Array.from(expectedIds)
        lastMissingAgents = lastExpectedAgents.filter((agentId) => !onlineIds.has(agentId))
        lastOnline = lastExpectedAgents.length > 0 && lastMissingAgents.length === 0

        void mutateAgentStats(stats, false)
        void mutateCloudAgentState(state as CloudAgentState, false)
        if (action === 'wake' && lastStatus === 'running' && lastOnline) break
        if (action === 'sleep' && ['stopped', 'sleeping'].includes(lastStatus)) break
        await delay(3000)
      }

      const completed = action === 'wake'
        ? lastStatus === 'running' && lastOnline
        : ['stopped', 'sleeping'].includes(lastStatus)
      if (!completed) {
        throw new Error(action === 'wake'
          ? `Sandbox 仍在开机中，最后状态：${lastStatus || 'unknown'}，已等待 ${lastExpectedAgents.length} 个 Agent，未上线：${lastMissingAgents.slice(0, 6).join(', ') || 'unknown'}`
          : `Sandbox 仍在关机中，最后状态：${lastStatus || 'unknown'}`)
      }

      await loadAgents()
      void mutateAgentStats()
      void mutateCloudAgentState()
      void mutateTopics()
      alert(action === 'wake' ? `Cloud Sandbox 已开机，${lastExpectedAgents.length} 个 Agent 已在线。` : 'Cloud Sandbox 已关机。')
    } catch (error) {
      alert(error instanceof Error ? error.message : `Cloud Sandbox ${action} failed`)
    }
  }, [agents, loadAgents, mutateAgentStats, mutateCloudAgentState, mutateTopics, session?.accessToken, t])

  const handleSleepSandbox = useCallback((hostAgentId: string) => {
    return runCloudSandboxAction(hostAgentId, 'sleep')
  }, [runCloudSandboxAction])

  const handleWakeSandbox = useCallback((hostAgentId: string) => {
    return runCloudSandboxAction(hostAgentId, 'wake')
  }, [runCloudSandboxAction])

  useEffect(() => {
    setMembersOpen(false)
  }, [selectedTopicId])

  // Auto-create P2P topic for each claimed agent (if not exists)
  const p2pInitRef = useRef(new Set<string>())
  useEffect(() => {
    if (!selectedAgentId || !session?.accessToken || !topics) return
    const humanSender = getHumanSender(session)
    for (const agent of agents) {
      const aid = agent.agent_id
      if (p2pInitRef.current.has(aid)) continue
      const existingMappedTopicId = p2pTopicByAgentId[aid]
      const hasP2p = Boolean(existingMappedTopicId && topics.some(t => t.topic_id === existingMappedTopicId)) ||
        topics.some(t => t.topic_type === 'p2p' && t.name.includes(aid) && t.name.includes(humanSender))
      if (hasP2p) { p2pInitRef.current.add(aid); continue }
      p2pInitRef.current.add(aid)
      // Silently create P2P topic — no visible system message
      fetch(`${CLIENT_WTT_API_BASE}/messages/p2p?sender_id=${encodeURIComponent(humanSender)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}` },
        body: JSON.stringify({ target_agent_id: aid, content: '[system:p2p_init]', content_type: 'text', semantic_type: 'system' }),
      }).then(async (response) => {
        const payload = await response.json().catch(() => ({}))
        const topicId = String((payload as { topic_id?: unknown }).topic_id || '').trim()
        if (response.ok && topicId) {
          setP2pTopicByAgentId((prev) => ({ ...prev, [aid]: topicId }))
        }
        await mutateTopics()
      }).catch(() => {})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents, topics, selectedAgentId, session?.accessToken, p2pTopicByAgentId])

  useEffect(() => {
    if (!selectedAgentId || selectedTopicId) return
    const topicId = p2pTopicByAgentId[selectedAgentId]
    if (!topicId) return
    if (topics.some((topic) => topic.topic_id === topicId)) {
      setSelectedTopicId(topicId)
    }
  }, [p2pTopicByAgentId, selectedAgentId, selectedTopicId, setSelectedTopicId, topics])

  const searchParams = useSearchParams()

  useEffect(() => {
    const settingsFromUrl = (searchParams.get('settings') || '').toLowerCase()
    if (settingsFromUrl === 'profile') {
      setForceOpenSettingsPage('profile')
    } else if (settingsFromUrl === 'binding') {
      setForceOpenSettingsPage('binding')
    }
  }, [searchParams])

  useEffect(() => {
    const topicFromUrl = searchParams.get('topicId') || searchParams.get('topic')
    if (!topicFromUrl) return
    if (topics.some((t) => t.topic_id === topicFromUrl)) {
      setSelectedTopicId(topicFromUrl)
    }
  }, [topics, searchParams, setSelectedTopicId])

  useEffect(() => {
    if (!pendingComposerFocusTopicId) return
    if (selectedTopicId !== pendingComposerFocusTopicId) return
    if (!topics.some((t) => t.topic_id === pendingComposerFocusTopicId)) return

    setComposerFocusNonce((v) => v + 1)
    const retry = window.setTimeout(() => setComposerFocusNonce((v) => v + 1), 220)
    setPendingComposerFocusTopicId(null)
    return () => window.clearTimeout(retry)
  }, [pendingComposerFocusTopicId, selectedTopicId, topics])

  const handleCreateGeneralTask = useCallback(async () => {
    if (!selectedAgentId || !session?.accessToken) return
    try {
      const resp = await fetch(`${CLIENT_WTT_API_BASE}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({
          title: 'New Task',
          task_mode: 'single',
          priority: 'P1',
          status: 'todo',
          task_type: 'general',
          exec_mode: 'reasoning',
          owner_agent_id: selectedAgentId,
          runner_agent_id: selectedAgentId,
          created_by: getHumanSender(session),
        }),
      })

      if (!resp.ok) {
        alert(t('feed.failedCreateTask'))
        return
      }

      const real = await resp.json()
      mutateRecentTasks()
      mutateTopics()

      const topicId = String(real?.topic_id || '')
      if (topicId) {
        setSelectedTopicId(topicId)
        setPendingComposerFocusTopicId(topicId)
      } else {
        router.push(buildAgentUrl('/tasks', selectedAgentId, { type: 'general' }))
      }
    } catch {
      alert(t('feed.failedCreateTask'))
    }
  }, [selectedAgentId, session, mutateRecentTasks, mutateTopics, router, t, setSelectedTopicId])

  const handleSendMessage = async (content: string, modelConfig?: ChatModelConfig, replyTo?: string, options?: ChatSendOptions) => {
    if (!selectedTopicId || !selectedAgentId) return

    const topicIdForSend = selectedTopicId
    const agentIdForSend = selectedAgentId
    const baselineAgentMessageIds = new Set(
      allMessages
        .filter((m) => m.sender_type === 'agent' && (!agentIdForSend || m.sender_id === agentIdForSend))
        .map((m) => m.message_id),
    )
    typingBaselineAgentMessageIdsRef.current[topicIdForSend] = baselineAgentMessageIds
    setTypingByTopic((prev) => {
      const now = Date.now()
      return {
        ...prev,
        [topicIdForSend]: appendTypingStatus(prev[topicIdForSend], {
          agentId: agentIdForSend,
          agentName: agentNameMap[agentIdForSend] || undefined,
          statusText: '消息已发送，等待 Agent 接收',
          statusKind: 'queued',
          ttlMs: AGENT_TYPING_STALE_MS,
        }, now),
      }
    })

    const isTask = !!selectedTopicTaskId
    const isSlashCommand = content.trim().startsWith('/')
    const isNonTaskDiscuss = selectedTopic?.topic_type === 'discussion' && !isTask

    // Build metadata with model config so the agent knows which model/mode to use
    const metadata: Record<string, unknown> = {}
    if (modelConfig) {
      metadata.model_config = {
        model: modelConfig.model,
        reasoning_effort: modelConfig.reasoningEffort,
      }
    }
    const selectedCloudAgentOnline = selectedAgentId ? onlineAgentIds.has(selectedAgentId) : false
    if (selectedAgentIsCloud && selectedCloudAgentOnline) {
      metadata.cloud_no_auto_wake = true
    }
    if (options?.slashType || isSlashCommand) {
      metadata.slash_type = options?.slashType || 'agent_passthrough'
      metadata.slash_command = options?.slashCommand || content.trim().split(/\s+/, 1)[0] || content.trim()
    }

    if (isSlashCommand && isNonTaskDiscuss) {
      metadata.command_scope = 'single_agent'
      metadata.command_target_agent_id = selectedAgentId
    }

    // Keep user-visible messages clean. Role/persona context is carried as
    // metadata so the agent runner can use it as hidden "soul" context.
    const ws = activeWorkerSessionRef.current
    const augmentedContent = content
    if (ws && ws.topicId === selectedTopicId && (ws.isFirstSession || ws.personaChanged) && ws.personaMd) {
      metadata.worker_persona = {
        worker_id: ws.workerId,
        persona_md: ws.personaMd,
        changed: Boolean(ws.personaChanged && !ws.isFirstSession),
      }
      // Mark as no longer first session / persona change handled
      activeWorkerSessionRef.current = { ...ws, isFirstSession: false, personaChanged: false }
      // Persist worker.md with persona content so future sessions have context
      // Also updates persona_hash on backend to mark injection done
      fetch(`${CLIENT_WTT_API_BASE}/workers/${ws.workerId}/worker-md`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.accessToken ?? ''}` },
        body: JSON.stringify({ worker_md: ws.personaMd }),
      }).catch(() => {})
    } else if (ws && ws.topicId === selectedTopicId && ws.workerMd) {
      // Subsequent session — send worker.md as hidden context if messages are empty.
      if (allMessages.length === 0) {
        metadata.worker_context = {
          worker_id: ws.workerId,
          worker_md: ws.workerMd,
        }
      }
    }

    if (isTask && selectedTopicTaskId) {
      // Keep auto_run enabled for task chat sends from Feed.
      // Backend only transitions on first send when task.status == 'todo',
      // so this is safe for doing/review/done tasks and avoids stale-status misses.
      const sendResp = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${selectedTopicTaskId}/chat/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.accessToken ?? ''}` },
        body: JSON.stringify({
          content: augmentedContent,
          sender_type: 'HUMAN',
          semantic_type: 'post',
          auto_run: true,
          ...(replyTo ? { reply_to: replyTo } : {}),
          ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
        }),
      })
      // Force topic list refresh so auto-renamed title appears immediately
      if (sendResp.ok) {
        pendingRenameTaskRef.current = null
        await mutateTopics()
      }
    } else {
      // Regular topic — use publishMessage (may include worker persona context)
      let outboundContent = augmentedContent
      let encrypted = false
      if (P2P_E2E_WEB_ENABLED && selectedTopic?.topic_type === 'p2p') {
        const messageId = `web-p2p-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
        const enc = await encryptForSend(augmentedContent, messageId)
        outboundContent = enc.content
        encrypted = enc.encrypted
      }

      await wttApi.publishMessage(selectedTopicId, {
        content: outboundContent,
        content_type: 'text',
        semantic_type: 'post',
        sender_type: 'HUMAN',
        sender_id: getHumanSender(session),
        ...(encrypted ? { encrypted: true } : {}),
        ...(replyTo ? { reply_to: replyTo } : {}),
        ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
      }, {
        agentId: selectedAgentId || undefined,
      })
    }

    // Optimistically bump topic to top of activity sort
    if (subscribedTopicsRaw && Array.isArray(subscribedTopicsRaw)) {
      const now = new Date().toISOString()
      mutateTopics(
        subscribedTopicsRaw.map((t) => {
          const rec = t as Record<string, unknown>
          return rec.id === selectedTopicId ? { ...rec, last_activity_at: now } : t
        }),
        false
      )
    }

    mutate()
  }

  const exportPlaintextTopicMarkdown = async () => {
    if (!selectedTopicId) return
    const token = session?.accessToken
    if (!token) {
      alert('Session expired. Please re-login and try again.')
      return
    }

    const pageSize = 500
    const maxPages = 60
    let offset = 0
    const rows: ChatMessage[] = []

    for (let page = 0; page < maxPages; page++) {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(offset),
      })
      if (selectedAgentId) params.set('agent_id', selectedAgentId)

      const res = await fetch(`${CLIENT_WTT_API_BASE}/topics/${selectedTopicId}/messages?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        throw new Error(`Export fetch failed: HTTP ${res.status}`)
      }

      const batchRaw = await res.json() as unknown
      if (!Array.isArray(batchRaw) || batchRaw.length === 0) break

      const normalized = normalizeFeed(batchRaw, knownAgentIds)
      const decrypted = await decryptMessagesForDisplay(normalized)
      rows.push(...decrypted)

      if (batchRaw.length < pageSize) break
      offset += batchRaw.length
    }

    if (rows.length === 0) {
      alert('No messages to export in this topic.')
      return
    }

    const sorted = [...rows].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    const unresolved = sorted.filter((m) => m.content.includes('[🔒'))

    const header = [
      `# ${selectedTopic?.name || `Topic ${selectedTopicId}`}`,
      '',
      `- Topic ID: \`${selectedTopicId}\``,
      `- Type: \`${selectedTopic?.topic_type || 'unknown'}\``,
      `- Exported At: \`${new Date().toISOString()}\``,
      `- Export Mode: \`client-side plaintext\``,
      '',
      '---',
      '',
    ]

    const body: string[] = []
    for (const m of sorted) {
      const sender = m.sender_display_name || m.sender_id || 'unknown'
      body.push(`## ${m.timestamp} · ${sender}`)
      body.push('')
      body.push(m.content || '')
      body.push('')
    }

    const markdown = [...header, ...body].join('\n')
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const baseName = (selectedTopic?.name || `topic_${selectedTopicId}`).replace(/[\\/:*?"<>|]+/g, '_')
    a.href = url
    a.download = `${baseName}_plaintext.md`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)

    if (unresolved.length > 0) {
      alert(`Export completed with ${unresolved.length} locked/decrypt-failed messages.`)
    }
  }

  const handleExportTopic = async (format: 'md') => {
    if (!selectedTopicId) return

    // For P2P E2E topics, export plaintext on client side.
    if (format === 'md' && selectedTopic?.topic_type === 'p2p') {
      try {
        await exportPlaintextTopicMarkdown()
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Plaintext export failed')
      }
      return
    }

    const u = `${CLIENT_WTT_API_BASE}/export/topic/${selectedTopicId}?format=${format}`
    window.open(u, '_blank', 'noopener,noreferrer')
  }

  const handleRenameAgent = async (agentId: string, currentName: string) => {
    const next = prompt('New agent name', currentName)
    if (!next || next.trim() === currentName) return
    try {
      await wttApi.renameAgent(agentId, next.trim())
      await loadAgents()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Rename failed')
    }
  }

  const handleUnclaimAgent = async (agentId: string) => {
    if (!confirm(`Unclaim agent ${agentId}?`)) return
    try {
      const token = session?.accessToken as string | undefined
      if (!token) {
        alert(t('settings.sessionExpired'))
        return
      }
      const res = await fetch(`${CLIENT_WTT_API_BASE}/agents/${encodeURIComponent(agentId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ detail: 'Unknown error' }))
        throw new Error(data.detail || `HTTP ${res.status}`)
      }
      await loadAgents()
      await mutateTopics()
      alert(t('feed.agentUnclaimed'))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Unclaim failed')
    }
  }

  const handleLeaveTopic = async (topicId: string) => {
    if (!confirm('Leave this topic?')) return
    try {
      const wsResult = await sendAction('leave', { topic_id: topicId })
      if (wsResult === null) {
        await wttApi.leaveTopic(topicId, selectedAgentId)
      }
      if (selectedTopicId === topicId) setSelectedTopicId(null)
      await mutateTopics()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Leave topic failed')
    }
  }

  const handleDeleteTopic = async (topicId: string) => {
    if (!confirm('Delete this topic? (soft delete)')) return
    try {
      await wttApi.deleteTopic(topicId, selectedAgentId)
      if (selectedTopicId === topicId) setSelectedTopicId(null)
      await mutateTopics()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete topic failed')
    }
  }

  const handleSubscribeTopic = async (topicId: string) => {
    if (!selectedAgentId || !session?.accessToken) return
    const wsResult = await sendAction('join', { topic_id: topicId })
    if (wsResult === null) {
      await wttApi.joinTopic(topicId, selectedAgentId)
    }
    await mutateTopics()
  }

  const handleCreateP2P = async (targetAgentId: string) => {
    if (!session?.accessToken) return
    const humanSender = getHumanSender(session)
    const fromUserId = wttUserId || humanSender
    // Send a P2P request instead of directly creating a topic
    const res = await fetch(`${CLIENT_WTT_API_BASE}/p2p-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}` },
      body: JSON.stringify({
        from_user_id: fromUserId,
        from_agent_id: selectedAgentId,
        target_agent_id: targetAgentId,
        message: `P2P chat request from ${humanSender}`,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed' }))
      throw new Error(err.detail || 'Failed to send P2P request')
    }
    alert(t('feed.p2pRequestSent'))
  }

  const handleRequestDiscuss = async (targetAgentId: string, topicName: string) => {
    if (!session?.accessToken) return
    const humanSender = getHumanSender(session)
    const fromUserId = wttUserId || humanSender
    const res = await fetch(`${CLIENT_WTT_API_BASE}/p2p-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}` },
      body: JSON.stringify({
        from_user_id: fromUserId,
        from_agent_id: selectedAgentId,
        target_agent_id: targetAgentId,
        request_type: 'discuss',
        topic_name: topicName,
        message: `Discussion topic invite from ${humanSender}`,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed' }))
      throw new Error(err.detail || 'Failed to send discuss request')
    }
    alert(t('feed.discussRequestSent'))
  }

  const handleInviteMember = async (agentId: string) => {
    if (!session?.accessToken || !selectedTopicId) return
    setInvitingMember(true)
    try {
      const res = await fetch(`${CLIENT_WTT_API_BASE}/topics/${selectedTopicId}/join?agent_id=${encodeURIComponent(agentId)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.accessToken}` },
      })
      if (res.ok) {
        mutateMembers()
        setInviteAgentId('')
        setInviteMemberOpen(false)
      } else {
        const err = await res.json().catch(() => ({ detail: 'Failed' }))
        alert(err.detail || t('feed.privateDiscussFailed'))
      }
    } catch {
      alert(t('feed.networkError'))
    } finally {
      setInvitingMember(false)
    }
  }

  const handleSelectWorkerTopic = (topicId: string, workerSession?: { workerId: string; personaMd: string; workerMd: string; isFirstSession: boolean; personaChanged?: boolean }) => {
    if (workerSession) {
      activeWorkerSessionRef.current = { ...workerSession, personaChanged: workerSession.personaChanged ?? false, topicId }
    }
    mutateTopics().then(() => {
      setSelectedTopicId(topicId)
    })
  }

  const handleRequestPrivateDiscuss = async (targetAgentId: string, targetDisplayName?: string) => {
    if (!session?.accessToken) return
    const humanSender = getHumanSender(session)
    const fromUserId = wttUserId || humanSender
    const targetName = targetDisplayName || targetAgentId
    try {
      const res = await fetch(`${CLIENT_WTT_API_BASE}/p2p-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}` },
        body: JSON.stringify({
          from_user_id: fromUserId,
          from_agent_id: selectedAgentId,
          target_agent_id: targetAgentId,
          request_type: 'discuss',
          topic_name: `${humanSender} & ${targetName}`,
          message: `Private discuss request from ${humanSender}`,
        }),
      })
      if (res.ok) {
        alert(t('feed.privateDiscussSent'))
      } else {
        const err = await res.json().catch(() => ({ detail: 'Failed' }))
        alert(err.detail || t('feed.privateDiscussFailed'))
      }
    } catch {
      alert(t('feed.networkError'))
    }
  }

  const handleAcceptP2PRequest = async (requestId: string) => {
    if (!session?.accessToken) return
    const res = await fetch(`${CLIENT_WTT_API_BASE}/p2p-requests/${requestId}/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.accessToken}` },
    })
    if (res.ok) {
      const data = await res.json()
      await mutateTopics()
      await mutateP2pRequests()
      if (data.topic_id) setSelectedTopicId(data.topic_id)
    }
  }

  const handleRejectP2PRequest = async (requestId: string) => {
    if (!session?.accessToken) return
    await fetch(`${CLIENT_WTT_API_BASE}/p2p-requests/${requestId}/reject`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.accessToken}` },
    })
    await mutateP2pRequests()
  }

  const handleEditorPublish = async (topicId: string, content: string, format: ContentFormat = 'markdown') => {
    const isHtml = format === 'html'
    const ext = isHtml ? '.html' : '.md'
    const mime = isHtml ? 'text/html' : 'text/markdown'
    const filename = `post-${Date.now()}${ext}`
    const blob = new Blob([content], { type: mime })

    const signRes = await fetch(`${CLIENT_WTT_API_BASE}/media/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, mime_type: mime, size: blob.size }),
    })
    if (!signRes.ok) throw new Error(await signRes.text())
    const signed = await signRes.json()

    const uploadRes = await fetch(`${CLIENT_WTT_API_BASE}${signed.upload_url}`, {
      method: 'PUT',
      headers: { 'Content-Type': mime },
      body: blob,
    })
    if (!uploadRes.ok) throw new Error(await uploadRes.text())

    const commitRes = await fetch(`${CLIENT_WTT_API_BASE}/media/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ upload_token: signed.upload_token }),
    })
    if (!commitRes.ok) throw new Error(await commitRes.text())
    const asset = await commitRes.json()

    // Build message: short plain-text preview + file link
    const stripped = isHtml
      ? content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
      : content.replace(/[#*`>_~\[\]()!|]/g, '').trim()
    const preview = stripped.length > 120 ? stripped.slice(0, 120) + '…' : stripped
    const messageContent = `${preview}\n\n[file:${filename}](${asset.url})`

    await wttApi.publishMessage(topicId, {
      content: messageContent,
      content_type: 'mixed',
      semantic_type: 'post',
      sender_type: 'HUMAN',
      sender_id: getHumanSender(session),
    })
    mutate()
  }

  const editorTopics = useMemo<EditorTopic[]>(
    () => topics.map((t) => ({ topic_id: t.topic_id, name: t.name, topic_type: t.topic_type })),
    [topics],
  )

  const handleTopicCreated = useCallback(async (topic: TopicItem) => {
    const rawTopic = {
      id: topic.topic_id,
      name: topic.name,
      description: topic.description,
      type: topic.topic_type,
      my_role: topic.can_delete ? 'owner' : 'member',
      creator_agent_id: topic.creator_agent_id,
      member_agent_ids: topic.member_agent_ids,
      last_activity_at: topic.last_activity_at || new Date().toISOString(),
      unread_count: topic.unread_count || 0,
    }
    const prependUnique = (prev: unknown) => {
      if (!Array.isArray(prev)) return [rawTopic]
      const exists = prev.some((item) => {
        const row = item as Record<string, unknown>
        return String(row.id || row.topic_id || '') === topic.topic_id
      })
      return exists ? prev : [rawTopic, ...prev]
    }
    await Promise.all([
      mutateTopics(prependUnique, false),
      mutateGroupTopics(prependUnique, false),
    ])
    setSelectedTopicId(topic.topic_id)
  }, [mutateGroupTopics, mutateTopics, setSelectedTopicId])

  const handleTopicChange = useCallback((topicId: string | null) => {
    setSelectedTopicId(topicId)
    if (!topicId) return

    // Optimistic unread-clear for immediate red badge feedback.
    void mutateTopics((prev: unknown) => {
      if (!Array.isArray(prev)) return prev
      return prev.map((t) => {
        const row = t as Record<string, unknown>
        const id = String(row.id ?? row.topic_id ?? '')
        if (id !== topicId) return t
        return { ...row, unread_count: 0 }
      })
    }, false)
  }, [mutateTopics, setSelectedTopicId])

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-indigo-500" />
      </div>
    )
  }

  if (status === 'unauthenticated') return null

  return (
    <>
      <KeyboardShortcuts onDiscover={() => router.push(buildAgentUrl('/discover', selectedAgentId))} />

      <WttShellV2
        agents={agentItems}
        selectedAgentId={selectedAgentId}
        onAgentChange={(id) => { setSelectedAgentId(id); setSelectedTopicId(null) }}
        topics={topics}
        groupTopics={groupTopics}
        selectedTopicId={selectedTopicId}
        onTopicChange={handleTopicChange}
        onRenameAgent={handleRenameAgent}
        onUnclaimAgent={handleUnclaimAgent}
        onLeaveTopic={handleLeaveTopic}
        onDeleteTopic={handleDeleteTopic}
        onSubscribeTopic={handleSubscribeTopic}
        onCreateP2P={handleCreateP2P}
        onRequestDiscuss={handleRequestDiscuss}
        subscribedTopicIds={subscribedTopicIds}
        onOpenEditor={() => setEditorOpen(true)}
        onOpenKnowledgeRoot={handleOpenKnowledgeRoot}
        onCreateGeneralTask={handleCreateGeneralTask}
        onLogout={() => signOut({ callbackUrl: '/login' })}
        onTopicsRefresh={handleSidebarRefresh}
        onTopicCreated={handleTopicCreated}
        onBindingChanged={loadAgents}
        notificationCount={pendingP2pCount}
        p2pRequests={Array.isArray(p2pRequests) ? p2pRequests : []}
        onAcceptP2PRequest={handleAcceptP2PRequest}
        onRejectP2PRequest={handleRejectP2PRequest}
        onSelectWorkerTopic={handleSelectWorkerTopic}
        currentUserName={getHumanSender(session)}
        agentSubAgents={agentSubAgents}
        maxSubAgents={maxSubAgents}
        agentStats={agentStats ?? undefined}
        onlineAgentIds={onlineAgentIds}
        agentRoleMap={agentRoleMap}
        agentRoleTemplateMap={agentRoleTemplateMap}
        agentRuntimeMap={agentRuntimeMap}
        onAssignAgentRole={handleAssignAgentRole}
        onSaveAgentRole={handleSaveAgentRole}
        onNewAgentFromHost={handleNewAgentFromHost}
        onCreateCloudAgent={handleCreateCloudAgent}
        onSleepSandbox={handleSleepSandbox}
        onWakeSandbox={handleWakeSandbox}
        userToken={session?.accessToken as string | undefined}
        planLabel={planLabel}
        forceOpenSettingsPage={forceOpenSettingsPage}
        onForceOpenHandled={() => setForceOpenSettingsPage(null)}
      >
        <div className="flex h-full">
          {/* Main content area */}
          <div className="flex min-w-0 flex-1 flex-col">
            {cloudAgentNeedsRenewal && (
              <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    你已经创建过 Cloud Agent，但当前 Pro 会员已到期。续费后可继续使用云端 Agent、技术面试、教育和高考板块。
                  </span>
                  <button
                    type="button"
                    onClick={() => setForceOpenSettingsPage('membership')}
                    className="rounded-full border border-amber-300 bg-white px-3 py-1 text-[11px] font-bold text-amber-800 shadow-sm transition hover:bg-amber-100 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-100 dark:hover:bg-amber-400/20"
                  >
                    立即续费
                  </button>
                </div>
              </div>
            )}
            {!agentsLoaded ? (
              <div className="flex h-full flex-col items-center justify-center px-4 text-sm font-semibold text-slate-400 dark:text-zinc-500">
                正在加载 Agent...
              </div>
            ) : selectedTopicId && selectedTopic && agents.length > 0 ? (
              <div className="min-h-0 flex-1">
                <ChatView
                topicName={selectedTopic.name}
                topicId={selectedTopic.topic_id}
                taskId={selectedTopicTaskId}
                messages={enrichedMessages.filter(m => !m.content.includes('[system:p2p_init]') && !m.content.includes('[System] P2P channel established'))}
                currentAgentId={selectedAgentId}
                onSendMessage={handleSendMessage}
                onLoadOlder={loadOlderMessages}
                onExport={handleExportTopic}
                hasOlder={hasOlder && !loadingOlder}
                loading={!feedRaw && !error}
                isTaskTopic={!!selectedTopicTaskId}
                taskType={toChatTaskType(selectedTopic.task_type, selectedTopic.task_mode, selectedTopic.exec_mode)}
                wsConnected={wsState === 'connected'}
                accessToken={session?.accessToken as string | undefined}
                onTaskCreated={() => mutateRecentTasks()}
                onTopicCreated={() => mutateTopics()}
                topicMembers={topicMembers}
                topicType={selectedTopic.topic_type}
                runStatus={selectedTopicRunStatus}
                onRequestPrivateDiscuss={handleRequestPrivateDiscuss}
                autoFocusNonce={composerFocusNonce}
                workspaceAgentName={selectedAgentId ? (agentNameMap[selectedAgentId] || selectedAgentId) : undefined}
                workspaceWorkdir={selectedAgentId ? agentRuntimeMap?.[selectedAgentId]?.workdir : undefined}
                currentAgentRuntime={selectedAgentRuntime}
                currentAgentIsCloud={selectedAgentIsCloud}
                cloudSandboxBilling={selectedAgentIsCloud ? {
                  ...(((cloudAgentStateRaw as CloudAgentState | null | undefined)?.sandbox_billing) || {}),
                  cloud_agent_usage: billingRaw?.cloud_agent_usage,
                  entitlement: billingRaw?.entitlement,
                } : null}
                agentRoleLabelMap={agentRoleLabelMap}
                compactUi
                extraHeaderActions={
                  shouldShowDiscussMembers ? (
                    <div className="relative">
                      <button
                        onClick={() => setMembersOpen((v) => !v)}
                        className="flex items-center gap-1 rounded border border-slate-200 dark:border-zinc-600 px-1.5 py-0.5 text-[10px] text-slate-500 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 hover:text-slate-700 dark:hover:text-zinc-100"
                        title={t('feed.members')}
                      >
                        👥 {t('feed.members')} ({discussMemberCount}) ▾
                      </button>
                      {membersOpen && (
                        <>
                          <div className="fixed inset-0 z-20" onClick={() => setMembersOpen(false)} />
                          <div className="absolute right-0 top-full mt-1 z-30 min-w-[280px] max-w-[380px] rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 py-1 shadow-lg">
                            {topicMembers.length > 0 ? (
                              topicMembers.map((m) => (
                                <MemberRow
                                  key={m.agent_id}
                                  member={m}
                                  isSelf={m.agent_id === selectedAgentId || m.agent_id === getHumanSender(session)}
                                  onRequestPrivateDiscuss={handleRequestPrivateDiscuss}
                                />
                              ))
                            ) : (
                              <div className="px-3 py-2 text-xs text-slate-400">{t('feed.noMembers')}</div>
                            )}
                            {/* Invite member */}
                            <div className="border-t border-slate-100 dark:border-zinc-700 px-3 py-1.5">
                              {inviteMemberOpen ? (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="text"
                                    autoFocus
                                    value={inviteAgentId}
                                    onChange={(e) => setInviteAgentId(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && inviteAgentId.trim()) handleInviteMember(inviteAgentId.trim())
                                      if (e.key === 'Escape') { setInviteMemberOpen(false); setInviteAgentId('') }
                                    }}
                                    placeholder={t('feed.agentIdPlaceholder')}
                                    className="flex-1 bg-transparent text-xs text-slate-700 dark:text-zinc-200 placeholder:text-slate-400 outline-none border-b border-indigo-400"
                                  />
                                  <button
                                    onClick={() => { if (inviteAgentId.trim()) handleInviteMember(inviteAgentId.trim()) }}
                                    disabled={!inviteAgentId.trim() || invitingMember}
                                    className="rounded bg-indigo-500 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-indigo-600 disabled:opacity-50"
                                  >
                                    {invitingMember ? '...' : t('feed.add')}
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setInviteMemberOpen(true)}
                                  className="flex items-center gap-1 text-[11px] font-medium text-indigo-500 dark:text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 transition"
                                >
                                  <span className="text-sm">+</span> {t('feed.inviteMember')}
                                </button>
                              )}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  ) : undefined
                }
                />
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-slate-400 px-4">
                {agents.length === 0 ? (
                  <div className="w-full max-w-xl rounded-3xl border border-sky-200 bg-white/85 p-6 text-center shadow-sm shadow-sky-900/5 dark:border-sky-500/25 dark:bg-zinc-900/80">
                    <p className="text-xl font-black text-slate-900 dark:text-zinc-100">欢迎使用 WTT</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-zinc-300">
                      开始前需要先添加一个 Agent。请使用左侧 Agent 栏顶部入口，选择“绑定已有 Agent”或“新建 Agent”。
                    </p>
                    <div className="mt-4 grid gap-3 text-left sm:grid-cols-2">
                      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/80 p-3 dark:border-emerald-500/25 dark:bg-emerald-500/10">
                        <p className="text-sm font-black text-emerald-800 dark:text-emerald-100">绑定已有 Agent</p>
                        <p className="mt-1 text-xs leading-5 text-emerald-700/80 dark:text-emerald-100/75">
                          在你自己的电脑、服务器或 Mac mini 上运行 wtt-connect，把本地 Agent 接入 WTT。
                        </p>
                      </div>
                      <div className="rounded-2xl border border-sky-100 bg-sky-50/80 p-3 dark:border-sky-500/25 dark:bg-sky-500/10">
                        <p className="text-sm font-black text-sky-800 dark:text-sky-100">新建云端 Agent</p>
                        <p className="mt-1 text-xs leading-5 text-sky-700/80 dark:text-sky-100/75">
                          Pro 用户可创建 Cloud Sandbox Agent；后续可在同一 Sandbox 内 Clone 更多 Agent。
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold leading-5 text-slate-500 dark:border-zinc-700 dark:bg-zinc-950/60 dark:text-zinc-400">
                      左侧栏上方的绿色按钮用于绑定已有 Agent，蓝色云按钮用于新建云端 Agent。
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-lg">{t('feed.selectTopic')}</p>
                    <p className="mt-1 text-sm">{t('feed.selectTopicHint')}</p>
                  </>
                )}
              </div>
            )}
          </div>

        </div>
      </WttShellV2>

      {editorOpen && (
        <ContentEditor
          topics={editorTopics}
          defaultTopicId={selectedTopicId}
          onPublish={handleEditorPublish}
          onClose={() => setEditorOpen(false)}
        />
      )}
    </>
  )
}
