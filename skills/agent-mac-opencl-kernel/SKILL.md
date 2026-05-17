---
name: agent-mac-opencl-kernel
description: Use when an Arena AI Kernel submission must be adapted into a macOS/Mac mini runnable OpenCL program, compiled with clang -framework OpenCL, validated against example and hidden cases, and reported with correctness plus runtime and memory metrics.
metadata:
  short-description: Run Arena AI kernels on Mac OpenCL
---

# Agent Mac OpenCL Kernel

## Trigger

Use this skill for Arena AI Kernel submissions when:

- `language` is `opencl`, `opencl-c`, or `cl`.
- Challenge tags include `ai-kernel` and `macos-runner`.
- A user asks to turn a kernel submission into a Mac mini runnable OpenCL program and validate it.

## Inputs

The caller provides:

- Challenge id, function name, time limit, and memory limit.
- User OpenCL C source. Preferred submissions are complete host programs containing platform/device selection, program build, kernel launch, readback, and JSON stdout. Legacy kernel-only submissions are still accepted and wrapped by the runner.
- JSON test cases containing example and hidden inputs plus expected outputs.

## Workflow

1. If the submission is a complete OpenCL host program, preserve it as `runner.c`; otherwise preserve the legacy kernel-only source as `kernel.cl`.
2. For kernel-only submissions, generate a temporary macOS C host runner that loads `kernel.cl`.
3. Compile with `clang runner.c -framework OpenCL -o runner`.
4. For complete host submissions, pass each WTT JSON test payload on stdin and require the program to print the result JSON on stdout.
5. Select the first available GPU device and fall back to the default OpenCL device.
6. Run every test case and measure elapsed runtime.
7. Compare parsed JSON output against the expected output and stop on first failure.
8. Redact hidden stdout, stderr, compile logs, and detailed error messages.
9. Report kernel memory as the total OpenCL device buffer footprint, not host process RSS.

## Kernel ABI

- Complete host programs own the full OpenCL lifecycle and must read the WTT JSON payload from stdin and print JSON to stdout.
- Legacy vector/scalar kernel-only cases call `kernel(__global const float* values, __global float* output, int n)`.
- Legacy matrix/GEMM kernel-only cases call `kernel(__global const float* A, __global const float* B, __global float* C, int M, int N, int K)`.
- Legacy checksum object cases call the vector ABI; the kernel writes checksum to `output[0]`, and the generated host wraps the JSON object.

## Output

Return:

- Provider: `agent-mac-opencl-kernel`.
- Final status, score, aggregate runtime in milliseconds, and max kernel memory in KB.
- Per-case status, runtime, memory, and public-case stdout/stderr/compile output.
- Compile errors as `compile_error`; OpenCL API/runtime failures as `runtime_error` or `system_error`.

## Failure Policy

- If local execution is not macOS/OpenCL capable, return `system_error` and require a remote runner.
- Do not report whole-system or host process memory as kernel memory.
- Never expose hidden-case output or hidden build logs.
