# Account-owned desktop host UI

This is part of the unified WTT client implementation, not a completed desktop
or mobile release. Runtime supervision and real-device chat are still pending.

## Entry points

- Settings -> Agent Binding: account host directory and, in a compatible desktop
  shell, native onboarding controls.
- `/desktop/setup`: the same panel with a login return URL. Ordinary browsers can
  list/revoke their account's enrolled hosts but cannot authorize local execution.
- The desktop shell's My Computers menu opens the setup route.

The panel uses the original WTT session and `/auth/me` identity. It sends public
installation/PKCE proofs to `/hosts/enrollments`; only the native bridge exchanges
the resulting grant. Host tokens and installation secrets never enter these Web
requests or component state. Host enrollment is not represented as an Agent
already running: the UI says authorized, and lists actual backend online status.

The backend and native bridge remain feature-gated. A 404 host service response
hides the optional Settings panel for existing users; the standalone setup route
shows an unavailable state. No Cloud Agent create/wake/model endpoints are used.

## Original account session lifecycle

The existing global NextAuth provider now synchronizes its session with compatible
desktop bridges. The native process verifies the original WTT access token before
unlocking that account's stored host credential. Session expiry or a changed
account updates the native authorization, not only the setup page. Existing logout
controls detach native authorization before the NextAuth redirect. Older bridges
and ordinary browsers retain their existing login behavior.

The host panel subscribes to native state changes. Late status snapshots cannot
overwrite newer events; a failed restore stays unavailable until a refresh retries
it. The main process owns credential persistence, invalidation and error redaction.
These changes do not yet manage a running CLI process; runtime supervision remains
a separate unfinished requirement.

## Verification (2026-10-07)

- Production Next.js build and TypeScript check passed. Existing lint warnings
  in unrelated pages and existing Settings images remain; no new lint warning.
- `npx playwright test tests/desktop-hosts.spec.ts tests/mobile-chat-status.spec.ts`
  passed all 15 tests: 12 browser UI scenarios and 3 existing mobile status contracts.
- New coverage: onboarding public proof exchange, native vs ordinary browser,
  confirmation/cancellation of revocation, error preservation, disabled backend,
  pagination/deduplication, original login entry, English/dark and narrow layouts.
- Lifecycle coverage: global restoration without re-enrollment, account switch,
  session expiry, failed restore/retry, and native disconnect before Web logout.
- A stale initial IPC snapshot overwrote account-switch/failure events in the first
  lifecycle test run (2 failures). Subscription-before-snapshot plus an event guard
  fixes the race; all 15 scenarios then passed against the production build.
- Full `npm run lint` passed with existing project warnings; the existing OAuth
  issuer contract test passed. These do not prove real OAuth provider login.
- Screenshots are generated at `test-results/desktop-hosts-dark-en.png` and
  `test-results/desktop-hosts-mobile-en.png`; desktop 1280px and mobile 390/320px
  widths were checked. The screenshots show test fixtures, not real user data.
- An actual Chromium `fetch` receiver error was found by the first run and fixed.
  Requests also avoid requiring `AbortSignal.timeout` on older WebViews.

These browser tests simulate WTT session/API responses and native IPC. They do
not prove real OAuth, Electron Keychain, API deployment, CLI execution, Android
or iOS installation. Production enrollment must stay disabled until the remaining
desktop lifecycle, old IPC/path restrictions, runtime and account-switch tests pass.
# Persistent Native Chat Status

Shared ChatView and the independent mobile chat use the optional `/hosts/chat-executions` projection. Only authenticated Topic members can read it; stopping additionally requires the native host owner. The input-area status distinguishes queued, accepted, running, awaiting approval, reply awaiting delivery, completed, failed, stopped and uncertain interruption. A stop request does not immediately claim the process is stopped.

Existing authenticated socket hints trigger refreshes. Active work has a bounded ten-second visible-page refresh; idle, hidden and unsupported routes do not poll. Topic/account changes abort stale reads and stop requests, and revisions fence older snapshots. No second inference or chat transport is introduced. Backend rollout must be enabled for the relevant managed host before this optional panel becomes available; old Cloud/headless chats remain unchanged.
