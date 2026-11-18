# Make attention actions work on the open live note

Status: completed 2026-11-18 on branch `worktree-agent-afd4673cff8198cd8`; pending independent review and merge.

## Completed — 2026-11-18

The headline failure this list was written for no longer reproduced: the [single-user recovery/settlement task](2026-11-10_tasks-single-user-recovery-settlement.md) had already replaced `acceptMetadata: () => false` with a revision-aware confirmation through the live owner (an observational live `open` accepted by the ordinary snapshot queue, with scope/principal/generation/clean-source fences). Clean current-note Settle/Snooze/Bring back/Undo passed in Chromium on unmodified `master`.

Reproduction against the remaining acceptance found three residual defects, now fixed without a new wire method, a second baseline or HTTP-supplied revisions:

- **A committed write was reported as a failure.** When a peer revision landed after the guarded PATCH committed but before its reply, the open note correctly showed the newer revision, but the action said "The note changed while saving. Reopen it…", offered no Undo and left the sidebar stale. `note-attention.ts` now treats a valid receipt as proof of the canonical write and the editor's confirmation as a separate fact: an unconfirmed open note gets "Attention saved, but the open note changed afterwards or has not caught up yet…", no Undo, and a sidebar reread. No reopening, no adoption of the receipt.
- **A lost PATCH reply showed the raw transport text "Failed to fetch".** A dispatched PATCH with a lost, malformed or 5xx reply is now reported as possibly saved, rereads the sidebar and is never retried. 412 and other 4xx stay "not saved"; pre-dispatch transport failures say the note could not be read.
- **Confirmation could fail while a checkpoint was mid-reconciliation.** `collaboration-editor.ts` `refresh()` returned false whenever a snapshot was still being reconciled (for example a metadata broadcast reading source history), so a receipt racing its own broadcast could be refused. It now awaits the in-flight reconciliation and then applies the same fences.

Readers now get a reader-access message for the open note before any PATCH (they were already refused, with a misleading "could not confirm" message). Other-note behavior, standalone HTTP sessions, pins, Undo and scope fencing are unchanged.

## Goal

Let Settle, Snooze, Bring back and their Undo work on the currently open live
note while preserving its body, title, private draft, selection and own Undo.
Keep one authoritative collaboration source revision and existing permissions.

## Evidence and scope

- The [completed session refactor](2026-11-08_tasks-editor-session-contract-refactor.md) deliberately preserved this limitation: `live-editor-session.ts` returns false from `acceptMetadata`. `note-attention.ts` requires acceptance for the current note before its guarded PATCH, so the action can stop before publication. This is source evidence; reproduce the exact shipped user-visible failure before implementing. *(Superseded on 2026-11-10 by `524ee962`; see outcome.)*
- HTTP document receipts identify content hashes but do not establish live epoch/revision. Do not fix this by accepting arbitrary receipts, copying a second mutable baseline, inventing revision numbers, or discarding/reopening the editor.
- Reuse the existing collaboration publication queue, live snapshot/history and hash guards. Choose the smallest revision-aware reconciliation or publication path after tracing the current HTTP/live race; a new metadata wire method is not assumed necessary.
- Keep attention semantics in core/app, and routes/presentation thin. Preserve protected frontmatter, exact body bytes, edit provenance/date policy, permissions, no automatic mutation replay, and reader/blocked/offline safeguards.
- Scope is existing attention controls and the shared session contract. General custom properties/saved views were dropped in favor of boards. Do not introduce a framework or generic event bus.

## Tasks

- [x] 1.0 Reproduce and name the publication agreement.
  - [x] 1.1 Read architecture, browser, live and collaboration owning docs; trace current-note GET/accept/PATCH versus live notification/history ordering and the matching HTTP-only behavior.
  - [x] 1.2 Retain a failing regression for an attention action on the actual open live session. Distinguish an action on another sidebar note; assert whether PATCH was dispatched, canonical attention and exact body bytes, plus visible outcome.
  - [x] 1.3 Define the minimum accepted metadata evidence, navigation barrier and permission/scope checks. Account for live notification arriving before/after the HTTP receipt, a newer peer body/title revision and a lost response. Preserve uncertainty instead of retrying a possibly committed PATCH.
- [x] 2.0 Implement one revision-aware path for current-note attention.
  - [x] 2.1 Compose metadata publication/reconciliation against the existing live owner. Preserve pending-input flush, private-draft durability and actor-local Undo; keep standalone HTTP sessions working.
  - [x] 2.2 Fence work across note, brain, principal, tab and disposal changes, including transports that ignore abort. Do not adopt a stale metadata baseline or reset selection/history to reconcile it.
  - [x] 2.3 Preserve sidebar settle/removal, local pin rules, Undo and scoped busy/error feedback. Confirm a saved mutation separately from receipt uncertainty and derived indexing.
- [x] 3.0 Verify and finalize.
  - [x] 3.1 Build once; run affected session, attention-browser and canonical attention tests. Include delayed/reordered HTTP/live confirmations, stale hash, peer edits, lost PATCH reply, readonly/offline states and scope cancellation. Assert protected metadata, exact body/title, caret/selection and own body Undo after metadata-only publication.
  - [x] 3.2 Exercise the shipped server/editor in Chromium at 1280/390px with a disposable brain: edit then Settle, action Undo, Snooze/Bring back, another-note action and permission/scope changes. Extend the existing attention smoke/fault injector rather than create a second harness. State native/other-browser limits honestly.
  - [x] 3.3 Run the focused frozen editor profile only if input/history/recovery behavior changes; preserve original observations and review any exact assertion deltas. Check the ordinary bundle/package budgets for the final change. *(Profile not run: input, history and recovery behavior are unchanged; budgets checked.)*
  - [x] 3.4 Update owning docs and pending user-facing release notes, record tested source/results/limits, then archive and commit under [task completion](../../docs/task-workflow.md). No push, installation or release is implied.

## Agreement (1.3)

- **Before PATCH (open note only):** flush pending input; refuse readers; the live owner must confirm the freshly read hash/body/title through its own live `open` snapshot at its actual epoch/revision (`acceptMetadata`). Private input, uncertain writes, composition, blocked/offline state, changed scope/principal/generation or disposal fail closed and send no PATCH.
- **PATCH:** explicit action intent with `If-Match` from that read; the server's shared publication queue serializes it with live edits, so the next content-changing revision after the confirmed checkpoint is necessarily this write.
- **After PATCH:** a valid receipt is the saved fact. The open note's confirmation (exact receipt hash, either receipt/checkpoint order, awaiting an in-flight reconciliation) decides only whether Settled/Undo/pin projection is shown; otherwise the toast says it saved and the sidebar is reread. The receipt is never adopted as live state.
- **Uncertainty:** a lost/malformed/5xx reply after dispatch is "possibly saved", never retried. Scope/note/editor changes during any await suppress feedback and Undo (`valid()`), including when abort is ignored.

## Verification

Tested source: `master` at `3a1f42c2` plus this task's scoped changes; one `npm run build` of the final source, reused by every check below (only the smoke script and docs changed afterwards, and the smoke was rerun on that build).

- Reproduction on unmodified `3a1f42c2`: `scripts/note-attention-smoke.mjs` and `scripts/single-user-recovery-settlement-smoke.mjs` passed (clean current-note attention already worked). A disposable Chromium probe then showed the peer-race false failure, the raw "Failed to fetch" toast for a lost reply, and that own body Undo after a metadata checkpoint already worked.
- Regression sensitivity: the new `editor-session` reconciliation case fails against the original `collaboration-editor.ts` (`false !== true`); the extended single-user smoke fails against the original `note-attention.ts`/`collaboration-editor.ts` build at the peer-race assertion (actual "The note changed while saving. Reopen it…").
- `npm run build`: passed. Editor bundle 560,520 bytes minified / 184,942 gzip (baseline 184,848; +94 bytes).
- `node --test test/editor-session.test.js test/note-attention-browser.test.js test/note-attention.test.js test/collaboration-editor.test.js test/lexical-bundle.test.js`: 68 passed, 0 failed/skipped.
- `npx --package=playwright node scripts/single-user-recovery-settlement-smoke.mjs`: passed twice consecutively, 24 checkpoint groups at 1280/390px on a real disposable HTTP/WebSocket server. New groups: edit then Settle keeps the caret and exact source and own body Undo works across the metadata checkpoint (resurfacing the note by policy); another note's Settle/Undo leaves the open note's caret and bytes untouched; a peer revision racing the receipt reports a saved change without Undo, retry or reopen; a lost reply is uncertain, committed and not retried; a reader cannot change the open or another note (0 PATCHes for the open note, 403 for the other); a synthetic mid-reply scope change suppresses stale feedback/Undo without a repeated write. An earlier run that reused the scope-bumped tab failed afterwards because the bump legitimately retired its editor; the check now runs in its own disposable tab.
- `npx --package=playwright node scripts/note-attention-smoke.mjs`: PASS (settle/direct link/reactivate, exact metadata/body/caret, pins, snooze presets/custom, deadline wake, failed-save guard/recovery, toasts, two themes at 1280/390/320).
- `npm run check:package-size` (with this worktree's QMD engine `node_modules` moved aside, as in a normal pack): archive 3,202,592 / 3,300,000 bytes, unpacked 8,845,102, 764 files.
- `git diff --check`: clean.

## Remaining limits

- Chromium on a disposable local server only. Native Mac lifecycle, other browser engines, physical input/IME, a live VPS and real credential or brain switching during a held reply were not exercised; the mid-reply scope change is a synthetic credential-revision bump, while real scope/principal/cancel fences remain covered by `editor-session` unit tests.
- After an unconfirmed-but-saved outcome the local pin is kept and no Undo is offered; the user acts again from the reread sidebar. An action on another note still waits for the open note's pending input to flush, as before.
- The frozen editor profile was not run because input, history and recovery behavior did not change.
