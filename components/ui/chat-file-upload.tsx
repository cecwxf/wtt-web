'use client'

import { useRef, useState, useCallback } from 'react'
import { Paperclip } from 'lucide-react'
import { CLIENT_WTT_API_BASE, resolveWttUploadUrl } from '@/lib/api/base-url'
import { CircularProgress } from './circular-progress'

export interface UploadedAsset {
  url: string
  filename: string
  kind: 'image' | 'audio' | 'video' | 'file'
  size: number
  mimeType: string
  markdownToken: string
  extractedText?: string
}

interface ChatFileUploadProps {
  onUploaded: (asset: UploadedAsset) => void
  disabled?: boolean
  compact?: boolean
  className?: string
}

function uploadWithProgress(url: string, method: string, headers: Record<string, string>, body: Blob | File): Promise<{ ok: boolean; text: () => Promise<string>; json: () => Promise<unknown> }> & { onProgress: (cb: (pct: number) => void) => void } {
  let progressCb: ((pct: number) => void) | null = null
  const promise = new Promise<{ ok: boolean; text: () => Promise<string>; json: () => Promise<unknown> }>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(method, url)
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && progressCb) progressCb(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      const responseText = xhr.responseText
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        text: async () => responseText,
        json: async () => JSON.parse(responseText),
      })
    }
    xhr.onerror = () => reject(new Error('Network error'))
    xhr.send(body)
  }) as Promise<{ ok: boolean; text: () => Promise<string>; json: () => Promise<unknown> }> & { onProgress: (cb: (pct: number) => void) => void }
  promise.onProgress = (cb) => { progressCb = cb }
  return promise
}

export function ChatFileUpload({ onUploaded, disabled, compact, className }: ChatFileUploadProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [uploadPct, setUploadPct] = useState(-1) // -1 = indeterminate

  const upload = useCallback(async (file: File) => {
    if (!file) return
    setUploading(true)
    setUploadProgress(`Signing...`)
    setUploadPct(-1)
    try {
      // Step 1: Sign
      const signRes = await fetch(`${CLIENT_WTT_API_BASE}/media/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, mime_type: file.type, size: file.size }),
      })
      if (!signRes.ok) throw new Error(await signRes.text())
      const signed = await signRes.json()

      // Step 2: Upload with XHR for progress
      setUploadProgress(`Uploading...`)
      setUploadPct(0)
      const uploadReq = uploadWithProgress(
        resolveWttUploadUrl(signed.upload_url),
        'PUT',
        { 'Content-Type': file.type || 'application/octet-stream' },
        file,
      )
      uploadReq.onProgress((pct) => setUploadPct(pct))
      const uploadRes = await uploadReq
      if (!uploadRes.ok) throw new Error(await uploadRes.text())

      // Step 3: Commit
      setUploadProgress('Finalizing...')
      setUploadPct(-1)
      const commitRes = await fetch(`${CLIENT_WTT_API_BASE}/media/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upload_token: signed.upload_token }),
      })
      if (!commitRes.ok) throw new Error(await commitRes.text())
      const asset = await commitRes.json()

      const isImage = file.type.startsWith('image/')
      const isAudio = file.type.startsWith('audio/')
      const isVideo = file.type.startsWith('video/')
      const kind: UploadedAsset['kind'] = isImage ? 'image' : isAudio ? 'audio' : isVideo ? 'video' : 'file'
      const baseToken = isImage
        ? `![${file.name}](${asset.url})`
        : isAudio
          ? `[audio:${file.name}](${asset.url})`
          : isVideo
            ? `[video:${file.name}](${asset.url})`
            : `[file:${file.name}](${asset.url})`

      const extractedText: string | undefined = typeof asset?.extracted_text === 'string' && asset.extracted_text.trim()
        ? asset.extracted_text
        : undefined

      // When the backend extracted text from the file (PDF/DOCX/text formats),
      // append it inside a hidden [FILE_CONTENT] block so the inference agent can
      // read the document text directly without needing extra MCP tools.
      // The chat UI strips this block via stripFileTokens / stripMetaBlocks.
      const markdownToken = extractedText
        ? `${baseToken}\n\n[FILE_CONTENT name="${file.name.replace(/"/g, '\\"')}"]\n${extractedText}\n[/FILE_CONTENT]`
        : baseToken

      onUploaded({
        url: asset.url,
        filename: file.name,
        kind,
        size: file.size,
        mimeType: file.type,
        markdownToken,
        extractedText,
      })
    } catch (e) {
      alert(`Upload failed: ${e instanceof Error ? e.message : 'unknown'}`)
    } finally {
      setUploading(false)
      setUploadProgress('')
      setUploadPct(-1)
    }
  }, [onUploaded])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) upload(f)
    if (fileRef.current) fileRef.current.value = ''
  }

  const btnClass = compact
    ? 'p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-40'
    : 'p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-40'
  const iconSize = compact ? 'h-3.5 w-3.5' : 'h-4 w-4'
  const progressSize = compact ? 16 : 20

  return (
    <div className={`flex items-center gap-1 ${className || ''}`}>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={disabled || uploading}
        className={btnClass}
        title="Attach file"
      >
        {uploading ? (
          <CircularProgress
            progress={uploadPct}
            size={progressSize}
            strokeWidth={2}
            color="#f59e0b"
            trackColor="rgba(245,158,11,0.15)"
            label={uploadPct >= 0 ? `${uploadPct}` : undefined}
          />
        ) : (
          <Paperclip className={iconSize} />
        )}
      </button>
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept="image/*,audio/*,video/*,.pdf,.txt,.md,.tex,.bib,.csv,.json,.xml,.zip,.doc,.docx,.pptx,.xls,.xlsx"
        onChange={handleFileChange}
      />
      {uploadProgress && (
        <span className={`${compact ? 'text-[9px]' : 'text-[10px]'} text-amber-500 truncate max-w-[120px]`}>
          {uploadProgress}
        </span>
      )}
    </div>
  )
}

/** Render rich file attachment previews from markdown tokens in message content.
 *  Handles: ![name](url), [file:name](url), [file](url), [audio:name](url), [audio](url), [video:name](url), [video](url)
 */
export function FileAttachmentPreview({ content }: { content: string }) {
  // Match all variants: with or without colon+name, http or relative URLs
  const tokenRe = /(\[(?:file|audio|video)(?::[^\]]*)?\]\([^)]+\)|!\[[^\]]*\]\([^)]+\))/g
  const tokens: { token: string; index: number }[] = []
  let m: RegExpExecArray | null
  while ((m = tokenRe.exec(content)) !== null) tokens.push({ token: m[1], index: m.index })

  if (tokens.length === 0) return null

  const items = tokens.map(({ token }, i) => {
    // Image: ![name](url) or ![](url)
    const imgMatch = token.match(/^!\[([^\]]*)\]\(([^)]+)\)$/)
    if (imgMatch) {
      const url = imgMatch[2]
      const name = imgMatch[1] || url.split('/').pop() || 'image'
      return (
        <a key={i} href={url} target="_blank" rel="noopener noreferrer"
          className="block max-w-[200px] rounded-lg overflow-hidden border border-slate-200 hover:border-indigo-300 transition-colors">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={name} className="w-full h-auto max-h-[150px] object-cover" />
          <p className="px-2 py-1 text-[10px] text-slate-500 truncate bg-slate-50">{name}</p>
        </a>
      )
    }
    // File: [file:name](url) or [file](url)
    const fileMatch = token.match(/^\[file(?::([^\]]*))?\]\(([^)]+)\)$/)
    if (fileMatch) {
      const name = fileMatch[1] || fileMatch[2].split('/').pop() || 'file'
      const url = fileMatch[2]
      const ext = name.split('.').pop()?.toLowerCase() || ''
      const icon = ['pdf'].includes(ext) ? '📕' : ['doc','docx'].includes(ext) ? '📘' : ['xls','xlsx','csv'].includes(ext) ? '📊' : ['pptx','ppt'].includes(ext) ? '📙' : ['zip','tar','gz'].includes(ext) ? '📦' : '📄'
      return (
        <a key={i} href={url} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors max-w-[240px]">
          <span className="text-lg">{icon}</span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-700 truncate">{name}</p>
            <p className="text-[10px] text-slate-400">{ext.toUpperCase() || 'FILE'}</p>
          </div>
        </a>
      )
    }
    // Audio: [audio:name](url) or [audio](url)
    const audioMatch = token.match(/^\[audio(?::([^\]]*))?\]\(([^)]+)\)$/)
    if (audioMatch) {
      const name = audioMatch[1] || audioMatch[2].split('/').pop() || 'audio'
      return (
        <div key={i} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 max-w-[280px]">
          <p className="text-[10px] text-slate-500 mb-1">🎵 {name}</p>
          <audio controls className="w-full h-8" src={audioMatch[2]} preload="metadata" />
        </div>
      )
    }
    // Video: [video:name](url) or [video](url)
    const videoMatch = token.match(/^\[video(?::([^\]]*))?\]\(([^)]+)\)$/)
    if (videoMatch) {
      const name = videoMatch[1] || videoMatch[2].split('/').pop() || 'video'
      return (
        <div key={i} className="rounded-lg border border-slate-200 overflow-hidden max-w-[280px]">
          <video controls className="w-full max-h-[180px]" src={videoMatch[2]} preload="metadata" />
          <p className="px-2 py-1 text-[10px] text-slate-500 bg-slate-50">🎬 {name}</p>
        </div>
      )
    }
    return null
  }).filter(Boolean)

  if (items.length === 0) return null
  return <div className="flex flex-wrap gap-2 mt-2">{items}</div>
}

/** Strip file markdown tokens from content to get clean display text.
 *  Handles both [file:name](url) and [file](url) variants.
 */
export function stripFileTokens(content: string): string {
  return content
    .replace(/\[FILE_CONTENT\b[^\]]*\][\s\S]*?\[\/FILE_CONTENT\]/g, '')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[(?:file|audio|video)(?::[^\]]*)?\]\([^)]+\)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Pending attachments bar shown above chat input */
export function PendingAttachments({
  attachments,
  onRemove,
}: {
  attachments: string[]
  onRemove: (index: number) => void
}) {
  if (attachments.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1 mb-1 px-1">
      {attachments.map((token, i) => {
        const nameMatch = token.match(/\[(?:file:|audio:|video:)([^\]]*)\]/) || token.match(/!\[([^\]]*)\]/)
        const name = nameMatch?.[1] || 'file'
        return (
          <span key={i} className="flex items-center gap-1 rounded bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 text-[10px] text-indigo-600">
            📎 {name.slice(0, 20)}{name.length > 20 ? '...' : ''}
            <button onClick={() => onRemove(i)} className="text-indigo-400 hover:text-red-500">✕</button>
          </span>
        )
      })}
    </div>
  )
}
