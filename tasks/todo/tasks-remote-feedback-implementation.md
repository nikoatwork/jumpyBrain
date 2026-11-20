# Remote feedback implementation

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
- [ ] 2. Implement and verify server-role permissions and Settings access presentation.
- [ ] 3. Implement and verify remote-only installation/reporting and explicit read-only command mode.
- [ ] 4. Implement and verify zero-hit lexical guidance across supported outputs.
- [ ] 5. Implement and verify the combined access diagnostic after the permission contract lands.
- [ ] 6. Integrate scoped branches, verify shared boundaries and obtain independent permission review; resolve findings.
- [ ] 7. Update feedback outcomes, pending release notes and changelog; archive completed lists, commit, merge into master, settle source threads and remove owned worktrees/branches.

## Relevant files

- `tasks/feedback.md`, `tasks/todo/tasks-feedback-follow-ups.md` — exact email ownership and outcomes.
- `integrations/macos-companion/`, `src/adapters/access-control/`, `src/adapters/http-server/`, `src/adapters/live/` — permissions and Settings behavior.
- `src/cli/`, `src/adapters/http-client/` — combined access diagnosis and command restrictions.
- `install.sh`, `scripts/public-install.mjs`, installer helpers and installation docs — remote-only behavior/reporting.
- Retrieval app/core/adapter packet and presentation seams — zero-hit guidance without semantic changes.

## Verification and limits

Follow `docs/testing.md`: focused behavioral tests, built-output checks after a build, Chromium for shared UI and permission scenarios. Use disposable roots, credentials and isolated homes. Record each child snapshot and exact selected commands in its own task archive; record integration checks and review here before completion. Actual installed app upgrades and release distribution remain outside this request.
