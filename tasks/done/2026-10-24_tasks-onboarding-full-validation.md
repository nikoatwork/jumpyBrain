# Onboarding follow-up: test remaining gaps and improve

Completed 2026-10-24. Reproduced diagnostic, prerequisite, uninstall-preview, native startup and real-model temporal failures were fixed and retested. Authenticated Claude now passes three fresh conversations. [Final results and limits](../../deep-dives/onboarding-synthetic-2026-10-24/followup-results.md).

## Goal

Follow the user's request to test all remaining onboarding gaps and improve the results from the first three synthetic users. Attempt real Claude activation, fresh native Desktop/chooser, installer/bootstrap/platform and failure/recovery flows; fix reproducible friction without expanding into release/public distribution redesign.

## Scope

- Baseline: `695bae9`, following onboarding commit `85dd4b9`. Two unrelated untracked planning lists remain preserved.
- Three delegated tracks: diagnostics implementation, real-Claude/guidance validation, native Desktop coverage. Parent owns bootstrap/platform testing, final production Desktop fixes, task/report integration and final validation.
- Disposable homes, brains, profiles and bundles; fictional notes only. No user installation replacement, credential copying, security bypass, feedback submission, release or push.
- Missing external prerequisites are reported precisely. Synthetic, fixture, physical-device and actual model-session evidence remain distinct.

## Tasks

- [x] 1. Attempt all remaining gaps and retain per-track evidence.
- [x] 2. Fix diagnostics, clarify personal-local versus shared authorization and implement any reproduced Desktop/installer fixes.
- [x] 3. Rebuild and run final focused/full regression and end-to-end checks.
- [x] 4. Record actual blockers and limits, update owning docs/release notes/changelog, archive and commit scoped work.

## Evidence

- Prior [judgment](../../deep-dives/onboarding-synthetic-2026-10-24/judgment.md) and three persona reports are historical evidence, retained unchanged.
- New reports: [diagnostics](../../deep-dives/onboarding-synthetic-2026-10-24/diagnostics-followup.md), [Claude/auth boundary](../../deep-dives/onboarding-synthetic-2026-10-24/claude-followup.md), [native Desktop](../../deep-dives/onboarding-synthetic-2026-10-24/desktop-followup.md), [platform/bootstrap](../../deep-dives/onboarding-synthetic-2026-10-24/platform-followup.md), [authenticated Claude failure](../../deep-dives/onboarding-synthetic-2026-10-24/claude-authenticated-followup.md).

## Verification

- Native machine: macOS 15.7.7 arm64, Node v26.7.0, QMD 2.8.3. Shared build passed. Full final runtime suite: 1,368 tests, 1,367 passed, one skipped, zero failures. Final temporal guidance then rebuilt and passed 24 focused guidance/formatting/installer regressions; no retrieval/storage semantics changed after the full run.
- Diagnostic worker: temporary TS build, 63 focused cases and actual real-QMD bad-override/unset recovery passed. Parent full suite covers merged source. New `doctor --check` is additive; legacy unhealthy doctor retains exit 0.
- Node 22.12.0: 26 CLI/onboarding/target/parser/package tests plus two startup-recovery tests passed; fake QMD, not real native-engine provisioning. Temporary downloaded Node/cache removed.
- Actual source/bootstrap/install/update/uninstall smoke passed all nine phases, including strict doctor and exact note/integration preservation. Public GitHub bootstrap/helper download and help passed separately.
- Local tarball consumer import/version and remote-only recall without client QMD passed. Shared read-only CLI recall/write-denial passed against a disposable server.
- Real provisioned semantic model smoke passed on final runtime, with network/model downloads blocked. No benchmark/quality superlative inferred.
- Fresh candidate/native helper: real physical chooser cancel/invalid/A/B routes passed on archived 695bae9. Parent packaged current source and passed native app/CLI roundtrip, relaunch, settings isolation, actual missing-helper recovery/restoration and overlong socket actionable-failure phases. Unified Desktop normal/crash/recovery passed. No installed app was replaced.
- User authenticated Claude locally after initial blocked attempt. Actual model discovered/activated generated project skill, checked readiness, saved one note and recalled it in a fresh conversation. It nevertheless guessed an event year from writing metadata. This failed the temporal requirement; strengthened guidance in skill/CLI/Pi/workflows was retested through the same three real conversations. Final answer preserved the unspecified year and cited actual source lines; all eleven behavioral checks passed. No failing earlier model result is counted as a pass.

## Implemented improvements

- Strict, bounded health checks; scoped integration presence; literal same-root init recovery; bad QMD override correction before reinstall advice.
- Desktop prerequisite preflight aggregates missing requirements and checks actual minimum versions without installation.
- Uninstall previews identify planned actions and never claim deletion/completion.
- Personal-local requests, shared destination authorization and separately authorized wrapups are consistent across skills, CLI instructions and Pi tool guidance.
- Shared welcome/startup repair instructions hide raw filesystem exceptions; early socket/startup failure now notifies before quitting, and overlong socket paths are rejected before binding.
- New opt-in installer, native Desktop and authenticated Claude smoke entrypoints retain evidence and use fictional temporary brains.
- Explicit missing-event-year guidance was added after an actual Claude answer violated the earlier generic uncertainty rules; actual fresh-conversation retest passed.

## Limits and finalization

- Linux daemon unavailable; minimum Node tests do not establish native QMD ABI/installation. Unavailable clean macOS/Intel/Gatekeeper/login/Keychain-history/live-VPS/public-upgrade/Pi-host gates remain labeled untested in the final report.
- Reused existing app/CLI/adapter seams; no new engine, credential store, permission bypass, service, backend policy or publication channel. Doctor strict mode is additive; supported socket location and ownership policy remain intact.
- Source changes, tests, reusable smoke entrypoints, owning docs and all follow-up reports are scoped to this task. Preserve the two unrelated planning lists. Completion includes archive and scoped commit; it authorizes no release, installation replacement or push.
