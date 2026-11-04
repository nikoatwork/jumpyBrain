# Feedback semantic increments — predeclared isolated candidates

Status: candidate contracts frozen before fresh outputs, 2026-11-03. These are two independent proposals for units 2 and 3 in [the feedback list](../../tasks/done/2026-11-04_tasks-feedback-independent-increments.md), not production changes or an adoption decision. The candidate implementer did not inspect `feedback-semantic/` fixtures or fresh run outputs. The parent owns execution, judgments, production integration and final outcome records.

Follow [PROTOCOL.md](PROTOCOL.md) and the separation/admission distinction in [DISCOVERY-EXPERIMENT.md](DISCOVERY-EXPERIMENT.md). The old workspace cases are seen regression controls. Fresh fictional cases must be authored/frozen separately from implementation and remain source-specific; different names alone do not establish independent scenarios. Author-declared slices, corpus/query/rubric hashes, runtime/model/index identity and this policy must be frozen before quality execution. Do not tune these candidates on new outputs. Preserve rejected results and unavailable/failed branches in the denominator.

## Installed backend contract

Source inspection only: `/opt/homebrew/lib/node_modules/@tobilu/qmd/package.json` identifies **2.8.3**. `dist/store.js:buildFTS5Query` supports double-quoted phrases, boundary `-term`/`-"phrase"` exclusions and internal hyphens as phrases (`multi-agent`, `DEC-0054`). Positive terms join with AND; negative-only queries cannot search. Bare `not`, `no`, `without`, `except`, `exclude` and `excluding` are ordinary positive tokens, not exclusion operators. Uppercase `NOT`/`AND`/`OR` are also sanitized positive words in this parser, although jumpyBrain conservatively preserves their apparent explicit intent. Dotted terms split into AND components. This establishes backend parsing, not correct answer semantics or support for every path/operator spelling.

`dist/cli/qmd.js:parseStructuredQuery` accepts one `vec: <original query>` line without a lexical line. Every typed line requires nonempty, single-line text; `structuredSearch` validates it. `validateSemanticQuery` rejects token-boundary `-term`/`-"phrase"`; internal hyphens are allowed. Structured queries avoid automatic expansion, and the existing `--no-rerank` remains set.

QMD itself already fuses structured lists with its existing RRF implementation: each lexical line and vector line retrieves at most 20 upstream rows per collection, the first nonempty list has weight 2, and the remaining lists weight 1. Neither candidate changes that implementation or its coefficients. Without reranking, upstream results receive `1/rank`. Best-chunk selection uses the first lexical query, otherwise the first vector query. Consequently candidate B changes the contributing lists and potentially that chunk-selection query; raw vector similarity is not an answer-confidence score. The adapter's existing maximum fusion and `0.9` structured-branch multiplier remain unchanged.

These facts come from the installed primary source, without running its CLI or loading models. Exact package/source hashes are retained in ignored `.local-pack/feedback-semantic-candidates/FREEZE.json`.

## Independent arms and mechanisms

Compare each arm to the same frozen baseline; do not stack A and B or rescue a failed arm with another policy.

**Baseline:** exact current `src/adapters/qmd/qmd-query.ts`, SHA-256 `83b1573f0dd38988c64ec51fedc15bffaebc905978d130d905c81daa2916caeb`. Preserve all other source/runtime hashes in the run freeze; a commit alone does not identify an uncommitted snapshot.

**A — semantic eligibility:** keep `hasQueryConstraints`, every lexical rewrite/relaxation rule and the combined structured payload unchanged. Add `hasSemanticQueryConstraints` solely for semantic-branch eligibility. Queries already eligible stay eligible. A previously blocked query may become eligible only when it starts with a declared question/auxiliary word, contains at least three alphabetic words and its eligibility probe becomes unconstrained after allowing ordinary lowercase negation words, internal contractions/possessives and lowercase all-alphabetic hyphen compounds. The probe is never executed: lexical and vector branches receive their existing original query text. Short phrases and other previously blocked non-question forms remain lexical-only.

Explicit double/single/typographic quotations, backticks, boundary exclusions, uppercase Boolean spelling, paths/operators, mixed alphanumeric/version/ticket IDs, snake_case and camelCase remain lexical-only. Questions containing `clientSecret` or `ABC-123` retain the binding rather than receiving an unconstrained vector bypass. Lowercase alphabetic compounds can be ambiguous names; this candidate deliberately admits them only in question forms and makes no claim that embeddings enforce their exact identity. Natural negation is likewise an interpretation for the embedding model, not an enforced negative predicate. Protected source-specific evidence controls must reject any loss of those qualifications.

Expected target slice: author-labeled natural-language negation/contraction/hyphenated-word questions across the retained and fresh workload, with newly semantic-eligible cases reported separately. Freeze slice membership from question text/labels before outputs. Also report each subcategory; do not choose a successful subcategory after execution. A semantic call or newly admitted file is mechanism evidence only. Required clauses in the correct canonical source after the fixed reads determine complete-case quality.

**B — vector-only structured branch:** replace only the existing combined structured payload with one `vec: <original query>` line. Keep the current `hasQueryConstraints` policy exactly. The ordinary lexical calls remain; no second semantic invocation, added original lexical line, new score rule, expanded depth or reranker is introduced. The structured invocation retains its collection, row limit, model selection, `--no-rerank`, multiplier, shared deadline and failure handling. The outer merge/cutoff is unchanged. The expected mechanism is to prevent lexical variants inside QMD's structured pool from crowding out paraphrase candidates before adapter max fusion.

Expected target slice: author-labeled unconstrained paraphrase/orientation/rationale/current/multi-source questions already eligible under the frozen baseline. Freeze membership before outputs and report lexical versus vector admission, selected evidence and required qualifications separately. Report constrained controls as protected; B must not newly run semantics on them. Backend list/chunk changes described above are part of this arm, not a hidden score-normalization change.

## Fixed gates and rejection conditions

Each arm must independently satisfy every gate against the unchanged baseline in both retained controls and fresh confirmation:

- Gain at least **two fresh complete cases** after the fixed expansion policy, and improve complete-case rate by at least **five percentage points** on its predeclared affected slice across the full workload.
- Lose **zero previously complete cases** and **zero source-specific rubric units**, across both old and fresh cases. Protect exact identifiers, phrases/exclusions, temporal/source eligibility, navigation, ambiguity, authority/permission qualifications and bounded unknowns. A matching statement in another source cannot replace required source evidence.
- Have **zero invalid provenance or response-budget failures**. Source-check every changed fresh outcome and every loss, preserving disagreement with the mechanical scoring. An admitted, selected or expanded file without all required source clauses does not earn completeness.
- Increase aggregate **full-interaction tokens by at most 5%**, including request/response metadata and read errors, using the pinned tokenizer. Preserve compact recall limit 5, 8,192 bytes/response, three first-distinct guarded reads and 32,768 total response bytes. Rich search remains separate and never chooses expansion reads. Preserve all current adapter count/read/output limits: eight ordinary lexical calls, at most one semantic call, 160 ordinary merged rows, two/24 dream limits, existing title/temporal supplement limits, 128 KiB prefix plus detection byte, and the existing raw-prefix cache cap. No added source/body scans.

Quality/context failure rejects adoption. Do not reinterpret admission gains, search hit rate, a larger vector pool or shorter output as a passing evidence result. No reranking, fusion coefficient change, RRF replacement, model expansion or depth expansion is authorized by this experiment.

Only an arm passing quality/context proceeds to quiet-window operating gates: warm six fixed representative queries, then at least **20 paired calls** alternating arm order; require **p95 latency increase <=10%** and **sampled CPU process-tree peak RSS increase <=50 MiB**. Record exact scripts, pair records, model/backend/runtime hashes, hardware, index state and process/model/OS cache limitations. Keep cold-start and full clean-root observations separate. Sampling can miss short peaks and omits GPU allocations. Contended quality-run timings cannot satisfy the operating gate. Do not run this operating comparison while the separate RAM benchmark is active.

Passing these packet gates does not establish autonomous supported answers or abstention, independent human utility, Linux/VPS concurrency, or a comparative efficiency claim. Before production adoption additionally verify provisioned semantic execution, lexical/strict-read-only nonregression, canonical/temporal/exact-title behavior, cancellation/failure lifecycle and local/runtime/hosted CLI parity on the same query/options/limit. Missing execution or parity coverage remains an explicit adoption blocker.

## Candidate artifacts and integration handoff

Ignored `.local-pack/feedback-semantic-candidates/` contains baseline/candidate source copies, independent unified patches, `FREEZE.json` and the lightweight deterministic `contract.test.mjs`. No generated file under `dist/` or production source is changed by preparing them.

| Candidate | Source SHA-256 | Patch SHA-256 |
| --- | --- | --- |
| A: `qmd-query.eligibility.ts` | `fe0dc8235abdde0b74cfb40ffe00197ccd3e6a7782398b69677814ee87009399` | `a962cecc540088a8010b71995ea8c81c17d96f5db8be68def8f7f3abbb0d41c6` |
| B: `qmd-query.vector-only.ts` | `1aa2f516c7c3803bb62cf8e3fccf5db58217ab315beebf5506bf6da1476d1f36` | `3d59d20cd07231e2748ad36b51d89e3a840d8e21eeef1c44c3267eca16b5e26f` |

Run only the lightweight mocked contract suite with:

```sh
node --test .local-pack/feedback-semantic-candidates/contract.test.mjs
```

The suite transpiles isolated copies in memory and mocks adapter execution; it never builds `dist`, spawns QMD, indexes, starts a GUI, opens fresh fixtures or loads a model. It checks A's new question eligibility and protected syntax, unchanged lexical rewriting, B's exact single-line payload and unchanged eligibility, call/row limits, max fusion, `0.9` weight, excerpt coordinates, eligible filtering, read-only/dream/lexical suppression and failure/abort propagation. Passing it establishes code contracts, not real semantic retrieval, lock/deadline behavior or benchmark quality.

The parent can apply **one** patch to a disposable baseline snapshot before the evaluation build:

```sh
git apply --check .local-pack/feedback-semantic-candidates/eligibility.patch
git apply .local-pack/feedback-semantic-candidates/eligibility.patch
```

For B substitute `vector-only.patch`. First verify the target baseline source digest; do not apply both to one arm. Copy the selected patch into an isolated checkout if necessary and run the same two commands there. Build/execute through the parent's frozen runtime harness only when the RAM comparison is quiet. Adoption into production remains gated on the full comparison and required parity; after adoption convert the relevant mocked assertions to normal production-module tests and rerun existing keyword-relaxation, fusion, read-only, temporal and lifecycle suites. Never transplant an isolated candidate copy over unrelated later edits without checking the source delta.

No quality or resource result is claimed in this policy. Preserve the exact policy and candidate hashes alongside eventual accepted/rejected outcomes and archived raw artifacts.
