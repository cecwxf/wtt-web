import { expect, test } from '@playwright/test'

const topic = '11111111-1111-4111-8111-111111111111'
const workspace = '22222222-2222-4222-8222-222222222222'
const session = '33333333-3333-4333-8333-333333333333'
const host = '44444444-4444-4444-8444-444444444444'
const root = '55555555-5555-4555-8555-555555555555'
const topicName = 'Workspace product acceptance across multiple Agent adapters with a long project name / Independent execution session 20261009'
const agents = [{ agent_id: 'agent-one', display_name: 'Engineer' }, { agent_id: 'agent-two', display_name: 'Reviewer' }]
const participants = agents.map((agent, index) => ({
  participant_id: String(index), label: agent.display_name, host_id: host, host_name: 'Test Mac',
  adapter: index ? 'claude-code' : 'codex', profile_id: String(index), transport_agent_id: agent.agent_id,
}))
const project = { workspace_id: workspace, root_id: root, host_id: host, name: 'Status project', access: 'workspace-write', root_revoked: false,
  sessions: [{ session_id: session, topic_id: topic, name: 'Collaboration', participants }] }

function execution(index: number, agentId: string, state: string, hour: number, canCancel = false) {
  return { execution_id: `66666666-6666-4666-8666-${String(index).padStart(12, '0')}`,
    message_id: `77777777-7777-4777-8777-${String(index).padStart(12, '0')}`,
    topic_id: topic, agent_id: agentId, state, revision: 1, stale: false, can_cancel: canCancel,
    created_at: `2026-10-09T${String(hour).padStart(2, '0')}:00:00Z`, updated_at: '2026-10-09T15:00:00Z',
  }
}

for (const mobile of [false, true]) {
  test(`${mobile ? 'mobile Chinese dark' : 'desktop English light'} execution summary retains every unresolved operation without stale failure clutter`, async ({ page }) => {
    const actions: string[] = []
    const queued = Array.from({ length: 8 }, (_, index) => execution(index + 1, 'agent-one', 'queued', 13, true))
    const rows = [
      ...queued,
      execution(20, 'agent-one', 'failed', 10),
      execution(21, 'agent-one', 'succeeded', 14),
      execution(22, 'agent-two', 'succeeded', 14),
      execution(23, 'agent-two', 'succeeded', 9),
      execution(24, 'agent-one', 'interrupted', 11),
      { ...execution(25, 'agent-two', 'failed', 12), session_recovery: true, can_restart_session: true },
    ]
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 })
    await page.addInitScript(({ mobile }) => {
      localStorage.setItem('wtt-web.locale', mobile ? 'zh' : 'en')
      localStorage.setItem('theme', mobile ? 'dark' : 'light')
    }, { mobile })
    await page.routeWebSocket('**', socket => socket.close())
    await page.route('**/api/auth/session', route => route.fulfill({ json: {
      userId: host, user: { id: host, name: 'Status Tester' }, accessToken: 'synthetic-status-token', expires: '2099-01-01T00:00:00Z',
    } }))
    await page.route('**/api/wtt/**', async route => {
      const path = new URL(route.request().url()).pathname.replace('/api/wtt', '')
      let value: unknown = []
      if (path === '/hosts/my') value = { hosts: [{ host_id: host, display_name: 'Test Mac', status: 'online', agents: participants.map(p => ({
        agent_id: p.transport_agent_id, display_name: p.label, profile_id: p.profile_id, adapter: p.adapter, capabilities: { workspace_projects: true },
      })) }], next_offset: null }
      else if (path === '/workspaces') value = { workspaces: [project], next_offset: null }
      else if (path === `/workspaces/${workspace}`) value = project
      else if (path === '/workspaces/roots') value = { roots: [] }
      else if (path === '/agents/my') value = agents
      else if (path === '/agents/stats') value = { online_agents: agents.map(a => a.agent_id), runtimes: {} }
      else if (path === '/topics/subscribed' || path === '/topics/my-groups') value = [{ id: topic, topic_id: topic, name: topicName, topic_type: 'discussion', member_agent_ids: agents.map(a => a.agent_id) }]
      else if (path.endsWith('/members')) value = agents.map(a => ({ ...a, role: 'member' }))
      else if (path.endsWith('/messages')) value = [{ id: 'history', topic_id: topic, sender_id: 'agent-one', sender_type: 'agent', content: 'Stored conversation unchanged', timestamp: '2026-10-09T10:00:00Z' }]
      else if (path === '/topics/my-recent') value = { items: [] }
      else if (path === '/billing/me') value = { entitlement: { plan: 'free' } }
      else if (path === '/hosts/chat-executions') value = rows
      else if (path.endsWith('/cancel') && route.request().method() === 'POST') {
        actions.push(path)
        const index = rows.findIndex(row => path.includes(row.execution_id))
        expect(index).toBeGreaterThanOrEqual(0)
        rows[index] = { ...rows[index], state: 'cancelled', can_cancel: false, revision: 2 }
        value = rows[index]
      }
      await route.fulfill({ json: value })
    })
    await page.goto(`${mobile ? '/mobile/workspaces' : '/desktop'}?workspace=${workspace}&session=${session}&topic=${topic}&agentId=agent-one`)
    await expect(page.getByText('Stored conversation unchanged', { exact: true })).toBeVisible()
    const panel = page.getByRole('region', { name: mobile ? '执行状态' : 'Executions', exact: true })
    const current = panel.getByTestId('current-executions')
    await expect(current.getByText(mobile ? '完成' : 'Completed', { exact: true })).toHaveCount(2)
    await expect(current.getByText(mobile ? '失败' : 'Failed', { exact: true })).toHaveCount(0)
    await expect(current.getByText(mobile ? '执行中断，结果待核对' : 'Interrupted; result uncertain', { exact: true })).toHaveCount(1)
    await expect(current.getByText(mobile ? '原生会话无法恢复，历史已保留' : 'Native session unavailable; history preserved', { exact: true })).toHaveCount(1)
    const stops = current.getByRole('button', { name: mobile ? '停止 Engineer' : 'Stop Engineer', exact: true })
    await expect(stops).toHaveCount(8)
    const composer = page.locator('textarea').first()
    await expect(composer).toHaveValue('')
    await expect.poll(async () => (await composer.boundingBox())!.height).toBeLessThanOrEqual(40)
    await expect(composer).toHaveAttribute('placeholder', mobile ? '发送消息' : 'Message')
    await expect(composer).toHaveAttribute('aria-label', new RegExp(topicName))
    await composer.fill('A multiline draft\nSecond line\nThird line\nFourth line\nFifth line\nSixth line')
    await expect(composer).toHaveCSS('overflow-y', 'auto')
    await expect.poll(async () => (await composer.boundingBox())!.height).toBeLessThanOrEqual(80)
    await composer.fill('')
    await expect.poll(async () => (await composer.boundingBox())!.height).toBeLessThanOrEqual(40)
    await composer.fill('Keep this unsent draft')
    await panel.locator('summary').click()
    await expect(panel.getByText(mobile ? '失败' : 'Failed', { exact: true })).toBeVisible()
    await expect(composer).toHaveValue('Keep this unsent draft')
    await panel.locator('summary').click()
    await stops.last().click()
    await expect.poll(() => actions).toEqual([`/hosts/chat-executions/${queued[7].execution_id}/cancel`])
    await expect(stops).toHaveCount(7)
    await current.getByRole('button', { name: mobile ? 'Reviewer 新会话继续' : 'Continue Reviewer in a new session', exact: true }).click()
    await expect(panel.getByText(mobile ? /只重置原生上下文/ : /Native context will reset/)).toBeVisible()
    await panel.getByRole('button', { name: mobile ? '取消' : 'Cancel', exact: true }).click()
    await expect(composer).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const a = await panel.boundingBox()
    const b = await composer.boundingBox()
    expect(a!.y + a!.height).toBeLessThanOrEqual(b!.y)
    expect(a!.height).toBeLessThanOrEqual(144)
    await page.screenshot({ path: `test-results/execution-summary-${mobile ? 'mobile-zh-dark' : 'desktop-en-light'}.png` })
  })
}
