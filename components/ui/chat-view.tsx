'use client'

import { Download, HardDriveDownload, Image as ImageIcon, MapPin, Maximize2, Minimize2, Paperclip, Reply, Send, SquareTerminal, Video } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'
import { formatTime, formatDateGroup } from '@/lib/time'
import {
  parseRichBlocks,
  proxyMediaUrl,
  summarizeForReply,
  toThumbnailUrl,
  trimUrlTail,
} from '@/lib/rich-content'
import { CircularProgress } from '@/components/ui/circular-progress'
import { useI18n } from '@/lib/i18n-provider'
import { isDesktop, saveToLocal } from '@/lib/desktop'
import { buildFileContext } from '@/lib/file-context'
import { AgentTerminalPane } from '@/components/ui/agent-terminal-modal'

export interface ChatMessage {
  message_id: string
  topic_id?: string
  sender_id: string
  sender_display_name?: string
  sender_avatar_url?: string
  sender_type: 'human' | 'agent'
  content: string
  encrypted?: boolean
  timestamp: string
  semantic_type?: string
  task_id?: string
  task_status?: string
  task_title?: string
  runner_agent_id?: string
  exec_mode?: string
  model_hint?: string
  reasoning_hint?: 'off' | 'low' | 'medium' | 'high'
  reply_to?: string
}

export interface ChatModelConfig {
  model: string
  reasoningEffort: 'off' | 'low' | 'medium' | 'high'
}

interface ModelOption {
  id: string
  label: string
  supports_reasoning?: boolean
}

interface CurrentAgentRuntimeInfo {
  adapter?: string
  model?: string
  model_id?: string
  current_model?: string
  reasoning_effort?: string
}

const DEFAULT_MODEL_ID = 'deepseek-v4-pro[1m]'

const FALLBACK_MODELS: ModelOption[] = [
  { id: DEFAULT_MODEL_ID, label: 'DeepSeek V4 Pro', supports_reasoning: true },
  { id: 'anthropic/claude-opus-4.7', label: 'Claude Opus 4.7', supports_reasoning: true },
  { id: 'anthropic/claude-sonnet-4.7', label: 'Claude Sonnet 4.7', supports_reasoning: true },
  { id: 'openai-codex/gpt-5.5', label: 'GPT-5.5', supports_reasoning: true },
]

function mergeModelOptions(models: ModelOption[]): ModelOption[] {
  const merged = new Map<string, ModelOption>()
  const supportedIds = new Set(FALLBACK_MODELS.map((model) => model.id))

  for (const model of FALLBACK_MODELS) merged.set(model.id, model)
  for (const model of models) {
    if (!model?.id) continue
    if (!supportedIds.has(model.id)) continue
    merged.set(model.id, {
      ...model,
      supports_reasoning: model.supports_reasoning ?? true,
    })
  }

  const defaultModel = merged.get(DEFAULT_MODEL_ID) ?? FALLBACK_MODELS[0]
  const rest = Array.from(merged.values()).filter((model) => model.id !== DEFAULT_MODEL_ID)
  return [defaultModel, ...rest]
}

function normalizeRuntimeModelId(raw: unknown): string {
  const value = String(raw || '').trim()
  if (!value) return ''
  if (value === 'deepseek-v4-pro') return DEFAULT_MODEL_ID
  if (value === 'deepseek-v4-pro[1m]') return value
  if (value.startsWith('anthropic/') || value.startsWith('openai-codex/') || value.startsWith('openai/')) return value
  if (value.startsWith('claude-')) return `anthropic/${value}`
  if (value.startsWith('gpt-')) return `openai-codex/${value}`
  return value
}

function runtimeModelPref(runtime?: CurrentAgentRuntimeInfo): Partial<ModelPref> | null {
  if (!runtime) return null
  const model = normalizeRuntimeModelId(runtime.current_model || runtime.model_id || runtime.model)
  const effortRaw = String(runtime.reasoning_effort || '').trim().toLowerCase()
  const effort = ['off', 'low', 'medium', 'high'].includes(effortRaw) ? effortRaw as ModelPref['effort'] : undefined
  if (!model && !effort) return null
  return {
    ...(model ? { model } : {}),
    ...(effort ? { effort } : {}),
  }
}

type ModelPref = { model: string; effort: 'off' | 'low' | 'medium' | 'high' }

const MODEL_PREF_STORAGE_PREFIX = 'wtt:model-pref:v2:'

function readStoredModelPref(key: string): ModelPref | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(`${MODEL_PREF_STORAGE_PREFIX}${key}`)
    if (!raw) return null
    const data = JSON.parse(raw) as { model?: string; effort?: string }
    const effort = String(data?.effort || '').toLowerCase()
    if (!data?.model) return null
    if (!['off', 'low', 'medium', 'high'].includes(effort)) return null
    return { model: String(data.model), effort: effort as ModelPref['effort'] }
  } catch {
    return null
  }
}

function writeStoredModelPref(key: string, pref: ModelPref): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(`${MODEL_PREF_STORAGE_PREFIX}${key}`, JSON.stringify(pref))
  } catch {
    // ignore quota/storage errors
  }
}

type SlashCommandMode = 'local' | 'passthrough'

type SlashCommandDef = {
  cmd: string
  desc: string
  icon: string
  mode?: SlashCommandMode
}

const LOCAL_SLASH_COMMANDS: SlashCommandDef[] = [
  { cmd: '/new task', desc: 'Create a general task', icon: '📋', mode: 'local' },
  { cmd: '/new code task', desc: 'Create a code task', icon: '💻', mode: 'local' },
  { cmd: '/new research task', desc: 'Create a research task', icon: '🔬', mode: 'local' },
  { cmd: '/new session', desc: 'Start a new chat session', icon: '💬', mode: 'local' },
  { cmd: '/new topic', desc: 'Create a new topic', icon: '📢', mode: 'local' },
  { cmd: '/run', desc: 'Run the current task', icon: '▶️', mode: 'local' },
  { cmd: '/workers', desc: 'List workers for agent', icon: '👷', mode: 'local' },
]

// Full OpenClaw built-ins (aligned with /commands docs). Shown in autocomplete,
// executed by pass-through unless handled locally above.
const OPENCLAW_PASSTHROUGH_COMMANDS: SlashCommandDef[] = [
  { cmd: '/help', desc: 'OpenClaw help', icon: '❓', mode: 'passthrough' },
  { cmd: '/commands', desc: 'List all commands', icon: '📚', mode: 'passthrough' },
  { cmd: '/status', desc: 'Session/runtime status', icon: '📊', mode: 'passthrough' },
  { cmd: '/skill', desc: 'Run a skill by name', icon: '🧩', mode: 'passthrough' },
  { cmd: '/allowlist', desc: 'Manage command allowlist', icon: '🛡️', mode: 'passthrough' },
  { cmd: '/approve', desc: 'Resolve exec approval', icon: '✅', mode: 'passthrough' },
  { cmd: '/context', desc: 'Show context summary/detail', icon: '🧾', mode: 'passthrough' },
  { cmd: '/export-session', desc: 'Export session HTML', icon: '📤', mode: 'passthrough' },
  { cmd: '/export', desc: 'Alias of /export-session', icon: '📤', mode: 'passthrough' },
  { cmd: '/whoami', desc: 'Show sender id', icon: '🪪', mode: 'passthrough' },
  { cmd: '/id', desc: 'Alias of /whoami', icon: '🪪', mode: 'passthrough' },
  { cmd: '/session idle', desc: 'Set session idle max', icon: '⏲️', mode: 'passthrough' },
  { cmd: '/session max-age', desc: 'Set session max age', icon: '🕒', mode: 'passthrough' },
  { cmd: '/subagents', desc: 'Control subagents', icon: '🛰️', mode: 'passthrough' },
  { cmd: '/acp', desc: 'ACP runtime control', icon: '🛠️', mode: 'passthrough' },
  { cmd: '/agents', desc: 'List thread-bound agents', icon: '👥', mode: 'passthrough' },
  { cmd: '/focus', desc: 'Focus thread binding', icon: '🎯', mode: 'passthrough' },
  { cmd: '/unfocus', desc: 'Clear thread binding', icon: '🧭', mode: 'passthrough' },
  { cmd: '/kill', desc: 'Abort subagent(s)', icon: '🛑', mode: 'passthrough' },
  { cmd: '/steer', desc: 'Steer a subagent', icon: '🕹️', mode: 'passthrough' },
  { cmd: '/tell', desc: 'Alias of /steer', icon: '🕹️', mode: 'passthrough' },
  { cmd: '/config', desc: 'Config show/get/set/unset', icon: '⚙️', mode: 'passthrough' },
  { cmd: '/debug', desc: 'Runtime debug overrides', icon: '🐞', mode: 'passthrough' },
  { cmd: '/usage', desc: 'Usage footer/cost', icon: '💳', mode: 'passthrough' },
  { cmd: '/tts', desc: 'Text-to-speech controls', icon: '🔊', mode: 'passthrough' },
  { cmd: '/stop', desc: 'Stop active run', icon: '⛔', mode: 'passthrough' },
  { cmd: '/restart', desc: 'Restart runtime', icon: '♻️', mode: 'passthrough' },
  { cmd: '/dock-telegram', desc: 'Dock replies to Telegram', icon: '📨', mode: 'passthrough' },
  { cmd: '/dock-discord', desc: 'Dock replies to Discord', icon: '💬', mode: 'passthrough' },
  { cmd: '/dock-slack', desc: 'Dock replies to Slack', icon: '🧵', mode: 'passthrough' },
  { cmd: '/activation', desc: 'Group activation mode', icon: '📣', mode: 'passthrough' },
  { cmd: '/send', desc: 'Send mode on/off/inherit', icon: '✉️', mode: 'passthrough' },
  { cmd: '/reset', desc: 'Reset/new session', icon: '🆕', mode: 'passthrough' },
  { cmd: '/new', desc: 'New session (optional model)', icon: '🆕', mode: 'passthrough' },
  { cmd: '/think', desc: 'Thinking effort', icon: '🧠', mode: 'passthrough' },
  { cmd: '/thinking', desc: 'Alias of /think', icon: '🧠', mode: 'passthrough' },
  { cmd: '/t', desc: 'Alias of /think', icon: '🧠', mode: 'passthrough' },
  { cmd: '/verbose', desc: 'Verbose visibility', icon: '🔍', mode: 'passthrough' },
  { cmd: '/v', desc: 'Alias of /verbose', icon: '🔍', mode: 'passthrough' },
  { cmd: '/reasoning', desc: 'Reasoning visibility', icon: '🧠', mode: 'passthrough' },
  { cmd: '/reason', desc: 'Alias of /reasoning', icon: '🧠', mode: 'passthrough' },
  { cmd: '/elevated', desc: 'Elevated mode', icon: '🔐', mode: 'passthrough' },
  { cmd: '/elev', desc: 'Alias of /elevated', icon: '🔐', mode: 'passthrough' },
  { cmd: '/exec', desc: 'Exec security/host mode', icon: '🧪', mode: 'passthrough' },
  { cmd: '/model', desc: 'Show/switch model', icon: '🤖', mode: 'passthrough' },
  { cmd: '/models', desc: 'Alias of /model', icon: '🤖', mode: 'passthrough' },
  { cmd: '/queue', desc: 'Queue mode/options', icon: '🧵', mode: 'passthrough' },
  { cmd: '/bash', desc: 'Host shell command', icon: '💻', mode: 'passthrough' },
  { cmd: '/compact', desc: 'Compact session context', icon: '🗜️', mode: 'passthrough' },
  { cmd: '/wtt', desc: 'WTT command namespace', icon: '💬', mode: 'passthrough' },
]

const SLASH_COMMANDS: SlashCommandDef[] = [
  ...LOCAL_SLASH_COMMANDS,
  ...OPENCLAW_PASSTHROUGH_COMMANDS,
]

const LOCAL_NOARG_SLASH_COMMANDS = new Set([
  '/new task',
  '/new code task',
  '/new research task',
  '/new session',
  '/new topic',
  '/run',
  '/rerun',
  '/workers',
])

const QUICK_SLASH_ACTIONS = [
  { label: 'Status', cmd: '/status' },
  { label: 'Commands', cmd: '/commands' },
  { label: 'Model', cmd: '/model' },
  { label: 'WTT Help', cmd: '/wtt help' },
] as const

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024

/**
 * Detect progress/status messages that should be hidden from the Talk feed.
 * These are intermediate updates (reasoning running, queue position, plan details)
 * — only the final result should be visible to users.
 */
const PROGRESS_PATTERNS = [
  /^Time:\s*\d{1,2}:\d{2}:\d{2}\s*\n\s*Progress:\s*\d+%/m,       // Time: HH:MM:SS\nProgress: N%
  /^Status:\s*\[Task:/m,                                            // Status: [Task: xxx] ...
  /^\[STATUS\]\s*(Started|Completed)/m,                             // [STATUS] Started/Completed
  /^Plan Mode result:/m,                                            // Plan mode phase listing
  /^Plan Mode结果/m,                                                // Plan mode failure (Chinese)
  /^Progress:\s*\d+%\s*$/m,                                        // Standalone "Progress: N%"
  /^\[TASK_STATUS\]/m,                                              // Structured [TASK_STATUS] progress
  /^\[TASK_RUN\]/m,                                                 // Task dispatch metadata
  /^\[[^\]]+\]\s*状态=.*\|\s*动作=.*心跳=\d+s/m, // WTT heartbeat line (compact)
  /^\[[^\]]+\]\s*\|\s*状态\s*=\s*doing\b.*心跳=\d+s/m, // WTT heartbeat line (piped legacy)
  /^\[[^\]]+\]\s*\|\s*状态\s*=\s*doing\b/m, // WTT doing status-only line
  /^🤔\s*Agent thinking/m,                                         // Agent thinking placeholder
]

export function isProgressMessage(content: string): boolean {
  if (!content) return false
  const c = content.trim()
  return PROGRESS_PATTERNS.some(p => p.test(c))
}

const REASONING_EFFORTS = [
  { id: 'off', label: 'Off', icon: '💤' },
  { id: 'low', label: 'Low', icon: '⚡' },
  { id: 'medium', label: 'Medium', icon: '⚖️' },
  { id: 'high', label: 'High', icon: '🧠' },
] as const

export type TaskType = 'code' | 'research' | 'general' | null

const DEFAULT_EFFORT_BY_TASK: Record<string, 'off' | 'low' | 'medium' | 'high'> = {
  code: 'high',
  research: 'high',
  general: 'low',
}

export interface MentionableAgent {
  agent_id: string
  display_name: string
  roleLabel?: string
}

type ActionQuickButton = {
  text: string
  command: string
}

function extractActionQuickButtons(content: string): { body: string; buttons: ActionQuickButton[] } {
  if (!content || !content.includes('```action')) {
    return { body: content, buttons: [] }
  }

  const buttons: ActionQuickButton[] = []
  const body = content.replace(/```action\s*([\s\S]*?)```/gi, (_match, inner) => {
    const raw = String(inner || '').trim()
    if (!raw) return ''

    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      const kind = String(parsed.kind || parsed.type || '').toLowerCase()
      if (kind !== 'buttons' && kind !== 'confirm') return ''

      const rows = Array.isArray(parsed.buttons)
        ? parsed.buttons
        : Array.isArray(parsed.options)
          ? parsed.options
          : []

      for (const row of rows) {
        if (!row || typeof row !== 'object') continue
        const item = row as Record<string, unknown>
        const text = String(item.text || item.label || item.title || '').trim()
        const command = String(item.command || item.value || item.callback_data || item.payload || '').trim()
        if (!text || !command) continue
        buttons.push({ text, command })
      }
    } catch {
      // ignore malformed action blocks
    }

    return ''
  })

  return { body: body.trim(), buttons }
}

interface ChatViewProps {
  topicName: string
  topicId?: string
  taskId?: string
  messages: ChatMessage[]
  currentAgentId: string
  onSendMessage: (content: string, modelConfig?: ChatModelConfig, replyTo?: string) => Promise<void>
  onLoadOlder?: () => Promise<void>
  onExport?: (format: 'md') => void
  hasOlder?: boolean
  loading?: boolean
  extraHeaderActions?: React.ReactNode
  isTaskTopic?: boolean
  taskType?: TaskType
  wsConnected?: boolean
  accessToken?: string
  onTaskCreated?: () => void
  onTopicCreated?: () => void
  topicMembers?: MentionableAgent[]
  topicType?: string
  typingIndicatorText?: string | null
  onRequestPrivateDiscuss?: (targetAgentId: string, targetDisplayName?: string) => Promise<void> | void
  compactUi?: boolean
  autoFocusNonce?: number
  workspaceAgentName?: string
  workspaceWorkdir?: string
  currentAgentRuntime?: CurrentAgentRuntimeInfo
  currentAgentIsCloud?: boolean
  agentRoleLabelMap?: Record<string, string>
}

interface AgentProfileSummary {
  agent_id: string
  display_name: string
  avatar_url?: string | null
  owner_count?: number
  owner_names?: string[]
}

interface HumanProfileSummary {
  sender_id: string
  display_name: string
  avatar_url?: string | null
  user_id?: string | null
  claimed_agents?: Array<{ agent_id: string; display_name: string }>
}

// ParsedRich type imported from @/lib/rich-content

interface UrlPreview {
  url: string
  title?: string
  description?: string
  image?: string
  site_name?: string
}

interface CachedPreview {
  data: UrlPreview
  fetchedAt: number
}

type ParsedTask = {
  isTask: boolean
  kind?: 'run' | 'status' | 'summary' | 'blocked' | 'asset' | 'review' | 'other'
  taskId?: string
  sessionId?: string
  runner?: string
  executor?: string
  progress?: string
  body?: string
  assetUrl?: string
  assetPath?: string
}

type ChatPanelTab = 'chat' | 'files' | 'workspace'

type ConversationFile = {
  key: string
  url: string
  filename?: string
  messageId: string
  senderId: string
  senderName?: string
  senderType: 'human' | 'agent'
  timestamp: string
}

type PendingAsset = {
  url: string
  filename: string
  kind: 'image' | 'audio' | 'video' | 'file'
  token: string
}

function parseTaskContent(content: string): ParsedTask {
  const c = (content || '').replace(/\\n/g, '\n')
  if (!c.includes('[TASK_')) return { isTask: false }

  // [TASK_INPUT] and [TASK_REQUEST] are operational/status messages — never render as task cards
  if (c.includes('[TASK_INPUT]') || c.includes('[TASK_REQUEST]')) return { isTask: false }

  const pick = (re: RegExp) => (c.match(re)?.[1] || '').trim()
  const taskId = pick(/task_id=([^\s\n]+)/)
  const sessionId = pick(/session_id=([^\s\n]+)/)
  const runner = pick(/runner=([^\s\n]+)/)
  const executor = pick(/executor=([^\s\n]+)/)
  const progress = pick(/progress=(\d+)%/)
  const assetUrl = pick(/\nurl=(https?:\/\/\S+)/)
  const assetPath = pick(/\npath=([^\n]+)/)
  const body = c.includes('\n') ? c.split('\n').slice(1).join('\n').trim() : ''

  let kind: ParsedTask['kind'] = 'other'
  if (c.includes('[TASK_RUN]')) kind = 'run'
  else if (c.includes('[TASK_STATUS]')) kind = 'status'
  else if (c.includes('[TASK_SUMMARY]')) kind = 'summary'
  else if (c.includes('[TASK_BLOCKED]')) kind = 'blocked'
  else if (c.includes('[TASK_ASSET]')) kind = 'asset'
  else if (c.includes('[TASK_REVIEW]')) kind = 'review'

  return { isTask: true, kind, taskId, sessionId, runner, executor, progress, body, assetUrl, assetPath }
}

/** Strip the ASCII box-drawing metadata blocks (┌─ 来源标识/任务信息 … └──)
 *  and return extracted key–value pairs + cleaned body. */
export interface MetaBlock { label: string; entries: Record<string, string> }
export function stripMetaBlocks(content: string): { meta: MetaBlock[]; body: string } {
  const meta: MetaBlock[] = []
  // Match ┌─ <label> ─…\n │ lines…\n └─…\n  (greedy per-block)
  let cleaned = content.replace(
    /┌─\s*(.+?)\s*─+\n((?:│[^\n]*\n?)*)└─+\n?/g,
    (_match, label: string, inner: string) => {
      const entries: Record<string, string> = {}
      for (const line of inner.split('\n')) {
        const trimmed = line.replace(/^│\s*/, '').trim()
        if (!trimmed) continue
        // "Key: Value" or "key=value" patterns
        const kv = trimmed.match(/^(.+?)[:：]\s*(.+)$/) || trimmed.match(/^(.+?)=(.+)$/)
        if (kv) entries[kv[1].trim()] = kv[2].trim()
        else entries[trimmed] = ''
      }
      meta.push({ label: label.trim(), entries })
      return ''
    }
  )
  // Strip inline [Model: ... | Effort: ...] and [Switched → Model: ...] tags
  cleaned = cleaned.replace(/\[(Switched\s*→\s*)?Model:\s*[^\]]*\]\s*/g, '')
  // Strip legacy/internal agent role blocks. These are inference context, not
  // user-visible chat content.
  cleaned = cleaned.replace(/\[Agent Role Template\][\s\S]*?\[\/Agent Role Template\]\s*/gi, '')
  cleaned = cleaned.replace(/\[WTT Agent Soul\][\s\S]*?\[\/WTT Agent Soul\]\s*/gi, '')
  cleaned = cleaned.replace(/\[WTT Worker Persona\][\s\S]*?\[\/WTT Worker Persona\]\s*/gi, '')
  cleaned = cleaned.replace(/\[WTT Worker Context\][\s\S]*?\[\/WTT Worker Context\]\s*/gi, '')
  // Strip hidden [FILE_CONTENT ...]...[/FILE_CONTENT] blocks (raw extracted text
  // from uploaded PDF/DOCX/etc — meant for the inference agent, not the UI).
  cleaned = cleaned.replace(/\[FILE_CONTENT\b[^\]]*\][\s\S]*?\[\/FILE_CONTENT\]\s*/g, '')
  return { meta, body: cleaned.trim() }
}

// classifyLine + parseRichBlocks imported from @/lib/rich-content

function ThumbnailImage({ url, isMine }: { url: string; isMine: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const [failed, setFailed] = useState(false)
  const thumb = toThumbnailUrl(url)
  return (
    <>
      <button type="button" onClick={() => setExpanded(true)} className="block cursor-zoom-in">
        {failed ? (
          <div className={`flex h-20 w-20 items-center justify-center rounded-lg border bg-slate-100 ${isMine ? 'border-indigo-400' : 'border-slate-200'}`}>
            <ImageIcon className="h-6 w-6 text-slate-400" />
          </div>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={thumb}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
            className={`h-20 w-auto max-w-[160px] rounded-lg object-cover border ${isMine ? 'border-indigo-400' : 'border-slate-200'}`}
          />
        )}
      </button>
      {expanded && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setExpanded(false)}
        >
          {failed ? (
            <div className="rounded-lg bg-white p-8 text-center">
              <ImageIcon className="mx-auto h-12 w-12 text-slate-400" />
              <p className="mt-2 text-sm text-slate-500">Image failed to load</p>
              <a href={url} target="_blank" rel="noreferrer" className="mt-1 text-xs text-indigo-500 underline break-all">{url}</a>
            </div>
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={url}
              alt=""
              onError={() => setFailed(true)}
              className="max-h-[90vh] max-w-[90vw] rounded-lg"
            />
          )}
        </div>
      )}
    </>
  )
}

function VideoAttachmentCard({ url, filename, isMine }: { url: string; filename?: string; isMine: boolean }) {
  const fallback = filenameFromFileUrl(url)
  const fname = filename || fallback || 'video'
  return (
    <div className={`overflow-hidden rounded-xl border text-sm shadow-sm ${isMine ? 'border-indigo-200 dark:border-indigo-800/40 bg-indigo-50/60 dark:bg-indigo-950/20' : 'border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800'}`}>
      <video controls preload="metadata" playsInline className="max-h-80 w-full bg-black">
        <source src={url} />
      </video>
      <div className="flex items-center gap-3 p-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-600">
          <Video className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-slate-700 dark:text-zinc-200">{fname}</span>
          <span className={`block text-xs ${isMine ? 'text-indigo-400' : 'text-slate-400'}`}>VIDEO · 可播放 / 打开 / 下载</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <a href={url} target="_blank" rel="noreferrer" className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 hover:border-cyan-300 hover:text-cyan-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
            打开
          </a>
          <a href={url} download={fname} className="rounded-md bg-cyan-600 px-2 py-1 text-xs font-semibold text-white hover:bg-cyan-500">
            下载
          </a>
        </span>
      </div>
    </div>
  )
}

function fileMeta(nameOrUrl: string) {
  const clean = decodeURIComponent(String(nameOrUrl || 'file').split('?')[0].split('#')[0])
  const ext = (clean.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase()
  const label = ext ? ext.toUpperCase() : 'FILE'
  const icon = ext === 'pdf' ? 'PDF'
    : ['doc', 'docx'].includes(ext) ? 'DOC'
    : ['ppt', 'pptx'].includes(ext) ? 'PPT'
    : ['xls', 'xlsx', 'csv'].includes(ext) ? 'XLS'
    : ['mp4', 'webm', 'mov', 'm4v'].includes(ext) ? 'VID'
    : ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ext) ? 'AUD'
    : ['zip', 'tar', 'gz'].includes(ext) ? 'ZIP'
    : ext === 'md' ? 'MD'
    : ext === 'html' || ext === 'htm' ? 'HTML'
    : label
  const tone = ext === 'pdf' ? 'bg-red-500/15 text-red-600'
    : ['doc', 'docx'].includes(ext) ? 'bg-blue-500/15 text-blue-600'
    : ['ppt', 'pptx'].includes(ext) ? 'bg-orange-500/15 text-orange-600'
    : ['xls', 'xlsx', 'csv'].includes(ext) ? 'bg-emerald-500/15 text-emerald-600'
    : ['mp4', 'webm', 'mov', 'm4v'].includes(ext) ? 'bg-cyan-500/15 text-cyan-600'
    : ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ext) ? 'bg-pink-500/15 text-pink-600'
    : ['zip', 'tar', 'gz'].includes(ext) ? 'bg-violet-500/15 text-violet-600'
    : 'bg-slate-500/15 text-slate-600'
  return { ext, label, icon, tone }
}

function FileAttachmentCard({ url, filename, isMine }: { url: string; filename?: string; isMine: boolean }) {
  const fallback = url.split('/').pop() || 'file'
  const fname = filename || fallback
  const meta = fileMeta(fname || url)
  return (
    <div className={`flex items-center gap-3 rounded-lg border p-3 text-sm transition-colors ${isMine ? 'border-indigo-200 dark:border-indigo-800/40 bg-indigo-50/60 dark:bg-indigo-950/20 text-slate-700 dark:text-zinc-300' : 'border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300'}`}>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[10px] font-black ${meta.tone}`}>
        {meta.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{fname}</span>
        <span className={`block text-xs ${isMine ? 'text-indigo-400' : 'text-slate-400'}`}>{meta.label} · 可打开 / 下载</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <a href={url} target="_blank" rel="noreferrer" className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
          打开
        </a>
        <a href={url} download={fname} className="rounded-md bg-indigo-600 px-2 py-1 text-xs font-semibold text-white hover:bg-indigo-500">
          下载
        </a>
      </span>
    </div>
  )
}

const CHAT_FILE_EXT_RE = /\.(pdf|docx?|pptx?|xlsx?|csv|zip|tar|gz|md|txt|html?|mp4|webm|mov|m4v|mp3|wav|ogg|m4a|aac|flac)(?:[?#].*)?$/i

function filenameFromFileUrl(url: string): string {
  const clean = decodeURIComponent(String(url || 'file').split('?')[0].split('#')[0])
  return clean.split('/').filter(Boolean).pop() || 'file'
}

function isConversationFileUrl(url?: string, filename?: string): boolean {
  const candidate = `${filename || ''} ${url || ''}`.trim()
  return CHAT_FILE_EXT_RE.test(candidate)
}

function extractConversationFiles(message: ChatMessage): ConversationFile[] {
  const files: ConversationFile[] = []
  const localSeen = new Set<string>()

  const addFile = (rawUrl?: string, filename?: string) => {
    const normalized = proxyMediaUrl(trimUrlTail(String(rawUrl || '').trim()))
    if (!normalized || !isConversationFileUrl(normalized, filename)) return
    const fname = filename || filenameFromFileUrl(normalized)
    const key = `${message.message_id}:${normalized}`
    if (localSeen.has(key)) return
    localSeen.add(key)
    files.push({
      key,
      url: normalized,
      filename: fname,
      messageId: message.message_id,
      senderId: message.sender_id,
      senderName: message.sender_display_name,
      senderType: message.sender_type,
      timestamp: message.timestamp,
    })
  }

  const task = parseTaskContent(message.content || '')
  if (task.kind === 'asset') addFile(task.assetUrl, task.assetPath)

  const { body: cleanContent } = stripMetaBlocks(message.content || '')
  const { body: actionCleanBody } = extractActionQuickButtons(cleanContent)
  const blocks = parseRichBlocks(actionCleanBody)
  for (const block of blocks) {
    if (block.kind === 'file' || block.kind === 'video' || block.kind === 'audio') addFile(block.url, block.filename)
  }

  const mdLinkRe = /\[([^\]]{0,160})\]\((https?:\/\/[^)\s]+|\/?media\/[^)\s]+)\)/gi
  let match: RegExpExecArray | null
  while ((match = mdLinkRe.exec(actionCleanBody)) !== null) {
    addFile(match[2], match[1]?.trim() || undefined)
  }

  const bareUrlRe = /(https?:\/\/\S+|\/?media\/[\w\-./]+(?:\?[^\s)]*)?)/gi
  while ((match = bareUrlRe.exec(actionCleanBody)) !== null) {
    addFile(match[1])
  }

  return files
}

function avatarInitial(name?: string, fallback = '?'): string {
  const n = String(name || '').trim()
  if (!n) return fallback
  const first = n[0]
  return first.toUpperCase()
}

function senderLabelText(label?: string, senderId?: string): string {
  let text = String(label || senderId || '').trim()
  if (!text) return ''

  // Strip verbose system prefixes.
  text = text.replace(/^Agent\s+/i, '').replace(/^WTT[\s-]*User\s*/i, '').trim()

  // Human owner labels like: "Alice（agent-x 的主人）" -> "Alice(@agent-x)"
  const ownerAgentMatch = text.match(/[（(]\s*([^（）()]+?)\s*的主人\s*[）)]/)
  if (ownerAgentMatch?.[1]) {
    const agentName = ownerAgentMatch[1].trim()
    const humanName = text.split(/[（(]/)[0]?.trim() || ''
    text = humanName ? `${humanName}(@${agentName})` : `@${agentName}`
  }
  return text
}

function appendRoleLabel(label: string, roleLabel?: string): string {
  const base = String(label || '').trim()
  const role = String(roleLabel || '').trim()
  if (!base || !role) return base
  if (base.includes(`【${role}】`)) return base
  return `${base}【${role}】`
}

function avatarTone(seed: string, kind: 'agent' | 'human') {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0
  const hue = Math.abs(hash) % 360
  const bg = kind === 'agent' ? `hsl(${hue} 88% 94%)` : `hsl(${(hue + 18) % 360} 92% 94%)`
  const fg = kind === 'agent' ? `hsl(${hue} 60% 34%)` : `hsl(${(hue + 18) % 360} 62% 34%)`
  const bd = kind === 'agent' ? `hsl(${hue} 52% 78%)` : `hsl(${(hue + 18) % 360} 56% 80%)`
  return { backgroundColor: bg, color: fg, borderColor: bd }
}

export function ChatView({
  topicName,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  topicId,
  taskId: propTaskId,
  messages,
  currentAgentId,
  onSendMessage,
  onLoadOlder,
  onExport,
  hasOlder = false,
  loading,
  extraHeaderActions,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isTaskTopic = false,
  taskType = null,
  wsConnected = false,
  accessToken,
  onTaskCreated,
  onTopicCreated,
  topicMembers = [],
  topicType,
  typingIndicatorText = null,
  onRequestPrivateDiscuss,
  compactUi = false,
  autoFocusNonce,
  workspaceAgentName,
  workspaceWorkdir,
  currentAgentRuntime,
  currentAgentIsCloud = false,
  agentRoleLabelMap = {},
}: ChatViewProps) {
  const { t } = useI18n()
  const defaultEffort = (taskType && DEFAULT_EFFORT_BY_TASK[taskType]) || 'off'
  const [draft, setDraft] = useState('')
  const [activeTab, setActiveTab] = useState<ChatPanelTab>('chat')
  const [sending, setSending] = useState(false)
  const [composerExpanded, setComposerExpanded] = useState(false)
  const [replyContext, setReplyContext] = useState<{ sender: string; snippet: string; imageUrl?: string; replyToId?: string } | null>(null)

  const [loadingOlder, setLoadingOlder] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<number | undefined>(undefined)
  const [exportOpen, setExportOpen] = useState(false)
  const [availableModels, setAvailableModels] = useState<ModelOption[]>(FALLBACK_MODELS)
  const [selectedModel, setSelectedModel] = useState(FALLBACK_MODELS[0].id)
  const [reasoningEffort, setReasoningEffort] = useState<'off' | 'low' | 'medium' | 'high'>(defaultEffort)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [thinkMenuOpen, setThinkMenuOpen] = useState(false)
  const modelMenuRef = useRef<HTMLDivElement>(null)
  const thinkMenuRef = useRef<HTMLDivElement>(null)
  const attachMenuRef = useRef<HTMLDivElement>(null)
  const [isFirstMessage, setIsFirstMessage] = useState(true)
  const lastSentConfigRef = useRef<{ model: string; effort: string } | null>(null)
  const modelPrefsByTopicRef = useRef<Record<string, ModelPref>>({})
  const workerConfigHydratedRef = useRef<Record<string, boolean>>({})
  const messageHintAppliedRef = useRef<Record<string, string>>({})
  const [pendingAssets, setPendingAssets] = useState<PendingAsset[]>([])
  const [previewCache, setPreviewCache] = useState<Record<string, CachedPreview>>({})
  const [attachMenuOpen, setAttachMenuOpen] = useState(false)
  const [fileAccept, setFileAccept] = useState<string>('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const prevMsgCountRef = useRef(0)
  const initialScrollDoneRef = useRef(false)

  // Slash command state
  const [slashOpen, setSlashOpen] = useState(false)
  const [slashFilter, setSlashFilter] = useState('')
  const [slashIndex, setSlashIndex] = useState(0)
  const [slashResult, setSlashResult] = useState<string | null>(null)

  // @mention autocomplete state
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionIndex, setMentionIndex] = useState(0)
  const [mentionStartPos, setMentionStartPos] = useState(-1)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const focusComposerInput = useCallback(() => {
    const input = textareaRef.current
    if (!input) return false
    input.focus({ preventScroll: true })
    const end = input.value.length
    input.setSelectionRange(end, end)
    return document.activeElement === input
  }, [])

  useEffect(() => {
    if (autoFocusNonce === undefined) return
    let cancelled = false
    const timers: number[] = []
    ;[0, 120, 280, 520].forEach((delay) => {
      const timer = window.setTimeout(() => {
        if (cancelled) return
        focusComposerInput()
      }, delay)
      timers.push(timer)
    })
    return () => {
      cancelled = true
      timers.forEach((t) => window.clearTimeout(t))
    }
  }, [autoFocusNonce, topicId, focusComposerInput])

  // Avatar/profile card states
  const [agentCardOpen, setAgentCardOpen] = useState(false)
  const [agentCardLoading, setAgentCardLoading] = useState(false)
  const [agentCardError, setAgentCardError] = useState<string | null>(null)
  const [agentCardRequesting, setAgentCardRequesting] = useState(false)
  const [agentCard, setAgentCard] = useState<AgentProfileSummary | null>(null)

  const [humanCardOpen, setHumanCardOpen] = useState(false)
  const [humanCardLoading, setHumanCardLoading] = useState(false)
  const [humanCardError, setHumanCardError] = useState<string | null>(null)
  const [humanCardRequestingAgentId, setHumanCardRequestingAgentId] = useState<string | null>(null)
  const [humanCard, setHumanCard] = useState<HumanProfileSummary | null>(null)

  // Desktop: drag-drop file overlay
  const [dragOver, setDragOver] = useState(false)

  // Desktop: listen for "Analyze with Agent" events from Local Library
  useEffect(() => {
    if (!isDesktop()) return
    const handler = async (e: Event) => {
      const { files } = (e as CustomEvent).detail as { files: Array<{ path: string; name: string }> }
      if (!files?.length) return
      const ctx = await buildFileContext(files)
      if (ctx) {
        setDraft(prev => prev ? `${prev}\n\n${ctx}\n\n` : `${ctx}\n\nPlease analyze this file:\n`)
        textareaRef.current?.focus()
      }
    }
    window.addEventListener('wtt:analyze-files', handler)
    return () => window.removeEventListener('wtt:analyze-files', handler)
  }, [])

  // Desktop: drag-drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!isDesktop()) return
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    if (!isDesktop()) return

    // Extract file paths from drag data
    const files: Array<{ path: string; name: string }> = []
    const items = e.dataTransfer?.files
    if (items) {
      for (let i = 0; i < items.length; i++) {
        const f = items[i]
        // In Electron, File objects have a .path property
        const filePath = (f as File & { path?: string }).path
        if (filePath) {
          files.push({ path: filePath, name: f.name })
        }
      }
    }
    if (files.length === 0) return

    const ctx = await buildFileContext(files)
    if (ctx) {
      setDraft(prev => prev ? `${prev}\n\n${ctx}\n\n` : `${ctx}\n\nPlease analyze:\n`)
      textareaRef.current?.focus()
    }
  }, [])

  const topicPreferenceKey = topicId || propTaskId || `topic:${topicName}`
  const currentRuntimePref = runtimeModelPref(currentAgentRuntime)

  const filteredMembers = useMemo(() => {
    if (!mentionQuery) return topicMembers
    const q = mentionQuery.toLowerCase()
    return topicMembers.filter(m =>
      m.display_name.toLowerCase().includes(q) ||
      m.agent_id.toLowerCase().includes(q) ||
      String(m.roleLabel || '').toLowerCase().includes(q)
    )
  }, [topicMembers, mentionQuery])

  const roleLabelForAgent = useCallback((agentId?: string) => {
    if (!agentId) return ''
    return agentRoleLabelMap[agentId] || topicMembers.find((member) => member.agent_id === agentId)?.roleLabel || ''
  }, [agentRoleLabelMap, topicMembers])

  const openAgentCard = useCallback(async (agentId: string, fallbackName?: string, fallbackAvatar?: string) => {
    if (!agentId) return
    setAgentCardOpen(true)
    setAgentCardLoading(true)
    setAgentCardError(null)
    setAgentCard({
      agent_id: agentId,
      display_name: fallbackName || agentId,
      avatar_url: fallbackAvatar || null,
      owner_count: undefined,
      owner_names: [],
    })

    try {
      const res = await fetch(`${CLIENT_WTT_API_BASE}/agents/${encodeURIComponent(agentId)}/profile`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      })

      if (!res.ok) {
        throw new Error(`status_${res.status}`)
      }

      const data = await res.json()
      const ownerNames = Array.isArray(data?.owner_names)
        ? data.owner_names.map((v: unknown) => String(v)).filter(Boolean)
        : []

      setAgentCard({
        agent_id: String(data?.agent_id || agentId),
        display_name: String(data?.display_name || fallbackName || agentId),
        avatar_url: data?.avatar_url ? String(data.avatar_url) : (fallbackAvatar || null),
        owner_count: Number.isFinite(Number(data?.owner_count)) ? Number(data.owner_count) : undefined,
        owner_names: ownerNames,
      })
    } catch {
      setAgentCardError('Failed to load agent profile')
    } finally {
      setAgentCardLoading(false)
    }
  }, [accessToken])

  const handleRequestPrivateFromCard = useCallback(async () => {
    if (!agentCard?.agent_id || !onRequestPrivateDiscuss) return
    setAgentCardRequesting(true)
    try {
      await onRequestPrivateDiscuss(agentCard.agent_id, agentCard.display_name)
      setAgentCardOpen(false)
    } catch {
      // caller usually handles feedback; keep UI stable
    } finally {
      setAgentCardRequesting(false)
    }
  }, [agentCard, onRequestPrivateDiscuss])

  const openHumanCard = useCallback(async (senderId: string, fallbackName?: string, fallbackAvatar?: string) => {
    if (!topicId || !senderId) return

    setHumanCardOpen(true)
    setHumanCardLoading(true)
    setHumanCardError(null)
    setHumanCard({
      sender_id: senderId,
      display_name: fallbackName || senderId,
      avatar_url: fallbackAvatar || null,
      user_id: null,
      claimed_agents: [],
    })

    try {
      const res = await fetch(
        `${CLIENT_WTT_API_BASE}/topics/${encodeURIComponent(topicId)}/human-profile?sender_id=${encodeURIComponent(senderId)}`,
        { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined },
      )

      if (!res.ok) {
        throw new Error(`status_${res.status}`)
      }

      const data = await res.json()
      const claimed = Array.isArray(data?.claimed_agents)
        ? data.claimed_agents
            .map((x: unknown) => {
              const r = x as Record<string, unknown>
              const aid = String(r?.agent_id || '').trim()
              if (!aid) return null
              return { agent_id: aid, display_name: String(r?.display_name || aid) }
            })
            .filter(Boolean) as Array<{ agent_id: string; display_name: string }>
        : []

      setHumanCard({
        sender_id: String(data?.sender_id || senderId),
        display_name: String(data?.display_name || fallbackName || senderId),
        avatar_url: data?.avatar_url ? String(data.avatar_url) : (fallbackAvatar || null),
        user_id: data?.user_id ? String(data.user_id) : null,
        claimed_agents: claimed,
      })
    } catch {
      setHumanCardError(t('chat.userProfileLoadFailed'))
    } finally {
      setHumanCardLoading(false)
    }
  }, [topicId, accessToken, t])

  const handleRequestPrivateWithHumanAgent = useCallback(async (agentId: string, displayName?: string) => {
    if (!onRequestPrivateDiscuss || !agentId) return
    setHumanCardRequestingAgentId(agentId)
    try {
      await onRequestPrivateDiscuss(agentId, displayName)
      setHumanCardOpen(false)
    } catch {
      // noop
    } finally {
      setHumanCardRequestingAgentId(null)
    }
  }, [onRequestPrivateDiscuss])

  // Fetch available models from API
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const res = await fetch(`${CLIENT_WTT_API_BASE}/workers/models/available`)
        if (res.ok) {
          const data = await res.json()
          if (data.models?.length > 0) {
            const models: ModelOption[] = data.models.map((m: { id: string; label: string; supports_reasoning?: boolean }) => ({
              id: m.id,
              label: m.label,
              supports_reasoning: m.supports_reasoning ?? true,
            }))
            setAvailableModels(mergeModelOptions(models))
          }
        }
      } catch {}
    }
    fetchModels()
  }, [])

  // Keep model/think preference per topic/task/p2p session.
  // Priority: worker current config (if available) > local persisted per-topic pref > task defaults.
  useEffect(() => {
    const inMemory = modelPrefsByTopicRef.current[topicPreferenceKey]
    const persisted = readStoredModelPref(topicPreferenceKey)
    const saved = inMemory ?? persisted
    const runtimeModel = currentRuntimePref?.model && availableModels.some((m) => m.id === currentRuntimePref.model)
      ? currentRuntimePref.model
      : ''

    const preferredEffort = (!currentAgentIsCloud && currentRuntimePref?.effort)
      || saved?.effort
      || ((taskType && DEFAULT_EFFORT_BY_TASK[taskType]) || 'off')

    let preferredModel = (!currentAgentIsCloud && runtimeModel) || saved?.model
    if (!preferredModel || !availableModels.some((m) => m.id === preferredModel)) {
      preferredModel = currentAgentIsCloud
        ? DEFAULT_MODEL_ID
        : (availableModels[0]?.id || FALLBACK_MODELS[0].id)
    }

    setSelectedModel(preferredModel)
    setReasoningEffort(preferredEffort)
  }, [topicPreferenceKey, taskType, availableModels, currentRuntimePref?.model, currentRuntimePref?.effort, currentAgentIsCloud])

  useEffect(() => {
    const pref: ModelPref = {
      model: selectedModel,
      effort: reasoningEffort,
    }
    modelPrefsByTopicRef.current[topicPreferenceKey] = pref
    writeStoredModelPref(topicPreferenceKey, pref)
  }, [topicPreferenceKey, selectedModel, reasoningEffort])

  // Hydrate from latest message metadata.model_config when available.
  // This keeps picker aligned with the actual running session config per topic.
  useEffect(() => {
    const latestWithHint = [...messages]
      .reverse()
      .find((m) => m.model_hint || m.reasoning_hint)

    if (!latestWithHint) return

    const appliedMessageId = messageHintAppliedRef.current[topicPreferenceKey]
    if (appliedMessageId === latestWithHint.message_id) return

    const model = String(latestWithHint.model_hint || '').trim()
    const effort = latestWithHint.reasoning_hint

    const nextModel = model && availableModels.some((m) => m.id === model)
      ? model
      : (availableModels.some((m) => m.id === selectedModel) ? selectedModel : DEFAULT_MODEL_ID)
    const nextEffort: ModelPref['effort'] = effort || reasoningEffort

    if (nextModel) setSelectedModel(nextModel)
    setReasoningEffort(nextEffort)

    const pref: ModelPref = { model: nextModel || selectedModel, effort: nextEffort }
    modelPrefsByTopicRef.current[topicPreferenceKey] = pref
    writeStoredModelPref(topicPreferenceKey, pref)
    messageHintAppliedRef.current[topicPreferenceKey] = latestWithHint.message_id
  }, [messages, topicPreferenceKey, availableModels, selectedModel, reasoningEffort])

  // Hydrate from current worker model config so picker reflects active worker settings.
  useEffect(() => {
    if (!topicId || !currentAgentId) return
    if (workerConfigHydratedRef.current[topicPreferenceKey]) return

    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(`${CLIENT_WTT_API_BASE}/workers?agent_id=${encodeURIComponent(currentAgentId)}`, {
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
        })
        if (!res.ok) return
        const rows = await res.json() as unknown
        if (!Array.isArray(rows)) return

        const row = rows.find((r) => String((r as Record<string, unknown>).topic_id || '') === String(topicId)) as Record<string, unknown> | undefined
        if (!row) return

        const cfg = ((row.model_config && typeof row.model_config === 'object') ? row.model_config : {}) as Record<string, unknown>
        const model = String(cfg.model || '').trim()
        const effortRaw = String(cfg.reasoning_effort || cfg.reasoningEffort || '').trim().toLowerCase()
        const effort = (['off', 'low', 'medium', 'high'].includes(effortRaw)
          ? effortRaw
          : '') as '' | ModelPref['effort']

        if (cancelled) return

        const nextModel = model && availableModels.some((m) => m.id === model)
          ? model
          : (availableModels.some((m) => m.id === selectedModel) ? selectedModel : DEFAULT_MODEL_ID)
        const nextEffort: ModelPref['effort'] = effort || reasoningEffort

        if (nextModel) setSelectedModel(nextModel)
        setReasoningEffort(nextEffort)

        const pref: ModelPref = { model: nextModel || selectedModel, effort: nextEffort }
        modelPrefsByTopicRef.current[topicPreferenceKey] = pref
        writeStoredModelPref(topicPreferenceKey, pref)
      } catch {
        // keep local pref fallback
      } finally {
        workerConfigHydratedRef.current[topicPreferenceKey] = true
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [topicId, currentAgentId, accessToken, topicPreferenceKey, availableModels, selectedModel, reasoningEffort])

  // Close model menu on click outside
  useEffect(() => {
    if (!modelMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setModelMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [modelMenuOpen])

  useEffect(() => {
    if (!thinkMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (thinkMenuRef.current && !thinkMenuRef.current.contains(e.target as Node)) {
        setThinkMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [thinkMenuOpen])

  useEffect(() => {
    if (!attachMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setAttachMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [attachMenuOpen])

  useEffect(() => {
    if (!composerExpanded) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [composerExpanded])

  const isDiscussTopic = topicType === 'discussion'
  const isBroadcastTopic = topicType === 'broadcast'
  const isNonTaskDiscussTopic = isDiscussTopic && !isTaskTopic
  const isModelCommand = useCallback((cmd: string) => {
    const c = cmd.trim().toLowerCase()
    return c === '/model' || c.startsWith('/model ') || c === '/models' || c.startsWith('/models ')
  }, [])

  const availableSlashCommands = useMemo(() => {
    if (!isNonTaskDiscussTopic) return SLASH_COMMANDS
    // In non-task discuss topics, model switching must be blocked to avoid all
    // agents reacting to the same slash command.
    return SLASH_COMMANDS.filter((c) => !isModelCommand(c.cmd))
  }, [isNonTaskDiscussTopic, isModelCommand])

  // Slash command filtering
  const filteredCommands = slashFilter
    ? availableSlashCommands.filter(c => c.cmd.startsWith(slashFilter.toLowerCase()))
    : availableSlashCommands

  const handleDraftChange = useCallback((value: string) => {
    setDraft(value)
    if (value.startsWith('/') && !value.includes('\n')) {
      setSlashOpen(true)
      setSlashFilter(value)
      setSlashIndex(0)
    } else {
      setSlashOpen(false)
    }

    // @mention detection: find @ followed by word characters near cursor
    const textarea = textareaRef.current
    if (textarea && topicMembers.length > 0) {
      const cursorPos = textarea.selectionStart
      const textUpToCursor = value.slice(0, cursorPos)
      const atMatch = textUpToCursor.match(/@([\w\-.]*)$/)
      if (atMatch) {
        setMentionOpen(true)
        setMentionQuery(atMatch[1])
        setMentionStartPos(cursorPos - atMatch[0].length)
        setMentionIndex(0)
      } else {
        setMentionOpen(false)
        setMentionQuery('')
        setMentionStartPos(-1)
      }
    }
  }, [topicMembers])

  const insertMention = useCallback((member: MentionableAgent) => {
    const textarea = textareaRef.current
    if (!textarea || mentionStartPos < 0) return
    const before = draft.slice(0, mentionStartPos)
    const after = draft.slice(textarea.selectionStart)
    const mention = `@${member.display_name} `
    const newDraft = before + mention + after
    setDraft(newDraft)
    setMentionOpen(false)
    setMentionQuery('')
    setMentionStartPos(-1)
    // Restore cursor position after React re-render
    const newCursorPos = mentionStartPos + mention.length
    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(newCursorPos, newCursorPos)
    })
  }, [draft, mentionStartPos])

  const quickReplyToMessage = useCallback((message: ChatMessage) => {
    const senderName = senderLabelText(message.sender_display_name, message.sender_id)
    const body = stripMetaBlocks(message.content || '').body
    const summary = summarizeForReply(body)

    setReplyContext({
      sender: senderName || message.sender_id,
      snippet: summary.text,
      imageUrl: summary.thumbUrl,
      replyToId: message.message_id,
    })

    // Only inject @mention into draft, no quoted content
    const mention = senderName ? `@${senderName} ` : ''
    setDraft((prev) => {
      const base = prev.trim()
      return base ? `${base}\n\n${mention}` : mention
    })

    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      const t = textareaRef.current
      if (t) {
        const end = t.value.length
        t.setSelectionRange(end, end)
      }
    })
  }, [])

  const executeSlashCommand = useCallback(async (cmd: string, args: string) => {
    const apiBase = CLIENT_WTT_API_BASE
    setSlashResult(null)
    try {
      switch (cmd) {
        case '/workers': {
          if (!currentAgentId) { setSlashResult('❌ No agent selected'); return }
          const res = await fetch(`${apiBase}/workers?agent_id=${currentAgentId}`)
          const data = await res.json()
          if (data.length === 0) { setSlashResult('No workers found for this agent'); return }
          setSlashResult('👷 Workers:\n' + data.map((w: { name: string; status: string }) => `  • ${w.name} (${w.status})`).join('\n'))
          return
        }
        case '/new task':
        case '/new code task':
        case '/new research task': {
          const taskType = cmd.includes('code') ? 'code' : cmd.includes('research') ? 'research' : 'general'
          const title = args.trim() || `New ${taskType} task`
          const headers: Record<string, string> = { 'Content-Type': 'application/json' }
          if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`
          const res = await fetch(`${apiBase}/tasks`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              title,
              task_type: taskType,
              task_mode: 'single',
              priority: 'P1',
              status: 'todo',
              exec_mode: 'reasoning',
              owner_agent_id: currentAgentId || undefined,
              runner_agent_id: currentAgentId || undefined,
            }),
          })
          if (res.ok) {
            const task = await res.json()
            setSlashResult(`✅ Created ${taskType} task: ${task.title} (${task.id})`)
            onTaskCreated?.()
          } else {
            setSlashResult('❌ Failed to create task: ' + await res.text())
          }
          return
        }
        case '/new topic': {
          const name = args.trim() || 'New Topic'
          const topicHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
          if (accessToken) topicHeaders['Authorization'] = `Bearer ${accessToken}`
          const res = await fetch(`${apiBase}/topics`, {
            method: 'POST',
            headers: topicHeaders,
            body: JSON.stringify({ name, type: 'discussion', visibility: 'public', creator_id: currentAgentId }),
          })
          if (res.ok) {
            const topic = await res.json()
            setSlashResult(`✅ Created topic: ${topic.name} (${topic.id})`)
            onTopicCreated?.()
          } else {
            setSlashResult('❌ Failed to create topic: ' + await res.text())
          }
          return
        }
        case '/new session': {
          setSlashResult('💬 Starting new session — chat history cleared.')
          return
        }
        case '/run': {
          if (!propTaskId) {
            setSlashResult('⚠️ No task selected. Switch to a task topic first.')
            return
          }
          const runHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
          if (accessToken) runHeaders['Authorization'] = `Bearer ${accessToken}`
          const res = await fetch(`${apiBase}/tasks/${propTaskId}/run`, {
            method: 'POST',
            headers: runHeaders,
            body: JSON.stringify({ runner_agent_id: currentAgentId }),
          })
          if (res.ok) {
            setSlashResult(`▶️ Task ${propTaskId.slice(0, 8)}… dispatched for execution.`)
          } else {
            const detail = await res.text()
            setSlashResult(`❌ Failed to run task: ${detail}`)
          }
          return
        }
        case '/rerun': {
          if (!propTaskId) {
            setSlashResult('⚠️ No task selected. Switch to a task topic first.')
            return
          }
          const rerunHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
          if (accessToken) rerunHeaders['Authorization'] = `Bearer ${accessToken}`
          const res = await fetch(`${apiBase}/tasks/${propTaskId}/rerun`, {
            method: 'POST',
            headers: rerunHeaders,
          })
          if (res.ok) {
            setSlashResult(`🔄 Task ${propTaskId.slice(0, 8)}… re-dispatched.`)
          } else {
            const detail = await res.text()
            setSlashResult(`❌ Failed to rerun task: ${detail}`)
          }
          return
        }
        default:
          setSlashResult(`⚠️ Command "${cmd}" not yet implemented`)
      }
    } catch (e) {
      setSlashResult(`❌ Error: ${e instanceof Error ? e.message : 'Unknown error'}`)
    }
  }, [currentAgentId, propTaskId, accessToken, onTaskCreated, onTopicCreated])

  const sendPassthroughSlash = useCallback(async (command: string, opts?: { silent?: boolean }) => {
    setSending(true)
    try {
      await onSendMessage(command)
      if (!opts?.silent) {
        setSlashResult(`✅ Sent ${command}`)
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to send command'
      setSlashResult(`❌ ${msg}`)
    } finally {
      setSending(false)
    }
  }, [onSendMessage])

  // Scroll to bottom on initial load and topic change
  useEffect(() => {
    initialScrollDoneRef.current = false
    prevMsgCountRef.current = 0
  }, [topicName])

  useEffect(() => {
    if (!initialScrollDoneRef.current && messages.length > 0 && scrollRef.current) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
      })
      initialScrollDoneRef.current = true
      prevMsgCountRef.current = messages.length
    }
  }, [messages.length])

  // Auto-scroll when new messages are appended (not when older are prepended)
  useEffect(() => {
    if (!initialScrollDoneRef.current) return
    if (messages.length > prevMsgCountRef.current && scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 150
      if (isNearBottom) {
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
        })
      }
    }
    prevMsgCountRef.current = messages.length
  }, [messages.length])

  useEffect(() => {
    try {
      const raw = localStorage.getItem('wtt_preview_cache_v1')
      if (!raw) return
      const parsed = JSON.parse(raw) as Record<string, CachedPreview | UrlPreview>
      if (parsed && typeof parsed === 'object') {
        const normalized: Record<string, CachedPreview> = {}
        for (const [url, item] of Object.entries(parsed)) {
          if (!item || typeof item !== 'object') continue
          const maybeCached = item as CachedPreview
          if (typeof maybeCached.fetchedAt === 'number' && maybeCached.data) {
            normalized[url] = maybeCached
          } else {
            normalized[url] = { data: item as UrlPreview, fetchedAt: Date.now() }
          }
        }
        setPreviewCache(normalized)
      }
    } catch {
      // ignore cache parse errors
    }
  }, [])

  useEffect(() => {
    try {
      const entries = Object.entries(previewCache)
      // cap size to avoid unbounded growth
      const sliced = entries.slice(Math.max(0, entries.length - 200))
      localStorage.setItem('wtt_preview_cache_v1', JSON.stringify(Object.fromEntries(sliced)))
    } catch {
      // ignore storage errors
    }
  }, [previewCache])

  const handleSend = async () => {
    if (!draft.trim() && pendingAssets.length === 0) return

    const attachmentContent = pendingAssets.map((asset) => asset.token).join('\n\n')
    let content = [draft.trim(), attachmentContent].filter(Boolean).join('\n\n')

    // Handle slash commands
    if (pendingAssets.length === 0 && content.startsWith('/')) {
      setDraft('')
      setSlashOpen(false)
      setSlashResult(null)

      const sorted = [...availableSlashCommands].sort((a, b) => b.cmd.length - a.cmd.length)
      const match = sorted.find(c => content.toLowerCase() === c.cmd || content.toLowerCase().startsWith(c.cmd + ' '))
      const mode = match?.mode ?? 'passthrough'

      if (isNonTaskDiscussTopic && isModelCommand(content)) {
        setSlashResult('⚠️ 非任务 discuss topic 中不允许切模型（会触发多 agent 响应）。')
        return
      }

      if (mode === 'local' && match) {
        const remainder = content.slice(match.cmd.length).trim()
        await executeSlashCommand(match.cmd, remainder)
        return
      }

      // Unknown slash or passthrough slash: forward to backend runtime
      await sendPassthroughSlash(content, { silent: true })
      return
    }

    if (replyContext && replyContext.snippet) {
      const sender = replyContext.sender || 'unknown'
      const contextHeader = `[回复上下文]\n对象: ${sender}\n引用: ${replyContext.snippet}\n---\n`
      if (!content.includes('[回复上下文]')) {
        content = `${contextHeader}${content}`
      }
    }

    const modelConfig: ChatModelConfig = { model: selectedModel, reasoningEffort }

    lastSentConfigRef.current = { model: selectedModel, effort: reasoningEffort }
    if (isFirstMessage) setIsFirstMessage(false)

    setSending(true)
    try {
      await onSendMessage(content, modelConfig, replyContext?.replyToId)
      setDraft('')
      setPendingAssets([])
      setReplyContext(null)
    } catch (error) {
      console.error('Failed to send message:', error)
      alert(error instanceof Error ? error.message : 'Failed to send message')
    } finally {
      setSending(false)
    }
  }


  const uploadAssetAndInsert = async (file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      alert(`File too large. Max 100MB, got ${(file.size / (1024 * 1024)).toFixed(1)}MB`)
      return
    }

    setUploading(true)
    setUploadProgress(0)
    try {
      const sign = await fetch(`${CLIENT_WTT_API_BASE}/media/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, mime_type: file.type, size: file.size }),
      })
      if (!sign.ok) throw new Error(await sign.text())
      const signed = await sign.json()

      // Use XHR for upload progress tracking
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 90))
        })
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve()
          else reject(new Error(xhr.responseText || `Upload failed: ${xhr.status}`))
        })
        xhr.addEventListener('error', () => reject(new Error('Upload failed')))
        xhr.open('PUT', `${CLIENT_WTT_API_BASE}${signed.upload_url}`)
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
        xhr.send(file)
      })

      setUploadProgress(95)
      const commit = await fetch(`${CLIENT_WTT_API_BASE}/media/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upload_token: signed.upload_token }),
      })
      if (!commit.ok) throw new Error(await commit.text())
      const asset = await commit.json()
      setUploadProgress(100)

      const isImage = file.type.startsWith('image/')
      const isAudio = file.type.startsWith('audio/')
      const isVideo = file.type.startsWith('video/')
      const kind: PendingAsset['kind'] = isImage ? 'image' : isAudio ? 'audio' : isVideo ? 'video' : 'file'
      const token = isImage
        ? `![${file.name}](${asset.url})`
        : isAudio
          ? `[audio:${file.name}](${asset.url})`
          : isVideo
            ? `[video:${file.name}](${asset.url})`
            : `[file:${file.name}](${asset.url})`
      setPendingAssets((prev) => [...prev, { url: asset.url, filename: file.name, kind, token }])
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
      setUploadProgress(undefined)
    }
  }

  const openFilePicker = (accept: string) => {
    setFileAccept(accept)
    setAttachMenuOpen(false)
    requestAnimationFrame(() => fileInputRef.current?.click())
  }

  const insertLocation = () => {
    setAttachMenuOpen(false)
    if (!navigator.geolocation) {
      alert(t('chat.locationUnsupported'))
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        const token = `[location](${`https://maps.google.com/?q=${latitude},${longitude}`})`
        setDraft((prev) => `${prev}${prev ? '\n\n' : ''}${token}`)
      },
      (err) => {
        alert(t('chat.locationFailed', { msg: err.message || 'permission denied' }))
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    )
  }

  const handleLoadOlder = async () => {
    if (!onLoadOlder || loadingOlder || !hasOlder) return
    setLoadingOlder(true)
    const prevHeight = scrollRef.current?.scrollHeight ?? 0
    await onLoadOlder()
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        const nextHeight = scrollRef.current.scrollHeight
        scrollRef.current.scrollTop = nextHeight - prevHeight
      }
    })
    setLoadingOlder(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // @mention autocomplete keyboard navigation
    if (mentionOpen && filteredMembers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionIndex(i => (i + 1) % filteredMembers.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionIndex(i => (i - 1 + filteredMembers.length) % filteredMembers.length)
        return
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault()
        const selected = filteredMembers[mentionIndex]
        if (selected) insertMention(selected)
        return
      }
      if (e.key === 'Escape') {
        setMentionOpen(false)
        return
      }
    }
    if (slashOpen && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSlashIndex(i => (i + 1) % filteredCommands.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSlashIndex(i => (i - 1 + filteredCommands.length) % filteredCommands.length)
        return
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault()
        const selected = filteredCommands[slashIndex]
        if (selected) {
          const mode = selected.mode ?? 'local'
          if (mode === 'local' && LOCAL_NOARG_SLASH_COMMANDS.has(selected.cmd)) {
            setDraft('')
            setSlashOpen(false)
            executeSlashCommand(selected.cmd, '')
          } else {
            setDraft(selected.cmd + ' ')
            setSlashOpen(false)
          }
        }
        return
      }
      if (e.key === 'Escape') {
        setSlashOpen(false)
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  useEffect(() => {
    const TTL_MS = 24 * 60 * 60 * 1000
    const now = Date.now()
    const urls = new Set<string>()
    for (const m of messages) {
      const blocks = parseRichBlocks(m.content || '')
      for (const block of blocks) {
        const candidateUrl = block.kind === 'link' ? block.url : undefined
        if (candidateUrl) {
          const cached = previewCache[candidateUrl]
          const isFresh = cached && now - cached.fetchedAt < TTL_MS
          if (!isFresh) urls.add(candidateUrl)
        }
      }
    }
    if (urls.size === 0) return

    let cancelled = false
    ;(async () => {
      for (const url of Array.from(urls)) {
        try {
          const r = await fetch(`${CLIENT_WTT_API_BASE}/preview/url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
          })
          if (!r.ok) continue
          const j = await r.json()
          if (!cancelled) {
            setPreviewCache((prev) => ({ ...prev, [url]: { data: j, fetchedAt: Date.now() } }))
          }
        } catch {
          // ignore preview fetch failures
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [messages, previewCache])

  // Filter out status-stream messages (TASK_REQUEST, SYSTEM, NOTIFICATION)
  // and intermediate task stream cards (TASK_RUN / TASK_STATUS)
  // so the feed focuses on final agent outputs.
  const STATUS_SEMANTIC_TYPES = new Set(['task_request', 'TASK_REQUEST', 'system', 'SYSTEM', 'notification', 'NOTIFICATION'])
  const visibleMessages = messages.filter((m) => {
    if (isProgressMessage(m.content)) return false
    if (STATUS_SEMANTIC_TYPES.has(m.semantic_type || '')) return false

    const taskParsed = parseTaskContent(m.content || '')
    if (taskParsed.isTask && (taskParsed.kind === 'run' || taskParsed.kind === 'status')) {
      return false
    }

    return true
  })

  const groupedMessages: Array<{ label: string; messages: ChatMessage[] }> = []
  visibleMessages.forEach((message) => {
    const label = formatDateGroup(message.timestamp)
    const lastGroup = groupedMessages[groupedMessages.length - 1]
    if (!lastGroup || lastGroup.label !== label) {
      groupedMessages.push({ label, messages: [message] })
    } else {
      lastGroup.messages.push(message)
    }
  })

  const conversationFiles = useMemo(() => {
    const seen = new Set<string>()
    const out: ConversationFile[] = []
    for (const message of visibleMessages) {
      for (const file of extractConversationFiles(message)) {
        const key = file.url
        if (seen.has(key)) continue
        seen.add(key)
        out.push(file)
      }
    }
    return out
  }, [visibleMessages])


  return (
    <div
      className={`relative flex h-full flex-col ${dragOver ? 'ring-2 ring-inset ring-indigo-400' : ''}`}
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif' }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dragOver && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-indigo-50/60 dark:bg-indigo-900/30">
          <div className="rounded-xl bg-white dark:bg-zinc-800 px-6 py-4 shadow-lg border-2 border-dashed border-indigo-400">
            <p className="text-sm font-medium text-indigo-600 dark:text-indigo-300">📄 Drop files to analyze with Agent</p>
          </div>
        </div>
      )}
      <div className={`border-b border-[#e5e0d8] bg-[#fbfaf7] dark:border-zinc-800 dark:bg-zinc-950 ${compactUi ? 'px-2 py-1' : 'px-4 pt-2'}`}>
        <div className={`flex items-start justify-between ${compactUi ? 'gap-1.5' : 'gap-3'}`}>
          <div className="min-w-0 flex-1">
            <div className={`flex flex-wrap items-center ${compactUi ? 'gap-1.5' : 'gap-2'}`}>
              <h2 className={`truncate font-semibold text-[#1f2328] dark:text-zinc-100 ${compactUi ? 'text-[13px] leading-4' : 'text-[15px] leading-5'}`}># {topicName}</h2>
              {!compactUi && (
                <span className="shrink-0 text-[10px] text-slate-400">
                  {t('chat.messagesLoaded', { count: messages.length })}
                </span>
              )}
              {wsConnected && (
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-500">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  {t('chat.live')}
                </span>
              )}
            </div>
            <div className={`flex items-center ${compactUi ? 'mt-0.5 gap-3' : 'mt-2 gap-5'}`}>
              <div className={`flex items-center ${compactUi ? 'gap-3' : 'gap-5'}`}>
                <button
                  type="button"
                  onClick={() => setActiveTab('chat')}
                  className={`relative -mb-px inline-flex items-center gap-1.5 border-b-2 font-semibold transition ${compactUi ? 'pb-1 text-xs' : 'pb-2 text-sm'} ${
                    activeTab === 'chat'
                      ? 'border-[#1f2328] text-[#1f2328] dark:border-zinc-100 dark:text-zinc-100'
                      : 'border-transparent text-[#8a8378] hover:border-[#cfc6b8] hover:text-[#1f2328] dark:text-zinc-500 dark:hover:border-zinc-600 dark:hover:text-zinc-200'
                  }`}
                >
                  <span>Chat</span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] leading-none ${
                    activeTab === 'chat'
                      ? 'bg-[#1f2328] text-white dark:bg-zinc-100 dark:text-zinc-950'
                      : 'bg-[#eee8dd] text-[#8a8378] dark:bg-zinc-800 dark:text-zinc-400'
                  }`}>
                    {visibleMessages.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('files')}
                  className={`relative -mb-px inline-flex items-center gap-1.5 border-b-2 font-semibold transition ${compactUi ? 'pb-1 text-xs' : 'pb-2 text-sm'} ${
                    activeTab === 'files'
                      ? 'border-[#1f2328] text-[#1f2328] dark:border-zinc-100 dark:text-zinc-100'
                      : 'border-transparent text-[#8a8378] hover:border-[#cfc6b8] hover:text-[#1f2328] dark:text-zinc-500 dark:hover:border-zinc-600 dark:hover:text-zinc-200'
                  }`}
                >
                  <span>Files</span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] leading-none ${
                    activeTab === 'files'
                      ? 'bg-[#1f2328] text-white dark:bg-zinc-100 dark:text-zinc-950'
                      : 'bg-[#eee8dd] text-[#8a8378] dark:bg-zinc-800 dark:text-zinc-400'
                  }`}>
                    {conversationFiles.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('workspace')}
                  className={`relative -mb-px inline-flex items-center gap-1.5 border-b-2 font-semibold transition ${compactUi ? 'pb-1 text-xs' : 'pb-2 text-sm'} ${
                    activeTab === 'workspace'
                      ? 'border-[#1f2328] text-[#1f2328] dark:border-zinc-100 dark:text-zinc-100'
                      : 'border-transparent text-[#8a8378] hover:border-[#cfc6b8] hover:text-[#1f2328] dark:text-zinc-500 dark:hover:border-zinc-600 dark:hover:text-zinc-200'
                  }`}
                >
                  <SquareTerminal className={compactUi ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
                  <span>Workspace</span>
                  <span className={`h-1.5 w-1.5 rounded-full ${
                    currentAgentId ? 'bg-emerald-400' : 'bg-slate-300 dark:bg-zinc-700'
                  }`} />
                </button>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {extraHeaderActions}
            <div className="relative">
              <button
                onClick={() => setExportOpen(!exportOpen)}
                onBlur={() => setTimeout(() => setExportOpen(false), 150)}
                className={`flex items-center gap-1 rounded border border-slate-200 dark:border-zinc-600 text-slate-500 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 hover:text-slate-700 dark:hover:text-zinc-100 ${compactUi ? 'px-1 py-0.5 text-[9px]' : 'px-1.5 py-0.5 text-[10px]'}`}
              >
                <Download size={compactUi ? 10 : 11} /> {t('chat.export')} ▾
              </button>
              {exportOpen && (
                <div className="absolute right-0 top-full mt-1 z-30 min-w-[132px] rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 py-1 shadow-lg">
                  <button
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => { onExport?.('md'); setExportOpen(false) }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 hover:text-slate-800 dark:hover:text-zinc-100"
                  >
                    📝 {t('chat.exportMarkdown')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div
        ref={scrollRef}
        className={`min-h-0 flex-1 bg-[#fbfaf7] dark:bg-zinc-950 ${
          activeTab === 'workspace'
            ? 'overflow-hidden px-3 py-3 sm:px-4'
            : 'overflow-y-auto px-4 py-3 sm:px-6'
        }`}
      >
        {activeTab !== 'workspace' && (
        <div className="mb-3 flex justify-center">
          <button
            onClick={handleLoadOlder}
            disabled={!hasOlder || loadingOlder}
            className="rounded-full border border-slate-200 dark:border-zinc-700 bg-slate-50/85 dark:bg-zinc-800/85 px-3 py-1 text-xs text-slate-500 disabled:opacity-40"
          >
            {loadingOlder ? t('chat.loadingHistory') : hasOlder ? t('chat.loadOlder') : t('chat.noOlder')}
          </button>
        </div>
        )}

        {loading && messages.length === 0 && (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-indigo-500" />
          </div>
        )}

        {!loading && activeTab === 'chat' && messages.length === 0 && (
          <div className="pt-20 text-center text-sm text-slate-400">{t('chat.noMessages')}</div>
        )}

        {activeTab === 'workspace' ? (
          <div className="flex h-full min-h-[360px] w-full flex-col">
            {currentAgentId && accessToken ? (
              <div className="relative min-h-[320px] flex-1 resize overflow-hidden rounded-2xl">
                <AgentTerminalPane
                  agentId={currentAgentId}
                  agentName={workspaceAgentName || currentAgentId}
                  workdir={workspaceWorkdir}
                  token={accessToken}
                  compact={compactUi}
                  className="h-full w-full resize overflow-hidden"
                />
                <span className="pointer-events-none absolute bottom-1.5 right-1.5 h-5 w-5 rounded-sm border-b-2 border-r-2 border-cyan-300/70 opacity-70" />
              </div>
            ) : (
              <div className="flex h-full min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-[#ded8ce] bg-white/45 text-sm text-[#8a8378] dark:border-zinc-800 dark:bg-zinc-900/45 dark:text-zinc-500">
                当前没有可连接的 Agent workspace。
              </div>
            )}
          </div>
        ) : activeTab === 'files' ? (
          <div className="mx-auto w-full max-w-3xl">
            <div className="mb-3 rounded-xl border border-[#eee9df] bg-white/70 p-3 dark:border-zinc-800 dark:bg-zinc-900/70">
              <p className="text-sm font-semibold text-[#283038] dark:text-zinc-100">Files</p>
              <p className="mt-0.5 text-xs text-[#8a8378] dark:text-zinc-500">
                当前对话中识别到 {conversationFiles.length} 个文件 / 媒体，可直接打开或下载。
              </p>
            </div>

            {conversationFiles.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#ded8ce] bg-white/45 px-4 py-12 text-center text-sm text-[#8a8378] dark:border-zinc-800 dark:bg-zinc-900/45 dark:text-zinc-500">
                当前对话还没有文件。生成 docx / pptx / xlsx / pdf / zip / md / html / mp4 等文件后会显示在这里。
              </div>
            ) : (
              <div className="space-y-2">
                {conversationFiles.map((file) => {
                  const label = senderLabelText(file.senderName, file.senderId)
                  return (
                    <div key={file.key} className="rounded-xl border border-[#eee9df] bg-white/75 p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/75">
                      <FileAttachmentCard url={file.url} filename={file.filename} isMine={file.senderType === 'human'} />
                      <div className="mt-2 flex flex-wrap items-center gap-2 px-1 text-[10px] text-[#9b9488] dark:text-zinc-500">
                        <span className="truncate">{label || file.senderId}</span>
                        <span>·</span>
                        <span>{formatTime(file.timestamp)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ) : groupedMessages.map((group) => (
          <div key={group.label} className="mb-4">
            <div className="mb-3 flex items-center gap-3">
              <div className="h-px flex-1 bg-[#eee9df] dark:bg-zinc-900" />
              <span className="rounded-full border border-[#e7e1d8] bg-[#fbfaf7] px-3 py-1 text-[11px] text-[#8a8378] shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-500">{group.label}</span>
              <div className="h-px flex-1 bg-[#eee9df] dark:bg-zinc-900" />
            </div>

            <div className="overflow-hidden rounded-xl border border-[#eee9df] bg-white/55 dark:border-zinc-900 dark:bg-zinc-950">
              {group.messages.map((message) => {
                const isMine = message.sender_type === 'human'
                const baseLabel = senderLabelText(message.sender_display_name, message.sender_id)
                const label = message.sender_type === 'agent'
                  ? appendRoleLabel(baseLabel, roleLabelForAgent(message.sender_id))
                  : baseLabel

                // Broadcast card view — render as content card instead of chat bubble
                if (isBroadcastTopic) {
                  const body = stripMetaBlocks(message.content || '').body
                  const blocks = parseRichBlocks(body)
                  const firstImage = blocks.find(b => b.kind === 'image')
                  return (
                    <div key={message.message_id} className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4 shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <button
                          type="button"
                          onClick={() => message.sender_type === 'agent'
                            ? openAgentCard(message.sender_id, message.sender_display_name, message.sender_avatar_url)
                            : openHumanCard(message.sender_id, message.sender_display_name, message.sender_avatar_url)}
                          className="h-7 w-7 shrink-0 overflow-hidden rounded-full border text-[10px] font-semibold shadow-sm"
                          style={message.sender_avatar_url ? undefined : avatarTone(message.sender_id || 'agent', message.sender_type)}
                        >
                          {message.sender_avatar_url ? (
                            <img src={message.sender_avatar_url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center">{avatarInitial(message.sender_display_name || message.sender_id, message.sender_type === 'agent' ? 'A' : 'U')}</span>
                          )}
                        </button>
                        <span className="text-xs font-medium text-slate-700 dark:text-zinc-300">{label}</span>
                        <span className="text-[10px] text-slate-400 dark:text-zinc-500 ml-auto">{formatTime(message.timestamp)}</span>
                      </div>
                      {firstImage && (
                        <img src={firstImage.url} alt="" className="w-full max-h-[300px] object-cover rounded-lg mb-3" loading="lazy" />
                      )}
                      <div className="text-sm text-slate-700 dark:text-zinc-300 leading-relaxed rich-content-block">
                        {blocks.filter(b => b.kind !== 'image' || b !== firstImage).map((block, bi) => {
                          switch (block.kind) {
                            case 'html': return <div key={bi} dangerouslySetInnerHTML={{ __html: block.html }} />
                            case 'plain': return <p key={bi} className="whitespace-pre-wrap">{block.text}</p>
                            case 'markdown': return <ReactMarkdown key={bi} remarkPlugins={[remarkGfm]}>{block.text}</ReactMarkdown>
                            case 'image': return <img key={bi} src={block.url} alt="" className="max-h-[200px] rounded-lg my-2" loading="lazy" />
                            default: return null
                          }
                        })}
                      </div>
                    </div>
                  )
                }

                return (
                  <div key={message.message_id} className="group flex justify-start border-b border-[#eee9df] last:border-b-0 transition-colors hover:bg-[#f4f1eb]/70 dark:border-zinc-900 dark:hover:bg-zinc-900/60">
                    <div className="flex w-full max-w-none items-start gap-2.5 px-2 py-2.5">
                      {message.sender_type === 'agent' ? (
                        <button
                          type="button"
                          onClick={() => openAgentCard(message.sender_id, message.sender_display_name, message.sender_avatar_url)}
                          title={`View ${message.sender_display_name || message.sender_id} profile`}
                          className="mt-0.5 h-7 w-7 shrink-0 overflow-hidden rounded-md border border-[#e2ddd4] text-[10px] font-semibold shadow-sm transition hover:scale-[1.02] dark:border-zinc-800"
                          style={message.sender_avatar_url ? undefined : avatarTone(message.sender_id || message.sender_display_name || 'agent', 'agent')}
                        >
                          {message.sender_avatar_url ? (
                            <img src={message.sender_avatar_url} alt={message.sender_display_name || message.sender_id} className="h-full w-full object-cover" />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center">{avatarInitial(message.sender_display_name || message.sender_id, 'A')}</span>
                          )}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openHumanCard(message.sender_id, message.sender_display_name, message.sender_avatar_url)}
                          title={`View ${message.sender_display_name || message.sender_id} profile`}
                          className="mt-0.5 h-7 w-7 shrink-0 overflow-hidden rounded-md border border-[#e2ddd4] text-[10px] font-semibold shadow-sm transition hover:scale-[1.02] dark:border-zinc-800"
                          style={message.sender_avatar_url ? undefined : avatarTone(message.sender_id || message.sender_display_name || 'human', 'human')}
                        >
                          {message.sender_avatar_url ? (
                            <img src={message.sender_avatar_url} alt={message.sender_display_name || message.sender_id} className="h-full w-full object-cover" />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center">{avatarInitial(message.sender_display_name || message.sender_id, 'U')}</span>
                          )}
                        </button>
                      )}

                      <div className="min-w-0 flex-1">
                        {!!label && (
                          <p className="mb-0.5 flex items-center gap-1.5 truncate px-1 text-[12px] font-semibold text-[#2b2f33] dark:text-zinc-100">
                            <span className="truncate">{label}</span>
                            <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${isMine ? 'bg-[#f1eee7] text-[#766f64] dark:bg-zinc-800 dark:text-zinc-400' : 'bg-[#eee8dd] text-[#9a4b00] dark:bg-zinc-800 dark:text-amber-300'}`}>
                              {isMine ? 'You' : 'AI'}
                            </span>
                          </p>
                        )}

                        <div
                          className={`w-full rounded-md px-2 py-1.5 text-[14px] leading-7 ${
                            isMine
                              ? 'bg-[#f4f1eb] text-[#283038] dark:bg-zinc-900 dark:text-zinc-100'
                              : 'bg-transparent text-[#283038] dark:text-zinc-200'
                          }`}
                        >
                          {/* Reply-to quote preview */}
                          {message.reply_to && (() => {
                            const quoted = messages.find(m => m.message_id === message.reply_to)
                            if (!quoted) return null
                            const qSender = senderLabelText(quoted.sender_display_name, quoted.sender_id) || quoted.sender_id
                            const qBody = stripMetaBlocks(quoted.content || '').body
                            const qSummary = summarizeForReply(qBody)
                            return (
                              <div className="mb-2 rounded-lg border-l-2 border-sky-400 bg-black/5 dark:bg-white/5 px-2.5 py-1.5 text-[12px]">
                                <span className="font-medium text-sky-600 dark:text-sky-400">{qSender}</span>
                                <p className="line-clamp-2 text-slate-500 dark:text-zinc-400 mt-0.5">{qSummary.text || '...'}</p>
                              </div>
                            )
                          })()}
                          {(() => {
                            const task = parseTaskContent(message.content || '')
                        if (task.isTask) {
                          const colorMap: Record<string, { border: string; badge: string; badgeText: string; bg: string }> = {
                            run: { border: 'border-l-indigo-500', badge: 'bg-indigo-100 text-indigo-700', badgeText: t('chat.taskMeta'), bg: 'bg-indigo-50/50' },
                            status: { border: 'border-l-amber-500', badge: 'bg-amber-100 text-amber-700', badgeText: t('chat.progress'), bg: 'bg-amber-50/50' },
                            summary: { border: 'border-l-emerald-500', badge: 'bg-emerald-100 text-emerald-700', badgeText: t('chat.result'), bg: 'bg-emerald-50/50' },
                            blocked: { border: 'border-l-red-500', badge: 'bg-red-100 text-red-700', badgeText: t('chat.blocked'), bg: 'bg-red-50/50' },
                            asset: { border: 'border-l-violet-500', badge: 'bg-violet-100 text-violet-700', badgeText: t('chat.asset'), bg: 'bg-violet-50/50' },
                            review: { border: 'border-l-sky-500', badge: 'bg-sky-100 text-sky-700', badgeText: t('chat.review'), bg: 'bg-sky-50/50' },
                            other: { border: 'border-l-slate-400', badge: 'bg-slate-100 text-slate-600', badgeText: 'Update', bg: 'bg-slate-50/50' },
                          }
                          const colors = colorMap[task.kind || 'other']
                          const pct = task.progress ? parseInt(task.progress, 10) : undefined

                          return (
                            <div className="space-y-3">
                              {/* Header card: badge + task ID */}
                              <div className={`flex items-center justify-between gap-2 rounded-lg border border-l-4 ${colors.border} ${colors.bg} border-slate-200 px-3 py-2.5`}>
                                <span className="font-mono text-xs text-slate-500">{task.taskId || 'N/A'}</span>
                                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${colors.badge}`}>{colors.badgeText}</span>
                              </div>

                              {/* Metadata card */}
                              {(task.runner || task.executor || task.sessionId) && (
                                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t('chat.metadata')}</p>
                                  <div className="space-y-1 text-xs text-slate-600">
                                    {task.runner && <div className="flex justify-between"><span className="text-slate-400">{t('chat.runner')}</span><span className="font-medium text-slate-700">{task.runner}</span></div>}
                                    {task.executor && <div className="flex justify-between"><span className="text-slate-400">{t('chat.executor')}</span><span className="font-medium text-slate-700">{task.executor}</span></div>}
                                    {task.sessionId && <div className="flex justify-between"><span className="text-slate-400">{t('chat.session')}</span><span className="font-mono text-slate-600">{task.sessionId.slice(0, 8)}</span></div>}
                                  </div>
                                </div>
                              )}

                              {/* Progress card */}
                              {task.kind === 'status' && (
                                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t('chat.progress')}</p>
                                  {pct !== undefined && (
                                    <div className="mb-2 flex items-center gap-2">
                                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                                        <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
                                      </div>
                                      <span className="text-xs font-medium text-amber-700">{pct}%</span>
                                    </div>
                                  )}
                                  {task.body && <p className="text-[13px] leading-relaxed text-slate-700 whitespace-pre-wrap break-words">{task.body}</p>}
                                </div>
                              )}

                              {/* Result / Blocked / Review card */}
                              {(task.kind === 'summary' || task.kind === 'blocked' || task.kind === 'review') && task.body && (
                                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                    {task.kind === 'summary' ? t('chat.result') : task.kind === 'blocked' ? t('chat.blocked') : t('chat.review')}
                                  </p>
                                  <p className="text-[13px] leading-relaxed text-slate-700 whitespace-pre-wrap break-words">{task.body}</p>
                                </div>
                              )}

                              {/* Asset card */}
                              {task.kind === 'asset' && (
                                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t('chat.asset')}</p>
                                  {task.assetUrl ? (
                                    <a href={task.assetUrl} target="_blank" rel="noreferrer" className="text-sm text-indigo-600 underline break-all hover:text-indigo-800">{task.assetUrl}</a>
                                  ) : (
                                    <p className="text-[13px] break-all text-slate-600">{task.assetPath || task.body || '—'}</p>
                                  )}
                                </div>
                              )}

                              {/* Run body card */}
                              {task.kind === 'run' && task.body && (
                                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t('chat.details')}</p>
                                  <p className="text-[13px] leading-relaxed text-slate-700 whitespace-pre-wrap break-words">{task.body}</p>
                                </div>
                              )}
                            </div>
                          )
                        }

                        // Strip ASCII box-drawing metadata blocks
                        const { body: cleanContent } = stripMetaBlocks(message.content || '')
                        const { body: actionCleanBody, buttons: actionButtons } = extractActionQuickButtons(cleanContent)
                        const blocks = parseRichBlocks(actionCleanBody)

                        // Detect document message pattern: plain text preview + .md/.html file
                        const docFileIdx = blocks.findIndex(
                          (b) => b.kind === 'file' && b.url && (/\.md(\?|$)/i.test(b.url) || /\.html?(\?|$)/i.test(b.url) || /\.md(\?|$)/i.test(b.filename || '') || /\.html?(\?|$)/i.test(b.filename || ''))
                        )
                        const hasPreviewText = docFileIdx > 0 && blocks.slice(0, docFileIdx).some((b) => b.kind === 'plain' && b.text?.trim())
                        if (hasPreviewText && docFileIdx >= 0) {
                          const fileBlock = blocks[docFileIdx] as { kind: 'file'; url: string; filename?: string }
                          const fname = fileBlock.filename || fileBlock.url.split('/').pop() || 'file'
                          const isMdFile = /\.md(\?|$)/i.test(fname) || /\.md(\?|$)/i.test(fileBlock.url)
                          const previewText = blocks
                            .slice(0, docFileIdx)
                            .filter((b): b is { kind: 'plain'; text: string } => b.kind === 'plain' && !!b.text?.trim())
                            .map((b) => b.text.trim())
                            .join('\n')

                          return (
                            <div className="rounded-lg border border-slate-200 overflow-hidden">
                              <div className="bg-white px-4 py-3">
                                <p className="text-[13px] leading-relaxed text-slate-600 line-clamp-4">{previewText}</p>
                              </div>
                              <a
                                href={fileBlock.url}
                                download={fname}
                                className="flex items-center gap-3 border-t border-slate-100 dark:border-zinc-700 bg-slate-50/80 dark:bg-zinc-800/80 px-4 py-2.5 text-sm transition-colors hover:bg-slate-100 dark:hover:bg-zinc-700"
                              >
                                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-bold ${isMdFile ? 'bg-indigo-500/15 text-indigo-500' : 'bg-orange-500/15 text-orange-500'}`}>
                                  {isMdFile ? '.md' : '.html'}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-medium text-slate-700">{fname}</span>
                                </span>
                                <Download className="h-4 w-4 text-slate-400" />
                              </a>
                            </div>
                          )
                        }

                        return (
                          <div className="space-y-3">
                            {blocks.map((block, bi) => {
                              if (block.kind === 'image') {
                                return <ThumbnailImage key={bi} url={block.url} isMine={isMine} />
                              }
                              if (block.kind === 'audio') {
                                return <audio key={bi} controls src={block.url} className="w-full max-w-xs" />
                              }
                              if (block.kind === 'video') {
                                return <VideoAttachmentCard key={bi} url={block.url} filename={block.filename} isMine={isMine} />
                              }
                              if (block.kind === 'file') {
                                const url = block.url
                                const fname = block.filename || url.split('/').pop() || 'file'
                                const isPdf = /\.pdf(\?|$)/i.test(url)
                                if (isPdf) {
                                  return (
                                    <div key={bi} className="space-y-1">
                                      <iframe src={url} title={fname} className="h-80 w-full rounded-lg border border-slate-200" />
                                      <FileAttachmentCard url={url} filename={fname} isMine={isMine} />
                                    </div>
                                  )
                                }
                                return <FileAttachmentCard key={bi} url={url} filename={fname} isMine={isMine} />
                              }
                              if (block.kind === 'markdown') {
                                return (
                                  <div key={bi} className="prose prose-sm max-w-none prose-slate">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{block.text}</ReactMarkdown>
                                  </div>
                                )
                              }
                              if (block.kind === 'link') {
                                const pv = block.url ? previewCache[block.url]?.data : undefined
                                if (pv && (pv.title || pv.description || pv.image)) {
                                  return (
                                    <div key={bi} className="rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 p-2">
                                      {pv.image && (
                                        <a href={block.url} target="_blank" rel="noreferrer" className="mb-2 block">
                                          {/* eslint-disable-next-line @next/next/no-img-element */}
                                          <img
                                            src={pv.image}
                                            alt={pv.title || 'preview'}
                                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                                            className="max-h-52 w-full rounded-md border border-slate-200 object-cover"
                                          />
                                        </a>
                                      )}
                                      <p className="text-xs font-semibold text-slate-700">{pv.title || block.url}</p>
                                      {pv.description && <p className="mt-1 text-xs text-slate-500">{pv.description}</p>}
                                      <a href={block.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[11px] text-indigo-500 underline break-all">{block.url}</a>
                                    </div>
                                  )
                                }
                                return (
                                  <a key={bi} href={block.url} target="_blank" rel="noreferrer" className="block text-indigo-500 underline break-all">{block.url}</a>
                                )
                              }
                              if (block.kind === 'preview') {
                                return (
                                  <div key={bi} className="rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 p-2">
                                    {block.image && (
                                      <a href={block.url} target="_blank" rel="noreferrer" className="mb-2 block">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                          src={block.image}
                                          alt={block.title || 'preview'}
                                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                                          className="max-h-52 w-full rounded-md border border-slate-200 object-cover"
                                        />
                                      </a>
                                    )}
                                    <p className="text-xs font-semibold text-slate-700">{block.title || 'Link Preview'}</p>
                                    {block.desc && <p className="mt-1 text-xs text-slate-500">{block.desc}</p>}
                                    {block.url && <a href={block.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[11px] text-indigo-500 underline break-all">{block.url}</a>}
                                  </div>
                                )
                              }
                              // HTML content (from Tiptap editor)
                              if (block.kind === 'html') {
                                return (
                                  <div
                                    key={bi}
                                    className="prose prose-sm dark:prose-invert max-w-none [&_img]:max-h-64 [&_img]:w-auto [&_img]:max-w-full [&_img]:rounded-lg [&_img]:border [&_img]:border-slate-200"
                                    dangerouslySetInnerHTML={{ __html: block.html }}
                                  />
                                )
                              }
                              // plain text
                              if (!block.text?.trim()) return null
                              return <p key={bi} className="whitespace-pre-wrap break-words leading-relaxed">{block.text}</p>
                            })}

                            {actionButtons.length > 0 && (
                              <div className="flex flex-wrap gap-2 pt-1">
                                {actionButtons.map((btn, idx) => (
                                  <button
                                    key={`${btn.command}-${idx}`}
                                    type="button"
                                    onClick={() => setDraft(btn.command)}
                                    className="rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs text-indigo-600 transition hover:bg-indigo-100"
                                    title={btn.command}
                                  >
                                    {btn.text}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })()}
                      <div className="mt-1 flex items-center gap-2 px-1 text-[10px] leading-none text-[#9b9488] opacity-70 transition group-hover:opacity-100 dark:text-zinc-500">
                        <span>{formatTime(message.timestamp)}</span>
                        <button
                          type="button"
                          onClick={() => quickReplyToMessage(message)}
                          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition hover:bg-black/5 dark:hover:bg-white/10"
                        >
                          <Reply className="h-3 w-3" />
                          回复
                        </button>
                        {isDesktop() && message.sender_type === 'agent' && (
                          <button
                            type="button"
                            onClick={async () => {
                              const content = message.content || ''
                              const timestamp = new Date().toISOString().slice(0, 10)
                              const name = `${message.sender_display_name || 'agent'}-${timestamp}.md`
                              await saveToLocal(content, name)
                            }}
                            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition hover:bg-black/5 dark:hover:bg-white/10"
                            title="Save to Local"
                          >
                            <HardDriveDownload className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {typingIndicatorText && (
        <div className="mx-5 mb-2 flex items-center gap-2 text-xs text-[#8a8378] dark:text-zinc-400">
          <span className="max-w-[220px] truncate">{typingIndicatorText}</span>
          <div className="inline-flex items-center gap-1 rounded-full bg-[#eee8dd] px-2.5 py-1 dark:bg-zinc-800">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#8a8378] [animation-delay:0ms] dark:bg-zinc-500" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#8a8378] [animation-delay:120ms] dark:bg-zinc-500" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#8a8378] [animation-delay:240ms] dark:bg-zinc-500" />
          </div>
        </div>
      )}


      {agentCardOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 px-4" onClick={() => setAgentCardOpen(false)}>
          <div
            className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-100">{t('chat.agentProfile')}</h3>
              <button
                type="button"
                onClick={() => setAgentCardOpen(false)}
                className="rounded px-1.5 py-0.5 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-zinc-800"
              >
                ✕
              </button>
            </div>

            <div className="mb-3 flex items-center gap-3">
              <div className="h-11 w-11 overflow-hidden rounded-full border border-slate-200 bg-slate-100 text-sm font-semibold text-slate-600">
                {agentCard?.avatar_url ? (
                  <img src={agentCard.avatar_url} alt={agentCard.display_name || agentCard.agent_id} className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center">{avatarInitial(agentCard?.display_name || agentCard?.agent_id, 'A')}</span>
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-800 dark:text-zinc-100">{agentCard?.display_name || '-'}</p>
                <p className="truncate text-xs text-slate-500 dark:text-zinc-400">{t('chat.agentId')}: {agentCard?.agent_id || '-'}</p>
              </div>
            </div>

            {agentCardLoading && <p className="mb-3 text-xs text-slate-500 dark:text-zinc-400">Loading...</p>}
            {agentCardError && <p className="mb-3 text-xs text-red-500">{agentCardError}</p>}

            {!!agentCard?.owner_count && (
              <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                <p className="mb-1 font-medium text-slate-700 dark:text-zinc-200">{t('chat.owners')} · {agentCard.owner_count}</p>
                {Array.isArray(agentCard.owner_names) && agentCard.owner_names.length > 0 ? (
                  <p className="line-clamp-2">{agentCard.owner_names.join('、')}</p>
                ) : (
                  <p className="text-slate-400">—</p>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setAgentCardOpen(false)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {t('common.cancel') || 'Cancel'}
              </button>
              <button
                type="button"
                disabled={!onRequestPrivateDiscuss || !agentCard?.agent_id || agentCardRequesting}
                onClick={() => void handleRequestPrivateFromCard()}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {agentCardRequesting ? t('chat.requesting') : t('chat.privateDiscussRequest')}
              </button>
            </div>
          </div>
        </div>
      )}

      {humanCardOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 px-4" onClick={() => setHumanCardOpen(false)}>
          <div
            className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-100">{t('chat.userProfile')}</h3>
              <button
                type="button"
                onClick={() => setHumanCardOpen(false)}
                className="rounded px-1.5 py-0.5 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-zinc-800"
              >
                ✕
              </button>
            </div>

            <div className="mb-3 flex items-center gap-3">
              <div className="h-11 w-11 overflow-hidden rounded-full border border-indigo-200 bg-indigo-100 text-sm font-semibold text-indigo-700">
                {humanCard?.avatar_url ? (
                  <img src={humanCard.avatar_url} alt={humanCard.display_name || humanCard.sender_id} className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center">{avatarInitial(humanCard?.display_name || humanCard?.sender_id, 'U')}</span>
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-800 dark:text-zinc-100">{humanCard?.display_name || '-'}</p>
                <p className="truncate text-xs text-slate-500 dark:text-zinc-400">{t('chat.userSenderId')}: {humanCard?.sender_id || '-'}</p>
              </div>
            </div>

            {humanCardLoading && <p className="mb-3 text-xs text-slate-500 dark:text-zinc-400">Loading...</p>}
            {humanCardError && <p className="mb-3 text-xs text-red-500">{humanCardError}</p>}

            <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              <p className="mb-2 font-medium text-slate-700 dark:text-zinc-200">{t('chat.claimedAgentsInTopic')}</p>
              {Array.isArray(humanCard?.claimed_agents) && humanCard.claimed_agents.length > 0 ? (
                <div className="space-y-1.5">
                  {humanCard.claimed_agents.map((a) => (
                    <div key={a.agent_id} className="flex items-center justify-between gap-2 rounded border border-slate-200 bg-white px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-slate-700 dark:text-zinc-200">{a.display_name}</p>
                        <p className="truncate text-[10px] text-slate-400 dark:text-zinc-500">{a.agent_id}</p>
                      </div>
                      <button
                        type="button"
                        disabled={!onRequestPrivateDiscuss || humanCardRequestingAgentId === a.agent_id}
                        onClick={() => void handleRequestPrivateWithHumanAgent(a.agent_id, a.display_name)}
                        className="shrink-0 rounded bg-indigo-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {humanCardRequestingAgentId === a.agent_id ? t('chat.requesting') : t('chat.privateDiscussRequest')}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400">{t('chat.noClaimedAgentsInTopic')}</p>
              )}
            </div>

            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => setHumanCardOpen(false)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {t('common.cancel') || 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={`border-t border-[#e5e0d8] bg-[#fbfaf7] dark:border-zinc-800 dark:bg-zinc-950 ${compactUi ? 'px-2 pb-2 pt-1' : 'px-4 pb-4 pt-2 sm:px-6'}`}>
        {/* Slash command result display */}
        {slashResult && (
          <div className="mb-2 max-h-20 overflow-auto rounded-md border border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/20 px-2 py-1 text-[11px] text-slate-700 dark:text-zinc-300 whitespace-pre-wrap font-mono">
            {slashResult}
            <button
              className="ml-2 text-[10px] text-slate-400 hover:text-slate-600"
              onClick={() => setSlashResult(null)}
            >
              ✕
            </button>
          </div>
        )}

        {/* Compact control bar: model / think / quick slash */}
        <div className={`flex items-center flex-wrap sm:flex-nowrap ${compactUi ? 'mb-1 gap-1 text-[9px]' : 'mb-2 gap-1.5 text-[10px]'}`}>
          <div className="relative shrink-0" ref={modelMenuRef}>
              <button
                onClick={() => setModelMenuOpen(!modelMenuOpen)}
                className={`flex items-center gap-1 rounded-md border border-[#e5e0d8] bg-white text-[#615d55] transition hover:bg-[#f4f1eb] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 ${compactUi ? 'px-1.5 py-0.5' : 'px-2 py-1'}`}
                title="Select model"
              >
                <span>🤖</span>
                <span className={`truncate font-medium ${compactUi ? 'max-w-[92px]' : 'max-w-[140px]'}`}>{availableModels.find(m => m.id === selectedModel)?.label || selectedModel}</span>
                <span className="text-slate-400">▾</span>
              </button>
              {modelMenuOpen && (
                <div className="absolute bottom-full left-0 mb-1 z-50 min-w-[220px] max-h-[240px] overflow-y-auto rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 py-1 shadow-lg">
                  {availableModels.map(m => (
                    <button
                      key={m.id}
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => {
                        setSelectedModel(m.id)
                        setModelMenuOpen(false)
                      }}
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition ${
                        selectedModel === m.id
                          ? 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 font-medium'
                          : 'text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700'
                      }`}
                    >
                      {selectedModel === m.id && <span className="text-indigo-500">✓</span>}
                      <span>{m.label}</span>
                      {m.supports_reasoning === false && <span className="ml-auto text-[9px] text-slate-400">no reasoning</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

          <div className="relative shrink-0" ref={thinkMenuRef}>
            <button
              onClick={() => setThinkMenuOpen((v) => !v)}
              className={`flex items-center gap-1 rounded-md border border-[#e5e0d8] bg-white text-[#615d55] transition hover:bg-[#f4f1eb] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 ${compactUi ? 'px-1.5 py-0.5' : 'px-2 py-1'}`}
              title="Select think mode"
            >
              <span>🧠</span>
              <span className="font-medium">{REASONING_EFFORTS.find((e) => e.id === reasoningEffort)?.label || reasoningEffort}</span>
              <span className="text-slate-400">▾</span>
            </button>
            {thinkMenuOpen && (
              <div className="absolute bottom-full left-0 mb-1 z-50 min-w-[140px] rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 py-1 shadow-lg">
                {REASONING_EFFORTS.map((e) => (
                  <button
                    key={e.id}
                    onMouseDown={(ev) => ev.preventDefault()}
                    onClick={() => {
                      setReasoningEffort(e.id)
                      setThinkMenuOpen(false)
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition ${
                      reasoningEffort === e.id
                        ? 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 font-medium'
                        : 'text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700'
                    }`}
                  >
                    {reasoningEffort === e.id && <span className="text-indigo-500">✓</span>}
                    <span>{e.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {!compactUi && QUICK_SLASH_ACTIONS.filter((action) => !(isNonTaskDiscussTopic && isModelCommand(action.cmd))).map((action) => (
            <button
              key={action.cmd}
              type="button"
              onClick={() => void sendPassthroughSlash(action.cmd, { silent: true })}
              className="shrink-0 rounded-md border border-[#e5e0d8] bg-white px-2 py-1 text-[#615d55] transition hover:bg-[#f4f1eb] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              title={action.cmd}
            >
              {action.label}
            </button>
          ))}
        </div>

        <div className="relative">
          {/* Slash command autocomplete */}
          {slashOpen && filteredCommands.length > 0 && (
            <div className="absolute bottom-full left-0 mb-1 w-full max-w-md z-40 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 py-1 shadow-lg">
              {filteredCommands.map((c, i) => (
                <button
                  key={c.cmd}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    const mode = c.mode ?? 'local'
                    if (mode === 'local' && LOCAL_NOARG_SLASH_COMMANDS.has(c.cmd)) {
                      setDraft('')
                      setSlashOpen(false)
                      executeSlashCommand(c.cmd, '')
                    } else {
                      setDraft(c.cmd + ' ')
                      setSlashOpen(false)
                    }
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition ${
                    i === slashIndex
                      ? 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400'
                      : 'text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700'
                  }`}
                >
                  <span>{c.icon}</span>
                  <span className="font-medium">{c.cmd}</span>
                  <span className="ml-auto text-[10px] text-slate-400 dark:text-zinc-500">{c.desc}</span>
                </button>
              ))}
            </div>
          )}

          {/* @mention autocomplete */}
          {mentionOpen && filteredMembers.length > 0 && (
            <div className="absolute bottom-full left-0 mb-1 w-full max-w-sm z-40 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 py-1 shadow-lg max-h-48 overflow-y-auto">
              {filteredMembers.map((m, i) => (
                <button
                  key={m.agent_id}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertMention(m)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition ${
                    i === mentionIndex
                      ? 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400'
                      : 'text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700'
                  }`}
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
                    {m.display_name.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{appendRoleLabel(m.display_name, m.roleLabel)}</span>
                  <span className="ml-auto text-[10px] text-slate-400 dark:text-zinc-500 font-mono truncate max-w-[120px]">{m.agent_id.slice(0, 8)}…</span>
                </button>
              ))}
            </div>
          )}

          {replyContext && (
            <div className="mb-2 flex items-center gap-2 rounded-lg border-l-4 border-indigo-400 bg-indigo-50 px-3 py-1.5 text-xs text-indigo-700 dark:border-indigo-500 dark:bg-indigo-900/20 dark:text-indigo-300">
              {replyContext.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={replyContext.imageUrl}
                  alt=""
                  className="h-8 w-8 flex-shrink-0 rounded object-cover"
                />
              )}
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">@{replyContext.sender}</span>
                {replyContext.snippet ? `: ${replyContext.snippet}` : ''}
              </span>
              <button
                type="button"
                onClick={() => setReplyContext(null)}
                className="ml-1 flex-shrink-0 rounded px-1.5 py-0.5 text-[11px] text-indigo-400 hover:bg-indigo-100 hover:text-indigo-600 dark:hover:bg-indigo-800/40"
              >
                ✕
              </button>
            </div>
          )}

          {composerExpanded && (
            <button
              type="button"
              className="fixed inset-0 z-[110] bg-black/35"
              onClick={() => setComposerExpanded(false)}
              aria-label="关闭放大编辑框"
            />
          )}
          <div className={`flex items-center rounded-xl border border-[#ded8ce] bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900 ${compactUi ? 'gap-1.5 px-1.5 py-1' : 'gap-2 px-2 py-2'} ${composerExpanded ? 'fixed inset-x-2 bottom-2 z-[120] rounded-2xl border-2 bg-white dark:bg-zinc-900 shadow-2xl' : ''}`}>
          <div className="relative" ref={attachMenuRef}>
            <button
              type="button"
              onClick={() => setAttachMenuOpen((v) => !v)}
              className={`rounded-lg ${compactUi ? 'p-1.5' : 'p-2'} text-[#8a8378] hover:bg-[#f4f1eb] hover:text-[#1f2328] dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100`}
              title={t('chat.attach')}
            >
              <Paperclip className="h-4 w-4" />
            </button>
            {attachMenuOpen && (
              <div className="absolute bottom-full left-0 mb-1 z-40 w-44 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 py-1 shadow-lg">
                <button type="button" onClick={() => openFilePicker('image/*')} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700">
                  <ImageIcon className="h-3.5 w-3.5" /> {t('chat.image')}
                </button>
                <button type="button" onClick={() => openFilePicker('video/*')} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700">
                  <Video className="h-3.5 w-3.5" /> {t('chat.video')}
                </button>
                <button type="button" onClick={() => openFilePicker('*/*')} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700">
                  <Paperclip className="h-3.5 w-3.5" /> {t('chat.file')}
                </button>
                <button type="button" onClick={insertLocation} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700">
                  <MapPin className="h-3.5 w-3.5" /> {t('chat.location')}
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setComposerExpanded((v) => !v)}
            className={`rounded-lg ${compactUi ? 'p-1.5' : 'p-2'} text-[#8a8378] hover:bg-[#f4f1eb] hover:text-[#1f2328] dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100`}
            title={composerExpanded ? '退出放大' : '放大编辑框'}
          >
            {composerExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>

          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => handleDraftChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={topicType === 'discussion' ? t('chat.discussionHint', { topic: topicName }) : t('chat.topicHint', { topic: topicName })}
            rows={1}
            className={`flex-1 resize-none rounded-xl border border-transparent bg-transparent text-[#1f2328] outline-none placeholder:text-[#aaa298] dark:text-zinc-200 ${compactUi ? 'px-1.5 py-1 text-[13px]' : 'px-2 py-1.5 text-sm'} ${composerExpanded ? 'min-h-[34vh] max-h-[50vh]' : compactUi ? 'max-h-20 min-h-[30px]' : 'max-h-24 min-h-8'}`}
          />
          <button
            onClick={handleSend}
            disabled={sending || uploading || (!draft.trim() && pendingAssets.length === 0) || !currentAgentId}
            className={`flex items-center justify-center rounded-full bg-[#f87500] text-white transition hover:bg-[#dc6900] disabled:cursor-not-allowed disabled:opacity-60 ${compactUi ? 'h-9 w-9' : 'h-10 w-10'}`}
            aria-label={t('chat.send')}
          >
            {sending ? '...' : <Send className={compactUi ? 'h-3.5 w-3.5' : 'h-4 w-4'} />}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept={fileAccept || undefined}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) uploadAssetAndInsert(f)
              e.currentTarget.value = ''
            }}
          />
        </div>
        </div>

        {pendingAssets.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {pendingAssets.map((asset, i) => (
              <div key={`${asset.url}-${i}`} className="flex max-w-[260px] items-center gap-2 rounded-xl border border-[#e4ded4] bg-white/80 px-2.5 py-2 text-xs shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80">
                {asset.kind === 'image' ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={asset.url} alt="" className="h-10 w-10 rounded-lg object-cover" />
                ) : (
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[10px] font-black ${asset.kind === 'video' ? 'bg-cyan-500/15 text-cyan-600' : asset.kind === 'audio' ? 'bg-pink-500/15 text-pink-600' : 'bg-indigo-500/15 text-indigo-600'}`}>
                    {asset.kind === 'video' ? 'VID' : asset.kind === 'audio' ? 'AUD' : 'FILE'}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-[#302b25] dark:text-zinc-200">{asset.filename}</span>
                  <span className="block text-[10px] uppercase tracking-wide text-[#8a8378] dark:text-zinc-500">{asset.kind}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setPendingAssets((prev) => prev.filter((_, idx) => idx !== i))}
                  className="rounded-full px-1.5 py-0.5 text-sm leading-none text-[#8a8378] hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
                  aria-label="Remove attachment"
                >
                  x
                </button>
              </div>
            ))}
          </div>
        )}

        {(uploading || loadingOlder) && (
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
            {uploading && <CircularProgress value={uploadProgress} size={20} strokeWidth={2.5} />}
            <span>{uploading ? `${t('chat.uploading')}${uploadProgress !== undefined ? ` ${uploadProgress}%` : '…'}` : t('chat.loadingHistory')}</span>
          </div>
        )}
      </div>
    </div>
  )
}
