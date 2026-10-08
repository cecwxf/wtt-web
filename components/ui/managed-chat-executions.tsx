'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock3, Loader2, RefreshCw, Square } from 'lucide-react'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'
import { useI18n } from '@/lib/i18n-provider'
import type { ManagedExecutionSummary } from '@/lib/managed-chat-progress'

type Execution = {
  execution_id: string; message_id: string; topic_id: string; agent_id: string; state: string
  revision: number; stale: boolean; can_cancel: boolean; created_at: string; updated_at: string
}
const active = new Set(['queued', 'accepted', 'running', 'waiting_approval', 'cancel_requested', 'result_pending'])
const labels: Record<string, [string, string]> = {
  queued: ['待主机接收', 'Waiting for host'], accepted: ['已接收，排队中', 'Received, queued'],
  running: ['执行中', 'Running'], waiting_approval: ['等待授权', 'Awaiting approval'],
  result_pending: ['回复待同步', 'Reply awaiting delivery'],
  cancel_requested: ['正在停止', 'Stopping'], succeeded: ['完成', 'Completed'], failed: ['失败', 'Failed'],
  cancelled: ['已停止', 'Stopped'], interrupted: ['执行中断，结果待核对', 'Interrupted; result uncertain'],
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const empty: Execution[] = []

function normalize(value: unknown, topicId: string): Execution[] {
  if (!Array.isArray(value) || value.length > 32) throw new Error('Invalid execution status')
  return value.map(row => {
    if (!row || !uuid.test(row.execution_id) || !uuid.test(row.message_id) || row.topic_id !== topicId
      || typeof row.agent_id !== 'string' || row.agent_id.length > 255 || !labels[row.state]
      || !Number.isSafeInteger(row.revision) || row.revision < 1 || typeof row.stale !== 'boolean'
      || typeof row.can_cancel !== 'boolean' || !Number.isFinite(Date.parse(row.created_at)) || !Number.isFinite(Date.parse(row.updated_at))) throw new Error('Invalid execution status')
    return row as Execution
  })
}

export function ManagedChatExecutions({ topicId, accessToken, activeRun, enabled, agents, onSnapshot }: {
  topicId?: string; accessToken?: string; activeRun: boolean; enabled: boolean
  agents: Array<{ agent_id: string; display_name: string }>
  onSnapshot?: (rows: ManagedExecutionSummary[]) => void
}) {
  const { locale } = useI18n()
  const en = locale === 'en'
  const scope = `${topicId || ''}:${accessToken || ''}`
  const [snapshot, setSnapshot] = useState<{ scope: string; rows: Execution[] }>({ scope: '', rows: [] })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const decision = useRef<AbortController | null>(null)
  const rows = snapshot.scope === scope ? snapshot.rows : empty
  const hasActive = rows.some(row => active.has(row.state) && !row.stale)

  useEffect(() => {
    if (enabled) onSnapshot?.(rows)
  }, [enabled, onSnapshot, rows])

  useEffect(() => {
    setError(''); setBusy(null)
    return () => { decision.current?.abort(); decision.current = null }
  }, [scope])

  useEffect(() => {
    if (!enabled || !topicId || !accessToken) return
    let disposed = false
    let running = false
    let refreshQueued = false
    let repeat = activeRun || hasActive
    let timer: ReturnType<typeof setTimeout> | undefined
    const controller = new AbortController()
    const load = async () => {
      if (running || disposed) return
      clearTimeout(timer)
      if (document.visibilityState === 'hidden') return
      running = true
      try {
        const response = await fetch(`${CLIENT_WTT_API_BASE}/hosts/chat-executions?topic_id=${encodeURIComponent(topicId)}`, {
          headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store', redirect: 'error',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
        })
        if ([401, 403, 404].includes(response.status)) {
          await response.body?.cancel().catch(() => {})
          if (!disposed) setSnapshot({ scope, rows: [] })
          repeat = false
          return
        }
        if (!response.ok) { await response.body?.cancel().catch(() => {}); throw new Error() }
        const next = normalize(await response.json(), topicId)
        if (!disposed) {
          setSnapshot(previous => ({ scope, rows: next.map(row => {
            const known = previous.scope === scope ? previous.rows.find(item => item.execution_id === row.execution_id) : undefined
            return known && known.revision > row.revision ? known : row
          }) }))
          setError('')
        }
        repeat = activeRun || next.some(row => active.has(row.state) && !row.stale)
      } catch {
        if (!disposed && repeat) setError(en ? 'Execution status unavailable' : '执行状态暂不可用')
      } finally {
        running = false
        if (!disposed && refreshQueued) {
          refreshQueued = false
          void load()
        } else if (!disposed && repeat) timer = setTimeout(() => { void load() }, 10000)
      }
    }
    const changed = (event: Event) => {
      const incomingTopic = (event as CustomEvent<{ topicId?: string }>).detail?.topicId
      if (!incomingTopic || incomingTopic === topicId) {
        if (running) refreshQueued = true
        else void load()
      }
    }
    const focused = () => { if (document.visibilityState !== 'hidden') void load() }
    window.addEventListener('wtt-chat-execution-changed', changed)
    window.addEventListener('focus', focused)
    document.addEventListener('visibilitychange', focused)
    void load()
    return () => {
      disposed = true; controller.abort(); clearTimeout(timer)
      window.removeEventListener('wtt-chat-execution-changed', changed)
      window.removeEventListener('focus', focused)
      document.removeEventListener('visibilitychange', focused)
    }
  }, [accessToken, activeRun, enabled, en, hasActive, revision, scope, topicId])

  async function stop(row: Execution) {
    if (busy || !accessToken || !row.can_cancel) return
    const controller = new AbortController()
    decision.current = controller
    setBusy(row.execution_id)
    try {
      const response = await fetch(`${CLIENT_WTT_API_BASE}/hosts/chat-executions/${row.execution_id}/cancel`, {
        method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store', redirect: 'error',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
      })
      if (!response.ok) { await response.body?.cancel().catch(() => {}); throw new Error() }
      const [next] = normalize([await response.json()], row.topic_id)
      if (!controller.signal.aborted) {
        setSnapshot(previous => previous.scope === scope ? { scope, rows: previous.rows.map(item => item.execution_id === next.execution_id ? next : item) } : previous)
        setError('')
      }
    } catch {
      if (!controller.signal.aborted) setError(en ? 'Stop request failed. Retry.' : '停止请求失败，请重试。')
    } finally {
      if (!controller.signal.aborted) { setBusy(null); setRevision(value => value + 1) }
    }
  }

  if (!enabled || (!rows.length && !error)) return null
  const visible = rows.filter(row => active.has(row.state) || ['interrupted', 'failed'].includes(row.state)).slice(0, 8)
  if (!visible.length && rows[0]) visible.push(rows[0])
  return <section aria-label={en ? 'Executions' : '执行状态'} className="mb-2 max-h-36 overflow-y-auto border-b border-zinc-200 pb-1 dark:border-zinc-800">
    {visible.map(row => {
      const pending = active.has(row.state) && !row.stale
      const Icon = row.stale || ['interrupted', 'failed'].includes(row.state) ? AlertTriangle : pending ? (['queued', 'accepted'].includes(row.state) ? Clock3 : Loader2) : CheckCircle2
      const name = agents.find(agent => agent.agent_id === row.agent_id)?.display_name || row.agent_id
      const text = row.stale ? (en ? 'Host disconnected; result uncertain' : '主机失联，执行结果待核对') : labels[row.state][en ? 1 : 0]
      return <div key={row.execution_id} className="flex min-h-8 min-w-0 items-center gap-2 py-1 text-xs text-zinc-600 dark:text-zinc-300">
        <Icon size={14} aria-hidden className={`shrink-0 ${pending && !['queued', 'accepted', 'waiting_approval'].includes(row.state) ? 'animate-spin' : ''}`} />
        <span title={name} className="max-w-[35%] truncate font-medium">{name}</span>
        <span className="min-w-0 flex-1 break-words">{text}</span>
        <time className="shrink-0 text-[10px] text-zinc-400" dateTime={row.created_at}>{new Date(row.created_at).toLocaleTimeString(en ? 'en-US' : 'zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}</time>
        {row.can_cancel && row.state !== 'cancel_requested' && <button type="button" disabled={Boolean(busy)} onClick={() => { void stop(row) }} aria-label={en ? `Stop ${name}` : `停止 ${name}`} title={en ? 'Stop execution' : '停止执行'} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded hover:bg-zinc-100 disabled:opacity-40 dark:hover:bg-zinc-800">
          {busy === row.execution_id ? <Loader2 size={13} className="animate-spin" /> : <Square size={12} />}
        </button>}
      </div>
    })}
    {error && <div role="alert" className="flex items-center gap-2 py-1 text-xs text-red-600 dark:text-red-400"><span>{error}</span><button type="button" onClick={() => setRevision(value => value + 1)} title={en ? 'Retry' : '重试'} aria-label={en ? 'Retry execution status' : '重试执行状态'} className="inline-flex h-7 w-7 items-center justify-center"><RefreshCw size={13} /></button></div>}
  </section>
}
