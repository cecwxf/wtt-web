import { NextRequest } from 'next/server'

const UPSTREAM_BASE =
  process.env.WTT_API_URL ||
  process.env.NEXT_PUBLIC_WTT_API_URL ||
  'http://170.106.109.4:8000'

export async function POST(request: NextRequest) {
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return Response.json({ detail: 'Invalid JSON body' }, { status: 400 })
  }

  const url = `${UPSTREAM_BASE.replace(/\/+$/, '')}/topics/`
  const attempts = [0, 600, 1500]
  let lastError: string | null = null

  for (const delayMs of attempts) {
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs))
    try {
      const upstream = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        cache: 'no-store',
      })
      const text = await upstream.text()
      return new Response(text, {
        status: upstream.status,
        headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json' },
      })
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e)
    }
  }

  return Response.json(
    { detail: `create-topic upstream failed: ${lastError || 'unknown'}` },
    { status: 502 },
  )
}
