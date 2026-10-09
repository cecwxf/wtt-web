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

async function workspaceFlow(page: Page, baseURL = '', entryPath = '/desktop', singleAgent = false) {
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
  const sessionParticipants = singleAgent ? participants.slice(0, 1) : participants
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
      const body = route.request().postDataJSON(); created.push({ path, body }); value = { ...body, topic_id: 'project-topic', participants: sessionParticipants }; projects[0].sessions.push(value)
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
    else if (path === '/topics/subscribed') value = projects.length && projects[0].sessions.length ? [{ id: 'project-topic', topic_id: 'project-topic', name: 'Website / Team', topic_type: 'discussion' }] : []
    else if (path === '/topics/my-groups') value = projects.length && projects[0].sessions.length ? [{ id: 'project-topic', topic_id: 'project-topic', name: 'Website / Team', topic_type: 'discussion', member_agent_ids: ['agent-one', 'agent-two'] }] : []
    else if (path.endsWith('/messages')) {
      if (route.request().method() === 'POST') { const body = route.request().postDataJSON(); created.push({ path, body }); value = { id: 'sent', topic_id: 'project-topic', content: body.content, sender_type: 'human', sender_id: 'workspace@example.test', timestamp: new Date().toISOString() } }
      else value = [{ id: 'reply', topic_id: 'project-topic', content: 'Shared Workspace result', sender_type: 'agent', sender_id: 'agent-one', sender_display_name: 'Global Engineer', timestamp: '2026-10-08T00:00:00Z' }]
    } else if (path.endsWith('/members')) value = participants.map(p => ({ agent_id: p.transport_agent_id, display_name: p.label, alias: p.label, role: 'member' }))
    else if (path === '/topics/my-recent') value = { items: [] }
    else if (path === '/billing/me') value = { entitlement: { plan: 'free' } }
    else if (path.startsWith('/tasks') || path.startsWith('/p2p-requests') || path === '/hosts/chat-executions' || path.startsWith('/agent-operations')) value = []
    await route.fulfill({ json: value })
  })
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.goto(`${baseURL}${entryPath}`)
  await expect(page.getByRole('navigation', { name: 'Workspaces', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'New conversation', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'New Workspace', exact: true }).first().click()
  const modal = page.getByRole('dialog')
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
    return
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
}

test('Workspace-first desktop creates a cross-host collaboration and reuses chat and project files', async ({ page }) => {
  await workspaceFlow(page)
})

test('one Codex adapter creates a Workspace, sends chat and restores its project files', async ({ page }) => {
  await workspaceFlow(page, '', '/desktop', true)
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
    else if (path === '/topics/subscribed') value = [{ id: 'restored-topic', topic_id: 'restored-topic', name: 'Single Codex', topic_type: 'general' }]
    else if (path.endsWith('/messages')) value = [{ id: 'restored-message', topic_id: 'restored-topic', sender_type: 'agent', sender_id: 'agent-one', content: 'Restored single-agent history', timestamp: '2026-10-08T00:00:00Z' }]
    else if (path.endsWith('/members')) value = [{ agent_id: 'agent-one', display_name: 'Engineer', role: 'member' }]
    else if (path === '/topics/my-recent') value = { items: [] }
    else if (path === '/billing/me') value = { entitlement: { plan: 'free' } }
    else if (path.startsWith('/tasks') || path.startsWith('/p2p-requests') || path === '/topics/my-groups' || path === '/hosts/chat-executions' || path.startsWith('/agent-operations')) value = []
    await route.fulfill({ json: value })
  })
  return { offsets, toolRequests }
}

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
    expect(await page.evaluate(() => typeof (window as unknown as { require?: unknown }).require)).toBe('undefined')
  } finally {
    if (application) await application.close()
    await rm(directory, { recursive: true, force: true })
  }
})
