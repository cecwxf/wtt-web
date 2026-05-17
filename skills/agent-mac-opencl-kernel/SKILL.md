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
- User kernel source.
- JSON test cases containing example and hidden inputs plus expected outputs.

## Workflow

1. Preserve the user kernel source as `kernel.cl`.
2. Generate a temporary macOS C host runner that loads `kernel.cl`.
3. Compile with `clang runner.c -framework OpenCL -o runner`.
4. Select the first available GPU device and fall back to the default OpenCL device.
5. Run every test case and measure elapsed runtime.
6. Compare parsed JSON output against the expected output and stop on first failure.
7. Redact hidden stdout, stderr, compile logs, and detailed error messages.
8. Report kernel memory as the total OpenCL device buffer footprint, not host process RSS.

## Kernel ABI

- Vector/scalar cases call `kernel(__global const float* values, __global float* output, int n)`.
- Matrix/GEMM-style cases call `kernel(__global const float* A, __global const float* B, __global float* C, int M, int N, int K)`.
- Checksum object cases call the vector ABI; the kernel writes checksum to `output[0]`, and the host wraps the JSON object.

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
