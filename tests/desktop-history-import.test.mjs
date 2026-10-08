import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import vm from 'node:vm'
import { webcrypto } from 'node:crypto'

const module = { exports: {} }
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/desktop-history-import.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: module.exports, module, TextEncoder, crypto: webcrypto })
const { parseHistoryArchive, importedHistorySource } = module.exports

test('Codex archive preserves visible text but excludes tools, commentary and system messages', async () => {
  const raw = [
    { type: 'session_meta', payload: { id: 'not-resumed', cwd: '/private/not-uploaded' } },
    { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Synthetic question' }] } },
    { type: 'response_item', payload: { type: 'function_call', name: 'shell', arguments: 'must never run' } },
    { type: 'response_item', payload: { type: 'message', role: 'assistant', phase: 'commentary', content: 'working' } },
    { type: 'response_item', payload: { type: 'message', role: 'assistant', phase: 'final_answer', content: [{ type: 'output_text', text: 'Synthetic answer' }] } },
  ].map(row => JSON.stringify(row)).join('\n')
  const parsed = await parseHistoryArchive(raw, 'synthetic.jsonl')
  assert.equal(parsed.source_format, 'codex')
  assert.equal(parsed.messages.length, 2)
  assert.equal(parsed.ignored, 3)
  assert.equal(JSON.stringify(parsed).includes('/private/not-uploaded'), false)
  assert.equal(parsed.source_sha256, (await parseHistoryArchive(raw, 'rename.jsonl')).source_sha256)
})
test('Claude and actual Paseo row shape are explicit text snapshots', async () => {
  const claude = await parseHistoryArchive(JSON.stringify([{ type: 'user', sessionId: 'no-takeover', message: { role: 'user', content: 'Question' } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name: 'exec' }] } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Answer' }] } }]), 'claude.json')
  assert.equal(claude.source_format, 'claude-code')
  assert.equal(claude.messages.length, 2)
  const paseo = await parseHistoryArchive(JSON.stringify({ rows: [
    { seq: 1, timestamp: '2026-10-08T01:00:00Z', item: { type: 'user_message', text: 'Question' } },
    { seq: 2, item: { type: 'reasoning', text: 'private reasoning' } },
    { seq: 3, item: { type: 'assistant_message', text: 'Answer' } },
  ] }), 'paseo.json')
  assert.equal(paseo.source_format, 'paseo')
  assert.equal(paseo.messages.length, 2)
  assert.equal(paseo.messages[0].source_timestamp, '2026-10-08T01:00:00Z')
})
test('unsupported, corrupt and oversized histories are rejected, not silently truncated', async () => {
  for (const raw of ['{"token":"not-a-transcript"}', '{broken', JSON.stringify({ messages: [{ role: 'system', content: 'secret' }] }),
    JSON.stringify({ messages: Array.from({ length: 2001 }, () => ({ role: 'user', content: 'x' })) })]) {
    await assert.rejects(parseHistoryArchive(raw, 'test.json'))
  }
})
test('source badges validate both JSON and object metadata; unrelated chat is unchanged', () => {
  assert.equal(importedHistorySource({ history_import: { source_format: 'paseo' } }), 'paseo')
  assert.equal(importedHistorySource('{"history_import":{"source_format":"codex"}}'), 'codex')
  assert.equal(importedHistorySource({ history_import: { source_format: 'untrusted' } }), undefined)
  assert.equal(importedHistorySource(null), undefined)
})
