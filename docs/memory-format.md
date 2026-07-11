# jumpyBrain Memory Format

Markdown is canonical. You can write these files manually in Obsidian or any code editor.

## Suggested root layout

```text
memory-root/
  jumpybrain.json     # committed setup/schema metadata
  notes/
  sessions/
  findings/
  decisions/
  preferences/
  pages/              # topical/current-state synthesized memory
  .jumpybrain/        # derived/rebuildable; do not edit
```

Create this layout with:

```bash
jumpybrain init --root ./memory
```

`jumpybrain.json` lets future CLIs detect incompatible memory-root schema changes before writing or indexing. Markdown files remain the canonical memory content. Derived state under `.jumpybrain/`, including local dream state, remote index state, and remote dream state/batch metadata, is operational support data rather than memory.

For repo dogfooding, `jumpybrain.json` may include an optional relative `indexRoot`, such as `".."`, so the derived recall index can cover workspace Markdown while new memories are still written under `memory/`.

## Frontmatter

Supported fields are intentionally simple. Canonical jumpyBrain writers use these fields only:

```md
---
id: "mem_550e8400-e29b-41d4-a716-446655440000"
type: "finding"
title: "QMD should be the first index primitive"
source: "manual"
session_id: "optional-session-id"
created_at: "2026-06-02T12:00:00.000Z"
updated_at: "2026-06-02T12:00:00.000Z"
confidence: "user-reviewed"
tags: ["memory", "qmd"]
---

# QMD should be the first index primitive

Durable memory text here.
```

Useful `type` values: `note`, `session`, `finding`, `decision`, `preference`, `page`. `note` remains a memory type; the CLI write command is `remember`.

Schema notes:

- Every canonical memory document in `notes/`, `findings/`, `decisions/`, `preferences/`, `sessions/`, and `pages/` should include a file-level `id`, e.g. `id: "mem_<uuid>"`. Local writers, remote writers, synthesized pages, wrapups, and ID-stamping maintenance all use `crypto.randomUUID()` with the `mem_` prefix for new IDs. The ID belongs to the whole Markdown file, not to blocks or line ranges.
- `session_id` is the canonical session identifier field. `sessionId` is accepted as a compatibility alias during provenance mapping.
- `confidence` is a small string status for writer provenance: `user-reviewed` for manual memories and `agent-drafted` for wrapups. Older imported/manual files may still contain numeric confidence; retrieval treats that as a legacy strength hint.
- `review` is optional and currently uses `user-review-recommended` for agent-drafted wrapups.
- `tags` should be a simple string array.
- The frontmatter parser is intentionally tiny; prefer JSON-style arrays and quoted strings over broad YAML features.

## Topical pages

`pages/*.md` files are topical, current-state memory. They are meant to compress lower-level memories such as sessions, findings, and decisions into a page an agent can read first before digging into raw evidence.

A generated page uses `id`, `type: "page"`, `source: "jumpybrain-process"`, `topic`, timestamps, and source references in the body. New generated pages receive a standard `mem_<uuid>` ID, and later synthesis runs preserve an existing page ID. Pages are canonical Markdown and are indexed like other memory files.

## Document edit contract

Document editing is ID-addressed. A document ID identifies the stable Markdown file; it is not a block ID, line ID, title slug, or path alias. Existing canonical files that predate IDs can be stamped by the explicit `process --mode ensure-ids --apply` maintenance operation.

Concurrency tokens are `sha256:<hex>` content hashes computed over the exact Markdown file bytes as read from disk, including frontmatter delimiters, frontmatter order, body text, whitespace, and final newline state. Agents should treat the hash as opaque and refresh it with a read/show operation before retrying a failed update.

The edit model is whole-document replacement of exact Markdown content. Protected structural metadata from the existing file wins over submitted content during updates: `id`, canonical `type`, `created_at`, `source`, and similar writer-owned identity/provenance fields stay stable. `updated_at` is refreshed only after a successful content update or explicit ID-stamping modification. User-editable fields such as `title`, `tags`, and body text may change when accepted by validation.

Updates keep the file path stable even when the title or frontmatter changes. The ID-addressed edit API does not rename files, move memories between buckets, delete files, patch line ranges, or merge concurrent edits.

## Session wrapup format

`jumpybrain wrapup` writes one editable `sessions/*.md` file with `type: "session"` and `source: "jumpybrain-wrapup"`. The body must contain these strict sections:

```md
## Findings
- Specific durable findings from the visible session.

## Decisions
- Decisions and rationale that should be easy to recall later.

## Conflicts / Corrections
- Duplicates, superseded assumptions, or conflicts noticed during recall.
- Use `- None captured.` if intentionally empty.

## Open Questions
- Follow-up questions or unresolved choices.
```

Wrapup files are agent-drafted and user-reviewable. `recall_topic` is included in frontmatter when `jumpybrain wrapup --topic "..."` is used.

Remote wrapups use the same strict body sections and add remote file metadata (`id` plus `source: "jumpybrain-remote"`). Remote V1 still writes a new session Markdown file; it does not patch existing files.

## Rules

- Do not put secrets, credentials, tokens, or transient chat noise in memory.
- Derived QMD/index files plus local/remote dream state under `.jumpybrain/` can be deleted and rebuilt or repaired from canonical Markdown where possible. Local dream support state lives under `.jumpybrain/dream/state.json` and `.jumpybrain/dream/batches/`; remote dream support state lives under `.jumpybrain/remote/`. Dream state must not be treated as canonical memory and must not store full memory bodies.
- Provenance comes from file path, line ranges, session id, and frontmatter.
