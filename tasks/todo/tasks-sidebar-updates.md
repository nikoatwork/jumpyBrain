# Desktop sidebar updates

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

- Full `npm test` under Node 22: 1,070 passed, one skipped. The first run under Node 26 with linked dependencies exposed existing QMD timing/cleanup failures and missing bundled-license metadata; local `npm ci` plus Node 22 produced the clean run.
- Focused updater/lifecycle regressions after final handoff entrypoint fix: 19 passed, including real detached-helper readiness/cancellation and unsafe archive rejection.
- `node scripts/desktop-updates-smoke.mjs`: real sandboxed Electron window/preload/IPC, bottom-right placement, install/failure/retry, restart cancellation, renderer reload, light/dark, narrow layout, browser-only isolation. Screenshots under `.local-pack/sidebar-update*.png`.
- `npm run cli:pack`: distribution validated with all 172 required paths. Local desktop packaging and deep strict codesign verification succeeded, including the new updater assets.
- Downloaded published 0.3.3, verified its GitHub SHA-256 digest, extracted and prepared a complete signed app using the production staging path. No live application replacement or published release.

## Limits

- The final swap/relaunch uses the existing transactional installer, covered by its migration/rollback tests and handoff ordering tests; the user's installed app was not replaced for end-to-end testing.
- Preparation requires local Mac build tools. Staged readiness currently lasts for the desktop process; quitting without choosing Restart requires preparing again. Abandoned stage directories remain in app user data until removed when no update process is running.
- Publication authorized on 2026-10-22 as patch release 0.3.4 through the full release workflow. See `docs/releases/v0.3.4.md`; this task list remains here pending archival preference.
