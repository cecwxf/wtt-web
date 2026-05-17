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

function buildOpenCLHost(challenge: Challenge, stdin: string) {
  const input = JSON.parse(stdin || '{}') as { payload?: { op?: string; values?: unknown[]; matrix?: unknown[] } }
  const op = String(input.payload?.op || '')
  if (op === 'gemm' || challenge.id === 'ai-gemm') {
    return buildOpenCLGemmHost(challenge, input.payload?.matrix)
  }
  if (op !== 'vector_add' && op !== 'relu' && op !== 'softmax') {
    throw new Error(`Local macOS OpenCL runner currently supports ai-vector-add, ai-relu, ai-softmax, and ai-gemm; ${challenge.id} uses op=${op}`)
  }

  const values = op === 'softmax' ? input.payload?.values?.slice(0, 4) : input.payload?.values
  const kernelName = JSON.stringify(challenge.function_name)
  const arrayLiteral = cFloatArray(values)
  const n = Array.isArray(values) ? values.length : 0
  if (n <= 0) throw new Error('OpenCL runner requires at least one input value')
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

int main(int argc, char** argv) {
  if (argc < 2) {
    fprintf(stderr, "usage: opencl_runner kernel.cl\\n");
    return 2;
  }

  const int n = ${n};
  float input[${n}] = { ${arrayLiteral} };
  float output[${n}] = {0};
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

  cl_command_queue queue = clCreateCommandQueue(context, device, 0, &err);
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

  size_t global = (size_t)n;
  err = clEnqueueNDRangeKernel(queue, kernel, 1, NULL, &global, NULL, 0, NULL, NULL);
  if (err != CL_SUCCESS) fail("clEnqueueNDRangeKernel", err);
  err = clFinish(queue);
  if (err != CL_SUCCESS) fail("clFinish", err);
  err = clEnqueueReadBuffer(queue, output_buffer, CL_TRUE, 0, sizeof(output), output, 0, NULL, NULL);
  if (err != CL_SUCCESS) fail("clEnqueueReadBuffer", err);

  printf("[");
  for (int i = 0; i < n; ++i) {
    if (i) printf(",");
    if (${fixedOutput ? '1' : '0'}) {
      printf("%.6f", output[i]);
    } else if (fabsf(output[i] - roundf(output[i])) < 0.00001f) {
      printf("%.0f", output[i]);
    } else {
      printf("%.6g", output[i]);
    }
  }
  printf("]\\n");

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

function buildOpenCLGemmHost(challenge: Challenge, matrix: unknown) {
  const kernelName = JSON.stringify(challenge.function_name)
  const matrixLiteral = cFloatMatrix(matrix)
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

int main(int argc, char** argv) {
  if (argc < 2) {
    fprintf(stderr, "usage: opencl_runner kernel.cl\\n");
    return 2;
  }

  const int m = 2;
  const int n = 2;
  const int k = 2;
  float a[4] = { ${matrixLiteral} };
  float b[4] = { 1.0f, 2.0f, 3.0f, 4.0f };
  float c[4] = {0};
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

  cl_command_queue queue = clCreateCommandQueue(context, device, 0, &err);
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
  err = clEnqueueNDRangeKernel(queue, kernel, 2, NULL, global, NULL, 0, NULL, NULL);
  if (err != CL_SUCCESS) fail("clEnqueueNDRangeKernel", err);
  err = clFinish(queue);
  if (err != CL_SUCCESS) fail("clFinish", err);
  err = clEnqueueReadBuffer(queue, c_buffer, CL_TRUE, 0, sizeof(c), c, 0, NULL, NULL);
  if (err != CL_SUCCESS) fail("clEnqueueReadBuffer", err);

  printf("[[");
  print_number(c[0]);
  printf(",");
  print_number(c[1]);
  printf("],[");
  print_number(c[2]);
  printf(",");
  print_number(c[3]);
  printf("]]\\n");

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

async function runProcess(command: string, args: string[], timeoutMs: number, cwd?: string): Promise<RawRunResult> {
  const started = Date.now()
  return await new Promise<RawRunResult>((resolve) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
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
        error_message: code === 0 ? undefined : err.split('\n').slice(-8).join('\n'),
        runtime_ms: Date.now() - started,
      })
    })
  })
}

async function runLocalOpenCL(code: string, stdin: string, timeoutMs: number, challenge: Challenge): Promise<RawRunResult> {
  if (process.platform !== 'darwin') {
    return { status: 'system_error', stdout: '', stderr: '', error_message: 'Local OpenCL runner is enabled for macOS Mac mini runner only.' }
  }

  const dir = await mkdtemp(join(tmpdir(), 'wtt-opencl-'))
  const kernelFile = join(dir, 'kernel.cl')
  const hostFile = join(dir, 'runner.c')
  const binFile = join(dir, 'runner')
  try {
    await writeFile(kernelFile, code, 'utf8')
    await writeFile(hostFile, buildOpenCLHost(challenge, stdin), 'utf8')

    const compile = await runProcess('clang', [hostFile, '-framework', 'OpenCL', '-o', binFile], timeoutMs, dir)
    if (compile.status !== 'accepted') {
      return { ...compile, status: 'compile_error', compile_output: compile.stderr || compile.stdout }
    }

    return await runProcess(binFile, [kernelFile], timeoutMs, dir)
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
  return (await response.json()) as JudgeOutput
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
  const remoteJudgeUrl = process.env.WTT_ARENA_REMOTE_JUDGE_URL
  if (remoteJudgeUrl) return runRemoteJudge(input, remoteJudgeUrl)

  const normalizedLanguage = language.toLowerCase()
  if (!PYTHON_LANGUAGES.has(normalizedLanguage) && !OPENCL_LANGUAGES.has(normalizedLanguage)) {
    throw new Error(`Unsupported language without remote runner: ${language}`)
  }

  const configuredProvider = (process.env.WTT_ARENA_JUDGE_PROVIDER || '').toLowerCase()
  const allowAgentLocal = configuredProvider === 'agent-local' || configuredProvider === 'local-python' || process.env.WTT_ARENA_ENABLE_LOCAL_PYTHON_JUDGE === '1'
  const provider = OPENCL_LANGUAGES.has(normalizedLanguage)
    ? 'agent-local-opencl-macos'
    : process.env.JUDGE0_URL && configuredProvider !== 'agent-local' && configuredProvider !== 'local-python'
      ? 'judge0'
    : allowAgentLocal
      ? 'agent-local-python'
      : 'not-configured'
  const harness = PYTHON_LANGUAGES.has(normalizedLanguage) ? buildPythonHarness(code, challenge) : code
  const results: SubmissionResult[] = []
  let passedWeight = 0
  const totalWeight = testCases.reduce((sum, testCase) => sum + testCase.weight, 0)
  let aggregateRuntime = 0
  let maxMemory = 0

  for (const testCase of testCases) {
    const started = Date.now()
    const raw = provider === 'judge0'
      ? await runJudge0(harness, testCase.input, challenge.time_limit_ms)
      : provider === 'agent-local-opencl-macos'
        ? await runLocalOpenCL(harness, testCase.input, challenge.time_limit_ms, challenge)
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
