# App writing module docs

## Responsibilities

- Own local filesystem write workflows for notes and session wrapups.
- Compose core Markdown rendering, metadata policy, memory-root compatibility, and safe file creation.
- Keep remote append-only server writes in `remote-writer.ts`; import them directly from server-memory, not through the local writing barrel.

## Non-responsibilities

- Do not parse CLI flags, HTTP requests, or idempotency headers.
- Do not implement pure Markdown/frontmatter policy that belongs in core writing.
- Do not expose remote writer helpers through the local runtime/package surface.
