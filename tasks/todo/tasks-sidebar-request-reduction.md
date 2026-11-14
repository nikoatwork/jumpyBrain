# Context

Follow-up to the [shared-brain admission errors](../done/2026-11-14_tasks-shared-brain-admission-errors.md) investigation. On 2026-11-14 the owner asked whether typing pushes one request per keystroke and hits the shared brain's proxy limit (Traefik: about 120 requests/minute per IP address, burst 30, refill about 2/second; that deployment's setting, not a product default). Then they asked for a task list covering:

1. Read the attention list once on load instead of three times.
2. Load all sidebar previews in one request instead of one per note.

**Measured on the shared test brain** (server and web editor v0.3.23, Chromium, two windows on one test note, a brain with 7 notes; ad hoc Playwright request/WebSocket counter, to be made reusable in 1.2):

- Typing 100 characters sent **0 HTTP requests**. Edits and presence go over the open WebSocket (94 `edit` and 94 `presence` frames from the writer, 93 `presence` frames from the observer) and do not count against the proxy limit; there were no 429s at about 900 frames/minute. The v0.3.22 per-keystroke whole-note re-read was fixed in v0.3.23.
- **Opening one window sends 17 HTTP requests:** the page, `/session`, `/capabilities`, the favicon, 1 search, **3 × `GET /memories/all/attention`**, and **8 × `GET /memories/all/documents/:id`**. The document reads are the open note twice plus one per other note in the sidebar, used only to build preview text. Two windows opened together (34 requests) already exceed the burst of 30.
- After a typing pause each window sent 1 attention read and 1 related-notes search. No requests were seen during a 10-second idle period, but the attention list reschedules itself every 15 seconds (or at `nextWakeAt`), so an idle window should cost about 4 requests a minute. Not yet measured over a longer window.

**Code findings (current `master`, not yet confirmed at runtime):**

- `createAttentionList.load()` ([browser-attention.ts](../../src/adapters/http-server/browser-attention.ts)) cancels any in-flight request and starts a new one. Load-time callers in [notes-browser.ts](../../src/adapters/http-server/notes-browser.ts) include `sidebarPages.refresh()` on credential/brain setup (line ~1285), `reloadAttention(documentId)` when the opened note's live snapshot reports a title change (line ~1715), and a 1.5-second debounced `reloadAttention()` after snapshot updates (line ~1716). An aborted fetch has usually already reached the proxy and still counts against the limit.
- Sidebar previews ([browser-page-navigation.ts](../../src/adapters/http-server/browser-page-navigation.ts) `render()`, lines ~172–191) call `fetchPreview` → `GET /memories/all/documents/:id` for each visible pinned, recent (8 by default) and open-settled (10) row, up to 4 at a time. A row is re-read when its `sourceVersion` changes, or after 10 seconds when the version is absent. The whole note is downloaded to keep a short `readablePreview`, plus `recognition.updatedAt` and `recognition.editor`.
- The server's attention scan ([app/attention.ts](../../src/app/attention.ts) `listMemoryAttention`) already reads every canonical note's Markdown for frontmatter. `AttentionPage` in the browser already declares an optional `preview` that the server never sends. The protocol currently says the response has no body payload ([protocol](../../docs/shared-memory-protocol.md#get-memoriesallattention)).

## Brief

Cut the HTTP requests a shared-brain window makes on open and while idle, so several windows, people and agents behind one address stay within a proxy limit. Read attention once per load, and deliver sidebar preview text with the attention list instead of one whole-note read per row. Keep sidebar content, ordering, freshness and failure behavior the same.

## Relevant Files

- `src/adapters/http-server/browser-attention.ts` — attention list loader, cancellation and the 15-second refresh timer.
- `src/adapters/http-server/browser-page-navigation.ts` — sidebar rendering and per-row preview fetching.
- `src/adapters/http-server/notes-browser.ts` — load-time and editor callers of `refresh()` / `reloadAttention()`; `fetchPreview` wiring.
- `src/adapters/http-server/search-presentation.ts` — `readablePreview`, the browser's preview text cleanup.
- `src/app/attention.ts`, `src/app/server-memory/attention.ts`, `src/types.ts` (`MemoryAttentionNote`) — server attention packet.
- `src/adapters/http-server/routes.ts` — `GET /memories/all/attention` route.
- `integrations/macos-companion/gateway.mjs` — forwards the attention route for the Mac app; check that a larger response still fits its limits.
- `src/adapters/http-client/index.ts` (`listMemoryAttention`), `src/cli/attention.ts` — CLI consumers of the same packet; confirm additive fields stay compatible.
- `docs/shared-memory-protocol.md#get-memoriesallattention`, `src/adapters/http-server/browser.docs.md` (sidebar preview line ~46) — contract and module docs.
- Tests: `test/browser-page-navigation.test.js`, `test/note-attention-browser.test.js`, `test/note-attention.test.js`, `test/attention-cli.test.js`, `test/backend-rpc-contracts.test.js`; browser: `scripts/collaborative-sidebar-smoke.mjs`, `scripts/collaboration-overlap-smoke.mjs` (existing per-keystroke read assertion).

### Notes

- Markdown stays canonical: previews are derived display text, never stored or used as an editing baseline. The open note keeps its live-snapshot preview (`sidebarPages.observe`).
- Previews must be bounded server-side (count and characters per note) so the attention response stays small. No full bodies, no frontmatter values beyond what is shown today.
- Version mismatch: a new browser against an older server (no `preview` field) must still work, with the old per-row reads as a fallback. An older client ignores the additive field. Live protocol and WebSocket traffic are out of scope.
- Do not change the proxy limit, add caching layers or polling, or change ordering/settle/snooze semantics. Keep the existing recovery (a passing failure keeps rows on screen; retry after 30 seconds).
- Verification needs a request count before and after, measured the same way as above, on a disposable local brain and then on the shared test brain. That brain allows adding and editing test notes only, never deleting.
- Finish under [task workflow](../../docs/task-workflow.md) and [testing](../../docs/testing.md); add a pending note to `release-next.md`.

## Tasks

- [ ] 1.0 Pin down the current request pattern
  - [ ] 1.1 **Clarify:** What counts as success: a request budget for opening a window (for example "at most N"), or just "attention once, previews in the attention response"?
  - [ ] 1.2 Turn the measurement script into a reusable Chromium smoke on a disposable local brain. Count HTTP requests by route for: opening one window, a 60-second idle period, typing then pausing, and navigating to a second note.
  - [ ] 1.3 Trace which callers issue the three load-time attention reads, and whether earlier ones are aborted after reaching the server. Record the call sequence.
  - [ ] 1.4 Measure the idle refresh rate per window over at least 60 seconds, to confirm or correct the estimate of about 4 requests a minute.
- [ ] 2.0 Read attention once per load
  - [ ] 2.1 **Clarify:** Should a burst of reload triggers coalesce into one trailing request (debounce), or join a request that is already in flight?
  - [ ] 2.2 Coalesce `load()` / `reloadAttention()` calls that arrive while a request for the same scope is pending, instead of aborting and restarting. A scope change (brain or credential switch) must still cancel and refetch.
  - [ ] 2.3 Remove redundant load-time triggers found in 1.3 (for example the initial title-change reload when the title did not actually change). Keep immediate reloads after real renames, settle/snooze and note creation.
  - [ ] 2.4 Keep the 15-second / `nextWakeAt` refresh and the 30-second failure retry. Do not let coalescing delay the visible result of a user action.
  - [ ] 2.5 Unit tests in `test/browser-page-navigation.test.js` / `test/note-attention-browser.test.js`: one request per load, scope change still cancels, failure keeps rows.
- [ ] 3.0 Include bounded previews in the attention response
  - [ ] 3.1 **Clarify:** Is adding preview text to `GET /memories/all/attention` acceptable (recommended: no new route, and the server already reads each note), or should it be a separate batch endpoint?
  - [ ] 3.2 Move the preview text rule into shared code usable by the server, or add a server equivalent with the same output as `readablePreview`. Cap characters per note and limit previews to the notes the sidebar can show.
  - [ ] 3.3 Add optional `preview` (and, if needed, last-editor) fields to `MemoryAttentionNote`, populated by `listMemoryAttention` from the Markdown it already reads. Keep the scan's existing cost profile: no extra file reads.
  - [ ] 3.4 Confirm the CLI `attention` output, the HTTP client and the companion gateway still accept the larger packet within their existing limits.
  - [ ] 3.5 Server tests: preview present and bounded, hidden paths/duplicate IDs still excluded, no frontmatter or secrets leaked, settled notes covered.
- [ ] 4.0 Use attention previews in the sidebar
  - [ ] 4.1 **Clarify:** For pinned notes that are not in the attention response (beyond the 100-entry caps), is a per-note read acceptable, or should they show the title only?
  - [ ] 4.2 In `render()`, prefer `preview` from the attention entry for the current `sourceVersion`. Call `fetchPreview` only when the field is missing (older server) or the note is pinned but absent from the packet.
  - [ ] 4.3 Keep the open note's live preview, age labels (`updatedAt`, due labels) and editor attribution unchanged. Compare rendered rows before and after on the same brain.
  - [ ] 4.4 Tests: no document reads for rows with attention previews; fallback reads still happen against an older-server packet; scope/credential changes still discard previews.
- [ ] 5.0 Verify, document and finalize
  - [ ] 5.1 Build, run the selected unit tests and the request-count smoke from 1.2, and record request counts before and after.
  - [ ] 5.2 Run `scripts/collaborative-sidebar-smoke.mjs` and the per-keystroke assertion in `scripts/collaboration-overlap-smoke.mjs`. Note that their known pre-existing stopping points (recorded in the coediting task) are not new failures.
  - [ ] 5.3 Deploy a dev build to the shared test brain (per its private notes, with symlink rollback) and repeat the two-window measurement. Edit only a test note; delete nothing.
  - [ ] 5.4 Update the attention section of the protocol doc, `browser.docs.md`, `release-next.md` and the feedback follow-up index. Archive this list and commit under the task workflow.
