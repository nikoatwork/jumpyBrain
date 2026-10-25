# Compact search results

Status: completed 2026-10-25. Search results now use compact structured rows.

## Goal

Make search results easy to scan: title with right-aligned relative edit age, one-line preview, and a compact path/known-editor metadata row. Omit unknown editor placeholders.

## Tasks

- [x] Update structured result rendering and relative edit presentation, preserving safe text rendering and mounted selection targets.
- [x] Verify existing controller/date tests and real browser search at desktop/390/320px in both themes.
- [x] Update owning docs, pending release notes and changelog; record results/limits, archive and commit scoped work.

## Verification and limits

Tested snapshot: base `423d145` plus this task's scoped changes; package version 0.3.8 unchanged.

- `npm run build` passed (production editor bundle 175,570 bytes gzip).
- `node --test test/search-recognition.test.js test/notes-browser.test.js test/graph.test.js`: 123 tests passed. Covers safe text rendering, stable row identity, omitted unknown editor/date labels, exact metadata details, missing-ID warnings, relative day/sub-day ages and future dates. Date-only values retain calendar meaning; creation does not substitute for editing.
- `npx --package=playwright node scripts/search-recognition-smoke.mjs` passed at 1280/390/320px in dark/light themes against disposable Markdown/QMD/server state. Confirms right-aligned age, single-line ellipsis, row/viewport bounds, unknown-editor omission, filters/paging, unchanged canonical notes on search/open and confirmed-save attribution.
- Production sidebar, theme, feedback and companion-browser smoke scripts all passed through the repository Playwright runner.
- Visually inspected `/tmp/jumpybrain-search-qa/search-1280-dark.png` and `search-320-light.png`: compact rows, aligned metadata and no horizontal overflow.
- `git diff --check` passed. Unrelated active task lists are excluded. Full repository test suite, physical native devices, assistive technology and other browsers were not checked. No personal memory, installed app, version, push or release changed.

## Relevant files

- `src/adapters/http-server/notes-browser.ts` — structured three-line rows and responsive truncation.
- `src/adapters/http-server/search-presentation.ts` — relative ages and known-editor details.
- Existing search/controller tests and search-recognition smoke — updated presentation checks.
- `src/adapters/http-server/browser.docs.md`, `docs/design-system.md`, pending release notes and task changelog — documented result contract and completed outcome.
