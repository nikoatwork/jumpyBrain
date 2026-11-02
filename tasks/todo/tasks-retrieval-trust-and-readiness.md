# Explain retrieval readiness and investigate misleading relevance

Priority: P1. Status: planned; ranking changes require measured evidence, not arbitrary score thresholds.

## Goal

Tell users and agents what retrieval is ready to do, identify weak or degraded matches honestly, and ensure temporal relevance does not mistake import time for evidence time.

## Evidence and coordination

- [Agent review part 2, 2026-11-02](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=9254c8d1-7155-45b1-9dc7-dc49c85b9fe0) reports weak conceptual lexical results, no semantic setup nudge, migrated-note date skew and unclear inactive score components on a lexical-only brain.
- These are one reviewer's observations. Do not copy their private query corpus or infer a universal quality threshold from reported QMD scores. Lexical readiness, semantic availability and actual answer relevance are distinct.
- [Workspace evaluation](tasks-workspace-retrieval-evaluation.md) remains the owner of frozen quality/interaction-cost comparisons and broader human/VPS judgments. This list owns diagnostics and targeted date/readiness regressions; reuse that suite for any ranking change.
- [Desktop RAM](tasks-desktop-ram-next-improvements.md) owns its existing model-cost experiment budget. No automatic model download, semantic activation or new benchmark sweep belongs to this plan.

## Relevant files

- `src/app/local-memory/local-memory.docs.md`, `src/adapters/qmd/qmd.docs.md`, `src/core/` retrieval/provenance modules — retrieval, scores and date policy.
- `src/cli/doctor.ts`, `src/cli/formatting.ts`, `src/cli/bounded-reads.ts` — human/agent diagnostics.
- `src/app/migration/migration.docs.md`, `docs/technical.md`, `evals/workspace-retrieval/README.md` — imports, readiness and quality protocol.

## Tasks

- [ ] 1.0 Establish representative failures without private content.
  - [ ] 1.1 Add fictional paraphrase/distractor, shallow-without-pages, human-note decision and imported-date cases. Record candidate/selection/evidence failures separately from packet omissions and answer quality.
  - [ ] 1.2 Trace scoreBreakdown and readiness fields in lexical/semantic modes. Verify which date actually drives each recency term and whether reported inactive scores are expected.
- [ ] 2.0 Improve readiness diagnostics.
  - [ ] 2.1 Make doctor/status distinguish engine presence, index freshness, embedding coverage, supported retrieval modes and an actual bounded retrieval check. Expose failure/degraded state without claiming answer correctness.
  - [ ] 2.2 Offer a tested opt-in semantic setup path with model prerequisites, download/disk/RAM costs and explicit indexing action. Do not silently change an existing lexical brain or promise a default model before verifying support.
  - [ ] 2.3 Explain score fields only where useful, retaining rich diagnostics compatibility and avoiding confidence-as-truth language.
- [ ] 3.0 Investigate weak matches and temporal skew.
  - [ ] 3.1 Calibrate any weak-match signal on frozen positives/negatives across supported modes; abstain from adding a universal score/gap threshold without evidence. Preserve distinct empty, weak, partial and failed retrieval states.
  - [ ] 3.2 Prefer explicit evidence time for a recency term only if it matches the documented contract and passes paired temporal regressions. Preserve unknown dates, writing/import history and fact-validity uncertainty; never rewrite all imported created_at values as a shortcut.
  - [ ] 3.3 Measure shallow/type bias with human-authored notes and absent pages before adjusting policy. Keep automatic classification/promotions separate from retrieval and require explicit approval for metadata changes.
- [ ] 4.0 Verify and finalize.
  - [ ] 4.1 Run focused date/readiness and local/remote packet parity checks. For retained ranking changes, freeze baseline/candidate snapshots and verify supporting evidence, qualifications, full interaction cost and declared operational gates through the existing evaluation.
  - [ ] 4.2 Document measured diagnostic meaning, semantic setup and remaining quality/model/platform limits; update relevant release notes and archive/commit under [task completion](../../docs/task-workflow.md).
