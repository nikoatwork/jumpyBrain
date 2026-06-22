# Agent Workflows

## Agent MD hint

Put a short hint like this in `AGENTS.md`, `CLAUDE.md`, Codex instructions, Cloth instructions, or another agent-readable project file:

```text
If jumpybrain is installed and the task may benefit from project memory, use visible recall before acting:

jumpybrain run memory:recall --topic "<current task/topic>" --limit 5

Use explicit, bounded recall/search only. Do not silently inject memory, and do not memorize secrets, credentials, raw chat noise, or vague status updates. At session end, consider a strict wrapup via `jumpybrain run memory:wrapup` if durable findings, decisions, conflicts, or open questions were created.
```

The CLI can print a copyable version:

```bash
jumpybrain instructions
```

## Recall before sparring/research

Run a visible prior-knowledge scan before deep work:

```bash
jumpybrain index --root <memory-root>
jumpybrain recall --root <memory-root> --topic "QMD memory architecture" --limit 5
```

Agents should show compact hits with provenance before using them. This gives lightweight implicit retrieval without hidden prompt injection.

## Explicit search

```bash
jumpybrain search --root <memory-root> --query "Where did we decide to store release notes?" --limit 10 --json
```

Use retrieval depth to shape how much raw evidence should compete with compressed/current memory:

```bash
jumpybrain recall --root <memory-root> --topic "sales process" --depth shallow
jumpybrain recall --root <memory-root> --topic "sales process" --depth deep
```

`shallow` favors topical pages and decisions. `normal` is balanced. `deep` allows raw sessions to surface as supporting evidence.

JSON results include `id`, `score`, `snippet`, `provenance`, and `scoreBreakdown`.

## Continuous memory work

`jumpybrain process` performs maintenance over existing memory. The first modes are separate:

```bash
jumpybrain process --root <memory-root> --mode lint --topic "shared memory" --apply
jumpybrain process --root <memory-root> --mode synthesize --topic "shared memory" --apply
```

`synthesize` creates or updates `pages/<topic>.md` from existing canonical memory plus QMD-related context when an index exists. `lint` writes a deterministic support report under `.jumpybrain/reports/` for stale pages, missing provenance, duplicate titles, declared conflicts, and open questions that appear answered elsewhere. Processing requires `--apply` before mutating files.

For hosted/shared deployments, scheduled processing should run inside the server against the server-local memory root. Agents should use the CLI as the interface; direct hosted API calls are not the intended workflow.

## End-of-session wrapup

At the end of a session, the active agent should draft memory from the visible current context only. Capture durable learnings only:

1. findings
2. decisions
3. conflicts/corrections
4. open questions

Run recall first so likely duplicates or conflicts are visible before writing:

```bash
jumpybrain recall --root <memory-root> --topic "Memory architecture wrapup" --limit 5
```

Then write one editable session wrapup:

```bash
cat <<'MD' | jumpybrain wrapup --root <memory-root> --title "Memory architecture wrapup" --topic "Memory architecture wrapup"
## Findings
- QMD should be the first retrieval primitive. Markdown remains canonical, and QMD-derived state remains rebuildable.

## Decisions
- Keep recall visible before use instead of silently injecting memory into prompts.

## Conflicts / Corrections
- None captured.

## Open Questions
- How automatic should recall become after dogfood usage proves the visible preflight useful?
MD
```

`--topic` is optional for the command but recommended. When provided, `wrapup` runs the same retrieval path as `recall` and prints related memories before the written file. When omitted, it writes the file and reports that related-memory preflight was skipped.

### Copyable wrapup prompt

Use this prompt near the end of a coding-agent session:

```text
Review only the visible current session. Do not memorize secrets, credentials, tokens, raw chat noise, or vague status updates. First run:

jumpybrain recall --root <memory-root> --topic "<session topic>" --limit 5

Then draft 4-5 high-signal durable items as strict Markdown sections:

## Findings
## Decisions
## Conflicts / Corrections
## Open Questions

Use '- None captured.' for any intentionally empty section. Mention duplicates or conflicts from recall under Conflicts / Corrections. Pipe the final draft to:

jumpybrain wrapup --root <memory-root> --title "<short title>" --topic "<session topic>"

Show the written file path and body, then ask if the user wants edits.
```

Review by default. Do not memorize secrets, credentials, or transient chat noise.
