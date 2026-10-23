# Desktop RAM — focused next improvements

## Goal

Make large semantic indexing more predictable and pursue at most one further RAM optimization with a clear benefit. Keep Electron, complete semantic retrieval and the existing background-service/save contract. **All experiments combined have a hard 120-minute cap**, not two hours per candidate or session. This request creates the plan; no experiments have started.

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

- [ ] 1.0 Select a small implementation scope from existing evidence.
  - [ ] 1.1 Read architecture/co-located docs for affected modules; identify current deadline ownership and the largest relevant process/allocation from existing traces. Keep model-active and idle/UI memory separate.
  - [ ] 1.2 Choose at most one RAM candidate and record its mechanism, targeted stage, expected benefit, correctness risks and rejection condition before editing. Prefer reducing the model working set only if an existing supported backend control preserves the same model and complete retrieval; otherwise consider a demonstrated editor/graph retention or eager-loading cost. Do not fork the backend or start a broad search for knobs.
  - [ ] 1.3 Record the current source/driver/model identities and the experiment stop time. Reuse corrected harnesses and existing corpora; keep roots, credentials and raw traces ignored locally.

- [ ] 2.0 Make index deadlines consistent and cancellation reliable.
  - [ ] 2.1 Use existing execution/configuration seams first. Establish one explicit finite local index deadline with appropriate gateway/client headroom; document ownership, defaults and configuration. Record any proposed default change and its tradeoff rather than silently widening every timeout. Do not build a new settings UI for this task.
  - [ ] 2.2 Preserve cancellation, admission/lock cleanup, rollback/publication rules and truthful readiness. A timeout must remain a visible failure; partial or lexical retrieval must not be reported as complete semantic retrieval.
  - [ ] 2.3 Cover propagation, finite limits, abort/body-consumption behavior and cleanup with focused deterministic tests. Use at most the allotted large-index checks to verify real completion/readiness and relevant cancellation. Record a remaining failure instead of escalating into another acceptance program.

- [ ] 3.0 Implement and assess the single selected RAM candidate.
  - [ ] 3.1 Make the smallest change justified by 1.2, preserving drafts, graph camera/history, save/switch/quit barriers and canonical memory semantics. A documented no-change decision is acceptable if no supported, worthwhile candidate exists.
  - [ ] 3.2 Compare current control and changed snapshots with the same driver, model, corpus, viewport/scale, deadlines and observation windows. Measure the targeted stage's whole-tree physical footprint, separate RSS, active peak and latency. If the change itself fixes deadline policy, separate functional completion evidence from any unmatched RAM comparison.
  - [ ] 3.3 Keep claims proportional to the short comparison: require a clear stage-specific benefit beyond known noise, record reopen/index latency costs, and label one-pair results directional rather than statistically established. Do not claim a win from heap-only readings or overlapping footprint ranges. Retain only a justified change; otherwise revert/defer it within the cap.

- [ ] 4.0 Validate affected lifecycle behavior and close the iteration.
  - [ ] 4.1 Run only relevant correctness checks. If lifecycle is affected, use a short navigation/edit/search/graph cycle to verify saves, one live window, hidden-graph cleanup and process/worker stability. Reuse existing cancellation evidence unless execution/cleanup changes warrant one new probe. No 30-minute soak, separate GPU trace or native-host comparison; no leak-freedom claim.
  - [ ] 4.2 Verify every observed owned descendant and monitor exits. Preserve the unrelated installed app and personal configuration. Record total experimental time, tested snapshot, completed checks, rejected attempts and untested limits.
  - [ ] 4.3 Publish a concise outcome: implemented improvements or justified no-change decisions, measured benefit/cost and remaining limits. Do not adopt universal RAM budgets or promise 100 MB from this evidence. Update owning docs and release notes for actual behavior changes; add a changelog highlight only if the delivered impact qualifies.
  - [ ] 4.4 When required work/checks are complete, archive this list and commit only scoped implementation, tests, docs and evidence under [the task workflow](../../docs/task-workflow.md). Do not mark failed checks passed to meet the time cap; fix or revert incomplete changes, and state any exact blocker. No push, installation or release is implied.

## Experiment ledger

- Used: **0 / 120 minutes**. No experiments launched by this planning task.
- Start / hard stop: not set; record before starting experiments.
- Selected RAM candidate and rejection condition: not selected.
- Runs, elapsed time, results and remaining allowance: none yet.

## Relevant files

- `src/architecture.docs.md` and nearest `*docs.md` — ownership rules before source changes.
- `src/adapters/qmd/`, `src/app/local-memory/`, `src/app/server-memory/` — execution, indexing and lifecycle seams.
- `src/server/config.ts`, `src/adapters/http-client/`, `integrations/macos-companion/gateway.mjs` — finite deadline configuration and forwarding.
- `src/adapters/http-server/`, `integrations/electron/` — editor/graph loading, retained state and desktop lifecycle if selected.
- `scripts/desktop-ram-{benchmark,app,report,compare,cancel}.mjs` — corrected isolated workloads and report guards; use selected checks only.
- [Archived study](../done/2026-10-23_tasks-desktop-ram-follow-up.md) and [reviewed evidence](../../deep-dives/desktop-ram/2026-10-23-closeout.json) — starting evidence, not authority to rerun the old queues.
