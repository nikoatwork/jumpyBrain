# Dogfood Memory

This repo can use a local, gitignored memory root for dogfooding jumpyBrain while developing it:

```text
.dogfood-memory/
  notes/
  sessions/
  findings/
  decisions/
  preferences/
  .jumpybrain/   # derived/rebuildable index state
```

`.dogfood-memory/` is intentionally ignored by git.

## Rules

- Do not index the repo root for dogfood memory.
- Do not auto-read or auto-inject dogfood memory into prompts.
- Use explicit recall/search only when the user asks or when doing a visible preflight.
- Keep memories project-scoped to jumpyBrain development.
- Promote durable public decisions to `tasks/strategy.md`, task lists, or `tasks/CHANGELOG.md`.

## Commands

```bash
# Build the local CLI first when running from source.
npm run build

# Index dogfood memory only.
node dist/cli.js index --root .dogfood-memory

# Visible prior-knowledge scan.
node dist/cli.js recall --root .dogfood-memory --topic "QMD memory architecture" --limit 5

# End-of-session wrapup: run visible recall first, then write strict sections.
node dist/cli.js recall --root .dogfood-memory --topic "Session wrapup" --limit 5
cat wrapup.md | node dist/cli.js wrapup --root .dogfood-memory --title "Session wrapup" --topic "Session wrapup"
```
