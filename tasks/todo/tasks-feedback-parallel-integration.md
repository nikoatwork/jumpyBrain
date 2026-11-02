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

- [ ] 1. Dispatch three isolated delegates and record returned task/thread links.
- [ ] 2. Read each completed result, inspect its scoped diff and validation, and fix small integration/review findings.
- [ ] 3. Merge accepted branch tips into local `master`, preserving ancestry and unrelated work. Record each source tip and integration commit.
- [ ] 4. Run build/full deterministic suite on the combined snapshot plus relevant changed-flow checks. Record skips, prerequisite failures and remaining validation honestly.
- [ ] 5. Ensure completed source lists are archived, partial lists retain actual blockers, references/release notes are reconciled and changes committed.
- [ ] 6. Read and settle each completed integrated source T3 thread, then finalize this integration list under [task completion](../../docs/task-workflow.md).

No push, public PR, release, personal installation, hosted deployment or feedback reply is authorized by this integration request.
