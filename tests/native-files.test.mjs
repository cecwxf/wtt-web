import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { webcrypto } from 'node:crypto'

const ts = createRequire(import.meta.url)('typescript')
const module = { exports: {} }, window = {}
runInNewContext(ts.transpileModule(readFileSync(new URL('../lib/native-files.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module, exports: module.exports, window, crypto: webcrypto, Uint8Array })
const { downloadNativeWorkspaceFile, downloadNativeKnowledgeFile } = module.exports

test('legacy native bridge keeps Agent downloads and never receives project requests', async () => {
  const requests = []
  window.__WTT_NATIVE_FILES__ = { version: 1, download: async request => requests.push(request), cancel: () => {} }
  const options = { signal: new AbortController().signal, onProgress: () => {} }
  assert.equal(await downloadNativeWorkspaceFile({ workspaceId: 'project', path: 'README.md', filename: 'README.md' }, options), false)
  assert.equal(requests.length, 0)
  assert.equal(await downloadNativeWorkspaceFile({ agentId: 'agent-one', path: 'README.md', filename: 'README.md' }, options), true)
  assert.equal(requests[0].agentId, 'agent-one')
  assert.equal(requests[0].workspaceId, undefined)
})

test('v2 routes project downloads without Agent fallback and forwards cancellation', async () => {
  let finish, requestId
  const requests = [], cancellations = []
  window.__WTT_NATIVE_FILES__ = { version: 2, download: request => {
    requests.push(request); requestId = request.requestId
    return new Promise(resolve => { finish = resolve })
  }, cancel: id => cancellations.push(id) }
  const controller = new AbortController()
  const operation = downloadNativeWorkspaceFile({ workspaceId: 'project', path: 'README.md', filename: 'README.md' }, {
    signal: controller.signal, onProgress: () => {},
  })
  controller.abort()
  assert.deepEqual(cancellations, [requestId])
  assert.equal(requests[0].workspaceId, 'project')
  assert.equal(requests[0].agentId, undefined)
  finish()
  await assert.rejects(operation, { name: 'AbortError' })
})

test('knowledge capability gates old clients and routes only source IDs to capable native clients', async () => {
  const input = { knowledgeSourceId: '11111111-1111-4111-8111-111111111111', filename: 'knowledge.txt' }
  const options = { signal: new AbortController().signal, onProgress: () => {}, accessToken: 'synthetic-token' }
  for (const version of [2, 3]) {
    const requests = []
    window.__WTT_NATIVE_FILES__ = { version, download: async request => requests.push(request), cancel: () => {} }
    await assert.rejects(downloadNativeKnowledgeFile(input, options), /Update WTT/)
    assert.equal(requests.length, 0)
    window.__WTT_NATIVE_FILES__.knowledgeFiles = true
    assert.equal(await downloadNativeKnowledgeFile(input, options), true)
    assert.equal(requests[0].knowledgeSourceId, input.knowledgeSourceId)
    assert.equal(requests[0].path, undefined)
    assert.equal(requests[0].accessToken, version === 3 ? options.accessToken : undefined)
  }
})
