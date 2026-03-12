'use client'

import { useRef, useState, useCallback } from 'react'
import { Paperclip } from 'lucide-react'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'

export interface UploadedAsset {
  url: string
  filename: string
  kind: 'image' | 'audio' | 'video' | 'file'
  size: number
  mimeType: string
  markdownToken: string
}

interface ChatFileUploadProps {
  onUploaded: (asset: UploadedAsset) => void
  disabled?: boolean
  compact?: boolean
  className?: string
}

export function ChatFileUpload({ onUploaded, disabled, compact, className }: ChatFileUploadProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')

  const upload = useCallback(async (file: File) => {
    if (!file) return
    setUploading(true)
    setUploadProgress(`Uploading ${file.name}...`)
    try {
      // Step 1: Sign
      const signRes = await fetch(`${CLIENT_WTT_API_BASE}/media/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, mime_type: file.type, size: file.size }),
      })
      if (!signRes.ok) throw new Error(await signRes.text())
      const signed = await signRes.json()

      // Step 2: Upload
      setUploadProgress(`Uploading ${file.name}... (${(file.size / 1024).toFixed(0)} KB)`)
      const uploadRes = await fetch(`${CLIENT_WTT_API_BASE}${signed.upload_url}`, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      })
      if (!uploadRes.ok) throw new Error(await uploadRes.text())

      // Step 3: Commit
      setUploadProgress('Finalizing...')
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
      const markdownToken = isImage
        ? `![${file.name}](${asset.url})`
        : isAudio
          ? `[audio:${file.name}](${asset.url})`
          : isVideo
            ? `[video:${file.name}](${asset.url})`
            : `[file:${file.name}](${asset.url})`

      onUploaded({
        url: asset.url,
        filename: file.name,
        kind,
        size: file.size,
        mimeType: file.type,
        markdownToken,
      })
    } catch (e) {
      alert(`Upload failed: ${e instanceof Error ? e.message : 'unknown'}`)
    } finally {
      setUploading(false)
      setUploadProgress('')
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

  return (
    <div className={`flex items-center gap-0.5 ${className || ''}`}>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={disabled || uploading}
        className={btnClass}
        title="Attach file"
      >
        {uploading ? (
          <span className={`${compact ? 'text-[10px]' : 'text-xs'} text-amber-500`}>⏳</span>
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

/** Render rich file attachment previews from markdown tokens in message content */
export function FileAttachmentPreview({ content }: { content: string }) {
  const parts = content.split(/(\[(?:file:|audio:|video:)[^\]]*\]\([^)]+\)|!\[[^\]]*\]\([^)]+\))/)

  if (parts.length <= 1) return null

  const items = parts.map((part, i) => {
    const imgMatch = part.match(/^!\[([^\]]*)\]\(([^)]+)\)$/)
    if (imgMatch) {
      return (
        <a key={i} href={imgMatch[2]} target="_blank" rel="noopener noreferrer"
          className="block max-w-[200px] rounded-lg overflow-hidden border border-slate-200 hover:border-indigo-300 transition-colors">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imgMatch[2]} alt={imgMatch[1] || 'image'} className="w-full h-auto max-h-[150px] object-cover" />
          {imgMatch[1] && <p className="px-2 py-1 text-[10px] text-slate-500 truncate bg-slate-50">{imgMatch[1]}</p>}
        </a>
      )
    }
    const fileMatch = part.match(/^\[file:([^\]]*)\]\(([^)]+)\)$/)
    if (fileMatch) {
      const ext = fileMatch[1].split('.').pop()?.toLowerCase() || ''
      const icon = ['pdf'].includes(ext) ? '📕' : ['doc','docx'].includes(ext) ? '📘' : ['xls','xlsx','csv'].includes(ext) ? '📊' : ['pptx','ppt'].includes(ext) ? '📙' : ['zip','tar','gz'].includes(ext) ? '📦' : '📄'
      return (
        <a key={i} href={fileMatch[2]} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors max-w-[240px]">
          <span className="text-lg">{icon}</span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-700 truncate">{fileMatch[1]}</p>
            <p className="text-[10px] text-slate-400">{ext.toUpperCase()} file</p>
          </div>
        </a>
      )
    }
    const audioMatch = part.match(/^\[audio:([^\]]*)\]\(([^)]+)\)$/)
    if (audioMatch) {
      return (
        <div key={i} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 max-w-[280px]">
          <p className="text-[10px] text-slate-500 mb-1">🎵 {audioMatch[1]}</p>
          <audio controls className="w-full h-8" src={audioMatch[2]} preload="metadata" />
        </div>
      )
    }
    const videoMatch = part.match(/^\[video:([^\]]*)\]\(([^)]+)\)$/)
    if (videoMatch) {
      return (
        <div key={i} className="rounded-lg border border-slate-200 overflow-hidden max-w-[280px]">
          <video controls className="w-full max-h-[180px]" src={videoMatch[2]} preload="metadata" />
          <p className="px-2 py-1 text-[10px] text-slate-500 bg-slate-50">🎬 {videoMatch[1]}</p>
        </div>
      )
    }
    return null
  }).filter(Boolean)

  if (items.length === 0) return null
  return <div className="flex flex-wrap gap-2 mt-2">{items}</div>
}

/** Strip file markdown tokens from content to get clean display text */
export function stripFileTokens(content: string): string {
  return content
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[(?:file|audio|video):[^\]]*\]\([^)]+\)/g, '')
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
