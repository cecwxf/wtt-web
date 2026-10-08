import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const code = ts.transpileModule(readFileSync(new URL('../components/desktop/local-agents-controls.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText
const flush = () => new Promise(resolve => setImmediate(resolve))

// Run the component's actual subscription and auto-detection effects in IPC order.
function setup(initial, failure = false) {
  const slots = []
  let index = 0, dirty = true, listener, runtime = initial, tree, discoveries = 0, starts = 0
  const effects = [], exports = {}
  const slot = make => slots[index++] ?? (slots[index - 1] = make())
  const changed = (old, next) => !old || old.length !== next.length || next.some((value, i) => value !== old[i])
  const host = {
    profileManagementSupported: true,
    runtimeStatus: async () => runtime,
    onRuntimeState: callback => { listener = callback; return () => { listener = undefined } },
    discoverAgents: async () => {
      discoveries++
      if (runtime.discoveryReady === false) throw new Error('Authorize this computer with your WTT account first')
      if (failure) throw new Error('Controlled CLI discovery failure')
      return [{ profile_id: 'desktop-codex', adapter: 'codex', display_name: 'Codex', available: true,
        version: 'fixture', requiresFullAccess: false, configured: true }]
    },
    startAgents: async () => { starts++; return runtime },
    stopAgents: async () => runtime,
  }
  vm.runInNewContext(code, { exports, require: name => {
    if (name === 'react') return {
      useState: initial => {
        const item = slot(() => ({ value: typeof initial === 'function' ? initial() : initial }))
        return [item.value, value => { item.value = typeof value === 'function' ? value(item.value) : value; dirty = true }]
      },
      useRef: value => slot(() => ({ current: value })),
      useCallback: (fn, deps) => {
        const item = slot(() => ({}))
        if (changed(item.deps, deps)) { item.fn = fn; item.deps = deps }
        return item.fn
      },
      useEffect: (fn, deps) => {
        const item = slot(() => ({}))
        if (changed(item.deps, deps)) effects.push(() => { item.cleanup?.(); item.deps = deps; item.cleanup = fn() })
      },
    }
    if (name === '@/lib/desktop') return { getDesktopBridge: () => ({ host }) }
    if (name === '@/lib/i18n-provider') return { useI18n: () => ({ locale: 'en' }) }
    if (name === './remote-tools-selection') return { RemoteToolsSelection: () => null }
    return require(name)
  } })
  const onChanged = () => {}
  function text(node) {
    if (node == null || typeof node === 'boolean') return ''
    if (typeof node !== 'object') return String(node)
    if (Array.isArray(node)) return node.map(text).join(' ')
    return text(node.props?.children)
  }
  return {
    get discoveries() { return discoveries }, get starts() { return starts },
    get text() { return text(tree) },
    emit(state) { runtime = state; listener?.(state) },
    async settle() {
      for (let turns = 0; dirty; turns++) {
        assert.ok(turns < 15, 'Unexpected auto-detection loop')
        dirty = false; index = 0
        tree = exports.LocalAgentsControls({ onChanged })
        while (effects.length) effects.shift()()
        await flush()
      }
    },
  }
}

test('stopped-before-authorized waits, then detects once after the native ready event', async () => {
  const f = setup({ state: 'stopped', agents: [], discoveryReady: false })
  await f.settle()
  assert.equal(f.discoveries, 0)
  assert.match(f.text, /Restoring computer authorization/)
  assert.doesNotMatch(f.text, /operation failed/)
  f.emit({ state: 'restoring', agents: [], discoveryReady: false }); await f.settle()
  assert.equal(f.discoveries, 0)
  f.emit({ state: 'stopped', agents: [], discoveryReady: true }); await f.settle()
  assert.equal(f.discoveries, 1)
  assert.match(f.text, /Codex/)
  assert.doesNotMatch(f.text, /operation failed|Restoring computer authorization/)
  f.emit({ state: 'stopped', agents: [], discoveryReady: true }); await f.settle()
  assert.equal(f.discoveries, 1)
  assert.equal(f.starts, 0)
})

test('a real discovery failure stays visible without automatic retries or Agent starts', async () => {
  const f = setup({ state: 'stopped', agents: [], discoveryReady: true }, true)
  await f.settle()
  assert.equal(f.discoveries, 1)
  assert.match(f.text, /Local Agent operation failed/)
  f.emit({ state: 'stopped', agents: [], discoveryReady: true }); await f.settle()
  assert.equal(f.discoveries, 1)
  assert.equal(f.starts, 0)
})

test('older desktop shells without readiness metadata retain detection', async () => {
  const f = setup({ state: 'stopped', agents: [] })
  await f.settle()
  assert.equal(f.discoveries, 1)
  assert.match(f.text, /Codex/)
  assert.equal(f.starts, 0)
})
