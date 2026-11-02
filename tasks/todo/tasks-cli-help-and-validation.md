# Predictable CLI help and argument validation

Priority: P0 for help executing an update; P1 for other discoverability failures. Status: planned; user-reported behavior needs installed/current-source comparison.

## Goal

Every supported command should answer help without executing its operation, requiring a brain or reading credentials/stdin. Typographical errors should fail as argument errors before backend work.

## Evidence

- [Agent review, 2026-11-02, part 1](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=93c68f07-038e-4d2a-8247-f565481d0361) reports missing/inconsistent subcommand help, an update performed during a help request, absent conventional help aliases and silently accepted flags on some read commands in 0.3.17.
- This is agent-authored feedback, not independently reproduced evidence. Current bounded-read parsing already documents strict validation; identify the affected dispatch/parser paths instead of replacing working command contracts.
- Root discovery belongs to [brain targeting](tasks-brain-connections-and-targeting.md). Agent policy length belongs to [agent interface](tasks-agent-interface-efficiency.md).

## Relevant files

- `src/cli/cli.docs.md`, `src/cli/commands.ts`, `src/cli/args.ts`, `src/cli/usage.ts` — dispatch, parsing and help.
- `src/cli/update.ts`, `src/cli/doctor.ts`, `src/cli/recipes.ts` — early operation-specific paths.
- `docs/cli-commands.md`, `test/cli-args-properties.test.js` — documented surface and existing argument checks.

## Tasks

- [ ] 1.0 Audit help safely against a disposable installation.
  - [ ] 1.1 Inventory top-level commands, namespaces and recipes; record `--help`, `-h` and `help <command>` behavior. Stub mutation/update/process spawning so the audit cannot change a real installation.
  - [ ] 1.2 Confirm whether help is intercepted before target selection, configuration/secret reads, stdin, indexing, backend startup and networking. Separate release behavior from current HEAD.
- [ ] 2.0 Make help consistent.
  - [ ] 2.1 Add one early help dispatch contract with concise command-specific usage and conventional aliases, including nested namespaces. Define mixed help/invalid-argument behavior explicitly.
  - [ ] 2.2 Shorten the root banner into a command overview; keep detailed flags in command help and advanced documentation. Avoid a duplicate parser or help framework unless needed.
- [ ] 3.0 Reject invalid arguments consistently.
  - [ ] 3.1 Close confirmed unknown/missing/repeated-flag gaps while preserving deliberate aliases and existing bounded-read validation. Never run an empty query because a query flag was misspelled.
  - [ ] 3.2 Return an actionable flag error; suggest a spelling only when unambiguous. Keep JSON/stdout contracts and exit behavior stable for valid invocations.
- [ ] 4.0 Verify and finalize.
  - [ ] 4.1 Test help across all registered commands without a configured root/key, with unreadable stdin/config and network/process sentinels. Specifically prove update/delete/process help causes no operation.
  - [ ] 4.2 Test typo, missing-value, duplicate and incompatible-flag cases on affected parser families, then run the required CLI checks.
  - [ ] 4.3 Update CLI/owning docs and pending release notes for implemented behavior; record validation/limits and archive/commit under [task completion](../../docs/task-workflow.md).
