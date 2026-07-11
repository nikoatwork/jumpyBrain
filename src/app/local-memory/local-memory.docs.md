# App local-memory module docs

## Responsibilities

- Compose core canonical Markdown and memory-root policy with the QMD adapter for local indexing and search use cases.
- Keep retrieval-depth normalization outside QMD so result shaping remains backend-independent.
- Provide the app seam that runtime and compatibility barrels call for local memory index/search operations.
- Own `overviewMemory` tree/overview summaries, including optional explicit Markdown/wiki-link connection stats without body snippets.
- Own `graphMemory` app-level graph assembly for explicit Markdown/wiki-link relationships derived from canonical Markdown files.
- Expose ID-addressed local document read/update operations by composing core canonical primitives; updates require a prior content hash and return an explicit stale/not-indexed state instead of rebuilding the index synchronously.
- Expose a local ID-stamping maintenance alias that delegates to the processing `ensure-ids` mode so callers do not reimplement canonical bucket scans.

## Non-responsibilities

- Do not parse CLI flags or format CLI output.
- Do not expose QMD adapter internals to CLI modules.
- Do not implement pure core Markdown or memory-root policy here.
- Do not make overview output carry full graph/export details; use the dedicated graph app seam for richer node/edge data.
