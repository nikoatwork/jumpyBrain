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

- `src/core/index.ts` is the backend-agnostic barrel for canonical Markdown, setup, writing, types, and QMD-independent helpers; do not export QMD-backed index/search/process operations or import CLI/QMD adapter code from core.
- QMD adapter internals live under `src/qmd/`; use its barrel from local runtime/retrieval composition instead of importing old `src/retrieval/qmd-*` paths.
- `src/runtime/index.ts` composes the local app surface from core plus QMD-backed retrieval/processing; package-level `src/index.ts` should re-export this runtime surface without importing CLI command parsing.
- CLI command parsing in `src/cli.ts` should call runtime operations through `src/cli/local-transport.ts`; do not import `src/qmd/` directly from CLI modules.
- The local Markdown/QMD engine is the app.
- A hosted/shared deployment runs the same app against a server-local memory root.
- The CLI is the supported interface for hosted memory; agents/tools should call the CLI rather than talking to the hosted API directly.
- Internal maintenance work, including future processing/linting/synthesis jobs, should run inside the app/server against the local memory root.
- API or CLI triggers for server-side processing can be added later; scheduled processing can start as a local cron-style server job.
- Use `pages/` for topical/current-state synthesized memory; avoid “wiki” terminology in product docs.
- Retrieval depth is explicit and shapeable: `shallow` should favor compressed memory such as pages/decisions, while `deep` may surface raw sessions as evidence.

## Validation preference

Every MVP should have deterministic tests that do not require paid model calls.

## Task/changelog hygiene

- Treat active task lists in `tasks/todo/` as the canonical source of truth for in-progress planning and operational notes.
- Do not update `tasks/CHANGELOG.md` for granular task-list edits, benchmark run intentions, or minor planning notes.
- Update `tasks/CHANGELOG.md` when finalizing/archiving a task list, recording a completed result/decision, or making a structural repository/product change.
