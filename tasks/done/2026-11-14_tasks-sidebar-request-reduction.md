# Read the sidebar list once and send previews with it

Status: **completed in source on 2026-11-14**; pending release. Planning notes below are kept as the record; see [Outcome](#outcome) for what shipped, the measurements and what the plan got wrong.

## Context

Follow-up to the [shared-brain admission errors](2026-11-14_tasks-shared-brain-admission-errors.md) investigation. On 2026-11-14 the owner asked whether typing pushes one request per keystroke and hits the shared brain's proxy limit (Traefik: about 120 requests/minute per IP address, burst 30, refill about 2/second; that deployment's setting, not a product default). Then they asked for a task list covering:

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

- [x] 1.0 Pin down the current request pattern
  - [x] 1.1 **Clarify:** What counts as success: a request budget for opening a window (for example "at most N"), or just "attention once, previews in the attention response"?
  - [x] 1.2 Turn the measurement script into a reusable Chromium smoke on a disposable local brain. Count HTTP requests by route for: opening one window, a 60-second idle period, typing then pausing, and navigating to a second note.
  - [x] 1.3 Trace which callers issue the three load-time attention reads, and whether earlier ones are aborted after reaching the server. Record the call sequence.
  - [x] 1.4 Measure the idle refresh rate per window over at least 60 seconds, to confirm or correct the estimate of about 4 requests a minute.
- [x] 2.0 Read attention once per load
  - [x] 2.1 **Clarify:** Should a burst of reload triggers coalesce into one trailing request (debounce), or join a request that is already in flight?
  - [x] 2.2 Coalesce `load()` / `reloadAttention()` calls that arrive while a request for the same scope is pending, instead of aborting and restarting. A scope change (brain or credential switch) must still cancel and refetch.
  - [x] 2.3 Remove redundant load-time triggers found in 1.3 (for example the initial title-change reload when the title did not actually change). Keep immediate reloads after real renames, settle/snooze and note creation.
  - [x] 2.4 Keep the 15-second / `nextWakeAt` refresh and the 30-second failure retry. Do not let coalescing delay the visible result of a user action.
  - [x] 2.5 Unit tests in `test/browser-page-navigation.test.js` / `test/note-attention-browser.test.js`: one request per load, scope change still cancels, failure keeps rows.
- [x] 3.0 Include bounded previews in the attention response
  - [x] 3.1 **Clarify:** Is adding preview text to `GET /memories/all/attention` acceptable (recommended: no new route, and the server already reads each note), or should it be a separate batch endpoint?
  - [x] 3.2 Move the preview text rule into shared code usable by the server, or add a server equivalent with the same output as `readablePreview`. Cap characters per note and limit previews to the notes the sidebar can show.
  - [x] 3.3 Add optional `preview` (and, if needed, last-editor) fields to `MemoryAttentionNote`, populated by `listMemoryAttention` from the Markdown it already reads. Keep the scan's existing cost profile: no extra file reads.
  - [x] 3.4 Confirm the CLI `attention` output, the HTTP client and the companion gateway still accept the larger packet within their existing limits.
  - [x] 3.5 Server tests: preview present and bounded, hidden paths/duplicate IDs still excluded, no frontmatter or secrets leaked, settled notes covered.
- [x] 4.0 Use attention previews in the sidebar
  - [x] 4.1 **Clarify:** For pinned notes that are not in the attention response (beyond the 100-entry caps), is a per-note read acceptable, or should they show the title only?
  - [x] 4.2 In `render()`, prefer `preview` from the attention entry for the current `sourceVersion`. Call `fetchPreview` only when the field is missing (older server) or the note is pinned but absent from the packet.
  - [x] 4.3 Keep the open note's live preview, age labels (`updatedAt`, due labels) and editor attribution unchanged. Compare rendered rows before and after on the same brain.
  - [x] 4.4 Tests: no document reads for rows with attention previews; fallback reads still happen against an older-server packet; scope/credential changes still discard previews.
- [x] 5.0 Verify, document and finalize
  - [x] 5.1 Build, run the selected unit tests and the request-count smoke from 1.2, and record request counts before and after.
  - [x] 5.2 Run `scripts/collaborative-sidebar-smoke.mjs` and the per-keystroke assertion in `scripts/collaboration-overlap-smoke.mjs`. Note that their known pre-existing stopping points (recorded in the coediting task) are not new failures.
  - [x] 5.3 Deploy a dev build to the shared test brain (per its private notes, with symlink rollback) and repeat the two-window measurement. Edit only a test note; delete nothing.
  - [x] 5.4 Update the attention section of the protocol doc, `browser.docs.md`, `release-next.md` and the feedback follow-up index. Archive this list and commit under the task workflow.

## Outcome

**Owner decisions (2026-11-14):** merge reloads that arrive while one is pending and drop the unchanged-title trigger (2.1); put previews in the existing attention response, no new endpoint (3.1); a pinned note outside the 100-entry lists shows its title without a preview and is not read individually (4.1). 1.1 was not answered; the smoke asserts the concrete budget below.

**What changed**

- `createAttentionList.load()` shares a pending same-scope request and is satisfied by a list that landed within the last second. `load({ fresh: true })` (saves, renames, creation, removal, Retry) starts at once when idle, or runs once more after the pending request. Scope changes still cancel and refetch; `settle()` still fences older snapshots; the 15-second/`nextWakeAt` refresh and 30-second failure retry are unchanged.
- The first `pageshow` no longer starts a read (only a restored page does). A first live snapshot without an earlier observation is no longer treated as a rename.
- `GET /memories/all/attention` adds `preview` per returned note: at most 160 characters from the shared `core/readable-preview.ts` rule over a bounded 16 KiB no-follow leading read, for at most 200 notes, behind a disposable stat-keyed cache. The local runtime packet and CLI `attention list` output are unchanged (the CLI strips the field from hosted packets).
- The sidebar uses those previews. Per-row document reads remain only against a server that sends no `preview` field. The open note keeps its live preview; a note just left keeps it until the list reports a newer `sourceVersion`.

**What the plan got wrong**

- The three load-time attention reads were not the callers guessed in the code findings. Traced callers: the `installPageNavigation` initial load, the window's first `pageshow`, and `sidebarPages.select()` from the initial route (65, 70 and 91 ms after navigation locally; the first was aborted). `sidebarPages.refresh()` on credential setup and the snapshot title/1.5-second triggers did not fire at load in the hosted editor.
- The attention scan did **not** already read every note's Markdown: `readMarkdownDocument` reads only the frontmatter header. Previews therefore cost one bounded leading read per returned note on a cold cache, and none while files are unchanged. This is a deviation from 3.3's "no extra file reads" and from the "no caching layers" note: the cache is a derived in-memory memo of display text, like the existing settled-revision cache.

**Measurements** (Chromium, every request counted including aborted ones)

Disposable local brain, eight notes, one window, `scripts/sidebar-requests-smoke.mjs`:

| Phase | Before (requests / attention / note reads) | After |
| --- | --- | --- |
| Open a window on a note | 17 / 3 / 9 (1 aborted) | 7 / 1 / 1 |
| 60 seconds idle | 5 / 4 / 0 | 5 / 4 / 0 |
| Type 100 characters, pause | 1 / 1 / 0 | 1 / 1 / 0 |
| Navigate to another note | 6 / 1 / 2 | 5 / 1 / 1 |
| External edit to a sidebar note | 2 / 1 / 1 | 1 / 1 / 0 |
| Reload | 15 / 1 / 9 | 7 / 1 / 1 |

Idle cost is confirmed at four attention reads a minute per visible window (plus one related-notes search in the first minute), unchanged by design. Sidebar titles, preview text and ages were identical before and after.

Shared test brain (7 notes, two windows opened together on the Collab playground test note; server 0.3.23, then a dev build of this change):

| Phase | Before | After |
| --- | --- | --- |
| Open two windows | 32 requests: 6 attention, 16 note reads, 5 aborted | 14 requests: 2 attention, 2 note reads |
| 60 seconds idle, both windows | 10 (8 attention, 2 search) | 10 |
| Type 100 characters, pause | 2 attention | 2 attention |

No 429 in either run; 32 exceeded the burst of 30, 14 does not. The observing window received the edit. Rows matched before and after. The dev build was staged as `releases/0.3.25-dev-sidebar`, measured, and the brain was returned to 0.3.23 (verified active and serving); the staged directory remains for reuse. The only note edits were appended test lines in Collab playground; nothing was deleted.

**Verification** (working tree on `c5b88c2c`, one build)

- `node --test` on `note-attention`, `attention-cli`, `note-attention-browser`, `browser-page-navigation`, `backend-rpc-contracts`, `architecture-boundaries`, `server-http`, `http-client`, `package-entrypoints` (82 pass) and `folder-explorer-data`, `editor-session`, `electron-setup`, `notes-browser`, `macos-companion-gateway`, `search-recognition` (150 pass).
- `scripts/sidebar-requests-smoke.mjs`: pass, including the budget assertions and the older-server fallback (attention response stripped of `preview`: eight row reads, previews still shown).
- `scripts/collaboration-overlap-smoke.mjs` (including no per-keystroke document reads) and `scripts/sidebar-settle-smoke.mjs`: pass.
- `scripts/sidebar-smoke.mjs`: its stale-list age case now strips `preview` so it keeps covering the older-server path; that case passes. The runner then stops at its failed-save step, and `scripts/note-attention-smoke.mjs` stops at its failed-save step (line 201). Both stop at the same step on unmodified `master`, checked in a separate worktree, so their later steps are unverified here.
- `scripts/collaborative-sidebar-smoke.mjs` stops at the settled-shelf scroll (line 98), the stopping point already recorded for unmodified `master` in the [coediting task](2026-11-10_tasks-seamless-live-coediting.md); its later steps are unverified here.
- Companion gateway: the attention route is forwarded unchanged; worst-case packet (200 notes) is far below its 16 MiB response limit.

**Remaining limits**

- Not checked in the Mac app; the shared editor was verified in Chromium only.
- Idle polling (four reads a minute per window) is unchanged and is now the main steady cost of many open windows.
- One related-notes search was occasionally aborted when two windows opened together on the shared brain; not investigated.
- The benefit needs the server updated: the shared test brain is still on 0.3.23.
