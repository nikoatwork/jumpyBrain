<p align="center">
  <img src="docs/assets/jumpyBrain.png" alt="jumpyBrain logo" width="220" />
</p>

# jumpyBrain - Sovereign Company Brain

**shared team memory instead of manually sending markdown files around**

jumpyBrain gives AI coding assistants a shared memory. Let you Claude Code, Codex etc. "remember" important decisions or findings in your teams memory.
Just by typing ```@jumpyBrain remember that we do not like pinapple on pizza. Company policy!```
The whole team (their Claude/Codex) will recall this decision when planning the team event. Automatically.

## Who is it for?

**Teams who want to own their company brain**.

- People who use AI coding agents across many sessions
- Teams that want project memory to live with the repo or a shared server-local memory root
- Non-technical owners who want decisions, context, and handoffs in readable files

## Who is it not for?

Anthropic and OpenAi are both working on memory. They will want to own this infrastructure.
jumpyBrain wants you to own your company brain, so that you remain harness and model provider agnostic.

If that Sovereignity is not a priority for you, jumpyBrain is not for you.


## What does it do?

jumpyBrain turns project knowledge into a Markdown memory root your agent can recall before it acts. That memory root can live inside a repo/workspace for local use, or on a server for hosted/shared use.

It is built for:

- architecture decisions and project conventions
- session summaries and handoffs
- solved bugs and repeated gotchas
- benchmark results and tradeoffs
- uncertainty that should not be flattened into fake confidence

Markdown is the source of truth, so humans can read, edit, review, and commit memory like any other project file. In hosted deployments, the server still works against ordinary Markdown files on its local filesystem; indexes and caches remain rebuildable derived state.

## How does it work?

```text
agent sessions
  -> remember useful context
  -> save Markdown memories
  -> build a rebuildable recall index
  -> recall relevant context on demand
  -> show provenance back to the source file
```

Local mode:

```text
repo/workspace
  -> ./memory/*.md
  -> ./memory/.jumpybrain/ derived index
  -> jumpybrain CLI
```

Hosted/shared mode:

```text
agents / teammates
  -> jumpybrain CLI
  -> hosted jumpyBrain deployment
  -> server-local Markdown memory root
  -> server-local derived index
```

By default, jumpyBrain favors **explicit recall**. Remember writes durable memory; recall reads relevant memory when asked or when a workflow calls for it. Automatic prompt injection should stay opt-in and bounded in both local and hosted deployments.

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
- repo/workspace-local Markdown memories for local use
- server-local Markdown memories for hosted/shared use
- rebuildable indexes and recall state
- QMD-backed Markdown recall
- CLI-first workflows for remembering, recalling, wrapups, and memory processing

## Local-first, but hostable

jumpyBrain is local-first, not local-only. The local Markdown/QMD engine is the app; a hosted/shared deployment runs the same app against a server-local memory root.

The supported interface for hosted memory is still the CLI. Agents and other tools should call the CLI rather than depending on an internal hosted API contract. This keeps the local and hosted workflows aligned: initialize or target a memory root, remember durable Markdown memory, and recall it with provenance.

Internal maintenance work, such as memory processing/linting/synthesis jobs, should run inside the app/server against that server-local Markdown root. API or CLI triggers can be added later, but scheduled server-side processing can start as a local cron-style job.

Hosted/shared memory is therefore a deployment shape, not a different storage model: Markdown remains canonical, derived state remains rebuildable, and retrieval stays explicit and provenance-backed.

## Quick start: local memory

```bash
npm install -g @tobilu/qmd
qmd --version

jumpybrain init --root ./memory
jumpybrain instructions
echo "Remember writes; recall reads." | jumpybrain remember --root ./memory --type decision --title "CLI language"
jumpybrain run memory:recall --topic "<current topic>" --limit 5 --depth normal
jumpybrain recall --root ./memory --query "<question>" --limit 10 --depth normal --json
jumpybrain process --root ./memory --mode synthesize --topic "<topic>" --apply
cat wrapup.md | jumpybrain wrapup --root ./memory --title "Session wrapup" --topic "current session"
```

## Hosted/shared usage

The hosted path is intentionally CLI-first. A hosted deployment should expose a way for the `jumpybrain` CLI to operate on a server-local memory root while preserving the same commands and output shapes used locally.

Today, treat hosted/shared operation as an integration/deployment boundary:

- keep the hosted memory root as ordinary Markdown on the server
- rebuild indexes from Markdown rather than treating cache files as canonical
- use CLI commands for agent workflows instead of binding agents to internal APIs
- run lint/synthesis/maintenance inside the hosted app/server against its local root
- keep automatic context injection opt-in and bounded

## Docs

- Installation: [`docs/install.md`](docs/install.md)
- Memory format: [`docs/memory-format.md`](docs/memory-format.md)
- Agent workflows: [`docs/agent-workflows.md`](docs/agent-workflows.md)
- Technical CLI/indexing details: [`docs/technical.md`](docs/technical.md)
- Local CLI builds/versioning: [`docs/local-cli-builds.md`](docs/local-cli-builds.md)
