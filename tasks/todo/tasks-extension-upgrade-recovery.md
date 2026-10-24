# Extension upgrade and recovery hardening

## Goal

Preserve installed extensions and recover the ordinary editor when extension preparation, activation or upgrade verification fails. Review baseline: `9bf6c59736f1ad6ee516e12e976a365dee6bee56`; independent architecture reviewer reproduced the first two issues below in disposable fixtures.

## Already fixed in the examples/contract review

The paired updater places esbuild under Electron while the installed CLI previously resolved only root dependencies. The CLI now reuses the paired compiler; frozen-contract and installed-update checks cover fresh compilation as well as cached activation. See the [completed review](../done/2026-10-24_tasks-extension-examples-contract-review.md).

## Tasks

- [ ] P2: Preserve a last-successfully-activated revision/manifest across restarts.
  - Evidence: `src/adapters/extensions/registry.ts` publishes the prepared candidate before `src/app/extensions/index.ts` validates its factory. Working package → throwing factory → reload preserves old commands, but host restart activates only the bad candidate and loses them.
  - Keep candidate and successful revision ownership explicit; protect the fallback from cache pruning. Avoid maintaining two competing registries or publishing an activation success from a failed factory.
  - Acceptance: failing reload, guarded restart and another failed reload retain the old working commands/capabilities/assets; successful replacement cleans up and releases the fallback appropriately.
- [ ] P2: Make explicit safe mode usable with corrupt current and backup registries.
  - Evidence: `src/app/extensions/index.ts:refresh()` reads `listExtensions()` even in safe mode; `readRegistry()` rejects both corrupt files, preventing `integrations/macos-companion/gateway.mjs` startup despite its "Safe mode remains available" message.
  - Start an empty execution set with a bounded recovery diagnostic, preserving damaged files. Keep ordinary management failures explicit outside safe mode.
  - Acceptance: `disabled` plus corrupt registries opens the normal editor without compiler/factory execution or destructive registry repair; recovery instructions and tests match.
- [ ] P2: Suppress third-party activation during updater readiness probes.
  - Evidence: `integrations/electron/update-worker.mjs` starts staged and installed gateways against the real support directory before actual relaunch. Source trace shows `createExtensionHost()` activates trusted factories during each probe; no full state-migration fault reproduction was performed in the review.
  - Supply an explicit internal probe option instead of modifying the user's persistent safe-mode marker. Preserve real application activation and save barriers.
  - Acceptance: a factory recording activation/state migration runs on actual app launch, never readiness-only probes; failed update/rollback does not migrate extension state in a throwaway candidate.
- [ ] Verify app-profile palette, placement and shortcut overrides through upgrade and rollback.
  - Frozen-v1 checks cover public types, cache/source, state, disabled packages and CLI compilation; the installed updater smoke does not yet assert these renderer localStorage preferences.
  - Use the same disposable profile and semantic command/theme IDs before and after replacement, including rollback; capture any unsupported downgrade limits.

## Limits

The frozen representative v1 package is regression evidence, not proof for arbitrary dependencies or unmanaged trusted-code side effects. Do not weaken it or silently reset state to pass a candidate release. No release is authorized by this list.
