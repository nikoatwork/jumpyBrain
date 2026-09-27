# QMD adapter docs

## Responsibilities

- Own QMD binary resolution, derived QMD collection paths, indexing, query execution, ranking helpers, and snippet expansion.
- Provide a small adapter barrel consumed by app local-memory and processing composition: build index, load manifest, and search index.
- Treat QMD state under `.jumpybrain/` as derived and rebuildable from canonical Markdown files.

## Non-responsibilities

- Do not parse CLI commands or expose QMD internals directly to CLI modules; tests that need ranking/query internals should import explicit internal modules.
- Do not own canonical Markdown discovery semantics beyond adapter inputs needed for indexing/search.
- Do not become a required dependency of `src/core/index.ts`.

## Title navigation and recency

Ranking is shared by CLI, runtime, and HTTP/Cmd+K. `scoreBreakdown.titleMatchBoost` reports a dedicated title signal:

- Exact whole-query matches use NFKC, trimmed/collapsed whitespace, lowercase, then NFC. Punctuation remains significant (`C++` is not `C`); no stemming or body-heading inference is used for exact titles.
- A nonblank string `title` is authoritative. Only missing/blank/non-string titles fall back to the filename stem; this fallback accepts `.md` and hyphen/underscore-separated words. A renamed note's old filename does not override its title.
- Exact matches earn `4`, an explicit navigation tier above the maximum non-exact combined score (under `3.1`), even at deep/shallow depth or with QMD score zero. Partial title query-token coverage of at least half earns at most `0.2`; it is not a navigation guarantee and does not add candidates.
- Ties use final score, canonical relative path, line start, then result ID. Duplicate titles remain separate documents subject to the existing dream diversity policy and caller limit.

After ordinary/dream retrieval, the already-loaded manifest contributes up to **24 missing exact-title documents**, chosen by relative path, outside QMD's cutoff. No extra QMD calls or global body scans occur. Supplements use QMD score zero, bounded canonical snippet repair, and original provenance. Title-only empty notes may have empty snippets; missing/renamed files are skipped. Older manifests already contain the needed metadata. Reindex after title edits. This is bounded navigation recall, not exhaustive retrieval of hundreds of duplicate titles.

Ordinary queries now receive a candidate-relative recency preference of up to `0.18`, scaled by the same lexical/relevance gate as maps (at least half the query terms in title/snippet, QMD score at least `0.15`, full scale at `0.5`). The oldest dated candidate gets zero, the newest gets the maximum; a single distinct date gives no ordinary boost. Unrelated, weak, or undated hits get none. The bound can reverse close relevance scores but cannot alone overcome a larger relevance gap or the exact-title tier. This uses candidate dates, not wall-clock age: even an entirely historical corpus can have a relatively newer result. Outliers and candidate coverage can change the gradient.

Dates are explicit `date`, otherwise ordinary-note `created_at`; dreams require explicit `date`. `updated_at`, filesystem mtime, and filename dates never count, so metadata-only edits and synthesis write times do not rejuvenate claims. Missing/invalid dates are undated; an invalid or empty explicit date blocks creation-date fallback. Calendar dates and ISO-like timestamps are validated; timezone-less timestamps mean UTC. This intentionally removes the previous `updated_at` fallback, including for explicit temporal queries.

Explicit recent/old and ISO before/after cues retain their existing bounded `0.12` policy instead of stacking ordinary recency. Historical/source/year queries, mixed recent/old cues, and unresolved before/after/since/until/during/as-of/past/previous/old intent receive no default recency. Temporal hints rerank; they do not filter by date. Existing depth/dream preferences are otherwise unchanged.

For parity comparisons, use the same query, root/index, depth, and **limit**: CLI search defaults to 10, while Cmd+K requests 24 at normal depth, which can change QMD candidate coverage. Cmd+K keeps the first hit per valid document ID (otherwise file/hit ID), partitions navigable IDs ahead of unavailable legacy rows, then displays at most 12. It does not calculate relevance scores; an ID-less exact match can consequently display below navigable notes. Home's fresh-scan recent list is a separate feature, not search recency.

## Maps-first retrieval

Normal/shallow retrieval prefers relevant `dream: true` maps; deep remains evidence-oriented. Ordinary pages and raw memories still work with no dream collection. Returned `provenance.metadata.dream` retains the parsed marker, and `scoreBreakdown.dreamBoost` reports its incremental score contribution separately from `depthPolicyBoost`.

The core policy calibrates dream preference against the existing bucket bonus. The adapter requires at least half of the meaningful query terms in the snippet/title, with a QMD relevance floor, and scales the contribution by coverage and score. Unrelated supplemental maps are discarded, not promoted by the marker. Explicit historical/source/detail queries disable the dream contribution and cap a dream's shallow page preference at `0.1`. A dream has temporal relevance only when it has an explicit `date`; creation/update timestamps do not date its claims.

Everyday context keeps one chunk per map and removes near-identical maps (token Jaccard >= `0.85`, at least eight tokens). A raw echo is omitted only if it also contributes **no new tokens**, including single-digit numbers; merely linking a source does not suppress it. Distinct raw details and multiple distinct raw chunks remain eligible. Deep and explicit source queries bypass map diversity filtering. This is conservative snippet diversity, not a source-coverage ledger or semantic duplicate detector. Use `--depth deep` and explicit source expansion to inspect underlying evidence.

## Bounded supplemental candidates

QMD capabilities were checked against `@tobilu/qmd` 2.8.3 (`qmd --help`, upstream README collection/search options, and CLI indexing implementation): collection-scoped `search -c` is supported, arbitrary frontmatter filtering is not exposed, and hidden directories are excluded from a parent collection's scan. A disposable real-QMD fixture verified that the scoped collection returns only its dream map. Its BM25 JSON score rounded to zero, so supplemental candidates use a capped `0.5 / rank` fallback rather than the ordinary `1 / rank` fallback; lexical overlap is still required.

At **index time**, the adapter copies only strictly marked Markdown to `.jumpybrain/qmd-dreams/`, preserving relative paths, and indexes it as `jumpybrain-dreams`. These snapshots, the optional manifest `dreamCollection` field, and QMD state are rebuildable. Canonical files are not changed, and results always resolve to their original canonical paths/metadata. Reindex after edits; invoking QMD update alone does not refresh snapshots. Copies trade index-time disk space for collection-scoped query filtering without QMD database internals or a per-query filesystem scan.

At **query time**:

- Ordinary retrieval is explicitly scoped to `jumpybrain`: up to eight lexical calls plus the existing structured query, each capped at 160 rows, then at most 160 merged candidates.
- Normal/shallow retrieval adds at most two lexical calls scoped to `jumpybrain-dreams`, each returning `min(24, max(8, 2 * limit))` rows, merged to that same bound. No extra model query/embedding call is added. Supplemental candidates are merged **after** the ordinary cutoff so raw-heavy results cannot crowd them out first.
- Deep retrieval skips supplementation. Older manifests without the collection marker skip it too; rebuilding enables it. Failed supplemental searches fall back to ordinary candidates through the existing best-effort QMD behavior.
- With up to 24 additional exact-title supplements, at most 208 candidates reach snippet repair. Each canonical repair read is capped at a 128 KiB prefix (plus one truncation-detection byte); QMD snippets beyond that prefix remain usable. No global Markdown body loading occurs. The existing derived manifest metadata is still loaded for canonical path lookup.
- Repaired identical hits use a real content/location hash, avoiding the old truncated-file-prefix ID collision that could hide distinct raw evidence.

This bounded lexical supplement improves candidate recall, not exhaustive semantic recall. Maps missed by its two lexical queries may still be found by ordinary hybrid retrieval; very large documents may require explicit expansion beyond the repair prefix. Ranking calibration is backed by synthetic ordering/cutoff regressions and CLI/HTTP/browser parity tests, not a broad quality benchmark.
