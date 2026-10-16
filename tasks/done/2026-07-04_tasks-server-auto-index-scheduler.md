# Server Auto-Index Scheduler

## Completion Summary

Completed on 2026-07-04. Added a server-local auto-index scheduler enabled by default for `jumpybrain serve`, stale-only 5-minute ticks, shared manual/scheduled index runner, overlap/race handling, deterministic tests, and updated remote deployment docs. Validation passed with `npm test` and `npm run cli:pack`.

## Goal

Make remote/global jumpyBrain memory reindex itself automatically in the server process so users do not need Coolify scheduled jobs, OS cron, or manual `jumpybrain index --target-url ...` after remote writes.

## Notes

- Current remote writes append Markdown and mark `.jumpybrain/remote/index-state.json` as `stale: true`.
- Current remote indexing works through authenticated `POST /memories/all/index`, but relying on Coolify/control-server cron caused deployment friction and timeouts.
- The app already has everything needed server-side: `indexMemory(root)` and `markRemoteIndexFresh(...)`.
- This should be **server-only** behavior for `jumpybrain serve`; do not change local CLI `remember` behavior.
- Auto-index should be **enabled by default**, **fixed at 5 minutes**, and **only run when stale**.
- No faster retry/backoff loop: if indexing fails, log/report it and try again on the next 5-minute tick.
- Keep this small and boring. Single-node server assumption still holds for V1.

## Decisions

- Default: enabled for the remote HTTP server.
- Trigger: fixed interval tick every 5 minutes.
- Condition: read remote index state; run only if `stale: true`.
- Retry policy: no immediate retries; next scheduled tick will try again if still stale.
- Integration: call runtime indexing directly inside the server process, not via public HTTP.
- Concurrency: scheduler and manual `POST /memories/all/index` must not overlap indexing work.
- Write/index race behavior: if a write updates `lastWriteAt` during an index run, the runner preserves `stale: true` after marking indexed metadata so the next tick can rebuild again.
- Configuration: no public env var or CLI flag for V1. Internal test hooks are acceptable if needed.

## Relevant Files

- `src/server/auto-index.ts` - Server-local auto-index scheduler, index runner, fixed 5-minute interval, and overlap guard.
- `src/server/http.ts` - Current HTTP routes, including manual `POST /memories/all/index` and write paths that mark index stale.
- `src/server/index.ts` - Server module barrel and runtime boundary for exported server helpers.
- `src/server/state.ts` - Remote index stale/fresh state helpers.
- `src/retrieval/retriever.ts` - Exposes `indexMemory(root)` via runtime/server imports.
- `src/cli.ts` - `jumpybrain serve` startup and shutdown behavior.
- `src/types.ts` - Add scheduler result/types only if needed.
- `test/server-auto-index.test.js` - Deterministic scheduler unit and server integration tests.
- `test/server-http.test.js` - Deterministic HTTP/server behavior tests to extend.
- `docs/cloud-shared-memory.md` - Update remote index stale-state docs to mention automatic server reindexing.
- `docs/agent-workflows.md` - Remove or soften manual remote-index-after-write guidance.
- `docs/coolify-deploy.md` - Replace Coolify scheduled-job guidance with server auto-index behavior.
- `docs/vps-deploy.md` - Replace cron/systemd timer guidance with server auto-index behavior.
- `tasks/todo/tasks-general-file-logging-and-checklogs.md` - Related future logging work; auto-index failures should eventually use the file logger when available.
- `tasks/CHANGELOG.md` - Update only when implementation is complete.
- `scripts/local-pack-manifest.mjs` - Ensure the new server auto-index runtime entrypoint is included in packed local CLI validation.
- `test/local-pack-scripts.test.js` - Manifest coverage for the new server auto-index file.

## Tasks

- [x] 1.0 Design the scheduler boundary
  - [x] 1.1 Add a small server-local module, e.g. `src/server/auto-index.ts`.
  - [x] 1.2 Export a minimal function such as `startRemoteAutoIndexer({ root, intervalMs, indexNow })` returning `{ stop, tick }` or similar.
  - [x] 1.3 Keep public behavior fixed at 5 minutes; allow internal dependency injection/fake timers only for deterministic tests.
  - [x] 1.4 Ensure timers are `unref()`ed or stopped on server close so tests and shutdowns do not hang.

- [x] 2.0 Implement stale-only indexing
  - [x] 2.1 On each tick, read `.jumpybrain/remote/index-state.json` via existing helpers.
  - [x] 2.2 If state is missing or `stale: true`, decide whether to index; prefer indexing only for explicit stale/missing-derived-state cases that make first recall safer.
  - [x] 2.3 If state is `stale: false`, do nothing.
  - [x] 2.4 When indexing runs, call `indexMemory(root)` directly and then `markRemoteIndexFresh(result.root, result)`.
  - [x] 2.5 If indexing fails, swallow the error after reporting it; never crash the server.

- [x] 3.0 Prevent overlapping index jobs
  - [x] 3.1 Add an in-process index mutex/shared promise so scheduled indexing cannot overlap itself.
  - [x] 3.2 Make manual `POST /memories/all/index` use the same mutex as the scheduler.
  - [x] 3.3 Ensure remote writes can still mark the index stale while an index is running; document the chosen behavior if a write races with indexing.
  - [x] 3.4 Prefer correctness over cleverness: if a write happens during indexing and marks stale afterward, the next tick can reindex.

- [x] 4.0 Wire scheduler into `jumpybrain serve`
  - [x] 4.1 Start the scheduler when the HTTP server starts for a remote server root.
  - [x] 4.2 Stop the scheduler from `StartedJumpyBrainHttpServer.close()`.
  - [x] 4.3 Keep health checks and normal request routing unchanged.
  - [x] 4.4 Do not add env vars or CLI flags in V1.

- [x] 5.0 Add observability without blocking on the logging task
  - [x] 5.1 For now, emit minimal `console.warn`/`console.error` for auto-index failures if the file logger is not implemented yet.
  - [x] 5.2 If `tasks-general-file-logging-and-checklogs.md` is implemented first, route scheduler events through the reusable logger instead.
  - [x] 5.3 Log/report at least: skipped-not-stale, start, success with document count, failure message, and overlap-skipped if applicable.

- [x] 6.0 Test deterministically
  - [x] 6.1 Unit-test scheduler tick behavior with injected fake `readState`, `index`, and `markFresh` functions.
  - [x] 6.2 Test stale state triggers exactly one index call per tick.
  - [x] 6.3 Test fresh state does not index.
  - [x] 6.4 Test failures are swallowed and the next tick can try again.
  - [x] 6.5 Test overlapping ticks do not run concurrent index jobs.
  - [x] 6.6 Add an HTTP/server integration test proving a remote write marks stale and a scheduler tick can make state fresh without calling the HTTP index endpoint.
  - [x] 6.7 Keep tests no-paid-call; use temp memory roots and existing QMD-dependent test patterns only where already accepted.

- [x] 7.0 Update docs and operational guidance
  - [x] 7.1 Update `docs/cloud-shared-memory.md`: remote writes mark stale, and the server auto-indexes stale memory every 5 minutes by default.
  - [x] 7.2 Update `docs/agent-workflows.md`: manual remote index is optional/diagnostic, not required after every write.
  - [x] 7.3 Update `docs/coolify-deploy.md`: remove/soften Coolify cron recommendation and explain no scheduled job is needed.
  - [x] 7.4 Mention manual `POST /memories/all/index` remains available for immediate maintenance.
  - [x] 7.5 Add completion summary to `tasks/CHANGELOG.md` when done.

## Non-Tasks

- Do not add a public logs endpoint.
- Do not add OS cron, Coolify scheduled jobs, or external workers.
- Do not make interval/env configuration public in V1.
- Do not change canonical Markdown format.
- Do not make local CLI `remember` slower or dependent on server scheduler behavior.
