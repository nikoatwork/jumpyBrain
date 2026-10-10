# Evidence-safe consolidation and maintenance

## Completion — 2026-10-10

Implemented and verified; **638/638 tests pass** in the isolated implementation checkout. [Implementation/evaluation results](../../deep-dives/consolidation-field-study/implementation-results.md) own the detailed evidence and limits. The fictional external `maintenance-v1.1` slice completed 90 answers, two independent judges, source-fidelity adjudication, title/body ablations and unchanged-source checks. **No benefit verdict:** every arm missed required qualifiers; the strongest 6.12-point answer gain failed the preregistered improvement gate. Correctness repairs ship without a general retrieval-quality claim.

No private sources were changed by implementation/testing. Original private experiment cleanup is authorized after the implementation commit, excluding canonical notes/pages; reusable fictional evaluation data is separate. Pure ranking/selector ablations are explicitly skipped below, not claimed complete. No live hosted/platform or hostile-filesystem guarantee was tested.

## Goal

Make maintenance trustworthy: recognize valid provenance, distinguish candidate answers from supported resolutions, protect existing pages, and demonstrate that consolidation improves source-backed answers rather than merely ranking more summaries.

## Evidence and scope

- [Applied private-corpus field study](../../deep-dives/consolidation-field-study/findings.md), completed 2026-10-10: real lint/synthesis/dream writes and 96 fixed-query recalls; raw data remains outside Git.
- Dream edits increased normal-depth expected-fact credit from 8/50 to 28/50 in a small, non-held-out agent evaluation. Deterministic synthesis stayed at 8/50 despite a first-ranked page; two of three extracted bullets were non-topical.
- Lint emitted 36 findings. Three targeted answer suggestions lacked supporting answers; two inspected source-list warnings were false alarms. These are concrete regressions to reproduce, not population precision estimates.
- This is a follow-up investigation/implementation list, not authorization to sweep, rewrite, or delete private source memories. Keep Markdown canonical, recall explicit, original evidence preserved, and remote writes separately authorized.
- Adjacent concurrent planning already covers temporal-processing extraction/date/metadata repairs (`tasks-temporal-retrieval-correctness.md`), shared external evaluation/expansion (`tasks-budgeted-recall-and-expansion.md`), and index readiness (`tasks-semantic-index-reliability.md`). Coordinate with those owners rather than duplicate their implementations or edit their lists as part of this research commit.
- No new model provider, autonomous scheduler, temporal graph, automatic question closure, or mandatory summary generation. Prefer existing canonical link/read/write seams and a useful no-op over new machinery.

## Relevant files

- `src/app/processing/{processor,evidence,lint}.ts`, `processing.docs.md` — lint, source selection, synthesis and support reports.
- `src/core/canonical/links.ts`, `canonical.docs.md` — existing link/provenance resolution policy.
- `src/core/writing/`, `src/app/writing/` — identity, metadata, canonical writing policy and workflows; verify actual seams before editing.
- `src/cli/{args,memory-commands}.ts`, `cli.docs.md` — process options and explicit apply semantics.
- `src/core/dream/window.ts`, `src/app/dream/index.ts`, their co-located docs — date confidence and bounded context/diagnostics.
- `test/processing-{lint,evidence,safety}.test.js`, `test/process-args.test.js`, `test/canonical-links.test.js`, `test/filesystem-publication.test.js`, `test/dream-window-{app,bounds,policy,imports}.test.js` — small synthetic regression fixtures.
- `skills/how-to-dream/SKILL.md`, `docs/cli-commands.md`, `docs/agent-workflows.md` — honest maintenance expectations.

## Acceptance criteria

- Supported source references are not rejected solely because a heading differs from the generated template; broken links and context-only links remain distinguishable.
- Question-answer candidates expose a relevant evidence span and rationale, or abstain. Generic overlap and an unrelated document-wide “decision” cue cannot imply resolution.
- Synthesis cannot silently overwrite a human/dream page or newer revision. Apply flags have actual Boolean semantics; false never authorizes a write.
- Useful packet diagnostics fit the chosen review budget and distinguish selected-file date issues from root-wide import diagnostics. No heuristic filename parsing silently supplies invented event dates.
- Comparative evaluation reports answer support, historical/negative qualifications, original-source accessibility, and full interaction cost. Gains in summary rank or first-response brevity alone do not pass.
- Private data stays outside the repository; regression fixtures are fictional, not lightly renamed personal records. Record complexity removed/reused as well as any new maintenance burden.

## Tasks

- [x] 1.0 Execute a source-preserving local field study
  - [x] 1.1 Snapshot/hash canonical Markdown; confirm local target and actual command semantics.
  - [x] 1.2 Review historical and recent evidence with separate agents; fix queries before mutations.
  - [x] 1.3 Apply lint and synthesis, measure each stage, then apply reviewed dream edits and reindex.
  - [x] 1.4 Judge fixed snippets and paired answers, verify controls and source preservation, publish only sanitized findings.

- [x] 2.0 P1 — Make lint evidence-sensitive
  - [x] 2.1 Read architecture and affected module docs. Reproduce two classes of provenance false alarms with fictional `Sources`/`Sources and continuity` headings, ordinary relative links and memory IDs. Include broken targets, URL-encoded paths, and context-only references.
  - [x] 2.2 Reuse canonical link parsing/resolution rather than create a second Markdown grammar. Distinguish missing references, broken references, and insufficient claim support; a valid link alone does not prove entailment.
  - [x] 2.3 Add positive/negative question-answer fixtures: unrelated domains sharing common words, incidental matching entities, and an answer/decision cue far from the relevant passage. Preserve unresolved caveats.
  - [x] 2.4 Replace first-match document overlap with bounded evidence-bearing candidates and an abstention path. Remove generic function words, respect token boundaries, and expose the actual passage; do not claim deterministic matching proves semantic resolution.
  - [x] 2.5 Add structured issue codes, evidence/rationale, severity or confidence, inspected/total scope, and accurate issue counts. A clean report must count zero issues rather than count its “no findings” message as one.
  - [x] 2.6 Preserve distinct run reports or make overwriting explicit; include invocation bounds and a stable run identifier. Avoid turning audit history into a mandatory queue/state machine.

- [x] 3.0 P1 — Protect processing writes and align synthesis claims
  - [x] 3.1 On disposable fictional roots, reproduce code-review risks: same-slug existing human/dream page, stale revision, metadata retention, symlink destination, and `--apply false`. Never test destructive cases on private originals.
  - [x] 3.2 Route updates through approved identity/ownership/concurrency and atomic-write seams. Define conservative collision behavior; retain existing IDs and applicable metadata. Parse apply as a Boolean, rejecting malformed values.
  - [x] 3.3 Coordinate passage-selection, temporal-scope, and metadata fixes with the existing temporal-processing plan. Add a source with irrelevant opening metadata, a later relevant mechanism, and a subsequent qualification; the final output must not promote the opening line as topical understanding.
  - [x] 3.4 Decide whether the deterministic operation is an extractive source map or genuine reviewed synthesis; label its output and docs honestly. No hidden model invocation. Keep agent reconciliation separate from deterministic suggestions.

- [x] 4.0 P2 — Keep dream windows reviewable around imports
  - [x] 4.1 Add a synthetic import-burst fixture where old undated notes share a recent creation date and crowd a bounded window; include correctly dated recent evidence and missing/invalid dates.
  - [x] 4.2 Define visible date confidence and deliberate review choices for fallback-dated imports. Preserve existing evidence/modified semantics; do not silently guess event dates from ambiguous filenames.
  - [x] 4.3 Prioritize selected-window/file diagnostics; summarize out-of-window fallback issues by count with optional explicit expansion. Bound serialized diagnostics as well as body content and expose truncation honestly.
  - [x] 4.4 Verify that narrowing/pagination/no-op decisions never imply full corpus coverage; retain source-preservation and historical-status caveats in workflow guidance.

- [x] 5.0 P2 — Validate maintenance with the shared evaluation work
  - [x] 5.1 Freeze a supported installed runtime fingerprint and retrieval-readiness/index policy before comparison. Recheck excerpt misses against current code; this field study's installed excerpt implementation lagged the checkout.
  - [x] 5.2 Extend the external versioned evaluation suite with held-out technical reasoning, decision evolution, false-conflict, unresolved-question, deep-source, no-answer, and unrelated-control cases. Use independent source adjudication and predeclared acceptance thresholds.
  - [x] 5.3 Compare baseline, deterministic extraction, and reviewed dream edits with equal output/expansion budgets. Record source-backed answer support, qualifications, original-source availability, total bytes/tokens, latency, page growth, and backend degradation—not just map rank.
  - [x] 5.4 Run title-only, neutral-title body and no-expansion ablations; perform an unchanged-source revisit (zero unnecessary writes/new dream pages). Do not attribute gains to a single mechanism.
  - [~] 5.4a Pure dream-preference and alternative-selector ablations — skipped under the preregistered unsupported-seam rule. No isolated supported switch was used; changing depth/type would confound the comparison. Adding production configuration only for this experiment was rejected. Mechanism attribution remains unknown.
  - [x] 5.5 Preserve source/hash checks and private rollback artifacts. Ensure secrets and unrelated personal passages from mixed sources do not enter generated pages or public fixtures.

- [x] 6.0 Document and verify implemented changes
  - [x] 6.1 Update owning processing/dream/CLI docs and skill guidance for changed contracts; use glossary entries only for stable reusable terms.
  - [x] 6.2 Run targeted regressions and the full product test suite after implementation. Record actual results, private-run limits, and any untested remote behavior here.
  - [x] 6.3 Review complexity: consolidate link/excerpt/date/write policy through existing owners, remove superseded heuristics and misleading claims, and avoid keeping a second evaluation harness. Add a changelog highlight only for a significant implemented change, not this research/task creation.
