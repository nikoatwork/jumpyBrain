# Release v0.3.15

Requested 2026-10-31: “push new version. no need to retest”, immediately after the default-on sidebar change and publication of v0.3.14 in this conversation. This authorizes the additional same-day patch and reuse of completed checks. No test reruns or new personal-use window; the release script has no skip-test flag, so execute its version/package/commit/tag/atomic-push/publication steps directly without changing the script.

- [x] Check clean master, latest published release, fetched remote history, release notes and live feedback.
- [x] Align all four version manifests/lockfiles, build and validate distribution (packaging, not a test rerun).
- [x] Commit/tag, push and publish beta with exact notes and artifact.
- [x] Verify public versions/tag/notes/digest; archive notes and QA, clear queue, commit/push bookkeeping.

## Scope and reused evidence

Implementation `f9c9900`, based on published v0.3.14. Only default-enabled board trees and matching Boards Settings icon are newly shipped. Explicit opt-outs/collapse choices are preserved. Reuse [completed implementation checks](2026-10-31_tasks-board-sidebar-default.md): build, 28 focused tests, populated responsive browser tree smoke, board behavior smoke, native Mac local/read-only remote/relaunch and visual inspection. Prior full suite passed 1,524 tests with one optional skip for v0.3.14; not claimed rerun for v0.3.15. No new installation or physical accessibility check.

## Inbox review

Checked `2026-10-31T20:25:05.879Z`: full received/non-spam inbox, complete one page, 21 scanned, two delivery tests excluded, 19 genuine messages from October 20–31. No new messages since v0.3.14 review. Reuse its full-body triage: folder navigation addressed; installation/preflight, Docker build context, scoped credentials/deployment guidance, cross-version signing, and small editor requests remain deferred. No replies, synthetic tests or attachment downloads; no private message text committed.

## Outcome

Published and verified at 2026-10-31T20:25:44Z, release commit `d706b6c`. Exact notes archived, pending queue cleared. See [QA](releases/v0.3.15.qa.md) and [published notes](releases/v0.3.15.md). No tests rerun; packaging and downloaded artifact verification passed. The recorded dogfood candidate is no longer current across all installed components; no new personal-use claim or installation.
