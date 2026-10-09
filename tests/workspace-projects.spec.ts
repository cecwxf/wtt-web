import { test, expect, type Page, type WebSocketRoute } from '@playwright/test'
import { _electron } from 'playwright'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createReadStream } from 'node:fs'

const host = '11111111-1111-4111-8111-111111111111'
const root = '22222222-2222-4222-8222-222222222222'
const participants = [
  { participant_id: 'one', label: 'Engineer', host_id: host, host_name: 'MacBook', adapter: 'codex', profile_id: 'codex', transport_agent_id: 'agent-one' },
  { participant_id: 'two', label: 'Reviewer', host_id: 'remote', host_name: 'Linux', adapter: 'claude-code', profile_id: 'claude', transport_agent_id: 'agent-two' },
]

async function workspaceFlow(page: Page, baseURL = '', entryPath = '/desktop', singleAgent = false, adapterEntry?: 'setup' | 'onboarding' | 'onboarding-profile') {
  const created: Array<{ path: string; body: any }> = []
  const projects: any[] = []
  const terminalActions: Array<{ url: string; body: any }> = []
  let previewRunning = false
  let adaptersOnline = true
  let feedEnabled = false
  let feedSocket: WebSocketRoute | undefined
  const loadedHostOffsets: number[] = []
  const nativeDownloads: Array<{ workspaceId?: string; agentId?: string; path: string; accessToken?: string }> = []
  const nativeNotices: Array<{ userId: string; topicId: string; agentId: string; messageId: string }> = []
  const nativeSelections: unknown[] = []
  if (adapterEntry?.startsWith('onboarding')) await page.exposeFunction('observeOnboardingSelection', (selection: unknown) => nativeSelections.push(selection))
  if (adapterEntry?.startsWith('onboarding')) await page.addInitScript(({ hostId, byProfile }) => {
    let runtime: any = { state: 'stopped', agents: [] }
    const listeners = new Set<(state: unknown) => void>()
    const status = () => ({ enabled: true, accountVerified: true, state: 'registered', hostId, userId: hostId })
    ;(window as any).wttDesktop = { isDesktop: true, platform: 'darwin', host: {
      status: async () => status(), resume: async () => status(), profileManagementSupported: byProfile,
      runtimeStatus: async () => runtime,
      onRuntimeState: (listener: (state: unknown) => void) => { listeners.add(listener); return () => listeners.delete(listener) },
      discoverAgents: async () => [
        { profile_id: 'codex', adapter: 'codex', display_name: 'Codex', available: true, version: 'fixture', requiresFullAccess: false },
        ...(byProfile ? [{ profile_id: 'codex-secondary', adapter: 'codex', display_name: 'Codex 2', available: true, version: 'fixture', requiresFullAccess: false }] : []),
      ],
      ...(byProfile ? { selectAgentWorkspace: async (profileId: string) => ({ adapter: 'codex', profileId, workspaceName: 'Secondary directory' }) } : {}),
      startAgents: async (selection: unknown) => {
        await (window as any).observeOnboardingSelection(selection)
        runtime = { state: 'running', configuredAdapters: ['codex'], agents: [{ profileId: 'codex', adapter: 'codex', agentId: 'agent-one', state: 'online' }] }
        listeners.forEach(listener => listener(runtime))
        return runtime
      },
    } }
  }, { hostId: host, byProfile: adapterEntry === 'onboarding-profile' })
  if (entryPath === '/mobile/workspaces') {
    await page.exposeFunction('observeNativeWorkspaceDownload', (request: typeof nativeDownloads[number]) => nativeDownloads.push(request))
    await page.exposeFunction('observeNativeWorkspaceNotice', (notice: typeof nativeNotices[number]) => nativeNotices.push(notice))
    await page.addInitScript(() => {
      ;(window as any).__WTT_NATIVE_NOTIFICATIONS__ = {
        version: 1,
        show: async (notice: unknown) => {
          await (window as any).observeNativeWorkspaceNotice(notice)
          return { shown: true }
        },
      }
      ;(window as any).__WTT_NATIVE_FILES__ = {
        version: 2,
        download: async (request: unknown, progress: (value: { loaded: number; total: number }) => void) => {
          await (window as any).observeNativeWorkspaceDownload(request)
          progress({ loaded: 27, total: 27 })
        },
        cancel: () => {},
      }
    })
  }
  await page.addInitScript(() => {
    localStorage.setItem('wtt-web.locale', 'en')
    if (!sessionStorage.getItem('workspace-fixture-initialized')) {
      localStorage.removeItem('wtt_selected_topic_id'); localStorage.removeItem('wtt_selected_agent_id')
      sessionStorage.setItem('workspace-fixture-initialized', '1')
    }
  })
  await page.routeWebSocket('**', socket => {
    if (!socket.url().includes('/ws/agent-root-relay')) {
      if (!feedEnabled) { socket.close(); return }
      feedSocket = socket
      socket.onMessage(raw => { if (raw === 'ping') socket.send('pong') })
      return
    }
    socket.onMessage(raw => {
      const body = JSON.parse(String(raw)); terminalActions.push({ url: socket.url(), body })
      if (body.request_id) socket.send(JSON.stringify({ type: 'action_result', request_id: body.request_id, ok: true, data: { session_id: 'project-terminal' } }))
      if (body.action === 'terminal_open') socket.send(JSON.stringify({ type: 'terminal_output', session_id: 'project-terminal', data: 'Canonical Workspace terminal ready\r\n' }))
    })
  })
  await page.route('https://workspace-ui.trycloudflare.com/**', route => route.fulfill({ contentType: 'text/html', body: '<main>Workspace development site</main>' }))
  await page.route('**/api/auth/session', route => route.fulfill({ json: { userId: host, user: { id: host, name: 'Workspace Tester', email: 'workspace@example.test' }, accessToken: 'synthetic-user-token', expires: '2099-01-01T00:00:00Z' } }))
  await page.route('**/api/wtt/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/wtt', '')
    let value: any = {}
    if (path === '/hosts/my') {
      const offset = Number(new URL(route.request().url()).searchParams.get('offset') || 0)
      loadedHostOffsets.push(offset)
      const participant = offset === 0 ? participants[0] : offset === 200 ? participants[1] : undefined
      value = { hosts: participant ? [{ host_id: participant.host_id, display_name: participant.host_name, status: 'online', agents: [{ agent_id: participant.transport_agent_id, profile_id: participant.profile_id, display_name: participant.label, adapter: participant.adapter, capabilities: { workspace_projects: true, workspace_mcp: true } }] }] : [{ host_id: `empty-host-${offset}`, display_name: `Computer ${offset}`, status: 'offline', agents: [] }], next_offset: offset < 200 ? offset + 50 : null }
    }
    else if (path === '/workspaces/roots') value = { roots: [{ root_id: root, host_id: host, host_name: 'MacBook', name: 'Website source', access: 'workspace-write' }] }
    else if (path === '/workspaces' && route.request().method() === 'GET') value = { workspaces: projects, next_offset: null }
    else if (path === '/workspaces' && route.request().method() === 'POST') {
      const body = route.request().postDataJSON(); created.push({ path, body }); value = { ...body, host_id: host, access: 'workspace-write', sessions: [] }; projects.push(value)
    } else if (/^\/workspaces\/[^/]+\/sessions$/.test(path)) {
      const body = route.request().postDataJSON(); created.push({ path, body })
      value = { ...body, topic_id: projects[0].sessions.length ? `project-topic-${projects[0].sessions.length + 1}` : 'project-topic', participants: body.participants.map((item: any) => ({ ...participants.find(p => p.host_id === item.host_id && p.profile_id === item.profile_id), label: item.label })) }
      projects[0].sessions.push(value)
    } else if (/^\/workspaces\/[^/]+\/tools$/.test(path)) value = { files: 'workspace-write', terminal: true, terminal_agent_id: 'agent-root-relay', host_name: 'MacBook', preview_agent_id: 'agent-root-relay', preview_ports: [38765] }
    else if (/^\/workspaces\/[^/]+\/preview$/.test(path)) {
      const body = route.request().postDataJSON(); created.push({ path, body })
      if (body.operation === 'preview_start') previewRunning = true
      if (body.operation === 'preview_stop') previewRunning = false
      value = { state: previewRunning ? 'ready' : 'stopped', port: 38765, ...(previewRunning ? { url: 'https://workspace-ui.trycloudflare.com', expires_at: new Date(Date.now() + 900000).toISOString() } : {}) }
    }
    else if (/^\/workspaces\/[^/]+$/.test(path)) value = projects.find(project => path.endsWith(project.workspace_id)) || {}
    else if (path.endsWith('/workspace/list')) value = { root: 'Workspace', path: '.', entries: [{ name: 'README.md', path: 'README.md', type: 'file', size: 27 }] }
    else if (path.endsWith('/workspace/read')) value = { name: 'README.md', path: 'README.md', content: 'Canonical project directory', preview_kind: 'text', previewable: true, editable: true, content_type: 'text/markdown' }
    else if (path.endsWith('/workspace/stat')) value = { name: 'README.md', size: 27, content_type: 'text/markdown' }
    else if (path.endsWith('/workspace/content')) { await route.fulfill({ contentType: 'text/markdown', body: 'Canonical project directory' }); return }
    else if (path === '/agents/my') value = participants.map(p => ({ agent_id: p.transport_agent_id, display_name: p.label }))
    else if (path === '/agents/stats') value = { online_agents: adaptersOnline ? participants.map(p => p.transport_agent_id) : [], runtimes: {} }
    else if (path === '/topics/subscribed' || path === '/topics/my-groups') value = projects.flatMap(project => project.sessions.map((session: any) => ({ id: session.topic_id, topic_id: session.topic_id, name: `${project.name} / ${session.name}`, topic_type: 'discussion', member_agent_ids: session.participants.map((p: any) => p.transport_agent_id) })))
    else if (path.endsWith('/messages')) {
      const topicId = path.split('/')[2]
      if (route.request().method() === 'POST') { const body = route.request().postDataJSON(); created.push({ path, body }); value = { id: 'sent', topic_id: topicId, content: body.content, sender_type: 'human', sender_id: 'workspace@example.test', timestamp: new Date().toISOString() } }
      else value = [{ id: `reply-${topicId}`, topic_id: topicId, content: topicId === 'project-topic' ? 'Shared Workspace result' : 'Independent review result', sender_type: 'agent', sender_id: topicId === 'project-topic' ? 'agent-one' : 'agent-two', sender_display_name: 'Global Engineer', timestamp: '2026-10-08T00:00:00Z' }]
    } else if (path.endsWith('/members')) value = participants.map(p => ({ agent_id: p.transport_agent_id, display_name: p.label, alias: p.label, role: 'member' }))
    else if (path === '/topics/my-recent') value = { items: [] }
    else if (path === '/billing/me') value = { entitlement: { plan: 'free' } }
    else if (path.startsWith('/tasks') || path.startsWith('/p2p-requests') || path === '/hosts/chat-executions' || path.startsWith('/agent-operations')) value = []
    await route.fulfill({ json: value })
  })
  await page.setViewportSize({ width: 1440, height: 960 })
  if (adapterEntry === 'setup') {
    await page.goto(`${baseURL}/desktop/setup`)
    await page.getByRole('link', { name: 'Create Workspace with Engineer', exact: true }).click()
  } else await page.goto(`${baseURL}${entryPath}`)
  await expect(page.getByRole('navigation', { name: 'Workspaces', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'New conversation', exact: true })).toHaveCount(0)
  if (adapterEntry?.startsWith('onboarding')) {
    await page.getByRole('button', { name: 'Connect this computer', exact: true }).click()
    await page.getByRole('button', { name: 'Connect and detect', exact: true }).click()
    if (adapterEntry === 'onboarding-profile') {
      await page.getByRole('button', { name: 'Workspace for Codex 2', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Workspace for Codex 2', exact: true })).toHaveAttribute('title', 'Secondary directory')
      await expect(page.getByRole('button', { name: 'Workspace for Codex', exact: true })).toHaveAttribute('title', 'Isolated WTT workspace')
      await page.getByRole('checkbox', { name: /Codex 2/ }).uncheck()
      await expect(page.getByRole('checkbox', { name: /^Codex(?! 2)/ })).toBeChecked()
    }
    await page.getByRole('button', { name: 'Enable selected Agents', exact: true }).click()
    await page.getByRole('button', { name: /Codex.*Create Workspace/ }).click()
  } else if (!adapterEntry) await page.getByRole('button', { name: 'New Workspace', exact: true }).first().click()
  const modal = page.getByRole('dialog')
  if (adapterEntry) {
    await expect(modal.getByLabel('Engineer MacBook')).toBeChecked()
    await expect(modal.getByLabel('Project directory', { exact: true })).toHaveValue(root)
    expect(created).toHaveLength(0)
    await expect.poll(() => new URL(page.url()).searchParams.has('createProfile')).toBe(false)
  }
  await modal.getByLabel('Name', { exact: true }).fill('Website')
  await modal.getByLabel('Engineer MacBook').check()
  await modal.getByLabel('Role Engineer', { exact: true }).fill('Engineer')
  for (let page = 0; page < 4; page++) await modal.getByRole('button', { name: 'Load more computers', exact: true }).click()
  await expect(modal.getByLabel('Engineer MacBook')).toBeChecked()
  await expect(modal.getByLabel('Role Engineer', { exact: true })).toHaveValue('Engineer')
  await expect(modal.getByRole('button', { name: 'Load more computers', exact: true })).toHaveCount(0)
  expect(loadedHostOffsets).toContain(200)
  await expect(modal.getByRole('button', { name: 'Create', exact: true })).toBeEnabled()
  if (!singleAgent) await modal.getByLabel('Reviewer Linux').check()
  await modal.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page.getByText('Shared Workspace result', { exact: true })).toBeVisible()
  await expect(page.getByText('Global Engineer', { exact: true })).toHaveCount(0)
  expect(created[0].body.name).toBe('Website')
  expect(created[1].body.participants.map((p: any) => p.host_id)).toEqual(singleAgent ? [host] : [host, 'remote'])
  expect(created[1].body.participants.every((p: any) => !('agent_id' in p))).toBe(true)
  if (singleAgent) {
    await expect(page.getByRole('img', { name: '1/1 adapters online', exact: true })).toBeVisible()
    await page.locator('textarea').first().fill('Build with one Codex adapter')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect.poll(() => created.some(item => item.path.includes('/topics/') && item.body.content === 'Build with one Codex adapter')).toBe(true)
    await page.getByRole('button', { name: 'Workspace files', exact: true }).click()
    await expect(page.getByRole('complementary').getByText('README.md', { exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByText('Shared Workspace result', { exact: true })).toBeVisible()
    expect(new URL(page.url()).searchParams.get('workspace')).toBe(projects[0].workspace_id)
    return { projects, created, nativeSelections }
  }
  await page.locator('textarea').first().fill('Continue the project')
  const navigationSize = page.getByRole('separator', { name: 'Resize navigation', exact: true })
  await navigationSize.focus()
  await page.keyboard.press('End')
  await expect(navigationSize).toHaveAttribute('aria-valuenow', '400')
  await expect.poll(async () => (await page.locator('#workspace-project-navigation').boundingBox())?.width).toBe(400)
  await page.keyboard.press('Home')
  await expect(navigationSize).toHaveAttribute('aria-valuenow', '240')
  await navigationSize.dblclick()
  await expect(navigationSize).toHaveAttribute('aria-valuenow', '280')
  const handle = (await navigationSize.boundingBox())!
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
  await page.mouse.down()
  await page.mouse.move(handle.x + handle.width / 2 + 48, handle.y + handle.height / 2)
  await page.mouse.up()
  await expect(navigationSize).toHaveAttribute('aria-valuenow', '328')
  const selectedUrl = page.url()
  expect(new URL(selectedUrl).pathname).toBe(entryPath)
  await page.getByRole('button', { name: 'Collapse navigation', exact: true }).click()
  await expect(page.getByRole('navigation', { name: 'Workspaces', exact: true })).not.toBeVisible()
  await expect(page.locator('textarea').first()).toHaveValue('Continue the project')
  expect(page.url()).toBe(selectedUrl)
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click()
  await expect(navigationSize).toHaveAttribute('aria-valuenow', '328')
  await expect(page.getByText('Shared Workspace result', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect.poll(() => created.some(p => p.path.includes('/topics/') && p.body.content === 'Continue the project')).toBe(true)
  await page.locator('textarea').first().fill('@')
  await page.getByRole('button', { name: /Engineer/ }).last().click()
  await expect(page.locator('textarea').first()).toHaveValue('@agent-one ')
  await page.locator('textarea').first().fill('@all Continue with both adapters')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect.poll(() => created.some(p => p.path.includes('/topics/') && p.body.content === '@all Continue with both adapters')).toBe(true)
  await page.getByRole('button', { name: 'Workspace files', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Workspace files', exact: true })).toHaveAttribute('title', 'MacBook · Workspace files')
  await expect(page.getByRole('complementary').getByText('README.md', { exact: true })).toBeVisible()
  if (entryPath === '/mobile/workspaces') {
    await page.getByRole('complementary').getByText('README.md', { exact: true }).click()
    const toolbar = page.getByRole('button', { name: 'Download file', exact: true }).locator('../..')
    const sections = await toolbar.evaluate(element => Array.from(element.children).map(child => {
      const bounds = child.getBoundingClientRect()
      return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom }
    }))
    expect(sections[0].right <= sections[1].left || sections[0].bottom <= sections[1].top).toBe(true)
    await page.getByRole('button', { name: 'Download file', exact: true }).click()
    await expect.poll(() => nativeDownloads.length).toBe(1)
    expect(nativeDownloads[0].workspaceId).toBe(projects[0].workspace_id)
    expect(nativeDownloads[0].agentId).toBeUndefined()
    expect(nativeDownloads[0].path).toBe('README.md')
    expect(nativeDownloads[0].accessToken).toBeUndefined()
  }
  await page.getByRole('button', { name: 'Terminal', exact: true }).click()
  await expect.poll(() => terminalActions.some(item => item.body.action === 'terminal_open' && item.body.workspace_id === projects[0].workspace_id)).toBe(true)
  await expect(page.getByText('Terminal · MacBook', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Preview', exact: true }).click()
  await page.getByRole('button', { name: 'Start preview', exact: true }).click()
  await expect(page.frameLocator('iframe[title="Development preview"]').getByText('Workspace development site')).toBeVisible()
  expect(created.filter(item => item.path.endsWith('/preview')).every(item => item.body.agent_id === 'agent-root-relay')).toBe(true)
  await page.getByRole('button', { name: 'Stop preview', exact: true }).click()
  await expect(page.locator('iframe[title="Development preview"]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Terminal', exact: true }).click()
  expect(terminalActions.filter(item => item.body.action === 'terminal_open')).toHaveLength(1)
  await page.getByRole('button', { name: 'Workspace files', exact: true }).click()
  await page.screenshot({ path: entryPath === '/desktop' ? '/tmp/wtt-workspace-project-desktop.png' : '/tmp/wtt-workspace-remote-web-wide.png', fullPage: true })
  await page.reload()
  await expect(page.getByText('Shared Workspace result', { exact: true })).toBeVisible()
  adaptersOnline = false
  feedEnabled = true
  await page.goto(`${baseURL}${entryPath}`)
  await expect.poll(() => new URL(page.url()).searchParams.get('workspace')).toBe(projects[0].workspace_id)
  await expect.poll(() => new URL(page.url()).searchParams.get('session')).toBe(projects[0].sessions[0].session_id)
  await expect(page.getByText('Shared Workspace result', { exact: true })).toBeVisible()
  await expect(page.getByRole('img', { name: '0/2 adapters online', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Workspace files', exact: true }).click()
  await expect(page.getByRole('complementary').getByText('README.md', { exact: true })).toBeVisible()
  await expect.poll(() => Boolean(feedSocket)).toBe(true)
  feedSocket!.send(JSON.stringify({ type: 'typing', topic_id: 'project-topic', agent_id: 'agent-two', agent_display_name: 'Reviewer', adapter: 'claude-code', model: 'claude-test-model', status_text: 'review running' }))
  await expect(page.getByText('review running', { exact: true }).first()).toBeVisible()
  feedSocket!.send(JSON.stringify({ type: 'new_message', message: { id: 'other-agent-progress', topic_id: 'project-topic', sender_id: 'agent-one', sender_type: 'agent', semantic_type: 'notification', content: '[TASK_STATUS] status=running action=response:engineer partial', created_at: new Date().toISOString() } }))
  await expect(page.getByText('Claude Code 输出：engineer partial', { exact: true })).toHaveCount(0)
  await expect(page.getByText('review running', { exact: true }).first()).toBeVisible()
  feedSocket!.send(JSON.stringify({ type: 'typing', topic_id: 'project-topic', agent_id: 'agent-one', agent_display_name: 'Engineer', status_text: 'codex working' }))
  const progress = page.locator('details').filter({ hasText: 'codex working' })
  await expect(progress).toBeVisible()
  await expect(progress).not.toContainText('Claude Code')
  await expect(progress).not.toContainText('claude-test-model')
  if (entryPath === '/mobile/workspaces') {
    expect(nativeNotices).toHaveLength(0)
    feedSocket!.send(JSON.stringify({ type: 'new_message', message: { id: 'completed-notice', topic_id: 'project-topic', sender_id: 'agent-one', sender_type: 'agent', semantic_type: 'text', content: 'Final native notification', created_at: new Date().toISOString() } }))
    await expect.poll(() => nativeNotices.length).toBe(1)
    expect(nativeNotices[0]).toMatchObject({ userId: host, topicId: 'project-topic', agentId: 'agent-one', messageId: 'completed-notice' })
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click()
  await expect(page.getByRole('navigation', { name: 'Workspaces', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: entryPath === '/desktop' ? '/tmp/wtt-workspace-project-mobile.png' : '/tmp/wtt-workspace-remote-web-mobile.png', fullPage: true })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('navigation', { name: 'Workspaces', exact: true })).not.toBeVisible()
  if (entryPath === '/mobile/workspaces') {
    await expect(page.locator('textarea')).toHaveCount(1)
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click()
    await expect(page.getByRole('link', { name: 'Legacy conversations', exact: true })).toHaveAttribute('href', '/mobile/feed')
    await page.getByRole('link', { name: 'Computers & adapters', exact: true }).click()
    await expect(page).toHaveURL(/\/mobile\/workspaces\/hosts$/)
    await expect(page.getByRole('heading', { name: 'Computers & adapters', exact: true })).toBeVisible()
    await page.getByRole('link', { name: 'Back to Workspaces', exact: true }).click()
    await expect.poll(() => new URL(page.url()).searchParams.get('workspace')).toBe(projects[0].workspace_id)
    await expect(page.getByText('Shared Workspace result', { exact: true })).toBeVisible()
    expect(new URL(page.url()).pathname).toBe(entryPath)
    await page.route('**/api/auth/csrf', route => route.fulfill({ json: { csrfToken: 'synthetic-csrf' } }))
    await page.route('**/api/auth/signout', route => {
      const callback = new URLSearchParams(route.request().postData() || '').get('callbackUrl')
      expect(callback).toBe('/mobile/login?callbackUrl=%2Fmobile%2Fworkspaces')
      return route.fulfill({ json: { url: new URL(callback!, page.url()).toString() } })
    })
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click()
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await expect(page).toHaveURL(/\/mobile\/login\?callbackUrl=%2Fmobile%2Fworkspaces$/)
    await expect(page.getByRole('button', { name: '进入 WTT', exact: true })).toBeVisible()
  }
  return { projects, created, nativeSelections }
}

test('Workspace-first desktop creates a cross-host collaboration and reuses chat and project files', async ({ page }) => {
  await workspaceFlow(page)
})

test('one Codex adapter creates a Workspace, sends chat and restores its project files', async ({ page }) => {
  await workspaceFlow(page, '', '/desktop', true)
})

test('computer Adapter selection enters Workspace creation instead of a global Agent chat', async ({ page }) => {
  const { created } = await workspaceFlow(page, '', '/desktop', true, 'setup')
  const before = created.length
  await page.goto('/desktop?createHost=remote&createProfile=claude')
  const modal = page.getByRole('dialog')
  await expect(modal.getByLabel('Reviewer Linux')).toBeChecked()
  await expect(modal.getByLabel('Engineer MacBook')).not.toBeChecked()
  await expect(modal.getByLabel('Project directory', { exact: true })).toHaveValue(root)
  await modal.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(modal).not.toBeVisible()
  await page.reload()
  await expect(page.getByText('Shared Workspace result', { exact: true })).toBeVisible()
  await expect(modal).not.toBeVisible()
  expect(created).toHaveLength(before)
})

test('native Agent onboarding enters Workspace creation with the exact enabled profile', async ({ page }) => {
  await workspaceFlow(page, '', '/desktop', true, 'onboarding')
})

test('native onboarding keeps duplicate Adapter profiles and directories independent', async ({ page }) => {
  const { nativeSelections } = await workspaceFlow(page, '', '/desktop', true, 'onboarding-profile')
  expect(nativeSelections).toEqual([{ profileIds: ['codex'], workspaceAccess: 'workspace-write' }])
})

test('unavailable Adapter creation links fail explicitly without selecting a different profile', async ({ page }) => {
  const { toolRequests } = await restorationFixture(page)
  const writes: string[] = []
  page.on('request', request => { if (request.method() === 'POST') writes.push(request.url()) })
  await page.goto('/desktop?createHost=missing-computer&createProfile=missing-profile')
  await expect(page.getByRole('alert').filter({ hasText: 'The selected Adapter is unavailable' })).toBeVisible()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect.poll(() => new URL(page.url()).searchParams.has('createProfile')).toBe(false)
  expect(writes.filter(url => url.includes('/workspaces'))).toHaveLength(0)
  expect(toolRequests).toHaveLength(0)
})

test('Workspace UI persists layout and switches independent Adapter sessions without leaking history', async ({ page }) => {
  test.setTimeout(60_000)
  const { projects, created } = await workspaceFlow(page, '', '/desktop', true)
  const project = projects[0]
  await page.locator('summary').filter({ hasText: 'Website' }).hover()
  await page.getByRole('button', { name: 'Pin Website', exact: true }).click()
  const resize = page.getByRole('separator', { name: 'Resize navigation', exact: true })
  await resize.focus()
  await page.keyboard.press('End')
  await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`wtt-workspace-layout:${id}`) || '{}').width, host)).toBe(400)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Unpin Website', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(resize).toHaveAttribute('aria-valuenow', '400')
  await page.getByRole('button', { name: 'Add Adapter session', exact: true }).click()
  const modal = page.getByRole('dialog')
  await modal.getByLabel('Name', { exact: true }).fill('Review')
  for (let offset = 0; offset < 4; offset++) {
    await modal.getByRole('button', { name: 'Load more computers', exact: true }).click()
  }
  await modal.getByLabel('Reviewer Linux', { exact: true }).check()
  await modal.getByLabel('Role Reviewer', { exact: true }).fill('Quality reviewer')
  await modal.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page.getByText('Independent review result', { exact: true })).toBeVisible()
  await expect(page.getByText('Shared Workspace result', { exact: true })).toHaveCount(0)
  expect(new URL(page.url()).searchParams.get('topic')).toBe('project-topic-2')
  expect(project.sessions[1].participants).toHaveLength(1)
  expect(project.sessions[1].participants[0]).toMatchObject({ adapter: 'claude-code', host_id: 'remote', label: 'Quality reviewer' })
  const sessions = page.getByRole('navigation', { name: 'Workspace sessions', exact: true })
  await sessions.getByRole('link', { name: 'Main', exact: true }).click()
  await expect(page.getByText('Shared Workspace result', { exact: true })).toBeVisible()
  await expect(page.getByText('Independent review result', { exact: true })).toHaveCount(0)
  await page.locator('summary[aria-label="Commands"]').click()
  await page.getByRole('button', { name: /Status.*\/status/ }).click()
  await expect.poll(() => created.some(item => item.path === '/topics/project-topic/messages' && item.body.content === '/status')).toBe(true)
  await page.screenshot({ path: '/tmp/wtt-workspace-ui-light-20261009.png', fullPage: true })
  await page.getByRole('button', { name: 'Account settings', exact: true }).click()
  await page.getByRole('button', { name: 'Appearance', exact: true }).click()
  await page.getByRole('combobox', { name: 'Theme', exact: true }).selectOption('dark')
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page.screenshot({ path: '/tmp/wtt-workspace-ui-dark-20261009.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('textarea')).toHaveCount(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await sessions.getByRole('link', { name: 'Review', exact: true }).click()
  await expect(page.getByText('Independent review result', { exact: true })).toBeVisible()
  await page.screenshot({ path: '/tmp/wtt-workspace-ui-narrow-20261009.png', fullPage: true })
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.getByRole('button', { name: 'Account settings', exact: true }).click()
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh')
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(page.getByRole('button', { name: '添加 Agent 执行会话', exact: true })).toBeVisible()
  await page.screenshot({ path: '/tmp/wtt-workspace-ui-zh-20261009.png', fullPage: true })
})

test('desktop native v3 downloads the selected Workspace without a renderer Blob', async ({ page }) => {
  const downloads: any[] = []
  await page.exposeFunction('observeDesktopDownload', (request: unknown) => downloads.push(request))
  await page.addInitScript(() => {
    URL.createObjectURL = () => { throw new Error('Desktop download must not allocate a renderer Blob') }
    ;(window as any).__WTT_NATIVE_FILES__ = {
      version: 3,
      download: async (request: unknown, progress: (value: { loaded: number; total: number }) => void) => {
        await (window as any).observeDesktopDownload(request)
        progress({ loaded: 27, total: 27 })
      },
      cancel: () => {},
    }
  })
  await workspaceFlow(page, '', '/desktop', true)
  await page.getByRole('button', { name: 'Workspace files', exact: true }).click()
  await page.getByRole('complementary').getByText('README.md', { exact: true }).click()
  await page.getByRole('button', { name: 'Download file', exact: true }).click()
  await expect.poll(() => downloads.length).toBe(1)
  expect(downloads[0]).toMatchObject({ workspaceId: new URL(page.url()).searchParams.get('workspace'), path: 'README.md', filename: 'README.md', accessToken: 'synthetic-user-token' })
  expect(downloads[0].agentId).toBeUndefined()
  expect(downloads[0].requestId).toMatch(/^[a-f0-9]{32}$/)
  await expect(page.getByText('Download failed. Retry.', { exact: true })).toHaveCount(0)
})

test('Workspace download validates metadata when CDN streaming omits Content-Length', async ({ page }) => {
  await page.addInitScript(() => {
    const fetch = window.fetch.bind(window)
    window.fetch = async (...args) => {
      const response = await fetch(...args)
      if (new URL(response.url).pathname.endsWith('/workspace/content')) {
        return new Response(response.body, { status: response.status, headers: { 'Content-Type': 'text/markdown' } })
      }
      return response
    }
  })
  await workspaceFlow(page, '', '/desktop', true)
  await page.getByRole('button', { name: 'Workspace files', exact: true }).click()
  await page.getByRole('complementary').getByText('README.md', { exact: true }).click()
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download file', exact: true }).click()
  const download = await downloaded
  expect(download.suggestedFilename()).toBe('README.md')
  const chunks: Buffer[] = []
  for await (const chunk of createReadStream((await download.path())!)) chunks.push(chunk)
  expect(Buffer.concat(chunks).toString()).toBe('Canonical project directory')
  await expect(page.getByText('Download failed. Retry.', { exact: true })).toHaveCount(0)
  let unexpectedDownloads = 0
  page.on('download', () => { unexpectedDownloads++ })
  await page.route('**/workspace/stat?**', route => route.fulfill({ json: { size: 10 } }))
  await page.getByRole('button', { name: 'Download file', exact: true }).click()
  await expect(page.getByText('Download failed. Retry.', { exact: true })).toBeVisible()
  expect(unexpectedDownloads).toBe(0)
})

const restoredWorkspace = '33333333-3333-4333-8333-333333333333'
const restoredSession = '44444444-4444-4444-8444-444444444444'

async function creationFixture(page: Page, failure: number, failRefresh = false) {
  const { project } = await restorationFixture(page, { legacy: true })
  const projects: any[] = []
  const submissions: Array<{ path: string; body: any }> = []
  const remoteHost = '55555555-5555-4555-8555-555555555555'
  const readOnlyRoot = '66666666-6666-4666-8666-666666666666'
  await page.route('**/api/wtt/hosts/my?**', route => route.fulfill({ json: { hosts: [
    { host_id: host, display_name: 'MacBook', status: 'online', agents: [
      { agent_id: 'agent-one', profile_id: 'codex', adapter: 'codex', display_name: 'Builder', capabilities: { workspace_projects: true, workspace_mcp: true } },
      { agent_id: 'agent-pi', profile_id: 'pi', adapter: 'pi', display_name: 'Pi', capabilities: { workspace_projects: true, workspace_mcp: true } },
    ] },
    { host_id: remoteHost, display_name: 'Linux', status: 'online', agents: [{ agent_id: 'agent-two', profile_id: 'claude', adapter: 'claude-code', display_name: 'Builder', capabilities: { workspace_projects: true, workspace_mcp: true } }] },
  ], next_offset: null } }))
  await page.route('**/api/wtt/workspaces/roots', route => route.fulfill({ json: { roots: [
    { root_id: root, host_id: host, host_name: 'MacBook', name: 'Writable project', access: 'workspace-write' },
    { root_id: readOnlyRoot, host_id: host, host_name: 'MacBook', name: 'Read-only project', access: 'read-only' },
  ] } }))
  await page.route('**/api/wtt/workspaces**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/wtt', '')
    if (path === '/workspaces' && route.request().method() === 'GET') return failRefresh && projects[0]?.sessions.length
      ? route.fulfill({ status: 503, json: { detail: 'Synthetic directory refresh failure' } })
      : route.fulfill({ json: { workspaces: projects, next_offset: null } })
    if (path === '/workspaces' && route.request().method() === 'POST') {
      const body = route.request().postDataJSON(); submissions.push({ path, body })
      projects.push({ ...project, ...body, sessions: [], root_revoked: false })
      return route.fulfill({ json: projects[0] })
    }
    if (path.endsWith('/sessions')) {
      const body = route.request().postDataJSON(); submissions.push({ path, body })
      if (submissions.filter(item => item.path.endsWith('/sessions')).length === 1 && failure) return route.fulfill({ status: failure, json: { detail: 'Synthetic creation failure' } })
      const session = { ...body, topic_id: 'restored-topic', participants: body.participants.map((participant: any) => ({ ...participant, transport_agent_id: participant.profile_id === 'claude' ? 'agent-two' : 'agent-one', adapter: participant.profile_id === 'claude' ? 'claude-code' : 'codex', host_name: participant.host_id === host ? 'MacBook' : 'Linux' })) }
      projects[0].sessions.push(session)
      return route.fulfill({ json: session })
    }
    const selected = projects.find(item => path === `/workspaces/${item.workspace_id}`)
    if (selected) return route.fulfill({ json: selected })
    return route.fallback()
  })
  return { projects, submissions, readOnlyRoot }
}

test('Workspace creation retries an unconfirmed session without changing its identity or team', async ({ page }) => {
  const { submissions } = await creationFixture(page, 503, true)
  await page.goto('/desktop')
  await page.getByRole('button', { name: 'New Workspace', exact: true }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name', { exact: true }).fill('Retry project')
  await dialog.getByLabel('Builder MacBook', { exact: true }).check()
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(dialog.getByText('Session creation not confirmed. Retry the original request.', { exact: true })).toBeVisible()
  await expect(dialog.getByLabel('Name', { exact: true })).toBeDisabled()
  await expect(dialog.getByLabel('Builder MacBook', { exact: true })).toBeDisabled()
  await expect(dialog.getByLabel('Role Builder', { exact: true })).toBeDisabled()
  await dialog.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.getByText('Restored single-agent history', { exact: true })).toBeVisible()
  expect(submissions.filter(item => item.path === '/workspaces')).toHaveLength(1)
  const sessions = submissions.filter(item => item.path.endsWith('/sessions'))
  expect(sessions).toHaveLength(2)
  expect(sessions[1]).toEqual(sessions[0])
})

for (const entry of ['/desktop', '/mobile/workspaces']) test(`partly created Workspace can continue from the project overview on ${entry}`, async ({ page }) => {
  const { projects, submissions } = await creationFixture(page, 409)
  await page.goto(entry)
  await page.getByRole('button', { name: 'New Workspace', exact: true }).last().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name', { exact: true }).fill('Saved project')
  await dialog.getByLabel('Builder MacBook', { exact: true }).check()
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(dialog.getByText('Synthetic creation failure', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Add session to Saved project', exact: true }).click()
  await expect(dialog.getByRole('heading', { name: 'Add session', exact: true })).toBeVisible()
  await expect(dialog.getByText('Writable project · MacBook · Directory read & write', { exact: true })).toBeVisible()
  await dialog.getByLabel('Name', { exact: true }).fill('Continue')
  await dialog.getByLabel('Builder MacBook', { exact: true }).check()
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page.getByText('Restored single-agent history', { exact: true })).toBeVisible()
  expect(submissions.filter(item => item.path === '/workspaces')).toHaveLength(1)
  expect(new URL(page.url()).searchParams.get('workspace')).toBe(projects[0].workspace_id)
  await page.reload()
  await expect(page.getByText('Restored single-agent history', { exact: true })).toBeVisible()
})

test('Workspace creation shows directory restrictions and assigns distinct cross-host default roles', async ({ page }) => {
  const { submissions, readOnlyRoot } = await creationFixture(page, 0)
  await page.goto('/desktop')
  await page.getByRole('button', { name: 'New Workspace', exact: true }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name', { exact: true }).fill('Cross-host project')
  await dialog.getByLabel('Pi MacBook', { exact: true }).check()
  await dialog.getByLabel('Project directory', { exact: true }).selectOption(readOnlyRoot)
  await expect(dialog.getByText('Read-only directory', { exact: true })).toBeVisible()
  await expect(dialog.getByText('This Adapter requires a writable local directory', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Create', exact: true })).toBeDisabled()
  await dialog.getByLabel('Pi MacBook', { exact: true }).uncheck()
  await expect(dialog.getByLabel('Pi MacBook', { exact: true })).toBeDisabled()
  await dialog.getByLabel('Builder MacBook', { exact: true }).check()
  await dialog.getByLabel('Builder Linux', { exact: true }).check()
  const roles = dialog.getByLabel('Role Builder', { exact: true })
  await expect(roles.nth(0)).toHaveValue('Builder / MacBook')
  await expect(roles.nth(1)).toHaveValue('Builder / Linux')
  await roles.nth(0).fill('Engineer')
  await roles.nth(1).fill('Engineer')
  await expect(dialog.getByText('Each role needs a unique, non-empty name.', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Create', exact: true })).toBeDisabled()
  await roles.nth(1).fill('')
  await expect(dialog.getByRole('button', { name: 'Create', exact: true })).toBeDisabled()
  expect(submissions).toHaveLength(0)
  await roles.nth(1).fill('Reviewer')
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page.getByText('Restored single-agent history', { exact: true })).toBeVisible()
  expect(submissions[0].body.root_id).toBe(readOnlyRoot)
  expect(submissions[1].body.participants.map((item: any) => item.label)).toEqual(['Engineer', 'Reviewer'])
})

async function restorationFixture(page: Page, options: { secondPage?: boolean; status?: number; legacy?: boolean } = {}) {
  const offsets: number[] = []
  const toolRequests: string[] = []
  const project = { workspace_id: restoredWorkspace, root_id: root, host_id: host, name: 'Restored Workspace', access: 'workspace-write', sessions: [
    { session_id: restoredSession, topic_id: 'restored-topic', name: 'Single Codex', participants: participants.slice(0, 1) },
  ] }
  await page.addInitScript(() => {
    localStorage.setItem('wtt-web.locale', 'en')
    localStorage.removeItem('wtt_selected_topic_id'); localStorage.removeItem('wtt_selected_agent_id')
  })
  await page.routeWebSocket('**', socket => socket.close())
  await page.route('**/api/auth/session', route => route.fulfill({ json: { userId: host, user: { id: host, name: 'Workspace Tester', email: 'workspace@example.test' }, accessToken: 'synthetic-user-token', expires: '2099-01-01T00:00:00Z' } }))
  await page.route('**/api/wtt/**', async route => {
    const url = new URL(route.request().url())
    const path = url.pathname.replace('/api/wtt', '')
    let value: any = {}
    if (path === '/workspaces') {
      offsets.push(Number(url.searchParams.get('offset') || 0))
      if (options.status) return route.fulfill({ status: options.status, json: { detail: 'Workspace service unavailable' } })
      value = { workspaces: options.legacy || (options.secondPage && offsets.at(-1) === 0) ? [] : [project], next_offset: options.secondPage && offsets.at(-1) === 0 ? 50 : null }
    } else if (path === `/workspaces/${restoredWorkspace}`) value = project
    else if (path === '/workspaces/roots') value = { roots: [] }
    else if (path === '/hosts/my') value = { hosts: [], next_offset: null }
    else if (path.includes('/tools') || path.includes('/workspace/')) {
      toolRequests.push(path)
      value = path.endsWith('/tools') ? { files: 'workspace-write', terminal: false, preview_ports: [], host_name: 'MacBook' }
        : { root: 'Workspace', path: '.', entries: [{ name: 'README.md', path: 'README.md', type: 'file', size: 27 }] }
    } else if (path === '/agents/my') value = [{ agent_id: 'agent-one', display_name: 'Engineer' }]
    else if (path === '/agents/stats') value = { online_agents: ['agent-one'], runtimes: {} }
    else if (path === '/topics/subscribed') value = project.sessions.map(session => ({ id: session.topic_id, topic_id: session.topic_id, name: session.name, topic_type: 'general' }))
    else if (path.endsWith('/messages')) value = [{ id: 'restored-message', topic_id: 'restored-topic', sender_type: 'agent', sender_id: 'agent-one', content: 'Restored single-agent history', timestamp: '2026-10-08T00:00:00Z' }]
    else if (path.endsWith('/members')) value = [{ agent_id: 'agent-one', display_name: 'Engineer', role: 'member' }]
    else if (path === '/topics/my-recent') value = { items: [] }
    else if (path === '/billing/me') value = { entitlement: { plan: 'free' } }
    else if (path.startsWith('/tasks') || path.startsWith('/p2p-requests') || path === '/topics/my-groups' || path === '/hosts/chat-executions' || path.startsWith('/agent-operations')) value = []
    await route.fulfill({ json: value })
  })
  return { offsets, toolRequests, project }
}

for (const mobile of [false, true]) test(`${mobile ? 'mobile' : 'desktop'} long chat can jump to latest without losing loaded history`, async ({ page }) => {
  await restorationFixture(page)
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 })
  const records = Array.from({ length: 60 }, (_, index) => ({ id: `jump-${index}`, topic_id: 'restored-topic', sender_id: 'agent-one', sender_type: 'agent',
    content: `Jump history ${index}: ${'Synthetic message content. '.repeat(10)}`, timestamp: new Date(Date.UTC(2026, 9, 8) + index * 1000).toISOString() }))
  await page.route('**/api/wtt/topics/*/messages**', route => route.fulfill({ json: records }))
  await page.goto(`${mobile ? '/mobile/workspaces' : '/desktop'}?workspace=${restoredWorkspace}&session=${restoredSession}&topic=restored-topic&agentId=agent-one`)
  const rows = page.locator('[data-message-id^="jump-"]')
  await expect(rows).toHaveCount(60)
  const scroller = page.locator('div.overflow-y-auto').filter({ has: rows }).last()
  await scroller.evaluate(element => { element.scrollTop = 0; element.dispatchEvent(new Event('scroll')) })
  const latest = page.getByRole('button', { name: 'Latest messages', exact: true })
  await expect(latest).toBeVisible()
  await expect(rows.first()).toBeInViewport()
  await page.locator('textarea').first().fill('Unsent synthetic draft')
  await page.getByRole('button', { name: 'Send', exact: true }).click({ trial: true })
  const latestBox = await latest.boundingBox()
  const scrollBox = await scroller.boundingBox()
  expect(latestBox!.y + latestBox!.height).toBeLessThanOrEqual(scrollBox!.y + scrollBox!.height)
  await latest.click()
  await expect(rows.last()).toBeInViewport()
  await expect(latest).toHaveCount(0)
  await expect(rows).toHaveCount(60)
  await expect(page.locator('textarea').first()).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

for (const mobile of [false, true]) test(`${mobile ? 'mobile' : 'desktop'} paged history retains live replies and rejects late pages after changing sessions`, async ({ page }) => {
  const { project } = await restorationFixture(page)
  project.sessions.push({ session_id: 'other-session', topic_id: 'other-topic', name: 'Other Codex', participants: participants.slice(0, 1) })
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 })
  const records = Array.from({ length: 1000 }, (_, index) => ({
    id: `history-${index}`, topic_id: 'restored-topic', sender_id: 'agent-one', sender_type: 'agent',
    content: `History item ${String(index).padStart(4, '0')}`, timestamp: new Date(Date.UTC(2026, 9, 8) + index * 1000).toISOString(),
  }))
  let socket: WebSocketRoute | undefined
  await page.routeWebSocket('**', connection => { socket = connection; connection.onMessage(raw => { if (raw === 'ping') connection.send('pong') }) })
  let releaseFirst!: () => void
  const firstPage = new Promise<void>(resolve => { releaseFirst = resolve })
  let releaseLate!: () => void
  const latePage = new Promise<void>(resolve => { releaseLate = resolve })
  let completeLate!: () => void
  const lateComplete = new Promise<void>(resolve => { completeLate = resolve })
  let phase: 'first' | 'normal' | 'late' | 'fail' = 'first'
  const requested: string[] = []
  await page.route('**/api/wtt/topics/*/messages**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname.includes('/other-topic/')) {
      await route.fulfill({ json: [{ id: 'other-message', topic_id: 'other-topic', sender_type: 'agent', sender_id: 'agent-one', content: 'Other session history', timestamp: '2026-10-08T00:00:00Z' }] })
      return
    }
    const before = url.searchParams.get('before')
    if (!before) { await route.fulfill({ json: records.slice(-100) }); return }
    requested.push(before)
    if (phase === 'first') await firstPage
    const isLate = phase === 'late'
    if (isLate) await latePage
    if (phase === 'fail') { await route.fulfill({ status: 503, json: { detail: 'Synthetic history service outage' } }); return }
    const older = records.filter(row => row.timestamp < before).slice(-100)
    await route.fulfill({ json: older })
    if (isLate) completeLate()
  })
  const base = mobile ? '/mobile/workspaces' : '/desktop'
  await page.goto(`${base}?workspace=${restoredWorkspace}&session=${restoredSession}&topic=restored-topic&agentId=agent-one`)
  const olderButton = page.getByRole('button', { name: 'Load older messages', exact: true })
  const message = (index: number) => page.getByText(`History item ${String(index).padStart(4, '0')}`, { exact: true })
  await expect(message(999)).toBeVisible()
  await expect.poll(() => Boolean(socket)).toBe(true)
  const composer = page.locator('textarea').first()
  await composer.fill('Unsent long-history draft')
  await olderButton.click()
  await expect.poll(() => requested.length).toBe(1)
  const anchorTop = (await page.locator('[data-message-id="history-900"]').boundingBox())!.y
  socket!.send(JSON.stringify({ type: 'new_message', message: {
    id: 'live-during-page', topic_id: 'restored-topic', sender_id: 'agent-one', sender_type: 'agent',
    semantic_type: 'post', content: 'Live reply while older page is pending', created_at: new Date(Date.UTC(2026, 9, 8) + 1000000).toISOString(),
  } }))
  await expect(page.getByText('Live reply while older page is pending', { exact: true })).toHaveCount(1)
  await expect.poll(async () => Math.abs((await page.locator('[data-message-id="history-900"]').boundingBox())!.y - anchorTop)).toBeLessThan(2)
  phase = 'normal'; releaseFirst()
  await expect(message(800)).toHaveCount(1)
  await expect(olderButton).toBeEnabled()
  await expect(page.getByText('Live reply while older page is pending', { exact: true })).toHaveCount(1)
  await expect.poll(async () => Math.abs((await page.locator('[data-message-id="history-900"]').boundingBox())!.y - anchorTop)).toBeLessThan(2)
  await expect(composer).toHaveValue('Unsent long-history draft')
  phase = 'fail'
  await olderButton.click()
  await expect.poll(() => requested.length).toBe(2)
  await expect(olderButton).toBeEnabled()
  await expect(page.getByRole('alert').filter({ hasText: 'Could not load earlier messages. Try again.' })).toBeVisible()
  await expect(message(800)).toHaveCount(1)
  phase = 'normal'
  for (let first = 700; first >= 0; first -= 100) {
    await olderButton.click()
    await expect(message(first)).toHaveCount(1)
    await expect(olderButton).toBeEnabled()
  }
  expect(await page.locator('[data-sender-type="agent"]').count()).toBe(1001)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expect(composer).toHaveValue('Unsent long-history draft')
  await page.screenshot({ path: `test-results/history-1000-${mobile ? 'mobile' : 'desktop'}.png` })
  const sessions = page.getByRole('navigation', { name: 'Workspace sessions', exact: true })
  await sessions.getByRole('link', { name: 'Other Codex', exact: true }).click()
  await expect(page.getByText('Other session history', { exact: true })).toBeVisible()
  await sessions.getByRole('link', { name: 'Single Codex', exact: true }).click()
  await expect(message(999)).toBeVisible()
  phase = 'late'
  await olderButton.click()
  await expect.poll(() => requested.length).toBe(11)
  await sessions.getByRole('link', { name: 'Other Codex', exact: true }).click()
  await expect(page.getByText('Other session history', { exact: true })).toBeVisible()
  phase = 'normal'; releaseLate()
  await lateComplete
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  await expect(message(800)).toHaveCount(0)
  await expect(message(999)).toHaveCount(0)
  await expect(page.getByText('Other session history', { exact: true })).toHaveCount(1)
  await sessions.getByRole('link', { name: 'Single Codex', exact: true }).click()
  await expect(message(999)).toBeVisible()
  await olderButton.click()
  await expect(message(800)).toHaveCount(1)
  await expect(olderButton).toBeEnabled()
})

test('mobile Workspace and legacy chat have a round-trip account navigation without creating conversations', async ({ page }) => {
  await restorationFixture(page)
  const writes: string[] = []
  page.on('request', request => {
    if (request.url().includes('/api/wtt/') && request.method() !== 'GET') writes.push(request.url())
  })
  await page.goto(`/mobile/workspaces?workspace=${restoredWorkspace}&session=${restoredSession}&topic=restored-topic&agentId=agent-one`)
  await expect(page.getByText('Restored single-agent history', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click()
  await page.getByRole('link', { name: 'Legacy conversations', exact: true }).click()
  await expect(page).toHaveURL(/\/mobile\/feed/)
  await expect(page.getByText('Restored single-agent history', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('link', { name: 'Workspaces', exact: true }).click()
  await expect(page).toHaveURL(/\/mobile\/workspaces/)
  await expect(page.getByRole('region', { name: 'Workspace overview', exact: true })).toBeVisible()
  await page.getByRole('region', { name: 'Workspace overview', exact: true }).getByRole('link').filter({ hasText: 'Restored Workspace' }).click()
  await expect(page.getByText('Restored single-agent history', { exact: true })).toBeVisible()
  expect(new URL(page.url()).searchParams.get('topic')).toBe('restored-topic')
  expect(writes).toEqual([])
})

test('desktop Workspace does not auto-create P2P while the explicit legacy entry retains its existing initializer', async ({ page }) => {
  await restorationFixture(page)
  const initialized: unknown[] = []
  await page.route('**/api/wtt/messages/p2p**', route => {
    initialized.push(route.request().postDataJSON())
    return route.fulfill({ json: { topic_id: 'legacy-p2p' } })
  })
  await page.goto(`/desktop?workspace=${restoredWorkspace}&session=${restoredSession}&topic=restored-topic&agentId=agent-one`)
  await expect(page.getByText('Restored single-agent history', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click()
  expect(initialized).toEqual([])
  await page.getByRole('link', { name: 'Legacy conversations', exact: true }).click()
  await expect(page).toHaveURL(/legacy=1/)
  await expect.poll(() => initialized.length).toBeGreaterThan(0)
  expect(initialized.every(body => (body as { content: string }).content === '[system:p2p_init]')).toBe(true)
})

test('mobile notification Topic restores a Workspace beyond the first directory page', async ({ page }) => {
  const fixture = await restorationFixture(page, { secondPage: true })
  await page.goto('/mobile/workspaces?topic=restored-topic&agentId=agent-one')
  await expect(page.getByText('Restored single-agent history', { exact: true })).toBeVisible()
  expect(new URL(page.url()).searchParams.get('workspace')).toBe(restoredWorkspace)
  expect(new URL(page.url()).searchParams.get('session')).toBe(restoredSession)
  expect(fixture.offsets).toContain(50)
  await page.getByRole('button', { name: 'Workspace files', exact: true }).click()
  await expect(page.getByRole('complementary').getByText('README.md', { exact: true })).toBeVisible()
  expect(fixture.toolRequests.every(path => path.startsWith(`/workspaces/${restoredWorkspace}/`))).toBe(true)
})

test('desktop notification restores project-scoped chat and files from a later Workspace page', async ({ page }) => {
  const fixture = await restorationFixture(page, { secondPage: true })
  await page.goto('/desktop?topicId=restored-topic&agentId=agent-one')
  await expect(page.getByText('Restored single-agent history', { exact: true })).toBeVisible()
  expect(new URL(page.url()).searchParams.get('workspace')).toBe(restoredWorkspace)
  expect(new URL(page.url()).searchParams.get('session')).toBe(restoredSession)
  expect(fixture.offsets).toContain(50)
  await page.getByRole('button', { name: 'Workspace files', exact: true }).click()
  await expect(page.getByRole('complementary').getByText('README.md', { exact: true })).toBeVisible()
  expect(fixture.toolRequests.every(path => path.startsWith(`/workspaces/${restoredWorkspace}/`))).toBe(true)
})

test('desktop old Topic notifications preserve history after exhaustive Workspace lookup', async ({ page }) => {
  const fixture = await restorationFixture(page, { legacy: true, secondPage: true })
  await page.goto('/desktop?topicId=restored-topic&agentId=agent-one')
  await expect(page.getByTestId('desktop-workspace')).toBeVisible()
  await expect(page.getByText('Restored single-agent history', { exact: true })).toBeVisible()
  expect(new URL(page.url()).searchParams.get('legacy')).toBe('1')
  expect(new URL(page.url()).searchParams.get('topic')).toBe('restored-topic')
  expect(new URL(page.url()).searchParams.get('agentId')).toBe('agent-one')
  expect(fixture.offsets).toContain(50)
  expect(fixture.toolRequests.filter(path => path.startsWith('/workspaces/'))).toHaveLength(0)
  await page.reload()
  await expect(page.getByText('Restored single-agent history', { exact: true })).toBeVisible()
})

test('desktop accounts without the Workspace feature retain their legacy chat', async ({ page }) => {
  await restorationFixture(page, { status: 404 })
  await page.goto('/desktop?topic=restored-topic&agentId=agent-one')
  await expect(page.getByTestId('desktop-workspace')).toBeVisible()
  await expect(page.getByText('Restored single-agent history', { exact: true })).toBeVisible()
  expect(new URL(page.url()).searchParams.get('legacy')).toBe('1')
})

for (const status of [401, 403, 503]) test(`desktop Workspace error ${status} never silently switches to legacy chat`, async ({ page }) => {
  await restorationFixture(page, { status })
  await page.goto('/desktop?topic=restored-topic&agentId=agent-one')
  await expect(page.getByText('Could not load Workspaces.', { exact: true })).toBeVisible()
  expect(new URL(page.url()).searchParams.has('legacy')).toBe(false)
  await expect(page.locator('textarea')).toHaveCount(0)
})

test('explicit desktop Workspace links are not downgraded on missing project service', async ({ page }) => {
  await restorationFixture(page, { status: 404 })
  await page.route(`**/api/wtt/workspaces/${restoredWorkspace}`, route => route.fulfill({ status: 404, json: { detail: 'Workspace service unavailable' } }))
  await page.goto(`/desktop?workspace=${restoredWorkspace}&session=${restoredSession}&topic=restored-topic&agentId=agent-one`)
  await expect(page.getByText('Could not open this Workspace.', { exact: true })).toBeVisible()
  expect(new URL(page.url()).searchParams.get('workspace')).toBe(restoredWorkspace)
  expect(new URL(page.url()).searchParams.has('legacy')).toBe(false)
  await expect(page.locator('textarea')).toHaveCount(0)
})

for (const mobile of [false, true]) for (const status of [404, 503]) test(`${mobile ? 'mobile' : 'desktop'} explicit Workspace detail failures ${status} block chat and allow exact-link retry`, async ({ page }) => {
  const fixture = await restorationFixture(page)
  let failed = true
  let details = 0
  const writes: string[] = []
  page.on('request', request => { if (request.method() === 'POST') writes.push(new URL(request.url()).pathname) })
  await page.route(`**/api/wtt/workspaces/${restoredWorkspace}`, route => {
    details++
    return failed ? route.fulfill({ status, json: { detail: 'Synthetic project detail failure' } }) : route.fulfill({ json: fixture.project })
  })
  const entry = mobile ? '/mobile/workspaces' : '/desktop'
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 })
  await page.goto(`${entry}?workspace=${restoredWorkspace}&session=${restoredSession}&topic=restored-topic&agentId=agent-one`)
  await expect(page.getByText('Could not open this Workspace.', { exact: true })).toBeVisible()
  await expect(page.locator('textarea')).toHaveCount(0)
  expect(fixture.toolRequests).toHaveLength(0)
  expect(new URL(page.url()).searchParams.get('workspace')).toBe(restoredWorkspace)
  failed = false
  const before = details
  await page.getByRole('button', { name: 'Retry Workspace', exact: true }).click()
  await expect(page.getByText('Restored single-agent history', { exact: true })).toBeVisible()
  expect(details).toBeGreaterThan(before)
  expect(new URL(page.url()).pathname).toBe(entry)
  expect(new URL(page.url()).searchParams.get('session')).toBe(restoredSession)
  if (status === 503) {
    await page.locator('textarea').fill('Synthetic unsent draft preserved during refresh')
    failed = true
    if (mobile) await page.getByRole('button', { name: 'Open navigation', exact: true }).click()
    await page.getByRole('button', { name: 'Refresh Workspaces', exact: true }).click()
    if (mobile) await page.getByRole('complementary').getByRole('button', { name: 'Close navigation', exact: true }).click()
    await expect(page.getByText('Workspace refresh failed. Your conversation is preserved.', { exact: true })).toBeVisible()
    await expect(page.getByText('Restored single-agent history', { exact: true })).toBeVisible()
    await expect(page.locator('textarea')).toHaveValue('Synthetic unsent draft preserved during refresh')
    failed = false
    await page.getByRole('button', { name: 'Retry Workspace', exact: true }).click()
    await expect(page.getByText('Workspace refresh failed. Your conversation is preserved.', { exact: true })).toHaveCount(0)
    await expect(page.locator('textarea')).toHaveValue('Synthetic unsent draft preserved during refresh')
  }
  expect(writes).toEqual([])
})

test('non-advancing Workspace cursors fail without looping or hiding history behind a fallback', async ({ page }) => {
  await restorationFixture(page)
  const offsets: number[] = []
  await page.route('**/api/wtt/workspaces?**', route => {
    offsets.push(Number(new URL(route.request().url()).searchParams.get('offset')))
    return route.fulfill({ json: { workspaces: [], next_offset: 50 } })
  })
  await page.goto('/desktop?topic=restored-topic&agentId=agent-one')
  await expect(page.getByText('Could not load Workspaces.', { exact: true })).toBeVisible()
  expect(offsets.at(-1)).toBe(50)
  expect(offsets.filter(offset => offset === 50)).toHaveLength(1)
  expect(offsets.every(offset => offset === 0 || offset === 50)).toBe(true)
  expect(offsets.length).toBeLessThanOrEqual(3)
  expect(new URL(page.url()).searchParams.has('legacy')).toBe(false)
  await expect(page.locator('textarea')).toHaveCount(0)
})

test('explicit transcript import opens saved history in the legacy desktop rather than an empty Workspace', async ({ page }) => {
  await restorationFixture(page, { legacy: true })
  const transcript = JSON.stringify({ messages: [{ role: 'user', content: 'Imported question' }, { role: 'assistant', content: 'Imported answer' }] })
  await page.addInitScript(raw => {
    ;(window as any).wttDesktop = { isDesktop: true, platform: 'darwin', fs: {
      openFileDialog: async () => ({ canceled: false, files: [{ path: '/synthetic/transcript.json', name: 'transcript.json', size: raw.length }] }),
      readFile: async () => ({ ok: true, content: raw }),
    } }
  }, transcript)
  await page.route('**/api/wtt/hosts/my?**', route => route.fulfill({ json: { hosts: [{ host_id: host, display_name: 'MacBook', platform: 'darwin', environment: 'native', client_version: 'fixture', status: 'online', last_seen_at: null, agents: [{ agent_id: 'agent-one', profile_id: 'codex', adapter: 'codex', display_name: 'Engineer' }] }], next_offset: null } }))
  let imported: any
  await page.route('**/api/wtt/hosts/history-import', route => {
    expect(route.request().headers().authorization).toBe('Bearer synthetic-user-token')
    imported = route.request().postDataJSON()
    return route.fulfill({ json: { topic_id: 'restored-topic', agent_id: 'agent-one' } })
  })
  await page.route('**/api/wtt/topics/restored-topic/messages?**', route => route.fulfill({ json: imported ? imported.messages.map((message: any, index: number) => ({ id: `import-${index}`, topic_id: 'restored-topic', sender_type: message.role === 'user' ? 'human' : 'agent', sender_id: message.role === 'user' ? host : 'agent-one', content: message.content, timestamp: `2026-10-09T00:00:0${index}Z` })) : [] }))
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.goto('/desktop?legacy=1&agentId=agent-one')
  await page.getByRole('button', { name: 'Import conversation', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'Import conversation', exact: true })
  await modal.getByRole('button', { name: 'Select transcript', exact: true }).click()
  await modal.getByRole('combobox').selectOption('agent-one')
  await modal.getByRole('checkbox').check()
  await modal.getByRole('button', { name: 'Import', exact: true }).click()
  expect(imported).toMatchObject({ agent_id: 'agent-one', source_format: 'chat-json', confirmed: true, messages: [{ role: 'user', content: 'Imported question' }, { role: 'assistant', content: 'Imported answer' }] })
  await modal.getByRole('link', { name: 'Open imported conversation', exact: true }).click()
  await expect(page.getByText('Imported answer', { exact: true })).toBeVisible()
  expect(new URL(page.url()).searchParams.get('legacy')).toBe('1')
  await expect(page.getByTestId('desktop-workspace-projects')).toHaveCount(0)
})

test('mismatched session links cannot mount chat or project tools until opened canonically', async ({ page }) => {
  const fixture = await restorationFixture(page)
  await page.goto(`/mobile/workspaces?workspace=${restoredWorkspace}&session=wrong-session&topic=restored-topic&agentId=agent-one`)
  await expect(page.getByText('This link does not match the selected Workspace session.', { exact: true })).toBeVisible()
  await expect(page.locator('textarea')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Workspace files', exact: true })).toHaveCount(0)
  expect(fixture.toolRequests).toHaveLength(0)
  await page.getByRole('link', { name: 'Open session', exact: true }).click()
  await expect(page.getByText('Restored single-agent history', { exact: true })).toBeVisible()
  expect(new URL(page.url()).searchParams.get('session')).toBe(restoredSession)
})

test('old Topic notifications return to the legacy mobile chat after owned directory lookup', async ({ page }) => {
  const fixture = await restorationFixture(page, { legacy: true })
  await page.goto('/mobile/workspaces?topic=restored-topic&agentId=agent-one')
  await expect(page).toHaveURL(/\/mobile\/feed\?topic_id=restored-topic&agent_id=agent-one$/)
  expect(fixture.toolRequests).toHaveLength(0)
})

test('mobile Workspace feature gate keeps legacy users working without masking service failures', async ({ page }) => {
  await restorationFixture(page, { status: 404 })
  await page.goto('/mobile/workspaces')
  await expect.poll(() => new URL(page.url()).pathname).toBe('/mobile/feed')
})

test('mobile Workspace service errors stay visible and do not redirect into legacy chat', async ({ page }) => {
  await restorationFixture(page, { status: 503 })
  await page.goto('/mobile/workspaces?topic=restored-topic&agentId=agent-one')
  await expect(page.getByText('Could not load Workspaces.', { exact: true })).toBeVisible()
  expect(new URL(page.url()).pathname).toBe('/mobile/workspaces')
  await expect(page.locator('textarea')).toHaveCount(0)
})

test('mobile Remote Web reuses Workspace chat, restores history and stays on mobile routes', async ({ page }) => {
  test.setTimeout(60000)
  await workspaceFlow(page, '', '/mobile/workspaces')
})

test('signed-out mobile Workspace returns to its own route after account login', async ({ page }) => {
  await page.route('**/api/auth/session', route => route.fulfill({ json: {} }))
  await page.routeWebSocket('**', socket => socket.close())
  await page.route('**/api/wtt/**', route => route.fulfill({ json: {} }))
  await page.goto('/mobile/workspaces')
  await expect(page).toHaveURL(/\/mobile\/login\?callbackUrl=%2Fmobile%2Fworkspaces$/)
  await expect(page.getByRole('button', { name: '进入 WTT', exact: true })).toBeVisible()
})

test('native mobile Workspace waits for cookie handoff before redirecting unauthenticated users', async ({ page }) => {
  await page.addInitScript(() => { (window as any).__WTT_NATIVE_SESSION_PENDING__ = true })
  await page.route('**/api/auth/session', route => route.fulfill({ json: {} }))
  await page.routeWebSocket('**', socket => socket.close())
  await page.route('**/api/wtt/**', route => route.fulfill({ json: {} }))
  await page.goto('/mobile/workspaces')
  await page.waitForLoadState('networkidle')
  await expect(page).toHaveURL(/\/mobile\/workspaces$/)
  await page.evaluate(() => {
    ;(window as any).__WTT_NATIVE_SESSION_PENDING__ = false
    window.dispatchEvent(new Event('wtt-native-session-ready'))
  })
  await expect(page).toHaveURL(/\/mobile\/login\?callbackUrl=%2Fmobile%2Fworkspaces$/)
})

test('packaged Mac opens the Workspace-first flow, creates a project and sends chat', async ({ baseURL }) => {
  test.skip(!process.env.WTT_TEST_ELECTRON_EXECUTABLE, 'Requires the packaged Mac executable')
  test.setTimeout(60000)
  const directory = await mkdtemp(join(tmpdir(), 'wtt-project-electron-'))
  let application: Awaited<ReturnType<typeof _electron.launch>> | undefined
  try {
    await writeFile(join(directory, 'config.json'), JSON.stringify({ frontendUrl: baseURL, apiUrl: baseURL, notificationsEnabled: false }))
    const env: Record<string, string> = { WTT_DESKTOP_HOSTS_ENABLED: '0' }
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined && !['ELECTRON_RUN_AS_NODE', 'WTT_DESKTOP_HOSTS_ENABLED'].includes(key)) env[key] = value
    }
    application = await _electron.launch({ executablePath: process.env.WTT_TEST_ELECTRON_EXECUTABLE, args: [`--user-data-dir=${directory}`], env })
    const page = await application.firstWindow()
    await workspaceFlow(page, baseURL)
    expect(await application.evaluate(({ app }) => app.isPackaged)).toBe(true)
    expect(await page.evaluate(() => typeof window.wttDesktop?.host?.admitWorkspaceDirectory)).toBe('function')
    expect(await page.evaluate(() => (window as any).__WTT_NATIVE_FILES__?.version)).toBe(3)
    await expect(page.evaluate(() => (window as any).__WTT_NATIVE_FILES__.download({
      workspaceId: 'synthetic-workspace', path: 'README.md', filename: 'README.md',
      requestId: 'b'.repeat(32), accessToken: 'synthetic-user-token',
    }, () => {}))).rejects.toThrow(/Verify the signed-in WTT account/)
    expect(await page.evaluate(() => typeof (window as unknown as { require?: unknown }).require)).toBe('undefined')
  } finally {
    if (application) await application.close()
    await rm(directory, { recursive: true, force: true })
  }
})
