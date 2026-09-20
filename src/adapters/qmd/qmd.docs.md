# QMD adapter docs

## Responsibilities

- Own QMD binary resolution, derived QMD collection paths, indexing, query execution, ranking helpers, and snippet expansion.
- Provide a small adapter barrel consumed by app local-memory and processing composition: build index, load manifest, and search index.
- Treat QMD state under `.jumpybrain/` as derived and rebuildable from canonical Markdown files.

## Non-responsibilities

- Do not parse CLI commands or expose QMD internals directly to CLI modules; tests that need ranking/query internals should import explicit internal modules.
- Do not own canonical Markdown discovery semantics beyond adapter inputs needed for indexing/search.
- Do not become a required dependency of `src/core/index.ts`.

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
- At most 184 candidates reach snippet repair. Each canonical repair read is capped at a 128 KiB prefix (plus one truncation-detection byte); QMD snippets beyond that prefix remain usable. No global Markdown body loading occurs. The existing derived manifest metadata is still loaded for canonical path lookup.
- Repaired identical hits use a real content/location hash, avoiding the old truncated-file-prefix ID collision that could hide distinct raw evidence.

This bounded lexical supplement improves candidate recall, not exhaustive semantic recall. Maps missed by its two lexical queries may still be found by ordinary hybrid retrieval; very large documents may require explicit expansion beyond the repair prefix. Ranking calibration is backed by synthetic tests, not a broad quality benchmark.
