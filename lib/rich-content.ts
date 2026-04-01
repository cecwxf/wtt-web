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
