'use client'

import { Database, Download, FileText, RefreshCcw, Search, Trash2, Upload } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CLIENT_WTT_API_BASE, resolveWttUploadUrl } from '@/lib/api/base-url'
import { attachmentMimeType } from '@/lib/media/mime'

const MAX_KB_UPLOAD_BYTES = 100 * 1024 * 1024

type KnowledgeSource = {
  id: string
  source_id?: string
  title?: string
  filename?: string
  url?: string
  mime_type?: string
  size_bytes?: number
  status?: string
  error?: string | null
  chunk_count?: number
  indexed_at?: string | null
  created_at?: string
}

type KnowledgeSearchResult = {
  chunk_id: string
  source_id: string
  title?: string
  filename?: string
  snippet?: string
  score?: number
}

interface KnowledgeBasePanelProps {
  accessToken?: string
  compact?: boolean
}

function sourceId(source: KnowledgeSource): string {
  return source.source_id || source.id
}

function formatBytes(bytes?: number): string {
  const value = Number(bytes || 0)
  if (!value) return '-'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function statusLabel(status?: string): string {
  switch (String(status || '').toLowerCase()) {
    case 'indexed':
      return '已索引'
    case 'uploaded':
      return '等待索引'
    case 'extracting':
      return '解析中'
    case 'chunking':
      return '切片中'
    case 'failed':
      return '失败'
    default:
      return status || '未知'
  }
}

export function KnowledgeBasePanel({ accessToken, compact = false }: KnowledgeBasePanelProps) {
  const [sources, setSources] = useState<KnowledgeSource[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadName, setUploadName] = useState('')
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<KnowledgeSearchResult[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const headers = useMemo<Record<string, string>>(() => {
    const next: Record<string, string> = {}
    if (accessToken) next.Authorization = `Bearer ${accessToken}`
    return next
  }, [accessToken])

  const loadSources = useCallback(async () => {
    if (!accessToken) return
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch(`${CLIENT_WTT_API_BASE}/kb/personal/sources`, { headers })
      if (!resp.ok) throw new Error(await resp.text().catch(() => `Load failed: ${resp.status}`))
      const data = await resp.json()
      setSources(Array.isArray(data?.sources) ? data.sources : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : '知识库加载失败')
    } finally {
      setLoading(false)
    }
  }, [accessToken, headers])

  useEffect(() => {
    void loadSources()
  }, [loadSources])

  useEffect(() => {
    const hasActive = sources.some((source) => ['uploaded', 'extracting', 'chunking'].includes(String(source.status || '').toLowerCase()))
    if (!hasActive || !accessToken) return
    const timer = window.setInterval(() => void loadSources(), 2500)
    return () => window.clearInterval(timer)
  }, [accessToken, loadSources, sources])

  const uploadOne = useCallback(async (file: File) => {
    if (!accessToken) throw new Error('请先登录')
    if (file.size > MAX_KB_UPLOAD_BYTES) {
      throw new Error(`文件过大，最大 100MB，当前 ${(file.size / (1024 * 1024)).toFixed(1)}MB`)
    }
    const mimeType = attachmentMimeType(file)
    setUploadName(file.name)
    setUploadProgress(0)

    const signResp = await fetch(`${CLIENT_WTT_API_BASE}/media/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: file.name, mime_type: mimeType, size: file.size }),
    })
    if (!signResp.ok) throw new Error(`签名失败：${await signResp.text()}`)
    const signed = await signResp.json()

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          setUploadProgress(Math.max(1, Math.round((event.loaded / event.total) * 85)))
        }
      })
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve()
        else reject(new Error(xhr.responseText || `上传失败：${xhr.status}`))
      })
      xhr.addEventListener('error', () => reject(new Error('上传网络失败')))
      xhr.open('PUT', resolveWttUploadUrl(signed.upload_url))
      xhr.setRequestHeader('Content-Type', mimeType)
      xhr.send(file)
    })

    setUploadProgress(92)
    const commitResp = await fetch(`${CLIENT_WTT_API_BASE}/media/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ upload_token: signed.upload_token }),
    })
    if (!commitResp.ok) throw new Error(`提交失败：${await commitResp.text()}`)
    const asset = await commitResp.json()

    setUploadProgress(96)
    const kbResp = await fetch(`${CLIENT_WTT_API_BASE}/kb/personal/sources/from-media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({
        file_id: asset.file_id,
        media_id: asset.file_id,
        url: asset.url,
        filename: asset.filename || file.name,
        original_name: asset.original_name || file.name,
        mime_type: asset.mime_type || mimeType,
        size: asset.size || file.size,
        extracted_text: asset.extracted_text || '',
        metadata: { source: 'wtt-web-kb' },
      }),
    })
    if (!kbResp.ok) throw new Error(`加入知识库失败：${await kbResp.text()}`)
    setUploadProgress(100)
  }, [accessToken, headers])

  const handleUpload = useCallback(async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(true)
    setError(null)
    try {
      for (const file of Array.from(files)) {
        await uploadOne(file)
      }
      await loadSources()
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败')
    } finally {
      setUploading(false)
      setUploadName('')
      setUploadProgress(null)
    }
  }, [loadSources, uploadOne])

  const deleteSource = useCallback(async (source: KnowledgeSource) => {
    if (!accessToken) return
    const id = sourceId(source)
    if (!id) return
    const resp = await fetch(`${CLIENT_WTT_API_BASE}/kb/personal/sources/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers,
    })
    if (!resp.ok) {
      setError(await resp.text().catch(() => '删除失败'))
      return
    }
    setSources((current) => current.filter((item) => sourceId(item) !== id))
  }, [accessToken, headers])

  const reindexSource = useCallback(async (source: KnowledgeSource) => {
    if (!accessToken) return
    const id = sourceId(source)
    if (!id) return
    const resp = await fetch(`${CLIENT_WTT_API_BASE}/kb/personal/sources/${encodeURIComponent(id)}/reindex`, {
      method: 'POST',
      headers,
    })
    if (!resp.ok) {
      setError(await resp.text().catch(() => '重建索引失败'))
      return
    }
    await loadSources()
  }, [accessToken, headers, loadSources])

  const downloadSource = useCallback(async (source: KnowledgeSource) => {
    if (!accessToken) return
    const id = sourceId(source)
    if (!id) return
    const resp = await fetch(`${CLIENT_WTT_API_BASE}/kb/personal/sources/${encodeURIComponent(id)}/download`, { headers })
    if (!resp.ok) {
      setError(await resp.text().catch(() => '下载失败'))
      return
    }
    const blob = await resp.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = source.filename || source.title || 'knowledge-file'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }, [accessToken, headers])

  const runSearch = useCallback(async () => {
    const trimmed = query.trim()
    if (!accessToken || !trimmed) return
    setSearching(true)
    setError(null)
    try {
      const params = new URLSearchParams({ q: trimmed, limit: '8' })
      const resp = await fetch(`${CLIENT_WTT_API_BASE}/kb/personal/search?${params.toString()}`, { headers })
      if (!resp.ok) throw new Error(await resp.text().catch(() => '搜索失败'))
      const data = await resp.json()
      setResults(Array.isArray(data?.results) ? data.results : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : '搜索失败')
    } finally {
      setSearching(false)
    }
  }, [accessToken, headers, query])

  if (!accessToken) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-[#ded8ce] bg-white/45 text-sm text-[#8a8378] dark:border-zinc-800 dark:bg-zinc-900/45 dark:text-zinc-500">
        登录后可使用个人知识库。
      </div>
    )
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-3 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#eee9df] bg-white/70 p-3 dark:border-zinc-800 dark:bg-zinc-900/70">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Database className="h-4 w-4 shrink-0 text-[#f87500]" />
          <div className="min-w-0">
            <p className={`${compact ? 'text-xs' : 'text-sm'} font-semibold text-[#283038] dark:text-zinc-100`}>个人知识库</p>
            <p className="truncate text-xs text-[#8a8378] dark:text-zinc-500">上传后的文件会自动解析、切片并建立检索索引。</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 rounded-md bg-[#f87500] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#dc6900] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Upload className="h-3.5 w-3.5" />
          上传
        </button>
        <button
          type="button"
          onClick={() => void loadSources()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md border border-[#ded8ce] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#615d55] hover:bg-[#f4f1eb] disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <RefreshCcw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            void handleUpload(event.currentTarget.files)
            event.currentTarget.value = ''
          }}
        />
      </div>

      {uploading && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-700 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-200">
          <div className="mb-1 flex items-center justify-between gap-3">
            <span className="truncate">{uploadName || '正在上传'}</span>
            <span>{uploadProgress ?? 0}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-orange-100 dark:bg-orange-950">
            <div className="h-full bg-[#f87500] transition-all" style={{ width: `${uploadProgress ?? 0}%` }} />
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2 rounded-lg border border-[#eee9df] bg-white/70 p-2 dark:border-zinc-800 dark:bg-zinc-900/70">
        <Search className="h-4 w-4 shrink-0 text-[#8a8378]" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void runSearch()
          }}
          placeholder="搜索知识库内容"
          className="min-w-0 flex-1 bg-transparent px-1 text-sm text-[#1f2328] outline-none placeholder:text-[#aaa298] dark:text-zinc-100"
        />
        <button
          type="button"
          onClick={() => void runSearch()}
          disabled={searching || !query.trim()}
          className="rounded-md border border-[#ded8ce] px-2.5 py-1 text-xs font-semibold text-[#615d55] hover:bg-[#f4f1eb] disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          {searching ? '搜索中' : '搜索'}
        </button>
      </div>

      {results.length > 0 && (
        <div className="max-h-44 overflow-y-auto rounded-lg border border-[#eee9df] bg-white/70 p-2 dark:border-zinc-800 dark:bg-zinc-900/70">
          {results.map((result) => (
            <div key={result.chunk_id} className="border-b border-[#f0ebe3] px-2 py-2 last:border-0 dark:border-zinc-800">
              <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-[#283038] dark:text-zinc-100">
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{result.filename || result.title || result.source_id}</span>
              </div>
              <p className="line-clamp-3 whitespace-pre-wrap text-xs leading-5 text-[#615d55] dark:text-zinc-400">{result.snippet}</p>
            </div>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-[#eee9df] bg-white/70 dark:border-zinc-800 dark:bg-zinc-900/70">
        {loading && sources.length === 0 ? (
          <div className="flex h-full items-center justify-center py-12 text-sm text-[#8a8378] dark:text-zinc-500">正在加载知识库...</div>
        ) : sources.length === 0 ? (
          <div className="flex h-full items-center justify-center px-4 py-12 text-center text-sm text-[#8a8378] dark:text-zinc-500">
            暂无知识库文件。上传 PDF、Markdown、文本、Office 或代码资料后，Agent 可在知识库模式中按需检索分析。
          </div>
        ) : (
          <div className="divide-y divide-[#f0ebe3] dark:divide-zinc-800">
            {sources.map((source) => {
              const id = sourceId(source)
              const failed = String(source.status || '').toLowerCase() === 'failed'
              const indexed = String(source.status || '').toLowerCase() === 'indexed'
              return (
                <div key={id} className="flex items-center gap-3 px-3 py-3">
                  <FileText className="h-4 w-4 shrink-0 text-[#8a8378] dark:text-zinc-500" />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate text-sm font-semibold text-[#283038] dark:text-zinc-100">{source.filename || source.title || id}</p>
                      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        failed
                          ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300'
                          : indexed
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                            : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'
                      }`}>
                        {statusLabel(source.status)}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[#8a8378] dark:text-zinc-500">
                      <span>{formatBytes(source.size_bytes)}</span>
                      <span>chunks {source.chunk_count || 0}</span>
                      {source.indexed_at && <span>{new Date(source.indexed_at).toLocaleString()}</span>}
                      {source.error && <span className="text-red-500">{source.error}</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" onClick={() => void downloadSource(source)} className="rounded-md p-1.5 text-[#8a8378] hover:bg-[#f4f1eb] hover:text-[#1f2328] dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100" title="下载">
                      <Download className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => void reindexSource(source)} className="rounded-md p-1.5 text-[#8a8378] hover:bg-[#f4f1eb] hover:text-[#1f2328] dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100" title="重建索引">
                      <RefreshCcw className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => void deleteSource(source)} className="rounded-md p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10" title="删除">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
