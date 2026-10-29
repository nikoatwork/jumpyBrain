# Add notes to boards

## Scope

Expose Add to board in the note's top-right action card. Choose an active board and column, preserving the open draft and Markdown. Board columns say Add note and reuse existing note search. One membership operation prevents duplicates and retains scope/revision protection.

## Tasks

- [x] Implement both entry points and guarded picker behavior.
- [x] Verify search, note action, duplicates, archived boards, errors and layout.
- [x] Update docs, archive and commit.

## Outcome and verification — 2026-10-29

Completed against `fe30c94` plus this scoped change. Preserved the concurrent, separately committed connection-settings redesign. No installation, push or release.

- Added a compact Add to board action to the top-right note card with active-board/column selection, existing-membership indicators and empty/error states. It preserves the current note/draft and restores focus on close.
- Renamed board actions to Add note, retaining the shared search backend and idempotent note creation; existing memberships are marked Added. Both surfaces share the same duplicate-safe membership operation and existing revision/scope guards.
- Final `npm run build` passed; 42 targeted companion/collections/note-workspace/architecture tests passed.
- Final real gateway/browser smoke passed: indexed existing-note search, note creation, drag/select moves, note/Back, settle/restore/reload, note-action column choice, duplicate prevention, archived-board exclusion, conflict retry, immutable canonical content and an unsaved draft retained while note writes were blocked.
- Final native Electron smoke passed, covering existing board, editor, onboarding, save/close and sandbox regressions.
- Inspected wide action-card and narrow dark chooser captures under `/tmp/jumpybrain-boards-qa/`; no horizontal overflow. Source search-return test uses the DOM option disabled property because Playwright's generic disabled query did not report it accurately in this fixture.
- Whitespace and staged privacy guards passed.

## Limits

Personal Mac board configuration remains separate from Markdown. No new public API or hosted board support. Native regression used disposable fixtures, not the installed personal app. Physical assistive technology and IME were not tested. The complete repository test suite was not repeated for this focused UI change; relevant tests, production browser integration and native smoke passed.
