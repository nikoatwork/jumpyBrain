# App local-memory module docs

## Responsibilities

- Compose core canonical Markdown and memory-root policy with the QMD adapter for local indexing and search use cases.
- Keep retrieval-depth normalization outside QMD so result shaping remains backend-independent.
- Provide the app seam that runtime and compatibility barrels call for local memory index/search operations.
- Own `overviewMemory` tree/overview summaries, including optional explicit Markdown/wiki-link connection stats without body snippets.
- Own `graphMemory` app-level graph assembly for explicit Markdown/wiki-link relationships derived from canonical Markdown files.
- Expose ID-addressed local document read/update operations by composing core canonical primitives; updates require a prior content hash and return an explicit stale/not-indexed state instead of rebuilding the index synchronously.
- Expose a local ID-stamping maintenance alias that delegates to the processing `ensure-ids` mode so callers do not reimplement canonical bucket scans.

## Index/search contract

`indexMemory(root, options)` scans the configured retrieval-only `indexRoot` and passes canonical documents to the QMD lifecycle; `options` accepts `rebuild` and a persisted `indexing` policy. Routine updates reuse hashes/vectors; explicit rebuild is not the default. Index results add work counts and readiness.

`memoryStatus` composes core setup compatibility with derived readiness. Freshness compares canonical file lists and size/mtime/ctime stats to the committed manifest, plus configured policy and model stats; no body hashing, inference, model download, or QMD subprocess is needed. This is a cheap scan, not a constant-time check or SQLite-integrity test. Search adds `readiness` and `retrieval` outcomes; stale/incomplete/failed branches are labeled partial, total backend failure propagates. See [QMD lifecycle](../../adapters/qmd/qmd.docs.md#index-lifecycle-and-readiness) for publication/locking.

## Non-responsibilities

- Do not parse CLI flags or format CLI output.
- Do not expose QMD adapter internals to CLI modules.
- Do not implement pure core Markdown or memory-root policy here.
- Do not make overview output carry full graph/export details; use the dedicated graph app seam for richer node/edge data.
