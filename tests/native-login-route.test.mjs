import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import test from 'node:test'

const require = createRequire(import.meta.url), ts = require('typescript')
const { NextRequest } = require('next/server'), { encode } = require('next-auth/jwt')
const secret = 'native-login-test-secret'
function fixture(upstream) {
  const calls = [], module = { exports: {} }
  const code = ts.transpileModule(readFileSync(new URL('../app/api/native-login/[action]/route.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  runInNewContext(code, { module, exports: module.exports, URL, Date, AbortSignal,
    process: { env: { WTT_API_URL: 'https://api.example.test' } },
    require: name => name === '@/lib/auth/next-auth-secret' ? { NEXT_AUTH_SECRET: secret } : require(name),
    fetch: async (...args) => { calls.push(args); return upstream(...args) },
  })
  return { api: module.exports, calls }
}
async function request({ origin = 'https://www.ultraspace.ai', token, payload = { request_ticket: 'signed-request-ticket' }, type = 'application/json' } = {}) {
  const cookie = token ? await encode({ secret, token, maxAge: 600 }) : ''
  return new NextRequest('https://www.ultraspace.ai/api/native-login/approve', { method: 'POST',
    headers: { Origin: origin, 'Content-Type': type, ...(cookie ? { Cookie: '__Secure-next-auth.session-token=' + cookie } : {}) },
    body: JSON.stringify(payload),
  })
}
const account = { userId: 'alice', accessToken: 'browser-owner-token' }
const callback = 'wtt://oauth?' + new URLSearchParams({ code: 'c'.repeat(43), state: 'a'.repeat(64) })
const approval = () => Response.json({ callback_url: callback, user_id: 'alice', expires_in: 90 })

test('approval uses verified HttpOnly session credentials and emits only a short callback', async () => {
  const f = fixture(approval)
  const response = await f.api.POST(await request({ token: account }), { params: { action: 'approve' } })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { callbackUrl: callback })
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer')
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(f.calls[0][1].headers.Authorization, 'Bearer browser-owner-token')
  assert.deepEqual(JSON.parse(f.calls[0][1].body), { request_ticket: 'signed-request-ticket', web_origin: 'https://www.ultraspace.ai' })
  assert.equal(f.calls[0][1].redirect, 'error')
})

test('inspection needs no account and never returns backend credentials', async () => {
  const f = fixture(() => Response.json({ provider: 'google', expires_at: Math.floor(Date.now() / 1000) + 600, callback_uri: 'wtt://oauth', access_token: 'must-not-leak' }))
  const response = await f.api.POST(await request(), { params: { action: 'inspect' } })
  assert.equal(response.status, 200)
  assert.equal(f.calls[0][1].headers.Authorization, undefined)
  assert.doesNotMatch(await response.text(), /must-not-leak/)
})

test('unauthenticated, mobile child, cross-origin and invalid input fail before upstream', async () => {
  for (const [options, expected] of [
    [{}, 401], [{ token: { ...account, mobileWebSessionId: 'restricted-child' } }, 403],
    [{ token: account, origin: 'https://evil.test' }, 403], [{ token: account, type: 'text/plain' }, 403],
    [{ token: account, payload: null }, 400], [{ token: account, payload: { request_ticket: 'x'.repeat(5000) } }, 400],
    [{ token: account, payload: { request_ticket: 'ticket', web_origin: 'https://evil.test' } }, 400],
  ]) {
    const f = fixture(() => { throw Error('must not call') })
    assert.equal((await f.api.POST(await request(options), { params: { action: 'approve' } })).status, expected)
    assert.equal(f.calls.length, 0)
  }
})

test('approval rejects foreign owners, redirects and malformed duplicate callback parameters', async () => {
  for (const changes of [{ user_id: 'bob' }, { callback_url: 'https://evil.test' },
    { callback_url: callback + '&code=' + 'z'.repeat(43) }, { callback_url: callback + '#fragment' },
    { expires_in: 10000 }, { callback_url: callback.replace('wtt://oauth', 'wtt://user@oauth') }]) {
    const f = fixture(() => Response.json({ callback_url: callback, user_id: 'alice', expires_in: 90, ...changes }))
    assert.equal((await f.api.POST(await request({ token: account }), { params: { action: 'approve' } })).status, 502)
  }
})

test('unavailable and rejected upstream never expose raw responses', async () => {
  for (const [upstream, status] of [[() => { throw Error('internal-key-secret') }, 503],
    [() => Response.json({ detail: 'internal-key-secret' }, { status: 500 }), 503],
    [() => Response.json({ detail: 'internal-key-secret' }, { status: 429 }), 429]]) {
    const f = fixture(upstream), result = await f.api.POST(await request({ token: account }), { params: { action: 'approve' } })
    assert.equal(result.status, status)
    assert.doesNotMatch(await result.text(), /internal-key-secret|browser-owner-token/)
  }
})
