# Mono theme

## Goal

Replace Grove with a black, white and gray paired theme named Mono. Preserve existing appearance preferences by mapping saved Grove selections to Mono.

## Tasks

- [x] Replace palette colors, visual swatches and visible names; migrate legacy Grove preferences.
- [x] Verify light/dark contrast, grayscale tokens, persistence/migration, app surfaces and narrow layouts.
- [x] Update current docs/pending release notes, record results, archive and commit the scoped change.

## Decisions

- Ember and Ocean remain available. Mono uses neutral grays for surfaces, focus, status/error and graph tokens; meaningful states retain their text/accessibility labels.
- Historical task and release records keep the original Grove name. Current documentation and tests use Mono.
- No new release or installed-app update is part of this request.

## Relevant files

- `src/adapters/http-server/browser-palettes.ts` — neutral light/dark tokens, including graph/status roles.
- `src/adapters/http-server/browser-appearance.ts` — Mono label and grayscale paired swatches.
- `src/adapters/http-server/browser-theme.ts` — before-paint alias and persisted Grove migration.
- `test/browser-theme.test.js` — migration, blocked-write handling, grayscale and contrast checks.
- `scripts/theme-smoke.mjs`, `scripts/companion-browser-smoke.mjs` — current palette matrix and UI choice coverage.
- `docs/design-system.md`, `src/adapters/http-server/browser.docs.md` — current appearance contract.

## Outcome and verification

Completed 2026-10-28.

Tested snapshot: parent `ca6568a` plus this scoped change.

- Mono replaces Grove with white/soft-gray light surfaces and near-black/charcoal dark surfaces. Text, focus, selection, status/error and graph tokens are all neutral grayscale. Other themes keep their original colors.
- Stored `grove` maps to `mono` before paint and is rewritten when browser storage permits. Legacy cross-tab/explicit values also resolve to Mono. Scheme selection remains independent. Historical release/task archives retain their original names.
- Build passed; editor bundle 181,747 bytes gzip, below the existing gate.
- Targeted theme/companion/notes tests: 101 passed. Includes AA text/focus contrast for both schemes, strict grayscale checks and persisted/legacy palette behavior.
- Full theme browser matrix passed: all three current palettes × light/dark × 1280/390/320 widths, checking Home, formatted notes, search, Feedback, graph, actual surfaces, focus/overflow/dialog bounds, preferences and draft/caret preservation.
- Companion browser smoke passed with Mono radio choices, keyboard selection, reload/cross-tab behavior and existing save/switch/recovery checks.
- Visually inspected Mono light/dark notes, search, maps and Appearance on desktop and phone. Disposable screenshots: `/tmp/jumpybrain-mono-ui` and `/tmp/jumpybrain-mono-settings`.
- Final `npm test`: 1,410 passed, one skipped, zero failures (1,411 total), including blocked migration-write handling.
- `git diff --check`: passed.

## Limits

- Chromium/disposable fixtures; no physical native UI, Safari or Firefox check. Search screenshots use controlled fixture results; no semantic-retrieval claim.
- No release, installation, push or personal memory change. Existing pending updater notes and unrelated work remain intact.
