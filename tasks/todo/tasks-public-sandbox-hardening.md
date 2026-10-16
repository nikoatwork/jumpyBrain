# Public Sandbox Hardening

## Goal

Make the existing jumpyBrain server safe enough for a public writable demo brain that people can connect to from the CLI with one command. The sandbox should allow writes, but limit abuse through dependency-light rate limits and resettable state rather than introducing a required external auth provider.

## Notes

- Decision from planning: the public demo brain should be a writable sandbox.
- Preferred auth posture: no auth for demo endpoints if we can limit CLI reads/writes well; otherwise fall back to a shared public demo API key.
- Keep the open source package dependency-light and self-hostable. Do not require Clerk/Auth0/Supabase/etc. for core usage.
- Existing V1 server already supports API-key auth, remote CLI flows, logging, and auto-indexing.
- This task is for core/server hardening that belongs in this repo. Demo-specific deployment/reseeding config belongs in a separate demo repo task list.

## Research findings (codebase)

- `src/server/config.ts` `resolveServerConfig()` **throws if no API keys are set** (`JUMPYBRAIN_SERVER_API_KEYS` or `--api-key`). Public-demo mode therefore requires an opt-in flag that relaxes this requirement; otherwise startup fails. Config currently has no concept of "demo" or "rate limit" fields.
- `src/adapters/http-server/routes.ts` `authenticate()` runs for **every** `/memories/all/*` route and requires a `Bearer` token matched against `apiKeys` via `timingSafeEqual` on sha256 hashes. `/health` and `GET /graph` (browser shell) are the only unauthenticated routes. There is no per-route auth bypass today.
- `src/adapters/http-server/index.ts` `createJumpyBrainHttpServer()` wraps every request in try/catch/finally and logs `http_request` (method/path/status/duration/error_code) in the `finally`. `/health` is excluded from access logging. This wrapper is the natural insertion point for a rate-limit middleware because it already owns the per-request lifecycle and the `FileLogger`.
- No rate-limiting exists anywhere. The only concurrency control is the in-process `enqueueWrite` serial write queue (single Node process, one local disk root — documented V1 constraint).
- `src/adapters/logging/index.ts` already redacts keys matching `/authorization|api[-_]?key|token|secret|password|body|content/i` and bearer/token **values**, and truncates values to 300 chars. Request bodies are never logged. This satisfies most "don't leak secrets/bodies" requirements; rate-limit decisions should reuse this logger and avoid new secret-bearing fields.
- CLI remote path: `src/cli/targets.ts` (`--target-url`/`--remote-url`), `src/cli/memory-target.ts` `createMemoryTarget()` calls `createRemoteMemoryTransport({ url, apiKey: remoteApiKey() })`, and `remoteApiKey()` **throws if `JUMPYBRAIN_API_KEY` is unset**. `src/adapters/http-client/index.ts` `createRemoteMemoryTransport()` also throws if `apiKey` is blank and always sets `Authorization: Bearer`. So a no-auth public demo requires the client transport to support an **optional** API key, not just the server.
- Server-memory status packet (`serverMemoryStatus` in `src/app/server-memory/index.ts`) returns `index` with `stale`, `lastIndexedAt`, `documents`, `qmdCollection` — already exposes index freshness. No request/write/reject counters exist; these would be new in-process state.
- Named target registries / `target add-demo` are explicitly **deferred from V1** (`docs/cloud-shared-memory.md` "Deferred from V1"). A hardcoded demo alias risks re-introducing that scope; prefer docs + optional env shorthand.
- Architecture boundary tests (`test/architecture-boundaries.test.js`) enforce the layer graph: rate-limiting code must live in the `http-server-adapter` layer (may import `http-protocol-adapter`, `app-use-case`, `core-domain`, `infrastructure-adapter`) and must **not** be imported by `core` or pulled into `app/server-memory`. Core must stay free of HTTP concerns.

## Relevant Files

- `src/architecture.docs.md` - Architecture guardrails to read before implementation.
- `src/server/server.docs.md` - Server boundary.
- `src/server/config.ts` - Server configuration (`resolveServerConfig`, env parsing).
- `src/adapters/http-server/http-server.docs.md` - HTTP server adapter boundary.
- `src/adapters/http-server/index.ts` - `createJumpyBrainHttpServer`/`startJumpyBrainHttpServer` request lifecycle + logger wiring.
- `src/adapters/http-server/routes.ts` - `routeRequest`, `authenticate`, route list.
- `src/adapters/http-protocol.ts` - `HTTP_MEMORY_ROUTES` literals shared with client.
- `src/adapters/logging/logging.docs.md` + `src/adapters/logging/index.ts` - File logging/redaction behavior.
- `src/app/server-memory/server-memory.docs.md` + `src/app/server-memory/index.ts` - Server-memory use cases + `serverMemoryStatus`.
- `src/app/server-memory/state.ts` - `RemoteIndexState` (index freshness).
- `src/adapters/http-client/index.ts` - `createRemoteMemoryTransport` (requires apiKey today).
- `src/cli/targets.ts` + `src/cli/memory-target.ts` - Remote target CLI behavior + `remoteApiKey()`.
- `test/server-http.test.js`, `test/architecture-boundaries.test.js` - Existing test patterns + layer constraints.
- `docs/cloud-shared-memory.md` - Remote/shared-memory docs (auth, deferred V1 features).

## Tasks

- [ ] 1.0 Define public sandbox safety policy
  - [ ] 1.1 Read the relevant `*docs.md` files before changing source modules (`src/architecture.docs.md`, `src/server/server.docs.md`, `src/adapters/http-server/http-server.docs.md`, `src/app/server-memory/server-memory.docs.md`, `src/adapters/logging/logging.docs.md`).
  - [ ] 1.2 Specify which endpoints can be unauthenticated in public sandbox mode. Recommendation: in demo mode allow no-auth on reads (`status`, `overview`, `tree`, `graph.json`, `search`, `recall`, `documents/:id` GET) and writes (`notes`, `wrapups`, `documents/:id` PUT, `index`); keep `dream/*` **auth-gated or disabled** in demo mode because dream batches expose bounded memory bodies and are operator-only. `/health` and `GET /graph` stay unauthenticated as today.
  - [ ] 1.3 Specify read/write/index/status rate-limit defaults suitable for a public demo. Suggested starting budgets (per client key per window): reads 60/min, writes 10/min, index 1/5min, status 30/min. Make all budgets configurable via env; document that these are demo defaults, not production SLAs.
  - [ ] 1.4 Define the fallback mode: shared public API key if no-auth rate limiting is not safe enough. Concretely: if abuse is observed, operators set `JUMPYBRAIN_SERVER_API_KEYS=demo-public-key` and the CLI flow degrades to the existing `JUMPYBRAIN_API_KEY` path — no new code path required for fallback, only docs.
  - [ ] 1.5 Document abuse assumptions and what reset/reseed is expected to solve vs. not solve. Reseeding restores canonical Markdown to a known-good snapshot; it does **not** undo index state churn, idempotency records, or log growth — those are resettable/derived. Rate limiting mitigates floods and junk writes but cannot prevent low-volume spam; that is accepted for a demo brain.

- [ ] 2.0 Add dependency-light rate limiting
  - [ ] 2.1 Implement an in-memory token-bucket or fixed-window limiter as a **new adapter module** `src/adapters/http-server/rate-limiter.ts` (no npm deps; pure TS using `Map<string, bucket>` + `setTimeout`/lazy expiry). Export `createRateLimiter(options)` returning `{ check(key, bucket): { allowed, retryAfterMs, remaining } }`. Keep it framework-agnostic (no `IncomingMessage` import) so it is unit-testable in isolation.
  - [ ] 2.2 Key limits by `request.socket.remoteAddress`; treat `X-Forwarded-For`/`Forwarded` **only** when an explicit `JUMPYBRAIN_TRUSTED_PROXY=1` flag is set, and then use the leftmost hop. Document the spoofing risk otherwise. Fall back to a single `"unknown"` bucket if no IP is available so abuse still gets throttled globally rather than bypassed.
  - [ ] 2.3 Apply separate budgets for reads/recalls/searches and writes/wrapups/index. Define a small route-classification helper in `routes.ts` or `rate-limiter.ts` that maps a `(method, pathname)` to `read`/`write`/`index`/`status` using `HTTP_MEMORY_ROUTES` literals (no hardcoded path strings). Health/graph stay unmetered.
  - [ ] 2.4 Return clear retry errors without leaking internals: HTTP `429` with `error.code = "rate_limited"`, a `Retry-After` header (seconds), and a message that references the public-demo reset policy. Do not include bucket internals, IP, or remaining-token counts in the response body. Log `rate_limit_rejected` with only `bucket_class`, `retry_after_ms`, and `path` (reuse existing redaction).
  - [ ] 2.5 Add tests (`test/rate-limiter.test.js`) for per-key isolation, window reset, disabled mode (`limits = 0`/unset → no-op), endpoint-specific budgets, and the `429` shape. Use fake timers or injectable `now()` to avoid flakiness. Add an integration assertion in `test/server-http.test.js` that a demo-mode server returns `429` after exceeding the write budget.

- [ ] 3.0 Add explicit public-demo server mode
  - [ ] 3.1 Add config/env flags for public demo mode with safe defaults. Extend `JumpyBrainServerConfig`/`ResolveServerConfigInput` in `src/server/config.ts` with `publicDemo?: boolean` and a `rateLimits?` shape; env `JUMPYBRAIN_PUBLIC_DEMO=1` and `JUMPYBRAIN_RATE_LIMIT_READS=60` etc. **Default `publicDemo = false`** so existing deployments are unaffected. When `publicDemo` is true, allow zero API keys (relax the throw); when false, keep the existing "at least one API key required" guard.
  - [ ] 3.2 Ensure public demo mode cannot accidentally expose local private memory roots. `root` is already required and explicit (`--root`/`JUMPYBRAIN_SERVER_ROOT`); do not add a default root. On startup in demo mode, log a clear warning that the configured root is publicly writable and assert `root !== homedir()`-style guards are out of scope (operator responsibility) — but do refuse to start if `root` is empty. Document that operators must point demo mode at a dedicated, reseedable root.
  - [ ] 3.3 Keep existing API-key auth as the default production/shared-memory behavior. In `routes.ts` `authenticate()`, skip auth **only** when `publicDemo` is true; otherwise behavior is unchanged. Pass `publicDemo` through `routeRequest` context (extend the context object) rather than reading env inside the adapter.
  - [ ] 3.4 Add startup logging that clearly shows whether auth, rate limits, and public mode are enabled. Extend the `serveCli`/`startJumpyBrainHttpServer` startup log (currently only prints the URL) to print a one-line mode summary: `auth=api-key|public-demo rate_limits=on|off writes=throttled`. Ensure this line contains no secrets (reuse logger redaction; do not echo keys).

- [ ] 4.0 Improve one-command CLI connection UX
  - [ ] 4.1 Verify the current remote target command path for connecting to a hosted server: `jumpybrain recall --target-url https://demo.jumpybrain.dev --topic "..."`. Confirm `src/cli/targets.ts` and `src/cli/memory-target.ts` resolve the URL and that `JUMPYBRAIN_API_KEY` is the only blocker for no-auth.
  - [ ] 4.2 Make the CLI remote transport tolerate a **missing** API key when the server is in no-auth demo mode: change `createRemoteMemoryTransport` to treat `apiKey` as optional (omit the `Authorization` header when blank) and relax `remoteApiKey()` to return `undefined` instead of throwing. Guard this with server behavior: if the server actually requires auth, the existing `401 auth_required` response surfaces a clear CLI error telling the user to set `JUMPYBRAIN_API_KEY`. Tradeoff: a slightly looser client; acceptable because the server is the source of truth for auth.
  - [ ] 4.3 Add or document a copy-paste command for connecting to the public sandbox. Prefer **docs only** (a fenced example in `docs/cloud-shared-memory.md` and README) over a new CLI subcommand, since named target registries are deferred from V1. If a shorthand is still wanted, add a documented env alias (`JUMPYBRAIN_DEMO_URL`) consumed by `memory-target.ts` as a fallback when `--target-url` is absent — but keep it a pure convenience default, not demo-specific runtime logic in core.
  - [ ] 4.4 Ensure CLI errors explain public sandbox rate limits and reset expectations. Map remote `429 rate_limited` to a CLI message like "Public demo rate limit reached; retry after Ns. The demo brain is reset periodically." in the remote error handling path (`src/adapters/http-client/index.ts` / CLI formatting). Do not add reset-schedule knowledge to core runtime; keep the message generic.

- [ ] 5.0 Add public sandbox observability and guardrails
  - [ ] 5.1 Ensure logs record rate-limit decisions without storing request bodies or secrets. Reuse `createFileLogger`; emit `rate_limit_rejected` (info/warn) with `bucket_class`, `retry_after_ms`, `path`, `method`. Verify the existing `SECRET_KEY`/`SECRET_VALUE` redaction covers any new fields; do not introduce fields named `key`/`token`/`body`.
  - [ ] 5.2 Add lightweight in-process counters for requests, writes, rejects, and last-reset marker; surface them in an **auth-gated** admin/status extension of `GET /memories/all/status` (or a new `/memories/all/sandbox` route) only when `publicDemo` is true. Keep counters in the http-server adapter (process-local, non-persistent) — do not push them into `app/server-memory` or core. Index freshness is already in `serverMemoryStatus`; reuse it rather than duplicating. Tradeoff: counters reset on restart; acceptable for a demo and avoids new persisted state.
  - [ ] 5.3 Add tests or smoke scripts for public-mode status, write, search, recall, and rate-limit failure paths. Extend `test/server-http.test.js` with a demo-mode fixture (`publicDemo: true`, tight limits) covering: unauthenticated `status` succeeds, unauthenticated `notes` write succeeds then `429`s after budget, `429` includes `Retry-After`, and `dream/*` is still gated/disabled. Add a boundary assertion in `test/architecture-boundaries.test.js` that `rate-limiter.ts` lives in the http-server-adapter layer and is not imported by core/app.

- [ ] 6.0 Document and validate
  - [ ] 6.1 Update `docs/cloud-shared-memory.md` with a "Public sandbox mode" section: env flags, default budgets, IP-keying + trusted-proxy caveat, what reseed resets, and the explicit warning that demo mode is publicly writable.
  - [ ] 6.2 Document the no-auth vs shared-key decision and when to use each: no-auth + rate limits for a throwaway demo brain; switch to a shared public API key (set `JUMPYBRAIN_SERVER_API_KEYS`) the moment abuse exceeds what reseeding absorbs — no code change needed.
  - [ ] 6.3 Run `npm test` and `npm run cli:pack`. Confirm boundary tests pass (no new core/app imports of the rate limiter) and the packed CLI still connects to a demo server without `JUMPYBRAIN_API_KEY`.
  - [x] 6.4 Revoke the bearer credential previously published in README history and verify it no longer grants access. Completed by `tasks/todo/tasks-open-source-security-docs-audit.md`: on 2026-07-11 both the historical credential and a bogus credential returned `401` from authenticated status.

## Decisions

- Do not move to an external auth provider as a required dependency now.
- Public writable demo should prefer no-auth + rate limits + regular reseeding; use a shared public API key only if rate limiting is insufficient.
- Rate limiting lives in the `http-server-adapter` layer (`src/adapters/http-server/rate-limiter.ts`); core and `app/server-memory` stay free of HTTP/rate-limit concerns. Counters are process-local and non-persistent.
- Demo mode is opt-in (`JUMPYBRAIN_PUBLIC_DEMO=1`) with safe defaults; existing API-key deployments are unchanged.
- Named target registries / `target add-demo` remain deferred from V1; CLI UX improvements are docs + optional API-key relaxation, not new core runtime behavior.
- Dream endpoints stay auth-gated or disabled in demo mode because they expose bounded memory bodies and are operator workflows.

## Tradeoffs considered

- **Token bucket vs fixed window:** token bucket gives smoother bursts and is barely more code; preferred. Sliding-window logs are overkill for a demo and add memory growth.
- **In-process vs shared store (Redis):** V1 is single-process over one local disk root by design; an in-process `Map` matches that constraint and avoids a new dependency. Multi-process scaling is explicitly deferred.
- **Optional client API key vs always-required:** making the client key optional is a small loosening, but the server remains authoritative via `401`. Avoids a parallel "demo client" code path.
- **Persisted counters vs ephemeral:** ephemeral counters reset on restart, which is fine for a demo brain that is itself resettable and avoids new canonical/derived state to maintain.
- **New `/sandbox` route vs extending `/status`:** extending status keeps the route surface small (less bloat); only add a dedicated route if counters would otherwise leak into the public unauthenticated status response.

## Changelog

- Update `tasks/CHANGELOG.md` when this task list is completed and archived.
