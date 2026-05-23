'use client'

import { useState } from 'react'
import { MessageCircle, Share2, Bookmark, User, ImageIcon, Download, ExternalLink } from 'lucide-react'
import { formatTimeAgo } from '@/lib/time'
import { WttLogo } from './wtt-logo'
import { parseRichBlocks, toThumbnailUrl } from '@/lib/rich-content'

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

function fileMeta(nameOrUrl: string) {
  const clean = decodeURIComponent(String(nameOrUrl || 'file').split('?')[0].split('#')[0])
  const ext = (clean.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase()
  const label = ext ? ext.toUpperCase() : 'FILE'
  const icon = ext === 'pdf' ? 'PDF'
    : ['doc', 'docx'].includes(ext) ? 'DOC'
    : ['ppt', 'pptx'].includes(ext) ? 'PPT'
    : ['xls', 'xlsx', 'csv'].includes(ext) ? 'XLS'
    : ['zip', 'tar', 'gz'].includes(ext) ? 'ZIP'
    : ext === 'md' ? 'MD'
    : ext === 'html' || ext === 'htm' ? 'HTML'
    : label
  const tone = ext === 'pdf' ? 'bg-red-500/15 text-red-600'
    : ['doc', 'docx'].includes(ext) ? 'bg-blue-500/15 text-blue-600'
    : ['ppt', 'pptx'].includes(ext) ? 'bg-orange-500/15 text-orange-600'
    : ['xls', 'xlsx', 'csv'].includes(ext) ? 'bg-emerald-500/15 text-emerald-600'
    : ['zip', 'tar', 'gz'].includes(ext) ? 'bg-violet-500/15 text-violet-600'
    : 'bg-slate-500/15 text-slate-600'
  return { label, icon, tone }
}

function FileCard({ url, filename }: { url: string; filename?: string }) {
  const fname = filename || url.split('/').pop() || 'file'
  const meta = fileMeta(fname || url)
  return (
    <div className="flex max-w-xl items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[10px] font-black ${meta.tone}`}>
        {meta.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{fname}</span>
        <span className="block text-xs text-slate-400">{meta.label} · 可打开 / 下载</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 hover:border-indigo-300 hover:text-indigo-600">
          <ExternalLink className="h-3.5 w-3.5" />
          打开
        </a>
        <a href={url} download={fname} className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2 py-1 text-xs font-semibold text-white hover:bg-indigo-500">
          <Download className="h-3.5 w-3.5" />
          下载
        </a>
      </span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  MessageCard                                                        */
/* ------------------------------------------------------------------ */

export function MessageCard({ message, onReply, onShare, onBookmark }: MessageCardProps) {
  const blocks = parseRichBlocks(message.content)

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
              return <FileCard key={i} url={block.url} filename={block.filename} />
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
