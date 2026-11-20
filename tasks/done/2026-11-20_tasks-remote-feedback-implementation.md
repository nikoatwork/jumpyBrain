# Remote feedback implementation

Completed 2026-11-20. Integrated into local `master` at `2df83fa8`; all five implementation tips are verified ancestors. Seven clean implementation/review worktrees and eight owned branches were removed, and all seven child threads settled. No push, release, installation or real shared-memory writes were performed.

## Goal

Implement the three November 19–20 feedback reports after the owner's nine product answers, verify the integrated result, merge into `master` and remove task worktrees. No release, push, installation or real shared-brain writes are requested.

## Decisions

- Effective access details belong in Settings. Blocked actions remain visible with an explanation and Settings action.
- Add one CLI access diagnostic covering the selected app profile, credential resolution, server role and effective access; never output secrets.
- Server roles alone determine remote permissions. Remove the remote client `allowWrites` restriction, including existing restrictions. Reader access blocks all mutations, including key management; the separate answer about read-only mode applies to server-reader access because the owner explicitly removed device-level mode.
- Expose named capabilities for reader/writer/admin. Do not add custom-role configuration.
- Retain the existing package. Improve remote-only footprint, filesystem side-effect/dry-run reporting and an explicit read-only command mode. Do not create a standalone binary or second package.
- CLI remains the supported agent interface; HTTP is an internal protocol.
- Empty lexical results receive concise fewer-keywords guidance. Do not broaden queries, retry or change ranking/search semantics.
- Use Fable 5.2 implementation subagents in isolated worktrees. Permissions and diagnostics share a contract; installer and retrieval guidance can proceed independently. Parent owns aggregate feedback/release/changelog records and integration. Permission changes require independent review under the jumpy-loop skill.

## Tasks

- [x] 1. Investigate current behavior and collect three product answers per feedback.
  - Proof: current gateway/browser/access/installer/query sources inspected; owner answered all nine questions in this thread. Existing Settings key management and current remote-only integration skipping must be reused.
- [x] 2. Implement and verify server-role permissions and Settings access presentation.
  - Integrated `dc500396`; [task evidence](2026-11-20_tasks-server-role-access.md). Server-role/capability enforcement, legacy flag removal and Settings presentation passed 584 focused tests (two skipped), package footprint and six-scenario Chromium permission smoke plus six related Chromium scenarios. Native connection parser test passed. Secondary blocked-action explanations remain with a separate follow-up worktree before this parent task is complete.
  - Migration decision: remove the dead flag on deliberate saves; reads preserve the original bytes. Older builds cannot open a newly saved profile file and fail closed; this follows the explicitly chosen removal rather than retaining a compatibility permission field. Initial bundle gate increased 500 gzip bytes for a measured 492-byte change; follow-up should reduce shared duplication before any further increase.
  - Follow-up `c39beccb` completed secondary folder/board/attention/formatting/drawing/map controls with one shared guard. [Evidence](2026-11-20_tasks-blocked-action-explanations.md): 12-stage Chromium reader/writer/admin and role-loss smoke passed, 14 related smokes passed. It verified remote-boards-compatibility, drawings and contextual-attribution fail at the same assertions on `94b77fc5`, `029b414c` and the changed snapshot; those baseline failures leave later assertions unexercised. Native Electron remains untested.
  - Parent removed the remaining reader role label from the note status (clean reader notes show Saved; dirty drafts retain their state), keeping permission details in Settings. Updated the stale gateway smoke's removed-checkbox interactions to use a real reader key and visible blocked actions.
- [x] 3. Implement and verify remote-only installation/reporting and explicit read-only command mode.
  - Proof: integrated `54abc03b`; [task evidence](2026-11-20_tasks-headless-remote-install.md). 275 focused tests passed; final six-file rerun passed 64 tests. Disposable-home installation uses no npm/QMD/git, preserves `.claude`, reads from an in-process server with a reader key, and blocks 34 mutation invocations before network. Dry-run trees unchanged.
  - Integration decisions: self-update remains blocked in read-only command mode (installer rerun is the operator path); explicit feedback remains available because it changes no memory; unreadable policy fails closed for mutations. Keep the existing package sources for updater/uninstaller compatibility. This advisory command restriction does not replace reader keys and local retrieval can still repair derived state unless strict `--read-only` retrieval is requested. Private Node download, Linux/Intel and installed Mac update flows are untested.
- [x] 4. Implement and verify zero-hit lexical guidance across supported outputs.
  - Proof: integrated `60100ed0`; [task evidence](2026-11-20_tasks-zero-hit-guidance.md). Nine targeted cases plus 202 related tests passed in the isolated child snapshot. Existing warning-list code carries the hint through rich/compact local/hosted responses; compact budget behavior is preserved. No query or ranking changes. Tests use fake QMD, and browser/Mac search currently ignores this additive code; the reported headless CLI flow shows it. Integration checks remain in task 6.
- [x] 5. Implement and verify the combined access diagnostic after the permission contract lands.
  - Proof: integrated `cf2b8854`; [task evidence](2026-11-20_tasks-access-diagnostic.md). `access whoami [--root|--target-url] [--directory] [--json]` separately reports CLI/app selections, key resolution, confirmed server capabilities, local command/origin policy and effective capability blockers. Eight focused tests and 92 combined tests passed, including real disposable keys/gateway, malformed/legacy capabilities, missing/insecure keys with zero outbound requests and read-only/invalid policy operation. App-closed diagnosis reads no offline profile files and starts no backend. Packaged Mac, TLS/proxy and installed CLI diagnosis remain untested.
  - Integration follow-ups: update stale setup instructions and measure the final npm manifest before adjusting its file-count budget. The search policy and diagnostic each add one compiled module/declaration pair; the original file ceiling is now exceeded, so package verification is not complete yet.
- [x] 6. Integrate scoped branches, verify shared boundaries and obtain independent permission review; resolve findings.
- [x] 7. Update feedback outcomes, pending release notes and changelog; archive completed lists, commit, merge into master, settle source threads and remove owned worktrees/branches.
  - Proof: source fast-forwarded into master at `2df83fa8`; ancestry verified for all five task tips and both integration-fix commits. All seven child threads settled through T3; each owned worktree was checked clean and integrated before removal, and all eight owned branches removed. Final archive/records are committed on master; pending notes remain unshipped.

## Relevant files

- `tasks/feedback.md`, `tasks/todo/tasks-feedback-follow-ups.md` — exact email ownership and outcomes.
- `integrations/macos-companion/`, `src/adapters/access-control/`, `src/adapters/http-server/`, `src/adapters/live/` — permissions and Settings behavior.
- `src/cli/`, `src/adapters/http-client/` — combined access diagnosis and command restrictions.
- `install.sh`, `scripts/public-install.mjs`, installer helpers and installation docs — remote-only behavior/reporting.
- Retrieval app/core/adapter packet and presentation seams — zero-hit guidance without semantic changes.

## Verification and limits

Follow `docs/testing.md`: focused behavioral tests, built-output checks after a build, Chromium for shared UI and permission scenarios. Use disposable roots, credentials and isolated homes. Record each child snapshot and exact selected commands in its own task archive; record integration checks and review here before completion. Actual installed app upgrades and release distribution remain outside this request.

- Integration snapshot `d0563c59` (search guidance plus headless installer): `npm run build` passed; `node --test test/zero-hit-guidance.test.js test/read-only-command-mode.test.js test/installer-remote-only.test.js` passed 21/21. This verifies the installer consumer and command guard together with the additive retrieval hint. No permission changes were present yet.
- Integration snapshot `324ead10` (all initial branches; only task-doc edits after its build): `npm run build` passed, editor gzip 186,352 bytes. `node --test test/access-keys.test.js test/macos-companion-gateway.test.js test/companion-live-gateway.test.js test/cli-connections.test.js test/read-only-command-mode.test.js test/installer-remote-only.test.js test/zero-hit-guidance.test.js test/architecture-boundaries.test.js test/lexical-bundle.test.js` passed 107/107, no skips. This covers role enforcement over HTTP/live, legacy-profile migration, command-mode early refusal, installed remote-only reads, hint serialization and architecture/bundle guards together. Access diagnostic and secondary UI work remain outside this snapshot.
- Access-diagnostic integration plus updated setup instructions: `npm run build` passed; `node --test test/access-whoami.test.js test/instructions-topics.test.js test/cli-help-validation.test.js test/read-only-command-mode.test.js test/remote-access-policy.test.js` passed 28/28, no skips. The emitted setup topic now points to `access whoami`, uses effective-access terminology and keeps HTTP internal. File-count gate remains open pending final measurement.
- Final combined candidate: `npm run build` passed (editor gzip 186,365 B). A 13-file selection (`access-whoami`, `browser-access`, `access-keys`, `macos-companion-gateway`, `companion-live-gateway`, `read-only-command-mode`, `installer-remote-only`, `zero-hit-guidance`, `architecture-boundaries`, `package-footprint`, `lexical-bundle`, `notes-browser`, `instructions-topics`) passed 197/198; sole failure was the separately frozen package-budget assertion. After updating that reviewed assertion and correcting clean-reader status feedback, `node --test test/package-footprint.test.js test/notes-browser.test.js` passed 82/82. Packed candidate measured 784 files (two new module/declaration pairs); file ceiling raised 780→788 with all three byte ceilings unchanged and measured rationale in `docs/build-footprint.md`.
- Parent Chromium: `blocked-action-explanations-smoke.mjs` passed all 12 stages on combined sources. After the status-label correction, `ux-readonly-affordances-smoke.mjs` passed desktop/narrow reader, writer/reconnect and revoked-writer recovery scenarios. First run exposed Saving… on clean readers; corrected and rerun passed.
- Updated `companion-gateway-smoke.mjs` passed its first four setup/write/switch checks, then failed an unchanged overlapping-edit expectation at line 262 (expected review, actual clean Saved). Its later updated reader-key sections remain unexercised by that legacy runner; dedicated role-access/blocked-action scenarios cover those semantics. This runner failure is retained as a validation limit, not called a pass or proven pre-existing.

## Independent review

- Round 1 reviewed `7946aa37` against task-scoped base `8f0f2d61`, 110 files (+5,111/−543); result CHANGES. Reviewer independently passed 120 focused tests and loaded remote command families from a dependency-free package.
- R1 (should, fixed): fresh local `--read-only-commands` installation blocked its own init/index after persisting policy; process-only environment mode had the same bug. Installer now isolates the two explicit provisioning children from command policy, without changing the installed policy or caller environment. A real-package regression first failed at the actual guard, then passed flag and environment cases, full init/index/recall verification, interrupted-install retry with preserved policy and later user-command refusal.
- R2 (nit, fixed): clarify that deliberate key replacement allocates a reference, but a manually edited referenced variable can keep the advisory cached role up to 30 seconds. Server authorization remains fresh. No cache mechanism added.
- R3 (nit, fixed): preserved malformed/unsupported policy reports `commandMode: invalid` instead of read-write; a dry-run regression verifies the policy bytes remain unchanged.
- Fix verification: `node --test test/installer-remote-only.test.js test/installer-recovery.test.js test/read-only-command-mode.test.js test/package-footprint.test.js` passed 25/25. Compiled sources unchanged since the last successful build; installer/gateway are directly executed `.mjs`. All R1–R3 findings fixed; round 2 approved `2df83fa8` with none open. Fix delta before ledger: four files, +64/−7.

- Round 2 approved the current source, independently rebuilt it and passed the same 25 tests plus negative-control and edge probes (corrupt preserved policy, invalid environment mode, external policy, relative installation path with spaces). All R1–R3 resolved. No production code changed after approval. Optional N1 test-assertion wording was left unchanged: the flag leg verifies persisted policy bytes, and process-only mode intentionally has no file; both legs already prove installed command refusal. N2 noted the provisioned backend inherits the isolated environment but no backend module reads CLI policy variables; no present behavior change needed.
- Review size: initial 110 files +5,111/−543, approved source 110 files +5,178/−545 (includes task evidence and tests). Ledger/feedback/release bookkeeping after approval is documentation only.

## Remaining limits

- No published release, production installation, real shared brain or full suite; no native Electron upgrade, Linux/Intel or private Node download-path evidence. Local init/index regression uses real compiled CLI and the existing fake-QMD SDK.
- Three legacy Chromium runners have verified baseline failures; the legacy companion-gateway runner stops at its unchanged overlap assertion. Required role/action scenarios pass in dedicated Chromium smokes; later legacy assertions remain unexercised.
- Role-cache refresh after manual edits to a referenced key variable can lag up to 30 seconds, with server enforcement on every request. Older app builds cannot open newly saved flag-free profile files. CLI read-only command mode is an advisory guard; reader keys enforce server access.
- Deliberate product exclusions: no standalone client, stable public HTTP contract, custom roles or automatic broader-query fallback.
