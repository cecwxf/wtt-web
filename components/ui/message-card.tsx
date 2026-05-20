'use client'

import { useState } from 'react'
import { MessageCircle, Share2, Bookmark, User, ImageIcon } from 'lucide-react'
import { formatTimeAgo } from '@/lib/time'
import { WttLogo } from './wtt-logo'
import { parseRichBlocks, toThumbnailUrl } from '@/lib/rich-content'
import type { ArtifactPreview } from './artifact-preview-panel'

export interface MessageCardData {
  message_id: string
  topic_id: string
  topic_name: string
  sender_id: string
  sender_display_name?: string
  sender_type: 'human' | 'agent'
  content: string
  timestamp: string
  semantic_type?: string
}

interface MessageCardProps {
  message: MessageCardData
  onReply?: (messageId: string) => void
  onShare?: (messageId: string) => void
  onBookmark?: (messageId: string) => void
  onArtifactOpen?: (artifact: ArtifactPreview) => void
}

// Rich content parsing imported from @/lib/rich-content

/* ------------------------------------------------------------------ */
/*  Inline image with expand-to-fullscreen                             */
/* ------------------------------------------------------------------ */

function CardImage({ url }: { url: string }) {
  const [expanded, setExpanded] = useState(false)
  const [failed, setFailed] = useState(false)
  const thumb = toThumbnailUrl(url)
  return (
    <>
      <button type="button" onClick={() => setExpanded(true)} className="block cursor-zoom-in">
        {failed ? (
          <div className="flex h-24 w-24 items-center justify-center rounded-lg border border-slate-200 bg-slate-100">
            <ImageIcon className="h-6 w-6 text-slate-400" />
          </div>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={thumb}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
            className="max-h-48 w-auto max-w-full rounded-lg object-cover border border-slate-200"
          />
        )}
      </button>
      {expanded && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setExpanded(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="max-h-[90vh] max-w-[90vw] rounded-lg" />
        </div>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  MessageCard                                                        */
/* ------------------------------------------------------------------ */

function extractOpenDesignArtifact(content: string): ArtifactPreview | null {
  const markdown = String(content || '').match(/\[(?:opendesign|open design|OpenDesign)(?::\s*([^\]]+))?\]\(([^)]+)\)/i)
  if (markdown?.[2]) {
    return { title: markdown[1] || 'OpenDesign artifact', previewUrl: markdown[2].trim(), type: 'opendesign' }
  }
  const block = String(content || '').match(/\[OPENDESIGN_ARTIFACT\]([\s\S]*?)\[\/OPENDESIGN_ARTIFACT\]/i)
  if (block?.[1]) {
    try {
      const obj = JSON.parse(block[1].trim()) as Record<string, unknown>
      const previewUrl = String(obj.preview_url || obj.previewUrl || '').trim()
      if (previewUrl) return { title: String(obj.title || 'OpenDesign artifact'), previewUrl, type: 'opendesign' }
    } catch {}
  }
  return null
}

export function MessageCard({ message, onReply, onShare, onBookmark, onArtifactOpen }: MessageCardProps) {
  const blocks = parseRichBlocks(message.content)
  const openDesignArtifact = extractOpenDesignArtifact(message.content)

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-600">
          {message.sender_type === 'agent' ? (
            <WttLogo size={22} className="ring-1 ring-indigo-200/80" />
          ) : (
            <User className="h-5 w-5" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-slate-800">{message.sender_display_name || message.sender_id}</p>
            <span className="text-xs text-slate-400">·</span>
            <p className="truncate text-xs text-slate-400">{message.topic_name}</p>
          </div>
          <p className="text-xs text-slate-400">{formatTimeAgo(message.timestamp)}</p>
        </div>
      </div>

      <div className="mb-3 space-y-2 text-sm leading-relaxed text-slate-700">
        {blocks.map((block, i) => {
          switch (block.kind) {
            case 'image':
              return <CardImage key={i} url={block.url} />
            case 'video':
              return (
                <video key={i} controls className="max-h-48 w-full rounded-lg border border-slate-200">
                  <source src={block.url} />
                </video>
              )
            case 'audio':
              return <audio key={i} controls src={block.url} className="w-full" />
            case 'file':
              return (
                <a key={i} href={block.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs text-indigo-500 hover:underline">
                  📎 {block.filename || '文件'}
                </a>
              )
            case 'link':
              return (
                <a key={i} href={block.url} target="_blank" rel="noreferrer" className="block text-xs text-indigo-500 hover:underline truncate">
                  🔗 {block.url}
                </a>
              )
            case 'html':
              return (
                <div
                  key={i}
                  className="prose prose-sm dark:prose-invert max-w-none [&_img]:max-h-64 [&_img]:w-auto [&_img]:max-w-full [&_img]:rounded-lg [&_img]:border [&_img]:border-slate-200"
                  dangerouslySetInnerHTML={{ __html: block.html }}
                />
              )
            case 'markdown':
              return <div key={i} className="whitespace-pre-wrap">{block.text}</div>
            case 'preview':
              return (
                <div key={i} className="rounded-lg border border-slate-200 p-2 text-xs">
                  <p className="font-semibold text-slate-700">{block.title || 'Link Preview'}</p>
                  {block.desc && <p className="mt-0.5 text-slate-500">{block.desc}</p>}
                  {block.url && <a href={block.url} target="_blank" rel="noreferrer" className="mt-0.5 inline-block text-indigo-500 hover:underline truncate">{block.url}</a>}
                </div>
              )
            case 'plain':
              return block.text ? <p key={i} className="whitespace-pre-wrap">{block.text}</p> : null
            default:
              return null
          }
        })}
      </div>

      {openDesignArtifact && onArtifactOpen ? (
        <button
          type="button"
          onClick={() => onArtifactOpen(openDesignArtifact)}
          className="mb-3 flex w-full items-center justify-between rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-left text-xs font-black text-cyan-900 transition hover:border-cyan-300 hover:bg-cyan-100"
        >
          <span className="truncate">OpenDesign 预览：{openDesignArtifact.title}</span>
          <span className="shrink-0 text-cyan-600">打开 →</span>
        </button>
      ) : null}

      <div className="flex items-center gap-4 text-slate-400">
        <button
          onClick={() => onReply?.(message.message_id)}
          className="inline-flex items-center gap-1.5 text-xs transition hover:text-indigo-600"
        >
          <MessageCircle className="h-4 w-4" />
          <span>Reply</span>
        </button>

        <button
          onClick={() => onShare?.(message.message_id)}
          className="inline-flex items-center gap-1.5 text-xs transition hover:text-indigo-600"
        >
          <Share2 className="h-4 w-4" />
          <span>Share</span>
        </button>

        <button
          onClick={() => onBookmark?.(message.message_id)}
          className="inline-flex items-center gap-1.5 text-xs transition hover:text-indigo-600"
        >
          <Bookmark className="h-4 w-4" />
          <span>Save</span>
        </button>
      </div>
    </article>
  )
}
