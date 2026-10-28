# Explicit relationship neighbors in recall

Status: completed 2026-10-28 — no adoption. [Measured results and limits](../../evals/workspace-retrieval/reports/2026-10-28-experiments-v2.md).

## Goal

Test this isolated retrieval change against the unchanged-product workspace baseline, adopting it only when source-supported task completion improves within the declared context, latency and operating-cost limits.

## Dependencies and constraints

- Establish the baseline and inspect relevant failures before implementation. Use the baseline's corpus, interaction policy, frozen runtime and scoring contract; fix numeric gates before inspecting comparison outputs.
- Before an adoption comparison, add and freeze fresh scenario structures with genuinely varied/longer pages alongside the v1 short-page controls; rerun the unchanged runtime on that augmented workload first. The v1 suite is a controlled pilot, not evidence of long-document or large-workspace quality.
- Run this arm independently of the other experiments. Previously tuned/reserved questions are seen controls; retain fresh scenario families for confirmation and disclose same-author judgments.
- Markdown remains canonical. Preserve source provenance, constraints, temporal uncertainty, explicit recall and local/hosted parity. Read architecture and affected co-located docs before source edits.
- Keep experiments and generated runs outside the installable package. Use `evals/workspace-retrieval/`; ignore generated roots, indexes, model state and raw packets.
- A no-adoption outcome completes the investigation when required evidence/checks are recorded and losing production machinery is removed. No push, install or release is implied.

## Tasks

- [x] 1.0 Experiment 3: discover bounded explicit source/decision neighbors during recall.
  - [x] 1.1 Confirm baseline multi-source misses with useful explicit links. Start with source references and declared `supersedes`/`conflicts_with`; ordinary Markdown links are a separate noisier arm. A link is a discovery hint, not proof that its target supports a claim or resolves a conflict.
  - [x] 1.2 Reuse canonical link resolution and index publication to prototype a rebuildable adjacency projection. Seed from at most three direct hits and inspect at most six unique one-hop neighbors. Do not call the current whole-corpus graph assembly on each recall; preserve generation/freshness, rename/delete/duplicate-ID handling and verify returned targets against canonical Markdown.
  - [x] 1.3 Compare baseline versus neighbor-only retrieval with ranking/excerpt policy fixed and the same total candidate/interaction budgets, reserving neighbor slots rather than silently increasing all limits. Apply existing lexical constraints and explicit temporal eligibility; do not bypass exclusions or auto-promote the newest proposal to current truth. Include cycles, hubs, unresolved links and misleading relationships.
  - [x] 1.4 Starting target: +10 percentage points complete multi-source support on the predeclared affected slice, no overall/protected evidence loss, same context budget and <=20% higher warm p95. Before comparison, freeze an additional process-tree RSS ceiling of 128 MiB and <=25% initial/incremental indexing and derived-storage overhead; require at least two improved reserved tasks and adjudicated support. Record indexing/storage overhead and adopt only if useful evidence exceeds neighbor noise and lifecycle complexity. Add focused rebuild/invalidation/constraint/parity tests if adopted; remove losing machinery.

- [x] 2.0 Finalize the experiment.
  - [x] 2.1 Record paired per-journey outcomes, total interaction tokens, cold/warm runtime costs, uncertainty, failure examples and exact artifact identities. Distinguish required-span diagnostics, adjudicated packet support and actual answer accuracy.
  - [x] 2.2 If adopted, verify focused meaningful regressions and required repository checks; update affected contracts and pending release notes for actual user-facing behavior. If rejected, retain the reproducible comparison and decision without production flags/dependencies.
  - [~] 2.3 Review interactions with any other independently successful experiment on fresh scenarios before claiming combined gains; never replace the original baseline with an accumulated implementation.
  - [x] 2.4 Record remaining limits, archive this completed list, repair references and commit scoped work under [the task workflow](../../docs/task-workflow.md); update the canonical changelog for the completed result.

## Evidence and relevant files

- [Baseline plan](../todo/tasks-workspace-retrieval-evaluation.md), `evals/workspace-retrieval/`, [product vision](../../docs/product-vision.md) and [source architecture](../../src/architecture.docs.md).
- `src/core/retrieval-policy/`, `src/core/canonical/`, `src/app/local-memory/` and `src/adapters/qmd/`, with their co-located docs.
- [Prior contextual indexing result](../done/2026-10-24_tasks-contextual-indexing-evaluation.md) and [retrieval review](../../deep-dives/retrieval-product-review/findings.md); known examples are regression controls, not fresh held-out evidence.

## Execution log — 2026-10-28

- Read product, architecture, source-module docs, prior baseline and task workflow. Working on clean `master` at `3ed8a67`. Bounded local-memory recall did not locate relevant prior eval decisions.
- Frozen numeric gates and affected slices in [experiment contract](../../evals/workspace-retrieval/EXPERIMENTS.md). Added six new workflow structures (27 pages, 24 tasks) alongside unchanged v1 controls. Original pages are 157–192 words; added handbooks are 566–596 words, with shorter source/decision/adversarial pages. This is longer-section evidence, not a large-document or large-workspace claim.
- Running the unchanged lexical runtime first. Eval-only instrumentation leaves production source and installation unchanged; no adoption or answer-accuracy result yet.

## Measured decision

- 44/104 versus 47/104; affected slice 3/26 → 3/26, zero fresh reserved improvements, -0.16% tokens. Reject: neighbor displacement loses Lantern/Ridge/Mosaic rationale and Harbor orientation evidence. Narrow explicit-metadata arm only; ordinary body links remain untested.
- [Paired report, judgments, operations and limits](../../evals/workspace-retrieval/reports/2026-10-28-experiments-v2.md); adjacent JSON retains every per-case difference and frozen artifact identities. Two clean-root baseline runs reproduce non-timing scores/costs exactly.
- Production `src/` is unchanged; no model download, default installation, release, push, new production flag or dependency. Losing prototypes exist only in excluded eval tooling. Pure experiment/runner/architecture checks: 24 passed. Repository-wide verification and final raw archive/commit are still pending.
- Adoption-only quiet-window, production integration/lifecycle/parity and combined-arm checks are skipped because each original arm already fails quality/context gates. Observational local cold/warm timings/RSS and unmeasured incremental/hosted/semantic limits are retained rather than marked passing. A separately frozen identity follow-up is not a combined-arm adoption.

## Final verification and archive

- Completed 2026-10-28 on `master`. No production-source changes remain; all rejected candidate machinery was removed from `src/`. No version bump, default dependency, memory write, install, push or release.
- Final clean snapshot: production source at `46fa41f` plus the scoped eval tooling/inputs and seven pure eval regressions. `npm test`: 1,444 tests, 1,443 passed, 0 failed, 1 opt-in skip, 53.954 s. Eight real QMD 2.8.3 runtime/local-CLI/hosted-CLI and edit/rename/delete/rebuild checks passed with non-loopback network denied.
- Package dry run: 514 files; all 231 required installable paths validated; zero eval files shipped. `git diff --check` and all experiment task/report Markdown references pass. A pre-existing changelog link to the absent `todo/tasks-page-reference-manual-qa.md` remains outside this scope.
- Raw archive: `/Users/monkey/dev/jumpyBrain-retrieval-evaluation/workspace-experiments-2026-10-28/2026-10-28-experiments-v2-v4.tar.gz`; 12,439,767 bytes; SHA-256 `365705392392a41555cc2c5a45927c14c6202c282ed21bd1ab424f815bef82d7`. Contains exact accepted freeze/packet/score/log artifacts, original source/compiled runtime, tooling snapshots, model-cost probes and final checks; excludes rebuildable roots/indexes/dependencies. Failed-freeze and stopped candidate attempts remain explicitly excluded from accepted results.
- Limits: same-author synthetic judgments, no evaluated answer agent or independently adjudicated aggregate, no semantic experiment replication or Linux/VPS/browser study. Adoption-only checks not reached are not passing results. Further named-subject work should test candidate generation before final-pool ranking, with new scenario families.
- Archived and committed together with scoped evaluation inputs, tests and reports under the repository task workflow. Broader workspace evaluation remains active.
