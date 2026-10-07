import { expect, type Page, test } from '@playwright/test'

const agents = [
  { agent_id: 'agent-default', display_name: 'Default Agent' },
  { agent_id: 'agent-work', display_name: 'Work Agent' },
]
const topics = [
  { id: 'topic-default', name: 'Default conversation', topic_type: 'p2p', last_activity_at: '2026-10-08T01:00:00Z' },
  { id: 'topic-work', name: 'Retained conversation', topic_type: 'p2p', last_activity_at: '2026-10-07T01:00:00Z' },
]

async function fixture(page: Page) {
  const state = {
    user: 'alice', token: 'token-alice', failing: false, requests: 0, topicRequests: [] as string[],
    availableTopics: topics, historyTag: '', emptyHistory: false, nativeOnly: false, catalogRequests: [] as string[],
    historyTokens: [] as string[],
  }
  await page.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: '[]' }))
  await page.route('**/api/auth/session', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
    ...(state.nativeOnly ? {} : { userId: state.user }), user: { name: state.user }, accessToken: state.token, expires: '2099-01-01T00:00:00Z',
  }) }))
  await page.route('**/api/wtt/auth/me', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ user_id: state.user }) }))
  await page.route('**/api/wtt/agents/my', route => {
    state.requests++
    return route.fulfill({ status: state.failing ? 503 : 200, contentType: 'application/json', body: JSON.stringify(agents) })
  })
  await page.route('**/api/wtt/agents/stats', route => route.fulfill({ status: state.failing ? 503 : 200, contentType: 'application/json', body: JSON.stringify({
    online_agents: agents.map(agent => agent.agent_id), runtimes: {
      'agent-default': { hostname: 'Default host', adapter: 'codex' },
      'agent-work': { hostname: 'Work host', adapter: 'claude-code' },
    },
  }) }))
  await page.route('**/api/wtt/topics/subscribed**', route => {
    state.catalogRequests.push(new URL(route.request().url()).searchParams.get('agent_id') || '')
    return route.fulfill({ status: state.failing ? 503 : 200, contentType: 'application/json', body: JSON.stringify(state.availableTopics) })
  })
  await page.route('**/api/wtt/topics/my-recent**', route => route.fulfill({
    status: state.failing ? 503 : 200, contentType: 'application/json', body: '{"items":[]}',
  }))
  await page.route('**/api/wtt/topics/my-groups', route => route.fulfill({
    status: state.failing ? 503 : 200, contentType: 'application/json', body: '[]',
  }))
  await page.route('**/api/wtt/topics/*/messages**', route => {
    const id = new URL(route.request().url()).pathname.split('/').at(-2)!
    state.topicRequests.push(id)
    state.historyTokens.push(route.request().headers().authorization || '')
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(state.emptyHistory ? [] : [
      { id: `message-${id}`, topic_id: id, sender_id: 'agent-work', sender_type: 'agent', content: state.historyTag || `History ${id}`, created_at: '2026-10-08T00:00:00Z' },
    ]) })
  })
  return state
}

async function selectWorkConversation(page: Page) {
  await page.getByRole('button', { name: '选择主机 / Agent / Topic', exact: true }).click()
  await page.getByRole('button', { name: /Work host/ }).click()
  await page.getByRole('button', { name: /^Work Agent/ }).click()
  await page.getByRole('button', { name: /Retained conversation/ }).click()
  await expect(page.getByText('History topic-work', { exact: true })).toBeVisible()
}

test('restores the same account Agent and conversation after reload', async ({ page }) => {
  const state = await fixture(page)
  await page.goto('/mobile/feed')
  await expect(page.getByText('History topic-default', { exact: true })).toBeVisible()
  await selectWorkConversation(page)
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('wtt:mobile-selection:v1:alice') || '{}'))).toMatchObject({
    agentId: 'agent-work', topicId: 'topic-work',
  })
  state.topicRequests = []
  await page.reload()
  await expect(page.getByText('Work Agent', { exact: true })).toBeVisible()
  await expect.poll(() => state.topicRequests).toContain('topic-work')
  await expect(page.getByText('History topic-work', { exact: true })).toBeVisible()
  await expect(page.getByText('History topic-default', { exact: true })).toHaveCount(0)
  await page.screenshot({ path: test.info().outputPath('restored-selection.png') })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
})

test('does not reset the active directory or history on a transient API error', async ({ page }) => {
  const state = await fixture(page)
  await page.goto('/mobile/feed')
  await selectWorkConversation(page)
  state.failing = true
  const previousRequests = state.requests
  await page.waitForResponse(response => response.url().endsWith('/agents/my') && response.status() === 503, { timeout: 20_000 })
  expect(state.requests).toBeGreaterThan(previousRequests)
  await expect(page.getByText('Work Agent', { exact: true })).toBeVisible()
  await expect(page.getByText('History topic-work', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '重新加载目录', exact: true })).toBeVisible()
  state.failing = false
  await page.getByRole('button', { name: '重新加载目录', exact: true }).click()
  await expect(page.getByRole('button', { name: '重新加载目录', exact: true })).toHaveCount(0)
  await expect(page.getByText('History topic-work', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '选择主机 / Agent / Topic', exact: true }).click()
  await expect(page.getByRole('button', { name: /Work host/ })).toBeVisible()
})

test('account changes do not restore another account selection', async ({ page }) => {
  const state = await fixture(page)
  await page.goto('/mobile/feed')
  await selectWorkConversation(page)
  state.user = 'bob'
  state.token = 'token-bob'
  state.topicRequests = []
  await page.reload()
  await expect(page.getByText('History topic-default', { exact: true })).toBeVisible()
  expect(state.topicRequests).not.toContain('topic-work')
  state.user = 'alice'
  state.token = 'token-alice-renewed'
  await page.reload()
  await expect(page.getByText('History topic-work', { exact: true })).toBeVisible()
})

test('explicit Agent/topic links and fixed chat override remembered selection', async ({ page }) => {
  await fixture(page)
  await page.goto('/mobile/feed')
  await selectWorkConversation(page)
  await page.goto('/mobile/feed?agent_id=agent-default&topic_id=topic-default')
  await expect(page.getByText('History topic-default', { exact: true })).toBeVisible()
  await page.goto('/mobile/feed?fixed_chat=1&agent_id=agent-work&topic_id=topic-work')
  await expect(page.getByText('History topic-work', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '选择主机 / Agent / Topic', exact: true })).toHaveCount(0)
  await page.goto('/mobile/feed')
  await expect(page.getByText('History topic-default', { exact: true })).toBeVisible()
})

test('cached history cannot appear in another account even for the same allowed topic', async ({ page }) => {
  const state = await fixture(page)
  state.historyTag = 'Alice private history'
  await page.goto('/mobile/feed')
  await expect(page.getByText('Alice private history', { exact: true })).toBeVisible()
  state.user = 'bob'
  state.token = 'token-bob'
  state.emptyHistory = true
  await page.reload()
  await expect(page.getByText('Default conversation', { exact: true })).toBeVisible()
  await expect.poll(() => state.topicRequests.length).toBeGreaterThan(1)
  await expect(page.getByText('Alice private history', { exact: true })).toHaveCount(0)
})

test('an inaccessible remembered Agent/topic never triggers a history request', async ({ page }) => {
  const state = await fixture(page)
  await page.addInitScript(() => localStorage.setItem('wtt:mobile-selection:v1:alice', JSON.stringify({
    version: 1, agentId: 'agent-revoked', topicId: 'topic-revoked',
  })))
  await page.goto('/mobile/feed')
  await expect(page.getByText('History topic-default', { exact: true })).toBeVisible()
  expect(state.topicRequests).not.toContain('topic-revoked')
})

test('an inaccessible remembered topic under an allowed Agent is validated before reading', async ({ page }) => {
  const state = await fixture(page)
  await page.addInitScript(() => localStorage.setItem('wtt:mobile-selection:v1:alice', JSON.stringify({
    version: 1, agentId: 'agent-work', topicId: 'topic-revoked',
  })))
  await page.goto('/mobile/feed')
  await expect(page.getByText('Work Agent', { exact: true })).toBeVisible()
  await expect(page.getByText('History topic-default', { exact: true })).toBeVisible()
  expect(state.topicRequests).not.toContain('topic-revoked')
})

test('no accessible topics leave the composer disabled rather than restoring a revoked topic', async ({ page }) => {
  const state = await fixture(page)
  state.availableTopics = []
  await page.addInitScript(() => localStorage.setItem('wtt:mobile-selection:v1:alice', JSON.stringify({
    version: 1, agentId: 'agent-work', topicId: 'topic-revoked',
  })))
  await page.goto('/mobile/feed')
  await expect(page.getByText('Work Agent', { exact: true })).toBeVisible()
  await page.locator('textarea').fill('must not send')
  await expect(page.getByRole('button', { name: '发送消息', exact: true })).toBeDisabled()
  expect(state.topicRequests).toHaveLength(0)
})

test('legacy access-token sessions resolve account identity without persisting the token', async ({ page }) => {
  const state = await fixture(page)
  state.nativeOnly = true
  await page.goto('/mobile/feed')
  await selectWorkConversation(page)
  await page.reload()
  await expect(page.getByText('History topic-work', { exact: true })).toBeVisible()
  const saved = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith('wtt:mobile-selection:')))
  expect(saved).toHaveLength(1)
  expect(saved[0][0]).toBe('wtt:mobile-selection:v1:alice')
  expect(JSON.stringify(saved)).not.toContain(state.token)
})

test('unavailable selection storage does not prevent choosing or chatting', async ({ page }) => {
  await fixture(page)
  await page.addInitScript(() => {
    const get = Storage.prototype.getItem
    const set = Storage.prototype.setItem
    Storage.prototype.getItem = function (key) {
      if (key.startsWith('wtt:mobile-selection:')) throw new Error('Storage unavailable')
      return get.call(this, key)
    }
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('wtt:mobile-selection:')) throw new Error('Storage unavailable')
      return set.call(this, key, value)
    }
  })
  await page.goto('/mobile/feed')
  await selectWorkConversation(page)
  await expect(page.getByText('History topic-work', { exact: true })).toBeVisible()
})

test('a delayed group directory cannot overwrite a remembered group with the first task', async ({ page }) => {
  const state = await fixture(page)
  let releaseGroup: () => void = () => {}
  const groupReady = new Promise<void>(resolve => { releaseGroup = resolve })
  await page.route('**/api/wtt/topics/my-groups', async route => {
    await groupReady
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify([
      { id: 'topic-group', name: 'Retained group', topic_type: 'collaborative', last_activity_at: '2026-10-06T01:00:00Z' },
    ]) })
  })
  await page.addInitScript(() => localStorage.setItem('wtt:mobile-selection:v1:alice', JSON.stringify({
    version: 1, agentId: 'agent-work', topicId: 'topic-group',
  })))
  await page.goto('/mobile/feed')
  await expect.poll(() => state.catalogRequests).toContain('agent-work')
  expect(state.topicRequests).toHaveLength(0)
  releaseGroup()
  await expect(page.getByText('History topic-group', { exact: true })).toBeVisible()
  expect(state.topicRequests).not.toContain('topic-default')
})

test('malformed selection data falls back safely on a narrow viewport', async ({ page }) => {
  await fixture(page)
  await page.addInitScript(() => {
    if (localStorage.getItem('wtt:mobile-selection:v1:alice') === null) localStorage.setItem('wtt:mobile-selection:v1:alice', '{invalid-json')
  })
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('/mobile/feed')
  await expect(page.getByText('History topic-default', { exact: true })).toBeVisible()
  await selectWorkConversation(page)
  await page.reload()
  await expect(page.getByText('History topic-work', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  await page.screenshot({ path: test.info().outputPath('restored-selection-narrow.png') })
})

for (const legacy of [false, true]) {
  test(`token renewal keeps the active conversation and draft (${legacy ? 'legacy' : 'Web'} identity)`, async ({ page }) => {
    const state = await fixture(page)
    state.nativeOnly = legacy
    await page.goto('/mobile/feed')
    await selectWorkConversation(page)
    await page.locator('textarea').fill('Draft must survive token renewal')
    state.token = 'token-alice-renewed-in-place'
    await page.clock.install()
    await page.clock.fastForward(2000)
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await expect.poll(() => state.historyTokens).toContain('Bearer token-alice-renewed-in-place')
    await expect(page.getByText('History topic-work', { exact: true })).toBeVisible()
    await expect(page.locator('textarea')).toHaveValue('Draft must survive token renewal')
  })
}
