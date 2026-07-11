# Core retrieval-policy docs

## Responsibilities

- Normalize supported retrieval-depth values and expose deterministic depth-policy boosts.
- Classify canonical Markdown documents by frontmatter type or memory-directory bucket.
- Stay backend-agnostic so QMD-backed search and future retrieval adapters can apply the same policy.

## Non-responsibilities

- Do not call QMD, build indexes, read files, or execute search.
- Do not parse CLI arguments beyond validating the already-selected depth value.
- Do not depend on runtime, processing, server, or adapter modules.
