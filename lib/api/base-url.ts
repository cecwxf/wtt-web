export const CLIENT_WTT_API_BASE = '/api/wtt'

export const DEFAULT_WTT_API_ORIGIN =
  process.env.NEXT_PUBLIC_WTT_API_URL || 'http://170.106.109.4:8000'

const DEFAULT_PUBLIC_WTT_API_ORIGIN = 'https://www.waxbyte.com'
const DEFAULT_PUBLIC_WTT_WS_ORIGIN = 'wss://www.waxbyte.com'

export function resolveWttUploadUrl(uploadUrl: string): string {
  if (/^https?:\/\//i.test(uploadUrl)) return uploadUrl
  let origin = DEFAULT_WTT_API_ORIGIN
  if (
    typeof window !== 'undefined' &&
    window.location.protocol === 'https:' &&
    (origin.startsWith('http://') || isLikelyPrivateOrInternalApi(origin))
  ) {
    origin = DEFAULT_PUBLIC_WTT_API_ORIGIN
  }
  const base = origin.replace(/\/+$/, '')
  return `${base}/${uploadUrl.replace(/^\/+/, '')}`
}

function toWsOrigin(input: string): string {
  const s = (input || '').trim()
  if (!s) return ''
  if (s.startsWith('ws://') || s.startsWith('wss://')) return s
  return s.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:')
}

function isLikelyPrivateOrInternalApi(origin: string): boolean {
  try {
    const u = new URL(origin)
    const host = u.hostname
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
      /^170\.106\./.test(host)
    ) {
      return true
    }
  } catch {
    // ignore parse errors
  }
  return false
}

// WebSocket base URL strategy (WS-first, production-safe):
// 1) Prefer explicit NEXT_PUBLIC_WTT_WS_URL when provided.
// 2) Otherwise derive from NEXT_PUBLIC_WTT_API_URL.
// 3) On HTTPS pages, avoid ws:// mixed-content fallback to public wss endpoint.
const EXPLICIT_WS_ORIGIN = toWsOrigin(process.env.NEXT_PUBLIC_WTT_WS_URL || '')
const DERIVED_WS_ORIGIN = toWsOrigin(DEFAULT_WTT_API_ORIGIN)

let resolvedWs = EXPLICIT_WS_ORIGIN || DERIVED_WS_ORIGIN
if (
  !EXPLICIT_WS_ORIGIN &&
  typeof window !== 'undefined' &&
  window.location.protocol === 'https:' &&
  resolvedWs.startsWith('ws://')
) {
  resolvedWs = isLikelyPrivateOrInternalApi(DEFAULT_WTT_API_ORIGIN)
    ? DEFAULT_PUBLIC_WTT_WS_ORIGIN
    : resolvedWs.replace(/^ws:/, 'wss:')
}

export const WS_BASE_URL = resolvedWs
