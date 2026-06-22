# jumpyBrain agent notes

## Product intent

Build a small, local-first, Markdown-native memory package for coding agents.

## Hard constraints

- Markdown memory files are canonical.
- Indexes, embeddings, SQLite state, and recall counters are derived/rebuildable.
- Avoid automatic prompt injection by default.
- Prefer explicit recall/search first.
- Preserve uncertainty in docs when backend, path, or adapter choices are not proven.
- Do not memorize secrets, credentials, tokens, or transient chat noise.

## Architecture preference

Use memsearch-style architecture:

```text
agent host hooks / transcripts
  -> capture/summarize
  -> repo/workspace-local Markdown memory files
  -> rebuildable index/state
  -> search -> expand -> provenance
  -> optional generated hot cache
```

## Local / hosted boundary

- The local Markdown/QMD engine is the app.
- A hosted/shared deployment runs the same app against a server-local memory root.
- The CLI is the supported interface for hosted memory; agents/tools should call the CLI rather than talking to the hosted API directly.
- Internal maintenance work, including future processing/linting/synthesis jobs, should run inside the app/server against the local memory root.
- API or CLI triggers for server-side processing can be added later; scheduled processing can start as a local cron-style server job.

## Validation preference

Every MVP should have deterministic tests that do not require paid model calls.

## Task/changelog hygiene

- Treat active task lists in `tasks/todo/` as the canonical source of truth for in-progress planning and operational notes.
- Do not update `tasks/CHANGELOG.md` for granular task-list edits, benchmark run intentions, or minor planning notes.
- Update `tasks/CHANGELOG.md` when finalizing/archiving a task list, recording a completed result/decision, or making a structural repository/product change.
