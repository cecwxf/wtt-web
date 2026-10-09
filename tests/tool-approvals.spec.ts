import { expect, test, type Page } from '@playwright/test'
import { normalizePrivateToolApprovals, readPrivateApprovalResponse } from '../lib/tool-approvals'

const topic = '11111111-1111-4111-8111-111111111111'
const agent = 'agent-000000000001'
const approval = {
  request_id: '22222222-2222-4222-8222-222222222222', topic_id: topic, agent_id: agent,
  tool_name: 'Bash', input_sha256: '1'.repeat(64), status: 'pending',
  input: { command: 'shasum -a 256 payload.bin', description: '<script>Not executable markup</script>' },
  expires_at: new Date(Date.now() + 300000).toISOString(),
}

test('approval snapshots are scoped, bounded and expiring', () => {
  const now = Date.now()
  const row = { ...approval, expires_at: new Date(now + 10000).toISOString() }
  expect(normalizePrivateToolApprovals([row], topic, now)).toEqual([row])
  for (const value of [
    { ...row, topic_id: 'other' }, { ...row, status: 'allowed' }, { ...row, input_sha256: 'wrong' },
    { ...row, expires_at: new Date(now - 1).toISOString() }, { ...row, input: { command: 'x'.repeat(65536) } },
  ]) expect(normalizePrivateToolApprovals([value], topic, now)).toEqual([])
  expect(normalizePrivateToolApprovals(Array.from({ length: 33 }, () => row), topic, now)).toEqual([])
})

test('approval response reader rejects oversized streams', async () => {
  await expect(readPrivateApprovalResponse(new Response('x'.repeat(2200001)))).rejects.toThrow(/exceeds limit/)
})

test('approval expiry uses server lifetime despite device clock skew', () => {
  const now = Date.now()
  for (const skew of [-600000, 600000]) {
    const row = { ...approval, server_time: new Date(now + skew).toISOString(), expires_at: new Date(now + skew + 300000).toISOString() }
    const normalized = normalizePrivateToolApprovals([row], topic, now)
    expect(normalized).toHaveLength(1)
    expect(Date.parse(normalized[0].expires_at)).toBe(now + 300000)
    for (const lifetime of [-1, 302000]) {
      expect(normalizePrivateToolApprovals([{ ...row, expires_at: new Date(now + skew + lifetime).toISOString() }], topic, now)).toEqual([])
    }
    expect(normalizePrivateToolApprovals([{ ...row, server_time: 'invalid' }], topic, now)).toEqual([])
  }
})

async function setup(page: Page) {
  const decisions: unknown[] = []
  let handled = false
  let loads = 0
  await page.addInitScript(() => {
    localStorage.setItem('wtt-web.locale', 'en')
    localStorage.removeItem('wtt_selected_topic_id')
    localStorage.removeItem('wtt_selected_agent_id')
  })
  await page.routeWebSocket('**', socket => socket.close())
  await page.route('**/api/auth/session', route => route.fulfill({ json: {
    user: { name: 'Approval Tester' }, userId: 'alice', accessToken: 'approval-fixture-token', expires: '2099-01-01T00:00:00Z',
  } }))
  await page.route('**/api/wtt/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/wtt', '')
    let value: unknown = []
    if (path === '/agents/my') value = [{ agent_id: agent, display_name: 'Claude Writer' }]
    else if (path === '/agents/stats') value = { online_agents: [agent], runtimes: {} }
    else if (path === '/hosts/my') value = { hosts: [{ host_id: 'host-fixture', display_name: 'Test Mac', status: 'online',
      agents: [{ agent_id: agent, display_name: 'Claude Writer', adapter: 'claude-code' }] }] }
    else if (path === '/topics/subscribed') value = [{ id: topic, topic_id: topic, name: 'Approval fixture', type: 'p2p' }]
    else if (path === `/topics/${topic}/messages`) value = [{ message_id: 'history', topic_id: topic, sender_id: agent,
      sender_type: 'agent', content: 'Approval fixture history', timestamp: new Date().toISOString() }]
    else if (path.endsWith('/members')) value = [{ agent_id: agent, display_name: 'Claude Writer', role: 'owner' }]
    else if (path === '/hosts/approvals') {
      loads++
      const serverNow = Date.now() + 600000
      value = handled ? [] : [{ ...approval, server_time: new Date(serverNow).toISOString(), expires_at: new Date(serverNow + 300000).toISOString() }]
    } else if (path.endsWith('/decision')) {
      expect(route.request().headers().authorization).toBe('Bearer approval-fixture-token')
      decisions.push(route.request().postDataJSON())
      handled = true
      value = {}
    } else if (path === '/billing/me') value = { entitlement: { plan: 'free' } }
    await route.fulfill({ json: value })
  })
  return { decisions, loads: () => loads }
}

for (const mobile of [false, true]) {
  test(`${mobile ? 'mobile' : 'desktop'} owner sees a private operation above the composer and approves once`, async ({ page }) => {
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 })
    const f = await setup(page)
    await page.goto(mobile ? `/mobile/feed?agent_id=${agent}&topic_id=${topic}` : `/desktop?legacy=1&agentId=${agent}&topic=${topic}`)
    const panel = page.getByRole('region', { name: 'Tool Approval', exact: true })
    await expect(panel).toBeVisible()
    await expect(panel.getByText('shasum -a 256 payload.bin', { exact: false })).toBeVisible()
    const scriptCount = await page.locator('script').count()
    expect(await page.locator('script').filter({ hasText: 'Not executable markup' }).count()).toBe(0)
    expect(scriptCount).toBeGreaterThan(0)
    const composer = page.locator('textarea').first()
    const a = await panel.boundingBox()
    const b = await composer.boundingBox()
    expect(a).not.toBeNull()
    expect(b).not.toBeNull()
    expect(a!.y + a!.height).toBeLessThanOrEqual(b!.y)
    expect(a!.x).toBeGreaterThanOrEqual(0)
    expect(a!.x + a!.width).toBeLessThanOrEqual(mobile ? 390 : 1440)
    await page.screenshot({ path: `test-results/tool-approval-${mobile ? 'mobile' : 'desktop'}.png` })
    await panel.getByRole('button', { name: 'Allow Once', exact: true }).click()
    await expect(panel).not.toBeVisible()
    expect(f.decisions).toEqual([{ decision: 'allow', input_sha256: approval.input_sha256 }])
    await page.waitForTimeout(500)
    const settledLoads = f.loads()
    await page.waitForTimeout(2500)
    expect(f.loads()).toBe(settledLoads)
  })
}

test('private approval inputs disappear when switching to another topic', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await setup(page)
  await page.goto(`/desktop?legacy=1&agentId=${agent}&topic=${topic}`)
  await expect(page.getByRole('region', { name: 'Tool Approval' })).toBeVisible()
  const next = '33333333-3333-4333-8333-333333333333'
  await page.goto(`/desktop?legacy=1&agentId=${agent}&topic=${next}`)
  await expect(page.getByRole('region', { name: 'Tool Approval' })).not.toBeVisible()
});
