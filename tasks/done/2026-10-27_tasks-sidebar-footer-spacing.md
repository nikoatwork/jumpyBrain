# Sidebar footer spacing

Completed 2026-10-27. Footer actions now share equal targets and 8px spacing, including the optional native update control.

## Scope

Make Graph, Settings, Feedback, theme and the optional native update action use equal target sizes and spacing. The user explicitly waived visual checking.

## Tasks

- [x] Normalize the footer's inherited control size to 32px, with 40px touch targets on narrow layouts, and use 8px gaps throughout without an automatic spacer before theme.
- [x] Run the build and relevant existing browser tests; record results and limits.
- [x] Update release notes and design documentation, archive this list and commit the scoped change.

## Relevant files

- `src/adapters/http-server/notes-browser.ts`
- `docs/design-system.md`
- `tasks/todo/release-next.md`

## Verification

Tested snapshot: `12325b3` base plus this scoped CSS/documentation change.

- `npm run build` — passed; editor bundle 181,733 bytes gzip.
- `node --test test/browser-sidebar.test.js test/browser-theme.test.js test/notes-browser.test.js test/companion-browser.test.js` — 99 passed, 0 failed.
- `git diff --check` — passed.
- No new tests were added for this small presentation-only change. Visual/browser checks were explicitly waived by the user; rendered geometry is unverified. No installation, push or release.
