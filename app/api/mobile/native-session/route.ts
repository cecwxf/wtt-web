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
  const accessToken = bearerToken(request)
  if (!accessToken) {
    return NextResponse.json({ detail: 'Missing bearer token' }, { status: 401 })
  }

  const upstream = await fetch(`${WTT_API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })
  if (!upstream.ok) {
    return NextResponse.json({ detail: 'Invalid bearer token' }, { status: 401 })
  }

  const user = (await upstream.json().catch(() => ({}))) as Record<string, unknown>
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
      exp: now + SESSION_MAX_AGE,
      jti: crypto.randomUUID(),
    },
    maxAge: SESSION_MAX_AGE,
  })

  const secure = request.nextUrl.protocol === 'https:' || process.env.NODE_ENV === 'production'
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
    path: '/',
    maxAge: SESSION_MAX_AGE,
  }
  const jar = cookies()
  jar.set('next-auth.session-token', sessionToken, cookieOptions)
  if (secure) {
    jar.set('__Secure-next-auth.session-token', sessionToken, cookieOptions)
  }

  return NextResponse.json({ ok: true, userId })
}
