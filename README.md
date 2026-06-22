<p align="center">
  <img src="docs/assets/jumpyBrain.png" alt="jumpyBrain logo" width="220" />
</p>

# jumpyBrain

**Local Markdown memory for coding agents.**

jumpyBrain gives AI coding assistants a project memory they can search without hiding knowledge in a vendor account, chat history, or opaque database.

## Who is it for?

- People who use AI coding agents across many sessions
- Teams that want project memory to live with the repo
- Developers who want searchable history without automatic prompt injection
- Non-technical owners who want decisions, context, and handoffs in readable files

## What does it do?

jumpyBrain turns project knowledge into a memory folder your agent can search before it acts.

It is built for:

- architecture decisions and project conventions
- session summaries and handoffs
- solved bugs and repeated gotchas
- benchmark results and tradeoffs
- uncertainty that should not be flattened into fake confidence

Markdown is the source of truth, so humans can read, edit, review, and commit memory like any other project file.

## How does it work?

```text
agent sessions
  -> capture useful notes
  -> save Markdown memories
  -> build a rebuildable search index
  -> recall relevant context on demand
  -> show provenance back to the source file
```

By default, jumpyBrain favors **explicit recall**. The agent searches memory when asked or when a workflow calls for it; automatic prompt injection should stay opt-in and bounded.

## Why trust it?

The goal is repeatable proof, not vibes. Benchmark results will live here as they become available.

| Benchmark | What it measures | Status | Result |
| --- | --- | --- | --- |
| LongMemEval-style recall | Finds relevant long-term context | In progress | TBD |
| Markdown provenance checks | Returns answers with source files/lines | Planned | TBD |
| Rebuild determinism | Recreates indexes from Markdown only | Planned | TBD |
| Agent workflow evals | Improves coding-session continuity | Planned | TBD |

## Current shape

- standalone TypeScript/npm package
- repo/workspace-local Markdown memories
- rebuildable indexes and recall state
- QMD-backed Markdown search
- CLI-first workflows for indexing, search, recall, wrapups, and local memory processing

## Local and hosted shape

The local Markdown/QMD engine is the app. A hosted/shared deployment runs the same app against a server-local memory root.

The CLI is the supported interface for hosted memory. Agents and other tools should call the CLI rather than talking to the hosted API directly.

Internal maintenance work, such as future memory processing/linting/synthesis jobs, should run inside the app/server against the local memory root. API or CLI triggers can be added later, but scheduled server-side processing can start as a local cron-style job.

## Quick start

```bash
npm install -g @tobilu/qmd
qmd --version

jumpybrain init --root ./memory
jumpybrain instructions
jumpybrain run memory:index
jumpybrain run memory:recall --topic "<current topic>" --limit 5 --depth normal
jumpybrain search --root ./memory --query "<question>" --limit 10 --depth normal --json
jumpybrain process --root ./memory --mode synthesize --topic "<topic>" --apply
cat wrapup.md | jumpybrain wrapup --root ./memory --title "Session wrapup" --topic "current session"
```

## Docs

- Installation: [`docs/install.md`](docs/install.md)
- Memory format: [`docs/memory-format.md`](docs/memory-format.md)
- Agent workflows: [`docs/agent-workflows.md`](docs/agent-workflows.md)
- Technical CLI/indexing details: [`docs/technical.md`](docs/technical.md)
- Local CLI builds/versioning: [`docs/local-cli-builds.md`](docs/local-cli-builds.md)
