# WTT Arena MVP

WTT Arena is the education/challenge slice for real code execution + Agent Tutor + leaderboard.

## Routes

- `/arena` — challenge landing page
- `/arena/challenges/[id]` — coding workspace
- `/arena/submissions/[id]` — submission detail

## API

Web-facing Next API:

- `GET /api/arena/challenges`
- `GET /api/arena/challenges/[id]`
- `POST /api/arena/challenges/[id]/submissions`
- `GET /api/arena/challenges/[id]/leaderboard`
- `GET /api/arena/submissions/[id]`
- `POST /api/arena/submissions/[id]/tutor`

Backend WTT service API:

- `GET /arena/challenges`
- `GET /arena/challenges/[id]`
- `GET /arena/challenges/[id]/submissions`
- `GET /arena/challenges/[id]/leaderboard`
- `POST /arena/submissions`
- `GET /arena/submissions/[id]`

## Persistence

Primary persistence now lives in `wtt_service` Postgres via the `arena_submissions` table. The Next Arena API writes judged submissions to the backend and reads submissions/leaderboards from there first.

Backend selection for the Next API:

```bash
WTT_ARENA_BACKEND_URL=http://127.0.0.1:8000  # optional override
WTT_API_URL=http://127.0.0.1:8000            # normal server-side default
```

For isolated local MVP smoke tests, the in-memory/file-backed fallback still exists. Set `WTT_ARENA_BACKEND_DISABLED=1` to skip backend calls and optionally set `WTT_ARENA_STORE_PATH` to persist fallback JSON across dev/server restarts:

```bash
WTT_ARENA_BACKEND_DISABLED=1 WTT_ARENA_STORE_PATH=/tmp/wtt-arena-store.json npm run dev
```

Seed challenges are merged into the fallback file-backed store on startup, so newly shipped seed problems appear without deleting existing submissions.

## Judge providers: Judge0 vs Agent runner

Judge0 is **not required** for the WTT Arena product direction. Its value is that it already packages language runtimes, compilation, stdout/stderr capture, timeout handling, and basic sandboxing behind a standard API. It is useful for quick production hardening, especially for public untrusted submissions.

For WTT's Agent-native direction, the preferred architecture is:

1. Web/API records the submission and challenge contract.
2. A dedicated Agent runner claims the job.
3. The runner executes inside an isolated environment: container, Firecracker, nsjail, or a hardware lab node.
4. The runner compiles/runs/analyzes results and posts the redacted verdict back to `wtt_service`.

This keeps arbitrary user code out of the main web/API process while still avoiding a hard Judge0 dependency. Judge0 can remain one runner implementation, not the platform boundary.

Current MVP providers:

```bash
# Optional external judge adapter
JUDGE0_URL=https://your-judge0.example.com
JUDGE0_API_KEY=optional
JUDGE0_PYTHON_LANGUAGE_ID=71

# Local isolated Agent-runner/dev smoke mode
WTT_ARENA_JUDGE_PROVIDER=agent-local npm run dev
# legacy alias still supported:
WTT_ARENA_ENABLE_LOCAL_PYTHON_JUDGE=1 npm run dev
```

`agent-local` currently runs Python CPU-sim tests and is intended for local/runner environments, not the main production web container. CUDA/OpenCL/PoCL/Vortex/Metal can be added as additional runner backends behind the same challenge contract.

## Seed challenges

- Interview basics: `two-sum`, `valid-palindrome`, `maximum-subarray`.
- AI/GPU kernel board: 87 WTT-owned CPU-sim challenges covering vector ops, matrix ops, convolution/stencil, reductions/scans/sorts, attention, quantization, MoE, RoPE, SSM, GPT/LLaMA-style blocks, and graph/simulation tasks.
- The AI/GPU board is inspired by public GPU-learning challenge coverage, but text/starter/tests are rewritten for WTT because LeetGPU's published repository is CC BY-NC-ND.

Hidden tests are redacted from API responses and Agent Tutor context.
