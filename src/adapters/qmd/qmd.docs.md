# QMD adapter docs

## Responsibilities

- Own QMD binary resolution, derived QMD collection paths, indexing, query execution, ranking helpers, and snippet expansion.
- Provide a small adapter barrel consumed by app local-memory and processing composition: build index, load manifest, and search index.
- Treat QMD state under `.jumpybrain/` as derived and rebuildable from canonical Markdown files.

## Non-responsibilities

- Do not parse CLI commands or expose QMD internals directly to CLI modules; tests that need ranking/query internals should import explicit internal modules.
- Do not own canonical Markdown discovery semantics beyond adapter inputs needed for indexing/search.
- Do not become a required dependency of `src/core/index.ts`.
