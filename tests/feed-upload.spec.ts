import { expect, type Page, type Route, test } from '@playwright/test'

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

async function mockFeedApi(
  page: Page,
  options: {
    onMediaSign?: (body: unknown) => void
    onMediaCommit?: (body: unknown) => void
  } = {},
) {
  await page.route('**/api/auth/session', async (route) => {
    await fulfillJson(route, {
      user: { name: 'Feed Tester', email: 'feed@example.com' },
      accessToken: 'test-access-token',
      expires: '2099-01-01T00:00:00.000Z',
    })
  })

  await page.route('**/api/wtt/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname.replace(/^\/api\/wtt/, '')
    const method = request.method()

    if (path === '/agents/my') {
      await fulfillJson(route, [
        {
          agent_id: 'agent-1',
          display_name: 'Alice Agent',
          cloud_host_agent_id: 'host-a',
        },
      ])
      return
    }

    if (path === '/agents/stats') {
      await fulfillJson(route, { online_agents: ['agent-1'], runtimes: {} })
      return
    }

    if (path === '/topics/subscribed') {
      await fulfillJson(route, [
        {
          id: 'topic-p2p',
          topic_id: 'topic-p2p',
          name: 'P2P with Alice',
          topic_type: 'p2p',
          last_activity_at: '2026-06-11T01:00:00.000Z',
        },
      ])
      return
    }

    if (path === '/topics/my-groups') {
      await fulfillJson(route, [])
      return
    }

    if (path === '/topics/my-recent') {
      await fulfillJson(route, { items: [] })
      return
    }

    if (path === '/topics/topic-p2p/members') {
      await fulfillJson(route, [{ agent_id: 'agent-1', display_name: 'Alice Agent', role: 'owner' }])
      return
    }

    if (path === '/topics/topic-p2p/messages') {
      if (method === 'POST') {
        await fulfillJson(route, {
          message_id: 'message-new',
          topic_id: 'topic-p2p',
          sender_id: 'feed@example.com',
          sender_type: 'human',
          content: 'sent',
          timestamp: '2026-06-11T01:02:00.000Z',
        })
        return
      }
      await fulfillJson(route, [
        {
          message_id: 'message-1',
          topic_id: 'topic-p2p',
          sender_id: 'agent-1',
          sender_display_name: 'Alice Agent',
          sender_type: 'agent',
          content: 'Ready.',
          timestamp: '2026-06-11T01:01:00.000Z',
        },
      ])
      return
    }

    if (path === '/media/sign') {
      options.onMediaSign?.(request.postDataJSON())
      await fulfillJson(route, {
        upload_token: 'upload-token-notes',
        upload_url: '/media/upload-direct/upload-token-notes',
      })
      return
    }

    if (path === '/media/upload-direct/upload-token-notes' && method === 'PUT') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, bytes: 5 }) })
      return
    }

    if (path === '/media/commit') {
      options.onMediaCommit?.(request.postDataJSON())
      await fulfillJson(route, {
        url: 'https://example.com/media/notes.md',
        mime_type: 'text/markdown',
        content_type: 'file',
      })
      return
    }

    if (path === '/billing/me') {
      await fulfillJson(route, { entitlement: { plan: 'free' }, cloud_agent_usage: {} })
      return
    }

    if (path.startsWith('/agent-operations') || path.startsWith('/p2p-requests') || path.startsWith('/tasks')) {
      await fulfillJson(route, [])
      return
    }

    if (path.endsWith('/e2e-key')) {
      await fulfillJson(route, { public_key: null })
      return
    }

    await fulfillJson(route, {})
  })
}

test('desktop chat file attachment opens picker and uploads', async ({ page }) => {
  const mediaSignRequests: unknown[] = []
  const mediaCommitRequests: unknown[] = []
  await mockFeedApi(page, {
    onMediaSign: (body) => mediaSignRequests.push(body),
    onMediaCommit: (body) => mediaCommitRequests.push(body),
  })
  await page.addInitScript(() => {
    localStorage.setItem('wtt_selected_topic_id', 'topic-p2p')
  })

  await page.goto('/feed?agent_id=agent-1')

  await expect(page.getByText('P2P with Alice')).toBeVisible()
  await page.getByTitle(/附件|Attach/).click()

  const fileChooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /^(文件|File)$/ }).click()
  const fileChooser = await fileChooserPromise
  expect(await fileChooser.element().getAttribute('accept')).not.toBe('*/*')

  await fileChooser.setFiles({
    name: 'notes.md',
    mimeType: '',
    buffer: Buffer.from('# desktop attachment\n'),
  })

  await expect(page.getByText('notes.md')).toBeVisible()
  await expect.poll(() => mediaSignRequests.length).toBe(1)
  await expect.poll(() => mediaCommitRequests.length).toBe(1)
  expect(mediaSignRequests[0]).toMatchObject({
    filename: 'notes.md',
    mime_type: 'text/markdown',
  })
  expect(mediaCommitRequests[0]).toMatchObject({ upload_token: 'upload-token-notes' })
})
