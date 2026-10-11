# App local-memory module docs

## Responsibilities

- Compose core canonical Markdown and memory-root policy with the QMD adapter for local indexing and search use cases.
- Keep retrieval-depth normalization outside QMD so result shaping remains backend-independent.
- Provide the app seam that runtime and compatibility barrels call for local memory index/search operations.
- Own `overviewMemory` tree/overview summaries, including optional explicit Markdown/wiki-link connection stats without body snippets.
- Own `graphMemory` app-level graph assembly for explicit Markdown/wiki-link relationships derived from canonical Markdown files.
- Expose ID-addressed local document read/update operations by composing core canonical primitives; updates require a prior content hash and return an explicit stale/not-indexed state instead of rebuilding the index synchronously.
- `expansion.ts` exposes `expandMemoryDocument(root, options)` after root compatibility validation; it reads at the editor root, not retrieval-only `indexRoot`. The core [guarded expansion contract](../../core/canonical/canonical.docs.md#guarded-evidence-expansion) owns hash/range/whole-response budgets. No indexing, ID stamping, state writes, or extra packet envelope.
- Expose a local ID-stamping maintenance alias that delegates to the processing `ensure-ids` mode so callers do not reimplement canonical bucket scans.

## Index/search contract

`indexMemory(root, options)` scans the configured retrieval-only `indexRoot` and passes canonical documents to the QMD lifecycle; `options` accepts `rebuild` and a persisted `indexing` policy. Routine updates reuse hashes/vectors; explicit rebuild is not the default. Index results add work counts and readiness.

`memoryStatus` composes core setup compatibility with derived readiness. Freshness compares canonical file lists and size/mtime/ctime stats to the committed manifest, plus configured policy and model stats; no body hashing, inference, model download, or QMD subprocess is needed. This is a cheap scan, not a constant-time check or SQLite-integrity test. Search adds `readiness` and `retrieval` outcomes; stale/incomplete/failed branches are labeled partial, total backend failure propagates. See [QMD lifecycle](../../adapters/qmd/qmd.docs.md#index-lifecycle-and-readiness) for publication/locking.

Index/search/compact recall accept local `signal` and whole-operation `timeoutMs`, with bounded admission and async children owned by the [QMD execution seam](../../adapters/qmd/qmd.docs.md#bounded-execution). Compact verification shares the search deadline rather than opening a second budget. Read-only discovery waits observe cancellation; canonical scans/reads receive backend-agnostic signals. No detached write/publication is permitted. Finite backend deadlines do not bound synchronous parsing, total corpus input bytes, or OS-uninterruptible I/O.

## Non-responsibilities

- Do not parse CLI flags or format CLI output.
- Do not expose QMD adapter internals to CLI modules.
- Do not implement pure core Markdown or memory-root policy here.
- Do not make overview output carry full graph/export details; use the dedicated graph app seam for richer node/edge data.


## Opt-in compact recall

`compact.ts` exposes `compactSearchMemory(root, query, limit, { depth?, maxBytes?, diagnostics? })`. It reuses `searchMemory` ranking/excerpts and delegates byte packing to [core retrieval policy](../../core/retrieval-policy/retrieval-policy.docs.md#compact-recall-packets). The packet omits local-root metadata and arbitrary frontmatter by default; readiness/retrieval outcomes remain mandatory. Existing unbudgeted contracts are unchanged.

Each available expansion token uses a unique canonical document ID (never the QMD hit ID), the guarded canonical reader's raw-byte hash, and source-verified coordinates. The indexed path must resolve to that same canonical document, including retrieval-only subroots. A stale backend snippet cannot receive a new hash without matching its cited current source. Verified identities use current canonical creation metadata for the written date; unavailable identities retain indexed metadata under the packet's readiness warning. Missing/invalid/duplicate IDs, changed/unavailable/mismatched source, invalid UTF-8, and roots outside canonical memory explicitly disable expansion while retaining searchable provenance. Read-only recall never stamps/repairs IDs. Duplicate/invalid identities are not exposed as unique `documentId` values.

Guarded lookups are cached per ID within a call, but each distinct ID still uses the existing canonical scan/full read. Output is bounded, not input work or memory usage. Verification is not a filesystem snapshot against concurrent external writers; later expansion must recheck the returned hash. No new index, summary generator, or alternative relevance policy is introduced.

### Compact temporal verification

Local search validates/resolves optional `temporal` before root/backend access and delegates bounded manifest discovery plus prefix metadata checks to QMD. Both rich and compact candidates omit changed/incomplete frontmatter or changed body-start coordinates with `source_changed`, including ID-less sources; no cross-filesystem snapshot is claimed. Compact recall forwards optional `temporal` to search and preserves its resolved interval/coverage. Explicit temporal passages carry indexed evidence dates and declared relationships; successfully verified sources provide current relationship metadata. If current source evidence-date metadata differs from indexed evidence or falls outside the interval, omit that passage, increment omissions, and report partial `source_changed` rather than attach a fresh hash to out-of-scope evidence. Written dates remain independent. This is still not a filesystem snapshot; missing/unavailable identities retain indexed provenance with existing readiness/expansion warnings.
