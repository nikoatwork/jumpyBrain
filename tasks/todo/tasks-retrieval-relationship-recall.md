# Explicit relationship neighbors in recall

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

- [ ] 1.0 Experiment 3: discover bounded explicit source/decision neighbors during recall.
  - [ ] 1.1 Confirm baseline multi-source misses with useful explicit links. Start with source references and declared `supersedes`/`conflicts_with`; ordinary Markdown links are a separate noisier arm. A link is a discovery hint, not proof that its target supports a claim or resolves a conflict.
  - [ ] 1.2 Reuse canonical link resolution and index publication to prototype a rebuildable adjacency projection. Seed from at most three direct hits and inspect at most six unique one-hop neighbors. Do not call the current whole-corpus graph assembly on each recall; preserve generation/freshness, rename/delete/duplicate-ID handling and verify returned targets against canonical Markdown.
  - [ ] 1.3 Compare baseline versus neighbor-only retrieval with ranking/excerpt policy fixed and the same total candidate/interaction budgets, reserving neighbor slots rather than silently increasing all limits. Apply existing lexical constraints and explicit temporal eligibility; do not bypass exclusions or auto-promote the newest proposal to current truth. Include cycles, hubs, unresolved links and misleading relationships.
  - [ ] 1.4 Starting target: +10 percentage points complete multi-source support on the predeclared affected slice, no overall/protected evidence loss, same context budget and <=20% higher warm p95. Before comparison, freeze an additional process-tree RSS ceiling of 128 MiB and <=25% initial/incremental indexing and derived-storage overhead; require at least two improved reserved tasks and adjudicated support. Record indexing/storage overhead and adopt only if useful evidence exceeds neighbor noise and lifecycle complexity. Add focused rebuild/invalidation/constraint/parity tests if adopted; remove losing machinery.

- [ ] 2.0 Finalize the experiment.
  - [ ] 2.1 Record paired per-journey outcomes, total interaction tokens, cold/warm runtime costs, uncertainty, failure examples and exact artifact identities. Distinguish required-span diagnostics, adjudicated packet support and actual answer accuracy.
  - [ ] 2.2 If adopted, verify focused meaningful regressions and required repository checks; update affected contracts and pending release notes for actual user-facing behavior. If rejected, retain the reproducible comparison and decision without production flags/dependencies.
  - [ ] 2.3 Review interactions with any other independently successful experiment on fresh scenarios before claiming combined gains; never replace the original baseline with an accumulated implementation.
  - [ ] 2.4 Record remaining limits, archive this completed list, repair references and commit scoped work under [the task workflow](../../docs/task-workflow.md); update the canonical changelog for the completed result.

## Evidence and relevant files

- [Baseline plan](tasks-workspace-retrieval-evaluation.md), `evals/workspace-retrieval/`, [product vision](../../docs/product-vision.md) and [source architecture](../../src/architecture.docs.md).
- `src/core/retrieval-policy/`, `src/core/canonical/`, `src/app/local-memory/` and `src/adapters/qmd/`, with their co-located docs.
- [Prior contextual indexing result](../done/2026-10-24_tasks-contextual-indexing-evaluation.md) and [retrieval review](../../deep-dives/retrieval-product-review/findings.md); known examples are regression controls, not fresh held-out evidence.
