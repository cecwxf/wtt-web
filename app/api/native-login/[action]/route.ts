import { getToken } from 'next-auth/jwt'
import { NextRequest, NextResponse } from 'next/server'
import { NEXT_AUTH_SECRET } from '@/lib/auth/next-auth-secret'

const API = process.env.WTT_API_URL || process.env.NEXT_PUBLIC_WTT_API_URL || 'https://www.waxbyte.com'
const headers = { 'Cache-Control': 'no-store', Pragma: 'no-cache', 'Referrer-Policy': 'no-referrer' }
const fail = (status: number, detail: string) => NextResponse.json({ detail }, { status, headers })

export async function POST(request: NextRequest, context: { params: { action: string } }) {
  const action = context.params.action
  if (!['inspect', 'approve'].includes(action)) return fail(404, 'Unknown login action')
  if (request.headers.get('origin') !== request.nextUrl.origin
    || !request.headers.get('content-type')?.startsWith('application/json')) return fail(403, 'Same-origin JSON required')
  try {
    if (Number(request.headers.get('content-length')) > 4096) return fail(400, 'Invalid login request')
    const raw = await request.text()
    if (raw.length > 4096) return fail(400, 'Invalid login request')
    let body
    try { body = JSON.parse(raw) } catch { return fail(400, 'Invalid login request') }
    if (!body || Object.keys(body).some(key => key !== 'request_ticket')
      || typeof body.request_ticket !== 'string' || !body.request_ticket.length || body.request_ticket.length > 2048) {
      return fail(400, 'Invalid login request')
    }
    let accessToken: string | undefined
    let userId: string | undefined
    if (action === 'approve') {
      const session = await getToken({ req: request, secret: NEXT_AUTH_SECRET, secureCookie: request.nextUrl.protocol === 'https:' })
      if (typeof session?.accessToken !== 'string' || typeof session.userId !== 'string') return fail(401, 'Sign in to WTT first')
      if (session.mobileWebSessionId) return fail(403, 'Use the system browser to sign in')
      accessToken = session.accessToken
      userId = session.userId
    }
    const upstream = await fetch(`${API.replace(/\/+$/, '')}/auth/native-login/${action}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: JSON.stringify({ request_ticket: body.request_ticket, web_origin: request.nextUrl.origin }),
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10_000),
    })
    if (!upstream.ok) return fail([401, 403, 409, 429].includes(upstream.status) ? upstream.status : 503, 'Login request is unavailable. Please restart from WTT.')
    const result = await upstream.json()
    if (action === 'inspect') {
      if (!['github', 'google', 'twitter'].includes(result.provider) || result.callback_uri !== 'wtt://oauth'
        || !Number.isInteger(result.expires_at) || result.expires_at * 1000 <= Date.now()
        || result.expires_at * 1000 > Date.now() + 600_000) return fail(502, 'Invalid login response')
      return NextResponse.json({ provider: result.provider, expiresAt: result.expires_at * 1000 }, { headers })
    }
    if (typeof result.callback_url !== 'string' || result.callback_url.length > 512) return fail(502, 'Invalid login response')
    const callback = new URL(result.callback_url)
    if (callback.protocol !== 'wtt:' || callback.hostname !== 'oauth' || callback.pathname || callback.port
      || callback.username || callback.password || callback.hash || result.user_id !== userId
      || !Number.isInteger(result.expires_in) || result.expires_in < 1 || result.expires_in > 90
      || Array.from(callback.searchParams.keys()).sort().join(',') !== 'code,state'
      || !/^[\w-]{43}$/.test(callback.searchParams.get('code') || '')
      || !/^[a-f0-9]{64}$/.test(callback.searchParams.get('state') || '')) return fail(502, 'Invalid login response')
    return NextResponse.json({ callbackUrl: result.callback_url }, { headers })
  } catch {
    return fail(503, 'Login service unavailable. Please retry.')
  }
}
