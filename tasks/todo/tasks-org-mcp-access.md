# Org-wide access to a shared brain from Claude via MCP

Priority: proposed P2, to confirm. Status: **parked 2026-11-18 by the owner**; no product decision or MCP work until it is reactivated. Planned 2026-11-17 from feedback.

## Parked: what works today

- The CLI remains the supported way to reach a shared brain: each member installs it and points it at the hosted server (`--target-url` plus their own access key). Recall, search, show and explicit writes work this way.
- Claude Code and Claude Desktop setups that can run shell commands use that CLI through the installed jumpyBrain skill. claude.ai in the browser cannot run the CLI, so it has no access until an MCP surface exists.
- Reactivate this list when the owner takes up the product decision in 1.0; nothing below has started.

## Goal

Everyone in an organisation can use one shared product brain from Claude (claude.ai, Claude Desktop and Claude Code) without each person installing and configuring the CLI. Keep the existing access, write-protection and privacy rules.

## Evidence

- [Nov 17 feedback](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=30de429a-3525-4496-93b3-4f5524fae940) (diagnostics attached): "i want this product brain … to be accessible to everyone in the org via mcp in claude".
- The [Nov 17 dependency follow-up](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=4869826a-f384-4700-999f-41dd1684c3eb) also suggests an MCP server could be worth exposing.
- Conflicts with current rules: `AGENTS.md` says the CLI is the supported interface for hosted memory and agents should not call the hosted API directly. Product guardrails avoid automatic prompt injection and prefer explicit recall. Access keys are per-user files today; claude.ai custom connectors expect a remote MCP server with OAuth or no auth.

## Relevant files

- `AGENTS.md`, `docs/product-vision.md`, `docs/cloud-shared-memory.md`, `docs/shared-memory-protocol.md`, `docs/collaboration.md` (around line 238)
- `src/adapters/http-server/` - existing hosted API and access keys
- `src/cli/` - commands an MCP tool set would mirror (recall, search, show, write)

## Tasks

- [ ] 1.0 Decide the product direction
  - [ ] 1.1 **Clarify:** which Claude surfaces must work: claude.ai org connector (remote MCP), Claude Desktop/Code (local MCP), or both?
  - [ ] 1.2 **Clarify:** read-only first, or read and write? Who may write to an org brain?
  - [ ] 1.3 **Clarify:** how people sign in: shared org key, per-person keys, or OAuth through the org's identity provider.
  - [ ] 1.4 Record the decision and update the CLI-only rule in `AGENTS.md` and the owning docs if it changes.
- [ ] 2.0 Design the smallest MCP surface
  - [ ] 2.1 Map a few tools (for example recall/search, show, and optionally write) onto existing app operations, not a second implementation. Keep retrieval depth and provenance.
  - [ ] 2.2 Decide where it runs: inside the hosted server (remote MCP) or as a local `jumpybrain mcp` command over the existing CLI transport. Prefer reusing the CLI transport for a local server.
- [ ] 3.0 Build and verify
  - [ ] 3.1 Implement the chosen surface with tests for auth refusal, read-only enforcement and result size limits.
  - [ ] 3.2 Connect it from at least one real Claude client against a disposable brain and record what was tested.
- [ ] 4.0 Finalize
  - [ ] 4.1 Document setup for org admins and members. Update the [email index](../feedback.md) row, add a pending release note, and finalize under [task workflow](../../docs/task-workflow.md).
