# jumpyBrain Memory Format

Markdown is canonical. You can write these files manually in Obsidian or any code editor.

## Suggested root layout

```text
memory-root/
  notes/
  sessions/
  findings/
  decisions/
  preferences/
  .jumpybrain/        # derived/rebuildable; do not edit
```

## Frontmatter

Supported fields are intentionally simple. Canonical jumpyBrain writers use these fields only:

```md
---
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

Durable note text here.
```

Useful `type` values: `note`, `session`, `finding`, `decision`, `preference`.

Schema notes:

- `session_id` is the canonical session identifier field. `sessionId` is accepted as a compatibility alias during provenance mapping.
- `confidence` is a small string status for writer provenance: `user-reviewed` for manual notes and `agent-drafted` for wrapups. Imported benchmark/manual files may still contain numeric confidence; retrieval treats that as a legacy strength hint.
- `review` is optional and currently uses `user-review-recommended` for agent-drafted wrapups.
- `tags` should be a simple string array.
- The frontmatter parser is intentionally tiny; prefer JSON-style arrays and quoted strings over broad YAML features.

## Session wrapup format

`jumpybrain wrapup` writes one editable `sessions/*.md` file with `type: "session"` and `source: "jumpybrain-wrapup"`. The body must contain these strict sections:

```md
## Findings
- Specific durable findings from the visible session.

## Decisions
- Decisions and rationale that should be easy to search later.

## Conflicts / Corrections
- Duplicates, superseded assumptions, or conflicts noticed during recall.
- Use `- None captured.` if intentionally empty.

## Open Questions
- Follow-up questions or unresolved choices.
```

Wrapup files are agent-drafted and user-reviewable. `recall_topic` is included in frontmatter when `jumpybrain wrapup --topic "..."` is used.

## Rules

- Do not put secrets, credentials, tokens, or transient chat noise in memory.
- Derived QMD/index files under `.jumpybrain/` can be deleted and rebuilt.
- Provenance comes from file path, line ranges, session id, and frontmatter.
