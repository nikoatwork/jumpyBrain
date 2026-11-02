# Parallel feedback fixes and integration

Status: active. Authorized 2026-11-02: dispatch independent subagents and bring completed work together on local `master`. First three lanes integrated; second batch follows the ownership review below.

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
- At the editor integration checkpoint, CLI/hosted results had not yet been delivered. Their subsequent integration is recorded below; no running-task polling is used.

### CLI integration

- Read the completed CLI source thread and reviewed help dispatch, command metadata, strict parser changes, sentinel/compatibility tests and archived task. Accepted source tip `b79f1e61c1149300981f7fa3d533ac721c5c763f` from `t3/cli-help-validation`.
- Merged with ancestry preserved as `18c29e767620da7a7e9d51b6e7e11010461c441e`; `git merge-base --is-ancestor <source-tip> master` passed. The existing editor/progress changes merged cleanly.
- Parent combined editor/CLI snapshot: `npm run build` passed; 17 focused CLI parser, help/sentinel, baseline and remote-access-policy tests passed with no skips. Delegate's full suite passed 1,798 tests with one existing opt-in real-QMD skip. Full combined integration checks remain pending hosted delivery.
- CLI task is complete and archived at [verification](../done/2026-11-02_tasks-cli-help-and-validation.md); no runtime/install/release blocker remains for this lane. Source thread can be settled after this integration record is committed.

### Hosted integration

- Read the completed hosted source thread and reviewed Docker/runtime dependency closure, smoke runners and operator guidance. Merged source tip `86c937bd91e197508909ef0ae6c4fd12353cf3ec` from `t3/fix-hosted-docker-build` as `c9886de1d07ccdd5d3d584fcc0f06b78c7a559a1`; ancestry verification passed. Changelog/release-note conflicts were resolved by retaining both CLI and hosted outcomes.
- Parent `smoke:hosted` passed on the combined `c9886de` source: Linux ARM64, Node 22.23.4, QMD 2.8.3; input SHA-256 `41350d8435b5818153c1abd36cda5c46c7caabfceb987672ca77a64b39e99cb4`; temporary image `sha256:d3b0b9ff3a6960ae4aac84837a9bdf1472d63ae491bffe278d324d9d24ab2e50`. Real lexical retrieval, access/cookie/bootstrap revocation, graceful replacement, exact persistence and stopped-root loss/restore passed; disposable resources were removed. Host Docker CLI needed its existing application bin directory added to this command's PATH.
- Full combined `npm test` finished with 1,796 passed, two failures and one existing opt-in skip (1,799 total), output at `/tmp/jumpybrain-feedback-c9886de-tests.log`. The failures were the old global-QMD-install assertion and unpacked package budget: 4,613,120 bytes versus 4,600,000.
- Parent repaired the distribution assertion to verify the existing locked engine graph rather than the superseded global command. Kept all budget ceilings intact and excluded the internal renderer design reference from the installed tarball; user/install/operator guides, runtime assets and notices remain. The three focused failing/exclusion checks pass. Package check: 1,439,086 archive bytes, 4,591,358 unpacked bytes, 3,094,778 runtime bytes and 628 files. Full-suite revalidation remains required after the next batch.
- CLI source-thread settlement succeeded after `65680c1`. Editor and hosted source threads retain unfinished task ownership: actual idle failure/package verification and real systemd-manager enforcement respectively. They remain active rather than claiming completed tasks.

## Second-batch scope

After reviewing the first batch, three further independent implementation lanes are ready from the integrated source. Each must record design decisions and preserve explicit targeting/permissions, existing output formats and unique recovery state.

- [Brain connections/targeting](tasks-brain-connections-and-targeting.md): owns target resolver, doctor target diagnostics, companion connection-control orchestration and additive CLI registration. Preserve app/CLI selection separation; do not create a competing registry or infer shared write authorization. It does not own updater cleanup, lint or guidance refactoring.
- [Runtime hygiene](tasks-desktop-runtime-hygiene.md): owns updater staging/runtime lifetimes, safe retention, managed integration refresh mechanics, backend enumeration and host diagnostic classification. It must not modify target precedence, connection management, skill content or lint behavior. Additive backend help/dispatch changes may require parent reconciliation with other CLI changes.
- [Agent interface efficiency](../done/2026-11-02_tasks-agent-interface-efficiency.md): owns concise/on-demand guidance, read-only lint preview and documented compatibility/feedback decisions. It must not change target precedence, connection orchestration, updater cleanup or retrieval ranking. Preserve output contracts; do not implement speculative actor inference or larger feedback protocols solely because they were proposed.

Shared CLI metadata/registration and docs are additive integration seams, not permission to replace another lane's implementation. Parent reconciles them. Retrieval readiness/temporal diagnostics wait for the target/doctor lane to finish; larger product proposals retain their discovery/evidence gates.

### Second-batch delegates and guidance integration

- Connections: <t3-thread://v2/e2ddce68-4862-4cde-bb7d-20fe060e49b8/thread:delegated-task:command%3Amcp%3A18cafb8e-e1d4-42d3-b1a1-a5e64a2fa69a%3Adelegate-task%3A6693f7d2-4f89-47af-b0f5-afa1467fa4b8>.
- Runtime: <t3-thread://v2/e2ddce68-4862-4cde-bb7d-20fe060e49b8/thread:delegated-task:command%3Amcp%3A18cafb8e-e1d4-42d3-b1a1-a5e64a2fa69a%3Adelegate-task%3A850317cc-676b-4957-bcd1-d325ac1d5531>.
- Guidance/lint: <t3-thread://v2/e2ddce68-4862-4cde-bb7d-20fe060e49b8/thread:delegated-task:command%3Amcp%3A18cafb8e-e1d4-42d3-b1a1-a5e64a2fa69a%3Adelegate-task%3A1061453b-4780-4875-bf36-cf4f42e56fc1>.
- Read the completed guidance/lint source thread and reviewed observational processing, transport bypass, strict flags, topic/skill guidance, mutation sentinels and archived decisions. Fast-forwarded `master` to source tip `3065cb75a34bd89f619ba0b726e98d3c4509f1b3`; ancestry verification passed. Delegate's full suite passed 1,803 tests with zero failures and one existing opt-in skip; original package ceilings passed.
- Parent review restored the prior concurrent-edit precaution in the write topic: same-target `collaborate open`, offsets from its body, actual epoch/base revision, stable client identity and no guessed replay/whole-note-per-chunk replacement. Initial guidance remains unchanged; the skill points to those operation details. This is a small review correction, not a new feature or output contract.
- Parent build and 16 focused instruction/lint/apply/parser/help tests passed with zero skips. Current package check passes: 1,438,237 archive / 4,588,610 unpacked / 3,099,283 runtime bytes; 628 files. Only 717 runtime bytes remain; connections/runtime delegates were notified of combined footprint constraints without polling their work. Reproducible byte accounting is at `/tmp/jumpybrain-guidance-integrated.json`; no tokenizer or token-efficiency claim.
- Guidance task is complete and [archived](../done/2026-11-02_tasks-agent-interface-efficiency.md). Settle its completed source thread after committing this review record; connection/runtime results remain pending their completion notifications.
- With one lane free, [product discovery](tasks-feedback-product-discovery.md) can proceed independently on evidence and adopt/defer decisions. It must preserve the frozen inbox audit, avoid private telemetry or product/runtime implementation and leave substantive proposals behind explicit evidence gates. Retrieval/doctor changes still wait for targeting.
