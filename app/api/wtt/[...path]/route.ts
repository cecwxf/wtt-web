import { NextRequest } from 'next/server'
import { Agent as HttpAgent, request as httpRequest } from 'node:http'
import { Agent as HttpsAgent, request as httpsRequest } from 'node:https'
import { DEFAULT_WTT_API_ORIGIN } from '@/lib/api/base-url'

const UPSTREAM_BASE =
  process.env.WTT_API_URL ||
  process.env.NEXT_PUBLIC_WTT_API_URL ||
  DEFAULT_WTT_API_ORIGIN

const REQUEST_TIMEOUT_MS = 15000
const LONG_CONTROL_PLANE_TIMEOUT_MS = 60000
const RETRYABLE_ERROR_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH'])
const RETRYABLE_UPSTREAM_STATUSES = new Set([408, 429, 500, 502, 503, 504])

const HTTP_AGENT = new HttpAgent({
  keepAlive: true,
  keepAliveMsecs: 10_000,
  maxSockets: 128,
})

const HTTPS_AGENT = new HttpsAgent({
  keepAlive: true,
  keepAliveMsecs: 10_000,
  maxSockets: 128,
})

function buildUpstreamUrl(path: string[], request: NextRequest): string {
  const base = UPSTREAM_BASE.replace(/\/+$/, '')
  const suffix = path.join('/')
  const trailingSlash = request.nextUrl.pathname.endsWith('/') ? '/' : ''
  const query = request.nextUrl.search
  return `${base}/${suffix}${trailingSlash}${query}`
}

function filterResponseHeaders(headers: Headers): Headers {
  const outgoing = new Headers()
  headers.forEach((value, key) => {
    const lower = key.toLowerCase()
    if (lower === 'content-encoding' || lower === 'transfer-encoding' || lower === 'connection') {
      return
    }
    outgoing.set(key, value)
  })
  return outgoing
}

function isWorkspacePath(path: string[]): boolean {
  return path.length >= 4 && path[0] === 'agents' && path[2] === 'workspace'
}

function isAgentOperationPath(path: string[]): boolean {
  return path[0] === 'agent-operations'
}

function shouldRetry(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = (error as { code?: string }).code
  if (code && RETRYABLE_ERROR_CODES.has(code)) return true
  const msg = String((error as { message?: string }).message || '').toLowerCase()
  return msg.includes('socket hang up') || msg.includes('timeout')
}

async function requestUpstreamOnce(urlString: string, method: string, headers: Headers, body?: Buffer, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  const url = new URL(urlString)
  const isHttps = url.protocol === 'https:'
  const reqFn = isHttps ? httpsRequest : httpRequest

  const reqHeaders: Record<string, string> = {}
  headers.forEach((value, key) => {
    reqHeaders[key] = value
  })
  if (body) {
    reqHeaders['content-length'] = String(body.length)
  }

  return new Promise((resolve, reject) => {
    const req = reqFn(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method,
        headers: reqHeaders,
        agent: isHttps ? HTTPS_AGENT : HTTP_AGENT,
      },
      (upstreamRes) => {
        const chunks: Buffer[] = []
        upstreamRes.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
        upstreamRes.on('end', () => {
          const status = upstreamRes.statusCode || 502
          const resHeaders = new Headers()
          Object.entries(upstreamRes.headers).forEach(([k, v]) => {
            if (!v) return
            if (Array.isArray(v)) {
              resHeaders.set(k, v.join(','))
            } else {
              resHeaders.set(k, String(v))
            }
          })
          resolve(new Response(Buffer.concat(chunks), { status, headers: filterResponseHeaders(resHeaders) }))
        })
      },
    )

    req.setTimeout(timeoutMs, () => {
      req.destroy(Object.assign(new Error(`upstream timeout after ${timeoutMs}ms`), { code: 'ETIMEDOUT' }))
    })

    req.on('error', (error) => reject(error))

    if (body && body.length > 0) {
      req.write(body)
    }
    req.end()
  })
}

async function requestUpstream(
  urlString: string,
  method: string,
  headers: Headers,
  body?: Buffer,
  options?: { timeoutMs?: number; retryUpstreamStatus?: boolean },
): Promise<Response> {
  let lastError: unknown
  const maxAttempts = 2

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await requestUpstreamOnce(urlString, method, headers, body, options?.timeoutMs)
      if (
        attempt < maxAttempts &&
        options?.retryUpstreamStatus &&
        RETRYABLE_UPSTREAM_STATUSES.has(response.status)
      ) {
        await new Promise((r) => setTimeout(r, 150 * attempt))
        continue
      }
      return response
    } catch (error) {
      lastError = error
      if (attempt < maxAttempts && shouldRetry(error)) {
        await new Promise((r) => setTimeout(r, 150 * attempt))
        continue
      }
      break
    }
  }

  const detail = lastError instanceof Error ? lastError.message : 'unknown error'
  return Response.json(
    {
      detail: `Upstream request failed: ${detail}`,
      upstream: urlString,
    },
    { status: 502 },
  )
}

function isPublicAuthPath(path: string[]): boolean {
  const p = `/${path.join('/')}`
  return (
    p === '/auth/register' ||
    p === '/auth/login' ||
    p === '/auth/activate' ||
    p === '/auth/resend-activation' ||
    p === '/auth/forgot-password' ||
    p === '/auth/reset-password' ||
    p === '/auth/phone/send-code' ||
    p === '/auth/phone/login' ||
    p === '/auth/phone/register' ||
    p === '/auth/phone/password-login' ||
    p === '/auth/phone/reset-password' ||
    p === '/billing/lemonsqueezy/webhook' ||
    p === '/billing/xunhupay/notify'
  )
}

function isSignedArtifactPreviewPath(path: string[], request: NextRequest): boolean {
  if (path.length < 4) return false
  return path[0] === 'artifacts' &&
    path[2] === 'preview' &&
    Boolean(request.nextUrl.searchParams.get('token'))
}

async function proxy(request: NextRequest, path: string[]): Promise<Response> {
  // Auth check: require Authorization header or NextAuth session cookie,
  // except for public auth endpoints used before login.
  const hasAuthHeader = !!request.headers.get('authorization')
  const hasSessionCookie = request.cookies.has('next-auth.session-token') ||
    request.cookies.has('__Secure-next-auth.session-token')
  const isPublic = isPublicAuthPath(path) || isSignedArtifactPreviewPath(path, request)
  if (!isPublic && !hasAuthHeader && !hasSessionCookie) {
    return Response.json({ detail: 'Unauthorized' }, { status: 401 })
  }

  const url = buildUpstreamUrl(path, request)
  const headers = new Headers(request.headers)
  ;[
    'host',
    'content-length',
    'connection',
    'transfer-encoding',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'upgrade',
    'expect',
  ].forEach((h) => headers.delete(h))

  const hasBody = !['GET', 'HEAD'].includes(request.method.toUpperCase())
  const body = hasBody ? Buffer.from(await request.arrayBuffer()) : undefined

  const agentOperationPath = isAgentOperationPath(path)
  const response = await requestUpstream(url, request.method, headers, body, {
    timeoutMs: agentOperationPath ? LONG_CONTROL_PLANE_TIMEOUT_MS : REQUEST_TIMEOUT_MS,
    retryUpstreamStatus: agentOperationPath,
  })
  if (isWorkspacePath(path)) {
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')
  }
  return response
}

type Ctx = { params: { path: string[] } }

export async function GET(request: NextRequest, ctx: Ctx) {
  return proxy(request, ctx.params.path)
}

export async function POST(request: NextRequest, ctx: Ctx) {
  return proxy(request, ctx.params.path)
}

export async function PUT(request: NextRequest, ctx: Ctx) {
  return proxy(request, ctx.params.path)
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  return proxy(request, ctx.params.path)
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  return proxy(request, ctx.params.path)
}

export async function OPTIONS(request: NextRequest, ctx: Ctx) {
  return proxy(request, ctx.params.path)
}
