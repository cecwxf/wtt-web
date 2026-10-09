'use client'

import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ComponentProps, CSSProperties } from 'react'
import useSWRInfinite from 'swr/infinite'
import useSWR from 'swr'
import { Archive, ArrowUpRight, Bot, ChevronRight, FolderOpen, History, Laptop, Loader2, LogOut, PanelLeft, Pin, Plus, RefreshCw, Search, Settings2, Users, X } from 'lucide-react'
import type { WttShellV2Props } from '@/components/ui/wtt-shell-v2'
import { WttSettingsModal } from '@/components/ui/wtt-settings-modal'
import { DesktopOnboarding } from './desktop-onboarding'
import { DesktopWorkspaceShell } from './desktop-workspace-shell'
import { DesktopHostsApi, type AccountHost } from '@/lib/desktop-hosts'
import { getDesktopBridge } from '@/lib/desktop'
import { WorkspaceProjectsApi, WorkspaceRequestError, type WorkspaceProject, type ProjectSession, type ProjectRoot } from '@/lib/workspace-projects'
import { useI18n } from '@/lib/i18n-provider'
import { WorkspaceOverview, adapterLabel } from './workspace-overview'
import styles from './desktop-project-shell.module.css'

const iconButton = 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 disabled:opacity-40'
const field = 'min-h-9 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-zinc-700 dark:bg-zinc-950'

type ProjectShellProps = WttShellV2Props & { workspaceBasePath?: '/desktop' | '/mobile/workspaces' }
type SessionRequest = Parameters<WorkspaceProjectsApi['createSession']>[1]
type ProjectRequest = Parameters<WorkspaceProjectsApi['create']>[0]

function adapterRestriction(agent: AccountHost['agents'][number], hostId: string, root?: ProjectRoot) {
  if (!agent.capabilities?.workspace_projects) return 'runtime'
  if (root && hostId !== root.host_id && !agent.capabilities.workspace_mcp) return 'remote'
  if (root?.access === 'read-only' && hostId === root.host_id && !['codex', 'claude-code'].includes(agent.adapter)) return 'read-only'
  return null
}

export function DesktopProjectShell(props: ProjectShellProps) {
  const params = useSearchParams()
  if (props.workspaceBasePath !== '/mobile/workspaces' && params.get('legacy') === '1') return <DesktopWorkspaceShell {...props} />
  return <ProjectShell key={props.currentUserId || props.userToken || 'signed-out'} {...props} />
}

function ProjectShell(props: ProjectShellProps) {
  const { locale } = useI18n()
  const en = locale === 'en'
  const router = useRouter()
  const params = useSearchParams()
  const basePath = props.workspaceBasePath || '/desktop'
  const setupPath = basePath === '/desktop' ? '/desktop/setup' : '/mobile/workspaces/hosts'
  const api = useMemo(() => new WorkspaceProjectsApi(props.userToken || ''), [props.userToken])
  const hostApi = useMemo(() => new DesktopHostsApi(props.userToken || ''), [props.userToken])
  const [query, setQuery] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(280)
  const [pinned, setPinned] = useState<string[]>([])
  const [preferencesReady, setPreferencesReady] = useState(false)
  const preferencesKey = props.currentUserId ? `wtt-workspace-layout:${props.currentUserId}` : null
  const resizeStart = useRef<{ x: number; width: number } | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsPage, setSettingsPage] = useState<ComponentProps<typeof WttSettingsModal>['activePage']>('profile')
  const [creation, setCreation] = useState<{ workspaceId: string; sessionId: string; project?: WorkspaceProject; created?: WorkspaceProject; request?: SessionRequest; projectRequest?: ProjectRequest } | null>(null)
  const [name, setName] = useState('')
  const [rootId, setRootId] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [collaborative, setCollaborative] = useState(false)
  const [roles, setRoles] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [canAdmit, setCanAdmit] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const live = useRef(true)
  useEffect(() => {
    if (!preferencesKey) return
    try {
      const value = JSON.parse(localStorage.getItem(preferencesKey) || '{}')
      if (Array.isArray(value.pinned)) setPinned(value.pinned.filter((id: unknown) => typeof id === 'string').slice(0, 500))
      if (Number.isFinite(value.width)) setSidebarWidth(Math.max(240, Math.min(400, value.width)))
      setCollapsed(value.collapsed === true)
    } catch { /* Invalid layout preferences do not affect server data. */ }
    setPreferencesReady(true)
  }, [preferencesKey])
  useEffect(() => {
    if (!preferencesKey || !preferencesReady) return
    const timer = setTimeout(() => {
      try { localStorage.setItem(preferencesKey, JSON.stringify({ pinned, width: sidebarWidth, collapsed })) } catch { /* Private browsing may disable storage. */ }
    }, 200)
    return () => clearTimeout(timer)
  }, [preferencesKey, preferencesReady, pinned, sidebarWidth, collapsed])
  useEffect(() => { live.current = true; setCanAdmit(Boolean(getDesktopBridge()?.host?.admitWorkspaceDirectory)); return () => { live.current = false } }, [])
  const projects = useSWRInfinite((page, previous: { next_offset: number | null } | null) => !props.userToken || (page > 0 && previous?.next_offset == null)
    ? null : ['workspace-projects', props.userToken, page === 0 ? 0 : previous?.next_offset], ([, , offset]: [string, string, number]) => api.list(offset), { shouldRetryOnError: false })
  const roots = useSWR(props.userToken ? ['workspace-roots', props.userToken] : null, () => api.roots(), { shouldRetryOnError: false })
  const hosts = useSWRInfinite((page, previous: { nextOffset: number | null } | null) => !props.userToken || (page > 0 && previous?.nextOffset == null)
    ? null : ['workspace-executors', props.userToken, page === 0 ? 0 : previous?.nextOffset],
    ([, , offset]: [string, string, number]) => hostApi.list(offset), { shouldRetryOnError: false })
  const hostDirectory = useMemo(() => Array.from(new Map((hosts.data || []).flatMap(page => page.hosts).map(host => [host.host_id, host])).values()), [hosts.data])
  const workspaceId = params.get('workspace')
  const detail = useSWR(props.userToken && workspaceId ? ['workspace-project', props.userToken, workspaceId] : null,
    () => api.request<WorkspaceProject>(`/${workspaceId}`), { shouldRetryOnError: false })
  const directory = useMemo(() => {
    const all = (projects.data || []).flatMap(page => page.workspaces)
    const selected = detail.data
    if (!selected) return all
    return all.some(project => project.workspace_id === selected.workspace_id)
      ? all.map(project => project.workspace_id === selected.workspace_id ? selected : project)
      : [selected, ...all]
  }, [projects.data, detail.data])
  const current = directory.find(project => project.sessions.some(session => session.topic_id === props.selectedTopicId))
  const currentSession = current?.sessions.find(session => session.topic_id === props.selectedTopicId)
  const currentRoot = roots.data?.roots.find(root => root.root_id === current?.root_id)
  const currentOwner = currentRoot?.host_name || hostDirectory.find(host => host.host_id === current?.host_id)?.display_name
  const requestedTopic = params.get('topicId') || params.get('topic')
  const requestedSession = params.get('session')
  const targetTopic = requestedTopic || props.selectedTopicId
  const targetFound = directory.some(project => project.sessions.some(session => session.topic_id === targetTopic))
  const nextOffset = projects.data?.at(-1)?.next_offset
  const canResolveNext = nextOffset != null && Number.isSafeInteger(nextOffset) && nextOffset > 0
    && !projects.data?.slice(0, -1).some(page => page.next_offset === nextOffset)
  const selectionMismatch = Boolean(current && currentSession && (
    (workspaceId && workspaceId !== current.workspace_id)
    || (requestedSession && requestedSession !== currentSession.session_id)
    || (requestedTopic && requestedTopic !== currentSession.topic_id)
  ))
  const selectionReady = Boolean(current && currentSession && workspaceId === current.workspace_id
    && requestedSession === currentSession.session_id && requestedTopic === currentSession.topic_id)
  useEffect(() => {
    if (targetTopic && !targetFound && !workspaceId && !projects.error && !projects.isValidating && canResolveNext) {
      void projects.setSize(projects.size + 1)
    }
  }, [targetTopic, targetFound, workspaceId, projects.error, projects.isValidating, canResolveNext, projects.setSize, projects.size])
  useEffect(() => {
    if (workspaceId || requestedSession || params.get('createHost') || params.get('createProfile') || creation) return
    const unavailable = projects.error instanceof WorkspaceRequestError && projects.error.status === 404
    const legacyTopic = requestedTopic && projects.data && !projects.error && !projects.isValidating
      && nextOffset == null && !targetFound
    if ((!unavailable && !legacyTopic) || (unavailable && error)) return
    const legacy = new URLSearchParams()
    const mobile = basePath === '/mobile/workspaces'
    if (!mobile) legacy.set('legacy', '1')
    if (requestedTopic) legacy.set(mobile ? 'topic_id' : 'topic', requestedTopic)
    const agentId = params.get('agentId') || props.selectedAgentId
    if (agentId) legacy.set(mobile ? 'agent_id' : 'agentId', agentId)
    const source = params.get('source')
    if (source) legacy.set('source', source)
    router.replace(`${mobile ? '/mobile/feed' : '/desktop'}${legacy.size ? `?${legacy}` : ''}`, { scroll: false })
  }, [basePath, workspaceId, requestedSession, requestedTopic, projects.error, projects.data, projects.isValidating, nextOffset, targetFound, params, props.selectedAgentId, router, creation, error])
  useEffect(() => {
    if (!current || !currentSession || params.get('workspace')) return
    const requestedTopic = params.get('topicId') || params.get('topic')
    if (requestedTopic && requestedTopic !== currentSession.topic_id) return
    const requestedSession = params.get('session')
    if (requestedSession && requestedSession !== currentSession.session_id) return
    // Restoring a Topic must also restore its project-scoped tools, not profile tools.
    const restored = new URLSearchParams(params.toString())
    restored.set('workspace', current.workspace_id)
    restored.set('session', currentSession.session_id)
    restored.set('topic', currentSession.topic_id)
    const agentId = params.get('agentId') || props.selectedAgentId
    const participant = currentSession.participants.find(item => item.transport_agent_id === agentId) || currentSession.participants[0]
    if (participant) restored.set('agentId', participant.transport_agent_id)
    router.replace(`${basePath}?${restored}`, { scroll: false })
  }, [current, currentSession, params, props.selectedAgentId, router, basePath])
  const available = useMemo(() => hostDirectory.filter(host => host.status !== 'revoked').flatMap(host => host.agents.map(agent => ({ host, agent, key: `${host.host_id}/${agent.profile_id}` }))), [hostDirectory])
  const chosenRoot = roots.data?.roots.find(root => root.root_id === (creation?.project?.root_id || creation?.created?.root_id || rootId))
  const resolvedRoles = useMemo(() => {
    const values: Record<string, string> = {}
    const used = new Set(selected.filter(key => roles[key] !== undefined).map(key => roles[key].trim().toLowerCase()))
    for (const key of selected) {
      const item = available.find(item => item.key === key)
      if (!item) continue
      if (roles[key] !== undefined) { values[key] = roles[key].trim(); continue }
      const base = (item.agent.display_name || adapterLabel(item.agent.adapter)).slice(0, 80)
      const duplicate = selected.some(other => other !== key && (available.find(item => item.key === other)?.agent.display_name || '') === item.agent.display_name)
      let label = duplicate || used.has(base.toLowerCase()) ? `${base} / ${item.host.display_name}`.slice(0, 80) : base
      const stem = label
      for (let index = 2; used.has(label.toLowerCase()); index++) {
        const suffix = ` (${index})`
        label = stem.slice(0, 80 - suffix.length) + suffix
      }
      used.add(label.toLowerCase()); values[key] = label
    }
    return values
  }, [selected, roles, available])
  const rolesValid = selected.every(key => resolvedRoles[key]) && new Set(selected.map(key => resolvedRoles[key]?.toLowerCase())).size === selected.length
  const creationLocked = busy || Boolean(creation?.request)
  const projectLocked = creationLocked || Boolean(creation?.created || creation?.projectRequest)
  const selectionSupported = selected.every(key => {
    const item = available.find(item => item.key === key)
    return item && !adapterRestriction(item.agent, item.host.host_id, chosenRoot)
  })
  const refresh = () => { void projects.mutate(); void detail.mutate(); void roots.mutate(); void hosts.mutate(); props.onBindingChanged?.() }
  useEffect(() => {
    const handler = () => { void projects.mutate(); void roots.mutate(); void hosts.mutate() }
    const host = getDesktopBridge()?.host
    let signature = ''
    const off = host?.onRuntimeState?.(state => {
      const next = JSON.stringify([state.state, state.agents.map(agent => [agent.profileId, agent.agentId, agent.state])])
      if (next === signature) return
      signature = next
      handler()
    })
    window.addEventListener('wtt-directory-changed', handler)
    return () => { off?.(); window.removeEventListener('wtt-directory-changed', handler) }
  }, [projects.mutate, roots.mutate, hosts.mutate])
  useEffect(() => {
    if (!props.forceOpenSettingsPage) return
    setSettingsPage(props.forceOpenSettingsPage === 'membership' ? 'membership' : 'profile'); setSettingsOpen(true); props.onForceOpenHandled?.()
  }, [props.forceOpenSettingsPage, props.onForceOpenHandled])
  useEffect(() => { if (creation) dialog.current?.showModal(); else dialog.current?.close() }, [creation])
  useEffect(() => {
    if (!drawerOpen) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setDrawerOpen(false) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [drawerOpen])

  const start = useCallback((project?: WorkspaceProject, profileKey?: string) => {
    const profile = available.find(item => item.key === profileKey)
    const root = roots.data?.roots.find(root => root.host_id === profile?.host.host_id) || roots.data?.roots[0]
    setName(''); setSelected(profileKey ? [profileKey] : []); setCollaborative(false); setRoles({}); setError(''); setRootId(project?.root_id || root?.root_id || '')
    setCreation({ workspaceId: project?.workspace_id || crypto.randomUUID(), sessionId: crypto.randomUUID(), project }); setDrawerOpen(false)
  }, [available, roots.data])
  const createHost = params.get('createHost')
  const createProfile = params.get('createProfile')
  useEffect(() => {
    if (!createHost || !createProfile || creation || busy || hosts.isLoading || hosts.isValidating || roots.isLoading) return
    const consume = () => {
      const next = new URLSearchParams(params.toString())
      next.delete('createHost'); next.delete('createProfile')
      router.replace(`${basePath}${next.size ? `?${next}` : ''}`, { scroll: false })
    }
    const profile = available.find(item => item.host.host_id === createHost && item.agent.profile_id === createProfile)
    if (profile) {
      if (!profile.agent.capabilities?.workspace_projects) setError(en ? 'Update this Adapter runtime before creating a Workspace.' : '请升级此 Adapter 的运行时后创建 Workspace。')
      else start(undefined, profile.key)
      consume()
      return
    }
    const nextOffset = hosts.data?.at(-1)?.nextOffset
    if (!hosts.error && nextOffset != null && Number.isSafeInteger(nextOffset) && nextOffset > 0
      && !hosts.data?.slice(0, -1).some(page => page.nextOffset === nextOffset)) {
      void hosts.setSize(hosts.size + 1)
      return
    }
    setError(en ? 'The selected Adapter is unavailable. Refresh your computers and retry.' : '所选 Adapter 不可用，请刷新主机后重试。')
    consume()
  }, [createHost, createProfile, creation, busy, hosts.isLoading, hosts.isValidating, hosts.error, hosts.data, hosts.size, hosts.setSize, roots.isLoading, available, params, router, basePath, en, start])
  function href(project: WorkspaceProject, session: ProjectSession) {
    return `${basePath}?${new URLSearchParams({ workspace: project.workspace_id, session: session.session_id, topic: session.topic_id, agentId: session.participants[0]?.transport_agent_id || '' })}`
  }
  async function admit() {
    setBusy(true); setError('')
    try {
      const result = await getDesktopBridge()?.host?.admitWorkspaceDirectory?.('workspace-write')
      if (!live.current || !result) return
      await roots.mutate(); if (live.current) setRootId(result.root_id)
    } catch (value) { if (live.current) setError(value instanceof Error ? value.message : 'Directory authorization failed') }
    finally { if (live.current) setBusy(false) }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!creation || busy || !name.trim() || !selected.length || !chosenRoot || !selectionSupported || !rolesValid) return
    setBusy(true); setError('')
    try {
      const projectRequest = creation.projectRequest || { workspace_id: creation.workspaceId, name: name.trim(), root_id: chosenRoot.root_id }
      if (!creation.project && !creation.created) setCreation(before => before && { ...before, projectRequest })
      const project = creation.project || creation.created || await api.create(projectRequest)
      if (!live.current) return
      if (!creation.project && !creation.created) setCreation(before => before && { ...before, created: project })
      const participants = selected.map(key => { const value = available.find(item => item.key === key)!; return { host_id: value.host.host_id, profile_id: value.agent.profile_id, label: resolvedRoles[key] } })
      const request = creation.request || { session_id: creation.sessionId, name: creation.project ? name.trim() : (selected.length > 1 ? (en ? 'Team' : '协作') : (en ? 'Main' : '主会话')), participants }
      // An unknown outcome must retry the same idempotent request, not a different team.
      setCreation(before => before && { ...before, request })
      const session = await api.createSession(project.workspace_id, request)
      if (!live.current) return
      // A directory refresh failure must not turn an acknowledged creation into a retry.
      void projects.mutate().catch(() => {}); void detail.mutate().catch(() => {})
      props.onTopicsRefresh?.(); props.onBindingChanged?.()
      router.push(href(project, session)); setCreation(null)
    } catch (value) {
      if (live.current) {
        if (value instanceof WorkspaceRequestError && value.status >= 400 && value.status < 500) setCreation(before => before && { ...before, request: undefined, projectRequest: before.created ? before.projectRequest : undefined })
        setError(value instanceof Error ? value.message : 'Workspace creation failed')
        void projects.mutate().catch(() => {})
      }
    }
    finally { if (live.current) setBusy(false) }
  }
  async function archive(project: WorkspaceProject) {
    if (!window.confirm(en ? `Archive ${project.name}? Running Workspace tools will be revoked; history is preserved.` : `归档 ${project.name}？Workspace 工具权限将撤销，历史保留。`)) return
    try { await api.request(`/${project.workspace_id}/archive`, {}); await projects.mutate(); if (current === project) router.push(basePath) }
    catch (value) { setError(value instanceof Error ? value.message : 'Archive failed') }
  }
  const navigation = <>
    <header className="flex h-12 items-center gap-2 border-b border-zinc-200 px-4 dark:border-zinc-800"><img src="/icon.png" alt="" /><span className="flex-1 text-sm font-semibold">WTT</span><button className={iconButton} title={en ? 'Refresh Workspaces' : '刷新工作区'} aria-label={en ? 'Refresh Workspaces' : '刷新工作区'} onClick={refresh}><RefreshCw size={15} /></button><button className={`${iconButton} hidden md:inline-flex`} title={en ? 'Collapse navigation' : '收起导航'} aria-label={en ? 'Collapse navigation' : '收起导航'} onClick={() => { setCollapsed(true); setDrawerOpen(false) }}><PanelLeft size={16} /></button><button className={`${iconButton} md:hidden`} title={en ? 'Close navigation' : '关闭导航'} aria-label={en ? 'Close navigation' : '关闭导航'} onClick={() => setDrawerOpen(false)}><X size={16} /></button></header>
    <div className="space-y-2 p-3"><button className="flex h-9 w-full items-center justify-center gap-2 rounded-md bg-zinc-900 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900" onClick={() => start()} disabled={!props.userToken}><Plus size={16} />{en ? 'New Workspace' : '新建 Workspace'}</button><label className="flex h-9 items-center gap-2 rounded-md border border-zinc-200 bg-white px-2 dark:border-zinc-700 dark:bg-zinc-950"><Search size={15} className="text-zinc-400" /><input type="search" value={query} onChange={event => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" aria-label={en ? 'Search Workspaces' : '搜索工作区'} placeholder={en ? 'Search Workspaces' : '搜索工作区'} /></label></div>
    <nav className="min-h-0 flex-1 overflow-y-auto px-2" aria-label="Workspaces"><div className="px-2 py-2 text-xs font-medium text-zinc-500">Workspaces</div>
      {projects.isLoading && <p role="status" className="p-2 text-xs text-zinc-500">{en ? 'Loading...' : '加载中…'}</p>}
      {projects.error && <p role="alert" className="p-2 text-xs text-red-600">{en ? 'Workspace service unavailable. Update the server or retry.' : 'Workspace 服务不可用，请升级后端或重试。'}</p>}
      {directory.filter(project => !query || [project.name, ...project.sessions.flatMap(session => [session.name, ...session.participants.flatMap(p => [p.label, p.adapter, p.host_name])])].some(name => name.toLowerCase().includes(query.toLowerCase()))).sort((a, b) => Number(pinned.includes(b.workspace_id)) - Number(pinned.includes(a.workspace_id))).map(project => <details key={project.workspace_id} open className="mb-2"><summary className="group flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-md px-2 py-1 hover:bg-zinc-200/50 dark:hover:bg-zinc-800"><ChevronRight size={12} /><FolderOpen size={14} className="text-zinc-400" /><span className="min-w-0 flex-1 truncate text-sm font-medium">{project.name}<span className={styles.projectMeta}>{roots.data?.roots.find(root => root.root_id === project.root_id)?.host_name || hostDirectory.find(host => host.host_id === project.host_id)?.display_name}</span></span><button className={`${iconButton} ${pinned.includes(project.workspace_id) ? '' : 'hidden group-hover:flex focus:flex'}`} data-pinned={pinned.includes(project.workspace_id)} title={en ? (pinned.includes(project.workspace_id) ? 'Unpin Workspace' : 'Pin Workspace') : (pinned.includes(project.workspace_id) ? '取消置顶' : '置顶工作区')} aria-label={`${en ? (pinned.includes(project.workspace_id) ? 'Unpin' : 'Pin') : (pinned.includes(project.workspace_id) ? '取消置顶' : '置顶')} ${project.name}`} aria-pressed={pinned.includes(project.workspace_id)} onClick={event => { event.preventDefault(); setPinned(before => before.includes(project.workspace_id) ? before.filter(id => id !== project.workspace_id) : [...before, project.workspace_id]) }}><Pin size={13} /></button><button className={iconButton} title={en ? 'Add Adapter session' : '添加 Adapter 会话'} aria-label={`${en ? 'Add session' : '添加会话'} ${project.name}`} onClick={event => { event.preventDefault(); start(project) }}><Plus size={14} /></button><button className={`${iconButton} hidden group-hover:flex focus:flex`} title={en ? 'Archive Workspace' : '归档工作区'} aria-label={`${en ? 'Archive' : '归档'} ${project.name}`} onClick={event => { event.preventDefault(); void archive(project) }}><Archive size={13} /></button></summary>
        <div className="ml-4 border-l border-zinc-200 pl-2 dark:border-zinc-700">{project.sessions.map(session => {
          const online = session.participants.filter(participant => props.onlineAgentIds?.has(participant.transport_agent_id)).length
          const status = en ? `${online}/${session.participants.length} adapters online` : `${online}/${session.participants.length} 个 Adapter 在线`
          const color = online === 0 ? 'text-zinc-400' : online === session.participants.length ? 'text-emerald-500' : 'text-amber-500'
          return <Link key={session.session_id} href={href(project, session)} onClick={() => setDrawerOpen(false)} aria-current={props.selectedTopicId === session.topic_id ? 'page' : undefined} className={`${styles.sessionLink} flex min-h-11 items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-zinc-200/60 dark:hover:bg-zinc-800 ${props.selectedTopicId === session.topic_id ? 'text-zinc-950 dark:text-white' : 'text-zinc-600 dark:text-zinc-300'}`}>
          <span role="img" aria-label={status} title={status} className={`shrink-0 ${color}`}>{session.participants.length > 1 ? <Users size={14} aria-hidden="true" /> : <Bot size={14} aria-hidden="true" />}</span><span className="min-w-0 flex-1"><span className="block truncate">{session.name}</span><span className="block truncate text-[10px] text-zinc-500">{session.participants.map(p => `${p.label} · ${adapterLabel(p.adapter)}`).join(' / ')}</span></span></Link>
        })}</div>
      </details>)}
      {projects.data && !directory.length && <p className="p-2 text-xs text-zinc-500">{en ? 'No Workspaces yet' : '暂无工作区'}</p>}
      {projects.data?.at(-1)?.next_offset != null && <button className="p-2 text-xs text-emerald-700" disabled={projects.isValidating} onClick={() => void projects.setSize(projects.size + 1)}>{en ? 'Load more' : '加载更多'}</button>}
      <details className={styles.computers}><summary><ChevronRight size={12} /><Laptop size={14} /><span>{en ? 'Computers & adapters' : '主机与 Agent'}</span>{hostDirectory.filter(host => host.status !== 'revoked').length}</summary>
        {hostDirectory.filter(host => host.status !== 'revoked' && host.agents.length).map(host => <div key={host.host_id} className={styles.computerItem}><Link href={setupPath}><Laptop size={13} /><span>{host.display_name}</span><span className={styles.connection} data-online={host.status === 'online'} title={host.status} /></Link>{host.agents.map(agent => <button key={agent.profile_id} className={styles.adapterShortcut} disabled={!agent.capabilities?.workspace_projects} title={`${agent.display_name} · ${adapterLabel(agent.adapter)}`} onClick={() => start(undefined, `${host.host_id}/${agent.profile_id}`)}><Bot size={13} /><span>{agent.display_name || adapterLabel(agent.adapter)}</span><Plus size={12} /></button>)}</div>)}
        <Link href={setupPath} className="flex items-center gap-2 px-2 py-3 text-xs text-zinc-500"><ArrowUpRight size={13} />{en ? 'Manage computers' : '管理主机'}</Link>
      </details>
    </nav>
    <footer className="space-y-1 border-t border-zinc-200 p-2 dark:border-zinc-800"><Link href={setupPath} className="flex h-8 items-center gap-2 px-2 text-xs text-zinc-500"><Laptop size={15} />{en ? 'Computers & adapters' : '主机与 Adapter'}</Link><Link href={basePath === '/desktop' ? '/desktop?legacy=1' : '/mobile/feed'} className="flex h-8 items-center gap-2 px-2 text-xs text-zinc-500"><History size={15} />{en ? 'Legacy conversations' : '旧版会话'}</Link><div className="flex items-center gap-2"><button className={iconButton} title={en ? 'Account settings' : '账户设置'} aria-label={en ? 'Account settings' : '账户设置'} onClick={() => setSettingsOpen(true)}><Settings2 size={16} /></button><span className="min-w-0 flex-1 truncate text-xs text-zinc-500">{props.currentUserName}</span><button className={iconButton} aria-label={en ? 'Sign out' : '退出账号'} title={en ? 'Sign out' : '退出账号'} onClick={props.onLogout}><LogOut size={15} /></button></div></footer>
  </>
  return <div className={`${styles.shell} flex h-dvh min-w-0 overflow-hidden`} data-testid="desktop-workspace-projects">
    {drawerOpen && <button className="fixed inset-0 z-30 bg-black/30 md:hidden" aria-label={en ? 'Close navigation' : '关闭导航'} onClick={() => setDrawerOpen(false)} />}
    <aside id="workspace-project-navigation" style={{ '--workspace-navigation-width': `${sidebarWidth}px` } as CSSProperties} className={`${styles.navigation} ${drawerOpen ? 'fixed inset-y-0 left-0 z-40 flex' : 'hidden'} w-[280px] max-w-[90vw] shrink-0 flex-col border-r ${collapsed ? 'md:hidden' : 'md:relative md:flex'} md:w-[var(--workspace-navigation-width)] md:max-w-[40vw]`}>
      {navigation}
      <div role="separator" tabIndex={0} aria-label={en ? 'Resize navigation' : '调整导航宽度'} aria-orientation="vertical" aria-controls="workspace-project-navigation" aria-valuemin={240} aria-valuemax={400} aria-valuenow={sidebarWidth}
        className="absolute inset-y-0 -right-1 z-10 hidden w-2 cursor-col-resize touch-none hover:bg-emerald-500/20 focus-visible:bg-emerald-500/20 focus-visible:outline-none md:block"
        onDoubleClick={() => setSidebarWidth(280)}
        onPointerDown={event => { if (event.button !== 0) return; resizeStart.current = { x: event.clientX, width: sidebarWidth }; event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault() }}
        onPointerMove={event => { const start = resizeStart.current; if (start) setSidebarWidth(Math.max(240, Math.min(400, start.width + event.clientX - start.x))) }}
        onPointerUp={event => { resizeStart.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }}
        onLostPointerCapture={() => { resizeStart.current = null }}
        onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); setSidebarWidth(width => event.key === 'Home' ? 240 : event.key === 'End' ? 400 : Math.max(240, Math.min(400, width + (event.key === 'ArrowRight' ? 16 : -16)))) } }} />
    </aside>
    <div className="flex min-h-0 min-w-0 flex-1 flex-col"><header className={`${styles.heading} flex h-12 shrink-0 items-center gap-2 border-b px-4`}><button className={`${iconButton} ${collapsed ? '' : 'md:hidden'}`} title={en ? 'Open navigation' : '展开导航'} aria-label={en ? 'Open navigation' : '展开导航'} aria-controls="workspace-project-navigation" onClick={() => { if (window.innerWidth < 768) setDrawerOpen(true); else setCollapsed(false) }}><PanelLeft size={17} /></button><FolderOpen size={15} className="text-zinc-400" /><span className="min-w-0 flex-1 truncate text-sm font-medium">{current?.name || (en ? 'Workspaces' : '工作区')}</span>{currentOwner && <span className={styles.owner} title={`${currentRoot?.name || current?.name} · ${currentOwner}`}><Laptop size={13} /><span>{currentOwner}</span></span>}</header>
      {current && <div className={styles.sessionTabs}><nav className={styles.sessionTabList} aria-label={en ? 'Workspace sessions' : '工作区执行会话'}>{current.sessions.map(session => <Link key={session.session_id} href={href(current, session)} className={styles.sessionTab} aria-current={currentSession?.session_id === session.session_id ? 'page' : undefined} title={session.participants.map(p => `${p.label} · ${adapterLabel(p.adapter)} · ${p.host_name}`).join('\n')}>{session.participants.length > 1 ? <Users size={14} /> : <Bot size={14} />}<span>{session.name}</span></Link>)}</nav>{currentSession && <span className={styles.participantSummary} title={currentSession.participants.map(p => `${p.label} · ${adapterLabel(p.adapter)} · ${p.host_name}`).join('\n')}><Bot size={13} /><span>{currentSession.participants.map(p => adapterLabel(p.adapter)).join(' + ')}</span></span>}<button className={iconButton} title={en ? 'Add Adapter session' : '添加 Agent 执行会话'} aria-label={en ? 'Add Adapter session' : '添加 Agent 执行会话'} onClick={() => start(current)}><Plus size={16} /></button></div>}
      <DesktopOnboarding accessToken={props.userToken} userId={props.currentUserId} onChanged={refresh} onWorkspaceReady={(hostId, profileId) => router.push(`${basePath}?${new URLSearchParams({ createHost: hostId, createProfile: profileId })}`, { scroll: false })} />
      {error && !creation && <p role="alert" className="p-2 text-xs text-red-600">{error}</p>}
      <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
        {selectionReady ? props.children : selectionMismatch && current && currentSession ? <div role="alert" className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"><p className="text-sm text-red-600">{en ? 'This link does not match the selected Workspace session.' : '链接与选中的 Workspace 会话不一致。'}</p><Link href={href(current, currentSession)} className="inline-flex items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700"><ArrowUpRight size={15} />{en ? 'Open session' : '打开会话'}</Link></div> : projects.error ? <div role="alert" className="flex h-full flex-col items-center justify-center gap-3 p-6"><p className="text-sm text-red-600">{en ? 'Could not load Workspaces.' : '工作区加载失败。'}</p><button className={iconButton} aria-label={en ? 'Retry Workspaces' : '重试工作区'} title={en ? 'Retry Workspaces' : '重试工作区'} onClick={() => void projects.mutate()}><RefreshCw size={16} /></button></div> : currentSession || (targetTopic && !targetFound && (projects.isLoading || projects.isValidating || canResolveNext)) ? <div role="status" className="flex h-full items-center justify-center gap-2 text-sm text-zinc-500"><Loader2 size={16} className="animate-spin" />{en ? 'Opening session...' : '正在打开会话…'}</div> : <WorkspaceOverview projects={directory} roots={roots.data?.roots || []} hosts={hostDirectory} en={en} create={start} href={href} setupPath={setupPath} />}
      </main>
    </div>
    <dialog ref={dialog} onCancel={event => { if (busy) event.preventDefault(); else setCreation(null) }} className="m-auto w-[min(560px,94vw)] max-h-[90dvh] rounded-lg border border-zinc-200 bg-white p-0 text-zinc-900 shadow-xl backdrop:bg-black/35 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
      {creation && <form onSubmit={submit} className="flex max-h-[90dvh] flex-col"><header className="flex items-center gap-2 border-b border-zinc-200 px-5 py-3 dark:border-zinc-800"><FolderOpen size={17} /><h2 className="flex-1 text-sm font-semibold">{creation.project ? (en ? 'Add session' : '添加执行会话') : (en ? 'New Workspace' : '新建 Workspace')}</h2><button type="button" className={iconButton} disabled={busy} aria-label={en ? 'Close' : '关闭'} onClick={() => setCreation(null)}><X size={17} /></button></header><div className="space-y-4 overflow-y-auto p-5">
        <div className={styles.creationMode} role="group" aria-label={en ? 'Session mode' : '执行模式'}><button type="button" disabled={creationLocked} aria-pressed={!collaborative} onClick={() => { setCollaborative(false); setSelected(before => before.slice(0, 1)) }}><Bot size={15} />{en ? 'Single Agent' : '单 Agent'}</button><button type="button" disabled={creationLocked} aria-pressed={collaborative} onClick={() => setCollaborative(true)}><Users size={15} />{en ? 'Collaboration' : '多 Agent 协作'}</button></div>
        <label className="block space-y-1.5 text-xs font-medium"><span>{en ? 'Name' : '名称'}</span><input autoFocus required maxLength={120} className={field} value={name} disabled={projectLocked} onChange={event => setName(event.target.value)} /></label>
        {!creation.project && <div className="space-y-1.5">
          <label className="block text-xs font-medium" htmlFor="workspace-directory">{en ? 'Project directory' : '项目目录'}</label>
          <div className="flex items-center gap-2">
            <select id="workspace-directory" required className={field} value={rootId} disabled={projectLocked} onChange={event => setRootId(event.target.value)}>
              <option value="">{en ? 'Choose authorized directory' : '选择已授权目录'}</option>
              {roots.data?.roots.map(root => <option key={root.root_id} value={root.root_id}>{root.name} · {root.host_name}</option>)}
            </select>
            {canAdmit && <button type="button" className={iconButton} title={en ? 'Authorize local directory' : '授权本机目录'} aria-label={en ? 'Authorize local directory' : '授权本机目录'} disabled={projectLocked} onClick={() => void admit()}><FolderOpen size={17} /></button>}
          </div>
        </div>}
        {chosenRoot && <p className="text-xs text-zinc-500">{creation.project ? `${chosenRoot.name} · ${chosenRoot.host_name} · ` : ''}{chosenRoot.access === 'read-only' ? (en ? 'Read-only directory' : '只读目录') : (en ? 'Directory read & write' : '目录读写')}</p>}
        {creation.project && !roots.isLoading && !roots.error && !chosenRoot && <p role="alert" className="text-xs text-red-600">{en ? 'This project directory is no longer authorized.' : '项目目录授权已不可用。'}</p>}
        <fieldset className="space-y-2"><legend className="mb-2 text-xs font-medium">{en ? 'Adapters' : 'Agent Adapter'}</legend>{hostDirectory.filter(host => host.status !== 'revoked' && host.agents.length).map(host => <div key={host.host_id} className={styles.hostGroup}><div className={styles.hostGroupTitle}><Laptop size={14} /><span>{host.display_name}</span><span className={styles.connection} data-online={host.status === 'online'}>{host.status === 'online' ? (en ? 'Online' : '在线') : (en ? 'Offline' : '离线')}</span></div>{host.agents.map(agent => {
          const key = `${host.host_id}/${agent.profile_id}`
          const restriction = adapterRestriction(agent, host.host_id, chosenRoot)
          const message = restriction === 'read-only' ? (en ? 'This Adapter requires a writable local directory' : '此 Adapter 需要可写的本机目录') : restriction === 'remote' ? (en ? 'Remote directory access requires MCP support' : '远程目录访问需要 MCP 支持') : (en ? 'Runtime upgrade required' : '需要升级运行时')
          return <div key={key} className={styles.adapterRow} data-selected={selected.includes(key)}><input type="checkbox" checked={selected.includes(key)} disabled={creationLocked || (Boolean(restriction) && !selected.includes(key)) || (!selected.includes(key) && selected.length >= 8)} aria-label={`${agent.display_name} ${host.display_name}`} onChange={event => { const checked = event.target.checked; if (checked && selected.length) setCollaborative(true); setSelected(before => checked ? [...before, key] : before.filter(item => item !== key)) }} /><Bot size={17} /><div><span className="text-sm">{agent.display_name || adapterLabel(agent.adapter)}</span><span className="text-xs text-zinc-500">{adapterLabel(agent.adapter)}</span>{restriction && <span className="text-[11px] text-amber-700 dark:text-amber-400">{message}</span>}</div>{selected.includes(key) && <input className={`${field} max-w-[120px]`} maxLength={80} disabled={creationLocked} aria-label={`${en ? 'Role' : '角色'} ${agent.display_name}`} placeholder={en ? 'Role' : '角色'} value={roles[key] ?? resolvedRoles[key] ?? ''} onChange={event => setRoles(before => ({ ...before, [key]: event.target.value }))} />}</div>
        })}</div>)}
          {hosts.isLoading && <p role="status" className="text-xs text-zinc-500">{en ? 'Loading computers...' : '正在加载主机…'}</p>}
          {hosts.data?.at(-1)?.nextOffset != null && <button type="button" disabled={busy || hosts.isValidating} className="flex items-center gap-1.5 py-2 text-xs text-emerald-700 disabled:opacity-40 dark:text-emerald-400" onClick={() => void hosts.setSize(hosts.size + 1)}>{hosts.isValidating && <Loader2 size={13} className="animate-spin" />}{en ? 'Load more computers' : '加载更多主机'}</button>}
          {!hosts.isLoading && !hosts.error && !available.length && hosts.data?.at(-1)?.nextOffset == null && <Link href={setupPath} className="text-xs text-emerald-700">{en ? 'Enable a computer' : '接入主机'}</Link>}
        </fieldset>
        {selected.length > 0 && !rolesValid && <p role="alert" className="text-xs text-red-600">{en ? 'Each role needs a unique, non-empty name.' : '每个角色需要不同的非空名称。'}</p>}
        {creation.request && !busy && error && <p role="status" className="text-xs text-amber-700 dark:text-amber-400">{en ? 'Session creation not confirmed. Retry the original request.' : '会话创建尚未确认，请重试原请求。'}</p>}
        {(error || roots.error || hosts.error) && <p role="alert" className="text-xs text-red-600">{error || (en ? 'Could not load directories or adapters. Retry.' : '目录或 Adapter 加载失败，请重试。')}</p>}
      </div><footer className="flex justify-end gap-2 border-t border-zinc-200 px-5 py-3 dark:border-zinc-800"><span className="mr-auto self-center text-xs text-zinc-500">{selected.length ? `${selected.length} ${en ? 'selected' : '个 Agent'}` : ''}</span><button type="button" disabled={busy} className="px-3 py-2 text-sm text-zinc-500" onClick={() => setCreation(null)}>{en ? 'Cancel' : '取消'}</button><button disabled={busy || !name.trim() || !selected.length || !chosenRoot || !selectionSupported || !rolesValid} className="flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900">{busy ? <Loader2 size={15} className="animate-spin" /> : selected.length > 1 ? <Users size={15} /> : <Plus size={15} />}{error && (creation.request || creation.projectRequest) ? (en ? 'Retry' : '重试') : (en ? 'Create' : '创建')}</button></footer></form>}
    </dialog>
    <WttSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} activePage={settingsPage} onPageChange={setSettingsPage} agents={props.agents.map(agent => ({ ...agent, id: agent.agent_id, is_primary: false }))} selectedAgentId={props.selectedAgentId} onBindingChanged={props.onBindingChanged} />
  </div>
}
