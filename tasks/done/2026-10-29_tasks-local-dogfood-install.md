# Local candidate installation before release

## Goal
Install committed development builds of the Mac app and CLI on this machine against the existing personal brain, without publishing. Keep a stable candidate for normal use before release, usually about a day, with owner judgment for shorter tests.

## Decisions
- Manual installation from this checkout's committed HEAD; no nightly replacement during a test window.
- Snapshot tracked committed files, excluding dirty/untracked work and local credentials. Preserve installed source/ref, integrations, settings and brain selection.
- Reuse the journaled app/CLI updater transaction and normal save-aware Quit. Retain the previous software for explicit rollback.
- Record commit/install time and verify matching app/runtime/CLI; elapsed time is not evidence of actual use.

## Tasks
- [x] Add install/status/rollback commands and focused safety checks.
- [x] Document the command and flexible pre-release real-brain check.
- [x] Exercise focused tests, install on this Mac and verify the existing brain.
- [x] Record evidence/limits, archive and commit scoped changes.

## Outcome and verification

Completed 2026-10-29. Added `dogfood:install`, `dogfood:status` and `dogfood:rollback`, plus a flexible real-use guideline in the install/release documentation. No nightly schedule, public version bump, push or release was made. Pending public release notes are unchanged by this maintainer tooling task.

- Installed runtime snapshot: `087bd51901ab4eb27a64ad4fdd3f6bafdf0062ac`, base version 0.3.12; candidate installation verified at 2026-10-29T19:46:06Z. The later tooling/docs commit does not change this runtime snapshot. Unrelated unfinished sidebar work was excluded and preserved.
- macOS 15.7.7 arm64, Node 26.7.0, QMD 2.8.3. Fresh isolated `npm ci`, runtime/editor build, Electron packaging and codesign verification passed.
- `node --test test/dogfood-local.test.js`: 3 passed (committed snapshot isolation, component mismatch detection, agent Electron environment handling).
- `python3 -B integrations/electron/test_update_transaction.py`: 6 passed, including interruption recovery, foreign-path rejection, component rollback and preserved policy/data fixtures.
- Live manual candidate installation, software rollback to the previous release and candidate reinstallation passed on this Mac. Doctor, staged/installed native readiness, authenticated app startup, current candidate status and bounded CLI recall passed.
- Authenticated active app profile and CLI manifest both retain the existing personal memory folder. Source/ref policy, integrations and CLI configuration path match the retained previous manifest.
- Initial app launch inherited the agent's `ELECTRON_RUN_AS_NODE=1` and did not start a GUI. The launcher now removes that variable; regression coverage and subsequent rollback/reinstall launch checks passed.
- Private logs: `/tmp/jumpybrain-dogfood-install.log`, `/tmp/jumpybrain-dogfood-rollback.log`, `/tmp/jumpybrain-dogfood-install-verified.log`. Installed receipt and retained previous software live under `~/.jumpybrain/dogfood/`.

## Remaining limits

The real-use window has only started; no 24-hour experience or release approval is claimed. Automated fault tests use disposable fixtures, not personal notes. No full release suite, Intel run, nightly scheduler or automatic pruning was performed. Rollback restores software and install metadata only, not notes/indexes/preferences. Interrupted installs with unsuccessful recovery require inspection of the retained journal and lock.
