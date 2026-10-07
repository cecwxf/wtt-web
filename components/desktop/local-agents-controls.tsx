'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Play, RefreshCw, Square } from 'lucide-react'
import { getDesktopBridge, type DesktopAgentProfile, type DesktopRuntimeState } from '@/lib/desktop'
import { useI18n } from '@/lib/i18n-provider'

export function LocalAgentsControls({ onChanged }: { onChanged: () => void }) {
  const bridge = getDesktopBridge()?.host
  const { locale } = useI18n()
  const en = locale === 'en'
  const [profiles, setProfiles] = useState<DesktopAgentProfile[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [access, setAccess] = useState<'workspace-write' | 'full-access'>('workspace-write')
  const [runtime, setRuntime] = useState<DesktopRuntimeState>({ state: 'stopped', agents: [] })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const active = useRef(false)
  const running = ['starting', 'running', 'stopping'].includes(runtime.state)
  const supported = Boolean(bridge?.runtimeStatus && bridge?.discoverAgents && bridge?.startAgents && bridge?.stopAgents)

  useEffect(() => {
    if (!supported || !bridge) return
    active.current = true
    let current = true
    let pushed = false
    const unsubscribe = bridge.onRuntimeState?.(state => { pushed = true; if (current) setRuntime(state) })
    void bridge.runtimeStatus!().then(state => { if (current && !pushed) setRuntime(state) }).catch(() => {})
    return () => { current = false; active.current = false; unsubscribe?.() }
  }, [bridge, supported])

  async function operate(action: 'discover' | 'start' | 'stop') {
    if (!bridge || busy) return
    setBusy(true); setError('')
    try {
      if (action === 'discover' || action === 'stop') {
        if (action === 'stop') {
          const state = await bridge.stopAgents!()
          if (!active.current) return
          setRuntime(state)
        }
        const found = await bridge.discoverAgents!()
        if (!active.current) return
        setProfiles(found)
        setSelected(found.filter(profile => profile.available && (!profile.requiresFullAccess || access === 'full-access')).map(profile => profile.adapter))
      } else {
        const state = await bridge.startAgents!({ adapters: selected, workspaceAccess: access })
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
  }

  if (!supported) return null
  return <div role="group" aria-label={en ? 'Local Agents' : '本机 Agent'} className="space-y-3 border-t border-[var(--border)] pt-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="text-sm font-medium">{en ? 'Local Agents' : '本机 Agent'}</h4>
      <div className="flex items-center gap-2">
        <button type="button" disabled={busy || running} onClick={() => void operate('discover')} title={en ? 'Detect installed Agents' : '检测已安装 Agent'} aria-label={en ? 'Detect installed Agents' : '检测已安装 Agent'} className="rounded border border-[var(--border)] p-2 disabled:opacity-50"><RefreshCw size={16} /></button>
        {running
          ? <button type="button" disabled={busy || runtime.state === 'stopping'} onClick={() => void operate('stop')} title={en ? 'Stop local Agents' : '停止本机 Agent'} aria-label={en ? 'Stop local Agents' : '停止本机 Agent'} className="rounded border border-[var(--border)] p-2 disabled:opacity-50"><Square size={16} /></button>
          : <button type="button" disabled={busy || !selected.length} onClick={() => void operate('start')} title={en ? 'Start local Agents' : '启动本机 Agent'} aria-label={en ? 'Start local Agents' : '启动本机 Agent'} className="rounded border border-[var(--border)] p-2 disabled:opacity-50"><Play size={16} /></button>}
      </div>
    </div>
    <label className="flex flex-wrap items-center gap-2 text-sm">{en ? 'Execution access' : '执行权限'}
      <select aria-label={en ? 'Execution access' : '执行权限'} value={access} disabled={busy || running} onChange={event => {
        const value = event.target.value as typeof access
        setAccess(value)
        if (value !== 'full-access') setSelected(previous => previous.filter(adapter => !profiles.find(profile => profile.adapter === adapter)?.requiresFullAccess))
      }} className="min-w-0 max-w-full rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm">
        <option value="workspace-write">{en ? 'CLI workspace editing' : 'CLI 工作区编辑'}</option>
        <option value="full-access">{en ? 'Full local execution' : '完整本机执行权限'}</option>
      </select>
    </label>
    {busy && <p role="status" className="flex items-center gap-2 text-sm"><Loader2 size={15} className="animate-spin" />{en ? 'Processing...' : '处理中…'}</p>}
    {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    {runtime.error && <p role="status" className="text-sm text-red-600 dark:text-red-400">{runtime.error === 'runtime_recovery_required'
      ? (en ? 'Runtime recovery required. Check outstanding processes before restarting.' : '运行环境需要恢复，请先检查尚未退出的进程。')
      : (en ? 'Runtime connection interrupted or authorization unavailable.' : '运行连接已中断或主机授权不可用。')}</p>}
    <ul className="space-y-2">{profiles.map(profile => <li key={profile.profile_id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <label className="flex min-w-0 items-center gap-2"><input type="checkbox" checked={selected.includes(profile.adapter)} disabled={busy || running || !profile.available || (profile.requiresFullAccess && access !== 'full-access')} onChange={event => setSelected(previous => event.target.checked ? [...previous, profile.adapter] : previous.filter(value => value !== profile.adapter))} />{profile.display_name}</label>
      <span className="break-all text-xs text-[var(--muted-foreground)]">{!profile.available ? (en ? 'Not installed' : '未安装') : profile.requiresFullAccess && access !== 'full-access' ? (en ? 'Full access required' : '需要完整执行权限') : profile.version}</span>
    </li>)}</ul>
    <ul className="space-y-1">{runtime.agents.map(agent => <li key={agent.agentId} className="flex flex-wrap justify-between gap-2 text-xs"><span>{agent.adapter}</span><span>{agent.state === 'online' ? (en ? 'Online' : '在线') : agent.state === 'connecting' ? (en ? 'Connecting' : '连接中') : (en ? 'Offline' : '离线')}</span></li>)}</ul>
  </div>
}
