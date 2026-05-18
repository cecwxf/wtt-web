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

interface JudgeOutput {
  provider: string
  status: SubmissionStatus
  score: number
  runtime_ms: number
  memory_kb?: number
  results: SubmissionResult[]
}

const PYTHON_LANGUAGES = new Set(['python', 'python3', 'py'])
const OPENCL_LANGUAGES = new Set(['opencl', 'opencl-c', 'cl'])
export const OPENCL_MAC_SKILL = 'agent-mac-opencl-kernel'
export function isOpenCLJudgeProvider(provider: string) {
  return provider === OPENCL_MAC_SKILL || provider.startsWith('remote-opencl-')
}

function buildPythonHarness(userCode: string, challenge: Challenge) {
  const functionName = JSON.stringify(challenge.function_name)
  const inputKeys = JSON.stringify(challenge.input_keys)
  return `${userCode}

# --- WTT Arena Judge Harness ---
if __name__ == "__main__":
    import json, sys
    payload = json.loads(sys.stdin.read() or "{}")
    function_name = ${functionName}
    input_keys = ${inputKeys}
    if function_name not in globals():
        raise NameError(f"Please define function {function_name}")
    fn = globals()[function_name]
    args = [payload.get(key) for key in input_keys]
    result = fn(*args)
    print(json.dumps(result, ensure_ascii=False))
`
}

function normalizeJson(value: string): unknown {
  return JSON.parse(value.trim())
}

function compareOutput(actual: string, expected: string, checker: ChallengeTestCase['checker']) {
  const normalizedActual = normalizeProgramStdout(actual)
  if (checker === 'opencl_stdout_smoke') {
    if (!normalizedActual.trim()) return false
    try {
      normalizeJson(normalizedActual)
      return true
    } catch {
      return false
    }
  }
  try {
    const a = normalizeJson(normalizedActual)
    const e = normalizeJson(expected)
    if (checker === 'json_unordered_array' && Array.isArray(a) && Array.isArray(e)) {
      return JSON.stringify([...a].sort()) === JSON.stringify([...e].sort())
    }
    return JSON.stringify(a) === JSON.stringify(e)
  } catch {
    return normalizedActual.trim() === expected.trim()
  }
}

function normalizeProgramStdout(stdout: string) {
  const trimmed = stdout.trim()
  const pattern = /(?:^|\n)\s*output\s*=\s*([^\n]+)\s*/g
  let output: string | null = null
  let match: RegExpExecArray | null = pattern.exec(trimmed)
  while (match) {
    output = match[1].trim()
    match = pattern.exec(trimmed)
  }
  return output || trimmed
}

function extractKernelRuntimeMs(stdout: string) {
  const match = stdout.match(/(?:^|\n)\s*kernel_time_ms\s*=\s*([0-9]+(?:\.[0-9]+)?)/)
  if (!match) return undefined
  const runtime = Number(match[1])
  return Number.isFinite(runtime) ? Number(runtime.toFixed(6)) : undefined
}

function attachPublicCaseData(results: SubmissionResult[], testCases: ChallengeTestCase[]) {
  const casesById = new Map(testCases.map((testCase) => [testCase.id, testCase]))
  return results.map((result) => {
    const testCase = casesById.get(result.test_case_id)
    if (!testCase || testCase.is_hidden) return result
    return {
      ...result,
      input: result.input || testCase.input,
      expected_output: result.expected_output || testCase.expected_output,
    }
  })
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

function cFloatArray(values: unknown) {
  if (!Array.isArray(values)) throw new Error('OpenCL runner expects payload.values to be an array')
  return values.map((value) => {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) throw new Error('OpenCL runner only supports finite numeric payload.values')
    return `${numeric.toString().includes('.') ? numeric : `${numeric}.0`}f`
  }).join(', ')
}

function cFloatMatrix(values: unknown) {
  if (!Array.isArray(values)) throw new Error('OpenCL runner expects payload.matrix to be an array')
  return values.flatMap((row) => {
    if (!Array.isArray(row)) throw new Error('OpenCL runner expects payload.matrix rows to be arrays')
    return row.map((value) => {
      const numeric = Number(value)
      if (!Number.isFinite(numeric)) throw new Error('OpenCL runner only supports finite numeric payload.matrix values')
      return `${numeric.toString().includes('.') ? numeric : `${numeric}.0`}f`
    })
  }).join(', ')
}

function renameOpenCLKernel(code: string, functionName: string, nextName: string) {
  const escaped = functionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const kernelPattern = new RegExp(`(\\b__kernel\\s+void\\s+)${escaped}(\\s*\\()`)
  if (kernelPattern.test(code)) return code.replace(kernelPattern, `$1${nextName}$2`)
  const plainPattern = new RegExp(`(\\bvoid\\s+)${escaped}(\\s*\\()`)
  return code.replace(plainPattern, `$1${nextName}$2`)
}

function extractOpenCLKernelSource(code: string) {
  const macroStart = code.search(/\bKERNEL_SOURCE\s*=\s*OPENCL_KERNEL_SOURCE\s*\(/)
  if (macroStart >= 0) {
    const openIndex = code.indexOf('(', macroStart)
    if (openIndex >= 0) {
      let depth = 1
      for (let i = openIndex + 1; i < code.length; ++i) {
        const char = code[i]
        if (char === '(') depth += 1
        else if (char === ')') {
          depth -= 1
          if (depth === 0) return code.slice(openIndex + 1, i).trim()
        }
      }
    }
  }

  const stringMatch = code.match(/\bKERNEL_SOURCE\s*=\s*("(?:\\.|[^"\\])*")\s*;/)
  if (!stringMatch?.[1]) return null
  try {
    return JSON.parse(stringMatch[1]) as string
  } catch {
    return null
  }
}

function buildRemoteOpenCLVectorAdapter(code: string, challenge: Challenge) {
  const functionName = challenge.function_name
  const kernelName = `__wtt_kernel_${functionName}`
  const rewrittenKernel = renameOpenCLKernel(code, functionName, kernelName)
  return `#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define __kernel
#define __global
#define __constant const
#define __local
#define barrier(flags) ((void)0)
#define CLK_LOCAL_MEM_FENCE 0

static int __wtt_gid0 = 0;
static int __wtt_global_size = 0;
static int get_global_id(int dim) { return dim == 0 ? __wtt_gid0 : 0; }
static int get_local_id(int dim) { (void)dim; return 0; }
static int get_group_id(int dim) { (void)dim; return 0; }
static int get_global_size(int dim) { (void)dim; return __wtt_global_size; }
static float __wtt_fmax(float a, float b) { return a > b ? a : b; }
static float __wtt_fmin(float a, float b) { return a < b ? a : b; }
static float __wtt_fabs(float x) { return x < 0.0f ? -x : x; }
static float __wtt_round(float x) { return x >= 0.0f ? (float)((int)(x + 0.5f)) : (float)((int)(x - 0.5f)); }
static float __wtt_exp(float x) {
  if (x < -20.0f) return 0.0f;
  if (x > 20.0f) x = 20.0f;
  float term = 1.0f;
  float sum = 1.0f;
  for (int i = 1; i <= 24; ++i) {
    term *= x / (float)i;
    sum += term;
  }
  return sum > 0.0f ? sum : 0.0f;
}
#define fmax(a,b) __wtt_fmax((float)(a), (float)(b))
#define fmaxf(a,b) __wtt_fmax((float)(a), (float)(b))
#define fmin(a,b) __wtt_fmin((float)(a), (float)(b))
#define fminf(a,b) __wtt_fmin((float)(a), (float)(b))
#define fabs(a) __wtt_fabs((float)(a))
#define fabsf(a) __wtt_fabs((float)(a))
#define round(a) __wtt_round((float)(a))
#define roundf(a) __wtt_round((float)(a))
#define exp(a) __wtt_exp((float)(a))
#define expf(a) __wtt_exp((float)(a))

${rewrittenKernel}

static int parse_values(const char* json, float* values, int cap) {
  const char* key = strstr(json, "\\"values\\"");
  if (!key) return 0;
  const char* p = strchr(key, '[');
  if (!p) return 0;
  ++p;
  int n = 0;
  while (*p && *p != ']' && n < cap) {
    char* end = NULL;
    float value = strtof(p, &end);
    if (end != p) {
      values[n++] = value;
      p = end;
    } else {
      ++p;
    }
  }
  return n;
}

static int parse_int_value(const char* json, const char* name, int fallback) {
  char pattern[64];
  snprintf(pattern, sizeof(pattern), "\\"%s\\"", name);
  const char* key = strstr(json, pattern);
  if (!key) return fallback;
  const char* p = strchr(key, ':');
  if (!p) return fallback;
  return (int)strtol(p + 1, NULL, 10);
}

static void parse_string_value(const char* json, const char* name, char* out, int cap) {
  if (cap <= 0) return;
  out[0] = '\\0';
  char pattern[64];
  snprintf(pattern, sizeof(pattern), "\\"%s\\"", name);
  const char* key = strstr(json, pattern);
  if (!key) return;
  const char* p = strchr(key, ':');
  if (!p) return;
  p = strchr(p, '"');
  if (!p) return;
  ++p;
  int n = 0;
  while (*p && *p != '"' && n < cap - 1) out[n++] = *p++;
  out[n] = '\\0';
}

static char* append_number(char* out, float value) {
  int integer_value = (int)value;
  float delta = value - (float)integer_value;
  if (delta < 0.0f) delta = -delta;
  if (delta < 0.00001f) {
    out += sprintf(out, "%d", integer_value);
  } else {
    out += sprintf(out, "%.6g", value);
  }
  return out;
}

static int is_array_op(const char* op) {
  return strcmp(op, "vector_add") == 0 || strcmp(op, "invert") == 0 ||
    strcmp(op, "conv1d") == 0 || strcmp(op, "reverse") == 0 ||
    strcmp(op, "relu") == 0 || strcmp(op, "leaky_relu") == 0 ||
    strcmp(op, "sigmoid") == 0 || strcmp(op, "clip") == 0 ||
    strcmp(op, "prefix_sum") == 0 || strcmp(op, "sort") == 0 ||
    strcmp(op, "softmax") == 0 || strcmp(op, "topk") == 0 ||
    strcmp(op, "grayscale") == 0 || strcmp(op, "interleave") == 0;
}

static int is_scalar_op(const char* op) {
  return strcmp(op, "sum") == 0 || strcmp(op, "dot") == 0 ||
    strcmp(op, "silu") == 0 || strcmp(op, "max_subarray") == 0;
}

const char* ${functionName}(const char* payload_json) {
  enum { MAX_N = 4096 };
  static char result[65536];
  float values[MAX_N];
  float output[MAX_N];
  char op[64];
  parse_string_value(payload_json, "op", op, (int)sizeof(op));
  int seed = parse_int_value(payload_json, "seed", 0);
  int input_n = parse_values(payload_json, values, MAX_N);
  int kernel_n = input_n;
  int output_n = input_n;
  int output_kind = is_scalar_op(op) ? 1 : (is_array_op(op) ? 0 : 2);
  if (strcmp(op, "softmax") == 0 && input_n > 4) kernel_n = output_n = 4;
  else if (strcmp(op, "conv1d") == 0 && input_n > 0) output_n = input_n - 1;
  else if (strcmp(op, "topk") == 0) output_n = input_n < 3 ? input_n : 3;
  else if (strcmp(op, "grayscale") == 0) output_n = 1;
  else if (strcmp(op, "interleave") == 0) output_n = 6;
  else if (output_kind != 0) output_n = 1;
  if (input_n <= 0) {
    strcpy(result, "[]");
    return result;
  }
  memset(output, 0, sizeof(output));
  __wtt_global_size = output_n > kernel_n ? output_n : kernel_n;
  for (int gid = 0; gid < __wtt_global_size; ++gid) {
    __wtt_gid0 = gid;
    ${kernelName}(values, output, kernel_n);
  }
  if (output_kind == 1) {
    char* out = result;
    out = append_number(out, output[0]);
    *out = '\\0';
    return result;
  }
  if (output_kind == 2) {
    char* out = result;
    out += sprintf(out, "{\\"checksum\\":");
    out = append_number(out, output[0]);
    out += sprintf(out, ",\\"op\\":\\"%s\\",\\"seed\\":%d}", op, seed);
    return result;
  }
  char* out = result;
  *out++ = '[';
  for (int i = 0; i < output_n; ++i) {
    if (i) *out++ = ',';
    out = append_number(out, output[i]);
  }
  *out++ = ']';
  *out = '\\0';
  return result;
}
`
}

function buildRemoteOpenCLMatrixAdapter(code: string, challenge: Challenge) {
  const functionName = challenge.function_name
  const kernelName = `__wtt_kernel_${functionName}`
  const rewrittenKernel = renameOpenCLKernel(code, functionName, kernelName)
  return `#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define __kernel
#define __global
#define __constant const
#define __local
#define barrier(flags) ((void)0)
#define CLK_LOCAL_MEM_FENCE 0

static int __wtt_gid0 = 0;
static int __wtt_gid1 = 0;
static int __wtt_global_size0 = 0;
static int __wtt_global_size1 = 0;
static int get_global_id(int dim) { return dim == 0 ? __wtt_gid0 : (dim == 1 ? __wtt_gid1 : 0); }
static int get_local_id(int dim) { (void)dim; return 0; }
static int get_group_id(int dim) { (void)dim; return 0; }
static int get_global_size(int dim) { return dim == 0 ? __wtt_global_size0 : (dim == 1 ? __wtt_global_size1 : 1); }

${rewrittenKernel}

static int parse_matrix(const char* json, float* values, int cap) {
  const char* key = strstr(json, "\\"matrix\\"");
  if (!key) return 0;
  const char* p = strchr(key, '[');
  if (!p) return 0;
  int depth = 0;
  int n = 0;
  for (; *p && n < cap; ++p) {
    if (*p == '[') {
      ++depth;
      continue;
    }
    if (*p == ']') {
      --depth;
      if (depth <= 0) break;
      continue;
    }
    if (depth >= 2 || (depth == 1 && ((*p >= '0' && *p <= '9') || *p == '-' || *p == '+'))) {
      char* end = NULL;
      float value = strtof(p, &end);
      if (end != p) {
        values[n++] = value;
        p = end - 1;
      }
    }
  }
  return n;
}

static char* append_number(char* out, float value) {
  int integer_value = (int)value;
  float delta = value - (float)integer_value;
  if (delta < 0.0f) delta = -delta;
  if (delta < 0.00001f) {
    out += sprintf(out, "%d", integer_value);
  } else {
    out += sprintf(out, "%.6g", value);
  }
  return out;
}

const char* ${functionName}(const char* payload_json) {
  enum { MAX_N = 4096 };
  static char result[65536];
  float a[MAX_N];
  float b[4] = { 1.0f, 2.0f, 3.0f, 4.0f };
  float c[MAX_N];
  int a_count = parse_matrix(payload_json, a, MAX_N);
  const int k = 2;
  const int n = 2;
  const int m = a_count > 0 ? a_count / k : 0;
  if (m <= 0) {
    strcpy(result, "[]");
    return result;
  }
  memset(c, 0, sizeof(c));
  __wtt_global_size0 = n;
  __wtt_global_size1 = m;
  for (int row = 0; row < m; ++row) {
    for (int col = 0; col < n; ++col) {
      __wtt_gid0 = col;
      __wtt_gid1 = row;
      ${kernelName}(a, b, c, m, n, k);
    }
  }
  char* out = result;
  *out++ = '[';
  for (int row = 0; row < m; ++row) {
    if (row) *out++ = ',';
    *out++ = '[';
    for (int col = 0; col < n; ++col) {
      if (col) *out++ = ',';
      out = append_number(out, c[row * n + col]);
    }
    *out++ = ']';
  }
  *out++ = ']';
  *out = '\\0';
  return result;
}
`
}

function buildRemoteOpenCLMatrixElementAdapter(code: string, challenge: Challenge) {
  const functionName = challenge.function_name
  const kernelName = `__wtt_kernel_${functionName}`
  const rewrittenKernel = renameOpenCLKernel(code, functionName, kernelName)
  const mode = challenge.tags.includes('matrix-add')
    ? 'matrix_add'
    : challenge.tags.includes('transpose')
      ? 'transpose'
      : 'copy'
  return `#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define __kernel
#define __global
#define __constant const
#define __local
#define barrier(flags) ((void)0)
#define CLK_LOCAL_MEM_FENCE 0

static int __wtt_gid0 = 0;
static int __wtt_gid1 = 0;
static int __wtt_global_size0 = 0;
static int __wtt_global_size1 = 0;
static int get_global_id(int dim) { return dim == 0 ? __wtt_gid0 : (dim == 1 ? __wtt_gid1 : 0); }
static int get_local_id(int dim) { (void)dim; return 0; }
static int get_group_id(int dim) { (void)dim; return 0; }
static int get_global_size(int dim) { return dim == 0 ? __wtt_global_size0 : (dim == 1 ? __wtt_global_size1 : 1); }

${rewrittenKernel}

static int parse_matrix(const char* json, float* values, int cap) {
  const char* key = strstr(json, "\\"matrix\\"");
  if (!key) return 0;
  const char* p = strchr(key, '[');
  if (!p) return 0;
  int depth = 0;
  int n = 0;
  for (; *p && n < cap; ++p) {
    if (*p == '[') {
      ++depth;
      continue;
    }
    if (*p == ']') {
      --depth;
      if (depth <= 0) break;
      continue;
    }
    if (depth >= 2 || (depth == 1 && ((*p >= '0' && *p <= '9') || *p == '-' || *p == '+'))) {
      char* end = NULL;
      float value = strtof(p, &end);
      if (end != p) {
        values[n++] = value;
        p = end - 1;
      }
    }
  }
  return n;
}

static char* append_number(char* out, float value) {
  int integer_value = (int)value;
  float delta = value - (float)integer_value;
  if (delta < 0.0f) delta = -delta;
  if (delta < 0.00001f) {
    out += sprintf(out, "%d", integer_value);
  } else {
    out += sprintf(out, "%.6g", value);
  }
  return out;
}

static int checksum_values(const float* values, int n) {
  int total = 0;
  for (int i = 0; i < n; ++i) total += ((int)(values[i] * 1000.0f)) * (i + 1);
  return total;
}

const char* ${functionName}(const char* payload_json) {
  enum { MAX_N = 4096 };
  static char result[65536];
  float matrix[MAX_N];
  float other[4] = { 1.0f, 2.0f, 3.0f, 4.0f };
  float output[MAX_N];
  int count = parse_matrix(payload_json, matrix, MAX_N);
  const int rows = 2;
  const int cols = count > 0 ? count / rows : 0;
  if (rows <= 0 || cols <= 0) {
    strcpy(result, "[]");
    return result;
  }
  memset(output, 0, sizeof(output));
  __wtt_global_size0 = ${mode === 'transpose' ? 'rows' : 'cols'};
  __wtt_global_size1 = ${mode === 'transpose' ? 'cols' : 'rows'};
  for (int y = 0; y < __wtt_global_size1; ++y) {
    for (int x = 0; x < __wtt_global_size0; ++x) {
      __wtt_gid0 = x;
      __wtt_gid1 = y;
      ${mode === 'matrix_add'
        ? `${kernelName}(matrix, other, output, rows, cols);`
        : `${kernelName}(matrix, output, rows, cols);`}
    }
  }
  char* out = result;
  ${mode === 'copy'
    ? `out += sprintf(out, "{\\"copied\\":");`
    : ''}
  *out++ = '[';
  const int out_rows = ${mode === 'transpose' ? 'cols' : 'rows'};
  const int out_cols = ${mode === 'transpose' ? 'rows' : 'cols'};
  for (int row = 0; row < out_rows; ++row) {
    if (row) *out++ = ',';
    *out++ = '[';
    for (int col = 0; col < out_cols; ++col) {
      if (col) *out++ = ',';
      out = append_number(out, output[row * out_cols + col]);
    }
    *out++ = ']';
  }
  *out++ = ']';
  ${mode === 'copy'
    ? `out += sprintf(out, ",\\"checksum\\":%d}", checksum_values(output, rows * cols));`
    : ''}
  *out = '\\0';
  return result;
}
`
}

function expectedIsMatrix(expectedOutput: string) {
  const expected = JSON.parse(expectedOutput) as unknown
  return Array.isArray(expected) && expected.length > 0 && expected.every((row) => Array.isArray(row))
}

function canUseRemoteOpenCLVectorAdapter(challenge: Challenge, testCases: ChallengeTestCase[]) {
  if (challenge.tags.includes('matmul') || challenge.tags.includes('gemm') || challenge.tags.includes('matrix-add') || challenge.tags.includes('transpose') || challenge.tags.includes('copy')) return false
  return testCases.length > 0 && testCases.every((testCase) => {
    try {
      const input = JSON.parse(testCase.input || '{}') as { payload?: { values?: unknown[] } }
      return Array.isArray(input.payload?.values) && !expectedIsMatrix(testCase.expected_output)
    } catch {
      return false
    }
  })
}

function canUseRemoteOpenCLMatrixElementAdapter(challenge: Challenge, testCases: ChallengeTestCase[]) {
  const supported = challenge.tags.includes('matrix-add') || challenge.tags.includes('transpose') || challenge.tags.includes('copy')
  if (!supported) return false
  return testCases.length > 0 && testCases.every((testCase) => {
    try {
      const input = JSON.parse(testCase.input || '{}') as { payload?: { matrix?: unknown[] } }
      const expected = JSON.parse(testCase.expected_output) as unknown
      return Array.isArray(input.payload?.matrix) && (expectedIsMatrix(testCase.expected_output) || (expected && typeof expected === 'object' && !Array.isArray(expected)))
    } catch {
      return false
    }
  })
}

function canUseRemoteOpenCLMatrixAdapter(challenge: Challenge, testCases: ChallengeTestCase[]) {
  if (!challenge.tags.includes('matmul') && !challenge.tags.includes('gemm')) return false
  return testCases.length > 0 && testCases.every((testCase) => {
    try {
      const input = JSON.parse(testCase.input || '{}') as { payload?: { matrix?: unknown[] } }
      return Array.isArray(input.payload?.matrix) && expectedIsMatrix(testCase.expected_output)
    } catch {
      return false
    }
  })
}

function buildOpenCLHost(challenge: Challenge, stdin: string, expectedOutput: string) {
  const input = JSON.parse(stdin || '{}') as { payload?: { op?: string; seed?: number; values?: unknown[]; matrix?: unknown[] } }
  const expected = JSON.parse(expectedOutput) as unknown
  const op = String(input.payload?.op || '')
  if (Array.isArray(expected) && expected.every((row) => Array.isArray(row))) {
    return buildOpenCLGemmHost(challenge, input.payload?.matrix, expected)
  }
  const values = op === 'softmax' ? input.payload?.values?.slice(0, 4) : input.payload?.values
  const kernelName = JSON.stringify(challenge.function_name)
  const arrayLiteral = cFloatArray(values)
  const inputN = Array.isArray(values) ? values.length : 0
  if (inputN <= 0) throw new Error('OpenCL runner requires at least one input value')
  const outputN = Array.isArray(expected) ? expected.length : 1
  const outputKind = Array.isArray(expected) ? 'array' : typeof expected === 'number' ? 'scalar' : 'checksum_object'
  const fixedOutput = op === 'softmax'

  return `#include <OpenCL/opencl.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void fail(const char* label, cl_int err) {
  fprintf(stderr, "%s failed: %d\\n", label, err);
  exit(2);
}

static char* read_file(const char* path, size_t* size) {
  FILE* file = fopen(path, "rb");
  if (!file) {
    perror("fopen kernel.cl");
    exit(2);
  }
  fseek(file, 0, SEEK_END);
  long length = ftell(file);
  rewind(file);
  char* buffer = (char*)calloc((size_t)length + 1, 1);
  if (!buffer) exit(2);
  if (fread(buffer, 1, (size_t)length, file) != (size_t)length) {
    perror("fread kernel.cl");
    exit(2);
  }
  fclose(file);
  *size = (size_t)length;
  return buffer;
}

static void print_number(float value) {
  if (${fixedOutput ? '1' : '0'}) {
    printf("%.6f", value);
  } else if (fabsf(value - roundf(value)) < 0.00001f) {
    printf("%.0f", value);
  } else {
    printf("%.6g", value);
  }
}

static void print_kernel_time(cl_event event) {
  cl_ulong start = 0;
  cl_ulong end = 0;
  if (!event) return;
  if (clGetEventProfilingInfo(event, CL_PROFILING_COMMAND_START, sizeof(start), &start, NULL) == CL_SUCCESS &&
      clGetEventProfilingInfo(event, CL_PROFILING_COMMAND_END, sizeof(end), &end, NULL) == CL_SUCCESS &&
      end >= start) {
    printf("kernel_time_ms = %.6f\\n", (double)(end - start) / 1000000.0);
  }
  clReleaseEvent(event);
}

int main(int argc, char** argv) {
  if (argc < 2) {
    fprintf(stderr, "usage: opencl_runner kernel.cl\\n");
    return 2;
  }

  const int n = ${inputN};
  const int output_n = ${outputN};
  float input[${inputN}] = { ${arrayLiteral} };
  float output[${outputN}] = {0};
  const char* kernel_name = ${kernelName};

  cl_int err = CL_SUCCESS;
  cl_uint platform_count = 0;
  err = clGetPlatformIDs(0, NULL, &platform_count);
  if (err != CL_SUCCESS || platform_count == 0) fail("clGetPlatformIDs", err);

  cl_platform_id platform = NULL;
  err = clGetPlatformIDs(1, &platform, NULL);
  if (err != CL_SUCCESS) fail("clGetPlatformIDs[0]", err);

  cl_device_id device = NULL;
  err = clGetDeviceIDs(platform, CL_DEVICE_TYPE_GPU, 1, &device, NULL);
  if (err != CL_SUCCESS) {
    err = clGetDeviceIDs(platform, CL_DEVICE_TYPE_DEFAULT, 1, &device, NULL);
    if (err != CL_SUCCESS) fail("clGetDeviceIDs", err);
  }

  cl_context context = clCreateContext(NULL, 1, &device, NULL, NULL, &err);
  if (err != CL_SUCCESS) fail("clCreateContext", err);

  cl_command_queue queue = clCreateCommandQueue(context, device, CL_QUEUE_PROFILING_ENABLE, &err);
  if (err != CL_SUCCESS) fail("clCreateCommandQueue", err);

  size_t source_size = 0;
  char* source = read_file(argv[1], &source_size);
  cl_program program = clCreateProgramWithSource(context, 1, (const char**)&source, &source_size, &err);
  if (err != CL_SUCCESS) fail("clCreateProgramWithSource", err);

  err = clBuildProgram(program, 1, &device, "", NULL, NULL);
  if (err != CL_SUCCESS) {
    size_t log_size = 0;
    clGetProgramBuildInfo(program, device, CL_PROGRAM_BUILD_LOG, 0, NULL, &log_size);
    char* log = (char*)calloc(log_size + 1, 1);
    clGetProgramBuildInfo(program, device, CL_PROGRAM_BUILD_LOG, log_size, log, NULL);
    fprintf(stderr, "%s", log);
    return 1;
  }

  cl_kernel kernel = clCreateKernel(program, kernel_name, &err);
  if (err != CL_SUCCESS) fail("clCreateKernel", err);

  cl_mem input_buffer = clCreateBuffer(context, CL_MEM_READ_ONLY | CL_MEM_COPY_HOST_PTR, sizeof(input), input, &err);
  if (err != CL_SUCCESS) fail("clCreateBuffer(input)", err);
  cl_mem output_buffer = clCreateBuffer(context, CL_MEM_WRITE_ONLY, sizeof(output), NULL, &err);
  if (err != CL_SUCCESS) fail("clCreateBuffer(output)", err);

  err = clSetKernelArg(kernel, 0, sizeof(cl_mem), &input_buffer);
  if (err != CL_SUCCESS) fail("clSetKernelArg(0)", err);
  err = clSetKernelArg(kernel, 1, sizeof(cl_mem), &output_buffer);
  if (err != CL_SUCCESS) fail("clSetKernelArg(1)", err);
  err = clSetKernelArg(kernel, 2, sizeof(int), &n);
  if (err != CL_SUCCESS) fail("clSetKernelArg(2)", err);

  size_t global = (size_t)(output_n > n ? output_n : n);
  cl_event kernel_event = NULL;
  err = clEnqueueNDRangeKernel(queue, kernel, 1, NULL, &global, NULL, 0, NULL, &kernel_event);
  if (err != CL_SUCCESS) fail("clEnqueueNDRangeKernel", err);
  err = clFinish(queue);
  if (err != CL_SUCCESS) fail("clFinish", err);
  err = clEnqueueReadBuffer(queue, output_buffer, CL_TRUE, 0, sizeof(output), output, 0, NULL, NULL);
  if (err != CL_SUCCESS) fail("clEnqueueReadBuffer", err);

  if (strcmp("${outputKind}", "scalar") == 0) {
    print_number(output[0]);
    printf("\\n");
  } else if (strcmp("${outputKind}", "checksum_object") == 0) {
    printf("{\\"checksum\\":");
    print_number(output[0]);
    printf(",\\"op\\":\\"${op}\\",\\"seed\\":${Number(input.payload?.seed || 0)}}\\n");
  } else {
    printf("[");
    for (int i = 0; i < output_n; ++i) {
      if (i) printf(",");
      print_number(output[i]);
    }
    printf("]\\n");
  }
  print_kernel_time(kernel_event);

  clReleaseMemObject(output_buffer);
  clReleaseMemObject(input_buffer);
  clReleaseKernel(kernel);
  clReleaseProgram(program);
  clReleaseCommandQueue(queue);
  clReleaseContext(context);
  free(source);
  return 0;
}
`
}

function buildOpenCLGemmHost(challenge: Challenge, matrix: unknown, expected: unknown[]) {
  const kernelName = JSON.stringify(challenge.function_name)
  const matrixLiteral = cFloatMatrix(matrix)
  const rows = expected.length
  const cols = Array.isArray(expected[0]) ? expected[0].length : 0
  if (rows <= 0 || cols <= 0) throw new Error('OpenCL matrix runner requires a non-empty 2D expected output')
  return `#include <OpenCL/opencl.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void fail(const char* label, cl_int err) {
  fprintf(stderr, "%s failed: %d\\n", label, err);
  exit(2);
}

static char* read_file(const char* path, size_t* size) {
  FILE* file = fopen(path, "rb");
  if (!file) {
    perror("fopen kernel.cl");
    exit(2);
  }
  fseek(file, 0, SEEK_END);
  long length = ftell(file);
  rewind(file);
  char* buffer = (char*)calloc((size_t)length + 1, 1);
  if (!buffer) exit(2);
  if (fread(buffer, 1, (size_t)length, file) != (size_t)length) {
    perror("fread kernel.cl");
    exit(2);
  }
  fclose(file);
  *size = (size_t)length;
  return buffer;
}

static void print_number(float value) {
  if (fabsf(value - roundf(value)) < 0.00001f) {
    printf("%.0f", value);
  } else {
    printf("%.6g", value);
  }
}

static void print_kernel_time(cl_event event) {
  cl_ulong start = 0;
  cl_ulong end = 0;
  if (!event) return;
  if (clGetEventProfilingInfo(event, CL_PROFILING_COMMAND_START, sizeof(start), &start, NULL) == CL_SUCCESS &&
      clGetEventProfilingInfo(event, CL_PROFILING_COMMAND_END, sizeof(end), &end, NULL) == CL_SUCCESS &&
      end >= start) {
    printf("kernel_time_ms = %.6f\\n", (double)(end - start) / 1000000.0);
  }
  clReleaseEvent(event);
}

int main(int argc, char** argv) {
  if (argc < 2) {
    fprintf(stderr, "usage: opencl_runner kernel.cl\\n");
    return 2;
  }

  const int m = ${rows};
  const int n = ${cols};
  const int k = 2;
  float a[4] = { ${matrixLiteral} };
  float b[4] = { 1.0f, 2.0f, 3.0f, 4.0f };
  float c[${rows * cols}] = {0};
  const char* kernel_name = ${kernelName};

  cl_int err = CL_SUCCESS;
  cl_uint platform_count = 0;
  err = clGetPlatformIDs(0, NULL, &platform_count);
  if (err != CL_SUCCESS || platform_count == 0) fail("clGetPlatformIDs", err);

  cl_platform_id platform = NULL;
  err = clGetPlatformIDs(1, &platform, NULL);
  if (err != CL_SUCCESS) fail("clGetPlatformIDs[0]", err);

  cl_device_id device = NULL;
  err = clGetDeviceIDs(platform, CL_DEVICE_TYPE_GPU, 1, &device, NULL);
  if (err != CL_SUCCESS) {
    err = clGetDeviceIDs(platform, CL_DEVICE_TYPE_DEFAULT, 1, &device, NULL);
    if (err != CL_SUCCESS) fail("clGetDeviceIDs", err);
  }

  cl_context context = clCreateContext(NULL, 1, &device, NULL, NULL, &err);
  if (err != CL_SUCCESS) fail("clCreateContext", err);

  cl_command_queue queue = clCreateCommandQueue(context, device, CL_QUEUE_PROFILING_ENABLE, &err);
  if (err != CL_SUCCESS) fail("clCreateCommandQueue", err);

  size_t source_size = 0;
  char* source = read_file(argv[1], &source_size);
  cl_program program = clCreateProgramWithSource(context, 1, (const char**)&source, &source_size, &err);
  if (err != CL_SUCCESS) fail("clCreateProgramWithSource", err);

  err = clBuildProgram(program, 1, &device, "", NULL, NULL);
  if (err != CL_SUCCESS) {
    size_t log_size = 0;
    clGetProgramBuildInfo(program, device, CL_PROGRAM_BUILD_LOG, 0, NULL, &log_size);
    char* log = (char*)calloc(log_size + 1, 1);
    clGetProgramBuildInfo(program, device, CL_PROGRAM_BUILD_LOG, log_size, log, NULL);
    fprintf(stderr, "%s", log);
    return 1;
  }

  cl_kernel kernel = clCreateKernel(program, kernel_name, &err);
  if (err != CL_SUCCESS) fail("clCreateKernel", err);

  cl_mem a_buffer = clCreateBuffer(context, CL_MEM_READ_ONLY | CL_MEM_COPY_HOST_PTR, sizeof(a), a, &err);
  if (err != CL_SUCCESS) fail("clCreateBuffer(a)", err);
  cl_mem b_buffer = clCreateBuffer(context, CL_MEM_READ_ONLY | CL_MEM_COPY_HOST_PTR, sizeof(b), b, &err);
  if (err != CL_SUCCESS) fail("clCreateBuffer(b)", err);
  cl_mem c_buffer = clCreateBuffer(context, CL_MEM_WRITE_ONLY, sizeof(c), NULL, &err);
  if (err != CL_SUCCESS) fail("clCreateBuffer(c)", err);

  err = clSetKernelArg(kernel, 0, sizeof(cl_mem), &a_buffer);
  if (err != CL_SUCCESS) fail("clSetKernelArg(0)", err);
  err = clSetKernelArg(kernel, 1, sizeof(cl_mem), &b_buffer);
  if (err != CL_SUCCESS) fail("clSetKernelArg(1)", err);
  err = clSetKernelArg(kernel, 2, sizeof(cl_mem), &c_buffer);
  if (err != CL_SUCCESS) fail("clSetKernelArg(2)", err);
  err = clSetKernelArg(kernel, 3, sizeof(int), &m);
  if (err != CL_SUCCESS) fail("clSetKernelArg(3)", err);
  err = clSetKernelArg(kernel, 4, sizeof(int), &n);
  if (err != CL_SUCCESS) fail("clSetKernelArg(4)", err);
  err = clSetKernelArg(kernel, 5, sizeof(int), &k);
  if (err != CL_SUCCESS) fail("clSetKernelArg(5)", err);

  size_t global[2] = { (size_t)n, (size_t)m };
  cl_event kernel_event = NULL;
  err = clEnqueueNDRangeKernel(queue, kernel, 2, NULL, global, NULL, 0, NULL, &kernel_event);
  if (err != CL_SUCCESS) fail("clEnqueueNDRangeKernel", err);
  err = clFinish(queue);
  if (err != CL_SUCCESS) fail("clFinish", err);
  err = clEnqueueReadBuffer(queue, c_buffer, CL_TRUE, 0, sizeof(c), c, 0, NULL, NULL);
  if (err != CL_SUCCESS) fail("clEnqueueReadBuffer", err);

  printf("[");
  for (int row = 0; row < m; ++row) {
    if (row) printf(",");
    printf("[");
    for (int col = 0; col < n; ++col) {
      if (col) printf(",");
      print_number(c[row * n + col]);
    }
    printf("]");
  }
  printf("]\\n");
  print_kernel_time(kernel_event);

  clReleaseMemObject(c_buffer);
  clReleaseMemObject(b_buffer);
  clReleaseMemObject(a_buffer);
  clReleaseKernel(kernel);
  clReleaseProgram(program);
  clReleaseCommandQueue(queue);
  clReleaseContext(context);
  free(source);
  return 0;
}
`
}

function openCLDeviceMemoryKb(stdin: string, expectedOutput: string) {
  const input = JSON.parse(stdin || '{}') as { payload?: { op?: string; values?: unknown[]; matrix?: unknown[] } }
  const expected = JSON.parse(expectedOutput) as unknown
  const floatBytes = 4
  let bytes = 0
  if (Array.isArray(expected) && expected.every((row) => Array.isArray(row))) {
    const matrixValues = Array.isArray(input.payload?.matrix)
      ? input.payload.matrix.flatMap((row) => Array.isArray(row) ? row : [])
      : []
    const outputValues = expected.flatMap((row) => Array.isArray(row) ? row : [])
    bytes = (matrixValues.length + 4 + outputValues.length) * floatBytes
  } else {
    const values = input.payload?.op === 'softmax' ? input.payload?.values?.slice(0, 4) : input.payload?.values
    const inputN = Array.isArray(values) ? values.length : 0
    const outputN = Array.isArray(expected) ? expected.length : 1
    bytes = (inputN + outputN) * floatBytes
  }
  return bytes > 0 ? Math.ceil(bytes / 1024) : undefined
}

async function runProcess(command: string, args: string[], timeoutMs: number, cwd?: string, stdin?: string): Promise<RawRunResult> {
  const started = Date.now()
  return await new Promise<RawRunResult>((resolve) => {
    const child = spawn(command, args, { cwd, stdio: [stdin === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] })
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
    child.stdout?.on('data', (chunk) => stdout.push(Buffer.from(chunk)))
    child.stderr?.on('data', (chunk) => stderr.push(Buffer.from(chunk)))
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
        error_message: code === 0 ? undefined : err.split('\n').slice(-8).join('\n'),
        runtime_ms: Date.now() - started,
      })
    })
    if (stdin !== undefined) child.stdin?.end(stdin)
  })
}

function isCompleteOpenCLProgram(code: string) {
  return /#\s*include\s*[<"](?:OpenCL\/opencl\.h|OpenCL\/OpenCL\.h|CL\/cl\.h)[>"]/.test(code)
    && /\bint\s+main\s*\(/.test(code)
    && /\bclGetPlatformIDs\s*\(/.test(code)
    && /\bclBuildProgram\s*\(/.test(code)
    && /\bclEnqueueNDRangeKernel\s*\(/.test(code)
}

function openCLExampleSmokeCases(testCases: ChallengeTestCase[]) {
  const publicCases = testCases.filter((testCase) => !testCase.is_hidden)
  return (publicCases.length ? publicCases : testCases).slice(0, 1).map((testCase) => ({
    ...testCase,
    checker: 'opencl_stdout_smoke' as const,
  }))
}

async function runLocalOpenCL(code: string, stdin: string, expectedOutput: string, timeoutMs: number, challenge: Challenge): Promise<RawRunResult> {
  if (process.platform !== 'darwin') {
    return { status: 'system_error', stdout: '', stderr: '', error_message: 'Local OpenCL runner is enabled for macOS Mac mini runner only.' }
  }

  const dir = await mkdtemp(join(tmpdir(), 'wtt-opencl-'))
  const kernelFile = join(dir, 'kernel.cl')
  const hostFile = join(dir, 'runner.c')
  const binFile = join(dir, 'runner')
  try {
    if (isCompleteOpenCLProgram(code)) {
      await writeFile(hostFile, code, 'utf8')
      const compile = await runProcess('clang', [hostFile, '-framework', 'OpenCL', '-o', binFile], timeoutMs, dir)
      if (compile.status !== 'accepted') {
        return { ...compile, status: 'compile_error', compile_output: compile.stderr || compile.stdout }
      }
      const run = await runProcess(binFile, [], timeoutMs, dir, stdin)
      return { ...run, runtime_ms: extractKernelRuntimeMs(run.stdout) || run.runtime_ms, memory_kb: openCLDeviceMemoryKb(stdin, expectedOutput) }
    }

    await writeFile(kernelFile, code, 'utf8')
    await writeFile(hostFile, buildOpenCLHost(challenge, stdin, expectedOutput), 'utf8')
    const compile = await runProcess('clang', [hostFile, '-framework', 'OpenCL', '-o', binFile], timeoutMs, dir)
    if (compile.status !== 'accepted') {
      return { ...compile, status: 'compile_error', compile_output: compile.stderr || compile.stdout }
    }

    const run = await runProcess(binFile, [kernelFile], timeoutMs, dir)
    return { ...run, runtime_ms: extractKernelRuntimeMs(run.stdout) || run.runtime_ms, memory_kb: openCLDeviceMemoryKb(stdin, expectedOutput) }
  } catch (error) {
    return { status: 'system_error', stdout: '', stderr: '', error_message: error instanceof Error ? error.message : String(error) }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function runRemoteJudge(input: JudgeInput, remoteUrl: string): Promise<JudgeOutput> {
  const response = await fetch(remoteUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      challenge: input.challenge,
      test_cases: input.testCases,
      code: input.code,
      language: input.language,
      submission_id: input.submissionId,
    }),
    cache: 'no-store',
  })
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Remote Arena judge failed: ${detail}`)
  }
  const output = (await response.json()) as JudgeOutput
  return {
    ...output,
    results: attachPublicCaseData(output.results || [], input.testCases),
  }
}

async function runRemoteOpenCLVectorAdapter(input: JudgeInput, remoteUrl: string): Promise<JudgeOutput> {
  const adapted = await runRemoteJudge({
    ...input,
    code: buildRemoteOpenCLVectorAdapter(input.code, input.challenge),
    language: 'c',
  }, remoteUrl)
  const memoryByCase = new Map(input.testCases.map((testCase) => [
    testCase.id,
    openCLDeviceMemoryKb(testCase.input, testCase.expected_output),
  ]))
  const results = adapted.results.map((result) => ({
    ...result,
    memory_kb: result.memory_kb || memoryByCase.get(result.test_case_id),
  }))
  return {
    ...adapted,
    provider: 'remote-opencl-vector-adapter',
    memory_kb: results.reduce((max, result) => Math.max(max, result.memory_kb || 0), 0) || adapted.memory_kb,
    results,
  }
}

async function runRemoteOpenCLMatrixAdapter(input: JudgeInput, remoteUrl: string): Promise<JudgeOutput> {
  const adapted = await runRemoteJudge({
    ...input,
    code: buildRemoteOpenCLMatrixAdapter(input.code, input.challenge),
    language: 'c',
  }, remoteUrl)
  const memoryByCase = new Map(input.testCases.map((testCase) => [
    testCase.id,
    openCLDeviceMemoryKb(testCase.input, testCase.expected_output),
  ]))
  const results = adapted.results.map((result) => ({
    ...result,
    memory_kb: result.memory_kb || memoryByCase.get(result.test_case_id),
  }))
  return {
    ...adapted,
    provider: 'remote-opencl-matrix-adapter',
    memory_kb: results.reduce((max, result) => Math.max(max, result.memory_kb || 0), 0) || adapted.memory_kb,
    results,
  }
}

async function runRemoteOpenCLMatrixElementAdapter(input: JudgeInput, remoteUrl: string): Promise<JudgeOutput> {
  const adapted = await runRemoteJudge({
    ...input,
    code: buildRemoteOpenCLMatrixElementAdapter(input.code, input.challenge),
    language: 'c',
  }, remoteUrl)
  const memoryByCase = new Map(input.testCases.map((testCase) => [
    testCase.id,
    openCLDeviceMemoryKb(testCase.input, testCase.expected_output),
  ]))
  const results = adapted.results.map((result) => ({
    ...result,
    memory_kb: result.memory_kb || memoryByCase.get(result.test_case_id),
  }))
  return {
    ...adapted,
    provider: 'remote-opencl-matrix-element-adapter',
    memory_kb: results.reduce((max, result) => Math.max(max, result.memory_kb || 0), 0) || adapted.memory_kb,
    results,
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

export async function judgeSubmission(input: JudgeInput) {
  const { challenge, testCases, code, language, submissionId } = input
  const normalizedLanguage = language.toLowerCase()
  const isOpenCL = OPENCL_LANGUAGES.has(normalizedLanguage)
  const standaloneOpenCLExample = isOpenCL && isCompleteOpenCLProgram(code)
  const effectiveTestCases = standaloneOpenCLExample ? openCLExampleSmokeCases(testCases) : testCases
  const effectiveInput = { ...input, testCases: effectiveTestCases }
  const standaloneOpenCLKernel = standaloneOpenCLExample ? extractOpenCLKernelSource(code) : null
  const shouldUseLocalOpenCL = isOpenCL && process.platform === 'darwin' && process.env.WTT_ARENA_DISABLE_LOCAL_OPENCL !== '1' && process.env.WTT_ARENA_FORCE_REMOTE_JUDGE !== '1'
  const macOpenCLJudgeUrl = process.env.WTT_ARENA_MAC_OPENCL_JUDGE_URL
  const remoteJudgeUrl = process.env.WTT_ARENA_REMOTE_JUDGE_URL
  if (!shouldUseLocalOpenCL && isOpenCL && macOpenCLJudgeUrl) return runRemoteJudge(effectiveInput, macOpenCLJudgeUrl)
  if (!shouldUseLocalOpenCL && remoteJudgeUrl) {
    if (isOpenCL) {
      const adapterInput = standaloneOpenCLKernel
        ? { ...effectiveInput, code: standaloneOpenCLKernel }
        : effectiveInput
      if (canUseRemoteOpenCLMatrixAdapter(challenge, effectiveTestCases)) return runRemoteOpenCLMatrixAdapter(adapterInput, remoteJudgeUrl)
      if (canUseRemoteOpenCLMatrixElementAdapter(challenge, effectiveTestCases)) return runRemoteOpenCLMatrixElementAdapter(adapterInput, remoteJudgeUrl)
      if (canUseRemoteOpenCLVectorAdapter(challenge, effectiveTestCases)) return runRemoteOpenCLVectorAdapter(adapterInput, remoteJudgeUrl)
      if (isCompleteOpenCLProgram(input.code)) return runRemoteJudge(effectiveInput, remoteJudgeUrl)
    }
    return runRemoteJudge(effectiveInput, remoteJudgeUrl)
  }

  if (!PYTHON_LANGUAGES.has(normalizedLanguage) && !isOpenCL) {
    throw new Error(`Unsupported language without remote runner: ${language}`)
  }

  const configuredProvider = (process.env.WTT_ARENA_JUDGE_PROVIDER || '').toLowerCase()
  const allowAgentLocal = configuredProvider === 'agent-local' || configuredProvider === 'local-python' || process.env.WTT_ARENA_ENABLE_LOCAL_PYTHON_JUDGE === '1'
  const provider = isOpenCL
    ? OPENCL_MAC_SKILL
    : process.env.JUDGE0_URL && configuredProvider !== 'agent-local' && configuredProvider !== 'local-python'
      ? 'judge0'
    : allowAgentLocal
      ? 'agent-local-python'
      : 'not-configured'
  const harness = PYTHON_LANGUAGES.has(normalizedLanguage) ? buildPythonHarness(code, challenge) : code
  const results: SubmissionResult[] = []
  let passedWeight = 0
  const totalWeight = effectiveTestCases.reduce((sum, testCase) => sum + testCase.weight, 0)
  let aggregateRuntime = 0
  let maxMemory = 0

  for (const testCase of effectiveTestCases) {
    const started = Date.now()
    const raw = provider === 'judge0'
      ? await runJudge0(harness, testCase.input, challenge.time_limit_ms)
      : provider === OPENCL_MAC_SKILL
        ? await runLocalOpenCL(harness, testCase.input, testCase.expected_output, challenge.time_limit_ms, challenge)
      : provider === 'agent-local-python'
        ? await runLocalPython(harness, testCase.input, challenge.time_limit_ms)
        : { status: 'system_error' as const, stdout: '', stderr: '', error_message: 'Configure JUDGE0_URL, choose OpenCL on macOS, or set WTT_ARENA_JUDGE_PROVIDER=agent-local for an isolated Agent-runner smoke environment.' }
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
      input: testCase.is_hidden ? undefined : testCase.input,
      expected_output: testCase.is_hidden ? undefined : testCase.expected_output,
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
