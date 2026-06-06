import { expect, type Page, type Route, test } from '@playwright/test'

const mockAgents = [
  {
    agent_id: 'agent-1',
    display_name: 'Alice Agent',
    cloud_host_agent_id: 'host-a',
  },
  {
    agent_id: 'agent-2',
    display_name: 'Build Agent',
    cloud_host_agent_id: 'host-a',
  },
]

const mockTopics = [
  {
    id: 'topic-task',
    topic_id: 'topic-task',
    name: 'Sprint Planning',
    description: 'General task conversation',
    topic_type: 'discussion',
    task_id: 'task-1',
    last_activity_at: '2026-06-06T01:00:00.000Z',
  },
  {
    id: 'topic-p2p',
    topic_id: 'topic-p2p',
    name: 'P2P with Alice',
    description: 'Private agent chat',
    topic_type: 'p2p',
    last_activity_at: '2026-06-06T00:58:00.000Z',
  },
  {
    id: 'topic-group',
    topic_id: 'topic-group',
    name: 'Research Group',
    description: 'Group discussion',
    topic_type: 'collaborative',
    unread_count: 2,
    last_activity_at: '2026-06-06T00:55:00.000Z',
  },
  {
    id: 'topic-broadcast',
    topic_id: 'topic-broadcast',
    name: 'Daily Broadcast',
    description: 'Subscriber updates',
    topic_type: 'broadcast',
    last_activity_at: '2026-06-06T00:50:00.000Z',
  },
]

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

async function mockAuthenticatedMobileApi(
  page: Page,
  options: {
    topics?: typeof mockTopics
    topicMembers?: Array<{ agent_id: string; display_name?: string; role?: string }>
    messages?: Array<Record<string, unknown>>
    mediaCommitUrl?: string
    onTopicMessagePost?: (url: string, body: unknown) => void
    onMediaSign?: (headers: Record<string, string>, body: unknown) => void
    onMediaCommit?: (headers: Record<string, string>, body: unknown) => void
  } = {},
) {
  await page.route('**/api/auth/session', async (route) => {
    await fulfillJson(route, {
      user: { name: 'Mobile Tester', email: 'mobile@example.com' },
      accessToken: 'test-access-token',
      expires: '2099-01-01T00:00:00.000Z',
    })
  })

  await page.route('**/api/wtt/agents/my', async (route) => {
    await fulfillJson(route, mockAgents)
  })

  await page.route('**/api/wtt/agents/stats', async (route) => {
    await fulfillJson(route, {
      online_agents: ['agent-1'],
      runtimes: {
        'agent-1': {
          hostname: 'mac-mini',
          adapter: 'codex',
          current_model: 'gpt-5.4',
        },
        'agent-2': {
          hostname: 'mac-mini',
          adapter: 'claude-code',
          current_model: 'deepseek-v4-pro',
        },
      },
    })
  })

  await page.route('**/api/wtt/topics/subscribed**', async (route) => {
    await fulfillJson(route, options.topics || mockTopics)
  })

  await page.route('**/api/wtt/topics/*/members', async (route) => {
    await fulfillJson(route, options.topicMembers || [
      { agent_id: 'agent-1', display_name: 'Alice Agent', role: 'owner' },
      { agent_id: 'agent-2', display_name: 'Build Agent', role: 'member' },
    ])
  })

  await page.route('**/api/wtt/topics/*/messages**', async (route) => {
    if (route.request().method() === 'POST') {
      options.onTopicMessagePost?.(route.request().url(), route.request().postDataJSON())
      await fulfillJson(route, {
        message_id: 'message-new',
        topic_id: 'topic-task',
        sender_id: 'mobile@example.com',
        sender_type: 'human',
        content: 'sent',
        timestamp: '2026-06-06T01:02:00.000Z',
      })
      return
    }
    await fulfillJson(route, options.messages || [
      {
        message_id: 'message-1',
        topic_id: 'topic-task',
        sender_id: 'mobile@example.com',
        sender_display_name: 'Mobile Tester',
        sender_type: 'human',
        content: 'Hello from mobile',
        timestamp: '2026-06-06T01:00:00.000Z',
      },
      {
        message_id: 'message-2',
        topic_id: 'topic-task',
        sender_id: 'agent-1',
        sender_display_name: 'Alice Agent',
        sender_type: 'agent',
        content: 'I can see the mobile chat. [file:notes.md](https://example.com/media/notes.md)',
        timestamp: '2026-06-06T01:01:00.000Z',
      },
    ])
  })

  await page.route('**/api/wtt/media/sign', async (route) => {
    options.onMediaSign?.(route.request().headers(), route.request().postDataJSON())
    await fulfillJson(route, {
      upload_token: 'upload-token-notes',
      upload_url: '/media/upload/upload-token-notes',
    })
  })

  await page.route('**/api/wtt/media/upload/*', async (route) => {
    await route.fulfill({ status: 204, body: '' })
  })

  await page.route('**/api/wtt/media/commit', async (route) => {
    options.onMediaCommit?.(route.request().headers(), route.request().postDataJSON())
    await fulfillJson(route, {
      url: options.mediaCommitUrl || 'https://example.com/media/notes.md',
    })
  })

  await page.route('**/api/wtt/media/**', async (route) => {
    const url = route.request().url()
    if (/\/media\/(?:sign|commit|upload)\b/.test(url)) {
      await route.fallback()
      return
    }
    if (route.request().method() === 'PUT') {
      await route.fulfill({ status: 204, body: '' })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
        'base64',
      ),
    })
  })

  await page.route('**/api/wtt/billing/me', async (route) => {
    await fulfillJson(route, {
      entitlement: {
        plan: 'pro',
        status: 'active',
        ends_at: '2026-07-06T00:00:00.000Z',
        limits: { monthly_limit: 500, window_limit: 30 },
      },
      cloud_agent_usage: { monthly_count: 12, window_count: 2 },
    })
  })

  await page.route('**/api/wtt/tasks', async (route) => {
    await fulfillJson(route, {
      id: 'task-new',
      topic_id: 'topic-new',
      title: 'New Task',
      topic: { topic_id: 'topic-new', name: 'New Task' },
    })
  })

  await page.route('**/api/wtt/agents/claim-existing', async (route) => {
    await fulfillJson(route, { agent_id: 'agent-claimed' })
  })

  await page.route('**/api/wtt/agents/provision', async (route) => {
    await fulfillJson(route, {
      agent_id: 'agent-provisioned',
      agent_token: 'token-provisioned',
    })
  })
}

test('mobile login renders compact auth UI', async ({ page }) => {
  await page.goto('/mobile/login?callbackUrl=/mobile/feed')
  await expect(page.getByRole('heading', { name: 'WTT' })).toBeVisible()
  await expect(page.getByText('Link Agents World.')).toBeVisible()
  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '注册', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '手机密码' })).toBeVisible()
  await expect(page.getByRole('button', { name: '验证码', exact: true })).toBeVisible()
  await expect(page.getByPlaceholder('密码')).toBeVisible()
  await expect(page.getByRole('button', { name: '进入 WTT' })).toBeVisible()
  await page.getByRole('button', { name: '验证码', exact: true }).click()
  await expect(page.getByRole('button', { name: '发验证码' })).toBeVisible()
  await page.getByRole('button', { name: '注册', exact: true }).click()
  await expect(page.getByPlaceholder('昵称')).toBeVisible()
  await expect(page.getByPlaceholder('密码，至少 8 位')).toBeVisible()
  await expect(page.getByRole('button', { name: '注册并进入 WTT' })).toBeVisible()
})

test('mobile feed supports topic browsing, settings, agent binding, and offline retry state', async ({ page, context }) => {
  await mockAuthenticatedMobileApi(page)
  await page.goto('/mobile/feed?source=android&topic_id=topic-task&agent_id=agent-1')

  await expect(page.getByText('Sprint Planning')).toBeVisible()
  await expect(page.getByText('Alice Agent').first()).toBeVisible()
  await expect(page.getByText('Hello from mobile')).toBeVisible()
  await expect(page.getByText('FILE')).toBeVisible()

  await page.getByRole('button').first().click()
  await expect(page.getByText('选择主机')).toBeVisible()
  await expect(page.getByText('先选择运行 Agent 的主机，再选择该主机下的 Agent，最后进入它的 Topic。')).toBeVisible()
  await page.getByText('mac-mini').click()
  await expect(page.getByText('选择 Agent')).toBeVisible()
  await page.getByText('Alice Agent').last().click()
  await expect(page.getByText('P2P 私聊')).toBeVisible()
  await expect(page.getByText('任务 Topic')).toBeVisible()
  await expect(page.getByText('群聊 / 讨论')).toBeVisible()
  await expect(page.getByText('订阅 / 广播')).toBeVisible()
  await page.getByRole('button', { name: '关闭' }).click()

  await page.getByLabel('设置').click()
  await expect(page.getByText('Account')).toBeVisible()
  await expect(page.getByRole('link', { name: '移动端设置页' })).toHaveAttribute('href', '/mobile/settings?source=android')

  await page.getByRole('button', { name: '关闭' }).click()
  await context.setOffline(true)
  await page.locator('textarea').fill('offline message')
  await page.getByLabel('发送消息').click()
  await expect(page.getByText('当前离线，消息已保留，恢复网络后可重试。')).toBeVisible()
  await context.setOffline(false)
})

test('mobile group topic send uses an owned member agent', async ({ page }) => {
  const postUrls: string[] = []
  await mockAuthenticatedMobileApi(page, {
    topicMembers: [{ agent_id: 'agent-2', display_name: 'Build Agent', role: 'member' }],
    onTopicMessagePost: (url) => postUrls.push(url),
  })
  await page.goto('/mobile/feed?source=android&topic_id=topic-group&agent_id=agent-1')

  await expect(page.getByText('Research Group')).toBeVisible()
  await expect(page.getByText('1 成员')).toBeVisible()
  await page.locator('textarea').fill('hello group')
  await page.getByLabel('发送消息').click()

  await expect.poll(() => postUrls[0] || '').toContain('topics/topic-group/messages')
  expect(new URL(postUrls[0]).searchParams.get('agent_id')).toBe('agent-2')
})

test('mobile composer uploads and sends file attachments', async ({ page }) => {
  const mediaSignRequests: Array<{ headers: Record<string, string>; body: unknown }> = []
  const mediaCommitRequests: Array<{ headers: Record<string, string>; body: unknown }> = []
  const postedMessages: Array<{ url: string; body: unknown }> = []
  await mockAuthenticatedMobileApi(page, {
    onMediaSign: (headers, body) => mediaSignRequests.push({ headers, body }),
    onMediaCommit: (headers, body) => mediaCommitRequests.push({ headers, body }),
    onTopicMessagePost: (url, body) => postedMessages.push({ url, body }),
  })
  await page.goto('/mobile/feed?source=android&topic_id=topic-p2p&agent_id=agent-1')

  await expect(page.getByText('P2P with Alice')).toBeVisible()
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'notes.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# mobile attachment\n'),
  })
  await expect(page.getByText('notes.md')).toBeVisible()
  await expect(page.getByText('FILE').first()).toBeVisible()
  await page.locator('textarea').fill('with attachment')
  await page.getByLabel('发送消息').click()

  await expect.poll(() => mediaSignRequests.length).toBe(1)
  await expect.poll(() => mediaCommitRequests.length).toBe(1)
  await expect.poll(() => postedMessages.length).toBe(1)
  expect(mediaSignRequests[0].headers.authorization).toBe('Bearer test-access-token')
  expect(mediaCommitRequests[0].headers.authorization).toBe('Bearer test-access-token')
  expect(mediaSignRequests[0].body).toMatchObject({
    filename: 'notes.md',
    mime_type: 'text/markdown',
  })
  expect(mediaCommitRequests[0].body).toMatchObject({ upload_token: 'upload-token-notes' })
  expect(new URL(postedMessages[0].url).searchParams.get('agent_id')).toBe('agent-1')
  expect(postedMessages[0].body).toMatchObject({
    content: 'with attachment\n\n[file:notes.md](https://example.com/media/notes.md)',
  })
})

test('mobile chat renders image messages as thumbnails', async ({ page }) => {
  await mockAuthenticatedMobileApi(page, {
    messages: [
      {
        message_id: 'message-image',
        topic_id: 'topic-task',
        sender_id: 'mobile@example.com',
        sender_display_name: 'Mobile Tester',
        sender_type: 'human',
        content: 'uploaded image\n\n![screenshot.jpg](/media/screenshot.jpg)',
        timestamp: '2026-06-06T01:00:00.000Z',
      },
    ],
  })
  await page.goto('/mobile/feed?source=android&topic_id=topic-task&agent_id=agent-1')

  const image = page.locator('img[alt="screenshot.jpg"]')
  await expect(image).toBeVisible()
  await expect(image).toHaveAttribute('src', /\/api\/wtt\/media\/screenshot\.jpg\?variant=thumb/)
  await expect(image).toHaveClass(/h-24/)
})

test('mobile composer uploads image attachments with thumbnail preview', async ({ page }) => {
  const mediaSignRequests: Array<{ headers: Record<string, string>; body: unknown }> = []
  const postedMessages: Array<{ url: string; body: unknown }> = []
  await mockAuthenticatedMobileApi(page, {
    mediaCommitUrl: '/media/photo.jpg',
    onMediaSign: (headers, body) => mediaSignRequests.push({ headers, body }),
    onTopicMessagePost: (url, body) => postedMessages.push({ url, body }),
  })
  await page.goto('/mobile/feed?source=android&topic_id=topic-p2p&agent_id=agent-1')

  await expect(page.getByText('P2P with Alice')).toBeVisible()
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'photo.jpg',
    mimeType: '',
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  })

  await expect(page.getByText('photo.jpg')).toBeVisible()
  await expect(page.locator('footer img[src*="/api/wtt/media/photo.jpg?variant=thumb"]')).toBeVisible()
  await page.locator('textarea').fill('with image')
  await page.getByLabel('发送消息').click()

  await expect.poll(() => mediaSignRequests.length).toBe(1)
  await expect.poll(() => postedMessages.length).toBe(1)
  expect(mediaSignRequests[0].body).toMatchObject({
    filename: 'photo.jpg',
    mime_type: 'image/jpeg',
  })
  expect(postedMessages[0].body).toMatchObject({
    content: 'with image\n\n![photo.jpg](/media/photo.jpg)',
  })
})

test('android mobile settings keeps recovery controls visible', async ({ page }) => {
  await mockAuthenticatedMobileApi(page)
  await page.goto('/mobile/settings?source=android')
  await expect(page.getByText('设置')).toBeVisible()
  await expect(page.getByText('Pro 用户')).toBeVisible()
  await expect(page.getByText('运行诊断')).toBeVisible()
  await expect(page.getByText(/Android WebView/)).toBeVisible()
  await expect(page.getByRole('button', { name: '清缓存并重新登录' })).toBeVisible()
  await expect(page.getByRole('button').first()).toBeVisible()
})
