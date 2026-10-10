# App processing module docs

## Responsibilities

- Compose canonical bucket reads, root compatibility, canonical link policy, shared structural excerpts, optional QMD expansion, and approved writing seams. No models are invoked.
- `lint` writes unique UUID-bearing derived reports under `.jumpybrain/reports/`; `files`/`summary` remain compatible. Additive `runId`, `issues`, `issueCount`, and `scope` expose issue codes, severity, evidence/rationale, total/eligible/inspected/candidate counts and invocation bounds. A clean report has zero issues. Reports are audit history, not a queue.
- Page provenance distinguishes absent, broken/ambiguous, and context-only links; headings need not match a generated template. Canonical target validity is not claim entailment. Context classification is a conservative heading heuristic, not a proof of support.
- Open-question suggestions require at least three distinctive exact tokens, 60% question-token coverage, and a decision/answer cue in the same whole paragraph (at most 1,000 characters). Ignore headings, metadata, code blocks and generic words; abstain on unresolved/negative cues, including immediate following status caveats. Return at most three evidence spans per question. Candidate comparisons use the full canonical corpus even when inspection is scoped. Lexical matching cannot resolve a question and never closes one.
- `synthesize` is a **deterministic extractive source map**, not reviewed synthesis/current understanding. Reuse core structural excerpt selection (1,000 characters including omission markers), preserve bounded qualifications, cite original links and actual lines, and abstain without a topical body passage. Direct and QMD selection both enforce the same `since` cutoff and exclude pages and strict `dream: true` outputs as primary sources. Current timestamp precedence remains `updated_at`, `created_at`, then `date`; this is metadata recency, not inferred event chronology.
- Synthesis may update only a page with `source: jumpybrain-process`, exact topic, valid unique ID, `type: page`, no true dream marker and no user-reviewed confidence. Human/dream/different-topic collisions fail; an owned ID-less legacy page requires explicit `ensure-ids`. Preserve all existing metadata, identity and creation date. Snapshot before retrieval, reject optional API `ifMatch` mismatches, recheck before publication, and call the existing hash-checked atomic document-update seam. Unchanged extracted bodies are byte-stable no-ops (`applied: false`, `modifiedCount: 0`, no files).
- Reject symlink, special-file and hardlink destinations/ancestors. New files use exclusive creation; a last-moment collision cannot overwrite another page. Guards are optimistic, not a portable filesystem compare-and-swap or a lock against hostile external writers; quiesce concurrent filesystem writers.
- `ensure-ids.ts` scans only canonical buckets and delegates stamping policy to core. All modes require actual boolean `apply: true`; indexing remains explicit and separate.

## Non-responsibilities

- Do not parse CLI flags, format CLI output, or implement HTTP routes.
- Do not implement another Markdown link grammar, semantic entailment checker, model reconciliation, scheduler, or question state machine.
- Do not treat `.jumpybrain/` support reports as canonical memory or mutate source evidence while building maps.
