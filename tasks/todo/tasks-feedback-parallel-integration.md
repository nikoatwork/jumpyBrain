# Parallel feedback fixes and integration

Status: active. Authorized 2026-11-02: dispatch independent subagents and bring completed work together on local `master`.

## Scope and ownership

Start three isolated implementation lanes from the same committed snapshot:

1. [Idle-note editing](tasks-stale-note-editing.md): editor/source mapping, focused regressions and real editor checks. Preserve private-draft and collaboration safeguards; establish a reproducible cause before fixing.
2. [CLI help/validation](../done/2026-11-02_tasks-cli-help-and-validation.md): early side-effect-free help, concise usage and strict argument gaps. Do not change target discovery or agent instruction/output schemas.
3. [Hosted build/operations](tasks-hosted-build-and-operations.md): container input/runtime closure, focused build gate and accurate hosted guidance. Do not change ordinary CLI dispatch, editor code or server authorization architecture.

Each delegate owns its task record, implementation, focused tests and owning docs in its prepared worktree. They are not alone in the repository and must preserve other work. Shared release notes, changelog and feedback index may need integration reconciliation. Parent owns merges, shared-document reconciliation, combined checks and T3 source-thread settlement.

The remaining lists contain overlapping target/backend/CLI work or proposals requiring evidence. Do not independently launch competing root resolvers, change retrieval ranking, remove output contracts or add automatic product workflows as part of these three lanes. Reassess ready independent increments after the first batch rather than marking other lists complete.

## Tasks

- [x] 1. Dispatch three isolated delegates and record returned task/thread links.
- [ ] 2. Read each completed result, inspect its scoped diff and validation, and fix small integration/review findings.
- [ ] 3. Merge accepted branch tips into local `master`, preserving ancestry and unrelated work. Record each source tip and integration commit.
- [ ] 4. Run build/full deterministic suite on the combined snapshot plus relevant changed-flow checks. Record skips, prerequisite failures and remaining validation honestly.
- [ ] 5. Ensure completed source lists are archived, partial lists retain actual blockers, references/release notes are reconciled and changes committed.
- [ ] 6. Read and settle each completed integrated source T3 thread, then finalize this integration list under [task completion](../../docs/task-workflow.md).

No push, public PR, release, personal installation, hosted deployment or feedback reply is authorized by this integration request.

## Delegates

- Editor: <t3-thread://v2/e2ddce68-4862-4cde-bb7d-20fe060e49b8/thread:delegated-task:command%3Amcp%3A18cafb8e-e1d4-42d3-b1a1-a5e64a2fa69a%3Adelegate-task%3A87488616-c133-44cd-92d7-0fd1b23e45d3>.
- CLI: <t3-thread://v2/e2ddce68-4862-4cde-bb7d-20fe060e49b8/thread:delegated-task:command%3Amcp%3A18cafb8e-e1d4-42d3-b1a1-a5e64a2fa69a%3Adelegate-task%3A460be7e9-e4fe-4988-be43-d6b294e04ade>.
- Hosted: <t3-thread://v2/e2ddce68-4862-4cde-bb7d-20fe060e49b8/thread:delegated-task:command%3Amcp%3A18cafb8e-e1d4-42d3-b1a1-a5e64a2fa69a%3Adelegate-task%3A7e063ef6-4491-488f-8658-7c4dfe6a36ef>.

## Integration progress — 2026-11-02

- Read the editor delegate's completed source thread and inspected all three changed files. Accepted investigation/regression coverage without a runtime repair: current source passes the proposed matrix, and the diagnostic build predates `11f9951` without identifying the actual failed input.
- Fast-forwarded `master` to source tip `06289035deda31a26e96613fe7889fa95820f5a5`; `git merge-base --is-ancestor <source-tip> master` passed. Local script syntax and diff whitespace checks passed. Delegate recorded build, 48 focused tests and real fresh-note/collaboration/stale-note smokes; combined full-suite validation remains pending the other lanes.
- Editor task and source thread stay active because the actual failure reproduction and matching packaged-Mac verification remain required. Integration of useful coverage does not resolve the bug or justify task/thread settlement.
- CLI/hosted results have not yet been delivered; no running-task polling is used. Continue automatically when their completion wakes this integration thread.

### CLI integration

- Read the completed CLI source thread and reviewed help dispatch, command metadata, strict parser changes, sentinel/compatibility tests and archived task. Accepted source tip `b79f1e61c1149300981f7fa3d533ac721c5c763f` from `t3/cli-help-validation`.
- Merged with ancestry preserved as `18c29e767620da7a7e9d51b6e7e11010461c441e`; `git merge-base --is-ancestor <source-tip> master` passed. The existing editor/progress changes merged cleanly.
- Parent combined editor/CLI snapshot: `npm run build` passed; 17 focused CLI parser, help/sentinel, baseline and remote-access-policy tests passed with no skips. Delegate's full suite passed 1,798 tests with one existing opt-in real-QMD skip. Full combined integration checks remain pending hosted delivery.
- CLI task is complete and archived at [verification](../done/2026-11-02_tasks-cli-help-and-validation.md); no runtime/install/release blocker remains for this lane. Source thread can be settled after this integration record is committed.
