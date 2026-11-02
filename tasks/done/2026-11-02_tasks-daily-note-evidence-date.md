# Daily-note evidence dates

Status: complete, 2026-11-02. Focused owner for [feedback increment 4](../todo/tasks-feedback-independent-increments.md).

## Goal and priority

Fix the P1 correctness gap where explicit daily creation chooses a dated title but omits canonical evidence `date`, excluding the note from date-bounded recall and using writing-time fallback in dream windows. The recorded P0 implementations are complete; remaining launch-report validation needs an unavailable matching macOS environment. This bounded data-correctness fix can be implemented and verified locally before the separate retrieval experiments.

## Contract

- Validated `dailyDate` becomes the date-only canonical `date`; it represents the selected browser-local calendar day, independent of server timezone and writing time.
- A supplied `date` must exactly equal `dailyDate`; other dates or timestamp representations are rejected before publication or replay-record creation. General evidence-date validation remains unchanged.
- Preserve daily titles/suffixes, IDs, `type: note`, prompt, deferred indexing and idempotent retries. Replay does not migrate an older saved note.
- Ordinary creation stays undated when `date` is omitted. No historical backfill or inference from titles, filenames or creation timestamps.

## Tasks

- [x] 1. Reproduce the missing date and add meaningful regressions for creation, conflicting dates, retry and ordinary-note behavior.
- [x] 2. Propagate the validated date and verify temporal recall, dream windows, local-midnight/timezone boundaries and multiple captures.
- [x] 3. Run relevant checks and repository validation; record the exact snapshot, results and remaining limits.
- [x] 4. Update owning docs, pending notes and changelog; archive this focused task and commit scoped changes under [the task workflow](../../docs/task-workflow.md).

## Relevant files

- `src/app/server-memory/daily-note.ts` and `server-memory.docs.md` — daily validation/allocation inside idempotent creation.
- `test/server-daily-note.test.js`, `test/daily-notes-browser.test.js` — canonical HTTP creation and browser-local calendar selection.
- `docs/memory-format.md`, `docs/shared-memory-protocol.md`, `src/adapters/http-server/browser.docs.md`, `tasks/todo/tasks-feedback-independent-increments.md`, `tasks/todo/release-next.md`, `tasks/CHANGELOG.md` — contract and delivery records.

## Verification and limits

- Reviewed product vision, architecture, task workflow, glossary and affected app/core docs. Bounded local memory recall returned no relevant passages. Starting snapshot: `0897f33` on `master`, clean worktree.
- Before the fix, the regression run failed on missing canonical `date` and accepted conflicting dates (8 passed, 2 failed), reproducing both defects.
- After the fix, the focused daily HTTP/browser suites pass 25/25. Coverage includes both supported year endpoints, leap day, multiple captures, canonical readback, identical/conflicting supplied dates, validation before filesystem/replay writes, unchanged ordinary undated creation and restart/replay byte preservation. Separate Node subprocesses in `Pacific/Kiritimati` and `America/Los_Angeles` verify actual local-midnight and year boundaries using the production browser capture function.
- Local app and authenticated hosted reads return exactly the selected day's two new daily notes for date-bounded recall and stateless dream windows, excluding the next day's note and the ordinary undated note. Dream files carry `dateBasis: date` and `dateConfidence: declared`. This integration uses the deterministic QMD lifecycle fixture with real app indexing/retrieval policy; it does not measure semantic model quality or a deployed VPS.
- Tested code/test diff SHA-256 over base `0897f33`: `fb0d37882d5bfea873161cded58044976d13da69301c85bc8cc44ea5c4b5dd34` (`git diff -- src/app/server-memory/daily-note.ts test/server-daily-note.test.js test/daily-notes-browser.test.js | shasum -a 256`).
- Full `npm test` (including build), Node v26.7.0 on macOS ARM64: 1,851 tests, 1,849 passed, two skipped, zero failures, 104.312 seconds. Architecture boundaries and actual distribution/package budgets passed. Log retained locally at `/tmp/jumpybrain-daily-evidence-date-tests.log`; no fixtures or raw logs are added to the package.
- `git diff --check` and added/modified relative Markdown-link validation passed. A full-file link scan also found the pre-existing changelog reference to missing `tasks/todo/tasks-page-reference-manual-qa.md`; this unrelated historical link is unchanged. Owning app/browser docs, memory format, HTTP protocol and pending release notes now describe the delivered date contract; the feedback parent remains active for its other independent units.
- Limits: no real-model relevance benchmark, deployed hosted service, packaged Mac UI or additional OS was tested for this increment. The browser function runs in isolated Node timezone subprocesses; canonical HTTP/app integration uses disposable roots. Existing daily notes, including any replay from before this change, remain as originally saved.
- No installation, release, push, private-memory write or historical migration is authorized by this task.
