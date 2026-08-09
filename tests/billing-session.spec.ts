import { expect, test, type Route } from '@playwright/test'

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

test('an unavailable billing request is not rendered as a Free downgrade', async ({ page }) => {
  await page.route('**/api/auth/session', (route) => json(route, {
    user: { name: 'Pro Tester', email: 'pro@example.com' },
    accessToken: 'expired-backend-token',
    expires: '2099-01-01T00:00:00.000Z',
  }))
  await page.route('**/api/wtt/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api\/wtt/, '')
    if (path === '/billing/me') {
      await json(route, { detail: 'Invalid or expired token' }, 401)
      return
    }
    if (path === '/agents/my') {
      await json(route, [{ agent_id: 'agent-1', display_name: 'Agent One' }])
      return
    }
    if (path === '/agents/stats') {
      await json(route, { online_agents: [], runtimes: {} })
      return
    }
    if (path === '/topics/my-recent') {
      await json(route, { items: [] })
      return
    }
    if (path === '/topics/subscribed' || path === '/topics/my-groups' || path.startsWith('/tasks')) {
      await json(route, [])
      return
    }
    await json(route, {})
  })

  await page.goto('/feed?agent_id=agent-1')

  await expect(page.getByText('Free', { exact: true })).toHaveCount(0)
  await expect(page.getByText('...', { exact: true }).first()).toBeVisible()
})
