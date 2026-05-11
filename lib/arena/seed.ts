import type { Challenge, ChallengeTestCase } from './types'

const now = new Date().toISOString()

export const seedChallenges: Challenge[] = [
  {
    id: 'two-sum',
    title: 'Two Sum',
    slug: 'two-sum',
    description: `给定一个整数数组 nums 和一个整数 target，请返回两个数的下标，使它们相加等于 target。

你可以假设每组输入只对应一个答案，同一个元素不能使用两次。

请实现函数：

\`\`\`python
def two_sum(nums: list[int], target: int) -> list[int]:
    ...
\`\`\`

返回下标顺序不限。`,
    difficulty: 'easy',
    category: 'coding-interview',
    tags: ['array', 'hash-table', 'interview'],
    challenge_type: 'coding',
    time_limit_ms: 2000,
    memory_limit_mb: 128,
    starter_code: `def two_sum(nums: list[int], target: int) -> list[int]:
    # TODO: return the indices of the two numbers
    return []
`,
    published: true,
    created_at: now,
    updated_at: now,
  },
]

export const seedTestCases: ChallengeTestCase[] = [
  {
    id: 'two-sum-public-1',
    challenge_id: 'two-sum',
    input: JSON.stringify({ nums: [2, 7, 11, 15], target: 9 }),
    expected_output: JSON.stringify([0, 1]),
    is_hidden: false,
    weight: 1,
    explanation: 'nums[0] + nums[1] = 9',
    checker: 'json_unordered_array',
  },
  {
    id: 'two-sum-public-2',
    challenge_id: 'two-sum',
    input: JSON.stringify({ nums: [3, 2, 4], target: 6 }),
    expected_output: JSON.stringify([1, 2]),
    is_hidden: false,
    weight: 1,
    explanation: 'nums[1] + nums[2] = 6',
    checker: 'json_unordered_array',
  },
  {
    id: 'two-sum-hidden-1',
    challenge_id: 'two-sum',
    input: JSON.stringify({ nums: [3, 3], target: 6 }),
    expected_output: JSON.stringify([0, 1]),
    is_hidden: true,
    weight: 1,
    checker: 'json_unordered_array',
  },
  {
    id: 'two-sum-hidden-2',
    challenge_id: 'two-sum',
    input: JSON.stringify({ nums: [-1, -2, -3, -4, -5], target: -8 }),
    expected_output: JSON.stringify([2, 4]),
    is_hidden: true,
    weight: 1,
    checker: 'json_unordered_array',
  },
  {
    id: 'two-sum-hidden-3',
    challenge_id: 'two-sum',
    input: JSON.stringify({ nums: [0, 4, 3, 0], target: 0 }),
    expected_output: JSON.stringify([0, 3]),
    is_hidden: true,
    weight: 1,
    checker: 'json_unordered_array',
  },
]
