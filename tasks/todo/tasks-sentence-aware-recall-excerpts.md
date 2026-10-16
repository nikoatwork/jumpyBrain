# Sentence-aware long-paragraph recall excerpts

**Lifecycle: implementation complete; retained here pending explicit archive approval.** This is completed history, not an active execution plan.

## Goal

Improve readability of oversized prose excerpts by preferring defensible sentence boundaries, without losing the matched evidence, fabricating source text, or claiming complete qualifications.

## Notes

- User authorized compatible implementation of generalizable production recall feedback.
- Existing excerpt selection is already Markdown-aware. This task targets only long prose slicing, not candidate generation, ranking, larger default budgets, or special Do/Say headings.
- Preserve the 1,000-character default bound including markers, explicit partial/ancestor markers, source coordinates, match retention, and compact source-verification behavior.
- Sentence-boundary detection is a conservative deterministic heuristic, not semantic completeness. Retain existing match-centered fallback for ambiguous punctuation, code, links, abbreviations, or sentences that cannot fit.
- Ownership: `src/core/retrieval-policy/excerpts.ts`, its co-located docs, and `test/recall-excerpts.test.js` (or a new focused sentence test). Do not edit user workflow docs, compact wire schema, or interaction-cost tests owned by other agents.
- No runtime tokenizer, new dependency, automatic full reads, memory writes, commits, or archiving. Granular evidence belongs here, not in the changelog.

## Relevant Files

- `src/core/retrieval-policy/{excerpts.ts,retrieval-policy.docs.md}` — pure excerpt selection and owned contract.
- `src/core/canonical/{markdown-structure.ts,canonical.docs.md}` — existing Markdown structure and guarded expansion.
- `src/core/retrieval-policy/compact.ts` — source-match invariant (inspect; change only with parent approval).
- `test/{recall-excerpts,recall-sentences}.test.js` — existing structural and new sentence/fallback regression coverage.

## Tasks

- [x] 1.0 Characterize the narrow failure
  - [x] 1.1 Read architecture/module docs and excerpt tests; add synthetic long-paragraph cases with later matches, repeated terms, Unicode, and distant qualifications.
  - [x] 1.2 Establish explicit limits: no guarantee to include distant guidance; no domain-label or generated-summary policy.
- [x] 2.0 Implement conservative sentence-boundary preference
  - [x] 2.1 Prefer complete prose sentences around the selected match when they fit, with a match-preserving existing fallback for oversized/ambiguous units.
  - [x] 2.2 Preserve original contiguous source text, real line citations, markers, budget, and current handling of lists/fences/link destinations.
  - [x] 2.3 Update only the co-located policy contract to describe the heuristic and retained limitations.
- [x] 3.0 Verify integrity and regressions
  - [x] 3.1 Test boundary behavior, no-punctuation/overlong fallback, late matching, link/code safety, arbitrary headings and excerptMatchesSource compatibility.
  - [x] 3.2 Run focused excerpt/compact regressions; record commands/results and complexity review. Parent runs the integrated full suite.

## Decisions and limits

- Source inspection confirms selection is already structural; only the oversized-line branch changes. Preserve its weighted-term choice and first occurrence, not a new match/ranking policy.
- Prefer a contiguous run of complete sentences around that occurrence; following sentences get budget priority, then preceding sentences. Always retain the partial marker, even when the chosen run ends at a sentence boundary.
- Scope is deliberately plain **single-line paragraphs**, including an immediately preceding ATX/setext heading recognized by the existing structural selector. Wrapped paragraphs, fences, lists, blockquotes, inline Markdown/code/link syntax and indented code keep existing slicing. `excerptMatchesSource` accepts within-line partial slicing only for a single cited line; no `compact.ts` or schema changes are needed or authorized.
- Detection is conservative, deterministic, and not an exhaustive abbreviation parser or semantic guarantee. Uppercase subsequent starts, unquoted terminators and defensible lowercase period-ending words are required. Known abbreviations/initials/decimals/ellipses, case-fold offset changes, overlong/no-punctuation units, and uncertain punctuation fall back unchanged.
- No guarantee of distant guidance, generated summaries, domain/heading labels, larger budgets, dependencies, automatic reads, or memory writes.
- Complexity review: the added paragraph token scan is linear in input characters, with a linear boundary array. Separate word/punctuation alternatives avoid a potentially quadratic word-plus-terminator regex on long punctuation-free words. Existing structural selection complexity is unchanged.

## Verification

- Before rebuilding, `node --test test/recall-sentences.test.js` against existing `dist` characterized the failure: 20 passed / 3 failed; slices began in preceding sentences and ended mid-sentence. This was expected old behavior, not the final result. Added a further 64,000-character punctuation-free word adversarial case after that run.
- Ran the one authorized `npm run build`: passed (TypeScript and editor bundle). Initial built focused run: 88/89 passed. The remaining failure identified a structural heading prefix coalesced with its following single-line paragraph by `blockRanges`; refined the eligibility gate to allow only a recognized heading prefix, not wrapped prose. Added explicit no-heading/ATX/setext/blank-separator regressions.
- `npx tsc -p tsconfig.json --noEmit`: passed after that refinement.
- To respect the one-build limit, used Node's temporary `registerHooks` import hook at `/tmp/jumpy-sentence-source-XXXXXX.mjs` to redirect only `dist/core/retrieval-policy/excerpts.js` to current `src/core/retrieval-policy/excerpts.ts`, plus its `.js` structure import to `src/core/canonical/markdown-structure.ts`. All other imports still use the built output. No repository loader/dependency or emitted-file changes.
- Final command: `JUMPY_SENTENCE_TEST_ROOT="$PWD" node --import /tmp/jumpy-sentence-source-XXXXXX.mjs --test test/recall-sentences.test.js test/recall-excerpts.test.js test/compact-recall.test.js test/canonical-expansion.test.js test/canonical-document-read.test.js`: **95/95 passed**, including 30 new sentence/fallback cases and unchanged excerpt/compact/current-source regressions.
- Inspected actual current-source output: at 180 characters, the late-match case returns `… The QUARTZ observation remains provisional. Only the enclosed trial is authorized. … [partial excerpt; expand source]` (119 characters, line 2 through 2, source verification true). The `approx.` case keeps the old 170-character partial slice and also verifies.
- `git diff --check`: passed. Changes restricted to the owned excerpt source/docs, new focused sentence test, and this task; no compact/schema, workflow/instruction, interaction-cost, changelog, commit/archive, or memory changes.
- Parent integration verification: `npm test` rebuilt final source, including the heading-prefix gate refinement, and completed successfully: **854 passed, 1 skipped, 0 failed** (855 total). Independent read-only review found no actionable issues; `git diff --check` passed. Implementation and integration checks complete; task remains here pending archive approval.
