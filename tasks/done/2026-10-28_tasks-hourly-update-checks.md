# Hourly desktop update checks

Status: completed 2026-10-28. The desktop app now checks for releases hourly without requiring an app restart. Download and relaunch remain explicit.

## Goal

Discover newly published releases every hour while the Mac app stays running, including with its window closed. Keep download/restart explicit and preserve pending updates/recovery.

## Tasks

- [x] Add an app-owned hourly timer and quiet, serialized release checks.
- [x] Verify refresh, network retry, pending-operation protection and timer cleanup with deterministic fixtures.
- [x] Update owning docs/release notes, record results and archive/commit the scoped change.

## Outcome

- One main-process timer runs every 3,600,000 ms after normal startup, independently of editor windows and local service health. It skips quit attempts, resumes after a canceled quit and is cleared on successful shutdown. CLI-only and startup-recovery flows do not start it.
- Background discovery refreshes current/available states and recovers failed startup/manual discovery. Offline checks preserve the previous offer and retry on the next tick without adding a notification or hiding the icon.
- Active preparation, readiness, installation, recovery and preparation errors retain their selected release/actions. All discovery shares the existing operation lock; explicit actions arriving during a quiet poll wait and then run. No automatic download, restart or installation was added.
- Updated the desktop boundary, install guide and pending release notes.

## Verification

- Tested snapshot: `df3611f` plus this task's scoped implementation/tests/docs.
- `node --test test/desktop-updater.test.js test/desktop-lifecycle.test.js test/desktop-startup-recovery.test.js`: 40 passed, zero failures/skips, including existing Python archive/recovery and desktop-installation checks.
- Added deterministic scheduler checks for the exact hourly interval, non-blocking timer, shutdown gating, canceled-quit resumption and disposal. Updater fixtures cover discovering a later release while running, retrying an offline startup, retaining an available offer offline, refreshing it again, coalescing duplicate polls and retaining explicit actions during a poll. Existing pending-state tests now exercise background checks too.
- `node --check integrations/electron/application.mjs` and `git diff --check` passed.
- Limits: mocked HTTP and worker spawning with disposable homes; the timer was checked through its injected scheduler rather than waiting an actual hour. No packaged-app GUI/sleep-wake or live release installation was exercised. No user installation, public release or push was performed; the running installed app receives this behavior through a future release/update.
