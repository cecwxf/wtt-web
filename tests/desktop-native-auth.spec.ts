import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/session', route => route.fulfill({ json: {} }))
})

test('desktop OAuth uses native browser IPC and supports explicit cancellation', async ({ page }) => {
  await page.addInitScript(() => {
    const state = { providers: [] as string[], cancelled: 0 }
    const values = window as unknown as Record<string, unknown>
    values.desktopAuthFixture = state
    let reject: ((error: Error) => void) | undefined
    values.wttDesktop = {
      isDesktop: true,
      auth: {
        status: async () => ({ pending: false, hasSavedAccount: false }),
        login: (provider: string) => {
          state.providers.push(provider)
          return new Promise((_resolve, fail) => { reject = fail })
        },
        cancel: async () => { state.cancelled++; reject?.(new Error('cancelled')) },
      },
    }
  })
  await page.goto('/login?callbackUrl=/desktop')
  await page.getByRole('button', { name: 'Continue with GitHub' }).click()
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeDisabled()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Continue with GitHub' })).toBeEnabled()
  expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).desktopAuthFixture)).toEqual({ providers: ['github'], cancelled: 1 })
  await expect(page).toHaveURL(/\/login/)
})

test('saved desktop credentials restore only after an explicit click', async ({ page }) => {
  await page.addInitScript(() => {
    const state = { restored: 0 }
    const values = window as unknown as Record<string, unknown>
    values.desktopAuthFixture = state
    values.wttDesktop = {
      isDesktop: true,
      auth: {
        status: async () => ({ pending: false, hasSavedAccount: true }),
        restore: async () => { state.restored++; return { ok: true, userId: 'alice' } },
      },
    }
  })
  await page.goto('/login')
  const restore = page.getByRole('button', { name: 'Continue desktop sign-in' })
  await expect(restore).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { desktopAuthFixture: { restored: number } }).desktopAuthFixture.restored)).toBe(0)
  await restore.click()
  expect(await page.evaluate(() => (window as unknown as { desktopAuthFixture: { restored: number } }).desktopAuthFixture.restored)).toBe(1)
})

test('ordinary web login has no desktop restore or native cancellation controls', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('button', { name: 'Continue with GitHub' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue desktop sign-in' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0)
})

for (const code of ['credential_storage_unavailable', 'credential_storage_recovery_required'] as const) {
  test(`native ${code} displays a safe actionable message and leaves sign-in usable`, async ({ page }) => {
    await page.addInitScript(code => {
      const values = window as unknown as Record<string, unknown>
      values.wttDesktop = { isDesktop: true, auth: {
        status: async () => ({ pending: false, hasSavedAccount: false }),
        login: async () => ({ ok: false, errorCode: code, error: 'private-token-or-local-path' }),
      } }
    }, code)
    await page.goto('/login')
    await page.getByRole('button', { name: 'Continue with GitHub' }).click()
    await expect(page.getByText(code === 'credential_storage_unavailable'
      ? 'System credential storage is unavailable. Unlock or configure your OS keyring, then restart sign-in.'
      : 'Saved desktop credentials could not be read. Restore your local secure storage and retry. Existing credentials have not been overwritten.')).toBeVisible()
    await expect(page.getByText('private-token-or-local-path')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Continue with GitHub' })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0)
  })
}

test('the credential-store recovery action is localized in Chinese', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('wtt-web.locale', 'zh')
    const values = window as unknown as Record<string, unknown>
    values.wttDesktop = { isDesktop: true, auth: {
      status: async () => ({ pending: false, hasSavedAccount: false }),
      login: async () => ({ ok: false, errorCode: 'credential_storage_unavailable' }),
    } }
  })
  await page.goto('/login')
  await page.getByRole('button', { name: '使用 GitHub 继续' }).click()
  await expect(page.getByText('无法访问系统安全存储。请解锁或配置系统钥匙串后重新登录。')).toBeVisible()
  await expect(page.getByRole('button', { name: '使用 GitHub 继续' })).toBeEnabled()
})
