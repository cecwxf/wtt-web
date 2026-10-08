import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const code = ts.transpileModule(readFileSync(new URL('../components/desktop/desktop-session-sync.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText
const flush = () => new Promise(resolve => setImmediate(resolve))

function setup() {
  let session = { status: 'authenticated', data: { accessToken: 'synthetic-token' } }
  let effect, cleanup
  const calls = [], exports = {}, ref = { current: false }
  const host = {
    status: async () => ({ enabled: true, protocolVersion: 3 }),
    resume: async () => { calls.push('resume'); return { userId: 'synthetic-user' } },
    suspend: async () => { calls.push('suspend') },
    signOut: async () => { calls.push('erase') },
  }
  vm.runInNewContext(code, { exports, require: name => {
    if (name === 'react') return { useEffect: fn => { effect = fn }, useRef: () => ref }
    if (name === 'next-auth/react') return { useSession: () => session }
    if (name === '@/lib/desktop') return { getDesktopBridge: () => ({ host, auth: {
      syncAccount: async userId => calls.push(userId ? 'account-verified' : 'account-locked'),
    } }) }
    return require(name)
  } })
  return { calls, async render(status) {
    cleanup?.()
    session = { status, data: status === 'authenticated' ? { accessToken: 'synthetic-token' } : null }
    exports.DesktopSessionSync()
    cleanup = effect()
    await flush()
  } }
}

test('a null session after network failure locks the native runtime without erasing enrollment', async () => {
  const f = setup()
  await f.render('authenticated')
  await f.render('unauthenticated')
  assert.ok(f.calls.includes('suspend'))
  assert.ok(f.calls.includes('account-locked'))
  assert.ok(!f.calls.includes('erase'))
  await f.render('authenticated')
  assert.equal(f.calls.filter(call => call === 'resume').length, 2)
})
