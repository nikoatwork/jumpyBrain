# macOS menu-bar updates

## Completion

Implemented and verified on 2026-09-27. The menu now offers **Update jumpyBrain…**, **Check for Updates**, and an availability indicator. This completes the follow-up to [Unified installed updates](2026-09-27_tasks-unified-installed-updates.md). Personal deployment is separate and has not been performed.

## Decisions / scope

- Clicking Update authorizes shutdown, update, and successful relaunch. User explicitly requested **no save/quit confirmation** and accepted possible loss of unsaved/in-flight edits. Ordinary Quit/Restart behavior is unchanged.
- Chrome and its tabs stay open and are not automatically reloaded. Saving is unavailable while the server is stopped; no autosave coordination was added.
- Reuse the managed installation’s CLI updater and source/ref. Existing ownership, companion/installer locks, replacement, and rollback policies remain authoritative.
- Terminal owns the independent runner and displays progress/errors. Its copied helper lives outside replacement paths; it does not inherit server credentials or the companion lock.
- Availability is informational, not automatic installation. Compare Git revisions rather than package versions. Support public HTTPS sources with matching installed origin, unambiguous branches/tags, and matching full pinned commits. Unsupported/private/local-source installs, absent provenance, offline failures, and ambiguous refs show unknown; the Update button remains usable.
- Checks run asynchronously at startup, every six hours, or on demand. Git subprocesses are bounded/noninteractive; no update framework or npm dependency added.
- The personal installation was not replaced, stopped, or restarted. One-time installation of this new companion version still requires deployment approval; older companions cannot show a newly added menu item until updated.

## Completed tasks

- [x] 1.0 Add the menu action and safe update handoff.
  - [x] 1.1 Add Update, prevent duplicate clicks, and disable conflicting actions during handoff.
  - [x] 1.2 Prepare a private, independent Terminal runner targeting the correct installation with an explicit environment.
  - [x] 1.3 Bound the entire launch handshake; require authorization plus live PID/expiry acknowledgment before confirmation-free shutdown. Runner waits for actual parent exit before invoking the CLI.
  - [x] 1.4 Reopen only after the whole updater succeeds. Preserve output/logs/results on failure and remove executable handoff files after completion.
- [x] 2.0 Add lightweight update availability.
  - [x] 2.1 Validate installed manifest/origin and compare the recorded ref with installed Git HEAD; use the CLI's existing default only when ref is absent.
  - [x] 2.2 Check off the UI thread at startup, six-hour intervals, and on demand with timeouts and no credential prompts.
  - [x] 2.3 Show Update available / Up to date / unable to check, retaining the Update action in every state.
- [x] 3.0 Verify and document.
  - [x] 3.1 Test authorization/exit gating, duplicate claims, timeouts, cancellation after acknowledgment, custom/quoted paths, update/relaunch ordering, spawn/updater failures, environment isolation, and cleanup. Existing updater suites cover lock contention and paired rollback.
  - [x] 3.2 Test unchanged package version with differing revisions, branches/tags/pins, ambiguous refs, offline/timeouts, missing/mismatched provenance, and unsupported sources.
  - [x] 3.3 Verify native compilation, existing server lifecycle, and real disposable LaunchAgent → Terminal → runner survival/relaunch/failure/cancellation.
  - [x] 3.4 Pass full tests and package validation; update app/install docs and package resource checks.
  - [x] 3.5 Finalize this follow-up and the completed unified-update task; record a single completed user-facing changelog highlight.

## Review findings / corrections

- A ready file alone could survive runner cancellation and incorrectly authorize app shutdown. Added live PID/expiry acknowledgment, deadline-first polling, cancellation revocation, and a final check before termination.
- Cancellation initially left acknowledgment valid until the next runner poll. Signal handling now synchronously marks cancellation and removes ready/ack markers. The native cancellation regression proves the original app remains alive and the CLI is not called.
- Terminal startup itself is covered by the handoff deadline; callbacks from expired attempts are ignored. Failed handoffs reset misleading check status.

## Verification / limits

- `npm test`: **398 passed**, including the existing Python transaction suite and 31 new checker/runner tests.
- `npm run cli:pack`: **128 required CLI/runtime files** verified, including both bundled helpers; rerun after final helper fixes.
- Native `install.py --build-only` succeeded. `smoke.py` passed authenticated health/search, duplicate/busy-port refusal, shutdown, orphan cleanup, and unchanged disposable Markdown.
- `python3 -B integrations/macos-companion/smoke_menu_update.py` passed success, failure, and cancellation-after-ack through real LaunchAgent/Terminal/native shutdown. Unique fixture bundle IDs prevented touching the personal app. Disposable jobs/processes/files were cleaned.
- Menu smoke invokes the production action programmatically from an instrumented startup copy, not a physical click. Its CLI is inert; existing updater integration tests separately exercise real installer transactions. Cancellation emits SIGTERM synchronously in a copied helper, not by closing Terminal. Logout/login and live HTTPS/private-source authentication were not exercised.
- Completed fixture Terminal windows may remain; no existing Terminal windows were controlled. No personal notes, credentials, runtime, app, or login entries were modified.
- `git diff --check` passed. Build-only fixture bundles were removed after testing.

## Relevant files

- `integrations/macos-companion/Companion.swift`, `install.py`, `README.md` — native menu/lifecycle, bundled resources, user contract.
- `integrations/macos-companion/menu-update.mjs`, `update-check.mjs` — independent handoff and read-only availability checker.
- `integrations/macos-companion/smoke_menu_update.py` — disposable native handoff regression.
- `test/macos-companion-menu.test.js`, `test/macos-companion-check.test.js` — runner/checker regressions.
- `scripts/local-pack-manifest.mjs`, `docs/install.md` — package completeness and installation/update workflow.
