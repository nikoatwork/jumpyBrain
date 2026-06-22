# Dogfood Memory

This repo can use a local, gitignored memory root for dogfooding jumpyBrain while developing it:

```text
.dogfood-memory/
  notes/
  sessions/
  findings/
  decisions/
  preferences/
  pages/
  .jumpybrain/   # derived/rebuildable index/report state
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
node dist/cli.js recall --root .dogfood-memory --topic "QMD memory architecture" --limit 5 --depth normal

# Local memory processing over one topic.
node dist/cli.js process --root .dogfood-memory --mode lint --topic "QMD memory architecture" --apply
node dist/cli.js process --root .dogfood-memory --mode synthesize --topic "QMD memory architecture" --apply
node dist/cli.js index --root .dogfood-memory
node dist/cli.js recall --root .dogfood-memory --topic "QMD memory architecture" --limit 5 --depth shallow

# End-of-session wrapup: run visible recall first, then write strict sections.
node dist/cli.js recall --root .dogfood-memory --topic "Session wrapup" --limit 5
cat wrapup.md | node dist/cli.js wrapup --root .dogfood-memory --title "Session wrapup" --topic "Session wrapup"
```
