'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import useSWR from 'swr'
import { FolderOpen, Globe, Loader2, Terminal, Upload, X } from 'lucide-react'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'
import { CliWorkspaceExplorer } from '@/components/ui/cli-workspace-explorer'
import { useI18n } from '@/lib/i18n-provider'
import { downloadNativeWorkspaceFile } from '@/lib/native-files'
import { ManagedLivePreview } from './managed-live-preview'

const TerminalPane = dynamic(() => import('@/components/ui/agent-terminal-modal').then(module => module.AgentTerminalPane), { ssr: false })
type Tools = { files: 'off' | 'read-only' | 'workspace-write'; terminal: boolean; preview_ports: number[] }
type Tab = 'files' | 'terminal' | 'preview'

export function ManagedAgentTools(props: { agentId: string; agentName?: string; token?: string }) {
  return <ManagedAgentToolsInner key={`${props.agentId}:${props.token || ''}`} {...props} />
}

function ManagedAgentToolsInner({ agentId, agentName, token }: { agentId: string; agentName?: string; token?: string }) {
  const { locale } = useI18n()
  const en = locale === 'en'
  const [tab, setTab] = useState<Tab | null>(null)
  const [terminalStarted, setTerminalStarted] = useState(false)
  const [previewMode, setPreviewMode] = useState<'live' | 'file'>('live')
  const dialog = useRef<HTMLDialogElement>(null)
  const transfer = useRef<AbortController | null>(null)
  const uploadInput = useRef<HTMLInputElement>(null)
  const live = useRef(true)
  const [progress, setProgress] = useState<number | null>(null)
  const [downloadError, setDownloadError] = useState('')
  const [refreshEpoch, setRefreshEpoch] = useState(0)
  const apiBase = `${CLIENT_WTT_API_BASE}/hosts/agents/${encodeURIComponent(agentId)}/workspace`
  const { data, error, mutate } = useSWR<Tools | null>(token && agentId ? ['managed-agent-tools', agentId, token] : null, async () => {
    const response = await fetch(`${CLIENT_WTT_API_BASE}/hosts/agents/${encodeURIComponent(agentId)}/tools`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', redirect: 'error' })
    if ([403, 404].includes(response.status)) return null
    if (!response.ok) throw new Error('Could not load remote tools')
    const value = await response.json()
    if (!['off', 'read-only', 'workspace-write'].includes(value.files) || typeof value.terminal !== 'boolean') throw new Error('Invalid tool capabilities')
    const ports = value.preview_ports || []
    if (!Array.isArray(ports) || ports.length > 5 || !ports.every(port => Number.isInteger(port) && port >= 1024 && port <= 65535)) throw new Error('Invalid preview capabilities')
    return { ...value, preview_ports: ports }
  }, { shouldRetryOnError: false, revalidateOnFocus: true })

  useEffect(() => {
    const refresh = () => { void mutate() }
    window.addEventListener('wtt-directory-changed', refresh)
    return () => window.removeEventListener('wtt-directory-changed', refresh)
  }, [mutate])

  useEffect(() => {
    live.current = true
    return () => { live.current = false; transfer.current?.abort(); dialog.current?.close() }
  }, [])
  useEffect(() => {
    if (tab === 'terminal') setTerminalStarted(true)
    if (!tab) setTerminalStarted(false)
  }, [tab])
  useEffect(() => {
    if (tab && (data === null || error || (data && (tab === 'terminal' ? !data.terminal : tab === 'preview' ? data.files === 'off' && !data.preview_ports.length : data.files === 'off')))) { setTab(null); return }
    if (!tab) { dialog.current?.close(); transfer.current?.abort() }
    else if (!dialog.current?.open) dialog.current?.showModal()
  }, [tab, data, error])

  async function download(path: string, name: string) {
    if (!token || transfer.current) return
    const controller = new AbortController()
    transfer.current = controller
    setDownloadError(''); setProgress(0)
    try {
      if (await downloadNativeWorkspaceFile({ agentId, path, filename: name }, {
        signal: controller.signal,
        onProgress: value => { if (live.current) setProgress(value.total ? Math.min(100, Math.round(value.loaded / value.total * 100)) : 0) },
      })) return
      const response = await fetch(`${apiBase}/content?${new URLSearchParams({ path, download: 'true' })}`, {
        headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: 'no-store', redirect: 'error',
      })
      if (!response.ok || !response.body) throw new Error(`Download failed (${response.status})`)
      const total = Number(response.headers.get('Content-Length'))
      if (!Number.isSafeInteger(total) || total < 0 || total > 100 * 1024 * 1024) throw new Error('File exceeds 100 MiB')
      const chunks: Uint8Array<ArrayBuffer>[] = []
      let loaded = 0
      const reader = response.body.getReader()
      try {
        for (;;) {
          const result = await reader.read()
          if (result.done) break
          loaded += result.value.length
          if (loaded > total) throw new Error('Unexpected download size')
          chunks.push(new Uint8Array(result.value))
          if (live.current) setProgress(total ? Math.round(loaded / total * 100) : 100)
        }
      } finally { reader.releaseLock() }
      if (loaded !== total) throw new Error('Incomplete download; retry')
      if (!live.current || controller.signal.aborted) return
      const url = URL.createObjectURL(new Blob(chunks, { type: response.headers.get('Content-Type') || 'application/octet-stream' }))
      const link = document.createElement('a')
      link.href = url; link.download = name; link.rel = 'noreferrer'; link.click()
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (value) {
      const cancelled = controller.signal.aborted || (value instanceof Error && value.name === 'AbortError')
      controller.abort()
      if (live.current && !cancelled) setDownloadError(en ? 'Download failed. Retry.' : '下载失败，请重试。')
    } finally {
      transfer.current = null
      if (live.current) setProgress(null)
    }
  }

  async function upload(file: File) {
    if (!token || transfer.current || data?.files !== 'workspace-write') return
    if (file.size > 100 * 1024 * 1024) { setDownloadError(en ? 'File exceeds 100 MiB.' : '文件超过 100 MiB。'); return }
    const controller = new AbortController()
    transfer.current = controller
    setDownloadError(''); setProgress(0)
    let uploadId = ''
    async function send(body: Record<string, unknown>, signal = controller.signal) {
      const response = await fetch(`${apiBase}/upload`, { method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body), cache: 'no-store', redirect: 'error', signal,
      })
      if (!response.ok) throw new Error(`Upload failed (${response.status})`)
      return await response.json()
    }
    try {
      const started = await send({ operation: 'upload_begin', name: file.name, total_size: file.size })
      if (typeof started.upload_id !== 'string') throw new Error('Invalid upload receipt')
      uploadId = started.upload_id
      for (let offset = 0; offset < file.size;) {
        controller.signal.throwIfAborted()
        const blob = file.slice(offset, offset + 1024 * 1024)
        const encoded = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result).split(',')[1])
          reader.onerror = () => reject(new Error('File read failed'))
          reader.readAsDataURL(blob)
        })
        const result = await send({ operation: 'upload_chunk', upload_id: uploadId, offset, content_base64: encoded })
        if (result.offset !== offset + blob.size) throw new Error('Upload offset mismatch')
        offset += blob.size
        if (live.current) setProgress(Math.round(offset / file.size * 100))
      }
      await send({ operation: 'upload_commit', upload_id: uploadId })
      uploadId = ''
      if (live.current) setRefreshEpoch(value => value + 1)
    } catch {
      if (!controller.signal.aborted && live.current) setDownloadError(en ? 'Upload failed. Existing files are not overwritten.' : '上传失败。已有同名文件不会被覆盖。')
    } finally {
      if (uploadId) await send({ operation: 'upload_abort', upload_id: uploadId }, AbortSignal.timeout(15000)).catch(() => {})
      transfer.current = null
      if (live.current) setProgress(null)
    }
  }

  if (!data) return error ? <span role="status" className="text-xs text-red-600">{en ? 'Remote tools unavailable' : '远程工具暂不可用'}</span> : null
  const tabs: Array<{ key: Tab; label: string; icon: typeof FolderOpen; enabled: boolean }> = [
    { key: 'files', label: en ? 'Files' : '文件', icon: FolderOpen, enabled: data.files !== 'off' },
    { key: 'terminal', label: en ? 'Terminal' : '终端', icon: Terminal, enabled: data.terminal },
    { key: 'preview', label: en ? 'Preview' : '预览', icon: Globe, enabled: data.files !== 'off' || data.preview_ports.length > 0 },
  ]
  if (!tabs.some(item => item.enabled)) return null
  return <>
    <div className="flex shrink-0 items-center justify-end gap-1 border-b border-zinc-200 px-2 py-1 dark:border-zinc-800">
      {tabs.filter(item => item.enabled).map(({ key, label, icon: Icon }) => <button key={key} type="button" onClick={() => setTab(key)} title={`${agentName || agentId} · ${label}`} aria-label={label} className="inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"><Icon size={15} /><span>{label}</span></button>)}
    </div>
    <dialog ref={dialog} onCancel={() => setTab(null)} onClose={() => setTab(null)} aria-label={en ? 'Agent tools' : 'Agent 工具'} className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-full max-w-none border-l border-zinc-200 bg-white p-0 text-zinc-900 backdrop:bg-black/20 md:w-[min(800px,75vw)] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="flex h-full min-h-0 flex-col" onDragOver={event => { if (tab !== 'terminal' && data.files === 'workspace-write' && event.dataTransfer.types.includes('Files')) { event.preventDefault(); event.stopPropagation() } }} onDrop={event => {
        if (tab !== 'terminal' && data.files === 'workspace-write' && event.dataTransfer.files.length) { event.preventDefault(); event.stopPropagation(); void upload(event.dataTransfer.files[0]) }
      }}>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-zinc-200 px-3 dark:border-zinc-800">
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{agentName || agentId}</span>
          {tab !== 'terminal' && data.files === 'workspace-write' && <button type="button" disabled={progress !== null} onClick={() => uploadInput.current?.click()} title={en ? 'Upload to workspace' : '上传到工作目录'} aria-label={en ? 'Upload to workspace' : '上传到工作目录'} className="inline-flex h-9 w-9 items-center justify-center rounded-md text-zinc-500 disabled:opacity-40"><Upload size={17} /></button>}
          <input ref={uploadInput} type="file" hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file) }} />
          {tabs.filter(item => item.enabled).map(({ key, label, icon: Icon }) => <button type="button" key={key} role="tab" aria-selected={tab === key} title={label} aria-label={label} onClick={() => setTab(key)} className={`inline-flex h-9 w-9 items-center justify-center rounded-md ${tab === key ? 'bg-zinc-100 text-emerald-700 dark:bg-zinc-800 dark:text-emerald-400' : 'text-zinc-500'}`}><Icon size={17} /></button>)}
          <button type="button" onClick={() => setTab(null)} aria-label={en ? 'Close tools' : '关闭工具'} title={en ? 'Close tools' : '关闭工具'} className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800"><X size={18} /></button>
        </header>
        {progress !== null && <div role="status" className="flex items-center gap-2 px-3 py-2 text-xs"><Loader2 size={15} className="animate-spin" /><progress value={progress} max={100} className="min-w-0 flex-1" /><span>{progress}%</span><button onClick={() => transfer.current?.abort()} aria-label={en ? 'Cancel transfer' : '取消传输'} title={en ? 'Cancel transfer' : '取消传输'}><X size={16} /></button></div>}
        {downloadError && <p role="alert" className="px-3 py-2 text-xs text-red-600">{downloadError}</p>}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
          {tab === 'preview' && data.preview_ports.length > 0 && data.files !== 'off' && <div role="tablist" className="mb-3 flex shrink-0 gap-1 border-b border-zinc-200 dark:border-zinc-800">{(['live', 'file'] as const).map(mode => <button key={mode} role="tab" aria-selected={previewMode === mode} onClick={() => setPreviewMode(mode)} className={`px-3 py-2 text-xs ${previewMode === mode ? 'border-b-2 border-emerald-600 text-emerald-700 dark:text-emerald-400' : 'text-zinc-500'}`}>{mode === 'live' ? (en ? 'Development server' : '开发服务') : (en ? 'HTML file' : 'HTML 文件')}</button>)}</div>}
          {tab && data.terminal && (tab === 'terminal' || terminalStarted) && <div hidden={tab !== 'terminal'} className={tab === 'terminal' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}><TerminalPane agentId={agentId} agentName={agentName || agentId} token={token} className="min-h-0 flex-1" compact /></div>}
          {tab === 'preview' && data.preview_ports.length > 0 && (previewMode === 'live' || data.files === 'off') ? <ManagedLivePreview key={data.preview_ports.join(',')} agentId={agentId} token={token} ports={data.preview_ports} en={en} /> : tab && tab !== 'terminal' && <CliWorkspaceExplorer key={refreshEpoch} sessionId={agentId} workspaceRoot="Workspace" workspaceApiBase={apiBase} online accessToken={token} workspaceAccess={data.files === 'workspace-write' ? 'workspace-write' : 'read-only'} zh={!en} previewMode={tab === 'preview'} onDownload={(path, name) => void download(path, name)} />}
        </div>
      </div>
    </dialog>
  </>
}
