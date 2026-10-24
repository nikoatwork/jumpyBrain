# Incoming updater compiler compatibility

Status: complete. Incoming installed-update compiler compatibility repaired; required affected gates and clean release dry run passed. Standalone clone only; no publication or live installation.

## Tasks

- [x] Diagnose missing compiler in a node_modules-free distribution and inspect v0.3.7's incoming install invocation.
- [x] Supply pinned compiler through the existing locked Electron build dependency installation; preserve runtime checks and minimal bundle.
- [x] Cover missing/mismatched compiler, relocated compilation and existing-client invocation with regressions.
- [x] Rebuild CLI/native artifacts and run success, app-only, relaunch-failure, helper-crash and app-crash installed gates sequentially.
- [x] Record invalidated/reused evidence, remote history/cadence, archive this list, commit scoped work and run clean release dry run.

## Scope

Base aff4f272fae2a8a111b44f97dbae56db29aba598. Owning files: integrations/electron/{package.json,package-lock.json,desktop-install.py,test_desktop_install.py,electron.docs.md}, release QA fixtures/tests and tasks. Existing release QA remains active until publication. Preserve all unrelated work.

## Verification

- Python installer regressions: 9 passed, including real relocated TypeScript execution, incoming source with no root node_modules, missing compiler failure and pin mismatch rejection.
- Focused `node --test test/desktop-lifecycle.test.js test/desktop-updater.test.js test/local-pack-scripts.test.js`: 61 passed. Installer Python tests are also included through desktop-lifecycle.
- `npm run cli:pack`: passed, 217 required assets. `npm run desktop:pack`: passed arm64 packaging and codesign. Build fingerprint remains `0d6e12953d092d2b`; all four version files remain 0.3.7.
- Direct rebuilt native runtime TypeScript transform passed with esbuild 0.28.2 and only esbuild/platform packages present.
- `npm run smoke:desktop`: normal/crash/recovery passed, including actual bundled extension commands/UI.
- Installed success, app-only, relaunch-failure, helper-crash and app-crash all passed. The explicit published-v0.3.7-worker compatibility gate also passed, simulating aligned 0.3.7→0.3.8 while protecting five files/source policy and retaining next-update helpers. Missing compiler still fails before replacement, relaunch failure rolls back, helper death recovers via GUI and parent crash cancels without false success. Logs `.local-pack/release-0.3.8/*-compiler.log`; installed result artifacts `.local-pack/update-smoke/`.
- Existing runtime/editor implementation remains unchanged; only installer dependency sourcing changes. Release-owned npm test remains mandatory for the parent.

## Outcome and limits

The incoming Electron lockfile now supplies esbuild 0.28.2 before the unchanged v0.3.7 worker calls incoming `install.mjs`. Python packaging reads that build dependency, requires equality with the runtime production pin and preserves existing package/platform/resource checks. It copies only the compiler and matching Mac executable, without root dependency provisioning, development-tree copying, worker changes or network/error fallbacks.

Tested source: base `aff4f272fae2a8a111b44f97dbae56db29aba598` plus the scoped compiler change; SHA-256 fingerprints and candidate artifact digest are in `.local-pack/release-0.3.8/compiler-source-snapshot.json`. Node 26.7.0, QMD 2.8.3, arm64 macOS 15.7.7; build `0d6e12953d092d2b`, all versions 0.3.7. Fresh packages/native runtime and update evidence replace prior affected results; unchanged runtime/editor/retrieval/gateway/import/visual evidence is reused in the [release QA](releases/v0.3.8.qa.md).

No existing publication today at final 19:31 Berlin remote check; latest v0.3.7 published Oct 23. Remote master `6c59372ee5259c3a763b9fad231a9b2be0a9b40f` remains an ancestor and v0.3.8 is absent. Concurrent original-checkout work is excluded. The parent must run the full versioned release workflow, including mandatory npm test. Live public upgrade, Intel, physical IME/assistive technology/clipboard/Keychain history and long soak remain untested. No live installation, version bump, tag, push or publication occurred.

## Finalization

- Staged guard and whitespace checks passed; scoped implementation, regression coverage, owning docs, pending note and this archive are committed together.
- Clean `npm run release -- --dry-run` passed, previewing 0.3.7→0.3.8 (beta), without changing versions or publishing. Log `.local-pack/release-0.3.8/dry-run-compiler.log`; final clean-HEAD repetition is `dry-run-compiler-final.log`.
- The [release QA](releases/v0.3.8.qa.md) records the subsequent successful full release, public artifact verification and archival. This completed fix has no remaining demonstrated blocker.
