'use client'

import { Download, FileText, Folder, RefreshCw, Upload } from 'lucide-react'
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

function downloadBlob(filename: string, contentBase64: string): void {
  const binary = atob(contentBase64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  const url = URL.createObjectURL(new Blob([bytes]))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('failed to read file'))
    reader.onload = () => {
      const value = String(reader.result || '')
      resolve(value.includes(',') ? value.split(',').pop() || '' : value)
    }
    reader.readAsDataURL(file)
  })
}

export function SandboxWorkspacePanel({ agentId, accessToken }: SandboxWorkspacePanelProps) {
  const [basePath, setBasePath] = useState('')
  const [currentPath, setCurrentPath] = useState('')
  const [entries, setEntries] = useState<WorkspaceEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadPath = useCallback(async (path = '') => {
    if (!agentId || !accessToken) return
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams()
      if (path) qs.set('path', path)
      const res = await fetch(`${CLIENT_WTT_API_BASE}/agents/${encodeURIComponent(agentId)}/workspace/list?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const data = await res.json().catch(() => ({})) as Partial<WorkspaceListResponse> & { detail?: string }
      if (!res.ok) throw new Error(data.detail || `workspace list failed: ${res.status}`)
      setBasePath(String(data.base_path || ''))
      setCurrentPath(String(data.path || ''))
      setEntries(Array.isArray(data.entries) ? data.entries : [])
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : String(exc))
    } finally {
      setLoading(false)
    }
  }, [accessToken, agentId])

  useEffect(() => {
    loadPath('')
  }, [loadPath])

  const goUp = () => {
    if (!basePath || !currentPath || currentPath === basePath) return
    const parent = currentPath.split('/').slice(0, -1).join('/') || basePath
    loadPath(parent.startsWith(basePath) ? parent : basePath)
  }

  const handleDownload = async (entry: WorkspaceEntry) => {
    if (!accessToken || entry.type === 'directory') return
    setBusy(true)
    setError(null)
    try {
      const qs = new URLSearchParams({ path: entry.path })
      const res = await fetch(`${CLIENT_WTT_API_BASE}/agents/${encodeURIComponent(agentId)}/workspace/download?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const data = await res.json().catch(() => ({})) as { filename?: string; content_base64?: string; detail?: string }
      if (!res.ok || !data.content_base64) throw new Error(data.detail || `download failed: ${res.status}`)
      downloadBlob(data.filename || entry.name, data.content_base64)
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : String(exc))
    } finally {
      setBusy(false)
    }
  }

  const handleUpload = async (files: FileList | null) => {
    const file = files?.[0]
    if (!file || !accessToken || !currentPath) return
    setBusy(true)
    setError(null)
    try {
      const contentBase64 = await fileToBase64(file)
      const res = await fetch(`${CLIENT_WTT_API_BASE}/agents/${encodeURIComponent(agentId)}/workspace/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          path: currentPath,
          filename: file.name,
          content_base64: contentBase64,
          overwrite: true,
        }),
      })
      const data = await res.json().catch(() => ({})) as { detail?: string }
      if (!res.ok) throw new Error(data.detail || `upload failed: ${res.status}`)
      await loadPath(currentPath)
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : String(exc))
    } finally {
      setBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-3">
      <div className="rounded-xl border border-[#eee9df] bg-white/80 p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/75">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#283038] dark:text-zinc-100">Workspace</p>
            <p className="mt-1 truncate font-mono text-xs text-[#7b7368] dark:text-zinc-500">{currentPath || 'loading...'}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => loadPath(currentPath)}
              disabled={loading || busy}
              className="inline-flex items-center gap-1 rounded-lg border border-[#ded8ce] px-2 py-1 text-xs font-semibold text-[#5f574d] transition hover:bg-[#f4f1eb] disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading || busy || !currentPath}
              className="inline-flex items-center gap-1 rounded-lg bg-[#1f2328] px-2 py-1 text-xs font-semibold text-white transition hover:bg-black disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950"
            >
              <Upload className="h-3.5 w-3.5" /> Upload
            </button>
            <input ref={fileInputRef} type="file" className="hidden" onChange={(event) => handleUpload(event.target.files)} />
          </div>
        </div>
        <p className="mt-2 text-xs text-[#8a8378] dark:text-zinc-500">
          Files are transferred to the sandbox workspace API directly and are not stored in WTT media cache.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-[#eee9df] bg-white/70 dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="flex items-center gap-2 border-b border-[#eee9df] px-3 py-2 dark:border-zinc-800">
          <button
            type="button"
            onClick={goUp}
            disabled={!basePath || currentPath === basePath || loading}
            className="rounded-md px-2 py-1 text-xs font-semibold text-[#6f665c] transition hover:bg-[#f4f1eb] disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Up
          </button>
          <span className="truncate font-mono text-[11px] text-[#9b9488] dark:text-zinc-500">{basePath}</span>
        </div>
        <div className="h-full overflow-y-auto p-2">
          {loading ? (
            <div className="py-12 text-center text-sm text-[#8a8378] dark:text-zinc-500">Loading workspace...</div>
          ) : entries.length === 0 ? (
            <div className="py-12 text-center text-sm text-[#8a8378] dark:text-zinc-500">This directory is empty.</div>
          ) : (
            <div className="divide-y divide-[#f0ebe3] dark:divide-zinc-800">
              {entries.map((entry) => (
                <div key={entry.path} className="flex items-center gap-3 px-2 py-2 text-sm">
                  <button
                    type="button"
                    onClick={() => entry.type === 'directory' ? loadPath(entry.path) : undefined}
                    className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1 text-left ${entry.type === 'directory' ? 'hover:bg-[#f4f1eb] dark:hover:bg-zinc-800' : ''}`}
                  >
                    {entry.type === 'directory' ? <Folder className="h-4 w-4 shrink-0 text-amber-600" /> : <FileText className="h-4 w-4 shrink-0 text-slate-500 dark:text-zinc-400" />}
                    <span className="truncate font-semibold text-[#283038] dark:text-zinc-100">{entry.name}</span>
                  </button>
                  <span className="hidden w-20 text-right text-xs text-[#9b9488] dark:text-zinc-500 sm:inline">{entry.type === 'directory' ? '-' : formatBytes(entry.size)}</span>
                  <button
                    type="button"
                    onClick={() => handleDownload(entry)}
                    disabled={entry.type === 'directory' || busy}
                    className="rounded-lg p-1.5 text-[#7b7368] transition hover:bg-[#f4f1eb] hover:text-[#1f2328] disabled:opacity-30 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                    title="Download"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
