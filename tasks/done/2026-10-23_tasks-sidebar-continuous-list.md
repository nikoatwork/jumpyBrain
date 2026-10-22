# Continuous sidebar page list

Status: completed and archived 2026-10-23. Removed the visible headings and section gap; pinned notes stay first with the same 4px spacing as all other adjacent rows.

## Goal

Make the Mac sidebar pages read as one list: remove the Pinned and Attention headings, keep pinned notes first, and use even spacing between rows.

## Tasks

- [x] Remove visible section headings and extra section spacing while retaining accessible list labels, pin ordering and existing actions.
- [x] Build and run the existing sidebar/theme smoke checks; inspect both themes and narrow layouts.
- [x] Record verification, update owning docs/release notes, archive and commit the scoped change.

## Scope

- Shared browser sidebar used by the Mac editor and hosted app.
- Retain separate list containers for existing navigation behavior and accessible names; present them as a continuous list.

## Verification

- Tested snapshot: `c219f9f` plus this task's sidebar markup/styles and documentation changes.
- `npm run build`: passed.
- `node --test test/browser-page-navigation.test.js test/browser-theme.test.js`: 11 passed.
- Production `scripts/sidebar-smoke.mjs`: passed, including canonical attention order, pin persistence/cross-tab changes, stable row identity, failed-save navigation guards, collapse and narrow layout.
- Production `scripts/theme-smoke.mjs`: passed in light/dark at 1280/390/320px, including theme persistence, focus, draft/caret and editor preservation.
- Visually inspected desktop light/dark, 390px populated sidebar, and 320px light/dark screenshots. Evidence: `/tmp/jumpybrain-sidebar-continuous-list/`.
- `git diff --check`: passed.

## Limits

- Verified the production browser shell shared by the Mac editor; did not rebuild/install the native Mac app or publish a release.
- Narrow navigation retains its existing horizontal page lists. Native update controls and non-Chromium browsers were not retested for this layout-only change.
