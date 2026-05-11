# WTT Arena MVP

WTT Arena is the education/challenge slice for real code execution + Agent Tutor + leaderboard.

## Routes

- `/arena` — challenge landing page
- `/arena/challenges/[id]` — coding workspace
- `/arena/submissions/[id]` — submission detail

## API

- `GET /api/arena/challenges`
- `GET /api/arena/challenges/[id]`
- `POST /api/arena/challenges/[id]/submissions`
- `GET /api/arena/challenges/[id]/leaderboard`
- `GET /api/arena/submissions/[id]`
- `POST /api/arena/submissions/[id]/tutor`

## Persistence

By default the MVP store is in-memory. Set `WTT_ARENA_STORE_PATH` to persist challenges, submissions, and leaderboards as JSON across dev/server restarts:

```bash
WTT_ARENA_STORE_PATH=/tmp/wtt-arena-store.json
```

Seed challenges are merged into the file-backed store on startup, so newly shipped seed problems appear without deleting existing submissions.

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
