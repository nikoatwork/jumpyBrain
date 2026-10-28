# Formatting toolbar spacing and order

Completed 2026-10-28. Formatting controls align with the note column and use consistent targets and spacing. Their DOM/keyboard order now follows text styles, inline formatting, then block/reference insertion; related controls wrap as groups.

## Scope

Clean up the note formatting controls shown in the user's screenshot. Preserve the earlier request to skip visual checks.

## Tasks

- [x] Align the toolbar with the note, give controls equal targets, remove automatic reference spacing, and group text styles, inline formatting, then block/reference insertion. Keep inline code beside Bold/Italic, with whole groups wrapping on narrow layouts.
- [x] Build and run relevant existing tests.
- [x] Document the pattern, record results and limits, archive and commit the scoped change.

## Relevant files

- `src/adapters/http-server/notes-browser.ts`
- `docs/design-system.md`
- `tasks/todo/release-next.md`

## Verification

Tested snapshot: `116d04e` plus this scoped presentation/documentation change.

- `npm run build` — passed; editor bundle 181,735 bytes gzip.
- `node --test test/browser-theme.test.js test/notes-browser.test.js test/companion-browser.test.js test/lexical-bundle.test.js test/editor-markdown.test.js` — 105 passed, 0 failed.
- `git diff --check` — passed.
- Code review confirmed existing formatting/selection listeners and reference insertion still address nested controls; the shell's existing `[hidden]` rule preserves hidden controls.

No new tests for this presentation-only change. Visual/browser verification was waived by the user, so actual rendered alignment and wrapping remain unverified. No installation, push or release.
