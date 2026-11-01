# Board sidebar pages default off

- [x] Default Show pages in sidebar to false for boards without a saved preference; preserve explicit preferences and disclosure state.
- [x] Update existing browser/native smoke expectations and owning docs; build and run focused verification.
- [x] Record results, archive this list and commit scoped changes.

Scope: repository default only; no installed-app update or saved preference migration.

## Outcome and verification

Completed 2026-11-01 on base `553d75e`. New/unconfigured boards now default to hiding sidebar pages. Explicit stored booleans and disclosure state are preserved. Updated user/module docs, pending release notes and existing browser/native smoke scenarios.

- `npm run build` passed.
- `npx --package=playwright node scripts/board-sidebar-smoke.mjs` passed on retry, including default-off controls/hidden descendants, explicit opt-in, stored choices on reload, cross-tab updates, storage denial and unchanged canonical files. Initial run timed out waiting for a tooltip while the native smoke also ran; the sequential retry passed.
- `node --test test/browser-sidebar.test.js test/companion-browser.test.js test/lexical-bundle.test.js`: 28 passed.
- `git diff --check` passed.
- Supplemental native smoke passed local default/opt-in, navigation and persistence plus read-only remote default/opt-in/opt-out behavior on retry. Both native attempts ended with Electron `UnknownVizError` from screenshot capture; full native relaunch verification is incomplete. No screenshot infrastructure changes were made for this default-only change.

Full suite, installed personal app update, push and release were not performed. Verification used disposable brains/profiles.
