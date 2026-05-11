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

## Judge providers

Production should use Judge0:

```bash
JUDGE0_URL=https://your-judge0.example.com
JUDGE0_API_KEY=optional
JUDGE0_PYTHON_LANGUAGE_ID=71
```

Local development can run Python directly for smoke tests:

```bash
WTT_ARENA_ENABLE_LOCAL_PYTHON_JUDGE=1 npm run dev
```

The local Python judge is development-only. User code must not run in the main production backend process.

## Seed challenges

- `two-sum` → `two_sum(nums, target)`
- `valid-palindrome` → `is_palindrome(s)`
- `maximum-subarray` → `max_subarray(nums)`

Hidden tests are redacted from API responses and Agent Tutor context.
