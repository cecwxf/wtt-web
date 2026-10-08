'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import useSWRInfinite from 'swr/infinite'
import { BookOpen, ChevronDown, ChevronRight, Clock3, ExternalLink, FileUp, Laptop, LogOut, MessageSquare, MessageSquarePlus, PanelLeft, Plus, RefreshCw, Search, Settings2, Star, Users, X } from 'lucide-react'
import type { WttShellV2Props } from '@/components/ui/wtt-shell-v2'
import { WttSettingsModal } from '@/components/ui/wtt-settings-modal'
import { DesktopHostsApi, HostRequestError } from '@/lib/desktop-hosts'
import { getDesktopBridge } from '@/lib/desktop'
import { useI18n } from '@/lib/i18n-provider'
import { DesktopOnboarding } from './desktop-onboarding'
import { favoriteKey, useNavigationFavorites, type NavigationFavorite } from '@/lib/hooks/use-navigation-favorites'
import type { AgentOperationJob } from '@/components/ui/topic-column'

const TopicCreationDialogs = dynamic(() => import('@/components/ui/topic-column').then(module => module.TopicColumn))
const HistoryImport = dynamic(() => import('./desktop-history-import').then(module => module.DesktopHistoryImport))

const iconButton = 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'
const rowClass = 'flex min-h-9 min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-zinc-200/60 dark:hover:bg-zinc-800'

function desktopHref(agentId: string, topicId?: string) {
  const query = new URLSearchParams()
  if (agentId) query.set('agentId', agentId)
  if (topicId) query.set('topic', topicId)
  return `/desktop?${query}`
}

function Section({ title, icon, children, action }: { title: string; icon: ReactNode; children: ReactNode; action?: ReactNode }) {
  return <section className="min-w-0 space-y-1 py-2" aria-label={title}>
    <div className="flex min-h-8 items-center justify-between gap-1 px-2">
      <h2 className="flex min-w-0 items-center gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">{icon}{title}</h2>
      {action}
    </div>
    {children}
  </section>
}

export function DesktopWorkspaceShell(props: WttShellV2Props) {
  // Directory/search state must never survive a change of authenticated account.
  return <DesktopWorkspaceShellInner key={props.currentUserId || props.userToken || 'signed-out'} {...props} />
}

function DesktopWorkspaceShellInner(props: WttShellV2Props) {
  const { locale } = useI18n()
  const en = locale === 'en'
  const bookmarks = useNavigationFavorites(props.currentUserId, props.userToken)
  const [query, setQuery] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsPage, setSettingsPage] = useState<NonNullable<WttShellV2Props['forceOpenSettingsPage']>>('profile')
  const [creationRequest, setCreationRequest] = useState<{ id: number; kind: 'group' | 'team' }>()
  const [localTeamHost, setLocalTeamHost] = useState<{ id: string; adapters: string[] }>()
  const [creationBusy, setCreationBusy] = useState(false)
  const [creationError, setCreationError] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [canImport, setCanImport] = useState(false)
  useEffect(() => { setCanImport(Boolean(getDesktopBridge()?.fs)) }, [])
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const openCreation = async (kind: 'group' | 'team') => {
    if (creationBusy) return
    setCreationBusy(true); setCreationError('')
    try {
      let hostOption: typeof localTeamHost
      const bridge = getDesktopBridge()?.host
      if (kind === 'team' && bridge?.teamProfilesSupported && bridge.discoverAgents) {
        const state = await bridge.status()
        if (state.state === 'registered' && state.userId === props.currentUserId && state.hostId) {
          const found = await bridge.discoverAgents()
          const adapters = Array.from(new Set(found.filter(profile => profile.available && ['codex', 'claude-code', 'gemini'].includes(profile.adapter)).map(profile => profile.adapter)))
          if (adapters.length) hostOption = { id: state.hostId, adapters }
        }
      }
      if (!alive.current) return
      setLocalTeamHost(hostOption)
      setCreationRequest(previous => ({ id: (previous?.id || 0) + 1, kind }))
      closeDrawer()
    } catch (error) {
      if (alive.current) setCreationError(error instanceof Error ? error.message : (en ? 'Could not load team settings.' : '团队设置加载失败。'))
    } finally { if (alive.current) setCreationBusy(false) }
  }
  const createManagedTeam = async (payload: Record<string, unknown>, progress: (job: AgentOperationJob) => void): Promise<AgentOperationJob> => {
    const bridge = getDesktopBridge()?.host
    if (!localTeamHost || !bridge?.addTeamProfiles || !bridge.startAgents || !bridge.runtimeStatus || !props.onSubmitAgentOperation) throw new Error(en ? 'Update WTT Desktop to create a local team.' : '请升级 WTT Desktop 后创建本机团队。')
    const current = async () => {
      const state = await bridge.status()
      if (!alive.current || state.state !== 'registered' || state.userId !== props.currentUserId || state.hostId !== localTeamHost.id) throw new Error(en ? 'Local team operation cancelled.' : '本机团队操作已取消。')
    }
    await current()
    const roles = payload.roles as Array<{ display_name: string }>
    let requestId = String(payload.client_operation_id || '')
    const adapter = String(payload.adapter || '')
    const names = roles.map(role => role.display_name)
    const before = await bridge.runtimeStatus()
    let profileIds: string[]
    let runtime = before
    const pending = nativeTeamDraft.current
    if (bridge.prepareTeam) {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([payload.name, payload.description, adapter, payload.roles])))
      const draftKey = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
      progress({ phase: en ? 'Recovering local profiles' : '恢复本机配置' })
      const prepared = await bridge.prepareTeam({ requestId, draftKey, adapter, names })
      await current()
      requestId = prepared.requestId
      profileIds = prepared.profiles.map(profile => profile.profile_id)
      if (before.state === 'stopped') runtime = await startTeam(profileIds, prepared.profiles.some(profile => profile.requiresFullAccess))
    } else if (before.state === 'running' && pending?.requestId === requestId && pending.adapter === adapter && JSON.stringify(pending.names) === JSON.stringify(names)
        && before.agents.length === pending.profileIds.length && before.agents.every(agent => pending.profileIds.includes(agent.profileId))) {
      profileIds = pending.profileIds
    } else {
      if (before.state !== 'stopped') throw new Error(en ? 'Stop local Agents in computer settings before creating a team.' : '请先在主机设置中停止本机 Agent，再创建团队。')
      progress({ phase: en ? 'Preparing local profiles' : '准备本机配置' })
      const drafts = await bridge.addTeamProfiles({ requestId, adapter, names })
      await current()
      profileIds = drafts.map(profile => profile.profile_id)
      nativeTeamDraft.current = { requestId, adapter, names, profileIds }
      runtime = await startTeam(profileIds, drafts.some(profile => profile.requiresFullAccess))
    }
    async function startTeam(ids: string[], fullAccess: boolean) {
      progress({ phase: en ? 'Waiting for native confirmation' : '等待原生授权确认' })
      let started
      try {
        started = await bridge!.startAgents!({ profileIds: ids, workspaceAccess: fullAccess ? 'full-access' : 'workspace-write',
          remoteTools: { files: 'off', terminal: false, previewPorts: [] } })
      } catch (error) {
        const cancelled = error instanceof Error && /Local Agent operation cancelled/.test(error.message)
        throw new Error(cancelled
          ? (en ? 'Team startup cancelled. Local drafts are preserved; no team topic was created.' : '已取消团队启动。本机配置草稿已保留，没有创建团队会话。')
          : (en ? 'Local team startup failed. Check computer settings before retrying.' : '本机团队启动失败，请在主机设置中检查后重试。'))
      }
      await current()
      return started
    }
    const agentIds = profileIds.map(id => runtime.agents.find(agent => agent.profileId === id)?.agentId)
    if (runtime.state !== 'running' || agentIds.some(id => !id)) throw new Error(en ? 'Local team registration did not complete.' : '本机团队 Agent 登记尚未完成。')
    const job = await props.onSubmitAgentOperation('team_create', { ...payload, client_operation_id: requestId, runtime_mode: 'managed_desktop', host_id: localTeamHost.id, agent_ids: agentIds }, undefined, progress)
    await current()
    const result = job.result as { topic_id?: string; topic?: { topic_id?: string } } | undefined
    if (job.status === 'succeeded' && (result?.topic_id || result?.topic?.topic_id)) {
      // A failed local acknowledgement leaves the idempotent request recoverable.
      try { await bridge.completeTeam?.({ requestId }) } catch { /* No new Agents or backend job on retry. */ }
      nativeTeamDraft.current = undefined
    }
    return job
  }
  const nativeTeamDraft = useRef<{ requestId: string; adapter: string; names: string[]; profileIds: string[] }>()
  const [collapsed, setCollapsed] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(288)
  const resizeStart = useRef<{ x: number; width: number } | null>(null)
  const drawer = useRef<HTMLDialogElement>(null)
  const api = useMemo(() => new DesktopHostsApi(props.userToken || ''), [props.userToken])
  const { data, error, isLoading, isValidating, size, setSize, mutate } = useSWRInfinite(
    (page: number, previous: { nextOffset: number | null } | null) => !props.userToken || (page > 0 && previous?.nextOffset == null)
      ? null : ['desktop-navigation-hosts', props.userToken, page === 0 ? 0 : previous?.nextOffset],
    ([, , offset]: [string, string, number]) => api.list(offset),
    { revalidateOnFocus: true, shouldRetryOnError: false },
  )
  const hosts = useMemo(() => Array.from(new Map((data || []).flatMap(page => page.hosts).map(host => [host.host_id, host])).values()), [data])
  const excludedCloneAgentIds = useMemo(() => new Set(hosts.flatMap(host => host.agents.map(agent => agent.agent_id))), [hosts])
  const assigned = new Set(hosts.flatMap(host => host.agents.map(agent => agent.agent_id)))
  const unassigned = props.agents.filter(agent => !assigned.has(agent.agent_id))
  const matches = (...values: Array<string | undefined>) => !query.trim() || values.some(value => value?.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const selected = props.agents.find(agent => agent.agent_id === props.selectedAgentId)
  const selectedHost = hosts.find(host => host.agents.some(agent => agent.agent_id === props.selectedAgentId))
  const closeDrawer = () => drawer.current?.close()

  useEffect(() => {
    if (!props.forceOpenSettingsPage) return
    setSettingsPage(props.forceOpenSettingsPage)
    setSettingsOpen(true)
    props.onForceOpenHandled?.()
  }, [props.forceOpenSettingsPage, props.onForceOpenHandled])

  useEffect(() => {
    const host = getDesktopBridge()?.host
    const refresh = () => { void mutate(); props.onBindingChanged?.() }
    const offState = host?.onState?.(refresh)
    const offRuntime = host?.onRuntimeState?.(refresh)
    window.addEventListener('wtt-directory-changed', refresh)
    return () => { offState?.(); offRuntime?.(); window.removeEventListener('wtt-directory-changed', refresh) }
  }, [mutate, props.onBindingChanged])

  useEffect(() => {
    const resize = () => { if (window.innerWidth >= 768) drawer.current?.close() }
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  const favoriteButton = (kind: NavigationFavorite['kind'], id: string, agentId: string, name: string) => {
    const key = favoriteKey(kind, id)
    const saved = bookmarks.keys.has(key)
    const label = `${saved ? (en ? 'Remove favorite' : '取消收藏') : (en ? 'Favorite' : '收藏')} ${kind === 'agent' ? 'Agent' : (en ? 'conversation' : '对话')} ${name}`
    return <button type="button" className={`${iconButton} ${saved ? 'text-amber-600 dark:text-amber-400' : ''}`}
      disabled={bookmarks.disabled || bookmarks.pending.has(key)} aria-label={label} title={label} aria-pressed={saved}
      onClick={() => void bookmarks.toggle(kind, id, agentId)}><Star size={14} fill={saved ? 'currentColor' : 'none'} /></button>
  }

  const agentRow = (agent: { agent_id: string; display_name: string; adapter?: string }) => <div key={agent.agent_id} className="flex min-w-0 items-center">
    <Link
    key={agent.agent_id} href={desktopHref(agent.agent_id)} onClick={() => { props.onTopicChange(null); closeDrawer() }}
    aria-current={agent.agent_id === props.selectedAgentId ? 'page' : undefined} title={`${agent.display_name} · ${agent.agent_id}`}
    className={`${rowClass} flex-1 ${agent.agent_id === props.selectedAgentId ? 'bg-white font-medium text-zinc-950 dark:bg-zinc-800 dark:text-white' : 'text-zinc-600 dark:text-zinc-300'}`}>
    <span aria-label={props.onlineAgentIds?.has(agent.agent_id) ? (en ? 'Online' : '在线') : (en ? 'Offline' : '离线')} className={`h-1.5 w-1.5 shrink-0 rounded-full ${props.onlineAgentIds?.has(agent.agent_id) ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
    <span className="min-w-0 flex-1 truncate">{agent.display_name || agent.agent_id}</span>
    {agent.adapter && <span className="max-w-20 truncate text-[10px] text-zinc-500">{agent.adapter}</span>}
  </Link>
    {favoriteButton('agent', agent.agent_id, agent.agent_id, agent.display_name || agent.agent_id)}
  </div>

  const topicRow = (id: string, name: string, agentId: string, secondary?: string, unread?: number) => <div key={id} className="flex min-w-0 items-center">
    <Link
    key={id} href={desktopHref(agentId, id)} onClick={closeDrawer} title={name}
    aria-current={id === props.selectedTopicId ? 'page' : undefined}
    className={`${rowClass} flex-1 ${id === props.selectedTopicId ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100' : 'text-zinc-700 dark:text-zinc-300'}`}>
    <MessageSquare size={14} className="shrink-0 text-zinc-400" />
    <span className="min-w-0 flex-1"><span className="block truncate">{name}</span>{secondary && <span className="block truncate text-[11px] text-zinc-500 dark:text-zinc-400">{secondary}</span>}</span>
    {!!unread && <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{unread > 99 ? '99+' : unread}</span>}
  </Link>
    {favoriteButton('topic', id, agentId, name)}
  </div>

  const navigation = (mobile = false) => <>
    <div className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-200 px-3 dark:border-zinc-800">
      <Link href="/desktop" className="text-base font-semibold" onClick={closeDrawer}>WTT</Link>
      <div className="flex items-center gap-1">
        <Link href="/desktop/setup" className={iconButton} title={en ? 'Computer settings' : '主机设置'} aria-label={en ? 'Computer settings' : '主机设置'}><Laptop size={17} /></Link>
        <button className={iconButton} title={mobile ? (en ? 'Close navigation' : '关闭导航') : (en ? 'Collapse navigation' : '收起导航')} aria-label={mobile ? (en ? 'Close navigation' : '关闭导航') : (en ? 'Collapse navigation' : '收起导航')} onClick={() => { if (!mobile) setCollapsed(true); closeDrawer() }}>{mobile ? <X size={17} /> : <PanelLeft size={17} />}</button>
      </div>
    </div>
    <div className="space-y-2 px-3 py-3">
      <button className="flex h-9 w-full items-center justify-center gap-2 rounded-md bg-zinc-900 px-3 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900" disabled={!props.selectedAgentId} onClick={() => { props.onCreateGeneralTask?.(); closeDrawer() }}><MessageSquarePlus size={16} />{en ? 'New conversation' : '新建对话'}</button>
      <label className="flex h-9 items-center gap-2 rounded-md border border-zinc-200 bg-white px-2 dark:border-zinc-700 dark:bg-zinc-950"><Search size={15} className="shrink-0 text-zinc-400" /><input value={query} onChange={event => setQuery(event.target.value)} type="search" aria-label={en ? 'Search conversations and agents' : '搜索对话和 Agent'} placeholder={en ? 'Search' : '搜索'} className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
    </div>
    <nav aria-label={en ? 'Workspace navigation' : '工作区导航'} className="min-h-0 flex-1 overflow-y-auto px-2">
      <Section title={en ? 'Favorites' : '收藏'} icon={<Star size={14} />}>
        {bookmarks.failed && <div className="flex items-center gap-1 px-2 text-xs text-red-600 dark:text-red-400" role="alert">
          <span className="min-w-0 flex-1">{en ? 'Could not sync favorites.' : '收藏同步失败。'}</span>
          <button className={iconButton} onClick={bookmarks.retry} title={en ? 'Retry favorites' : '重试收藏'} aria-label={en ? 'Retry favorites' : '重试收藏'}><RefreshCw size={14} /></button>
        </div>}
        {bookmarks.favorites.filter(row => matches(row.name, row.agent_name, row.host_name)).map(row => row.available && row.agent_id
          ? row.kind === 'agent'
            ? agentRow({ agent_id: row.agent_id, display_name: row.name || row.agent_id, adapter: row.adapter })
            : topicRow(row.target_id, row.name || row.target_id, row.agent_id, [row.agent_name, row.host_name].filter(Boolean).join(' · '))
          : <div key={favoriteKey(row.kind, row.target_id)} className="flex min-w-0 items-center px-2">
            <span className="min-w-0 flex-1 truncate text-xs text-zinc-500" title={row.target_id}>{en ? 'Unavailable favorite' : '不可访问的收藏'}</span>
            {favoriteButton(row.kind, row.target_id, '', en ? 'unavailable item' : '不可访问项目')}
          </div>)}
        {!bookmarks.favorites.length && !bookmarks.failed && <p className="px-2 py-2 text-xs text-zinc-500">{bookmarks.disabled ? (en ? 'Loading favorites...' : '正在加载收藏…') : (en ? 'No favorites' : '暂无收藏')}</p>}
      </Section>
      <Section title={en ? 'Recent' : '最近对话'} icon={<Clock3 size={14} />}>
        {(props.recentTopics || []).slice(0, 10).filter(topic => matches(topic.topic_name, topic.name, ...(topic.agent_labels || []).map(agent => agent.display_name))).map(topic => {
          const agentId = topic.primary_agent_id || topic.agent_ids?.[0] || props.selectedAgentId
          const agent = props.agents.find(item => item.agent_id === agentId)
          const host = hosts.find(item => item.agents.some(value => value.agent_id === agentId))
          return topicRow(topic.topic_id, topic.topic_name || topic.name || topic.topic_id, agentId, [agent?.display_name || agentId, host?.display_name].filter(Boolean).join(' · '), topic.unread_count)
        })}
        {!props.recentTopics?.length && <p className="px-2 py-2 text-xs text-zinc-500">{en ? 'No recent conversations' : '暂无最近对话'}</p>}
      </Section>
      <Section title={en ? 'Computers & agents' : '主机与 Agent'} icon={<Laptop size={14} />} action={<button className={iconButton} disabled={isValidating} title={en ? 'Refresh computers' : '刷新主机'} aria-label={en ? 'Refresh computers' : '刷新主机'} onClick={() => { void mutate(); props.onBindingChanged?.() }}><RefreshCw size={14} className={isValidating ? 'animate-spin' : ''} /></button>}>
        {isLoading && <p role="status" className="px-2 text-xs text-zinc-500">{en ? 'Loading computers...' : '正在加载主机…'}</p>}
        {error && !(error instanceof HostRequestError && error.status === 404) && <p role="alert" className="px-2 text-xs text-red-600 dark:text-red-400">{en ? 'Could not load computers. Retry.' : '主机加载失败，请重试。'}</p>}
        {hosts.filter(host => matches(host.display_name, ...host.agents.map(agent => agent.display_name))).map(host => <details key={host.host_id} open className="mb-1">
          <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-md px-2 text-xs font-medium hover:bg-zinc-200/60 dark:hover:bg-zinc-800"><ChevronDown size={13} className="shrink-0" /><span className="min-w-0 flex-1 truncate" title={host.display_name}>{host.display_name}</span><span className="text-[10px] text-zinc-500">{host.status === 'online' ? (en ? 'Online' : '在线') : host.status === 'revoked' ? (en ? 'Revoked' : '已撤销') : (en ? 'Offline' : '离线')}</span></summary>
          <div className="ml-3 border-l border-zinc-200 pl-1 dark:border-zinc-700">{host.agents.filter(agent => matches(host.display_name, agent.display_name, agent.agent_id)).map(agentRow)}</div>
        </details>)}
        {unassigned.filter(agent => matches(agent.display_name, agent.agent_id)).map(agentRow)}
        {data?.at(-1)?.nextOffset != null && <button disabled={isValidating} className="px-2 py-2 text-xs text-emerald-700 dark:text-emerald-400" onClick={() => void setSize(size + 1)}>{en ? 'Load more computers' : '加载更多主机'}</button>}
      </Section>
      <Section title={en ? 'Conversations' : '对话'} icon={<MessageSquare size={14} />}>
        {props.topics.filter(topic => matches(topic.name)).map(topic => topicRow(topic.topic_id, topic.name, props.selectedAgentId, undefined, topic.unread_count))}
      </Section>
      <Section title={en ? 'Groups & teams' : '群聊与团队'} icon={<Users size={14} />}>
        {(props.groupTopics || []).filter(topic => matches(topic.name)).map(topic => {
          const members = topic.member_agent_ids || []
          const agentId = members.includes(props.selectedAgentId) ? props.selectedAgentId
            : props.agents.find(agent => members.includes(agent.agent_id))?.agent_id || props.selectedAgentId
          return topicRow(topic.topic_id, topic.name, agentId, undefined, topic.unread_count)
        })}
        <button disabled={creationBusy || !props.userToken || !props.agents.length || !props.onSubmitAgentOperation} className={`${rowClass} w-full text-zinc-500 disabled:opacity-40`} onClick={() => void openCreation('group')}><Plus size={14} />{en ? 'New group' : '新建群聊'}</button>
        <button disabled={creationBusy || !props.userToken || !props.onNewAgentFromHost || !props.onSubmitAgentOperation} className={`${rowClass} w-full text-zinc-500 disabled:opacity-40`} onClick={() => void openCreation('team')}><Users size={14} />{en ? 'New team' : '新建团队'}</button>
        {creationError && <p role="alert" className="px-2 py-1 text-xs text-red-600 dark:text-red-400">{creationError}</p>}
      </Section>
      {props.onOpenKnowledgeRoot && <Section title={en ? 'Library' : '资料'} icon={<BookOpen size={14} />}>
        <button className={`${rowClass} w-full text-zinc-600 dark:text-zinc-300`} onClick={() => { props.onOpenKnowledgeRoot?.(); closeDrawer() }}><BookOpen size={14} />{en ? 'Knowledge base' : '个人知识库'}</button>
      </Section>}
    </nav>
    <footer className="flex h-12 shrink-0 items-center gap-1 border-t border-zinc-200 px-2 dark:border-zinc-800">
      <button className={`${iconButton} shrink-0`} title={en ? 'Account settings' : '账户设置'} aria-label={en ? 'Account settings' : '账户设置'} onClick={() => { setSettingsPage('profile'); setSettingsOpen(true); closeDrawer() }}><Settings2 size={17} /></button>
      <span className="min-w-0 flex-1 truncate text-xs text-zinc-500" title={props.currentUserName}>{props.currentUserName || 'WTT'}</span>
      <Link href={`/feed?agentId=${encodeURIComponent(props.selectedAgentId)}`} className={iconButton} title={en ? 'All WTT tools' : '全部 WTT 工具'} aria-label={en ? 'All WTT tools' : '全部 WTT 工具'}><ExternalLink size={16} /></Link>
      <button onClick={props.onLogout} className={iconButton} title={en ? 'Sign out' : '退出账号'} aria-label={en ? 'Sign out' : '退出账号'}><LogOut size={16} /></button>
      {canImport && <button onClick={() => { setImportOpen(true); closeDrawer() }} className={iconButton} disabled={!props.userToken} title={en ? 'Import conversation' : '导入会话'} aria-label={en ? 'Import conversation' : '导入会话'}><FileUp size={16} /></button>}
    </footer>
  </>

  return <div className="flex h-dvh min-w-0 overflow-hidden bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100" data-testid="desktop-workspace">
    {!collapsed && <aside id="desktop-navigation" style={{ width: sidebarWidth }} className="relative hidden max-w-[40vw] shrink-0 flex-col border-r border-zinc-200 bg-zinc-50 md:flex dark:border-zinc-800 dark:bg-zinc-900">
      {navigation()}
      <div role="separator" tabIndex={0} aria-label={en ? 'Resize navigation' : '调整导航宽度'} aria-orientation="vertical" aria-controls="desktop-navigation" aria-valuemin={240} aria-valuemax={400} aria-valuenow={sidebarWidth}
        className="absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize touch-none hover:bg-emerald-500/20 focus-visible:bg-emerald-500/20 focus-visible:outline-none"
        onDoubleClick={() => setSidebarWidth(288)}
        onPointerDown={event => { if (event.button !== 0) return; resizeStart.current = { x: event.clientX, width: sidebarWidth }; event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault() }}
        onPointerMove={event => { const start = resizeStart.current; if (start) setSidebarWidth(Math.max(240, Math.min(400, start.width + event.clientX - start.x))) }}
        onPointerUp={event => { resizeStart.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }}
        onLostPointerCapture={() => { resizeStart.current = null }}
        onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
          event.preventDefault()
          setSidebarWidth(width => event.key === 'Home' ? 240 : event.key === 'End' ? 400 : Math.max(240, Math.min(400, width + (event.key === 'ArrowRight' ? 16 : -16))))
        }} />
    </aside>}
    <dialog ref={drawer} aria-label={en ? 'Workspace navigation' : '工作区导航'} className="fixed inset-y-0 left-0 m-0 h-dvh max-h-none w-[min(320px,90vw)] max-w-none border-r border-zinc-200 bg-zinc-50 p-0 text-zinc-900 backdrop:bg-black/30 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"><div className="flex h-full flex-col">{navigation(true)}</div></dialog>
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-zinc-200 px-3 dark:border-zinc-800">
        <button className={`${iconButton} ${collapsed ? '' : 'md:hidden'}`} onClick={() => { if (window.innerWidth < 768) drawer.current?.showModal(); else setCollapsed(false) }} aria-label={en ? 'Open navigation' : '展开导航'} title={en ? 'Open navigation' : '展开导航'}><PanelLeft size={17} /></button>
        <span className="truncate text-xs text-zinc-500">{selectedHost?.display_name || 'WTT'}</span><ChevronRight size={13} className="shrink-0 text-zinc-400" /><span className="min-w-0 flex-1 truncate text-sm font-medium">{selected?.display_name || (en ? 'Conversations' : '对话')}</span>
        <Link href="/desktop/setup" className={iconButton} title={en ? 'Computer settings' : '主机设置'} aria-label={en ? 'Computer settings' : '主机设置'}><Laptop size={17} /></Link>
      </header>
      <DesktopOnboarding accessToken={props.userToken} userId={props.currentUserId} onChanged={() => { void mutate(); props.onBindingChanged?.() }} onAgentReady={id => props.onAgentChange(id)} />
      <main className="min-h-0 min-w-0 flex-1 overflow-hidden">{props.children}</main>
    </div>
    <WttSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} activePage={settingsPage} onPageChange={setSettingsPage} agents={props.agents.map(agent => ({ ...agent, id: agent.agent_id, is_primary: false }))} selectedAgentId={props.selectedAgentId} onBindingChanged={props.onBindingChanged} />
    {importOpen && props.userToken && <HistoryImport token={props.userToken} hosts={hosts} en={en} onClose={() => setImportOpen(false)} />}
    {creationRequest && <TopicCreationDialogs creationOnly creationRequest={creationRequest}
      topics={props.topics} groupTopics={props.groupTopics} selectedTopicId={props.selectedTopicId}
      onSelectTopic={props.onTopicChange} agentOptions={props.agents} selectedAgentId={props.selectedAgentId}
      onSelectAgent={props.onAgentChange} onlineAgentIds={props.onlineAgentIds}
      agentRuntimeMap={props.agentRuntimeMap} agentRoleMap={props.agentRoleMap} agentRoleTemplateMap={props.agentRoleTemplateMap}
      onNewAgentFromHost={props.onNewAgentFromHost} onSubmitAgentOperation={props.onSubmitAgentOperation}
      excludedCloneAgentIds={excludedCloneAgentIds} managedTeamHost={localTeamHost ? { ...localTeamHost, create: createManagedTeam } : undefined}
      onBindingChanged={props.onBindingChanged} onTopicsRefresh={props.onTopicsRefresh} onTopicCreated={props.onTopicCreated}
      userToken={props.userToken} />}
  </div>
}

export function DesktopWorkspaceEmpty({ hasAgents, onNewConversation }: { hasAgents: boolean; onNewConversation?: () => void }) {
  const { locale } = useI18n()
  const en = locale === 'en'
  return <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
    <MessageSquare size={32} strokeWidth={1.25} className="text-zinc-300 dark:text-zinc-600" />
    <h1 className="text-lg font-medium text-zinc-700 dark:text-zinc-200">{hasAgents ? (en ? 'Choose a conversation' : '选择对话') : (en ? 'Connect this computer' : '接入本机')}</h1>
    {hasAgents ? <button onClick={onNewConversation} className="inline-flex items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700"><MessageSquarePlus size={16} />{en ? 'New conversation' : '新建对话'}</button> : <Link href="/desktop/setup" className="inline-flex items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700"><Laptop size={16} />{en ? 'Computer settings' : '主机设置'}</Link>}
  </div>
}
