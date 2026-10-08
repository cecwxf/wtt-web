'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import useSWRInfinite from 'swr/infinite'
import { ChevronDown, ChevronRight, Clock3, ExternalLink, Laptop, LogOut, MessageSquare, MessageSquarePlus, PanelLeft, Plus, RefreshCw, Search, Settings2, Users, X } from 'lucide-react'
import type { WttShellV2Props } from '@/components/ui/wtt-shell-v2'
import { WttSettingsModal } from '@/components/ui/wtt-settings-modal'
import { CreateTopicModal } from '@/components/ui/create-topic-modal'
import { DesktopHostsApi, HostRequestError } from '@/lib/desktop-hosts'
import { getDesktopBridge } from '@/lib/desktop'
import { useI18n } from '@/lib/i18n-provider'
import { DesktopOnboarding } from './desktop-onboarding'

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
  const [query, setQuery] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsPage, setSettingsPage] = useState<NonNullable<WttShellV2Props['forceOpenSettingsPage']>>('profile')
  const [createOpen, setCreateOpen] = useState(false)
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

  const agentRow = (agent: { agent_id: string; display_name: string; adapter?: string }) => <Link
    key={agent.agent_id} href={desktopHref(agent.agent_id)} onClick={() => { props.onTopicChange(null); closeDrawer() }}
    aria-current={agent.agent_id === props.selectedAgentId ? 'page' : undefined} title={`${agent.display_name} · ${agent.agent_id}`}
    className={`${rowClass} ${agent.agent_id === props.selectedAgentId ? 'bg-white font-medium text-zinc-950 dark:bg-zinc-800 dark:text-white' : 'text-zinc-600 dark:text-zinc-300'}`}>
    <span aria-label={props.onlineAgentIds?.has(agent.agent_id) ? (en ? 'Online' : '在线') : (en ? 'Offline' : '离线')} className={`h-1.5 w-1.5 shrink-0 rounded-full ${props.onlineAgentIds?.has(agent.agent_id) ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
    <span className="min-w-0 flex-1 truncate">{agent.display_name || agent.agent_id}</span>
    {agent.adapter && <span className="max-w-20 truncate text-[10px] text-zinc-500">{agent.adapter}</span>}
  </Link>

  const topicRow = (id: string, name: string, agentId: string, secondary?: string, unread?: number) => <Link
    key={id} href={desktopHref(agentId, id)} onClick={closeDrawer} title={name}
    aria-current={id === props.selectedTopicId ? 'page' : undefined}
    className={`${rowClass} ${id === props.selectedTopicId ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100' : 'text-zinc-700 dark:text-zinc-300'}`}>
    <MessageSquare size={14} className="shrink-0 text-zinc-400" />
    <span className="min-w-0 flex-1"><span className="block truncate">{name}</span>{secondary && <span className="block truncate text-[11px] text-zinc-500 dark:text-zinc-400">{secondary}</span>}</span>
    {!!unread && <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{unread > 99 ? '99+' : unread}</span>}
  </Link>

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
        {(props.groupTopics || []).filter(topic => matches(topic.name)).map(topic => topicRow(topic.topic_id, topic.name, props.selectedAgentId, undefined, topic.unread_count))}
        <button disabled={!props.selectedAgentId} className={`${rowClass} w-full text-zinc-500 disabled:opacity-40`} onClick={() => { setCreateOpen(true); closeDrawer() }}><Plus size={14} />{en ? 'New group' : '新建群聊'}</button>
      </Section>
    </nav>
    <footer className="flex h-12 shrink-0 items-center gap-1 border-t border-zinc-200 px-2 dark:border-zinc-800">
      <button className={`${iconButton} shrink-0`} title={en ? 'Account settings' : '账户设置'} aria-label={en ? 'Account settings' : '账户设置'} onClick={() => { setSettingsPage('profile'); setSettingsOpen(true); closeDrawer() }}><Settings2 size={17} /></button>
      <span className="min-w-0 flex-1 truncate text-xs text-zinc-500" title={props.currentUserName}>{props.currentUserName || 'WTT'}</span>
      <Link href={`/feed?agentId=${encodeURIComponent(props.selectedAgentId)}`} className={iconButton} title={en ? 'All WTT tools' : '全部 WTT 工具'} aria-label={en ? 'All WTT tools' : '全部 WTT 工具'}><ExternalLink size={16} /></Link>
      <button onClick={props.onLogout} className={iconButton} title={en ? 'Sign out' : '退出账号'} aria-label={en ? 'Sign out' : '退出账号'}><LogOut size={16} /></button>
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
    <CreateTopicModal open={createOpen} onClose={() => setCreateOpen(false)} creatorAgentId={props.selectedAgentId} agentOptions={props.agents} userToken={props.userToken} onSuccess={() => props.onTopicsRefresh?.()} />
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
