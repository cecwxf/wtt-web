'use client'

import { Check, Loader2, ShieldCheck, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'
import { useI18n } from '@/lib/i18n-provider'
import { normalizePrivateToolApprovals, PrivateToolApproval, readPrivateApprovalResponse } from '@/lib/tool-approvals'

export function ToolApprovalPanel({ topicId, accessToken, activeRun, enabled }: {
  topicId?: string; accessToken?: string; activeRun: boolean; enabled: boolean
}) {
  const { t } = useI18n()
  const scope = `${topicId || ''}:${accessToken || ''}`
  const [snapshot, setSnapshot] = useState<{ scope: string; rows: PrivateToolApproval[] }>({ scope: '', rows: [] })
  const [error, setError] = useState<{ scope: string; text: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const decisionAbort = useRef<AbortController | null>(null)
  const rows = snapshot.scope === scope ? snapshot.rows : []
  const visibleError = error?.scope === scope ? error.text : ''

  useEffect(() => {
    setBusy(null)
    return () => { decisionAbort.current?.abort(); decisionAbort.current = null }
  }, [scope])

  useEffect(() => {
    if (!enabled || !topicId || !accessToken) return
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const controller = new AbortController()
    const load = async () => {
      let repeat = activeRun || rows.length > 0
      try {
        const response = await fetch(`${CLIENT_WTT_API_BASE}/hosts/approvals?topic_id=${encodeURIComponent(topicId)}`, {
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
        const next = normalizePrivateToolApprovals(await readPrivateApprovalResponse(response), topicId)
        if (!disposed) { setSnapshot({ scope, rows: next }); setError(null) }
        repeat = activeRun || next.length > 0
      } catch {
        if (!disposed && repeat) setError({ scope, text: t('chat.approvalUnavailable') })
      } finally {
        if (!disposed && repeat) timer = setTimeout(() => { void load() }, 2000)
      }
    }
    void load()
    return () => { disposed = true; controller.abort(); clearTimeout(timer) }
  }, [accessToken, activeRun, enabled, revision, rows.length, scope, t, topicId])

  async function decide(row: PrivateToolApproval, decision: 'allow' | 'deny') {
    if (busy || !accessToken || row.topic_id !== topicId || Date.parse(row.expires_at) <= Date.now()) return
    const controller = new AbortController()
    decisionAbort.current?.abort()
    decisionAbort.current = controller
    setBusy(row.request_id)
    try {
      const response = await fetch(`${CLIENT_WTT_API_BASE}/hosts/approvals/${row.request_id}/decision`, {
        method: 'POST', cache: 'no-store', redirect: 'error',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, input_sha256: row.input_sha256 }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
      })
      await response.body?.cancel().catch(() => {})
      if (!response.ok) throw new Error()
      if (!controller.signal.aborted) {
        setSnapshot(previous => previous.scope === scope ? { scope, rows: previous.rows.filter(item => item.request_id !== row.request_id) } : previous)
        setError(null)
      }
    } catch {
      if (!controller.signal.aborted) setError({ scope, text: t('chat.approvalDecisionFailed') })
    } finally {
      if (!controller.signal.aborted) { setBusy(null); setRevision(value => value + 1) }
    }
  }

  if (!enabled || (!rows.length && !visibleError)) return null
  return (
    <section aria-label={t('chat.toolApproval')} className="mb-2 max-h-64 space-y-2 overflow-y-auto">
      {rows.map(row => (
        <article key={row.request_id} className="rounded-lg border border-emerald-600/30 bg-white p-3 text-xs text-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
          <div className="flex min-w-0 items-center gap-2">
            <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
            <span className="font-medium">{t('chat.toolApproval')} · {row.tool_name}</span>
          </div>
          <div className="mt-1 break-all text-[11px] text-zinc-500">{row.agent_id}</div>
          <pre className="my-2 max-h-28 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-4">{JSON.stringify(row.input, null, 2)}</pre>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" disabled={Boolean(busy) || Date.parse(row.expires_at) <= Date.now()} onClick={() => { void decide(row, 'deny') }} className="inline-flex items-center gap-1 rounded-md border border-zinc-300 px-3 py-1.5 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:hover:bg-zinc-800">
              <X className="h-3.5 w-3.5" aria-hidden />{t('chat.approvalDeny')}
            </button>
            <button type="button" disabled={Boolean(busy) || Date.parse(row.expires_at) <= Date.now()} onClick={() => { void decide(row, 'allow') }} className="inline-flex items-center gap-1 rounded-md bg-emerald-700 px-3 py-1.5 text-white hover:bg-emerald-600 disabled:opacity-50">
              {busy === row.request_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}{t('chat.approvalAllowOnce')}
            </button>
          </div>
        </article>
      ))}
      {visibleError && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{visibleError}</p>}
    </section>
  )
}
