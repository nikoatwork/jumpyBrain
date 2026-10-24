# Desktop sidebar updates

Status: completed; archived 2026-10-24. The original app-only updater shipped in v0.3.4 and was subsequently replaced by the [coordinated Mac/CLI updater](2026-10-22_tasks-unified-mac-cli-update-experience.md) and [inline update control](2026-10-22_tasks-inline-desktop-update-control.md). The decisions and verification below describe the original implementation, including its historical limits.

## Goal

Show software update availability at the bottom-right of the Mac app sidebar, with explicit installation and a separate restart action.

## Decisions

- Work on `feat/sidebar-updates` in an isolated worktree; preserve the original checkout's unfinished work.
- Electron owns updates through a narrow, sender-validated preload bridge. Hosted browsers have no software-install capability.
- Discover published GitHub releases, including the project's numeric 0.x beta releases. Verify the published asset digest and stage a locally built app using existing packaging. Do not change CLI installation or brain data.
- Restart goes through the existing all-tab shutdown/save barrier. A surviving helper installs the staged app transactionally only after authorized process exit.

## Tasks

- [x] Implement release discovery, staged installation, retry, and guarded restart.
- [x] Add the sidebar update icon, availability dot, details, installation progress, and restart action.
- [x] Test release validation, failure/retry, sender checks, save cancellation, handoff, and browser presentation.
- [x] Update owning docs and record verification.

## Verification

- Pre-release full `npm test`: 1,070 passed, one skipped after local dependency installation. The command used a `node@22` path, but release preparation found that path actually invokes Node 26; the earlier runtime label was incorrect. Linked dependencies caused missing bundled-license metadata, and Node 26 runs intermittently exposed QMD timing/cleanup and evidence-date fixture cleanup failures. Release validation uses the official SHA-256-verified Node 22.23.4 binary instead; the evidence-date tests pass independently on that runtime.
- Focused updater/lifecycle regressions after final handoff entrypoint fix: 19 passed, including real detached-helper readiness/cancellation and unsafe archive rejection.
- `node scripts/desktop-updates-smoke.mjs`: real sandboxed Electron window/preload/IPC, bottom-right placement, install/failure/retry, restart cancellation, renderer reload, light/dark, narrow layout, browser-only isolation. Screenshots under `.local-pack/sidebar-update*.png`.
- `npm run cli:pack`: distribution validated with all 172 required paths. Local desktop packaging and deep strict codesign verification succeeded, including the new updater assets.
- Downloaded published 0.3.3, verified its GitHub SHA-256 digest, extracted and prepared a complete signed app using the production staging path. No live application replacement or published release.

## Limits

- The final swap/relaunch uses the existing transactional installer, covered by its migration/rollback tests and handoff ordering tests; the user's installed app was not replaced for end-to-end testing.
- Preparation requires local Mac build tools. Staged readiness currently lasts for the desktop process; quitting without choosing Restart requires preparing again. Abandoned stage directories remain in app user data until removed when no update process is running.
- Genuine Node 22 validation caught an unreferenced-child cancellation wait; the helper is now referenced until cancellation cleanup finishes. The existing real-child regression covers this behavior.
- Published v0.3.4 on 2026-10-22; local tag resolves to `3bbb0f2`. See the [original release notes](../../docs/releases/v0.3.4.md) and [subsequent release QA](releases/v0.3.5.qa.md), which records the earlier publication and replacement of the app-only updater.

## Finalization — 2026-10-24

- Original implementation: `d416e4d`; cancellation cleanup fix: `b60ab5b`. Historical checks above cover that implementation; later updater behavior and installed-fixture verification belong to the successor archives linked above.
- Reviewed repository snapshot `86dc87b`; all required original tasks are complete. Removed the obsolete archival-preference hold under the [current task workflow](../../docs/task-workflow.md).
- Finalization changes task documentation only. Archive links and diff whitespace were checked; no new runtime tests, installation or release was performed. Historical limitations remain recorded rather than being treated as current updater policy.
