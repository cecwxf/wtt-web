'use client'

import { ChevronRight, Download, FilePlus, FileText, Folder, FolderPlus, Loader2, Pencil, RefreshCw, Trash2, Upload } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'

type WorkspaceEntry = {
  name: string
  path: string
  type: 'directory' | 'file' | 'symlink'
  size?: number
  mtime?: string
}

type WorkspaceListResponse = {
  base_path: string
  path: string
  entries: WorkspaceEntry[]
}

type OperationState = {
  kind: 'upload' | 'download' | 'mkdir' | 'touch' | 'rename' | 'delete'
  label: string
  progress?: number
} | null

interface SandboxWorkspacePanelProps {
  agentId: string
  accessToken?: string
}

function formatBytes(value?: number): string {
  const bytes = Number(value || 0)
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let idx = 0
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024
    idx += 1
  }
  return `${size.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`
}

function parentPath(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx > 0 ? path.slice(0, idx) : path
}

function upsertEntry(entries: WorkspaceEntry[], entry: WorkspaceEntry): WorkspaceEntry[] {
  const next = entries.filter((item) => item.path !== entry.path)
  next.push(entry)
  return next.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

function downloadBlob(filename: string, contentBase64: string, contentType = 'application/octet-stream'): void {
  const binary = atob(contentBase64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  const url = URL.createObjectURL(new Blob([bytes], { type: contentType }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function fileToBase64(file: File, onProgress: (progress: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('failed to read file'))
    reader.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.min(15, Math.round((event.loaded / event.total) * 15)))
      }
    }
    reader.onload = () => {
      const value = String(reader.result || '')
      onProgress(15)
      resolve(value.includes(',') ? value.split(',').pop() || '' : value)
    }
    reader.readAsDataURL(file)
  })
}

function postJsonWithUploadProgress<T>(
  url: string,
  accessToken: string,
  payload: unknown,
  onProgress: (progress: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`)
    xhr.setRequestHeader('Content-Type', 'application/json')
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(15 + Math.round((event.loaded / event.total) * 75))
      }
    }
    xhr.upload.onload = () => onProgress(90)
    xhr.onerror = () => reject(new Error('network error during upload'))
    xhr.onload = () => {
      let data = {} as T & { detail?: string }
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) as T & { detail?: string } : data
      } catch {
        data = {} as T & { detail?: string }
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(data.detail || `upload failed: ${xhr.status}`))
        return
      }
      onProgress(95)
      resolve(data)
    }
    xhr.send(JSON.stringify(payload))
  })
}

export function SandboxWorkspacePanel({ agentId, accessToken }: SandboxWorkspacePanelProps) {
  const [basePath, setBasePath] = useState('')
  const [currentPath, setCurrentPath] = useState('')
  const [entriesByPath, setEntriesByPath] = useState<Record<string, WorkspaceEntry[]>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loadingPath, setLoadingPath] = useState<string | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<WorkspaceEntry | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entry: WorkspaceEntry } | null>(null)
  const [uploadTargetPath, setUploadTargetPath] = useState('')
  const [operation, setOperation] = useState<OperationState>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const loadSeqRef = useRef(0)

  const currentEntries = currentPath ? (entriesByPath[currentPath] || []) : []
  const busy = Boolean(operation)

  const postWorkspaceAction = useCallback(async (action: string, payload: unknown) => {
    if (!accessToken) throw new Error('missing access token')
    const res = await fetch(`${CLIENT_WTT_API_BASE}/agents/${encodeURIComponent(agentId)}/workspace/${action}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({})) as Record<string, unknown> & { detail?: string }
    if (!res.ok) throw new Error(data.detail || `${action} failed: ${res.status}`)
    return data
  }, [accessToken, agentId])

  const loadPath = useCallback(async (path = '') => {
    if (!agentId || !accessToken) return
    const requestedPath = path || ''
    const loadSeq = loadSeqRef.current + 1
    loadSeqRef.current = loadSeq
    setLoadingPath(requestedPath || 'root')
    setError(null)
    if (requestedPath) {
      setCurrentPath(requestedPath)
      setExpanded((prev) => new Set(prev).add(requestedPath))
    }
    try {
      const qs = new URLSearchParams()
      if (requestedPath) qs.set('path', requestedPath)
      const suffix = qs.toString() ? `?${qs.toString()}` : ''
      const res = await fetch(`${CLIENT_WTT_API_BASE}/agents/${encodeURIComponent(agentId)}/workspace/list${suffix}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const data = await res.json().catch(() => ({})) as Partial<WorkspaceListResponse> & { detail?: string }
      if (!res.ok) throw new Error(data.detail || `workspace list failed: ${res.status}`)
      const nextBase = String(data.base_path || '')
      const nextPath = String(data.path || nextBase || requestedPath)
      const nextEntries = Array.isArray(data.entries) ? data.entries : []
      if (loadSeq !== loadSeqRef.current) return
      setBasePath(nextBase)
      setCurrentPath(nextPath)
      setEntriesByPath((prev) => ({ ...prev, [nextPath]: nextEntries }))
      setExpanded((prev) => new Set(prev).add(nextPath))
    } catch (exc) {
      if (loadSeq !== loadSeqRef.current) return
      setError(exc instanceof Error ? exc.message : String(exc))
    } finally {
      if (loadSeq === loadSeqRef.current) setLoadingPath(null)
    }
  }, [accessToken, agentId])

  useEffect(() => {
    loadPath('')
  }, [loadPath])

  useEffect(() => {
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [])

  const toggleDirectory = async (entry: WorkspaceEntry) => {
    if (entry.type !== 'directory') return
    const isExpanded = expanded.has(entry.path)
    if (isExpanded) {
      setExpanded((prev) => {
        const next = new Set(prev)
        next.delete(entry.path)
        return next
      })
      return
    }
    if (!entriesByPath[entry.path]) await loadPath(entry.path)
    setExpanded((prev) => new Set(prev).add(entry.path))
  }

  const openDirectory = async (entry: WorkspaceEntry) => {
    if (entry.type !== 'directory') return
    setSelectedEntry(entry)
    await loadPath(entry.path)
    setExpanded((prev) => new Set(prev).add(entry.path))
  }

  const selectEntry = async (entry: WorkspaceEntry) => {
    setSelectedEntry(entry)
    if (entry.type === 'directory') await openDirectory(entry)
  }

  const openUpload = (directoryPath: string) => {
    setContextMenu(null)
    setUploadTargetPath(directoryPath)
    fileInputRef.current?.click()
  }

  const handleDownload = async (entry: WorkspaceEntry) => {
    if (!accessToken || !entry.path || busy) return
    setContextMenu(null)
    setOperation({ kind: 'download', label: entry.name })
    setError(null)
    try {
      const data = await postWorkspaceAction('download', { path: entry.path }) as { filename?: string; content_base64?: string; content_type?: string; detail?: string }
      if (!data.content_base64) throw new Error(data.detail || 'download failed')
      downloadBlob(data.filename || entry.name, data.content_base64, data.content_type)
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : String(exc))
    } finally {
      setOperation(null)
    }
  }

  const handleUpload = async (files: FileList | null) => {
    const file = files?.[0]
    const targetPath = uploadTargetPath || currentPath
    if (!file || !accessToken || !targetPath) return
    setOperation({ kind: 'upload', label: file.name, progress: 0 })
    setError(null)
    try {
      const contentBase64 = await fileToBase64(file, (progress) => {
        setOperation({ kind: 'upload', label: file.name, progress })
      })
      const uploaded = await postJsonWithUploadProgress<{ path?: string; filename?: string; size?: number; detail?: string }>(
        `${CLIENT_WTT_API_BASE}/agents/${encodeURIComponent(agentId)}/workspace/upload`,
        accessToken,
        {
          path: targetPath,
          filename: file.name,
          content_base64: contentBase64,
          overwrite: true,
        },
        (progress) => setOperation({ kind: 'upload', label: file.name, progress }),
      )
      if (uploaded.path) {
        const uploadedParent = parentPath(uploaded.path)
        setEntriesByPath((prev) => ({
          ...prev,
          [uploadedParent]: upsertEntry(prev[uploadedParent] || [], {
            name: uploaded.filename || file.name,
            path: uploaded.path || `${uploadedParent}/${file.name}`,
            type: 'file',
            size: uploaded.size ?? file.size,
            mtime: new Date().toISOString(),
          }),
        }))
        setExpanded((prev) => new Set(prev).add(uploadedParent))
      }
      await loadPath(targetPath)
      setOperation({ kind: 'upload', label: file.name, progress: 100 })
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : String(exc))
    } finally {
      window.setTimeout(() => setOperation(null), 250)
      setUploadTargetPath('')
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleCreateDirectory = async (directoryPath: string) => {
    if (!accessToken || !directoryPath || busy) return
    setContextMenu(null)
    const name = window.prompt('New folder name')
    const cleanName = String(name || '').trim()
    if (!cleanName) return
    setOperation({ kind: 'mkdir', label: cleanName })
    setError(null)
    try {
      await postWorkspaceAction('mkdir', { path: directoryPath, name: cleanName })
      await loadPath(directoryPath)
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : String(exc))
    } finally {
      setOperation(null)
    }
  }

  const handleCreateFile = async (directoryPath: string) => {
    if (!accessToken || !directoryPath || busy) return
    setContextMenu(null)
    const name = window.prompt('New file name')
    const cleanName = String(name || '').trim()
    if (!cleanName) return
    setOperation({ kind: 'touch', label: cleanName })
    setError(null)
    try {
      await postWorkspaceAction('touch', { path: directoryPath, name: cleanName })
      await loadPath(directoryPath)
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : String(exc))
    } finally {
      setOperation(null)
    }
  }

  const handleRename = async (entry: WorkspaceEntry) => {
    if (!accessToken || !entry.path || entry.path === basePath || busy) return
    setContextMenu(null)
    const name = window.prompt('Rename to', entry.name)
    const cleanName = String(name || '').trim()
    if (!cleanName || cleanName === entry.name) return
    const refreshPath = parentPath(entry.path)
    setOperation({ kind: 'rename', label: entry.name })
    setError(null)
    try {
      const data = await postWorkspaceAction('rename', { path: entry.path, name: cleanName })
      const nextPath = String(data.path || `${refreshPath}/${cleanName}`)
      setEntriesByPath((prev) => {
        const next = { ...prev }
        delete next[entry.path]
        return next
      })
      setExpanded((prev) => {
        const next = new Set(prev)
        if (next.delete(entry.path) && entry.type === 'directory') next.add(nextPath)
        return next
      })
      setSelectedEntry(null)
      if (entry.type === 'directory' && (currentPath === entry.path || currentPath.startsWith(`${entry.path}/`))) {
        await loadPath(nextPath)
      } else {
        await loadPath(refreshPath)
      }
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : String(exc))
    } finally {
      setOperation(null)
    }
  }

  const handleDelete = async (entry: WorkspaceEntry) => {
    if (!accessToken || !entry.path || busy) return
    setContextMenu(null)
    const kind = entry.type === 'directory' ? 'directory' : 'file'
    if (!window.confirm(`Delete ${kind} "${entry.name}"? This cannot be undone.`)) return
    const refreshPath = parentPath(entry.path)
    setOperation({ kind: 'delete', label: entry.name })
    setError(null)
    try {
      await postWorkspaceAction('delete', { path: entry.path, recursive: true })
      setEntriesByPath((prev) => {
        const next = { ...prev }
        delete next[entry.path]
        return next
      })
      setExpanded((prev) => {
        const next = new Set(prev)
        next.delete(entry.path)
        return next
      })
      setSelectedEntry(null)
      await loadPath(refreshPath)
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : String(exc))
    } finally {
      setOperation(null)
    }
  }

  const renderTree = (path: string, depth = 0): React.ReactNode => {
    const rows = (entriesByPath[path] || []).filter((entry) => entry.type === 'directory')
    return rows.map((entry) => {
      const isExpanded = expanded.has(entry.path)
      const isSelected = selectedEntry?.path === entry.path || currentPath === entry.path
      return (
        <div key={entry.path} className="relative">
          <div
            onClick={() => selectEntry(entry)}
            onContextMenu={(event) => {
              event.preventDefault()
              setSelectedEntry(entry)
              setContextMenu({ x: event.clientX, y: event.clientY, entry })
            }}
            className={`group relative flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-xs ${
              isSelected ? 'bg-[#ede6da] text-[#1f2328] dark:bg-zinc-800 dark:text-zinc-100' : 'text-[#665d52] hover:bg-[#f4f1eb] dark:text-zinc-400 dark:hover:bg-zinc-800'
            }`}
            style={{ paddingLeft: 8 + depth * 24 }}
          >
            {depth > 0 && (
              <>
                <span className="absolute bottom-0 top-0 w-px bg-[#d0c3ae] dark:bg-zinc-700" style={{ left: 10 + (depth - 1) * 24 }} />
                <span className="absolute top-1/2 h-px w-4 bg-[#d0c3ae] dark:bg-zinc-700" style={{ left: 10 + (depth - 1) * 24 }} />
              </>
            )}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                toggleDirectory(entry)
              }}
              className="rounded p-0.5 hover:bg-black/5 dark:hover:bg-white/10"
            >
              <ChevronRight className={`h-3 w-3 transition ${isExpanded ? 'rotate-90' : ''}`} />
            </button>
            <div className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
              <Folder className="h-3.5 w-3.5 shrink-0 text-amber-600" />
              <span className="truncate">{entry.name}</span>
              <span className="ml-auto hidden text-[10px] text-[#a79c8b] group-hover:inline dark:text-zinc-500">open</span>
            </div>
          </div>
          {isExpanded && (
            <div>{renderTree(entry.path, depth + 1)}</div>
          )}
        </div>
      )
    })
  }

  const rootEntry: WorkspaceEntry | null = basePath ? { name: basePath.split('/').pop() || basePath, path: basePath, type: 'directory' } : null

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-3">
      <div className="rounded-xl border border-[#eee9df] bg-white/80 p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/75">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#283038] dark:text-zinc-100">Workspace</p>
            <p className="mt-1 truncate font-mono text-xs text-[#7b7368] dark:text-zinc-500">{currentPath || 'loading...'}</p>
          </div>
          <div className="flex items-center gap-2">
            {operation && (
              <span className="inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-200">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {operation.kind === 'upload' ? 'Uploading' : operation.kind === 'download' ? 'Downloading' : operation.kind === 'mkdir' || operation.kind === 'touch' ? 'Creating' : operation.kind === 'rename' ? 'Renaming' : 'Deleting'} {operation.progress !== undefined ? `${operation.progress}%` : ''}
              </span>
            )}
            <button
              type="button"
              onClick={() => handleCreateDirectory(currentPath)}
              disabled={loadingPath !== null || busy || !currentPath}
              className="inline-flex items-center gap-1 rounded-lg border border-[#ded8ce] px-2 py-1 text-xs font-semibold text-[#5f574d] transition hover:bg-[#f4f1eb] disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <FolderPlus className="h-3.5 w-3.5" /> New Folder
            </button>
            <button
              type="button"
              onClick={() => handleCreateFile(currentPath)}
              disabled={loadingPath !== null || busy || !currentPath}
              className="inline-flex items-center gap-1 rounded-lg border border-[#ded8ce] px-2 py-1 text-xs font-semibold text-[#5f574d] transition hover:bg-[#f4f1eb] disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <FilePlus className="h-3.5 w-3.5" /> New File
            </button>
            <button
              type="button"
              onClick={() => loadPath(currentPath)}
              disabled={loadingPath !== null || busy}
              className="inline-flex items-center gap-1 rounded-lg border border-[#ded8ce] px-2 py-1 text-xs font-semibold text-[#5f574d] transition hover:bg-[#f4f1eb] disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingPath ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button
              type="button"
              onClick={() => openUpload(currentPath)}
              disabled={loadingPath !== null || busy || !currentPath}
              className="inline-flex items-center gap-1 rounded-lg bg-[#1f2328] px-2 py-1 text-xs font-semibold text-white transition hover:bg-black disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950"
            >
              <Upload className="h-3.5 w-3.5" /> Upload
            </button>
            <input ref={fileInputRef} type="file" className="hidden" onChange={(event) => handleUpload(event.target.files)} />
          </div>
        </div>
        <p className="mt-2 text-xs text-[#8a8378] dark:text-zinc-500">
          Right-click folders/files for open, refresh, upload, download, create, rename, and delete operations.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden rounded-xl border border-[#eee9df] bg-white/70 dark:border-zinc-800 dark:bg-zinc-900/60 md:grid-cols-[320px_1fr]">
        <aside className="min-h-0 border-b border-[#eee9df] dark:border-zinc-800 md:border-b-0 md:border-r">
          <div className="border-b border-[#eee9df] px-3 py-2 text-xs font-black uppercase tracking-[0.16em] text-[#9b9488] dark:border-zinc-800 dark:text-zinc-500">
            Directories
          </div>
          <div className="h-full overflow-y-auto p-2">
            {rootEntry ? (
              <>
                <div
                  onClick={() => loadPath(basePath)}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    setContextMenu({ x: event.clientX, y: event.clientY, entry: rootEntry })
                  }}
                  className={`flex cursor-default items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold ${
                    currentPath === basePath ? 'bg-[#ede6da] text-[#1f2328] dark:bg-zinc-800 dark:text-zinc-100' : 'text-[#665d52] hover:bg-[#f4f1eb] dark:text-zinc-400 dark:hover:bg-zinc-800'
                  }`}
                >
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      setExpanded((prev) => {
                        const next = new Set(prev)
                        if (next.has(basePath)) next.delete(basePath)
                        else next.add(basePath)
                        return next
                      })
                    }}
                    className="rounded p-0.5 hover:bg-black/5 dark:hover:bg-white/10"
                  >
                    <ChevronRight className={`h-3 w-3 transition ${expanded.has(basePath) ? 'rotate-90' : ''}`} />
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      loadPath(basePath)
                    }}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  >
                    <Folder className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                    <span className="truncate">{rootEntry.name}</span>
                  </button>
                </div>
                {expanded.has(basePath) && <div>{renderTree(basePath, 1)}</div>}
              </>
            ) : (
              <div className="py-10 text-center text-xs text-[#8a8378] dark:text-zinc-500">Loading tree...</div>
            )}
          </div>
        </aside>

        <section className="min-h-0">
          <div className="flex items-center justify-between gap-2 border-b border-[#eee9df] px-3 py-2 dark:border-zinc-800">
            <span className="truncate font-mono text-[11px] text-[#9b9488] dark:text-zinc-500">{currentPath || basePath}</span>
            <button
              type="button"
              onClick={() => currentPath && currentPath !== basePath ? loadPath(parentPath(currentPath)) : undefined}
              disabled={!basePath || currentPath === basePath || loadingPath !== null}
              className="rounded-md px-2 py-1 text-xs font-semibold text-[#6f665c] transition hover:bg-[#f4f1eb] disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              Up
            </button>
          </div>
          <div className="h-full overflow-y-auto p-2">
            {loadingPath === currentPath ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-[#8a8378] dark:text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading workspace...
              </div>
            ) : currentEntries.length === 0 ? (
              <div className="py-12 text-center text-sm text-[#8a8378] dark:text-zinc-500">This directory is empty.</div>
            ) : (
              <div className="divide-y divide-[#f0ebe3] dark:divide-zinc-800">
                {currentEntries.map((entry) => (
                  <div
                    key={entry.path}
                    onClick={() => {
                      if (entry.type === 'directory') openDirectory(entry)
                      else setSelectedEntry(entry)
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault()
                      setSelectedEntry(entry)
                      setContextMenu({ x: event.clientX, y: event.clientY, entry })
                    }}
                    className="flex cursor-pointer items-center gap-3 px-2 py-2 text-sm hover:bg-[#f8f4ed] dark:hover:bg-zinc-800/60"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1 text-left">
                      {entry.type === 'directory' ? <Folder className="h-4 w-4 shrink-0 text-amber-600" /> : <FileText className="h-4 w-4 shrink-0 text-slate-500 dark:text-zinc-400" />}
                      <span className="truncate font-semibold text-[#283038] dark:text-zinc-100">{entry.name}</span>
                    </div>
                    <span className="hidden w-20 text-right text-xs text-[#9b9488] dark:text-zinc-500 sm:inline">{entry.type === 'directory' ? '-' : formatBytes(entry.size)}</span>
                    {entry.type === 'directory' && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          openDirectory(entry)
                        }}
                        disabled={busy}
                        className="rounded-lg border border-[#ded8ce] px-2 py-1 text-xs font-semibold text-[#6f665c] transition hover:bg-[#f4f1eb] disabled:opacity-30 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        Open
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        handleDownload(entry)
                      }}
                      disabled={busy}
                      className="rounded-lg p-1.5 text-[#7b7368] transition hover:bg-[#f4f1eb] hover:text-[#1f2328] disabled:opacity-30 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                      title={entry.type === 'directory' ? 'Download folder as tar.gz' : 'Download'}
                    >
                      {operation?.kind === 'download' && operation.label === entry.name ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {contextMenu && (
        <div
          className="fixed z-[90] min-w-40 rounded-xl border border-[#ded8ce] bg-white py-1 text-sm shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          {contextMenu.entry.type === 'directory' && (
            <>
              <button
                type="button"
                onClick={() => {
                  const entry = contextMenu.entry
                  setContextMenu(null)
                  selectEntry(entry)
                }}
                disabled={busy}
                className="flex w-full items-center gap-2 px-3 py-2 text-left font-semibold text-[#51483f] hover:bg-[#f4f1eb] disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <Folder className="h-4 w-4" /> Open folder
              </button>
              <button
                type="button"
                onClick={() => {
                  const path = contextMenu.entry.path
                  setContextMenu(null)
                  loadPath(path)
                }}
                disabled={busy}
                className="flex w-full items-center gap-2 px-3 py-2 text-left font-semibold text-[#51483f] hover:bg-[#f4f1eb] disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <RefreshCw className="h-4 w-4" /> Refresh folder
              </button>
              <button
                type="button"
                onClick={() => handleCreateDirectory(contextMenu.entry.path)}
                disabled={busy}
                className="flex w-full items-center gap-2 px-3 py-2 text-left font-semibold text-[#51483f] hover:bg-[#f4f1eb] disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <FolderPlus className="h-4 w-4" /> Create folder
              </button>
              <button
                type="button"
                onClick={() => handleCreateFile(contextMenu.entry.path)}
                disabled={busy}
                className="flex w-full items-center gap-2 px-3 py-2 text-left font-semibold text-[#51483f] hover:bg-[#f4f1eb] disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <FilePlus className="h-4 w-4" /> Create file
              </button>
              <button
                type="button"
                onClick={() => openUpload(contextMenu.entry.path)}
                disabled={busy}
                className="flex w-full items-center gap-2 px-3 py-2 text-left font-semibold text-[#51483f] hover:bg-[#f4f1eb] disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <Upload className="h-4 w-4" /> Upload file here
              </button>
              {contextMenu.entry.path !== basePath && (
                <button
                  type="button"
                  onClick={() => handleDownload(contextMenu.entry)}
                  disabled={busy}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left font-semibold text-[#51483f] hover:bg-[#f4f1eb] disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  <Download className="h-4 w-4" /> Download folder
                </button>
              )}
            </>
          )}
          {contextMenu.entry.type !== 'directory' && (
            <button
              type="button"
              onClick={() => handleDownload(contextMenu.entry)}
              disabled={busy}
              className="flex w-full items-center gap-2 px-3 py-2 text-left font-semibold text-[#51483f] hover:bg-[#f4f1eb] disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <Download className="h-4 w-4" /> Download file
            </button>
          )}
          {contextMenu.entry.path !== basePath && (
            <button
              type="button"
              onClick={() => handleRename(contextMenu.entry)}
              disabled={busy}
              className="flex w-full items-center gap-2 px-3 py-2 text-left font-semibold text-[#51483f] hover:bg-[#f4f1eb] disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <Pencil className="h-4 w-4" /> Rename
            </button>
          )}
          {contextMenu.entry.path !== basePath && (
            <button
              type="button"
              onClick={() => handleDelete(contextMenu.entry)}
              disabled={busy}
              className="flex w-full items-center gap-2 px-3 py-2 text-left font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-500/10"
            >
              <Trash2 className="h-4 w-4" /> Delete {contextMenu.entry.type === 'directory' ? 'folder' : 'file'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
