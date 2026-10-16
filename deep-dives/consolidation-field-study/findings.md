# Applied consolidation field study

Date: 2026-10-10. Status: completed, exploratory—not a benchmark or implementation change. The subsequent [implementation and held-out evaluation](implementation-results.md) records shipped fixes and a stricter no-benefit verdict.

## Bottom line

Agent-reviewed dream pages improved the evidence available in fixed recall snippets. Deterministic synthesis did not improve judged answer coverage, even when its page became the first result. Lint emitted useful review candidates alongside demonstrably unsupported suggestions; it did not reconcile facts or change retrieval.

Keep additive, source-preserving dreaming. Do not equate a high-ranked synthesized page, a lint suggestion, or newer prose with better or settled knowledge. Follow-up: [processing and maintenance reliability](../../tasks/done/2026-10-10_tasks-consolidation-maintenance-reliability.md).

## Privacy and execution

- The user authorized real processing of a private local root, including dream-page writes. No remote/shared memory was accessed or changed.
- All corpus snapshots, commands, raw packets, queries, expected answers, judges, drafts, hashes, and rollback evidence remain in a private experiment directory outside this repository. This report contains aggregate results only. Do not publish private fixtures, filenames, quotes, identities, or credentials.
- Started with 1,627 canonical Markdown files and a private byte-for-byte backup/hash manifest. Finished with 1,628: one new topical page, one revised existing dream page, no deletions. All other 1,626 originals were hash-identical, including every original note/journal and non-dream page.
- Both final page changes used CLI `show`/hash-checked `update`, retained IDs, and were indexed. All 12 Markdown links across the two final pages resolved. No source notes were merged, moved, deleted, or silently corrected.
- Source preservation is byte-level losslessness, **not** proof that the new summaries retain every relevant fact. Memory size increased; this was retrieval-oriented additive consolidation, not storage compression.

## Method

1. Confirmed target and commands; explicitly recalled relevant memory. `dream` retrieves evidence rather than calling a model. There is no separate reconciliation command: tested `process lint`, `process synthesize`, and the agent-led dream workflow.
2. Captured two useful evidence windows: seven full sources in a historical seven-day window and nine full sources in a recent nine-day window. None of those 16 packet files was truncated. Bounded follow-ups and existing-page inspections checked context and duplication; this was not whole-corpus semantic review.
3. Separate scout agents proposed one historical technical map and an update to an existing recent synthesis. Six source-grounded queries and expected-fact rubrics were fixed before canonical mutations; two unrelated queries served as controls. The scouts also drafted the pages, so these are **not held-out queries**.
4. Reindexed before baseline. Ran identical top-five CLI recalls for eight queries at shallow, normal, and deep depth after each stage: baseline, applied lint, applied deterministic synthesis plus index, reviewed dream edits plus index. Total: **96 measured recalls**; setup/follow-up reads are additional.
5. Applied lint with `--limit 2000 --apply`, exceeding this corpus size. Applied synthesis with a two-word topic, `--limit 4 --apply`; it selected three sources and wrote a previously absent page. After measurement, upgraded that experiment-created page into the reviewed dream rather than leaving a low-value duplicate. Also revised the existing dream page. Both were real writes, not previews.
6. An independent agent checked draft fidelity before application. Two fresh evaluators received only retrieved snippets, expected-fact rubrics, and opaque condition labels—not canonical sources or the label key. They scored 25 compound expected-fact items per depth: 0 absent, 1 partial, 2 adequately supported. Explicit caveats needed retrieved support. They also wrote 18 normal-depth answers across six queries and three judged conditions.

Labels were guessable from content; the evaluation was only partially blinded. Judges were agents, not independent human ground truth. Fixed top-five limits are **not matched byte/token budgets**. Depths and stages reuse queries and are not independent observations.

## Retrieval and answer results

Snippet-supported expected-fact credit, maximum 50 per depth:

| Condition | Shallow | Normal | Deep |
| --- | ---: | ---: | ---: |
| Baseline | 5/50 | 8/50 | 11/50 |
| Applied lint | unchanged recall JSON | unchanged recall JSON | unchanged recall JSON |
| Deterministic synthesis | 5/50 | 8/50 | 11/50 |
| Reviewed dream edits | 27/50 | 28/50 | 25/50 |

Normal-depth breakdown:

| Cohort, three queries each | Baseline | Deterministic | Dream |
| --- | ---: | ---: | ---: |
| Historical technical reasoning/details | 0/20 | 0/20 | 16/20 |
| Recent decision evolution/qualifications | 8/30 | 8/30 | 12/30 |

- **15/18** subject query-depth cells gained judged fact coverage after dreaming; three tied and none lost points. This does not establish absence of other regressions.
- **6/6** control query-depth results remained exactly identical, including scores/snippets/provenance.
- Applied lint left all **24/24** measured recall JSON outputs byte-identical to baseline.
- Deterministic synthesis changed rankings in three cells, placing its generated page first in all three. It added **zero** rubric credit. Two of its three bullets were plainly non-topical: imported property syntax and an unrelated opening diary line. The third was broadly adjacent. Relevant discussion existed later in a selected source.
- In a historical-detail normal query, the baseline answer had to abstain; after dreaming, the excerpt supported the proposed consistency mechanism, validation experiment, and explicit lack of measured results. In a recent-history query, the answer gained the distinction between changed confidence and an unconfirmed outcome. Exact paired answers remain private.
- Some important historical details, resource questions, and qualifications still failed to surface. A natural-language query gained project-status evidence at shallow/normal but not deep. “Deep” did not guarantee a more complete answer. One improved deep result substituted a map for raw evidence: more rubric coverage did not mean more independent source support.

### Context and timing costs

Across the same 24 recalls, serialized JSON output grew from **251,916 to 266,191 bytes** (about 5.7%). Median elapsed CLI time was 1.225s baseline and 1.421s after dreaming. This sequential, uncontrolled run does not establish a causal latency change. No tokenizer, full recall-plus-expansion cost, or model-token/cost comparison was measured.

The revised existing dream grew from **5,999 to 10,017 bytes** while covering additional evidence; the new page was **3,204 bytes**. Better retrieval here did not mean shorter memory. Page title, content, citations, dream classification of the new page, and index changes were not separately ablated.

## Processing defects observed

### Lint: heuristic candidates are not reconciled answers

The applied report contained **36 findings**:

| Class | Count | Audited evidence |
| --- | ---: | --- |
| Missing provenance | 9 | Two clear false alarms on pages with explicit source lists and working links; a third inspected case had contextual links but weaker direct provenance |
| Potentially stale pages | 4 | Not adjudicated |
| Potentially answered questions | 23 | Three deliberately selected suspect matches checked; all three cited files failed to answer the questions |

The targeted checks do **not** estimate an unbiased false-positive rate. No undeclared semantic conflicts were detected by this heuristic pass; that is not evidence that none existed.

Mechanisms confirmed in `src/app/processing/processor.ts`:

- Provenance detection recognizes `## Source memories` or one inline marker, not valid ordinary links under other source headings.
- Answer suggestions accept document-wide answer/decision cues plus loose substring overlap, including common words, and choose the first qualifying document. Cross-domain overlaps can satisfy the test without an answering passage.
- Synthesis selects whole documents by topic but summarizes each using its first useful line, truncated to 240 characters. This disconnect caused the observed irrelevant output.
- Same-day/topic lint reports overwrite: before/after reports were explicitly copied to private stage artifacts. The second lint run therefore did not preserve its own predecessor.

### Dream windows: import dates and diagnostic noise

An initial recent window matched **567** files; its first ten were legacy imported notes using creation-date fallbacks rather than reliable event dates. A narrower window still matched 130; narrowing past the import burst yielded the nine-source recent cohort. Do not confuse this selection adjustment with a successful historical review of the skipped imports.

Both useful packets included many fallback warnings for files outside their selected window, plus a notice that **478 additional diagnostics were omitted**. Global diagnostics crowded the bounded review even when selected historical sources had explicit dates. The recent cohort's dates all used creation-time fallback; that limitation remained explicit in the resulting page.

The agent review distinguished changed assessments, proposals versus implemented decisions, and different outcome measures. It did **not** claim to prove which disputed assertion was true, close open questions automatically, or discover a definitive factual contradiction.

## Runtime and causal limits

- Tested the installed **0.2.0** CLI, not a freshly built checkout. Checkout starting revision: `7580f13`. Runtime hashes are recorded privately.
- Installed/checkout processing, dream assembly, QMD driver, and ranking artifacts matched in the checked files; excerpt implementation differed. Reproduce excerpt-related findings on the current supported runtime before opening duplicate fixes.
- `JUMPYBRAIN_QMD_EMBED` was unset; index rebuilding did not request embeddings. Results describe the tested installed configuration; **semantic/hybrid behavior was not independently verified**. Backend query degradation and embedding readiness were not independently instrumented.
- Baseline reindex may differ from the user's pre-experiment derived index. All compared stages used the same installed CLI and indexing policy.
- The sample was selected for useful synthesis, not randomly sampled. Queries/rubrics and drafts shared scouts; even with independent judges, the measured gain can reflect this alignment.
- No source-removal test, repeat-run idempotence test, long-term drift study, model ablation, human review, or hosted parity trial was performed. No production code was changed; the measured CLI experiment, hash checks, and artifact/link checks are the verification—not a claim that the product test suite ran.

## Recommended direction

1. Fix lint provenance recognition and evidence-poor answer suggestions; preserve abstention and never auto-close questions from lexical overlap.
2. Repair or honestly rename deterministic synthesis. Reuse the existing temporal-processing work for passage selection, date scope, and metadata retention; do not build a second synthesis engine.
3. Protect synthesis destinations with ownership/concurrency checks. Code review found direct overwrite without a hash or ownership guard; no original user page was overwritten in this study. Likewise review apply-flag parsing separately; dangerous cases were not exercised on private originals.
4. Make dream packets useful around import bursts: visible date confidence, bounded selected-window diagnostics, and deliberate handling of low-confidence dates—not invented historical dates.
5. Reuse the shared external evaluation effort for held-out paired answers, qualification retention, source expansion, total context, and runtime readiness. Prefer source-preserving no-ops when a page adds no value; do not optimize ranking alone.
