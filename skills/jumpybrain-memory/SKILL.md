---
name: jumpybrain-memory
description: Use jumpyBrain local Markdown memory through the CLI. Trigger when a task may depend on prior decisions, project conventions, past bugs, handoffs, preferences, or when the user asks to remember or recall durable context.
---

# jumpyBrain Memory

Use the installed `jumpybrain` CLI for explicit, visible memory operations.

## Configuration

- CLI: `__JUMPYBRAIN_CLI__`
- Memory root: `__JUMPYBRAIN_MEMORY_ROOT__`

If either path is unavailable, fall back to `jumpybrain` on `PATH` and `$JUMPYBRAIN_MEMORY_ROOT`.

## Recall before acting

When project memory could materially help, run visible bounded recall before planning or editing:

```bash
__JUMPYBRAIN_CLI__ recall --root "__JUMPYBRAIN_MEMORY_ROOT__" --topic "<current task/topic>" --limit 5
```

For a precise question:

```bash
__JUMPYBRAIN_CLI__ recall --root "__JUMPYBRAIN_MEMORY_ROOT__" --query "<specific question>" --limit 10 --json
```

Use `--depth shallow|normal|deep` when useful. `shallow` favors synthesized pages/decisions; `deep` may surface raw session evidence.

## Remember durable context

Only write memory when the user explicitly asks or clearly approves. Do not memorize secrets, credentials, tokens, raw chat noise, or vague transient status.

```bash
printf '%s\n' "<durable finding, decision, or preference>" \
  | __JUMPYBRAIN_CLI__ remember --root "__JUMPYBRAIN_MEMORY_ROOT__" --type finding --title "<short title>"
```

Good memory types: `finding`, `decision`, `preference`, `note`.

## End-of-session wrapup

If durable findings, decisions, conflicts/corrections, or open questions were created, first recall likely duplicates/conflicts, then write strict Markdown sections:

```bash
__JUMPYBRAIN_CLI__ recall --root "__JUMPYBRAIN_MEMORY_ROOT__" --topic "<session topic>" --limit 5
cat <<'MD' | __JUMPYBRAIN_CLI__ wrapup --root "__JUMPYBRAIN_MEMORY_ROOT__" --title "<short title>" --topic "<session topic>"
## Findings
- None captured.

## Decisions
- None captured.

## Conflicts / Corrections
- None captured.

## Open Questions
- None captured.
MD
```

Show the written file path and ask if the user wants edits.

## Rules

- Keep recall explicit and visible; do not silently inject memory.
- Preserve uncertainty from recalled memory.
- Markdown memory files are canonical; derived indexes can be rebuilt.
- If Markdown memory was edited manually, run `__JUMPYBRAIN_CLI__ index --root "__JUMPYBRAIN_MEMORY_ROOT__"`.
