# Parallel feedback fixes and integration

Status: completed 2026-11-02. All eight original feedback lanes were reviewed and accepted increments integrated into local `master`; three source tasks retain explicit reproduction/platform follow-ups.

## Scope and ownership

Start three isolated implementation lanes from the same committed snapshot:

1. [Idle-note editing](../todo/tasks-stale-note-editing.md): editor/source mapping, focused regressions and real editor checks. Preserve private-draft and collaboration safeguards; establish a reproducible cause before fixing.
2. [CLI help/validation](../done/2026-11-02_tasks-cli-help-and-validation.md): early side-effect-free help, concise usage and strict argument gaps. Do not change target discovery or agent instruction/output schemas.
3. [Hosted build/operations](../todo/tasks-hosted-build-and-operations.md): container input/runtime closure, focused build gate and accurate hosted guidance. Do not change ordinary CLI dispatch, editor code or server authorization architecture.

Each delegate owns its task record, implementation, focused tests and owning docs in its prepared worktree. They are not alone in the repository and must preserve other work. Shared release notes, changelog and feedback index may need integration reconciliation. Parent owns merges, shared-document reconciliation, combined checks and T3 source-thread settlement.

The remaining lists contain overlapping target/backend/CLI work or proposals requiring evidence. Do not independently launch competing root resolvers, change retrieval ranking, remove output contracts or add automatic product workflows as part of these three lanes. Reassess ready independent increments after the first batch rather than marking other lists complete.

## Tasks

- [x] 1. Dispatch eight independent feedback lanes plus one focused safety review; record returned source links.
- [x] 2. Read each completed result, inspect its scoped diff and validation, and fix small integration/review findings.
- [x] 3. Merge accepted branch tips into local `master`, preserving ancestry and unrelated work. Record each source tip and integration commit.
- [x] 4. Run build/full deterministic suite on the combined snapshot plus relevant changed-flow checks. Record skips, prerequisite failures and remaining validation honestly.
- [x] 5. Ensure completed source lists are archived, partial lists retain actual blockers, references/release notes are reconciled and changes committed.
- [x] 6. Read and settle each completed integrated source T3 thread, then finalize this integration list under [task completion](../../docs/task-workflow.md).

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

- [Brain connections/targeting](../done/2026-11-02_tasks-brain-connections-and-targeting.md): owns target resolver, doctor target diagnostics, companion connection-control orchestration and additive CLI registration. Preserve app/CLI selection separation; do not create a competing registry or infer shared write authorization. It does not own updater cleanup, lint or guidance refactoring.
- [Runtime hygiene](../todo/tasks-desktop-runtime-hygiene.md): owns updater staging/runtime lifetimes, safe retention, managed integration refresh mechanics, backend enumeration and host diagnostic classification. It must not modify target precedence, connection management, skill content or lint behavior. Additive backend help/dispatch changes may require parent reconciliation with other CLI changes.
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
- With one lane free, [product discovery](../done/2026-11-02_tasks-feedback-product-discovery.md) can proceed independently on evidence and adopt/defer decisions. It must preserve the frozen inbox audit, avoid private telemetry or product/runtime implementation and leave substantive proposals behind explicit evidence gates. Retrieval/doctor changes still wait for targeting.

### Connections integration and remaining lanes

- Read the completed connections source thread, reviewed revisioned native control, source selection, target precedence, tests and verification. Merged source tip `081b2fcc766e0d0f3339ddd84a9c3a66ba39b576` with ancestry preserved as `f1e851a904d3902bb7e3485bd76fa0fab5cfd030`. Parser metadata/validation conflicts retain both connection commands and instruction topics/lint preview; shared docs retain both outcomes. Archived-task cross-links were reconciled instead of restoring an already completed todo.
- Independent additions exceeded the fixed runtime ceiling when combined. The existing asset build now removes whitespace only from emitted CLI `args`, `usage` and `instructions` JavaScript with existing esbuild; identifiers, syntax transforms and legal notices remain intact, and source/declarations stay readable. No new dependency, bundle, missing resource or raised ceiling. Parent build, 28 focused connection/target/instruction/lint/help/policy tests and package checks passed: 1,439,888 archive / 4,589,655 unpacked / 3,096,567 runtime bytes; 630 files.
- Parent hosted smoke passed again with this build/CLI integration on Linux ARM64: input SHA-256 `e4e63722339b2cb0a303a40353b8767d21265afffae65c424ee72babb0f9e93d`, temporary image `sha256:d160acf8038e3a97cf236dadc76657a3f2f1503e9fc31c0403e791c7ed974454`. Its retrieval/access/replacement/restore checks passed and fixtures were removed. Full suite is running at `/tmp/jumpybrain-feedback-connections-tests.log`; production gateway smoke remains to recheck before source settlement.
- Product discovery delegate: <t3-thread://v2/e2ddce68-4862-4cde-bb7d-20fe060e49b8/thread:delegated-task:command%3Amcp%3A18cafb8e-e1d4-42d3-b1a1-a5e64a2fa69a%3Adelegate-task%3Ab6769b83-1409-4838-ae19-07cf1e5ee1f0>. Runtime/discovery results remain pending their automatic completion notifications.
- The target/doctor lane is integrated, so [retrieval readiness](../done/2026-11-02_tasks-retrieval-trust-and-readiness.md) can now run independently on that resolver. It must preserve app/CLI target separation and strict observational diagnostics; ranking/model changes need the existing frozen evidence gates. Parent retains final footprint/integration decisions rather than waiving caps.

### Verified connections and product-discovery acceptance

- The `f1e851a` combined build/full deterministic suite passed: 1,811 passed, zero failures, one existing opt-in real-QMD skip (1,812 total, 118.8 s). Production companion gateway Chromium smoke passed all 15 checks, including real pending-draft CLI selection and conflicted-draft refusal, 36.7 s. Logs: `/tmp/jumpybrain-feedback-connections-{tests,gateway}.log`. Connections source thread was settled after these checks; its implementation task remains archived.
- Read the completed product-discovery source thread and decision record. Accepted its source-backed adopt/defer decisions, preserved the frozen inbox audit, and merged tip `36f93aa03b38b5e54107f21d3cdcf2db4b558306` with ancestry verified. Resolved documentation-only conflicts by preserving current integration progress and both archived owner links; no runtime, README or release-note change. Product discovery is complete and [archived](../done/2026-11-02_tasks-feedback-product-discovery.md); source-thread settlement succeeded.
- Runtime hygiene tip `a9c224716f1cd092be7d81bd32d5e0a6a4583046` has been delivered and read. Parent is reviewing executable pinning/retirement and integration refresh before merging; actual agent-shell launch reproduction remains with its active source task. A separate focused read-only review will assess cleanup/lifetime races and bootstrap/distribution closure. No runtime-retention change has been installed or run on personal update directories.
- Retrieval delegate: <t3-thread://v2/e2ddce68-4862-4cde-bb7d-20fe060e49b8/thread:delegated-task:command%3Amcp%3A18cafb8e-e1d4-42d3-b1a1-a5e64a2fa69a%3Adelegate-task%3A84b49e97-f0ce-4d3e-82e0-fffd0f8afc24>. Its completion will resume this thread; do not poll it.

### Runtime safety review and corrections

- Review source: <t3-thread://v2/e2ddce68-4862-4cde-bb7d-20fe060e49b8/thread:delegated-task:command%3Amcp%3A18cafb8e-e1d4-42d3-b1a1-a5e64a2fa69a%3Adelegate-task%3A5f3063ca-400c-4318-bec8-0d912701de7a>. Read its completed findings and inspected both causal reproductions. Parent fixed the two lifetime gaps before committing the runtime merge: generation-bound startup/pinning and conservative legacy pair-backup retirement. Product vision stays packaged, and new resources are required by the package guard. No new delegate was started for these fixes.
- Parent race regressions and focused backend/runtime/help/guidance/lint gate passed 26/26; companion Python update gate passed 66/66. The original cleanup assertion was updated to verify preserved legacy content, while eligible-dead removal and live-pin retention are explicitly tested. Remaining agent-shell launch evidence is unchanged; runtime source task/thread retain that ownership.
- Fixed package caps pass after whitespace-only CLI/backend artifact compaction: 1,439,300 archive / 4,567,074 unpacked / 3,067,363 runtime bytes; 632 files. Product/install/operator guides and legal notices remain packaged; readable source/API declarations and runtime semantics remain unchanged. No budget/helper assertion relaxation.
- Retrieval result `e0f34c6207193038ab467d63fce1775a449e4bf9` has now been delivered and read: observational doctor probe plus score/date investigation, no ranking adoption. Its import-recency evaluation remains explicitly active. Review/integrate this last lane, then run full combined/changed-flow checks before finalizing integration.

## Final outcome and verification — 2026-11-02

All eight accepted source tips are ancestors of local `master` (verified with `git merge-base --is-ancestor` for each): editor `0628903`, CLI help `b79f1e6`, hosted `86c937b`, guidance/lint `3065cb7`, connections `081b2fc`, discovery `36f93aa`, runtime hygiene `a9c2247`, retrieval diagnostics `e0f34c6`. Runtime merge with review corrections is `7a7fd2b`; retrieval merge is `268a196`; final runtime-generation/hosted-check correction is `23de66e`. No push, release, installation or real hosted deployment was performed.

Retained behavior: side-effect-free CLI help/strict flags; revisioned local app connection control with save barriers and independent CLI targets; concise topic guidance and observational lint; explicit read-only lexical doctor probe; owned-runtime pinning/retention and guarded integration refresh; non-root locked hosted packaging and operational guidance. Discovery adopts existing explicit operations and defers larger proposals. Default retrieval ranking and imported canonical dates remain unchanged.

Tested code snapshot: `23de66e6f47c75bbff5cf5d174ff0c22e626ee83`; later changes finalize task records, references and the documented ranking deferral only.

- Build passed; shared editor 219,949 gzip bytes and 15 package notices, optional extension renderer 5,669 gzip bytes, within original gates. No dependency/version/lockfile or budget changes.
- Final quiet full suite with `JUMPYBRAIN_TEST_QMD_BIN=/opt/homebrew/bin/qmd node --test`: **1,828 passed, zero failures/skips**, 102.0 s. Log: `/tmp/jumpybrain-feedback-final-quiet-tests.log`. A preceding full run also passed all 1,828 before the final frozen-runtime ordering check.
- One concurrent final run reported the existing `server close drains disconnected handlers through owned-child cleanup` PID assertion (1,827 passed/one failed). The unchanged focused execution suite passed 15/15 and the final full quiet run passed. No assertion/deadline was relaxed and no cleanup-product change or proven root cause is claimed for this observation. Log: `/tmp/jumpybrain-feedback-final-verified-tests.log`.
- Parent safety gates passed: 26 focused runtime/backend/help/guidance/lint checks, 66 companion Python transaction/update tests, four Python retention tests, and the final 21 runtime/backend/package recheck. New regressions prove rejection of pre-pin generation replacement, exchange/rollback pin publication and a frozen replacement; legacy pair updates preserve live/unknown backups and retire eligible dead ones.
- Production gateway Chromium smoke passed **15/15**, including real CLI pending-draft save and conflicted-draft refusal. Stale-note smoke passed **20 lifecycle/input cases** plus overlapping-write draft retention, exact source intervals/bytes, reload and Undo/Redo. Logs: `/tmp/jumpybrain-feedback-final-browser.log`. Chromium fixtures do not establish packaged Electron/physical IME behavior.
- Final hosted smoke passed on Linux ARM64, Node 22.23.4/QMD 2.8.3: authenticated lexical retrieval, reader denial, issued-key/cookie/bootstrap revocation, graceful replacement, exact persistence and stopped-root loss/restore. Input SHA-256 `ed779612c81796bd3fa7516c37b7fa71fc96014fd441df8d1d163642a270e6ca`; temporary image `sha256:dd6ae9cbec19b9e18f0894807758b9bb4131f6436418776e9707b84b0732787f`, removed with other disposable resources. Log: `/tmp/jumpybrain-feedback-final-verified-hosted.log`. An earlier run observed stale readiness following explicit indexing; the fixture now waits at most ten seconds for completed fresh publication and still fails if freshness does not settle. No readiness/product classification was weakened; the exact earlier scheduling cause was not established.
- Real npm tarball verified all **291 required resources**, forbidden contents and public feedback configuration. SHA-256 `9f84b6f29a7135c1ca7cebb515dbc32d857c24b3a1fd2ebf7901d18b51140689`; **1,440,591 archive / 4,571,507 unpacked / 3,069,197 runtime bytes; 632 files**, all original ceilings pass. Artifact/proof retained at `/var/folders/wg/nj9x33kx7q984kv_sb31z5hr0000gn/T/jumpybrain-feedback-package-aZzB9A/`; not published or installed.
- Task/current-document references were checked; the template `mem_<uuid>` link and an unchanged historical changelog link to absent `tasks-page-reference-manual-qa.md` are excluded from the new-reference gate. No unrelated historical entry was rewritten. Final whitespace/staged guards and reference checks accompany the containing finalization commit.

## Source disposition and remaining limits

Completed source threads for CLI help, guidance/lint, connections, discovery and retrieval diagnostics were read and settled after integration; the completed safety-review thread was also settled after its findings were fixed. Retrieval's import-aware ranking candidate is explicitly deferred to the active workspace evaluation with paired temporal, fresh quality, provenance/qualification, full-interaction-cost and operational adoption gates; no ranking improvement is claimed.

Three integrated source tasks/threads remain active because they own actual unfinished work:

- [Idle-note editing](../todo/tasks-stale-note-editing.md): the actual failed selection/idle lifecycle and matching packaged-Mac reproduction remain unavailable; current-source coverage passing does not prove the user report fixed.
- [Hosted operations](../todo/tasks-hosted-build-and-operations.md): documented systemd sandbox, boot/restart and resource enforcement still need a real disposable systemd manager. ARM64 lexical container/proxy evidence does not establish AMD64, semantic models or a real deployment.
- [Runtime hygiene](../todo/tasks-desktop-runtime-hygiene.md): the reported agent-shell launch failure remains unreproduced. Legacy/unproven staging and customized/untracked integrations remain conservatively preserved; no cleanup of the user's existing gigabytes is claimed.

These follow-ups retain canonical active owners and do not leave a pending merge or required integration check. Aggregate notes remain in `tasks/todo/release-next.md` for a separately requested release. This integration list is complete and archived; the integration thread can settle after its final commit.
