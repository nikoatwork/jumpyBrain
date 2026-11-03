# Desktop RAM — focused next improvements

## Goal

Make large semantic indexing more predictable and pursue at most one further RAM optimization with a clear benefit. Keep Electron, complete semantic retrieval and the existing background-service/save contract. **All experiments combined have a hard 120-minute cap**, not two hours per candidate or session. Execution authorized 2026-11-03. Real-model setup verification and the focused context-pool comparison share the original experiment cap.

## Evidence and boundaries

- [Previous result](../../deep-dives/desktop-ram/2026-10-23-bounded-result.md): empty-corpus background used 114–123 MB and open home 334–349 MB. The 100 MB target remains unproven; it is not this iteration's acceptance target.
- Large semantic indexing reached approximately 6 GB. One default 600-second attempt timed out; a matched diagnostic pair completed with 900-second backend deadlines. Raising a timeout does not reduce RAM.
- Graph work already improved at 10,000 notes: active peaks were 1,038–1,124 MB versus 1,175–1,222 MB. Home/recovery results remained mixed; do not extrapolate graph gains to all desktop use.
- Earlier measurements used frozen source. Establish the current implementation and account for subsequent UI/background-indexing changes before making a new before/after claim.
- No host migration, model/quantization change, lexical fallback, forced production GC, persistent metadata cache, service suspension or full benchmark matrix in this list. Preserve Markdown authority, external edits, graph semantics and canonical save/switch/quit barriers.

## Experiment budget and stop rules

- **15 minutes:** review existing evidence, select one RAM candidate, prepare current-source snapshots and disposable fixtures.
- **45 minutes:** large-index checks; at most one control/changed pair when needed. Use existing failures as evidence rather than repeating the old investigation.
- **30 minutes:** one focused 1,000-note UI/graph comparison, only if it is the selected RAM candidate. Unused slots need not be filled.
- **15 minutes:** a short lifecycle/cancellation check where affected by the changes.
- **15 minutes:** analysis, process drain and the evidence write-up. **Total ceiling: 120 minutes.**
- Count preparation, profiling, runs, retries, waits, recovery, analysis and cleanup against the shared budget. Record start/end times and cumulative minutes in this file; the budget persists across agents/sessions. Implementation and necessary deterministic correctness tests are separate, but real-model/GUI benchmark work cannot be relabelled as a test to bypass the cap.
- Reserve cleanup time and set a wall-clock stop before the first experiment. Do not start a run that cannot fit in the remaining allowance. Stop on failure to inspect it; no automatic retries, deadline extensions, model/config sweeps or detached queues. Use tracked commands that surface completion/failure.
- At the cap, stop experiments, drain observed descendants and report the result or uncertainty. Do not extend the budget without a new explicit user instruction. Revert an unproven speculative RAM change rather than launching more experiments to justify it.

## Tasks

- [x] 1.0 Select a small implementation scope from existing evidence.
  - [x] 1.1 Read architecture/co-located docs for affected modules; identify current deadline ownership and the largest relevant process/allocation from existing traces. Keep model-active and idle/UI memory separate.
  - [x] 1.2 Choose at most one RAM candidate and record its mechanism, targeted stage, expected benefit, correctness risks and rejection condition before editing. Prefer reducing the model working set only if an existing supported backend control preserves the same model and complete retrieval; otherwise consider a demonstrated editor/graph retention or eager-loading cost. Do not fork the backend or start a broad search for knobs.
  - [x] 1.3 Record the current source/driver/model identities and the experiment stop time. Reuse corrected harnesses and existing corpora; keep roots, credentials and raw traces ignored locally.

- [x] 2.0 Make index deadlines consistent and cancellation reliable.
  - [x] 2.1 Use existing execution/configuration seams first. Establish one explicit finite local index deadline with appropriate gateway/client headroom; document ownership, defaults and configuration. Record any proposed default change and its tradeoff rather than silently widening every timeout. Do not build a new settings UI for this task.
  - [x] 2.2 Preserve cancellation, admission/lock cleanup, rollback/publication rules and truthful readiness. A timeout must remain a visible failure; partial or lexical retrieval must not be reported as complete semantic retrieval.
  - [x] 2.3 Cover propagation, finite limits, abort/body-consumption behavior and cleanup with focused deterministic tests. Use at most the allotted large-index checks to verify real completion/readiness and relevant cancellation. Record a remaining failure instead of escalating into another acceptance program.

- [x] 3.0 Implement and assess the single selected RAM candidate.
  - [x] 3.1 Make the smallest change justified by 1.2, preserving drafts, graph camera/history, save/switch/quit barriers and canonical memory semantics. A documented no-change decision is acceptable if no supported, worthwhile candidate exists.
  - [x] 3.2 Compare current control and changed snapshots with the same driver, model, corpus, viewport/scale, deadlines and observation windows. Measure the targeted stage's whole-tree physical footprint, separate RSS, active peak and latency. If the change itself fixes deadline policy, separate functional completion evidence from any unmatched RAM comparison.
  - [x] 3.3 Keep claims proportional to the short comparison: require a clear stage-specific benefit beyond known noise, record reopen/index latency costs, and label one-pair results directional rather than statistically established. Do not claim a win from heap-only readings or overlapping footprint ranges. Retain only a justified change; otherwise revert/defer it within the cap.

- [x] 4.0 Validate affected lifecycle behavior and close the iteration.
  - [x] 4.1 Run only relevant correctness checks. If lifecycle is affected, use a short navigation/edit/search/graph cycle to verify saves, one live window, hidden-graph cleanup and process/worker stability. Reuse existing cancellation evidence unless execution/cleanup changes warrant one new probe. No 30-minute soak, separate GPU trace or native-host comparison; no leak-freedom claim.
  - [x] 4.2 Verify every observed owned descendant and monitor exits. Preserve the unrelated installed app and personal configuration. Record total experimental time, tested snapshot, completed checks, rejected attempts and untested limits.
  - [x] 4.3 Publish a concise outcome: implemented improvements or justified no-change decisions, measured benefit/cost and remaining limits. Do not adopt universal RAM budgets or promise 100 MB from this evidence. Update owning docs and release notes for actual behavior changes; add a changelog highlight only if the delivered impact qualifies.
  - [x] 4.4 When required work/checks are complete, archive this list and commit only scoped implementation, tests, docs and evidence under [the task workflow](../../docs/task-workflow.md). Do not mark failed checks passed to meet the time cap; fix or revert incomplete changes, and state any exact blocker. No push, installation or release is implied.

## Experiment ledger

- Experimental clock start: **2026-11-03 11:28:18 UTC** (first real-model setup fixture launch). Hard stop: **2026-11-03 13:28:18 UTC**. The clock also includes the small setup cold/warm observation requested by feedback unit 12; implementation/deterministic tests are separate, but no elapsed experiment time is relabelled.
- Ledger recording followed that first functional fixture launch rather than preceding it; actual script creation/run time is retained, without resetting the cap. At first update (11:29 UTC), about one minute elapsed. Update elapsed totals before every subsequent experiment and at closeout.
- First functional setup run: provisioned preset, disposable tiny roots, no downloads; setup, complete semantic indexing, no-op reuse and clone checks completed. The final missing-model assertion expected an optional warning that is absent when current readiness is lexical-only. Inspect/readiness assertion correction precedes any rerun; this is not a passing run yet.
- Selected single RAM candidate: **two embedding contexts during index workers**, using pinned QMD 2.8.3's existing `QMD_EMBED_PARALLELISM` control. Automatic GPU context pools can reach eight; fewer simultaneous context buffers should reduce model-active footprint with the same model, complete chunks and provenance. Search query pools, models, quantization, graph/editor retention and production GC stay outside the change.
- Rejection: retain only a clear model-active whole-tree physical-footprint reduction beyond known noise, complete readiness/chunk coverage, no lifecycle/cancellation regression, and acceptable measured completion latency within the same finite deadline. One matched pair is directional evidence, not a statistical or universal RAM claim. Respect an explicit existing backend override.
- Planned comparison: one unchanged-runtime/configuration pair on the same fresh 10,000-note fictional corpus, provisioned model and 900-second backend deadline, corrected process-tree sampler; automatic control versus two contexts. Record identities before runs. No GUI/graph comparison is needed for this candidate.
- Runs/results, cumulative elapsed time and remaining allowance will be appended below. The completed comparison and retained default are recorded in the closeout below.

## Relevant files

- `src/architecture.docs.md` and nearest `*docs.md` — ownership rules before source changes.
- `src/adapters/qmd/`, `src/app/local-memory/`, `src/app/server-memory/` — execution, indexing and lifecycle seams.
- `src/server/config.ts`, `src/adapters/http-client/`, `integrations/macos-companion/gateway.mjs` — finite deadline configuration and forwarding.
- `src/adapters/http-server/`, `integrations/electron/` — editor/graph loading, retained state and desktop lifecycle if selected.
- `scripts/desktop-ram-{benchmark,app,report,compare,cancel}.mjs` — corrected isolated workloads and report guards; use selected checks only.
- [Archived study](../done/2026-10-23_tasks-desktop-ram-follow-up.md) and [reviewed evidence](../../deep-dives/desktop-ram/2026-10-23-closeout.json) — starting evidence, not authority to rerun the old queues.

### 2026-11-03 control checkpoint

- The automatic-context control completed 10,000 documents / 17,000 chunks with fresh, complete semantic readiness in 559.779 seconds. The corrected sampler retained 5,221 complete active samples and a final zero-process row. Full result and traces are retained under `.local-pack/ram-focused-20261103/automatic/`.
- The parent collector then exited 13 after waiting for an already-fired output-stream finish event; this is a harness failure after indexing/drain, not an index timeout. Inspected the saved result and complete trace before manual continuation. No control rerun. Added a guarded resume that revalidates runtime/model/driver/sampler identities and refuses an existing candidate directory; the two-context run is the only remaining comparison arm.
- About 18 / 120 elapsed minutes at this checkpoint; the original 13:28:18 UTC hard stop is unchanged. The host has unrelated Podcast indexing/VM activity; timing is observational, not quiet-window retrieval adoption evidence. No unrelated process was stopped.

## Completed closeout — 2026-11-03

- Retained the Mac ARM64 two-context embedding default, respecting explicit overrides, and consistent finite backend/transport deadlines. Defaults remain 600 seconds indexing / 60 seconds search; selected index deadlines have 10 seconds transport headroom. Backend bootstrap forwards only the named timeout/model-directory settings.
- [Result, hashes, caveats and bounded ledger](../../deep-dives/desktop-ram/2026-11-03-focused-index.md); [compact machine-readable evidence](../../deep-dives/desktop-ram/2026-11-03-focused-index.json). Both arms completed all 10,000 notes / 17,000 chunks and drained before 11:56:31 UTC. The retained default was applied by 12:01:32, within 34 minutes of the original start. No RAM experiment followed the original 13:28:18 hard stop. Administrative closeout occurred later after a conversation gap; the budget was not reset.
- The real-model setup rerun corrected only the fixture's warning expectation and passed: explicit consent plan, verified local selection, offline cached reuse, clone portability, missing model/strict-read-only lexical behavior and unchanged Markdown. Tiny-fixture cold index 2.608 s / warm no-op 0.648 s are setup operation observations, not warm inference or RAM claims.
- Relevant deterministic checks: 130 index/model/update/package/architecture cases plus 14 focused deadline/desktop/transport cases passed. They cover two-context override policy, complete chunks, cancellation/drain, finite custom limits, payload propagation, invalid-before-dispatch, HTTP body aborts and native bootstrap allowlisting. No UI/graph lifecycle implementation changed for this index-only candidate; existing navigation/save/window/hidden-graph evidence is reused rather than starting the optional UI comparison. The native Swift host compiled for both supported architectures.
- The collector failure after the control completed remains disclosed; no fabricated exit code or replacement control was used. One pair on one contended Mac supports a directional model-active improvement, not leak freedom, a universal RAM budget, 100 MB desktop use, Intel/Linux results or a default-deadline completion promise. Personal app/configuration and Markdown were untouched.
- Owning docs and pending release notes describe only retained behavior. This archive is committed with the overlapping completed setup/update work; no push, installation or release is authorized.
