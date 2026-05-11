import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import type { Challenge, ChallengeTestCase, SubmissionResult, SubmissionStatus } from './types'

interface JudgeInput {
  challenge: Challenge
  testCases: ChallengeTestCase[]
  code: string
  language: string
  submissionId: string
}

interface RawRunResult {
  status: SubmissionStatus
  stdout: string
  stderr: string
  compile_output?: string
  runtime_ms?: number
  memory_kb?: number
  error_message?: string
}

const PYTHON_LANGUAGES = new Set(['python', 'python3', 'py'])

function buildPythonHarness(userCode: string) {
  return `${userCode}

# --- WTT Arena Judge Harness ---
if __name__ == "__main__":
    import json, sys
    payload = json.loads(sys.stdin.read() or "{}")
    if "two_sum" not in globals():
        raise NameError("Please define function two_sum(nums, target)")
    result = two_sum(payload.get("nums", []), payload.get("target"))
    print(json.dumps(result, ensure_ascii=False))
`
}

function normalizeJson(value: string): unknown {
  return JSON.parse(value.trim())
}

function compareOutput(actual: string, expected: string, checker: ChallengeTestCase['checker']) {
  try {
    const a = normalizeJson(actual)
    const e = normalizeJson(expected)
    if (checker === 'json_unordered_array' && Array.isArray(a) && Array.isArray(e)) {
      return JSON.stringify([...a].sort()) === JSON.stringify([...e].sort())
    }
    return JSON.stringify(a) === JSON.stringify(e)
  } catch {
    return actual.trim() === expected.trim()
  }
}

async function runLocalPython(code: string, stdin: string, timeoutMs: number): Promise<RawRunResult> {
  const dir = await mkdtemp(join(tmpdir(), 'wtt-arena-'))
  const file = join(dir, 'main.py')
  const started = Date.now()
  try {
    await writeFile(file, code, 'utf8')
    return await new Promise<RawRunResult>((resolve) => {
      const child = spawn('python3', [file], { stdio: ['pipe', 'pipe', 'pipe'] })
      let settled = false
      const finish = (result: RawRunResult) => {
        if (settled) return
        settled = true
        resolve(result)
      }
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        finish({ status: 'time_limit_exceeded', stdout: '', stderr: '', runtime_ms: Date.now() - started })
      }, timeoutMs)
      const stdout: Buffer[] = []
      const stderr: Buffer[] = []
      child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)))
      child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)))
      child.on('error', (error) => {
        clearTimeout(timer)
        finish({ status: 'system_error', stdout: '', stderr: '', error_message: error.message, runtime_ms: Date.now() - started })
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        const err = Buffer.concat(stderr).toString('utf8')
        finish({
          status: code === 0 ? 'accepted' : 'runtime_error',
          stdout: Buffer.concat(stdout).toString('utf8'),
          stderr: err,
          error_message: code === 0 ? undefined : err.split('\n').slice(-3).join('\n'),
          runtime_ms: Date.now() - started,
        })
      })
      child.stdin.end(stdin)
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function runJudge0(code: string, stdin: string, timeoutMs: number): Promise<RawRunResult> {
  const base = process.env.JUDGE0_URL?.replace(/\/+$/, '')
  if (!base) return { status: 'system_error', stdout: '', stderr: '', error_message: 'JUDGE0_URL is not configured' }
  const languageId = Number(process.env.JUDGE0_PYTHON_LANGUAGE_ID || '71')
  const response = await fetch(`${base}/submissions?base64_encoded=false&wait=true`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.JUDGE0_API_KEY ? { 'X-Auth-Token': process.env.JUDGE0_API_KEY } : {}),
    },
    body: JSON.stringify({
      language_id: languageId,
      source_code: code,
      stdin,
      cpu_time_limit: Math.max(1, Math.ceil(timeoutMs / 1000)),
      wall_time_limit: Math.max(2, Math.ceil(timeoutMs / 1000) + 1),
    }),
    cache: 'no-store',
  })
  if (!response.ok) {
    return { status: 'system_error', stdout: '', stderr: '', error_message: await response.text() }
  }
  const data = await response.json()
  const statusId = Number(data?.status?.id || 0)
  const status: SubmissionStatus =
    statusId === 3 ? 'accepted'
      : statusId === 4 ? 'wrong_answer'
        : statusId === 5 ? 'time_limit_exceeded'
          : statusId === 6 ? 'compile_error'
            : statusId >= 7 && statusId <= 12 ? 'runtime_error'
              : 'system_error'
  return {
    status,
    stdout: String(data?.stdout || ''),
    stderr: String(data?.stderr || ''),
    compile_output: data?.compile_output ? String(data.compile_output) : undefined,
    runtime_ms: data?.time ? Math.round(Number(data.time) * 1000) : undefined,
    memory_kb: data?.memory ? Number(data.memory) : undefined,
    error_message: data?.message ? String(data.message) : undefined,
  }
}

export async function judgeSubmission({ challenge, testCases, code, language, submissionId }: JudgeInput) {
  if (!PYTHON_LANGUAGES.has(language.toLowerCase())) {
    throw new Error(`Unsupported language for MVP: ${language}`)
  }
  const provider = process.env.JUDGE0_URL ? 'judge0' : (process.env.WTT_ARENA_ENABLE_LOCAL_PYTHON_JUDGE === '1' ? 'local-python' : 'not-configured')
  const harness = buildPythonHarness(code)
  const results: SubmissionResult[] = []
  let passedWeight = 0
  const totalWeight = testCases.reduce((sum, testCase) => sum + testCase.weight, 0)
  let aggregateRuntime = 0
  let maxMemory = 0

  for (const testCase of testCases) {
    const started = Date.now()
    const raw = provider === 'judge0'
      ? await runJudge0(harness, testCase.input, challenge.time_limit_ms)
      : provider === 'local-python'
        ? await runLocalPython(harness, testCase.input, challenge.time_limit_ms)
        : { status: 'system_error' as const, stdout: '', stderr: '', error_message: 'Configure JUDGE0_URL or set WTT_ARENA_ENABLE_LOCAL_PYTHON_JUDGE=1 for local development.' }
    let status = raw.status
    if (raw.status === 'accepted' && !compareOutput(raw.stdout, testCase.expected_output, testCase.checker)) {
      status = 'wrong_answer'
    }
    const runtime = raw.runtime_ms || (Date.now() - started)
    aggregateRuntime += runtime
    maxMemory = Math.max(maxMemory, raw.memory_kb || 0)
    if (status === 'accepted') passedWeight += testCase.weight

    results.push({
      id: `${submissionId}-${testCase.id}`,
      submission_id: submissionId,
      test_case_id: testCase.id,
      status,
      runtime_ms: runtime,
      memory_kb: raw.memory_kb,
      stdout: testCase.is_hidden ? undefined : raw.stdout,
      stderr: testCase.is_hidden ? undefined : raw.stderr,
      compile_output: testCase.is_hidden ? undefined : raw.compile_output,
      error_message: testCase.is_hidden ? (status === 'accepted' ? undefined : 'Hidden test failed') : raw.error_message,
      is_hidden: testCase.is_hidden,
    })

    if (status !== 'accepted') break
  }

  const finalStatus = results.every((result) => result.status === 'accepted') ? 'accepted' : (results.find((result) => result.status !== 'accepted')?.status || 'system_error')
  return {
    provider,
    status: finalStatus,
    score: totalWeight > 0 ? Math.round((passedWeight / totalWeight) * 100) : 0,
    runtime_ms: aggregateRuntime,
    memory_kb: maxMemory || undefined,
    results,
  }
}
