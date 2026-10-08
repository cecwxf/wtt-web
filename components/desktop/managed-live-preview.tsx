'use client'

import { useEffect, useRef, useState } from 'react'
import { Copy, Loader2, Play, RefreshCw, Square } from 'lucide-react'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'

type Preview = { state: 'stopped' | 'starting' | 'ready' | 'expired' | 'failed'; port: number; url?: string; expires_at?: string }

export function ManagedLivePreview({ agentId, workspaceId, token, ports, en }: { agentId: string; workspaceId?: string; token?: string; ports: number[]; en: boolean }) {
  const [port, setPort] = useState(ports[0])
  const [value, setValue] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [epoch, setEpoch] = useState(0)
  const [copied, setCopied] = useState(false)
  const active = useRef<AbortController | null>(null)
  const mounted = useRef(true)
  const revision = useRef(0)
  const expires = value?.expires_at ? Date.parse(value.expires_at) : 0
  const url = value?.state === 'ready' && value.url && /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(value.url) && expires > Date.now() ? value.url : ''

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; active.current?.abort() } }, [])

  async function control(operation: 'preview_status' | 'preview_start' | 'preview_stop') {
    if (!token || active.current) return
    const controller = new AbortController()
    active.current = controller
    const request = ++revision.current
    const timeout = setTimeout(() => controller.abort(), 20000)
    setBusy(true); setError('')
    try {
      const resource = workspaceId ? `workspaces/${encodeURIComponent(workspaceId)}` : `hosts/agents/${encodeURIComponent(agentId)}`
      const response = await fetch(`${CLIENT_WTT_API_BASE}/${resource}/preview`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation, port, ...(workspaceId ? { agent_id: agentId } : {}) }), signal: controller.signal, cache: 'no-store', redirect: 'error',
      })
      if (!response.ok) throw new Error('Preview unavailable')
      const next = await response.json() as Preview
      if (!ports.includes(next.port) || !['stopped', 'starting', 'ready', 'expired', 'failed'].includes(next.state)) throw new Error('Invalid preview response')
      if (next.state === 'ready' && (!/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(next.url || '') || !Number.isFinite(Date.parse(next.expires_at || '')))) throw new Error('Invalid preview link')
      if (mounted.current && request === revision.current) { setValue(next); setPort(next.port) }
    } catch {
      if (mounted.current && !controller.signal.aborted) { setError(en ? 'Preview unavailable. Check the desktop connection and approved port.' : '预览暂不可用，请检查桌面连接和授权端口。'); setValue(null) }
    } finally {
      clearTimeout(timeout)
      if (active.current === controller) active.current = null
      if (mounted.current) { setBusy(false); if (controller.signal.aborted) { setValue(null); setError(en ? 'Preview request timed out. Refresh to check its actual state.' : '预览请求超时，请刷新确认实际状态。') } }
    }
  }

  useEffect(() => { void control('preview_status') }, [port]) // Account/Agent changes remount the parent.
  useEffect(() => {
    if (!value || !['starting', 'ready'].includes(value.state)) return
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void control('preview_status') }, 10000)
    const focus = () => { if (document.visibilityState === 'visible') void control('preview_status') }
    document.addEventListener('visibilitychange', focus)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', focus) }
  }, [value?.state, port, token, en])
  useEffect(() => {
    if (!url) return
    const timer = setTimeout(() => { setValue(previous => previous ? { ...previous, state: 'expired', url: undefined } : null) }, Math.max(0, expires - Date.now()))
    return () => clearTimeout(timer)
  }, [url, expires])

  const running = value && ['starting', 'ready'].includes(value.state)
  return <section className="flex min-h-0 flex-1 flex-col gap-2">
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <select aria-label={en ? 'Preview port' : '预览端口'} value={port} disabled={busy || Boolean(running)} onChange={event => { setValue(null); setPort(Number(event.target.value)) }} className="h-9 rounded-md border border-zinc-200 bg-transparent px-2 text-sm dark:border-zinc-700">{ports.map(item => <option key={item} value={item}>{item}</option>)}</select>
      <span role="status" className="min-w-0 flex-1 text-xs text-zinc-500">{busy ? (en ? 'Connecting…' : '连接中…') : value?.state === 'ready' ? (en ? 'Public · 15-minute link' : '公开 · 15 分钟链接') : value?.state === 'starting' ? (en ? 'Starting…' : '启动中…') : value?.state === 'expired' ? (en ? 'Expired' : '已过期') : value?.state === 'failed' ? (en ? 'Connection failed' : '连接失败') : (en ? 'Stopped' : '已停止')}</span>
      <button type="button" disabled={busy} onClick={() => void control(running ? 'preview_stop' : 'preview_start')} aria-label={running ? (en ? 'Stop preview' : '停止预览') : (en ? 'Start preview' : '启动预览')} title={running ? (en ? 'Stop preview' : '停止预览') : (en ? 'Start preview' : '启动预览')} className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-zinc-100 disabled:opacity-40 dark:hover:bg-zinc-800">{busy ? <Loader2 size={17} className="animate-spin" /> : running ? <Square size={17} /> : <Play size={17} />}</button>
      <button type="button" disabled={!url} onClick={() => setEpoch(number => number + 1)} aria-label={en ? 'Refresh preview' : '刷新预览'} title={en ? 'Refresh preview' : '刷新预览'} className="flex h-9 w-9 items-center justify-center rounded-md disabled:opacity-40"><RefreshCw size={17} /></button>
      <button type="button" disabled={!url} onClick={() => { void navigator.clipboard.writeText(url).then(() => { if (mounted.current) setCopied(true) }).catch(() => { if (mounted.current) setError(en ? 'Could not copy link.' : '无法复制链接。') }) }} aria-label={en ? 'Copy public link' : '复制公开链接'} title={copied ? (en ? 'Copied' : '已复制') : (en ? 'Copy public link' : '复制公开链接')} className="flex h-9 w-9 items-center justify-center rounded-md disabled:opacity-40"><Copy size={17} /></button>
    </div>
    <p className="shrink-0 text-xs text-amber-700 dark:text-amber-400">{en ? 'Anyone with this link can access the service. Development preview only.' : '持有链接即可访问该服务，仅用于开发预览。'}</p>
    {error && <p role="alert" className="shrink-0 text-xs text-red-600">{error}</p>}
    {url && <iframe key={`${url}:${epoch}`} src={url} title={en ? 'Development preview' : '开发预览'} sandbox="allow-scripts allow-same-origin allow-forms" referrerPolicy="no-referrer" className="min-h-0 w-full flex-1 border border-zinc-200 bg-white dark:border-zinc-800" />}
  </section>
}
