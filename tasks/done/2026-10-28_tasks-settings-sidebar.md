# Settings sidebar

## Goal

Replace the desktop notes sidebar while Settings is open, with focused sections and a clear route back to the app. Follow the supplied T3 reference using jumpyBrain's own quiet theme and compact copy.

## Decisions

- Keep existing guarded navigation, brain-scoped URLs, connection permissions and forms.
- Sections: Brains, Appearance, Extensions. Back returns to the previous note/map/home; direct Settings entries fall back to Home.
- Settings stays navigable when the notes sidebar was collapsed, without changing that preference.
- Ordinary hosted connection dialogs retain their existing behavior; this is the desktop/companion Settings surface.

## Relevant files

- `src/adapters/http-server/browser-settings.ts` — focused companion Settings navigation/style ownership.
- `src/adapters/http-server/companion-browser.ts` — Settings layout and controls.
- `src/adapters/http-server/notes-browser.ts` — guarded entry/exit navigation.
- `src/adapters/http-server/browser-sidebar.ts` — collapsed navigation presentation.
- `src/adapters/http-server/browser-theme.ts` — shared theme preference.
- `scripts/companion-browser-smoke.mjs` — production-shell end-to-end coverage.
- `src/adapters/http-server/browser.docs.md` — owning UI contract.

## Tasks

- [x] Inspect existing Settings, routing, theme and save guards.
- [x] Implement replacement navigation, compact sections and return behavior.
- [x] Check browser flows, save failures, history, themes and narrow layouts.
- [x] Update owning docs/release notes, record results, archive and commit scoped work.

## Outcome

Completed 2026-10-28.

- Desktop Settings replaces the usual note actions, page lists and brain switcher with Brains, Appearance and Extensions.
- Compact breadcrumb, bordered content groups, icon actions and reduced-motion-aware panel entry keep the interface quiet.
- Back returns to the last note/map/home in the current tab. Direct Settings entry or reload falls back to Home; a brain switch discards the old return destination through the existing generation reload.
- Appearance exposes System/Light/Dark using the existing shared preference. Brains retains permission-gated refresh and connection forms; leaving Brains clears transient form secrets.
- Opening Settings temporarily reveals its navigation when the notes sidebar is collapsed. Returning restores the stored preference.

## Verification

Tested snapshot: parent `814f3ec` plus this task's scoped working-tree changes.

- `npm run build`: passed; editor bundle remains 181,735 bytes gzip, below its existing 183 KB review gate.
- Targeted browser/companion/sidebar/theme tests: 100 passed.
- Production-shell companion end-to-end smoke: passed, including section history/reload, theme controls, save-before-entry, failed-save retention/retry, note/map return, collapsed-sidebar restoration, and the existing connection/key, generation, two-tab switch, read-only and session recovery flows.
- Sidebar and theme production browser smokes: passed.
- Extensions browser controller smoke: passed. Isolated extensions runtime suite: 22 passed.
- All three Settings sections inspected from saved screenshots in light/dark at 1280, 390 and 320 pixels; overflow and icon targets checked automatically. Screenshots remain disposable under `/tmp/jumpybrain-settings-qa`.
- Final `npm test`: 1,402 passed, one skipped, zero failures (1,403 total).
- `git diff --check`: passed.

## Limits

- Browser verification uses disposable companion fixtures. Native Keychain/folder dialogs, installed-app chrome and physical macOS fullscreen were not exercised; no app installation or release was performed.
- Ordinary hosted connection dialogs retain their current behavior.
- An earlier full-suite run had one unrelated extension notification deadline failure (1,400 passed, one failed, one skipped); its isolated 22-test suite passed. An initial run that overlapped a rebuild was discarded because rebuilding removes `dist`.

