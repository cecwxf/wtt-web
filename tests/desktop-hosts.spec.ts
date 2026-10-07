import { expect, test, type Page } from '@playwright/test'

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
      let runtimeState = { state: 'stopped', agents: [] as Array<{ profileId: string; adapter: string; agentId: string; state: string }> }
      const runtimeListeners = new Set<(state: unknown) => void>()
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
                calls.push('stopAgents'); runtimeState = { state: 'stopped', agents: [] }
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

test('local Agent controls detect adapters, respect access requirements and start/stop', async ({ page }) => {
  await setup(page, { native: true, registered: true, runtime: true })
  await page.goto('/desktop/setup')
  const controls = page.getByRole('group', { name: '本机 Agent', exact: true })
  await expect(controls.getByRole('button', { name: '启动本机 Agent' })).toBeDisabled()
  await controls.getByRole('button', { name: '检测已安装 Agent' }).click()
  await expect(controls.getByRole('checkbox', { name: 'Codex', exact: true })).toBeChecked()
  await expect(controls.getByRole('checkbox', { name: 'Pi', exact: true })).toBeDisabled()
  await expect(controls.getByRole('checkbox', { name: 'Claude Code', exact: true })).toBeDisabled()
  await controls.getByRole('button', { name: '启动本机 Agent' }).click()
  await expect(controls.getByText('在线', { exact: true })).toBeVisible()
  await expect(controls.getByRole('combobox')).toBeDisabled()
  await controls.getByRole('button', { name: '停止本机 Agent' }).click()
  await expect(controls.getByRole('combobox')).toBeEnabled()
  await controls.getByRole('combobox').selectOption('full-access')
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
