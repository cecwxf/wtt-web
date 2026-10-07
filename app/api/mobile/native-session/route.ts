import { encode } from 'next-auth/jwt'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { NEXT_AUTH_SECRET } from '@/lib/auth/next-auth-secret'

const WTT_API_URL =
  process.env.WTT_API_URL ||
  process.env.NEXT_PUBLIC_WTT_API_URL ||
  'http://170.106.109.4:8000'

const SESSION_MAX_AGE = 30 * 24 * 60 * 60

function bearerToken(request: NextRequest) {
  const value = request.headers.get('authorization') || ''
  const match = value.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || ''
}

function displayName(raw: Record<string, unknown>) {
  return String(raw.display_name || raw.username || raw.phone || raw.email || raw.id || 'WTT User')
}

export async function POST(request: NextRequest) {
  let accessToken = bearerToken(request)
  let user: Record<string, unknown>
  let maxAge = SESSION_MAX_AGE
  let mobileWebSessionId: string | undefined
  const headers = { 'Cache-Control': 'no-store', Pragma: 'no-cache' }
  try {
    if (accessToken) {
      // Older installed clients still use the bearer bridge during migration.
      const upstream = await fetch(`${WTT_API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store', signal: AbortSignal.timeout(10_000),
      })
      if (!upstream.ok) return NextResponse.json({ detail: 'Invalid bearer token' }, { status: 401, headers })
      user = await upstream.json()
    } else {
      if (request.headers.get('origin') !== request.nextUrl.origin || !request.headers.get('content-type')?.startsWith('application/json')) {
        return NextResponse.json({ detail: 'Same-origin JSON request required' }, { status: 403, headers })
      }
      if (Number(request.headers.get('content-length')) > 2048) return NextResponse.json({ detail: 'Invalid grant' }, { status: 400, headers })
      const raw = await request.text()
      if (raw.length > 2048) return NextResponse.json({ detail: 'Invalid grant' }, { status: 400, headers })
      let body: { ticket?: unknown; code_verifier?: unknown }
      try { body = JSON.parse(raw) } catch { return NextResponse.json({ detail: 'Invalid grant' }, { status: 400, headers }) }
      if (!body || typeof body.ticket !== 'string' || !/^[\w-]{43}$/.test(body.ticket)
        || typeof body.code_verifier !== 'string' || !/^[\w-]{43,128}$/.test(body.code_verifier)) {
        return NextResponse.json({ detail: 'Invalid grant' }, { status: 400, headers })
      }
      const upstream = await fetch(`${WTT_API_URL}/auth/mobile-web/exchange`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket: body.ticket, code_verifier: body.code_verifier, web_origin: request.nextUrl.origin }),
        cache: 'no-store', signal: AbortSignal.timeout(10_000),
      })
      if (!upstream.ok) return NextResponse.json({ detail: 'Invalid or expired grant' }, { status: upstream.status >= 500 ? 503 : 401, headers })
      const result = await upstream.json()
      if (typeof result.access_token !== 'string' || typeof result.session_id !== 'string'
        || !Number.isInteger(result.expires_in) || result.expires_in <= 0 || result.expires_in > 28800) {
        return NextResponse.json({ detail: 'Invalid session response' }, { status: 502, headers })
      }
      accessToken = result.access_token
      maxAge = result.expires_in
      mobileWebSessionId = result.session_id
      user = result.user
    }
  } catch {
    return NextResponse.json({ detail: 'Session service unavailable' }, { status: 503, headers })
  }
  if (!user || typeof user !== 'object') return NextResponse.json({ detail: 'Invalid user payload' }, { status: 502, headers })
  const userId = String(user.id || user.user_id || '')
  if (!userId) {
    return NextResponse.json({ detail: 'Invalid user payload' }, { status: 502 })
  }

  const now = Math.floor(Date.now() / 1000)
  const sessionToken = await encode({
    secret: NEXT_AUTH_SECRET,
    token: {
      accessToken,
      userId,
      userName: displayName(user),
      name: displayName(user),
      email: user.email ? String(user.email) : undefined,
      sub: userId,
      iat: now,
      exp: now + maxAge,
      ...(mobileWebSessionId ? { mobileWebSessionId, accessTokenExpiresAt: (now + maxAge) * 1000 } : {}),
      jti: crypto.randomUUID(),
    },
    maxAge,
  })

  const secure = request.nextUrl.protocol === 'https:' || process.env.NODE_ENV === 'production'
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
    path: '/',
    maxAge,
  }
  const jar = cookies()
  // Remove old chunks as well as the alternate cookie name on account changes.
  for (const cookie of jar.getAll()) {
    if (/^(?:__Secure-)?next-auth\.session-token(?:\.\d+)?$/.test(cookie.name)) {
      jar.set(cookie.name, '', { ...cookieOptions, maxAge: 0 })
    }
  }
  jar.set(secure ? '__Secure-next-auth.session-token' : 'next-auth.session-token', sessionToken, cookieOptions)
  return NextResponse.json({ ok: true, userId }, { headers })
}
