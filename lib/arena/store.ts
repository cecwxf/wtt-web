import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { seedChallenges, seedTestCases } from './seed'
import type { Challenge, ChallengeTestCase, LeaderboardEntry, Submission } from './types'

declare global {
  // eslint-disable-next-line no-var
  var __wttArenaStore: ArenaStore | undefined
}

interface ArenaStore {
  challenges: Challenge[]
  testCases: ChallengeTestCase[]
  submissions: Submission[]
  leaderboard: LeaderboardEntry[]
}

function defaultStore(): ArenaStore {
  return {
    challenges: [...seedChallenges],
    testCases: [...seedTestCases],
    submissions: [],
    leaderboard: [],
  }
}

function storePath() {
  const raw = process.env.WTT_ARENA_STORE_PATH?.trim()
  return raw ? resolve(raw) : ''
}

function mergeSeedContent(store: ArenaStore): ArenaStore {
  const challengeIds = new Set(store.challenges.map((item) => item.id))
  const testCaseIds = new Set(store.testCases.map((item) => item.id))
  return {
    ...store,
    challenges: [...store.challenges, ...seedChallenges.filter((item) => !challengeIds.has(item.id))],
    testCases: [...store.testCases, ...seedTestCases.filter((item) => !testCaseIds.has(item.id))],
  }
}

function readStoreFromDisk(path: string): ArenaStore | null {
  if (!path || !existsSync(path)) return null
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<ArenaStore>
    return mergeSeedContent({
      challenges: Array.isArray(parsed.challenges) ? parsed.challenges : [...seedChallenges],
      testCases: Array.isArray(parsed.testCases) ? parsed.testCases : [...seedTestCases],
      submissions: Array.isArray(parsed.submissions) ? parsed.submissions : [],
      leaderboard: Array.isArray(parsed.leaderboard) ? parsed.leaderboard : [],
    })
  } catch {
    return null
  }
}

function flushStoreToDisk(store: ArenaStore) {
  const path = storePath()
  if (!path) return
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(store, null, 2)}\n`, 'utf8')
}

function getStore(): ArenaStore {
  if (!globalThis.__wttArenaStore) {
    globalThis.__wttArenaStore = readStoreFromDisk(storePath()) || defaultStore()
  }
  return globalThis.__wttArenaStore
}

export function listChallenges() {
  return getStore().challenges.filter((challenge) => challenge.published)
}

export function getChallenge(idOrSlug: string) {
  return getStore().challenges.find((challenge) => challenge.id === idOrSlug || challenge.slug === idOrSlug) || null
}

export function getChallengeTestCases(challengeId: string) {
  return getStore().testCases.filter((testCase) => testCase.challenge_id === challengeId)
}

export function saveSubmission(submission: Submission) {
  const store = getStore()
  const idx = store.submissions.findIndex((item) => item.id === submission.id)
  if (idx >= 0) store.submissions[idx] = submission
  else store.submissions.unshift(submission)
  if (submission.status === 'accepted') updateLeaderboard(submission)
  flushStoreToDisk(store)
  return submission
}

export function getSubmission(id: string) {
  return getStore().submissions.find((submission) => submission.id === id) || null
}

export function listSubmissions(challengeId?: string) {
  const rows = getStore().submissions
  return challengeId ? rows.filter((submission) => submission.challenge_id === challengeId) : rows
}

function updateLeaderboard(submission: Submission) {
  const store = getStore()
  const previous = store.leaderboard.find(
    (entry) => entry.challenge_id === submission.challenge_id && entry.user_id === submission.user_id,
  )
  const submissionCount = store.submissions.filter(
    (item) => item.challenge_id === submission.challenge_id && item.user_id === submission.user_id,
  ).length
  const rankScore = Date.parse(submission.created_at)
  const next: LeaderboardEntry = {
    challenge_id: submission.challenge_id,
    user_id: submission.user_id,
    best_submission_id: submission.id,
    accepted_at: submission.created_at,
    best_runtime_ms: submission.runtime_ms,
    best_memory_kb: submission.memory_kb,
    submission_count: submissionCount,
    hint_count: submission.hint_count,
    agent_help_used: submission.agent_help_used,
    rank_score: rankScore,
  }

  if (!previous) {
    store.leaderboard.push(next)
    return
  }

  const previousBetter =
    previous.rank_score < next.rank_score ||
    (previous.rank_score === next.rank_score && (previous.submission_count || 0) <= submissionCount)
  if (!previousBetter) Object.assign(previous, next)
}

export function getLeaderboard(challengeId: string) {
  return getStore()
    .leaderboard
    .filter((entry) => entry.challenge_id === challengeId)
    .sort((a, b) => {
      if (a.rank_score !== b.rank_score) return a.rank_score - b.rank_score
      if (a.submission_count !== b.submission_count) return a.submission_count - b.submission_count
      if ((a.best_runtime_ms || 0) !== (b.best_runtime_ms || 0)) return (a.best_runtime_ms || 0) - (b.best_runtime_ms || 0)
      return (a.best_memory_kb || 0) - (b.best_memory_kb || 0)
    })
}
