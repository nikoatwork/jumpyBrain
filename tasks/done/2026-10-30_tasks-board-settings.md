# Board management in Settings

## Outcome

Implemented compact Settings → Boards management with active/settled renaming, a visible pressed-state settlement toggle, and confirmed board-only deletion. Settled/unavailable board notices link to the settings list. No version bump, installation or release.

## Request

Check the settled-board recovery path and provide a compact board list with rename, delete and settle/restore controls.

## Findings

The current source already includes Settings → Boards with open and Settle/Restore actions. Rename is only available on active board headings; deletion is missing. The settled-board notice is plain text. Installed-app parity has not been checked.

## Tasks

- [x] Add compact accessible management rows, rename for active/settled boards, settle toggle, and explicit delete confirmation that preserves notes.
- [x] Link the settled notice to Boards settings; preserve scope/revision guards and drafts across refresh/failure.
- [x] Verify against the real disposable gateway, including persistence, conflicts, cancellation and narrow layouts; run relevant regressions.
- [x] Update docs/release notes, archive and commit only this task's changes.

## Scope

Existing board-card preview edits belong to separate work and must remain intact.

## Verification

Tested the scoped working tree on top of `2391bec` (which finalized the independent board-card preview work):

- `npm run build` — passed.
- `node --test test/companion-browser.test.js test/collections.test.js test/browser-page-navigation.test.js test/browser-theme.test.js` — 46 passed.
- `npx --package=playwright node scripts/board-settings-smoke.mjs` — passed against a disposable real gateway: recovery navigation, rename in both states, input/caret/focus preservation, invalid/cancelled names, conflict retry, toggle state, confirmation/cancellation, failed deletion retry, surviving canonical bytes/memberships, reload and empty state.
- `npx --package=playwright node scripts/boards-smoke.mjs` — passed the existing creation, note action, drag/keyboard movement, previews, retries, read-only and brain-switch regressions.
- `npx --package=playwright node scripts/companion-browser-smoke.mjs` — passed settings navigation, session/brain fencing, two-tab save barriers and editor regressions.
- Captured 1280/390/320px light/dark layouts in `/tmp/jumpybrain-board-settings-qa`; inspected desktop and narrow list/confirmation captures. Geometry assertions passed with no horizontal overflow.
- Fixed the collection test fixture cleanup order: close the gateway before removing its directory, avoiding an observed diagnostics `ENOTEMPTY` cleanup race. An interim test invocation ran before its build completed; the post-build run above passed.
- `git diff --check` — passed.

## Remaining limits

The installed Mac app was not inspected or updated; the source already contained basic Settings → Boards before this change. No claim is made about which build the user was running. Native Electron, physical touch and assistive technology were not separately exercised in this task.
