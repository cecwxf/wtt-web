'use client'

import { useSession } from 'next-auth/react'
import { signOut } from '@/lib/sign-out'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowLeft, Bot, Camera, ChevronDown, ChevronRight, ClipboardList, Clock3, FolderTree, Hash, Loader2, LocateFixed, Lock, LogOut, MessageSquare, Paperclip, Radio, RefreshCw, Search, Send, Server, Settings, SquarePen, Users, WifiOff, X } from 'lucide-react'
import { CLIENT_WTT_API_BASE, WS_BASE_URL, resolveWttUploadUrl } from '@/lib/api/base-url'
import { shouldHideFeedTopic } from '@/lib/feed-topic-filter'
import { defaultMobileTopicId, mobileConversationAgentId, readMobileSelection, writeMobileSelection, type MobileSelection } from '@/lib/mobile-selection'
import { attachmentMimeType } from '@/lib/media/mime'
import {
  isTerminalMobileStatusKind,
  mobileHistoryProgressTtl,
  normalizeMobileProgressStatusKind,
  shouldCloseWaitingStatusFromAgentReply,
  shouldPollMobileMessages,
} from '@/lib/mobile-chat-status'
import { proxyMediaUrl, toThumbnailUrl } from '@/lib/rich-content'
import { useWebSocket, type WsMessage } from '@/lib/useWebSocket'
import {
  mergeMessageHistory,
  readCachedMessageHistory,
  writeCachedMessageHistory,
} from '@/lib/chat-history'
import { SpeechInputControl, SpeechReadButton } from '@/components/ui/speech-controls'
import { ToolApprovalPanel } from '@/components/ui/tool-approval-panel'
import { ManagedChatExecutions } from '@/components/ui/managed-chat-executions'
import { ManagedAgentTools } from '@/components/desktop/managed-agent-tools'
import { getNativeNotifications } from '@/lib/native-notifications'
import { useI18n } from '@/lib/i18n-provider'
import { mobileCommandDescriptions } from '@/lib/mobile-chat-copy'

const STATUS_STALE_MS = 15 * 60 * 1000
const STATUS_MAX_LINES = 10
const COMPLETE_HOLD_MS = 4500
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024
const OPTIMISTIC_TASK_TITLE_TTL_MS = 30 * 24 * 60 * 60 * 1000

type MobileSlashCommand = {
  cmd: string
  desc: string
  family: 'WTT' | 'Codex' | 'Claude' | 'Gemini' | 'Agent'
  mode?: 'local' | 'passthrough'
  skillId?: string
  source?: string
}

const MOBILE_SLASH_COMMANDS: MobileSlashCommand[] = [
  { cmd: '/new task', desc: '创建普通任务', family: 'WTT' },
  { cmd: '/new code task', desc: '创建代码任务', family: 'WTT' },
  { cmd: '/new research task', desc: '创建研究任务', family: 'WTT' },
  { cmd: '/new topic', desc: '创建 Topic', family: 'WTT' },
  { cmd: '/run', desc: '运行当前任务', family: 'WTT' },
  { cmd: '/workers', desc: '查看 Agent workers', family: 'WTT' },
  { cmd: '/status', desc: '查看运行状态', family: 'Agent' },
  { cmd: '/help', desc: '查看帮助', family: 'Agent' },
  { cmd: '/model', desc: '查看或切换模型', family: 'Agent' },
  { cmd: '/compact', desc: '压缩上下文', family: 'Agent' },
  { cmd: '/clear', desc: '清空当前会话视图', family: 'Agent' },
  { cmd: '/new', desc: '开启新运行时会话', family: 'Agent' },
  { cmd: '/review', desc: '审查当前修改', family: 'Codex' },
  { cmd: '/init', desc: '初始化项目上下文', family: 'Codex' },
  { cmd: '/approvals', desc: '查看审批策略', family: 'Codex' },
  { cmd: '/permissions', desc: '查看权限设置', family: 'Codex' },
  { cmd: '/diff', desc: '查看当前 diff', family: 'Codex' },
  { cmd: '/mcp', desc: '查看 MCP 工具', family: 'Codex' },
  { cmd: '/agents', desc: '管理子 Agent', family: 'Claude' },
  { cmd: '/config', desc: '运行时配置', family: 'Claude' },
  { cmd: '/memory', desc: '查看或管理记忆', family: 'Claude' },
  { cmd: '/cost', desc: '查看用量成本', family: 'Claude' },
  { cmd: '/tools', desc: '查看可用工具', family: 'Gemini' },
  { cmd: '/stats', desc: '查看会话统计', family: 'Gemini' },
  { cmd: '/resume', desc: '恢复会话', family: 'Agent' },
  { cmd: '/exit', desc: '退出或断开运行时', family: 'Agent' },
]

type AgentRecord = {
  agent_id: string
  display_name?: string
  name?: string
  is_cloud_sandbox?: boolean
  cloud_host_agent_id?: string
  binding_method?: string
  bound_via?: string
}

type TopicRecord = {
  id?: string
  topic_id?: string
  name?: string
  description?: string
  type?: string
  topic_type?: string
  task_id?: string
  task_title?: string
  task_type?: string
  task_status?: string
  runner_agent_id?: string
  unread_count?: number
  last_activity_at?: string
  last_message_at?: string
  created_at?: string
  member_agent_ids?: string[]
  primary_agent_id?: string
  creator_agent_id?: string
  agent_ids?: string[]
}

type RecentTopicRecord = TopicRecord & {
  topic_name?: string
  last_message_preview?: string
  primary_agent_id?: string
  agent_ids?: string[]
  agent_labels?: Array<{ agent_id: string; display_name?: string }>
}

type OptimisticTaskTitle = {
  title: string
  expiresAt: number
}

type TopicGroupKey = 'p2p' | 'task' | 'group' | 'subscriber'

type SelectorStep = 'hosts' | 'agents' | 'topics'

type TopicMember = {
  agent_id: string
  display_name?: string
  role?: string
  roleLabel?: string
  role_label?: string
  role_name?: string
}

type ChatMessage = {
  message_id: string
  topic_id?: string
  sender_id: string
  sender_display_name?: string
  sender_type: 'human' | 'agent'
  content: string
  timestamp: string
}

type RuntimeInfo = {
  hostname?: string
  host_agent_id?: string
  provider?: string
  adapter?: string
  current_model?: string
  model?: string
}

type TypingState = {
  agentId: string
  agentName?: string
  adapter?: string
  model?: string
  statusText?: string
  statusKind?: string
  statusLines: Array<{ id: string; text: string; kind?: string; ts: number }>
  startedAt: number
  expiresAt: number
}

type MobileRunStatus = {
  agentId: string
  agentName: string
  adapter?: string
  model?: string
  statusText?: string
  statusKind?: string
  lines: TypingState['statusLines']
  startedAt: number
  expiresAt: number
  wsState: string
}

type BillingMe = {
  entitlement?: {
    plan?: string
    status?: string
    ends_at?: string | null
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

type PendingAsset = {
  url: string
  filename: string
  kind: 'image' | 'audio' | 'video' | 'file'
  token: string
}

type FailedSend = {
  content: string
  draft: string
  assets: PendingAsset[]
  agentId: string
  topicId: string
  taskId: string
  error: string
}

function authHeaders(token?: string): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function topicId(topic?: TopicRecord | null): string {
  return String(topic?.topic_id || topic?.id || '').trim()
}

function topicTime(topic: TopicRecord): string {
  return String(topic.last_activity_at || topic.last_message_at || topic.created_at || '')
}

function displayName(agent?: AgentRecord | null): string {
  return String(agent?.display_name || agent?.name || agent?.agent_id || 'Agent')
}

function appendRoleLabel(label: string, roleLabel?: string): string {
  const base = String(label || '').trim()
  const role = String(roleLabel || '').trim()
  if (!base || !role) return base
  if (base.includes(`(${role})`) || base.includes(`（${role}）`)) return base
  return `${base}(${role})`
}

function topicMemberRole(member?: TopicMember | null): string {
  return String(member?.roleLabel || member?.role_label || member?.role_name || member?.role || '').trim()
}

function agentInitial(name: string): string {
  return (name.trim()[0] || 'A').toUpperCase()
}

function senderLabel(message: ChatMessage): string {
  return String(message.sender_display_name || message.sender_id || (message.sender_type === 'agent' ? 'Agent' : 'You'))
}

function topicKind(topic?: TopicRecord | null): string {
  return String(topic?.topic_type || topic?.type || 'discussion').toLowerCase()
}

function isGroupTopic(topic?: TopicRecord | null): boolean {
  return ['discussion', 'collaborative'].includes(topicKind(topic))
}

function topicGroup(topic: TopicRecord): TopicGroupKey {
  if (topicKind(topic) === 'p2p') return 'p2p'
  if (topic.task_id) return 'task'
  if (topicKind(topic) === 'broadcast') return 'subscriber'
  return 'group'
}

function topicGroupMeta(group: TopicGroupKey, translate: (key: string) => string) {
  switch (group) {
    case 'p2p':
      return { label: translate('mobile.p2p'), Icon: Lock, tone: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-200 dark:border-indigo-900' }
    case 'task':
      return { label: translate('mobile.tasks'), Icon: ClipboardList, tone: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-900' }
    case 'group':
      return { label: translate('mobile.groups'), Icon: Users, tone: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-200 dark:border-sky-900' }
    case 'subscriber':
      return { label: translate('mobile.broadcasts'), Icon: Radio, tone: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-900' }
  }
}

function topicKindLabel(topic?: TopicRecord | null, english = false): string {
  if (!topic) return 'Topic'
  if (topic.task_id) return english ? 'Task' : '任务'
  switch (topicKind(topic)) {
    case 'p2p':
      return 'P2P'
    case 'broadcast':
      return english ? 'Subscription' : '订阅'
    case 'collaborative':
      return english ? 'Team' : '协作群聊'
    default:
      return english ? 'Group' : '群聊'
  }
}

function compactId(value: string, prefixLength = 10, suffixLength = 4): string {
  const text = String(value || '').trim()
  if (text.length <= prefixLength + suffixLength + 1) return text
  return `${text.slice(0, prefixLength)}…${text.slice(-suffixLength)}`
}

function compactAgentName(agent?: AgentRecord | null): string {
  const name = displayName(agent)
  if (/^agent-[a-f0-9]{10,}$/i.test(name)) return compactId(name, 9, 4)
  return name
}

function compactTopicTitle(topic?: TopicRecord | null, english = false): string {
  const taskTitle = String(topic?.task_title || '').trim()
  if (topic?.task_id && taskTitle) return taskTitle
  const name = String(topic?.name || '').trim()
  if (!name) return english ? 'Choose Topic' : '选择 Topic'
  const taskMatch = /^TASK-[a-f0-9]{8}\s+(.+)$/i.exec(name)
  if (taskMatch?.[1]) return taskMatch[1].trim()
  if (/^TASK-[a-f0-9]{8}$/i.test(name)) return 'New Task'
  return name
}

function isDefaultTaskTitle(topic?: TopicRecord | null): boolean {
  const name = String(topic?.name || '').trim()
  if (!topic?.task_id) return false
  return !name || name === 'New Task' || /^TASK-[a-f0-9]{8}$/i.test(name) || /^TASK-[a-f0-9]{8}\s+New Task$/i.test(name)
}

function titleFromFirstMessage(content: string): string {
  const title = String(content || '')
    .split('\n')
    .map((item) => item.replace(/\[[^\]]+\]\([^)]+\)/g, '').trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(' ')
  if (!title) return 'New Task'
  return title.length > 48 ? `${title.slice(0, 46)}...` : title
}

function topicIcon(topic?: TopicRecord | null) {
  if (!topic) return Hash
  if (topic.task_id) return ClipboardList
  switch (topicKind(topic)) {
    case 'p2p':
      return Lock
    case 'broadcast':
      return Radio
    case 'collaborative':
      return Users
    default:
      return Hash
  }
}

function stripMobileMetaBlocks(content: string): string {
  let cleaned = content.replace(
    /┌─\s*(.+?)\s*─+\n((?:│[^\n]*\n?)*)└─+\n?/g,
    '',
  )
  cleaned = cleaned.replace(/\[(Switched\s*→\s*)?Model:\s*[^\]]*\]\s*/g, '')
  cleaned = cleaned.replace(/\[Agent Role Template\][\s\S]*?\[\/Agent Role Template\]\s*/gi, '')
  cleaned = cleaned.replace(/\[WTT Agent Soul\][\s\S]*?\[\/WTT Agent Soul\]\s*/gi, '')
  cleaned = cleaned.replace(/\[WTT Worker Persona\][\s\S]*?\[\/WTT Worker Persona\]\s*/gi, '')
  cleaned = cleaned.replace(/\[WTT Worker Context\][\s\S]*?\[\/WTT Worker Context\]\s*/gi, '')
  cleaned = cleaned.replace(/\[FILE_CONTENT\b[^\]]*\][\s\S]*?\[\/FILE_CONTENT\]\s*/g, '')
  return cleaned.trim()
}

const MOBILE_PROGRESS_PATTERNS = [
  /^Time:\s*\d{1,2}:\d{2}:\d{2}\s*\n\s*Progress:\s*\d+%/m,
  /^Status:\s*\[Task:/m,
  /^\[STATUS\]\s*(Started|Completed)/m,
  /^Plan Mode result:/m,
  /^Plan Mode结果/m,
  /^Progress:\s*\d+%\s*$/m,
  /^\[TASK_STATUS\]/m,
  /^\[TASK_RUN\]/m,
  /^\[[^\]]+\]\s*状态=.*\|\s*动作=.*心跳=\d+s/m,
  /^\[[^\]]+\]\s*\|\s*状态\s*=\s*doing\b.*心跳=\d+s/m,
  /^\[[^\]]+\]\s*\|\s*状态\s*=\s*doing\b/m,
  /^🤔\s*Agent thinking/m,
]

function isMobileProgressMessage(content: string): boolean {
  const cleaned = stripMobileMetaBlocks(content).trim()
  if (!cleaned) return true
  return MOBILE_PROGRESS_PATTERNS.some((pattern) => pattern.test(cleaned))
}

function isMobileStatusRecord(record: Record<string, unknown>): boolean {
  const semantic = String(record.semantic_type || record.message_type || record.kind || '').trim()
  return ['task_request', 'TASK_REQUEST', 'task_status', 'TASK_STATUS', 'system', 'SYSTEM', 'notification', 'NOTIFICATION'].includes(semantic)
}

function adapterDisplayName(adapterRaw?: unknown): string {
  const adapter = String(adapterRaw || '').toLowerCase()
  if (adapter.includes('codex')) return 'Codex'
  if (adapter.includes('claude')) return 'Claude'
  if (adapter.includes('gemini')) return 'Gemini'
  if (adapter.includes('deepseek')) return 'DeepSeek'
  return 'Agent'
}

function statusFromProgressMessage(contentRaw: unknown, adapterRaw?: unknown, english = false): { text: string; kind: string } | null {
  const content = stripMobileMetaBlocks(String(contentRaw || '')).trim()
  if (!content.startsWith('[TASK_STATUS]')) return null
  const action = content.match(/\baction=([^\n\r]+)/)?.[1]?.trim() || ''
  const status = content.match(/\bstatus=([^\s\n\r]+)/)?.[1]?.trim() || ''
  if (!action && !status) return null

  const [group, detail = ''] = action.split(/:(.+)/)
  const kind = normalizeMobileProgressStatusKind(group, detail, status)
  const actor = adapterDisplayName(adapterRaw)
  if (group === 'session') {
    if (detail.includes('thread.started') || detail.includes('turn.started')) return { text: english ? `${actor} session started` : `${actor} 会话已启动`, kind: 'session' }
    if (detail.includes('completed')) return { text: english ? `${actor} session completed` : `${actor} 会话已完成`, kind }
    return { text: english ? `${actor} session: ${detail || status}` : `${actor} 会话状态：${detail || status}`, kind: 'session' }
  }
  if (group === 'response') {
    const output = detail.trim()
    return { text: output ? `${actor} ${english ? 'output: ' : '输出：'}${output.slice(0, 80)}` : english ? `${actor} responding` : `${actor} 正在输出`, kind: 'response' }
  }
  if (group === 'command') return { text: `${actor} ${english ? 'command: ' : '执行命令：'}${detail || status}`, kind: 'command' }
  if (group === 'tool') return { text: `${actor} ${english ? 'tool: ' : '调用工具：'}${detail || status}`, kind: 'tool' }
  return { text: `Agent ${english ? 'status: ' : '状态：'}${action || status}`, kind }
}

function mobileStatusKindLabel(kind?: string, english = false): string {
  const normalized = String(kind || '').toLowerCase()
  if (normalized.includes('todo')) return english ? 'Pending' : '待执行'
  if (normalized.includes('doing') || normalized.includes('running')) return english ? 'Running' : '执行中'
  if (normalized.includes('review')) return english ? 'Review' : '待验收'
  if (normalized.includes('blocked')) return english ? 'Blocked' : '阻塞'
  if (normalized.includes('queued')) return english ? 'Queued' : '排队'
  if (normalized.includes('command')) return english ? 'Command' : '命令'
  if (normalized.includes('tool')) return english ? 'Tool' : '工具'
  if (normalized.includes('response')) return english ? 'Output' : '输出'
  if (normalized.includes('session')) return english ? 'Session' : '会话'
  if (normalized.includes('complete') || normalized.includes('done')) return english ? 'Complete' : '完成'
  if (normalized.includes('error') || normalized.includes('fail')) return english ? 'Error' : '异常'
  return english ? 'Active' : '运行'
}

function taskStatusText(status?: string, title?: string, english = false): string {
  const normalized = String(status || '').toLowerCase()
  const subject = title ? `「${title}」` : '当前任务'
  if (english) {
    const name = title ? `"${title}"` : 'Current task'
    if (normalized === 'todo') return `${name} created, waiting for Agent`
    if (normalized === 'doing') return `${name} running`
    if (normalized === 'review') return `${name} executed, awaiting review`
    if (normalized === 'done') return `${name} completed`
    if (normalized === 'blocked') return `${name} blocked`
    if (normalized === 'cancelled') return `${name} cancelled`
    return normalized ? `${name}: ${normalized}` : ''
  }
  if (normalized === 'todo') return `${subject}已创建，等待 Agent 接收`
  if (normalized === 'doing') return `${subject}执行中`
  if (normalized === 'review') return `${subject}已完成执行，等待验收`
  if (normalized === 'done') return `${subject}已完成`
  if (normalized === 'blocked') return `${subject}已阻塞`
  if (normalized === 'cancelled') return `${subject}已取消`
  return normalized ? `${subject}状态：${normalized}` : ''
}

function isTerminalStatusKind(kind?: string): boolean {
  return isTerminalMobileStatusKind(kind)
}

function adapterStatusLabel(adapter?: string): string {
  const value = String(adapter || '').trim()
  if (value === 'claude-code') return 'Claude Code'
  if (value === 'codex') return 'Codex'
  if (value === 'gemini') return 'Gemini'
  return value
}

function MobileAgentRunStatusCard({ status, compact = false }: { status: MobileRunStatus; compact?: boolean }) {
  const { locale } = useI18n()
  const terminal = isTerminalStatusKind(status.statusKind)
  const lines = status.lines.slice(compact ? -4 : -6)
  const subtitle = [adapterStatusLabel(status.adapter), status.model].filter(Boolean).join(' · ')

  return (
    <div className="rounded-2xl border border-blue-100 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 px-3 py-2.5 text-slate-800 dark:text-zinc-200 shadow-sm">
      <div className="flex min-w-0 items-start gap-2">
        <Loader2 className={`mt-0.5 h-4 w-4 shrink-0 text-blue-600 ${terminal ? '' : 'animate-spin'}`} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-xs font-semibold text-slate-900 dark:text-zinc-100">{status.agentName}</span>
            <span className="shrink-0 rounded-full bg-white dark:bg-zinc-950 px-1.5 py-0.5 text-[9px] font-bold text-blue-700">
              {mobileStatusKindLabel(status.statusKind, locale === 'en')}
            </span>
            {subtitle && <span className="min-w-0 truncate text-[10px] font-medium text-slate-400 dark:text-zinc-500">{subtitle}</span>}
            <span className="shrink-0 text-[10px] font-medium text-slate-400 dark:text-zinc-500">WS {status.wsState}</span>
          </div>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-[12px] font-medium leading-5 text-slate-700 dark:text-zinc-200">{status.statusText}</p>
        </div>
      </div>
      {lines.length > 0 && (
        <div className="mt-2 max-h-28 space-y-1 overflow-y-auto border-t border-blue-100 dark:border-blue-900 pt-2">
          {lines.map((line) => (
            <div key={line.id} className="grid grid-cols-[64px_minmax(0,1fr)] gap-2 text-[11px] font-medium leading-4 text-slate-600 dark:text-zinc-300">
              <span className="rounded-md bg-white dark:bg-zinc-950 px-1.5 py-0.5 text-center text-[10px] font-bold text-blue-700">{mobileStatusKindLabel(line.kind, locale === 'en')}</span>
              <span className="min-w-0 whitespace-pre-wrap break-words font-mono text-slate-700 dark:text-zinc-200">{line.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function filenameFromUrl(url: string): string {
  const clean = decodeURIComponent(String(url || '').split('?')[0].split('#')[0])
  return clean.split('/').pop() || 'file'
}

function isMobileImageCandidate(label: string, url: string): boolean {
  const candidate = `${label} ${url}`.toLowerCase()
  return /(^|\.)((png|jpe?g|gif|webp|heic|heif|bmp|avif))(\?|#|\s|$)/i.test(candidate)
}

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || isMobileImageCandidate(file.name, file.name)
}

function isAudioFile(file: File): boolean {
  return file.type.startsWith('audio/') || /(^|\.)((mp3|wav|ogg|m4a|aac|flac))$/i.test(file.name)
}

function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/') || /(^|\.)((mp4|webm|mov|m4v))$/i.test(file.name)
}

function mobileFileMeta(label: string, href: string): { isAttachment: boolean; kind: string; name: string } {
  const cleanLabel = String(label || '').replace(/^(file|audio|video):/i, '').trim()
  const name = cleanLabel || filenameFromUrl(href)
  const candidate = `${name} ${href}`.toLowerCase()
  const isAudio = /(^|\.)((mp3|wav|ogg|m4a|aac|flac))(\?|#|\s|$)/i.test(candidate)
  const isVideo = /(^|\.)((mp4|webm|mov|m4v))(\?|#|\s|$)/i.test(candidate)
  const isFile = /(^|\.)((pdf|doc|docx|ppt|pptx|xls|xlsx|csv|zip|tar|gz|md|txt|html|htm))(\?|#|\s|$)/i.test(candidate)
  if (isMobileImageCandidate(name, href)) return { isAttachment: true, kind: 'IMAGE', name }
  if (/^audio:/i.test(String(label)) || isAudio) return { isAttachment: true, kind: 'AUDIO', name }
  if (/^video:/i.test(String(label)) || isVideo) return { isAttachment: true, kind: 'VIDEO', name }
  if (/^file:/i.test(String(label)) || isFile || href.includes('/media/')) return { isAttachment: true, kind: 'FILE', name }
  return { isAttachment: false, kind: '', name }
}

function childText(children: React.ReactNode): string {
  if (typeof children === 'string' || typeof children === 'number') return String(children)
  if (Array.isArray(children)) return children.map(childText).join('')
  return ''
}

function MobileMarkdownLink({
  href,
  children,
  onImageOpen,
}: {
  href?: string
  children?: React.ReactNode
  onImageOpen: (url: string, label: string) => void
}) {
  const { t } = useI18n()
  const url = String(href || '')
  const label = childText(children)
  const meta = mobileFileMeta(label, url)
  if (meta.isAttachment) {
    if (meta.kind === 'IMAGE') {
      const imageUrl = proxyMediaUrl(url)
      const thumbUrl = toThumbnailUrl(url)
      return (
        <button
          type="button"
          onClick={() => onImageOpen(imageUrl, meta.name)}
          className="my-2 inline-flex max-w-[144px] flex-col overflow-hidden rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-left align-top shadow-sm"
          aria-label={t('mobile.originalImage', { name: meta.name })}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumbUrl} alt={meta.name} className="h-24 w-36 bg-slate-100 dark:bg-zinc-800 object-cover" loading="lazy" />
          <span className="block truncate px-2 py-1 text-[10px] font-semibold text-slate-500 dark:text-zinc-400">{meta.name}</span>
        </button>
      )
    }
    const fileUrl = proxyMediaUrl(url)
    return (
      <a href={fileUrl} target="_blank" rel="noreferrer" className="my-1 inline-flex max-w-full items-center gap-2 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-zinc-200">
        <span className="shrink-0 rounded-md bg-slate-100 dark:bg-zinc-800 px-1.5 py-1 text-[10px] font-semibold text-slate-700 dark:text-zinc-200">{meta.kind}</span>
        <span className="min-w-0 truncate">{meta.name}</span>
      </a>
    )
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="break-words text-sky-700 underline decoration-sky-300 underline-offset-2">
      {children}
    </a>
  )
}

function MobileMarkdownImage({
  src,
  alt,
  onImageOpen,
}: {
  src?: string
  alt?: string
  onImageOpen: (url: string, label: string) => void
}) {
  const { t } = useI18n()
  const url = String(src || '')
  const imageUrl = proxyMediaUrl(url)
  const thumbUrl = toThumbnailUrl(url)
  const label = alt || filenameFromUrl(imageUrl) || 'image'
  return (
    <button
      type="button"
      onClick={() => onImageOpen(imageUrl, label)}
      className="my-2 inline-flex max-w-[144px] flex-col overflow-hidden rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-left align-top shadow-sm"
      aria-label={t('mobile.originalImage', { name: label })}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={thumbUrl} alt={label} className="h-24 w-36 bg-slate-100 dark:bg-zinc-800 object-cover" loading="lazy" />
      {label && <span className="block truncate px-2 py-1 text-[10px] font-semibold text-slate-500 dark:text-zinc-400">{label}</span>}
    </button>
  )
}

function runtimeHostLabel(agent: AgentRecord, runtime?: RuntimeInfo): string {
  return String(runtime?.hostname || runtime?.host_agent_id || agent.cloud_host_agent_id || '未上报主机').trim()
}

function runtimeLine(runtime?: RuntimeInfo): string {
  if (!runtime) return ''
  return [runtime.adapter || runtime.provider, runtime.current_model || runtime.model].filter(Boolean).join(' · ')
}

function agentSearchText(agent: AgentRecord, runtime?: RuntimeInfo, host = ''): string {
  return [
    agent.agent_id,
    agent.name || '',
    agent.display_name || '',
    host,
    runtimeLine(runtime),
  ].join('\n').toLowerCase()
}

function agentSearchRank(agent: AgentRecord, query: string, host = ''): number {
  const fields = [
    agent.agent_id,
    agent.name || '',
    agent.display_name || '',
    host,
  ].map((field) => field.toLowerCase()).filter(Boolean)
  if (fields.some((field) => field === query)) return 0
  if (fields.some((field) => field.startsWith(query))) return 1
  return 2
}

function humanSender(session: unknown): string {
  const s = session as { userId?: string; user?: { name?: string | null; email?: string | null } } | null | undefined
  const uid = s?.userId || ''
  return s?.user?.name || s?.user?.email || (uid ? `user_${uid.slice(0, 8)}` : 'user_default')
}

function normalizeMessages(raw: unknown): ChatMessage[] {
  const rows = Array.isArray(raw) ? raw : []
  return rows.flatMap((item) => {
    const rec = item as Record<string, unknown>
    const content = String(rec.content || '')
    if (isMobileStatusRecord(rec) || isMobileProgressMessage(content)) return []
    const senderType = String(rec.sender_type || '').toLowerCase() === 'agent' ? 'agent' : 'human'
    return [{
      message_id: String(rec.message_id || rec.id || `${rec.created_at || Date.now()}-${Math.random()}`),
      topic_id: String(rec.topic_id || ''),
      sender_id: String(rec.sender_id || ''),
      sender_display_name: rec.sender_display_name ? String(rec.sender_display_name) : undefined,
      sender_type: senderType,
      content,
      timestamp: String(rec.timestamp || rec.created_at || new Date().toISOString()),
    }]
  })
}

function normalizeWsMessage(raw: unknown): ChatMessage | null {
  const rec = raw as Record<string, unknown>
  const msg = (rec.message && typeof rec.message === 'object' ? rec.message : rec) as Record<string, unknown>
  const id = String(msg.message_id || msg.id || '')
  const content = String(msg.content || '')
  if (!id || !content) return null
  if (isMobileStatusRecord(msg) || isMobileStatusRecord(rec) || isMobileProgressMessage(content)) return null
  return {
    message_id: id,
    topic_id: String(msg.topic_id || ''),
    sender_id: String(msg.sender_id || ''),
    sender_display_name: msg.sender_display_name ? String(msg.sender_display_name) : undefined,
    sender_type: String(msg.sender_type || '').toLowerCase() === 'agent' ? 'agent' : 'human',
    content,
    timestamp: String(msg.timestamp || msg.created_at || new Date().toISOString()),
  }
}

function shouldCountUnreadMessage(message: ChatMessage): boolean {
  const content = stripMobileMetaBlocks(message.content).trim()
  return Boolean(content && !isMobileProgressMessage(content))
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

function statusTextFromTypingEvent(record: Record<string, unknown>, english = false): string | undefined {
  const direct = eventString(record, ['status_text', 'statusText', 'activity_text', 'activityText', 'message', 'detail', 'text', 'summary', 'description', 'progress'])
  if (direct) return direct
  const command = eventString(record, ['command', 'cmd', 'shell_command'])
  if (command) return `${english ? 'Command: ' : '执行命令：'}${command}`
  const tool = eventString(record, ['tool', 'tool_name', 'toolName', 'name'])
  if (tool) return `${english ? 'Tool: ' : '调用工具：'}${tool}`
  const phase = eventString(record, ['phase', 'stage', 'step', 'status'])
  if (phase) return `${english ? 'Phase: ' : '阶段：'}${phase}`
  return undefined
}

function statusKindFromTypingEvent(record: Record<string, unknown>): string | undefined {
  return eventString(record, ['status_kind', 'statusKind', 'kind', 'event_kind', 'eventKind', 'phase', 'type', 'status']) || undefined
}

function appendTypingStatus(existing: TypingState | undefined, update: Partial<TypingState> & { ttlMs?: number }, now: number): TypingState {
  const text = String(update.statusText || '').trim()
  const kind = update.statusKind
  const lines = existing?.statusLines ? [...existing.statusLines] : []
  if (text) {
    const last = lines[lines.length - 1]
    if (last && last.text === text && last.kind === kind) lines[lines.length - 1] = { ...last, ts: now }
    else lines.push({ id: `${now}-${lines.length}-${kind || 'status'}`, text, kind, ts: now })
  }
  return {
    agentId: update.agentId || existing?.agentId || '',
    agentName: update.agentName || existing?.agentName,
    adapter: update.adapter || existing?.adapter,
    model: update.model || existing?.model,
    statusText: text || existing?.statusText,
    statusKind: kind || existing?.statusKind,
    statusLines: lines.slice(-STATUS_MAX_LINES),
    startedAt: existing?.startedAt || now,
    expiresAt: now + (update.ttlMs || STATUS_STALE_MS),
  }
}

function shortTime(raw: string): string {
  if (!raw) return ''
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function quotaText(billing?: BillingMe | null, english = false): string {
  const usage = billing?.cloud_agent_usage
  const limits = billing?.entitlement?.limits
  return english
    ? `Cloud Agent ${usage?.monthly_count || 0}/${limits?.monthly_limit || 500} monthly · ${usage?.window_count || 0}/${limits?.window_limit || 30} per window`
    : `Cloud Agent ${usage?.monthly_count || 0}/${limits?.monthly_limit || 500} 月额度 · 连续 ${usage?.window_count || 0}/${limits?.window_limit || 30}`
}

function isBrowserOnline(): boolean {
  if (typeof navigator === 'undefined') return true
  return navigator.onLine !== false
}

function fixedTopicFromSearch(search: string): string {
  if (!search) return ''
  const params = new URLSearchParams(search)
  if (params.get('fixed_chat') !== '1' && params.get('embed_chat') !== '1') return ''
  return String(params.get('fixed_topic_id') || params.get('topic_id') || params.get('topicId') || params.get('topic') || '').trim()
}

function agentFromSearch(search: string): string {
  if (!search) return ''
  const params = new URLSearchParams(search)
  return String(params.get('agent_id') || params.get('agentId') || '').trim()
}

export default function MobileFeedPage() {
  const router = useRouter()
  const { t, locale } = useI18n()
  const { data: session, status } = useSession()
  const sessionToken = session?.accessToken as string | undefined
  const [nativeAccessToken, setNativeAccessToken] = useState('')
  const [nativeSessionReady, setNativeSessionReady] = useState(false)
  const token = sessionToken || nativeAccessToken || undefined
  const { data: nativeAccount } = useSWR<{ user_id?: string }>(
    token && !session?.userId ? ['mobile-account', token] : null,
    async () => {
      const res = await fetch(`${CLIENT_WTT_API_BASE}/auth/me`, { headers: authHeaders(token), cache: 'no-store' })
      if (!res.ok) throw new Error(`Account request failed (${res.status})`)
      const identity = await res.json()
      if (typeof identity?.user_id !== 'string' || !identity.user_id) throw new Error('Invalid account identity')
      return identity
    },
    { revalidateOnFocus: false },
  )
  const accountId = session?.userId || nativeAccount?.user_id || ''
  const selectionScope = accountId
  const [selectionReadyScope, setSelectionReadyScope] = useState('')
  const selectionReady = Boolean(selectionScope && selectionReadyScope === selectionScope)
  const selectionOwnerRef = useRef('')
  const rememberedSelectionRef = useRef<MobileSelection | null>(null)
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [selectedTopicId, setSelectedTopicId] = useState('')
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [uploadError, setUploadError] = useState('')
  const [selectorOpen, setSelectorOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [selectorStep, setSelectorStep] = useState<SelectorStep>('hosts')
  const [selectedHost, setSelectedHost] = useState('')
  const [attachOpen, setAttachOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [pendingAssets, setPendingAssets] = useState<PendingAsset[]>([])
  const [typingByTopic, setTypingByTopic] = useState<Record<string, TypingState>>({})
  const [creatingTask, setCreatingTask] = useState(false)
  const [failedSend, setFailedSend] = useState<FailedSend | null>(null)
  const [browserOnline, setBrowserOnline] = useState(true)
  const [optimisticTaskTitles, setOptimisticTaskTitles] = useState<Record<string, OptimisticTaskTitle>>({})
  const [createdTaskIdsByTopic, setCreatedTaskIdsByTopic] = useState<Record<string, string>>({})
  const [slashOpen, setSlashOpen] = useState(false)
  const [slashFilter, setSlashFilter] = useState('')
  const [slashIndex, setSlashIndex] = useState(0)
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionIndex, setMentionIndex] = useState(0)
  const [mentionStartPos, setMentionStartPos] = useState(-1)
  const [isAndroidWebView, setIsAndroidWebView] = useState(false)
  const [fixedChatMode, setFixedChatMode] = useState(() => {
    if (typeof window === 'undefined') return false
    const params = new URLSearchParams(window.location.search)
    return params.get('fixed_chat') === '1' || params.get('embed_chat') === '1'
  })
  const [fixedTopicId, setFixedTopicId] = useState(() => {
    if (typeof window === 'undefined') return ''
    return fixedTopicFromSearch(window.location.search)
  })
  const [imagePreview, setImagePreview] = useState<{ url: string; label: string } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const pendingCreatedTopicIdRef = useRef('')
  const pendingRenameTaskRef = useRef<{ taskId: string; topicId: string } | null>(null)
  const deepLinkAgentAppliedRef = useRef('')
  const deepLinkTopicAppliedRef = useRef('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const sheetHistoryRef = useRef(false)
  const lastReadSyncRef = useRef<{ topicId: string; ts: number } | null>(null)
  const searchInteractiveRef = useRef(false)

  useEffect(() => {
    // A token refresh can briefly hide legacy identity. Wait to distinguish it from account switching.
    if ((!accountId && token) || selectionOwnerRef.current === selectionScope) return
    selectionOwnerRef.current = selectionScope
    rememberedSelectionRef.current = readMobileSelection(accountId)
    pendingCreatedTopicIdRef.current = ''
    pendingRenameTaskRef.current = null
    deepLinkAgentAppliedRef.current = ''
    deepLinkTopicAppliedRef.current = ''
    setSelectedAgentId('')
    setSelectedTopicId('')
    setSelectedHost('')
    setDraft('')
    setPendingAssets([])
    setFailedSend(null)
    setTypingByTopic({})
    setOptimisticTaskTitles({})
    setCreatedTaskIdsByTopic({})
    setSelectionReadyScope(selectionScope)
  }, [accountId, selectionScope, token])

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('__WTT_NATIVE_ACCESS_TOKEN__') || ''
      if (stored) setNativeAccessToken(stored)
    } catch {
      setNativeAccessToken('')
    }
  }, [])

  useEffect(() => {
    const ready = () => setNativeSessionReady(true)
    window.addEventListener('wtt-native-session-ready', ready)
    return () => window.removeEventListener('wtt-native-session-ready', ready)
  }, [])

  useEffect(() => {
    if (status === 'unauthenticated' && !nativeAccessToken) {
      if ((window as Window & { __WTT_NATIVE_SESSION_PENDING__?: boolean }).__WTT_NATIVE_SESSION_PENDING__ && !nativeSessionReady) return
      const source = typeof window !== 'undefined'
        ? String(new URLSearchParams(window.location.search).get('source') || '').toLowerCase()
        : ''
      router.replace(source === 'android'
        ? '/mobile/login?callbackUrl=/mobile/feed&source=android'
        : '/mobile/login?callbackUrl=/mobile/feed')
    }
  }, [nativeAccessToken, nativeSessionReady, router, status])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setIsAndroidWebView(String(params.get('source') || '').toLowerCase() === 'android')
    setFixedChatMode(params.get('fixed_chat') === '1' || params.get('embed_chat') === '1')
    setFixedTopicId(fixedTopicFromSearch(window.location.search))
  }, [])

  useEffect(() => {
    const updateOnline = () => setBrowserOnline(isBrowserOnline())
    updateOnline()
    window.addEventListener('online', updateOnline)
    window.addEventListener('offline', updateOnline)
    return () => {
      window.removeEventListener('online', updateOnline)
      window.removeEventListener('offline', updateOnline)
    }
  }, [])

  useEffect(() => {
    const anySheetOpen = selectorOpen || settingsOpen
    if (anySheetOpen && !sheetHistoryRef.current) {
      window.history.pushState({ wttMobileSheet: true }, '')
      sheetHistoryRef.current = true
    }
    if (!selectorOpen) searchInteractiveRef.current = false
  }, [selectorOpen, settingsOpen])

  useEffect(() => {
    const onPopState = () => {
      if (sheetHistoryRef.current) {
        sheetHistoryRef.current = false
        setSelectorOpen(false)
        setSettingsOpen(false)
        setAttachOpen(false)
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const closeSheet = useCallback((sheet: 'selector' | 'settings') => {
    if (sheet === 'selector') setSelectorOpen(false)
    if (sheet === 'settings') setSettingsOpen(false)
    setAttachOpen(false)
    if (sheetHistoryRef.current) {
      sheetHistoryRef.current = false
      window.history.back()
    }
  }, [])

  const openSelector = useCallback(() => {
    if (fixedChatMode) return
    setSearch('')
    setSelectorStep('hosts')
    setSelectedHost('')
    setSelectorOpen(true)
  }, [fixedChatMode])

  const openImagePreview = useCallback((url: string, label: string) => {
    const imageUrl = proxyMediaUrl(url)
    if (!imageUrl) return
    setImagePreview({ url: imageUrl, label: label || filenameFromUrl(imageUrl) || 'image' })
  }, [])

  const mobileMarkdownComponents = useMemo(() => ({
    a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
      <MobileMarkdownLink href={href} onImageOpen={openImagePreview}>{children}</MobileMarkdownLink>
    ),
    img: ({ src, alt }: { src?: string; alt?: string }) => (
      <MobileMarkdownImage src={src} alt={alt} onImageOpen={openImagePreview} />
    ),
  }), [openImagePreview])

  const { data: agentsRaw, error: agentsError, mutate: mutateAgents } = useSWR(
    token ? ['mobile-agents', token] : null,
    async () => {
      const res = await fetch(`${CLIENT_WTT_API_BASE}/agents/my`, { headers: authHeaders(token), cache: 'no-store' })
      if (!res.ok) throw new Error(`Agent directory request failed (${res.status})`)
      return res.json() as Promise<AgentRecord[]>
    },
    { refreshInterval: 15000, revalidateOnFocus: true },
  )

  const agents = useMemo(() => Array.isArray(agentsRaw) ? agentsRaw : [], [agentsRaw])

  useEffect(() => {
    const refreshDirectory = () => { if (token) void mutateAgents() }
    window.addEventListener('wtt-directory-changed', refreshDirectory)
    return () => window.removeEventListener('wtt-directory-changed', refreshDirectory)
  }, [token, mutateAgents])

  const { data: statsRaw, error: statsError, mutate: mutateStats } = useSWR(
    token ? ['mobile-agent-stats', token] : null,
    async () => {
      const res = await fetch(`${CLIENT_WTT_API_BASE}/agents/stats`, { headers: authHeaders(token), cache: 'no-store' })
      if (!res.ok) throw new Error(`Agent status request failed (${res.status})`)
      return res.json()
    },
    { refreshInterval: 10000, revalidateOnFocus: true },
  )

  const runtimeMap = useMemo(() => (((statsRaw as Record<string, unknown> | null)?.runtimes || {}) as Record<string, RuntimeInfo>), [statsRaw])
  const onlineAgents = useMemo(() => new Set(((statsRaw as Record<string, unknown> | null)?.online_agents as string[] | undefined) || []), [statsRaw])

  useEffect(() => {
    if (!selectionReady || !Array.isArray(agentsRaw)) return
    if (fixedChatMode && selectedAgentId && !agents.some((a) => a.agent_id === selectedAgentId)) return
    if (!selectedAgentId && agents.length) {
      const params = new URLSearchParams(window.location.search)
      const explicitAgent = agentFromSearch(window.location.search)
      const saved = rememberedSelectionRef.current
      const hasExplicitSelection = ['agent_id', 'agentId', 'topic_id', 'topicId', 'topic', 'task_id', 'taskId', 'task'].some(key => params.has(key))
      const agent = agents.find(item => item.agent_id === explicitAgent)
        || (!hasExplicitSelection && agents.find(item => item.agent_id === saved?.agentId))
        || agents[0]
      setSelectedAgentId(agent.agent_id)
      if (!fixedChatMode && !hasExplicitSelection && agent.agent_id === saved?.agentId) setSelectedTopicId(saved.topicId)
    }
    if (selectedAgentId && !agents.some((a) => a.agent_id === selectedAgentId)) {
      pendingCreatedTopicIdRef.current = ''
      setSelectedAgentId(agents[0]?.agent_id || '')
      setSelectedTopicId('')
    }
  }, [agents, agentsRaw, fixedChatMode, selectedAgentId, selectionReady])

  useEffect(() => {
    if (typeof window === 'undefined' || !selectionReady) return
    const key = window.location.search
    if (!key || deepLinkAgentAppliedRef.current === key) return
    const agentFromUrl = agentFromSearch(key)
    if (!agentFromUrl) {
      deepLinkAgentAppliedRef.current = key
      return
    }
    if (fixedChatMode || agents.some((agent) => agent.agent_id === agentFromUrl)) {
      deepLinkAgentAppliedRef.current = key
      if (selectedAgentId !== agentFromUrl) {
        pendingCreatedTopicIdRef.current = ''
        setSelectedAgentId(agentFromUrl)
        setSelectedTopicId('')
      }
    }
  }, [agents, fixedChatMode, selectedAgentId, selectionReady])

  const selectedAgent = useMemo(() => agents.find((a) => a.agent_id === selectedAgentId) || null, [agents, selectedAgentId])

  const { data: topicsRaw, error: topicsError, mutate: mutateTopics } = useSWR(
    token && selectionReady && selectedAgentId ? ['mobile-topics', token, selectedAgentId] : null,
    async () => {
      const res = await fetch(`${CLIENT_WTT_API_BASE}/topics/subscribed?agent_id=${encodeURIComponent(selectedAgentId)}`, {
        headers: authHeaders(token),
        cache: 'no-store',
      })
      if (!res.ok) throw new Error(`Topic directory request failed (${res.status})`)
      return res.json() as Promise<TopicRecord[]>
    },
    { refreshInterval: 12000, revalidateOnFocus: true },
  )

  const { data: groupTopicsRaw, error: groupTopicsError, mutate: mutateGroupTopics } = useSWR(
    token ? ['mobile-group-topics', token] : null,
    async () => {
      const res = await fetch(`${CLIENT_WTT_API_BASE}/topics/my-groups`, {
        headers: authHeaders(token),
        cache: 'no-store',
      })
      if (!res.ok) throw new Error(`Group directory request failed (${res.status})`)
      return res.json() as Promise<TopicRecord[]>
    },
    { refreshInterval: 30000, revalidateOnFocus: true },
  )

  const { data: recentTopicsRaw, error: recentTopicsError, mutate: mutateRecentTopics } = useSWR(
    token ? ['mobile-recent-topics', token] : null,
    async () => {
      const res = await fetch(`${CLIENT_WTT_API_BASE}/topics/my-recent?limit=10`, {
        headers: authHeaders(token),
        cache: 'no-store',
      })
      if (!res.ok) throw new Error(`Recent directory request failed (${res.status})`)
      return res.json() as Promise<{ items?: RecentTopicRecord[] }>
    },
    { refreshInterval: 12000, revalidateOnFocus: true },
  )

  const topics = useMemo(() => {
    const seen = new Set<string>()
    const recentRows = Array.isArray(recentTopicsRaw?.items) ? recentTopicsRaw.items : []
    const list = [
      ...(Array.isArray(topicsRaw) ? topicsRaw : []),
      ...(Array.isArray(groupTopicsRaw) ? groupTopicsRaw : []),
      ...recentRows,
    ]
      .filter((t) => topicId(t))
      .filter((topic) => !shouldHideFeedTopic(topic as Record<string, unknown>))
      .filter((topic) => {
        const id = topicId(topic)
        if (!id || seen.has(id)) return false
        seen.add(id)
        return true
      })
    const now = Date.now()
    return [...list]
      .map((topic) => {
        const id = topicId(topic)
        const optimistic = optimisticTaskTitles[id]
        if (!optimistic || optimistic.expiresAt <= now || !isDefaultTaskTitle(topic)) return topic
        return {
          ...topic,
          name: optimistic.title,
          task_title: optimistic.title,
          last_activity_at: topic.last_activity_at || new Date(now).toISOString(),
        }
      })
      .sort((a, b) => new Date(topicTime(b)).getTime() - new Date(topicTime(a)).getTime())
  }, [groupTopicsRaw, optimisticTaskTitles, recentTopicsRaw, topicsRaw])

  const recentTopics = useMemo(() => {
    const items = Array.isArray(recentTopicsRaw?.items) ? recentTopicsRaw.items : []
    return items
      .filter((topic) => topicId(topic))
      .filter((topic) => !shouldHideFeedTopic(topic as Record<string, unknown>))
      .slice(0, 10)
  }, [recentTopicsRaw])

  useEffect(() => {
    if (!Object.keys(optimisticTaskTitles).length) return
    const now = Date.now()
    const rawList = Array.isArray(topicsRaw) ? topicsRaw : []
    setOptimisticTaskTitles((current) => {
      let changed = false
      const next: Record<string, OptimisticTaskTitle> = {}
      for (const [id, optimistic] of Object.entries(current)) {
        const rawTopic = rawList.find((topic) => topicId(topic) === id)
        if (optimistic.expiresAt <= now || (rawTopic && !isDefaultTaskTitle(rawTopic))) {
          changed = true
          continue
        }
        next[id] = optimistic
      }
      return changed ? next : current
    })
  }, [optimisticTaskTitles, topicsRaw])

  const updateTopicUnreadCache = useCallback((targetTopicId: string, updater: (topic: TopicRecord) => TopicRecord) => {
    if (!targetTopicId) return
    const updateList = (current?: TopicRecord[]) => {
      if (!Array.isArray(current)) return current
      let changed = false
      const next = (current as TopicRecord[]).map((topic) => {
        if (topicId(topic) !== targetTopicId) return topic
        const updated = updater(topic)
        if (updated !== topic) changed = true
        return updated
      })
      return changed ? next : current
    }
    void mutateTopics(updateList, false)
    void mutateGroupTopics(updateList, false)
    void mutateRecentTopics((current?: { items?: RecentTopicRecord[] }) => {
      if (!current || !Array.isArray(current.items)) return current
      const next = updateList(current.items)
      return next === current.items ? current : { ...current, items: next as RecentTopicRecord[] }
    }, false)
  }, [mutateGroupTopics, mutateRecentTopics, mutateTopics])

  useEffect(() => {
    if (!selectionReady) return
    if (fixedChatMode) {
      if (fixedTopicId && selectedTopicId !== fixedTopicId) {
        pendingCreatedTopicIdRef.current = fixedTopicId
        setSelectedTopicId(fixedTopicId)
      }
      return
    }
    if (!selectedTopicId && topics.length && topicsRaw !== undefined) {
      const initial = defaultMobileTopicId(topics, Array.isArray(topicsRaw) ? topicsRaw : [])
      if (initial) setSelectedTopicId(initial)
      return
    }
    if (!selectedTopicId) return
    const topicExists = topics.some((t) => topicId(t) === selectedTopicId)
    if (!topicExists) {
      if (pendingCreatedTopicIdRef.current === selectedTopicId) return
      // Missing in one partial/failed directory is not proof the conversation vanished.
      if (topicsRaw === undefined || groupTopicsRaw === undefined || recentTopicsRaw === undefined
        || topicsError || groupTopicsError || recentTopicsError) return
      setSelectedTopicId(defaultMobileTopicId(topics, Array.isArray(topicsRaw) ? topicsRaw : []))
      return
    }
    if (pendingCreatedTopicIdRef.current === selectedTopicId) {
      pendingCreatedTopicIdRef.current = ''
    }
  }, [fixedChatMode, fixedTopicId, groupTopicsError, groupTopicsRaw, recentTopicsError, recentTopicsRaw, selectedTopicId, selectionReady, topics, topicsError, topicsRaw])

  useEffect(() => {
    if (typeof window === 'undefined' || !selectionReady || !topics.length) return
    const key = window.location.search
    if (!key || deepLinkTopicAppliedRef.current === key) return
    const params = new URLSearchParams(key)
    const topicFromUrl = String(params.get('topic_id') || params.get('topicId') || params.get('topic') || '').trim()
    const taskFromUrl = String(params.get('task_id') || params.get('taskId') || params.get('task') || '').trim()
    if (fixedChatMode && topicFromUrl) {
      deepLinkTopicAppliedRef.current = key
      pendingCreatedTopicIdRef.current = topicFromUrl
      setFixedTopicId(topicFromUrl)
      setSelectedTopicId(topicFromUrl)
      return
    }
    if (!topicFromUrl && !taskFromUrl) {
      deepLinkTopicAppliedRef.current = key
      return
    }
    const matched = topics.find((topic) => {
      const id = topicId(topic)
      const taskId = topic.task_id ? String(topic.task_id) : ''
      return (topicFromUrl && id === topicFromUrl) || (taskFromUrl && taskId === taskFromUrl)
    })
    if (!matched) return
    deepLinkTopicAppliedRef.current = key
    setSelectedTopicId(topicId(matched))
  }, [fixedChatMode, selectionReady, topics])

  const selectedTopic = useMemo(() => topics.find((t) => topicId(t) === selectedTopicId) || null, [selectedTopicId, topics])
  const conversationAgentId = useMemo(() => fixedChatMode ? selectedAgentId
    : mobileConversationAgentId(selectedTopic, selectedAgentId, agents.map(agent => agent.agent_id),
      Array.isArray(topicsRaw) ? topicsRaw.map(topicId) : []),
  [agents, fixedChatMode, selectedAgentId, selectedTopic, topicsRaw])
  useEffect(() => {
    if (!selectionReady || fixedChatMode || !conversationAgentId || conversationAgentId === selectedAgentId) return
    pendingCreatedTopicIdRef.current = ''
    setSelectedAgentId(conversationAgentId)
  }, [conversationAgentId, fixedChatMode, selectedAgentId, selectionReady])
  useEffect(() => {
    if (!accountId || !selectionReady || fixedChatMode || !selectedAgent || !selectedTopic || selectedAgentId !== conversationAgentId) return
    writeMobileSelection(accountId, { agentId: selectedAgentId, topicId: selectedTopicId })
  }, [accountId, conversationAgentId, fixedChatMode, selectedAgent, selectedAgentId, selectedTopic, selectedTopicId, selectionReady])
  const selectedTaskId = selectedTopic?.task_id
    ? String(selectedTopic.task_id)
    : (selectedTopicId ? createdTaskIdsByTopic[selectedTopicId] || '' : '')
  const selectedTypingState = selectedTopicId ? typingByTopic[selectedTopicId] : undefined
  const pollSelectedMessages = shouldPollMobileMessages(selectedTypingState)

  const canFetchMessages = Boolean(token && selectionReady && selectedTopicId && (selectedAgentId || fixedChatMode)
    && selectedAgentId === conversationAgentId
    && (fixedChatMode || selectedTopic || pendingCreatedTopicIdRef.current === selectedTopicId))
  const messageHistoryOwner = `${accountId}:${selectedAgentId || 'auto'}:${selectedTaskId || ''}:${fixedChatMode ? 'fixed' : 'feed'}`
  const messageHistoryRef = useRef<Map<string, unknown[]>>(new Map())
  const messageHistoryKey = `${selectionScope}:${selectedTopicId || ''}:${messageHistoryOwner}`
  const { data: messagesRaw, mutate: mutateMessages } = useSWR(
    canFetchMessages ? ['mobile-messages', token, selectedAgentId || 'auto', selectedTopicId, selectedTaskId, fixedChatMode] : null,
    async () => {
      // Load a useful history window once, then keep polling responses small and
      // merge them into the per-topic cache.
      const cachedHistory = messageHistoryRef.current.get(messageHistoryKey)
        || (accountId ? readCachedMessageHistory('mobile', selectedTopicId, messageHistoryOwner) : undefined)
      const historyLimit = cachedHistory?.length ? '100' : '500'
      const params = new URLSearchParams({ limit: historyLimit })
      if (selectedAgentId) params.set('agent_id', selectedAgentId)
      params.set('include_history', 'true')
      const res = await fetch(`${CLIENT_WTT_API_BASE}/topics/${selectedTopicId}/messages?${params.toString()}`, {
        headers: authHeaders(token),
        cache: 'no-store',
      })
      if (!res.ok) {
        throw new Error(`Message history request failed (${res.status})`)
      }
      const incoming = await res.json()
      const merged = mergeMessageHistory(cachedHistory, Array.isArray(incoming) ? incoming : [])
      messageHistoryRef.current.set(messageHistoryKey, merged)
      if (accountId) writeCachedMessageHistory('mobile', selectedTopicId, messageHistoryOwner, merged)
      return merged
    },
    {
      refreshInterval: pollSelectedMessages ? 2000 : 0,
      revalidateOnFocus: true,
      keepPreviousData: false,
      fallbackData: canFetchMessages && accountId ? readCachedMessageHistory('mobile', selectedTopicId, messageHistoryOwner) : undefined,
    },
  )

  const messages = useMemo(() => normalizeMessages(messagesRaw), [messagesRaw])

  useEffect(() => {
    const resume = () => {
      if (!token || !selectionReady) return
      void mutateAgents(); void mutateStats(); void mutateTopics(); void mutateGroupTopics(); void mutateRecentTopics()
      if (canFetchMessages) void mutateMessages()
    }
    window.addEventListener('wtt-native-resume', resume)
    return () => window.removeEventListener('wtt-native-resume', resume)
  }, [token, selectionReady, canFetchMessages, mutateAgents, mutateStats, mutateTopics, mutateGroupTopics, mutateRecentTopics, mutateMessages])

  useEffect(() => {
    if (!selectedTopicId || !Array.isArray(messagesRaw)) return
    const merged = mergeMessageHistory(messageHistoryRef.current.get(messageHistoryKey), messagesRaw)
    messageHistoryRef.current.set(messageHistoryKey, merged)
    if (accountId) writeCachedMessageHistory('mobile', selectedTopicId, messageHistoryOwner, merged)
  }, [accountId, messageHistoryKey, messageHistoryOwner, messagesRaw, selectedTopicId])

  useEffect(() => {
    if (!selectedTopicId || !Array.isArray(messagesRaw)) return
    const now = Date.now()
    setTypingByTopic((prev) => {
      let nextState = prev[selectedTopicId]
      let changed = false
      let latestAgentMessage: { id: string; senderId: string; senderName?: string; ts: number } | null = null
      const latestReplyByAgent = new Map<string, number>()
      for (const item of messagesRaw) {
        const rec = item as Record<string, unknown>
        const progress = statusFromProgressMessage(rec.content, nextState?.adapter, locale === 'en')
        const senderType = String(rec.sender_type || '').toLowerCase()
        const rowTime = new Date(String(rec.timestamp || rec.created_at || '')).getTime()
        const ts = rowTime
        if (senderType === 'agent' && !progress) {
          const id = String(rec.message_id || rec.id || '')
          if (id && Number.isFinite(ts)) {
            const senderId = String(rec.sender_id || selectedAgentId)
            latestReplyByAgent.set(senderId, Math.max(latestReplyByAgent.get(senderId) || 0, ts))
          }
          if (id && Number.isFinite(ts) && (!latestAgentMessage || ts >= latestAgentMessage.ts)) {
            latestAgentMessage = {
              id,
              senderId: String(rec.sender_id || selectedAgentId),
              senderName: rec.sender_display_name ? String(rec.sender_display_name) : undefined,
              ts,
            }
          }
        }
      }
      for (const item of messagesRaw) {
        const rec = item as Record<string, unknown>
        const progress = statusFromProgressMessage(rec.content, nextState?.adapter, locale === 'en')
        if (!progress) continue
        const ts = new Date(String(rec.timestamp || rec.created_at || '')).getTime()
        const senderId = String(rec.sender_id || selectedAgentId)
        const ttlMs = mobileHistoryProgressTtl(progress.kind, ts, latestReplyByAgent.get(senderId), now, COMPLETE_HOLD_MS)
        if (!ttlMs || (nextState && ts + 2000 < nextState.startedAt)) continue
        nextState = appendTypingStatus(nextState, {
          agentId: senderId,
          agentName: rec.sender_display_name ? String(rec.sender_display_name) : displayName(agents.find((agent) => agent.agent_id === senderId)),
          statusText: progress.text,
          statusKind: progress.kind,
          adapter: nextState?.adapter,
          ttlMs,
        }, ts)
        changed = true
      }
      if (
        latestAgentMessage
        &&
        shouldCloseWaitingStatusFromAgentReply(nextState, latestAgentMessage, now, STATUS_STALE_MS)
      ) {
        nextState = appendTypingStatus(nextState, {
          agentId: latestAgentMessage.senderId,
          agentName: latestAgentMessage.senderName || displayName(agents.find((agent) => agent.agent_id === latestAgentMessage.senderId)),
          statusText: t('mobile.replied'),
          statusKind: 'response',
          adapter: nextState.adapter,
          ttlMs: COMPLETE_HOLD_MS,
        }, Math.max(now, latestAgentMessage.ts))
        changed = true
      }
      if (!changed || !nextState) return prev
      return { ...prev, [selectedTopicId]: nextState }
    })
  }, [agents, messagesRaw, selectedAgentId, selectedTopicId, t, locale])

  const { data: selectedTopicMembersRaw } = useSWR(
    token && selectedTopicId && isGroupTopic(selectedTopic) ? ['mobile-topic-members', token, selectedTopicId] : null,
    async () => {
      const res = await fetch(`${CLIENT_WTT_API_BASE}/topics/${selectedTopicId}/members`, {
        headers: authHeaders(token),
        cache: 'no-store',
      })
      if (!res.ok) return []
      return res.json() as Promise<TopicMember[]>
    },
    { refreshInterval: 20000, revalidateOnFocus: true },
  )

  const selectedTopicMembers = useMemo(
    () => Array.isArray(selectedTopicMembersRaw) ? selectedTopicMembersRaw : [],
    [selectedTopicMembersRaw],
  )

  const selectedTopicMemberIdSet = useMemo(() => {
    const ids = new Set<string>()
    for (const id of selectedTopic?.member_agent_ids || []) {
      if (id) ids.add(String(id))
    }
    for (const member of selectedTopicMembers) {
      if (member.agent_id) ids.add(member.agent_id)
    }
    return ids
  }, [selectedTopic?.member_agent_ids, selectedTopicMembers])

  const topicActorAgentId = useMemo(() => {
    if (conversationAgentId !== selectedAgentId) return conversationAgentId
    if (!selectedTopic || selectedTopicMemberIdSet.size === 0) return selectedAgentId
    if (!isGroupTopic(selectedTopic) || selectedTaskId) return selectedAgentId
    if (selectedAgentId && selectedTopicMemberIdSet.has(selectedAgentId)) return selectedAgentId
    const ownedMember = agents.find((agent) => selectedTopicMemberIdSet.has(agent.agent_id))
    return ownedMember?.agent_id || selectedAgentId
  }, [agents, conversationAgentId, selectedAgentId, selectedTaskId, selectedTopic, selectedTopicMemberIdSet])

  const topicActorAgent = useMemo(
    () => agents.find((agent) => agent.agent_id === topicActorAgentId) || selectedAgent,
    [agents, selectedAgent, topicActorAgentId],
  )

  const slashAgentId = topicActorAgentId || selectedAgentId
  const slashAgentAdapter = useMemo(() => {
    if (!slashAgentId) return ''
    const runtime = runtimeMap[slashAgentId]
    return String(runtime?.adapter || runtime?.provider || '').trim()
  }, [runtimeMap, slashAgentId])

  const { data: dynamicSlashRaw } = useSWR(
    token && slashAgentId ? ['mobile-slash-commands', token, slashAgentId, slashAgentAdapter] : null,
    async () => {
      const params = new URLSearchParams()
      if (slashAgentAdapter) params.set('adapter', slashAgentAdapter)
      const suffix = params.toString() ? `?${params.toString()}` : ''
      const res = await fetch(`${CLIENT_WTT_API_BASE}/agents/${encodeURIComponent(slashAgentId)}/slash-commands${suffix}`, {
        headers: authHeaders(token),
        cache: 'no-store',
      })
      if (!res.ok) return []
      const data = await res.json()
      return Array.isArray(data?.commands) ? data.commands as Array<Record<string, unknown>> : []
    },
    { refreshInterval: 30000, revalidateOnFocus: true },
  )

  const dynamicSlashCommands = useMemo<MobileSlashCommand[]>(() => {
    const raw = Array.isArray(dynamicSlashRaw) ? dynamicSlashRaw : []
    return raw
      .flatMap((item) => {
        const rawCmd = String(item.cmd || item.command || '').trim()
        const cmd = rawCmd.startsWith('/') ? rawCmd : rawCmd ? `/${rawCmd}` : ''
        if (!cmd || cmd === '/') return []
        return [{
          cmd,
          desc: String(item.desc || item.description || item.name || 'Agent skill command').trim(),
          family: 'Agent' as const,
          mode: 'passthrough' as const,
          skillId: String(item.skill_id || item.skillId || item.id || '').trim(),
          source: String(item.source || '').trim(),
        }]
      })
  }, [dynamicSlashRaw])

  const availableSlashCommands = useMemo(() => {
    const rows = [...MOBILE_SLASH_COMMANDS.map(command => locale === 'en'
      ? { ...command, desc: mobileCommandDescriptions[command.cmd] || command.desc } : command), ...dynamicSlashCommands]
    const seen = new Set<string>()
    return rows.filter((command) => {
      const key = command.cmd.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [dynamicSlashCommands, locale])

  const roleLabelForAgent = useCallback((agentId?: string) => {
    const id = String(agentId || '').trim()
    if (!id) return ''
    return topicMemberRole(selectedTopicMembers.find((member) => member.agent_id === id))
  }, [selectedTopicMembers])

  const labelForAgentInTopic = useCallback((agentId: string, fallbackLabel?: string) => {
    const id = String(agentId || '').trim()
    const agent = agents.find((item) => item.agent_id === id)
    const base = String(fallbackLabel || '').trim()
      || selectedTopicMembers.find((member) => member.agent_id === id)?.display_name
      || (agent ? displayName(agent) : '')
      || compactId(id, 9, 4)
    return appendRoleLabel(base, roleLabelForAgent(id))
  }, [agents, roleLabelForAgent, selectedTopicMembers])

  const mentionCandidates = useMemo(() => {
    const rows = new Map<string, { agentId: string; label: string; displayLabel: string; meta: string }>()
    const canMentionAll = Boolean(selectedTopic && isGroupTopic(selectedTopic))
    if (canMentionAll) rows.set('__all__', { agentId: '__all__', label: 'all', displayLabel: `all (${t('mobile.allMembers')})`, meta: t('mobile.allMembers') })

    for (const member of selectedTopicMembers) {
      const agentId = String(member.agent_id || '').trim()
      if (!agentId) continue
      const label = String(member.display_name || '').trim() || compactId(agentId, 9, 4)
      const role = topicMemberRole(member)
      const meta = role || compactId(agentId, 9, 4)
      rows.set(agentId, { agentId, label, displayLabel: appendRoleLabel(label, role), meta })
    }

    for (const id of selectedTopic?.member_agent_ids || []) {
      const agentId = String(id || '').trim()
      if (!agentId || rows.has(agentId)) continue
      const agent = agents.find((item) => item.agent_id === agentId)
      const label = agent ? displayName(agent) : compactId(agentId, 9, 4)
      rows.set(agentId, { agentId, label, displayLabel: labelForAgentInTopic(agentId, label), meta: compactId(agentId, 9, 4) })
    }

    for (const agent of agents) {
      if (!agent.agent_id || rows.has(agent.agent_id)) continue
      const label = displayName(agent)
      rows.set(agent.agent_id, {
        agentId: agent.agent_id,
        label,
        displayLabel: labelForAgentInTopic(agent.agent_id, label),
        meta: runtimeHostLabel(agent, runtimeMap[agent.agent_id]),
      })
    }

    return Array.from(rows.values())
  }, [agents, labelForAgentInTopic, runtimeMap, selectedTopic, selectedTopicMembers, t])

  const filteredMentions = useMemo(() => {
    const q = mentionQuery.trim().toLowerCase()
    if (!q) return mentionCandidates.slice(0, 10)
    return mentionCandidates
      .filter((candidate) => `${candidate.displayLabel} ${candidate.label} ${candidate.agentId} ${candidate.meta}`.toLowerCase().includes(q))
      .slice(0, 10)
  }, [mentionCandidates, mentionQuery])

  const filteredSlashCommands = useMemo(() => {
    const q = slashFilter.trim().toLowerCase()
    const rows = q
      ? availableSlashCommands.filter((command) => `${command.cmd} ${command.desc} ${command.family} ${command.source || ''}`.toLowerCase().includes(q))
      : availableSlashCommands
    return rows.slice(0, 10)
  }, [availableSlashCommands, slashFilter])

  useEffect(() => {
    if (!selectionReady || !selectedTopic || !Array.isArray(topicsRaw)) return
    updateTopicUnreadCache(selectedTopicId, (topic) => {
      if (!Number(topic.unread_count || 0)) return topic
      return { ...topic, unread_count: 0 }
    })
    if (!Array.isArray(messagesRaw)) return

    const now = Date.now()
    const prev = lastReadSyncRef.current
    if (prev && prev.topicId === selectedTopicId && now - prev.ts < 5000) return
    lastReadSyncRef.current = { topicId: selectedTopicId, ts: now }
    void mutateTopics()
  }, [messagesRaw, mutateTopics, selectedTopic, selectedTopicId, selectionReady, topicsRaw, updateTopicUnreadCache])

  const { data: billing } = useSWR(
    token ? ['mobile-billing', token] : null,
    async () => {
      const res = await fetch(`${CLIENT_WTT_API_BASE}/billing/me`, { headers: authHeaders(token), cache: 'no-store' })
      if (!res.ok) throw new Error(`Billing status unavailable (${res.status})`)
      return res.json() as Promise<BillingMe>
    },
    { refreshInterval: 5 * 60_000 },
  )

  const handleWsMessage = useCallback((msg: WsMessage) => {
    const rawEvent = msg as unknown as Record<string, unknown>
    if (rawEvent.type === 'managed_chat_state') {
      window.dispatchEvent(new CustomEvent('wtt-chat-execution-changed', { detail: { topicId: rawEvent.topic_id } }))
      return
    }
    if (rawEvent.type === 'new_message') {
      const incoming = rawEvent.message as { topic_id?: string } | undefined
      if (incoming?.topic_id) window.dispatchEvent(new CustomEvent('wtt-chat-execution-changed', { detail: { topicId: incoming.topic_id } }))
    }
    const rawType = String(rawEvent.type || '').toLowerCase()
    if (rawType === 'typing') {
      const tid = String(rawEvent.topic_id || '')
      if (!tid) return
      if (String(rawEvent.state || 'start').toLowerCase() === 'stop') return
      const aid = String(rawEvent.agent_id || selectedAgentId)
      const now = Date.now()
      const ttlRaw = Number(rawEvent.ttl_ms || 0)
      const ttlMs = Number.isFinite(ttlRaw) && ttlRaw > 0 ? Math.max(ttlRaw, 30000) : undefined
      const agentName = String(rawEvent.agent_display_name || '') || labelForAgentInTopic(aid)
      setTypingByTopic((prev) => ({
        ...prev,
        [tid]: appendTypingStatus(prev[tid], {
          agentId: aid,
          agentName: appendRoleLabel(agentName, roleLabelForAgent(aid)),
          adapter: String(rawEvent.adapter || '').trim() || undefined,
          model: String(rawEvent.model || rawEvent.model_id || rawEvent.current_model || '').trim() || undefined,
          statusText: statusTextFromTypingEvent(rawEvent, locale === 'en'),
          statusKind: statusKindFromTypingEvent(rawEvent),
          ttlMs,
        }, now),
      }))
      return
    }
    if (['task_status', 'task_update', 'run_status', 'agent_status'].includes(rawType)) {
      const rawTaskId = String(rawEvent.task_id || rawEvent.taskId || '').trim()
      const tid = String(rawEvent.topic_id || rawEvent.topicId || (rawTaskId && rawTaskId === selectedTopic?.task_id ? selectedTopicId : '')).trim()
      if (!tid) return
      const aid = String(rawEvent.agent_id || rawEvent.runner_agent_id || topicActorAgentId || selectedAgentId)
      const title = eventString(rawEvent, ['task_title', 'title', 'name']) || compactTopicTitle(selectedTopic, locale === 'en')
      const status = eventString(rawEvent, ['status', 'task_status', 'state']) || rawType
      const statusText = statusTextFromTypingEvent(rawEvent, locale === 'en') || taskStatusText(status, title, locale === 'en') || t('mobile.statusUpdate')
      setTypingByTopic((prev) => ({
        ...prev,
        [tid]: appendTypingStatus(prev[tid], {
          agentId: aid,
          agentName: appendRoleLabel(labelForAgentInTopic(aid), roleLabelForAgent(aid)),
          adapter: String(rawEvent.adapter || '').trim() || undefined,
          model: String(rawEvent.model || rawEvent.model_id || rawEvent.current_model || '').trim() || undefined,
          statusText,
          statusKind: statusKindFromTypingEvent(rawEvent) || status,
          ttlMs: isTerminalStatusKind(status) ? COMPLETE_HOLD_MS : 120000,
        }, Date.now()),
      }))
      return
    }

    const incoming = normalizeWsMessage(rawEvent)
    if (!incoming) {
      const msgRecord = (rawEvent.message && typeof rawEvent.message === 'object' ? rawEvent.message : rawEvent) as Record<string, unknown>
      const progressTopicId = String(msgRecord.topic_id || rawEvent.topic_id || selectedTopicId)
      if (progressTopicId) {
        const senderId = String(msgRecord.sender_id || rawEvent.agent_id || selectedAgentId)
        const senderDisplayName = msgRecord.sender_display_name ? String(msgRecord.sender_display_name) : labelForAgentInTopic(senderId)
        setTypingByTopic((prev) => {
          const progressStatus = statusFromProgressMessage(msgRecord.content, prev[progressTopicId]?.adapter, locale === 'en')
          if (!progressStatus) return prev
          return {
            ...prev,
            [progressTopicId]: appendTypingStatus(prev[progressTopicId], {
              agentId: senderId,
              agentName: appendRoleLabel(senderDisplayName, roleLabelForAgent(senderId)),
              statusText: progressStatus.text,
              statusKind: progressStatus.kind,
              adapter: prev[progressTopicId]?.adapter,
              ttlMs: 60000,
            }, Date.now()),
          }
        })
      }
      return
    }
    const incomingTopicId = incoming.topic_id || ''
    const displayable = shouldCountUnreadMessage(incoming)
    if (displayable && incoming.sender_type === 'agent' && accountId && selectedAgentId && incomingTopicId) {
      const bridge = getNativeNotifications()
      if (bridge) {
        const original = (rawEvent.message || rawEvent) as Record<string, unknown>
        const body = original.encrypted ? 'Agent 有新回复 / New agent reply' : incoming.content
          .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 160)
        void bridge.show({ userId: accountId, messageId: incoming.message_id, topicId: incomingTopicId,
          agentId: selectedAgentId, title: `${senderLabel(incoming)} · WTT`.slice(0, 200), body,
          focused: incomingTopicId === selectedTopicId }).catch(() => {})
      }
    }
    const now = new Date().toISOString()
    if (incomingTopicId) {
      updateTopicUnreadCache(incomingTopicId, (topic) => {
        const currentUnread = Number(topic.unread_count || 0)
        if (incomingTopicId === selectedTopicId) {
          return { ...topic, last_activity_at: now, unread_count: 0 }
        }
        return {
          ...topic,
          last_activity_at: now,
          unread_count: displayable ? currentUnread + 1 : currentUnread,
        }
      })
    }
    if (incomingTopicId === selectedTopicId) {
      void mutateMessages((current: unknown) => {
        const list = normalizeMessages(current)
        if (list.some((m) => m.message_id === incoming.message_id)) return list
        return [...list, incoming]
      }, false)
      if (incoming.sender_type === 'agent') {
        setTypingByTopic((prev) => ({
          ...prev,
          [incoming.topic_id || selectedTopicId]: appendTypingStatus(prev[incoming.topic_id || selectedTopicId], {
            agentId: incoming.sender_id || selectedAgentId,
            statusText: t('mobile.replied'),
            statusKind: 'response',
            ttlMs: COMPLETE_HOLD_MS,
          }, Date.now()),
        }))
      }
    }
  }, [accountId, labelForAgentInTopic, mutateMessages, roleLabelForAgent, selectedAgentId, selectedTopic, selectedTopicId, topicActorAgentId, updateTopicUnreadCache, t, locale])

  const wsUrl = selectedAgentId ? `${WS_BASE_URL}/ws/${selectedAgentId}?client=mobile-web` : ''
  const { state: wsState } = useWebSocket({ url: wsUrl, enabled: Boolean(token && selectedAgentId), token, onMessage: handleWsMessage })

  const selectedTopicRunStatus = useMemo(() => {
    if (!selectedTopicId) return null
    const typing = typingByTopic[selectedTopicId]
    if (typing) {
      const agentName = typing.agentName || displayName(agents.find((agent) => agent.agent_id === typing.agentId)) || 'Agent'
      const lines = typing.statusLines?.length
        ? typing.statusLines
        : typing.statusText
          ? [{ id: `${typing.startedAt}-status`, text: typing.statusText, kind: typing.statusKind, ts: typing.startedAt }]
          : []
      return {
        ...typing,
        agentName,
        statusText: typing.statusText || t('mobile.waitStatus'),
        lines,
        wsState,
      }
    }
    if (!selectedTopic?.task_id) return null
    const status = String(selectedTopic.task_status || '').trim()
    const text = taskStatusText(status, compactTopicTitle(selectedTopic, locale === 'en'), locale === 'en')
    // Task workflow state is not evidence that a CLI execution is still active.
    // Only live execution events may display an ongoing run; keep review/results.
    if (!status || !text || !isTerminalStatusKind(status)) return null
    const agentId = String(selectedTopic.runner_agent_id || topicActorAgentId || selectedAgentId || '').trim()
    const agent = agents.find((item) => item.agent_id === agentId) || topicActorAgent || selectedAgent
    const now = Date.now()
    return {
      agentId,
      agentName: displayName(agent) || 'Agent',
      statusText: text,
      statusKind: status,
      lines: [{ id: `${selectedTopicId}-${status}`, text, kind: status, ts: now }],
      startedAt: now,
      expiresAt: Number.MAX_SAFE_INTEGER,
      wsState,
    }
  }, [agents, selectedAgent, selectedAgentId, selectedTopic, selectedTopicId, topicActorAgent, topicActorAgentId, typingByTopic, wsState, t, locale])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length, selectedTopicId])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now()
      setTypingByTopic((prev) => {
        let changed = false
        const next = { ...prev }
        for (const [key, value] of Object.entries(next)) {
          if (value.expiresAt < now) {
            delete next[key]
            changed = true
          }
        }
        return changed ? next : prev
      })
    }, 2500)
    return () => window.clearInterval(timer)
  }, [])

  const SelectedTopicIcon = topicIcon(selectedTopic)
  const selectedTopicMeta = selectedTopic
    ? [
        topicKindLabel(selectedTopic, locale === 'en'),
        isGroupTopic(selectedTopic) && selectedTopicMembers.length ? t('mobile.members', { count: selectedTopicMembers.length }) : '',
      ].filter(Boolean).join(' · ')
    : ''
  const mobileLoginCallback = isAndroidWebView
    ? '/mobile/login?callbackUrl=/mobile/feed&source=android'
    : '/mobile/login?callbackUrl=/mobile/feed'

  const groupedAgents = useMemo(() => {
    const q = search.trim().toLowerCase()
    const groups = new Map<string, Array<{ agent: AgentRecord; rank: number }>>()
    for (const agent of agents) {
      const runtime = runtimeMap[agent.agent_id]
      const host = runtimeHostLabel(agent, runtime)
      const haystack = agentSearchText(agent, runtime, host)
      if (q && !haystack.includes(q)) continue
      groups.set(host, [...(groups.get(host) || []), { agent, rank: q ? agentSearchRank(agent, q, host) : 2 }])
    }
    return Array.from(groups.entries())
      .map(([host, rows]) => ({
        host,
        rows: [...rows]
          .sort((a, b) => {
            if (a.rank !== b.rank) return a.rank - b.rank
            return displayName(a.agent).localeCompare(displayName(b.agent))
          })
          .map((row) => row.agent),
      }))
      .sort((a, b) => a.host.localeCompare(b.host))
  }, [agents, runtimeMap, search])

  const selectedAgentHost = useMemo(
    () => selectedAgent ? runtimeHostLabel(selectedAgent, runtimeMap[selectedAgent.agent_id]) : '',
    [runtimeMap, selectedAgent],
  )

  const activeHost = selectedHost || selectedAgentHost
  const activeHostGroup = useMemo(
    () => groupedAgents.find((group) => group.host === activeHost) || null,
    [activeHost, groupedAgents],
  )

  const selectorTitle = selectorStep === 'hosts'
    ? t('mobile.chooseHost')
    : selectorStep === 'agents'
      ? t('mobile.chooseAgent')
      : t('mobile.chooseTopic')

  const selectorSearchPlaceholder = selectorStep === 'hosts'
    ? t('mobile.searchHosts')
    : selectorStep === 'agents'
      ? t('mobile.searchAgents')
      : t('mobile.searchTopics')

  const filteredTopics = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return topics
    return topics.filter((topic) => `${topic.name || ''} ${topicId(topic)} ${topic.description || ''} ${topicKindLabel(topic, locale === 'en')} ${topicKind(topic)}`.toLowerCase().includes(q))
  }, [search, topics, locale])

  const groupedTopics = useMemo(() => {
    const groups: Record<TopicGroupKey, TopicRecord[]> = {
      p2p: [],
      task: [],
      group: [],
      subscriber: [],
    }
    for (const topic of filteredTopics) groups[topicGroup(topic)].push(topic)
    return groups
  }, [filteredTopics])

  useEffect(() => {
    setSlashIndex((index) => Math.min(index, Math.max(filteredSlashCommands.length - 1, 0)))
  }, [filteredSlashCommands.length])

  useEffect(() => {
    setMentionIndex((index) => Math.min(index, Math.max(filteredMentions.length - 1, 0)))
  }, [filteredMentions.length])

  useEffect(() => {
    setSlashOpen(false)
    setMentionOpen(false)
    setSlashFilter('')
    setMentionQuery('')
    setMentionStartPos(-1)
  }, [selectedTopicId])

  const updateComposerDraft = useCallback((value: string, cursorPos?: number | null) => {
    setDraft(value)

    const cursor = typeof cursorPos === 'number' ? cursorPos : value.length
    const textUpToCursor = value.slice(0, cursor)
    const singleLine = !value.includes('\n')
    const slashFilterText = singleLine && textUpToCursor.startsWith('/') ? textUpToCursor.trim() : ''
    if (slashFilterText) {
      setSlashOpen(true)
      setSlashFilter(slashFilterText)
      setSlashIndex(0)
    } else {
      setSlashOpen(false)
      setSlashFilter('')
    }

    const mentionMatch = textUpToCursor.match(/@([^\s@]*)$/)
    if (mentionMatch && mentionCandidates.length > 0) {
      setMentionOpen(true)
      setMentionQuery(mentionMatch[1] || '')
      setMentionStartPos(cursor - mentionMatch[0].length)
      setMentionIndex(0)
    } else {
      setMentionOpen(false)
      setMentionQuery('')
      setMentionStartPos(-1)
    }
  }, [mentionCandidates.length])

  const closeComposerSuggestions = useCallback(() => {
    setSlashOpen(false)
    setSlashFilter('')
    setMentionOpen(false)
    setMentionQuery('')
    setMentionStartPos(-1)
  }, [])

  const insertSlashCommand = useCallback((command: MobileSlashCommand) => {
    const next = `${command.cmd} `
    setDraft(next)
    setSlashOpen(false)
    setSlashFilter('')
    requestAnimationFrame(() => {
      composerRef.current?.focus()
      composerRef.current?.setSelectionRange(next.length, next.length)
    })
  }, [])

  const insertMention = useCallback((candidate: { agentId: string; label: string }) => {
    const textarea = composerRef.current
    if (!textarea || mentionStartPos < 0) return
    const cursor = textarea.selectionStart
    const before = draft.slice(0, mentionStartPos)
    const after = draft.slice(cursor)
    const mention = candidate.agentId === '__all__' ? '@all ' : `@${candidate.label} `
    const next = before + mention + after
    const nextCursor = before.length + mention.length
    setDraft(next)
    setMentionOpen(false)
    setMentionQuery('')
    setMentionStartPos(-1)
    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(nextCursor, nextCursor)
    })
  }, [draft, mentionStartPos])

  const sendMessage = useCallback(async (retry?: FailedSend) => {
    const sourceDraft = retry ? retry.draft : draft
    const sourceAssets = retry ? retry.assets : pendingAssets
    const sourceAgentId = retry ? retry.agentId : (topicActorAgentId || selectedAgentId)
    const sourceTopicId = retry ? retry.topicId : selectedTopicId
    const sourceTaskId = retry ? retry.taskId : selectedTaskId
    const sourceAgent = agents.find((agent) => agent.agent_id === sourceAgentId) || topicActorAgent
    const attachmentContent = sourceAssets.map((asset) => asset.token).join('\n\n')
    const content = retry?.content || [sourceDraft.trim(), attachmentContent].filter(Boolean).join('\n\n')
    if (!content || !token || !sourceAgentId || !sourceTopicId || sending || !selectionReady) return
    if (!topics.some(topic => topicId(topic) === sourceTopicId)
      && !(fixedChatMode && sourceTopicId === fixedTopicId)
      && pendingCreatedTopicIdRef.current !== sourceTopicId) return
    if (!isBrowserOnline()) {
      setBrowserOnline(false)
      setFailedSend({
        content,
        draft: sourceDraft,
        assets: sourceAssets,
        agentId: sourceAgentId,
        topicId: sourceTopicId,
        taskId: sourceTaskId,
        error: t('mobile.offline'),
      })
      return
    }
    setSending(true)
    setFailedSend(null)
    if (!retry) {
      setDraft('')
      setPendingAssets([])
      closeComposerSuggestions()
    }
    const now = Date.now()
    setTypingByTopic((prev) => ({
      ...prev,
      [sourceTopicId]: appendTypingStatus(prev[sourceTopicId], {
        agentId: sourceAgentId,
        agentName: labelForAgentInTopic(sourceAgentId, displayName(sourceAgent)),
        statusText: t('mobile.queued'),
        statusKind: 'queued',
      }, now),
    }))
    try {
      const isSlashCommand = content.trim().startsWith('/')
      const slashCommand = isSlashCommand ? content.trim().split(/\s+/, 1)[0] || content.trim() : ''
      const dynamicSlash = slashCommand
        ? dynamicSlashCommands.find((command) => command.cmd.toLowerCase() === slashCommand.toLowerCase())
        : undefined
      const metadata: Record<string, unknown> = {}
      if (isSlashCommand) {
        metadata.slash_type = 'agent_passthrough'
        metadata.slash_command = slashCommand
        if (dynamicSlash?.skillId) {
          metadata.command_family = 'skill'
          metadata.skill_id = dynamicSlash.skillId
        }
        if (!sourceTaskId && isGroupTopic(selectedTopic)) {
          metadata.command_scope = 'single_agent'
          metadata.command_target_agent_id = sourceAgentId
        }
      }
      let res: Response
      if (sourceTaskId) {
        res = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${sourceTaskId}/chat/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
          body: JSON.stringify({
            content,
            sender_type: 'HUMAN',
            semantic_type: 'post',
            auto_run: true,
            ...(Object.keys(metadata).length ? { metadata } : {}),
          }),
        })
      } else {
        res = await fetch(`${CLIENT_WTT_API_BASE}/topics/${sourceTopicId}/messages?agent_id=${encodeURIComponent(sourceAgentId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
          body: JSON.stringify({
            content,
            content_type: 'text',
            semantic_type: 'post',
            sender_type: 'HUMAN',
            sender_id: humanSender(session),
            ...(Object.keys(metadata).length ? { metadata } : {}),
          }),
        })
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const detail = typeof data.detail === 'string' ? data.detail : `${t('mobile.sendFailed')} (${res.status})`
        throw new Error(detail)
      }
      setTypingByTopic((prev) => ({
        ...prev,
        [sourceTopicId]: appendTypingStatus(prev[sourceTopicId], {
          agentId: sourceAgentId,
          agentName: labelForAgentInTopic(sourceAgentId, displayName(sourceAgent)),
          statusText: t('mobile.accepted'),
          statusKind: 'accepted',
          ttlMs: 120000,
        }, Date.now()),
      }))
      if (sourceTaskId) {
        const optimisticTitle = titleFromFirstMessage(content)
        if (optimisticTitle !== 'New Task') {
          const expiresAt = Date.now() + OPTIMISTIC_TASK_TITLE_TTL_MS
          setOptimisticTaskTitles((current) => ({
            ...current,
            [sourceTopicId]: { title: optimisticTitle, expiresAt },
          }))
        }
        if (pendingRenameTaskRef.current?.topicId === sourceTopicId) {
          pendingRenameTaskRef.current = null
        }
        window.setTimeout(() => void mutateTopics(), 3500)
      }
      await mutateMessages()
      if (!sourceTaskId) {
        await Promise.allSettled([mutateTopics(), mutateGroupTopics(), mutateRecentTopics()])
      } else {
        void mutateRecentTopics()
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t('mobile.networkFailed')
      setFailedSend({
        content,
        draft: sourceDraft,
        assets: sourceAssets,
        agentId: sourceAgentId,
        topicId: sourceTopicId,
        taskId: sourceTaskId,
        error: message,
      })
      if (!draft.trim() && pendingAssets.length === 0) {
        setDraft(sourceDraft)
        setPendingAssets(sourceAssets)
      }
    } finally {
      setSending(false)
    }
  }, [agents, closeComposerSuggestions, draft, dynamicSlashCommands, fixedChatMode, fixedTopicId, labelForAgentInTopic, mutateGroupTopics, mutateMessages, mutateRecentTopics, mutateTopics, pendingAssets, selectedAgentId, selectedTaskId, selectedTopic, selectedTopicId, selectionReady, sending, session, token, topicActorAgent, topicActorAgentId, topics, t])

  const createDefaultTask = useCallback(async () => {
    if (!token || !selectedAgentId || creatingTask) return
    setCreatingTask(true)
    try {
      const res = await fetch(`${CLIENT_WTT_API_BASE}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({
          title: 'New Task',
          task_mode: 'single',
          priority: 'P1',
          status: 'todo',
          task_type: 'general',
          exec_mode: 'reasoning',
          owner_agent_id: selectedAgentId,
          runner_agent_id: selectedAgentId,
          created_by: humanSender(session),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data.detail || t('mobile.createFailed'))
        return
      }
      const record = data as Record<string, unknown>
      const nestedTopic = (record.topic && typeof record.topic === 'object' ? record.topic : {}) as Record<string, unknown>
      const id = String(record.topic_id || nestedTopic.topic_id || nestedTopic.id || '').trim()
      const taskId = String(record.id || record.task_id || '').trim()
      if (id) {
        pendingCreatedTopicIdRef.current = id
        if (taskId) {
          pendingRenameTaskRef.current = { taskId, topicId: id }
          setCreatedTaskIdsByTopic((current) => ({ ...current, [id]: taskId }))
        }
        const optimisticTopic: TopicRecord = {
          id,
          topic_id: id,
          name: String(nestedTopic.name || record.title || 'New Task'),
          description: String(nestedTopic.description || 'General task conversation'),
          type: 'discussion',
          topic_type: 'discussion',
          task_id: taskId,
          task_type: 'general',
          last_activity_at: new Date().toISOString(),
        }
        void mutateTopics((current: unknown) => {
          const list = (Array.isArray(current) ? current : []) as TopicRecord[]
          if (list.some((topic) => topicId(topic) === id)) return list
          return [optimisticTopic, ...list]
        }, false)
        setSelectedTopicId(id)
        window.setTimeout(() => {
          if (pendingCreatedTopicIdRef.current === id) pendingCreatedTopicIdRef.current = ''
        }, 8000)
      }
      void mutateTopics()
      setDraft('')
      closeComposerSuggestions()
    } catch {
      alert(t('mobile.networkFailed'))
    } finally {
      setCreatingTask(false)
    }
  }, [closeComposerSuggestions, creatingTask, mutateTopics, selectedAgentId, session, token, t])

  const uploadAsset = useCallback(async (file: File) => {
    if (!token) {
      alert(t('mobile.loginUpload'))
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      alert(t('mobile.fileTooLarge', { size: (file.size / (1024 * 1024)).toFixed(1) }))
      return
    }
    setUploading(true)
    setUploadProgress(0)
    setUploadError('')
    try {
      const mimeType = attachmentMimeType(file)
      const sign = await fetch(`${CLIENT_WTT_API_BASE}/media/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ filename: file.name, mime_type: mimeType, size: file.size }),
      })
      if (!sign.ok) throw new Error(`Sign failed: ${await sign.text()}`)
      const signed = await sign.json()
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) setUploadProgress(Math.round((event.loaded / event.total) * 90))
        })
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve()
          else reject(new Error(xhr.responseText || `Upload failed: ${xhr.status}`))
        })
        xhr.addEventListener('error', () => reject(new Error('Upload network failed')))
        xhr.open('PUT', resolveWttUploadUrl(signed.upload_url))
        xhr.setRequestHeader('Content-Type', mimeType)
        xhr.send(file)
      })
      setUploadProgress(95)
      const commit = await fetch(`${CLIENT_WTT_API_BASE}/media/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ upload_token: signed.upload_token }),
      })
      if (!commit.ok) throw new Error(`Commit failed: ${await commit.text()}`)
      const asset = await commit.json()
      const isImage = isImageFile(file)
      const isAudio = isAudioFile(file)
      const isVideo = isVideoFile(file)
      const kind: PendingAsset['kind'] = isImage ? 'image' : isAudio ? 'audio' : isVideo ? 'video' : 'file'
      const assetToken = isImage
        ? `![${file.name}](${asset.url})`
        : isAudio
          ? `[audio:${file.name}](${asset.url})`
          : isVideo
            ? `[video:${file.name}](${asset.url})`
            : `[file:${file.name}](${asset.url})`
      setPendingAssets((prev) => [...prev, { url: proxyMediaUrl(String(asset.url || '')), filename: file.name, kind, token: assetToken }])
      setUploadProgress(100)
    } catch (error) {
      const message = error instanceof Error ? error.message : t('mobile.uploadError')
      setUploadError(message)
      alert(message)
    } finally {
      setUploading(false)
      setUploadProgress(null)
    }
  }, [token, t])

  const openFilePicker = useCallback((kind: 'file' | 'camera') => {
    setAttachOpen(false)
    requestAnimationFrame(() => {
      const input = kind === 'camera' ? cameraInputRef.current : fileInputRef.current
      input?.click()
    })
  }, [])

  const insertLocation = useCallback(() => {
    setAttachOpen(false)
    if (!navigator.geolocation) {
      alert(t('mobile.noLocation'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        const token = `[location](https://maps.google.com/?q=${latitude},${longitude})`
        setDraft((prev) => `${prev}${prev ? '\n\n' : ''}${token}`)
      },
      (error) => alert(t('mobile.locationFailed', { error: error.message || 'permission denied' })),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    )
  }, [t])

  if (status === 'loading') {
    return <div className="flex min-h-[100dvh] items-center justify-center bg-white dark:bg-zinc-950 text-sm font-medium text-slate-500 dark:text-zinc-400">Loading WTT...</div>
  }

  return (
    <main className="flex h-[100dvh] overflow-hidden bg-white dark:bg-zinc-950 text-[#0d0d0d] dark:text-zinc-100 antialiased">
      <section className="relative flex min-w-0 flex-1 flex-col">
        {!fixedChatMode && (
          <header className="flex h-16 shrink-0 items-center gap-2 border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3">
            <button onClick={openSelector} className="rounded-xl p-2 text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800" aria-label={t('mobile.chooseTarget')}>
              <FolderTree className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1 text-left">
              <div className="flex min-w-0 items-center gap-2">
                <SelectedTopicIcon className="h-4 w-4 shrink-0 text-slate-500 dark:text-zinc-400" />
                <div className="min-w-0 flex-1 truncate text-[18px] font-semibold leading-6">{compactTopicTitle(selectedTopic, locale === 'en')}</div>
              </div>
              <div className="mt-0.5 flex min-w-0 items-center gap-1 text-[10px] font-medium leading-4 text-slate-500 dark:text-zinc-400">
                <span className={`h-2 w-2 shrink-0 rounded-full ring-2 ring-white ${onlineAgents.has(selectedAgentId) ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                <span className="min-w-0 truncate">{selectedAgent ? labelForAgentInTopic(selectedAgent.agent_id, compactAgentName(selectedAgent)) : t('mobile.chooseAgent')}</span>
                {selectedTopicMeta && <span className="shrink-0 text-slate-300">·</span>}
                {selectedTopicMeta && <span className="min-w-0 truncate">{selectedTopicMeta}</span>}
                <ChevronDown className="h-3 w-3 shrink-0" />
              </div>
            </div>
            <>
              <button
                onClick={() => void createDefaultTask()}
                disabled={!selectedAgentId || creatingTask}
                className="rounded-xl p-2 text-slate-700 dark:text-zinc-200 hover:bg-slate-100 disabled:text-slate-300"
                aria-label={t('mobile.newChat')}
              >
                <SquarePen className={`h-5 w-5 ${creatingTask ? 'animate-pulse' : ''}`} />
              </button>
              <button onClick={() => setSettingsOpen(true)} className="rounded-xl p-2 text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800" aria-label={t('mobile.settings')}>
                <Settings className="h-5 w-5" />
              </button>
            </>
          </header>
        )}

        {!fixedChatMode && <ManagedAgentTools agentId={selectedAgentId} agentName={selectedAgent ? compactAgentName(selectedAgent) : undefined} token={token} />}

        {!browserOnline && (
          <div className="mx-3 mt-2 flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-medium text-orange-800">
            <WifiOff className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">{t('mobile.offline')}</span>
          </div>
        )}

        {browserOnline && (agentsError || statsError || topicsError || groupTopicsError || recentTopicsError) && (
          <div role="status" className="mx-3 mt-2 flex items-center gap-2 border-b border-slate-200 dark:border-zinc-800 px-1 py-2 text-xs text-slate-600 dark:text-zinc-300">
            <WifiOff className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">{t('mobile.directoryUnavailable')}</span>
            <button
              type="button"
              aria-label={t('mobile.reloadDirectory')}
              title={t('mobile.reloadDirectory')}
              className="flex h-8 w-8 shrink-0 items-center justify-center text-slate-700 dark:text-zinc-200 hover:bg-slate-100"
              onClick={() => {
                void mutateAgents()
                void mutateStats()
                void mutateTopics()
                void mutateGroupTopics()
                void mutateRecentTopics()
              }}
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        )}

        {!fixedChatMode && isGroupTopic(selectedTopic) && selectedTopicMembers.length > 0 && (
          <div className="mx-3 mt-2 flex items-center gap-2 overflow-x-auto rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 px-3 py-2">
            <Users className="h-4 w-4 shrink-0 text-slate-600 dark:text-zinc-300" />
            <span className="shrink-0 text-[11px] font-semibold text-slate-700 dark:text-zinc-200">{t('mobile.group')}</span>
            {selectedTopicMembers.slice(0, 8).map((member) => {
              const label = member.display_name || compactId(member.agent_id, 9, 4)
              return (
                <span key={member.agent_id} className="max-w-32 shrink-0 truncate rounded-full bg-white dark:bg-zinc-950 px-2 py-1 text-[11px] font-medium text-slate-600 dark:text-zinc-300">
                  {appendRoleLabel(label, topicMemberRole(member))}
                </span>
              )
            })}
            {selectedTopicMembers.length > 8 && (
              <span className="shrink-0 rounded-full bg-white dark:bg-zinc-950 px-2 py-1 text-[11px] font-medium text-slate-500 dark:text-zinc-400">+{selectedTopicMembers.length - 8}</span>
            )}
          </div>
        )}

        <div ref={scrollRef} className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {!selectedAgentId ? (
            <EmptyCard
              title={t('mobile.noAgent')}
              desc={t('mobile.manageAgents')}
              actionLabel={t('mobile.fullWeb')}
              actionIcon={<Bot className="h-4 w-4" />}
              onAction={() => {
                window.location.href = '/feed'
              }}
            />
          ) : !selectedTopicId ? (
            <EmptyCard
              title={t('mobile.newChatTitle')}
              desc={t('mobile.newChatDescription')}
              actionLabel={t('mobile.createChat')}
              actionIcon={<SquarePen className="h-4 w-4" />}
              actionDisabled={creatingTask}
              onAction={() => void createDefaultTask()}
            />
          ) : messages.length === 0 ? (
            <EmptyCard title={t('mobile.startChat')} desc={t('mobile.firstMessage')} />
          ) : (
            messages.map((message) => {
              const isMine = message.sender_type === 'human'
              const baseLabel = senderLabel(message)
              const label = isMine ? baseLabel : appendRoleLabel(baseLabel, roleLabelForAgent(message.sender_id))
              const cleanContent = stripMobileMetaBlocks(message.content)
              return (
                <article key={message.message_id} className="group rounded-xl transition-colors hover:bg-slate-50">
                  <div className="flex items-start gap-2.5 px-2.5 py-2.5">
                    <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                      isMine ? 'bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200' : 'bg-[#0d0d0d] text-white dark:bg-zinc-100 dark:text-zinc-950'
                    }`}>
                      {agentInitial(label)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 flex min-w-0 items-center gap-1.5 px-1 text-[12px] font-medium text-slate-800 dark:text-zinc-200">
                        <span className="truncate">{label}</span>
                        <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${
                          isMine ? 'bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400' : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300'
                        }`}>
                          {isMine ? 'You' : 'AI'}
                        </span>
                        <span className="ml-auto shrink-0 text-[10px] font-medium text-slate-400 dark:text-zinc-500">{shortTime(message.timestamp)}</span>
                        {!isMine && <SpeechReadButton text={message.content || ''} />}
                      </div>
                      <div className={`w-full rounded-2xl px-3 py-2 text-[14px] leading-7 ${
                        isMine ? 'bg-slate-100 dark:bg-zinc-800 text-[#0d0d0d] dark:text-zinc-100' : 'bg-white dark:bg-zinc-950 text-[#0d0d0d] dark:text-zinc-100'
                      }`}>
                        <div className="prose prose-sm dark:prose-invert max-w-none break-words prose-p:my-1 prose-pre:overflow-auto prose-pre:rounded-lg prose-pre:bg-slate-950 prose-pre:text-slate-100">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={mobileMarkdownComponents}
                          >
                            {cleanContent || message.content}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              )
            })
          )}
        </div>

        <footer className="shrink-0 border-t border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <ToolApprovalPanel topicId={selectedTopicId} accessToken={token} activeRun={Boolean(selectedTopicRunStatus)} enabled={Boolean(selectedTopicId)} />
          <ManagedChatExecutions topicId={selectedTopicId} accessToken={token} activeRun={Boolean(selectedTopicRunStatus)} enabled={Boolean(selectedTopicId)} agents={agents.map(agent => ({ agent_id: agent.agent_id, display_name: labelForAgentInTopic(agent.agent_id) }))} />
          {selectedTopicRunStatus && (
            <div className="mb-2">
              <MobileAgentRunStatusCard status={selectedTopicRunStatus} />
            </div>
          )}
          {failedSend && (
            <div className="mb-2 flex items-center gap-2 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
              <span className="min-w-0 flex-1 truncate">{failedSend.error || t('mobile.sendFailed')}</span>
              <button onClick={() => void sendMessage(failedSend)} disabled={sending} className="shrink-0 rounded-full bg-white dark:bg-zinc-950 px-3 py-1 text-rose-700 disabled:text-slate-300">
                {t('mobile.retry')}
              </button>
              <button onClick={() => setFailedSend(null)} className="shrink-0 rounded-full bg-white dark:bg-zinc-950 p-1 text-rose-400" aria-label={t('mobile.dismissFailure')}>
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
          {pendingAssets.length > 0 && (
            <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
              {pendingAssets.map((asset, index) => (
                <div key={`${asset.url}-${index}`} className="flex max-w-[220px] shrink-0 items-center gap-2 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 px-2 py-2">
                  {asset.kind === 'image' ? (
                    <button type="button" onClick={() => openImagePreview(asset.url, asset.filename)} className="shrink-0 rounded-xl" aria-label={t('mobile.originalImage', { name: asset.filename })}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={toThumbnailUrl(asset.url)} alt={asset.filename} className="h-10 w-10 rounded-xl object-cover" />
                    </button>
                  ) : (
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 dark:bg-zinc-800 text-[10px] font-semibold text-slate-700 dark:text-zinc-200">FILE</span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-slate-800 dark:text-zinc-200">{asset.filename}</span>
                    <span className="block text-[10px] font-medium uppercase text-slate-400 dark:text-zinc-500">{asset.kind}</span>
                  </span>
                  <button onClick={() => setPendingAssets((prev) => prev.filter((_, i) => i !== index))} className="rounded-full bg-white dark:bg-zinc-950 p-1 text-slate-400 dark:text-zinc-500">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {uploading && (
            <div className="mb-2 flex items-center gap-2 rounded-xl bg-slate-100 dark:bg-zinc-800 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-zinc-200">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>{t('mobile.uploading', { progress: uploadProgress ?? 0 })}</span>
            </div>
          )}
          {uploadError && !uploading && (
            <div className="mb-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
              {t('mobile.uploadFailed', { error: uploadError })}
            </div>
          )}
          {slashOpen && filteredSlashCommands.length > 0 && (
            <div className="mb-2 max-h-56 overflow-y-auto rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 py-1 text-sm shadow-xl">
              {filteredSlashCommands.map((command, index) => (
                <button
                  key={command.cmd}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => insertSlashCommand(command)}
                  className={`flex w-full items-center gap-2 px-3 py-2.5 text-left ${index === slashIndex ? 'bg-slate-100 dark:bg-zinc-800' : 'hover:bg-slate-50'}`}
                >
                  <span className="shrink-0 rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 px-2 py-1 text-[10px] font-semibold text-slate-600 dark:text-zinc-300">{command.family}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-slate-900 dark:text-zinc-100">{command.cmd}</span>
                    <span className="block truncate text-xs font-medium text-slate-500 dark:text-zinc-400">{command.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
          {mentionOpen && filteredMentions.length > 0 && (
            <div className="mb-2 max-h-56 overflow-y-auto rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 py-1 text-sm shadow-xl">
              {filteredMentions.map((candidate, index) => (
                <button
                  key={candidate.agentId}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => insertMention(candidate)}
                  className={`flex w-full items-center gap-2 px-3 py-2.5 text-left ${index === mentionIndex ? 'bg-slate-100 dark:bg-zinc-800' : 'hover:bg-slate-50'}`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-zinc-800 text-xs font-bold text-slate-700 dark:text-zinc-200">
                    {candidate.label.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-slate-900 dark:text-zinc-100">@{candidate.displayLabel}</span>
                    <span className="block truncate text-xs font-medium text-slate-500 dark:text-zinc-400">{candidate.meta}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2 rounded-[1.4rem] border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 p-2">
            <div className="relative">
              <button onClick={() => setAttachOpen((v) => !v)} className="flex h-10 w-10 items-center justify-center rounded-full text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800" aria-label={t('mobile.attach')}>
                <Paperclip className="h-4 w-4" />
              </button>
              {attachOpen && (
                <div className="absolute bottom-full left-0 mb-2 w-44 overflow-hidden rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs font-semibold text-slate-700 dark:text-zinc-200 shadow-xl">
                  <button type="button" onClick={() => openFilePicker('file')} className="flex w-full items-center gap-2 px-3 py-3 text-left hover:bg-slate-50">
                    <Paperclip className="h-4 w-4" /> {t('mobile.files')}
                  </button>
                  <button type="button" onClick={() => openFilePicker('camera')} className="flex w-full items-center gap-2 px-3 py-3 text-left hover:bg-slate-50">
                    <Camera className="h-4 w-4" /> {t('mobile.camera')}
                  </button>
                  <button onClick={insertLocation} className="flex w-full items-center gap-2 px-3 py-3 text-left hover:bg-slate-50">
                    <LocateFixed className="h-4 w-4" /> {t('mobile.location')}
                  </button>
                </div>
              )}
            </div>
            <textarea
              ref={composerRef}
              value={draft}
              onChange={(event) => updateComposerDraft(event.target.value, event.target.selectionStart)}
              onKeyDown={(event) => {
                if (mentionOpen && filteredMentions.length > 0) {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault()
                    setMentionIndex((index) => (index + 1) % filteredMentions.length)
                    return
                  }
                  if (event.key === 'ArrowUp') {
                    event.preventDefault()
                    setMentionIndex((index) => (index - 1 + filteredMentions.length) % filteredMentions.length)
                    return
                  }
                  if (event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey)) {
                    event.preventDefault()
                    const selected = filteredMentions[mentionIndex]
                    if (selected) insertMention(selected)
                    return
                  }
                  if (event.key === 'Escape') {
                    setMentionOpen(false)
                    return
                  }
                }
                if (slashOpen && filteredSlashCommands.length > 0) {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault()
                    setSlashIndex((index) => (index + 1) % filteredSlashCommands.length)
                    return
                  }
                  if (event.key === 'ArrowUp') {
                    event.preventDefault()
                    setSlashIndex((index) => (index - 1 + filteredSlashCommands.length) % filteredSlashCommands.length)
                    return
                  }
                  if (event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey)) {
                    event.preventDefault()
                    const selected = filteredSlashCommands[slashIndex]
                    if (selected) insertSlashCommand(selected)
                    return
                  }
                  if (event.key === 'Escape') {
                    setSlashOpen(false)
                    return
                  }
                }
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  void sendMessage()
                }
              }}
              rows={1}
              placeholder={isGroupTopic(selectedTopic) ? t('mobile.sendGroup') : selectedTopic?.task_id ? t('mobile.sendTask') : t('mobile.message')}
              className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] font-medium leading-6 outline-none placeholder:text-slate-400"
            />
            <SpeechInputControl
              value={draft}
              onChange={updateComposerDraft}
              inputRef={composerRef}
            />
            <button
              onClick={() => void sendMessage()}
              disabled={(!draft.trim() && pendingAssets.length === 0) || sending || uploading || !canFetchMessages}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0d0d0d] text-white dark:bg-zinc-100 dark:text-zinc-950 disabled:bg-slate-300"
              aria-label={t('mobile.send')}
            >
              <Send className="h-4 w-4" />
            </button>
            <input
              id="wtt-mobile-file-input"
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*,audio/*,.pdf,.txt,.md,.doc,.docx,.ppt,.pptx,.xls,.xlsx,application/*"
              className="absolute bottom-0 left-0 h-px w-px opacity-0"
              tabIndex={-1}
              onChange={(event) => {
                setAttachOpen(false)
                const file = event.target.files?.[0]
                if (file) void uploadAsset(file)
                event.currentTarget.value = ''
              }}
            />
            <input
              id="wtt-mobile-camera-input"
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="absolute bottom-0 left-0 h-px w-px opacity-0"
              tabIndex={-1}
              onChange={(event) => {
                setAttachOpen(false)
                const file = event.target.files?.[0]
                if (file) void uploadAsset(file)
                event.currentTarget.value = ''
              }}
            />
          </div>
        </footer>
      </section>

      {imagePreview && (
        <div
          className="fixed inset-0 z-[80] flex flex-col bg-black/95 px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] text-white"
          role="dialog"
          aria-label={t('mobile.imagePreview')}
        >
          <div className="mb-3 flex h-12 shrink-0 items-center gap-3">
            <div className="min-w-0 flex-1 truncate text-sm font-semibold">{imagePreview.label}</div>
            <button
              type="button"
              onClick={() => setImagePreview(null)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white"
              aria-label={t('mobile.closePreview')}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imagePreview.url} alt={imagePreview.label} className="max-h-full max-w-full rounded-xl object-contain" />
          </div>
        </div>
      )}

      {!fixedChatMode && selectorOpen && (
        <MobileSheet title={selectorTitle} onClose={() => closeSheet('selector')}>
          <div className="sticky top-0 z-10 bg-white dark:bg-zinc-950 pb-2">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2">
              <Search className="h-4 w-4 text-slate-400 dark:text-zinc-500" />
              <input
                value={search}
                onPointerDown={() => {
                  searchInteractiveRef.current = true
                }}
                onFocus={(event) => {
                  if (!searchInteractiveRef.current) event.currentTarget.blur()
                }}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={selectorSearchPlaceholder}
                className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none"
              />
            </div>
          </div>
          <div className="space-y-3">
            {selectorStep === 'hosts' && (
              <section>
                <div className="space-y-1.5">
                  {groupedAgents.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 p-3 text-xs font-medium text-slate-400 dark:text-zinc-500">{t('mobile.noAgents')}</div>
                  ) : groupedAgents.map((group) => {
                    const online = group.rows.filter((a) => onlineAgents.has(a.agent_id)).length
                    const active = group.host === selectedAgentHost
                    return (
                      <button
                        key={group.host}
                        onClick={() => {
                          setSelectedHost(group.host)
                          setSearch('')
                          setSelectorStep('agents')
                        }}
                        className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left ${active ? 'border-slate-900 dark:border-zinc-300 bg-slate-100 dark:bg-zinc-800' : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950'}`}
                      >
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${active ? 'bg-[#0d0d0d] text-white dark:bg-zinc-100 dark:text-zinc-950' : 'bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200'}`}>
                          <Server className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-slate-900 dark:text-zinc-100">{group.host === '未上报主机' ? t('mobile.unknownHost') : group.host}</span>
                          <span className="mt-0.5 block text-xs font-medium text-slate-500 dark:text-zinc-400">{t('mobile.hostAgents', { online, count: group.rows.length })}</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 dark:text-zinc-500" />
                      </button>
                    )
                  })}
                </div>
              </section>
            )}

            {selectorStep === 'agents' && (
              <section>
                <button
                  onClick={() => {
                    setSearch('')
                    setSelectorStep('hosts')
                  }}
                  className="mb-2 inline-flex items-center gap-1.5 rounded-xl bg-slate-100 dark:bg-zinc-800 px-3 py-2 text-xs font-semibold text-slate-600 dark:text-zinc-300"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  {t('mobile.backHosts')}
                </button>
                <div className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold text-slate-500 dark:text-zinc-400">
                  <Server className="h-4 w-4" />
                  <span className="min-w-0 truncate">{activeHost === '未上报主机' ? t('mobile.unknownHost') : activeHost || t('mobile.chooseHost')}</span>
                  <span className="ml-auto rounded-full bg-slate-100 dark:bg-zinc-800 px-2 py-0.5 text-[10px]">{activeHostGroup?.rows.length || 0}</span>
                </div>
                <div className="space-y-1.5">
                  {!activeHostGroup ? (
                    <div className="rounded-xl border border-dashed border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 p-3 text-xs font-medium text-slate-400 dark:text-zinc-500">{t('mobile.noMatchingAgent')}</div>
                  ) : activeHostGroup.rows.map((agent) => {
                    const runtime = runtimeMap[agent.agent_id]
                    const active = agent.agent_id === selectedAgentId
                    return (
                      <button
                        key={agent.agent_id}
                        onClick={() => {
                          pendingCreatedTopicIdRef.current = ''
                          setSelectedAgentId(agent.agent_id)
                          setSelectedTopicId('')
                          setSearch('')
                          setSelectorStep('topics')
                        }}
                        className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left ${active ? 'border-slate-900 dark:border-zinc-300 bg-slate-100 dark:bg-zinc-800' : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950'}`}
                      >
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${active ? 'bg-[#0d0d0d] text-white dark:bg-zinc-100 dark:text-zinc-950' : 'bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200'}`}>
                          <Bot className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-slate-900 dark:text-zinc-100">{labelForAgentInTopic(agent.agent_id, compactAgentName(agent))}</span>
                          <span className="mt-0.5 block truncate text-xs font-medium text-slate-500 dark:text-zinc-400">{runtimeLine(runtime) || compactId(agent.agent_id, 10, 4)}</span>
                        </span>
                        <span className={`h-2.5 w-2.5 rounded-full ${onlineAgents.has(agent.agent_id) ? 'bg-emerald-400' : 'bg-slate-300'}`} />
                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 dark:text-zinc-500" />
                      </button>
                    )
                  })}
                </div>
              </section>
            )}

            {selectorStep === 'topics' && (
              <section>
                <button
                  onClick={() => {
                    setSearch('')
                    setSelectedHost(selectedAgentHost)
                    setSelectorStep('agents')
                  }}
                  className="mb-2 inline-flex items-center gap-1.5 rounded-xl bg-slate-100 dark:bg-zinc-800 px-3 py-2 text-xs font-semibold text-slate-600 dark:text-zinc-300"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  {t('mobile.backAgents')}
                </button>
                <div className="mb-2 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4 shrink-0 text-slate-600 dark:text-zinc-300" />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 dark:text-zinc-100">
                      {selectedAgent ? labelForAgentInTopic(selectedAgent.agent_id, compactAgentName(selectedAgent)) : t('mobile.noSelectedAgent')}
                    </span>
                    <span className={`h-2.5 w-2.5 rounded-full ${onlineAgents.has(selectedAgentId) ? 'bg-emerald-400' : 'bg-slate-300'}`} />
                  </div>
                  <div className="mt-1 truncate text-xs font-medium text-slate-500 dark:text-zinc-400">{selectedAgentHost && selectedAgentHost !== '未上报主机' ? selectedAgentHost : t('mobile.unknownHost')}</div>
                </div>
                <div className="mb-1.5 flex items-center gap-2 px-1 text-xs font-semibold uppercase text-slate-500 dark:text-zinc-400">
                  <MessageSquare className="h-4 w-4" />
                  Topics
                  <span className="ml-auto rounded-full bg-slate-100 dark:bg-zinc-800 px-2 py-0.5 text-[10px] text-slate-500 dark:text-zinc-400">{filteredTopics.length}</span>
                </div>
                <div className="space-y-2">
                  <div className="rounded-xl border border-sky-100 dark:border-sky-900 bg-sky-50/70 dark:bg-sky-950/30 p-1.5">
                    <div className="mb-1 flex items-center gap-2 px-2 text-xs font-semibold text-sky-700">
                      <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-white/70 dark:bg-zinc-900/70 px-2 py-0.5">
                        <Clock3 className="h-3.5 w-3.5" />
                        Recent
                      </span>
                      <span className="ml-auto text-[10px]">{recentTopics.length}</span>
                    </div>
                    <div className="space-y-1">
                      {recentTopics.length === 0 ? (
                        <div className="px-3 py-2 text-xs font-semibold text-sky-400">{t('mobile.noRecent')}</div>
                      ) : recentTopics.map((topic) => {
                        const id = topicId(topic)
                        const TopicIcon = topicIcon(topic)
                        const primaryAgentId = String(topic.primary_agent_id || topic.agent_ids?.[0] || topic.member_agent_ids?.[0] || '').trim()
                        const agentLabel = topic.agent_labels?.find((agent) => agent.agent_id === primaryAgentId)?.display_name
                          || agents.find((agent) => agent.agent_id === primaryAgentId)?.display_name
                          || primaryAgentId
                        return (
                          <button
                            key={`recent-${id}`}
                            onClick={() => {
                              if (primaryAgentId && primaryAgentId !== selectedAgentId) setSelectedAgentId(primaryAgentId)
                              updateTopicUnreadCache(id, (row) => ({ ...row, unread_count: 0 }))
                              setSelectedTopicId(id)
                              closeSheet('selector')
                            }}
                            className={`w-full rounded-lg border px-3 py-2 text-left ${id === selectedTopicId ? 'border-sky-600 bg-white dark:bg-zinc-950' : 'border-sky-100 bg-white/75 dark:bg-zinc-900/75'}`}
                          >
                            <div className="flex items-center gap-2">
                              <TopicIcon className="h-4 w-4 shrink-0 text-sky-700" />
                              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 dark:text-zinc-100">{topic.topic_name || compactTopicTitle(topic, locale === 'en') || compactId(id, 10, 4)}</span>
                              {!!topic.unread_count && <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">{topic.unread_count}</span>}
                            </div>
                            <div className="mt-0.5 line-clamp-1 text-xs font-medium leading-5 text-slate-500 dark:text-zinc-400">
                              {[agentLabel, topic.last_message_preview || topicKindLabel(topic, locale === 'en')].filter(Boolean).join(' · ')}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {(['p2p', 'task', 'group', 'subscriber'] as TopicGroupKey[]).map((groupKey) => {
                    const items = groupedTopics[groupKey]
                    const meta = topicGroupMeta(groupKey, t)
                    const GroupIcon = meta.Icon
                    if (items.length === 0 && search.trim()) return null
                    return (
                      <div key={groupKey} className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-1.5">
                        <div className="mb-1 flex items-center gap-2 px-2 text-xs font-semibold text-slate-500 dark:text-zinc-400">
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${meta.tone}`}>
                            <GroupIcon className="h-3.5 w-3.5" />
                            {meta.label}
                          </span>
                          <span className="ml-auto text-[10px]">{items.length}</span>
                        </div>
                        <div className="space-y-1">
                          {items.length === 0 ? (
                            <div className="px-3 py-2 text-xs font-semibold text-slate-400 dark:text-zinc-500">{t('mobile.noTopics', { kind: meta.label })}</div>
                          ) : items.map((topic) => {
                            const id = topicId(topic)
                            const TopicIcon = topicIcon(topic)
                            return (
                              <button
                                key={id}
                                onClick={() => {
                                  updateTopicUnreadCache(id, (row) => ({ ...row, unread_count: 0 }))
                                  setSelectedTopicId(id)
                                  closeSheet('selector')
                                }}
                                className={`w-full rounded-lg border px-3 py-2 text-left ${id === selectedTopicId ? 'border-slate-900 dark:border-zinc-300 bg-slate-100 dark:bg-zinc-800' : 'border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900'}`}
                              >
                                <div className="flex items-center gap-2">
                                  <TopicIcon className="h-4 w-4 shrink-0 text-slate-600 dark:text-zinc-300" />
                                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 dark:text-zinc-100">{compactTopicTitle(topic, locale === 'en') || compactId(id, 10, 4)}</span>
                                  {!!topic.unread_count && <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">{topic.unread_count}</span>}
                                </div>
                                <div className="mt-0.5 line-clamp-1 text-xs font-medium leading-5 text-slate-500 dark:text-zinc-400">
                                  {topic.description || topicKindLabel(topic, locale === 'en')}
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}
          </div>
        </MobileSheet>
      )}

      {!fixedChatMode && settingsOpen && (
        <MobileSheet title={t('mobile.settings')} onClose={() => closeSheet('settings')}>
          <div className="space-y-3">
            <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 p-4">
              <p className="text-xs font-semibold uppercase text-slate-400 dark:text-zinc-500">Account</p>
              <p className="mt-1 text-base font-semibold text-slate-900 dark:text-zinc-100">{session?.user?.name || session?.user?.email || 'WTT User'}</p>
              <p className="mt-1 text-xs font-medium text-slate-500 dark:text-zinc-400">{billing?.entitlement ? (billing.entitlement.plan === 'pro' ? 'Pro' : 'Free') : '...'} · {quotaText(billing, locale === 'en')}</p>
              <p className="mt-1 text-[11px] font-medium text-slate-400 dark:text-zinc-500">{t('mobile.network', { state: t(browserOnline ? 'mobile.online' : 'mobile.offlineState'), socket: wsState })}</p>
            </div>
            <a href="/feed" className="block rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 text-sm font-semibold text-slate-900 dark:text-zinc-100">{t('mobile.fullWeb')}</a>
            <a href={isAndroidWebView ? '/mobile/settings?source=android' : '/mobile/settings'} className="block rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 text-sm font-semibold text-slate-900 dark:text-zinc-100">{t('mobile.mobileSettings')}</a>
            <button onClick={() => signOut({ callbackUrl: mobileLoginCallback })} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0d0d0d] p-4 text-sm font-semibold text-white">
              <LogOut className="h-4 w-4" />
              {t('mobile.signOut')}
            </button>
          </div>
        </MobileSheet>
      )}

    </main>
  )
}

function EmptyCard({
  title,
  desc,
  actionLabel,
  actionIcon,
  actionDisabled,
  onAction,
}: {
  title: string
  desc: string
  actionLabel?: string
  actionIcon?: React.ReactNode
  actionDisabled?: boolean
  onAction?: () => void
}) {
  return (
    <div className="mx-auto mt-14 max-w-sm rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200">
        <Clock3 className="h-6 w-6" />
      </div>
      <p className="mt-3 text-base font-semibold text-slate-900 dark:text-zinc-100">{title}</p>
      <p className="mt-2 text-sm font-medium leading-6 text-slate-500 dark:text-zinc-400">{desc}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          disabled={actionDisabled}
          className="mx-auto mt-4 inline-flex items-center justify-center gap-2 rounded-2xl bg-[#0d0d0d] px-4 py-3 text-sm font-semibold text-white disabled:bg-slate-300"
        >
          {actionIcon}
          {actionLabel}
        </button>
      )}
    </div>
  )
}

function MobileSheet({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const { t } = useI18n()
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/35 backdrop-blur-[2px]">
      <div className="absolute inset-x-0 bottom-0 max-h-[92dvh] overflow-hidden rounded-t-[1.25rem] bg-white dark:bg-zinc-950 shadow-2xl">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-200 dark:bg-zinc-700" />
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 px-4 py-2.5">
          <p className="text-base font-semibold text-slate-900 dark:text-zinc-100">{title}</p>
          <button onClick={onClose} className="rounded-full bg-slate-100 dark:bg-zinc-800 p-2 text-slate-600 dark:text-zinc-300" aria-label={t('mobile.close')}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[calc(92dvh-3.75rem)] overflow-y-auto bg-white dark:bg-zinc-950 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>
  )
}
