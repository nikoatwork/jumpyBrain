# Four-hour UX improvement loop

Owner request: “hill climb in a loop for 4h.” Started 2026-11-04 21:21:15 UTC; deadline 2026-11-05 01:21:15 UTC. Base: `577c31e`. Work alone; no delegated agents requested.

Use frozen [experience rubric](../../evals/workspace-experience/rubric.md), [missions](../../evals/workspace-experience/journeys/core.md) and [native baseline](../../evals/workspace-experience/reports/2026-11-03-baseline.md). Record proposed effects and protected neighbors before editing. Keep verified improvements; revert losing candidates. Browser/deterministic evidence is separate from native UX scoring; no composite score.

- [x] Confirm clean checkout, read owning docs and freeze deadline/evaluation boundaries.
- [ ] Reproduce remaining own-edit external feedback, retained-version repetition and live-connection failure messaging.
- [ ] Iterate on reproduced findings with canonical/draft/navigation/access safeguards.
- [ ] Probe core capture, search/handoff, boards, coauthoring and off-note transitions for further concrete friction.
- [ ] Run broader checks on the final retained snapshot, record gains/losses and remaining limits.
- [ ] Archive this list and commit final evidence by the deadline.

No push, product install, release, VPS deployment or remote-memory writes. Disposable localhost fixtures only. Native Mac tooling is unavailable; native checkpoints remain not observed. Existing UX candidate: [2026-11-04](../../evals/workspace-experience/reports/2026-11-04-feedback-candidate.md).

## Iterations

Record each hypothesis, pre-fix evidence, candidate, checks and keep/revert decision below. Completed implementation increments use their own archived task records and scoped commits; this list owns the overall timed loop.

### Iteration 1: own-edit notifications

Hypothesis before editing: title and Undo acknowledgements pass through `accept(snapshot)` without the body flight marker, so their revision changes are labeled remote. Expected gain: quiet own saves/history while a different tab (including the same authenticated principal) still produces external-change feedback. Protect source/history validation, concurrent foreign history and draft rebasing. Add a real-browser reproduction before changing the implementation.

### Iteration 2: loaded note versus live editing failure

Hypothesis before editing: the shared `showNote` catch treats `/capabilities` 404 as a missing document even after the canonical document loaded. Expected gain: preserve visible saved content, identify editing as unavailable, offer a retry and allow safe clean navigation; actual document 404 must still be a missing-note outcome. Neighbor checks: read-only controls, canonical bytes unchanged, no legacy PUT fallback, reconnect, and matching visible/accessibility status. Offline clean notes must not claim a private draft exists.

Iteration 1 retained: own rename reproduced before the fix; 14 browser checkpoints, 33 focused tests and desktop/mobile external-update neighbors passed. [Archived increment](../done/2026-11-04_tasks-ux-own-edit-feedback.md). No native score assigned.

Iteration 2 retained after one rejected candidate: failed-save state blocked clean Home navigation. Corrected to keep confirmed read status; seven failure/retry/Home/Back scenarios passed with 29 focused tests, fresh-note and 11 retained-version neighbor scenarios. [Archived increment](../done/2026-11-04_tasks-ux-editor-availability.md). This is error honesty/recovery, not a VPS transport repair.

### Iteration 3: acknowledge a retained comparison without losing access

Hypothesis before editing: “Keep current note” closes the dialog but leaves identical retention guidance active indefinitely. Expected gain: after a verified comparison and explicit Keep current, quiet this exact retained-record notice in the current tab/scope while leaving a Retained versions action. New retained records, failed/stale comparisons and incomplete discovery must not be silently acknowledged. Do not delete records or persist note contents/preferences. Clear bounded acknowledgments on scope change; Escape alone is not a review decision.

Iteration 3 retained: explicit verified Keep current quiets its exact record, retaining comparison access. Ten desktop/mobile acknowledgment scenarios, 11 existing recovery scenarios and four comparison tests passed against a source-matched temporary production build. [Archived increment](../done/2026-11-04_tasks-ux-retained-review.md). Native scoring unobserved; acknowledgments reset on reload.

### Iteration 4: finish versus interruption

Baseline finding 4: generating presence disappears on both finish and cancel. Expected gain: a quiet note-scoped confirmed terminal cue distinguishes generation finished, explicitly stopped and interrupted. Do not infer a completed task/document or completion from disconnection/presence loss. Protect simultaneous streams, same stream IDs owned by different actors, deduplication, epoch/note/brain transitions, saved text and other-writer focus. Older servers without actor identity get no inferred completion cue. Require observed active stream plus terminal state for that exact opaque actor/stream identity.

Broad-check observation: `node --test` against the built iteration-2 artifact completed 1,909 tests in ~514 seconds: 1,863 passed, 29 failed, 17 skipped. Most failures report the unavailable required QMD 2.8.3 engine; one updater expectation assumes macOS. Two footprint guards failed (editor gzip and package archive). A pristine `6d06cb9` snapshot is being built to establish the pre-loop budget state before accepting any allowance. Full output stays in `/tmp/jumpybrain-ux-full-2026-11-04.log`. The main built artifact was held unchanged during this run; later source-only candidates were tested separately.

Iteration 4 retained: actor/stream-correlated confirmed terminal cues, never completion from presence loss. Six real CLI/browser cases, ten retained-review neighbors, 66 compiled-artifact tests and 17 boundary checks passed. Measured +595 editor gzip bytes with unchanged dependencies; targeted existing whitespace compaction preserves all distribution ceilings. [Archived increment](../done/2026-11-04_tasks-ux-generation-feedback.md).

Engine preparation: existing global QMD is 2.5.3; required 2.8.3 was provisioned from the repo engine lockfile into a temporary validation directory. No global engine/product install or model download. Pinned-engine CLI error suite passed all three cases. One attempt overlapped a clean rebuild and was invalidated by removed dist files; only the subsequent stable-artifact run counts.

### Iteration 5: actionable invalid retrieval options before tool setup

Broad checks exposed an invalid `--depth sideways` reporting QMD setup failure first when the engine is missing. Expected gain: identify the invalid user option before engine work or remote credential lookup. Protect normal/compact local/remote retrieval and recipe routing. Pre-fix deterministic reproduction reached `localMemory.searchMemory` for invalid input instead of rejecting it; the transport trap failed as expected. This is a validation-order fix, not a retrieval ranking change.

Iteration 5 retained: invalid retrieval depth now names allowed values before engine or remote credential access. The no-transport regression covers eight lanes; six no-engine and 25 pinned-engine neighboring checks passed. [Archived increment](../done/2026-11-04_tasks-ux-retrieval-option-errors.md). No retrieval-policy/ranking or canonical behavior changed.

### Broader mission probes on `c63cbad`

Pinned-engine full suite started against a stable built artifact (no overlapping rebuild). The existing real note-lifecycle browser journey passed capture/title/body, immediate search, graph, guarded two-tab recovery, 390/320 layouts, delete cancel/apply, backlinks and index refresh. This is neighboring browser evidence, not a native score or evidence of new improvement. Writing-workspace and board journeys are running next; pristine updater testing separately checks whether the Linux failure predates this loop.

### Verification harness correction

The broad writing smoke checked “Saved” as soon as HTTP content became visible, before live editing opened. It also injected HTTP PUT failures although source edits now use WS RPC. The board smoke similarly failed its unsaved-draft assertion because its HTTP fault never reached a live edit. These are invalid/premature probes, not observed product loss. Update the helpers to wait for actual confirmed live state, inject failure on the shipped live transport, and recover through visible review UI; retain original failures in the log. Separately, pristine `6d06cb9` reproduces the updater test's macOS-only lock expectation on Linux; assert the actual platform refusal there instead of claiming the lock path was exercised.

### Iteration 6: scoped Escape ownership

The corrected workspace probe found a real defect: Escape on a focused Bold button was already prevented in document capture, with no active dialog/menu. The visible selection-attribution hint consumes Escape globally, even when focus has moved to toolbar/search controls while the editor selection is intentionally preserved. Expected gain: attribution owns Escape only inside the editor, allowing focused formatting/find/search controls to handle their own Escape. Preserve editor-side hint dismissal, IME composition, selection, focus return and Markdown bytes. A targeted production-browser reproduction will separate this from the harness corrections.

Pinned broad run finished: 1,915 tests, 1,897 passed, 17 skipped, one known pre-loop updater platform expectation failed (the worker had loaded the old assertion before its correction). The corrected updater file separately passed 28 tests with four Mac-only skips. All engine-dependent failures disappeared with the pinned isolated engine. No blanket green-suite claim yet; final snapshot will be checked after retained fixes.

Scoped Escape candidate passed six focused browser cases at 1280/390 and the contextual-attribution journey (selection dismissal, saved/private scope, read-only/unknown attribution, responsive themes, Settings identity and actual CLI writes). The larger writing journey now reaches its later copy-feedback probe; that outcome remains under investigation. Candidate artifacts are source-matched temporary builds until the main pinned run finishes.

### Iteration 7: search-warning scope and certainty

The writing copy probe's clipboard readback passed, but its confirmation was blocked by a persistent warning from `search-maintenance` after Search had closed. Observed state: live saving with no editor error, toast “Search is unavailable. Open search for recovery.” Host auto-index is deliberately disabled in that fixture; unavailable freshness does not prove search itself cannot answer. Expected gain: suspend clears only this surface's warning/indicator, reentry rechecks/reports the state, and wording preserves uncertainty. Protect genuine save errors, stale result visibility, read cancellation, same-state reentry and freshness recovery. Do not alter global notification priority or repair indexes automatically.

Iteration 7 retained: six targeted warning-scope cases and 36 related tests passed. After fixing an invalid dual-hold ordering in the copy test fixture, the full writing journey also passed on the combined candidate. Only the owned hung fixture process was stopped; no shared service was touched. [Archived search increment](../done/2026-11-04_tasks-ux-search-warning-scope.md).

Iteration 6 retained: scoped Escape passes six targeted cases, contextual attribution and full writing-workspace neighbors. [Archived increment](../done/2026-11-04_tasks-ux-scoped-escape.md). Native/physical IME scoring not observed.
