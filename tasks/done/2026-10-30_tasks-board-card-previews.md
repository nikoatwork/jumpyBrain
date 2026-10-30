# Compact board cards

## Request

Remove the per-card status dropdown, show up to three lines of note content, and place compact icon-only hover actions on the right. Retain accessible keyboard/touch actions and existing drag navigation/membership behavior.

## Tasks

- [x] Reuse plain-text preview formatting with existing scoped document reads; replace the status control with a compact right-side action strip.
- [x] Verify preview clipping, hover/focus/touch geometry, keyboard/drag movement, membership removal and preserved note content in the board smoke; build and run relevant regressions.
- [x] Update owning docs/release notes, archive and commit.

## Completed — 2026-10-30

Removed the card status dropdown. Cards now show up to three lines of plain-text content beneath their title, with Move up and Remove SVG icons in a reserved right-side lane. Actions reveal on hover/focus and remain visible on narrow/touch layouts; existing drag movement and Alt+Left/Right preserve cross-column organization without a status control. Preview formatting reuses the shared formatter, existing scoped document reads and an in-memory cache; adding a note loads its preview immediately. No Markdown or board schema changes.

## Verification

Tested on base `07ce556` plus this scoped change:

- `npm run build` — passed.
- `node --test --test-timeout=15000 --test-reporter=tap test/collections.test.js test/companion-browser.test.js test/search-presentation.test.js` — 23 passed. An earlier unbounded run stalled after a gateway fixture failure; it was stopped, rebuilt and the bounded rerun passed. The real gateway board smoke also passed.
- `npx --package=playwright node scripts/boards-smoke.mjs` — passed, including plain-text/frontmatter stripping, two/three-line clipping, right-lane geometry, SVG-only actions, hover/focus visibility, 40px narrow controls, keyboard/drag moves, icon reorder/remove, unchanged canonical notes and the existing retry/read-only/scope/draft regressions.
- `node scripts/electron-smoke.mjs` — passed against the production sandboxed window/gateway.
- Inspected 1280px light and 390px dark captures in `/tmp/jumpybrain-boards-qa/`; the smoke also captured the opposite schemes. No overflow or content/action overlap.

## Limits

Previews refresh on board loading/return/focus and after adding a note; no new background polling or persistent content snapshots. Empty/missing bodies show no preview filler. Physical assistive technology and other browser engines remain untested. No installation, push or release.
