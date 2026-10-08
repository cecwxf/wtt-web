import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createHash } from 'node:crypto'

const listen = async server => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port }
const token = 'workspace-proxy-synthetic-token'
const chunk = Buffer.alloc(1024 * 1024, 120)
const total = 32 * chunk.length
let ended = false
const upstream = createServer(async (request, response) => {
  if (request.headers.authorization !== `Bearer ${token}`) { response.writeHead(401).end(); return }
  if (request.headers.range) {
    assert.equal(request.headers.range, 'bytes=0-9')
    response.writeHead(206, { 'Content-Range': `bytes 0-9/${total}`, 'Content-Length': 10, 'Content-Type': 'application/octet-stream' }).end(chunk.subarray(0, 10))
    return
  }
  response.writeHead(200, { 'Content-Length': total, 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' })
  response.write(chunk)
  await new Promise(resolve => setTimeout(resolve, 1000))
  for (let index = 1; index < 32 && !response.destroyed; index++) {
    if (!response.write(chunk)) await new Promise(resolve => {
      const finish = () => { response.off('drain', finish); response.off('close', finish); resolve() }
      response.once('drain', finish); response.once('close', finish)
    })
  }
  ended = true
  response.end()
})
let next
try {
  const upstreamPort = await listen(upstream)
  const reservation = createServer()
  const frontendPort = await listen(reservation)
  await new Promise(resolve => reservation.close(resolve))
  next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(frontendPort)], {
    env: { ...process.env, WTT_API_URL: `http://127.0.0.1:${upstreamPort}` }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  next.stdout.resume(); next.stderr.resume()
  const base = `http://127.0.0.1:${frontendPort}`
  const path = '/api/wtt/workspaces/11111111-1111-4111-8111-111111111111/workspace/content?path=large.bin&download=true'
  const deadline = Date.now() + 20000
  while (true) {
    try {
      const response = await fetch(base + path, { signal: AbortSignal.timeout(1000) })
      assert.equal(response.status, 401)
      break
    } catch (error) { assert.ok(Date.now() < deadline && next.exitCode === null, `Local Next server did not start: ${error.message}`); await new Promise(resolve => setTimeout(resolve, 100)) }
  }
  const headers = { Authorization: `Bearer ${token}` }
  const response = await fetch(base + path, { headers, signal: AbortSignal.timeout(30000) })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-length'), String(total))
  const reader = response.body.getReader()
  const first = await reader.read()
  assert.equal(ended, false, 'Download was buffered until the upstream finished')
  const hash = createHash('sha256'); let bytes = first.value.length; hash.update(first.value)
  for (let value; !(value = await reader.read()).done;) { bytes += value.value.length; hash.update(value.value) }
  const expected = createHash('sha256'); for (let index = 0; index < 32; index++) expected.update(chunk)
  assert.equal(bytes, total); assert.equal(hash.digest('hex'), expected.digest('hex'))
  const range = await fetch(base + path, { headers: { ...headers, Range: 'bytes=0-9' }, signal: AbortSignal.timeout(5000) })
  assert.equal(range.status, 206); assert.equal((await range.arrayBuffer()).byteLength, 10)
  console.log(JSON.stringify({ result: 'PASS', productionNextProxy: true, unauthenticatedDenied: true, streamedBeforeUpstreamEnd: true, sha256VerifiedBytes: total, range206: true }))
} finally {
  if (next && next.exitCode === null) { const closed = once(next, 'exit'); next.kill('SIGTERM'); await closed }
  upstream.closeAllConnections(); await new Promise(resolve => upstream.close(resolve))
}
