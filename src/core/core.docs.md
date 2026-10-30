# Core module docs

## Responsibilities

- Own backend-agnostic core submodules for canonical Markdown scanning/parsing, protected document-update merge policy, memory-root setup/status, provenance helpers, retrieval-depth policy, and pure dream cursor/limit/path policy.
- Re-export backend-agnostic public memory APIs from core submodules, protected edit policy, pure writing policy, and only curated core-safe shared types.
- Decode valid JSON double-quoted frontmatter strings (including escaped quotes/backslashes); retain forgiving quote stripping for non-JSON/legacy quotes. This scalar policy does not change canonical body line-ending normalization; import envelopes verify raw body bytes separately.
- `serialized-budget.ts` supplies compact JSON-plus-LF serialization, UTF-8 byte accounting, and shared 1024–65536-byte packet budget validation; callers own evidence selection and envelope errors.
- `document-id-format.ts` owns the browser-safe canonical ID pattern/validator; `document-id.ts` re-exports that policy and adds UUID generation.
- `boards/` owns canonical board JSON validation, safe filesystem reads, cross-process locking and hash-checked per-file publication, independent of retrieval state.
- Keep Markdown memory files canonical and treat indexes, caches, and SQLite/QMD state as rebuildable derived data.
- Provide the import surface that application/runtime code can depend on without choosing a retrieval backend.

- `attention.ts` owns explicit `attention_at` policy: absent follows valid edit/creation recency, timezone-explicit timestamp snoozes until due, and bare YAML `null` settles. Quoted `"null"` remains a string and invalid overrides fall back to normal recency with a safe list warning. It also validates strict settle/snooze/reactivate intent and patches only header lines.
- Frontmatter scalar values support explicit bare `null`; existing string/date/ID/array consumers retain their type guards and nullish fallbacks. Changed body/title merges remove an existing null `attention_at` and its `attention_settled_hash`; snoozes survive edits and explicit snooze values remain editable. Exact no-op saves stay settled. New settlement fingerprints let discovery detect direct edits; legacy null-only notes have no prior revision to compare. Reactivation removes both fields through the guarded attention operation.

## Non-responsibilities

- Do not export QMD-backed indexing, search, recall, processing operations, app-level write/dream workflows, or app/transport-specific result types through the core barrel.
- Do not import CLI command parsing, app orchestration, server protocol code, HTTP/logging/package adapters, or QMD adapter internals.
- Do not own hosted/server deployment concerns.

## Contribution and search recognition policy

`contribution.ts` validates optional declared `MemoryActor` values and owns canonical creator/last-editor stamping plus revision checking. This is provenance, never authentication or an ACL. The digest covers parsed metadata and normalized body, excluding contribution fields, `attention_at` and `attention_settled_hash`; untracked body/title/timestamp changes invalidate the last editor. Guarded document merging protects existing creator fields, ignores submitted attribution, and replaces last editor from the explicit write option (omission clears it). Exact no-ops and the separate attention operation retain attribution.

`search-recognition.ts` owns browser-safe strict optional edit/creation calendar-day predicates, declared-editor matching, timezone validation and the 120-candidate constant. It does not retrieve, scan, rank or authenticate users.
