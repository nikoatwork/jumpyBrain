# Focus starter page

## Goal

Give new local brains created in Mac onboarding an ordinary pinned Today page, with 10 Main focus, 5 Secondary focus and 5 The rest checkboxes. Reuse Markdown, editor and navigation; no template engine or recurring generation.

## Decisions

- Existing brains, CLI initialization, remote brains and upgrades receive no starter.
- Start settled so unpinning hides it from the sidebar. Settling this starter also removes its pin; ordinary pin semantics stay unchanged.
- One onboarding handoff seeds the device-local pin; never infer recreation from a missing page. App-data deletion/reinstallation is not a promise of persistent dismissal across devices.

## Tasks

- [x] Implement canonical starter creation and one-time onboarding/pin handoff.
- [x] Verify 10/5/5 layout, editing, persistence, dismissal and existing-brain exclusion.
- [x] Run validation and production Electron visual smoke; inspect captures.
- [x] Update owning docs/release notes, archive and commit scoped work.

## Outcome and verification

Completed 2026-10-29 against baseline `02088d2` plus this scoped change. New local Mac onboarding creates an editable Today page with 10/5/5 empty checkboxes, friendly guidance and an ordinary persistent sidebar pin. Existing or deleted starters are not recreated. Settle confirms the canonical save before removing this starter's pin. Updated stale Electron smoke assertions for the previously shipped sticky page card.

- `npm run validate`: 1,475 passed, 1 skipped, 0 failed. This run preceded the final removal of the redundant body title and the added retry/pin tests.
- Final `npm run build` plus targeted setup, starter-pin, attention-browser and architecture tests: 26 passed, 0 failed.
- Final `node scripts/electron-smoke.mjs`: passed on the final build, including fresh/existing onboarding, 20 rendered checkboxes, canonical checkbox persistence, unpin/reload, settle/relaunch, repeated handoff, ordinary editing, native Find, sandboxing, feedback fixture, close protection and tab cleanup.
- Captured native 1200/480px light/dark screens under `.local-pack/desktop/focus-*.png`; inspected the first section and lower sections, readable wrapping, 10/5/5 proportions, no duplicate title and no horizontal overflow.
- `git diff --check`: passed.

## Remaining limits

No installed personal app, release, remote brain or real user memory was changed. Physical accessibility/IME and installed-package onboarding are not tested here. The smoke uses the production Electron window/onboarding and gateway with disposable roots. A crash after canonical creation but before the one-time pin handoff can leave an unpinned ordinary page; restart deliberately never scans/recreates it. Device-local dismissal identity is not retained after app storage is cleared. The page uses the existing vertically scrolling editor, without a new dashboard/layout engine or task quota enforcement.
