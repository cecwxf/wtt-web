import { expect, test } from '@playwright/test'
import { mergeMessageHistory } from '../lib/chat-history'

const message = (id: string, timestamp: string, content = id) => ({
  message_id: id,
  timestamp,
  content,
})

test('an empty refresh preserves already loaded history', () => {
  const previous = [message('old', '2026-01-01T00:00:00.000Z')]
  expect(mergeMessageHistory(previous, [])).toEqual(previous)
})

test('a latest-page refresh preserves older pages and updates matching rows', () => {
  const previous = [
    message('old', '2026-01-01T00:00:00.000Z'),
    message('latest', '2026-01-02T00:00:00.000Z', 'before'),
  ]
  const latestPage = [
    message('latest', '2026-01-02T00:00:00.000Z', 'after'),
    message('new', '2026-01-03T00:00:00.000Z'),
  ]

  expect(mergeMessageHistory(previous, latestPage)).toEqual([
    previous[0],
    latestPage[0],
    latestPage[1],
  ])
})
