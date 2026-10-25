# Compact memory search popup

## Goal

Remove the idle search instructions and stale-index explanatory paragraph. Present the existing explicit reindex action as a named icon beside the search field, preserving permissions, status and failures.

## Tasks

- [x] Simplify popup copy and reindex presentation using shared icons/tokens.
- [x] Build and run relevant existing controller/browser verification.
- [x] Record results and limits, update pending release notes, archive and commit scoped changes.

## Outcome and verification — 2026-10-25

Removed the idle “Search titles and contents.” message and the recent-saves/index-refresh paragraph. The existing stale-index action is a shared refresh glyph beside the search field, with an accessible Reindex memory name, tooltip, busy state and read-only disabled reason. It keeps its existing stale-only visibility and permission checks. Actual errors, indexing progress, keyboard guidance and partial-results coverage remain available.

Tested snapshot: base `faee8fd` plus these scoped changes, package 0.3.8 unchanged.

- `npm run build` passed; production editor bundle 175,588 bytes gzip.
- `node --test test/notes-browser.test.js test/companion-browser.test.js test/browser-theme.test.js` passed all 97 tests.
- `npx --package=playwright node scripts/note-lifecycle-smoke.mjs` passed, including the visible stale-index icon and successful explicit index refresh against disposable Markdown/QMD/server state.
- `npx --package=playwright node scripts/search-recognition-smoke.mjs` passed all six 1280/390/320px dark/light layouts and search/filter/save checks. Inspected the 320px dark screenshot under `/tmp/jumpybrain-search-qa/`; no overflow or obsolete helper paragraphs.
- Existing graph-editor smoke freshness selectors now observe the icon; the broader graph-editor smoke was not rerun for this presentation change.
- `git diff --check` passed. No installed app or personal memory changed. Native devices, assistive technology and browsers beyond Chromium were not checked. No release, installation or push performed.

## Relevant files

- `src/adapters/http-server/notes-browser.ts` and `browser.docs.md` — popup presentation and contract.
- `test/notes-browser.test.js` and `scripts/graph-editor-smoke.mjs` — existing freshness checks follow the icon.
- `tasks/todo/release-next.md` and `tasks/CHANGELOG.md` — pending release note and completed outcome.
