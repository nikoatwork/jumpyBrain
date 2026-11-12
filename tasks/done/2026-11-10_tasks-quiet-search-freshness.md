# Quiet stale-index feedback in Mac search

## Completed — 2026-11-10

Removed repeated maintenance pop-ups from the shared Mac/browser search shell. Quiet freshness/reindex controls, inline query errors and Retry, explicit reindex uncertainty, background fresh-generation adoption and editor-save errors remain. The November 8 feedback is covered in source after v0.3.21; no installation or release was performed.

## Goal

Resolve the November 8 feedback: opening or using search repeatedly should not interrupt the user with index-freshness warnings. Keep useful results and truthful, scoped degraded-search status; preserve host-owned maintenance and authorization.

## Evidence and boundaries

- [Feedback email](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=e3311836-7144-4793-b541-e5983b5ff179), received 2026-11-08, read in full on 2026-11-10. Diagnostic inspection is in progress; do not infer its historical cause from current source.
- Starting snapshot: `b3a6e0499a684179c2d652fc267dddc4650cee70`; clean working tree.
- Markdown remains canonical. Browser observation must not start indexing, download models, or expand remote permissions. Genuine query/save failures keep actionable feedback.
- Scope is implementation, focused tests, Chromium verification, documentation, archive and local commit. No installation, push or release requested.

## Tasks

- [x] 1.0 Establish the failure and smallest useful fix.
  - [x] 1.1 Read feedback, product/architecture/testing/task guidance and prior warning-scope behavior.
  - [x] 1.2 Independently trace search presentation, host maintenance and attached diagnostics; record proven behavior and historical limits.
  - [x] 1.3 Reproduce repeated warnings and choose the behavior contract.
- [x] 2.0 Implement and verify quiet, truthful search.
  - [x] 2.1 Change the owning presentation/lifecycle seam with focused regressions; preserve result navigation, scoped status and failures.
  - [x] 2.2 Build and run affected deterministic checks.
  - [x] 2.3 Verify production browser search/reentry/recovery and editor-error priority with disposable Markdown at desktop/narrow widths.
  - [x] 2.4 Obtain independent code/test review and resolve material findings.
- [x] 3.0 Finalize.
  - [x] 3.1 Update owning docs, feedback index/follow-up, pending release notes and required changelog. No glossary update: no new concept introduced.
  - [x] 3.2 Record tested snapshot, results and limits; archive, repair links and commit scoped changes.

## Relevant files

- `src/adapters/http-server/graph-page.ts` — shared browser composition and maintenance presentation.
- `src/adapters/http-server/search-maintenance.ts` — observational freshness lifecycle.
- `src/adapters/http-server/notes-browser.ts` — search state and recovery controls.
- `scripts/ux-search-warning-scope-smoke.mjs` — production browser warning-scope journey.
- `test/search-maintenance.test.js` — observer cancellation, scope, freshness and adoption.

## Verification

- Adapted production Chromium regression failed against unchanged baseline `dist/` at the first stale Search opening: actual toast source was `search-maintenance`. This reproduces the requested behavior change before rebuilding.
- `npm run build` passed on the implementation snapshot; editor bundle 671,081 bytes minified / 221,862 bytes gzip, optional desktop extensions UI 15,513 / 5,669 bytes.
- `node --test test/search-maintenance.test.js test/notes-browser.test.js test/recent-write-search.test.js test/auto-index-scheduling.test.js`: 99 passed, no failures/skips. Covers serial/scoped status observation, cancellation, fresh-generation adoption, search/navigation/errors, recent-save fallback and host scheduling/retry.
- `node --test --test-name-pattern='host automatically publishes body-only saves and external writes' test/server-auto-index.test.js`: one selected real host/QMD integration test passed. Confirmed automatic body-only save and external-file publication followed by successful searches, without a manual index request.
- `npx --package=playwright node scripts/ux-search-warning-scope-smoke.mjs`: passed all 14 reported checkpoints at 1280/390px, both in the worker run and a primary-agent verification run. Real HTTP/WebSocket editor shell, disposable Markdown, controlled search/status/index responses: stale/failed/unreachable/updating state and repeated entry stay quiet, focus and scoped indicators remain, observation sends no index POST, HTTP 500/503 query Retry works, explicit reindex uncertainty stays visible, copy confirmation is preserved, fresh publication reruns search and results navigate, save errors remain authoritative and canonical sources stay byte-identical.
- The initial rewritten smoke needed a recognition-version acknowledgement in its controlled search packet. Corrected the fixture, reran successfully; no production behavior was changed to accommodate it.
- Independent review found no blocking source or test findings. Two focused read-only investigations covered UI and host maintenance; a separate diagnostic review inspected the attachment. The primary agent implemented the production change and ran build, deterministic/integration checks and the final Chromium verification.
- `git diff --check` and local Markdown reference review passed. Tested source is the starting snapshot plus this task's scoped `graph-page.ts` diff; no production source changed after the successful build. No retrieval-ranking evaluation or broad suite was justified by the presentation change.

## Remaining limits

- The historical HTTP 503 cause remains unconfirmed; this task resolves repeated maintenance presentation, not every possible search-backend failure. Genuine failures retain Retry.
- The Chromium smoke controls index/status responses to exercise states deterministically; separate real host/QMD evidence verifies automatic publication. No native-only boundary changed, so physical Mac/native accessibility, other browser engines, semantic-model latency and arbitrary-corpus performance were not tested.
- Observer freshness/bookkeeping policy, indexing scheduling, remote/read-only permissions and packet metadata are unchanged. The fix is pending release and does not update an installed app.

## Investigation and decision

- The shared shell dispatches a persistent `search-maintenance` warning when observational state is failed/unavailable. Closing Search suspends the observer and resets its state deduplication, so reentry dispatches the same warning again. This is sufficient to explain repeat presentation without proving a backend fault.
- Existing host maintenance activates for the local Mac connection, coalesces quiet writes and periodically reconciles external changes. Search reads deliberately remain nonrepairing; foreground activity does not authorize a new repair job or model download.
- The attached November 8 report was inspected through the read-only attachment API. App/host were 0.3.20 at matching build `b016eba8d71a67d6`. Fourteen distinct server searches returned HTTP 503 in roughly 7.5 seconds; twelve browser requests were aborted. Eighty-two retained events omit 285 others and contain no surviving maintenance/index evidence. These events prove historical search failures, not their cause; mirrored host/gateway/browser records are not independent requests.
- Chosen fix: remove routine maintenance toasts; retain the compact accessible graph indicator, stale-result recovery controls, inline query errors/Retry, explicit reindex failure feedback and local-only fallback labeling. Keep status metadata, observer lifecycle, scheduling and permissions unchanged. Fresh-readiness versus legacy bookkeeping differences are outside this presentation fix.
