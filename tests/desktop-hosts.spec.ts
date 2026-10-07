import { expect, test, type Page } from '@playwright/test'

const hostId = '11111111-1111-4111-8111-111111111111'
const host = {
  host_id: hostId, display_name: 'My MacBook', platform: 'darwin', environment: 'native',
  client_version: '1.0.5-dev', status: 'offline', last_seen_at: null,
  agents: [{ agent_id: 'agent-123456789abc', profile_id: 'codex-default', adapter: 'codex', display_name: 'Coding Agent' }],
}

async function setup(page: Page, options: { native?: boolean; locale?: 'zh' | 'en'; dark?: boolean; empty?: boolean; disabled?: boolean } = {}) {
  const calls: Array<{ path: string; method: string; body: unknown }> = []
  const state = { hosts: options.empty ? [] : [host], fail: false, revoked: false, nextOffset: null as number | null }
  await page.addInitScript(({ native, locale, dark, hostId }) => {
    localStorage.setItem('wtt-web.locale', locale)
    localStorage.setItem('theme', dark ? 'dark' : 'light')
    if (native) {
      let registered = false
      Object.defineProperty(window, 'wttDesktop', {
        value: {
          isDesktop: true, platform: 'darwin',
          host: {
            status: async () => ({ enabled: true, state: registered ? 'registered' : 'signed_out', ...(registered ? { hostId, userId: 'alice' } : {}) }),
            authorize: async (userId: string) => {
              if (userId !== 'alice') throw new Error('Wrong account')
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
              return { state: 'registered', userId: 'alice', hostId }
            },
            signOut: async () => { registered = false; return { state: 'signed_out' } },
          },
        },
      })
    }
  }, { native: options.native ?? false, locale: options.locale ?? 'zh', dark: options.dark ?? false, hostId })
  await page.route('**/api/auth/session', route => route.fulfill({ json: {
    user: { name: 'Alice', email: 'alice@example.test' }, accessToken: 'alice-token', expires: '2099-01-01T00:00:00.000Z',
  } }))
  await page.route('**/api/wtt/**', async route => {
    const req = route.request()
    const url = new URL(req.url())
    calls.push({ path: url.pathname, method: req.method(), body: req.postData() ? req.postDataJSON() : null })
    expect(req.headers().authorization).toBe('Bearer alice-token')
    if (url.pathname === '/api/wtt/auth/me') return route.fulfill({ json: { user_id: 'alice', display_name: 'Alice' } })
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

test('ordinary browser lists computers without native authorization controls', async ({ page }) => {
  await setup(page)
  await page.goto('/desktop/setup')
  await expect(page.getByText('My MacBook')).toBeVisible()
  await expect(page.getByRole('button', { name: '启用本机', exact: true })).toHaveCount(0)
  await expect(page.getByText('Coding Agent')).toBeVisible()
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
