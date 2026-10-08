import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultMobileTopicId, mobileConversationAgentId } from '../lib/mobile-selection.ts'
import { mobileHistoryProgressTtl } from '../lib/mobile-chat-status.ts'

test('default conversation stays in the selected Agent directory despite a newer account Recent', () => {
  const foreign = { id: 'native-topic', type: 'p2p', primary_agent_id: 'native-agent' }
  const local = { id: 'selected-topic', type: 'p2p' }
  assert.equal(defaultMobileTopicId([foreign, local], [local]), 'selected-topic')
  assert.equal(defaultMobileTopicId([foreign], []), '')
})

test('repairs an existing mismatched P2P selection only to an account-owned Agent', () => {
  const topic = { type: 'p2p', primary_agent_id: 'native-agent' }
  assert.equal(mobileConversationAgentId(topic, 'old-agent', ['old-agent', 'native-agent']), 'native-agent')
  assert.equal(mobileConversationAgentId(topic, 'old-agent', ['old-agent']), 'old-agent')
})

test('P2P membership preserves a valid Agent and can fall back to a known creator', () => {
  assert.equal(mobileConversationAgentId({ type: 'p2p', member_agent_ids: ['a', 'b'] }, 'b', ['a', 'b']), 'b')
  assert.equal(mobileConversationAgentId({ type: 'p2p', creator_agent_id: 'b' }, 'a', ['a', 'b']), 'b')
})

test('group selection is not changed to an arbitrary primary Agent', () => {
  assert.equal(mobileConversationAgentId({ type: 'discussion', primary_agent_id: 'b' }, 'a', ['a', 'b']), 'a')
})

test('a valid subscription to a multi-Agent P2P keeps the selected Agent', () => {
  assert.equal(mobileConversationAgentId({ id: 'shared', type: 'p2p', creator_agent_id: 'a' }, 'b', ['a', 'b'], ['shared']), 'b')
})

test('history does not revive expired completion or progress superseded by a formal reply', () => {
  const now = 100000
  assert.equal(mobileHistoryProgressTtl('complete', now - 10000, undefined, now, 4500), 0)
  assert.equal(mobileHistoryProgressTtl('running', now - 10000, now - 5000, now, 4500), 0)
})

test('fresh unanswered progress retains its actual timestamp and bounded expiry', () => {
  const now = 100000
  assert.equal(mobileHistoryProgressTtl('running', now - 10000, undefined, now, 4500), 60000)
  assert.equal(mobileHistoryProgressTtl('complete', now - 1000, undefined, now, 4500), 4500)
  assert.equal(mobileHistoryProgressTtl('running', NaN, undefined, now, 4500), 0)
  assert.equal(mobileHistoryProgressTtl('running', now - 60001, undefined, now, 4500), 0)
})
