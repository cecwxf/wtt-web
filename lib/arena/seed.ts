import { aiInterviewChallenges } from './ai-interviews'
import { aiKernelChallenges, aiKernelTestCases } from './ai-kernels'
import { educationChallenges } from './education-banks'
import { gaokaoVolunteerChallenges } from './gaokao-volunteer'
import { generalInterviewChallenges } from './interview-banks'
import type { Challenge, ChallengeTestCase } from './types'

const now = new Date().toISOString()

const coreChallenges: Challenge[] = [
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
    function_name: 'two_sum',
    input_keys: ['nums', 'target'],
    published: true,
    created_at: now,
    updated_at: now,
  },
  {
    id: 'valid-palindrome',
    title: 'Valid Palindrome',
    slug: 'valid-palindrome',
    description: `给定一个字符串 s，判断它在只保留字母和数字、忽略大小写后，是否为回文串。

请实现函数：

\`\`\`python
def is_palindrome(s: str) -> bool:
    ...
\`\`\`

示例："A man, a plan, a canal: Panama" 应返回 true。`,
    difficulty: 'easy',
    category: 'coding-interview',
    tags: ['string', 'two-pointers', 'interview'],
    challenge_type: 'coding',
    time_limit_ms: 2000,
    memory_limit_mb: 128,
    starter_code: `def is_palindrome(s: str) -> bool:
    # TODO: ignore non-alphanumeric chars and case
    return False
`,
    function_name: 'is_palindrome',
    input_keys: ['s'],
    published: true,
    created_at: now,
    updated_at: now,
  },
  {
    id: 'maximum-subarray',
    title: 'Maximum Subarray',
    slug: 'maximum-subarray',
    description: `给定一个整数数组 nums，请找出一个具有最大和的连续子数组，并返回其最大和。

请实现函数：

\`\`\`python
def max_subarray(nums: list[int]) -> int:
    ...
\`\`\`

要求优先思考 O(n) 的动态规划 / Kadane 算法。`,
    difficulty: 'medium',
    category: 'coding-interview',
    tags: ['array', 'dynamic-programming', 'interview'],
    challenge_type: 'coding',
    time_limit_ms: 2000,
    memory_limit_mb: 128,
    starter_code: `def max_subarray(nums: list[int]) -> int:
    # TODO: return the maximum contiguous subarray sum
    return 0
`,
    function_name: 'max_subarray',
    input_keys: ['nums'],
    published: true,
    created_at: now,
    updated_at: now,
  },
]

const coreTestCases: ChallengeTestCase[] = [
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
  {
    id: 'pal-public-1',
    challenge_id: 'valid-palindrome',
    input: JSON.stringify({ s: 'A man, a plan, a canal: Panama' }),
    expected_output: JSON.stringify(true),
    is_hidden: false,
    weight: 1,
    explanation: 'amanaplanacanalpanama is a palindrome',
    checker: 'json_exact',
  },
  {
    id: 'pal-public-2',
    challenge_id: 'valid-palindrome',
    input: JSON.stringify({ s: 'race a car' }),
    expected_output: JSON.stringify(false),
    is_hidden: false,
    weight: 1,
    checker: 'json_exact',
  },
  {
    id: 'pal-hidden-1',
    challenge_id: 'valid-palindrome',
    input: JSON.stringify({ s: ' ' }),
    expected_output: JSON.stringify(true),
    is_hidden: true,
    weight: 1,
    checker: 'json_exact',
  },
  {
    id: 'pal-hidden-2',
    challenge_id: 'valid-palindrome',
    input: JSON.stringify({ s: '0P' }),
    expected_output: JSON.stringify(false),
    is_hidden: true,
    weight: 1,
    checker: 'json_exact',
  },
  {
    id: 'max-subarray-public-1',
    challenge_id: 'maximum-subarray',
    input: JSON.stringify({ nums: [-2, 1, -3, 4, -1, 2, 1, -5, 4] }),
    expected_output: JSON.stringify(6),
    is_hidden: false,
    weight: 1,
    explanation: '[4, -1, 2, 1] has the largest sum 6',
    checker: 'json_exact',
  },
  {
    id: 'max-subarray-public-2',
    challenge_id: 'maximum-subarray',
    input: JSON.stringify({ nums: [1] }),
    expected_output: JSON.stringify(1),
    is_hidden: false,
    weight: 1,
    checker: 'json_exact',
  },
  {
    id: 'max-subarray-hidden-1',
    challenge_id: 'maximum-subarray',
    input: JSON.stringify({ nums: [5, 4, -1, 7, 8] }),
    expected_output: JSON.stringify(23),
    is_hidden: true,
    weight: 1,
    checker: 'json_exact',
  },
  {
    id: 'max-subarray-hidden-2',
    challenge_id: 'maximum-subarray',
    input: JSON.stringify({ nums: [-3, -2, -5] }),
    expected_output: JSON.stringify(-2),
    is_hidden: true,
    weight: 1,
    checker: 'json_exact',
  },
]

export const seedChallenges: Challenge[] = [...aiKernelChallenges, ...aiInterviewChallenges, ...generalInterviewChallenges, ...educationChallenges, ...gaokaoVolunteerChallenges, ...coreChallenges]
export const seedTestCases: ChallengeTestCase[] = [...coreTestCases, ...aiKernelTestCases]
