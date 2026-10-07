import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { webcrypto } from 'node:crypto'
import test from 'node:test'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const { NextRequest } = require('next/server')
const { decode } = require('next-auth/jwt')
const secret = 'native-web-route-test-secret-only'

function load(file, upstream, suffix = '') {
  const jar = new Map([['next-auth.session-token.0', { value: 'old-account-chunk' }], ['unrelated-cookie', { value: 'keep' }]])
  const calls = []
  const module = { exports: {} }
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8') + suffix, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  runInNewContext(code, {
    module, exports: module.exports, URL, Date, crypto: webcrypto, AbortSignal, console,
    process: { env: { WTT_API_URL: 'https://api.example.test', NODE_ENV: 'test' } },
    require(name) {
      if (name === '@/lib/auth/next-auth-secret') return { NEXT_AUTH_SECRET: secret }
      if (name === 'next/headers') return { cookies: () => ({
        getAll: () => [...jar.keys()].map(name => ({ name, value: jar.get(name).value })),
        set: (name, value, options) => jar.set(name, { value, options }),
      }) }
      return require(name)
    },
    fetch: async (...args) => { calls.push(args); return upstream(...args) },
  })
  return { api: module.exports, jar, calls }
}

const routeFile = '../app/api/mobile/native-session/route.ts'
const body = { ticket: 't'.repeat(43), code_verifier: 'v'.repeat(43) }
function request({ origin = 'https://www.wtt.sh', payload = body, headers = {} } = {}) {
  return new NextRequest('https://www.wtt.sh/api/mobile/native-session', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(payload),
  })
}
const upstream = () => Response.json({ access_token: 'child-token', session_id: 'session-one', expires_in: 900,
  user: { id: 'alice', display_name: 'Alice' } })

test('single-use grant establishes an HttpOnly child cookie, not a native-token response', async () => {
  const { api, jar, calls } = load(routeFile, upstream)
  const response = await api.POST(request())
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true, userId: 'alice' })
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(calls[0][0], 'https://api.example.test/auth/mobile-web/exchange')
  assert.deepEqual(JSON.parse(calls[0][1].body), { ...body, web_origin: 'https://www.wtt.sh' })
  assert.equal(calls[0][1].headers.Authorization, undefined)
  const cookie = jar.get('__Secure-next-auth.session-token')
  assert.equal(cookie.options.httpOnly, true)
  assert.equal(cookie.options.secure, true)
  assert.equal(cookie.options.sameSite, 'lax')
  assert.equal(cookie.options.maxAge, 900)
  assert.equal(jar.get('next-auth.session-token.0').options.maxAge, 0)
  assert.equal(jar.get('unrelated-cookie').value, 'keep')
  const payload = await decode({ token: cookie.value, secret })
  assert.equal(payload.accessToken, 'child-token')
  assert.equal(payload.mobileWebSessionId, 'session-one')
  assert.equal(payload.userId, 'alice')
  assert.ok(payload.accessTokenExpiresAt <= Date.now() + 900_000)
})

test('cross-origin, oversized and malformed proofs never call the backend or set cookies', async () => {
  for (const [input, status] of [
    [{ origin: 'https://evil.example' }, 403],
    [{ origin: 'null' }, 403],
    [{ headers: { 'Content-Type': 'text/plain' } }, 403],
    [{ payload: { ...body, ticket: 'x'.repeat(10000) } }, 400],
    [{ payload: null }, 400],
    [{ payload: { ...body, code_verifier: 'short' } }, 400],
  ]) {
    const { api, jar, calls } = load(routeFile, () => { throw Error('must not call') })
    assert.equal((await api.POST(request(input))).status, status)
    assert.equal(calls.length, 0)
    assert.equal(jar.size, 2)
  }
})

test('expired grants and upstream failures do not replace an existing account cookie', async () => {
  for (const [reply, status] of [
    [() => Response.json({}, { status: 401 }), 401],
    [() => Response.json({}, { status: 500 }), 503],
    [() => { throw Error('secret internal failure') }, 503],
    [() => Response.json({ access_token: 'token', session_id: 'id', expires_in: 999999 }), 502],
    [() => Response.json({ access_token: 'token', session_id: 'id', expires_in: 30, user: null }), 502],
  ]) {
    const { api, jar } = load(routeFile, reply)
    const response = await api.POST(request())
    assert.equal(response.status, status)
    assert.doesNotMatch(await response.text(), /secret internal failure|child-token/)
    assert.equal(jar.size, 2)
  }
})

test('old installed clients retain their validated bearer bridge during migration', async () => {
  const { api, calls, jar } = load(routeFile, () => Response.json({ id: 'legacy', display_name: 'Legacy' }))
  const response = await api.POST(request({ headers: { Authorization: 'Bearer legacy-native-token' } }))
  assert.equal(response.status, 200)
  assert.equal(calls[0][0], 'https://api.example.test/auth/me')
  assert.equal(calls[0][1].headers.Authorization, 'Bearer legacy-native-token')
  const payload = await decode({ token: jar.get('__Secure-next-auth.session-token').value, secret })
  assert.equal(payload.mobileWebSessionId, undefined)
})

test('NextAuth never refreshes a mobile child into an unrestricted normal session', async () => {
  const { api, calls } = load('../app/api/auth/[...nextauth]/route.ts', () => { throw Error('must not refresh') }, '\nexports.testOptions = authOptions;')
  const callback = api.testOptions.callbacks.jwt
  const token = { userId: 'alice', accessToken: 'child-token', mobileWebSessionId: 'id', accessTokenExpiresAt: Date.now() + 100_000 }
  assert.equal((await callback({ token })).accessToken, 'child-token')
  const expired = await callback({ token: { ...token, accessTokenExpiresAt: Date.now() - 1 } })
  assert.equal(expired.accessToken, undefined)
  assert.equal(expired.accessTokenRefreshError, 'NativeSessionExpired')
  assert.equal(calls.length, 0)
})
