# Pre-existing browser smoke failures

Status: completed and merged into `master` (verified at 261e3985). One product fix pending release.

Twelve Chromium smokes failed identically on `master` before and after the design-system merge (`b7e3888d`); see [design-system limits](2026-11-15_tasks-design-system-components.md#limits). Two more with the same stale pattern were found during the work. Each failure was classified as a stale assertion or a product bug, fixed, and run to completion.

## Outcome

- [x] sidebar-smoke — stale: 320px default width; failed saves injected over the live socket (saves left PUT in c612fefa) and recovered via review; Pages list scrolls in its own region.
- [x] recent-notes-smoke — stale: Connect checked by accessible name; key lives only in an HttpOnly session cookie; narrow sidebar reopened.
- [x] workspace-history-smoke — stale: live-socket failed save; Back stays guarded.
- [x] editor-feedback-smoke — stale: counts live save messages; provenance frontmatter; CRLF round-trip; Undo is a server round trip.
- [x] companion-browser-smoke — stale: Settings startup reads boards since 35d42fb2 (not a regression). Fixture ported to real disposable backends with live editing via `attachCompanionLive`; the obsolete If-Match conflict stop is replaced by a two-tab concurrent-merge scenario; save-before-Settings, switch flush, failed-save review and session-expiry draft preservation kept.
- [x] feedback-smoke — stale: narrow note views collapse the sidebar.
- [x] note-attention-smoke — stale: live-socket failure, review recovery, narrow sidebar.
- [x] folder-explorer-smoke — stale: live title save failure.
- [x] folder-explorer-actions-smoke — stale: waits for the live snapshot to confirm the renamed path.
- [x] graph-topic-smoke — stale: dismisses the related-note availability warning covering narrow map controls; reopens the narrow sidebar.
- [x] graph-editor-smoke — stale (live saves, session marker, open note hidden from search) plus one product bug, below.
- [x] graph-ui checks — stale: missing-note nodes open a topic preview since 49163d58.
- [x] page-reference-smoke and missing-reference-pages-smoke — stale PUT/Retry pattern; ported to live saves and cookie sessions; new pages have empty bodies since ac2e3fcf.

## Product fix

- Entering a wrong access key while a note was open left the note unloaded and blocked every navigation and the corrected key ("Resolve or recover the pending draft"). `flush()` in `live-editor-session.ts` now returns `!state.dirty` when no live session exists. Found independently by two agents; merged once with both regression tests in `test/editor-session.test.js`.

## Verification

- `npm run build` on merged master; `node --test test/editor-session.test.js test/notes-browser.test.js test/design-tokens.test.js test/graph.test.js test/lexical-bundle.test.js`: 152/152 pass.
- Sequential Chromium run on the same build: sidebar, recent-notes, workspace-history, editor-feedback, companion-browser, feedback, note-attention, folder-explorer, folder-explorer-actions, graph-topic, graph-editor (includes graph-ui), page-reference, missing-reference-pages, sidebar-layout, dropdown — all PASS. Agents additionally ran each fixed smoke 2–3 times.

## Limits and follow-ups

- folder-explorer showed one load-related flake (:270) only when five smokes ran in parallel; not reproduced solo or in 3 parallel runs.
- Companion smoke exercises the live bridge, not the real gateway's request proxying; native Electron smokes not run.
- Product follow-ups (not done): boards are read twice at companion startup; the related-note availability warning reappears after dismissal; after a save confirms, the open note can match its own `[[query` in suggestions; 35ms typing-to-slash-command can share one Undo step; narrow touch page rows show three 40px actions that squeeze titles (needs a design decision, e.g. an overflow menu).
