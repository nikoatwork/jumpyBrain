# Appearance settings

## Goal

Give the existing Appearance tab a simple visual picker inspired by the supplied T3 reference: System/Light/Dark previews and three curated paired palettes, with short labels and instant application.

## Decisions

- Keep Ember as the default; add Ocean and Grove as built-in light/dark pairs.
- Scheme and palette are independent origin-local browser preferences using the same implementation in hosted and desktop shells. Existing users retain their current appearance.
- Native radio groups provide keyboard selection; visual miniatures are decorative CSS. Keep the existing quick theme toggle.
- Preserve extension-theme behavior and draft/editor state. No theme authoring or advanced sliders.

## Tasks

- [x] Implement visual choices and shared persisted palettes.
- [x] Verify contrast, keyboard use, OS/manual/reload/cross-tab behavior, draft retention and responsive layouts.
- [x] Update owning docs/release notes, record verification, archive and commit.

## Relevant files

- `src/adapters/http-server/browser-appearance.ts` — visual native radio choices and decorative previews.
- `src/adapters/http-server/browser-palettes.ts` — semantic paired color tokens.
- `src/adapters/http-server/browser-theme.ts` — before-paint preferences, shared control synchronization and extension handoff event.
- `src/adapters/http-server/browser-settings.ts`, `companion-browser.ts` — Appearance composition.
- `src/adapters/http-server/extensions-browser.ts`, `map-controller.ts` — extension fallback and graph repaint.
- `test/browser-theme.test.js`, `scripts/{companion-browser-smoke,theme-smoke,extensions-browser-controller-smoke}.mjs` — verification.

## Outcome and verification

Completed 2026-10-28.

Tested snapshot: parent `fc4167a` plus the scoped changes in this task.

- Build passed; editor bundle 181,746 bytes gzip, below the existing 183 KB review gate. Optional extensions UI is 5,762 bytes gzip.
- Targeted theme, companion and notes tests: 99 passed, zero failures. Added palette persistence/fallback/storage-isolation checks and AA contrast checks for every alternate light/dark pair.
- Production companion browser smoke passed: native radio pointer/Arrow/Space selection, persisted scheme/palette, same-origin cross-tab synchronization, all sections and existing brain-switch/save/session flows.
- Production theme smoke passed: OS/manual/reload/cross-tab/blocked-storage behavior and unchanged editor instance, draft and caret through palette changes. Updated its stale sidebar order assertion to match the preceding Home/New note/Search change.
- Extension renderer smoke passed, including clearing custom token overrides and selection when a built-in appearance is chosen.
- Inspected visual scheme previews and paired swatches, all three palettes in both schemes at 1280, 390 and 320 pixels. Automated overflow checks pass; screenshots remain disposable under `/tmp/jumpybrain-appearance-qa`.
- Final `npm test`: 1,404 passed, one skipped, zero failures (1,405 total).
- `git diff --check`: passed.

## Limits

- No native Keychain/folder dialogs, physical macOS fullscreen, Safari or Firefox verification. Browser fixtures do not modify the installed app or personal memory.
- No theme authoring/import, contrast/glass sliders or per-project appearance. Built-in choices remain origin-local preferences; they are not canonical memory or server configuration.
