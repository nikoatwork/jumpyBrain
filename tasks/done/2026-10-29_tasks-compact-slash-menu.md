# Compact slash menu

## Goal

Give each slash-menu entry one short label and a compact, styled presentation, following the supplied screenshot feedback.

## Outcome

Implemented one short label per entry with decorative glyphs, bold/italic/code styling, a 224px menu, 32px desktop rows, 40px touch rows and thin themed scrollbars. Existing command aliases, filtering and keyboard actions remain intact.

## Work

- [x] Remove duplicate slash aliases from visible rows, shorten labels, and add decorative formatting glyphs.
- [x] Tighten menu width, row spacing, hover and scrolling with existing theme tokens.
- [x] Refresh affected existing smoke expectations without running tests, per the user's instruction.
- [x] Record outcome and limits, update release notes/changelog, archive and commit only this task's changes.

## Relevant files

- `src/adapters/http-server/editor-slash-commands.ts`
- `src/adapters/http-server/notes-browser.ts`
- `scripts/editor-feedback-smoke.mjs`
- `tasks/todo/release-next.md`

## Verification

Tests and browser checks are explicitly waived by the user for this styling/copy change. Review the scoped source diff; preserve unrelated work already present in the checkout.

## Completed snapshot and limits

Source base `1c99836` plus the scoped changes recorded in this commit. Reviewed the source diff and refreshed the existing heading-selection smoke expectation. No tests, build or browser checks were run, as requested; rendered appearance remains unverified. Unrelated onboarding, sidebar and section-rail work is excluded from this commit.
