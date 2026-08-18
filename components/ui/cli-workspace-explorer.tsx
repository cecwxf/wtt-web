'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  File,
  FileText,
  Folder,
  ImageIcon,
  Loader2,
  RefreshCw,
} from 'lucide-react'

import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'

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
  content?: string
  content_base64?: string
}

interface CliWorkspaceExplorerProps {
  sessionId: string
  workspaceRoot: string
  online: boolean
  accessToken?: string
  zh: boolean
}

function formatBytes(value?: number) {
  const bytes = Number(value || 0)
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
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

export function CliWorkspaceExplorer({ sessionId, workspaceRoot, online, accessToken, zh }: CliWorkspaceExplorerProps) {
  const [directories, setDirectories] = useState<Record<string, WorkspaceEntry[]>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<WorkspaceReadResponse | null>(null)
  const [fileLoading, setFileLoading] = useState(false)
  const [error, setError] = useState('')
  const generation = useRef(0)

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
      if (generation.current === currentGeneration) setSelected(result)
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

  const rootName = useMemo(() => workspaceRoot.split('/').filter(Boolean).at(-1) || workspaceRoot || 'workspace', [workspaceRoot])

  const renderEntries = (parentPath = '', depth = 0) => {
    const entries = directories[parentPath] || []
    if (!entries.length && !loadingPaths.has(parentPath)) {
      return depth ? <p className="py-2 pl-8 text-[10px] text-slate-400 dark:text-zinc-600">{zh ? '空目录' : 'Empty directory'}</p> : null
    }
    return entries.map((entry) => {
      const directory = entry.type === 'directory'
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
            {directory ? <Folder className="h-3.5 w-3.5 shrink-0 fill-amber-300 text-amber-500" /> : <FileText className="h-3.5 w-3.5 shrink-0 text-sky-500" />}
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
          <button type="button" onClick={() => setSelected(null)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-zinc-800" title={zh ? '返回目录' : 'Back to files'}><ArrowLeft className="h-3.5 w-3.5" /></button>
        ) : <Folder className="h-4 w-4 text-amber-500" />}
        <div className="min-w-0 flex-1"><strong className="block truncate text-xs">{selected?.name || rootName}</strong><span className="block truncate font-mono text-[9px] text-slate-400" title={selected?.path || workspaceRoot}>{selected?.path || workspaceRoot}</span></div>
        {!selected && <button type="button" onClick={refresh} disabled={loadingPaths.has('')} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-zinc-800" title={zh ? '刷新' : 'Refresh'}><RefreshCw className={`h-3.5 w-3.5 ${loadingPaths.has('') ? 'animate-spin' : ''}`} /></button>}
      </div>

      {error && <div className="mb-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] leading-4 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/25 dark:text-rose-300">{error}</div>}
      {fileLoading ? <div className="grid flex-1 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-sky-500" /></div> : selected ? (
        <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-[9px] text-slate-400 dark:border-zinc-900"><span>{selected.content_type}</span><span>{formatBytes(selected.size)}</span></div>
          {selected.content_base64 ? (
            // The source is a runtime data URL, so Next Image optimization cannot apply.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`data:${selected.content_type};base64,${selected.content_base64}`} alt={selected.name} className="h-auto max-w-full object-contain p-2" />
          ) : selected.previewable && selected.content !== undefined ? <pre className="min-w-max whitespace-pre p-3 font-mono text-[10px] leading-5 text-slate-800 dark:text-zinc-200">{selected.content}</pre> : <div className="grid min-h-40 place-items-center px-5 text-center text-[11px] leading-5 text-slate-400"><div><File className="mx-auto mb-2 h-6 w-6" />{zh ? '该二进制文件不支持在线预览' : 'Binary preview is not available for this file.'}</div></div>}
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
