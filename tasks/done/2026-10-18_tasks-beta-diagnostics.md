# Useful beta diagnostics and feedback exports

**Finalized 2026-10-18 — complete.** Completed bounded, privacy-limited diagnostic collection and feedback exports with recorded failure/privacy verification. Archived with user approval. Verification below is historical; no implementation checks were rerun for this archival pass.

## Status

Completed on 2026-10-16. Implementation and verification are recorded below; archived on 2026-10-18. Installed runtime/app updates are separate from this source change.

## Goal

Make a beta feedback report useful for diagnosing failed saves, search/index failures, connection problems, and desktop crashes without asking users to find private raw logs. Include a bounded, inspectable diagnostic attachment by default, with an explicit opt-out and user-controlled email delivery.

## Current evidence — 2026-10-16

- `feedback.ts` captures at most 40 tab-local timestamp/category/method/status events, app/browser/OS versions, and view/connection state. Browser errors become a generic failed request event. There are no durations, error codes, stack locations, request correlation, or previous-session history. Reloading loses the history; frequent companion polls can displace the useful events.
- Server logging already records HTTP status/duration/error codes, write outcomes, and indexing events under `.jumpybrain/logs/server-YYYY-MM-DD.log`. It is separate from feedback, and some records contain document IDs and relative filenames. Daily filenames alone do not bound retention or disk use.
- The logging adapter has shallow key/string redaction, truncates formatted fields, and swallows append failures. This is useful infrastructure, not proof that arbitrary nested objects, error stacks, provider output, or raw files are safe to export. Do not attach these files wholesale.
- The native companion has process-output/support logs. Its `server.log` rotates above 5 MB at startup with one previous generation; that is not continuous rotation for a long-running process. Gateway stdout is exclusively native RPC, so diagnostics must never write there.
- Electron currently handles load failures with a dialog but has no structured main-process/renderer-crash diagnostic history.
- Hosted deployment docs explicitly keep raw logs accessible through SSH/admin tooling rather than a public log endpoint. Retain that boundary.

## Scope and defaults

- Implement inside existing adapters/app orchestration. Core stays free of logging, host lifecycle, and support-export dependencies. Diagnostics are disposable operational data, never canonical Markdown or remembered user content.
- No telemetry service, remote upload, email credential, automatic sending, memory/index mutation, or provider execution for collection/export.
- Keep browser event buffers bounded and tab-local. Persist host/server events in private operational storage with bounded retention. Do not add browser draft/content persistence as part of this task.
- Proposed initial host limits: 7 days and 10 MiB total per managed diagnostic store, whichever limit is reached first. Confirm limits against realistic fixture volume before finalizing; exclude externally managed legacy logs from silent deletion.
- Keep the complete generated feedback `.eml` within the Electron host's existing 64 KiB download limit, including message, MIME/base64 overhead, and diagnostics. Prefer failure evidence over routine success/polls; report omissions and truncation explicitly. Larger manual administrator exports, if needed, are a separate explicit workflow.
- Browser-only hosted reports include browser diagnostics. Companion reports may include sanitized diagnostics from the local companion/owned local runtime. Do not fetch shared remote raw logs through the browser or call a hosted API directly from agent tooling; any administrative remote collection must use an explicit supported CLI workflow.

## Tasks

- [x] 1.0 Define a useful, privacy-limited diagnostic contract.
  - [x] 1.1 Inventory current browser, server, gateway, native, Electron, and index failure paths; map each common beta failure to the evidence needed to distinguish it.
  - [x] 1.2 Define versioned event/export schemas: UTC timestamp, severity, component, operation, duration, outcome, stable error code, session/request/operation correlation, and application/runtime/editor build identifiers where available.
  - [x] 1.3 Define allowlisted component metadata and safe error-location representation. Exclude note bodies/titles, queries, raw URLs, document IDs/filenames, absolute paths, profile names, keys, cookies, authorization/bootstrap tokens, and provider input/output from default exports. Use export-local opaque references only when correlation requires them.
  - [x] 1.4 Document unavailable evidence and boundaries: tab reload/crash loses browser-only history; no arbitrary remote/server/native filesystem access; no claim that a generic failure event explains a crash.

- [x] 2.0 Harden collection and storage before expanding coverage.
  - [x] 2.1 Extend/reuse the logging adapter with safe structured event construction. Prevent leaks through nested arrays/objects, stacks/causes, circular values, control characters, huge values, and formatter failures; sanitization must happen before persistence/export as appropriate.
  - [x] 2.2 Add bounded queues/buffers, private file permissions, continuous size/age rotation and owned-file cleanup, plus bounded shutdown flushing. Logging failures must never fail a save or stall shutdown.
  - [x] 2.3 Surface collection/storage failure as a safe diagnostic availability flag/counter; avoid recursive logging and misleading empty-success exports.
  - [x] 2.4 Allocate or strictly validate bounded correlation IDs, propagate them through existing browser/gateway/server request seams, and avoid treating user-supplied identifiers as trusted log text. Preserve authentication, CSP, deadlines, and generation/tab fencing.

- [x] 3.0 Instrument the beta workflows users need help with.
  - [x] 3.1 Browser/editor: typed load/save/create/delete outcomes, confirmed versus unconfirmed writes, conflict/reconciliation states, external-refresh failures, search/index failures, durations/timeouts/aborts, and connection changes. Never record drafts, titles, queries, hashes, or content-bearing exception strings.
  - [x] 3.2 Browser errors: distinguish uncaught exceptions, rejected promises, and editor failures; retain safe build-relative locations/error categories where possible, rather than only a generic failed request. Keep useful failures from being evicted by repetitive successful polling.
  - [x] 3.3 Server/local engine: correlate canonical publication, derived-index outcome, backend deadline/cancellation, startup/shutdown, and readiness failures. Preserve the distinction between a saved note and failed indexing; keep routes thin and domain policy in its existing owners.
  - [x] 3.4 Gateway/native: credential-service availability categories, target connection/forwarding failures, switching/fencing/acknowledgement failures, native bridge loss, child-process termination, and startup/update failures. Never emit credentials or raw RPC frames, and preserve stdout's native-RPC-only contract.
  - [x] 3.5 Electron: safe bootstrap/load categories, renderer termination/unresponsive events, main-process lifecycle failures, and wrapper/runtime version mismatches. Retain bounded prior-session host evidence; exclude crash dumps and arbitrary Chromium error text from default attachments.

- [x] 4.0 Connect sanitized diagnostics to Feedback.
  - [x] 4.1 Add an app-owned bounded support-export operation over explicit host-provided sources. Read only known owned diagnostic data; reject symlinks/path traversal, excessive input, and arbitrary file selection. Read-only collection must not run indexing or mutate memory.
  - [x] 4.2 Expose collection to the companion UI through a narrowly scoped authenticated local seam if needed. Preserve cookie/Origin/session protections and Electron isolation; introduce no public hosted raw-log endpoint or renderer filesystem bridge.
  - [x] 4.3 Build a frozen, versioned attachment merging browser and available local host evidence with source availability, relevant time window, event priority, and explicit truncation/omission counts. Preserve causal ordering and opaque correlation within the export.
  - [x] 4.4 Keep preview/select/copy and include-logs opt-out aligned with exactly what is exported. Explain source coverage in ordinary language. Failed or offline host collection must still allow feedback with the available browser evidence.
  - [x] 4.5 Enforce the complete `.eml` byte cap after UTF-8/MIME encoding; handle worst-case Unicode messages. Keep the mailto fallback truthful about inline logs and client length limits. Verify attachment preparation never sends anything itself.

- [x] 5.0 Prove usefulness, privacy, and failure isolation.
  - [x] 5.1 Use disposable fixtures for network outage, auth expiry, HTTP 412, successful publication followed by index failure, lost save response, backend timeout, switch rejection, native bridge loss, and renderer termination. Each report must distinguish its failure and correlate relevant layers.
  - [x] 5.2 Seed secrets and private content across query/path/header/body, nested values, errors/stacks, malformed inputs, native frames, and bootstrap URLs; assert they never enter default exported diagnostics. Test the persistent-event privacy contract separately from export filtering.
  - [x] 5.3 Verify disk-full/denied writes, corrupt/oversized logs, symlinks, rotation during export, unavailable sources, aborted collection, host restart, and multiple tabs/brains. Logging/export failure cannot lose a draft, cause an extra write, cross an authorization boundary, or hang the app.
  - [x] 5.4 Check storage/event-rate bounds, shutdown deadlines, and feedback-size caps under repeated polling and failure bursts. Run browser/Electron smoke checks with real generated attachments and opt-out, plus relevant suite checks.
  - [x] 5.5 Update logging/browser/companion/Electron owning docs and troubleshooting guidance with actual coverage, storage/retention, export limits, and remaining manual checks. Add glossary language only if new reusable terms emerge. Reassess a changelog highlight when the capability is implemented; no planning-only entry.

## Relevant files

- `src/adapters/http-server/{feedback.ts,graph-page.ts,companion-browser.ts,document-controller.ts,external-document-updates.ts}` — current browser diagnostics and workflow integration.
- `src/adapters/logging/{index.ts,logging.docs.md}` — existing logger and infrastructure boundary.
- `src/adapters/http-server/{index.ts,routes.ts,browser.docs.md,http-server.docs.md}` and `src/app/server-memory/` — HTTP lifecycle, request error mapping, and use-case ownership.
- `integrations/macos-companion/{gateway.mjs,gateway.docs.md,Companion.swift,switch-coordinator.mjs}` — local host, RPC and process/switch lifecycle.
- `integrations/electron/{host.mjs,window.mjs,main.mjs,electron.docs.md}` — isolated desktop wrapper and current download restrictions.
- `test/{logging,feedback,companion-browser,electron-host}.test.js`, `scripts/{feedback,electron}-smoke.mjs` — existing verification to extend.
- `docs/coolify-deploy.md` and `tasks/todo/tasks-public-sandbox-hardening.md` — hosted-log boundary and related rate-limit logging plans; coordinate rather than duplicate.

## Completion criteria

A user can reproduce a common beta failure, open Feedback, inspect a safe report that identifies the failed operation and relevant cause category across available components, and prepare a correctly bounded attachment. Collection survives ordinary host restarts where promised, remains bounded, and never changes save behavior or exposes private content. Unavailable evidence is stated explicitly.


## Implementation and verification

- Schema v1 lives in `src/adapters/diagnostics/`: strict safe event construction, finite codes/operations, canonical timestamps, duration/status, version/build fingerprints and opaque correlation. Final reports remap correlation IDs and omit content-bearing fields entirely.
- Private host stores keep ten 1 MiB segments for at most seven days (whichever bound is reached first), 128 queued writes and 120 buffered events. Normal poll/status/document-read successes coalesce for thirty seconds, with explicit counts; failures and writes remain unsampled. Native lifecycle snapshots retain up to 64 events/64 KiB, favoring failures. Legacy text logs are separate administrator artifacts and excluded from attachments.
- `src/app/diagnostics/` composes explicit host sources with a deadline; no arbitrary path reader or remote raw-log endpoint. Companion collection keeps cookie/Origin/generation/tab fences, scope-bound caching and native-only Electron ingestion. Hosted browsers explicitly report browser-only coverage. The local-server source is the already owned engine, never implicit startup or repair.
- Browser diagnostics distinguish network/auth/conflict/timeout failures, confirmed/unconfirmed saves, derived-index failure after publication, external-refresh failures and safe error categories/locations. Gateway/native/Electron record safe lifecycle/bridge/switch/forwarding/renderer categories. An actual Electron renderer crash/reload was included in a real generated attachment.
- Support preview freezes available evidence; abort/close/opt-out fence late collection. Report budgets and final MIME byte checks retain the existing 64 KiB Electron download limit. Long mailto fallback explicitly sends message only; the EML carries the complete attachment. No email was sent by verification.
- Custom logger injection defaults server diagnostics to memory-only unless an explicit store opts in, preserving existing zero-write embedding/readonly contracts. Default diagnostics reside beneath `.jumpybrain/logs/diagnostics`, preserving existing infrastructure-log exclusions. Test cleanup now drains servers/gateways before removing their temporary roots, and deliberate live derived-state deletion drains diagnostics first.
- Full suite with four concurrent workers passed: **1,037 passed, 0 failed, 1 skipped** (1,038 total; existing provisioned-QMD opt-in skip). After adding healthy-read coalescing, **56 focused tests** and production browser/Electron diagnostic smokes passed. Final default `npm test`: **1,038 passed, 0 failed, 1 skipped** (1,039 total). The final browser smoke committed a real save and deliberately dropped its reply; feedback retained the draft and correctly reported the outcome as unconfirmed. Dedicated Electron crash/restart and native Swift fixture checks also passed.
- Native Swift production fixture compiled and passed menu, safe snapshot bounds/failure-priority/privacy, and 13 malformed/EOF RPC regressions. Keychain CRUD was explicitly skipped; no Keychain prompts or credential changes.
- Reproduce focused coverage with `npm run smoke:diagnostics` after installing the isolated Electron development dependencies on a supported Mac. The dedicated Electron fixture is under `scripts/fixtures/`, outside the packaged desktop app.

## Practical limits

- Browser events are tab-local and disappear on reload. Host history survives normal restarts; abrupt OS/main-process death or a failed final disk write may omit the last event. A readable native snapshot is historical evidence, not proof every crash was captured.
- Host retention is bounded, not a guaranteed seven-day history under every workload. Buffer drops, coalescing, unavailable sources, truncated file reads and report budget omissions are explicit. Native raw/update logs stay outside automated support collection and retain their existing administrator lifecycle.
- Real email clients, physical sleep/login/Keychain/update prompts, and OS-level hard-kill completeness remain manual verification boundaries. No telemetry backend, crash-dump collection, mail credential, installed-app replacement, personal memory change, or remote/team memory write was introduced.
- Other chats are concurrently changing shared desktop/sidebar files. Preserve those edits; this commit includes only the diagnostics work, preserving concurrent desktop/sidebar edits. The installed runtime is unchanged.
