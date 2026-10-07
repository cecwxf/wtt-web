import { expect, test } from '@playwright/test'

test('mobile auth waits for the native exchange before redirecting to login', async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: '[]' }))
  await page.route('**/api/auth/session', route => route.fulfill({ contentType: 'application/json', body: '{}' }))
  await page.addInitScript(() => {
    ;(window as Window & { __WTT_NATIVE_SESSION_PENDING__?: boolean }).__WTT_NATIVE_SESSION_PENDING__ = true
  })
  await page.goto('/mobile/feed?source=android')
  await expect(page.getByRole('button', { name: '选择主机 / Agent / Topic', exact: true })).toBeVisible()
  await expect(page).toHaveURL(/\/mobile\/feed/)
  await page.evaluate(() => {
    ;(window as Window & { __WTT_NATIVE_SESSION_PENDING__?: boolean }).__WTT_NATIVE_SESSION_PENDING__ = false
    window.dispatchEvent(new Event('wtt-native-session-ready'))
  })
  await expect(page).toHaveURL(/\/mobile\/login\?.*source=android/)
})

test('mobile sign-out awaits native revocation before clearing the Web cookie', async ({ page }) => {
  let webSignOutRequests = 0
  await page.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: '[]' }))
  await page.route('**/api/auth/session', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
    user: { name: 'Mobile auth fixture' }, userId: 'alice', accessToken: 'child-fixture', expires: '2099-01-01T00:00:00.000Z',
  }) }))
  await page.route('**/api/auth/csrf', route => route.fulfill({ contentType: 'application/json', body: '{"csrfToken":"fixture-csrf"}' }))
  await page.route('**/api/auth/signout', route => {
    webSignOutRequests++
    return route.fulfill({ contentType: 'application/json', body: '{"url":"http://127.0.0.1:3107/mobile/login?source=android"}' })
  })
  await page.addInitScript(() => {
    const target = window as Window & { __WTT_NATIVE_SESSION__?: unknown; completeNativeLogout?: () => void; nativeLogoutStarted?: boolean }
    window.localStorage.setItem('__WTT_NATIVE_ACCESS_TOKEN__', 'legacy-fixture-secret')
    target.__WTT_NATIVE_SESSION__ = { version: 1, signOut: () => new Promise<void>(resolve => {
      target.nativeLogoutStarted = true
      target.completeNativeLogout = resolve
    }) }
  })
  await page.goto('/mobile/settings?source=android')
  await page.getByRole('button', { name: '退出登录', exact: true }).click()
  await page.waitForFunction(() => (window as Window & { nativeLogoutStarted?: boolean }).nativeLogoutStarted)
  expect(webSignOutRequests).toBe(0)
  expect(await page.evaluate(() => window.localStorage.getItem('__WTT_NATIVE_ACCESS_TOKEN__'))).toBeNull()
  await page.evaluate(() => (window as Window & { completeNativeLogout?: () => void }).completeNativeLogout?.())
  await expect.poll(() => webSignOutRequests).toBe(1)
  await expect(page).toHaveURL(/\/mobile\/login/)
})
