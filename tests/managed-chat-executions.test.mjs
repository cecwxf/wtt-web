import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const code = ts.transpileModule(readFileSync(new URL('../components/ui/managed-chat-executions.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText
const topicId = '11111111-1111-4111-8111-111111111111'
const queued = { execution_id: '22222222-2222-4222-8222-222222222222', message_id: '33333333-3333-4333-8333-333333333333',
  topic_id: topicId, agent_id: 'synthetic-agent', state: 'queued', revision: 1, stale: false, can_cancel: true,
  created_at: '2026-10-08T07:00:00Z', updated_at: '2026-10-08T07:00:00Z' }
const flush = () => new Promise(resolve => setImmediate(resolve))

function mount(t, { activeRun, responses = [[]] }) {
  const effects = [], timers = new Map(), events = new Map()
  let calls = 0, nextTimer = 0
  const exports = {}
  const context = {
    exports, console, AbortSignal, AbortController,
    document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
    window: { addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) },
    setTimeout: (fn, delay) => { const id = ++nextTimer; timers.set(id, { fn, delay }); return id },
    clearTimeout: id => timers.delete(id),
    fetch: async () => {
      const rows = await responses[Math.min(calls++, responses.length - 1)]
      return { ok: true, status: 200, json: async () => rows }
    },
    require(name) {
      if (name === 'react') return {
        useState: value => [value, () => {}], useRef: value => ({ current: value }),
        useEffect: fn => effects.push(fn),
      }
      if (name === '@/lib/api/base-url') return { CLIENT_WTT_API_BASE: 'https://synthetic.invalid' }
      if (name === '@/lib/i18n-provider') return { useI18n: () => ({ locale: 'en' }) }
      if (name === 'lucide-react') return {}
      return require(name)
    },
  }
  vm.runInNewContext(code, context)
  exports.ManagedChatExecutions({ topicId, accessToken: 'synthetic-fixture', activeRun, enabled: true, agents: [] })
  const cleanups = effects.map(fn => fn()).filter(fn => typeof fn === 'function')
  t.after(() => cleanups.reverse().forEach(fn => fn()))
  return { timers, events, calls: () => calls }
}

test('an initially empty snapshot keeps polling while the submitted run is pending', async t => {
  const f = mount(t, { activeRun: true })
  await flush()
  assert.equal(f.calls(), 1)
  assert.deepEqual([...f.timers.values()].map(timer => timer.delay), [10000])
})

test('idle conversations do not start a polling loop', async t => {
  const f = mount(t, { activeRun: false })
  await flush()
  assert.equal(f.calls(), 1)
  assert.equal(f.timers.size, 0)
})

test('hints received during an in-flight request coalesce into one fresh load', async t => {
  let release
  const first = new Promise(resolve => { release = resolve })
  const f = mount(t, { activeRun: false, responses: [first, [queued]] })
  f.events.get('wtt-chat-execution-changed')({ detail: { topicId } })
  f.events.get('wtt-chat-execution-changed')({ detail: { topicId } })
  release([])
  await flush()
  assert.equal(f.calls(), 2)
  assert.deepEqual([...f.timers.values()].map(timer => timer.delay), [10000])
})

test('a different topic hint does not reload the conversation', async t => {
  const f = mount(t, { activeRun: false })
  await flush()
  f.events.get('wtt-chat-execution-changed')({ detail: { topicId: 'other-topic' } })
  await flush()
  assert.equal(f.calls(), 1)
  assert.equal(f.timers.size, 0)
})
