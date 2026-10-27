# Mac updates within 30 seconds

Status: planned follow-up. Do not start these experiments until the user asks to continue. Work in small increments; completing the whole list in one session is not required.

## Goal

Bring post-download update application to roughly 30 seconds for both unchanged-helper updates and updates requiring a new native helper. Preserve CLI-only installations, saved drafts, exact component versions and recoverable replacement.

## Tested findings

Implementation: `06dd8ed`. Full evidence: [completed update-speed work](../done/2026-10-27_tasks-desktop-update-speed.md). Environment: macOS 15.7.7, arm64, Node 26.7.0. Installed tests used disposable homes and synthetic releases; no public release or personal installation was changed.

| Path | Post-download preparation | Handoff to verified success | Combined application |
| --- | ---: | ---: | ---: |
| Final unchanged-helper update | 17.530 s | 3.458 s | **20.988 s** |
| Missing native reuse record / fresh helper build | 49.281 s | 3.673 s | **52.954 s** |

- The original build phase alone took 66.616 s. Verified native reuse and removing desktop SDK/toolchain scans brought successful unchanged-helper runs to approximately 18–21 s.
- The remaining gap is the fresh-build path: about **23 s must be removed** from the measured 53 s to reach 30 s. Its build phase took 47.110 s, versus 15.127 s in the final reuse run. That roughly 32 s difference suggests native compilation is the largest opportunity; it is not an isolated compiler measurement.
- Dependency installation took about 2 s, extraction less than 0.3 s, and publication about 0.3 s. These are lower-priority targets. Keep the save barrier, signature checks and authenticated relaunch unless evidence identifies redundant work.
- Electron download/cache handling, unpacking, native compilation, copying and signing are currently combined inside the build phase. Do not attribute all of that time to Swift or claim download-free measurements for those substeps.
- The combined figures exclude the selected release asset download and waiting at Ready, including intentional failed-save test waits. Dependency/Electron acquisition inside preparation remains included. The restart span starts at acknowledged handoff, not the user's first click.
- Explicitly excluding development dependencies instead of normal packager pruning showed no additional installed speed gain and was reverted. Empty npm scope directories and a lockfile are not bundled development packages; avoid repeating that failed test assumption.
- Tests passed: 1,392 deterministic tests with one unconfigured real-QMD integration skip; installed success and forced rebuild; real relaunch-failure rollback; exact v0.3.7 worker compatibility; CLI distribution validation and fresh CLI extension compilation. Nine protected files, extension state/preferences and component versions were checked in the final success fixture.
- Intel hardware, a live public-release upgrade and arbitrary historical Keychain identities remain untested. Single-machine runs are not population latency guarantees.

## Incremental tasks

- [ ] 1. Measure the remaining build work before choosing an implementation.
  - Add narrow timings for Electron acquisition/verification/unpacking, native compilation, runtime/compiler copying, signing/verification and final bundle copying. Keep them private and bounded.
  - Run three matched unchanged-helper and fresh-helper trials, recording cache state, machine, source/artifact and median/range. Separate network acquisition from local application work without hiding acquisition from the existing total.
  - Preserve each trial's result directory instead of overwriting the previous one. Run builds sequentially with checks that consume `dist`; concurrent fixture runs must not rebuild shared output.
  - Record the dominant measured cost and choose just the next experiment. This measurement/report is a useful stopping point.

- [ ] 2. Prototype release-built native helpers if compilation remains the dominant cost.
  - Prefer a prototype that places optional architecture-specific helper artifacts in the existing verified release package, so the CLI distribution remains independently usable. Compare this with a universal helper only if the build/distribution tradeoff warrants it.
  - Bind an artifact to the actual native source, build recipe and architecture. Validate the selected release bytes and native executable; refresh device configuration and sign/verify the staged bundle before publication.
  - Keep a clear source-build fallback for absent/incompatible artifacts and developer installs. A normal supported update should not need Swift compilation; CLI-only users must not need Electron or Mac build tools.
  - Check existing-worker compatibility: the currently installed worker controls prerequisite checks and dependency preparation. An incoming installer alone cannot remove an old worker's unconditional Swift-tool check. Document any one-update migration limit rather than promising it away.
  - Measure a downloaded update with changed native source and no local compiler/module cache. Keep the prototype only if it demonstrates a material improvement without moving unbounded work into restart.
  - Record the result and distribution/release implications before broadening the implementation. Do not publish or install into the user's Applications folder as part of this experiment.

- [ ] 3. Try compiler-cache reuse as a smaller alternative only if release-built artifacts are deferred.
  - Measure whether preserving a private, rebuildable Swift module cache materially reduces changed-source builds. Separate initial-cache and reused-cache results.
  - Scope reuse to the compiler/SDK/architecture/options; validate ownership, discard invalid caches and retain a clean-build fallback. Do not restore full SDK tree hashing to the update path.
  - State the limit explicitly: a cache populated on this Mac cannot by itself guarantee a fast first migration or first build. Do not implement this in addition to release-built artifacts without a measured need.

- [ ] 4. Optimize remaining packaging work only if the measured path still exceeds 30 s.
  - Investigate redundant Electron acquisition/unpacking, dependency installation and bundle copies in measured order. Consider validated cached archives or installed components only when version, integrity and ownership can be established.
  - Compare each experiment against the unchanged baseline; revert changes without a demonstrated benefit. Avoid a new updater framework, extra services or separate CLI lifecycle solely for this target.
  - Retain staged readiness, safe shutdown, version agreement and rollback. Remove or relocate a check only after demonstrating what equivalent validation covers its failure mode.

- [ ] 5. Validate and close the implemented increment.
  - Run the production installed success path for both unchanged and changed/missing native helpers. Confirm approximately 30 s post-download application with repeated measurements and report any path that still exceeds it.
  - Test the failure mode changed by the implementation: invalid/mismatched artifact or cache must fail safely or rebuild; relaunch failure must restore the previous components. Reuse unchanged coverage instead of automatically running every updater mode.
  - Verify paired app/CLI version agreement, app-only policy preservation, standalone CLI packaging/execution and lazy extension compilation. Preserve canonical Markdown, targets, login preference and extension state; readiness probes must not activate extensions in the current worker.
  - If distribution changes, validate the actual packed package and release workflow, including supported architecture selection and compatibility with a representative published worker. Keep fixture results separate from live-release evidence.
  - Update owning docs and pending release notes for retained changes; record tested source/artifact, timings, failures and limits. Finalize/archive/commit the completed list following [task completion](../../docs/task-workflow.md), or leave remaining work explicitly active when stopping between increments.

## Files and coordination

- `integrations/electron/{update-worker,install}.mjs`, `desktop-install.py` — preparation, packaging and native-helper selection.
- `integrations/macos-companion/install.py` — native compilation and artifact reuse policy.
- `scripts/desktop-update-smoke.mjs`, `integrations/electron/test_desktop_install.py`, `integrations/macos-companion/test_update.py` — installed measurements and focused regressions.
- `scripts/{release,pack-local,local-pack-manifest}.mjs`, `docs/{releases,release-testing}.md` — distribution/release changes if needed.
- [Mac installation clarity](tasks-mac-installation-clarity.md) and [portable installation](tasks-portable-installation-project-integration.md) — coordinate supported commands, prerequisite claims and CLI/app ownership.

Planning alone does not add a changelog highlight or release note. No implementation, release or installation is authorized by this deferred list; continue when requested.
