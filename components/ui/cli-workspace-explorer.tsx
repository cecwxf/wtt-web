'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  ImageIcon,
  Loader2,
  Minus,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  WrapText,
  X,
} from 'lucide-react'

import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'

const WorkspaceCodePreview = dynamic(
  () => import('@/components/ui/workspace-code-preview').then((module) => module.WorkspaceCodePreview),
  { ssr: false, loading: () => <div className="grid min-h-40 place-items-center bg-[#171c22] text-[10px] text-zinc-500">Loading syntax colors...</div> },
)

const PdfViewer = dynamic(
  () => import('@/components/ui/pdf-viewer'),
  { ssr: false, loading: () => <div className="grid min-h-[32rem] place-items-center bg-slate-100 text-[10px] text-slate-400 dark:bg-zinc-900"><Loader2 className="h-5 w-5 animate-spin text-sky-500" /></div> },
)

interface WorkspaceEntry {
  name: string
  path: string
  type: 'directory' | 'file' | 'symlink'
  size?: number
  modified_at?: string
}

interface WorkspaceListResponse {
  root: string
  path: string
  entries: WorkspaceEntry[]
  truncated?: boolean
}

interface WorkspaceReadResponse {
  path: string
  name: string
  size: number
  modified_at?: string
  content_type: string
  truncated?: boolean
  previewable: boolean
  preview_kind?: 'text' | 'image' | 'pdf' | 'docx'
  preview_error?: string
  streamable?: boolean
  content?: string
  content_base64?: string
  content_html?: string
  editable?: boolean
  edit_limit_bytes?: number
  content_etag?: string
}

interface CliWorkspaceExplorerProps {
  sessionId: string
  workspaceRoot: string
  online: boolean
  accessToken?: string
  workspaceAccess: 'read-only' | 'workspace-write' | 'full-access'
  zh: boolean
}

function formatBytes(value?: number) {
  const bytes = Number(value || 0)
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] || character)
}

function documentPreviewHtml(content: string, title: string, fontSize: number) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><title>${escapeHtml(title)}</title><style>*{box-sizing:border-box}html{background:#dfe3e1}body{width:min(820px,calc(100% - 32px));min-height:calc(100vh - 32px);margin:16px auto;padding:54px 62px;color:#202824;background:#fff;box-shadow:0 8px 32px rgba(31,43,38,.15);font:${fontSize}px/1.72 Georgia,'Times New Roman',serif}p{margin:0 0 1em}h1,h2,h3{line-height:1.25;color:#16221d}table{max-width:100%;border-collapse:collapse}td,th{border:1px solid #d9ddd9;padding:6px 8px}img{max-width:100%}@media(max-width:640px){body{width:100%;margin:0;padding:28px 24px;box-shadow:none}}</style></head><body>${content}</body></html>`
}

interface FileVisual {
  label: string
  language?: string
  badge: string
}

const CODE_LANGUAGES: Record<string, string> = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx',
  ts: 'typescript', tsx: 'tsx', py: 'python', sh: 'bash', bash: 'bash', zsh: 'bash',
  json: 'json', css: 'css', scss: 'scss', less: 'less', html: 'markup', htm: 'markup',
  xml: 'markup', yaml: 'yaml', yml: 'yaml', md: 'markdown', mdx: 'markdown', sql: 'sql',
  rs: 'rust', go: 'go', java: 'java', c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp',
  hpp: 'cpp', rb: 'ruby', php: 'php', swift: 'swift', kt: 'kotlin', kts: 'kotlin', toml: 'toml',
}

function fileVisual(name: string, directory = false): FileVisual {
  if (directory) return { label: 'DIR', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300' }
  const extension = name.includes('.') ? name.split('.').pop()?.toLowerCase() || '' : ''
  if (CODE_LANGUAGES[extension]) return { label: extension.slice(0, 4).toUpperCase(), language: CODE_LANGUAGES[extension], badge: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950/70 dark:text-cyan-300' }
  if (extension === 'pdf') return { label: 'PDF', badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300' }
  if (extension === 'docx' || extension === 'doc') return { label: 'DOC', badge: 'bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300' }
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'].includes(extension)) return { label: 'IMG', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300' }
  if (['csv', 'tsv', 'xlsx', 'xls', 'parquet'].includes(extension)) return { label: 'DATA', badge: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/70 dark:text-yellow-300' }
  return { label: extension ? extension.slice(0, 4).toUpperCase() : 'FILE', badge: 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-300' }
}

function loadStoredNumber(key: string, fallback: number) {
  if (typeof window === 'undefined') return fallback
  const value = Number(window.localStorage.getItem(key))
  return Number.isFinite(value) && value >= 9 && value <= 20 ? value : fallback
}

async function readApi<T>(url: string, accessToken?: string): Promise<T> {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  })
  if (response.ok) return response.json() as Promise<T>
  const body = await response.json().catch(() => null)
  const detail = body?.detail
  throw new Error(typeof detail === 'string' ? detail : body?.message || `Request failed (${response.status})`)
}

export function CliWorkspaceExplorer({ sessionId, workspaceRoot, online, accessToken, workspaceAccess, zh }: CliWorkspaceExplorerProps) {
  const [directories, setDirectories] = useState<Record<string, WorkspaceEntry[]>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<WorkspaceReadResponse | null>(null)
  const [fileLoading, setFileLoading] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [fontSize, setFontSize] = useState(() => loadStoredNumber('wtt-cli-explorer-font-size', 11))
  const [wrapLines, setWrapLines] = useState(() => typeof window === 'undefined' || window.localStorage.getItem('wtt-cli-explorer-wrap') !== '0')
  const [imageFit, setImageFit] = useState(() => typeof window === 'undefined' || window.localStorage.getItem('wtt-cli-explorer-image-fit') !== 'actual')
  const generation = useRef(0)

  const changeFontSize = useCallback((delta: number) => {
    setFontSize((current) => {
      const next = Math.max(9, Math.min(20, current + delta))
      window.localStorage.setItem('wtt-cli-explorer-font-size', String(next))
      return next
    })
  }, [])

  const toggleWrap = useCallback(() => {
    setWrapLines((current) => {
      window.localStorage.setItem('wtt-cli-explorer-wrap', current ? '0' : '1')
      return !current
    })
  }, [])

  const toggleImageFit = useCallback(() => {
    setImageFit((current) => {
      window.localStorage.setItem('wtt-cli-explorer-image-fit', current ? 'actual' : 'fit')
      return !current
    })
  }, [])

  const loadDirectory = useCallback(async (relativePath = '', force = false) => {
    if (!online || !accessToken || (!force && directories[relativePath])) return
    const currentGeneration = generation.current
    setLoadingPaths((current) => new Set(current).add(relativePath))
    setError('')
    try {
      const query = new URLSearchParams({ path: relativePath || '.' })
      const result = await readApi<WorkspaceListResponse>(
        `${CLIENT_WTT_API_BASE}/cli-sessions/${encodeURIComponent(sessionId)}/workspace/list?${query}`,
        accessToken,
      )
      if (generation.current !== currentGeneration) return
      setDirectories((current) => ({ ...current, [relativePath]: result.entries || [] }))
    } catch (requestError) {
      if (generation.current === currentGeneration) setError(requestError instanceof Error ? requestError.message : String(requestError))
    } finally {
      if (generation.current === currentGeneration) {
        setLoadingPaths((current) => {
          const next = new Set(current)
          next.delete(relativePath)
          return next
        })
      }
    }
  }, [accessToken, directories, online, sessionId])

  useEffect(() => {
    generation.current += 1
    setDirectories({})
    setExpanded(new Set())
    setSelected(null)
    setError('')
    setEditing(false)
    setEditContent('')
  }, [sessionId, workspaceRoot])

  useEffect(() => {
    if (online && accessToken && !directories['']) void loadDirectory('')
  }, [accessToken, directories, loadDirectory, online])

  const toggleDirectory = useCallback(async (entry: WorkspaceEntry) => {
    const opening = !expanded.has(entry.path)
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(entry.path)) next.delete(entry.path)
      else next.add(entry.path)
      return next
    })
    if (opening) await loadDirectory(entry.path)
  }, [expanded, loadDirectory])

  const openFile = useCallback(async (entry: WorkspaceEntry) => {
    if (!online || !accessToken) return
    const currentGeneration = generation.current
    setFileLoading(true)
    setError('')
    try {
      const query = new URLSearchParams({ path: entry.path })
      const result = await readApi<WorkspaceReadResponse>(
        `${CLIENT_WTT_API_BASE}/cli-sessions/${encodeURIComponent(sessionId)}/workspace/read?${query}`,
        accessToken,
      )
      if (generation.current === currentGeneration) {
        setSelected(result)
        setEditing(false)
        setEditContent('')
      }
    } catch (requestError) {
      if (generation.current === currentGeneration) setError(requestError instanceof Error ? requestError.message : String(requestError))
    } finally {
      if (generation.current === currentGeneration) setFileLoading(false)
    }
  }, [accessToken, online, sessionId])

  const refresh = useCallback(() => {
    setDirectories({})
    setExpanded(new Set())
    setSelected(null)
    void loadDirectory('', true)
  }, [loadDirectory])

  const closeFile = useCallback(() => {
    if (editing && editContent !== (selected?.content || '') && !window.confirm(zh ? '放弃未保存的修改？' : 'Discard unsaved changes?')) return
    setSelected(null)
    setEditing(false)
    setEditContent('')
    setError('')
  }, [editContent, editing, selected?.content, zh])

  const beginEdit = useCallback(() => {
    if (!selected?.editable || typeof selected.content !== 'string' || workspaceAccess === 'read-only') return
    setEditing(true)
    setEditContent(selected.content)
    setError('')
  }, [selected, workspaceAccess])

  const cancelEdit = useCallback(() => {
    if (editContent !== (selected?.content || '') && !window.confirm(zh ? '放弃未保存的修改？' : 'Discard unsaved changes?')) return
    setEditing(false)
    setEditContent('')
    setError('')
  }, [editContent, selected?.content, zh])

  const saveEdit = useCallback(async () => {
    if (!selected?.editable || typeof selected.content !== 'string' || !editing || saving || !accessToken) return
    if (workspaceAccess === 'read-only') {
      setError(zh ? '保存前请选择 Workspace Write 或 Full Access。' : 'Select Workspace Write or Full Access before saving.')
      return
    }
    if (editContent === selected.content) return
    setSaving(true)
    setError('')
    try {
      const response = await fetch(`${CLIENT_WTT_API_BASE}/cli-sessions/${encodeURIComponent(sessionId)}/workspace/write`, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          path: selected.path,
          content: editContent,
          expected_modified_at: selected.modified_at,
          expected_etag: selected.content_etag || '',
          workspace_access: workspaceAccess,
        }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        const detail = body?.detail
        throw new Error(typeof detail === 'string' ? detail : body?.message || `Save failed (${response.status})`)
      }
      const saved = await response.json() as WorkspaceReadResponse
      setSelected(saved)
      setEditing(false)
      setEditContent('')
      const separator = saved.path.lastIndexOf('/')
      const parent = separator >= 0 ? saved.path.slice(0, separator) : ''
      setDirectories((current) => {
        const next = { ...current }
        delete next[parent]
        return next
      })
      void loadDirectory(parent, true)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError))
    } finally {
      setSaving(false)
    }
  }, [accessToken, editContent, editing, loadDirectory, saving, selected, sessionId, workspaceAccess, zh])

  const rootName = useMemo(() => workspaceRoot.split('/').filter(Boolean).at(-1) || workspaceRoot || 'workspace', [workspaceRoot])
  const selectedVisual = selected ? fileVisual(selected.name) : null
  const selectedPdfUrl = selected?.preview_kind === 'pdf' && selected.streamable
    ? `${CLIENT_WTT_API_BASE}/cli-sessions/${encodeURIComponent(sessionId)}/workspace/content?${new URLSearchParams({ path: selected.path })}`
    : ''

  const renderEntries = (parentPath = '', depth = 0) => {
    const entries = directories[parentPath] || []
    if (!entries.length && !loadingPaths.has(parentPath)) {
      return depth ? <p className="py-2 pl-8 text-[10px] text-slate-400 dark:text-zinc-600">{zh ? '空目录' : 'Empty directory'}</p> : null
    }
    return entries.map((entry) => {
      const directory = entry.type === 'directory'
      const visual = fileVisual(entry.name, directory)
      const isExpanded = expanded.has(entry.path)
      const isLoading = loadingPaths.has(entry.path)
      return (
        <div key={entry.path}>
          <button
            type="button"
            className="group flex w-full min-w-0 items-center gap-1.5 rounded-lg py-1.5 pr-2 text-left text-[11px] text-slate-700 hover:bg-sky-50 hover:text-sky-800 dark:text-zinc-300 dark:hover:bg-sky-950/35 dark:hover:text-sky-200"
            style={{ paddingLeft: `${8 + depth * 14}px` }}
            onClick={() => directory ? void toggleDirectory(entry) : entry.type === 'file' ? void openFile(entry) : undefined}
            disabled={entry.type === 'symlink' || fileLoading}
            title={entry.path}
          >
            <span className="grid h-4 w-4 shrink-0 place-items-center text-slate-400">
              {directory ? (isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />) : null}
            </span>
            <span className={`min-w-7 shrink-0 rounded px-1 py-0.5 text-center font-mono text-[7px] font-bold leading-none ${visual.badge}`}>{visual.label}</span>
            <span className="min-w-0 flex-1 truncate">{entry.name}</span>
            {!directory && <span className="shrink-0 font-mono text-[8px] text-slate-400 opacity-0 group-hover:opacity-100">{formatBytes(entry.size)}</span>}
          </button>
          {directory && isExpanded ? renderEntries(entry.path, depth + 1) : null}
        </div>
      )
    })
  }

  if (!workspaceRoot) return <div className="py-10 text-center text-xs text-slate-400">{zh ? '该会话没有 Workspace 路径' : 'This session has no workspace path.'}</div>
  if (!online) return <div className="py-10 text-center text-xs leading-5 text-slate-400">{zh ? 'Agent 离线。上线后可浏览原主机 Workspace。' : 'Agent is offline. Reconnect it to explore the original workspace.'}</div>

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex items-center gap-2 border-b border-slate-200 pb-3 dark:border-zinc-800">
        {selected ? (
          <button type="button" onClick={closeFile} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-zinc-800" title={zh ? '返回目录' : 'Back to files'}><ArrowLeft className="h-3.5 w-3.5" /></button>
        ) : <Folder className="h-4 w-4 text-amber-500" />}
        <div className="min-w-0 flex-1"><strong className="block truncate text-xs">{selected?.name || rootName}</strong><span className="block truncate font-mono text-[9px] text-slate-400" title={selected?.path || workspaceRoot}>{selected?.path || workspaceRoot}</span></div>
        {!selected && <button type="button" onClick={refresh} disabled={loadingPaths.has('')} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-zinc-800" title={zh ? '刷新' : 'Refresh'}><RefreshCw className={`h-3.5 w-3.5 ${loadingPaths.has('') ? 'animate-spin' : ''}`} /></button>}
      </div>

      {error && <div className="mb-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] leading-4 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/25 dark:text-rose-300">{error}</div>}
      {fileLoading ? <div className="grid flex-1 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-sky-500" /></div> : selected ? (
        <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div className="sticky top-0 z-10 flex min-h-10 items-center justify-between gap-2 border-b border-slate-100 bg-white/95 px-2 py-1.5 text-[9px] text-slate-400 backdrop-blur dark:border-zinc-900 dark:bg-zinc-950/95">
            <div className="flex min-w-0 items-center gap-2">
              {selectedVisual ? <span className={`min-w-8 shrink-0 rounded px-1 py-1 text-center font-mono text-[7px] font-bold leading-none ${selectedVisual.badge}`}>{selectedVisual.label}</span> : null}
              <span className="truncate">{selected.content_type}</span>
              <span className="shrink-0 font-mono">{formatBytes(selected.size)}</span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {(selected.preview_kind === 'text' || selected.preview_kind === 'docx') ? <>
                <button type="button" onClick={() => changeFontSize(-1)} className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 dark:border-zinc-800 dark:hover:border-sky-800 dark:hover:bg-sky-950/40" title={zh ? '缩小字体' : 'Decrease font size'}><Minus className="h-3 w-3" /></button>
                <span className="min-w-8 text-center font-mono text-[8px]">{fontSize}px</span>
                <button type="button" onClick={() => changeFontSize(1)} className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 dark:border-zinc-800 dark:hover:border-sky-800 dark:hover:bg-sky-950/40" title={zh ? '放大字体' : 'Increase font size'}><Plus className="h-3 w-3" /></button>
              </> : null}
              {selected.preview_kind === 'text' ? <button type="button" onClick={toggleWrap} className={`flex h-7 items-center gap-1 rounded-md border px-2 text-[8px] font-semibold ${wrapLines ? 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300' : 'border-slate-200 dark:border-zinc-800'}`} title={zh ? '自动换行' : 'Wrap long lines'}><WrapText className="h-3 w-3" />{wrapLines ? (zh ? '换行' : 'Wrap') : (zh ? '不换行' : 'No wrap')}</button> : null}
              {selected.preview_kind === 'image' ? <button type="button" onClick={toggleImageFit} className={`h-7 rounded-md border px-2 text-[8px] font-semibold ${imageFit ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' : 'border-slate-200 dark:border-zinc-800'}`}>{imageFit ? 'Fit' : 'Actual'}</button> : null}
              {selected.editable && !editing ? <button type="button" onClick={beginEdit} disabled={workspaceAccess === 'read-only'} className="flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-[8px] font-semibold hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-800 dark:hover:border-sky-800 dark:hover:bg-sky-950/40" title={workspaceAccess === 'read-only' ? (zh ? '请选择 Workspace Write 或 Full Access' : 'Select Workspace Write or Full Access') : (zh ? '编辑文件' : 'Edit file')}><Pencil className="h-3 w-3" />Edit</button> : null}
              {editing ? <>
                <button type="button" onClick={cancelEdit} disabled={saving} className="flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-[8px] font-semibold hover:bg-slate-50 disabled:opacity-40 dark:border-zinc-800 dark:hover:bg-zinc-900"><X className="h-3 w-3" />{zh ? '取消' : 'Cancel'}</button>
                <button type="button" onClick={() => void saveEdit()} disabled={saving || editContent === (selected.content || '')} className="flex h-7 items-center gap-1 rounded-md border border-sky-300 bg-sky-50 px-2 text-[8px] font-semibold text-sky-700 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300"><Save className={`h-3 w-3 ${saving ? 'animate-pulse' : ''}`} />{saving ? (zh ? '保存中' : 'Saving') : (zh ? '保存' : 'Save')}</button>
              </> : null}
            </div>
          </div>
          {editing ? (
            <textarea
              value={editContent}
              onChange={(event) => setEditContent(event.target.value)}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
                  event.preventDefault()
                  void saveEdit()
                }
              }}
              spellCheck={false}
              autoFocus
              className="block min-h-[calc(100vh-13rem)] w-full resize-none border-0 bg-[#171c22] px-4 py-3 font-mono leading-6 text-zinc-200 caret-cyan-300 outline-none ring-inset focus:ring-1 focus:ring-cyan-700"
              style={{ fontSize: `${fontSize}px`, tabSize: 2, whiteSpace: wrapLines ? 'pre-wrap' : 'pre', overflowWrap: wrapLines ? 'anywhere' : 'normal' }}
              aria-label={zh ? `编辑 ${selected.name}` : `Edit ${selected.name}`}
            />
          ) : selected.preview_kind === 'pdf' && selectedPdfUrl ? (
            <div className="min-h-[32rem] bg-zinc-700 p-3"><PdfViewer url={selectedPdfUrl} authorization={accessToken ? `Bearer ${accessToken}` : undefined} expanded /></div>
          ) : selected.preview_kind === 'docx' && selected.content_html !== undefined ? (
            <iframe srcDoc={documentPreviewHtml(selected.content_html, selected.name, fontSize)} sandbox="" title={selected.name} className="h-[calc(100vh-13rem)] min-h-[32rem] w-full border-0 bg-slate-200" />
          ) : selected.content_base64 ? (
            <div className="min-h-56 overflow-auto bg-[linear-gradient(45deg,#d8ddda_25%,transparent_25%),linear-gradient(-45deg,#d8ddda_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#d8ddda_75%),linear-gradient(-45deg,transparent_75%,#d8ddda_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0] p-4">
              {/* The source is a runtime data URL, so Next Image optimization cannot apply. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`data:${selected.content_type};base64,${selected.content_base64}`} alt={selected.name} className={`mx-auto block h-auto rounded shadow-xl ${imageFit ? 'max-h-[calc(100vh-16rem)] max-w-full object-contain' : 'max-w-none'}`} />
            </div>
          ) : selected.previewable && selected.content !== undefined && selectedVisual?.language ? (
            <WorkspaceCodePreview
              content={selected.content}
              fontSize={fontSize}
              language={selectedVisual.language}
              wrapLines={wrapLines}
            />
          ) : selected.previewable && selected.content !== undefined ? <pre className={`${wrapLines ? 'min-w-0 whitespace-pre-wrap break-words' : 'min-w-max whitespace-pre'} p-3 font-mono leading-6 text-slate-800 dark:text-zinc-200`} style={{ fontSize: `${fontSize}px` }}>{selected.content}</pre> : <div className="grid min-h-40 place-items-center px-5 text-center text-[11px] leading-5 text-slate-400"><div><File className="mx-auto mb-2 h-6 w-6" />{selected.preview_error || (zh ? '该二进制文件不支持在线预览' : 'Binary preview is not available for this file.')}</div></div>}
          {selected.truncated && <div className="sticky bottom-0 border-t border-amber-200 bg-amber-50 px-3 py-2 text-[9px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/70 dark:text-amber-200">{zh ? '文件较大，仅显示前 2 MiB。' : 'Large file: showing the first 2 MiB.'}</div>}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto pr-1">
          {loadingPaths.has('') && !directories[''] ? <div className="grid min-h-32 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-sky-500" /></div> : renderEntries()}
          {directories['']?.length === 0 && !loadingPaths.has('') ? <div className="py-10 text-center text-xs text-slate-400"><ImageIcon className="mx-auto mb-2 h-5 w-5" />{zh ? 'Workspace 为空' : 'Workspace is empty'}</div> : null}
        </div>
      )}
    </div>
  )
}
