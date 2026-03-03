import { NextRequest } from 'next/server'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { DEFAULT_WTT_API_ORIGIN } from '@/lib/api/base-url'

const UPSTREAM_BASE =
  process.env.WTT_API_URL ||
  process.env.NEXT_PUBLIC_WTT_API_URL ||
  DEFAULT_WTT_API_ORIGIN

function buildUpstreamUrl(path: string[], request: NextRequest): string {
  const base = UPSTREAM_BASE.replace(/\/+$/, '')
  const suffix = path.join('/')
  const query = request.nextUrl.search
  return `${base}/${suffix}${query}`
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

async function requestUpstream(urlString: string, method: string, headers: Headers, body?: Buffer): Promise<Response> {
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

  return new Promise((resolve) => {
    const req = reqFn(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method,
        headers: reqHeaders,
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

    req.on('error', (error) => {
      resolve(
        Response.json(
          {
            detail: `Upstream request failed: ${error instanceof Error ? error.message : 'unknown error'}`,
            upstream: urlString,
          },
          { status: 502 },
        ),
      )
    })

    if (body && body.length > 0) {
      req.write(body)
    }
    req.end()
  })
}

async function proxy(request: NextRequest, path: string[]): Promise<Response> {
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

  return requestUpstream(url, request.method, headers, body)
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
