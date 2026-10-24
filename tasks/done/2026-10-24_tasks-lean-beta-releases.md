# Lean beta releases

## Disposition — 2026-10-24

Superseded as an active task list at the user's request: recurring release guidance belongs in the release documentation. [Lean beta release guidance](../../docs/lean-beta-releases.md) now owns that guidance and is linked from the release process and agent instructions.

The original unchecked proposals below are retained as history, not completed implementation or gates to repeat before each release. Release scripts and existing required checks are unchanged. Outstanding automation improvements and the unmeasured reduction target are recorded in the standing document.

Verification: reviewed release/pack scripts and testing instructions; checked changed Markdown links, stale references and whitespace. This was a documentation reorganization; no product tests, timing benchmark or publication were run. Unrelated task files were preserved.

## Original goal

Cut routine release verification time and operator effort by roughly 80% for the current beta of about five users. Keep a short, repeatable ship path with enough evidence that core memory behavior works and the published package is the one tested.

## Session lessons and direction

- User direction, 2026-10-22: the current process is too intense for this stage; optimize for frequent small releases. Broader release testing belongs in [a deferred scale-up plan](../todo/tasks-release-testing-at-scale.md).
- v0.3.5 ran 21 packaging/smoke commands totaling about 768 seconds, in addition to the full test suite and publication workflow. Five installed-updater scenarios alone took about 417 seconds. These are one-machine observations, not a universal timing promise.
- The first full test suite was repeated by the release command; many smoke wrappers rebuilt the same source. Packaging also overlapped a test run once and removed files being tested. Use one build owner and reuse valid evidence for the exact source/artifact.
- Some delays were fixture drift: a reference smoke expected a removed status banner, and a conflict smoke used appends that now merge safely. Keep assertions focused on user outcomes and repair stale fixtures when behavior intentionally changes.
- Scope is workflow/tooling/docs, not dropping product safeguards or deleting useful tests. Do not build an elaborate risk-scoring framework, new testing service or release matrix to make releases leaner.

## Tasks

- [ ] 1.0 Define a small default beta gate.
  - [ ] 1.1 Use the v0.3.5 QA archive and a representative fresh run to measure total elapsed validation and operator steps, separating builds, tests, publication, retries and local installation. Establish a comparable baseline and target at least 80% less routine verification effort/time; aim for a few minutes on the current Mac.
  - [ ] 1.2 Keep one cheap deterministic suite/build, one compact core-flow smoke, and artifact/version validation as the default. Prefer existing checks: write/reopen canonical Markdown, recall/expand with provenance, and a save-conflict/draft-protection assertion. Confirm the smallest useful combination before adding anything new.
  - [ ] 1.3 Make broad browser permutations, native rebuilds, all updater crash modes, model/scale exercises and manual device checks explicit optional checks. Run a focused regression when its changed behavior or a known bug warrants it; never silently expand the default into the old full matrix.
  - [ ] 1.4 Keep stop-ship conditions short: demonstrated data loss/overwrite, false Saved/update success, broken core retrieval, or a broken/mismatched distribution. Record actual untested areas honestly without treating every untested device as a routine beta blocker.
- [ ] 2.0 Make the release command own the lean path.
  - [ ] 2.1 Build/validate the final versioned candidate once and pack the tested output. Remove duplicate mandatory test/build passes; only rerun affected checks after relevant changes. Never overlap a destructive build with tests consuming its output.
  - [ ] 2.2 Provide a simple default and an explicit thorough mode, reusing existing commands. Keep comprehensive tests callable and preserve the restore path; avoid new generated policy/configuration layers unless needed.
  - [ ] 2.3 Retain aligned manifests/lockfiles, curated notes, annotated tag, push/publication, and asset/digest verification. Keep isolated snapshots for unrelated dirty work and recover/resume an existing release without another bump. Publication and updating this Mac are distinct outcomes.
  - [ ] 2.4 Revisit the one-release-per-day convention so an explicit request to ship a worthwhile beta change does not routinely require an extra same-day approval round. Align repository agent notes and release docs with the agreed simpler policy; retain user-requested publication and explicit major-release approval.
  - [ ] 2.5 Reduce evidence/bookkeeping to one short result: snapshot, default gate outcome, any additional check and reason, known limits, release link and verified artifact. Archive notes and clear shipped pending bullets in one routine step.
- [ ] 3.0 Prove the reduction and update instructions.
  - [ ] 3.1 Exercise the lean path in a disposable/dry-run publication fixture; no new release is required to complete this task. Record elapsed time, operator actions, retained checks and deferred checks against the baseline. Do not claim an 80% reduction until measured.
  - [ ] 3.2 Verify that a failed core check blocks publication and a pushed-but-unpublished release can resume. Keep these as focused workflow checks, not a second product acceptance program.
  - [ ] 3.3 Update `docs/releases.md`, `docs/release-testing.md`, relevant agent guidance and scripts together so future agents follow the lean default. Link the deferred testing trigger and record the result here; add a selective changelog entry only for the implemented workflow change.

## Acceptance

- A normal beta release follows one concise documented command/workflow with roughly 80% less measured routine verification time/effort.
- Core behavior and the actual shipped artifact are checked; optional deeper testing remains available and its omission is clear.
- No duplicate full-suite runs, repeated same-source builds or lengthy per-release QA report are required by default.

## Relevant files

- `scripts/{release,release-policy,pack-local,local-pack-manifest,build-editor}.mjs`, `package.json` — release/build/pack ownership.
- `docs/{releases,release-testing}.md`, repository agent instructions — current broad requirements and daily convention.
- `scripts/{note-lifecycle,desktop-update,companion-gateway,page-reference}-smoke.mjs`, `test/release-policy.test.js` — candidates for retained/focused/optional checks.
- `tasks/done/releases/v0.3.5.qa.md` in the published history — measured baseline and session evidence.
