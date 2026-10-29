# Lean builds, packages and dependencies

Completed 2026-10-29. Recent build/download growth is modest; removed unnecessary shipping assets, enforced footprint budgets, patched Electron and compatible tooling, and verified the real distribution and desktop. No release or user installation.

## Goal

Measure recent build and download growth, remove unnecessary shipping weight, add meaningful regression checks, and update dependencies where justified and verified.

## Tasks

- [x] Compare current output with recent release snapshots and inspect dependency security/update status.
- [x] Implement measured fixes and deterministic package/build regression protection.
- [x] Update justified dependencies with aligned pins and lockfiles; validate affected behavior.
- [x] Record measurements, tested snapshot and limits; update release notes and changelog, archive and commit scoped work.

## Notes

- Canonical Markdown and local/shared engine boundaries remain unchanged.
- No release, push or user installation is authorized by this maintenance task.
- Initial working tree: clean; baseline HEAD `740a1df`.

## Findings and decisions

- Three matched clean builds per historical snapshot: v0.3.7 median 1,535 ms; v0.3.10 1,743 ms; v0.3.11 1,745 ms; starting HEAD 1,766 ms. Final pre-suite measurement: 1,801 / 1,773 / 1,777 ms, median 1,777 ms. Recent growth is modest; no runtime/build rewrite is justified.
- Starting HEAD dry-run tarball: 2,939,093 bytes compressed, 5,281,435 unpacked, 518 files, editor 186,561 bytes gzip. README artwork contributed 1,780,073 bytes and native smoke/tests 93,037 bytes unnecessarily. Exclude these through nested npm ignores, preserving native configuration/cache/secret exclusions and installer/helper sources; use repository URLs for README images.
- Enforce 1.3 MB packed, 3.8 MB unpacked, 2.5 MB compiled runtime, and 600 files in the actual package test and real local pack workflow. Preserve existing 187 KB / 6 KB editor/optional-renderer gates. Keep timing sampling separate from ordinary concurrent tests, with a default 10-second per-build ceiling and a documented slower-machine override.
- Update Electron 44.8.0 → 44.10.0 to address [GHSA-jr5w-w6x2-84p9](https://github.com/advisories/GHSA-jr5w-w6x2-84p9); fast-check 4.8.0 → 4.10.2; Node types 25.9.1 → 25.9.9; compatible transitive signals-core 1.14.4 → 1.14.5. Both lockfile audits have zero vulnerabilities. Root and desktop app/lock versions remain aligned at 0.3.11.
- Trialed aligned Lexical 0.53.0: build passes, but editor reaches 196,654 bytes gzip and fails the existing size budget, versus 186,564 with retained 0.51.0 plus the signals patch. Reverted the candidate; no budget loosening. Upstream also documents breaking and Markdown-export changes. TypeScript 7's removed JS compiler API conflicts with guidance tests using `transpileModule`, so retain 6.0.3. Node 26 types and Electron 45 are optional separate major migrations. esbuild, packager and downloader are current as checked on this date.

## Verification

- Tested snapshot: baseline `740a1df` plus this scoped commit; final production build `0.3.11 / f27211c3ff4ab9e7`. `npm test -- --test-concurrency=4`: **1,473 passed, zero failed, one skipped**, 275.053 seconds. The opt-in real QMD 2.8.3 physical-readonly regression was not provisioned; mocked/other adapter tests passed.
- Final `npm run cli:pack` and `npm run check:package-size`: **1,151,609 compressed bytes (60.8% reduction), 3,430,663 unpacked bytes, 2,176,820 compiled-runtime bytes, 512 files**, all 231 indispensable-file checks passed. Actual tarball SHA-256 `ee4a313c7a78ccbb0b041df1917a257ec758079e2787591a632fa8b959615dd9`. Real pack and dry-run size reports agree.
- Focused final package/manifest/property/build-argument checks: 35 passed; existing editor bundle checks also passed. Test the actual npm manifest, future-artwork/native-test/private-state exclusions in a seeded package, threshold rejection and retained license/installer resources.
- `npm run desktop:pack`: passed, verified native reuse, Electron 44.10.0, final ad-hoc signature checks. Built Mac app is about 304 MiB by `du -sh`, shell ASAR 436,636 bytes. No matched historical app-size comparison was performed.
- Production `electron-smoke.mjs`, `unified-desktop-smoke.mjs` (normal, crash and recovery), and `mac-back-navigation-smoke.mjs`: passed on 44.10.0, including editing/autosave, onboarding, close/quit barriers, packaged extension execution, child cleanup and bounded Back/Forward history.
- Actual npm tarball extracted into a fresh temporary directory, `npm install --omit=dev --ignore-scripts`, CLI version and Pomodoro main/UI TypeScript compilation through CLI: passed without checkout modules. The tarball passes all 231 indispensable-file checks.
- First full-suite attempt was invalidated by an overlapping manual benchmark rebuild of shared `dist` (34 missing-module/CLI failures). Do not interpret these as product regressions. The clean full rerun above passed without rebuilding its consumed output. Benchmark help/invalid-argument handling is now explicit and tested before any build.
- Staged privacy guard, diff whitespace checks, both dependency audits and aligned app/runtime/lock versions passed. Scoped work archived and committed following the repository completion workflow.

## Remaining limits

- One macOS arm64 machine, Node 26.7.0, npm 11.19.0. Historical timings use the same installed pre-update dev dependencies, warm filesystem caches, no dependency-download time; not population latency claims.
- No public-release upgrade, Intel/Linux/Windows hardware check, user installation, push or release. Desktop checks used disposable brains/profiles; personal app/memory remain untouched.
- The CLI/source tarball reduction does not shrink bundled Chromium or prove Mac app size/update-time improvement. Existing fresh Swift build latency remains tracked in [the separate active update task](../todo/tasks-desktop-update-30-seconds.md); release-built helpers and compiler migration are outside this measured maintenance change.
