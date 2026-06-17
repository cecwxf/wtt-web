'use client'

import { Bell, BookOpen, Download, HardDriveDownload, Image as ImageIcon, MapPin, Maximize2, Minimize2, Paperclip, Reply, Send, SquareTerminal, Video, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CLIENT_WTT_API_BASE, resolveWttUploadUrl } from '@/lib/api/base-url'
import { attachmentMimeType } from '@/lib/media/mime'
import { formatTime, formatDateGroup } from '@/lib/time'
import {
  parseRichBlocks,
  publicMediaUrl,
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
import { SandboxWorkspacePanel } from '@/components/ui/sandbox-workspace-panel'
import { KnowledgeBasePanel } from '@/components/ui/knowledge-base-panel'
import { RichMarkdown } from '@/components/ui/rich-markdown'

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
  is_cloud_sandbox?: boolean
  is_streaming?: boolean
  stream_id?: string
}

export interface ChatSendOptions {
  slashType?: 'agent_passthrough'
  slashCommand?: string
  kbMode?: boolean
  kbTaskId?: string
  kbScope?: 'personal'
  kbContextType?: 'chat' | 'task'
  kbTargetAgentId?: string
  kbQuery?: string
}

export interface ChatRunStatus {
  agentId: string
  agentName: string
  adapter?: string
  model?: string
  wsState?: 'connecting' | 'connected' | 'disconnected'
  statusText?: string
  statusKind?: string
  startedAt: number
  lines: Array<{
    id: string
    text: string
    kind?: string
    ts: number
  }>
}

export interface CloudSandboxBilling {
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

interface CurrentAgentRuntimeInfo {
  adapter?: string
  model?: string
  model_id?: string
  current_model?: string
  reasoning_effort?: string
  thinking_mode?: string
  last_heartbeat_secs_ago?: number
}

const DEFAULT_MODEL_ID = 'deepseek-v4-pro[1m]'
type RuntimeEffort = 'off' | 'low' | 'medium' | 'high'
type RuntimeModelPref = { model: string; effort: RuntimeEffort }

function normalizeRuntimeModelId(raw: unknown): string {
  const value = String(raw || '').trim()
  if (!value) return ''
  if (value === 'deepseek-v4-pro') return DEFAULT_MODEL_ID
  if (value === 'deepseek-v4-pro[1m]') return value
  if (value.startsWith('anthropic/') || value.startsWith('openai-codex/') || value.startsWith('openai/')) return value
  if (value.startsWith('google/') || value.startsWith('gemini-')) return value
  if (value.startsWith('claude-')) return `anthropic/${value}`
  if (value.startsWith('gpt-')) return `openai-codex/${value}`
  return value
}

function normalizeRuntimeEffort(runtime?: CurrentAgentRuntimeInfo): RuntimeEffort | undefined {
  const raw = String(runtime?.reasoning_effort || runtime?.thinking_mode || '').trim().toLowerCase()
  if (!raw) return undefined
  if (['off', 'none', 'disabled', 'false', '0'].includes(raw)) return 'off'
  if (['low', 'minimal'].includes(raw)) return 'low'
  if (['medium', 'normal', 'auto'].includes(raw)) return 'medium'
  if (['high', 'full', 'max', 'maximum', 'xhigh'].includes(raw)) return 'high'
  return undefined
}

function runtimeModelPref(runtime?: CurrentAgentRuntimeInfo): Partial<RuntimeModelPref> | null {
  if (!runtime) return null
  if (typeof runtime.last_heartbeat_secs_ago === 'number' && runtime.last_heartbeat_secs_ago > 90) return null
  const model = normalizeRuntimeModelId(runtime.current_model || runtime.model_id || runtime.model)
  const effort = normalizeRuntimeEffort(runtime)
  if (!model && !effort) return null
  return {
    ...(model ? { model } : {}),
    ...(effort ? { effort } : {}),
  }
}

function normalizeAgentAdapter(runtime?: CurrentAgentRuntimeInfo): 'claude-code' | 'codex' | 'gemini' | 'generic' {
  const raw = String(runtime?.adapter || '').trim().toLowerCase()
  if (raw === 'codex' || raw.includes('codex')) return 'codex'
  if (raw === 'claude-code' || raw === 'claude' || raw.includes('claude')) return 'claude-code'
  if (raw === 'gemini' || raw.includes('gemini')) return 'gemini'
  const model = normalizeRuntimeModelId(runtime?.current_model || runtime?.model_id || runtime?.model).toLowerCase()
  if (model.startsWith('google/') || model.startsWith('gemini-') || model.includes('gemini')) return 'gemini'
  if (model.startsWith('openai-codex/') || model.startsWith('openai/') || model.includes('gpt')) return 'codex'
  if (model.startsWith('anthropic/') || model.includes('claude') || model.includes('deepseek')) return 'claude-code'
  return 'generic'
}

function labelForRuntimeModel(modelId: string, adapter: ReturnType<typeof normalizeAgentAdapter>): string {
  const raw = String(modelId || '').trim()
  if (!raw) return ''
  const short = raw.replace(/^anthropic\//, '').replace(/^openai-codex\//, '').replace(/^openai\//, '').replace(/^google\//, '')
  if (adapter === 'gemini' || short.toLowerCase().includes('gemini')) return `Gemini ${short.replace(/^gemini[-_]?/i, '')}`
  if (adapter === 'codex') return short.toLowerCase().includes('gpt') ? short.toUpperCase() : `Codex ${short}`
  if (adapter === 'claude-code') return short.toLowerCase().includes('claude') ? short : `Claude ${short}`
  return short
}

type SlashCommandMode = 'local' | 'passthrough'
type SlashCommandFamily = 'wtt' | 'codex' | 'claude-code' | 'gemini' | 'generic'

type SlashCommandDef = {
  cmd: string
  desc: string
  icon: string
  mode?: SlashCommandMode
  family?: SlashCommandFamily
}

const LOCAL_SLASH_COMMANDS: SlashCommandDef[] = [
  { cmd: '/new', desc: 'Agent · Start a fresh runtime thread/session', icon: '💬', mode: 'passthrough', family: 'generic' },
  { cmd: '/new task', desc: 'WTT · Create a general task', icon: '📋', mode: 'local', family: 'wtt' },
  { cmd: '/new code task', desc: 'WTT · Create a code task', icon: '💻', mode: 'local', family: 'wtt' },
  { cmd: '/new research task', desc: 'WTT · Create a research task', icon: '🔬', mode: 'local', family: 'wtt' },
  { cmd: '/new session', desc: 'Agent · Start a fresh runtime session', icon: '💬', mode: 'passthrough', family: 'generic' },
  { cmd: '/new topic', desc: 'WTT · Create a new topic', icon: '📢', mode: 'local', family: 'wtt' },
  { cmd: '/run', desc: 'WTT · Run the current task', icon: '▶️', mode: 'local', family: 'wtt' },
  { cmd: '/workers', desc: 'WTT · List workers for agent', icon: '👷', mode: 'local', family: 'wtt' },
  { cmd: '/upgrade', desc: 'WTT · Upgrade agent toolchain', icon: '⬆️', mode: 'passthrough', family: 'wtt' },
]

const WTT_GOAL_COMMAND: SlashCommandDef = {
  cmd: '/goal',
  desc: 'WTT · Start team goal workflow',
  icon: '🎯',
  mode: 'local',
  family: 'wtt',
}

const GENERIC_AGENT_COMMANDS: SlashCommandDef[] = [
  { cmd: '/help', desc: 'Agent · Help', icon: '❓', mode: 'passthrough', family: 'generic' },
  { cmd: '/status', desc: 'Agent · Runtime status', icon: '📊', mode: 'passthrough', family: 'generic' },
  { cmd: '/model', desc: 'Agent · Show/switch model', icon: '🤖', mode: 'passthrough', family: 'generic' },
  { cmd: '/new', desc: 'Agent · New session/thread', icon: '💬', mode: 'passthrough', family: 'generic' },
  { cmd: '/clear', desc: 'Agent · Clear session/thread', icon: '🧹', mode: 'passthrough', family: 'generic' },
  { cmd: '/compact', desc: 'Agent · Compact context', icon: '🗜️', mode: 'passthrough', family: 'generic' },
]

const CODEX_SLASH_COMMANDS: SlashCommandDef[] = [
  { cmd: '/agent', desc: 'Codex · Configure/switch agent', icon: '🧩', mode: 'passthrough', family: 'codex' },
  { cmd: '/apps', desc: 'Codex · Browse apps/connectors', icon: '🔌', mode: 'passthrough', family: 'codex' },
  { cmd: '/plugins', desc: 'Codex · Browse/manage plugins', icon: '🧰', mode: 'passthrough', family: 'codex' },
  { cmd: '/hooks', desc: 'Codex · View/manage hooks', icon: '🪝', mode: 'passthrough', family: 'codex' },
  { cmd: '/help', desc: 'Codex · Help', icon: '❓', mode: 'passthrough', family: 'codex' },
  { cmd: '/status', desc: 'Codex · Session/runtime status', icon: '📊', mode: 'passthrough', family: 'codex' },
  { cmd: '/model', desc: 'Codex · Show/switch model', icon: '🤖', mode: 'passthrough', family: 'codex' },
  { cmd: '/fast', desc: 'Codex · Toggle/check Fast tier', icon: '⚡', mode: 'passthrough', family: 'codex' },
  { cmd: '/plan', desc: 'Codex · Switch to plan mode', icon: '🗺️', mode: 'passthrough', family: 'codex' },
  { cmd: '/goal', desc: 'Codex · Set/view/clear goal', icon: '🎯', mode: 'passthrough', family: 'codex' },
  { cmd: '/personality', desc: 'Codex · Set response style', icon: '🎭', mode: 'passthrough', family: 'codex' },
  { cmd: '/approvals', desc: 'Codex · Approval policy', icon: '✅', mode: 'passthrough', family: 'codex' },
  { cmd: '/permissions', desc: 'Codex · Approval/sandbox permissions', icon: '🛡️', mode: 'passthrough', family: 'codex' },
  { cmd: '/approve', desc: 'Codex · Retry auto-review denial', icon: '☑️', mode: 'passthrough', family: 'codex' },
  { cmd: '/review', desc: 'Codex · Review current changes', icon: '🔎', mode: 'passthrough', family: 'codex' },
  { cmd: '/init', desc: 'Codex · Inspect project and create guidance', icon: '🧭', mode: 'passthrough', family: 'codex' },
  { cmd: '/compact', desc: 'Codex · Compact conversation context', icon: '🗜️', mode: 'passthrough', family: 'codex' },
  { cmd: '/clear', desc: 'Codex · Clear current conversation view', icon: '🧹', mode: 'passthrough', family: 'codex' },
  { cmd: '/new', desc: 'Codex · Start a fresh conversation', icon: '💬', mode: 'passthrough', family: 'codex' },
  { cmd: '/resume', desc: 'Codex · Resume saved conversation', icon: '↩️', mode: 'passthrough', family: 'codex' },
  { cmd: '/fork', desc: 'Codex · Fork current conversation', icon: '🍴', mode: 'passthrough', family: 'codex' },
  { cmd: '/side', desc: 'Codex · Ephemeral side conversation', icon: '🧵', mode: 'passthrough', family: 'codex' },
  { cmd: '/diff', desc: 'Codex · Show pending diff', icon: '📄', mode: 'passthrough', family: 'codex' },
  { cmd: '/mention', desc: 'Codex · Attach file/folder', icon: '📎', mode: 'passthrough', family: 'codex' },
  { cmd: '/mcp', desc: 'Codex · List MCP tools', icon: '🔗', mode: 'passthrough', family: 'codex' },
  { cmd: '/memories', desc: 'Codex · Configure memories', icon: '🧠', mode: 'passthrough', family: 'codex' },
  { cmd: '/skills', desc: 'Codex · Browse/use skills', icon: '🧪', mode: 'passthrough', family: 'codex' },
  { cmd: '/ps', desc: 'Codex · Show background terminals', icon: '🖥️', mode: 'passthrough', family: 'codex' },
  { cmd: '/stop', desc: 'Codex · Stop background terminals', icon: '⏹️', mode: 'passthrough', family: 'codex' },
  { cmd: '/clean', desc: 'Codex · Alias for /stop', icon: '🧽', mode: 'passthrough', family: 'codex' },
  { cmd: '/copy', desc: 'Codex · Copy latest response', icon: '📋', mode: 'passthrough', family: 'codex' },
  { cmd: '/raw', desc: 'Codex · Toggle raw scrollback', icon: '⌨️', mode: 'passthrough', family: 'codex' },
  { cmd: '/debug-config', desc: 'Codex · Config diagnostics', icon: '🩺', mode: 'passthrough', family: 'codex' },
  { cmd: '/statusline', desc: 'Codex · Configure status line', icon: '📟', mode: 'passthrough', family: 'codex' },
  { cmd: '/title', desc: 'Codex · Configure terminal title', icon: '🏷️', mode: 'passthrough', family: 'codex' },
  { cmd: '/theme', desc: 'Codex · Choose theme', icon: '🎨', mode: 'passthrough', family: 'codex' },
  { cmd: '/experimental', desc: 'Codex · Experimental features', icon: '🧬', mode: 'passthrough', family: 'codex' },
  { cmd: '/ide', desc: 'Codex · IDE integration', icon: '🧱', mode: 'passthrough', family: 'codex' },
  { cmd: '/keymap', desc: 'Codex · Keyboard shortcuts', icon: '⌘', mode: 'passthrough', family: 'codex' },
  { cmd: '/vim', desc: 'Codex · Vim mode', icon: '📝', mode: 'passthrough', family: 'codex' },
  { cmd: '/sandbox-add-read-dir', desc: 'Codex · Add read-only sandbox dir', icon: '📂', mode: 'passthrough', family: 'codex' },
  { cmd: '/feedback', desc: 'Codex · Send feedback/diagnostics', icon: '💬', mode: 'passthrough', family: 'codex' },
  { cmd: '/logout', desc: 'Codex · Sign out', icon: '🚪', mode: 'passthrough', family: 'codex' },
  { cmd: '/exit', desc: 'Codex · Exit CLI', icon: '🚪', mode: 'passthrough', family: 'codex' },
  { cmd: '/quit', desc: 'Codex · Exit CLI', icon: '🚪', mode: 'passthrough', family: 'codex' },
]

const CLAUDE_CODE_SLASH_COMMANDS: SlashCommandDef[] = [
  { cmd: '/add-dir', desc: 'Claude Code · Add working directory', icon: '📁', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/agents', desc: 'Claude Code · Manage agents', icon: '🧑‍🚀', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/autofix-pr', desc: 'Claude Code · Auto-fix PR feedback', icon: '🛠️', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/background', desc: 'Claude Code · Run in background', icon: '🌙', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/bg', desc: 'Claude Code · Alias for /background', icon: '🌙', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/batch', desc: 'Claude Code · Parallel batch workflow', icon: '🧬', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/branch', desc: 'Claude Code · Branch conversation', icon: '🌿', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/fork', desc: 'Claude Code · Alias for /branch', icon: '🍴', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/btw', desc: 'Claude Code · Side question', icon: '💭', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/chrome', desc: 'Claude Code · Chrome settings', icon: '🌐', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/claude-api', desc: 'Claude Code · Claude API reference/migration', icon: '📚', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/help', desc: 'Claude Code · Help', icon: '❓', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/status', desc: 'Claude Code · Session status', icon: '📊', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/model', desc: 'Claude Code · Show/switch model', icon: '🤖', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/config', desc: 'Claude Code · Configure runtime', icon: '⚙️', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/permissions', desc: 'Claude Code · Manage permissions', icon: '🛡️', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/init', desc: 'Claude Code · Create/update CLAUDE.md', icon: '🧭', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/review', desc: 'Claude Code · Review code changes', icon: '🔎', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/code-review', desc: 'Claude Code · Review diff with levels/fix', icon: '🧾', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/security-review', desc: 'Claude Code · Security review', icon: '🔐', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/diff', desc: 'Claude Code · Interactive diff', icon: '📄', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/context', desc: 'Claude Code · Context usage', icon: '🧮', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/compact', desc: 'Claude Code · Compact context', icon: '🗜️', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/clear', desc: 'Claude Code · Clear conversation view', icon: '🧹', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/reset', desc: 'Claude Code · Alias for /clear', icon: '🧹', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/new', desc: 'Claude Code · Alias for /clear', icon: '💬', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/memory', desc: 'Claude Code · Manage memory files', icon: '🧠', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/mcp', desc: 'Claude Code · Manage MCP', icon: '🔗', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/cost', desc: 'Claude Code · Show usage/cost', icon: '💳', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/usage', desc: 'Claude Code · Usage/cost stats', icon: '💳', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/stats', desc: 'Claude Code · Alias for /usage', icon: '📈', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/effort', desc: 'Claude Code · Reasoning effort', icon: '🧠', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/plan', desc: 'Claude Code · Enter plan mode', icon: '🗺️', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/goal', desc: 'Claude Code · Set/view/clear goal', icon: '🎯', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/resume', desc: 'Claude Code · Resume conversation', icon: '↩️', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/continue', desc: 'Claude Code · Alias for /resume', icon: '↩️', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/rewind', desc: 'Claude Code · Rewind checkpoint', icon: '⏪', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/checkpoint', desc: 'Claude Code · Alias for /rewind', icon: '⏪', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/undo', desc: 'Claude Code · Alias for /rewind', icon: '↩️', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/tasks', desc: 'Claude Code · Background tasks', icon: '📋', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/bashes', desc: 'Claude Code · Alias for /tasks', icon: '🖥️', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/run', desc: 'Claude Code · Run/drive app', icon: '▶️', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/verify', desc: 'Claude Code · Verify app change', icon: '✅', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/simplify', desc: 'Claude Code · Cleanup review', icon: '🧹', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/skills', desc: 'Claude Code · List/manage skills', icon: '🧪', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/reload-skills', desc: 'Claude Code · Reload skills', icon: '🔄', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/plugin', desc: 'Claude Code · Manage plugins', icon: '🧰', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/reload-plugins', desc: 'Claude Code · Reload plugins', icon: '🔄', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/hooks', desc: 'Claude Code · Hooks', icon: '🪝', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/doctor', desc: 'Claude Code · Diagnose install/settings', icon: '🩺', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/debug', desc: 'Claude Code · Debug logging', icon: '🐞', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/export', desc: 'Claude Code · Export conversation', icon: '📤', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/copy', desc: 'Claude Code · Copy response', icon: '📋', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/feedback', desc: 'Claude Code · Feedback/bug/share', icon: '💬', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/bug', desc: 'Claude Code · Alias for /feedback', icon: '🐞', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/share', desc: 'Claude Code · Alias for /feedback', icon: '📤', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/login', desc: 'Claude Code · Sign in', icon: '🔐', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/logout', desc: 'Claude Code · Sign out', icon: '🚪', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/theme', desc: 'Claude Code · Theme', icon: '🎨', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/statusline', desc: 'Claude Code · Status line', icon: '📟', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/terminal-setup', desc: 'Claude Code · Terminal keybindings', icon: '⌨️', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/tui', desc: 'Claude Code · Terminal UI renderer', icon: '🖥️', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/vim', desc: 'Claude Code · Vim mode legacy', icon: '📝', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/exit', desc: 'Claude Code · Exit/detach', icon: '🚪', mode: 'passthrough', family: 'claude-code' },
  { cmd: '/quit', desc: 'Claude Code · Alias for /exit', icon: '🚪', mode: 'passthrough', family: 'claude-code' },
]

const GEMINI_SLASH_COMMANDS: SlashCommandDef[] = [
  { cmd: '/about', desc: 'Gemini · Version info', icon: 'ℹ️', mode: 'passthrough', family: 'gemini' },
  { cmd: '/agents', desc: 'Gemini · Manage subagents', icon: '🧑‍🚀', mode: 'passthrough', family: 'gemini' },
  { cmd: '/auth', desc: 'Gemini · Change auth method', icon: '🔐', mode: 'passthrough', family: 'gemini' },
  { cmd: '/bug', desc: 'Gemini · File issue', icon: '🐞', mode: 'passthrough', family: 'gemini' },
  { cmd: '/chat', desc: 'Gemini · Alias for /resume', icon: '💬', mode: 'passthrough', family: 'gemini' },
  { cmd: '/clear', desc: 'Gemini · Clear visible history', icon: '🧹', mode: 'passthrough', family: 'gemini' },
  { cmd: '/commands', desc: 'Gemini · Custom commands', icon: '⌘', mode: 'passthrough', family: 'gemini' },
  { cmd: '/compress', desc: 'Gemini · Compress context', icon: '🗜️', mode: 'passthrough', family: 'gemini' },
  { cmd: '/copy', desc: 'Gemini · Copy last output', icon: '📋', mode: 'passthrough', family: 'gemini' },
  { cmd: '/directory', desc: 'Gemini · Workspace directories', icon: '📁', mode: 'passthrough', family: 'gemini' },
  { cmd: '/dir', desc: 'Gemini · Alias for /directory', icon: '📁', mode: 'passthrough', family: 'gemini' },
  { cmd: '/docs', desc: 'Gemini · Open docs', icon: '📚', mode: 'passthrough', family: 'gemini' },
  { cmd: '/editor', desc: 'Gemini · Editor integration', icon: '✏️', mode: 'passthrough', family: 'gemini' },
  { cmd: '/extensions', desc: 'Gemini · Manage extensions', icon: '🧩', mode: 'passthrough', family: 'gemini' },
  { cmd: '/help', desc: 'Gemini · Help', icon: '❓', mode: 'passthrough', family: 'gemini' },
  { cmd: '/?', desc: 'Gemini · Alias for /help', icon: '❓', mode: 'passthrough', family: 'gemini' },
  { cmd: '/hooks', desc: 'Gemini · Manage hooks', icon: '🪝', mode: 'passthrough', family: 'gemini' },
  { cmd: '/ide', desc: 'Gemini · IDE integration', icon: '🧱', mode: 'passthrough', family: 'gemini' },
  { cmd: '/init', desc: 'Gemini · Create/update GEMINI.md', icon: '🧭', mode: 'passthrough', family: 'gemini' },
  { cmd: '/mcp', desc: 'Gemini · Manage MCP servers', icon: '🔗', mode: 'passthrough', family: 'gemini' },
  { cmd: '/memory', desc: 'Gemini · Inspect/refresh memory', icon: '🧠', mode: 'passthrough', family: 'gemini' },
  { cmd: '/model', desc: 'Gemini · Model configuration', icon: '🤖', mode: 'passthrough', family: 'gemini' },
  { cmd: '/permissions', desc: 'Gemini · Trust and permissions', icon: '🛡️', mode: 'passthrough', family: 'gemini' },
  { cmd: '/plan', desc: 'Gemini · Plan mode', icon: '🗺️', mode: 'passthrough', family: 'gemini' },
  { cmd: '/policies', desc: 'Gemini · Active policies', icon: '📜', mode: 'passthrough', family: 'gemini' },
  { cmd: '/privacy', desc: 'Gemini · Privacy notice', icon: '🔏', mode: 'passthrough', family: 'gemini' },
  { cmd: '/quit', desc: 'Gemini · Exit CLI', icon: '🚪', mode: 'passthrough', family: 'gemini' },
  { cmd: '/exit', desc: 'Gemini · Alias for /quit', icon: '🚪', mode: 'passthrough', family: 'gemini' },
  { cmd: '/restore', desc: 'Gemini · Restore checkpoint', icon: '⏪', mode: 'passthrough', family: 'gemini' },
  { cmd: '/rewind', desc: 'Gemini · Rewind history', icon: '↩️', mode: 'passthrough', family: 'gemini' },
  { cmd: '/resume', desc: 'Gemini · Resume/manage sessions', icon: '↩️', mode: 'passthrough', family: 'gemini' },
  { cmd: '/settings', desc: 'Gemini · Settings editor', icon: '⚙️', mode: 'passthrough', family: 'gemini' },
  { cmd: '/shells', desc: 'Gemini · Background shells', icon: '🖥️', mode: 'passthrough', family: 'gemini' },
  { cmd: '/bashes', desc: 'Gemini · Alias for /shells', icon: '🖥️', mode: 'passthrough', family: 'gemini' },
  { cmd: '/setup-github', desc: 'Gemini · GitHub Actions setup', icon: '🐙', mode: 'passthrough', family: 'gemini' },
  { cmd: '/skills', desc: 'Gemini · Manage skills', icon: '🧪', mode: 'passthrough', family: 'gemini' },
  { cmd: '/stats', desc: 'Gemini · Session stats', icon: '📈', mode: 'passthrough', family: 'gemini' },
  { cmd: '/terminal-setup', desc: 'Gemini · Multiline keybindings', icon: '⌨️', mode: 'passthrough', family: 'gemini' },
  { cmd: '/theme', desc: 'Gemini · Theme', icon: '🎨', mode: 'passthrough', family: 'gemini' },
  { cmd: '/tools', desc: 'Gemini · Available tools', icon: '🛠️', mode: 'passthrough', family: 'gemini' },
  { cmd: '/upgrade', desc: 'Gemini · Upgrade Code Assist', icon: '⬆️', mode: 'passthrough', family: 'gemini' },
  { cmd: '/vim', desc: 'Gemini · Vim mode', icon: '📝', mode: 'passthrough', family: 'gemini' },
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

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024

function MarkdownWithMath({ children, className }: { children: string; className?: string }) {
  return <RichMarkdown className={className}>{children}</RichMarkdown>
}

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
  onSendMessage: (content: string, replyTo?: string, options?: ChatSendOptions) => Promise<void>
  onLoadOlder?: () => Promise<void>
  onExport?: (format: 'md') => void
  hasOlder?: boolean
  loading?: boolean
  emptyState?: React.ReactNode
  extraHeaderActions?: React.ReactNode
  isTaskTopic?: boolean
  taskType?: TaskType
  wsConnected?: boolean
  accessToken?: string
  onTaskCreated?: () => void
  onTopicCreated?: () => void
  topicMembers?: MentionableAgent[]
  topicType?: string
  runStatus?: ChatRunStatus | null
  onRequestPrivateDiscuss?: (targetAgentId: string, targetDisplayName?: string) => Promise<void> | void
  compactUi?: boolean
  autoFocusNonce?: number
  currentAgentRuntime?: CurrentAgentRuntimeInfo
  currentAgentIsCloud?: boolean
  cloudSandboxBilling?: CloudSandboxBilling | null
  workspaceAgentName?: string
  workspaceWorkdir?: string
  agentRoleLabelMap?: Record<string, string>
  canUseKnowledgeMode?: boolean
  knowledgeTaskId?: string
  knowledgeTargetAgentId?: string
  knowledgeContextType?: 'chat' | 'task'
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
  data?: UrlPreview
  fetchedAt: number
  failedAt?: number
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

type ChatPanelTab = 'chat' | 'files' | 'terminal' | 'workspace' | 'knowledge'

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

type CloudSandboxPreview = {
  key: string
  url: string
  title?: string
  snapshotUrl?: string
  artifactUrl?: string
  messageId: string
  senderId: string
  senderName?: string
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
  const mediaUrl = proxyMediaUrl(url)
  const fallback = filenameFromFileUrl(url)
  const fname = filename || fallback || 'video'
  return (
    <div className={`overflow-hidden rounded-xl border text-sm shadow-sm ${isMine ? 'border-indigo-200 dark:border-indigo-800/40 bg-indigo-50/60 dark:bg-indigo-950/20' : 'border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800'}`}>
      <video controls preload="metadata" playsInline className="max-h-80 w-full bg-black">
        <source src={mediaUrl} />
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
          <a href={mediaUrl} target="_blank" rel="noreferrer" className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 hover:border-cyan-300 hover:text-cyan-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
            打开
          </a>
          <a href={mediaUrl} download={fname} className="rounded-md bg-cyan-600 px-2 py-1 text-xs font-semibold text-white hover:bg-cyan-500">
            下载
          </a>
        </span>
      </div>
    </div>
  )
}

function fileExt(nameOrUrl?: string): string {
  const clean = decodeURIComponent(String(nameOrUrl || '').split('?')[0].split('#')[0])
  return (clean.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase()
}

function fileMeta(nameOrUrl: string, fallbackUrl?: string) {
  const ext = fileExt(nameOrUrl) || fileExt(fallbackUrl)
  const label = ext ? ext.toUpperCase() : 'FILE'
  const icon = ext === 'pdf' ? 'PDF'
    : ['doc', 'docx'].includes(ext) ? 'DOC'
    : ['ppt', 'pptx'].includes(ext) ? 'PPT'
    : ['xls', 'xlsx', 'csv'].includes(ext) ? 'XLS'
    : ['mp4', 'webm', 'mov', 'm4v'].includes(ext) ? 'VID'
    : ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ext) ? 'AUD'
    : ['zip', 'tar', 'gz'].includes(ext) ? 'ZIP'
    : ['md', 'markdown', 'mdx'].includes(ext) ? 'MD'
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

function FileAttachmentCard({ url, filename, isMine, onPreview }: { url: string; filename?: string; isMine: boolean; onPreview?: () => void }) {
  const fileUrl = proxyMediaUrl(url)
  const fallback = url.split('/').pop() || 'file'
  const fname = filename || fallback
  const meta = fileMeta(fname || url, url)
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
        {onPreview && (
          <button
            type="button"
            onClick={onPreview}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 hover:border-amber-300 hover:text-amber-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
          >
            预览
          </button>
        )}
        <a href={fileUrl} target="_blank" rel="noreferrer" className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
          打开
        </a>
        <a href={fileUrl} download={fname} className="rounded-md bg-indigo-600 px-2 py-1 text-xs font-semibold text-white hover:bg-indigo-500">
          下载
        </a>
      </span>
    </div>
  )
}

const CHAT_FILE_EXT_RE = /\.(pdf|docx?|pptx?|xlsx?|csv|zip|tar|gz|md|markdown|mdx|txt|html?|mp4|webm|mov|m4v|mp3|wav|ogg|m4a|aac|flac)(?:[?#].*)?$/i

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
  if (blocks.some((block) => block.kind === 'cloud_preview')) return files
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

function previewExt(file: Pick<ConversationFile, 'url' | 'filename'>): string {
  return fileMeta(file.filename || '', file.url).ext
}

const TEXT_PREVIEW_EXT_LIST = ['md', 'markdown', 'mdx', 'txt', 'csv']
const HTML_PREVIEW_EXT_LIST = ['html', 'htm']
const OFFICE_PREVIEW_EXT_LIST = ['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx']
const TEXT_PREVIEW_EXTS = new Set(TEXT_PREVIEW_EXT_LIST)
const HTML_PREVIEW_EXTS = new Set(HTML_PREVIEW_EXT_LIST)
const OFFICE_PREVIEW_EXTS = new Set(OFFICE_PREVIEW_EXT_LIST)
const PREVIEWABLE_FILE_EXTS = new Set([
  'pdf',
  ...TEXT_PREVIEW_EXT_LIST,
  ...HTML_PREVIEW_EXT_LIST,
  ...OFFICE_PREVIEW_EXT_LIST,
])

function canPreviewConversationFile(file: Pick<ConversationFile, 'url' | 'filename'>): boolean {
  return PREVIEWABLE_FILE_EXTS.has(previewExt(file))
}

function absoluteBrowserUrl(url: string): string {
  if (typeof window === 'undefined') return url
  try {
    return new URL(url, window.location.origin).toString()
  } catch {
    return url
  }
}

function DocumentSidePreview({ file, onClose }: { file: ConversationFile; onClose: () => void }) {
  const [text, setText] = useState('')
  const [loadingText, setLoadingText] = useState(false)
  const [textError, setTextError] = useState('')
  const ext = previewExt(file)
  const fname = file.filename || filenameFromFileUrl(file.url)
  const label = senderLabelText(file.senderName, file.senderId) || file.senderId
  const isTextLike = TEXT_PREVIEW_EXTS.has(ext)
  const previewUrl = proxyMediaUrl(file.url)
  const officeUrl = publicMediaUrl(file.url)
  const absoluteOfficeUrl = absoluteBrowserUrl(officeUrl)
  const canUseOfficeViewer = /^https?:\/\//i.test(absoluteOfficeUrl) && OFFICE_PREVIEW_EXTS.has(ext)

  useEffect(() => {
    let cancelled = false
    setText('')
    setTextError('')
    if (!isTextLike) return
    setLoadingText(true)
    fetch(previewUrl, { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`)
        return res.text()
      })
      .then((value) => {
        if (!cancelled) setText(value)
      })
      .catch((err) => {
        if (!cancelled) setTextError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoadingText(false)
      })
    return () => {
      cancelled = true
    }
  }, [isTextLike, previewUrl])

  return (
    <aside className="hidden w-[340px] shrink-0 border-l border-[#e5e0d8] bg-white/90 dark:border-zinc-800 dark:bg-zinc-950/95 md:flex lg:w-[380px] xl:w-[440px]">
      <div className="flex min-h-0 w-full flex-col">
        <div className="border-b border-[#eee9df] px-4 py-3 dark:border-zinc-800">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#9b9488] dark:text-zinc-500">Preview</p>
              <h3 className="mt-1 truncate text-sm font-semibold text-[#1f2328] dark:text-zinc-100">{fname}</h3>
              <p className="mt-0.5 truncate text-[11px] text-[#8a8378] dark:text-zinc-500">
                {fileMeta(fname, file.url).label} · {label} · {formatTime(file.timestamp)}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-[#8a8378] transition hover:bg-[#f4f1eb] hover:text-[#1f2328] dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              aria-label="Close preview"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <a href={previewUrl} target="_blank" rel="noreferrer" className="rounded-md border border-[#ded8ce] bg-[#fbfaf7] px-2.5 py-1 text-xs font-semibold text-[#615d55] transition hover:border-indigo-300 hover:text-indigo-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
              打开
            </a>
            <a href={previewUrl} download={fname} className="rounded-md bg-[#1f2328] px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-[#343a40] dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-300">
              下载
            </a>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden p-3">
          {ext === 'pdf' && (
            <iframe src={previewUrl} title={fname} className="h-full w-full rounded-xl border border-[#eee9df] bg-white dark:border-zinc-800 dark:bg-zinc-900" />
          )}
          {HTML_PREVIEW_EXTS.has(ext) && (
            <iframe src={previewUrl} title={fname} sandbox="allow-same-origin allow-scripts allow-forms allow-popups" className="h-full w-full rounded-xl border border-[#eee9df] bg-white dark:border-zinc-800 dark:bg-zinc-900" />
          )}
          {isTextLike && (
            <div className="h-full overflow-auto rounded-xl border border-[#eee9df] bg-[#fbfaf7] p-4 text-sm leading-6 text-[#283038] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
              {loadingText ? (
                <p className="text-xs text-[#8a8378] dark:text-zinc-500">加载预览中...</p>
              ) : textError ? (
                <p className="text-xs text-red-500">预览加载失败：{textError}</p>
              ) : ['md', 'markdown', 'mdx'].includes(ext) ? (
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <MarkdownWithMath>{text}</MarkdownWithMath>
                </div>
              ) : (
                <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5">{text}</pre>
              )}
            </div>
          )}
          {OFFICE_PREVIEW_EXTS.has(ext) && (
            canUseOfficeViewer ? (
              <iframe
                src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(absoluteOfficeUrl)}`}
                title={fname}
                className="h-full w-full rounded-xl border border-[#eee9df] bg-white dark:border-zinc-800 dark:bg-zinc-900"
              />
            ) : (
              <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-[#ded8ce] bg-[#fbfaf7] p-6 text-center dark:border-zinc-800 dark:bg-zinc-900">
                <div>
                  <div className={`mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl text-xs font-black ${fileMeta(fname, file.url).tone}`}>
                    {fileMeta(fname, file.url).icon}
                  </div>
                  <p className="text-sm font-semibold text-[#283038] dark:text-zinc-100">{fname}</p>
                  <p className="mt-1 text-xs text-[#8a8378] dark:text-zinc-500">Office 文件需要公网可访问 URL 才能内嵌预览，可先打开或下载查看。</p>
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </aside>
  )
}

function CloudSandboxPreviewCard({
  preview,
  onClose,
}: {
  preview: CloudSandboxPreview
  onClose: () => void
}) {
  const { url, title } = preview
  const displayTitle = title || 'Preview'
  const [error, setError] = useState('')

  const handleOpen = useCallback(() => {
    setError('')
    const popup = window.open(url, '_blank', 'noopener,noreferrer')
    if (!popup) {
      setError('浏览器阻止了新窗口，请允许弹窗后重试。')
    }
  }, [url])

  const handleClose = useCallback(() => {
    onClose()
  }, [onClose])

  return (
    <div className="overflow-hidden rounded-xl border border-sky-200/80 bg-white shadow-[0_8px_22px_rgba(14,116,144,0.10)] ring-1 ring-sky-100/60 dark:border-sky-500/25 dark:bg-zinc-950 dark:shadow-black/25 dark:ring-sky-500/10">
      <div className="relative overflow-hidden bg-[linear-gradient(135deg,#ecfeff_0%,#f8fafc_58%,#ecfdf5_100%)] px-2.5 py-1.5 dark:bg-[linear-gradient(135deg,rgba(8,47,73,.62),rgba(24,24,27,.95)_62%,rgba(6,78,59,.36))]">
        <div className="pointer-events-none absolute right-3 top-1 h-8 w-8 rounded-full bg-white/45 blur-xl dark:bg-sky-300/10" />
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-sky-700 shadow-sm dark:bg-zinc-900/80 dark:text-sky-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,.85)]" />
              Cloud Preview
            </span>
            <p className="truncate text-[11px] font-bold text-slate-900 dark:text-zinc-50">{displayTitle}</p>
          </div>
          <div className="relative z-10 flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={handleOpen}
              className="rounded-md bg-slate-950 px-2 py-0.5 text-[10px] font-bold text-white transition hover:bg-slate-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
            >
              打开
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-md p-0.5 text-sky-800 transition hover:bg-white/70 hover:text-red-500 dark:text-sky-200 dark:hover:bg-zinc-900"
              aria-label="Close cloud preview"
              title="隐藏预览卡片"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
      {error && (
        <div className="border-t border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}
    </div>
  )
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
  if (base.includes(`(${role})`) || base.includes(`（${role}）`)) return base
  return `${base}(${role})`
}

function runStatusKindLabel(kind?: string): string {
  const k = String(kind || '').trim()
  if (!k) return '运行'
  if (k === 'queued') return '排队'
  if (k === 'running') return '运行'
  if (k === 'command') return '命令'
  if (k === 'tool') return '工具'
  if (k === 'web_search') return '搜索'
  if (k === 'response') return '回复'
  if (k === 'session') return '会话'
  if (k === 'error') return '错误'
  if (k === 'artifact_upload') return '文件'
  return k.replace(/_/g, ' ')
}

function runStatusAdapterLabel(adapter?: string): string {
  const value = String(adapter || '').trim()
  if (value === 'claude-code') return 'Claude Code'
  if (value === 'codex') return 'Codex'
  return value
}

function cloudAgentQuotaText(billing?: CloudSandboxBilling | null) {
  const usage = billing?.cloud_agent_usage
  const limits = billing?.entitlement?.limits
  const monthlyLimit = Number(limits?.monthly_limit || 500)
  const windowLimit = Number(limits?.window_limit || 30)
  const monthlyCount = Number(usage?.monthly_count || 0)
  const blockedUntilRaw = String(usage?.blocked_until || '').trim()
  const blockedUntilMs = blockedUntilRaw ? new Date(blockedUntilRaw).getTime() : Number.NaN
  const blockExpired = Number.isFinite(blockedUntilMs) && blockedUntilMs <= Date.now()
  const windowCount = blockExpired ? 0 : Number(usage?.window_count || 0)
  const blockedUntil = blockExpired ? '' : blockedUntilRaw
  const resetText = blockedUntil ? `限制中，恢复时间 ${blockedUntil}` : '连续窗口 3 小时后重置'
  return `Cloud Agent 按 request 额度计算：本月 ${monthlyCount}/${monthlyLimit} 次，连续 ${windowCount}/${windowLimit} 次，${resetText}`
}

function AgentRunStatusCard({ status, floating = false }: { status: ChatRunStatus; floating?: boolean }) {
  const lines = status.lines.slice(floating ? -6 : -10)
  const adapter = runStatusAdapterLabel(status.adapter)
  const subtitle = [adapter, status.model].filter(Boolean).join(' · ')
  const shellClass = floating
    ? 'rounded-xl border border-[#d8cdbb] bg-[#fbf7ef]/95 p-2 shadow-lg shadow-[#6b4e2e]/10 backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95 dark:shadow-black/25'
    : 'mx-4 mb-2 rounded-2xl border border-[#d8cdbb] bg-[#fbf7ef]/95 p-3 shadow-lg shadow-[#6b4e2e]/10 backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95 dark:shadow-black/25 sm:mx-6'

  return (
    <div className={shellClass}>
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-[#b78343] border-t-transparent dark:border-amber-300 dark:border-t-transparent" />
            <span className="truncate text-[11px] font-semibold text-[#3f352a] dark:text-zinc-100">
              {status.agentName} 正在执行
            </span>
          </div>
          {subtitle && (
            <div className="mt-0.5 truncate pl-5 text-[10px] text-[#8a7a65] dark:text-zinc-400">{subtitle}</div>
          )}
        </div>
        {status.statusKind && (
          <span className="shrink-0 rounded-full border border-[#dbc6a5] bg-white/65 px-1.5 py-0.5 text-[10px] font-medium text-[#8b6736] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {runStatusKindLabel(status.statusKind)}
          </span>
        )}
      </div>

      <div className={`${floating ? 'max-h-24' : 'max-h-32'} space-y-1 overflow-y-auto pr-1`}>
        {lines.map((line) => (
          <div key={line.id} className="grid grid-cols-[48px_minmax(0,1fr)] items-start gap-1.5 text-[10.5px] leading-4">
            <span className="rounded-md bg-[#efe4d2] px-1.5 py-0.5 text-center font-medium text-[#7c613d] dark:bg-zinc-800 dark:text-zinc-400">
              {runStatusKindLabel(line.kind)}
            </span>
            <span className="min-w-0 whitespace-pre-wrap break-words font-mono text-[#4a4035] dark:text-zinc-300" title={line.text}>
              {line.text}
            </span>
          </div>
        ))}
        {!lines.length && status.statusText && (
          <div className="truncate font-mono text-[11px] text-[#4a4035] dark:text-zinc-300" title={status.statusText}>
            {status.statusText}
          </div>
        )}
      </div>
    </div>
  )
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
  emptyState,
  extraHeaderActions,
  isTaskTopic = false,
  taskType = null,
  wsConnected = false,
  accessToken,
  onTaskCreated,
  onTopicCreated,
  topicMembers = [],
  topicType,
  runStatus = null,
  onRequestPrivateDiscuss,
  compactUi = false,
  autoFocusNonce,
  currentAgentRuntime,
  currentAgentIsCloud = false,
  cloudSandboxBilling = null,
  workspaceAgentName,
  workspaceWorkdir,
  agentRoleLabelMap = {},
  canUseKnowledgeMode = false,
  knowledgeTaskId,
  knowledgeTargetAgentId,
  knowledgeContextType,
}: ChatViewProps) {
  const { t } = useI18n()
  const defaultEffort = (taskType && DEFAULT_EFFORT_BY_TASK[taskType]) || 'off'
  const [draft, setDraft] = useState('')
  const [activeTab, setActiveTab] = useState<ChatPanelTab>('chat')
  const [kbMode, setKbMode] = useState(false)
  const [terminalMaximized, setTerminalMaximized] = useState(false)
  const [manualPreviewFile, setManualPreviewFile] = useState<ConversationFile | null>(null)
  const [closedPreviewKeys, setClosedPreviewKeys] = useState<Set<string>>(() => new Set())
  const [closedCloudPreviewKeys, setClosedCloudPreviewKeys] = useState<Set<string>>(() => new Set())
  const lastAutoPreviewKeyRef = useRef<string | null>(null)
  const [sending, setSending] = useState(false)
  const [composerExpanded, setComposerExpanded] = useState(false)
  const [replyContext, setReplyContext] = useState<{ sender: string; snippet: string; imageUrl?: string; replyToId?: string } | null>(null)

  const [loadingOlder, setLoadingOlder] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<number | undefined>(undefined)
  const [exportOpen, setExportOpen] = useState(false)
  const attachMenuRef = useRef<HTMLDivElement>(null)
  const [isFirstMessage, setIsFirstMessage] = useState(true)
  const [pendingAssets, setPendingAssets] = useState<PendingAsset[]>([])
  const [previewCache, setPreviewCache] = useState<Record<string, CachedPreview>>({})
  const previewCacheRef = useRef<Record<string, CachedPreview>>({})
  const previewInflightRef = useRef<Set<string>>(new Set())
  const [attachMenuOpen, setAttachMenuOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const prevMsgCountRef = useRef(0)
  const initialScrollDoneRef = useRef(false)
  const canUseWorkspaceTab = Boolean(currentAgentIsCloud && currentAgentId)
  const canUseKnowledgeTab = Boolean(accessToken)
  const utilityTabActive = activeTab === 'terminal'
    || (activeTab === 'workspace' && canUseWorkspaceTab)
    || activeTab === 'knowledge'

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
  // Daily cross-user @mention quota (read-only display).
  const [mentionQuota, setMentionQuota] = useState<{ limit: number; used: number; remaining: number } | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!accessToken) { setMentionQuota(null); return }
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(`${CLIENT_WTT_API_BASE}/me/mention-quota`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) setMentionQuota({ limit: data.limit, used: data.used, remaining: data.remaining })
      } catch {}
    }
    load()
    // refresh when the mention dropdown opens (so it reflects the latest count)
    return () => { cancelled = true }
  }, [accessToken, mentionOpen])


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

  const currentRuntimePref = runtimeModelPref(currentAgentRuntime)
  const activeAgentAdapter = normalizeAgentAdapter(currentAgentRuntime)
  const activeAgentLabel = activeAgentAdapter === 'codex' ? 'Codex'
    : activeAgentAdapter === 'claude-code' ? 'Claude Code'
      : activeAgentAdapter === 'gemini' ? 'Gemini'
      : 'Agent'
  const displayModelId = normalizeRuntimeModelId(
    runStatus?.model
      || currentRuntimePref?.model
      || currentAgentRuntime?.current_model
      || currentAgentRuntime?.model_id
      || currentAgentRuntime?.model,
  )
  const displayModelLabel = displayModelId
    ? labelForRuntimeModel(displayModelId, activeAgentAdapter)
    : 'Runtime default'
  const displayEffort = currentRuntimePref?.effort || normalizeRuntimeEffort(currentAgentRuntime) || defaultEffort || 'off'
  const displayEffortLabel = REASONING_EFFORTS.find((e) => e.id === displayEffort)?.label || displayEffort
  const showCloudBilling = Boolean(currentAgentIsCloud)
  const cloudBillingText = cloudAgentQuotaText(cloudSandboxBilling)

  const mentionCandidates = useMemo(() => {
    const shouldShowAll = topicType === 'discussion' || topicType === 'collaborative'
    const allOption: MentionableAgent[] = shouldShowAll
      ? [{ agent_id: '__all__', display_name: 'all', roleLabel: '所有成员' }]
      : []
    return [...allOption, ...topicMembers]
  }, [topicMembers, topicType])

  const filteredMembers = useMemo(() => {
    if (!mentionQuery) return mentionCandidates
    const q = mentionQuery.toLowerCase()
    return mentionCandidates.filter(m =>
      m.display_name.toLowerCase().includes(q) ||
      m.agent_id.toLowerCase().includes(q) ||
      String(m.roleLabel || '').toLowerCase().includes(q)
    )
  }, [mentionCandidates, mentionQuery])

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
  const isCollaborativeTopic = topicType === 'collaborative'
  const isBroadcastTopic = topicType === 'broadcast'
  const isNonTaskDiscussTopic = (isDiscussTopic || isCollaborativeTopic) && !isTaskTopic
  const isModelCommand = useCallback((cmd: string) => {
    const c = cmd.trim().toLowerCase()
    return c === '/model' || c.startsWith('/model ') || c === '/models' || c.startsWith('/models ')
  }, [])

  const availableSlashCommands = useMemo(() => {
    const runtimeCommands = activeAgentAdapter === 'codex'
      ? CODEX_SLASH_COMMANDS
      : activeAgentAdapter === 'claude-code'
        ? CLAUDE_CODE_SLASH_COMMANDS
        : activeAgentAdapter === 'gemini'
          ? GEMINI_SLASH_COMMANDS
          : GENERIC_AGENT_COMMANDS
    const deduped = new Map<string, SlashCommandDef>()
    for (const command of [...LOCAL_SLASH_COMMANDS, ...runtimeCommands]) {
      deduped.set(command.cmd, command)
    }
    if (isNonTaskDiscussTopic) {
      deduped.set(WTT_GOAL_COMMAND.cmd, WTT_GOAL_COMMAND)
    }
    const commands = Array.from(deduped.values())
    if (!isNonTaskDiscussTopic) return commands
    // In non-task discuss topics, model switching must be blocked to avoid all
    // agents reacting to the same slash command.
    return commands.filter((c) => !isModelCommand(c.cmd))
  }, [activeAgentAdapter, isNonTaskDiscussTopic, isModelCommand])

  // Slash command filtering
  const filteredCommands = slashFilter
    ? availableSlashCommands.filter(c => c.cmd.startsWith(slashFilter.toLowerCase()))
    : availableSlashCommands

  const quickSlashActions = useMemo(() => {
    const commands = activeAgentAdapter === 'codex'
      ? [
          { label: 'Codex Status', cmd: '/status' },
          { label: 'Approvals', cmd: '/approvals' },
          { label: 'Review', cmd: '/review' },
          { label: 'Compact', cmd: '/compact' },
        ]
      : activeAgentAdapter === 'claude-code'
        ? [
            { label: 'Claude Status', cmd: '/status' },
            { label: 'Init', cmd: '/init' },
            { label: 'Review', cmd: '/review' },
            { label: 'Compact', cmd: '/compact' },
          ]
        : activeAgentAdapter === 'gemini'
          ? [
              { label: 'Gemini Stats', cmd: '/stats' },
              { label: 'Init', cmd: '/init' },
              { label: 'Tools', cmd: '/tools' },
              { label: 'Compress', cmd: '/compress' },
            ]
        : [
            { label: 'Status', cmd: '/status' },
            { label: 'Help', cmd: '/help' },
            { label: 'Model', cmd: '/model' },
            { label: 'Compact', cmd: '/compact' },
          ]
    return commands.filter((action) => !(isNonTaskDiscussTopic && isModelCommand(action.cmd)))
  }, [activeAgentAdapter, isModelCommand, isNonTaskDiscussTopic])

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
    if (textarea && mentionCandidates.length > 0) {
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
  }, [mentionCandidates])

  const insertMention = useCallback((member: MentionableAgent) => {
    const textarea = textareaRef.current
    if (!textarea || mentionStartPos < 0) return
    const before = draft.slice(0, mentionStartPos)
    const after = draft.slice(textarea.selectionStart)
    const mention = member.agent_id === '__all__' ? '@all ' : `@${member.display_name} `
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
        case '/goal': {
          const goal = args.trim()
          if (!isNonTaskDiscussTopic || !topicId) {
            setSlashResult('⚠️ /goal is only available in group/team topics.')
            return
          }
          if (!goal) {
            setSlashResult('⚠️ Usage: /goal <what the team should accomplish>')
            return
          }
          const goalHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
          if (accessToken) goalHeaders['Authorization'] = `Bearer ${accessToken}`
          const res = await fetch(`${apiBase}/topics/${topicId}/goals`, {
            method: 'POST',
            headers: goalHeaders,
            body: JSON.stringify({ goal }),
          })
          if (res.ok) {
            const data = await res.json()
            const shortId = String(data.goal_id || '').slice(0, 8)
            setSlashResult(`🎯 Goal workflow started${shortId ? ` (${shortId})` : ''}.`)
          } else {
            const detail = await res.text()
            setSlashResult(`❌ Failed to start goal: ${detail}`)
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
  }, [currentAgentId, propTaskId, accessToken, onTaskCreated, onTopicCreated, isNonTaskDiscussTopic, topicId])

  const sendPassthroughSlash = useCallback(async (command: string, opts?: { silent?: boolean }) => {
    setSending(true)
    try {
      await onSendMessage(command, undefined, {
        slashType: 'agent_passthrough',
        slashCommand: command.trim().split(/\s+/, 1)[0] || command.trim(),
      })
      setSlashResult(opts?.silent ? `↗ Sent to Agent: ${command}` : `✅ Sent ${command}`)
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
          if (typeof maybeCached.fetchedAt === 'number' && (maybeCached.data || maybeCached.failedAt)) {
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
    previewCacheRef.current = previewCache
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

    if (isFirstMessage) setIsFirstMessage(false)

    setSending(true)
    try {
      const kbOptions = kbMode && canUseKnowledgeMode && knowledgeTaskId ? {
        kbMode: true,
        kbTaskId: knowledgeTaskId,
        kbScope: 'personal' as const,
        kbContextType: knowledgeContextType || (isTaskTopic ? 'task' as const : 'chat' as const),
        kbTargetAgentId: knowledgeTargetAgentId || currentAgentId,
        kbQuery: content,
      } : undefined
      await onSendMessage(content, replyContext?.replyToId, kbOptions)
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
      const mimeType = attachmentMimeType(file)
      const sign = await fetch(`${CLIENT_WTT_API_BASE}/media/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, mime_type: mimeType, size: file.size }),
      })
      if (!sign.ok) throw new Error(`Sign failed: ${await sign.text()}`)
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
        xhr.addEventListener('error', () => reject(new Error('Upload network failed')))
        xhr.open('PUT', resolveWttUploadUrl(signed.upload_url))
        xhr.setRequestHeader('Content-Type', mimeType)
        xhr.send(file)
      })

      setUploadProgress(95)
      const commit = await fetch(`${CLIENT_WTT_API_BASE}/media/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upload_token: signed.upload_token }),
      })
      if (!commit.ok) throw new Error(`Commit failed: ${await commit.text()}`)
      const asset = await commit.json()
      setUploadProgress(100)

      const isImage = mimeType.startsWith('image/')
      const isAudio = mimeType.startsWith('audio/')
      const isVideo = mimeType.startsWith('video/')
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

  const openFilePicker = (accept = '') => {
    setAttachMenuOpen(false)
    const input = fileInputRef.current
    if (!input) return
    input.accept = accept
    input.click()
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
          const exact = filteredCommands.find((c) => draft.trim().toLowerCase() === c.cmd.toLowerCase())
          const command = exact || selected
          const mode = command.mode ?? 'local'
          if (mode === 'passthrough' && exact) {
            setDraft('')
            setSlashOpen(false)
            void sendPassthroughSlash(draft.trim(), { silent: true })
          } else if (mode === 'local' && LOCAL_NOARG_SLASH_COMMANDS.has(command.cmd)) {
            setDraft('')
            setSlashOpen(false)
            executeSlashCommand(command.cmd, '')
          } else {
            setDraft(command.cmd + ' ')
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
    const FAIL_TTL_MS = 60 * 60 * 1000
    const now = Date.now()
    const urls = new Set<string>()
    const cache = previewCacheRef.current
    for (const m of messages) {
      const blocks = parseRichBlocks(m.content || '')
      for (const block of blocks) {
        const candidateUrl = block.kind === 'link' ? block.url : undefined
        if (candidateUrl) {
          const cached = cache[candidateUrl]
          const isFresh = cached?.data && now - cached.fetchedAt < TTL_MS
          const failedRecently = cached?.failedAt && now - cached.failedAt < FAIL_TTL_MS
          const inflight = previewInflightRef.current.has(candidateUrl)
          if (!isFresh && !failedRecently && !inflight) urls.add(candidateUrl)
        }
      }
    }
    if (urls.size === 0) return

    let cancelled = false
    ;(async () => {
      for (const url of Array.from(urls)) {
        previewInflightRef.current.add(url)
        try {
          const r = await fetch(`${CLIENT_WTT_API_BASE}/preview/url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
          })
          if (!r.ok) {
            if (!cancelled) {
              setPreviewCache((prev) => ({
                ...prev,
                [url]: { fetchedAt: Date.now(), failedAt: Date.now() },
              }))
            }
            continue
          }
          const j = await r.json()
          if (!cancelled) {
            setPreviewCache((prev) => ({ ...prev, [url]: { data: j, fetchedAt: Date.now() } }))
          }
        } catch {
          if (!cancelled) {
            setPreviewCache((prev) => ({
              ...prev,
              [url]: { fetchedAt: Date.now(), failedAt: Date.now() },
            }))
          }
        } finally {
          previewInflightRef.current.delete(url)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [messages])

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
    for (const message of messages) {
      for (const file of extractConversationFiles(message)) {
        const key = file.url
        if (seen.has(key)) continue
        seen.add(key)
        out.push(file)
      }
    }
    return out
  }, [messages])

  const latestAgentPreviewFile = useMemo(() => {
    for (let i = conversationFiles.length - 1; i >= 0; i--) {
      const file = conversationFiles[i]
      if (file.senderType === 'agent' && canPreviewConversationFile(file)) return file
    }
    return null
  }, [conversationFiles])

  const latestAutoSidePreview = useMemo(() => {
    const file = latestAgentPreviewFile && !closedPreviewKeys.has(latestAgentPreviewFile.key) ? latestAgentPreviewFile : null
    if (file) return { kind: 'file' as const, file }
    return null
  }, [closedPreviewKeys, latestAgentPreviewFile])

  const sidePreviewFile = manualPreviewFile || (
    latestAutoSidePreview?.kind === 'file' ? latestAutoSidePreview.file : null
  )

  useEffect(() => {
    if (!latestAutoSidePreview) return
    const key = latestAutoSidePreview.file.key
    if (lastAutoPreviewKeyRef.current === key) return
    lastAutoPreviewKeyRef.current = key
    setManualPreviewFile(null)
    if (activeTab === 'terminal' || activeTab === 'workspace' || activeTab === 'knowledge') setActiveTab('chat')
  }, [activeTab, latestAutoSidePreview])

  useEffect(() => {
    if (activeTab !== 'terminal') setTerminalMaximized(false)
  }, [activeTab])

  useEffect(() => {
    if (activeTab === 'workspace' && !canUseWorkspaceTab) {
      setActiveTab('chat')
    }
  }, [activeTab, canUseWorkspaceTab])

  useEffect(() => {
    if (activeTab === 'knowledge' && !canUseKnowledgeTab) {
      setActiveTab('chat')
    }
  }, [activeTab, canUseKnowledgeTab])

  useEffect(() => {
    if (!canUseKnowledgeMode && kbMode) {
      setKbMode(false)
    }
  }, [canUseKnowledgeMode, kbMode])

  useEffect(() => {
    if (!manualPreviewFile) return
    if (!conversationFiles.some((file) => file.key === manualPreviewFile.key)) {
      setManualPreviewFile(null)
    }
  }, [conversationFiles, manualPreviewFile])

  const openFilePreview = useCallback((file: ConversationFile) => {
    setClosedPreviewKeys((prev) => {
      if (!prev.has(file.key)) return prev
      const next = new Set(prev)
      next.delete(file.key)
      return next
    })
    setManualPreviewFile(file)
  }, [])

  const closeFilePreview = useCallback(() => {
    const messageId = sidePreviewFile?.messageId
    const keysToClose = new Set<string>()
    if (sidePreviewFile) keysToClose.add(sidePreviewFile.key)
    if (messageId) {
      for (const file of conversationFiles) {
        if (file.messageId === messageId) keysToClose.add(file.key)
      }
    }
    if (keysToClose.size > 0) {
      setClosedPreviewKeys((prev) => {
        const next = new Set(prev)
        Array.from(keysToClose).forEach((key) => next.add(key))
        return next
      })
    }
    setManualPreviewFile(null)
  }, [conversationFiles, sidePreviewFile])

  const closeCloudPreviewCard = useCallback((preview: CloudSandboxPreview) => {
    setClosedCloudPreviewKeys((prev) => {
      if (prev.has(preview.key)) return prev
      const next = new Set(prev)
      next.add(preview.key)
      return next
    })
  }, [])

  return (
    <div
      className={`wtt-chat-view relative flex h-full flex-col ${dragOver ? 'ring-2 ring-inset ring-indigo-400' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <style>{`
        @keyframes wtt-cloud-billing-marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
      {dragOver && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-indigo-50/60 dark:bg-indigo-900/30">
          <div className="rounded-xl bg-white dark:bg-zinc-800 px-6 py-4 shadow-lg border-2 border-dashed border-indigo-400">
            <p className="text-sm font-medium text-indigo-600 dark:text-indigo-300">📄 Drop files to analyze with Agent</p>
          </div>
        </div>
      )}
      <div className={`border-b border-[#e5e0d8] bg-[#fbfaf7] dark:border-zinc-800 dark:bg-zinc-950 ${compactUi ? 'px-2 pt-1' : 'px-4 pt-2'}`}>
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
                  onClick={() => setActiveTab('terminal')}
                  className={`relative -mb-px inline-flex items-center gap-1.5 border-b-2 font-semibold transition ${compactUi ? 'pb-1 text-xs' : 'pb-2 text-sm'} ${
                    activeTab === 'terminal'
                      ? 'border-[#1f2328] text-[#1f2328] dark:border-zinc-100 dark:text-zinc-100'
                      : 'border-transparent text-[#8a8378] hover:border-[#cfc6b8] hover:text-[#1f2328] dark:text-zinc-500 dark:hover:border-zinc-600 dark:hover:text-zinc-200'
                  }`}
                >
                  <SquareTerminal className={compactUi ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
                  <span>Terminal</span>
                  <span className={`h-1.5 w-1.5 rounded-full ${
                    currentAgentId ? 'bg-emerald-400' : 'bg-slate-300 dark:bg-zinc-700'
                  }`} />
                </button>
                {canUseWorkspaceTab && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('workspace')}
                    className={`relative -mb-px inline-flex items-center gap-1.5 border-b-2 font-semibold transition ${compactUi ? 'pb-1 text-xs' : 'pb-2 text-sm'} ${
                      activeTab === 'workspace'
                        ? 'border-[#1f2328] text-[#1f2328] dark:border-zinc-100 dark:text-zinc-100'
                        : 'border-transparent text-[#8a8378] hover:border-[#cfc6b8] hover:text-[#1f2328] dark:text-zinc-500 dark:hover:border-zinc-600 dark:hover:text-zinc-200'
                    }`}
                  >
                    <span>Workspace</span>
                  </button>
                )}
                {canUseKnowledgeTab && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('knowledge')}
                    className={`relative -mb-px inline-flex items-center gap-1.5 border-b-2 font-semibold transition ${compactUi ? 'pb-1 text-xs' : 'pb-2 text-sm'} ${
                      activeTab === 'knowledge'
                        ? 'border-[#1f2328] text-[#1f2328] dark:border-zinc-100 dark:text-zinc-100'
                        : 'border-transparent text-[#8a8378] hover:border-[#cfc6b8] hover:text-[#1f2328] dark:text-zinc-500 dark:hover:border-zinc-600 dark:hover:text-zinc-200'
                    }`}
                  >
                    <BookOpen className={compactUi ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
                    <span>知识库</span>
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {showCloudBilling && (
              <div
                className="hidden max-w-[220px] items-center gap-1 overflow-hidden rounded-full border border-emerald-200 bg-emerald-50/75 px-2 py-1 text-[10px] font-semibold leading-none text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300 sm:flex"
                title={cloudBillingText}
              >
                <Bell className="h-3 w-3 shrink-0" />
                <span className="min-w-0 overflow-hidden">
                  <span
                    className="inline-flex min-w-max gap-8 whitespace-nowrap"
                    style={{ animation: 'wtt-cloud-billing-marquee 12s linear infinite' }}
                  >
                    <span>{cloudBillingText}</span>
                    <span aria-hidden="true">{cloudBillingText}</span>
                  </span>
                </span>
              </div>
            )}
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

      <div className="min-h-0 flex flex-1 overflow-hidden bg-[#fbfaf7] dark:bg-zinc-950">
        <div className="relative min-w-0 flex flex-1 flex-col">
      <div
        ref={scrollRef}
        className={`min-h-0 flex-1 bg-[#fbfaf7] dark:bg-zinc-950 ${
          utilityTabActive
            ? 'overflow-hidden px-3 py-3 sm:px-4'
            : 'overflow-y-auto px-4 py-3 sm:px-6'
        }`}
      >
        {!utilityTabActive && (
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
          emptyState ? (
            <div className={compactUi ? 'px-2 py-4' : 'px-4 py-6'}>{emptyState}</div>
          ) : (
            <div className="pt-20 text-center text-sm text-slate-400">{t('chat.noMessages')}</div>
          )
        )}

        {activeTab === 'terminal' ? (
          <div className={`${terminalMaximized ? 'fixed inset-2 z-[120] rounded-2xl border border-[#2b3a35] bg-[#0b0f14] p-2 shadow-2xl' : 'flex h-full min-h-[360px] w-full flex-col'}`}>
            {currentAgentId && accessToken ? (
              <div className={`${terminalMaximized ? 'relative h-full min-h-0 w-full overflow-hidden rounded-2xl' : 'relative min-h-[320px] flex-1 resize overflow-hidden rounded-2xl'}`}>
                <AgentTerminalPane
                  agentId={currentAgentId}
                  agentName={workspaceAgentName || currentAgentId}
                  workdir={workspaceWorkdir}
                  token={accessToken}
                  compact={compactUi}
                  className="h-full w-full resize overflow-hidden"
                  actions={
                    <button
                      type="button"
                      onClick={() => setTerminalMaximized((value) => !value)}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-black text-slate-400 transition hover:bg-white/10 hover:text-white"
                      title={terminalMaximized ? 'Restore terminal size' : 'Maximize terminal'}
                    >
                      {terminalMaximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                      {terminalMaximized ? 'Restore' : 'Max'}
                    </button>
                  }
                />
                {!terminalMaximized && <span className="pointer-events-none absolute bottom-1.5 right-1.5 h-5 w-5 rounded-sm border-b-2 border-r-2 border-cyan-300/70 opacity-70" />}
              </div>
            ) : (
              <div className="flex h-full min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-[#ded8ce] bg-white/45 text-sm text-[#8a8378] dark:border-zinc-800 dark:bg-zinc-900/45 dark:text-zinc-500">
                当前没有可连接的 Agent workspace。
              </div>
            )}
          </div>
        ) : activeTab === 'workspace' && canUseWorkspaceTab ? (
          <SandboxWorkspacePanel agentId={currentAgentId} accessToken={accessToken} />
        ) : activeTab === 'knowledge' ? (
          <KnowledgeBasePanel accessToken={accessToken} compact={compactUi} />
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
                      <FileAttachmentCard
                        url={file.url}
                        filename={file.filename}
                        isMine={file.senderType === 'human'}
                        onPreview={canPreviewConversationFile(file) ? () => openFilePreview(file) : undefined}
                      />
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
                            case 'markdown': return <MarkdownWithMath key={bi}>{block.text}</MarkdownWithMath>
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
                          className={`wtt-message-bubble w-full rounded-lg px-2.5 py-1.5 ${
                            isMine
                              ? 'wtt-message-bubble--mine'
                              : 'wtt-message-bubble--agent'
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
                          const fileUrl = proxyMediaUrl(fileBlock.url)
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
                                href={fileUrl}
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
                                const proxiedUrl = proxyMediaUrl(url)
                                const fname = block.filename || url.split('/').pop() || 'file'
                                const previewFile: ConversationFile = {
                                  key: `${message.message_id}:${url}`,
                                  url,
                                  filename: fname,
                                  messageId: message.message_id,
                                  senderId: message.sender_id,
                                  senderName: message.sender_display_name,
                                  senderType: message.sender_type,
                                  timestamp: message.timestamp,
                                }
                                const previewAction = canPreviewConversationFile(previewFile) ? () => openFilePreview(previewFile) : undefined
                                const isPdf = /\.pdf(\?|$)/i.test(url)
                                if (isPdf) {
                                  return (
                                    <div key={bi} className="space-y-1">
                                      <iframe src={proxiedUrl} title={fname} className="h-80 w-full rounded-lg border border-slate-200" />
                                      <FileAttachmentCard url={url} filename={fname} isMine={isMine} onPreview={previewAction} />
                                    </div>
                                  )
                                }
                                return <FileAttachmentCard key={bi} url={url} filename={fname} isMine={isMine} onPreview={previewAction} />
                              }
                              if (block.kind === 'markdown') {
                                return (
                                  <MarkdownWithMath key={bi} className="prose prose-sm max-w-none prose-slate [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden">
                                    {block.text}
                                  </MarkdownWithMath>
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
                              if (block.kind === 'cloud_preview') {
                                if (!message.is_cloud_sandbox) {
                                  return (
                                    <a key={bi} href={block.url} target="_blank" rel="noreferrer" className="block text-indigo-500 underline break-all">
                                      {block.title || block.url}
                                    </a>
                                  )
                                }
                                const preview: CloudSandboxPreview = {
                                  key: `${message.message_id}:${block.url}`,
                                  url: block.url,
                                  title: block.title,
                                  snapshotUrl: block.snapshotUrl,
                                  artifactUrl: block.artifactUrl,
                                  messageId: message.message_id,
                                  senderId: message.sender_id,
                                  senderName: message.sender_display_name,
                                  timestamp: message.timestamp,
                                }
                                if (closedCloudPreviewKeys.has(preview.key)) return null
                                return (
                                  <CloudSandboxPreviewCard
                                    key={bi}
                                    preview={preview}
                                    onClose={() => closeCloudPreviewCard(preview)}
                                  />
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
                            {message.is_streaming && (
                              <span className="inline-flex items-center gap-1 px-0.5 text-[11px] font-semibold text-[#9a4b00] dark:text-amber-300">
                                <span className="h-3 w-1.5 animate-pulse rounded-sm bg-current" />
                                <span>正在输出</span>
                              </span>
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

      <div className="border-t border-[#e5e0d8] bg-[#fbfaf7] px-4 pb-4 pt-2 dark:border-zinc-800 dark:bg-zinc-950 sm:px-6">
        {activeTab === 'chat' && runStatus && !composerExpanded && (
          <div className="mb-2 max-w-xl">
            <AgentRunStatusCard status={runStatus} floating />
          </div>
        )}

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

        {/* Compact status bar: actual runtime model / think / adapter-aware slash */}
        <div className="mb-2 flex items-center gap-1.5 text-[10px] flex-wrap sm:flex-nowrap">
          <span
            className="flex min-w-0 max-w-[220px] shrink-0 items-center gap-1 rounded-md border border-[#e5e0d8] bg-white px-2 py-1 text-[#615d55] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
            title={`Current runtime model: ${displayModelId || displayModelLabel}`}
          >
            <span>🤖</span>
            <span className="truncate font-medium">{displayModelLabel}</span>
          </span>

          <span
            className="flex shrink-0 items-center gap-1 rounded-md border border-[#e5e0d8] bg-white px-2 py-1 text-[#615d55] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
            title={`Current think mode: ${displayEffortLabel}`}
          >
            <span>🧠</span>
            <span className="font-medium">{displayEffortLabel}</span>
          </span>

          <span className="shrink-0 rounded-md border border-[#e5e0d8] bg-[#f4f1eb] px-2 py-1 font-medium text-[#615d55] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {activeAgentLabel}
          </span>
          {canUseKnowledgeMode && (
            <button
              type="button"
              onClick={() => setKbMode((value) => !value)}
              className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 font-semibold transition ${
                kbMode
                  ? 'border-[#f87500] bg-orange-50 text-[#dc6900] dark:border-orange-500/50 dark:bg-orange-500/10 dark:text-orange-200'
                  : 'border-[#e5e0d8] bg-white text-[#615d55] hover:bg-[#f4f1eb] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800'
              }`}
              title="启用后，本条消息会让 Agent 按需检索你的个人知识库。"
            >
              <BookOpen className="h-3 w-3" />
              知识库
            </button>
          )}
          {quickSlashActions.map((action) => (
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
                  {c.family && (
                    <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                      c.family === 'wtt'
                        ? 'bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-300'
                        : c.family === 'codex'
                          ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300'
                          : c.family === 'claude-code'
                            ? 'bg-violet-50 text-violet-600 dark:bg-violet-950/30 dark:text-violet-300'
                            : c.family === 'gemini'
                              ? 'bg-sky-50 text-sky-600 dark:bg-sky-950/30 dark:text-sky-300'
                              : 'bg-slate-100 text-slate-500 dark:bg-zinc-700 dark:text-zinc-300'
                    }`}>
                      {c.family === 'wtt' ? 'WTT' : c.family === 'claude-code' ? 'Claude' : c.family === 'codex' ? 'Codex' : c.family === 'gemini' ? 'Gemini' : 'Agent'}
                    </span>
                  )}
                  <span className="ml-auto text-[10px] text-slate-400 dark:text-zinc-500">{c.desc}</span>
                </button>
              ))}
            </div>
          )}

          {/* @mention autocomplete */}
          {mentionOpen && filteredMembers.length > 0 && (
            <div className="absolute bottom-full left-0 mb-1 w-full max-w-sm z-40 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 py-1 shadow-lg max-h-48 overflow-y-auto">
              {mentionQuota && (
                <div className={`px-3 py-1 text-[10px] border-b border-slate-100 dark:border-zinc-700 ${mentionQuota.remaining <= 2 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-zinc-500'}`}>
                  跨用户 @ 今日剩余 {mentionQuota.remaining}/{mentionQuota.limit} 次
                </div>
              )}
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
                <button type="button" onClick={() => openFilePicker()} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700">
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
        {activeTab === 'chat' && sidePreviewFile && (
          <DocumentSidePreview file={sidePreviewFile} onClose={closeFilePreview} />
        )}
      </div>
    </div>
  )
}
