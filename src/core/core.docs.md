# Core module docs

## Responsibilities

- Own backend-agnostic core submodules for canonical Markdown scanning/parsing, protected document-update merge policy, memory-root setup/status, provenance helpers, retrieval-depth policy, and pure dream cursor/limit/path policy.
- Re-export backend-agnostic public memory APIs from core submodules, protected edit policy, pure writing policy, and only curated core-safe shared types.
- Keep Markdown memory files canonical and treat indexes, caches, and SQLite/QMD state as rebuildable derived data.
- Provide the import surface that application/runtime code can depend on without choosing a retrieval backend.

## Non-responsibilities

- Do not export QMD-backed indexing, search, recall, processing operations, app-level write/dream workflows, or app/transport-specific result types through the core barrel.
- Do not import CLI command parsing, app orchestration, server protocol code, HTTP/logging/package adapters, or QMD adapter internals.
- Do not own hosted/server deployment concerns.
