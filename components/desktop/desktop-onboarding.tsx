'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Check, ChevronRight, FolderOpen, Laptop, Loader2, RefreshCw, X } from 'lucide-react'
import { getDesktopBridge, type DesktopAgentProfile, type DesktopHostState, type DesktopRuntimeState, type DesktopRemoteTools } from '@/lib/desktop'
import { RemoteToolsSelection } from './remote-tools-selection'
import { DesktopHostsApi, HostRequestError } from '@/lib/desktop-hosts'
import { useI18n } from '@/lib/i18n-provider'

type Phase = 'intro' | 'authorizing' | 'detecting' | 'selection' | 'starting' | 'ready'
const button = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-zinc-200 px-4 py-2 text-sm disabled:opacity-40 dark:border-zinc-700'

export function DesktopOnboarding({ accessToken, userId, onChanged, onAgentReady }: {
  accessToken?: string; userId?: string; onChanged?: () => void; onAgentReady?: (agentId: string) => void
}) {
  const { locale } = useI18n()
  const en = locale === 'en'
  const router = useRouter()
  const bridge = getDesktopBridge()?.host
  const api = useMemo(() => new DesktopHostsApi(accessToken || ''), [accessToken])
  const dialog = useRef<HTMLDialogElement>(null)
  const mounted = useRef(false)
  const operation = useRef(false)
  const prompted = useRef(false)
  const [native, setNative] = useState<DesktopHostState | null>(null)
  const [runtime, setRuntime] = useState<DesktopRuntimeState | null>(null)
  const [available, setAvailable] = useState<boolean | null>(null)
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<Phase>('intro')
  const [profiles, setProfiles] = useState<DesktopAgentProfile[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [access, setAccess] = useState<'workspace-write' | 'full-access'>('workspace-write')
  const [remoteTools, setRemoteTools] = useState<DesktopRemoteTools>({ files: 'off', terminal: false })
  const [error, setError] = useState('')
  const [choosingWorkspace, setChoosingWorkspace] = useState(false)
  const busy = choosingWorkspace || ['authorizing', 'detecting', 'starting'].includes(phase)
  const connected = runtime?.state === 'running' && Boolean(runtime.agents.length)
  const configured = Boolean(runtime?.configuredAdapters?.length)
  const supported = Boolean(bridge?.resume && bridge.discoverAgents && bridge.startAgents && bridge.runtimeStatus)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const describeError = useCallback((value: unknown) => {
    if (value instanceof HostRequestError) {
      if (value.status === 404) return en ? 'Computer access is not yet available for this account.' : '此账号暂未开通主机接入。'
      if ([401, 403].includes(value.status)) return en ? 'Sign in again to connect this computer.' : '请重新登录后接入本机。'
      if (value.status === 409) return en ? 'This installation needs authorization recovery.' : '本机安装身份需要恢复授权。'
    }
    const message = value instanceof Error ? value.message.toLowerCase() : ''
    if (/cancelled|canceled/.test(message)) return en ? 'Setup cancelled.' : '已取消设置。'
    if (/keyring|credential storage|credentials could not/.test(message)) return en ? 'Allow WTT to access the system keyring, then retry.' : '请允许 WTT 访问系统密钥存储后重试。'
    if (/packaged agent runtime/.test(message)) return en ? 'The installed desktop package is missing its Agent runtime.' : '当前桌面安装包缺少 Agent 运行环境。'
    return en ? 'Could not connect this computer. Retry.' : '本机接入未完成，请重试。'
  }, [en])

  useEffect(() => {
    if (!supported || !bridge || !accessToken) return
    let active = true
    let hostPushed = false
    let runtimePushed = false
    const offHost = bridge.onState?.(state => { hostPushed = true; if (active) setNative(state) })
    const offRuntime = bridge.onRuntimeState?.(state => { runtimePushed = true; if (active) setRuntime(state) })
    void bridge.status().then(state => { if (active && !hostPushed) setNative(state) }).catch(() => {})
    void bridge.runtimeStatus!().then(state => { if (active && !runtimePushed) setRuntime(state) }).catch(() => {})
    void api.list().then(() => { if (active) setAvailable(true) }).catch(value => {
      if (!active) return
      setAvailable(value instanceof HostRequestError && value.status === 404 ? false : null)
    })
    return () => { active = false; offHost?.(); offRuntime?.() }
  }, [bridge, supported, api, accessToken])

  useEffect(() => {
    if (prompted.current || !supported || !native?.enabled || !native.accountVerified || !runtime
      || available !== true || configured || connected || runtime.state === 'restoring'
      || (userId && native.userId !== userId)) return
    prompted.current = true
    setOpen(true)
  }, [supported, native, runtime, available, configured, connected, userId])

  useEffect(() => {
    const modal = dialog.current
    if (!modal) return
    if (open && !modal.open) modal.showModal()
    if (!open && modal.open) modal.close()
  }, [open])

  async function detect() {
    if (!bridge?.discoverAgents || operation.current) return
    operation.current = true
    setError('')
    const current = () => mounted.current
    try {
      setPhase('authorizing')
      await api.list()
      if (!current()) return
      setAvailable(true)
      let state = await bridge.resume!(accessToken!)
      if (!current()) return
      if (state.state !== 'registered') state = await api.authorize(bridge, current)
      if (!current()) return
      setNative(state)
      setPhase('detecting')
      const found = await bridge.discoverAgents()
      if (!current()) return
      setProfiles(found)
      setSelected(found.filter(profile => profile.available && !profile.requiresFullAccess).map(profile => profile.adapter))
      setAccess('workspace-write')
      setPhase('selection')
      onChanged?.()
    } catch (value) {
      if (current()) { setError(describeError(value)); setPhase('intro') }
    } finally { operation.current = false }
  }

  async function start() {
    if (!bridge?.startAgents || !selected.length || operation.current) return
    operation.current = true
    setError(''); setPhase('starting')
    const current = () => mounted.current
    try {
      const state = await bridge.startAgents({ adapters: selected, workspaceAccess: access,
        ...(bridge.remoteToolsSupported ? { remoteTools } : {}) })
      if (!current()) return
      setRuntime(state)
      setPhase('ready')
      onChanged?.()
    } catch (value) {
      if (current()) { setError(describeError(value)); setPhase('selection') }
    } finally { operation.current = false }
  }

  async function chooseWorkspace(adapter: string, reset = false) {
    if (!bridge?.selectAgentWorkspace || operation.current) return
    operation.current = true; setChoosingWorkspace(true); setError('')
    try {
      const chosen = await bridge.selectAgentWorkspace(adapter, reset)
      if (mounted.current && chosen) setProfiles(previous => previous.map(profile => profile.adapter === chosen.adapter ? { ...profile, workspaceName: chosen.workspaceName } : profile))
    } catch (value) { if (mounted.current) setError(describeError(value)) }
    finally { operation.current = false; if (mounted.current) setChoosingWorkspace(false) }
  }

  const enter = (agentId: string) => {
    setOpen(false)
    onChanged?.()
    onAgentReady?.(agentId)
    router.push(`/desktop?agentId=${encodeURIComponent(agentId)}`)
  }

  if (!supported || !accessToken || !native?.enabled) return null
  return <>
    {!connected && !configured && <div className="flex min-h-11 shrink-0 items-center gap-3 border-b border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
      <Laptop size={16} className="shrink-0" /><span className="min-w-0 flex-1">{en ? 'Local Agents' : '本机 Agent'}</span>
      <button onClick={() => setOpen(true)} className="inline-flex min-h-8 items-center gap-1 font-medium">{en ? 'Connect this computer' : '接入本机'}<ChevronRight size={15} /></button>
    </div>}
    <dialog ref={dialog} aria-labelledby="desktop-onboarding-title" onCancel={event => { if (busy) event.preventDefault(); else setOpen(false) }} onClose={() => setOpen(false)} className="m-auto max-h-[90dvh] w-[min(560px,calc(100vw-32px))] overflow-y-auto rounded-lg border border-zinc-200 bg-white p-0 text-zinc-900 shadow-xl backdrop:bg-black/40 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="flex items-center gap-3 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <Laptop size={20} /><h2 id="desktop-onboarding-title" className="min-w-0 flex-1 text-base font-semibold">{en ? 'Connect local Agents' : '接入本机 Agent'}</h2>
        <button disabled={busy} onClick={() => setOpen(false)} aria-label={en ? 'Close setup' : '关闭设置'} title={en ? 'Close setup' : '关闭设置'} className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-zinc-100 disabled:opacity-40 dark:hover:bg-zinc-800"><X size={18} /></button>
      </header>
      <div className="space-y-5 p-5">
        <ol className="grid grid-cols-3 gap-2 text-xs text-zinc-500 dark:text-zinc-400">{[
          en ? 'Computer' : '主机登记', en ? 'Agents' : 'Agent 检测', en ? 'Connect' : '接入完成',
        ].map((label, index) => <li key={label} className={`flex items-center gap-2 ${phase === 'ready' || (index < 2 && ['selection', 'starting'].includes(phase)) ? 'text-emerald-700 dark:text-emerald-400' : ''}`}><span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current">{index + 1}</span><span>{label}</span></li>)}</ol>
        {error && <p role="alert" className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400"><AlertCircle size={16} className="mt-0.5 shrink-0" />{error}</p>}
        {available === false && <p role="status" className="text-sm text-zinc-500">{en ? 'Computer access is not yet available for this account.' : '此账号暂未开通主机接入。'}</p>}
        {phase === 'intro' && <div className="space-y-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">{en ? 'Use the Agents already installed on this computer with your WTT account.' : '将这台电脑上已有的 Agent 接入当前 WTT 账号。'}</p>
          <div className="flex flex-wrap gap-2"><button disabled={!native.accountVerified} onClick={() => void detect()} className={`${button} bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900`}><Laptop size={16} />{en ? 'Connect and detect' : '接入并检测'}</button><button onClick={() => setOpen(false)} className={button}>{en ? 'Later' : '稍后'}</button></div>
        </div>}
        {busy && <p role="status" className="flex items-center gap-2 text-sm"><Loader2 size={17} className="animate-spin" />{choosingWorkspace ? (en ? 'Choose a workspace...' : '请选择工作目录…') : phase === 'authorizing' ? (en ? 'Authorizing this computer...' : '正在登记本机，请确认系统授权…') : phase === 'detecting' ? (en ? 'Detecting installed Agents...' : '正在检测已安装的 Agent…') : (en ? 'Connecting Agents...' : '正在接入 Agent，请确认执行权限…')}</p>}
        {phase === 'selection' && <>
          {bridge?.remoteToolsSupported && <RemoteToolsSelection value={remoteTools} onChange={setRemoteTools} disabled={busy} en={en} />}
          <fieldset disabled={busy} className="space-y-3"><legend className="mb-2 text-sm font-medium">{en ? 'Agents' : 'Agent'}</legend>{profiles.map(profile => <div key={profile.profile_id} className="flex min-h-12 flex-wrap items-center gap-3 border-b border-zinc-100 py-2 dark:border-zinc-800">
            <label className="flex min-w-0 flex-1 basis-40 items-center gap-3">
            <input type="checkbox" disabled={!profile.available || (profile.requiresFullAccess && access !== 'full-access')} checked={selected.includes(profile.adapter)} onChange={event => setSelected(previous => event.target.checked ? [...previous, profile.adapter] : previous.filter(adapter => adapter !== profile.adapter))} className="h-4 w-4 accent-emerald-600" />
            <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{profile.display_name}</span><span className="block break-words text-xs text-zinc-500">{profile.available ? profile.version : (en ? 'Not installed' : '未安装')}</span></span>
            </label>
            {profile.available && bridge?.selectAgentWorkspace && <button type="button" onClick={() => void chooseWorkspace(profile.adapter)} aria-label={`${en ? 'Workspace for' : '工作目录'} ${profile.display_name}`} title={profile.workspaceName || (en ? 'Isolated WTT workspace' : '独立 WTT 工作区')} className="inline-flex max-w-36 items-center gap-1 rounded-md p-2 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"><FolderOpen size={16} className="shrink-0" /><span className="truncate">{profile.workspaceName || (en ? 'Workspace' : '工作目录')}</span></button>}
            {profile.workspaceName && <button type="button" onClick={() => void chooseWorkspace(profile.adapter, true)} aria-label={`${en ? 'Reset workspace for' : '恢复默认工作目录'} ${profile.display_name}`} title={en ? 'Use isolated WTT workspace' : '使用独立 WTT 工作区'} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"><X size={15} /></button>}
            {profile.requiresFullAccess && <span className="max-w-20 text-right text-xs text-zinc-500">{en ? 'Full access required' : '需完整执行权限'}</span>}
          </div>)}</fieldset>
          <label className="flex flex-wrap items-center justify-between gap-2 text-sm">{en ? 'Execution access' : '执行权限'}<select value={access} onChange={event => {
            const value = event.target.value as typeof access
            setAccess(value)
            if (value !== 'full-access') setSelected(previous => previous.filter(adapter => !profiles.find(profile => profile.adapter === adapter)?.requiresFullAccess))
          }} disabled={busy} className="min-h-10 rounded-md border border-zinc-200 bg-transparent px-2 dark:border-zinc-700"><option value="workspace-write">{en ? 'Workspace editing' : '工作区编辑'}</option><option value="full-access">{en ? 'Full local execution' : '完整本机执行权限'}</option></select></label>
          <div className="flex flex-wrap gap-2"><button disabled={busy || !selected.length} onClick={() => void start()} className={`${button} bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900`}><Check size={16} />{en ? 'Enable selected Agents' : '启用所选 Agent'}</button><button disabled={busy} onClick={() => void detect()} aria-label={en ? 'Detect again' : '重新检测'} title={en ? 'Detect again' : '重新检测'} className={button}><RefreshCw size={16} /></button></div>
        </>}
        {phase === 'ready' && <div className="space-y-3"><p role="status" className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400"><Check size={17} />{en ? 'Agent services started' : 'Agent 服务已启动'}</p>{runtime?.agents.map(agent => <button key={agent.agentId} onClick={() => enter(agent.agentId)} className={`${button} w-full justify-between`}><span className="min-w-0 text-left"><span className="block">{profiles.find(profile => profile.profile_id === agent.profileId)?.display_name || agent.adapter}</span><span className="text-xs text-zinc-500">{agent.state === 'online' ? (en ? 'Online' : '在线') : (en ? 'Connecting' : '正在连接')}</span></span><span className="inline-flex items-center gap-1">{en ? 'Open chat' : '进入对话'}<ChevronRight size={16} /></span></button>)}</div>}
      </div>
    </dialog>
  </>
}
