# Four-hour UX improvement loop

Requested window: 2026-11-04 21:21:15 UTC–2026-11-05 01:21:15 UTC.
Completed and finalized 2026-11-05 01:21:28 UTC. Requested window: four hours; final bookkeeping followed the deadline.

Pulled `master` fast-forward from `70ed801` to `85512f0` (0.3.20).
The timed loop starts at `cda65c9`, after the separately recorded initial
[feedback candidate](2026-11-04-feedback-candidate.md). Git author is
`niko <nikoatwork@pm.me>`. All work uses disposable localhost Markdown roots.

The existing [UX routine](../RUN.md), [rubric](../rubric.md), [missions](../journeys/core.md)
and [native baseline](2026-11-03-baseline.md) guide the hypotheses. Rubric, missions,
protocol, state model and fixture inputs remain unchanged from the loop base.
This is a same-agent, source-informed browser/CLI diagnostic, not a native rerun
or an independent usability study. No new ordinal or composite UX score.

## Retained product increments

| Finding | Retained behavior | Commit / evidence |
| --- | --- | --- |
| Own title/Undo receipts looked external | Complete actor history distinguishes own acknowledgments from other tabs | `28c41f4`; [14 browser checkpoints and origin tests](../../../tasks/done/2026-11-04_tasks-ux-own-edit-feedback.md) |
| Live setup failure labeled an existing note missing | Saved text stays locked/readable with honest editing retry and clean navigation | `a79f50f`; [failure/retry and rejected navigation candidate](../../../tasks/done/2026-11-04_tasks-ux-editor-availability.md) |
| Keep current left identical retention guidance | Explicit stable review quiets the exact tab-local record while retaining access | `71e3750`; [new/stale record and scope checks](../../../tasks/done/2026-11-04_tasks-ux-retained-review.md) |
| Finish/cancel had indistinguishable disappearance | Exact observed actor/stream transitions show quiet confirmed outcomes | `19cd9d1`; [identity, reconnect, package verification](../../../tasks/done/2026-11-04_tasks-ux-generation-feedback.md) |
| Invalid depth surfaced engine/auth errors first | CLI validates the user option before engine/credential work | `1fc6049`; [eight transport lanes and valid neighbors](../../../tasks/done/2026-11-04_tasks-ux-retrieval-option-errors.md) |
| Closed Search warning obscured note confirmation | Warning belongs to its active surface and preserves freshness uncertainty | `0d8b543`; [warning/reentry/save-error checks](../../../tasks/done/2026-11-04_tasks-ux-search-warning-scope.md) |
| Passive selection hint swallowed toolbar Escape | Escape ownership follows the actual editor/control scope | `eda82db`; [focus, composition and workspace checks](../../../tasks/done/2026-11-04_tasks-ux-scoped-escape.md) |
| Abandoned stream needed diagnostic lookup to reveal interruption | Bounded scoped terminal metadata reaches subscribed editors unassisted | `3886472`; [actual default-lease before/after](../../../tasks/done/2026-11-04_tasks-ux-generation-interruption.md) |
| Readers saw writing invitations and login advice on valid 403 | Loaded-note affordances follow the lock; creation distinguishes access from authentication | `876587e`; [real-role and writer-key repair](../../../tasks/done/2026-11-04_tasks-ux-readonly-affordances.md) |
| Manual-copy fallback invited read-only publication | Recovery follows explicit note locking while allowing writer conflict review | `47435cd`; [rejected operational-capability candidate and correction](../../../tasks/done/2026-11-04_tasks-ux-reader-recovery.md) |
| Earlier peer timer cleared a newer notice | Latest peer update owns one replaceable quiet interval | `941a57c`; [timing, own feedback and generation neighbors](../../../tasks/done/2026-11-04_tasks-ux-peer-notice-timing.md) |
| Narrow direct note/resize left navigation above the body | Selected note gets transient sidebar dismissal with explicit reopen and preserved desktop preference | `d5d2495`; [route/layout tradeoff and protected suites](../../../tasks/done/2026-11-04_tasks-ux-narrow-note-entry.md) |

The narrow-route change intentionally adds a sidebar-toggle action before global
navigation on direct narrow note entry/resizing. Initial Home and Settings keep
their navigation behavior. Diagnostic helpers explicitly perform this action;
that assistance is not a discoverability pass. Browser body text, scope/focus,
failed-draft barriers, copy and canonical preservation are checked independently.

## Verification

Final retained product snapshot: `d5d2495`, build `02721429af82d5af`.
The latest pinned-engine full suite passed 1,902 tests with 17 skips and zero
failures (1,919 total), ~634 seconds; `/tmp/jumpybrain-ux-full-d5d2495.log`.
No rebuild overlapped that run.

The separate earlier-artifact 90-minute run (build `c29c1197b7314d89`) passed
119 cycles in 5,400,414ms: 80 finishes/39 explicit stops, final revision 357 in
one epoch. Retained Markdown independently contains all 119 human, 119 first-
agent and 119 last-agent markers once each. Its exact compiled bytes and frozen
inputs are retained privately. This result does not establish the later timer/
narrow-route candidate.

The latest retained `d5d2495` artifact passed 81 cycles: 54 finishes/27 explicit
stops, final revision 243 in one epoch. Requested one hour; actual 3,610,246ms
including a final cycle crossing the time boundary. Retained Markdown independently
confirms all 81 human, 81 first-agent, 81 last-agent and 81 peer markers once each.
Runtime SHA-256 `165376d2525f6f256f8b9e0ef0673368884a16f8956281cfdc0477afb92fc2e8`;
receipt SHA-256 `061ae4c40ebd445dc86826cfa652dde40693aea443ffca3e24ed6f6cad101448`.
[Separate long-run evidence and limits](../../../tasks/done/2026-11-05_tasks-ux-extended-stability.md).
The hour-long recovery lane used an accepted body write whose acknowledgment
was dropped, then 132 peer edits and 120 idle observations at 390px. It finished
cleanly at 00:56:47 UTC: exact draft copy, guarded Home, explicit saved acceptance
and reopen passed without replay. Final canonical readback preserves the accepted
human text and all 132 peer edits once. Rejected-body and lost-title paths are
covered by the separate six fast cases. The complete main runtime hash stayed
unchanged through the hour.
Receipt SHA-256 `6871efa903b607688019e14f79cb41f925c77dd0eb8e5ff50d31aaf2a5385289`.
[Executed lane, inputs and limits](../../../tasks/done/2026-11-05_tasks-ux-idle-uncertain-recovery.md).

Earlier broad `47435cd` run: 1,918 total, 1,901 passed, 17 skipped, zero failed.
The pinned engine is QMD 2.8.3 in a temporary validation directory; no model
download or global product install. Its clean result does not establish later
timer/narrow-route changes.

The first 45-minute frozen run (`076d616`, build `3b7fa7d720f00267`) passed 60
cycles: 40 finishes/20 explicit cancellations, all 180 accumulated draft markers
and 60 peer contributions preserved, with automatic indexing, independent
no-refresh CLI discovery, off-note scope/focus, UI search/Back and reconnects.
[Exact hashes, invalid pilots and fixture corrections](../../../tasks/done/2026-11-04_tasks-ux-long-stability.md).

The default CLI actor-churn proof and full production collaboration journey pass
132 fresh actors, explicit expired Undo without mutation, fresh/recent human
writing, actual browser positional/history paths, offline body/title recovery,
cloned-tab isolation and explicit recovery-version selection. Simulated browser
composition is not physical/native IME evidence. Same-tab/cross-tab credential
checks retain and copy private drafts without publishing them under a new actor.
A delayed-capabilities probe stays locked until confirmed live writing opens.

The later narrow snapshot passed 114 focused tests, two direct-note cases, full
writing and nested-board journeys, and eight protected browser suites covering
reader recovery, availability, uncertain saves, credentials, generation, retained
review, Search warnings and Escape. Other focused counts belong to their exact
archived snapshots; they are not summed into a UX score.

Exact runtime bytes for all three writing snapshots are retained privately in
`.local-pack/ux-soak/runtime-evidence/`, with their package/lock files and an
inventory manifest. The first runtime was reconstructed from its recorded commit
and matches the original full hash; the two later runtimes were copied during
their frozen runs. Original receipts and input copies were not replaced.

## Rejected candidates and retained failures

- A clean editing-unavailable candidate used failed-save state and blocked clean
  Home navigation; corrected before retention.
- A reader-recovery candidate treated operational `canWrite:false` as a role,
  hiding writer conflict publication; the full writing journey caught it and the
  corrected explicit lock policy passed.
- Early broad checks exposed the required QMD 2.8.3 mismatch, a Mac-only
  updater expectation on Linux, and footprint guards. A pristine snapshot
  reproduced the Linux expectation and pre-loop editor overage. An isolated
  pinned engine, accurate platform assertion and targeted whitespace compaction
  address those conditions; the measured editor allowance is documented below.
  A later doctor fixture teardown retargeted its root but stopped the old root;
  stopping both owned roots fixed its log-deletion race. Original red runs remain
  retained, and none is relabeled green.
- Original writing/board probes faulted obsolete HTTP saves; actual WS faults
  and visible reviewed publication replaced that invalid setup. Dual-held title/
  body ordering in a copy probe also hung; the owned fixture was stopped and its
  corrected ordering passed. No shared service was stopped.
- The first soak pilot used an inadequate publication bound, a foreground-search
  observer effect and an incorrect provenance field. It remains failed; later
  frozen runs are separate attempts.
- The first lost-title acknowledgment probe missed a separate broadcast. The
  corrected fixture loses both confirmation channels and passes body/title/
  rejected-draft peer recovery at 1280/390.
- The old companion mock fails Settings “no memory fetch” on pristine and current
  builds because newer Boards Settings loads boards. Later mock checkpoints
  remain unrun; no product regression is established from it.
- One parallel writing run printed all passed assertions but exited 143 during
  teardown. A sequential signal-traced run passed and exited 0; original cause
  remains unproven. The first narrow board geometry probe measured a deliberately
  collapsed tree; explicit navigation reopening restores all layout assertions.

Raw attempts are retained under ignored `.local-pack/ux-loop-evidence/2026-11-04-four-hour/`
(83 raw log/audit/signal files with a SHA-256 manifest), alongside the per-run
`.local-pack/ux-soak/` inputs and canonical receipts. No failed receipt is
relabeled as an unassisted pass. Native baseline feedback remains native
evidence; browser success cannot erase its hosted live-connection blocker.

Final source review found no additional issue in the new metadata-only stream
path or recovery controls: canonical publication policy stays in the existing
app/core operations, notices cannot confirm private source, and reviewed
publication retains scope/hash checks. This is the author’s read-only review,
not an independent audit.

## Footprint and remaining limits

Latest measured package: 1,448,759 compressed bytes, 4,565,122 unpacked,
3,051,136 runtime, 646 files. Editor 223,115 gzip bytes, 15 bundled packages.
Existing distribution ceilings pass. The earlier reviewed editor allowance and
matched +595-byte comparison are recorded in [build footprint](../../../docs/build-footprint.md);
that package guard adjustment does not change the UX rubric.

Native Mac app/AX execution and ordinal rescoring are not observed here. The
existing VPS live-transport compatibility issue is not diagnosed or deployed by
this loop. No physical assistive-technology, touch, semantic-retrieval quality,
real-user timing or cross-platform conformance claim. No push, release, product
installation, deployment, external messages or real shared-memory mutation.

[Completed task and operational evidence](../../../tasks/done/2026-11-05_tasks-ux-four-hour-loop.md).
