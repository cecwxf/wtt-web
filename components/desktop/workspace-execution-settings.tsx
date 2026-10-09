'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Loader2, RefreshCw, Settings2, X } from 'lucide-react'
import { useI18n } from '@/lib/i18n-provider'
import { WorkspaceProjectsApi, type WorkspaceExecutionConfig, type WorkspaceExecutionSettings } from '@/lib/workspace-projects'

export function WorkspaceExecutionControls(props: { workspaceId: string; topicId: string; token: string; agentId?: string; runtime?: { model?: string; label: string; effort: string } }) {
  const { locale } = useI18n()
  const zh = locale === 'zh'
  const [data, setData] = useState<WorkspaceExecutionSettings | null>(null)
  const [memberId, setMemberId] = useState('')
  const [draft, setDraft] = useState<WorkspaceExecutionConfig>({})
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const alive = useRef(true)
  const dialog = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const member = data?.participants.find(p => p.participant_id === memberId)
  const runtime = !member || member.transport_agent_id === props.agentId ? props.runtime : undefined
  const defaultLabel = zh ? '默认' : 'Default'
  const accessLabel = (value?: string) => ({ 'read-only': zh ? '只读' : 'Read only', 'workspace-write': zh ? '工作区写入' : 'Workspace write', 'full-access': zh ? '完全访问' : 'Full access' })[value || ''] || defaultLabel
  const load = useCallback(async () => {
    setBusy(true); setError('')
    try {
      const next = await new WorkspaceProjectsApi(props.token).executionSettings(props.workspaceId, props.topicId)
      if (!Array.isArray(next?.participants) || !next.session_id || !next.participants.every(p => p.options && Array.isArray(p.options.permissions) && Array.isArray(p.options.reasoning_efforts))) throw new Error(zh ? '执行设置暂不可用' : 'Execution settings unavailable')
      if (alive.current) {
        setData(next)
        setMemberId(current => next.participants.some(p => p.participant_id === current) ? current
          : (next.participants.find(p => p.transport_agent_id === props.agentId) || next.participants[0])?.participant_id || '')
      }
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : 'Request failed') }
    finally { if (alive.current) setBusy(false) }
  }, [props.token, props.workspaceId, props.topicId, props.agentId, zh])
  useEffect(() => { alive.current = true; void load(); return () => { alive.current = false } }, [load])
  useEffect(() => { setDraft(member?.config || {}) }, [member])
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.focus()
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) setOpen(false)
      if (event.key === 'Tab') {
        const nodes = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)') || [])
        const first = nodes[0], last = nodes[nodes.length - 1]
        if (!first) return
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('keydown', key); (trigger.current || previous)?.focus() }
  }, [open, busy])
  const show = (event: React.MouseEvent<HTMLButtonElement>) => { trigger.current = event.currentTarget; setDraft(member?.config || {}); setOpen(true) }
  const save = async () => {
    if (!data || !member) return
    setBusy(true); setError('')
    try {
      const saved = await new WorkspaceProjectsApi(props.token).saveExecutionSettings(props.workspaceId, data.session_id, member.participant_id, member.revision, draft)
      if (alive.current) {
        setData({ ...data, participants: data.participants.map(p => p.participant_id === member.participant_id ? { ...p, ...saved } : p) })
        setOpen(false)
      }
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : 'Request failed') }
    finally { if (alive.current) setBusy(false) }
  }
  const buttonClass = 'flex min-h-8 min-w-0 shrink-0 items-center gap-1 rounded-md bg-transparent px-2 text-xs hover:bg-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 dark:hover:bg-zinc-800'
  const mutedClass = 'text-zinc-600 dark:text-zinc-300'
  const inputClass = 'w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900'
  return <>
    <div role="group" aria-label={zh ? '会话执行配置' : 'Conversation execution controls'} className="flex min-w-0 max-w-full flex-wrap items-center gap-1">
    {data && data.participants.length > 1 && <select aria-label={zh ? '执行配置成员' : 'Execution settings member'} title={member && `${member.label} · ${member.adapter}`} value={memberId} onChange={event => setMemberId(event.target.value)} className={`${buttonClass} ${mutedClass} w-[112px] truncate pr-6`}>
      {data.participants.map(p => <option key={p.participant_id} value={p.participant_id}>{p.label}</option>)}
    </select>}
    <button type="button" className={`${buttonClass} ${mutedClass} max-w-[120px] sm:max-w-[160px]`} onClick={show} title={[zh ? '设置模型' : 'Set model', member?.config.model && `${zh ? '下次执行' : 'Next run'}: ${member.config.model}`, runtime && `Current runtime model: ${runtime.model || runtime.label}`].filter(Boolean).join('\n')} aria-label={zh ? '设置模型' : 'Set model'} aria-haspopup="dialog" aria-expanded={open}><span className="truncate">{member?.config.model || (runtime?.model ? runtime.label : (zh ? '模型' : 'Model'))}</span><ChevronDown size={12} className="shrink-0" /></button>
    <button type="button" className={`${buttonClass} h-8 w-8 justify-center px-0 ${member?.config.workspace_access === 'full-access' ? 'text-amber-700 dark:text-amber-400' : mutedClass}`} onClick={show} title={`${zh ? '执行设置' : 'Execution settings'} · ${accessLabel(member?.config.workspace_access)} · ${member?.config.reasoning_effort || defaultLabel}`} aria-label={zh ? '执行设置' : 'Execution settings'} aria-haspopup="dialog" aria-expanded={open}><Settings2 size={15} /></button>
    </div>
    {open && createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={event => { if (event.target === event.currentTarget && !busy) setOpen(false) }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="execution-settings-title" tabIndex={-1} className="max-h-[85dvh] w-full max-w-sm overflow-y-auto rounded-lg border border-zinc-200 bg-white p-5 text-zinc-900 shadow-xl dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
        <div className="mb-4 flex items-center justify-between gap-3"><h3 id="execution-settings-title" className="text-base font-semibold">{zh ? '执行设置' : 'Execution settings'}</h3><button type="button" disabled={busy} onClick={() => setOpen(false)} title={zh ? '关闭' : 'Close'} aria-label={zh ? '关闭执行设置' : 'Close execution settings'}><X size={18} /></button></div>
        {member && <div className="mb-4 text-sm text-zinc-500"><div className="truncate">{member.label} · {member.adapter}</div>{member.options.host_ceiling && <div className="mt-1 text-xs">{zh ? '本机授权上限：' : 'Computer approval limit: '}{accessLabel(member.options.host_ceiling)}</div>}</div>}
        {runtime && <div className="mb-4 break-words text-xs text-zinc-500" title={`Current runtime model: ${runtime.model || runtime.label}`}><div>{zh ? '当前运行模型：' : 'Current runtime model: '}{runtime.model || runtime.label}</div><div>{zh ? '当前思考强度：' : 'Current reasoning effort: '}{runtime.effort}</div></div>}
        {busy && <Loader2 size={18} className="mb-3 animate-spin" />}
        {error && <p role="alert" className="mb-3 break-words text-sm text-red-600 dark:text-red-400">{error}</p>}
        {member && !member.options.available && <p className="mb-3 text-sm text-zinc-500">{zh ? '请在此成员所在电脑更新并重启 WTT 本机服务。' : 'Update and restart WTT on this member’s computer.'}</p>}
        <form onSubmit={event => { event.preventDefault(); void save() }} className="space-y-4">
          <label className="block text-sm">{zh ? '模型 ID' : 'Model ID'}<input className={`${inputClass} mt-1`} aria-label={zh ? '模型 ID' : 'Model ID'} disabled={busy || !member?.options.model_override || !member.options.available} value={draft.model || ''} placeholder={zh ? 'CLI 默认模型' : 'CLI default model'} maxLength={160} onChange={event => setDraft({ ...draft, model: event.target.value })} /></label>
          <label className="block text-sm">{zh ? '思考强度' : 'Reasoning effort'}<select className={`${inputClass} mt-1`} aria-label={zh ? '思考强度' : 'Reasoning effort'} disabled={busy || !member?.options.available || !member.options.reasoning_efforts.length} value={draft.reasoning_effort || ''} onChange={event => setDraft({ ...draft, reasoning_effort: event.target.value })}><option value="">{defaultLabel}</option>{member?.options.reasoning_efforts.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="block text-sm">{zh ? '执行权限' : 'Execution permissions'}<select className={`${inputClass} mt-1`} aria-label={zh ? '执行权限' : 'Execution permissions'} disabled={busy || !member?.options.available} value={draft.workspace_access || ''} onChange={event => setDraft({ ...draft, workspace_access: event.target.value })}><option value="">{defaultLabel}</option>{member?.options.permissions.map(value => <option key={value} value={value}>{accessLabel(value)}</option>)}</select></label>
          {draft.workspace_access === 'full-access' && <p className="text-xs text-amber-700 dark:text-amber-400">{zh ? '可执行本机命令并访问当前系统用户的文件。' : 'Can run local commands and access this system user’s files.'}</p>}
          <div className="flex items-center justify-between gap-3 pt-2"><button type="button" disabled={busy} onClick={() => void load()} title={zh ? '刷新配置' : 'Reload settings'} aria-label={zh ? '刷新执行设置' : 'Reload execution settings'} className="p-2"><RefreshCw size={16} /></button><button type="submit" disabled={busy || !member?.options.available} className="flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"><Check size={15} />{zh ? '应用到下次执行' : 'Apply to next run'}</button></div>
        </form>
      </div>
    </div>, document.body)}
  </>
}
