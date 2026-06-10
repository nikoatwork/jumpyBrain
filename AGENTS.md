# jumpyBrain agent notes

## Product intent

Build a small, local-first, Markdown-native memory package for coding agents.

## Hard constraints

- Keep the core package independent from jumpyGoatHq.
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

## Validation preference

Every MVP should have deterministic tests that do not require paid model calls.
