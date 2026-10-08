'use client'

import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import useSWRInfinite from 'swr/infinite'
import useSWR from 'swr'
import { Archive, ChevronRight, FolderOpen, History, Laptop, Loader2, LogOut, PanelLeft, Plus, RefreshCw, Search, Settings2, Users, X } from 'lucide-react'
import type { WttShellV2Props } from '@/components/ui/wtt-shell-v2'
import { WttSettingsModal } from '@/components/ui/wtt-settings-modal'
import { DesktopOnboarding } from './desktop-onboarding'
import { DesktopWorkspaceShell } from './desktop-workspace-shell'
import { DesktopHostsApi } from '@/lib/desktop-hosts'
import { getDesktopBridge } from '@/lib/desktop'
import { WorkspaceProjectsApi, type WorkspaceProject, type ProjectSession } from '@/lib/workspace-projects'
import { useI18n } from '@/lib/i18n-provider'

const iconButton = 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 disabled:opacity-40'
const field = 'min-h-9 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-zinc-700 dark:bg-zinc-950'

export function DesktopProjectShell(props: WttShellV2Props) {
  const params = useSearchParams()
  if (params.get('legacy') === '1') return <DesktopWorkspaceShell {...props} />
  return <ProjectShell key={props.currentUserId || props.userToken || 'signed-out'} {...props} />
}

function ProjectShell(props: WttShellV2Props) {
  const { locale } = useI18n()
  const en = locale === 'en'
  const router = useRouter()
  const params = useSearchParams()
  const api = useMemo(() => new WorkspaceProjectsApi(props.userToken || ''), [props.userToken])
  const hostApi = useMemo(() => new DesktopHostsApi(props.userToken || ''), [props.userToken])
  const [query, setQuery] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(280)
  const resizeStart = useRef<{ x: number; width: number } | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsPage, setSettingsPage] = useState<'profile' | 'membership'>('profile')
  const [creation, setCreation] = useState<{ workspaceId: string; sessionId: string; project?: WorkspaceProject; created?: WorkspaceProject } | null>(null)
  const [name, setName] = useState('')
  const [rootId, setRootId] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [roles, setRoles] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [canAdmit, setCanAdmit] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const live = useRef(true)
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
    return selected && !all.some(project => project.workspace_id === selected.workspace_id) ? [selected, ...all] : all
  }, [projects.data, detail.data])
  const current = directory.find(project => project.sessions.some(session => session.topic_id === props.selectedTopicId))
  const currentSession = current?.sessions.find(session => session.topic_id === props.selectedTopicId)
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
    router.replace(`/desktop?${restored}`, { scroll: false })
  }, [current, currentSession, params, props.selectedAgentId, router])
  const available = hostDirectory.filter(host => host.status !== 'revoked').flatMap(host => host.agents.map(agent => ({ host, agent, key: `${host.host_id}/${agent.profile_id}` })))
  const chosenRoot = roots.data?.roots.find(root => root.root_id === (creation?.project?.root_id || creation?.created?.root_id || rootId))
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

  function start(project?: WorkspaceProject) {
    setName(''); setSelected([]); setRoles({}); setError(''); setRootId(project?.root_id || roots.data?.roots[0]?.root_id || '')
    setCreation({ workspaceId: project?.workspace_id || crypto.randomUUID(), sessionId: crypto.randomUUID(), project }); setDrawerOpen(false)
  }
  function href(project: WorkspaceProject, session: ProjectSession) {
    return `/desktop?${new URLSearchParams({ workspace: project.workspace_id, session: session.session_id, topic: session.topic_id, agentId: session.participants[0]?.transport_agent_id || '' })}`
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
    if (!creation || busy || !name.trim() || !selected.length || !chosenRoot) return
    setBusy(true); setError('')
    try {
      const project = creation.project || creation.created || await api.create({ workspace_id: creation.workspaceId, name: name.trim(), root_id: chosenRoot.root_id })
      if (!live.current) return
      if (!creation.project && !creation.created) setCreation(before => before && { ...before, created: project })
      const participants = selected.map(key => { const value = available.find(item => item.key === key)!; return { host_id: value.host.host_id, profile_id: value.agent.profile_id, label: (roles[key] || value.agent.display_name || value.agent.adapter).trim() } })
      const session = await api.createSession(project.workspace_id, { session_id: creation.sessionId, name: creation.project ? name.trim() : (selected.length > 1 ? (en ? 'Team' : '协作') : (en ? 'Main' : '主会话')), participants })
      if (!live.current) return
      await projects.mutate(); await detail.mutate(); props.onTopicsRefresh?.(); props.onBindingChanged?.()
      router.push(href(project, session)); setCreation(null)
    } catch (value) { if (live.current) setError(value instanceof Error ? value.message : 'Workspace creation failed') }
    finally { if (live.current) setBusy(false) }
  }
  async function archive(project: WorkspaceProject) {
    if (!window.confirm(en ? `Archive ${project.name}? Running Workspace tools will be revoked; history is preserved.` : `归档 ${project.name}？Workspace 工具权限将撤销，历史保留。`)) return
    try { await api.request(`/${project.workspace_id}/archive`, {}); await projects.mutate(); if (current === project) router.push('/desktop') }
    catch (value) { setError(value instanceof Error ? value.message : 'Archive failed') }
  }
  const navigation = <>
    <header className="flex h-12 items-center gap-2 border-b border-zinc-200 px-4 dark:border-zinc-800"><FolderOpen size={18} /><span className="flex-1 text-sm font-semibold">WTT</span><button className={iconButton} title={en ? 'Refresh Workspaces' : '刷新工作区'} aria-label={en ? 'Refresh Workspaces' : '刷新工作区'} onClick={refresh}><RefreshCw size={15} /></button><button className={`${iconButton} hidden md:inline-flex`} title={en ? 'Collapse navigation' : '收起导航'} aria-label={en ? 'Collapse navigation' : '收起导航'} onClick={() => { setCollapsed(true); setDrawerOpen(false) }}><PanelLeft size={16} /></button><button className={`${iconButton} md:hidden`} title={en ? 'Close navigation' : '关闭导航'} aria-label={en ? 'Close navigation' : '关闭导航'} onClick={() => setDrawerOpen(false)}><X size={16} /></button></header>
    <div className="space-y-2 p-3"><button className="flex h-9 w-full items-center justify-center gap-2 rounded-md bg-zinc-900 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900" onClick={() => start()} disabled={!props.userToken}><Plus size={16} />{en ? 'New Workspace' : '新建 Workspace'}</button><label className="flex h-9 items-center gap-2 rounded-md border border-zinc-200 bg-white px-2 dark:border-zinc-700 dark:bg-zinc-950"><Search size={15} className="text-zinc-400" /><input type="search" value={query} onChange={event => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" aria-label={en ? 'Search Workspaces' : '搜索工作区'} placeholder={en ? 'Search Workspaces' : '搜索工作区'} /></label></div>
    <nav className="min-h-0 flex-1 overflow-y-auto px-2" aria-label="Workspaces"><div className="px-2 py-2 text-xs font-medium text-zinc-500">Workspaces</div>
      {projects.isLoading && <p role="status" className="p-2 text-xs text-zinc-500">{en ? 'Loading...' : '加载中…'}</p>}
      {projects.error && <p role="alert" className="p-2 text-xs text-red-600">{en ? 'Workspace service unavailable. Update the server or retry.' : 'Workspace 服务不可用，请升级后端或重试。'}</p>}
      {directory.filter(project => !query || [project.name, ...project.sessions.map(session => session.name)].some(name => name.toLowerCase().includes(query.toLowerCase()))).map(project => <details key={project.workspace_id} open className="mb-2"><summary className="group flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-md px-2 hover:bg-zinc-200/50 dark:hover:bg-zinc-800"><ChevronRight size={12} /><FolderOpen size={14} className="text-zinc-400" /><span className="min-w-0 flex-1 truncate text-sm font-medium">{project.name}</span><button className={iconButton} title={en ? 'Add Adapter session' : '添加 Adapter 会话'} aria-label={`${en ? 'Add session' : '添加会话'} ${project.name}`} onClick={event => { event.preventDefault(); start(project) }}><Plus size={14} /></button><button className={`${iconButton} hidden group-hover:flex focus:flex`} title={en ? 'Archive Workspace' : '归档工作区'} aria-label={`${en ? 'Archive' : '归档'} ${project.name}`} onClick={event => { event.preventDefault(); void archive(project) }}><Archive size={13} /></button></summary>
        <div className="ml-4 border-l border-zinc-200 pl-2 dark:border-zinc-700">{project.sessions.map(session => {
          const online = session.participants.filter(participant => props.onlineAgentIds?.has(participant.transport_agent_id)).length
          const status = en ? `${online}/${session.participants.length} adapters online` : `${online}/${session.participants.length} 个 Adapter 在线`
          const color = online === 0 ? 'text-zinc-400' : online === session.participants.length ? 'text-emerald-500' : 'text-amber-500'
          return <Link key={session.session_id} href={href(project, session)} onClick={() => setDrawerOpen(false)} aria-current={props.selectedTopicId === session.topic_id ? 'page' : undefined} className={`flex min-h-11 items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-zinc-200/60 dark:hover:bg-zinc-800 ${props.selectedTopicId === session.topic_id ? 'bg-white text-zinc-950 dark:bg-zinc-800 dark:text-white' : 'text-zinc-600 dark:text-zinc-300'}`}>
          <span role="img" aria-label={status} title={status} className={`shrink-0 ${color}`}>{session.participants.length > 1 ? <Users size={14} aria-hidden="true" /> : <span className="block h-1.5 w-1.5 rounded-full bg-current" />}</span><span className="min-w-0 flex-1"><span className="block truncate">{session.name}</span><span className="block truncate text-[10px] text-zinc-500">{session.participants.map(p => `${p.label} · ${p.adapter}`).join(' / ')}</span></span></Link>
        })}</div>
      </details>)}
      {projects.data && !directory.length && <p className="p-2 text-xs text-zinc-500">{en ? 'No Workspaces yet' : '暂无工作区'}</p>}
      {projects.data?.at(-1)?.next_offset != null && <button className="p-2 text-xs text-emerald-700" disabled={projects.isValidating} onClick={() => void projects.setSize(projects.size + 1)}>{en ? 'Load more' : '加载更多'}</button>}
    </nav>
    <footer className="space-y-1 border-t border-zinc-200 p-2 dark:border-zinc-800"><Link href="/desktop/setup" className="flex h-8 items-center gap-2 px-2 text-xs text-zinc-500"><Laptop size={15} />{en ? 'Computers & adapters' : '主机与 Adapter'}</Link><Link href="/desktop?legacy=1" className="flex h-8 items-center gap-2 px-2 text-xs text-zinc-500"><History size={15} />{en ? 'Legacy conversations' : '旧版会话'}</Link><div className="flex items-center gap-2"><button className={iconButton} title={en ? 'Account settings' : '账户设置'} aria-label={en ? 'Account settings' : '账户设置'} onClick={() => setSettingsOpen(true)}><Settings2 size={16} /></button><span className="min-w-0 flex-1 truncate text-xs text-zinc-500">{props.currentUserName}</span><button className={iconButton} aria-label={en ? 'Sign out' : '退出账号'} title={en ? 'Sign out' : '退出账号'} onClick={props.onLogout}><LogOut size={15} /></button></div></footer>
  </>
  return <div className="flex h-dvh min-w-0 overflow-hidden bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100" data-testid="desktop-workspace-projects">
    {drawerOpen && <button className="fixed inset-0 z-30 bg-black/30 md:hidden" aria-label={en ? 'Close navigation' : '关闭导航'} onClick={() => setDrawerOpen(false)} />}
    <aside id="workspace-project-navigation" style={{ '--workspace-navigation-width': `${sidebarWidth}px` } as CSSProperties} className={`${drawerOpen ? 'fixed inset-y-0 left-0 z-40 flex' : 'hidden'} w-[280px] max-w-[90vw] shrink-0 flex-col border-r border-zinc-200 bg-zinc-50 ${collapsed ? 'md:hidden' : 'md:relative md:flex'} md:w-[var(--workspace-navigation-width)] md:max-w-[40vw] dark:border-zinc-800 dark:bg-zinc-900`}>
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
    <div className="flex min-h-0 min-w-0 flex-1 flex-col"><header className="flex h-12 shrink-0 items-center gap-2 border-b border-zinc-200 px-4 dark:border-zinc-800"><button className={`${iconButton} ${collapsed ? '' : 'md:hidden'}`} title={en ? 'Open navigation' : '展开导航'} aria-label={en ? 'Open navigation' : '展开导航'} aria-controls="workspace-project-navigation" onClick={() => { if (window.innerWidth < 768) setDrawerOpen(true); else setCollapsed(false) }}><PanelLeft size={17} /></button><FolderOpen size={15} className="text-zinc-400" /><span className="min-w-0 truncate text-sm font-medium">{current?.name || 'Workspaces'}</span>{currentSession && <><ChevronRight size={12} className="text-zinc-400" /><span className="min-w-0 flex-1 truncate text-sm text-zinc-500">{currentSession.name}</span><span className="hidden text-xs text-zinc-500 sm:block">{currentSession.participants.length > 1 ? `${currentSession.participants.length} Adapters` : currentSession.participants[0]?.adapter}</span></>}</header>
      <DesktopOnboarding accessToken={props.userToken} userId={props.currentUserId} onChanged={refresh} />
      {error && !creation && <p role="alert" className="p-2 text-xs text-red-600">{error}</p>}
      <main className="min-h-0 min-w-0 flex-1 overflow-hidden">{currentSession ? props.children : <div className="flex h-full flex-col items-center justify-center gap-4 p-6"><FolderOpen size={36} strokeWidth={1.25} className="text-zinc-300 dark:text-zinc-600" /><h1 className="text-lg font-medium">{en ? 'Workspaces' : '工作区'}</h1><button className="flex items-center gap-2 rounded-md border border-zinc-200 px-4 py-2 text-sm dark:border-zinc-700" onClick={() => start()}><Plus size={16} />{en ? 'New Workspace' : '新建 Workspace'}</button></div>}</main>
    </div>
    <dialog ref={dialog} onCancel={event => { if (busy) event.preventDefault(); else setCreation(null) }} className="m-auto w-[min(560px,94vw)] max-h-[90dvh] rounded-lg border border-zinc-200 bg-white p-0 text-zinc-900 shadow-xl backdrop:bg-black/35 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
      {creation && <form onSubmit={submit} className="flex max-h-[90dvh] flex-col"><header className="flex items-center gap-2 border-b border-zinc-200 px-5 py-3 dark:border-zinc-800"><FolderOpen size={17} /><h2 className="flex-1 text-sm font-semibold">{creation.project ? (en ? 'Add session' : '添加执行会话') : (en ? 'New Workspace' : '新建 Workspace')}</h2><button type="button" className={iconButton} disabled={busy} aria-label={en ? 'Close' : '关闭'} onClick={() => setCreation(null)}><X size={17} /></button></header><div className="space-y-4 overflow-y-auto p-5">
        <label className="block space-y-1.5 text-xs font-medium"><span>{en ? 'Name' : '名称'}</span><input autoFocus required maxLength={120} className={field} value={name} disabled={busy || Boolean(creation.created)} onChange={event => setName(event.target.value)} /></label>
        {!creation.project && <div className="space-y-1.5">
          <label className="block text-xs font-medium" htmlFor="workspace-directory">{en ? 'Project directory' : '项目目录'}</label>
          <div className="flex items-center gap-2">
            <select id="workspace-directory" required className={field} value={rootId} disabled={busy || Boolean(creation.created)} onChange={event => setRootId(event.target.value)}>
              <option value="">{en ? 'Choose authorized directory' : '选择已授权目录'}</option>
              {roots.data?.roots.map(root => <option key={root.root_id} value={root.root_id}>{root.name} · {root.host_name}</option>)}
            </select>
            {canAdmit && <button type="button" className={iconButton} title={en ? 'Authorize local directory' : '授权本机目录'} aria-label={en ? 'Authorize local directory' : '授权本机目录'} disabled={busy || Boolean(creation.created)} onClick={() => void admit()}><FolderOpen size={17} /></button>}
          </div>
        </div>}
        <fieldset className="space-y-2"><legend className="mb-2 text-xs font-medium">{en ? 'Adapters' : '执行 Adapter'}</legend>{available.map(({ host, agent, key }) => { const caps = agent.capabilities; const remote = chosenRoot && chosenRoot.host_id !== host.host_id; const enabled = caps?.workspace_projects && (!remote || caps?.workspace_mcp); return <div key={key} className="flex items-center gap-2 border-b border-zinc-100 py-2 dark:border-zinc-800"><input type="checkbox" checked={selected.includes(key)} disabled={busy || !enabled || (!selected.includes(key) && selected.length >= 8)} aria-label={`${agent.display_name} ${host.display_name}`} onChange={event => setSelected(before => event.target.checked ? [...before, key] : before.filter(item => item !== key))} /><div className="min-w-0 flex-1"><span className="block truncate text-sm">{agent.display_name || agent.adapter}</span><span className="block truncate text-xs text-zinc-500">{agent.adapter} · {host.display_name} · {host.status}</span>{!enabled && <span className="block text-[11px] text-amber-700 dark:text-amber-400">{en ? 'Enable an updated runtime; remote access requires MCP support' : '需启用新版运行时；跨主机执行需支持 MCP'}</span>}</div>{selected.includes(key) && <input className={`${field} max-w-[150px]`} maxLength={80} disabled={busy} aria-label={`${en ? 'Role' : '角色'} ${agent.display_name}`} placeholder={en ? 'Role' : '角色'} value={roles[key] ?? agent.display_name ?? agent.adapter} onChange={event => setRoles(before => ({ ...before, [key]: event.target.value }))} />}</div> })}
          {hosts.isLoading && <p role="status" className="text-xs text-zinc-500">{en ? 'Loading computers...' : '正在加载主机…'}</p>}
          {hosts.data?.at(-1)?.nextOffset != null && <button type="button" disabled={busy || hosts.isValidating} className="flex items-center gap-1.5 py-2 text-xs text-emerald-700 disabled:opacity-40 dark:text-emerald-400" onClick={() => void hosts.setSize(hosts.size + 1)}>{hosts.isValidating && <Loader2 size={13} className="animate-spin" />}{en ? 'Load more computers' : '加载更多主机'}</button>}
          {!hosts.isLoading && !hosts.error && !available.length && hosts.data?.at(-1)?.nextOffset == null && <Link href="/desktop/setup" className="text-xs text-emerald-700">{en ? 'Enable a computer' : '接入主机'}</Link>}
        </fieldset>
        {(error || roots.error || hosts.error) && <p role="alert" className="text-xs text-red-600">{error || (en ? 'Could not load directories or adapters. Retry.' : '目录或 Adapter 加载失败，请重试。')}</p>}
      </div><footer className="flex justify-end gap-2 border-t border-zinc-200 px-5 py-3 dark:border-zinc-800"><button type="button" disabled={busy} className="px-3 py-2 text-sm text-zinc-500" onClick={() => setCreation(null)}>{en ? 'Cancel' : '取消'}</button><button disabled={busy || !name.trim() || !selected.length || !chosenRoot} className="flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900">{busy ? <Loader2 size={15} className="animate-spin" /> : selected.length > 1 ? <Users size={15} /> : <Plus size={15} />}{en ? 'Create' : '创建'}</button></footer></form>}
    </dialog>
    <WttSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} activePage={settingsPage} onPageChange={page => setSettingsPage(page === 'membership' ? 'membership' : 'profile')} agents={props.agents.map(agent => ({ ...agent, id: agent.agent_id, is_primary: false }))} selectedAgentId={props.selectedAgentId} onBindingChanged={props.onBindingChanged} />
  </div>
}
