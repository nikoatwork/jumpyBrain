# Bounded local reranking

Status: planned 2026-10-28. The [initial workspace baseline](../../evals/workspace-retrieval/reports/2026-10-28-baseline-v1.md) is available for diagnosis; the [evaluation plan](tasks-workspace-retrieval-evaluation.md) retains the longer-page and judgment work required before adoption. No experiment has been implemented.

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

- [ ] 1.0 Experiment 2: rerank a small existing candidate pool using supported local QMD functionality.
  - [ ] 1.1 Confirm baseline cases where necessary evidence enters the pool but ranks too low. Verify the pinned QMD 2.8.3 rerank interface and explicitly provisioned local model/runtime; record model-file size, startup and memory costs without changing the default installation.
  - [ ] 1.2 Prototype one pass over 20–40 merged candidates inside the adapter/existing execution lifecycle. Keep discovery, constraints, temporal eligibility, exact-title navigation, output budget and excerpt policy fixed. Merely removing `--no-rerank` from the structured branch is a separate branch-only diagnostic, not equivalent to reranking the final merged pool. No always-on service, automatic model downloads or implicit deep=expensive policy.
  - [ ] 1.3 Compare unchanged-product baseline versus rerank-only arm on hard negatives, paraphrases and multi-clause questions. Starting quality target: +5 percentage points fully supported tasks on the predeclared ranking-failure slice, no overall/protected evidence loss and unchanged output budget. Before comparison, freeze interactive ceilings of <=750 ms added warm p95 and <=1 GiB additional process-tree RSS; measure model-cold and warm states plus CPU-only feasibility separately. Require at least two improved reserved tasks, no protected regressions, and adjudicated evidence support. Better rank alone cannot pass.
  - [ ] 1.4 Record adoption/no-adoption with quality and resource evidence. If justified, integrate through approved adapter/app seams with bounded cancellation/failure behavior and meaningful ranking/constraint/parity regressions; remove losing experimental machinery.

- [ ] 2.0 Finalize the experiment.
  - [ ] 2.1 Record paired per-journey outcomes, total interaction tokens, cold/warm runtime costs, uncertainty, failure examples and exact artifact identities. Distinguish required-span diagnostics, adjudicated packet support and actual answer accuracy.
  - [ ] 2.2 If adopted, verify focused meaningful regressions and required repository checks; update affected contracts and pending release notes for actual user-facing behavior. If rejected, retain the reproducible comparison and decision without production flags/dependencies.
  - [ ] 2.3 Review interactions with any other independently successful experiment on fresh scenarios before claiming combined gains; never replace the original baseline with an accumulated implementation.
  - [ ] 2.4 Record remaining limits, archive this completed list, repair references and commit scoped work under [the task workflow](../../docs/task-workflow.md); update the canonical changelog for the completed result.

## Evidence and relevant files

- [Baseline plan](tasks-workspace-retrieval-evaluation.md), `evals/workspace-retrieval/`, [product vision](../../docs/product-vision.md) and [source architecture](../../src/architecture.docs.md).
- `src/core/retrieval-policy/`, `src/core/canonical/`, `src/app/local-memory/` and `src/adapters/qmd/`, with their co-located docs.
- [Prior contextual indexing result](../done/2026-10-24_tasks-contextual-indexing-evaluation.md) and [retrieval review](../../deep-dives/retrieval-product-review/findings.md); known examples are regression controls, not fresh held-out evidence.
