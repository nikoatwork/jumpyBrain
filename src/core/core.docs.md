# Core module docs

## Responsibilities

- Own backend-agnostic core submodules for canonical Markdown scanning/parsing, protected document-update merge policy, memory-root setup/status, provenance helpers, retrieval-depth policy, and pure dream cursor/limit/path policy.
- Re-export backend-agnostic public memory APIs from core submodules, protected edit policy, pure writing policy, and only curated core-safe shared types.
- Decode valid JSON double-quoted frontmatter strings (including escaped quotes/backslashes); retain forgiving quote stripping for non-JSON/legacy quotes. This scalar policy does not change canonical body line-ending normalization; import envelopes verify raw body bytes separately.
- `serialized-budget.ts` supplies compact JSON-plus-LF serialization, UTF-8 byte accounting, and shared 1024–65536-byte packet budget validation; callers own evidence selection and envelope errors.
- `document-id-format.ts` owns the browser-safe canonical ID pattern/validator; `document-id.ts` re-exports that policy and adds UUID generation.
- Keep Markdown memory files canonical and treat indexes, caches, and SQLite/QMD state as rebuildable derived data.
- Provide the import surface that application/runtime code can depend on without choosing a retrieval backend.

- `attention.ts` owns explicit `attention_at` policy: absent follows valid edit/creation recency, timezone-explicit timestamp snoozes until due, and bare YAML `null` settles. Quoted `"null"` remains a string and invalid overrides fall back to normal recency with a safe list warning. It also validates strict settle/snooze/reactivate intent and patches only header lines.
- Frontmatter scalar values support explicit bare `null`; existing string/date/ID/array consumers retain their type guards and nullish fallbacks. Ordinary body/title merges retain an omitted `attention_at`; explicitly submitted values remain editable. Reactivation removes the field through the guarded attention operation.

## Non-responsibilities

- Do not export QMD-backed indexing, search, recall, processing operations, app-level write/dream workflows, or app/transport-specific result types through the core barrel.
- Do not import CLI command parsing, app orchestration, server protocol code, HTTP/logging/package adapters, or QMD adapter internals.
- Do not own hosted/server deployment concerns.
