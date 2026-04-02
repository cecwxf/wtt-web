import { CLIENT_WTT_API_BASE, DEFAULT_WTT_API_ORIGIN } from '@/lib/api/base-url'

export function stripSourceMarker(text: string): string {
  return String(text || '')
    .replace(/┌─\s*来源标识[\s\S]*?└[^\n]*\n?/g, '')
    .trim()
}

export function proxyMediaUrl(url: string): string {
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

export function toThumbnailUrl(url: string): string {
  const base = proxyMediaUrl(url)
  if (!base) return base

  // Only route WTT media through thumbnail variant; external images untouched.
  if (!base.includes('/media/')) return base

  const sep = base.includes('?') ? '&' : '?'
  return `${base}${sep}variant=thumb`
}

export function trimUrlTail(raw: string): string {
  let url = String(raw || '').trim()
  if (!url) return url

  while (url.length > 0) {
    const last = url[url.length - 1]
    if (!')]}.,!?'.includes(last)) break

    if (last === ')') {
      const opens = (url.match(/\(/g) || []).length
      const closes = (url.match(/\)/g) || []).length
      if (closes <= opens) break
    }

    url = url.slice(0, -1)
  }

  return url
}

export function htmlToPlainText(html: string): string {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function stripMarkdownImageTokens(text: string): string {
  return stripSourceMarker(String(text || ''))
    .replace(/!\[[^\]]*\]\([^\)\s]+\)/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function extractMarkdownImageUrls(text: string): string[] {
  const input = stripSourceMarker(String(text || ''))
  const out: string[] = []
  const push = (raw: string) => {
    const u = proxyMediaUrl(trimUrlTail(String(raw || '')))
    if (u && !out.includes(u)) out.push(u)
  }

  const mdRe = /!\[[^\]]*\]\(([^)]+)\)/gi
  let m: RegExpExecArray | null
  while ((m = mdRe.exec(input)) !== null) {
    push(m[1])
  }

  // HTML rich text images
  const htmlImgRe = /<(?:img|source)\s[^>]*\b(?:src|srcset)\s*=\s*["']([^"']+)["']/gi
  while ((m = htmlImgRe.exec(input)) !== null) {
    push(m[1])
  }

  const relRe = /(?:^|\s)(\/?media\/[\w\-./]+(?:\?[^\s)]*)?)/gi
  while ((m = relRe.exec(input)) !== null) {
    push(m[1])
  }

  // Fallback: bare image URLs in plain text
  const absImgRe = /(https?:\/\/\S+\.(?:jpg|jpeg|png|gif|webp|bmp|svg)(?:\?[^\s)]*)?)/gi
  while ((m = absImgRe.exec(input)) !== null) {
    push(m[1])
  }

  return out
}

export function extractPreviewImage(body: string): string | null {
  const raw = stripSourceMarker(String(body || ''))
  const htmlMatch = raw.match(/<img\s[^>]*src=["']([^"']+)["']/i)
  if (htmlMatch?.[1]) return proxyMediaUrl(trimUrlTail(htmlMatch[1]))

  const mdMatch = raw.match(/!\[[^\]]*\]\(([^)]+)\)/i)
  if (mdMatch?.[1]) return proxyMediaUrl(trimUrlTail(mdMatch[1]))

  const relativeMedia = raw.match(/(?:^|\s)(\/?media\/[\w\-./]+(?:\?[^\s)]*)?)/i)
  if (relativeMedia?.[1]) return proxyMediaUrl(trimUrlTail(relativeMedia[1]))

  return null
}

export function proxyHtmlMedia(html: string): string {
  return String(html || '').replace(
    /(<(?:img|source)\s[^>]*\b(?:src|srcset)\s*=\s*["'])([^"']+)(["'])/gi,
    (_m, pre, url, post) => pre + proxyMediaUrl(url) + post,
  )
}

/* ------------------------------------------------------------------ */
/*  Clean reply summary (Telegram / Zhihu style)                       */
/* ------------------------------------------------------------------ */

export interface ReplySummary {
  /** Clean text-only snippet for display (no URLs, max ~80 chars) */
  text: string
  /** Whether original content contains images */
  hasImage: boolean
  /** Number of images in the original content */
  imageCount: number
  /** First image URL for optional tiny thumbnail */
  thumbUrl?: string
}

/**
 * Produce a clean, Telegram-style reply summary: short text excerpt,
 * 📷 indicator for images — never raw URLs.
 */
export function summarizeForReply(raw: string, maxLen = 80): ReplySummary {
  const source = String(raw || '')
  const imageUrls = extractMarkdownImageUrls(source)

  // Strip HTML to plain text OR strip markdown image tokens
  let plain = source.includes('<') && source.includes('>')
    ? htmlToPlainText(source)
    : stripMarkdownImageTokens(source)

  // Clean previous injected reply context headers
  plain = stripSourceMarker(plain)
    .replace(/\[回复上下文\][\s\S]*?(?:---|$)/g, ' ')
    .replace(/(^|\n)\s*(?:对象|引用|回复上下文|引用图片)\s*:[^\n]*/g, ' ')

  // Remove any remaining bare URLs
  plain = plain.replace(/https?:\/\/\S+/g, '').replace(/\/?media\/[\w\-./]+/g, '')

  const compact = plain.replace(/\s+/g, ' ').trim()
  const truncated = compact.length > maxLen ? `${compact.slice(0, maxLen)}…` : compact

  const hasImage = imageUrls.length > 0
  const imageTag = hasImage ? (imageUrls.length > 1 ? `📷×${imageUrls.length}` : '📷') : ''

  // Build final display text
  let text: string
  if (truncated && imageTag) {
    text = `${truncated} ${imageTag}`
  } else if (truncated) {
    text = truncated
  } else if (imageTag) {
    text = imageTag
  } else {
    text = '…'
  }

  return {
    text,
    hasImage,
    imageCount: imageUrls.length,
    thumbUrl: imageUrls[0] || undefined,
  }
}

/* ------------------------------------------------------------------ */
/*  Unified rich-content block parser                                  */
/* ------------------------------------------------------------------ */

export type ParsedRichBlock =
  | { kind: 'plain'; text: string }
  | { kind: 'html'; html: string }
  | { kind: 'image'; url: string }
  | { kind: 'audio'; url: string }
  | { kind: 'video'; url: string }
  | { kind: 'file'; url: string; filename?: string }
  | { kind: 'link'; url: string }
  | { kind: 'markdown'; text: string }
  | { kind: 'preview'; title?: string; desc?: string; url?: string; image?: string }

function classifyLine(line: string): ParsedRichBlock {
  const c = line.trim()
  if (!c) return { kind: 'plain', text: '' }

  const imageMatch = c.match(/^!\[[^\]]*\]\(([^)]+)\)$/i)
  if (imageMatch) return { kind: 'image', url: proxyMediaUrl(trimUrlTail(imageMatch[1])) }
  const audioMatch = c.match(/^\[audio(?::([^\]]*))?\]\(([^)]+)\)$/i)
  if (audioMatch) return { kind: 'audio', url: proxyMediaUrl(trimUrlTail(audioMatch[2])) }
  const videoMatch = c.match(/^\[video(?::([^\]]*))?\]\(([^)]+)\)$/i)
  if (videoMatch) return { kind: 'video', url: proxyMediaUrl(trimUrlTail(videoMatch[2])) }
  const fileMatch = c.match(/^\[file(?::([^\]]*))?\]\(([^)]+)\)$/i)
  if (fileMatch) return { kind: 'file', url: proxyMediaUrl(trimUrlTail(fileMatch[2])), filename: fileMatch[1] || undefined }
  const linkMatch = c.match(/^\[link\]\(([^)]+)\)$/i)
  if (linkMatch) return { kind: 'link', url: proxyMediaUrl(trimUrlTail(linkMatch[1])) }

  const plainUrl = c.match(/^(https?:\/\/\S+|\/?media\/\S+)$/i)
  if (plainUrl) {
    const raw = trimUrlTail(plainUrl[1])
    const u = raw.toLowerCase()
    if (/\.(mp4|webm|mov)(\?|$)/.test(u)) return { kind: 'video', url: proxyMediaUrl(raw) }
    if (/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/.test(u) || /^\/?media\//i.test(u)) return { kind: 'image', url: proxyMediaUrl(raw) }
    if (/\.(mp3|wav|ogg)(\?|$)/.test(u)) return { kind: 'audio', url: proxyMediaUrl(raw) }
    if (/\.(pdf|docx|xlsx|csv|zip)(\?|$)/.test(u)) return { kind: 'file', url: proxyMediaUrl(raw), filename: undefined }
    return { kind: 'link', url: proxyMediaUrl(raw) }
  }

  return { kind: 'plain', text: line }
}

const HAS_IMG_TAG = /<img\s/i
const HAS_HTML_TAG = /<\/?[a-z][^>]*>/i

/**
 * Unified rich-content parser used by feed chat-view, message-card,
 * and square forum pages to render the same content identically.
 */
export function parseRichBlocks(content: string): ParsedRichBlock[] {
  const c = stripSourceMarker((content || '').trim())
  if (!c) return [{ kind: 'plain', text: '' }]

  // [preview] block
  if (c.startsWith('[preview]')) {
    const title = (c.match(/Title:\s*(.*)/i)?.[1] || '').trim()
    const desc = (c.match(/Desc:\s*(.*)/i)?.[1] || '').trim()
    const url = (c.match(/URL:\s*(https?:\/\/\S+)/i)?.[1] || '').trim()
    const image = proxyMediaUrl((c.match(/Image:\s*(https?:\/\/\S+)/i)?.[1] || '').trim())
    return [{ kind: 'preview', title, desc, url, image }]
  }

  // Tiptap HTML with images — preserve HTML rendering
  if (HAS_IMG_TAG.test(c)) {
    const blocks: ParsedRichBlock[] = []
    const firstTagIdx = c.search(HAS_IMG_TAG)
    if (firstTagIdx > 0) {
      const leading = c.slice(0, firstTagIdx).trim()
      const leadingText = htmlToPlainText(leading)
      if (leadingText) blocks.push({ kind: 'plain', text: leadingText })
    }
    const htmlPart = c.slice(Math.max(0, firstTagIdx)).trim()
    if (htmlPart) blocks.push({ kind: 'html', html: proxyHtmlMedia(htmlPart) })
    return blocks.length > 0 ? blocks : [{ kind: 'html', html: proxyHtmlMedia(c) }]
  }

  // HTML without images: collapse to plain text and re-parse
  if (HAS_HTML_TAG.test(c)) {
    const plain = htmlToPlainText(c)
    if (!plain) return [{ kind: 'plain', text: '' }]
    if (plain !== c) return parseRichBlocks(plain)
    return [{ kind: 'plain', text: plain }]
  }

  // Rich markdown (headings, lists, tables, code blocks)
  const hasMarkdown = /(?:^#{1,6}\s|^\s*[-*+]\s.+|^\d+\.\s|\*\*.+\*\*|^\|.+\||```[\s\S]*```)/m.test(c)
  if (hasMarkdown && c.length > 30) return [{ kind: 'markdown', text: c }]

  // Line-by-line classification
  const segments = c.split(/\n/)
  const blocks: ParsedRichBlock[] = []
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

  // Extract inline media URLs from single plain-text block
  if (blocks.length === 1 && blocks[0].kind === 'plain') {
    const sourceText = blocks[0].text || ''

    const sanitizedText = sourceText
      .replace(/!\[[^\]]*\]\([^\)\s]+\)/gi, '')
      .replace(/^\s*\]\([^\)\s]+\)\s*$/gim, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    if (sanitizedText !== sourceText) {
      blocks[0] = { kind: 'plain', text: sanitizedText }
    }

    const urlMatches = sourceText.match(/https?:\/\/\S+|\/?media\/[\w\-./]+(?:\?[^\s)]*)?/gi)
    if (urlMatches) {
      const seen = new Set<string>()
      for (const raw of urlMatches) {
        const normalized = trimUrlTail(raw)
        if (!normalized || seen.has(normalized)) continue
        seen.add(normalized)

        const u = normalized.toLowerCase()
        if (/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/.test(u) || /^\/?media\//i.test(u)) {
          blocks.push({ kind: 'image', url: proxyMediaUrl(normalized) })
        } else if (/\.(mp4|webm|mov)(\?|$)/.test(u)) {
          blocks.push({ kind: 'video', url: proxyMediaUrl(normalized) })
        } else if (/\.(mp3|wav|ogg)(\?|$)/.test(u)) {
          blocks.push({ kind: 'audio', url: proxyMediaUrl(normalized) })
        } else {
          blocks.push({ kind: 'link', url: proxyMediaUrl(normalized) })
        }
      }
    }
  }

  return blocks.length > 0 ? blocks : [{ kind: 'plain', text: content }]
}
