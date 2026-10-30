# Sidebar relative ages

## Later integration review

The original implementation is on `master`. Subsequent task [sidebar copy hierarchy](2026-10-29_tasks-sidebar-copy-hierarchy.md) intentionally shortened labels to `3d` and `due 2h`; preserve that newer design. The [2026-10-30 integration review](2026-10-30_tasks-sidebar-age-integration-review.md) covers the combined implementation and fixes false due labels caused by preview/attention revision differences. The completion summary below records the original 2026-10-29 behavior.

## Completion summary

Implemented and verified on 2026-10-29. `sidebarPageAge` in `browser-page-navigation.ts` now renders sidebar row ages as explicit relative forms (`3d ago`, `5m ago`; `now`, `Today`, `in 2h` unchanged) and labels explicit attention due overrides `due 2h ago`/`due now`/`due in 10m` with `Due <date>` tooltips. Because the attention packet sends `attentionAt` for every active note (edit/creation recency fallback), the due label applies only when `attentionAt` differs from the note's edit/creation recency — recency-derived rows keep the edit age. Search-result rows keep the shared compact `3d` contract. Verified with `npm run build`, targeted `node --test` suites (28 + 111 passing) and `scripts/sidebar-smoke.mjs` (extended with deterministic due/age fixtures). Archived to `tasks/done/2026-10-29_tasks-sidebar-relative-ages.md`.

## Goal

Make sidebar page-row time captions read instantly at a glance: past edit ages get an explicit "ago" form (`2d ago`, `3h ago`), and attention rows with an explicit due override show when they became due (`due 2h ago`, `due now`), with exact timestamps retained in tooltips/aria-labels.

## Notes

- `resultEditContext` in `search-presentation.ts` already yields compact relative labels (`3d`, `in 3d`, `now`, `Today`, `5m`, `3h`) and is shared with search-result rows; its contract stays unchanged. The sidebar applies its own presentation on top.
- The attention packet sends `attentionAt` for every active note (edit/creation recency fallback), so the client distinguishes explicit snooze overrides by comparing `attentionAt` with the note's recency; recency-derived rows keep the edit age. Snoozed-future notes are filtered out server-side before the client list, so "due tomorrow" for parked pins would need a server change — out of scope here.
- Ages refresh through existing renders (focus/pageshow, attention wake timers, saves/visits); no new polling or redraw loop.
- Design system: keeps caption-size metadata and exact-date `title`/`aria-label` as today.

## Relevant Files

- `src/adapters/http-server/browser-page-navigation.ts` - row rendering; new pure `sidebarPageAge` helper
- `src/adapters/http-server/search-presentation.ts` - `resultEditContext` reused unchanged
- `src/adapters/http-server/browser.docs.md` - sidebar note-row contract sentence
- `test/browser-page-navigation.test.js` - unit tests for the helper
- `scripts/sidebar-smoke.mjs` - end-to-end age/due label checks

## Tasks

- [x] 1.0 Pure sidebar age helper
  - [x] 1.1 Add exported `sidebarPageAge(page, now)` in `browser-page-navigation.ts`: explicit `attentionAt` → `due …` label with `Due <exact>` details; otherwise transform `resultEditContext` past labels with an ` ago` suffix (`now`, `Today`, `in Xd` unchanged)
  - [x] 1.2 Unit tests in `test/browser-page-navigation.test.js`
- [x] 2.0 Wire helper into both render paths (row rebuild + metadata refresh loop)
- [x] 3.0 Docs: update the sidebar note-row contract sentence in `browser.docs.md`
- [x] 4.0 Verification
  - [x] 4.1 `npm run build` + targeted `node --test`
  - [x] 4.2 Extend `scripts/sidebar-smoke.mjs` with deterministic age/due fixtures and assertions
  - [x] 4.3 Run the sidebar smoke
- [x] 5.0 Archive this list to `tasks/done/` and commit scoped changes

## Decisions

- Sidebar-only label change; search-result rows keep the compact `3d` form to preserve the established shared contract.
- The attention packet's `attentionAt` is the ordering time for every active note; a due label applies only when it differs from edit/creation recency, so ordinary recent notes never read as "due".
- Clock-skew/future `attentionAt` renders `due in Xm/Xh` rather than a past label; invalid overrides fall back to the edit age.
- Changelog/release notes: skipped; wording polish does not pass the significance gate.
