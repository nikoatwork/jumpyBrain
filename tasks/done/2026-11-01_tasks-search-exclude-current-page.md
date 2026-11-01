# Exclude the current page from navigation search

- [x] Filter the current canonical page ID from web and Mac navigation search before the frontend result limit, preserving ranking and reference pickers.
- [x] Verify exclusion, result selection/empty state and unchanged searches without a current page; run build and focused regressions.
- [x] Record outcome and limits, update docs/release notes/changelog, archive and commit scoped work.

## Scope

Frontend-only filtering in the shared browser shell for web and Mac feature parity, as clarified by the user. Search requests, retrieval/ranking, graph search and reference pickers retain their existing behavior. No installation or release requested.

## Outcome and verification

Navigation search omits all hits carrying the current canonical document ID before deduplication and the frontend result cap. Other pages with the same title remain eligible. Selection and empty-state messages use the filtered collection. The current ID is read when results arrive, and searches outside a note have no exclusion. Explicit reference insertion and inline autocomplete retain their existing results.

Verified the final implementation snapshot on 2026-11-01 with `npm run build` and `node --test test/notes-browser.test.js`: build passed and all 77 tests passed. Regressions exercise duplicate current-page hits, same-title alternatives, filtering before the limit, keyboard selection, current-page changes, current-only empty results, no-current-page results, web/Mac parity and reference-picker scope. `git diff --check` passed. No running web/Mac app check, installation or release was performed.

## Relevant files

- `src/adapters/http-server/notes-browser.ts`
- `src/adapters/http-server/browser.docs.md`
- `test/notes-browser.test.js`
- `tasks/todo/release-next.md`
- `tasks/CHANGELOG.md`
