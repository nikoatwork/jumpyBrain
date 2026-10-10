# Maintenance implementation and held-out evaluation

Completed 2026-10-10. Follow-up to the [applied field study](findings.md); [archived task](../../tasks/done/2026-10-10_tasks-consolidation-maintenance-reliability.md).

## Shipped changes

- **Evidence-sensitive lint:** canonical inline/reference/wiki links and unique memory IDs replace heading-template checks. Missing, broken/ambiguous and context-only references are distinct. Open-question candidates need bounded same-paragraph evidence, distinctive exact tokens and a local answer cue; unresolved and adjacent status caveats cause abstention. Suggestions never close questions or prove entailment.
- **Auditable reports:** additive typed issue codes, severity, evidence, rationale, invocation scope, accurate zero-clean counts and unique run IDs. Reports no longer overwrite same-day runs.
- **Honest extraction:** deterministic synthesis is labeled an extractive source map, selects structural passages rather than opening lines, preserves bounded qualifications and original line/path citations, and applies temporal bounds and dream exclusions to direct and supplemental sources. This is not model-based reconciliation or inferred event chronology.
- **Protected writes:** process-owned pages only, metadata/ID preservation, optional CLI/API hash preconditions, unchanged-content no-ops, strict Boolean apply flags and duplicate-flag rejection. Canonical updates stage/fsync, recheck identity/hash/path before atomic publication, and use a short cooperating-writer publication lock. New files publish complete staged bytes exclusively. Human/dream collisions and unsafe destinations fail closed.
- **Reviewable dream windows:** declared/filename/fallback/modified date provenance; selected-file warnings take priority, unselected paths are not dumped into diagnostics, and root-wide issues are aggregate counts. Warning serialization is bounded separately from content; omissions/truncations remain explicit. No guessed event dates or automatic source rewrites.

The canonical link/writing and structural excerpt policies are reused rather than replaced with a parallel parser, summarizer, backend or scheduler. Processing orchestration was split into focused evidence and lint helpers. Filesystem hardening applies to existing writers, not a processing-only transaction engine.

## Verification

- Isolated implementation checkout: **638/638 tests passed**, including canonical read/update, local/remote/HTTP writing, CLI, graph, dream-window, privacy/bounds and architecture regressions. `git diff --check` passed.
- Focused independent review found two additional edge cases; both were fixed and tested: source filenames containing parentheses and oversized adjacent unresolved caveats.
- Fresh canonical ID reads, complete bytes at publication, concurrent stale writers, held lock contention, symlink/hardlink destinations, collision retries, cleanup, metadata retention and unchanged reruns are covered by fictional tests.
- Full CommonMark parsing, hostile external filesystem races, power-loss recovery, live hosted deployment and platform-specific hardlink support are not certified. Unsupported hardlinks fail closed. A crash may leave hidden staging/lock files; operators must establish that no writer is active before removing a stale lock.

## External evaluation: no benefit verdict

Reusable external slice: **maintenance-v1.1**, entirely fictional. Data, prompts, runner adapters and raw outputs remain outside this public repository; no broad product benchmark harness or private fixtures were added. The shared evaluation effort can reuse this versioned slice and its frozen manifests.

Twelve originals, seven target queries and two controls. Five independent source-identical arms: originals (B), extractive maps (E), reviewed dream pages (D), title/link-only maps (T), and neutral-title dream bodies (N). Query/rubric construction was withheld from the synthesis writer; two source adjudicators and a fresh query-blind fidelity/revisit reviewer checked the fixtures and pages. Two independent answer judges agreed on every binary score position. Source-fidelity auditing separately adjudicated unsupported claims and citation defects.

Each arm used real QMD lexical retrieval with **zero embeddings**, frozen runtime/index settings, normal depth and top-five recall. The 45 primary contexts included bounded original expansion; 45 no-expansion contexts reused initial retrieval. Each of the **90 fresh, tool-free answer processes** received 4,096 modeled UTF-8 input bytes: 99 fixed system bytes plus 3,997 user bytes. Only labeled whitespace padding was adjusted; evidence was not edited. Actual API framing is not included in that modeled bound and remains unknown. Equal bytes are not equal tokens or billing cost.

Seven-target macro averages (binary whole-item support; controls excluded):

| Arm | Evidence, either setting | Answer with expansion | Answer without expansion |
| --- | ---: | ---: | ---: |
| B: originals | 66.42% | 66.42% | 66.42% |
| E: extractive maps | 66.42% | 61.66% | 66.42% |
| D: reviewed dreams | 72.54% | 72.54% | 72.54% |
| T: title/links only | 66.42% | 61.66% | 66.42% |
| N: neutral-title dreams | 68.46% | 68.46% | 63.70% |

**Every arm failed the protected-qualification gates:** only 9/16 critical qualifications were expressed, and overall qualification coverage was below the required 90%. D's 6.12-point gain affected only one target; the preregistered threshold required at least ten points and improvements on three targets. These are named gate failures, not a passing product-quality verdict.

Both controls retained all four items throughout. Original source bytes remained identical in every arm; all generated provenance links resolved offline. Offline source access is not answer-visible evidence and cannot repair a wrong citation. No generated fictional privacy-canary leaks, false unresolved-question closure or invented absent specification occurred. Source audit nevertheless confirmed **three no-expansion assertion/provenance defects** and retained three scope uncertainties across settings. Primary answers had no confirmed material defect, but two scope warnings remained.

### Corrections, costs and limitations

- The initial v1 fixture mistakenly used bare UUIDs. Original `show` calls failed. That failed run was retained, then v1.1 made a declared **identity-prefix-only correction** before answer generation or judging. All 60 preflight and 71 measured source reads succeeded in v1.1; no score-informed rewrite or reroll was used.
- Source corpus: 11,277 bytes per arm. Derived B/E/D/T/N Markdown: 0 / 6,055 / 5,289 / 1,140 / 5,016 bytes. Two source maps per nonbaseline arm; no source deletion or storage-compression claim.
- Ninety answers reported **82,883 provider tokens** total. Retrieval plus expansion took about 52.34s; answering took 189.71s wall time at bounded concurrency. Raw retrieval emitted 336,153 CLI bytes plus 204,019 overlapping nested-QMD bytes; these are not unique wire-traffic measurements or a causal performance comparison.
- Title-only and neutral-title ablations ran. Pure dream-preference and alternative-selector ablations were **not run**: no supported isolated execution seam was used, and no production machinery was added merely to force a causal claim. The larger/smaller optional byte-budget sensitivities also did not run.
- Extractive reruns made zero writes and preserved bytes. A fresh source-only review of unchanged dream evidence recommended no new page or content change.
- The sample is tiny and fictional, labels are partly guessable, judging is agent-based, and full process-level writer-input attestation is unavailable. This is a held-out-from-synthesis diagnostic, not population evidence, a real-data privacy guarantee, independent corroboration by summaries, or proof of a particular ranking mechanism.

## Disposition

Ship the demonstrated correctness/safety repairs and honest command contracts. Do **not** claim that consolidation is generally better or lossless at answer level. Preserve qualification/source-expansion gaps as evidence for the existing shared retrieval/evaluation work rather than add another model or ranking mechanism here.

The private original field-study artifacts were never committed. The user authorized their removal after the implementation commit; canonical private notes and useful dream pages are excluded from cleanup. Fictional reusable evaluation data is separate from that private experiment.
