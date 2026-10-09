import { expect, test, type Page } from '@playwright/test'
import type { DesktopRuntimeState } from '../lib/desktop'

const hostId = '11111111-1111-4111-8111-111111111111'
const host = {
  host_id: hostId, display_name: 'My MacBook', platform: 'darwin', environment: 'native',
  client_version: '1.0.5-dev', status: 'offline', last_seen_at: null,
  agents: [{ agent_id: 'agent-123456789abc', profile_id: 'codex-default', adapter: 'codex', display_name: 'Coding Agent' }],
}

async function setup(page: Page, options: { native?: boolean; locale?: 'zh' | 'en'; dark?: boolean; empty?: boolean; disabled?: boolean; registered?: boolean; restoreFails?: boolean; runtime?: boolean; runtimeCancel?: boolean; files?: boolean } = {}) {
  const calls: Array<{ path: string; method: string; body: unknown }> = []
  const state = { hosts: options.empty ? [] : [host], fail: false, revoked: false, nextOffset: null as number | null, account: 'alice' as string | null }
  await page.addInitScript(({ native, locale, dark, hostId, registered: initiallyRegistered, restoreFails, runtime, runtimeCancel, files }) => {
    localStorage.setItem('wtt-web.locale', locale)
    localStorage.setItem('theme', dark ? 'dark' : 'light')
    if (native) {
      let registered = initiallyRegistered
      let userId = 'alice'
      let unavailable = false
      let verified = false
      const calls: string[] = []
      const listeners = new Set<(state: unknown) => void>()
      const snapshot = () => ({ enabled: !files, protocolVersion: files ? 3 : 2, accountVerified: verified, state: unavailable ? 'unavailable' : registered ? 'registered' : 'signed_out', userId, ...(registered ? { hostId } : {}) })
      const emit = () => { listeners.forEach(listener => listener(snapshot())) }
      let runtimeState: DesktopRuntimeState = { state: 'stopped', agents: [] }
      const runtimeListeners = new Set<(state: unknown) => void>()
      Object.assign(window, { __pushRuntime: (state: DesktopRuntimeState) => {
        runtimeState = state
        runtimeListeners.forEach(listener => listener(state))
      } })
      Object.assign(window, { __hostCalls: calls })
      const fileState = { added: false, text: 'Hello from local WTT', readonly: false, delay: false, fail: false, release: null as (() => void) | null }
      Object.assign(window, { __files: fileState })
      const workspace = () => ({ path: '/project', name: 'My workspace', addedAt: '2026-10-07T00:00:00Z', fileCount: 1 })
      Object.defineProperty(window, 'wttDesktop', {
        value: {
          isDesktop: true, platform: 'darwin',
          ...(files ? {
            workspace: {
              list: async () => userId === 'alice' && fileState.added ? [workspace()] : [],
              recentFiles: async () => [],
              trackRecent: async () => true,
              add: async () => { calls.push('pick-folder'); fileState.added = true; return workspace() },
              remove: async () => { fileState.added = false; return true },
              updateMeta: async () => true,
            },
            localSync: { scanFolder: async () => ({ ok: true, files: [{ path: '/project/readme.md', relativePath: 'readme.md', name: 'readme.md', extension: '.md', size: 20, hash: 'fixture', mtime: '2026-10-07', isText: true }] }) },
            fs: {
              readFile: async () => {
                calls.push('read-file')
                const result = { ok: true, content: fileState.text, writable: !fileState.readonly }
                if (fileState.delay) await new Promise<void>(resolve => { fileState.release = resolve })
                return result
              },
              writeFile: async (_path: string, content: string) => {
                calls.push('write-file')
                if (fileState.fail) return { ok: false }
                fileState.text = content
                return { ok: true }
              },
            },
          } : {}),
          host: {
            ...(runtime ? {
              runtimeStatus: async () => runtimeState,
              onRuntimeState: (listener: (state: unknown) => void) => { runtimeListeners.add(listener); return () => runtimeListeners.delete(listener) },
              discoverAgents: async () => {
                calls.push('discover')
                return [
                  { profile_id: 'desktop-codex', adapter: 'codex', display_name: 'Codex', available: true, version: '1.0 fixture', requiresFullAccess: false },
                  { profile_id: 'desktop-pi', adapter: 'pi', display_name: 'Pi', available: true, version: '1.0 fixture', requiresFullAccess: true },
                  { profile_id: 'desktop-claude', adapter: 'claude-code', display_name: 'Claude Code', available: false, version: '', requiresFullAccess: false },
                ]
              },
              startAgents: async (selection: { adapters: string[]; workspaceAccess: string }) => {
                calls.push(`start:${JSON.stringify(selection)}`)
                if (runtimeCancel) { runtimeCancel = false; throw new Error('Local Agent operation cancelled') }
                runtimeState = { state: 'running', agents: selection.adapters.map(adapter => ({ profileId: `desktop-${adapter}`, adapter, agentId: `agent-${adapter}`, state: 'online' })) }
                runtimeListeners.forEach(listener => listener(runtimeState))
                return runtimeState
              },
              stopAgents: async () => {
                calls.push('stopAgents'); runtimeState = { state: 'stopped', agents: [], autoStart: false }
                runtimeListeners.forEach(listener => listener(runtimeState))
                return runtimeState
              },
            } : {}),
            status: async () => snapshot(),
            onState: (listener: (state: unknown) => void) => { listeners.add(listener); return () => listeners.delete(listener) },
            resume: async (token: string) => {
              userId = token.replace(/-token$/, '')
              calls.push(`resume:${userId}`)
              if (restoreFails) { restoreFails = false; unavailable = true; emit(); throw new Error('Native fixture network error') }
              unavailable = false
              verified = true
              if (userId !== 'alice') registered = false
              emit()
              return snapshot()
            },
            authorize: async (accountId: string) => {
              if (accountId !== userId) throw new Error('Wrong account')
              return {
                transactionId: 'transaction-from-native', request: {
                  installation_id: '22222222-2222-4222-8222-222222222222',
                  installation_key_hash: 'h'.repeat(43), code_challenge: 'c'.repeat(43),
                  display_name: 'My MacBook', environment: 'native', platform: 'darwin', client_version: '1.0.5-dev',
                },
              }
            },
            finishAuthorization: async (receipt: { transactionId: string; enrollmentId: string }) => {
              if (receipt.transactionId !== 'transaction-from-native' || receipt.enrollmentId !== 'grant-from-server') throw new Error('Invalid receipt')
              registered = true
              emit()
              return snapshot()
            },
            signOut: async () => { calls.push('signOut'); registered = false; verified = false; unavailable = false; emit(); return snapshot() },
          },
        },
      })
    }
  }, { native: options.native ?? false, locale: options.locale ?? 'zh', dark: options.dark ?? false, hostId, registered: options.registered ?? false, restoreFails: options.restoreFails ?? false, runtime: options.runtime ?? false, runtimeCancel: options.runtimeCancel ?? false, files: options.files ?? false })
  await page.route('**/api/auth/session', route => route.fulfill({ json: state.account ? {
    user: { id: state.account, name: state.account, email: `${state.account}@example.test` }, userId: state.account,
    accessToken: `${state.account}-token`, expires: '2099-01-01T00:00:00.000Z',
  } : {} }))
  await page.route('**/api/wtt/**', async route => {
    const req = route.request()
    const url = new URL(req.url())
    calls.push({ path: url.pathname, method: req.method(), body: req.postData() ? req.postDataJSON() : null })
    expect(req.headers().authorization).toBe(`Bearer ${state.account}-token`)
    if (url.pathname === '/api/wtt/auth/me') return route.fulfill({ json: { user_id: state.account, display_name: state.account } })
    if (url.pathname === '/api/wtt/hosts/my') {
      if (options.disabled) return route.fulfill({ status: 404, json: { detail: 'disabled' } })
      if (state.fail) return route.fulfill({ status: 503, json: { detail: 'private server error' } })
      return route.fulfill({ json: { hosts: state.hosts.map(value => ({ ...value, status: state.revoked ? 'revoked' : value.status })), next_offset: state.nextOffset } })
    }
    if (url.pathname === '/api/wtt/hosts/enrollments') {
      state.hosts = [host]
      return route.fulfill({ status: 201, json: { enrollment_id: 'grant-from-server', expires_in: 300 } })
    }
    if (url.pathname === `/api/wtt/hosts/${hostId}/revoke`) {
      state.revoked = true
      return route.fulfill({ json: { host_id: hostId, status: 'revoked' } })
    }
    return route.fulfill({ json: [] })
  })
  return { state, calls }
}

test('desktop registers through public proofs and displays the same account host', async ({ page }) => {
  const { calls } = await setup(page, { native: true, empty: true })
  await page.goto('/desktop/setup')
  await expect(page.getByText('暂无已授权主机。')).toBeVisible()
  await page.getByRole('button', { name: '启用本机', exact: true }).click()
  await expect(page.getByRole('button', { name: '本机已授权' })).toBeDisabled()
  await expect(page.getByText('My MacBook（本机）')).toBeVisible()
  await expect(page.getByText('Coding Agent')).toBeVisible()
  const grants = calls.filter(call => call.path === '/api/wtt/hosts/enrollments')
  expect(grants).toHaveLength(1)
  expect(grants[0].body).toMatchObject({ platform: 'darwin', code_challenge: 'c'.repeat(43) })
  expect(JSON.stringify(grants[0].body)).not.toMatch(/host_token|installation_secret|code_verifier|owner_user_id/)
  await page.getByRole('button', { name: '断开本机', exact: true }).click()
  await expect(page.getByRole('button', { name: '启用本机', exact: true })).toBeEnabled()
})

async function nativeCalls(page: Page) {
  return page.evaluate(() => (window as unknown as { __hostCalls: string[] }).__hostCalls)
}

test('Workspace onboarding retries failed account verification without starting Agents', async ({ page }) => {
  const { calls } = await setup(page, { native: true, registered: true, restoreFails: true, runtime: true })
  await page.route('**/api/wtt/workspaces**', route => route.fulfill({ json: { workspaces: [], roots: [], next_offset: null } }))
  await page.goto('/desktop')
  await expect.poll(() => nativeCalls(page)).toContain('resume:alice')
  await page.getByRole('button', { name: '接入本机', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '接入本机 Agent', exact: true })
  const retry = dialog.getByRole('button', { name: '校验账号并接入', exact: true })
  await expect(retry).toBeEnabled()
  expect(await nativeCalls(page)).not.toContain('discover')
  await retry.click()
  await expect(dialog.getByRole('button', { name: '启用所选 Agent', exact: true })).toBeEnabled()
  const native = await nativeCalls(page)
  expect(native.filter(call => call === 'resume:alice')).toHaveLength(2)
  expect(native).toContain('discover')
  expect(native.some(call => call.startsWith('start:'))).toBe(false)
  expect(calls.some(call => call.path.endsWith('/enrollments'))).toBe(false)
})

test('global account synchronization restores the host without another enrollment', async ({ page }) => {
  const { calls } = await setup(page, { native: true, registered: true })
  await page.goto('/desktop/setup')
  await expect(page.getByRole('button', { name: '本机已授权' })).toBeDisabled()
  await expect.poll(() => nativeCalls(page)).toContain('resume:alice')
  expect(calls.some(call => call.path.endsWith('/enrollments'))).toBe(false)
})

test('account switching and session expiration synchronize native authorization', async ({ page }) => {
  const { state } = await setup(page, { native: true, registered: true })
  await page.goto('/desktop/setup')
  await expect.poll(() => nativeCalls(page)).toContain('resume:alice')
  state.account = 'bob'
  state.hosts = []
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await expect.poll(() => nativeCalls(page)).toContain('resume:bob')
  await expect(page.getByText('My MacBook（本机）')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '启用本机', exact: true })).toBeEnabled()
  state.account = null
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await expect.poll(() => nativeCalls(page)).toContain('signOut')
  await expect(page.getByRole('link', { name: '登录 WTT', exact: true })).toBeVisible()
})

test('restore failure stays explicit and refresh retries without creating another host', async ({ page }) => {
  const { calls } = await setup(page, { native: true, registered: true, restoreFails: true })
  await page.goto('/desktop/setup')
  await expect(page.getByText('本机连接暂不可用，请刷新重试。')).toBeVisible()
  await expect(page.getByRole('button', { name: '启用本机', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '刷新主机' }).click()
  await expect(page.getByRole('button', { name: '本机已授权' })).toBeDisabled()
  expect(calls.some(call => call.path.endsWith('/enrollments'))).toBe(false)
})

test('existing logout controls disconnect native authorization before NextAuth redirects', async ({ page }) => {
  const { state } = await setup(page, { native: true, registered: true })
  await page.route('**/api/auth/csrf', route => route.fulfill({ json: { csrfToken: 'fixture-csrf' } }))
  let nativeWasDisconnected = false
  await page.route('**/api/auth/signout', async route => {
    nativeWasDisconnected = (await nativeCalls(page)).includes('signOut')
    state.account = null
    await route.fulfill({ json: { url: '/desktop/setup' } })
  })
  await page.goto('/mobile/settings')
  await expect.poll(() => nativeCalls(page)).toContain('resume:alice')
  await page.getByRole('button', { name: '退出登录', exact: true }).click()
  await expect(page.getByRole('link', { name: '登录 WTT', exact: true })).toBeVisible()
  expect(nativeWasDisconnected).toBe(true)
})

test('ordinary browser lists computers without native authorization controls', async ({ page }) => {
  await setup(page)
  await page.goto('/desktop/setup')
  await expect(page.getByText('My MacBook')).toBeVisible()
  await expect(page.getByRole('button', { name: '启用本机', exact: true })).toHaveCount(0)
  await expect(page.getByText('Coding Agent')).toBeVisible()
})

test('mobile settings lists account computers and opens an Agent in the shared chat route', async ({ page }) => {
  await setup(page)
  await page.goto('/mobile/settings?source=android')
  const panel = page.getByRole('region', { name: '我的主机' })
  await expect(panel.getByText('My MacBook')).toBeVisible()
  await expect(panel.getByRole('link', { name: '打开 Coding Agent' })).toHaveAttribute('href', '/mobile/feed?source=android&agent_id=agent-123456789abc')
  await expect(panel.getByRole('button', { name: '启用本机', exact: true })).toHaveCount(0)
  await expect(panel.getByRole('group', { name: '本机 Agent', exact: true })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/mobile-account-computers.png', fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('mobile settings hides the new host directory when its backend is not enabled', async ({ page }) => {
  await setup(page, { disabled: true })
  await page.goto('/mobile/settings')
  await expect(page.getByRole('button', { name: '退出登录', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: '我的主机' })).toHaveCount(0)
})

test('local Agent controls detect adapters, respect access requirements and start/stop', async ({ page }) => {
  await setup(page, { native: true, registered: true, runtime: true })
  await page.goto('/desktop/setup')
  const controls = page.getByRole('group', { name: '本机 Agent', exact: true })
  // Installed profiles are automatically discovered after authorization.
  await expect(controls.getByRole('checkbox', { name: 'Codex', exact: true })).toBeVisible()
  await expect(controls.getByRole('checkbox', { name: 'Codex', exact: true })).toBeChecked()
  await expect(controls.getByRole('checkbox', { name: 'Pi', exact: true })).toBeDisabled()
  await expect(controls.getByRole('checkbox', { name: 'Claude Code', exact: true })).toBeDisabled()
  await controls.getByRole('button', { name: '启动本机 Agent' }).click()
  await expect(controls.getByText('在线', { exact: true })).toBeVisible()
  await expect(controls.getByRole('combobox')).toBeDisabled()
  await controls.getByRole('button', { name: '停止本机 Agent' }).click()
  await expect(controls.getByRole('combobox')).toBeEnabled()
  await controls.getByRole('combobox').selectOption('full-access')
  await controls.getByRole('button', { name: '检测已安装 Agent' }).click()
  await controls.getByRole('checkbox', { name: 'Pi', exact: true }).check()
  await controls.getByRole('button', { name: '启动本机 Agent' }).click()
  await expect(controls.getByText('在线', { exact: true })).toHaveCount(2)
  const calls = await nativeCalls(page)
  expect(calls).toContain('stopAgents')
  expect(calls).toContain('start:{"adapters":["codex"],"workspaceAccess":"workspace-write"}')
  expect(calls).toContain('start:{"adapters":["codex","pi"],"workspaceAccess":"full-access"}')
  await page.screenshot({ path: 'test-results/desktop-local-agents-mobile.png', fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('provider imports follow native Adapter capabilities and retain per-profile public metadata', async ({ page }) => {
  await setup(page, { native: true, registered: true, runtime: true })
  await page.goto('/desktop/setup')
  const controls = page.getByRole('group', { name: '本机 Agent', exact: true })
  await controls.getByRole('button', { name: '检测已安装 Agent' }).click()
  await expect(controls.getByRole('button', { name: '导入 Pi 模型配置', exact: true })).toHaveCount(0)
  await page.evaluate(() => {
    const bridge = window.wttDesktop!.host!
    bridge.providerImportSupported = true
    bridge.providerImportAdapters = ['claude-code', 'pi', 'dsh']
    const discover = bridge.discoverAgents!
    bridge.discoverAgents = async () => [...await discover(), {
      profile_id: 'desktop-dsh', adapter: 'dsh', display_name: 'DSH', available: true, version: 'fixture', requiresFullAccess: false,
    }]
    bridge.importAgentProvider = async (profileId, reset) => {
      const calls = (window as unknown as { __hostCalls: string[] }).__hostCalls
      calls.push(`provider:${profileId}:${reset === true}`)
      return { profile_id: profileId, adapter: profileId === 'desktop-pi' ? 'pi' : 'dsh',
        display_name: profileId === 'desktop-pi' ? 'Pi' : 'DSH', available: true, version: 'fixture',
        requiresFullAccess: profileId === 'desktop-pi', ...(reset ? {} : { providerOrigin: 'https://api.deepseek.com' }) }
    }
  })
  await controls.getByRole('button', { name: '检测已安装 Agent' }).click()
  for (const name of ['Pi', 'DSH']) await controls.getByRole('button', { name: `导入 ${name} 模型配置`, exact: true }).click()
  await expect(controls.getByText('https://api.deepseek.com', { exact: true })).toHaveCount(2)
  await controls.getByRole('button', { name: '使用 CLI 默认模型配置', exact: true }).first().click()
  await expect(controls.getByText('https://api.deepseek.com', { exact: true })).toHaveCount(1)
  expect(await nativeCalls(page)).toEqual(expect.arrayContaining(['provider:desktop-pi:false', 'provider:desktop-dsh:false', 'provider:desktop-pi:true']))
  await page.screenshot({ path: 'test-results/desktop-provider-imports.png', fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('automatic restore displays actual execution permissions and Stop does not race discovery', async ({ page }) => {
  await setup(page, { native: true, registered: true, runtime: true })
  await page.goto('/desktop/setup')
  const controls = page.getByRole('group', { name: '本机 Agent', exact: true })
  await expect(controls).toBeVisible()
  await page.evaluate(() => (window as unknown as { __pushRuntime: (state: DesktopRuntimeState) => void }).__pushRuntime({
    state: 'restoring', agents: [], autoStart: true, workspaceAccess: 'full-access', configuredAdapters: ['pi'],
  }))
  await expect(controls.getByText('正在恢复已授权 Agent…')).toBeVisible()
  await expect(controls.getByText('已启用自动恢复')).toBeVisible()
  await expect(controls.getByRole('combobox')).toHaveValue('full-access')
  await expect(controls.getByRole('combobox')).toBeDisabled()
  await page.screenshot({ path: 'test-results/desktop-auto-restore-mobile.png', fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await controls.getByRole('button', { name: '停止本机 Agent' }).click()
  await expect(controls.getByText('已关闭自动恢复')).toBeVisible()
  expect(await nativeCalls(page)).not.toContain('discover')
  expect((await nativeCalls(page)).filter(call => call.startsWith('start:'))).toEqual([])
})

test('automatic restore configuration errors give an actionable localized status', async ({ page }) => {
  await setup(page, { native: true, registered: true, runtime: true, locale: 'en' })
  await page.goto('/desktop/setup')
  const controls = page.getByRole('group', { name: 'Local Agents', exact: true })
  await expect(controls).toBeVisible()
  await page.evaluate(() => (window as unknown as { __pushRuntime: (state: DesktopRuntimeState) => void }).__pushRuntime({
    state: 'configuration_required', agents: [], error: 'runtime_selection_changed', autoStart: true,
  }))
  await expect(controls.getByRole('status')).toHaveText('Installed Agents or permissions changed. Detect and authorize them again.')
  await expect(controls.getByRole('button', { name: 'Detect installed Agents' })).toBeEnabled()
})

for (const locale of ['zh', 'en'] as const) {
  test(`Agent connection and execution readiness remain distinct (${locale})`, async ({ page }) => {
    if (locale === 'en') await page.setViewportSize({ width: 1280, height: 800 })
    await setup(page, { native: true, registered: true, runtime: true, locale, dark: locale === 'zh' })
    await page.goto('/desktop/setup')
    const controls = page.getByRole('group', { name: locale === 'en' ? 'Local Agents' : '本机 Agent', exact: true })
    await expect(controls).toBeVisible()
    const agents = [
      { profileId: 'pi', adapter: 'pi', agentId: 'agent-pi', state: 'online', readiness: 'authentication_required' as const },
      { profileId: 'dsh', adapter: 'dsh', agentId: 'agent-dsh', state: 'online', readiness: 'configuration_required' as const },
      { profileId: 'codex', adapter: 'codex', agentId: 'agent-codex', state: 'online', readiness: 'verified' as const },
      { profileId: 'legacy', adapter: 'gemini', agentId: 'agent-legacy', state: 'offline' },
    ]
    await page.evaluate(agents => (window as unknown as { __pushRuntime: (state: DesktopRuntimeState) => void }).__pushRuntime({ state: 'running', agents }), agents)
    await expect(controls.getByText(locale === 'en' ? 'Online' : '在线', { exact: true })).toHaveCount(3)
    await expect(controls.getByText(locale === 'en' ? 'CLI sign-in required' : '需要 CLI 登录', { exact: true })).toBeVisible()
    await expect(controls.getByText(locale === 'en' ? 'CLI credentials required' : '需要配置 CLI 凭据', { exact: true })).toBeVisible()
    await expect(controls.getByText(locale === 'en' ? 'Last execution succeeded' : '最近执行成功', { exact: true })).toBeVisible()
    await expect(controls.getByText(locale === 'en' ? 'Execution not yet verified' : '待执行验证', { exact: true })).toBeVisible()
    await expect(controls.getByRole('link', { name: locale === 'en' ? 'pi sign-in and configuration help' : 'pi 登录与配置帮助' })).toHaveAttribute('href', 'https://pi.dev/docs/latest/providers')
    await expect(controls.getByRole('link', { name: locale === 'en' ? 'dsh sign-in and configuration help' : 'dsh 登录与配置帮助' })).toHaveAttribute('rel', 'noopener noreferrer')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `test-results/desktop-agent-readiness-${locale}.png`, fullPage: true })
    await page.evaluate(agents => (window as unknown as { __pushRuntime: (state: DesktopRuntimeState) => void }).__pushRuntime({
      state: 'running', agents: agents.map(agent => ({ ...agent, readiness: 'verified' })),
    }), agents)
    await expect(controls.getByText(locale === 'en' ? 'CLI sign-in required' : '需要 CLI 登录', { exact: true })).toHaveCount(0)
    await expect(controls.getByRole('link')).toHaveCount(0)
    await expect(controls.getByText(locale === 'en' ? 'Last execution succeeded' : '最近执行成功', { exact: true })).toHaveCount(4)
    expect((await nativeCalls(page)).some(call => call.startsWith('start:'))).toBe(false)
  })
}

test('cancelled native execution consent does not display a running Agent', async ({ page }) => {
  await setup(page, { native: true, registered: true, runtime: true, runtimeCancel: true })
  await page.goto('/desktop/setup')
  const controls = page.getByRole('group', { name: '本机 Agent', exact: true })
  await controls.getByRole('button', { name: '检测已安装 Agent' }).click()
  await controls.getByRole('button', { name: '启动本机 Agent' }).click()
  await expect(controls.getByRole('alert')).toHaveText('操作已取消。')
  await expect(controls.getByRole('button', { name: '停止本机 Agent' })).toHaveCount(0)
  await expect(controls.getByRole('button', { name: '启动本机 Agent' })).toBeEnabled()
})

test('revocation requires confirmation and preserves the listed history identity', async ({ page }) => {
  const { calls } = await setup(page)
  await page.goto('/desktop/setup')
  await page.getByRole('button', { name: '撤销授权 My MacBook' }).click()
  await expect(page.getByText('撤销这台主机的连接授权？聊天历史将保留。')).toBeVisible()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  expect(calls.filter(call => call.path.endsWith('/revoke'))).toHaveLength(0)
  await page.getByRole('button', { name: '撤销授权 My MacBook' }).click()
  await page.getByRole('button', { name: '确认撤销', exact: true }).click()
  await expect(page.getByText('已撤销', { exact: true })).toBeVisible()
  await expect(page.getByText('Coding Agent')).toBeVisible()
  expect(calls.filter(call => call.path.endsWith('/revoke'))).toHaveLength(1)
})

test('failed refresh keeps existing hosts and does not display internal errors', async ({ page }) => {
  const { state } = await setup(page)
  await page.goto('/desktop/setup')
  await expect(page.getByText('My MacBook')).toBeVisible()
  state.fail = true
  await page.getByRole('button', { name: '刷新主机' }).click()
  await expect(page.getByRole('region', { name: '我的主机' }).getByRole('alert')).toContainText('操作未完成')
  await expect(page.getByText('My MacBook')).toBeVisible()
  await expect(page.getByText('private server error')).toHaveCount(0)
})

test('disabled service has an explicit state and cannot be enabled from desktop', async ({ page }) => {
  await setup(page, { native: true, disabled: true })
  await page.goto('/desktop/setup')
  await expect(page.getByText('主机接入服务尚未启用。')).toBeVisible()
  await expect(page.getByRole('button', { name: '启用本机', exact: true })).toBeDisabled()
})

test('host pagination preserves prior entries and deduplicates overlapping rows', async ({ page }) => {
  const { state } = await setup(page)
  state.nextOffset = 50
  await page.goto('/desktop/setup')
  await expect(page.getByText('My MacBook')).toBeVisible()
  state.hosts = [host, { ...host, host_id: '33333333-3333-4333-8333-333333333333', display_name: 'Build workstation', platform: 'linux', environment: 'wsl' }]
  state.nextOffset = null
  await page.getByRole('button', { name: '加载更多', exact: true }).click()
  await expect(page.getByText('Build workstation')).toBeVisible()
  await expect(page.getByText('My MacBook')).toHaveCount(1)
  await expect(page.getByRole('button', { name: '加载更多', exact: true })).toHaveCount(0)
})

test('unsigned visitors use the existing WTT login with a return URL', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('wtt-web.locale', 'zh'))
  await page.route('**/api/auth/session', route => route.fulfill({ json: {} }))
  await page.goto('/desktop/setup')
  await expect(page.getByRole('link', { name: '登录 WTT', exact: true })).toHaveAttribute('href', '/login?callbackUrl=%2Fdesktop%2Fsetup')
  await expect(page.getByRole('button', { name: '启用本机', exact: true })).toHaveCount(0)
})

test('English dark desktop and narrow mobile layouts do not overflow', async ({ page }) => {
  await setup(page, { native: true, locale: 'en', dark: true })
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/desktop/setup')
  await expect(page.getByRole('heading', { name: 'My computers' })).toBeVisible()
  await expect(page.getByText('My MacBook')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Enable this computer' })).toBeEnabled()
  await expect(page.getByRole('alert').filter({ hasText: 'Could not complete' })).toHaveCount(0)
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.screenshot({ path: 'test-results/desktop-hosts-dark-en.png', fullPage: true })
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    await expect(page.getByRole('button', { name: 'Enable this computer' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.screenshot({ path: 'test-results/desktop-hosts-mobile-en.png', fullPage: true })
})

async function selectLocalFile(page: Page) {
  await page.getByRole('button', { name: '添加文件夹', exact: true }).click()
  await page.getByRole('button', { name: /My workspace/ }).click()
  await page.getByRole('button', { name: /readme.md/ }).click()
}

test('local files verify the account without Agent enrollment and support edit/save', async ({ page }) => {
  await setup(page, { native: true, files: true, empty: true })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/desktop/setup')
  await expect.poll(() => nativeCalls(page)).toContain('resume:alice')
  await selectLocalFile(page)
  const editor = page.getByRole('textbox', { name: '文件内容' })
  await expect(editor).toHaveValue('Hello from local WTT')
  await editor.fill('Edited file')
  await page.getByRole('button', { name: '保存文件', exact: true }).click()
  await expect(page.getByRole('button', { name: '保存文件', exact: true })).toBeDisabled()
  expect(await page.evaluate(() => (window as unknown as { __files: { text: string } }).__files.text)).toBe('Edited file')
  expect(await nativeCalls(page)).toContain('write-file')
  await page.screenshot({ path: 'test-results/desktop-local-files.png', fullPage: true })
  await page.getByRole('button', { name: /My workspace/ }).hover()
  await page.getByRole('button', { name: '移除', exact: true }).click()
  await expect(editor).toHaveCount(0)
  await expect(page.getByRole('button', { name: /My workspace/ })).toHaveCount(0)
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
})

test('local read-only grants disable editing and failed saves retain the draft', async ({ page }) => {
  await setup(page, { native: true, files: true })
  await page.goto('/desktop/setup')
  await page.evaluate(() => { (window as unknown as { __files: { readonly: boolean } }).__files.readonly = true })
  await selectLocalFile(page)
  await expect(page.getByRole('textbox', { name: '文件内容' })).toHaveAttribute('readonly', '')
  await expect(page.getByRole('button', { name: '保存文件', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '关闭文件', exact: true }).click()
  await page.evaluate(() => {
    const state = (window as unknown as { __files: { readonly: boolean; fail: boolean } }).__files
    state.readonly = false; state.fail = true
  })
  await page.getByRole('button', { name: /readme.md/ }).click()
  await page.getByRole('textbox', { name: '文件内容' }).fill('Keep this unsaved draft')
  await page.getByRole('button', { name: '保存文件', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: '无法保存' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: '文件内容' })).toHaveValue('Keep this unsaved draft')
})

test('account switch clears local files and ignores a late previous-account read', async ({ page }) => {
  const { state } = await setup(page, { native: true, files: true })
  await page.goto('/desktop/setup')
  await page.evaluate(() => { (window as unknown as { __files: { delay: boolean } }).__files.delay = true })
  await selectLocalFile(page)
  await expect.poll(() => nativeCalls(page)).toContain('read-file')
  state.account = 'bob'
  state.hosts = []
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await expect.poll(() => nativeCalls(page)).toContain('resume:bob')
  await page.evaluate(() => { (window as unknown as { __files: { release: (() => void) | null } }).__files.release?.() })
  await expect(page.getByRole('button', { name: /My workspace/ })).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: '文件内容' })).toHaveCount(0)
  await expect(page.getByText('Hello from local WTT')).toHaveCount(0)
  state.account = null
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await expect.poll(() => nativeCalls(page)).toContain('signOut')
  await expect(page.getByRole('region', { name: '本机文件' })).toHaveCount(0)
})
