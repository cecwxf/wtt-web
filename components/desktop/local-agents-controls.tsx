'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ExternalLink, FolderOpen, Loader2, Play, Plus, RefreshCw, RotateCcw, Square, X } from 'lucide-react'
import { getDesktopBridge, type DesktopAgentProfile, type DesktopRuntimeState, type DesktopRemoteTools } from '@/lib/desktop'
import { RemoteToolsSelection } from './remote-tools-selection'
import { useI18n } from '@/lib/i18n-provider'

const authenticationHelp: Record<string, string> = {
  codex: 'https://developers.openai.com/codex/auth',
  'claude-code': 'https://code.claude.com/docs/en/authentication',
  pi: 'https://pi.dev/docs/latest/providers',
  dsh: 'https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/providers.md',
  gemini: 'https://geminicli.com/docs/get-started/authentication/',
}

const readinessText = {
  unverified: ['待执行验证', 'Execution not yet verified'],
  verified: ['最近执行成功', 'Last execution succeeded'],
  authentication_required: ['需要 CLI 登录', 'CLI sign-in required'],
  configuration_required: ['需要配置 CLI 凭据', 'CLI credentials required'],
  execution_failed: ['最近执行失败', 'Last execution failed'],
} as const

function selectionKey(profile: DesktopAgentProfile, byProfile: boolean) {
  return byProfile ? profile.profile_id : profile.adapter
}

export function LocalAgentsControls({ onChanged }: { onChanged: () => void }) {
  const bridge = getDesktopBridge()?.host
  const { locale } = useI18n()
  const en = locale === 'en'
  const [profiles, setProfiles] = useState<DesktopAgentProfile[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [access, setAccess] = useState<'workspace-write' | 'full-access'>('workspace-write')
  const [remoteTools, setRemoteTools] = useState<DesktopRemoteTools>({ files: 'off', terminal: false })
  const [runtime, setRuntime] = useState<DesktopRuntimeState>({ state: 'loading', agents: [] })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const active = useRef(false)
  const automaticallyDetected = useRef(false)
  const savedAccess = useRef<DesktopRuntimeState['workspaceAccess']>()
  const running = ['restoring', 'starting', 'running', 'stopping'].includes(runtime.state)
  const needsReset = ['error', 'authorization_required'].includes(runtime.state)
  const supported = Boolean(bridge?.runtimeStatus && bridge?.discoverAgents && bridge?.startAgents && bridge?.stopAgents)
  const byProfile = bridge?.profileManagementSupported === true
  const waitingForAuthorization = runtime.discoveryReady === false && !running && !busy

  useEffect(() => {
    if (!supported || !bridge) return
    active.current = true
    let current = true
    let pushed = false
    const receive = (state: DesktopRuntimeState) => {
      if (!current) return
      setRuntime(state)
      if (state.workspaceAccess && savedAccess.current !== state.workspaceAccess) {
        savedAccess.current = state.workspaceAccess
        setAccess(state.workspaceAccess)
      }
    }
    const unsubscribe = bridge.onRuntimeState?.(state => { pushed = true; receive(state) })
    void bridge.runtimeStatus!().then(state => { if (!pushed) receive(state) }).catch(() => { if (current && !pushed) setRuntime({ state: 'error', agents: [] }) })
    return () => { current = false; active.current = false; unsubscribe?.() }
  }, [bridge, supported])

  const operate = useCallback(async (action: 'discover' | 'start' | 'stop' | 'recover') => {
    if (!bridge || busy || (action === 'discover' && runtime.discoveryReady === false)) return
    setBusy(true); setError('')
    try {
      if (action === 'stop') {
        const state = await bridge.stopAgents!()
        if (!active.current) return
        setRuntime(state)
        setProfiles([]); setSelected([])
        automaticallyDetected.current = false
      } else if (action === 'recover') {
        if (!bridge.recoverAgents) return
        const state = await bridge.recoverAgents()
        if (!active.current) return
        setRuntime(state)
      } else if (action === 'discover') {
        const found = await bridge.discoverAgents!()
        if (!active.current) return
        setProfiles(found)
        const configured = found.some(profile => profile.configured)
        setSelected(found.filter(profile => profile.available && (!profile.requiresFullAccess || access === 'full-access')
          && (configured ? profile.configured : profile.profile_id === `desktop-${profile.adapter}`)).map(profile => selectionKey(profile, byProfile)))
      } else {
        const state = await bridge.startAgents!({ ...(byProfile ? { profileIds: selected } : { adapters: selected }), workspaceAccess: access,
          ...(bridge.remoteToolsSupported ? { remoteTools } : {}) })
        if (!active.current) return
        setRuntime(state)
      }
      onChanged()
    } catch (value) {
      if (!active.current) return
      const message = value instanceof Error ? value.message : ''
      setError(/cancelled/i.test(message)
        ? (en ? 'Operation cancelled.' : '操作已取消。')
        : /Packaged Agent runtime/.test(message)
          ? (en ? 'Install a desktop build containing the Agent runtime.' : '请安装包含 Agent 运行环境的桌面版本。')
          : (en ? 'Local Agent operation failed. Check the desktop connection and retry.' : '本机 Agent 操作失败，请检查桌面连接后重试。'))
    } finally { if (active.current) setBusy(false) }
  }, [bridge, busy, en, access, selected, remoteTools, onChanged, byProfile, runtime.discoveryReady])

  useEffect(() => {
    if (!supported || busy || runtime.state !== 'stopped' || runtime.discoveryReady === false || profiles.length || automaticallyDetected.current) return
    automaticallyDetected.current = true
    void operate('discover')
  }, [supported, busy, runtime.state, runtime.discoveryReady, profiles.length, operate])

  async function chooseWorkspace(profile: DesktopAgentProfile, reset = false) {
    if (!bridge?.selectAgentWorkspace || busy || running) return
    setBusy(true); setError('')
    try {
      const result = await bridge.selectAgentWorkspace(selectionKey(profile, byProfile), reset)
      if (active.current && result) setProfiles(previous => previous.map(value => (result.profileId
        ? value.profile_id === result.profileId : value.adapter === result.adapter) ? { ...value, workspaceName: result.workspaceName } : value))
    } catch {
      if (active.current) setError(en ? 'Could not select the workspace. Retry.' : '工作目录选择未完成，请重试。')
    } finally { if (active.current) setBusy(false) }
  }

  async function addProfile(profile: DesktopAgentProfile) {
    if (!byProfile || !bridge?.addAgentProfile || busy || running) return
    setBusy(true); setError('')
    try {
      const added = await bridge.addAgentProfile(profile.profile_id)
      if (!active.current) return
      setProfiles(previous => [...previous, added])
      if (!added.requiresFullAccess || access === 'full-access') setSelected(previous => [...previous, added.profile_id])
      onChanged()
    } catch (value) {
      if (active.current) setError(/profile limit/.test(value instanceof Error ? value.message : '')
        ? (en ? 'Local Agent limit reached (20).' : '本机 Agent 数量已达上限（20）。')
        : (en ? 'Could not add the Agent. Detect installed Agents and retry.' : '添加 Agent 失败，请重新检测已安装 Agent 后重试。'))
    } finally { if (active.current) setBusy(false) }
  }

  if (!supported) return null
  return <div role="group" aria-label={en ? 'Local Agents' : '本机 Agent'} className="space-y-3 border-t border-[var(--border)] pt-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="text-sm font-medium">{en ? 'Local Agents' : '本机 Agent'}</h4>
      <div className="flex items-center gap-2">
        <button type="button" disabled={busy || running || runtime.state === 'loading' || runtime.discoveryReady === false} onClick={() => void operate('discover')} title={en ? 'Detect installed Agents' : '检测已安装 Agent'} aria-label={en ? 'Detect installed Agents' : '检测已安装 Agent'} className="rounded border border-[var(--border)] p-2 disabled:opacity-50"><RefreshCw size={16} /></button>
        {running || needsReset
          ? <button type="button" disabled={busy || runtime.state === 'stopping'} onClick={() => void operate('stop')} title={needsReset ? (en ? 'Reset local Agent service' : '重置本机 Agent 服务') : (en ? 'Stop local Agents' : '停止本机 Agent')} aria-label={needsReset ? (en ? 'Reset local Agent service' : '重置本机 Agent 服务') : (en ? 'Stop local Agents' : '停止本机 Agent')} className="rounded border border-[var(--border)] p-2 disabled:opacity-50">{needsReset ? <RotateCcw size={16} /> : <Square size={16} />}</button>
          : <button type="button" disabled={busy || !selected.length} onClick={() => void operate('start')} title={en ? 'Start local Agents' : '启动本机 Agent'} aria-label={en ? 'Start local Agents' : '启动本机 Agent'} className="rounded border border-[var(--border)] p-2 disabled:opacity-50"><Play size={16} /></button>}
      </div>
    </div>
    <label className="flex flex-wrap items-center gap-2 text-sm">{en ? 'Execution access' : '执行权限'}
      <select aria-label={en ? 'Execution access' : '执行权限'} value={access} disabled={busy || running} onChange={event => {
        const value = event.target.value as typeof access
        setAccess(value)
        if (value !== 'full-access') setSelected(previous => previous.filter(id => !profiles.find(profile => selectionKey(profile, byProfile) === id)?.requiresFullAccess))
      }} className="min-w-0 max-w-full rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm">
        <option value="workspace-write">{en ? 'CLI workspace editing' : 'CLI 工作区编辑'}</option>
        <option value="full-access">{en ? 'Full local execution' : '完整本机执行权限'}</option>
      </select>
    </label>
    {bridge?.remoteToolsSupported && <RemoteToolsSelection value={remoteTools} onChange={setRemoteTools} disabled={busy || running} en={en} previewSupported={bridge.previewSupported === true} />}
    {runtime.autoStart !== undefined && <p className="text-xs text-[var(--muted-foreground)]">{runtime.autoStart
      ? (en ? 'Automatic resume enabled' : '已启用自动恢复')
      : (en ? 'Automatic resume disabled' : '已关闭自动恢复')}</p>}
    {runtime.state === 'restoring' && <p role="status" className="flex items-center gap-2 text-sm"><Loader2 size={15} className="animate-spin" />{en ? 'Restoring approved Agents...' : '正在恢复已授权 Agent…'}</p>}
    {waitingForAuthorization && <p role="status" className="flex items-center gap-2 text-sm"><Loader2 size={15} className="animate-spin" />{en ? 'Restoring computer authorization...' : '正在恢复主机授权…'}</p>}
    {busy && <p role="status" className="flex items-center gap-2 text-sm"><Loader2 size={15} className="animate-spin" />{en ? 'Processing...' : '处理中…'}</p>}
    {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    {runtime.error && <p role="status" className="text-sm text-red-600 dark:text-red-400">{runtime.error === 'runtime_recovery_required'
      ? runtime.recovery?.state === 'previous_boot'
        ? (en ? 'The previous runtime was interrupted before the computer restarted. Recovery preserves history and never reruns unfinished tasks.' : '系统重启前的运行环境未正常退出。恢复会保留历史，不会重跑未完成任务。')
        : runtime.recovery?.state === 'restart_computer_required'
          ? (en ? 'The previous owner belongs to this OS boot. Quit its WTT instance or restart the computer before recovery.' : '旧运行进程属于本次开机。请退出其 WTT 程序，或重启电脑后恢复。')
          : (en ? 'The legacy runtime owner cannot be verified. Its lock is preserved; resolve outstanding processes before recovery.' : '无法确认旧运行环境的归属，已保留锁。请先核对尚未退出的进程。')
      : runtime.error === 'runtime_selection_changed'
      ? (en ? 'Installed Agents or permissions changed. Detect and authorize them again.' : '已安装 Agent 或权限发生变化，请重新检测并授权。')
      : runtime.error === 'runtime_settings_unavailable'
      ? (en ? 'Saved execution settings are unavailable. Check local application storage before restarting.' : '无法读取或保存执行设置，请先检查本机应用数据目录。')
      : runtime.error === 'runtime_auto_resume_failed'
      ? (en ? 'Agent startup failed. Detect and start Agents again.' : 'Agent 启动失败，请重新检测并启动。')
      : (en ? 'Runtime connection interrupted or authorization unavailable.' : '运行连接已中断或主机授权不可用。')}</p>}
    {runtime.error === 'runtime_recovery_required' && runtime.recovery?.canRecover && bridge?.recoverAgents && <button
      type="button" disabled={busy || running} onClick={() => void operate('recover')}
      className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[var(--border)] px-3 text-sm disabled:opacity-50">
      <RotateCcw size={15} />{en ? 'Recover local Agents' : '恢复本机 Agent'}
    </button>}
    <ul className="space-y-2">{profiles.map(profile => <li key={profile.profile_id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <label className="flex min-w-0 items-center gap-2"><input type="checkbox" checked={selected.includes(selectionKey(profile, byProfile))} disabled={busy || running || !profile.available || (profile.requiresFullAccess && access !== 'full-access')} onChange={event => setSelected(previous => event.target.checked ? [...previous, selectionKey(profile, byProfile)] : previous.filter(value => value !== selectionKey(profile, byProfile)))} /><span className="break-words">{profile.display_name}</span></label>
      <span className="break-all text-xs text-[var(--muted-foreground)]">{!profile.available ? (en ? 'Not installed' : '未安装') : profile.requiresFullAccess && access !== 'full-access' ? (en ? 'Full access required' : '需要完整执行权限') : profile.version}</span>
      {profile.available && <div className="flex min-w-0 items-center gap-1">{bridge?.selectAgentWorkspace && <><button disabled={busy || running} type="button" onClick={() => void chooseWorkspace(profile)} aria-label={`${en ? 'Workspace for' : '工作目录'} ${profile.display_name}`} title={profile.workspaceName || (en ? 'Isolated WTT workspace' : '独立 WTT 工作区')} className="inline-flex min-h-9 max-w-48 items-center gap-1 rounded-md px-2 text-xs text-[var(--muted-foreground)] hover:bg-[var(--muted)] disabled:opacity-50"><FolderOpen size={15} className="shrink-0" /><span className="truncate">{profile.workspaceName || (en ? 'Workspace' : '工作目录')}</span></button>{profile.workspaceName && <button disabled={busy || running} type="button" onClick={() => void chooseWorkspace(profile, true)} aria-label={`${en ? 'Reset workspace for' : '恢复默认工作目录'} ${profile.display_name}`} title={en ? 'Use isolated WTT workspace' : '使用独立 WTT 工作区'} className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-[var(--muted)] disabled:opacity-50"><X size={15} /></button>}</>}{byProfile && bridge?.addAgentProfile && <button disabled={busy || running || profiles.length >= 20} type="button" onClick={() => void addProfile(profile)} title={en ? `Add another ${profile.adapter} Agent` : `新增 ${profile.adapter} Agent`} aria-label={en ? `Add another ${profile.adapter} Agent` : `新增 ${profile.adapter} Agent`} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md hover:bg-[var(--muted)] disabled:opacity-50"><Plus size={15} /></button>}</div>}
    </li>)}</ul>
    <ul className="space-y-2">{runtime.agents.map(agent => {
      const readiness = agent.readiness && Object.hasOwn(readinessText, agent.readiness) ? agent.readiness : 'unverified'
      const needsHelp = readiness === 'authentication_required' || readiness === 'configuration_required'
      const helpUrl = Object.hasOwn(authenticationHelp, agent.adapter) ? authenticationHelp[agent.adapter] : undefined
      const helpLabel = en ? `${agent.adapter} sign-in and configuration help` : `${agent.adapter} 登录与配置帮助`
      return <li key={agent.agentId} className="flex flex-wrap items-start justify-between gap-2 text-xs">
        <span className="min-w-0 break-words">{agent.displayName || profiles.find(profile => profile.profile_id === agent.profileId)?.display_name || agent.adapter}</span>
        <div className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2">
          <span>{agent.state === 'online' ? (en ? 'Online' : '在线') : agent.state === 'connecting' ? (en ? 'Connecting' : '连接中') : (en ? 'Offline' : '离线')}</span>
          <span className={needsHelp || readiness === 'execution_failed' ? 'text-red-600 dark:text-red-400' : 'text-[var(--muted-foreground)]'}>{readinessText[readiness][en ? 1 : 0]}</span>
          {needsHelp && helpUrl && <a href={helpUrl} target="_blank" rel="noopener noreferrer" title={helpLabel} aria-label={helpLabel} className="shrink-0 rounded p-1 hover:bg-[var(--muted)]"><ExternalLink size={14} /></a>}
        </div>
      </li>
    })}</ul>
  </div>
}
