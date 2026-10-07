'use client'

import { AlertCircle, Check, Laptop, Loader2, LogOut, Monitor, Plus, RefreshCw, ShieldOff, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getDesktopBridge, type DesktopHostState } from '@/lib/desktop'
import { DesktopHostsApi, HostRequestError, type AccountHost } from '@/lib/desktop-hosts'
import { useI18n } from '@/lib/i18n-provider'
import { LocalAgentsControls } from './local-agents-controls'

const button = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--muted)] disabled:cursor-not-allowed disabled:opacity-50'

export function AccountHostsPanel({ accessToken, onChanged, standalone = false }: { accessToken?: string; onChanged?: () => void; standalone?: boolean }) {
  const { locale } = useI18n()
  const en = locale === 'en'
  const api = useMemo(() => new DesktopHostsApi(accessToken || ''), [accessToken])
  const [hosts, setHosts] = useState<AccountHost[]>([])
  const [nextOffset, setNextOffset] = useState<number | null>(null)
  const [native, setNative] = useState<DesktopHostState | null>(null)
  const [available, setAvailable] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [revoking, setRevoking] = useState<string | null>(null)
  const generation = useRef(0)
  const currentApi = useRef(api)
  currentApi.current = api
  const mounted = useRef(false)

  const describeError = useCallback((value: unknown) => {
    if (value instanceof HostRequestError) {
      if (value.status === 401 || value.status === 403) return en ? 'Sign in again to manage computers.' : '请重新登录后管理主机。'
      if (value.status === 404) return en ? 'Host service is not enabled.' : '主机接入服务尚未启用。'
      if (value.status === 409) return en ? 'This installation needs to be re-authorized or replaced.' : '当前安装身份需要重新授权或替换。'
    }
    // Electron invoke errors wrap a native error. Show only known actionable
    // categories, not arbitrary backend responses or IPC implementation details.
    const message = value instanceof Error ? value.message.toLowerCase() : ''
    if (/cancelled|canceled/.test(message)) return en ? 'Authorization cancelled.' : '已取消授权。'
    if (/keyring|credential storage|credentials could not/.test(message)) return en ? 'Unlock or configure the system keyring, then retry.' : '请解锁或配置系统密钥存储后重试。'
    if (/sign out before switching/.test(message)) return en ? 'Disconnect the previous local account first.' : '请先退出本机此前登录的账号。'
    return en ? 'Could not complete the request. Retry after checking your connection.' : '操作未完成，请检查网络后重试。'
  }, [en])

  const load = useCallback(async (append = false, offset = 0) => {
    const version = ++generation.current
    setLoading(true)
    setError('')
    try {
      const result = await api.list(offset)
      if (!mounted.current || version !== generation.current || currentApi.current !== api) return
      setAvailable(true)
      setHosts(previous => append ? Array.from(new Map([...previous, ...result.hosts].map(host => [host.host_id, host])).values()) : result.hosts)
      setNextOffset(result.nextOffset)
    } catch (value) {
      if (!mounted.current || version !== generation.current || currentApi.current !== api) return
      if (value instanceof HostRequestError && value.status === 404) setAvailable(false)
      else setError(describeError(value))
    } finally {
      if (mounted.current && version === generation.current && currentApi.current === api) setLoading(false)
    }
  }, [api, describeError])

  useEffect(() => {
    mounted.current = true
    setHosts([])
    setNative(null)
    setRevoking(null)
    setAvailable(null)
    setBusy(false)
    setNextOffset(null)
    if (accessToken) void load()
    const bridge = getDesktopBridge()?.host
    let active = true
    let receivedState = false
    const unsubscribe = bridge?.onState?.(state => {
      receivedState = true
      if (active && currentApi.current === api) setNative(state)
    })
    void bridge?.status().then(state => {
      // A push after this request is newer than its snapshot, even when the
      // snapshot resolves last (for example during account restoration).
      if (active && !receivedState && currentApi.current === api) setNative(state)
    }).catch(() => {})
    return () => { active = false; mounted.current = false; generation.current += 1; unsubscribe?.() }
  }, [accessToken, api, load])

  async function refresh() {
    const bridge = getDesktopBridge()?.host
    if (busy) return
    setBusy(true)
    setError('')
    try {
      if (accessToken && bridge?.resume && native?.enabled) {
        const state = await bridge.resume(accessToken)
        if (!mounted.current || currentApi.current !== api) return
        setNative(state)
      }
      await load()
    } catch (value) {
      if (mounted.current && currentApi.current === api) setError(describeError(value))
    } finally {
      if (mounted.current && currentApi.current === api) setBusy(false)
    }
  }

  async function authorize() {
    const bridge = getDesktopBridge()?.host
    if (!bridge || busy) return
    setBusy(true)
    setError('')
    const isCurrent = () => mounted.current && currentApi.current === api
    try {
      const state = await api.authorize(bridge, isCurrent)
      if (!isCurrent()) return
      setNative({ ...state, enabled: true })
      await load()
      onChanged?.()
    } catch (value) {
      if (isCurrent()) setError(describeError(value))
    } finally {
      if (isCurrent()) setBusy(false)
    }
  }

  async function revoke(hostId: string) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await api.revoke(hostId)
      if (!mounted.current || currentApi.current !== api) return
      if (native?.hostId === hostId) {
        const state = await getDesktopBridge()?.host?.signOut()
        if (mounted.current && currentApi.current === api) setNative(state ? { ...state, enabled: true } : null)
      }
      if (!mounted.current || currentApi.current !== api) return
      setRevoking(null)
      await load()
      onChanged?.()
    } catch (value) {
      if (mounted.current && currentApi.current === api) setError(describeError(value))
    } finally {
      if (mounted.current && currentApi.current === api) setBusy(false)
    }
  }

  async function disconnect() {
    const bridge = getDesktopBridge()?.host
    if (!bridge || busy) return
    setBusy(true)
    setError('')
    try {
      const state = await bridge.signOut()
      if (mounted.current && currentApi.current === api) setNative({ ...state, enabled: true })
    } catch (value) {
      if (mounted.current && currentApi.current === api) setError(describeError(value))
    } finally {
      if (mounted.current && currentApi.current === api) setBusy(false)
    }
  }

  if (!accessToken || (available === false && !native?.enabled && !standalone)) return null
  return (
    <section aria-label={en ? 'My computers' : '我的主机'} className="min-w-0 space-y-3 border-b border-[var(--border)] pb-5 text-[var(--foreground)] [--border:#e4e4e7] [--muted:#f4f4f5] [--muted-foreground:#71717a] dark:[--border:#3f3f46] dark:[--muted:#27272a] dark:[--muted-foreground:#a1a1aa]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Monitor size={17} />{en ? 'My computers' : '我的主机'}</h3>
        <div className="flex items-center gap-2">
          {native?.enabled && (
            <button type="button" className={button} disabled={busy || available !== true || native.state === 'registered' || native.state === 'unavailable'} onClick={() => void authorize()}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : native.state === 'registered' ? <Check size={15} /> : <Plus size={15} />}
              {native.state === 'registered' ? (en ? 'Computer authorized' : '本机已授权') : (en ? 'Enable this computer' : '启用本机')}
            </button>
          )}
          {native?.state === 'registered' && <button type="button" className={button} aria-label={en ? 'Disconnect this computer' : '断开本机'} title={en ? 'Disconnect this computer' : '断开本机'} disabled={busy} onClick={() => void disconnect()}><LogOut size={15} /></button>}
          <button type="button" className={button} aria-label={en ? 'Refresh computers' : '刷新主机'} title={en ? 'Refresh computers' : '刷新主机'} disabled={loading || busy} onClick={() => void refresh()}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>
      {error && <p role="alert" className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400"><AlertCircle size={16} className="mt-0.5 shrink-0" />{error}</p>}
      {native?.state === 'unavailable' && <p role="status" className="text-sm text-[var(--muted-foreground)]">{en ? 'Computer connection unavailable. Refresh to retry.' : '本机连接暂不可用，请刷新重试。'}</p>}
      {available === false && <p className="text-sm text-[var(--muted-foreground)]">{en ? 'Host service is not enabled.' : '主机接入服务尚未启用。'}</p>}
      {loading && !hosts.length && <p role="status" className="text-sm text-[var(--muted-foreground)]">{en ? 'Loading computers...' : '正在加载主机…'}</p>}
      {!loading && available && !hosts.length && <p className="text-sm text-[var(--muted-foreground)]">{en ? 'No authorized computers.' : '暂无已授权主机。'}</p>}
      <ul className="divide-y divide-[var(--border)]">
        {hosts.map(host => (
          <li key={host.host_id} className="min-w-0 py-3">
            <div className="flex items-start gap-3">
              <Laptop size={18} className="mt-0.5 shrink-0 text-[var(--muted-foreground)]" />
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-medium">{host.display_name}{host.host_id === native?.hostId ? (en ? ' (this computer)' : '（本机）') : ''}</p>
                <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">{host.platform === 'darwin' ? 'macOS' : host.platform === 'win32' ? 'Windows' : host.environment === 'wsl' ? 'Linux / WSL' : 'Linux'} · {host.client_version}</p>
              </div>
              <span className={`shrink-0 text-xs ${host.status === 'online' ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--muted-foreground)]'}`}>
                {host.status === 'online' ? (en ? 'Online' : '在线') : host.status === 'revoked' ? (en ? 'Revoked' : '已撤销') : (en ? 'Offline' : '离线')}
              </span>
              {host.status !== 'revoked' && <button type="button" className="shrink-0 rounded p-1 text-[var(--muted-foreground)] hover:text-red-600" disabled={busy} onClick={() => setRevoking(host.host_id)} aria-label={`${en ? 'Revoke' : '撤销授权'} ${host.display_name}`} title={en ? 'Revoke authorization' : '撤销授权'}><ShieldOff size={16} /></button>}
            </div>
            {host.agents.length > 0 && <ul className="ml-7 mt-2 space-y-1">{host.agents.map(agent => <li key={agent.agent_id} className="flex flex-wrap gap-x-2 text-xs"><span className="break-all">{agent.display_name}</span><span className="text-[var(--muted-foreground)]">{agent.adapter}</span></li>)}</ul>}
            {revoking === host.host_id && <div className="ml-7 mt-3 space-y-2" role="group" aria-label={en ? 'Confirm revocation' : '确认撤销'}>
              <p className="text-sm">{en ? 'Disconnect this computer? Chat history will be kept.' : '撤销这台主机的连接授权？聊天历史将保留。'}</p>
              <div className="flex gap-2"><button type="button" className={`${button} text-red-600`} disabled={busy} onClick={() => void revoke(host.host_id)}>{busy ? <Loader2 size={15} className="animate-spin" /> : <ShieldOff size={15} />}{en ? 'Revoke' : '确认撤销'}</button><button type="button" className={button} disabled={busy} onClick={() => setRevoking(null)}><X size={15} />{en ? 'Cancel' : '取消'}</button></div>
            </div>}
          </li>
        ))}
      </ul>
      {nextOffset !== null && <button type="button" className={button} disabled={loading || busy} onClick={() => void load(true, nextOffset)}>{en ? 'Load more' : '加载更多'}</button>}
      {native?.state === 'registered' && <LocalAgentsControls key={native.userId} onChanged={() => { void load(); onChanged?.() }} />}
    </section>
  )
}
