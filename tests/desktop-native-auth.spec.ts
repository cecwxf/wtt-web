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
