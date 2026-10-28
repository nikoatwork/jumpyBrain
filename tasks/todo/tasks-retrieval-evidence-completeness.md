# Evidence completeness in recall packets

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

- [ ] 1.0 Experiment 1: preserve subject and governing context in evidence packets.
  - [ ] 1.1 Use baseline misses to identify passages whose original alias/frontmatter, heading ancestry or governing prose is needed for query-bound support. The October 24 contextual-indexing misses are seen regression controls; create fresh scope/qualification cases for confirmation.
  - [ ] 1.2 Prototype source-verified multi-span evidence bundles through pure excerpt/packing policy and existing app verification. Give every displayed span its real canonical citation, charge all metadata/text, pack required spans together and retain explicit incomplete-context/expansion behavior when they cannot fit. No fabricated continuous line ranges, generated source quotes or claim of semantic completeness from a heading alone.
  - [ ] 1.3 Compare baseline and prototype at matched total interaction budgets with candidate generation/ranking fixed. Starting adoption target: +10 percentage points fully supported tasks on the predeclared affected slice, no overall evidence loss/protected regressions, <=5% extra total interaction tokens and a frozen small latency allowance. Before comparison, freeze a quiet-window gate of <=10% higher warm p95 and <=50 MiB additional process-tree RSS, alongside the stated quality/token targets. Require at least two improved reserved tasks and adjudicate support rather than accepting phrase scores alone.
  - [ ] 1.4 Record paired judgments, costs and complexity; adopt only if gains justify the change. Add focused source/packing/expansion and local/remote parity regressions if adopted; otherwise remove experimental production machinery and record the no-adoption result.

- [ ] 2.0 Finalize the experiment.
  - [ ] 2.1 Record paired per-journey outcomes, total interaction tokens, cold/warm runtime costs, uncertainty, failure examples and exact artifact identities. Distinguish required-span diagnostics, adjudicated packet support and actual answer accuracy.
  - [ ] 2.2 If adopted, verify focused meaningful regressions and required repository checks; update affected contracts and pending release notes for actual user-facing behavior. If rejected, retain the reproducible comparison and decision without production flags/dependencies.
  - [ ] 2.3 Review interactions with any other independently successful experiment on fresh scenarios before claiming combined gains; never replace the original baseline with an accumulated implementation.
  - [ ] 2.4 Record remaining limits, archive this completed list, repair references and commit scoped work under [the task workflow](../../docs/task-workflow.md); update the canonical changelog for the completed result.

## Evidence and relevant files

- [Baseline plan](tasks-workspace-retrieval-evaluation.md), `evals/workspace-retrieval/`, [product vision](../../docs/product-vision.md) and [source architecture](../../src/architecture.docs.md).
- `src/core/retrieval-policy/`, `src/core/canonical/`, `src/app/local-memory/` and `src/adapters/qmd/`, with their co-located docs.
- [Prior contextual indexing result](../done/2026-10-24_tasks-contextual-indexing-evaluation.md) and [retrieval review](../../deep-dives/retrieval-product-review/findings.md); known examples are regression controls, not fresh held-out evidence.
