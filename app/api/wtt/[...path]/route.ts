import { NextRequest } from 'next/server'
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

async function proxy(request: NextRequest, path: string[]): Promise<Response> {
  const url = buildUpstreamUrl(path, request)
  const headers = new Headers(request.headers)
  headers.delete('host')
  headers.delete('content-length')

  const hasBody = !['GET', 'HEAD'].includes(request.method.toUpperCase())
  const body = hasBody ? await request.arrayBuffer() : undefined

  let upstream: Response
  try {
    upstream = await fetch(url, {
      method: request.method,
      headers,
      body,
      redirect: 'manual',
      cache: 'no-store',
    })
  } catch (error) {
    return Response.json(
      {
        detail: `Upstream request failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        upstream: url,
      },
      { status: 502 },
    )
  }

  const responseBody = await upstream.arrayBuffer()
  return new Response(responseBody, {
    status: upstream.status,
    headers: filterResponseHeaders(upstream.headers),
  })
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
