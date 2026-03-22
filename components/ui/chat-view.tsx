'use client'

import { Download, Image as ImageIcon, Mic, Paperclip, Send } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CLIENT_WTT_API_BASE, DEFAULT_WTT_API_ORIGIN } from '@/lib/api/base-url'
import { formatTime, formatDateGroup } from '@/lib/time'
import { CircularProgress } from '@/components/ui/circular-progress'

export interface ChatMessage {
  message_id: string
  sender_id: string
  sender_display_name?: string
  sender_type: 'human' | 'agent'
  content: string
  timestamp: string
  semantic_type?: string
  task_id?: string
  task_status?: string
  task_title?: string
  runner_agent_id?: string
  exec_mode?: string
}

export interface ChatModelConfig {
  model: string
  reasoningEffort: 'off' | 'low' | 'medium' | 'high'
}

const FALLBACK_MODELS = [
  { id: 'openai-codex/gpt-5.3-codex', label: 'GPT-5.3 Codex', supports_reasoning: true },
]

interface ModelOption {
  id: string
  label: string
  supports_reasoning?: boolean
}

type SlashCommandMode = 'local' | 'passthrough'

type SlashCommandDef = {
  cmd: string
  desc: string
  icon: string
  mode?: SlashCommandMode
}

// Slash commands definition
const SLASH_COMMANDS: SlashCommandDef[] = [
  // Local wtt-web helpers
  { cmd: '/new task', desc: 'Create a general task', icon: '📋', mode: 'local' },
  { cmd: '/new code task', desc: 'Create a code task', icon: '💻', mode: 'local' },
  { cmd: '/new research task', desc: 'Create a research task', icon: '🔬', mode: 'local' },
  { cmd: '/new session', desc: 'Start a new chat session', icon: '💬', mode: 'local' },
  { cmd: '/new topic', desc: 'Create a new topic', icon: '📢', mode: 'local' },
  { cmd: '/run', desc: 'Run the current task', icon: '▶️', mode: 'local' },
  { cmd: '/rerun', desc: 'Rerun pipeline', icon: '🔄', mode: 'local' },
  { cmd: '/workers', desc: 'List workers for agent', icon: '👷', mode: 'local' },

  // OpenClaw runtime slash (pass-through to backend)
  { cmd: '/help', desc: 'OpenClaw help', icon: '❓', mode: 'passthrough' },
  { cmd: '/commands', desc: 'List OpenClaw commands', icon: '📚', mode: 'passthrough' },
  { cmd: '/status', desc: 'Session/runtime status card', icon: '📊', mode: 'passthrough' },
  { cmd: '/model', desc: 'Show or switch model', icon: '🤖', mode: 'passthrough' },
  { cmd: '/skill', desc: 'Run skill by name', icon: '🧩', mode: 'passthrough' },
  { cmd: '/subagents', desc: 'List/control subagents', icon: '🛰️', mode: 'passthrough' },
  { cmd: '/acp', desc: 'ACP runtime control', icon: '🛠️', mode: 'passthrough' },
  { cmd: '/queue', desc: 'Queue mode config', icon: '🧵', mode: 'passthrough' },
  { cmd: '/reasoning', desc: 'Reasoning visibility toggle', icon: '🧠', mode: 'passthrough' },
  { cmd: '/verbose', desc: 'Verbose output toggle', icon: '🔍', mode: 'passthrough' },
  { cmd: '/wtt', desc: 'WTT command namespace', icon: '💬', mode: 'passthrough' },
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

export type TaskType = 'code' | 'research' | 'general' | 'pipeline' | null

const DEFAULT_EFFORT_BY_TASK: Record<string, 'off' | 'low' | 'medium' | 'high'> = {
  code: 'high',
  research: 'high',
  general: 'low',
  pipeline: 'low',
}

export interface MentionableAgent {
  agent_id: string
  display_name: string
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
  onSendMessage: (content: string, modelConfig?: ChatModelConfig) => Promise<void>
  onLoadOlder?: () => Promise<void>
  onExport?: (format: 'md' | 'pdf' | 'docx') => void
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
}

type ParsedRich =
  | { kind: 'plain'; text: string }
  | { kind: 'image'; url: string }
  | { kind: 'audio'; url: string }
  | { kind: 'video'; url: string }
  | { kind: 'file'; url: string; filename?: string }
  | { kind: 'link'; url: string }
  | { kind: 'markdown'; text: string }
  | { kind: 'preview'; title?: string; desc?: string; url?: string; image?: string }

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
  return { meta, body: cleaned.trim() }
}

/** Rewrite absolute backend media URLs to go through the Next.js proxy so
 *  HTTPS pages can load HTTP resources without mixed-content blocking. */
function proxyUrl(url: string): string {
  if (url.startsWith(DEFAULT_WTT_API_ORIGIN)) {
    return url.replace(DEFAULT_WTT_API_ORIGIN, CLIENT_WTT_API_BASE)
  }
  // Also handle localhost / 127.0.0.1 backend origins (dev or stored URLs)
  const localBackend = url.match(/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\//)
  if (localBackend) {
    return url.replace(localBackend[0], CLIENT_WTT_API_BASE + '/')
  }
  return url
}

function classifyLine(line: string): ParsedRich {
  const c = line.trim()
  if (!c) return { kind: 'plain', text: '' }
  const imageMatch = c.match(/^!\[([^\]]*)\]\((https?:\/\/[^)]+)\)$/i)
  if (imageMatch) return { kind: 'image', url: proxyUrl(imageMatch[2]) }
  const audioMatch = c.match(/^\[audio(?::([^\]]*))?\]\((https?:\/\/[^)]+)\)$/i)
  if (audioMatch) return { kind: 'audio', url: proxyUrl(audioMatch[2]) }
  const videoMatch = c.match(/^\[video(?::([^\]]*))?\]\((https?:\/\/[^)]+)\)$/i)
  if (videoMatch) return { kind: 'video', url: proxyUrl(videoMatch[2]) }
  const fileMatch = c.match(/^\[file(?::([^\]]*))?\]\((https?:\/\/[^)]+)\)$/i)
  if (fileMatch) return { kind: 'file', url: proxyUrl(fileMatch[2]), filename: fileMatch[1] || undefined }
  const linkMatch = c.match(/^\[link\]\((https?:\/\/[^)]+)\)$/i)
  if (linkMatch) return { kind: 'link', url: proxyUrl(linkMatch[1]) }
  const plainUrl = c.match(/^(https?:\/\/\S+)$/i)
  if (plainUrl) {
    const raw = plainUrl[1]
    const u = raw.toLowerCase()
    if (/\.(mp4|webm|mov)(\?|$)/.test(u)) return { kind: 'video', url: proxyUrl(raw) }
    if (/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/.test(u)) return { kind: 'image', url: proxyUrl(raw) }
    if (/\.(mp3|wav|ogg)(\?|$)/.test(u)) return { kind: 'audio', url: proxyUrl(raw) }
    if (/\.(pdf)(\?|$)/.test(u)) return { kind: 'file', url: proxyUrl(raw), filename: undefined }
    if (/\.(docx|xlsx|csv|zip)(\?|$)/.test(u)) return { kind: 'file', url: proxyUrl(raw), filename: undefined }
    return { kind: 'link', url: raw }
  }
  return { kind: 'plain', text: line }
}

function parseRichBlocks(content: string): ParsedRich[] {
  const c = (content || '').trim()
  if (!c) return [{ kind: 'plain', text: '' }]

  // [preview] block — return as single block
  if (c.startsWith('[preview]')) {
    const title = (c.match(/Title:\s*(.*)/i)?.[1] || '').trim()
    const desc = (c.match(/Desc:\s*(.*)/i)?.[1] || '').trim()
    const url = (c.match(/URL:\s*(https?:\/\/\S+)/i)?.[1] || '').trim()
    const image = proxyUrl((c.match(/Image:\s*(https?:\/\/\S+)/i)?.[1] || '').trim())
    return [{ kind: 'preview', title, desc, url, image }]
  }

  // Detect markdown: has headings, bold, code blocks, tables
  const hasMarkdown = /(?:^#{1,6}\s|^\s*[-*+]\s.+|^\d+\.\s|\*\*.+\*\*|^\|.+\||```[\s\S]*```)/m.test(c)
  if (hasMarkdown && c.length > 30) return [{ kind: 'markdown', text: c }]

  // Split by lines / double newlines and classify each segment
  const segments = c.split(/\n/)
  const blocks: ParsedRich[] = []
  let textBuf: string[] = []

  const flushText = () => {
    if (textBuf.length > 0) {
      blocks.push({ kind: 'plain', text: textBuf.join('\n') })
      textBuf = []
    }
  }

  for (const seg of segments) {
    const classified = classifyLine(seg)
    if (classified.kind === 'plain') {
      textBuf.push(seg)
    } else {
      flushText()
      blocks.push(classified)
    }
  }
  flushText()

  // If only plain text, also extract inline URLs for preview
  if (blocks.length === 1 && blocks[0].kind === 'plain') {
    const urls = (blocks[0].text || '').match(/https?:\/\/\S+/gi)
    if (urls) {
      for (const raw of urls) {
        const u = raw.toLowerCase()
        if (/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/.test(u)) {
          blocks.push({ kind: 'image', url: proxyUrl(raw) })
        } else if (/\.(mp4|webm|mov)(\?|$)/.test(u)) {
          blocks.push({ kind: 'video', url: proxyUrl(raw) })
        } else if (/\.(mp3|wav|ogg)(\?|$)/.test(u)) {
          blocks.push({ kind: 'audio', url: proxyUrl(raw) })
        } else {
          blocks.push({ kind: 'link', url: raw })
        }
      }
    }
  }

  return blocks.length > 0 ? blocks : [{ kind: 'plain', text: content }]
}

function ThumbnailImage({ url, isMine }: { url: string; isMine: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const [failed, setFailed] = useState(false)
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
            src={url}
            alt=""
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
            <img src={url} alt="" className="max-h-[90vh] max-w-[90vw] rounded-lg" />
          )}
        </div>
      )}
    </>
  )
}

function ThumbnailVideo({ url, isMine }: { url: string; isMine: boolean }) {
  const [playing, setPlaying] = useState(false)
  const thumbRef = useRef<HTMLVideoElement>(null)
  if (playing) {
    return (
      <video controls autoPlay className="max-h-72 w-full rounded-lg border border-slate-200">
        <source src={url} />
      </video>
    )
  }
  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      className={`group relative block overflow-hidden rounded-lg border ${isMine ? 'border-indigo-400' : 'border-slate-200'}`}
    >
      <video ref={thumbRef} src={url} preload="metadata" muted className="h-20 w-auto max-w-[160px] object-cover" />
      <div className="absolute inset-0 flex items-center justify-center bg-black/30 transition group-hover:bg-black/50">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90">
          <div className="ml-0.5 h-0 w-0 border-y-[6px] border-l-[10px] border-y-transparent border-l-indigo-500" />
        </div>
      </div>
    </button>
  )
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
}: ChatViewProps) {
  const defaultEffort = (taskType && DEFAULT_EFFORT_BY_TASK[taskType]) || 'off'
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  const [loadingOlder, setLoadingOlder] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<number | undefined>(undefined)
  const [exportOpen, setExportOpen] = useState(false)
  const [availableModels, setAvailableModels] = useState<ModelOption[]>(FALLBACK_MODELS)
  const [selectedModel, setSelectedModel] = useState(FALLBACK_MODELS[0].id)
  const [reasoningEffort, setReasoningEffort] = useState<'off' | 'low' | 'medium' | 'high'>(defaultEffort)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const modelMenuRef = useRef<HTMLDivElement>(null)
  const [isFirstMessage, setIsFirstMessage] = useState(true)
  const lastSentConfigRef = useRef<{ model: string; effort: string } | null>(null)
  const [recentAssets, setRecentAssets] = useState<Array<{ url: string; kind: 'image' | 'audio' | 'file' }>>([])
  const [previewCache, setPreviewCache] = useState<Record<string, CachedPreview>>({})
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

  const filteredMembers = useMemo(() => {
    if (!mentionQuery) return topicMembers
    const q = mentionQuery.toLowerCase()
    return topicMembers.filter(m =>
      m.display_name.toLowerCase().includes(q) || m.agent_id.toLowerCase().includes(q)
    )
  }, [topicMembers, mentionQuery])

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
            setAvailableModels(models)
          }
        }
      } catch {}
    }
    fetchModels()
  }, [])

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

  // Slash command filtering
  const filteredCommands = slashFilter
    ? SLASH_COMMANDS.filter(c => c.cmd.startsWith(slashFilter.toLowerCase()))
    : SLASH_COMMANDS

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
    if (!draft.trim()) return

    const content = draft.trim()

    // Handle slash commands
    if (content.startsWith('/')) {
      setDraft('')
      setSlashOpen(false)
      setSlashResult(null)

      const sorted = [...SLASH_COMMANDS].sort((a, b) => b.cmd.length - a.cmd.length)
      const match = sorted.find(c => content.toLowerCase() === c.cmd || content.toLowerCase().startsWith(c.cmd + ' '))
      const mode = match?.mode ?? 'passthrough'

      if (mode === 'local' && match) {
        const remainder = content.slice(match.cmd.length).trim()
        await executeSlashCommand(match.cmd, remainder)
        return
      }

      // Unknown slash or passthrough slash: forward to backend runtime
      await sendPassthroughSlash(content, { silent: true })
      return
    }

    const modelConfig: ChatModelConfig = { model: selectedModel, reasoningEffort }

    lastSentConfigRef.current = { model: selectedModel, effort: reasoningEffort }
    if (isFirstMessage) setIsFirstMessage(false)

    setSending(true)
    try {
      await onSendMessage(content, modelConfig)
      setDraft('')
    } catch (error) {
      console.error('Failed to send message:', error)
      alert(error instanceof Error ? error.message : 'Failed to send message')
    } finally {
      setSending(false)
    }
  }


  const uploadAssetAndInsert = async (file: File) => {
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
      const kind: 'image' | 'audio' | 'file' = isImage ? 'image' : isAudio ? 'audio' : 'file'
      const token = isImage
        ? `![${file.name}](${asset.url})`
        : isAudio
          ? `[audio:${file.name}](${asset.url})`
          : isVideo
            ? `[video:${file.name}](${asset.url})`
            : `[file:${file.name}](${asset.url})`
      setDraft((prev) => `${prev}${prev ? '\n\n' : ''}${token}`)
      setRecentAssets((prev) => [{ url: asset.url, kind }, ...prev].slice(0, 8))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
      setUploadProgress(undefined)
    }
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
  // These are operational/status messages; only show user input + agent replies
  const STATUS_SEMANTIC_TYPES = new Set(['task_request', 'TASK_REQUEST', 'system', 'SYSTEM', 'notification', 'NOTIFICATION'])
  const visibleMessages = messages.filter(m =>
    !isProgressMessage(m.content) && !STATUS_SEMANTIC_TYPES.has(m.semantic_type || '')
  )

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

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 dark:border-zinc-700 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="truncate text-lg font-semibold dark:text-zinc-100">{topicName}</h2>
            <p className="mt-1 text-xs text-slate-400">
              {messages.length} messages loaded
              {wsConnected && (
                <span className="ml-2 inline-flex items-center gap-1 text-emerald-500">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  live
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {extraHeaderActions}
            <div className="relative">
              <button
                onClick={() => setExportOpen(!exportOpen)}
                onBlur={() => setTimeout(() => setExportOpen(false), 150)}
                className="flex items-center gap-1 rounded border border-slate-200 dark:border-zinc-600 px-2 py-1 text-[11px] text-slate-500 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 hover:text-slate-700 dark:hover:text-zinc-100"
              >
                <Download size={12} /> Export ▾
              </button>
              {exportOpen && (
                <div className="absolute right-0 top-full mt-1 z-30 min-w-[120px] rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 py-1 shadow-lg">
                  {(['md', 'pdf', 'docx'] as const).map(fmt => (
                    <button
                      key={fmt}
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => { onExport?.(fmt); setExportOpen(false) }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 hover:text-slate-800 dark:hover:text-zinc-100"
                    >
                      {fmt === 'md' ? '📝' : fmt === 'pdf' ? '📄' : '📑'} {fmt.toUpperCase()}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-slate-50/50 to-white dark:from-zinc-900/50 dark:to-zinc-950 px-4 py-4 sm:px-5"
      >
        <div className="mb-3 flex justify-center">
          <button
            onClick={handleLoadOlder}
            disabled={!hasOlder || loadingOlder}
            className="rounded-full border border-slate-200 dark:border-zinc-700 bg-slate-50/85 dark:bg-zinc-800/85 px-3 py-1 text-xs text-slate-500 disabled:opacity-40"
          >
            {loadingOlder ? 'Loading history...' : hasOlder ? 'Load older messages' : 'No older messages'}
          </button>
        </div>

        {loading && messages.length === 0 && (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-indigo-500" />
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="pt-20 text-center text-sm text-slate-400">No messages yet. Start the conversation!</div>
        )}

        {groupedMessages.map((group) => (
          <div key={group.label} className="mb-4">
            <div className="mb-3 flex items-center gap-3">
              <div className="h-px flex-1 bg-white/10" />
              <span className="rounded-full bg-slate-50 dark:bg-zinc-800 px-3 py-1 text-[11px] text-slate-400 dark:text-zinc-500">{group.label}</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            <div className="space-y-2">
              {group.messages.map((message) => {
                const isMine = message.sender_type === 'human'

                return (
                  <div key={message.message_id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[82%] rounded-2xl px-5 py-3.5 text-[14px] leading-relaxed tracking-[-0.01em] ${
                        isMine
                          ? 'border border-indigo-200 dark:border-indigo-800/50 bg-indigo-50/80 dark:bg-indigo-950/20 text-slate-800 dark:text-zinc-200'
                          : 'border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-300'
                      } ${isMine ? 'rounded-tr-md' : 'rounded-tl-md'} shadow-sm`}
                    >
                      {!isMine && (() => {
                        let label = message.sender_display_name || message.sender_id || ''
                        // Strip verbose prefixes — just show the name
                        label = label.replace(/^Agent\s+/i, '').replace(/^WTT[\s-]*User\s*/i, '').trim()
                        return label ? <p className="mb-1 text-xs font-semibold text-indigo-600">{label}</p> : null
                      })()}
                      {(() => {
                        const task = parseTaskContent(message.content || '')
                        if (task.isTask) {
                          const colorMap: Record<string, { border: string; badge: string; badgeText: string; bg: string }> = {
                            run: { border: 'border-l-indigo-500', badge: 'bg-indigo-100 text-indigo-700', badgeText: 'Task Meta', bg: 'bg-indigo-50/50' },
                            status: { border: 'border-l-amber-500', badge: 'bg-amber-100 text-amber-700', badgeText: 'Progress', bg: 'bg-amber-50/50' },
                            summary: { border: 'border-l-emerald-500', badge: 'bg-emerald-100 text-emerald-700', badgeText: 'Result', bg: 'bg-emerald-50/50' },
                            blocked: { border: 'border-l-red-500', badge: 'bg-red-100 text-red-700', badgeText: 'Blocked', bg: 'bg-red-50/50' },
                            asset: { border: 'border-l-violet-500', badge: 'bg-violet-100 text-violet-700', badgeText: 'Asset', bg: 'bg-violet-50/50' },
                            review: { border: 'border-l-sky-500', badge: 'bg-sky-100 text-sky-700', badgeText: 'Review', bg: 'bg-sky-50/50' },
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
                                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Metadata</p>
                                  <div className="space-y-1 text-xs text-slate-600">
                                    {task.runner && <div className="flex justify-between"><span className="text-slate-400">Runner</span><span className="font-medium text-slate-700">{task.runner}</span></div>}
                                    {task.executor && <div className="flex justify-between"><span className="text-slate-400">Executor</span><span className="font-medium text-slate-700">{task.executor}</span></div>}
                                    {task.sessionId && <div className="flex justify-between"><span className="text-slate-400">Session</span><span className="font-mono text-slate-600">{task.sessionId.slice(0, 8)}</span></div>}
                                  </div>
                                </div>
                              )}

                              {/* Progress card */}
                              {task.kind === 'status' && (
                                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Progress</p>
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
                                    {task.kind === 'summary' ? 'Result' : task.kind === 'blocked' ? 'Blocked' : 'Review'}
                                  </p>
                                  <p className="text-[13px] leading-relaxed text-slate-700 whitespace-pre-wrap break-words">{task.body}</p>
                                </div>
                              )}

                              {/* Asset card */}
                              {task.kind === 'asset' && (
                                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Asset</p>
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
                                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Details</p>
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
                                return <ThumbnailVideo key={bi} url={block.url} isMine={isMine} />
                              }
                              if (block.kind === 'file') {
                                const url = block.url
                                const fname = block.filename || url.split('/').pop() || 'file'
                                const isPdf = /\.pdf(\?|$)/i.test(url)
                                const isMd = /\.md(\?|$)/i.test(fname) || /\.md(\?|$)/i.test(url)
                                if (isPdf) {
                                  return (
                                    <div key={bi} className="space-y-1">
                                      <iframe src={url} title={fname} className="h-80 w-full rounded-lg border border-slate-200" />
                                      <a href={url} target="_blank" rel="noreferrer" className="inline-block text-xs text-indigo-500 underline">Open PDF</a>
                                    </div>
                                  )
                                }
                                if (isMd) {
                                  return (
                                    <a key={bi} href={url} download={fname} className={`flex items-center gap-3 rounded-lg border p-3 text-sm transition-colors ${isMine ? 'border-indigo-200 dark:border-indigo-800/40 bg-indigo-50/60 dark:bg-indigo-950/20 hover:bg-indigo-100/80 dark:hover:bg-indigo-950/30 text-slate-700 dark:text-zinc-300' : 'border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300'}`}>
                                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-500 text-xs font-bold">.md</span>
                                      <span className="min-w-0 flex-1">
                                        <span className="block truncate font-medium">{fname}</span>
                                        <span className={`block text-xs ${isMine ? 'text-indigo-400' : 'text-slate-400'}`}>Markdown · Click to download</span>
                                      </span>
                                    </a>
                                  )
                                }
                                const isHtml = /\.html?(\?|$)/i.test(fname) || /\.html?(\?|$)/i.test(url)
                                if (isHtml) {
                                  return (
                                    <a key={bi} href={url} download={fname} className={`flex items-center gap-3 rounded-lg border p-3 text-sm transition-colors ${isMine ? 'border-indigo-200 dark:border-indigo-800/40 bg-indigo-50/60 dark:bg-indigo-950/20 hover:bg-indigo-100/80 dark:hover:bg-indigo-950/30 text-slate-700 dark:text-zinc-300' : 'border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300'}`}>
                                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-500/15 text-orange-500 text-xs font-bold">.html</span>
                                      <span className="min-w-0 flex-1">
                                        <span className="block truncate font-medium">{fname}</span>
                                        <span className={`block text-xs ${isMine ? 'text-indigo-400' : 'text-slate-400'}`}>Rich Text · Click to download</span>
                                      </span>
                                    </a>
                                  )
                                }
                                return (
                                  <a key={bi} href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-sm text-indigo-500 hover:bg-slate-100">
                                    <Paperclip className="h-4 w-4 shrink-0" />
                                    <span className="truncate">{fname}</span>
                                  </a>
                                )
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
                                          <img src={pv.image} alt={pv.title || 'preview'} className="max-h-52 w-full rounded-md border border-slate-200 object-cover" />
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
                                        <img src={block.image} alt={block.title || 'preview'} className="max-h-52 w-full rounded-md border border-slate-200 object-cover" />
                                      </a>
                                    )}
                                    <p className="text-xs font-semibold text-slate-700">{block.title || 'Link Preview'}</p>
                                    {block.desc && <p className="mt-1 text-xs text-slate-500">{block.desc}</p>}
                                    {block.url && <a href={block.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[11px] text-indigo-500 underline break-all">{block.url}</a>}
                                  </div>
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
                      <div className={`mt-2 text-[10px] ${isMine ? 'text-indigo-400' : 'text-slate-400'}`}>
                        {formatTime(message.timestamp)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Task status bar — shows current task status from the latest message with task info */}
      {(() => {
        const lastTaskMsg = [...messages].reverse().find(m => m.task_status)
        if (!lastTaskMsg?.task_status) return null
        const status = lastTaskMsg.task_status
        const statusConfig: Record<string, { label: string; color: string; bg: string; icon: string; animate?: boolean }> = {
          todo:    { label: 'Todo',    color: 'text-slate-500',  bg: 'bg-slate-100 dark:bg-zinc-700',   icon: '○' },
          doing:   { label: 'Doing',   color: 'text-amber-600',  bg: 'bg-amber-50 dark:bg-amber-950/30',  icon: '◉', animate: true },
          review:  { label: 'Review',  color: 'text-sky-600',    bg: 'bg-sky-50 dark:bg-sky-950/30',    icon: '◎' },
          done:    { label: 'Done',    color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/30', icon: '●' },
          blocked: { label: 'Blocked', color: 'text-red-500',    bg: 'bg-red-50 dark:bg-red-950/30',    icon: '✕' },
        }
        const cfg = statusConfig[status] || statusConfig.todo
        const steps = ['todo', 'doing', 'review', 'done']
        const currentIdx = steps.indexOf(status)

        return (
          <div className={`mx-3 mb-1 rounded-lg ${cfg.bg} border border-slate-200/60 dark:border-zinc-700/60 px-4 py-2.5`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`text-sm ${cfg.color} ${cfg.animate ? 'animate-pulse' : ''}`}>{cfg.icon}</span>
                <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
                {lastTaskMsg.task_title && (
                  <span className="text-xs text-slate-400 dark:text-zinc-500 truncate max-w-[200px]">· {lastTaskMsg.task_title}</span>
                )}
              </div>
              {lastTaskMsg.runner_agent_id && (
                <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono">{lastTaskMsg.runner_agent_id.slice(0, 12)}</span>
              )}
            </div>
            {/* Step progress dots */}
            {status !== 'blocked' && (
              <div className="flex items-center gap-1 mt-2">
                {steps.map((s, i) => {
                  const isActive = i === currentIdx
                  const isPast = i < currentIdx
                  const stepCfg = statusConfig[s] || statusConfig.todo
                  return (
                    <div key={s} className="flex items-center gap-1 flex-1">
                      <div className={`h-1.5 flex-1 rounded-full transition-all ${
                        isPast || isActive ? 'bg-current ' + stepCfg.color : 'bg-slate-200 dark:bg-zinc-600'
                      } ${isActive && cfg.animate ? 'animate-pulse' : ''}`} />
                      {i < steps.length - 1 && <div className="w-0.5" />}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })()}


      <div className="border-t border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3 sm:p-4">
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
        <div className="mb-2 flex items-center gap-1.5 text-[10px] flex-wrap sm:flex-nowrap">
          <div className="relative shrink-0" ref={modelMenuRef}>
            <button
              onClick={() => setModelMenuOpen(!modelMenuOpen)}
              className="flex items-center gap-1 rounded-md border border-slate-200 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1 text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 transition"
              title="Select model"
            >
              <span>🤖</span>
              <span className="font-medium max-w-[140px] truncate">{availableModels.find(m => m.id === selectedModel)?.label || selectedModel}</span>
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
                      void sendPassthroughSlash(`/model ${m.id}`, { silent: true })
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

          <div className="flex items-center gap-1 rounded-md border border-slate-200 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-1.5 py-1 shrink-0">
            <span className="text-slate-400">think</span>
            {REASONING_EFFORTS.map((e) => (
              <label
                key={e.id}
                className={`flex items-center gap-1 rounded px-1 py-0.5 cursor-pointer transition ${
                  reasoningEffort === e.id
                    ? 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400'
                    : 'text-slate-500 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-700'
                }`}
                title={`/think ${e.id}`}
              >
                <input
                  type="checkbox"
                  checked={reasoningEffort === e.id}
                  onChange={() => {
                    setReasoningEffort(e.id)
                    void sendPassthroughSlash(`/think ${e.id}`, { silent: true })
                  }}
                  className="h-3 w-3 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>{e.label}</span>
              </label>
            ))}
          </div>

          {QUICK_SLASH_ACTIONS.map((action) => (
            <button
              key={action.cmd}
              type="button"
              onClick={() => void sendPassthroughSlash(action.cmd, { silent: true })}
              className="shrink-0 rounded-md border border-slate-200 dark:border-zinc-600 bg-slate-50 dark:bg-zinc-800 px-2 py-1 text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700 transition"
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
                  <span className="font-medium">{m.display_name}</span>
                  <span className="ml-auto text-[10px] text-slate-400 dark:text-zinc-500 font-mono truncate max-w-[120px]">{m.agent_id.slice(0, 8)}…</span>
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-2 py-2">
          <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-lg p-2 text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-700 hover:text-slate-900 dark:hover:text-zinc-100">
            <Paperclip className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-lg p-2 text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-700 hover:text-slate-900 dark:hover:text-zinc-100">
            <ImageIcon className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-lg p-2 text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-700 hover:text-slate-900 dark:hover:text-zinc-100">
            <Mic className="h-4 w-4" />
          </button>

          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => handleDraftChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={topicType === 'discussion' ? `Message ${topicName}… (type @ to mention)` : `Message ${topicName}… (type / for commands)`}
            rows={1}
            className="max-h-28 min-h-10 flex-1 resize-none rounded-xl border border-transparent bg-transparent px-2 py-2 text-sm text-slate-800 dark:text-zinc-200 placeholder:text-slate-400 outline-none"
          />
          <button
            onClick={handleSend}
            disabled={sending || uploading || !draft.trim() || !currentAgentId}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500 text-white transition hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Send"
          >
            {sending ? '...' : <Send className="h-4 w-4" />}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) uploadAssetAndInsert(f)
              e.currentTarget.value = ''
            }}
          />
        </div>
        </div>

        {recentAssets.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {recentAssets.map((a, i) => {
              const token = a.kind === 'image' ? `![](${a.url})` : a.kind === 'audio' ? `[audio](${a.url})` : `[file](${a.url})`
              return (
                <button key={`${a.url}-${i}`} type="button" onClick={() => setDraft((p) => `${p}${p ? '\n\n' : ''}${token}`)} className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] text-indigo-500">
                  Insert {a.kind}
                </button>
              )
            })}
          </div>
        )}

        {(uploading || loadingOlder) && (
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
            {uploading && <CircularProgress value={uploadProgress} size={20} strokeWidth={2.5} />}
            <span>{uploading ? `Uploading${uploadProgress !== undefined ? ` ${uploadProgress}%` : '…'}` : 'Loading history…'}</span>
          </div>
        )}
      </div>
    </div>
  )
}
