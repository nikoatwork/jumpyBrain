# Predictable CLI help and argument validation

Priority: P0 for help executing an update; P1 for other discoverability failures. Status: completed 2026-11-02. Early help is side-effect-free across commands/namespaces/recipes; confirmed legacy argument gaps are closed.

## Goal

Every supported command should answer help without executing its operation, requiring a brain or reading credentials/stdin. Typographical errors should fail as argument errors before backend work.

## Evidence

- [Agent review, 2026-11-02, part 1](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=93c68f07-038e-4d2a-8247-f565481d0361) reports missing/inconsistent subcommand help, an update performed during a help request, absent conventional help aliases and silently accepted flags on some read commands in 0.3.17.
- The report is agent-authored feedback. The disposable audit below independently reproduced dispatch/parser defects in the release tag and starting source without executing operations; it does not establish that an actual installation was changed.
- Root discovery belongs to [brain targeting](2026-11-02_tasks-brain-connections-and-targeting.md). Agent policy length belongs to [agent interface](../todo/tasks-agent-interface-efficiency.md).

## Relevant files

- `src/cli/cli.docs.md`, `src/cli/commands.ts`, `src/cli/args.ts`, `src/cli/usage.ts` — dispatch, parsing and help.
- `src/cli/update.ts`, `src/cli/doctor.ts`, `src/cli/recipes.ts` — early operation-specific paths.
- `docs/cli-commands.md`, `test/cli-help-validation.test.js`, `test/fixtures/cli-help-sentinels.mjs`, `test/cli-args-properties.test.js` — documented surface, negative side-effect sentinels and focused parser checks.
- `test/cli-baseline-contracts.test.js`, `test/document-edit-smoke.test.js`, `test/extensions-cli.test.js`, `test/memory-cli.test.js`, `test/search-recognition.test.js` — compatibility assertions updated for the focused help organization and explicit document-update mode.

## Tasks

- [x] 1.0 Audit help safely against a disposable installation.
  - [x] 1.1 Inventory top-level commands, namespaces and recipes; record `--help`, `-h` and `help <command>` behavior. Stub mutation/update/process spawning so the audit cannot change a real installation.
  - [x] 1.2 Confirm whether help is intercepted before target selection, configuration/secret reads, stdin, indexing, backend startup and networking. Separate release behavior from current HEAD.
- [x] 2.0 Make help consistent.
  - [x] 2.1 Add one early help dispatch contract with concise command-specific usage and conventional aliases, including nested namespaces. Define mixed help/invalid-argument behavior explicitly.
  - [x] 2.2 Shorten the root banner into a command overview; keep detailed flags in command help and advanced documentation. Avoid a duplicate parser or help framework unless needed.
- [x] 3.0 Reject invalid arguments consistently.
  - [x] 3.1 Close confirmed unknown/missing/repeated-flag gaps while preserving deliberate aliases and existing bounded-read validation. Never run an empty query because a query flag was misspelled.
  - [x] 3.2 Return an actionable flag error; suggest a spelling only when unambiguous. Keep JSON/stdout contracts and exit behavior stable for valid invocations.
- [x] 4.0 Verify and finalize.
  - [x] 4.1 Test help across all registered commands without a configured root/key, with unreadable stdin/config and network/process sentinels. Specifically prove update/delete/process help causes no operation.
  - [x] 4.2 Test typo, missing-value, duplicate and incompatible-flag cases on affected parser families, then run the required CLI checks.
  - [x] 4.3 Update CLI/owning docs and pending release notes for implemented behavior; record validation/limits and archive/commit under [task completion](../../docs/task-workflow.md).

## Implementation and safe audit

- Based on `a2a90cf`, retaining package version 0.3.17. The local managed installation identifies itself as 0.3.15, so it is not evidence of the reported 0.3.17 behavior.
- Compared the `v0.3.17` tag and starting-source CLI modules in disposable installation copies: transpiled the selected snapshot's commands/args/usage/board parser into a temporary package and replaced operation seams (including updater, local transport, memory handlers, migration, server and backend commands) with throwing stubs. No real updater, backend, installer or network request ran during help probing. Audited 72 current command/namespace/recipe paths in three help spellings (216 attempts per snapshot); identity is absent from the older tag.
- In both snapshots, `update --help` and `update -h` reached the updater stub; `help update` printed the root banner. Plain recall/search/process help reached memory dispatch; strict delete/expand/remember/doctor/migration parsers rejected help. Namespace `-h` was inconsistent. An initial plain `search --qurey x` probe reached memory dispatch. These establish dispatch/parser defects, not evidence that an actual installation was modified.
- `runCli` now intercepts exact help tokens before parsing. Help wins over malformed/missing flags; unknown command, child or recipe paths fail without work. `usage.ts` owns presentation-only metadata, concise root overview, focused namespace children and recipe-derived help. Document-update recipe help excludes installer mode; future commands can add metadata without a dependency on operation code.
- Plain recall/search reuse the existing bounded-read parser. Previously permissive operational families share a small token validator for unknown/missing/repeated flags and boolean shape; command handlers keep semantic validation, target/read-only policy and outputs. Existing tags/API-key repetition, tree aliases, process apply true/false and recipe discovery remain. Legacy flags-before-command forms are reparsed through the same command validator so they cannot bypass strictness; Dream rejects repeated bare flags as well.
- Help tests deny filesystem/config calls, root/home discovery, secret environment reads, stdin, process spawning, server/socket calls and fetch during invocation, counting attempted calls even if caught. They cover every metadata command/child/recipe, all three help spellings, mixed malformed flags, unknown paths, update/delete/process, aliases and root/no-args help: 312 cases with zero attempted side effects.
- Updated old root/namespace help assertions for the intentionally shorter overview and focused command usage. Attribution-helper tests now explicitly select document-update mode with an ID rather than supplying actor-only installer arguments.
- Owning CLI docs/reference and pending release notes updated. No new glossary term. Changelog entry omitted under the selective significance gate: this is a focused bug fix, not a major workflow or architecture change.

## Verification

- `npm ci` provisioned repository-local test/build dependencies; no machine/app installation.
- `npm run build`: passed TypeScript and both editor bundle builds before compatibility checks.
- Focused compatibility suite: 65/65 passed, covering help/parser properties, baseline/document edits, extensions, feedback, memory/recipes, and recognition. Earlier focused CLI set also covered bounded reads, remote policy/targets, boards, collaboration, migration and doctor.
- Initial full suite found obsolete help assertions, two incomplete document-mode unit invocations, and a worktree prerequisite missing from desktop compiler tests (`integrations/electron/node_modules/esbuild/package.json`). The help assertions and invocation fixtures were corrected. Provisioned only that worktree's desktop package dependencies with `npm ci --prefix integrations/electron --ignore-scripts`; no Electron binary/app install or host setup ran.
- Final `npm test` (including build and full deterministic suite): 1,799 tests, 1,798 passed, 0 failed, 1 existing opt-in test skipped. The skip requires `JUMPYBRAIN_TEST_QMD_BIN` pointing to real QMD 2.8.3 for CLI/WAL physical read-only parity; that engine was not provisioned for this lane. No model/browser/host deployment validation is claimed or required for this CLI-only change.
- Final standalone help/parser check: 9/9 passed; 312 sentinel help cases attempted no side effects. `git diff --check` passed.
- Tested source snapshot: branch `t3/cli-help-validation`, based on `a2a90cf`, represented by the containing implementation commit; only task/reference finalization followed the passing tests.
- `npm run guard:staged` and `git diff --cached --check`: passed.

## Remaining limits and blockers

- No implementation blocker or required check remains. Parent owns integration, combined checks and thread settlement.
- The release behavior comparison used tagged-source modules in disposable installations with throwing operation stubs, not an end-to-end public updater or a modified personal install.
- Real QMD parity remains the existing explicit opt-in described above; ordinary/fake-engine retrieval, bounded output, protected-target policy and recipe tests passed.
