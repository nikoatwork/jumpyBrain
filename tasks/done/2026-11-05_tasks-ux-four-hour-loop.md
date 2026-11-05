# Four-hour UX improvement loop

Owner request: “hill climb in a loop for 4h.” Started 2026-11-04 21:21:15 UTC; deadline 2026-11-05 01:21:15 UTC. Base: `577c31e`. Work alone; no delegated agents requested.

Use frozen [experience rubric](../../evals/workspace-experience/rubric.md), [missions](../../evals/workspace-experience/journeys/core.md) and [native baseline](../../evals/workspace-experience/reports/2026-11-03-baseline.md). Record proposed effects and protected neighbors before editing. Keep verified improvements; revert losing candidates. Browser/deterministic evidence is separate from native UX scoring; no composite score.

- [x] Confirm clean checkout, read owning docs and freeze deadline/evaluation boundaries.
- [x] Reproduce remaining own-edit external feedback, retained-version repetition and live-connection failure messaging.
- [x] Iterate on reproduced findings with canonical/draft/navigation/access safeguards.
- [x] Probe core capture, search/handoff, boards, coauthoring and off-note transitions for further concrete friction.
- [x] Run broader checks on the final retained snapshot, record gains/losses and remaining limits.
- [x] Archive this list and commit final evidence when the four-hour window completes.

No push, product install, release, VPS deployment or remote-memory writes. Disposable localhost fixtures only. Native Mac tooling is unavailable; native checkpoints remain not observed. Existing UX candidate: [2026-11-04](../../evals/workspace-experience/reports/2026-11-04-feedback-candidate.md).

## Iterations

Record each hypothesis, pre-fix evidence, candidate, checks and keep/revert decision below. Completed implementation increments use their own archived task records and scoped commits; this list owns the overall timed loop.

### Iteration 1: own-edit notifications

Hypothesis before editing: title and Undo acknowledgements pass through `accept(snapshot)` without the body flight marker, so their revision changes are labeled remote. Expected gain: quiet own saves/history while a different tab (including the same authenticated principal) still produces external-change feedback. Protect source/history validation, concurrent foreign history and draft rebasing. Add a real-browser reproduction before changing the implementation.

### Iteration 2: loaded note versus live editing failure

Hypothesis before editing: the shared `showNote` catch treats `/capabilities` 404 as a missing document even after the canonical document loaded. Expected gain: preserve visible saved content, identify editing as unavailable, offer a retry and allow safe clean navigation; actual document 404 must still be a missing-note outcome. Neighbor checks: read-only controls, canonical bytes unchanged, no legacy PUT fallback, reconnect, and matching visible/accessibility status. Offline clean notes must not claim a private draft exists.

Iteration 1 retained: own rename reproduced before the fix; 14 browser checkpoints, 33 focused tests and desktop/mobile external-update neighbors passed. [Archived increment](2026-11-04_tasks-ux-own-edit-feedback.md). No native score assigned.

Iteration 2 retained after one rejected candidate: failed-save state blocked clean Home navigation. Corrected to keep confirmed read status; seven failure/retry/Home/Back scenarios passed with 29 focused tests, fresh-note and 11 retained-version neighbor scenarios. [Archived increment](2026-11-04_tasks-ux-editor-availability.md). This is error honesty/recovery, not a VPS transport repair.

### Iteration 3: acknowledge a retained comparison without losing access

Hypothesis before editing: “Keep current note” closes the dialog but leaves identical retention guidance active indefinitely. Expected gain: after a verified comparison and explicit Keep current, quiet this exact retained-record notice in the current tab/scope while leaving a Retained versions action. New retained records, failed/stale comparisons and incomplete discovery must not be silently acknowledged. Do not delete records or persist note contents/preferences. Clear bounded acknowledgments on scope change; Escape alone is not a review decision.

Iteration 3 retained: explicit verified Keep current quiets its exact record, retaining comparison access. Ten desktop/mobile acknowledgment scenarios, 11 existing recovery scenarios and four comparison tests passed against a source-matched temporary production build. [Archived increment](2026-11-04_tasks-ux-retained-review.md). Native scoring unobserved; acknowledgments reset on reload.

### Iteration 4: finish versus interruption

Baseline finding 4: generating presence disappears on both finish and cancel. Expected gain: a quiet note-scoped confirmed terminal cue distinguishes generation finished, explicitly stopped and interrupted. Do not infer a completed task/document or completion from disconnection/presence loss. Protect simultaneous streams, same stream IDs owned by different actors, deduplication, epoch/note/brain transitions, saved text and other-writer focus. Older servers without actor identity get no inferred completion cue. Require observed active stream plus terminal state for that exact opaque actor/stream identity.

Broad-check observation: `node --test` against the built iteration-2 artifact completed 1,909 tests in ~514 seconds: 1,863 passed, 29 failed, 17 skipped. Most failures report the unavailable required QMD 2.8.3 engine; one updater expectation assumes macOS. Two footprint guards failed (editor gzip and package archive). A pristine `6d06cb9` snapshot is being built to establish the pre-loop budget state before accepting any allowance. Full output stays in `/tmp/jumpybrain-ux-full-2026-11-04.log`. The main built artifact was held unchanged during this run; later source-only candidates were tested separately.

Iteration 4 retained: actor/stream-correlated confirmed terminal cues, never completion from presence loss. Six real CLI/browser cases, ten retained-review neighbors, 66 compiled-artifact tests and 17 boundary checks passed. Measured +595 editor gzip bytes with unchanged dependencies; targeted existing whitespace compaction preserves all distribution ceilings. [Archived increment](2026-11-04_tasks-ux-generation-feedback.md).

Engine preparation: existing global QMD is 2.5.3; required 2.8.3 was provisioned from the repo engine lockfile into a temporary validation directory. No global engine/product install or model download. Pinned-engine CLI error suite passed all three cases. One attempt overlapped a clean rebuild and was invalidated by removed dist files; only the subsequent stable-artifact run counts.

### Iteration 5: actionable invalid retrieval options before tool setup

Broad checks exposed an invalid `--depth sideways` reporting QMD setup failure first when the engine is missing. Expected gain: identify the invalid user option before engine work or remote credential lookup. Protect normal/compact local/remote retrieval and recipe routing. Pre-fix deterministic reproduction reached `localMemory.searchMemory` for invalid input instead of rejecting it; the transport trap failed as expected. This is a validation-order fix, not a retrieval ranking change.

Iteration 5 retained: invalid retrieval depth now names allowed values before engine or remote credential access. The no-transport regression covers eight lanes; six no-engine and 25 pinned-engine neighboring checks passed. [Archived increment](2026-11-04_tasks-ux-retrieval-option-errors.md). No retrieval-policy/ranking or canonical behavior changed.

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

Iteration 7 retained: six targeted warning-scope cases and 36 related tests passed. After fixing an invalid dual-hold ordering in the copy test fixture, the full writing journey also passed on the combined candidate. Only the owned hung fixture process was stopped; no shared service was touched. [Archived search increment](2026-11-04_tasks-ux-search-warning-scope.md).

Iteration 6 retained: scoped Escape passes six targeted cases, contextual attribution and full writing-workspace neighbors. [Archived increment](2026-11-04_tasks-ux-scoped-escape.md). Native/physical IME scoring not observed.

Harness correction finalized: confirmed live-state waits, actual WS faults, mutation accounting and visible reviewed publication now validate the writing/board journeys. Updater Linux expectation is accurate; generation feedback also fits 320px. [Archived verification correction](2026-11-04_tasks-ux-validation-harness.md). No native score follows from harness repair.

### Stability and accessibility probes

Automated axe-core 4.10.3 WCAG-tag checks found no violations on 21 hosted fixture surfaces: Home, note, details, formatting, Search, connection and Feedback at 1280/light, 390/dark and 320/light. Incomplete/manual checks remain in `/tmp/jumpybrain-ux-axe-435f9cb.json`; this is not native/manual accessibility evidence or a usability score. No source change was justified by this probe.

Next stability hypothesis: short journeys can miss drift after idle/reconnect and accumulated actor history. Run a bounded long-lived coauthoring/off-note-search fixture against an immutable runtime copy, with real CLI chunks/outcomes, canonical verification, disjoint human edits, automatic lexical indexing and guarded navigation. Preserve scope/focus and never infer completion from a reconnect. Record exact build/runtime hashes and all failures; do not mutate the running artifact or use personal/shared memory.

Soak pilot 1 was invalid: its 20-second discovery budget was shorter than production's documented 30-second maximum indexing deferral, and repeated foreground search can itself defer the quiet window. Also corrected the probe to check canonical IDs in `provenance.metadata.id`, not a nonexistent top-level file field. Pilot 2 observes status first (no repair), then performs one independent indexed search, uses a 60-second publication bound, verifies all accumulated contributions and explicitly observes offline/connecting before calling a reconnect successful. Original failed pilot receipts remain retained, not relabeled.

Soak pilot 2 passed six full cycles in ~66 seconds (including explicit cancel and observed reconnect) with all accumulated contributions, real automatic indexing, independent CLI search and UI Back intact. Started a 45-minute run with 35-second reading/idle intervals using an immutable runtime copy of build `3b7fa7d720f00267` from `435f9cb`; runtime SHA-256 `6ac010d34ee15a1dfdf4f791e4c57fea2500bc12773d98632643d06bf612978b`. The run stores frozen runner/helper inputs and unique output receipts under ignored `.local-pack/ux-soak/long-01-435f9cb/`. Recording-only changes since pilot are disclosed; no old attempt was overwritten.

### Iteration 8: abandoned producer outcome delivery

Hypothesis before source changes: the hub retires expired/revoked streams but emits only an ordinary document snapshot, omitting terminal stream evidence. A connected viewer may therefore never see “Generation interrupted” until a later diagnostic stream-status command emits the missing evidence. Probe with a real CLI producer, one confirmed chunk, abrupt termination of only that owned process, and the production 60-second lease. Observe UI before diagnostic CLI status; retain any assisted late cue as assisted. Protect multiple simultaneous terminal streams, exact actor identity, bounded wire frames, canonical partial text and read-only viewers.

Iteration 8 default-lease comparison: original build `3b7fa7d720f00267` had no unassisted cue; fixed build `101fa59e8c553a2d` showed “Generation interrupted” before diagnostic status, with saved text/focus preserved and canonical cancelled/lease_expired readback. 72 focused live/recovery/editor/architecture/bundle/package checks and the eight ordinary generation desktop/mobile cases passed. New wire tests prove 32 retirements send one full note plus bounded metadata and cannot hydrate/confirm a private human draft. The old 45-minute stability artifact remains unchanged and cannot establish this fix.

Broad-run cleanup diagnosis: the doctor follow-up fixture retargeted `f.root` to its quoted-path test but cleanup still captured the original root, leaving the actual test backend writing logs during deletion. Cleanup now stops both owned fixture roots before removal; all eight doctor follow-up tests passed. This is a fixture-lifetime correction, not a product behavior change.

Iteration 8 retained with an unassisted default-lease gain and no lost protected generation cases. [Archived interruption delivery increment](2026-11-04_tasks-ux-generation-interruption.md). Explicit artifact/package measurements remain within the existing ceilings; the in-progress long soak continues on its frozen earlier runtime.

### Iteration 9: read-only note affordances

Inspection found the writing surface uses live role/connection locking, but empty-note guidance and the Format toggle consult only the companion preference. Probe an actual hosted reader credential on an empty note: it must not invite writing or expose formatting while the editor is read-only. Preserve copy/search/navigation, ordinary writer guidance, and private-editing controls during a writer reconnect; do not equate temporary `canWrite:false` with a read-only role.

Iteration 9 related creation probe also reproduced a truthful-guidance defect: a valid hosted reader's real 403 says “Connect with an access key” as if authentication were missing. Keep 401 key-repair advice distinct from 403 write-access advice, with actual visible writer-key repair creating exactly one note. This does not add a global role cache or alter authorization/targeting.

Iteration 9 retained: actual hosted reader guidance/formatting follows the existing
note lock, and 403 creation guidance now asks for write access while 401 retains
key repair. Six real-role browser cases, seven blocked-setup neighbors, the full
writing journey and 39 focused checks passed; 20 checks were repeated after final
wording. [Archived increment](2026-11-04_tasks-ux-readonly-affordances.md).

Additional protected-neighbor evidence on `d68bf75`: the production Markdown
formatting journey passed at 1280/390/320, including actual server acceptance
with a dropped live acknowledgment, retained uncertainty, review/load saved and
continued edits. This is browser recovery evidence, not native P1 coverage.
The older companion fixture failed its Settings “no memory fetch” assertion on
both pristine `6d06cb9` and current builds. Diagnostic paths are only
`/memories/all/boards`, required by the newer Boards Settings surface. No product
regression was established; the old fixture's later checkpoints remain unrun
rather than passing by deleting the assertion. Logs: `/tmp/jumpybrain-ux-companion-{pristine,d68bf75}.log`.

The nested-board sidebar journey also passes its earlier navigation/layout checks
but times out when it faults an obsolete HTTP PUT save. Pristine `6d06cb9`
reproduces the same timeout at line 124. This is an unexercised failure checkpoint,
not a product pass. Update that probe to fault the actual live title RPC and
recover through reviewed publication; do not remove its preservation assertions.

Next recovery probe: accepted body/title writes with dropped acknowledgments,
and a rejected private body, each followed by an actual peer edit. Require the
private version to remain visible, guarded Home, exact copy, current saved
comparison, explicit saved acceptance and no replay/duplicate canonical write.
Use fresh notes at 1280/390. This supplements P1 with browser-only uncertainty
evidence; native uncertain-save recovery remains unobserved.

### Iteration 10: read-only manual-copy recovery

Hypothesis before product edits: clipboard denial opens the general recovery
dialog even for a clean actual-reader note. Its publication capability checks
only global connection preferences, unlike retained-version restore. The dialog
may offer a publisher to a known read-only actor. Require manual selectable copy
without a publication invitation; preserve real writer reviewed publication,
scope fences and canonical bytes. Test the actual reader role with an injected
clipboard rejection at 1280/390 before changing source.

Broad compiled-snapshot run `d68bf75` finished: 1,918 tests, 1,901 passed,
17 skipped, zero failed, ~630 seconds. QMD pinned to 2.8.3 in an isolated
validation directory. Log `/tmp/jumpybrain-ux-full-d68bf75.log`. The earlier
doctor cleanup correction was present; native-only skips remain skips. No
rebuild overlapped the run. Iteration 10 was source-only while this compiled
artifact ran and still needs its own verification.

Recovery pilot correction: title broadcasts do not carry an operation ID, so
dropping only its RPC left a separate confirmation channel intact. The new
uncertainty fixture holds that broadcast as well. Original failed probe remains
in `/tmp/jumpybrain-ux-uncertain-save-d68bf75.log`; the corrected six desktop/
mobile body/title/rejection-with-peer cases passed in `...uncertain-save-02-d68bf75.log`.

The first long stability tranche is complete: 60 cycles over 45 minutes on
frozen build `3b7fa7d720f00267`, with 40 finishes/20 cancellations, accumulated
contributions and all scope/search/Back/reconnect checks retained. Nested-board
live-fault and six uncertain-save-with-peer cases also pass. [Archived evidence
and fixture corrections](2026-11-04_tasks-ux-long-stability.md).

Iteration 10 retained after rejecting a writer-recovery regression: manual-copy
recovery follows explicit note locking rather than operational write readiness.
Four role/capability cases, full writer publication/workspace, ten retained-review
checks and 132 focused tests pass, with unchanged package ceilings. [Archived
comparison, correction and limits](2026-11-04_tasks-ux-reader-recovery.md).

Next stability tranche: a new 90-minute frozen-runtime run on the retained
candidate, keeping 35-second idle intervals, accumulated contributions and
explicit reconnect/reload observation. Add visible epoch/revision to receipts;
do not infer history-window rotation from elapsed time alone. The opt-in runner
accepts up to 90 minutes; earlier inputs remain preserved. A fresh broad suite
checks the read-only recovery correction after its rejected-candidate fix.

Protected-identity probe: use two actual same-origin tabs with a failed private
writer draft, then request a reader identity through the visible connection UI.
The same-tab change must be guarded; a clean second tab's identity change must
retain/copy the first draft, prevent publication, explicitly reopen saved content
as a reader, preserve the old identity's recovery record, and leave canonical
Markdown unchanged. Check 1280/390 before considering any source change.

History/recovery boundary probe: run the existing default CLI actor-churn proof
and broader production collaboration editor journey against the retained build.
Require expired Undo to be explicit, no canonical mutation on expiry, fresh
human writing to remain available, and recent actor Undo/recovery isolation to
preserve other contributions. This probes a different boundary from the timed
stable-actor soak; no source modification is planned without a failed checkpoint.

Startup boundary probe: source inspection confirms `attachLiveEditor` sets its
lock and blocks legacy autosave synchronously before awaiting capabilities.
Verify that actual delayed HTTP capabilities keep body/title/guidance/format
locked, attempted typing sends no mutation even past the old debounce interval,
then confirmed writer input saves exactly once over WS. No startup defect is
asserted from the earlier hypothesis; use actual browser evidence at 1280/390.

### Iteration 11: latest peer feedback owns its quiet interval

Hypothesis before edits: each remote snapshot schedules an independent four-
second clear. A peer edit arriving two seconds after another can lose its notice
when the earlier timer fires. Require the latest peer update's intended interval
without extending it indefinitely after activity stops; preserve own-edit quiet,
canonical source, focus and note-scope cancellation. Probe actual peer edits at
1280/390 before changing timer ownership. The 90-minute earlier artifact remains
immutable and cannot establish any subsequent timer correction.

Iteration 11 retained: the earlier timer failure reproduced, then all 18 peer/
own-feedback browser checkpoints, 117 focused tests and eight generation
feedback neighbors passed on `a29d2f6b48755f42`. [Archived timing correction
and limits](2026-11-04_tasks-ux-peer-notice-timing.md). Final broad checks
must cover this later snapshot; earlier frozen results are not relabeled.

### Iteration 12: narrow note destination space

Existing 320px writing captures show an expanded navigation consuming ~350px
before the selected note, pushing a long-title fixture's body below the fold.
Selecting a sidebar destination already dismisses it transiently, but direct
note entry and entering the narrow breakpoint may miss that treatment. Probe
actual 320/390 direct note URLs and 1280→narrow transitions. Expected gain: the
selected note uses the viewport without changing desktop preference; toggle,
initial Home, Settings, failed-save departure, focus and canonical text remain
protected. This is route/layout evidence, not native/human scoring.

Iteration 12 retained: narrow direct notes and breakpoint entry now use the
existing temporary sidebar dismissal, preserving explicit reopen and desktop
preference. Two direct-route cases, 114 focused tests, clean writing/board
journeys and all eight protected-browser suites passed. The extra navigation
toggle is an explicit tradeoff/fixture action; failed teardown/layout attempts
remain recorded. [Archived implementation, evidence and limits](2026-11-04_tasks-ux-narrow-note-entry.md).

Final-candidate stability: build a fresh `b775d80` artifact, run its broad pinned-
engine suite, and observe a separate frozen 60-minute fixture with 35-second idle
intervals. Keep the in-progress earlier 90-minute artifact untouched. This is
new validation justified by the subsequent peer-timer and narrow-route changes;
no repeated broad suite is planned after a green result without another change
or unresolved failure. Both fixture runs finish before the overall deadline.

Idle private-draft probe: the optional runner can select one explicit lane,
perform up to 140 actual peer edits and observe its unpublished state for up to
one hour. A 390px accepted-body pilot passed after 132 peer edits (source
revision 133) and a short idle, with original draft/copy preserved and explicit
saved acceptance sending no replay. Its receipt is separate from the planned
one-hour observation. Defaults retain all six fast cases. Every run checks exact
compiled runtime hashes and retains its inputs/canonical receipts when requested.

Latest broad result: `b775d80`, build `02721429af82d5af`, 1,919 total /
1,902 passed / 17 skipped / zero failed in ~634 seconds. Product implementation
is retained and stable; remaining work is the bounded long observations and
final evidence/task settlement at the requested deadline. Draft compact report
is private at `/tmp/jumpybrain-ux-four-hour-report-draft.md` until actual outcomes
and completion time are filled. Do not call the loop complete before 01:21:15 UTC.

Extended stability tranche completed: the earlier frozen 90-minute build passed
119 cycles (80 finishes/39 stops), while the latest retained `b775d80` artifact
passed 81 cycles (54 finishes/27 stops) over a requested hour, actual 60m10s.
Each retained canonical contribution verifies exactly once, with fixed runtime
inventories and separate receipt hashes. [Archived verification and limits](2026-11-05_tasks-ux-extended-stability.md). The one-hour private-draft
observation and overall four-hour deadline remain pending.

Reproducibility follow-up: the first frozen run's runtime was reconstructed
from `435f9cb` in a separate temporary source copy with the same pinned build
dependencies. Its build `3b7fa7d720f00267` and full runtime SHA-256
`6ac010d34ee15a1dfdf4f791e4c57fea2500bc12773d98632643d06bf612978b`
match the executed bytes exactly. No current-runtime rebuild occurred. All
three timed-writing snapshots now retain standard `dist/`, exact commit package
manifests/lockfiles and a checked inventory under ignored
`.local-pack/ux-soak/runtime-evidence/`; the manifest distinguishes reconstruction
from direct frozen-run copies. No original receipt/input was replaced.

The one-hour private-draft observation completed cleanly: a 390px accepted-body
lane retained its uncertain source through 132 peer edits and 120 idle checks,
then passed guarded navigation, exact copy, explicit saved acceptance and reopen
without replay. Immutable runtime and all canonical contributions verified.
[Archived inputs, receipt hashes and limits](2026-11-05_tasks-ux-idle-uncertain-recovery.md). All long observations are complete; final readback,
evidence collation and the requested 01:21:15 UTC finish remain.

Raw evidence collation: 83 static log/audit/signal files are copied
byte-for-byte into ignored `.local-pack/ux-loop-evidence/2026-11-04-four-hour/`,
with source paths, byte counts and SHA-256 inventory. Manifest SHA-256
`b2aef5db9eee97e16f4ed7a0dd5bff92bc02cbff7cc955d5c4c4b405923c765d`. Runtime snapshots and per-run
inputs/canonical receipts remain in their separate ignored directories. All
owned journey processes have exited; no failed attempt was overwritten.

## Completed outcome

The requested four-hour window completed; finalized 2026-11-05 01:21:28 UTC.
Twelve product increments are retained in scoped local commits. Latest product
source is `b775d80`, build `02721429af82d5af`; full verification passed 1,902
tests with 17 skips and zero failures. Product source/tests/dependency manifests
stay unchanged after that green result. The separate 45-minute, 90-minute,
latest-candidate hour-long and uncertain-draft hour-long observations all passed
with their individual inputs, runtime hashes and canonical receipts preserved.
Actual elapsed time at finalization: 14413 seconds; the requested window
was 14,400 seconds. Finalization is bookkeeping after the deadline, not an
extended product experiment.

[Reviewed report](../../evals/workspace-experience/reports/2026-11-05-four-hour-loop.md)
records gained checkpoints, rejected candidates, failed/assisted attempts, the
narrow-navigation tradeoff, footprint review and exact remaining limits. Native
Mac scoring and live VPS compatibility remain unobserved/unresolved here; no
ordinal or composite score is fabricated. All authorized scope is finalized
locally without push, publication, installation or real shared-memory mutation.
