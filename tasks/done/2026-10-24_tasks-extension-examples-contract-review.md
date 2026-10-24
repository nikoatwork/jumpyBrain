# Extension examples and contract review

Completed 2026-10-24: implemented both SDK-only examples, defined and exercised API v1 upgrade compatibility, fixed paired CLI compilation, repaired author docs and recorded remaining hardening in two active follow-up lists.

## Goal

Exercise the executable extension boundary with a playful pink theme and a Pomodoro timer; independently review architecture and author documentation; preserve API v1 behavior across software upgrades with durable compatibility checks.

## Scope and decisions

- Baseline: `9bf6c59736f1ad6ee516e12e976a365dee6bee56`; two unrelated untracked task lists are preserved.
- Delegated architecture/upgrade review, installation/author documentation review, implementation of both examples, and a separate final review round. All used Codex gpt-6.1-sol with inherited high reasoning/default service settings.
- Use existing named action slots and panels. Evaluate placement honestly rather than add example-specific host behavior.
- No release, push, or modification of the user's installed app/extension registry.

## Tasks

- [x] Review extension ownership, lifecycle, trust, install/upgrade paths and public contract.
- [x] Add executable Candy Pink and Pomodoro packages with meaningful behavior tests.
- [x] Add frozen API v1 compatibility regression coverage and release requirements.
- [x] Repair author/install documentation, including persistent source location and supported UI placement.
- [x] Capture concrete deferred findings in a separate active follow-up list.
- [x] Build, run relevant tests and production browser/desktop checks; record outcomes and limits.
- [x] Finalize owning docs/release notes/changelog and archive this list; include the archive in the scoped task commit.

## Review outcome and boundaries

The extension boundary is useful as implemented: both new packages use the host-independent SDK, named contribution slots, semantic colors, scoped commands and owned panel cleanup. Neither needs feature-specific host/editor branches, canonical memory changes, extra permissions or a background gateway timer. Core/app/adapter separation remains intact.

Fixed P1: paired updates install esbuild under Electron, while the installed CLI previously resolved only a root dependency. Explicit preparation now lazily reuses the paired compiler when root resolution is unavailable. Normal memory commands still do not construct an extension host or load a compiler. An isolated paired-distribution test and the installed updater's fresh TS/UI install detect this failure instead of relying only on previously compiled caches.

API v1 compatibility is now independent of the CLI/app version. A frozen historical consumer covers types, prepared assets and source recompilation, namespaced state, commands/events, capabilities, UI registration/disposal and disabled choices. Future breaking APIs require a new version and retained v1 path/migration plan. Author instructions now explain local SDK type-checking, permanent linked-source placement, installation/reload, current slots, and upgrade/recovery limits. README's separate-app/CLI-update claim was corrected; the existing install-guide extension link was already present and needed no duplicate.

The final reviewer found that the initially hand-bundled fixture omitted production's `createRequire` banner. Before freezing/committing it, recaptured SDK declarations and both cached assets by running the baseline commit's production `installExtension()` / `prepareExtension()` inside an isolated git archive. The corrected tests pass; this fixture is now the immutable starting baseline.

The evidence-backed findings were captured separately at review completion; the follow-up hardening is now completed in:

- [Upgrade/recovery](2026-10-24_tasks-extension-upgrade-recovery.md): durable last-good activation after restart, corrupt-registry safe mode, suppressing execution during updater readiness probes, and app-profile palette/shortcut/placement verification.
- [Contract/lifecycle follow-up](2026-10-24_tasks-extension-contract-followup.md): observational callbacks retaining transition admissions, discoverable write results, bounded local compiler diagnostics, public theme-role vocabulary, and future mixed-host negotiation.

Pomodoro placement is a left-sidebar button opening a panel. Persistent sidebar widgets or top-right detail mounts are not API v1 contracts. The timer has focus/break, start/pause/resume/reset, persisted wall-clock deadlines and cleanup. It waits for explicit starts of subsequent intervals. No sound/notification/alarm-service claim; other tabs refresh when reopened/controlled.

## Verification

Tested baseline plus this scoped working-tree change on macOS 15.7.7 / arm64, Node v26.7.0, Electron 44.8.0. All app/memory/extension installation paths were disposable; the personal app, Keychain and extension registry were untouched.

- `npm test`: 1,338 passed, 0 failed, 1 skipped (1,339 total). Log: `.local-pack/extension-review-tests-final.log`.
- Final focused architecture/extension/gateway/browser/CLI/runtime/example set: 66 passed; corrected historical-fixture compatibility set: 3 passed. Logs: `.local-pack/extension-review-focused.log`; final fixture recapture/check output in session.
- `npx --package=playwright node scripts/extensions-smoke.mjs`: passed real lexical retrieval, save/navigation guards, theme/draft preservation, timer start/countdown/pause/reopen/reset/break, and 1280/390/320 layout. Screenshots visually inspected: `.local-pack/extensions-qa/browser/candy-pomodoro-1280.png` and `candy-pomodoro-320.png`. Browser log: `.local-pack/extension-review-browser.log`.
- `npx --package=playwright node scripts/extensions-browser-controller-smoke.mjs`: passed lifecycle/cancellation/BFCache checks. `.local-pack/extension-review-controller.log`.
- `node scripts/extensions-desktop-smoke.mjs`: passed production Electron/gateway, sandboxed renderer, keyboard dispatch, repeated panel cleanup and all-window shutdown preparation. `.local-pack/extension-review-desktop.log` and `.local-pack/extensions-qa/desktop/`.
- `npm run desktop:pack` and `npm run cli:pack`: passed; CLI archive validation includes all new example files (224 required files). Logs: `.local-pack/extension-review-pack-{desktop,cli}.log`.
- External disposable author directory: local SDK development dependency plus the guide's strict NodeNext `tsconfig.json` passed TypeScript checking.
- Installed `success` and `relaunch-failure` updater smokes: passed frozen package activation/state, disabled-package retention, registry/cache preservation and installed CLI fresh compilation. Repeated installed `success` with the exact production-captured baseline: passed (`.local-pack/extension-review-upgrade-final.log`). `success --client-v0.3.7`: passed with the hash-pinned published worker, including installed CLI fresh compilation (`.local-pack/extension-review-published-client.log`). Results retain protected-file and extension checks under `.local-pack/update-smoke/`. Final fixture housekeeping gives the disabled package its own matching source/manifest in the shared seed helper; focused compatibility checks also verify it can be explicitly enabled and compiled.

Initial verification exposed a missing workspace-local Electron esbuild dependency; installing already locked Electron dependencies repaired the environment without manifest/lock changes, and the full suite passed. An early rollback launch raced a concurrent build deleting `dist`; reran sequentially and passed. Early test discovery also executed TypeScript fixtures under `test/`; the immutable fixtures now live under `scripts/fixtures/` and the full suite passes.

## Remaining limits

No public release, push, user installation or full release-matrix certification was requested. These checks do not prove arbitrary third-party code/dependencies, physical sleep, assistive technology, Intel, native login/Keychain history, a live published asset upgrade, or palette/shortcut preferences through rollback. Actual BFCache restoration was not observed in Chromium's navigation run; deterministic persisted-page lifecycle coverage passed. Upgrade readiness activation and restart-recovery findings from this snapshot were subsequently resolved in the linked follow-up archives. Representative frozen-v1 evidence supports preserving a clear contract; it is not an unlimited guarantee about trusted code side effects.
