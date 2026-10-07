import { expect, test, type Page } from '@playwright/test'
import { _electron } from 'playwright'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function setup(page: Page, { disabled = false, dark = false, locale = 'en' } = {}) {
  const sent: Array<{ path: string; body: Record<string, unknown> }> = []
  await page.addInitScript(({ dark, locale }) => {
    localStorage.setItem('theme', dark ? 'dark' : 'light')
    localStorage.setItem('wtt-web.locale', locale)
    localStorage.removeItem('wtt_selected_topic_id')
    localStorage.removeItem('wtt_selected_agent_id')
  }, { dark, locale })
  await page.routeWebSocket('**', socket => socket.close())
  await page.route('**/api/auth/session', route => route.fulfill({ json: {
    user: { name: 'Workspace Tester', email: 'workspace@example.test' }, accessToken: 'workspace-fixture-token', expires: '2099-01-01T00:00:00Z',
  } }))
  await page.route('**/api/wtt/**', async route => {
    const url = new URL(route.request().url())
    const path = url.pathname.replace('/api/wtt', '')
    const agentId = url.searchParams.get('agent_id') || 'agent-one'
    const agent = agentId === 'agent-two' ? 'two' : 'one'
    let value: unknown = {}
    if (path === '/agents/my') value = [
      { agent_id: 'agent-one', display_name: 'Codex Engineer' },
      { agent_id: 'agent-two', display_name: 'Claude Writer' },
    ]
    else if (path === '/agents/stats') value = { online_agents: ['agent-one'], runtimes: {} }
    else if (path === '/hosts/my') {
      if (disabled) return route.fulfill({ status: 404, json: { detail: 'Not enabled' } })
      value = { hosts: [
        { host_id: 'host-one', display_name: 'MacBook Pro', status: 'online', platform: 'darwin', environment: 'native', client_version: 'fixture', agents: [{ agent_id: 'agent-one', display_name: 'Codex Engineer', adapter: 'codex' }] },
        { host_id: 'host-two', display_name: 'Linux Workstation', status: 'offline', platform: 'linux', environment: 'native', client_version: 'fixture', agents: [{ agent_id: 'agent-two', display_name: 'Claude Writer', adapter: 'claude-code' }] },
      ], next_offset: null }
    } else if (path === '/topics/subscribed') value = [{ id: `topic-${agent}`, topic_id: `topic-${agent}`, name: agent === 'one' ? 'Website implementation' : 'Release notes', topic_type: 'p2p' }]
    else if (path === '/topics/my-groups') value = [{ id: 'topic-group', topic_id: 'topic-group', name: 'Product team', topic_type: 'discussion' }]
    else if (path === '/topics/my-recent') value = { items: [
      { topic_id: 'topic-two', topic_name: 'Release notes', primary_agent_id: 'agent-two', agent_ids: ['agent-two'] },
      { topic_id: 'topic-one', topic_name: 'Website implementation', primary_agent_id: 'agent-one', agent_ids: ['agent-one'] },
    ] }
    else if (/^\/topics\/[^/]+\/messages$/.test(path)) {
      const topicId = path.split('/')[2]
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON()
        sent.push({ path, body })
        value = { message_id: 'sent-message', topic_id: topicId, sender_id: 'workspace@example.test', sender_type: 'human', content: body.content, timestamp: new Date().toISOString() }
      } else value = [{ message_id: `message-${topicId}`, topic_id: topicId, sender_id: topicId === 'topic-two' ? 'agent-two' : 'agent-one', sender_type: 'agent', content: `Verified history for ${topicId}`, timestamp: '2026-10-07T00:00:00Z' }]
    } else if (path.endsWith('/members')) value = [{ agent_id: agentId, display_name: 'Engineer', role: 'owner' }]
    else if (path === '/billing/me') value = { entitlement: { plan: 'free' } }
    else if (path.startsWith('/tasks') || path.startsWith('/p2p-requests') || path.startsWith('/agent-operations')) value = []
    else if (path === '/messages/p2p') value = { topic_id: 'topic-one' }
    await route.fulfill({ json: value })
  })
  return sent
}

test('desktop directory opens shared chat, recent cross-agent history and group deep links', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await setup(page)
  await page.goto('/desktop?agentId=agent-one&topic=topic-one')
  await expect(page.getByText('Verified history for topic-one')).toBeVisible()
  const navigation = page.locator('aside nav')
  await expect(navigation.getByText('MacBook Pro', { exact: true })).toBeVisible()
  await expect(navigation.getByText('Linux Workstation', { exact: true })).toBeVisible()
  await navigation.getByRole('region', { name: 'Recent', exact: true }).getByRole('link', { name: /Release notes/ }).click()
  await expect(page).toHaveURL(/agentId=agent-two.*topic=topic-two/)
  await expect(page.getByText('Verified history for topic-two')).toBeVisible()
  await expect(page.getByText('Verified history for topic-one')).not.toBeVisible()
  await navigation.getByRole('region', { name: 'Groups & teams' }).getByRole('link', { name: 'Product team' }).click()
  await expect(page.getByText('Verified history for topic-group')).toBeVisible()
  await page.reload()
  await expect(page.getByText('Verified history for topic-group')).toBeVisible()
  await page.screenshot({ path: 'test-results/desktop-workspace-light.png', fullPage: true })
})

test('desktop shares the original composer and posts to the selected topic', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  const sent = await setup(page)
  await page.goto('/desktop?agentId=agent-one&topic=topic-one')
  await expect(page.getByText('Verified history for topic-one')).toBeVisible()
  const composer = page.locator('textarea').first()
  await composer.fill('Please inspect the project')
  await composer.press('Enter')
  await expect.poll(() => sent.length).toBe(1)
  expect(sent[0]).toMatchObject({ path: '/topics/topic-one/messages', body: { content: 'Please inspect the project' } })
})

test('desktop sidebar resizes with pointer and keyboard and filters without changing the selected chat', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await setup(page)
  await page.goto('/desktop?agentId=agent-one&topic=topic-one')
  await expect(page.getByText('Verified history for topic-one')).toBeVisible()
  const separator = page.getByRole('separator', { name: 'Resize navigation' })
  await expect(separator).toHaveAttribute('aria-valuenow', '288')
  const box = await separator.boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + 200)
  await page.mouse.down()
  await page.mouse.move(box!.x + box!.width / 2 + 48, box!.y + 200)
  await page.mouse.up()
  await expect(separator).toHaveAttribute('aria-valuenow', '336')
  await separator.focus()
  await page.keyboard.press('Home')
  await expect(separator).toHaveAttribute('aria-valuenow', '240')
  await page.keyboard.press('ArrowRight')
  await expect(separator).toHaveAttribute('aria-valuenow', '256')
  await page.keyboard.press('End')
  await expect(separator).toHaveAttribute('aria-valuenow', '400')
  await page.keyboard.press('ArrowRight')
  await expect(separator).toHaveAttribute('aria-valuenow', '400')
  const sidebar = page.locator('aside').first()
  await sidebar.getByRole('searchbox').fill('Claude')
  await expect(sidebar.getByRole('region', { name: 'Computers & agents' }).getByRole('link', { name: /Claude Writer/ })).toBeVisible()
  await expect(sidebar.getByRole('region', { name: 'Computers & agents' }).getByRole('link', { name: /Codex Engineer/ })).toHaveCount(0)
  await expect(page.getByText('Verified history for topic-one')).toBeVisible()
  await expect(page.locator('.wtt-chat-view')).toHaveAttribute('data-appearance', 'desktop')
  expect(await page.locator('.wtt-message-bubble').first().evaluate(element => getComputedStyle(element).letterSpacing)).toBe('normal')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('ordinary feed retains the original shell and chat appearance', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await setup(page)
  await page.goto('/feed?agentId=agent-one&topic=topic-one')
  await expect(page.getByText('Verified history for topic-one')).toBeVisible()
  await expect(page.getByTestId('desktop-workspace')).toHaveCount(0)
  await expect(page.locator('.wtt-chat-view')).toHaveAttribute('data-appearance', 'default')
})

test('desktop keeps existing agents usable when new host service is disabled', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await setup(page, { disabled: true })
  await page.goto('/desktop?agentId=agent-one&topic=topic-one')
  await expect(page.getByText('Verified history for topic-one')).toBeVisible()
  await expect(page.locator('aside nav').getByRole('link', { name: /Claude Writer/ }).first()).toBeVisible()
  await expect(page.locator('aside nav').getByRole('alert')).toHaveCount(0)
  await page.locator('aside').getByRole('button', { name: 'Collapse navigation' }).click()
  await expect(page.locator('aside')).toHaveCount(0)
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await expect(page.locator('aside')).toBeVisible()
})

test('narrow dark workspace drawer closes with Escape and content does not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setup(page, { dark: true, locale: 'zh' })
  await page.goto('/desktop?agentId=agent-one&topic=topic-one')
  await expect(page.getByText('Verified history for topic-one')).toBeVisible()
  await page.getByRole('button', { name: '展开导航' }).click()
  const dialog = page.getByRole('dialog', { name: '工作区导航' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('MacBook Pro', { exact: true })).toBeVisible()
  const settings = await dialog.getByRole('link', { name: '主机设置' }).boundingBox()
  const close = await dialog.getByRole('button', { name: '关闭导航' }).boundingBox()
  expect(settings && close && settings.x + settings.width <= close.x).toBe(true)
  await page.screenshot({ path: 'test-results/desktop-workspace-narrow-dark.png', fullPage: true })
  await dialog.getByRole('button', { name: '关闭导航' }).click()
  await expect(dialog).not.toBeVisible()
  await page.getByRole('button', { name: '展开导航' }).click()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('packaged Electron renders the actual shared workspace and sends from its composer', async ({ baseURL }) => {
  test.skip(!process.env.WTT_TEST_ELECTRON_EXECUTABLE, 'Set an explicit packaged Electron executable for native UI verification')
  test.setTimeout(60_000)
  const directory = await mkdtemp(join(tmpdir(), 'wtt-workspace-electron-'))
  let application: Awaited<ReturnType<typeof _electron.launch>> | undefined
  try {
    await writeFile(join(directory, 'config.json'), JSON.stringify({ frontendUrl: baseURL, apiUrl: baseURL, notificationsEnabled: false }))
    const env: Record<string, string> = { WTT_DESKTOP_HOSTS_ENABLED: '0' }
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined && !['ELECTRON_RUN_AS_NODE', 'WTT_DESKTOP_HOSTS_ENABLED'].includes(key)) env[key] = value
    }
    application = await _electron.launch({ executablePath: process.env.WTT_TEST_ELECTRON_EXECUTABLE, args: [`--user-data-dir=${directory}`], env })
    const page = await application.firstWindow()
    const sent = await setup(page)
    await page.goto(`${baseURL}/desktop?agentId=agent-one&topic=topic-one`)
    await expect(page.getByText('Verified history for topic-one')).toBeVisible()
    expect(await application.evaluate(({ app }) => app.isPackaged)).toBe(true)
    expect(await application.evaluate(({ app }) => app.getPath('userData'))).toBe(directory)
    expect(await page.evaluate(() => typeof window.wttDesktop?.host?.status)).toBe('function')
    expect(await page.evaluate(() => typeof (window as unknown as { require?: unknown }).require)).toBe('undefined')
    const composer = page.locator('textarea').first()
    await composer.fill('Packaged desktop UI verification')
    await composer.press('Enter')
    await expect.poll(() => sent.length).toBe(1)
    expect(sent[0]).toMatchObject({ path: '/topics/topic-one/messages', body: { content: 'Packaged desktop UI verification' } })
    const recent = page.locator('aside nav').getByRole('region', { name: 'Recent', exact: true })
    await recent.getByRole('link', { name: /Release notes/ }).click()
    await expect(page.getByText('Verified history for topic-two')).toBeVisible()
    await expect(page.getByText('Verified history for topic-one')).not.toBeVisible()
    await page.screenshot({ path: 'test-results/desktop-workspace-packaged-electron.png', fullPage: true })
  } finally {
    if (application) await application.close()
    await rm(directory, { recursive: true, force: true })
  }
})
