# Live external document updates

**Finalized 2026-10-18 — complete.** Completed external refresh, guarded independent-edit merging, and recorded local installation/browser verification. Archived with user approval. Verification below is historical; no implementation checks were rerun for this archival pass.

Status: implementation and focused verification complete on 2026-10-16; archived on 2026-10-18. Installed locally as v0.3.1 on the user's subsequent update request.

## Goal

Let an agent work in its terminal while the user keeps jumpyBrain open. The displayed note should pick up saved external changes smoothly and briefly show what changed. Treat this as a personal editor with practical overwrite protection, rather than building a collaboration engine.

## User direction

- Keep the terminal agent workflow; defer [embedded agent chat](../later/tasks-agent-workspace.md).
- Autosave should make ordinary handoffs easy. Avoid silent overwrites with a small set of guards; do not add heavy coordination for rare overlaps.
- Make external work visible: a quiet update indicator and a short-lived diff/highlight would make changes understandable and enjoyable.

## Baseline inspected before implementation

- The editor debounces autosave by 750 ms. Saves send the last confirmed full-document content hash through `If-Match`; stale writes receive 412 and retain the local draft with autosave blocked.
- `document-controller.ts` already tracks saved body/title, draft revisions, in-flight/unconfirmed saves, document generation, and reconciliation tokens.
- Its persistent-editor reconciliation explicitly refuses an externally different body. The current note view does not continuously watch for external content changes.
- Document GET reads canonical Markdown and returns a full-file hash; showing a known document does not require waiting for search indexing.
- `lexical-editor.ts` currently rebuilds nodes, clears selection, and clears undo history in `setMarkdown`. Calling it naively for every external update would disrupt the writing experience.
- CLI updates support content-hash preconditions and cooperating publication locks. Raw filesystem writers ignoring those locks can still race; autosave and polling do not create filesystem compare-and-swap.

## Implemented first version and design notes

### Detect changes with a small polling loop

- Start with one non-overlapping check of the visible open document about every two seconds, plus a check on returning to the app. Pause hidden/background pages and back off on failures. Measure canonical lookup/read cost before settling the interval; existing GET sends the document and may scan for its ID.
- Reuse the authenticated document read and full-file hash initially. Avoid an index refresh, full graph reload, new event service, or mandatory WebSocket connection. A conditional/hash-only read can follow if measurement warrants it.
- Fence every response by document identity, credentials, companion generation, draft revision, and the baseline hash captured at request start. Leaving a note, switching brains, or starting a save invalidates stale results.
- An unchanged hash or the editor's own confirmed save produces no external-change animation. Metadata-only changes refresh metadata without flashing unchanged paragraphs.

### Refresh safely and visibly

- When the local draft is clean and no save is running or unconfirmed, accept a newer canonical snapshot without writing it back. Recheck those conditions immediately before applying it.
- Do not replace text during IME composition, active typing, or a selection gesture. Focus alone should not permanently prevent refresh. Retain the latest pending update and recheck once interaction settles.
- Preserve scroll and map caret/selection where practical. Establish a deliberate undo boundary so Undo cannot silently write an older version over newly accepted external work. Avoid accidental title/caret movement or autosaves caused by hydration.
- Show a small accessible "Updated elsewhere" notice. Briefly tint changed/new paragraphs or add a subtle gutter marker for roughly four seconds, then fade without shifting layout. Respect reduced motion and the existing themes.
- Highlighting is presentation only: never insert diff syntax into canonical Markdown or the editable document. Coalesce successive updates so polling does not repeatedly restart the same animation.
- Deletions need a notice/count or a bounded optional "View changes" comparison; deleted text should not be inserted into the live document. Keep before/after snapshots transient and scoped to this document session.
- Use "Updated elsewhere" unless reliable writer provenance exists. A different hash cannot distinguish an agent, another tab, a person, or a filesystem tool.

### Handle the overlap case simply

- If there is a local draft, in-flight save, uncertain save outcome, or conflicting newer snapshot, retain the draft and show "Changes available". Do not advance its saved hash to bypass the existing write precondition.
- Keep the server's hash check as the final guard if external work lands between a poll and autosave. Retain copy/recovery and an explicit load-latest action; expose comparison if needed. No automatic three-way merge in the first version.
- Missing/deleted notes, offline/authentication errors, and stale companion sessions must not clear a draft. Distinguish those states from a valid empty document and avoid repeated intrusive notifications.
- Agents should use `jumpybrain show` / `update --if-match` for supported updates. Direct file edits should be observed when valid complete Markdown is readable, with the existing documented limits for uncoordinated writers.

## Tasks

- [x] Inspect autosave, reconciliation, browser hydration, and canonical document-read/update contracts.
- [x] Add a bounded visible-document watcher with cancellation, backoff, foreground refresh, and target fencing.
- [x] Add clean-snapshot acceptance and pending-external-change state to the document controller without weakening stale-write protection.
- [x] Implement external editor refresh with interaction/selection/scroll/undo handling and no hydration-triggered writes.
- [x] Add the brief changed-paragraph treatment and accessible update/pending indicators; make deletion feedback understandable.
- [x] Verify actual browser behavior using disposable notes: terminal/CLI and filesystem edits, typing during a delayed check, save-vs-poll races, renames, multiple updates, deletion, recovery, and navigation. Scope/hidden/offline fencing also has focused unit coverage; existing companion smoke covers brain switching and read-only behavior.
- [x] Add focused regression coverage for the state/race behavior and check that visual decoration never persists into Markdown.
- [x] Update the browser/editor contract and record polling limits. Added one changelog highlight for the new user-facing workflow.

## Relevant files

- `src/adapters/http-server/document-controller.ts` — saved/draft baselines, reconciliation, and conflict state.
- `src/adapters/http-server/notes-browser.ts` — note lifecycle, refresh UI, and recovery.
- `src/adapters/http-server/lexical-editor.ts` — external snapshot application and selection/history behavior.
- `src/adapters/http-server/external-document-updates.ts` — visible-note watcher and linear source-line highlight/caret hints.
- `src/adapters/http-server/graph-page.ts`, `browser-transport.ts`, `companion-browser.ts` — authenticated transport and companion lifecycle.
- `src/adapters/http-server/browser.docs.md`, `http-server.docs.md`, `src/architecture.docs.md` — owning contracts and dependency boundaries.
- `docs/shared-memory-protocol.md` — canonical document reads, content hashes, and publication limits.
- Existing browser/editor/controller and document-update tests, plus production browser smoke runners — extend focused coverage after choosing the implementation seam.

## Verification and limits

- Build and 165 focused Node tests passed, including twelve new external-update cases, existing editor/save/companion behavior, themes, bundle weight, and architecture boundaries. Bundle remains below its 160 KB gzip review gate.
- `npx --package=playwright node scripts/external-document-updates-smoke.mjs` passed at 1280px and 390px with a real server and CLI against disposable Markdown. Covered external CLI/file writes, highlights and expiry, dark/reduced-motion presentation, caret/scroll preservation, undo baseline and subsequent local undo, synthetic composition/selection deferral, a delayed GET followed by typing and rejected stale PUT, explicit draft comparison/reload, empty-body deletion, missing-note reads, and stale responses after navigation. No writes occurred from clean refresh/hydration.
- Existing Lexical preservation/security smoke passed at both widths. Companion browser smoke passed, including two-tab save/switch barriers, conflicts, read-only targets, expired sessions, and stale links.
- Observed local document reads in the small browser fixtures were below 50 ms. A separate disposable 1,000-note fixture returned five reads in 88, 58, 57, 54, and 51 ms. This includes full canonical ID discovery; it is not a general performance guarantee or a remote/shared-load benchmark.
- Highlights are approximate source-line hints, not a full diff. Deletions receive the update notice; no deleted-text overlay, persistent diff log, automatic merge, or writer attribution was added. Carets in changed/deleted lines use a clamped nearby position; noncollapsed selections defer refresh.
- Physical IME/mobile input, assistive technology, Safari/Firefox, and a live remote VPS were not tested. Read errors keep the current content; they do not automatically treat a missing note as empty or resolve an uncertain save.
- Screenshots were visually checked from the private local visualization directory; personal/shared memory and the installed app/runtime were not changed. Unrelated existing worktree edits were preserved.

## Local installation — 2026-10-16

- User requested the local CLI update after implementation. Used the managed installer from this checkout to update the shared runtime and native companion to v0.3.1, preserving memory, profiles, and agent integrations.
- Closed the Electron editor through its normal close/save guard, stopped the identified native companion through its handled graceful termination signal, and reopened both after the installer succeeded.
- Installed CLI reports `0.3.1`. Verified byte-for-byte equality of the CLI entrypoint, editor bundle, and external-update module against the built checkout. Confirmed the reopened Electron editor displays the updated UI and its existing local brain connection.

## Live test follow-up — 2026-10-16

- The user tested October 16 while typing. The initial stale-write guard kept their draft but exposed a technical hash error; the conservative merge behavior below supersedes the first-version decision to require manual recovery for every overlap.
- Confirmed stale saves now reread and merge independent source-line edits and simultaneous end additions only after typing/selection/composition settles. Recheck editor identity, credentials/brain scope, revision, and hash after reading. Preserve If-Match publication and never merge an uncertain save. Overlapping/same-line edits and title disagreements retain both versions for explicit review with friendly feedback; repeated contention has a bounded retry limit.
- Added the requested desktop sidebar toggle, remembered before paint and across tabs, with accessible labels/keyboard activation. Narrow screens retain their top navigation. No editor rehydration or document request occurs when toggling.
- Combined follow-up verification: build and 136 focused Node tests passed; real CLI/browser smoke passed at 1280px and 390px, including sidebar reload/cross-tab persistence, narrow navigation, keyboard activation, caret/editor identity, preserved typing/undo, and no writes for clean presentation changes. Light/dark collapsed screenshots were visually checked. The same run reverified idle merges, independent edits, concurrent end additions, explicit overlap review, highlight expiry, recovery, deletion/read failures, and navigation. Companion and note-lifecycle smoke also passed before adding the presentation-only sidebar toggle.

- Installed the combined follow-up through the managed local updater (v0.3.1), preserving memory/profiles/integrations. Verified installed sidebar/controller/merge/watcher sources match this checkout, reopened the native companion and Electron, and confirmed Collapse sidebar changes to Expand sidebar with navigation hidden. Left Home open with the sidebar collapsed.
