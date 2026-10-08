'use client'

import { useEffect, useRef, useState } from 'react'
import { FileUp, GitFork, Loader2, Undo2, X } from 'lucide-react'
import { getDesktopBridge } from '@/lib/desktop'
import { parseHistoryArchive, type HistoryArchive } from '@/lib/desktop-history-import'
import type { AccountHost } from '@/lib/desktop-hosts'

export function DesktopHistoryImport({ token, hosts, en, onClose }: { token: string; hosts: AccountHost[]; en: boolean; onClose(): void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const current = useRef(true)
  const [archive, setArchive] = useState<HistoryArchive>()
  const [agentId, setAgentId] = useState('')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ topic_id: string; agent_id: string }>()
  const [previewLimit, setPreviewLimit] = useState(40)
  const [nativeBound, setNativeBound] = useState(false)
  const [localHostId, setLocalHostId] = useState('')
  const targets = hosts.filter(host => host.status !== 'revoked').flatMap(host => host.agents.map(agent => ({ ...agent, host: host.display_name, hostId: host.host_id })))
  const destination = targets.find(agent => agent.agent_id === agentId)
  const bridge = getDesktopBridge()?.host
  const nativeAvailable = Boolean(bridge?.nativeContextImportSupported && bridge.importNativeContext
    && destination?.adapter === 'codex' && destination.hostId === localHostId && archive?.source_format === 'codex')
  useEffect(() => { current.current = true; dialog.current?.showModal(); return () => { current.current = false } }, [])
  useEffect(() => {
    let cancelled = false
    void getDesktopBridge()?.host?.status().then(state => { if (!cancelled) setLocalHostId(state.hostId || '') }).catch(() => {})
    return () => { cancelled = true }
  }, [])
  const pick = async () => {
    if (busy) return
    setBusy(true); setError(''); setArchive(undefined); setConsent(false); setResult(undefined); setPreviewLimit(40); setNativeBound(false)
    try {
      const fs = getDesktopBridge()?.fs
      if (!fs) throw new Error(en ? 'Use WTT Desktop to select a local transcript.' : '请在 WTT Desktop 选择本地记录。')
      const selected = await fs.openFileDialog({ filters: [{ name: 'Transcript', extensions: ['json', 'jsonl', 'ndjson'] }] })
      if (!current.current || selected.canceled) return
      const file = selected.files[0]
      if (!file || file.size > 16 * 1024 * 1024) throw new Error(en ? 'Transcript limit: 16 MiB.' : '记录文件上限：16 MiB。')
      const read = await fs.readFile(file.path)
      if (!read.ok || typeof read.content !== 'string') throw new Error(read.error || 'Transcript read failed')
      const parsed = await parseHistoryArchive(read.content, file.name)
      if (current.current) setArchive(parsed)
    } catch (cause) { if (current.current) setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { if (current.current) setBusy(false) }
  }
  const nativeImport = async (rollback = false) => {
    if (busy || !result || !archive || !destination || !bridge?.importNativeContext || !nativeAvailable) return
    setBusy(true); setError('')
    try {
      const state = await bridge.runtimeStatus?.()
      if (state?.state !== 'stopped') throw new Error(en ? 'Stop local Agents in Settings first.' : '请先在设置中停止本机 Agent。')
      await bridge.discoverAgents?.()
      const imported = await bridge.importNativeContext({ profileId: destination.profile_id, topicId: result.topic_id,
        sourceSha256: archive.source_sha256, rollback })
      if (imported && current.current) setNativeBound(imported.state === 'bound')
    } catch (cause) { if (current.current) setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { if (current.current) setBusy(false) }
  }
  const upload = async () => {
    if (!archive || !agentId || !consent || busy) return
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/wtt/hosts/history-import', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agentId, source_format: archive.source_format, source_sha256: archive.source_sha256,
          title: archive.title, messages: archive.messages, confirmed: true }), signal: AbortSignal.timeout(30000) })
      if (!response.ok) throw new Error(`History import failed (${response.status})`)
      const receipt = await response.json()
      if (!receipt.topic_id || receipt.agent_id !== agentId) throw new Error('Invalid import receipt')
      if (current.current) setResult(receipt)
    } catch (cause) { if (current.current) setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { if (current.current) setBusy(false) }
  }
  return <dialog ref={dialog} onCancel={event => { if (busy) event.preventDefault(); else onClose() }} aria-labelledby="history-import-title"
    className="m-auto w-[min(640px,calc(100vw-32px))] max-w-none rounded-lg border border-zinc-200 bg-white p-0 text-zinc-900 backdrop:bg-black/40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
    <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-700"><h2 id="history-import-title" className="text-base font-semibold">{en ? 'Import conversation' : '导入会话'}</h2>
      <button disabled={busy} onClick={onClose} aria-label={en ? 'Close' : '关闭'} title={en ? 'Close' : '关闭'} className="p-1 disabled:opacity-40"><X size={18} /></button></header>
    <div className="space-y-4 p-4">
      <button disabled={busy} onClick={() => void pick()} className="flex items-center gap-2 rounded border border-zinc-300 px-3 py-2 text-sm disabled:opacity-40 dark:border-zinc-600"><FileUp size={16} />{en ? 'Select transcript' : '选择记录文件'}</button>
      {archive && <>
        <div className="text-sm"><strong className="break-words">{archive.title}</strong><p className="text-xs text-zinc-500">{archive.source_format} · {archive.messages.length} {en ? 'text messages' : '条文本消息'} · {archive.ignored} {en ? 'non-chat entries excluded' : '条非对话记录未导入'}</p></div>
        <label className="block text-sm">{en ? 'Destination Agent' : '目标 Agent'}<select value={agentId} disabled={busy || Boolean(result)} onChange={event => { setAgentId(event.target.value); setConsent(false) }} className="mt-1 w-full rounded border border-zinc-300 bg-transparent p-2 dark:border-zinc-600"><option value="">{en ? 'Select Agent' : '选择 Agent'}</option>{targets.map(agent => <option key={agent.agent_id} value={agent.agent_id}>{agent.display_name} · {agent.adapter} · {agent.host}</option>)}</select></label>
        <div className="max-h-[35vh] space-y-3 overflow-auto border-y border-zinc-200 py-3 dark:border-zinc-700">{archive.messages.slice(0, previewLimit).map((message, index) => <div key={index} className="text-xs"><p className="mb-1 font-semibold text-zinc-500">{message.role === 'user' ? (en ? 'User' : '用户') : (en ? 'Assistant' : '助手')}</p><p className="whitespace-pre-wrap break-words">{message.content}</p></div>)}{previewLimit < archive.messages.length && <button onClick={() => setPreviewLimit(value => value + 40)} className="text-xs text-emerald-700 dark:text-emerald-400">{en ? 'Show more messages' : '显示更多消息'} ({previewLimit}/{archive.messages.length})</button>}</div>
        <p className="text-xs text-zinc-500">{nativeBound ? (en ? 'Native context bound to an independent Codex fork. The original session is unchanged. Local Agents remain stopped.' : '原生上下文已绑定到独立 Codex 分叉，原会话保持不变。本机 Agent 仍处于停止状态。') : (en ? 'Text snapshot only. No tools or attachments are imported; the old native session is not resumed. Future messages use a new Agent context.' : '仅导入文本快照，不导入工具或附件，不接管旧原生会话；后续消息使用新的 Agent 上下文。')}</p>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={consent} disabled={busy || Boolean(result)} onChange={event => setConsent(event.target.checked)} className="mt-1" />{en ? 'I confirm uploading this preview to my WTT account as a new private conversation.' : '确认将上述预览上传到我的 WTT 账号，建立新的私有会话。'}</label>
      </>}
      {error && <p role="alert" className="break-words text-sm text-red-600 dark:text-red-400">{error}</p>}
      {result && nativeAvailable && <div className="flex flex-wrap gap-2">
        <button disabled={busy || nativeBound} onClick={() => void nativeImport()} className="inline-flex items-center gap-2 rounded border border-zinc-300 px-3 py-2 text-sm disabled:opacity-40 dark:border-zinc-600"><GitFork size={16} />{en ? 'Continue native context' : '延续原生上下文'}</button>
        {nativeBound && <button disabled={busy} onClick={() => void nativeImport(true)} className="inline-flex items-center gap-2 rounded border border-zinc-300 px-3 py-2 text-sm disabled:opacity-40 dark:border-zinc-600"><Undo2 size={16} />{en ? 'Restore text only' : '回退为文本快照'}</button>}
      </div>}
      {result ? <a aria-disabled={busy} onClick={event => { if (busy) event.preventDefault() }} className={`inline-flex rounded bg-emerald-700 px-3 py-2 text-sm text-white ${busy ? 'pointer-events-none opacity-40' : ''}`} href={`/desktop?agentId=${encodeURIComponent(result.agent_id)}&topic=${encodeURIComponent(result.topic_id)}`}>{en ? 'Open imported conversation' : '打开导入会话'}</a>
        : <button disabled={!archive || !agentId || !consent || busy} onClick={() => void upload()} className="inline-flex items-center gap-2 rounded bg-emerald-700 px-3 py-2 text-sm text-white disabled:opacity-40">{busy && <Loader2 size={16} className="animate-spin" />}{en ? 'Import' : '导入'}</button>}
    </div>
  </dialog>
}
