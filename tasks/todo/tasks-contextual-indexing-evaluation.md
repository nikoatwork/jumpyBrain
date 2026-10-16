# 5 — Evidence-gated contextual indexing

## Goal

Test whether inexpensive document/section context improves retrieval of ambiguous passages, and ship only the smallest supported enrichment that measurably helps. Original Markdown remains canonical and every result remains traceable to original source lines.

## Notes

- Approved for planning on 2026-10-10. Direction: [product vision](../../docs/product-vision.md); evidence and external sources: [retrieval review](../../deep-dives/retrieval-product-review/findings.md#5-try-contextual-indexing-only-if-remaining-misses-justify-it).
- Do diagnosis after [ticket 1](../done/2026-10-10_tasks-semantic-index-reliability.md) stabilizes semantic indexing. Freeze the comparison baseline after [ticket 4](tasks-bounded-retrieval-execution.md)'s execution changes; use [ticket 2](../done/2026-10-11_tasks-budgeted-recall-and-expansion.md)'s full-interaction accounting and [ticket 3](../done/2026-10-11_tasks-temporal-retrieval-correctness.md)'s explicit date semantics.
- Candidate context: existing title, heading ancestry, canonical aliases, and explicit evidence date. Inspect what the supported QMD version already indexes before duplicating it.
- No new vector backend, mandatory LLM extraction, query-time generated summaries, or inference of facts/dates/aliases. Model-generated key expansion is outside this ticket.
- A documented no-go with no production enrichment is a successful outcome if gains are absent or implementation cost violates the lean vision. This is not approval to ship an unmeasured feature.

## Bigger picture and simplification

- Optimize the whole local/shared memory system: correct evidence per token, temporal trust, responsiveness, and easy operation—not feature count.
- Give explicit credit for fewer independent code paths, duplicated policies, configuration knobs, dependencies, and maintenance steps. Prefer replacing obsolete machinery to layering another system beside it; no arbitrary lines-deleted target or unrelated cleanup campaign.
- Preserve supported contracts, recovery, security, and useful regression coverage. Remove genuinely dead code and stale docs; do not call a safety check or necessary compatibility path dead without checking callers.

## Acceptance criteria

- Completion includes a short complexity review: what was removed/consolidated, what new machinery remains and why, and any retained compatibility debt. Added complexity must earn its place by meeting the goal; net simplification is a positive outcome alongside correctness and efficiency.
- A reproducible diagnosis distinguishes missing candidates from bad ranking, bad excerpts, and answer-generation failures; enrichment is applied only to a demonstrated retrieval-context problem.
- Evaluation uses independently judged, held-out queries and a frozen baseline at matched budgets; no tuning to the acceptance set or claimed transfer of another project's published gains.
- If shipped, enrichment is derived/rebuildable, bounded, incrementally maintained, and fully maps to canonical document IDs/locations. Source edits/deletions/renames invalidate the correct derived context.
- Added retrieval text is never presented as a source quote or assigned fabricated source lines. Expansion/hash checks still address original Markdown.
- Production adoption requires improved supporting-evidence coverage without material regressions in exact matches, qualification retention, temporal correctness, total context, or operating cost. Thresholds are recorded before the final comparison.

## Relevant files

- `src/adapters/qmd/{qmd-cli,qmd-driver,qmd-query,qmd-snippets}.ts`, `qmd.docs.md` — supported indexing capabilities and provenance repair.
- `src/core/canonical/`, `src/core/retrieval-policy/excerpts.ts` — canonical metadata and structural source boundaries.
- `src/app/local-memory/index.ts`, `src/types.ts` — indexing composition/derived manifests.
- `test/recall-{excerpts,diversity,fusion}.test.js`, `test/search-ranking.test.js` — precision, diversity, and attribution regressions.
- `docs/memory-format.md`, `docs/technical.md` — canonical versus derived contract.

## Tasks

- [ ] 1.0 Establish the failure class and evaluation gate
  - [ ] 1.1 Read architecture/affected docs and inspect supported QMD title/context/chunking APIs. Prefer existing capabilities; do not couple to undocumented QMD database internals.
  - [ ] 1.2 Reuse ticket 2's external versioned judged development/held-out suite and interaction accounting; extend its context-failure slice with pronouns, ambiguous section-local language, aliases, paraphrases, exact identifiers, dates, and negative/no-answer cases. Freeze the resulting suite version; keep private data and broad benchmark harnesses outside the product repo.
  - [ ] 1.3 Record baseline candidate recall, evidence coverage, qualifications, total recall-plus-expansion tokens, query latency, index size/time, and incremental update work. Separate candidate-generation effects from ranking effects.
  - [ ] 1.4 Choose concrete adoption/regression thresholds before final evaluation. If existing QMD context already solves the misses, prefer configuring/reusing it over a second enrichment layer.

- [ ] 2.0 Prototype the smallest derived enrichment
  - [ ] 2.1 Test deterministic title/heading ancestry first, then independently ablate aliases and explicit evidence dates. Enforce context length bounds and avoid repeating unchanged title/context unnecessarily.
  - [ ] 2.2 Preserve original evidence in the retrieval value. If supported APIs require derived shadow documents, maintain exact canonical identity/range/hash mappings and prevent those files from becoming independent canonical memories or duplicate results.
  - [ ] 2.3 Integrate with ticket 1's incremental lifecycle: recompute only affected context on title/heading/alias/date/body changes; remove deleted mappings; support explicit rebuild and rollback to the baseline index mode.
  - [ ] 2.4 Test ordinary/dream/source-focused retrieval without amplifying duplicated source/map evidence. Do not inflate relevance by adding generic keywords to every chunk.

- [ ] 3.0 Make the adoption decision
  - [ ] 3.1 Run fixed-baseline ablations and the held-out comparison with identical embedding/model versions, candidate limits, output budgets, and hardware; report uncertainty and sample limitations.
  - [ ] 3.2 If thresholds pass, integrate only winning components behind an explicit indexing configuration with a compatible default/migration and reindex requirement. If they fail, remove experimental production paths and record why no feature ships.
  - [ ] 3.3 Verify that returned excerpts, citations, hashes, and selective expansion refer exclusively to canonical evidence, including files that changed after indexing.

- [ ] 4.0 Retain useful regressions and document the result
  - [ ] 4.1 Add small deterministic regressions for proven failure modes, Unicode/heading boundaries, changed context, deleted notes, ID/path collisions, exclusion rules, and source-provenance integrity; no model-dependent normal tests.
  - [ ] 4.2 For an adopted feature, update indexing/QMD/memory-format contracts and configuration/recovery docs. For a no-go, keep the decision and non-secret evidence summary in this task instead of adding permanent product surface.
  - [ ] 4.3 Run `npm test`, verify rebuildability and local/remote parity, and record results here. Do not claim general quality or efficiency gains beyond the evaluated workload.
  - [ ] 4.4 Include maintenance/configuration/index-state complexity in the adoption decision, not just retrieval scores. Prefer native QMD reuse or no new feature over an equivalent custom pipeline. Remove losing prototypes, duplicate enrichment, unused flags, and stale docs instead of retaining dormant experiments; record the complexity review and rerun affected tests after cleanup.
