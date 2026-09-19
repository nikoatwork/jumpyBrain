# App writing module docs

## Responsibilities

- Own local filesystem write workflows for notes and session wrapups.
- Compose core Markdown rendering, metadata policy, memory-root compatibility, and safe file creation.
- Keep remote append-only server writes in `remote-writer.ts`; import them directly from server-memory, not through the local writing barrel.
- Allow blank (including whitespace-only) bodies only for remote `note` creation, supporting browser quick capture through the existing POST workflow. The caller supplies the date/time title; the writer still creates a title heading, unique document ID, and normal metadata. Findings, decisions, preferences, session wrapups, and local CLI writes retain their existing body validation.

## Non-responsibilities

- Do not parse CLI flags, HTTP requests, or idempotency headers.
- Do not implement pure Markdown/frontmatter policy that belongs in core writing.
- Do not expose remote writer helpers through the local runtime/package surface.
