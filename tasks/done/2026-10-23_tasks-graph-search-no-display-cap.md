# Relevance-driven graph result count

## Outcome
Removed the extra graph display-count limit from result normalization, seed forwarding and provisional title projection. All qualifying retrieved matches can appear; strict score filtering and zero nonmatching-neighbor expansion remain.

## Goal
Remove the artificial twelve-note display cap; let relevance determine how many retrieved matches appear.

## Tasks
- [x] Remove graph-only truncation from authoritative and provisional search views; preserve strict matching and zero neighbor expansion.
- [x] Verify more than twelve qualifying notes survive normalization and graph requests; run build, focused tests and disposable graph browser smoke.
- [x] Update current docs/release notes, archive this task and commit scoped changes.

## Scope and limits
The existing shared-search 120-candidate retrieval budget and graph node/edge/byte safety budgets remain. This removes the extra graph display cap and does not claim exhaustive corpus retrieval. Prior task records describe historical behavior.

## Verification
Tested the task diff on `6bd1cb3` using Node v26.7.0 on 2026-10-23.

- `npm run build`: passed (170,270 gzip bytes).
- Focused graph search, graph/controller, graph topic, note search and recent-write tests: 134 passed, zero failed/skipped. Seed forwarding preserves all 85 qualifying fixture paths in rank order.
- `npx --package=playwright node scripts/graph-topic-smoke.mjs`: passed at 1280/390/320 px with 1,650 disposable notes. All seventeen qualifying lexical notes appear, while three strong semantic notes survive a 117-weak-hit tail; links, no-neighbor behavior, freshness, camera/history and cancellation remain covered.
- Syntax checks for both changed browser smoke scripts and `git diff --check`: passed.
- Broader test suite and editor/warning browser smokes passed in the preceding task; this small removal used focused regression coverage. No live semantic-corpus judgment or installed-app update was performed.

## Relevant files
- `src/adapters/http-server/graph-search.ts`, `map-controller.ts`, `graph-page.ts`, `browser.docs.md`
- `test/graph.test.js`, `scripts/graph-topic-smoke.mjs`, `scripts/graph-ui-smoke.mjs`
- `glossary.md`, `tasks/todo/release-next.md`, `tasks/CHANGELOG.md`

Current docs and pending release notes now describe relevance-driven result counts. This completed adjustment is archived and committed with its scoped changes.
