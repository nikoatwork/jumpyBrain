# Extension upgrade and recovery hardening

Completed 2026-10-24: implemented and verified extension restart/safe-mode/update recovery and profile persistence. No release or push.


## Goal

Preserve installed extensions and recover the ordinary editor when extension preparation, activation or upgrade verification fails. Review baseline: `9bf6c59736f1ad6ee516e12e976a365dee6bee56`; independent architecture reviewer reproduced the first two issues below in disposable fixtures.

## Already fixed in the examples/contract review

The paired updater places esbuild under Electron while the installed CLI previously resolved only root dependencies. The CLI now reuses the paired compiler; frozen-contract and installed-update checks cover fresh compilation as well as cached activation. See the [completed review](2026-10-24_tasks-extension-examples-contract-review.md).

## Tasks

- [x] P2: Preserve a last-successfully-activated revision/manifest across restarts.
  - Evidence: `src/adapters/extensions/registry.ts` publishes the prepared candidate before `src/app/extensions/index.ts` validates its factory. Working package → throwing factory → reload preserves old commands, but host restart activates only the bad candidate and loses them.
  - Keep candidate and successful revision ownership explicit; protect the fallback from cache pruning. Avoid maintaining two competing registries or publishing an activation success from a failed factory.
  - Acceptance: failing reload, guarded restart and another failed reload retain the old working commands/capabilities/assets; successful replacement cleans up and releases the fallback appropriately.
- [x] P2: Make explicit safe mode usable with corrupt current and backup registries.
  - Evidence: `src/app/extensions/index.ts:refresh()` reads `listExtensions()` even in safe mode; `readRegistry()` rejects both corrupt files, preventing `integrations/macos-companion/gateway.mjs` startup despite its "Safe mode remains available" message.
  - Start an empty execution set with a bounded recovery diagnostic, preserving damaged files. Keep ordinary management failures explicit outside safe mode.
  - Acceptance: `disabled` plus corrupt registries opens the normal editor without compiler/factory execution or destructive registry repair; recovery instructions and tests match.
- [x] P2: Suppress third-party activation during updater readiness probes.
  - Evidence: `integrations/electron/update-worker.mjs` starts staged and installed gateways against the real support directory before actual relaunch. Source trace shows `createExtensionHost()` activates trusted factories during each probe; no full state-migration fault reproduction was performed in the review.
  - Supply an explicit internal probe option instead of modifying the user's persistent safe-mode marker. Preserve real application activation and save barriers.
  - Acceptance: a factory recording activation/state migration runs on actual app launch, never readiness-only probes; failed update/rollback does not migrate extension state in a throwaway candidate.
- [x] Verify app-profile palette, placement and shortcut overrides through upgrade and rollback.
  - Frozen-v1 checks cover public types, cache/source, state, disabled packages and CLI compilation; the installed updater smoke does not yet assert these renderer localStorage preferences.
  - Use the same disposable profile and semantic command/theme IDs before and after replacement, including rollback; capture any unsupported downgrade limits.

## Limits

The frozen representative v1 package is regression evidence, not proof for arbitrary dependencies or unmanaged trusted-code side effects. Do not weaken it or silently reset state to pass a candidate release. No release is authorized by this list.

## Implementation and verification — 2026-10-24

- Persist candidate and factory-confirmed successful manifest/revision in the same registry, with ownership checked under the lock. Cache pruning protects the successful revision across dead hosts; failed restart/reloads retain commands, original capabilities and UI assets. Successful replacement releases that protection. Tests include a fresh Node process restart.
- Explicit/marker safe mode returns an empty execution set and bounded recovery guidance when both registries are damaged, preserving both files. Ordinary management still rejects unreadable registries. Production gateway/editor startup is exercised.
- Current staged/installed updater probes carry a private readiness-only option through Electron, Swift and gateway, suppressing compilation/factory/state migrations without modifying the disabled marker. Actual launch retains normal activation/save barriers.
- Installed updater success and rollback verify one disposable profile's palette, placement and shortcut by semantic IDs and actual shortcut-opened panel. Frozen v1 cache/source/state/disabled choices and installed CLI compilation remain checked. The audit package records activation; rollback also verifies extension-local migration counters.

Final success, rollback and published-worker compatibility checks passed; the final integrated suite passed 1,350 tests with one skipped. No release, push or user installation is authorized. Older published workers lacking the readiness option retain their earlier probe behavior; state changes on actual launch and unmanaged trusted-code effects are outside bundle rollback. Older registry writers may discard successful-revision metadata on downgrade. Arbitrary dependencies, physical devices, Intel and live published-asset certification remain outside this fixture scope.

## Final verification

Tested `85dd4b9` plus this scoped implementation and its committed regression fixtures in an isolated checkout, with matching source bytes in the primary checkout. The source parent includes the concurrently completed onboarding work. The original frozen API-v1 SDK/source/cache files are unchanged; historical management fixtures exactly match `9bf6c59736f1ad6ee516e12e976a365dee6bee56`.

- `npm test`: **1,350 passed, zero failed, one skipped** (1,351 total). Final log: `.local-pack/extension-hardening-tests-final.log`.
- Fresh-process recovery, original capabilities/UI assets, repeated failed reload/pruning, successful replacement, corrupt-registry safe startup, bounded notifications, nested-observer cancellation, admitted canonical-write drain, local diagnostics, typed outcomes/theme roles and mixed-host CLI management are included in that suite. An additional focused recovery pass had 34 passing tests before the nested-observer regression was added.
- Production browser and controller smokes passed after the final lifecycle change: `.local-pack/extension-hardening-browser-final.log` and `extension-hardening-controller-final.log`. Layout screenshots at 1280/320 were visually inspected. Actual Chromium BFCache restoration was not observed; deterministic persisted-page lifecycle tests passed.
- Production Electron smoke passed native keyboard dispatch, real lexical retrieval, repeated panel cleanup, disable, and two-window shutdown preparation: `.local-pack/extension-hardening-desktop-final.log`.
- Desktop packaging/native compilation passed; the final installed updater also built and verified its complete incoming app. CLI packing passed all 224 required files: `.local-pack/extension-hardening-pack.log` and `extension-hardening-cli-pack.log`.
- Installed final `success` and `relaunch-failure` smokes passed profile palette/placement/shortcut persistence (including real panel opening), frozen-v1 activation/state/disabled choices, protected configuration/cache, and installed CLI fresh TS/UI compilation. The activation/state-migration audit was exactly `[1, 2]`: initial app and actual relaunch/recovered app, with neither readiness probe executing it. Logs: `.local-pack/extension-hardening-upgrade-final.log` and `extension-hardening-rollback-final.log`.
- Hash-pinned published `v0.3.7` worker compatibility passed, including profile preservation and installed CLI compilation: `.local-pack/extension-hardening-published-client.log`. Its audit was `[1, 2, 3, 4]`, confirming the documented historical-worker probe limit rather than claiming that old workers gain suppression retroactively.

Reports, screenshots and the checked CLI archive are retained under `.local-pack/extension-hardening-artifacts/`. All app/memory/profile/extension installation paths were disposable; the user's installed app, personal memory and extension registry were untouched. Initial shared-checkout tests collided with concurrent `dist` rebuilds; isolated final verification removed that interference. An initial isolated dependency symlink omitted build-time license notices; copying the locked dependencies into the isolated checkout fixed the fixture environment and the complete suite passed. The preference harness uses a deterministic audit command, while the immutable v1 consumer is separately invoked through the installed replacement runtime.
