# Bounded named-source candidate discovery

Status: complete, 2026-10-29. Adopted bounded discovery plus the fixed first-forty ordering for lexical retrieval after fresh quality, source review, experimental/production quiet cost and exact production-parity checks. Discovery alone is rejected. [Measured report](../../evals/workspace-retrieval/reports/2026-10-29-discovery-v5.md).

## Goal and contract

Test whether bounded canonical-metadata discovery recovers named sources missing from long multi-clause query pools. Separate admission from ordering and from displayed sufficient evidence. All v1–v4 cases are seen controls. New independently authored confirmation cases must be frozen before outputs; no gold access in retrieval or follow-up selection.

- Compare unchanged baseline, discovery only, and discovery plus the unchanged prior identity ordering as separately declared arms.
- Add at most eight missing canonical metadata matches before source repair/ranking; preserve existing candidates. No model, corpus-wide body scan, new index, larger visible budget or runtime flag. Conservative constraint/exact-title/temporal bypasses.
- Adopt only with at least two fresh complete-task improvements, no complete-task/unit/protected losses, zero provenance/budget failures, <=5% interaction-token increase, then conditional quiet-window <=10% p95 / <=50 MiB sampled CPU RSS cost checks. Quality failure closes an arm without production integration.
- Parallel ownership: policy/tests, fresh corpus/contract, and read-only source diagnosis; primary agent owns runner/hooks, execution, source review and finalization. No push, install or release is requested.

## Tasks

- [x] Inspect reports, active plans, architecture and current candidate pipeline; confirm missing discovery rather than merely ordering.
- [x] Freeze a bounded policy, separate fresh fixture and experiment contract; add meaningful deterministic regressions.
- [x] Instrument actual pre-repair admission and full grouped-pool diagnostics; preserve canonical validation and frozen runtime/input identity.
- [x] Run clean paired lexical controls/arms, confirm baseline reproducibility and inspect candidate admission separately from displayed units and follow-up evidence.
- [x] Review all changed required evidence, losses and fresh examples against source-bound packets; record author separation and remaining limits.
- [x] Record adoption/rejection and any conditional cost/integration checks; archive external raw artifacts with hashes.
  - [x] Quiet-window combined-arm probe: 20 alternating pairs after six warm-up queries; p95 +0.01975%, sampled CPU process-tree RSS +1.75 MiB, within <=10% / <=50 MiB gates.
  - [x] Port the passing fixed combination into core/adapter with lexical-only eligibility and protected bypasses; prove full workload parity plus focused lifecycle/transport/cancellation checks before adoption.
- [x] Run relevant repository/package/link checks, update parent plan/docs/changelog, archive this list and commit scoped work.

## Progress and limits

- 2026-10-29: clean starting worktree at `ec560fa`; local explicit memory recall found no related notes. The broader workspace-evaluation plan remains active because independent answer judgments, larger workspaces/documents, human usage and Linux/VPS costs are unresolved. Prior experiment lists are already archived; their failed confirmation cases stay seen.
- Policy SHA-256 `04337fd3ec76e7252b34de26298148377b9042412b0505e4388366eb7f614730`; prior identity bytes remain `4b07187d2978ea72ad4f0ce4b55b8cfe293638f7909c309c4e19a0f3863e891b`. New fixture has 15 pages / 16 tasks, yielding 225 pages / 140 tasks. Inputs frozen before baseline output; baseline uses the isolated original runtime verified against all 616 v4 product file hashes.
- Pre-run checks: full `npm test` 1,450 tests, 1,449 passed, one opt-in skip, zero failures (102.557 s); added comparison regression passed separately, and focused eval checks 18/18 passed. `npm pack --dry-run --ignore-scripts --json`: 514 paths, 231 required validated, zero eval files. No model/download/native build is permitted in quality execution.
- Separate model-agent source review (neither fixture nor policy author, no new outputs inspected) found all fresh clauses/date/authority expectations consistent. Source-specific gold can be stricter than answer support where Patchbay's decision repeats consent rationale, Millrace's decision repeats camera/debris reasoning, or Wrenfall's intake decision repeats humidity rationale. Preserve scores and review actual packets before calling such misses substantive evidence gaps. Fresh introductions still put purpose/steward in the first paragraph under a canonical-name title; no broad entity-generalization claim follows.
- Two clean unchanged baselines reproduce all per-case non-timing scores/costs exactly: 70/140 complete required-span packets, 9/16 fresh, 401,780 full-interaction tokens. Discovery only: 70/140 and +0.04853% tokens, no fresh completions. Combined fixed ordering: 89/140, 11/16 fresh, +1.11653% tokens; affected slice 23/70 -> 37/70 (+20 points); zero lost unit labels, provenance failures or response-budget violations. Discovery alone is rejected; the combination passes production adoption checks.
- Separate reviewer checked all 19 newly complete and five other unit-change packets, every required phrase across all 140 comparisons, and all required-source exposure changes: 27 added exposures, zero removals; 15 previously exposed sources gain full reads without losing displayed text. Ledger rationale already had enough accepted-reason/brief evidence in baseline despite missing a gold research source, so 19 span-completion gains are not 19 newly answerable tasks.
- All three old missing briefs enter both admission arms with zero evictions. The unchanged first-40 identity window reaches Belltower's brief at compact rank 39, but Copperfin/Mothlight at rank 42 remain undisplayed. No window widening or fresh tuning. New Patchbay/Millrace orientation gains are query-bound, with named purpose/steward and operating qualifications displayed. Wrenfall orientation remains partial; shared alias and conservative constraint limitations remain visible.
- Production port reproduces every serialized recall/read response and request across all 140 tasks, all non-timing per-case scores/costs/source selections, and 89 complete packets. Snapshot digest `7debe8e4a15f5086deb67d823b19d17d27f95a739f8140dab40e3f2d1ff585b7`; all final TypeScript/compiled bytes match, with only an adapter-doc clarification following its freeze. Actual production quiet probe (six warm-up queries / twenty alternating pairs): p95 1,267.66 -> 1,285.87 ms (+1.43650%), sampled CPU RSS delta -1.234 MiB; passes gates, not a memory-savings claim.
- Final `npm test`: 1,462 tests, 1,461 passed, one opt-in skip, zero failures (134.522 s); focused new checks 18/18 pass. Nine real lifecycle/transport checks pass, including named introduction parity across runtime/local CLI/hosted CLI, external edit/stale handle, repair, rename, deletion and index rebuild. Package: 516 paths, 231 required validated, no eval assets. Scope includes architecture/semantic/temporal/read-only/cancellation regressions, not real semantic quality or VPS load.
- Retained operational failures: initial new test assertions used raw QMD fixture scores rather than existing reciprocal-rank floors; corrected assertions pass. An early lifecycle launch raced the build's replacement of `dist`; its next attempt used the quality guard that also denied loopback HTTP. Final smoke uses an explicit localhost-only fetch exception, denies redirects/external downloads and passes all checks. No failed attempt is counted as passing.
- Raw archive: `/Users/monkey/dev/jumpyBrain-retrieval-evaluation/workspace-discovery-2026-10-29/2026-10-29-discovery-v5.tar.gz`, 18,158,307 bytes, SHA-256 `6e81188f726ce71d00ab6788043052888d74993d14718b5955b96124c48f86d2`. Contains all five scored passes, frozen inputs, both runtime snapshots, timing probes, verification and failed-attempt logs; rebuildable memory/SQLite roots excluded.
- Broader parent remains active. Next measured boundaries are the first-forty ordering window, first-three read selection and conservative constraints; newly used confirmation cases are seen. No additional release is requested; pending user-facing notes stay in `tasks/todo/release-next.md`.
- Scoped local Markdown references are valid. The link scan also found a pre-existing missing `tasks/todo/tasks-page-reference-manual-qa.md` target in `tasks/CHANGELOG.md` (already present in `HEAD`); restoring that unrelated manual-validation tracker is outside this retrieval task.

## Relevant files

- [Broader evaluation plan](../todo/tasks-workspace-retrieval-evaluation.md)
- `evals/workspace-retrieval/{run,execute,experiment-hooks,discovery-policy}.mjs`
- `evals/workspace-retrieval/DISCOVERY-EXPERIMENT.md`, `discovery-confirmation/`, compact v5 report/JSON/freeze/timing records
- `src/core/retrieval-policy/named-subject.ts`, core barrel/docs, `src/adapters/qmd/qmd-driver.ts` and owning docs
- `test/{workspace-discovery-policy,workspace-discovery-comparison,named-subject,named-discovery-ranking}.test.js`
- `docs/technical.md`, `tasks/CHANGELOG.md`, parent plan and pending release notes
