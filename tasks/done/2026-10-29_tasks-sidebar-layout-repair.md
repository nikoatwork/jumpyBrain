# Sidebar layout repair

Completed 2026-10-29: corrected the sidebar container regression, kept all footer actions in one bar, and repaired row hover/focus geometry.

## Goal

Restore coherent sidebar sections, consistent row hover/focus spacing, and one horizontal bottom action bar after the reported integration regression.

## Evidence and scope

- Installed snapshot: `3fc9d2d`. The committed markup closes `.nav-library` before Attention and opens `.nav-preferences` inside the Attention scroll region, interleaving page lists, board navigation and footer controls.
- A pre-existing unstaged change in `notes-browser.ts` already repairs those container boundaries. Retain and finish that directly relevant fix; leave the unrelated board follow-up task untouched.
- No delegation. Preserve existing pins, attention semantics, navigation guards and update/connection behavior.

## Tasks

- [x] Inspect screenshot, current markup, design contract and prior changes.
- [x] Repair section boundaries, footer geometry and shared hover/focus surfaces.
- [x] Verify real hosted and companion shells at narrow/wide sidebar widths, short windows, light/dark palettes and keyboard focus; include native update control.
- [x] Record results/limits, update owning docs/release notes, archive and commit scoped changes.

## Verification

Tested `3fc9d2d` plus this scoped change:

- `npm run build` passed.
- `node --test test/browser-sidebar.test.js test/browser-page-navigation.test.js test/browser-theme.test.js`: 24 passed.
- `scripts/sidebar-layout-smoke.mjs` passed against the real companion gateway with disposable notes, boards, pins and settled pages. Uses the production native update renderer and Mac header flag. Checks five equal footer targets with 8px gaps, independent Attention scrolling, reachable footer/shelf, selected-row and keyboard-focus geometry, icon hover surfaces, Settings, and visible touch actions.
- Layouts: 224/280/480px desktop sidebars, 480px short window, 390/320px narrow viewports, both schemes; hover/focus checks cover all four palettes in both schemes.
- `scripts/sidebar-smoke.mjs` and `scripts/collaborative-sidebar-smoke.mjs` passed: pins, rename/reload/cross-tab behavior, failed-save navigation guards, external refresh, caret/focus preservation and settlement behavior.
- Inspected wide/minimum-width dark and narrow light captures under `/tmp/jumpybrain-sidebar-layout-qa`; footer alignment and row action spacing are corrected. `git diff --check` passed.

## Limits

- These layout checks run Chromium with the production companion shell/update renderer; they are not a full Electron end-to-end suite.
- Long labels still truncate, with full accessible names/tooltips. Touch navigation retains horizontal page lists.
- The unrelated board-creation/inline-note follow-up remains active and unchanged. No release or push is part of this repair.
