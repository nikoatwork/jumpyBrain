# Desktop update application speed

Target: apply a downloaded Mac update in about 30 seconds, preserving CLI-only support, draft saves, verified artifacts and recoverable replacement.

- [x] Measure a disposable installed update, separating download, preparation, restart and intentional user/save waits.
- [x] Remove measured repeated build work with explicit invalidation and a safe rebuild fallback.
- [x] Run installed success, changed failure/recovery coverage and CLI compatibility checks; compare timings.
- [x] Document measured results and limits, update pending notes, archive and commit scoped changes.

## Scope

Start: `fbdff4d`, clean checkout. macOS 15.7.7 arm64, Node 26.7.0. The final tested implementation is the starting base plus this task's scoped diff. Concurrent feedback-planning commit `56c8fe0` landed during this work; its planning changes are preserved and its link to this task is repaired on archival. The installed fixtures use synthetic versions 0.3.3 → 0.3.4 (historical client 0.3.7 → 0.3.8). No installation into the user's Applications folder or release was requested. Use the production updater against disposable homes and immutable local distribution fixtures.

## Implementation and experiments

- Baseline installed success: native/Electron build 66.616 s; dependencies 1.745 s; extraction/readiness/publication bring measured phases above 71 s before final relaunch. Raw evidence: `.local-pack/update-speed-baseline-timings.json` and `update-speed-baseline-worker.log`.
- First increment: installed, signed helper reuse tied to Swift bytes, native recipe and architecture; verified executable digest/signature. Desktop builds avoid full SDK/toolchain hashing, including fresh builds. Legacy standalone companion build policy remains strict.
- First valid reuse measurement: 15.168 s post-download preparation + 3.020 s acknowledged restart/verified success = 18.188 s, excluding Ready/user/test waits. Raw evidence: `.local-pack/update-speed-native-reuse-{performance,timings}.json`.
- Packaging experiment: explicitly excluding the development dependency tree and bypassing pruning produced a 2.97 s local build, but disposable installed preparation remained around 16 s. No additional installed speed gain was demonstrated, so this experiment was reverted. Standard packager pruning and the runtime/CLI lazy extension compiler remain.
- Found and corrected the existing fixture's invalid nested-helper seal after config edits. Outer `codesign --deep` does not repair helpers under Resources/native. The invalid helper correctly triggered fresh compilation; no installation failure occurred.
- A later test launch overlapped `cli:pack` deleting/rebuilding dist and failed before the installed flow. Repeated sequentially after build completion; do not interpret the generated-module race as a product update failure.

## Verification

- `npm test`: 1,392 passed, one real-QMD integration skip (its explicit test binary was not configured), zero failures.
- Focused updater/lifecycle/CLI installer suite: 67 passed.
- Native companion suite including artifact reuse/invalidation tests: 52 passed.
- Desktop installer/relocated compiler tests passed.
- `npm run cli:pack`: 231 required distribution files verified; no Electron node_modules bundled.
- Baseline and first incremental installed-success flows passed draft barriers, actual app/runtime/CLI replacement, authenticated relaunch, protected bytes, persisted extension preferences and fresh CLI extension compilation.



## Final measured paths

- Final retained implementation, complete success gate: **20.988 s** = 17.530 s post-download preparation + 3.458 s acknowledged handoff-to-verified-success. Actual worker log asserts reuse without compilation; draft save barriers, exact component versions, protected files, extension preferences and fresh CLI TypeScript extension compilation passed. Evidence: `.local-pack/update-smoke/success/{performance,timings,result}.json`, `.local-pack/update-speed-final-success.log`.

- Packaging-experiment installed success (before reverting the unproven tweak): 15.976 s preparation + 3.341 s acknowledged restart/verified success = **19.317 s**, excluding release download and the intentional Ready/save-test wait. Native build reuse was asserted from the actual worker log. Evidence: `.local-pack/update-speed-packaging-experiment-{performance,timings}.json`, `.local-pack/update-speed-lean-success.log`.
- Forced missing native artifact record: 49.281 s preparation + 3.673 s restart = **52.954 s**. Actual fresh compilation and successful app/runtime/CLI replacement were asserted. Evidence: `.local-pack/update-smoke/cold-native/{performance,timings,result}.json`, `.local-pack/update-speed-cold.log`.
- The 30 s target is met for unchanged-helper updates on this arm64 Mac. It is not met for first migrations/native-code rebuilds. Those still compile Swift locally; no prebuilt native distribution was introduced. Download time includes only the selected release asset in the excluded span; dependency/Electron preparation inside the build remains included in these conservative figures. These are individual local fixture runs, not population latency guarantees.
- Final targeted updater/lifecycle run: 34 passed. CLI package validation and fresh CLI extension compilation confirm the standalone CLI remains available.

- `node scripts/desktop-update-smoke.mjs relaunch-failure`: passed actual rollback of app/runtime/CLI, protected bytes, restored profile preferences, two normal extension activations only.
- `node scripts/desktop-update-smoke.mjs success --client-v0.3.7`: passed with exact historical worker digest. It retains its known four extension activations (two readiness probes plus normal launches); that compatibility behavior was not rewritten.

## Remaining limits

- Intel hardware, a live published-release upgrade, arbitrary historical Keychain identities and notarization were not tested. No release, push or change to the user's installed app/CLI was performed.
- Cold/native-code updates still exceed 30 s in the measured fixture. Moving native compilation to release-time artifacts would be a separate distribution change; this task implements and validates the common unchanged-helper fast path plus a safe rebuild fallback.

## Outcome

Common unchanged-helper updates meet the approximate 30-second target on the tested Mac (18.2–21.0 s across installed runs). Fresh builds still take longer. Scoped implementation, tests, owning docs and pending release notes are finalized with this archived list; no publication or installation is implied.

The final ASAR assertion originally mistook empty npm scope directories and `.package-lock.json` for bundled dependency packages. Inspection showed no dependency package manifests/code. Narrowed the assertion to actual packages; the rerun passed the complete success gate at 20.988 s. The earlier stopped run measured 19.155 s but is not counted as a passing gate.
