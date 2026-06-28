import { expect, test } from '@playwright/test'
import {
  shouldCloseWaitingStatusFromAgentReply,
  shouldPollMobileMessages,
} from '../lib/mobile-chat-status'

test('polls mobile messages while an agent run is non-terminal', () => {
  const now = Date.parse('2026-06-29T06:30:00.000Z')

  expect(shouldPollMobileMessages({
    statusKind: 'queued',
    startedAt: now - 1000,
    expiresAt: now + 60_000,
  }, now)).toBe(true)

  expect(shouldPollMobileMessages({
    statusKind: 'response',
    startedAt: now - 1000,
    expiresAt: now + 60_000,
  }, now)).toBe(false)

  expect(shouldPollMobileMessages({
    statusKind: 'running',
    startedAt: now - 120_000,
    expiresAt: now - 1000,
  }, now)).toBe(false)
})

test('closes the waiting state when a fresh agent reply arrives', () => {
  const now = Date.parse('2026-06-29T06:30:00.000Z')
  const waiting = {
    statusKind: 'accepted',
    startedAt: now - 30_000,
    expiresAt: now + 90_000,
  }

  expect(shouldCloseWaitingStatusFromAgentReply(waiting, {
    id: 'message-agent-1',
    ts: now - 1000,
  }, now)).toBe(true)

  expect(shouldCloseWaitingStatusFromAgentReply({ ...waiting, statusKind: 'response' }, {
    id: 'message-agent-2',
    ts: now,
  }, now)).toBe(false)

  expect(shouldCloseWaitingStatusFromAgentReply(waiting, {
    id: 'old-agent-message',
    ts: now - 20 * 60 * 1000,
  }, now)).toBe(false)
})
