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

## Verification (2026-10-07)

- Production Next.js build and TypeScript check passed. Existing lint warnings
  in unrelated pages and existing Settings images remain; no new lint warning.
- `npx playwright test tests/desktop-hosts.spec.ts tests/mobile-chat-status.spec.ts`
  exercises the new browser UI and the existing mobile status contracts.
- New coverage: onboarding public proof exchange, native vs ordinary browser,
  confirmation/cancellation of revocation, error preservation, disabled backend,
  pagination/deduplication, original login entry, English/dark and narrow layouts.
- Screenshots are generated at `test-results/desktop-hosts-dark-en.png` and
  `test-results/desktop-hosts-mobile-en.png`; desktop 1280px and mobile 390/320px
  widths were checked. The screenshots show test fixtures, not real user data.
- An actual Chromium `fetch` receiver error was found by the first run and fixed.
  Requests also avoid requiring `AbortSignal.timeout` on older WebViews.

These browser tests simulate WTT session/API responses and native IPC. They do
not prove real OAuth, Electron Keychain, API deployment, CLI execution, Android
or iOS installation. Production enrollment must stay disabled until the remaining
desktop lifecycle, old IPC/path restrictions, runtime and account-switch tests pass.
