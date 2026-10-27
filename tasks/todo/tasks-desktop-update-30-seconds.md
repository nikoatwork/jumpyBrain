# Mac updates within 30 seconds

Status: active. Measurement increment completed 2026-10-27; next is task 2, a release-built native-helper prototype. Work in small increments; completing the whole list in one session is not required.

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

- [x] 1. Measure the remaining build work before choosing an implementation.
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
- [Mac installation clarity](../done/2026-10-27_tasks-mac-installation-clarity.md) and [portable installation](tasks-portable-installation-project-integration.md) — coordinate supported commands, prerequisite claims and CLI/app ownership.

## Measurement increment — 2026-10-27

- Added fixed build-stage timing records to the existing private bounded worker log. Network transfers are nested inside Electron acquisition/verification; native work is nested inside desktop preparation. Parent and child spans must not be added together. Electron unpack/setup includes initial packager metadata and temporary-directory work.
- Added unique private trial directories, retained source tarballs/digests and machine/cache/baseline metadata. `--package <immutable npm tarball>` holds incoming distribution bytes fixed across trials. An isolated fixture runner with frozen `dist` and app baseline at `.local-pack/update-measurement-gxr_kckh/` keeps the remaining trials independent of concurrent UI work in the shared checkout; all trial builds run sequentially.
- Machine: Mac15,6, arm64, 11 logical CPUs, 18 GiB RAM, macOS 15.7.7, Node 26.7.0. Each trial starts with a fresh disposable HOME and empty npm/Electron caches. Fresh-helper builds use a new private Swift module-cache directory; system disk/page caches and other machine activity are not controlled.
- Tested source: base commit `ff3ee70412ef71a7947480079b0aa9f24c687700` plus this increment's build changes and concurrent UI changes captured in the immutable npm package. Package SHA-256: `34b5d4cf09271360fdeb17762f94b8461e878ffe671166507b193eb7d0b079aa`. All five changed distribution/build files were compared byte-for-byte against the retained package. Harness and documentation edits made after packing do not change those build inputs.
- Baseline: rebuilt local package only, native artifact fingerprint `b7e7219117e167e72be44fdd2041e1b37ab342519246e9eee2c84239434ee39e`; signed helper SHA-256 `9f78767d3a227fdc247d0bdb2efb0f58a42d604e6ccbb056ac6bca934e6495cc`. The first pair used the shared runner before isolation; subsequent pairs use the frozen runner/runtime and copied baseline. Every pair uses the same incoming package and baseline helper bytes.
- Migration limit: timing instrumentation changes the fingerprinted native build recipe. Shipping this increment alone triggers one rebuild from earlier recipes; matched unchanged-helper results describe a baseline already built with this recipe. No artifact fingerprint or validation rule was relaxed to hide that cost.

All six installed trials passed, in order U1/F1/U2/F2/U3/F3. Times below are seconds. Preparation starts after the selected release asset download; combined application adds acknowledged handoff through verified success. Ready/save-test waits are excluded. Electron and npm acquisition inside preparation remain included.

| Trial | Preparation | Handoff | Combined | Electron transfers | Swift compilation | Retained directory under `.local-pack/update-smoke/` |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| U1, unchanged | 20.669 | 3.732 | 24.401 | 12.610 | none | `success/2026-10-27T17-29-56.686Z-6TnpJ4/` |
| F1, fresh | 50.450 | 3.452 | 53.902 | 9.992 | 34.983 | `cold-native/2026-10-27T17-31-03.372Z-203QIW/` |
| U2, unchanged | 15.014 | 3.448 | 18.462 | 10.240 | none | `success/2026-10-27T17-32-30.299Z-qroJpf/` |
| F2, fresh | 49.812 | 3.365 | 53.177 | 10.558 | 34.011 | `cold-native/2026-10-27T17-33-16.174Z-lKjBOB/` |
| U3, unchanged | 16.487 | 3.379 | 19.866 | 11.916 | none | `success/2026-10-27T17-34-37.200Z-6BwywD/` |
| F3, fresh | 49.440 | 3.381 | 52.821 | 10.046 | 34.187 | `cold-native/2026-10-27T17-35-25.263Z-RFD3VX/` |

| Measured stage | Unchanged: median (range), s | Fresh: median (range), s |
| --- | ---: | ---: |
| Combined application | 19.866 (18.462–24.401) | 53.177 (52.821–53.902) |
| Post-download preparation | 16.487 (15.014–20.669) | 49.812 (49.440–50.450) |
| Handoff to verified success | 3.448 (3.379–3.732) | 3.381 (3.365–3.452) |
| Dependency installation | 1.766 (1.693–1.836) | 1.842 (1.797–1.856) |
| Electron acquisition/verification, including transfers | 12.044 (10.376–12.751) | 10.178 (10.120–10.689) |
| Electron archive/checksum transfers | 11.916 (10.240–12.610) | 10.046 (9.992–10.558) |
| Electron unpack/setup | 0.626 (0.618–0.930) | 0.625 (0.614–0.653) |
| Native compilation | none | 34.187 (34.011–34.983) |
| Runtime copying | 0.092 (0.090–0.124) | 0.095 (0.091–0.097) |
| Extension compiler copying | 0.006 (0.006–0.008) | 0.006 (0.006–0.006) |
| Desktop signing | 0.328 (0.322–1.222) | 0.758 (0.757–0.812) |
| Desktop signature verification | 0.193 (0.181–0.514) | 0.220 (0.210–0.237) |
| Final bundle copying | 0.335 (0.325–0.536) | 0.319 (0.302–0.345) |
| Application less timed Electron transfers | 8.222 (7.950–11.791) | 42.775 (42.619–43.910) |

The last row is diagnostic subtraction, not a download-free measurement: npm acquisition remains included, downloader spans include writing received bytes, and no network-free trial was run. Individual stage medians need not add to the median total. Each trial retains `source.tgz`, `trial.json` (including the per-trial synthetic release digest), `build-timings.json`, `timings.json`, `performance.json`, `result.json` and the raw bounded log. Aggregate machine-readable evidence: `.local-pack/update-measurement-gxr_kckh/summary.json`. These ignored local artifacts are preserved; the tables and package digest above are the committed evidence summary.

**Decision:** compilation is the dominant remaining fresh-helper cost and exceeds 30 seconds by itself. Proceed next with task 2's optional architecture-specific release-built helper in the existing verified package, keeping standalone CLI use, source-build fallback and staged signing/verification. Preserve the old worker's prerequisite/migration limit explicitly. Do not implement compiler-cache reuse or optimize subsecond copies/signing in this increment. Even subtracting all measured Electron transfers leaves the fresh path above target, so archive caching alone cannot solve it.

**Verification:** `npm run build` and `npm run desktop:pack` passed. Direct Python suites passed (9 desktop installer tests; 52 native update tests). Targeted Node run passed 77 tests across `desktop-updater`, `desktop-lifecycle`, `desktop-startup-recovery`, `macos-companion-update`, `local-pack-scripts` and `local-pack-properties` (some Python coverage overlaps). The actual retained npm package passed the 231-file distribution manifest with zero stale paths. All six GUI update trials verified exact app/runtime/CLI versions, nine protected files, extension state, profile preferences, two normal extension activations with readiness probes suppressed, and fresh installed-CLI TS extension compilation. Syntax and diff whitespace checks passed.

**Limits and stopping point:** task 1 is complete; tasks 2–5 remain active. No speed optimization, release-built artifact, compiler cache, release, push or personal installation was performed. Changed Swift-source updates, artifact/cache rejection, new rollback modes, an exact v0.3.7 worker rerun, Intel hardware and live public-release upgrades were not tested in this increment. Existing replacement/rollback/app-only/historical-worker coverage is recorded in the preceding completed task; it does not establish the later prototype's distribution/migration behavior. The full deterministic suite was not rerun for this diagnostic increment. Do not archive this list until the remaining implementation and its required validation are complete.

Planning alone does not add a changelog highlight or release note. The user authorized continuation on 2026-10-27. Builds and installed experiments use disposable fixtures; publication and installation into the user's Applications folder remain outside this task.
