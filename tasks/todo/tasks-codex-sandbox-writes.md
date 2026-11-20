# Writes from Codex's default sandbox

Priority: P1 (Claude Code, T3 Code and Codex are the hosts that must work; Pi is nice to have). Planned 2026-11-20 from an end-to-end host check.

## Goal

An agent in Codex's default `workspace-write` sandbox can save to a project memory inside its workspace, or gets one clear instruction to re-run with approval. Today every write fails after a 20-second wait with `backend_not_ready`.

## Evidence (2026-11-20, codex-cli 0.170.0, macOS seatbelt)

- Scratch project with an approved project memory (`capture: "durable"`, `--allow-capture`), current `master` build, skill rendered from `skills/jumpybrain-memory/SKILL.md`.
- `codex exec --sandbox workspace-write`: recall worked through the read-only fallback (`target.source: "trusted-project"`, warning `read_only_index`). Codex correctly chose to save the durable project decision to the project memory, and `remember` failed with `backend_not_ready`. Nothing was saved.
- `codex exec --sandbox danger-full-access` (how T3 Code usually runs Codex): recall and project capture both worked; nothing reached the personal brain.
- Claude Code (`claude -p`, Sonnet, no sandbox): recall and project capture both worked once the skill named the capture exception (fixed 2026-11-20).
- Two separate sandbox blocks, found with `codex sandbox --log-denials -c sandbox_mode=workspace-write`:
  1. Listening on 127.0.0.1 (`EPERM`) and binding a Unix socket in the workspace (`EPERM`). `-c sandbox_workspace_write.network_access=true` allows the TCP listener.
  2. Even with network allowed, the backend fails to publish its runtime pin: `file-write-create <install>/.backend-pins/<instance>.json`, outside the workspace (`src/adapters/backend-host/runtime-pins.ts`). The pin protects a running runtime from updater retirement.
- Codex marks sandboxed commands with `CODEX_SANDBOX=seatbelt` and `CODEX_SANDBOX_NETWORK_DISABLED=1`. Since 2026-11-20, `backend_not_ready` adds a hint when `CODEX_SANDBOX` is set (`sandboxHint` in `src/app/backend-host/index.ts`).
- Writes to the personal brain (`~/.jumpybrain/memory`) are outside the workspace and blocked by the sandbox no matter how the backend starts. Interactive Codex with on-request approvals can escalate; `codex exec` cannot.

## Tasks

- [ ] 1.0 Check interactive Codex (on-request approvals) and T3 Code's Codex modes: does the agent escalate after the new hint, and how many approval prompts does one save cost?
- [ ] 2.0 Decide the direction, then record it:
  - a. Document only: Codex users enable `network_access` or run with approval/full access; keep the hint. Still blocked by the pin.
  - b. Fail fast: with `CODEX_SANDBOX_NETWORK_DISABLED=1`, skip the 20-second wait and return the hint at once.
  - c. Treat a pin write denied by the sandbox (`EPERM`/`EACCES`) like the existing unpinnable-runtime case, so (a) works with network enabled. Needs a look at updater retirement safety first.
  - d. Allow a direct, serialized in-process write when no backend can run (largest change; touches single-owner guarantees).
- [ ] 3.0 Implement the chosen direction with a test that runs under `codex sandbox -c sandbox_mode=workspace-write` where available, and document the Codex setup in `docs/install.md`.
- [ ] 4.0 Re-run the three-host check (Claude Code, Codex sandboxed, Codex full access) and add a release note.
