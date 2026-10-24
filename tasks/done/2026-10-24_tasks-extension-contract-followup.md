# Extension contract clarity and lifecycle isolation

Completed 2026-10-24: implemented and verified extension lifecycle isolation, local diagnostics and discoverable API-v1 contracts. No release or push.


## Goal

Resolve concrete review findings while keeping the public API small and host-independent. Preserve existing v1 consumers; add capabilities only when a real extension needs them. See the [completed review](2026-10-24_tasks-extension-examples-contract-review.md).

## Tasks

- [x] P2: Stop observational callbacks from retaining a brain-switch/quit admission for their entire handler lifetime.
  - Evidence: `integrations/macos-companion/extensions-gateway.mjs:scopeChanged()` holds coordinator admission while awaiting sequential `host.emit()` callbacks in `src/app/extensions/index.ts`. Independent reviewer reproduced `save_timeout` with zero registered tabs and a slow handler using scaled deadlines.
  - Cancel/fence observations on transition while draining actual admitted memory work; do not weaken canonical save barriers or permit writes in events. Bound total notification work, not only each individual handler.
  - Acceptance: slow/never-settling observers cannot exhaust guarded switch/quit with clean tabs; admitted writes still drain, old scopes fail and notifications remain once per generation.
- [x] P2: Expose stable, discoverable write outcomes through the SDK.
  - Evidence: `ExtensionMemory.create/update` return `Promise<Json>` in `src/extensions/index.ts`; the author guide refers to saved/indexed outcomes that cannot be discovered from types. Preserve current runtime packets and backwards compatibility while defining minimal result types for confirmed save, unchanged update, and indexing partial success.
  - Add one author example that checks a confirmed save/indexing failure and never retries an uncertain creation with a new key. Keep transport-specific canonical paths/credentials out of the public contract.
- [x] P2: Provide bounded local compilation diagnostics.
  - Evidence: `src/adapters/extensions/prepare.ts` wraps esbuild failures with a generic message, `registry.ts` stores a generic preparation error and the CLI prints the outer error. A syntax error supplies no file/line/actionable reason to an author.
  - Expose bounded file/line diagnostics through explicit local CLI author tooling; retain sanitized browser snapshots and avoid leaking paths through ordinary remote responses.
  - Acceptance: a malformed TS entry and missing local dependency yield useful locations/reasons without running package code or exposing secrets/source text in UI descriptors.
- [x] P3: Make the accepted theme-role vocabulary discoverable from public types/docs.
  - Evidence: `ExtensionTheme.colors` is `Record<string,string>` while `src/app/extensions/index.ts` owns a private allowlist. Example authors currently copy names from another package or encounter generic activation failure.
  - Prefer one host-independent role list/union consumed by validation and docs over duplicated palettes/validators; retain all accepted v1 roles and optional `--` prefixes.
- [x] P3: Define compatibility negotiation before adding newer-host-only APIs.
  - Evidence: manifest `apiVersion` is the only author-visible gate; a running custom/older Desktop and independently upgraded CLI can differ. The frozen-v1 tests verify old consumer → candidate host, not every mixed-host management protocol.
  - Keep v1 additions optional and feature-detectable; document unknown-field behavior and add a mixed-host test when changing management envelopes. Avoid a second general-purpose version-range framework without a concrete need.

## Placement decision

Candy Pink and Pomodoro both work through v1 without changing the host. Pomodoro uses `sidebar.actions` plus a panel. Persistent sidebar widgets/top-right detail mounts are not supported; defer a new slot until its visibility, document/scope lifetime and cleanup contract are designed. Never target private shell DOM as a workaround.

## Implementation and verification — 2026-10-24

- Observations release their initial gateway admission; per-operation memory admissions continue draining through transport settlement. Switch/quit cancels observations (including notifications nested inside an admitted command), fences retained contexts, and preserves once-per-generation delivery. One three-second deadline bounds a whole notification, including implicit scope notification. The nested-command regression passed, including stale retained contexts and clean quit with a 100 ms coordinator deadline.
- Added JSON-compatible `ExtensionCreateResult` and `ExtensionUpdateResult` types for confirmed creation/index status and changed/unchanged updates without changing runtime packets or requiring transport-specific paths. The author guide and a type-checked executable example distinguish indexing failure from uncertain creation and never retry with a new key.
- `extensions check --source <package> [--json]` compiles in disposable storage without registration, activation or live-host discovery. Bounded package-relative file/line/column reasons omit source lines, notes and stacks. Normal registry/browser/remote errors remain generic. Syntax and missing-dependency checks pass without executing package code.
- Exported `EXTENSION_THEME_ROLES`/`ExtensionThemeRole` as the shared host/renderer vocabulary, retaining v1 names and optional `--` prefixes. Frozen v1 consumers still type-check.
- Documented strict manifest/request keys, additive response fields and future optional feature detection without a version-range framework. Current CLI management is tested against a frozen historical gateway. Optional recovery guidance is accepted without requiring it from older hosts.

No new UI slot, newer-host-only SDK method, release, push or user installation. Same-process synchronous code and unmanaged side effects remain outside cooperative cancellation; handlers beyond a notification's cancellation/deadline may be skipped.

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
