export type ChallengeDifficulty = 'easy' | 'medium' | 'hard'
export type ChallengeType = 'coding' | 'qa' | 'project'
export type SubmissionStatus =
  | 'pending'
  | 'judging'
  | 'accepted'
  | 'wrong_answer'
  | 'time_limit_exceeded'
  | 'memory_limit_exceeded'
  | 'runtime_error'
  | 'compile_error'
  | 'system_error'

export interface Challenge {
  id: string
  title: string
  slug: string
  description: string
  difficulty: ChallengeDifficulty
  category: string
  tags: string[]
  challenge_type: ChallengeType
  time_limit_ms: number
  memory_limit_mb: number
  starter_code: string
  published: boolean
  created_at: string
  updated_at: string
}

export interface ChallengeTestCase {
  id: string
  challenge_id: string
  input: string
  expected_output: string
  is_hidden: boolean
  weight: number
  explanation?: string
  checker: 'json_exact' | 'json_unordered_array'
}

export interface SubmissionResult {
  id: string
  submission_id: string
  test_case_id: string
  status: SubmissionStatus
  runtime_ms?: number
  memory_kb?: number
  stdout?: string
  stderr?: string
  compile_output?: string
  error_message?: string
  is_hidden: boolean
}

export interface Submission {
  id: string
  challenge_id: string
  user_id: string
  language: string
  code: string
  status: SubmissionStatus
  score: number
  runtime_ms?: number
  memory_kb?: number
  judge_provider: string
  judge_output_summary?: string
  agent_help_used: boolean
  hint_count: number
  created_at: string
  updated_at: string
  results: SubmissionResult[]
}

export interface LeaderboardEntry {
  challenge_id: string
  user_id: string
  best_submission_id: string
  accepted_at: string
  best_runtime_ms?: number
  best_memory_kb?: number
  submission_count: number
  hint_count: number
  agent_help_used: boolean
  rank_score: number
}
