export type ChallengeDifficulty = 'easy' | 'medium' | 'hard'
export type ChallengeType = 'coding' | 'qa' | 'project'
export type ArenaTeachingSkill =
  | 'explain_answer'
  | 'step_derivation'
  | 'socratic_questioning'
  | 'debug_answer'
  | 'concept_remediation'
  | 'transfer_problem'
  | 'whiteboard_architecture'
export type ArenaTeachingIntent =
  | 'socratic'
  | 'interview_answer'
  | 'ask'
  | 'ask_hint'
  | 'explain'
  | 'debug'
  | 'follow_up'
  | 'whiteboard'
  | 'recommend_next'
  | 'concept'
export type ArenaTeachingStage =
  | 'diagnose'
  | 'hint'
  | 'attempt'
  | 'debug'
  | 'explain'
  | 'follow_up'
  | 'recommend'
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
  description_format?: 'plain' | 'html'
  source_url?: string
  source_name?: string
  source_license?: string
  difficulty: ChallengeDifficulty
  category: string
  tags: string[]
  challenge_type: ChallengeType
  time_limit_ms: number
  memory_limit_mb: number
  starter_code: string
  function_name: string
  input_keys: string[]
  teaching_skills?: ArenaTeachingSkill[]
  concepts?: string[]
  rubric?: string[]
  follow_up_questions?: string[]
  whiteboard_template?: 'system_architecture' | 'pipeline' | 'training_serving_consistency' | 'inference_flow' | 'evaluation_loop' | 'solution_flow'
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
  checker: 'json_exact' | 'json_unordered_array' | 'opencl_stdout_smoke'
}

export interface SubmissionResult {
  id: string
  submission_id: string
  test_case_id: string
  status: SubmissionStatus
  runtime_ms?: number
  memory_kb?: number
  input?: string
  expected_output?: string
  stdout?: string
  raw_stdout?: string
  kernel_time_ms?: number
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

export interface ArenaSessionState {
  id: string
  user_id: string
  challenge_id: string
  topic_id?: string
  stage: ArenaTeachingStage
  hint_level: number
  last_action?: ArenaTeachingIntent | string
  mastery_estimate: number
  solved: boolean
  weak_concepts: string[]
  next_recommendations: string[]
  created_at: string
  updated_at: string
}

export interface ArenaUserProfile {
  user_id: string
  concept_mastery: Record<string, number>
  weak_concepts: string[]
  preferred_style: 'socratic' | 'direct' | 'interview' | string
  recommended_next_challenges: string[]
  updated_at?: string | null
}

export interface ArenaLearningItem {
  id: string
  user_id: string
  challenge_id?: string | null
  item_type: string
  title?: string | null
  content: string
  answer?: string | null
  subject?: string | null
  stage?: string | null
  knowledge_points: string[]
  error_reasons: string[]
  skill_id?: string | null
  source_metadata: Record<string, unknown>
  mastery_estimate: number
  created_at: string
  updated_at: string
}

export interface ArenaReviewSchedule {
  id: string
  learning_item_id: string
  item_title?: string | null
  item_type: string
  skill_id?: string | null
  scheduler: string
  state: Record<string, unknown>
  due_at?: string | null
  last_reviewed_at?: string | null
}
