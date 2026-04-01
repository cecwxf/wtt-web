'use client'

import { useState } from 'react'
import { MessageCircle, Share2, Bookmark, User, ImageIcon } from 'lucide-react'
import { formatTimeAgo } from '@/lib/time'
import { WttLogo } from './wtt-logo'
import { CLIENT_WTT_API_BASE, DEFAULT_WTT_API_ORIGIN } from '@/lib/api/base-url'

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

/* ------------------------------------------------------------------ */
/*  Rich content parsing (mirrors chat-view logic)                     */
/* ------------------------------------------------------------------ */

type RichBlock =
  | { kind: 'plain'; text: string }
  | { kind: 'html'; html: string }
  | { kind: 'image'; url: string }
  | { kind: 'audio'; url: string }
  | { kind: 'video'; url: string }
  | { kind: 'file'; url: string; filename?: string }
  | { kind: 'link'; url: string }

function proxyUrl(url: string): string {
  const raw = String(url || '').trim()
  if (!raw) return raw

  if (raw.startsWith(DEFAULT_WTT_API_ORIGIN)) {
    return raw.replace(DEFAULT_WTT_API_ORIGIN, CLIENT_WTT_API_BASE)
  }
  const localBackend = raw.match(/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\//)
  if (localBackend) {
    return raw.replace(localBackend[0], CLIENT_WTT_API_BASE + '/')
  }
  if (/^\/?media\//i.test(raw)) {
    return `${CLIENT_WTT_API_BASE}/${raw.replace(/^\/+/, '')}`
  }
  return raw
}

function stripSourceMarker(text: string): string {
  return String(text || '')
    .replace(/┌─\s*来源标识[\s\S]*?└[^\n]*\n?/g, '')
    .trim()
}

function htmlToPlainText(html: string): string {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function classifyLine(line: string): RichBlock {
  const c = line.trim()
  if (!c) return { kind: 'plain', text: '' }
  const imageMatch = c.match(/^!\[[^\]]*\]\(([^)]+)\)$/i)
  if (imageMatch) return { kind: 'image', url: proxyUrl(imageMatch[1]) }
  const audioMatch = c.match(/^\[audio(?::([^\]]*))?\]\(([^)]+)\)$/i)
  if (audioMatch) return { kind: 'audio', url: proxyUrl(audioMatch[2]) }
  const videoMatch = c.match(/^\[video(?::([^\]]*))?\]\(([^)]+)\)$/i)
  if (videoMatch) return { kind: 'video', url: proxyUrl(videoMatch[2]) }
  const fileMatch = c.match(/^\[file(?::([^\]]*))?\]\(([^)]+)\)$/i)
  if (fileMatch) return { kind: 'file', url: proxyUrl(fileMatch[2]), filename: fileMatch[1] || undefined }
  const plainUrl = c.match(/^(https?:\/\/\S+|\/?media\/\S+)$/i)
  if (plainUrl) {
    const raw = plainUrl[1]
    const u = raw.toLowerCase()
    if (/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/.test(u) || /^\/?media\//i.test(u)) return { kind: 'image', url: proxyUrl(raw) }
    if (/\.(mp4|webm|mov)(\?|$)/.test(u)) return { kind: 'video', url: proxyUrl(raw) }
    if (/\.(mp3|wav|ogg)(\?|$)/.test(u)) return { kind: 'audio', url: proxyUrl(raw) }
    return { kind: 'link', url: proxyUrl(raw) }
  }
  return { kind: 'plain', text: line }
}

function proxyHtml(html: string): string {
  return html.replace(
    /(<img\s[^>]*\bsrc\s*=\s*")([^"]+)(")/gi,
    (_m, pre, url, post) => pre + proxyUrl(url) + post,
  )
}

const HAS_IMG_TAG = /<img\s/i

function parseContent(content: string): RichBlock[] {
  const c = stripSourceMarker((content || '').trim())
  if (!c) return [{ kind: 'plain', text: '' }]

  // Detect Tiptap HTML with <img> tags — only trigger on <img, not generic HTML
  const HAS_HTML_TAG = /<\/?[a-z][^>]*>/i
  if (HAS_IMG_TAG.test(c)) {
    const firstTagIdx = c.search(HAS_IMG_TAG)
    const blocks: RichBlock[] = []
    if (firstTagIdx > 0) {
      const leading = c.slice(0, firstTagIdx).trim()
      const leadingText = htmlToPlainText(leading)
      if (leadingText) blocks.push({ kind: 'plain', text: leadingText })
    }
    const htmlPart = c.slice(Math.max(0, firstTagIdx)).trim()
    if (htmlPart) blocks.push({ kind: 'html', html: proxyHtml(htmlPart) })
    return blocks.length > 0 ? blocks : [{ kind: 'html', html: proxyHtml(c) }]
  }

  // Rich text without image: collapse tags to plain text then re-parse,
  // preserving markdown-image token extraction in HTML wrappers.
  if (HAS_HTML_TAG.test(c)) {
    const plain = htmlToPlainText(c)
    if (!plain) return [{ kind: 'plain', text: '' }]
    if (plain !== c) return parseContent(plain)
    return [{ kind: 'plain', text: plain }]
  }

  // Markdown / plain text path
  const segments = c.split(/\n/)
  const blocks: RichBlock[] = []
  let textBuf: string[] = []

  const flushText = () => {
    if (textBuf.length > 0) {
      blocks.push({ kind: 'plain', text: textBuf.join('\n') })
      textBuf = []
    }
  }

  for (const seg of segments) {
    const classified = classifyLine(seg)
    if (classified.kind === 'plain') {
      textBuf.push(seg)
    } else {
      flushText()
      blocks.push(classified)
    }
  }
  flushText()

  // Extract inline image/media URLs from plain text
  if (blocks.length === 1 && blocks[0].kind === 'plain') {
    const urls = (blocks[0].text || '').match(/https?:\/\/\S+|\/?media\/[\w\-./]+(?:\?[^\s)]*)?/gi)
    if (urls) {
      for (const raw of urls) {
        const u = raw.toLowerCase()
        if (/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/.test(u) || /^\/?media\//i.test(u)) {
          blocks.push({ kind: 'image', url: proxyUrl(raw) })
        } else if (/\.(mp4|webm|mov)(\?|$)/.test(u)) {
          blocks.push({ kind: 'video', url: proxyUrl(raw) })
        }
      }
    }
  }

  return blocks.length > 0 ? blocks : [{ kind: 'plain', text: content }]
}

/* ------------------------------------------------------------------ */
/*  Inline image with expand-to-fullscreen                             */
/* ------------------------------------------------------------------ */

function CardImage({ url }: { url: string }) {
  const [expanded, setExpanded] = useState(false)
  const [failed, setFailed] = useState(false)
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
            src={url}
            alt=""
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

export function MessageCard({ message, onReply, onShare, onBookmark }: MessageCardProps) {
  const blocks = parseContent(message.content)

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
                  className="prose prose-sm dark:prose-invert max-w-none [&_img]:max-h-48 [&_img]:w-auto [&_img]:rounded-lg [&_img]:border [&_img]:border-slate-200"
                  dangerouslySetInnerHTML={{ __html: block.html }}
                />
              )
            case 'plain':
            default:
              return block.text ? <p key={i} className="whitespace-pre-wrap">{block.text}</p> : null
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
