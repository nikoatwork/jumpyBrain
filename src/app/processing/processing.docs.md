# App processing module docs

## Responsibilities

- Compose canonical bucket reads, root compatibility, canonical link policy, shared structural excerpts, optional QMD expansion, and approved writing seams. No models are invoked.
- `lint` writes unique UUID-bearing derived reports under `.jumpybrain/reports/`; `files`/`summary` remain compatible. Additive `runId`, `issues`, `issueCount`, and `scope` expose issue codes, severity, evidence/rationale, total/eligible/inspected/candidate counts and invocation bounds. A clean report has zero issues. Reports are audit history, not a queue.
- Page provenance distinguishes absent, broken/ambiguous, and context-only links; headings need not match a generated template. Canonical target validity is not claim entailment. Context classification is a conservative heading heuristic, not a proof of support.
- Open-question suggestions require at least three distinctive exact tokens, 60% question-token coverage, and a decision/answer cue in the same whole paragraph (at most 1,000 characters). Ignore headings, metadata, code blocks and generic words; abstain on unresolved/negative cues, including immediate following status caveats. Return at most three evidence spans per question. Candidate comparisons use the full canonical corpus even when inspection is scoped. Lexical matching cannot resolve a question and never closes one.
- `synthesize` is a **deterministic extractive source map**, not reviewed synthesis/current understanding or agent-authored dreaming. Reuse core structural excerpt selection (1,000 characters including omission markers), preserve bounded qualifications, cite original links and actual lines, and abstain without a topical body passage. Render source dates and existing confidence/review/conflict declarations separately as verbatim, unreconciled metadata; never manufacture an evidence date for the map.
- Direct and QMD selection share one eligible canonical source pool before source limits: exclude the output itself, pages (by bucket/type), and strict `dream: true` outputs in every bucket. QMD only nominates paths from this pool; its snippets/metadata cannot override canonical evidence. Supplementation remains bounded, not exhaustive backfill.
- `since` is inclusive **metadata recency**, not event chronology: select `updated_at`, otherwise `created_at`, otherwise `date`; validate the selected value with core `metadataDate`. Missing/invalid values cannot satisfy a cutoff; an invalid preferred value does not fall through. Unfiltered processing can still use undated sources. Absolute cutoffs require real ISO dates or timezone-explicit timestamps (date-only means UTC midnight); legacy `Nd`/`Nw` remain rolling intervals resolved once per invocation. This intentionally differs from dream evidence-date precedence.
- Synthesis may update only a page with `source: jumpybrain-process`, exact topic, valid unique ID, `type: page`, no true dream marker and no user-reviewed confidence. Human/dream/different-topic collisions fail; an owned ID-less legacy page requires explicit `ensure-ids`. Preserve all existing metadata, identity and creation date. Snapshot before retrieval, reject optional API `ifMatch` mismatches, recheck before publication, and call the existing hash-checked atomic document-update seam. Unchanged extracted bodies are byte-stable no-ops (`applied: false`, `modifiedCount: 0`, no files).
- Reject symlink, special-file and hardlink destinations/ancestors. New files use exclusive creation; a last-moment collision cannot overwrite another page. Guards are optimistic, not a portable filesystem compare-and-swap or a lock against hostile external writers; quiesce concurrent filesystem writers.
- `ensure-ids.ts` scans only canonical buckets and delegates stamping policy to core. All modes require actual boolean `apply: true`; indexing remains explicit and separate.

## Non-responsibilities

- Do not parse CLI flags, format CLI output, or implement HTTP routes.
- Do not implement another Markdown link grammar, semantic entailment checker, model reconciliation, scheduler, or question state machine.
- Do not treat `.jumpybrain/` support reports as canonical memory or mutate source evidence while building maps.

## Complexity and compatibility

One canonical eligibility pool replaces duplicated direct/QMD scope checks. Core retains ownership of strict ISO validation, dream classification, structural excerpts, and protected metadata updates; no shared types or new date-provenance contract are introduced. Existing process-owned page identity, creation/evidence dates and dream metadata remain intact on updates; true dream/reviewed/human destinations remain protected collisions. Citation metadata changes can update a map even when body quotations are unchanged. The source scan remains corpus-wide and QMD discovery bounded; snippets and source maps do not prove complete review or reconcile conflicts. Previously Date.parse-accepted ambiguous/impossible dates are now rejected for cutoffs and excluded from scoped sources.

## Output attribution

New extractive maps and guarded refreshes declare `{kind:"agent",name:"jumpyBrain processing"}` through core contribution policy. Existing creator declarations survive refreshes; unchanged maps remain byte-stable. Lint and ID-stamping maintenance do not establish human authorship. ID/timestamp changes that lack a new declaration invalidate any existing last-editor revision digest.
