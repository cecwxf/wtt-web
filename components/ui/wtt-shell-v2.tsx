'use client'

import { Menu } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { AgentItem, AgentSubAgentMap, AgentStatsMap } from './agent-column'
import { AgentRuntimeInfo, TopicColumn, TopicItem, type AgentOperationJob, type AgentOperationType, type CloudAgentCreateOptions, type RecentTopicItem } from './topic-column'
import { TopBar } from './top-bar'
import { WttSettingsModal } from './wtt-settings-modal'
import { CreateTopicModal } from './create-topic-modal'
import { useI18n } from '@/lib/i18n-provider'
import type { AgentRoleTemplate } from '@/lib/agent-role-templates'
import { useViewportClass } from '@/lib/hooks/use-viewport-class'

interface P2PRequest {
  id: string
  from_user_id: string
  from_agent_id: string
  target_agent_id: string
  request_type?: string
  topic_name?: string
  status: string
  message: string
  created_at: string
}

interface WttShellV2Props {
  agents: AgentItem[]
  selectedAgentId: string
  onAgentChange: (agentId: string) => void
  topics: TopicItem[]
  groupTopics?: TopicItem[]
  recentTopics?: RecentTopicItem[]
  selectedTopicId: string | null
  onTopicChange: (topicId: string | null) => void
  onLogout: () => void
  onTopicsRefresh?: () => void
  onTopicCreated?: (topic: TopicItem) => void | Promise<void>
  onBindingChanged?: () => void
  onRenameAgent?: (agentId: string, currentName: string) => void
  onUnclaimAgent?: (agentId: string) => void
  onLeaveTopic?: (topicId: string) => void
  onDeleteTopic?: (topicId: string) => void
  onOpenEditor?: () => void
  onOpenKnowledgeRoot?: () => void
  onCreateGeneralTask?: () => void
  onSubscribeTopic?: (topicId: string) => Promise<void>
  onCreateP2P?: (targetAgentId: string) => Promise<void>
  onRequestDiscuss?: (targetAgentId: string, topicName: string) => Promise<void>
  onSelectWorkerTopic?: (topicId: string, workerSession?: { workerId: string; personaMd: string; workerMd: string; isFirstSession: boolean; personaChanged?: boolean }) => void
  subscribedTopicIds?: string[]
  notificationCount?: number
  p2pRequests?: P2PRequest[]
  onAcceptP2PRequest?: (requestId: string) => Promise<void>
  onRejectP2PRequest?: (requestId: string) => Promise<void>
  hideTopics?: boolean
  hideCreateTopic?: boolean
  currentUserName?: string
  agentSubAgents?: AgentSubAgentMap
  maxSubAgents?: number
  agentStats?: AgentStatsMap
  onlineAgentIds?: Set<string>
  agentRoleMap?: Record<string, string>
  agentRoleTemplateMap?: Record<string, AgentRoleTemplate>
  agentRuntimeMap?: Record<string, AgentRuntimeInfo>
  onAssignAgentRole?: (agentId: string, roleId: string) => void
  onSaveAgentRole?: (agentId: string, role: AgentRoleTemplate) => void
  onNewAgentFromHost?: (
    hostAgentId: string,
    role: AgentRoleTemplate,
    adapter: 'claude-code' | 'codex' | 'gemini',
    options?: { select?: boolean; alert?: boolean },
  ) => string | void | Promise<string | void>
  onCreateCloudAgent?: (options?: CloudAgentCreateOptions) => void | Promise<void>
  onSubmitAgentOperation?: (
    operationType: AgentOperationType,
    payload: Record<string, unknown>,
    idempotencyKey?: string,
    onProgress?: (job: AgentOperationJob) => void,
  ) => Promise<AgentOperationJob>
  onSleepSandbox?: (hostAgentId: string) => void | Promise<void>
  onWakeSandbox?: (hostAgentId: string) => void | Promise<void>
  userToken?: string
  planLabel?: string
  forceOpenSettingsPage?: SettingsPage | null
  onForceOpenHandled?: () => void
  children: ReactNode
}

type SettingsPage = 'profile' | 'membership' | 'binding' | 'ilink' | 'feishu' | 'llm-proxy' | 'metrics' | 'notifications' | 'poll' | 'privacy' | 'appearance' | 'api' | 'about'

type ShellWidths = {
  agent: number
  topic: number
}

const DEFAULT_SHELL_WIDTHS: ShellWidths = { agent: 112, topic: 264 }
const SHELL_WIDTH_STORAGE_KEY = 'wtt.feed.shellWidths'

function clampWidth(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)))
}

export function WttShellV2(props: WttShellV2Props) {
  const {
    agents,
    selectedAgentId,
    onAgentChange,
    topics,
    groupTopics,
    recentTopics,
    selectedTopicId,
    onTopicChange,
    onLogout,
    onTopicsRefresh,
    onTopicCreated,
    onBindingChanged,
    onRenameAgent,
    onUnclaimAgent,
    onLeaveTopic,
    onDeleteTopic,
    onOpenEditor,
    onOpenKnowledgeRoot,
    onCreateGeneralTask,
    onSubscribeTopic,
    onCreateP2P,
    onRequestDiscuss,
    onSelectWorkerTopic,
    subscribedTopicIds,
    notificationCount = 0,
    p2pRequests = [],
    onAcceptP2PRequest,
    onRejectP2PRequest,
    hideTopics = false,
    hideCreateTopic = false,
    userToken,
    planLabel = 'Free',
    forceOpenSettingsPage,
    onForceOpenHandled,
    onlineAgentIds,
    agentRoleMap,
    agentRoleTemplateMap,
    agentRuntimeMap,
    onAssignAgentRole,
    onSaveAgentRole,
    onNewAgentFromHost,
    onCreateCloudAgent,
    onSubmitAgentOperation,
    onSleepSandbox,
    onWakeSandbox,
    children,
  } = props
  const [menuOpen, setMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [settingsPage, setSettingsPage] = useState<SettingsPage>('profile')
  const [createTopicOpen, setCreateTopicOpen] = useState(false)
  const [shellWidths, setShellWidths] = useState<ShellWidths>(DEFAULT_SHELL_WIDTHS)
  const shellWidthsRef = useRef(shellWidths)
  const { t } = useI18n()
  const viewport = useViewportClass()

  const openSettings = (page: SettingsPage) => {
    setSettingsPage(page)
    setSettingsOpen(true)
    setMenuOpen(false)
  }

  useEffect(() => {
    if (!forceOpenSettingsPage) return
    setSettingsPage(forceOpenSettingsPage)
    setSettingsOpen(true)
    setMenuOpen(false)
    onForceOpenHandled?.()
  }, [forceOpenSettingsPage, onForceOpenHandled])

  useEffect(() => {
    try {
      const saved = localStorage.getItem('wtt.sidebarCollapsed')
      if (saved === '1') setSidebarCollapsed(true)
      const savedWidths = localStorage.getItem(SHELL_WIDTH_STORAGE_KEY)
      if (savedWidths) {
        const parsed = JSON.parse(savedWidths) as Partial<ShellWidths>
        setShellWidths({
          agent: clampWidth(Number(parsed.agent) || DEFAULT_SHELL_WIDTHS.agent, 104, 200),
          topic: clampWidth(Number(parsed.topic) || DEFAULT_SHELL_WIDTHS.topic, 190, 560),
        })
      }
    } catch {
      // noop
    }
  }, [])

  useEffect(() => {
    if (viewport.isNarrow) setSidebarCollapsed(true)
  }, [viewport.isNarrow])

  useEffect(() => {
    try {
      localStorage.setItem('wtt.sidebarCollapsed', sidebarCollapsed ? '1' : '0')
    } catch {
      // noop
    }
  }, [sidebarCollapsed])

  useEffect(() => {
    shellWidthsRef.current = shellWidths
    try {
      localStorage.setItem(SHELL_WIDTH_STORAGE_KEY, JSON.stringify(shellWidths))
    } catch {
      // noop
    }
  }, [shellWidths])

  const startResize = useCallback((kind: keyof ShellWidths, event: ReactPointerEvent) => {
    if (viewport.isNarrow) return
    event.preventDefault()
    const startX = event.clientX
    const startWidth = shellWidthsRef.current[kind]
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX
      const next = kind === 'agent'
        ? clampWidth(startWidth + delta, 104, 200)
        : clampWidth(startWidth + delta, 190, 560)
      setShellWidths((prev) => ({ ...prev, [kind]: next }))
    }

    const onUp = () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }, [viewport.isNarrow])

  const agentOptions = agents.map((agent) => ({
    id: agent.agent_id,
    agent_id: agent.agent_id,
    display_name: agent.display_name,
    is_primary: false,
    binding_method: agent.binding_method,
    bound_via: agent.bound_via,
  }))

  const isSelectedAgentOnline = onlineAgentIds?.has(selectedAgentId) ?? false
  const shellStyle = {
    '--wtt-agent-rail-width': `${shellWidths.agent}px`,
    '--wtt-topic-rail-width': `${shellWidths.topic}px`,
  } as CSSProperties

  return (
    <div className="wtt-app-shell h-[100dvh] overflow-hidden bg-[#f6f3ed] text-slate-800 dark:bg-zinc-950 dark:text-zinc-200" style={shellStyle}>
      <div className="flex h-full flex-col">
        <TopBar
          onSelectTopic={(topicId) => onTopicChange(topicId)}
          onSubscribeTopic={onSubscribeTopic}
          subscribedTopicIds={subscribedTopicIds}
          onCreateTopic={() => setCreateTopicOpen(true)}
          onOpenEditor={onOpenEditor}
          onOpenKnowledgeRoot={onOpenKnowledgeRoot}
          hideCreateTopic={hideCreateTopic}
          notificationCount={notificationCount}
          p2pRequests={p2pRequests}
          onAcceptP2PRequest={onAcceptP2PRequest}
          onRejectP2PRequest={onRejectP2PRequest}
          agentId={selectedAgentId}
          userMenu={
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-black text-sky-800 shadow-sm transition hover:border-sky-300 hover:bg-sky-100 dark:border-sky-800/60 dark:bg-sky-950/40 dark:text-sky-200 dark:hover:bg-sky-950/60"
                title="Settings"
              >
                <Menu className="h-4 w-4" />
                <span className="hidden sm:inline">设置</span>
                <span className="text-sky-500 dark:text-sky-400">·</span>
                <span className="uppercase tracking-[0.08em]">{planLabel}</span>
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-12 z-20 w-52 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-1 shadow-lg">
                  <button
                    onClick={() => openSettings('profile')}
                    className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-600 dark:text-zinc-300 transition hover:bg-slate-100 dark:hover:bg-zinc-700"
                  >
                    {t('shell.profile')}
                  </button>
                  <button
                    onClick={() => openSettings('membership')}
                    className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-600 dark:text-zinc-300 transition hover:bg-slate-100 dark:hover:bg-zinc-700"
                  >
                    账户升级
                  </button>
                  <button
                    onClick={() => openSettings('binding')}
                    className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-600 dark:text-zinc-300 transition hover:bg-slate-100 dark:hover:bg-zinc-700"
                  >
                    {t('shell.agentBinding')}
                  </button>
                  <button
                    onClick={() => openSettings('notifications')}
                    className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-600 dark:text-zinc-300 transition hover:bg-slate-100 dark:hover:bg-zinc-700"
                  >
                    {t('shell.notifications')}
                  </button>
                  <button
                    onClick={() => openSettings('api')}
                    className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-600 dark:text-zinc-300 transition hover:bg-slate-100 dark:hover:bg-zinc-700"
                  >
                    {t('shell.apiMcp')}
                  </button>
                  <button
                    onClick={() => {
                      window.location.href = '/admin/manage'
                    }}
                    className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-600 dark:text-zinc-300 transition hover:bg-slate-100 dark:hover:bg-zinc-700"
                  >
                    {t('shell.manageCleanup')}
                  </button>
                  <div className="my-1 h-px bg-slate-200 dark:bg-zinc-600" />
                  <button
                    onClick={onLogout}
                    className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-red-400 transition hover:bg-slate-100 dark:hover:bg-zinc-700"
                  >
                    {t('shell.logout')}
                  </button>
                </div>
              )}
            </div>
          }
        />

        <div className="flex min-h-0 flex-1">
          {!hideTopics && !sidebarCollapsed && (
            <TopicColumn
              topics={topics}
              groupTopics={groupTopics}
              recentTopics={recentTopics}
              selectedTopicId={selectedTopicId}
              onSelectTopic={onTopicChange}
              onLeaveTopic={onLeaveTopic}
              onDeleteTopic={onDeleteTopic}
              onCreateP2P={onCreateP2P}
              onRequestDiscuss={onRequestDiscuss}
              onSelectWorkerTopic={onSelectWorkerTopic}
              pinScopeKey={selectedAgentId}
              agentOptions={agents.map((a) => ({
                agent_id: a.agent_id,
                display_name: a.display_name,
                binding_method: a.binding_method,
                bound_via: a.bound_via,
                is_cloud_sandbox: a.is_cloud_sandbox,
                cloud_host_agent_id: a.cloud_host_agent_id,
              }))}
              selectedAgentId={selectedAgentId}
              onSelectAgent={onAgentChange}
              isSelectedAgentOnline={isSelectedAgentOnline}
              onlineAgentIds={onlineAgentIds}
              agentRoleMap={agentRoleMap}
              agentRoleTemplateMap={agentRoleTemplateMap}
              agentRuntimeMap={agentRuntimeMap}
              onAssignAgentRole={onAssignAgentRole}
              onSaveAgentRole={onSaveAgentRole}
              onNewAgentFromHost={onNewAgentFromHost}
              onCreateCloudAgent={onCreateCloudAgent}
              onSubmitAgentOperation={onSubmitAgentOperation}
              onSleepSandbox={onSleepSandbox}
              onWakeSandbox={onWakeSandbox}
              onRenameAgent={onRenameAgent}
              onUnclaimAgent={onUnclaimAgent}
              onBindingChanged={onBindingChanged}
              onTopicsRefresh={onTopicsRefresh}
              onTopicCreated={onTopicCreated}
              onCreateGeneralTask={onCreateGeneralTask}
              onToggleSidebar={() => setSidebarCollapsed(true)}
              userToken={userToken}
              compactLayout={viewport.isCompact}
              onStartAgentResize={(event) => startResize('agent', event)}
            />
          )}
          {!hideTopics && !sidebarCollapsed && (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize topics column"
              title="Drag to resize topics"
              onPointerDown={(event) => startResize('topic', event)}
              className="group relative z-10 hidden w-1.5 shrink-0 cursor-col-resize items-stretch justify-center bg-[#e7e1d7] transition hover:bg-sky-300 dark:bg-zinc-800 dark:hover:bg-sky-500 md:flex"
            >
              <span className="my-auto h-10 w-0.5 rounded-full bg-[#b9ad9d] opacity-0 transition group-hover:opacity-100 dark:bg-zinc-500" />
            </div>
          )}

          {!hideTopics && sidebarCollapsed && (
            <aside className="flex w-9 shrink-0 items-start justify-center border-r border-[#e5e0d8] bg-[#f7f5f0] pt-2 dark:border-zinc-800 dark:bg-zinc-950">
              <button
                onClick={() => setSidebarCollapsed(false)}
                className="rounded-lg border border-slate-200 dark:border-zinc-700 px-2 py-1.5 text-xs text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700 transition"
                title="Expand sidebar"
              >
                {'>>'}
              </button>
            </aside>
          )}

          <main className="min-h-0 flex-1 overflow-y-auto bg-[#fbfaf7] dark:bg-zinc-950">
            {children}
          </main>
        </div>
      </div>

      <WttSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        activePage={settingsPage}
        onPageChange={setSettingsPage}
        agents={agentOptions}
        selectedAgentId={selectedAgentId}
        onBindingChanged={onBindingChanged}
      />

      <CreateTopicModal
        open={createTopicOpen}
        onClose={() => setCreateTopicOpen(false)}
        creatorAgentId={selectedAgentId}
        agentOptions={agents.map((a) => ({ agent_id: a.agent_id, display_name: a.display_name }))}
        userToken={userToken}
        onSuccess={() => {
          onTopicsRefresh?.()
        }}
      />
    </div>
  )
}
