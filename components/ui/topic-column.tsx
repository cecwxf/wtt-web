'use client'

import { ChevronDown, ChevronRight, ClipboardCopy, ClipboardList, Cloud, Crown, Feather, Flame, Hash, Loader2, Lock, MessageCircle, MoreVertical, Plus, Power, Radio, Shield, Sparkles, Sun, Users, Waves, Zap } from 'lucide-react'
import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import {
  AGENT_ROLE_TEMPLATES,
  buildRoleSystemPrompt,
  getAgentRoleTemplate,
  type AgentRoleTemplate,
  type AgentRoleTemplateId,
} from '@/lib/agent-role-templates'
import { AgentTerminalModal } from '@/components/ui/agent-terminal-modal'
import { useI18n } from '@/lib/i18n-provider'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'
import { wttApi } from '@/lib/api/wtt-client'

export interface TopicItem {
  topic_id: string
  name: string
  topic_type: 'broadcast' | 'discussion' | 'p2p' | 'collaborative'
  unread_count?: number
  can_delete?: boolean
  task_id?: string
  task_type?: string
  task_mode?: string
  exec_mode?: string
  runner_agent_id?: string
  is_default_p2p?: boolean
  last_activity_at?: string
  description?: string
  creator_agent_id?: string
}

interface AgentOption {
  agent_id: string
  display_name: string
  binding_method?: string
  bound_via?: string
  is_cloud_sandbox?: boolean
  cloud_host_agent_id?: string
}

export type CloudAgentCreateOptions = {
  adapter: 'claude-code' | 'codex' | 'gemini'
  model: string
  providerPlan: 'deepseek' | 'claude' | 'gpt' | 'gemini'
  apiKey?: string
  displayName?: string
}

export interface AgentRuntimeInfo {
  kind?: string
  adapter?: string
  model?: string
  model_id?: string
  current_model?: string
  reasoning_effort?: string
  workdir?: string
  workdir_name?: string
  hostname?: string
  platform?: string
  provider?: string
  host_agent_id?: string
  workspace_path?: string
  git?: {
    repo?: string
    branch?: string
    commit?: string
    dirty?: boolean
  } | null
  last_heartbeat_secs_ago?: number
}

interface TopicColumnProps {
  topics: TopicItem[]
  selectedTopicId: string | null
  onSelectTopic: (topicId: string | null) => void
  onLeaveTopic?: (topicId: string) => void
  onDeleteTopic?: (topicId: string) => void
  onCreateP2P?: (targetAgentId: string) => void | Promise<void>
  onRequestDiscuss?: (targetAgentId: string, topicName: string) => void | Promise<void>
  onSelectWorkerTopic?: (topicId: string, workerSession?: { workerId: string; personaMd: string; workerMd: string; isFirstSession: boolean; personaChanged?: boolean }) => void
  pinScopeKey?: string
  agentOptions?: AgentOption[]
  selectedAgentId?: string
  onSelectAgent?: (agentId: string) => void
  isSelectedAgentOnline?: boolean
  onlineAgentIds?: Set<string>
  agentRoleMap?: Record<string, string>
  agentRoleTemplateMap?: Record<string, AgentRoleTemplate>
  agentRuntimeMap?: Record<string, AgentRuntimeInfo>
  onAssignAgentRole?: (agentId: string, roleId: AgentRoleTemplateId) => void
  onSaveAgentRole?: (agentId: string, role: AgentRoleTemplate) => void
  onNewAgentFromHost?: (
    hostAgentId: string,
    role: AgentRoleTemplate,
    adapter: 'claude-code' | 'codex' | 'gemini',
    options?: { select?: boolean; alert?: boolean },
  ) => string | void | Promise<string | void>
  onCreateCloudAgent?: (options?: CloudAgentCreateOptions) => void | Promise<void>
  onSleepSandbox?: (hostAgentId: string) => void | Promise<void>
  onWakeSandbox?: (hostAgentId: string) => void | Promise<void>
  onRenameAgent?: (agentId: string, currentName: string) => void
  onUnclaimAgent?: (agentId: string) => void
  onBindingChanged?: () => void | Promise<void>
  onTopicsRefresh?: () => void | Promise<void>
  onCreateGeneralTask?: () => void
  onToggleSidebar?: () => void
  onStartAgentResize?: (event: ReactPointerEvent) => void
  localLibrarySlot?: ReactNode
  userToken?: string
  compactLayout?: boolean
}

function agentInitial(name: string) {
  return (name.trim()[0] || 'A').toUpperCase()
}

type WttConnectAdapterId = 'codex' | 'claude-code' | 'gemini'

type ProvisionedWttConnectAgent = {
  agent_id: string
  agent_token: string
}

const WTT_CONNECT_ADAPTERS: Array<{ id: WttConnectAdapterId; label: string; note: string }> = [
  { id: 'codex', label: 'Codex', note: '使用 Codex CLI，本机登录 ChatGPT/OpenAI 后启动。' },
  { id: 'claude-code', label: 'Claude Code', note: '使用 Claude Code，可走本机订阅或 WTT LLM Proxy。' },
  { id: 'gemini', label: 'Gemini CLI', note: 'Gemini 通常需要先在该主机完成 Google OAuth。' },
]

const MAX_GROUP_AGENTS = 30

type TeamTemplate = {
  id: string
  title: string
  titleEn: string
  description: string
  descriptionEn: string
  roles: AgentRoleTemplateId[]
  workflow: string[]
}

const TEAM_TEMPLATES: TeamTemplate[] = [
  {
    id: 'paper-research',
    title: '论文研究团队',
    titleEn: 'Paper Research Team',
    description: '适合读论文、找证据、复现实验和形成研究综述。',
    descriptionEn: 'For reading papers, checking evidence, reproducing ideas, and writing research summaries.',
    roles: ['research', 'engineering', 'qa', 'media_creator', 'product'],
    workflow: ['研究员收集论文和事实证据', '研发 Agent 梳理方法与可复现路径', '测试 Agent 检查实验风险和验证方案', '写作 Agent 形成综述/报告', '产品 Agent 提炼应用场景和下一步'],
  },
  {
    id: 'rd',
    title: '研发团队',
    titleEn: 'R&D Team',
    description: '适合从需求到架构、实现、测试和上线复盘。',
    descriptionEn: 'For product requirements, architecture, implementation, testing, and release review.',
    roles: ['product', 'engineering', 'designer', 'qa', 'operator'],
    workflow: ['产品 Agent 明确需求和验收标准', '设计 Agent 给出交互/视觉方向', '研发 Agent 拆解架构和实现', '测试 Agent 输出回归矩阵', '运营 Agent 规划上线和数据复盘'],
  },
  {
    id: 'coding',
    title: 'Coding 团队',
    titleEn: 'Coding Team',
    description: '适合代码实现、debug、review、测试和交付。',
    descriptionEn: 'For implementation, debugging, code review, testing, and delivery.',
    roles: ['engineering', 'qa', 'research', 'product', 'ceo'],
    workflow: ['产品 Agent 定义任务边界', '研发 Agent 实现核心代码', '研究 Agent 查资料和技术选型', '测试 Agent 跑测试和找边界', '总经理 Agent 汇总进度、风险和下一步'],
  },
  {
    id: 'writing',
    title: '写作团队',
    titleEn: 'Writing Team',
    description: '适合文章、脚本、商业文案和长内容生产。',
    descriptionEn: 'For articles, scripts, copywriting, and long-form content production.',
    roles: ['media_creator', 'research', 'designer', 'operator', 'sales'],
    workflow: ['研究 Agent 收集素材和事实', '自媒体 Agent 设计选题/标题/脚本', '设计 Agent 建议视觉表达', '运营 Agent 规划发布节奏', '销售 Agent 优化转化话术'],
  },
  {
    id: 'product-growth',
    title: '产品增长团队',
    titleEn: 'Product Growth Team',
    description: '适合产品定位、增长实验、用户运营和商业化。',
    descriptionEn: 'For product positioning, growth experiments, user operations, and monetization.',
    roles: ['product', 'operator', 'sales', 'finance', 'investor'],
    workflow: ['产品 Agent 明确用户和功能策略', '运营 Agent 设计增长实验', '销售 Agent 验证价值主张', '财务 Agent 测算成本收益', '投资人 Agent 评估市场空间和壁垒'],
  },
  {
    id: 'legal-compliance',
    title: '法律合规团队',
    titleEn: 'Legal & Compliance Team',
    description: '适合合同、隐私、商业风险和证据整理。',
    descriptionEn: 'For contracts, privacy, business risk, and evidence planning.',
    roles: ['lawyer', 'finance', 'product', 'ceo', 'research'],
    workflow: ['律师 Agent 梳理法律关系和风险', '财务 Agent 评估成本和赔付暴露', '产品 Agent 调整流程和提示', '研究 Agent 补充监管/案例材料', '总经理 Agent 制定决策和执行节奏'],
  },
  {
    id: 'medical-health',
    title: '医疗健康团队',
    titleEn: 'Medical Health Team',
    description: '适合健康资料整理、就诊准备和风险提示。',
    descriptionEn: 'For health information summaries, clinic preparation, and risk warnings.',
    roles: ['doctor', 'research', 'teacher', 'operator'],
    workflow: ['医生 Agent 识别风险信号和就诊准备', '研究 Agent 补充资料来源和边界', '教师 Agent 用易懂方式解释概念', '运营 Agent 整理长期跟踪清单'],
  },
  {
    id: 'architecture',
    title: '建筑方案团队',
    titleEn: 'Architecture Planning Team',
    description: '适合空间规划、材料风格、预算和施工约束。',
    descriptionEn: 'For space planning, materials, budget, and construction constraints.',
    roles: ['architect', 'designer', 'finance', 'qa', 'product'],
    workflow: ['建筑师 Agent 明确空间和结构约束', '设计师 Agent 给出风格和体验方向', '财务 Agent 控制造价', '测试 Agent 检查施工/安全风险', '产品 Agent 对齐用户生活场景'],
  },
]

function shellQuote(value: string) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

function buildWttConnectCommand(adapter: WttConnectAdapterId, agentId: string, agentToken: string) {
  const aid = shellQuote(agentId)
  const tok = shellQuote(agentToken)
  const authHint = adapter === 'gemini'
    ? [
        '# 如果 Gemini 还没有授权，先运行一次：',
        'gemini',
        '',
      ]
    : []
  return [
    '# Step 1: install / update wtt-connect',
    'npm install -g wtt-connect',
    '',
    ...authHint,
    `# Step 2: start ${adapter} agent`,
    `wtt-connect up ${adapter} ${aid} ${tok}`,
    '',
    '# verify',
    `wtt-connect status ${agentId}-${adapter}`,
    `wtt-connect logs ${agentId}-${adapter} --lines 100`,
  ].join('\n')
}

const ROLE_TONES = [
  {
    avatar: 'bg-sky-500 text-white',
    selected: 'border-sky-300 bg-sky-50 shadow-sm dark:border-sky-500/45 dark:bg-sky-500/15',
    idle: 'hover:border-sky-200 hover:bg-sky-50/80 dark:hover:border-sky-500/35 dark:hover:bg-sky-500/10',
    label: 'text-sky-700 dark:text-sky-200',
    ring: 'ring-sky-100 dark:ring-sky-500/25',
  },
  {
    avatar: 'bg-emerald-500 text-white',
    selected: 'border-emerald-300 bg-emerald-50 shadow-sm dark:border-emerald-500/45 dark:bg-emerald-500/15',
    idle: 'hover:border-emerald-200 hover:bg-emerald-50/80 dark:hover:border-emerald-500/35 dark:hover:bg-emerald-500/10',
    label: 'text-emerald-700 dark:text-emerald-200',
    ring: 'ring-emerald-100 dark:ring-emerald-500/25',
  },
  {
    avatar: 'bg-violet-500 text-white',
    selected: 'border-violet-300 bg-violet-50 shadow-sm dark:border-violet-500/45 dark:bg-violet-500/15',
    idle: 'hover:border-violet-200 hover:bg-violet-50/80 dark:hover:border-violet-500/35 dark:hover:bg-violet-500/10',
    label: 'text-violet-700 dark:text-violet-200',
    ring: 'ring-violet-100 dark:ring-violet-500/25',
  },
  {
    avatar: 'bg-amber-500 text-white',
    selected: 'border-amber-300 bg-amber-50 shadow-sm dark:border-amber-500/45 dark:bg-amber-500/15',
    idle: 'hover:border-amber-200 hover:bg-amber-50/80 dark:hover:border-amber-500/35 dark:hover:bg-amber-500/10',
    label: 'text-amber-700 dark:text-amber-200',
    ring: 'ring-amber-100 dark:ring-amber-500/25',
  },
  {
    avatar: 'bg-rose-500 text-white',
    selected: 'border-rose-300 bg-rose-50 shadow-sm dark:border-rose-500/45 dark:bg-rose-500/15',
    idle: 'hover:border-rose-200 hover:bg-rose-50/80 dark:hover:border-rose-500/35 dark:hover:bg-rose-500/10',
    label: 'text-rose-700 dark:text-rose-200',
    ring: 'ring-rose-100 dark:ring-rose-500/25',
  },
  {
    avatar: 'bg-cyan-600 text-white',
    selected: 'border-cyan-300 bg-cyan-50 shadow-sm dark:border-cyan-500/45 dark:bg-cyan-500/15',
    idle: 'hover:border-cyan-200 hover:bg-cyan-50/80 dark:hover:border-cyan-500/35 dark:hover:bg-cyan-500/10',
    label: 'text-cyan-700 dark:text-cyan-200',
    ring: 'ring-cyan-100 dark:ring-cyan-500/25',
  },
  {
    avatar: 'bg-fuchsia-500 text-white',
    selected: 'border-fuchsia-300 bg-fuchsia-50 shadow-sm dark:border-fuchsia-500/45 dark:bg-fuchsia-500/15',
    idle: 'hover:border-fuchsia-200 hover:bg-fuchsia-50/80 dark:hover:border-fuchsia-500/35 dark:hover:bg-fuchsia-500/10',
    label: 'text-fuchsia-700 dark:text-fuchsia-200',
    ring: 'ring-fuchsia-100 dark:ring-fuchsia-500/25',
  },
] as const

const HOST_FOLDER_TONES = [
  {
    god: 'Zeus',
    Icon: Zap,
    shell: 'border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50 text-emerald-800 ring-emerald-100 dark:border-emerald-500/25 dark:from-emerald-500/15 dark:via-zinc-950 dark:to-teal-500/10 dark:text-emerald-100 dark:ring-emerald-500/15',
    icon: 'from-amber-300 via-yellow-500 to-orange-600 text-white shadow-amber-900/30',
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-100',
  },
  {
    god: 'Poseidon',
    Icon: Waves,
    shell: 'border-sky-200 bg-gradient-to-br from-sky-50 via-white to-cyan-50 text-sky-800 ring-sky-100 dark:border-sky-500/25 dark:from-sky-500/15 dark:via-zinc-950 dark:to-cyan-500/10 dark:text-sky-100 dark:ring-sky-500/15',
    icon: 'from-cyan-300 via-sky-500 to-blue-700 text-white shadow-sky-900/30',
    badge: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-100',
  },
  {
    god: 'Athena',
    Icon: Shield,
    shell: 'border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50 text-amber-900 ring-amber-100 dark:border-amber-500/25 dark:from-amber-500/15 dark:via-zinc-950 dark:to-orange-500/10 dark:text-amber-100 dark:ring-amber-500/15',
    icon: 'from-stone-300 via-indigo-500 to-slate-800 text-white shadow-indigo-900/30',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-100',
  },
  {
    god: 'Aphrodite',
    Icon: Sparkles,
    shell: 'border-rose-200 bg-gradient-to-br from-rose-50 via-white to-pink-50 text-rose-800 ring-rose-100 dark:border-rose-500/25 dark:from-rose-500/15 dark:via-zinc-950 dark:to-pink-500/10 dark:text-rose-100 dark:ring-rose-500/15',
    icon: 'from-pink-300 via-rose-500 to-fuchsia-700 text-white shadow-rose-900/30',
    badge: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-100',
  },
  {
    god: 'Apollo',
    Icon: Sun,
    shell: 'border-orange-200 bg-gradient-to-br from-orange-50 via-white to-yellow-50 text-orange-900 ring-orange-100 dark:border-orange-500/25 dark:from-orange-500/15 dark:via-zinc-950 dark:to-yellow-500/10 dark:text-orange-100 dark:ring-orange-500/15',
    icon: 'from-yellow-200 via-orange-500 to-red-600 text-white shadow-orange-900/30',
    badge: 'bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-100',
  },
  {
    god: 'Hermes',
    Icon: Feather,
    shell: 'border-violet-200 bg-gradient-to-br from-violet-50 via-white to-sky-50 text-violet-900 ring-violet-100 dark:border-violet-500/25 dark:from-violet-500/15 dark:via-zinc-950 dark:to-sky-500/10 dark:text-violet-100 dark:ring-violet-500/15',
    icon: 'from-violet-300 via-indigo-500 to-sky-600 text-white shadow-indigo-900/30',
    badge: 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-100',
  },
  {
    god: 'Hephaestus',
    Icon: Flame,
    shell: 'border-red-200 bg-gradient-to-br from-red-50 via-white to-stone-50 text-red-900 ring-red-100 dark:border-red-500/25 dark:from-red-500/15 dark:via-zinc-950 dark:to-stone-500/10 dark:text-red-100 dark:ring-red-500/15',
    icon: 'from-red-400 via-orange-600 to-stone-900 text-white shadow-red-900/30',
    badge: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-100',
  },
  {
    god: 'Hera',
    Icon: Crown,
    shell: 'border-fuchsia-200 bg-gradient-to-br from-fuchsia-50 via-white to-purple-50 text-fuchsia-900 ring-fuchsia-100 dark:border-fuchsia-500/25 dark:from-fuchsia-500/15 dark:via-zinc-950 dark:to-purple-500/10 dark:text-fuchsia-100 dark:ring-fuchsia-500/15',
    icon: 'from-fuchsia-300 via-purple-600 to-indigo-900 text-white shadow-purple-900/30',
    badge: 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-500/15 dark:text-fuchsia-100',
  },
] as const

function hashText(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }
  return hash
}

function roleTone(agentId: string, role?: AgentRoleTemplate) {
  const key = `${role?.id || role?.label || 'agent'}:${agentId}`
  return ROLE_TONES[hashText(key) % ROLE_TONES.length] || ROLE_TONES[0]
}

function hostFolderTone(key: string) {
  return HOST_FOLDER_TONES[hashText(key) % HOST_FOLDER_TONES.length] || HOST_FOLDER_TONES[0]
}

function agentTooltip(agent: AgentOption, role: AgentRoleTemplate, runtime?: AgentRuntimeInfo) {
  const workdir = runtime?.workdir || runtime?.git?.repo || runtime?.workdir_name || ''
  const git = runtime?.git
  return [
    agent.display_name || agent.agent_id,
    `${role.label} / ${role.shortLabel}`,
    `agentID: ${agent.agent_id}`,
    workdir ? `workdir: ${workdir}` : '',
    git?.branch ? `branch: ${git.branch}${git.dirty ? ' (dirty)' : ''}` : '',
    runtime?.adapter || runtime?.kind ? `adapter: ${runtime.adapter || runtime.kind}` : '',
    runtime?.hostname ? `host: ${runtime.hostname}` : '',
  ].filter(Boolean).join('\n')
}

function stripTaskPrefix(name: string): string {
  return name.replace(/^TASK-[a-f0-9]{8}\s*/i, '')
}

function getTopicIcon(topic: TopicItem) {
  if (topic.task_id) return ClipboardList
  switch (topic.topic_type) {
    case 'p2p':
      return Lock
    case 'collaborative':
      return Users
    case 'broadcast':
      return Radio
    default:
      return Hash
  }
}

function getTopicKindLabel(topic: TopicItem, zh: boolean) {
  if (topic.task_id) return zh ? '任务' : 'Task'
  switch (topic.topic_type) {
    case 'p2p':
      return 'P2P'
    case 'collaborative':
      return zh ? '协作' : 'Collaborative'
    case 'broadcast':
      return zh ? '订阅' : 'Broadcast'
    default:
      return zh ? '讨论' : 'Discuss'
  }
}

function getTopicDisplayName(topic: TopicItem) {
  const name = topic.task_id ? stripTaskPrefix(topic.name) : topic.name
  return topic.topic_type === 'p2p' ? name.replace(/^Worker:\s*/i, '') : name
}

type TopicGroupKey = 'p2p' | 'task' | 'discuss' | 'subscriber'

function getTopicGroup(topic: TopicItem): TopicGroupKey {
  if (topic.topic_type === 'p2p') return 'p2p'
  if (topic.task_id) return 'task'
  if (topic.topic_type === 'broadcast') return 'subscriber'
  return 'discuss'
}

function getGroupLabel(group: TopicGroupKey, zh: boolean) {
  switch (group) {
    case 'p2p':
      return zh ? 'P2P 私聊' : 'P2P'
    case 'task':
      return zh ? '任务' : 'Tasks'
    case 'discuss':
      return zh ? '讨论' : 'Discuss'
    case 'subscriber':
      return zh ? '订阅' : 'Subscriptions'
  }
}

function getGroupIcon(group: TopicGroupKey) {
  switch (group) {
    case 'p2p':
      return Lock
    case 'task':
      return ClipboardList
    case 'discuss':
      return MessageCircle
    case 'subscriber':
      return Radio
  }
}

function getGroupTone(group: TopicGroupKey) {
  switch (group) {
    case 'p2p':
      return 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-200'
    case 'task':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200'
    case 'discuss':
      return 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-200'
    case 'subscriber':
      return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200'
  }
}

function formatRuntime(runtime?: AgentRuntimeInfo) {
  if (!runtime) return ''
  const workdir = runtime.workdir || runtime.git?.repo || runtime.workdir_name || ''
  const branch = runtime.git?.branch || ''
  const adapter = runtime.adapter || runtime.kind || ''
  const model = runtime.current_model || runtime.model_id || runtime.model || ''
  return [adapter, model, workdir, branch].filter(Boolean).join(' · ')
}

function normalizeNewAgentAdapter(runtime?: AgentRuntimeInfo) {
  const raw = String(runtime?.adapter || runtime?.kind || '').trim().toLowerCase()
  if (raw === 'codex') return 'codex'
  if (raw === 'claude' || raw === 'claude-code' || raw === 'claude_code') return 'claude-code'
  if (raw === 'gemini' || raw === 'gemini-cli') return 'gemini'
  return ''
}

type AgentFolder = {
  key: string
  label: string
  subtitle: string
  agents: AgentOption[]
}

const AGENT_RUNTIME_HOST_CACHE_KEY = 'wtt:last-agent-runtime-hosts:v1'

function cleanHostLabel(value: unknown) {
  return String(value || '').trim()
}

function isCloudSandboxRuntime(runtime?: AgentRuntimeInfo) {
  const provider = String(runtime?.provider || '').trim().toLowerCase()
  return provider.startsWith('cloudflare_sandbox')
}

function cloudHostAgentIdForAgent(agent: AgentOption, runtime?: AgentRuntimeInfo) {
  const explicitHostId = cleanHostLabel(agent.cloud_host_agent_id)
  if (explicitHostId) return explicitHostId

  const runtimeHostId = cleanHostLabel(runtime?.host_agent_id)
  if (agent.is_cloud_sandbox || isCloudSandboxRuntime(runtime)) {
    return runtimeHostId || agent.agent_id
  }

  return ''
}

function hasRuntimeHostIdentity(runtime?: AgentRuntimeInfo) {
  return Boolean(
    cleanHostLabel(runtime?.hostname) ||
    cleanHostLabel(runtime?.host_agent_id) ||
    cleanHostLabel(runtime?.provider) ||
    cleanHostLabel(runtime?.workdir),
  )
}

function runtimeHostSnapshot(runtime: AgentRuntimeInfo): AgentRuntimeInfo {
  return {
    kind: runtime.kind,
    adapter: runtime.adapter,
    model: runtime.model,
    model_id: runtime.model_id,
    current_model: runtime.current_model,
    reasoning_effort: runtime.reasoning_effort,
    workdir: runtime.workdir,
    workdir_name: runtime.workdir_name,
    hostname: runtime.hostname,
    platform: runtime.platform,
    provider: runtime.provider,
    host_agent_id: runtime.host_agent_id,
    workspace_path: runtime.workspace_path,
    git: runtime.git,
  }
}

function mergeRuntimeWithCachedHost(live?: AgentRuntimeInfo, cached?: AgentRuntimeInfo): AgentRuntimeInfo | undefined {
  if (!live) return cached
  if (!cached) return live
  return {
    ...cached,
    ...live,
    hostname: cleanHostLabel(live.hostname) || cached.hostname,
    platform: cleanHostLabel(live.platform) || cached.platform,
    provider: cleanHostLabel(live.provider) || cached.provider,
    host_agent_id: cleanHostLabel(live.host_agent_id) || cached.host_agent_id,
    workdir: cleanHostLabel(live.workdir) || cached.workdir,
    workdir_name: cleanHostLabel(live.workdir_name) || cached.workdir_name,
    workspace_path: cleanHostLabel(live.workspace_path) || cached.workspace_path,
    git: live.git || cached.git,
  }
}

export function TopicColumn(props: TopicColumnProps) {
  const {
    topics,
    selectedTopicId,
    onSelectTopic,
    onLeaveTopic,
    onDeleteTopic,
    agentOptions = [],
    selectedAgentId = '',
    onSelectAgent,
    isSelectedAgentOnline = false,
    onlineAgentIds,
    agentRoleMap,
    agentRoleTemplateMap,
    agentRuntimeMap,
    onAssignAgentRole,
    onSaveAgentRole,
    onNewAgentFromHost,
    onCreateCloudAgent,
    onSleepSandbox,
    onWakeSandbox,
    onRenameAgent,
    onUnclaimAgent,
    onBindingChanged,
    onTopicsRefresh,
    onCreateGeneralTask,
    onToggleSidebar,
    onStartAgentResize,
    userToken,
    compactLayout = false,
  } = props
  const [agentMenuFor, setAgentMenuFor] = useState<string | null>(null)
  const [folderMenuFor, setFolderMenuFor] = useState<string | null>(null)
  const [sandboxActionFor, setSandboxActionFor] = useState<string | null>(null)
  const [topicMenuFor, setTopicMenuFor] = useState<string | null>(null)
  const [mentionMuteByTopic, setMentionMuteByTopic] = useState<Record<string, boolean>>({})
  const [shellAgent, setShellAgent] = useState<AgentOption | null>(null)
  const [newAgentOpen, setNewAgentOpen] = useState(false)
  const [newAgentHostId, setNewAgentHostId] = useState('')
  const [newAgentRoleId, setNewAgentRoleId] = useState<AgentRoleTemplateId>('general')
  const [newAgentAdapter, setNewAgentAdapter] = useState<'claude-code' | 'codex' | 'gemini'>('claude-code')
  const [newAgentBusy, setNewAgentBusy] = useState(false)
  const [newAgentError, setNewAgentError] = useState('')
  const [cloudCreateOpen, setCloudCreateOpen] = useState(false)
  const [cloudCreateAdapter, setCloudCreateAdapter] = useState<'claude-code' | 'codex' | 'gemini'>('claude-code')
  const [cloudCreateApiKey, setCloudCreateApiKey] = useState('')
  const [cloudCreateDisplayName, setCloudCreateDisplayName] = useState('Cloud Agent')
  const [cloudCreateError, setCloudCreateError] = useState('')
  const [cloudAgentBusy, setCloudAgentBusy] = useState(false)
  const [bindAgentOpen, setBindAgentOpen] = useState(false)
  const [bindAgentDisplayName, setBindAgentDisplayName] = useState('')
  const [bindAgentAdapter, setBindAgentAdapter] = useState<WttConnectAdapterId>('codex')
  const [bindAgentBusy, setBindAgentBusy] = useState(false)
  const [bindAgentError, setBindAgentError] = useState('')
  const [bindAgentCopied, setBindAgentCopied] = useState('')
  const [bindAgentCreds, setBindAgentCreds] = useState<ProvisionedWttConnectAgent | null>(null)
  const [groupOpen, setGroupOpen] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [groupDesc, setGroupDesc] = useState('')
  const [groupAgentIds, setGroupAgentIds] = useState<string[]>([])
  const [groupBusy, setGroupBusy] = useState(false)
  const [groupError, setGroupError] = useState('')
  const [teamOpen, setTeamOpen] = useState(false)
  const [teamTemplateId, setTeamTemplateId] = useState(TEAM_TEMPLATES[0]?.id || '')
  const [teamName, setTeamName] = useState(TEAM_TEMPLATES[0]?.title || '')
  const [teamHostId, setTeamHostId] = useState('')
  const [teamAdapter, setTeamAdapter] = useState<'claude-code' | 'codex' | 'gemini'>('claude-code')
  const [teamBusy, setTeamBusy] = useState(false)
  const [teamProgress, setTeamProgress] = useState('')
  const [teamError, setTeamError] = useState('')
  const [roleEditor, setRoleEditor] = useState<{
    agentId: string
    sourceRole?: AgentRoleTemplate
    label: string
    description: string
    custom: boolean
  } | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<TopicGroupKey, boolean>>({
    p2p: false,
    task: false,
    discuss: false,
    subscriber: false,
  })
  const [collapsedAgentFolders, setCollapsedAgentFolders] = useState<Record<string, boolean>>({})
  const { locale, t } = useI18n()
  const zh = locale === 'zh'
  const [runtimeHostCache, setRuntimeHostCache] = useState<Record<string, AgentRuntimeInfo>>(() => {
    if (typeof window === 'undefined') return {}
    try {
      const parsed = JSON.parse(window.localStorage.getItem(AGENT_RUNTIME_HOST_CACHE_KEY) || '{}')
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, AgentRuntimeInfo> : {}
    } catch {
      return {}
    }
  })

  useEffect(() => {
    if (!agentRuntimeMap || Object.keys(agentRuntimeMap).length === 0) return
    setRuntimeHostCache((prev) => {
      let changed = false
      const next = { ...prev }

      for (const [agentId, runtime] of Object.entries(agentRuntimeMap)) {
        if (!runtime || !hasRuntimeHostIdentity(runtime)) continue
        const snapshot = runtimeHostSnapshot(runtime)
        if (JSON.stringify(next[agentId] || {}) === JSON.stringify(snapshot)) continue
        next[agentId] = snapshot
        changed = true
      }

      if (!changed) return prev
      try {
        window.localStorage.setItem(AGENT_RUNTIME_HOST_CACHE_KEY, JSON.stringify(next))
      } catch {
        // localStorage quota or privacy mode should not break the agent list.
      }
      return next
    })
  }, [agentRuntimeMap])

  const displayRuntimeMap = useMemo(() => {
    const merged: Record<string, AgentRuntimeInfo> = { ...runtimeHostCache }
    for (const [agentId, runtime] of Object.entries(agentRuntimeMap || {})) {
      const mergedRuntime = mergeRuntimeWithCachedHost(runtime, runtimeHostCache[agentId])
      if (mergedRuntime) merged[agentId] = mergedRuntime
    }
    return merged
  }, [agentRuntimeMap, runtimeHostCache])

  useEffect(() => {
    const closeMenus = () => {
      setTopicMenuFor(null)
      setAgentMenuFor(null)
      setFolderMenuFor(null)
    }
    window.addEventListener('click', closeMenus)
    return () => window.removeEventListener('click', closeMenus)
  }, [])

  useEffect(() => {
    if (!topicMenuFor || !selectedAgentId) return
    const topic = topics.find((item) => item.topic_id === topicMenuFor)
    if (!topic || topic.task_id || !['discussion', 'collaborative'].includes(topic.topic_type)) return
    let cancelled = false
    wttApi.getTopicMentionMutes(topic.topic_id, selectedAgentId, selectedAgentId, userToken)
      .then((rows) => {
        if (cancelled) return
        setMentionMuteByTopic((prev) => ({ ...prev, [topic.topic_id]: rows.length > 0 }))
      })
      .catch(() => {
        if (cancelled) return
        setMentionMuteByTopic((prev) => ({ ...prev, [topic.topic_id]: false }))
      })
    return () => {
      cancelled = true
    }
  }, [topicMenuFor, selectedAgentId, topics, userToken])

  const toggleTopicMentionMute = async (topic: TopicItem) => {
    if (!selectedAgentId) return
    const nextMuted = !mentionMuteByTopic[topic.topic_id]
    setMentionMuteByTopic((prev) => ({ ...prev, [topic.topic_id]: nextMuted }))
    setTopicMenuFor(null)
    try {
      await wttApi.setTopicMentionMute(topic.topic_id, selectedAgentId, selectedAgentId, nextMuted, userToken)
    } catch (error) {
      setMentionMuteByTopic((prev) => ({ ...prev, [topic.topic_id]: !nextMuted }))
      console.error('Failed to update topic mention mute', error)
    }
  }

  const saveRoleEditor = () => {
    if (!roleEditor || !onSaveAgentRole) return
    const label = roleEditor.label.trim()
    const description = roleEditor.description.trim()
    if (!label || !description) return
    const base = roleEditor.sourceRole
    const id = roleEditor.custom
      ? `custom-${Date.now().toString(36)}`
      : (base?.id || `custom-${Date.now().toString(36)}`)
    onSaveAgentRole(roleEditor.agentId, {
      id,
      label,
      shortLabel: label.slice(0, 8),
      description,
      skills: base?.skills?.length ? base.skills : ['custom_role'],
      systemPrompt: buildRoleSystemPrompt(label, description),
    })
    setRoleEditor(null)
    setAgentMenuFor(null)
  }

  const isAgentOnline = (agentId: string) => {
    if (onlineAgentIds) return onlineAgentIds.has(agentId)
    return agentId === selectedAgentId ? isSelectedAgentOnline : false
  }

  const newAgentHosts = useMemo(() => {
    if (!onNewAgentFromHost) return []
    return agentOptions.filter((agent) => {
      if (!isAgentOnline(agent.agent_id)) return false
      return Boolean(normalizeNewAgentAdapter(agentRuntimeMap?.[agent.agent_id]))
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentOptions, agentRuntimeMap, onlineAgentIds, selectedAgentId, isSelectedAgentOnline, onNewAgentFromHost])
  const selectedTeamTemplate = useMemo(
    () => TEAM_TEMPLATES.find((template) => template.id === teamTemplateId) || TEAM_TEMPLATES[0],
    [teamTemplateId],
  )
  const hasCloudAgent = useMemo(
    () => agentOptions.some((agent) => (agent.binding_method || agent.bound_via || '') === 'cloud_trial'),
    [agentOptions],
  )

  const agentFolders = useMemo<AgentFolder[]>(() => {
    const folders = new Map<string, AgentFolder>()

    const ensureFolder = (key: string, label: string, subtitle: string) => {
      const existing = folders.get(key)
      if (existing) {
        if (!existing.label && label) existing.label = label
        if (!existing.subtitle && subtitle) existing.subtitle = subtitle
        return existing
      }
      const folder = { key, label, subtitle, agents: [] as AgentOption[] }
      folders.set(key, folder)
      return folder
    }

    for (const agent of agentOptions) {
      const runtime = displayRuntimeMap?.[agent.agent_id]
      const runtimeHost = cleanHostLabel(runtime?.hostname)

      if (runtimeHost) {
        ensureFolder(`host:${runtimeHost}`, runtimeHost, zh ? '主机' : 'Host').agents.push(agent)
        continue
      }

      ensureFolder('host:unknown', zh ? '未上报主机' : 'Unknown host', zh ? '无 hostname' : 'No hostname').agents.push(agent)
    }

    return Array.from(folders.values()).sort((a, b) => {
      const selectedA = a.agents.some((agent) => agent.agent_id === selectedAgentId)
      const selectedB = b.agents.some((agent) => agent.agent_id === selectedAgentId)
      if (selectedA && !selectedB) return -1
      if (!selectedA && selectedB) return 1
      return a.label.localeCompare(b.label)
    })
  }, [agentOptions, displayRuntimeMap, selectedAgentId, zh])

  const openNewAgentModal = () => {
    const selectedHost = newAgentHosts.find((agent) => agent.agent_id === selectedAgentId)
    const host = selectedHost || newAgentHosts[0]
    if (!host) return
    setNewAgentHostId(host.agent_id)
    setNewAgentAdapter((normalizeNewAgentAdapter(agentRuntimeMap?.[host.agent_id]) || 'claude-code') as 'claude-code' | 'codex' | 'gemini')
    setNewAgentRoleId('general')
    setNewAgentError('')
    setNewAgentOpen(true)
  }

  const createNewAgentFromHost = async () => {
    if (!onNewAgentFromHost || !newAgentHostId) return
    const role = AGENT_ROLE_TEMPLATES.find((template) => template.id === newAgentRoleId) || getAgentRoleTemplate(newAgentRoleId)
    setNewAgentBusy(true)
    setNewAgentError('')
    try {
      await onNewAgentFromHost(newAgentHostId, role, newAgentAdapter)
      setNewAgentOpen(false)
    } catch (error) {
      setNewAgentError(error instanceof Error ? error.message : (zh ? '创建失败' : 'Failed to create agent'))
    } finally {
      setNewAgentBusy(false)
    }
  }

  const cloudCreateProviderPlan = cloudCreateAdapter === 'claude-code' ? 'deepseek' : cloudCreateAdapter === 'codex' ? 'gpt' : 'gemini'
  const cloudCreateModel = cloudCreateAdapter === 'claude-code'
    ? 'deepseek-v4-pro[1m]'
    : cloudCreateAdapter === 'codex'
      ? 'codex-configured-by-user'
      : 'gemini-configured-by-user'

  const createCloudAgent = async () => {
    if (!onCreateCloudAgent || cloudAgentBusy) return
    setCloudCreateError('')
    setCloudAgentBusy(true)
    try {
      await onCreateCloudAgent({
        adapter: cloudCreateAdapter,
        model: cloudCreateModel,
        providerPlan: cloudCreateProviderPlan,
        apiKey: cloudCreateApiKey.trim() || undefined,
        displayName: cloudCreateDisplayName.trim() || 'Cloud Agent',
      })
      setCloudCreateOpen(false)
      setCloudCreateApiKey('')
    } catch (error) {
      setCloudCreateError(error instanceof Error ? error.message : (zh ? 'Cloud Agent 创建失败' : 'Cloud Agent creation failed'))
    } finally {
      setCloudAgentBusy(false)
    }
  }

  const openBindAgentModal = () => {
    setBindAgentDisplayName('')
    setBindAgentAdapter('codex')
    setBindAgentError('')
    setBindAgentCopied('')
    setBindAgentCreds(null)
    setBindAgentOpen(true)
  }

  const openGroupModal = () => {
    const defaults = selectedAgentId ? [selectedAgentId] : agentOptions.slice(0, 3).map((agent) => agent.agent_id)
    setGroupName(zh ? '新的 Agent 群聊' : 'New Agent Group')
    setGroupDesc(zh ? '由多个已绑定 Agent 组成的协作群聊。' : 'A collaboration topic with selected bound agents.')
    setGroupAgentIds(defaults)
    setGroupError('')
    setGroupOpen(true)
  }

  const openTeamModal = () => {
    const template = selectedTeamTemplate || TEAM_TEMPLATES[0]
    const selectedHost = newAgentHosts.find((agent) => agent.agent_id === selectedAgentId) || newAgentHosts[0]
    setTeamTemplateId(template.id)
    setTeamName(zh ? template.title : template.titleEn)
    setTeamHostId(selectedHost?.agent_id || '')
    setTeamAdapter((normalizeNewAgentAdapter(agentRuntimeMap?.[selectedHost?.agent_id || '']) || 'claude-code') as 'claude-code' | 'codex' | 'gemini')
    setTeamProgress('')
    setTeamError('')
    setTeamOpen(true)
  }

  const toggleGroupAgent = (agentId: string) => {
    setGroupAgentIds((prev) => (
      prev.includes(agentId)
        ? prev.filter((id) => id !== agentId)
        : prev.length >= MAX_GROUP_AGENTS
          ? prev
          : [...prev, agentId]
    ))
  }

  const joinAgentsToTopicSequentially = async (topicId: string, agentIds: string[]) => {
    for (const agentId of agentIds) {
      await joinAgentToTopic(topicId, agentId)
    }
  }

  const joinAgentToTopic = async (topicId: string, agentId: string) => {
    const response = await fetch(`${CLIENT_WTT_API_BASE}/topics/${encodeURIComponent(topicId)}/join?agent_id=${encodeURIComponent(agentId)}`, {
      method: 'POST',
      headers: userToken ? { Authorization: `Bearer ${userToken}` } : undefined,
    })
    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      const detail = typeof data.detail === 'string' ? data.detail : ''
      throw new Error(detail || `Failed to add ${agentId} to topic`)
    }
  }

  const createPrivateDiscussionTopic = async (name: string, description: string, creatorAgentId: string) => {
    const topic = await wttApi.createTopic({
      name,
      description,
      type: 'discussion',
      visibility: 'private',
      join_method: 'invite_only',
      creator_agent_id: creatorAgentId,
    }, userToken)
    const topicId = String((topic as unknown as { topic_id?: string; id?: string }).topic_id || topic.id || '').trim()
    if (!topicId) throw new Error(zh ? '后端未返回 Topic ID。' : 'Backend did not return topic id.')
    return topicId
  }

  const createGroupChat = async () => {
    const selectedIds = Array.from(new Set(groupAgentIds)).filter(Boolean)
    if (!userToken) {
      setGroupError(zh ? '登录已过期，请重新登录。' : 'Session expired. Please sign in again.')
      return
    }
    if (selectedIds.length === 0) {
      setGroupError(zh ? '至少选择一个 Agent。' : 'Select at least one Agent.')
      return
    }
    if (selectedIds.length > MAX_GROUP_AGENTS) {
      setGroupError(zh ? `一次群聊最多选择 ${MAX_GROUP_AGENTS} 个 Agent。` : `Select up to ${MAX_GROUP_AGENTS} agents for one group.`)
      return
    }
    const name = groupName.trim()
    const description = groupDesc.trim() || (zh ? 'Agent 群聊。' : 'Agent group chat.')
    if (!name) {
      setGroupError(zh ? '请输入群聊名称。' : 'Please enter a group name.')
      return
    }
    setGroupBusy(true)
    setGroupError('')
    try {
      const creator = selectedIds.includes(selectedAgentId) ? selectedAgentId : selectedIds[0]
      const topicId = await createPrivateDiscussionTopic(name, description, creator)
      await joinAgentsToTopicSequentially(topicId, selectedIds.filter((id) => id !== creator))
      await onTopicsRefresh?.()
      onSelectTopic(topicId)
      setGroupOpen(false)
    } catch (error) {
      setGroupError(error instanceof Error ? error.message : (zh ? '创建群聊失败。' : 'Failed to create group chat.'))
    } finally {
      setGroupBusy(false)
    }
  }

  const createTeamFromTemplate = async () => {
    const template = selectedTeamTemplate
    if (!template || !onNewAgentFromHost) return
    if (!userToken) {
      setTeamError(zh ? '登录已过期，请重新登录。' : 'Session expired. Please sign in again.')
      return
    }
    if (!teamHostId) {
      setTeamError(zh ? '请选择一个在线主机。' : 'Choose an online host.')
      return
    }
    const name = teamName.trim() || (zh ? template.title : template.titleEn)
    const roles = template.roles.slice(0, 5).map((roleId) => getAgentRoleTemplate(roleId))
    setTeamBusy(true)
    setTeamError('')
    setTeamProgress(zh ? '开始创建团队 Agent...' : 'Creating team agents...')
    try {
      const createdAgentIds: string[] = []
      for (let index = 0; index < roles.length; index += 1) {
        const role = roles[index]
        setTeamProgress(`${zh ? '正在创建' : 'Creating'} ${index + 1}/${roles.length}: ${role.label}`)
        const newAgentId = await onNewAgentFromHost(teamHostId, role, teamAdapter, { select: false, alert: false })
        const normalizedId = String(newAgentId || '').trim()
        if (!normalizedId) throw new Error(`${zh ? 'Clone 未返回 agent_id' : 'Clone did not return agent_id'}: ${role.label}`)
        createdAgentIds.push(normalizedId)
      }

      setTeamProgress(zh ? '正在创建团队 Topic...' : 'Creating team topic...')
      const description = [
        zh ? template.description : template.descriptionEn,
        '',
        zh ? '团队工作流：' : 'Team workflow:',
        ...template.workflow.map((step, index) => `${index + 1}. ${step}`),
      ].join('\n')
      const topicId = await createPrivateDiscussionTopic(name, description, createdAgentIds[0])
      await joinAgentsToTopicSequentially(topicId, createdAgentIds.slice(1))
      await onBindingChanged?.()
      await onTopicsRefresh?.()
      onSelectTopic(topicId)
      setTeamOpen(false)
    } catch (error) {
      setTeamError(error instanceof Error ? error.message : (zh ? '创建团队失败。' : 'Failed to create team.'))
    } finally {
      setTeamBusy(false)
      setTeamProgress('')
    }
  }

  const createSelfManagedAgentBinding = async () => {
    if (!userToken) {
      setBindAgentError(zh ? '登录已过期，请重新登录。' : 'Session expired. Please sign in again.')
      return
    }
    setBindAgentBusy(true)
    setBindAgentError('')
    setBindAgentCopied('')
    try {
      const response = await fetch(`${CLIENT_WTT_API_BASE}/agents/provision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({
          display_name: bindAgentDisplayName.trim() || 'Self-managed Agent',
          platform: 'openclaw',
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        const detail = typeof data.detail === 'string' ? data.detail : ''
        throw new Error(detail || (zh ? '生成绑定凭证失败。' : 'Failed to generate binding credentials.'))
      }
      const agentId = String(data.agent_id || '').trim()
      const agentToken = String(data.agent_token || '').trim()
      if (!agentId || !agentToken) {
        throw new Error(zh ? '后端未返回 agent_id 或 token。' : 'Backend did not return agent_id or token.')
      }
      setBindAgentCreds({ agent_id: agentId, agent_token: agentToken })
      void onBindingChanged?.()
    } catch (error) {
      setBindAgentError(error instanceof Error ? error.message : (zh ? '生成绑定凭证失败。' : 'Failed to generate binding credentials.'))
    } finally {
      setBindAgentBusy(false)
    }
  }

  const copyBindCommand = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setBindAgentCopied(label)
      window.setTimeout(() => setBindAgentCopied(''), 1800)
    } catch {
      setBindAgentError(zh ? '复制失败，请手动复制命令。' : 'Copy failed. Please copy manually.')
    }
  }

  const runSandboxFolderAction = async (hostAgentId: string, action: 'sleep' | 'wake') => {
    const handler = action === 'sleep' ? onSleepSandbox : onWakeSandbox
    if (!handler || !hostAgentId) return
    setSandboxActionFor(`${hostAgentId}:${action}`)
    try {
      await handler(hostAgentId)
      setFolderMenuFor(null)
    } finally {
      setSandboxActionFor(null)
    }
  }

  const groupedTopics = useMemo(() => {
    const order: TopicGroupKey[] = ['p2p', 'task', 'discuss', 'subscriber']
    const byGroup = new Map<TopicGroupKey, TopicItem[]>()
    for (const group of order) byGroup.set(group, [])

    topics.forEach((topic) => {
      byGroup.get(getTopicGroup(topic))?.push(topic)
    })

    for (const group of order) {
      const rows = byGroup.get(group) || []
      rows.sort((a, b) => {
        if (a.is_default_p2p && !b.is_default_p2p) return -1
        if (!a.is_default_p2p && b.is_default_p2p) return 1

        const unreadDiff = Number(b.unread_count || 0) - Number(a.unread_count || 0)
        if (unreadDiff !== 0) return unreadDiff

        const at = a.last_activity_at ? new Date(a.last_activity_at).getTime() : 0
        const bt = b.last_activity_at ? new Date(b.last_activity_at).getTime() : 0
        return bt - at
      })
    }

    return order
      .map((group) => ({ group, items: byGroup.get(group) || [] }))
  }, [topics])

  const renderTopicRow = (topic: TopicItem) => {
    const selected = topic.topic_id === selectedTopicId
    const Icon = getTopicIcon(topic)
    const unread = Number(topic.unread_count || 0)
    const menuOpen = topicMenuFor === topic.topic_id
    const displayName = getTopicDisplayName(topic)
    const canToggleMentionMute = !!selectedAgentId && !topic.task_id && ['discussion', 'collaborative'].includes(topic.topic_type)
    const mentionMuted = !!mentionMuteByTopic[topic.topic_id]
    const selectedAgentName = agentOptions.find((agent) => agent.agent_id === selectedAgentId)?.display_name || selectedAgentId

    return (
      <div
        key={topic.topic_id}
        className="relative"
        onContextMenu={(event) => {
          event.preventDefault()
          setTopicMenuFor(topic.topic_id)
        }}
      >
        <button
          type="button"
          onClick={() => onSelectTopic(topic.topic_id)}
          className={`group flex w-full items-start gap-2 rounded-xl border px-2.5 py-2 text-left transition ${
            selected
              ? 'border-[#d7cbb9] bg-[#efe8dc] shadow-sm dark:border-emerald-500/35 dark:bg-emerald-500/10'
              : 'border-transparent bg-transparent hover:border-[#e4dccf] hover:bg-white/75 dark:hover:border-zinc-700 dark:hover:bg-zinc-900'
          }`}
        >
          <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
            selected ? 'bg-[#28241f] text-[#f5ead8]' : 'bg-[#eee8dc] text-slate-500 dark:bg-zinc-800 dark:text-zinc-300'
          }`}>
            <Icon className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate text-sm font-bold text-slate-800 dark:text-zinc-100">
                {displayName}
              </span>
              {topic.is_default_p2p && (
                <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-black text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
                  default
                </span>
              )}
            </span>
            <span className="mt-1 flex items-center gap-2 text-[11px] text-slate-400 dark:text-zinc-500">
              <span>{getTopicKindLabel(topic, zh)}</span>
            </span>
          </span>
          {unread > 0 && (
            <span className="mt-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-black leading-none text-white">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
          <span
            role="button"
            tabIndex={0}
            onClick={(event) => {
              event.stopPropagation()
              setTopicMenuFor(menuOpen ? null : topic.topic_id)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                event.stopPropagation()
                setTopicMenuFor(menuOpen ? null : topic.topic_id)
              }
            }}
            className="mt-0.5 rounded-lg p-1 text-slate-400 opacity-60 transition hover:bg-[#f6f0e5] hover:text-slate-700 group-hover:opacity-100 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            title={zh ? 'Topic 设置' : 'Topic settings'}
          >
            <MoreVertical className="h-4 w-4" />
          </span>
        </button>

        {menuOpen && (
          <div
            className="absolute right-2 top-10 z-30 w-48 rounded-xl border border-[#ded6c8] bg-[#fffdf8] p-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
            onClick={(event) => event.stopPropagation()}
          >
            {canToggleMentionMute && (
              <button
                type="button"
                onClick={() => {
                  void toggleTopicMentionMute(topic)
                }}
                className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-600 transition hover:bg-[#f3eee5] dark:text-zinc-300 dark:hover:bg-zinc-800"
                title={selectedAgentName}
              >
                {mentionMuted ? (zh ? '开放 @' : 'Allow @') : (zh ? '屏蔽 @' : 'Mute @')}
              </button>
            )}
            {onLeaveTopic && (
              <button
                type="button"
                onClick={() => {
                  onLeaveTopic(topic.topic_id)
                  setTopicMenuFor(null)
                }}
                className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-600 transition hover:bg-[#f3eee5] dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {zh ? '离开 Topic' : 'Leave Topic'}
              </button>
            )}
            {onDeleteTopic && topic.can_delete && (
              <button
                type="button"
                onClick={() => {
                  onDeleteTopic(topic.topic_id)
                  setTopicMenuFor(null)
                }}
                className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-red-500 transition hover:bg-red-50 dark:hover:bg-red-500/10"
              >
                {zh ? '删除 Topic' : 'Delete Topic'}
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <aside className="flex w-[var(--wtt-agent-rail-width)] shrink-0 flex-col border-r border-[#d9cebd] bg-[radial-gradient(circle_at_30%_0%,#ffffff_0,#f7efe2_38%,#ece4d7_100%)] text-slate-800 dark:border-zinc-800 dark:bg-[radial-gradient(circle_at_30%_0%,#27272a_0,#111113_42%,#050506_100%)] dark:text-zinc-100">
        <div className="border-b border-[#e1d6c5] px-1.5 py-2 text-center dark:border-zinc-800">
          <div className="truncate text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 dark:text-zinc-400">
            Agent
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-1.5">
          {onCreateCloudAgent && (
            <button
              type="button"
              onClick={() => {
                setCloudCreateError('')
                setCloudCreateOpen(true)
              }}
              disabled={cloudAgentBusy}
              className="relative flex w-full flex-col items-center justify-center overflow-hidden rounded-2xl border border-sky-200 bg-gradient-to-b from-sky-300 via-sky-200 to-white px-1 py-2 text-center text-[9px] font-black leading-tight text-sky-900 shadow-sm shadow-sky-900/10 ring-1 ring-white/70 transition hover:-translate-y-0.5 hover:border-sky-300 hover:from-sky-200 hover:via-cyan-100 hover:to-white hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 dark:border-sky-400/45 dark:from-sky-500/35 dark:via-sky-400/20 dark:to-zinc-950 dark:text-sky-50 dark:ring-sky-200/20"
              title={hasCloudAgent
                ? (zh ? '已创建 Cloud Agent；点击可查看限制提示' : 'Cloud Agent already exists; click for details')
                : (zh ? '新建 Agent，需要 Pro 账户' : 'New Agent, requires Pro')}
            >
              <span className="absolute -left-3 bottom-2 h-5 w-10 rounded-full bg-white/80 blur-[1px]" />
              <span className="absolute -right-4 top-2 h-6 w-12 rounded-full bg-white/70 blur-[1px]" />
              <span className="relative mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-white/85 text-sky-500 shadow-sm ring-1 ring-sky-100 dark:bg-white/90 dark:text-sky-600">
                <Cloud className="h-5 w-5" />
              </span>
              <span className="relative">{zh ? '新建' : 'New'}</span>
              <span className="relative">Agent</span>
            </button>
          )}

          <button
            type="button"
            onClick={openBindAgentModal}
            className="flex w-full flex-col items-center justify-center rounded-2xl border border-emerald-200 bg-white/75 px-1 py-2 text-center text-[9px] font-black leading-tight text-emerald-800 shadow-sm ring-1 ring-white/60 transition hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-50 hover:shadow-md dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100 dark:ring-emerald-500/10 dark:hover:bg-emerald-500/15"
            title={zh ? '生成 agent_id/token，并在自己的主机上启动 wtt-connect' : 'Generate agent_id/token and run wtt-connect on your own host'}
          >
            <span className="mb-1 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shadow-sm ring-1 ring-emerald-200 dark:bg-emerald-400/15 dark:text-emerald-200 dark:ring-emerald-400/25">
              <Radio className="h-4 w-4" />
            </span>
            <span>{zh ? '绑定已有' : 'Bind'}</span>
            <span>Agent</span>
          </button>

          <button
            type="button"
            onClick={openGroupModal}
            className="flex w-full flex-col items-center justify-center rounded-2xl border border-amber-200 bg-white/75 px-1 py-2 text-center text-[9px] font-black leading-tight text-amber-800 shadow-sm ring-1 ring-white/60 transition hover:-translate-y-0.5 hover:border-amber-300 hover:bg-amber-50 hover:shadow-md dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100 dark:ring-amber-500/10 dark:hover:bg-amber-500/15"
            title={zh ? '选择已绑定 Agent，直接创建一个群聊 Topic' : 'Select bound agents and create a group topic'}
          >
            <span className="mb-1 flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-amber-600 shadow-sm ring-1 ring-amber-200 dark:bg-amber-400/15 dark:text-amber-200 dark:ring-amber-400/25">
              <Users className="h-4 w-4" />
            </span>
            <span>{zh ? '新建群聊' : 'New Group'}</span>
          </button>

          <button
            type="button"
            onClick={openTeamModal}
            disabled={!onNewAgentFromHost || newAgentHosts.length === 0}
            className="flex w-full flex-col items-center justify-center rounded-2xl border border-fuchsia-200 bg-white/75 px-1 py-2 text-center text-[9px] font-black leading-tight text-fuchsia-800 shadow-sm ring-1 ring-white/60 transition hover:-translate-y-0.5 hover:border-fuchsia-300 hover:bg-fuchsia-50 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 dark:border-fuchsia-500/30 dark:bg-fuchsia-500/10 dark:text-fuchsia-100 dark:ring-fuchsia-500/10 dark:hover:bg-fuchsia-500/15"
            title={zh ? '选择团队模板，在在线主机中 clone 多个专业 Agent 并创建协作群聊' : 'Choose a team template, clone role agents on an online host, and create a collaboration topic'}
          >
            <span className="mb-1 flex h-7 w-7 items-center justify-center rounded-full bg-fuchsia-100 text-fuchsia-600 shadow-sm ring-1 ring-fuchsia-200 dark:bg-fuchsia-400/15 dark:text-fuchsia-200 dark:ring-fuchsia-400/25">
              <Crown className="h-4 w-4" />
            </span>
            <span>{zh ? '新建团队' : 'New Team'}</span>
          </button>

          {agentOptions.length === 0 && (
            <div className="rounded-xl border border-dashed border-[#ded6c8] bg-white/55 p-2 text-center text-[10px] text-slate-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
              {zh ? '无 Agent' : 'No agents'}
            </div>
          )}

          {agentFolders.map((folder) => {
            const collapsed = collapsedAgentFolders[folder.key] ?? true
            const onlineCount = folder.agents.filter((agent) => isAgentOnline(agent.agent_id)).length
            const folderTone = hostFolderTone(folder.key)
            const cloudHostIds = Array.from(new Set(folder.agents
              .map((agent) => cloudHostAgentIdForAgent(agent, displayRuntimeMap?.[agent.agent_id]))
              .filter(Boolean)))
            const folderCloudHostId = cloudHostIds.length === 1 ? cloudHostIds[0] : ''
            const folderMenuOpen = folderMenuFor === folder.key
            const wakeBusy = Boolean(folderCloudHostId && sandboxActionFor === `${folderCloudHostId}:wake`)
            const sleepBusy = Boolean(folderCloudHostId && sandboxActionFor === `${folderCloudHostId}:sleep`)
            const sandboxActionBusy = wakeBusy || sleepBusy
            const folderSelected = folder.agents.some((agent) => agent.agent_id === selectedAgentId)
            const folderInitial = (folder.label.trim()[0] || '?').toUpperCase()
            return (
              <section key={folder.key} className="space-y-1">
                <button
                  type="button"
                  aria-current={folderSelected ? 'true' : undefined}
                  onClick={() => setCollapsedAgentFolders((prev) => ({ ...prev, [folder.key]: !collapsed }))}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    setTopicMenuFor(null)
                    setAgentMenuFor(null)
                    setFolderMenuFor(folder.key)
                  }}
                  className={`group relative flex w-full items-center gap-1 overflow-hidden rounded-xl border px-1 py-1.5 text-left shadow-sm ring-1 transition hover:-translate-y-0.5 hover:shadow-md ${
                    folderSelected
                      ? `scale-[1.01] border-slate-900 shadow-[0_0_0_2px_rgba(15,23,42,0.18),0_8px_18px_rgba(15,23,42,0.14)] ring-2 ring-slate-900/60 dark:border-sky-200 dark:shadow-[0_0_0_2px_rgba(125,211,252,0.28),0_8px_18px_rgba(14,165,233,0.18)] dark:ring-sky-200/75 ${folderTone.shell}`
                      : folderTone.shell
                  }`}
                  title={[folder.label, folder.subtitle, folderCloudHostId ? (zh ? '右键管理 Sandbox' : 'Right-click to manage Sandbox') : ''].filter(Boolean).join(' · ')}
                >
                  <span className={`absolute inset-y-1 left-0 w-1 rounded-r-full bg-gradient-to-b ${folderTone.icon}`} />
                  {folderSelected && (
                    <span className="absolute inset-0 bg-white/28 dark:bg-white/[0.04]" />
                  )}
                  <span className="relative z-10 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md bg-white/55 text-slate-700 shadow-sm ring-1 ring-white/60 dark:bg-zinc-950/45 dark:text-zinc-200 dark:ring-white/10">
                    {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </span>
                  <span className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[11px] font-black leading-none ring-1 ring-white/60 ${folderTone.icon}`}>
                    {folderInitial}
                  </span>
                  <span className={`relative z-10 min-w-0 flex-1 truncate rounded-full px-1 py-0.5 text-center text-[8px] font-black leading-none ${folderTone.badge}`}>
                    {onlineCount}/{folder.agents.length}
                  </span>
                </button>

                {folderMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setFolderMenuFor(null)} />
                    <div
                      className="fixed z-50 w-56 rounded-2xl border border-[#ded6c8] bg-[#fffdf8] p-2 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
                      style={{
                        left: 'var(--wtt-agent-rail-width)',
                        top: 'calc(var(--wtt-topbar-height) + 1rem)',
                      }}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="px-2 pb-2">
                        <div className="truncate text-xs font-black text-slate-700 dark:text-zinc-100" title={folder.label}>
                          {folder.label}
                        </div>
                        <div className="mt-0.5 truncate text-[10px] font-semibold text-slate-400 dark:text-zinc-500" title={folderCloudHostId || undefined}>
                          {folderCloudHostId || (cloudHostIds.length > 1
                            ? (zh ? '该目录包含多个 Sandbox' : 'Multiple Sandboxes in this folder')
                            : (zh ? '非 Cloud Sandbox 目录' : 'Not a Cloud Sandbox folder'))}
                        </div>
                      </div>
                      {folderCloudHostId ? (
                        <>
                          <button
                            type="button"
                            disabled={!onWakeSandbox || sandboxActionBusy}
                            onClick={() => {
                              void runSandboxFolderAction(folderCloudHostId, 'wake')
                            }}
                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-sky-700 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-sky-300 dark:hover:bg-sky-500/10"
                          >
                            {wakeBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                            {wakeBusy ? (zh ? '正在开机...' : 'Powering on...') : (zh ? '开机 Sandbox' : 'Power On Sandbox')}
                          </button>
                          <button
                            type="button"
                            disabled={!onSleepSandbox || sandboxActionBusy}
                            onClick={() => {
                              void runSandboxFolderAction(folderCloudHostId, 'sleep')
                            }}
                            className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-amber-700 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-amber-300 dark:hover:bg-amber-500/10"
                          >
                            {sleepBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
                            {sleepBusy ? (zh ? '正在关机...' : 'Powering off...') : (zh ? '关机 Sandbox' : 'Power Off Sandbox')}
                          </button>
                          {sandboxActionBusy && (
                            <div className="mt-2 rounded-xl bg-sky-50 px-3 py-2 text-[11px] font-semibold text-sky-700 dark:bg-sky-500/10 dark:text-sky-200">
                              {wakeBusy
                                ? (zh ? '正在开机 Sandbox 并等待 Agent 在线。' : 'Powering on Sandbox and waiting for the agent to come online.')
                                : (zh ? '正在关机 Sandbox 并等待 Agent 离线。' : 'Powering off Sandbox and waiting for the agent to go offline.')}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500 dark:bg-zinc-800 dark:text-zinc-400">
                          {zh ? '只有 Cloud Agent Sandbox 目录支持开机/关机。' : 'Only Cloud Agent Sandbox folders support power on/off.'}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {!collapsed && folder.agents.map((agent) => {
                  const selected = agent.agent_id === selectedAgentId
                  const online = isAgentOnline(agent.agent_id)
                  const role = agentRoleTemplateMap?.[agent.agent_id] || getAgentRoleTemplate(agentRoleMap?.[agent.agent_id])
                  const tone = roleTone(agent.agent_id, role)
                  const runtime = displayRuntimeMap?.[agent.agent_id]
                  const runtimeText = formatRuntime(runtime)
                  const hoverTitle = agentTooltip(agent, role, runtime)
                  const menuOpen = agentMenuFor === agent.agent_id

                  return (
              <div key={agent.agent_id} className="relative">
                <button
                  type="button"
                  onClick={() => {
                    onSelectAgent?.(agent.agent_id)
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    setAgentMenuFor(agent.agent_id)
                  }}
                  title={hoverTitle}
                  className={`group flex w-full flex-col items-center justify-center rounded-lg border px-1 py-1 text-center transition ${
                    selected
                      ? `${tone.selected} relative scale-[1.03] border-slate-950 shadow-[0_0_0_1px_rgba(15,23,42,0.18),0_6px_14px_rgba(15,23,42,0.14)] ring-2 ring-slate-950/65 dark:border-cyan-200 dark:shadow-[0_0_0_1px_rgba(103,232,249,0.22),0_6px_14px_rgba(8,145,178,0.18)] dark:ring-cyan-200/70`
                      : `border-transparent bg-white/55 dark:bg-zinc-900/60 ${tone.idle}`
                  }`}
                >
                  {selected && (
                    <span className="absolute -right-1 -top-1 z-10 rounded-full bg-slate-950 px-1 py-0.5 text-[6px] font-black uppercase leading-none tracking-[0.08em] text-white shadow-sm dark:bg-cyan-200 dark:text-slate-950">
                      Active
                    </span>
                  )}
                  <span className={`relative flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[8px] font-black shadow-sm ring-1 ${tone.avatar} ${selected ? 'ring-slate-950/75 dark:ring-white/80' : tone.ring}`}>
                    {agentInitial(agent.display_name)}
                    <span
                      className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-[#f6f3ed] dark:border-zinc-950 ${
                        online ? 'bg-emerald-400' : 'bg-slate-300 dark:bg-zinc-600'
                      }`}
                    />
                  </span>
                  <span className={`mt-0.5 max-w-full truncate text-[8px] font-black leading-none ${tone.label}`} title={hoverTitle}>
                    {role.shortLabel}
                  </span>

                  <span className="hidden min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-black text-slate-800 dark:text-zinc-100">
                        {agent.display_name || agent.agent_id}
                      </span>
                      <span className="shrink-0 rounded-full bg-[#dfe8d8] px-2 py-0.5 text-[10px] font-black text-[#46624b] dark:bg-emerald-500/15 dark:text-emerald-200">
                        {role.shortLabel}
                      </span>
                    </span>
                    {runtimeText && (
                      <span
                        className="mt-0.5 block truncate text-[10px] font-semibold text-slate-400 dark:text-zinc-500"
                        title={displayRuntimeMap?.[agent.agent_id]?.workdir || runtimeText}
                      >
                        {runtimeText}
                      </span>
                    )}
                  </span>

                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(event) => {
                      event.stopPropagation()
                      setAgentMenuFor(menuOpen ? null : agent.agent_id)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        event.stopPropagation()
                        setAgentMenuFor(menuOpen ? null : agent.agent_id)
                      }
                    }}
                    className="hidden rounded-lg p-1 text-slate-400 opacity-70 transition hover:bg-[#f6f0e5] hover:text-slate-700 group-hover:opacity-100 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                    title={zh ? 'Agent 设置' : 'Agent settings'}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </span>
                </button>

                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setAgentMenuFor(null)} />
                    <div
                      className="fixed z-50 overflow-y-auto rounded-2xl border border-[#ded6c8] bg-[#fffdf8] p-2 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
                      style={{
                        left: 'var(--wtt-agent-rail-width)',
                        top: 'calc(var(--wtt-topbar-height) + 1rem)',
                        maxHeight: 'calc(100dvh - var(--wtt-topbar-height) - 2rem)',
                        width: 'min(280px, calc(100vw - var(--wtt-agent-rail-width) - 16px))',
                      }}
                    >
                      <div className="px-2 pb-2 text-xs font-black uppercase tracking-[0.18em] text-slate-400 dark:text-zinc-500">
                        {zh ? '角色模板' : 'Role Templates'}
                      </div>
                      <div className="max-h-[50vh] overflow-y-auto">
                        {AGENT_ROLE_TEMPLATES.map((template) => {
                          const active = template.id === role.id
                          const displayDescription = active ? role.description : template.description
                          return (
                          <button
                            key={template.id}
                            type="button"
                            onContextMenu={(event) => {
                              event.preventDefault()
                              setRoleEditor({
                                agentId: agent.agent_id,
                                sourceRole: template,
                                label: template.label,
                                description: (active ? role.description : template.description) || template.description,
                                custom: false,
                              })
                            }}
                            onClick={() => {
                              onAssignAgentRole?.(agent.agent_id, template.id)
                              setAgentMenuFor(null)
                            }}
                            className={`w-full rounded-xl px-3 py-2 text-left transition ${
                              active
                                ? 'bg-[#e6f1df] text-[#385b3d] dark:bg-emerald-500/15 dark:text-emerald-200'
                                : 'text-slate-600 hover:bg-[#f3eee5] dark:text-zinc-300 dark:hover:bg-zinc-800'
                            }`}
                          >
                            <span className="block truncate text-sm font-black" title={template.label}>{template.label}</span>
                            <span className="mt-0.5 block line-clamp-2 text-xs opacity-75" title={displayDescription}>{displayDescription}</span>
                          </button>
                          )
                        })}
                        {role.id.startsWith('custom-') && (
                          <button
                            type="button"
                            onContextMenu={(event) => {
                              event.preventDefault()
                              setRoleEditor({
                                agentId: agent.agent_id,
                                sourceRole: role,
                                label: role.label,
                                description: role.description,
                                custom: false,
                              })
                            }}
                            onClick={() => {
                              setRoleEditor({
                                agentId: agent.agent_id,
                                sourceRole: role,
                                label: role.label,
                                description: role.description,
                                custom: false,
                              })
                            }}
                            className="w-full rounded-xl bg-[#e6f1df] px-3 py-2 text-left text-[#385b3d] transition dark:bg-emerald-500/15 dark:text-emerald-200"
                          >
                            <span className="block truncate text-sm font-black" title={role.label}>{role.label}</span>
                            <span className="mt-0.5 block line-clamp-2 text-xs opacity-75" title={role.description}>{role.description}</span>
                          </button>
                        )}
                      </div>

                      {onSaveAgentRole && (
                        <div className="mt-2 border-t border-[#eee6da] pt-2 dark:border-zinc-800">
                          <button
                            type="button"
                            onClick={() => {
                              setRoleEditor({
                                agentId: agent.agent_id,
                                label: '',
                                description: '',
                                custom: true,
                              })
                            }}
                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-sky-700 transition hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-500/10"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            {zh ? '新增自定义角色' : 'Add custom role'}
                          </button>
                          <p className="px-3 pt-1 text-[10px] text-slate-400 dark:text-zinc-500">
                            {zh ? '右键已有角色可编辑当前 Agent 的角色描述。' : 'Right-click a role to edit this agent role description.'}
                          </p>
                        </div>
                      )}

                      {((userToken && isAgentOnline(agent.agent_id)) || onRenameAgent || onUnclaimAgent) && (
                        <div className="mt-2 border-t border-[#eee6da] pt-2 dark:border-zinc-800">
                          {userToken && isAgentOnline(agent.agent_id) && (
                            <button
                              type="button"
                              onClick={() => {
                                setShellAgent(agent)
                                setAgentMenuFor(null)
                              }}
                              className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-600 transition hover:bg-[#f3eee5] dark:text-zinc-300 dark:hover:bg-zinc-800"
                            >
                              {zh ? '打开 Terminal' : 'Open Terminal'}
                            </button>
                          )}
                          {onRenameAgent && (
                            <button
                              type="button"
                              onClick={() => {
                                onRenameAgent(agent.agent_id, agent.display_name)
                                setAgentMenuFor(null)
                              }}
                              className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-600 transition hover:bg-[#f3eee5] dark:text-zinc-300 dark:hover:bg-zinc-800"
                            >
                              {zh ? '重命名 Agent' : 'Rename Agent'}
                            </button>
                          )}
                          {onUnclaimAgent && (
                            <button
                              type="button"
                              onClick={() => {
                                onUnclaimAgent(agent.agent_id)
                                setAgentMenuFor(null)
                              }}
                              className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-red-500 transition hover:bg-red-50 dark:hover:bg-red-500/10"
                            >
                              {t('agent.unclaim')}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
                  )
                })}
              </section>
            )
          })}
        </div>

        {newAgentHosts.length > 0 && (
          <div className="space-y-1.5 border-t border-[#e7e1d7] p-1.5 dark:border-zinc-800">
            <button
              type="button"
              onClick={openNewAgentModal}
              className="flex w-full flex-col items-center justify-center rounded-xl border border-emerald-400 bg-gradient-to-b from-emerald-500 to-teal-600 px-1 py-2 text-center text-[9px] font-black leading-tight text-white shadow-md shadow-emerald-900/15 ring-1 ring-emerald-200 transition hover:from-emerald-400 hover:to-teal-500 hover:shadow-lg dark:border-emerald-400/60 dark:from-emerald-500 dark:to-teal-600 dark:ring-emerald-400/25"
              title={zh ? '克隆当前在线 Codex / Claude Code 主机上的 Agent' : 'Clone an agent on an online Codex / Claude Code host'}
            >
              <Plus className="mb-1 h-4 w-4" />
              <span>Clone</span>
              <span>Agent</span>
            </button>
          </div>
        )}
      </aside>

      {onStartAgentResize && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize agent column"
          title={zh ? '拖拽调整 Agent 栏宽度' : 'Drag to resize agents'}
          onPointerDown={onStartAgentResize}
          className="group relative z-10 hidden w-1.5 shrink-0 cursor-col-resize items-stretch justify-center bg-[#e1d6c5] transition hover:bg-emerald-300 dark:bg-zinc-800 dark:hover:bg-emerald-500 md:flex"
        >
          <span className="my-auto h-10 w-0.5 rounded-full bg-[#a99d8d] opacity-0 transition group-hover:opacity-100 dark:bg-zinc-500" />
        </div>
      )}

      <aside className="flex w-[var(--wtt-topic-rail-width)] shrink-0 flex-col border-r border-[#e3ddd2] bg-[#fbfaf7] text-slate-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
        <div className={`flex items-center justify-between border-b border-[#e7e1d7] dark:border-zinc-800 ${compactLayout ? 'px-2 py-2' : 'px-3 py-3'}`}>
          <div>
            <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400 dark:text-zinc-500">
              Topics
            </div>
            <div className={`mt-1 text-sm font-semibold text-slate-600 dark:text-zinc-300 ${compactLayout ? 'hidden 2xl:block' : ''}`}>
              {zh ? '当前 Agent 的会话上下文' : 'Contexts for selected agent'}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {onCreateGeneralTask && (
              <button
                type="button"
                onClick={onCreateGeneralTask}
                className="rounded-lg border border-[#ded6c8] bg-white/80 p-1.5 text-slate-500 transition hover:bg-white hover:text-slate-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                title={zh ? '新建任务' : 'New task'}
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
            {onToggleSidebar && (
              <button
                type="button"
                onClick={onToggleSidebar}
                className="rounded-lg border border-[#ded6c8] bg-white/80 px-2 py-1.5 text-xs font-black text-slate-500 transition hover:bg-white hover:text-slate-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                title={zh ? '收起侧栏' : 'Collapse sidebar'}
              >
                {'<<'}
              </button>
            )}
          </div>
        </div>

        <div className={`min-h-0 flex-1 overflow-y-auto ${compactLayout ? 'p-1.5' : 'p-2.5'}`}>
          {!selectedAgentId && (
            <div className="rounded-2xl border border-dashed border-[#ded6c8] bg-white/60 p-4 text-sm text-slate-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
              {zh ? '先选择一个 Agent。' : 'Select an agent first.'}
            </div>
          )}

          {selectedAgentId && topics.length === 0 && (
            <div className="rounded-2xl border border-dashed border-[#ded6c8] bg-white/60 p-4 text-sm text-slate-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
              {zh ? '当前 Agent 暂无普通 topic。' : 'No regular topics for this agent.'}
            </div>
          )}

          <div className="space-y-3">
            {groupedTopics.map(({ group, items }) => {
              const collapsed = collapsedGroups[group]
              const GroupIcon = getGroupIcon(group)
              const unreadTopics = items.filter((topic) => Number(topic.unread_count || 0) > 0).length
              return (
                <section key={group} className="space-y-1.5">
                  <button
                    type="button"
                    onClick={() => setCollapsedGroups((prev) => ({ ...prev, [group]: !prev[group] }))}
                    className={`flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left shadow-sm transition hover:brightness-[0.98] ${getGroupTone(group)}`}
                  >
                    {collapsed ? <ChevronRight className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/70 dark:bg-zinc-950/40">
                      <GroupIcon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-black">
                      {getGroupLabel(group, zh)}
                    </span>
                    <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-black dark:bg-zinc-950/40">
                      {items.length}
                    </span>
                    {unreadTopics > 0 && (
                      <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-black leading-none text-white">
                        {unreadTopics > 99 ? '99+' : unreadTopics}
                      </span>
                    )}
                  </button>

                  {!collapsed && (
                    <div className="space-y-1.5">
                      {items.length > 0 ? (
                        items.map((topic) => renderTopicRow(topic))
                      ) : (
                        <div className="rounded-xl border border-dashed border-[#ded6c8] bg-white/45 px-3 py-2 text-xs font-semibold text-slate-400 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-500">
                          {zh ? '暂无该类型 topic' : 'No topics in this group'}
                        </div>
                      )}
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        </div>
      </aside>

      {roleEditor && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 p-4">
          <div className="w-full max-w-md rounded-2xl border border-[#ded6c8] bg-[#fffdf8] p-4 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
            <div className="mb-3">
              <h3 className="text-sm font-black text-slate-900 dark:text-zinc-100">
                {roleEditor.custom ? (zh ? '新增自定义角色' : 'Add Custom Role') : (zh ? '编辑角色描述' : 'Edit Role Description')}
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
                {zh ? '保存后会同步到后端，并在该 Agent 下一次执行时作为隐式角色提示。' : 'Saved changes sync to the backend and are injected on the next agent action.'}
              </p>
            </div>
            <label className="mb-3 block">
              <span className="mb-1 block text-xs font-black text-slate-500 dark:text-zinc-400">{zh ? '角色名称' : 'Role name'}</span>
              <input
                value={roleEditor.label}
                disabled={!roleEditor.custom}
                onChange={(event) => setRoleEditor((prev) => prev ? { ...prev, label: event.target.value } : prev)}
                placeholder={zh ? '例如：Linux 内核专家' : 'e.g. Linux Kernel Expert'}
                className="w-full rounded-xl border border-[#ded6c8] bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition focus:border-sky-400 disabled:bg-slate-100 disabled:text-slate-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:disabled:bg-zinc-800"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-black text-slate-500 dark:text-zinc-400">{zh ? '角色描述' : 'Role description'}</span>
              <textarea
                value={roleEditor.description}
                onChange={(event) => setRoleEditor((prev) => prev ? { ...prev, description: event.target.value } : prev)}
                rows={5}
                placeholder={zh ? '描述这个 Agent 应该关注的领域、判断标准、输出风格和边界。' : 'Describe focus areas, decision criteria, output style, and boundaries.'}
                className="w-full resize-none rounded-xl border border-[#ded6c8] bg-white px-3 py-2 text-sm leading-6 text-slate-800 outline-none transition focus:border-sky-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRoleEditor(null)}
                className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                {zh ? '取消' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={saveRoleEditor}
                disabled={!roleEditor.label.trim() || !roleEditor.description.trim()}
                className="rounded-xl bg-sky-600 px-3 py-2 text-sm font-black text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {zh ? '保存并同步' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {groupOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 p-4">
          <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-amber-200 bg-[#fffdf8] p-4 shadow-2xl dark:border-amber-500/30 dark:bg-zinc-900">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-zinc-100">{zh ? '新建群聊' : 'New Group Chat'}</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-zinc-400">
                  {zh ? '选择你已绑定在各个主机上的 Agent，直接创建一个私有协作 Topic。' : 'Select your bound agents across hosts and create a private collaboration topic.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setGroupOpen(false)}
                disabled={groupBusy}
                className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 disabled:opacity-60 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                {zh ? '关闭' : 'Close'}
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-black text-slate-500 dark:text-zinc-400">{zh ? '群聊名称' : 'Group name'}</span>
                <input
                  value={groupName}
                  onChange={(event) => setGroupName(event.target.value)}
                  disabled={groupBusy}
                  className="w-full rounded-xl border border-[#ded6c8] bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition focus:border-amber-400 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-black text-slate-500 dark:text-zinc-400">{zh ? '说明' : 'Description'}</span>
                <input
                  value={groupDesc}
                  onChange={(event) => setGroupDesc(event.target.value)}
                  disabled={groupBusy}
                  className="w-full rounded-xl border border-[#ded6c8] bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition focus:border-amber-400 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </label>
            </div>

            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-black text-slate-500 dark:text-zinc-400">{zh ? '选择 Agent' : 'Select agents'}</span>
                <button
                  type="button"
                  onClick={() => setGroupAgentIds(agentOptions.slice(0, MAX_GROUP_AGENTS).map((agent) => agent.agent_id))}
                  disabled={groupBusy || agentOptions.length === 0}
                  className="text-xs font-black text-amber-700 transition hover:text-amber-500 disabled:opacity-50 dark:text-amber-300"
                >
                  {zh ? `全选前 ${Math.min(agentOptions.length, MAX_GROUP_AGENTS)} 个` : `Select first ${Math.min(agentOptions.length, MAX_GROUP_AGENTS)}`}
                </button>
              </div>
              <p className="mb-2 text-[11px] font-semibold text-slate-400 dark:text-zinc-500">
                {zh
                  ? `已选 ${groupAgentIds.length}/${MAX_GROUP_AGENTS} 个。大量 Agent 会增加消息扇出成本，建议只拉入本次需要协作的 Agent。`
                  : `Selected ${groupAgentIds.length}/${MAX_GROUP_AGENTS}. Large groups increase fan-out cost; invite only agents needed for this task.`}
              </p>
              <div className="grid max-h-[38vh] gap-2 overflow-y-auto sm:grid-cols-2">
                {agentOptions.map((agent) => {
                  const checked = groupAgentIds.includes(agent.agent_id)
                  const runtime = displayRuntimeMap?.[agent.agent_id]
                  const role = agentRoleTemplateMap?.[agent.agent_id] || getAgentRoleTemplate(agentRoleMap?.[agent.agent_id])
                  return (
                    <button
                      key={agent.agent_id}
                      type="button"
                      disabled={groupBusy}
                      onClick={() => toggleGroupAgent(agent.agent_id)}
                      className={`rounded-xl border px-3 py-2 text-left transition ${
                        checked
                          ? 'border-amber-300 bg-amber-50 text-amber-900 ring-2 ring-amber-100 dark:border-amber-500/45 dark:bg-amber-500/15 dark:text-amber-100 dark:ring-amber-500/20'
                          : 'border-[#eee6da] bg-white/70 text-slate-600 hover:border-amber-200 hover:bg-amber-50/60 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-300 dark:hover:border-amber-500/30 dark:hover:bg-amber-500/10'
                      }`}
                    >
                      <span className="block truncate text-sm font-black">{agent.display_name || agent.agent_id}</span>
                      <span className="mt-1 block truncate text-[11px] leading-4 opacity-75">
                        {role.shortLabel} · {runtime?.hostname || (zh ? '未知主机' : 'Unknown host')}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {groupError && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                {groupError}
              </div>
            )}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setGroupOpen(false)}
                disabled={groupBusy}
                className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 disabled:opacity-60 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                {zh ? '取消' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => void createGroupChat()}
                disabled={groupBusy || groupAgentIds.length === 0 || !groupName.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-3 py-2 text-sm font-black text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {groupBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                {groupBusy ? (zh ? '创建中...' : 'Creating...') : (zh ? '创建群聊' : 'Create group')}
              </button>
            </div>
          </div>
        </div>
      )}

      {teamOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 p-4">
          <div className="max-h-[88vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-fuchsia-200 bg-[#fffdf8] p-4 shadow-2xl dark:border-fuchsia-500/30 dark:bg-zinc-900">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-zinc-100">{zh ? '新建团队' : 'New Team'}</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-zinc-400">
                  {zh ? '选择团队模板后，系统会在同一主机 clone 最多 5 个专业 Agent，并创建一个协作群聊。' : 'Choose a template. WTT clones up to 5 role agents on one host and creates a collaboration topic.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTeamOpen(false)}
                disabled={teamBusy}
                className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 disabled:opacity-60 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                {zh ? '关闭' : 'Close'}
              </button>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <div>
                <div className="mb-2 text-xs font-black text-slate-500 dark:text-zinc-400">{zh ? '团队模板' : 'Team template'}</div>
                <div className="grid max-h-[42vh] gap-2 overflow-y-auto sm:grid-cols-2">
                  {TEAM_TEMPLATES.map((template) => {
                    const active = template.id === teamTemplateId
                    const roleNames = template.roles.slice(0, 5).map((roleId) => getAgentRoleTemplate(roleId).shortLabel).join(' / ')
                    return (
                      <button
                        key={template.id}
                        type="button"
                        disabled={teamBusy}
                        onClick={() => {
                          setTeamTemplateId(template.id)
                          setTeamName(zh ? template.title : template.titleEn)
                        }}
                        className={`rounded-2xl border p-3 text-left transition ${
                          active
                            ? 'border-fuchsia-300 bg-fuchsia-50 text-fuchsia-900 ring-2 ring-fuchsia-100 dark:border-fuchsia-500/45 dark:bg-fuchsia-500/15 dark:text-fuchsia-100 dark:ring-fuchsia-500/20'
                            : 'border-[#eee6da] bg-white/70 text-slate-600 hover:border-fuchsia-200 hover:bg-fuchsia-50/60 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-300 dark:hover:border-fuchsia-500/30 dark:hover:bg-fuchsia-500/10'
                        }`}
                      >
                        <span className="block text-sm font-black">{zh ? template.title : template.titleEn}</span>
                        <span className="mt-1 block line-clamp-2 text-[11px] leading-4 opacity-75">{zh ? template.description : template.descriptionEn}</span>
                        <span className="mt-2 block truncate text-[10px] font-black uppercase tracking-wide opacity-60">{roleNames}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-black text-slate-500 dark:text-zinc-400">{zh ? '团队名称' : 'Team name'}</span>
                  <input
                    value={teamName}
                    onChange={(event) => setTeamName(event.target.value)}
                    disabled={teamBusy}
                    className="w-full rounded-xl border border-[#ded6c8] bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition focus:border-fuchsia-400 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-black text-slate-500 dark:text-zinc-400">{zh ? '运行主机' : 'Host'}</span>
                  <select
                    value={teamHostId}
                    onChange={(event) => {
                      const hostId = event.target.value
                      setTeamHostId(hostId)
                      setTeamAdapter((normalizeNewAgentAdapter(agentRuntimeMap?.[hostId]) || 'claude-code') as 'claude-code' | 'codex' | 'gemini')
                    }}
                    disabled={teamBusy || newAgentHosts.length === 0}
                    className="w-full rounded-xl border border-[#ded6c8] bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition focus:border-fuchsia-400 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  >
                    {newAgentHosts.length === 0 ? (
                      <option value="">{zh ? '没有在线可 clone 主机' : 'No online clone host'}</option>
                    ) : newAgentHosts.map((agent) => {
                      const runtime = displayRuntimeMap?.[agent.agent_id]
                      const adapter = normalizeNewAgentAdapter(runtime)
                      return (
                        <option key={agent.agent_id} value={agent.agent_id}>
                          {[agent.display_name || agent.agent_id, adapter, runtime?.hostname].filter(Boolean).join(' · ')}
                        </option>
                      )
                    })}
                  </select>
                </label>

                <div>
                  <div className="mb-2 text-xs font-black text-slate-500 dark:text-zinc-400">Adapter</div>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      ['claude-code', 'Claude'],
                      ['codex', 'Codex'],
                      ['gemini', 'Gemini'],
                    ] as const).map(([id, label]) => {
                      const active = teamAdapter === id
                      return (
                        <button
                          key={id}
                          type="button"
                          disabled={teamBusy}
                          onClick={() => setTeamAdapter(id)}
                          className={`rounded-xl border px-2 py-2 text-xs font-black transition ${
                            active
                              ? 'border-fuchsia-300 bg-fuchsia-50 text-fuchsia-800 dark:border-fuchsia-500/45 dark:bg-fuchsia-500/15 dark:text-fuchsia-100'
                              : 'border-[#eee6da] bg-white/70 text-slate-600 hover:bg-[#f3eee5] dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-300 dark:hover:bg-zinc-800'
                          }`}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {selectedTeamTemplate && (
                  <div className="rounded-2xl border border-fuchsia-100 bg-fuchsia-50/70 p-3 text-xs leading-5 text-fuchsia-900 dark:border-fuchsia-500/20 dark:bg-fuchsia-500/10 dark:text-fuchsia-100">
                    <p className="font-black">{zh ? '工作流' : 'Workflow'}</p>
                    <div className="mt-1 space-y-1">
                      {selectedTeamTemplate.workflow.map((step, index) => (
                        <p key={step}>{index + 1}. {step}</p>
                      ))}
                    </div>
                  </div>
                )}

                {teamProgress && (
                  <div className="rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-200">
                    {teamProgress}
                  </div>
                )}
                {teamError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                    {teamError}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setTeamOpen(false)}
                    disabled={teamBusy}
                    className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 disabled:opacity-60 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  >
                    {zh ? '取消' : 'Cancel'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void createTeamFromTemplate()}
                    disabled={teamBusy || !teamHostId || !teamName.trim() || !onNewAgentFromHost}
                    className="inline-flex items-center gap-2 rounded-xl bg-fuchsia-600 px-3 py-2 text-sm font-black text-white transition hover:bg-fuchsia-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {teamBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                    {teamBusy ? (zh ? '创建中...' : 'Creating...') : (zh ? '创建团队' : 'Create team')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {bindAgentOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 p-4">
          <div className="max-h-[88vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-emerald-200 bg-[#fffdf8] p-4 shadow-2xl dark:border-emerald-500/30 dark:bg-zinc-900">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-zinc-100">
                  {zh ? '绑定已有 Agent' : 'Bind Existing Agent'}
                </h3>
                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-zinc-400">
                  {zh
                    ? '生成一组 agent_id 和 token，然后在你自己的电脑、服务器或 Mac mini 上复制执行 wtt-connect 命令。'
                    : 'Generate an agent_id/token pair, then run one wtt-connect command on your own computer, server, or Mac mini.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBindAgentOpen(false)}
                disabled={bindAgentBusy}
                className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 disabled:opacity-60 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                {zh ? '关闭' : 'Close'}
              </button>
            </div>

            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3 dark:border-emerald-500/20 dark:bg-emerald-500/10">
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={bindAgentDisplayName}
                  onChange={(event) => setBindAgentDisplayName(event.target.value)}
                  disabled={bindAgentBusy || Boolean(bindAgentCreds)}
                  placeholder={zh ? 'Agent 显示名（可选）' : 'Agent display name (optional)'}
                  className="min-w-0 flex-1 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition focus:border-emerald-400 disabled:opacity-60 dark:border-emerald-500/30 dark:bg-zinc-950 dark:text-zinc-100"
                />
                <button
                  type="button"
                  onClick={() => void createSelfManagedAgentBinding()}
                  disabled={bindAgentBusy || Boolean(bindAgentCreds)}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {bindAgentBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {bindAgentCreds
                    ? (zh ? '凭证已生成' : 'Credentials created')
                    : bindAgentBusy
                      ? (zh ? '生成中...' : 'Creating...')
                      : (zh ? '生成 agent_id / token' : 'Generate agent_id / token')}
                </button>
              </div>
              {bindAgentError && (
                <div className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                  {bindAgentError}
                </div>
              )}
            </div>

            {!bindAgentCreds ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-[#eee6da] bg-white/70 p-3 dark:border-zinc-800 dark:bg-zinc-950/60">
                  <p className="text-xs font-black text-slate-700 dark:text-zinc-200">{zh ? '第一步' : 'Step 1'}</p>
                  <p className="mt-1 text-sm font-black text-slate-900 dark:text-zinc-100">npm install -g wtt-connect</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-zinc-400">
                    {zh ? '在要运行 Agent 的那台主机上安装。' : 'Run this on the host where the Agent should live.'}
                  </p>
                </div>
                <div className="rounded-xl border border-[#eee6da] bg-white/70 p-3 dark:border-zinc-800 dark:bg-zinc-950/60">
                  <p className="text-xs font-black text-slate-700 dark:text-zinc-200">{zh ? '第二步' : 'Step 2'}</p>
                  <p className="mt-1 text-sm font-black text-slate-900 dark:text-zinc-100">
                    {zh ? '选择 Codex / Claude Code / Gemini 启动' : 'Choose Codex / Claude Code / Gemini'}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-zinc-400">
                    {zh ? '一个 Agent 只能绑定一个 adapter。生成凭证后选择其中一种命令执行。' : 'One Agent can bind to only one adapter. After generating credentials, choose exactly one command to run.'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-xl border border-emerald-100 bg-white p-3 dark:border-emerald-500/20 dark:bg-zinc-950/70">
                    <p className="text-[11px] font-black uppercase tracking-wide text-emerald-600 dark:text-emerald-300">agent_id</p>
                    <code className="mt-1 block break-all text-xs font-semibold text-slate-800 dark:text-zinc-100">{bindAgentCreds.agent_id}</code>
                  </div>
                  <div className="rounded-xl border border-emerald-100 bg-white p-3 dark:border-emerald-500/20 dark:bg-zinc-950/70">
                    <p className="text-[11px] font-black uppercase tracking-wide text-emerald-600 dark:text-emerald-300">agent_token</p>
                    <code className="mt-1 block break-all text-xs font-semibold text-slate-800 dark:text-zinc-100">{bindAgentCreds.agent_token}</code>
                  </div>
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                  {zh
                    ? '注意：一个 agent_id/token 只能启动一个 adapter。请选择 Codex、Claude Code 或 Gemini 中的一个，不要同时执行多个启动命令。'
                    : 'Note: one agent_id/token should start one adapter only. Choose Codex, Claude Code, or Gemini. Do not run multiple startup commands for the same agent.'}
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  {WTT_CONNECT_ADAPTERS.map((adapter) => {
                    const active = bindAgentAdapter === adapter.id
                    return (
                      <button
                        key={adapter.id}
                        type="button"
                        onClick={() => {
                          setBindAgentAdapter(adapter.id)
                          setBindAgentCopied('')
                        }}
                        className={`rounded-2xl border p-3 text-left transition ${
                          active
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-100 dark:border-emerald-400/50 dark:bg-emerald-500/15 dark:text-emerald-100 dark:ring-emerald-500/20'
                            : 'border-[#eee6da] bg-white/80 text-slate-600 hover:border-emerald-200 hover:bg-emerald-50/60 dark:border-zinc-800 dark:bg-zinc-950/70 dark:text-zinc-300 dark:hover:border-emerald-500/30 dark:hover:bg-emerald-500/10'
                        }`}
                      >
                        <span className="block text-sm font-black">{adapter.label}</span>
                        <span className="mt-1 block text-[11px] leading-4 opacity-75">{adapter.note}</span>
                      </button>
                    )
                  })}
                </div>

                <div className="rounded-2xl border border-[#eee6da] bg-white/80 p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-black text-slate-900 dark:text-zinc-100">
                        {WTT_CONNECT_ADAPTERS.find((adapter) => adapter.id === bindAgentAdapter)?.label}
                      </p>
                      <p className="mt-1 text-[11px] leading-4 text-slate-500 dark:text-zinc-400">
                        {zh ? '只复制并执行这一条命令。' : 'Copy and run this command only.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void copyBindCommand(
                        buildWttConnectCommand(bindAgentAdapter, bindAgentCreds.agent_id, bindAgentCreds.agent_token),
                        `${WTT_CONNECT_ADAPTERS.find((adapter) => adapter.id === bindAgentAdapter)?.label || bindAgentAdapter} ${zh ? '命令已复制' : 'command copied'}`,
                      )}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100 dark:hover:bg-emerald-500/15"
                    >
                      <ClipboardCopy className="h-3.5 w-3.5" />
                      {zh ? '复制命令' : 'Copy command'}
                    </button>
                  </div>
                  {bindAgentCopied && (
                    <p className="mb-2 text-xs font-semibold text-emerald-600 dark:text-emerald-300">{bindAgentCopied}</p>
                  )}
                  <pre className="max-h-72 overflow-auto rounded-xl border border-slate-200 bg-slate-950 p-3 text-[10px] leading-4 text-emerald-100 dark:border-zinc-800">
                    {buildWttConnectCommand(bindAgentAdapter, bindAgentCreds.agent_id, bindAgentCreds.agent_token)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {newAgentOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-[#ded6c8] bg-[#fffdf8] p-4 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
            <div className="mb-4">
              <h3 className="text-sm font-black text-slate-900 dark:text-zinc-100">
                {zh ? '克隆 Agent' : 'Clone Agent'}
              </h3>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-zinc-400">
                {zh ? '选择一个在线 Codex / Claude Code / Gemini 主机和角色。系统会自动 clone 一个 agent，并在该主机上启动独立默认 workspace。' : 'Choose an online Codex / Claude Code / Gemini host and role. WTT will clone an agent and start it with its own default workspace.'}
              </p>
            </div>

            <label className="mb-4 block">
              <span className="mb-1 block text-xs font-black text-slate-500 dark:text-zinc-400">{zh ? '运行主机' : 'Host'}</span>
              <select
                value={newAgentHostId}
                onChange={(event) => {
                  const hostId = event.target.value
                  setNewAgentHostId(hostId)
                  setNewAgentAdapter((normalizeNewAgentAdapter(agentRuntimeMap?.[hostId]) || 'claude-code') as 'claude-code' | 'codex' | 'gemini')
                }}
                disabled={newAgentBusy}
                className="w-full rounded-xl border border-[#ded6c8] bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition focus:border-sky-400 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              >
                {newAgentHosts.map((agent) => {
                  const runtime = displayRuntimeMap?.[agent.agent_id]
                  const adapter = normalizeNewAgentAdapter(runtime)
                  const hostLabel = [agent.display_name || agent.agent_id, adapter, runtime?.hostname].filter(Boolean).join(' · ')
                  return (
                    <option key={agent.agent_id} value={agent.agent_id}>
                      {hostLabel}
                    </option>
                  )
                })}
              </select>
            </label>

            <div className="mb-4">
              <div className="mb-2 text-xs font-black text-slate-500 dark:text-zinc-400">{zh ? '运行 Adapter' : 'Adapter'}</div>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ['claude-code', 'Claude Code'],
                  ['codex', 'Codex'],
                  ['gemini', 'Gemini'],
                ] as const).map(([id, label]) => {
                  const active = newAgentAdapter === id
                  return (
                    <button
                      key={id}
                      type="button"
                      disabled={newAgentBusy}
                      onClick={() => setNewAgentAdapter(id)}
                      className={`rounded-xl border px-3 py-2 text-left text-sm font-black transition ${
                        active
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/45 dark:bg-emerald-500/15 dark:text-emerald-200'
                          : 'border-[#eee6da] bg-white/70 text-slate-600 hover:border-[#ded6c8] hover:bg-[#f3eee5] dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-800'
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <div className="mb-2 text-xs font-black text-slate-500 dark:text-zinc-400">{zh ? '角色' : 'Role'}</div>
              <div className="grid max-h-[34vh] gap-2 overflow-y-auto sm:grid-cols-3">
                {AGENT_ROLE_TEMPLATES.map((template) => {
                  const active = template.id === newAgentRoleId
                  return (
                    <button
                      key={template.id}
                      type="button"
                      disabled={newAgentBusy}
                      onClick={() => setNewAgentRoleId(template.id)}
                      className={`rounded-xl border px-3 py-2 text-left transition ${
                        active
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/45 dark:bg-emerald-500/15 dark:text-emerald-200'
                          : 'border-[#eee6da] bg-white/70 text-slate-600 hover:border-[#ded6c8] hover:bg-[#f3eee5] dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <span className="block truncate text-sm font-black" title={template.label}>{template.label}</span>
                      <span className="mt-0.5 block line-clamp-2 text-[11px] leading-4 opacity-75" title={template.description}>{template.description}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {newAgentError && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                {newAgentError}
              </div>
            )}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewAgentOpen(false)}
                disabled={newAgentBusy}
                className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 disabled:opacity-60 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                {zh ? '取消' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => {
                  void createNewAgentFromHost()
                }}
                disabled={newAgentBusy || !newAgentHostId}
                className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-black text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {newAgentBusy ? (zh ? '创建中...' : 'Creating...') : (zh ? '创建并启动' : 'Create & Start')}
              </button>
            </div>
          </div>
        </div>
      )}

      {cloudCreateOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-[#ded6c8] bg-[#fffdf8] p-4 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
            <div className="mb-4">
              <h3 className="text-sm font-black text-slate-900 dark:text-zinc-100">
                {zh ? '创建 Cloud Agent' : 'Create Cloud Agent'}
              </h3>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-zinc-400">
                {zh
                  ? '每个用户只有一个 Cloud Sandbox。需要更多 Agent 时，请用 Clone Agent 功能，它们会运行在同一个 Sandbox 的不同 workspace。'
                  : 'Each user has one Cloud Sandbox. Use Clone Agent for more agents; they run in the same Sandbox with separate workspaces.'}
              </p>
            </div>

            <label className="mb-3 block">
              <span className="mb-1 block text-xs font-black text-slate-500 dark:text-zinc-400">{zh ? '显示名称' : 'Display name'}</span>
              <input
                value={cloudCreateDisplayName}
                onChange={(event) => setCloudCreateDisplayName(event.target.value)}
                disabled={cloudAgentBusy}
                className="w-full rounded-xl border border-[#ded6c8] bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition focus:border-sky-400 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>

            <div className="mb-3">
              <div className="mb-2 text-xs font-black text-slate-500 dark:text-zinc-400">{zh ? '默认运行时' : 'Runtime'}</div>
              <div className="grid gap-2 sm:grid-cols-3">
                {([
                  ['claude-code', 'DeepSeek + Claude Code', zh ? '默认推荐，每小时另加 ¥0.5；Pro 含 30 次连续请求、500 次/月。' : 'Default. Adds ¥0.5/hour; Pro includes 30 continuous requests and 500/month.'],
                  ['gemini', 'Gemini', zh ? '可填 Key，也可创建后在终端登录/配置。' : 'Optional key, or configure in terminal later.'],
                  ['codex', 'Codex', zh ? '可填 OpenAI Key，也可创建后在终端登录/配置。' : 'Optional OpenAI key, or configure in terminal later.'],
                ] as const).map(([id, label, desc]) => {
                  const active = cloudCreateAdapter === id
                  return (
                    <button
                      key={id}
                      type="button"
                      disabled={cloudAgentBusy}
                      onClick={() => setCloudCreateAdapter(id)}
                      className={`rounded-xl border px-3 py-2 text-left transition ${
                        active
                          ? 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-400/45 dark:bg-sky-500/15 dark:text-sky-100'
                          : 'border-[#eee6da] bg-white/70 text-slate-600 hover:border-[#ded6c8] hover:bg-[#f3eee5] dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <span className="block text-xs font-black">{label}</span>
                      <span className="mt-1 block text-[10px] leading-4 opacity-75">{desc}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <label className="mb-3 block">
              <span className="mb-1 block text-xs font-black text-slate-500 dark:text-zinc-400">
                {zh ? 'API Key（可选）' : 'API Key (optional)'}
              </span>
              <input
                value={cloudCreateApiKey}
                onChange={(event) => setCloudCreateApiKey(event.target.value)}
                disabled={cloudAgentBusy}
                type="password"
                autoComplete="off"
                placeholder={zh ? '不填则创建后在 Terminal 中配置/登录' : 'Leave empty to configure/login in Terminal later'}
                className="w-full rounded-xl border border-[#ded6c8] bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition focus:border-sky-400 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>

            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
              {zh
                ? '计费提示：Cloud Sandbox 按开机使用时间计费，关机不计费。默认 DeepSeek + Claude Code 套餐包含模型代理成本，每小时额外 ¥0.5，Pro 额度为 30 次连续请求、本月共 500 次。'
                : 'Billing: Cloud Sandbox is billed while powered on; powered off is not billed. Default DeepSeek + Claude Code includes model proxy cost, adds ¥0.5/hour, and Pro includes 30 continuous requests and 500/month.'}
            </div>

            {cloudCreateError && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                {cloudCreateError}
              </div>
            )}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCloudCreateOpen(false)}
                disabled={cloudAgentBusy}
                className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 disabled:opacity-60 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                {zh ? '取消' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => {
                  void createCloudAgent()
                }}
                disabled={cloudAgentBusy}
                className="rounded-xl bg-sky-600 px-3 py-2 text-sm font-black text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {cloudAgentBusy ? (zh ? '创建中...' : 'Creating...') : (zh ? '确认创建' : 'Create')}
              </button>
            </div>
          </div>
        </div>
      )}

      {shellAgent && (
        <AgentTerminalModal
          agentId={shellAgent.agent_id}
          agentName={shellAgent.display_name || shellAgent.agent_id}
          workdir={displayRuntimeMap?.[shellAgent.agent_id]?.workdir}
          token={userToken}
          onClose={() => setShellAgent(null)}
        />
      )}
    </>
  )
}
