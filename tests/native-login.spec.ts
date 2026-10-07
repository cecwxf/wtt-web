import { expect, test } from '@playwright/test'

const ticket = 'fixture-signed-request-ticket'
test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/providers', route => route.fulfill({ json: { github: { id: 'github' }, google: { id: 'google' }, twitter: { id: 'twitter' } } }))
  await page.route('**/api/native-login/inspect', route => route.fulfill({ json: { provider: 'github', expiresAt: Date.now() + 600_000 } }))
})

test('existing account requires explicit confirmation, with no automatic approval', async ({ page }) => {
  let approvals = 0
  await page.route('**/api/auth/session', route => route.fulfill({ json: { userId: 'alice', user: { name: 'Native login fixture' }, expires: '2099-01-01' } }))
  await page.route('**/api/native-login/approve', route => { approvals++; return route.fulfill({ status: 503, json: {} }) })
  await page.goto('/native-login?request=' + ticket)
  await expect(page.getByText('Native login fixture', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Confirm and Return to WTT' })).toBeVisible()
  expect(approvals).toBe(0)
  await page.getByRole('button', { name: 'Confirm and Return to WTT' }).click()
  await expect(page.locator('main [role=alert]')).toBeVisible()
  expect(approvals).toBe(1)
  await expect(page).toHaveURL(/\/native-login/)
  expect(await page.locator('meta[name=referrer]').getAttribute('content')).toBe('no-referrer')
  await page.screenshot({ path: 'test-results/native-login-confirm.png', fullPage: true })
})

test('anonymous browser offers supported login without auto-starting OAuth', async ({ page }) => {
  await page.route('**/api/auth/session', route => route.fulfill({ json: {} }))
  await page.goto('/native-login?request=' + ticket)
  await expect(page.getByRole('button', { name: 'Continue with GitHub' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Confirm and Return to WTT' })).toHaveCount(0)
  const target = await page.getByRole('link', { name: 'Use Phone or Another Account' }).getAttribute('href')
  expect(new URL(target!, 'http://localhost').searchParams.get('callbackUrl')).toBe('/native-login?request=' + ticket)
})

test('expired request cannot authorize the account', async ({ page }) => {
  await page.route('**/api/auth/session', route => route.fulfill({ json: { userId: 'alice', user: { name: 'Alice' } } }))
  await page.route('**/api/native-login/inspect', route => route.fulfill({ status: 401, json: {} }))
  await page.goto('/native-login?request=' + ticket)
  await expect(page.locator('main [role=alert]')).toContainText('expired')
  await expect(page.getByRole('button', { name: 'Confirm and Return to WTT' })).toHaveCount(0)
})
