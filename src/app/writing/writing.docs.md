# App writing module docs

## Responsibilities

- Own local filesystem write workflows for notes and session wrapups.
- Compose core Markdown rendering, metadata policy, memory-root compatibility, and safe file creation.
- Local and remote note drafts accept optional boolean `dream`; both can create `type: page` in `pages/`. Render the marker as a YAML boolean, omit it when absent, and reject nonboolean API values rather than coercing them. IDs and timestamps remain writer-owned. New dream-marked outputs use agent-drafted confidence and recommend review; agent synthesis must not silently claim user review.
- CLI creation uses body-only stdin: `jumpybrain remember --root <root> --type page --dream --title "Topic map" < body.md`. `note` is the retired command name, and leading frontmatter in stdin is body text, not creation metadata. Remote callers use the same draft through the notes POST route.
- Local CLI `remember` indexes immediately; app writers do not. Remote creation and local/remote document updates report stale derived state. After successful edits, run `jumpybrain index` once for the selected root/target before fresh retrieval; there is no dream completion transaction.
- Keep remote append-only server writes in `remote-writer.ts`; import them directly from server-memory, not through the local writing barrel.
- Allow blank (including whitespace-only) bodies only for remote `note` creation, supporting browser quick capture through the existing POST workflow. The caller supplies the date/time title; the writer still creates a title heading, unique document ID, and normal metadata. Findings, decisions, preferences, session wrapups, and local CLI writes retain their existing body validation.

## Non-responsibilities

- Do not parse CLI flags, HTTP requests, or idempotency headers.
- Do not implement pure Markdown/frontmatter policy that belongs in core writing.
- Do not expose remote writer helpers through the local runtime/package surface.
