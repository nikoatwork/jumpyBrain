# General File Logging and Checklogs

## Completion Summary

Completed on 2026-07-04. Added a reusable <=100-line file logger, wired compact server request/operation logs into remote HTTP endpoints and auto-index events, added deterministic logger/server tests, updated deployment docs, and added a local gitignored SSH log helper. Validation passed with `npm test`, `npm run cli:pack`, and a local server smoke test that wrote `.jumpybrain/logs/server-YYYY-MM-DD.log`.

## Goal

Add a small reusable logging utility for jumpyBrain that writes compact human-readable production logs to files, then wire it into HTTP/server operations so production behavior can be inspected without relying on Docker/Coolify logs.

## Notes

- First version should be general enough for server, CLI, and runtime callers, but only needs to be wired into server/HTTP paths initially.
- Keep the logger tight: target <=100 lines for the core utility, excluding tests/types/docs if needed.
- Logs should be file-backed under the memory root, e.g. `.jumpybrain/logs/`, because Markdown memory remains canonical and `.jumpybrain/` is derived/support state.
- Use compact human-readable lines, not JSONL.
- V1 access is SSH/file-only. Do not add a developer logs HTTP endpoint yet.
- Add a local `.gitignored` checklogs helper script for this machine so we can fetch/tail production logs with one command/prompt.
- More operational detail is preferred, but avoid logging API keys/secrets by default even if the user has not requested a strict privacy mode.

## Decisions

- Log sink: files only, under `.jumpybrain/logs/`.
- Log format: compact human-readable text lines.
- Production access: SSH/checklogs helper only; no authenticated `/developer/logs` endpoint in V1.
- Initial wiring: HTTP/server endpoints and meaningful operation events such as index rebuild results, writes, request status, duration, and failures.

## Relevant Files

- `src/logging/index.ts` - Reusable file logger, compact line formatter, and secret redaction.
- `src/server/http.ts` - Server request/operation logging integration for HTTP requests, writes, index rebuilds, auth/validation/routing failures, and auto-index events.
- `src/server/index.ts` - Server boundary that exports server helpers.
- `scripts/check-jumpybrain-logs.local.sh` - Gitignored local SSH helper to tail production server log files from this machine.
- `.gitignore` - Ignores local helper scripts under `scripts/*.local.sh`.
- `scripts/local-pack-manifest.mjs` - Includes the logging runtime entrypoint in local pack validation.
- `test/logging.test.js` - Deterministic formatter/redaction and swallowed-write-failure tests.
- `test/server-http.test.js` - Deterministic HTTP logging tests.
- `test/local-pack-scripts.test.js` - Manifest coverage for logging runtime files.
- `docs/cloud-shared-memory.md` - Documents server log location and SSH-only access model.
- `docs/coolify-deploy.md` - Documents Coolify log inspection path.
- `docs/vps-deploy.md` - Documents direct VPS log inspection path.
- `tasks/CHANGELOG.md` - Completion summary.

## Tasks

- [x] 1.0 Design the tiny reusable logger surface
  - [x] 1.1 Choose module location, likely `src/logging/` or `src/support/logging/`, without importing HTTP/server code from lower layers.
  - [x] 1.2 Define a minimal API such as `createFileLogger({ root, name })`, `logger.info(event, details)`, `logger.error(event, details)`.
  - [x] 1.3 Keep the core implementation <=100 lines and dependency-free.
  - [x] 1.4 Ensure logger failures never break user requests; logging should be best-effort.

- [x] 2.0 Implement file-backed compact logs
  - [x] 2.1 Write logs under `<memory-root>/.jumpybrain/logs/` with a stable file naming scheme, e.g. `server-YYYY-MM-DD.log`.
  - [x] 2.2 Format each line with timestamp, level, event, and compact key=value details.
  - [x] 2.3 Sanitize obvious secrets by default: authorization headers, API keys, bearer tokens, and raw request bodies.
  - [x] 2.4 Include useful operational details where safe: method, path, status, duration_ms, error_code, documents indexed, created file path, stale/fresh index state.

- [x] 3.0 Wire logging into HTTP/server operations
  - [x] 3.1 Log one line per HTTP request with method, path, status, duration, and route outcome.
  - [x] 3.2 Log index rebuild start/success/failure with document count and elapsed time.
  - [x] 3.3 Log note/wrapup write success with type, resulting relative file path, idempotency outcome, and stale-index state.
  - [x] 3.4 Log validation/auth/routing failures with stable error codes but no API keys or request bodies.
  - [x] 3.5 Avoid duplicate noisy logs for health checks unless a debug option is enabled.

- [x] 4.0 Add deterministic tests
  - [x] 4.1 Unit-test line formatting and secret redaction without relying on wall-clock exactness.
  - [x] 4.2 HTTP-test that status/index/write failures and successes create expected log lines under a temp memory root.
  - [x] 4.3 Test that logging write failures are swallowed and do not change endpoint responses.
  - [x] 4.4 Keep tests no-paid-call and avoid external network.

- [x] 5.0 Add local SSH checklogs helper
  - [x] 5.1 Add a `.gitignored` local script such as `scripts/checklogs.local.sh` or `tasks/local/check-jumpybrain-logs.sh` for this machine.
  - [x] 5.2 Script should SSH to the current jumpyBrain VPS, find/tail `.jumpybrain/logs/server-*.log`, and support a simple tail count argument.
  - [x] 5.3 Document the script path in this task list and keep host/key specifics out of committed docs unless already public operational notes.
  - [x] 5.4 If placing the script under tracked directories, add a precise `.gitignore` entry for it.

- [x] 6.0 Document operations
  - [x] 6.1 Update deployment docs with the log directory and SSH-only access model.
  - [x] 6.2 Document the rejected V1 logs API endpoint and when it might be added later.
  - [x] 6.3 Update `tasks/CHANGELOG.md` only when implementation is complete or the task is archived.

## Non-Tasks

- Do not add a developer logs HTTP endpoint in this version.
- Do not log raw memory note bodies, API keys, bearer tokens, or full request bodies.
- Do not introduce an external logging service or database.
