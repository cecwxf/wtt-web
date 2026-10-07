'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { FileText, RefreshCw, Save, X } from 'lucide-react'
import { getDesktopBridge, type DesktopHostState } from '@/lib/desktop'
import { useI18n } from '@/lib/i18n-provider'
import { LocalLibrary } from '@/components/ui/local-library'

export function DesktopLocalFiles() {
  const { data: session, status } = useSession()
  const { locale } = useI18n()
  const en = locale === 'en'
  const [native, setNative] = useState<DesktopHostState | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [failed, setFailed] = useState(false)
  const userId = session?.userId
  useEffect(() => {
    const host = getDesktopBridge()?.host
    if (!host) return
    let current = true
    let emitted = false
    const off = host.onState?.(state => { emitted = true; if (current) { setNative(state); setFailed(false) } })
    void host.status().then(state => { if (current && !emitted) setNative(state) }).catch(() => { if (current) setFailed(true) })
    return () => { current = false; off?.() }
  }, [userId])
  if (!getDesktopBridge()?.workspace || status !== 'authenticated') return null
  if (native && (native.protocolVersion ?? 0) < 3) return null
  const ready = !failed && native?.accountVerified && native.userId === userId
  return <section aria-label={en ? 'Local files' : '本机文件'} className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
    {ready ? <AccountFiles key={userId} en={en} /> : <div className="flex items-center justify-between gap-3 text-sm">
      <p role="status">{failed || native?.state === 'unavailable' ? (en ? 'Local account verification failed.' : '本机账号验证失败。') : (en ? 'Waiting for local account verification.' : '等待本机账号验证。')}</p>
      <button title={en ? 'Retry account verification' : '重试账号验证'} aria-label={en ? 'Retry account verification' : '重试账号验证'} disabled={retrying} className="rounded p-2 hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-800" onClick={async () => {
        setRetrying(true)
        try {
          const state = await getDesktopBridge()?.host?.resume?.(session?.accessToken || '')
          if (state) { setNative(state); setFailed(false) }
        } catch { setFailed(true) }
        finally { setRetrying(false) }
      }}><RefreshCw size={16} className={retrying ? 'animate-spin' : ''} /></button>
    </div>}
  </section>
}

function AccountFiles({ en }: { en: boolean }) {
  const [document, setDocument] = useState<{ path: string; content: string; writable: boolean } | null>(null)
  const [content, setContent] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const sequence = useRef(0)
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false; sequence.current++ } }, [])
  const select = useCallback(async (path: string) => {
    if (document && content !== document.content && !window.confirm(en ? 'Discard unsaved changes?' : '放弃未保存的修改？')) return
    const request = ++sequence.current
    setDocument(null); setContent(''); setError(''); setBusy(true)
    try {
      if (/\.(pdf|docx?|xlsx?|pptx?)$/i.test(path)) throw new Error('binary')
      const result = await getDesktopBridge()?.fs.readFile(path)
      if (!active.current || sequence.current !== request) return
      if (!result?.ok || result.content === undefined) throw new Error('read')
      if (result.content.length > 256 * 1024 || result.content.includes('\0')) throw new Error('preview-limit')
      setDocument({ path, content: result.content, writable: result.writable === true })
      setContent(result.content)
    } catch (error) {
      if (active.current && sequence.current === request) setError(error instanceof Error && ['binary', 'preview-limit'].includes(error.message)
        ? (en ? 'This file cannot be edited in the text preview.' : '此文件不支持在文本预览中编辑。')
        : (en ? 'Unable to read the file. Check folder permissions.' : '无法读取文件，请检查目录授权。'))
    } finally { if (active.current && sequence.current === request) setBusy(false) }
  }, [content, document, en])
  return <div className="grid min-w-0 gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
    <div className="min-w-0"><LocalLibrary onFileSelect={select} allowAnalyze={false} onWorkspaceRemoved={path => {
      if (document?.path.startsWith(path + (path.includes('\\') ? '\\' : '/'))) {
        sequence.current++; setDocument(null); setContent(''); setBusy(false)
      }
    }} /></div>
    <div className="min-w-0">
      {error && <p role="alert" className="mb-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {document ? <>
        <div className="mb-2 flex min-w-0 items-center gap-2 text-xs">
          <FileText size={15} className="shrink-0" />
          <span className="min-w-0 flex-1 break-all" title={document.path}>{document.path.split(/[\\/]/).pop()}</span>
          {!document.writable && <span>{en ? 'Read only' : '只读'}</span>}
          <button title={en ? 'Save file' : '保存文件'} aria-label={en ? 'Save file' : '保存文件'} disabled={busy || !document.writable || content === document.content} className="rounded p-2 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800" onClick={async () => {
            const request = sequence.current
            setBusy(true); setError('')
            try {
              const result = await getDesktopBridge()?.fs.writeFile(document.path, content)
              if (!active.current || sequence.current !== request) return
              if (!result?.ok) throw new Error('write')
              setDocument({ ...document, content })
            } catch { if (active.current && sequence.current === request) setError(en ? 'Unable to save. Check write permission.' : '无法保存，请检查写入权限。') }
            finally { if (active.current && sequence.current === request) setBusy(false) }
          }}><Save size={16} /></button>
          <button title={en ? 'Close file' : '关闭文件'} aria-label={en ? 'Close file' : '关闭文件'} className="rounded p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={() => {
            if (content !== document.content && !window.confirm(en ? 'Discard unsaved changes?' : '放弃未保存的修改？')) return
            sequence.current++; setDocument(null); setContent(''); setBusy(false)
          }}><X size={16} /></button>
        </div>
        <textarea aria-label={en ? 'File content' : '文件内容'} value={content} readOnly={!document.writable || busy} onChange={event => setContent(event.target.value)} spellCheck={false} className="h-72 w-full resize-y rounded border border-zinc-200 bg-zinc-50 p-3 font-mono text-xs leading-5 outline-none focus:border-emerald-600 dark:border-zinc-700 dark:bg-zinc-900" />
      </> : <p role="status" className="py-4 text-sm text-zinc-500">{busy ? (en ? 'Reading file...' : '正在读取文件…') : (en ? 'No file selected' : '未选择文件')}</p>}
    </div>
  </div>
}
