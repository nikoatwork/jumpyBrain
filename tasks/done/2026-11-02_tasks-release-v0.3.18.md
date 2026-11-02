# Release v0.3.18

Status: complete. Published and verified v0.3.18; implementation snapshot `4722c598613d3043b8b562f5578decf7498ac403`.

## Scope and authorization

- User requested “Cut a release” on 2026-11-02. Full patch publication is authorized. The owner explicitly answered “Yes—publish v0.3.18 after checks pass” to the combined same-day override and automated-verification/shorter-use-window question.
- Latest published numeric release is v0.3.17, published 2026-11-02 08:07:09 UTC (09:07:09 Europe/Berlin). The owner explicitly authorized this second release today.
- Fetched `origin/master` and tags; local master is 35 commits ahead, with no divergence or uncommitted work at intake. Review covers v0.3.17 through the implementation snapshot, including previously integrated completed increments. Active hosted/systemd and product-evaluation work remains active.
- Curated [exact published notes](releases/v0.3.18.md) into seven user-facing bullets matching included behavior. No semantic ranking improvement, historical-note backfill, arbitrary staging cleanup or verified systemd deployment is claimed.

## Feedback review

- Live read-only full available received/non-spam inbox checked at `2026-11-02T15:07:58.146Z`: no lower or upper filter, one page, `complete:true`, 38 scanned, two explicitly marked delivery tests excluded, 36 genuine reports retained. Message dates span 2026-10-20 through 2026-11-02. Trash, blocked mail and spam are outside this default scope.
- Read all 17 reports dated 2026-11-02 in full by 15:08:13 UTC; reconciled older reports against the existing feedback/integration records and earlier released fixes. Reports include owner/user observations and agent-authored evaluations, rather than 36 independent external beta users. No replies, test submissions, attachment downloads or label changes.
- Included actionable fixes: ordinary/fresh-note deletion; backend restart recovery; agent-shell launch; runtime lifetime/signature protection; help/flag validation; app connection control and target diagnostics; guidance/lint preview; new daily-note dates; hosted build closure. Existing feature task records preserve reproduction limits.
- Deferred: semantic branch/ranking and imported-date changes to the frozen [workspace evaluation](../todo/tasks-workspace-retrieval-evaluation.md); cross-brain routing, journal migration/backfill, broader provenance/weekly views, feedback/accessibility polish and product-surface proposals to [independent increments](../todo/tasks-feedback-independent-increments.md). Real systemd enforcement remains in [hosted operations](../todo/tasks-hosted-build-and-operations.md). No new demonstrated data-loss issue beyond the repaired deletion paths was established by this review.
- Raw message bodies remain outside Git in temporary operator files; no private message text or diagnostics copied into this record.

## Candidate and environment

- macOS 15.7.7 (24G720), ARM64; Node v26.7.0; QMD 2.8.3 (`facd35e`), `/opt/homebrew/bin/qmd`; Docker Engine 27.4.0 available.
- `npm run dogfood:status` reports an obsolete v0.3.13 candidate `820eb944c1720ebd71cf1c29275a192430300ca5`, installed 2026-10-31 19:11:08 UTC, `current:false`. Installation age is not active use evidence. No matching current real-brain test window is verified; the owner explicitly chose automated verification without a new day-long local test window. Publication does not install or replace the owner's app.
- Reused feature-specific evidence: packaged deletion/launch 17 checks and 40-case lifecycle editing matrix from [deletion](2026-11-02_tasks-stale-note-editing.md) and [launch](2026-11-02_tasks-desktop-shell-launch.md); packaged backend replacement 5/5 from [restart recovery](2026-11-02_tasks-backend-restart-recovery.md); signature/lifetime checks from [signed runtime pins](2026-11-02_tasks-signed-bundle-runtime-pins.md). Relevant code is unchanged after those checks except the separately tested daily-date addition. The release-owned full suite validates their integration.

## Tasks

- [x] Review live feedback, history, environment and pending scope.
- [x] Build the implementation snapshot (`npm run build`); shared editor 220,115 gzip bytes, optional extensions 5,669 gzip bytes.
- [x] Build a fresh desktop package and pass the core note-lifecycle smoke.
- [x] Run the focused hosted gate for changed container inputs; record Linux platform and image/input digest.
- [x] Record owner's same-day and shorter-test decisions; preparation committed and `npm run release -- --dry-run` passed (0.3.17 → 0.3.18).
- [x] Run the full release workflow with aligned CLI/app versions, deterministic suite and distribution validation.
- [x] Verify public tag, exact notes, single asset and downloaded digest; archive exact notes and QA, reset pending notes, finalize this list and commit bookkeeping.

## Limits

No new real-brain use window, Intel/macOS 26, physical keyboard/IME, actual OS sleep, public signing/notarization, Linux AMD64/semantic container, real systemd manager, production deployment or installed public update is established by automated release checks. Preserve existing source-task limits and do not mark them complete through publication.

## Preparation results

- `npm run desktop:pack` passed: fresh `.local-pack/desktop/jumpyBrain.app`, native compile, packaged RunAsNode fuse and deep signature verification. The compiler emitted the existing deprecated Keychain API warning; packaging succeeded.
- `JUMPYBRAIN_QMD_BIN=/opt/homebrew/bin/qmd npx --package=playwright node scripts/note-lifecycle-smoke.mjs` passed: canonical capture, immediate search, title/graph navigation, two-tab stale-save recovery, narrow layouts, guarded deletion, backlink preservation and index refresh.
- `PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH" npm run smoke:hosted` passed against implementation `4722c59`: Linux ARM64, Node 22.23.4, QMD 2.8.3; input SHA-256 `f6c885636a9f07a9c2e739405839b3333364c63cce8354a39c3f3e7aaf8af166`; image `sha256:459d912156c7d0b5d85932ce0ab672d14490940a475228f1a575e6a3a8bdca8f`. Checks cover clean build context, non-root dependencies/assets, real lexical recall, reader denial, key/cookie revocation, graceful replacement, exact byte persistence, stopped-root backup/loss/restore and changed-access refusal. Disposable resources were removed.
- Logs: `/tmp/jumpybrain-v0.3.18-{build,desktop-pack,lifecycle,hosted}.log`. Preparation package retains version 0.3.17; only the full release workflow stamps/validates/publishes 0.3.18. No duplicate pre-release full-suite/CLI-pack run.
- The owner supplied both explicit decisions before the full release workflow. Publication, verification and notes archival are complete; this record is archived with the final bookkeeping commit.

## Completed outcome

- Published [v0.3.18](https://github.com/nikoatwork/jumpyBrain/releases/tag/v0.3.18) at 2026-11-02T17:01:19Z; release commit `09f5112b7be4e3c5371fd6c56977a6a7748fcc07`. The full workflow passed all 1,851 tests with zero failures/skips and validated 291 required distribution resources before atomic branch/tag push and GitHub publication.
- Verified annotated public tag, exact notes, aligned root/Electron manifests and lockfiles, single uploaded asset and matching local/public/GitHub SHA-256 `sha256:6c076f2ec1efb02d282db51571e858242b388149ce8a1d960d547f3711c87483`. Downloaded isolated CLI reports 0.3.18, compiled build `e300a4bcca2ac05c`.
- Archived exact notes at [v0.3.18.md](releases/v0.3.18.md) and detailed [QA](releases/v0.3.18.qa.md); reset the pending note to its empty heading because every curated bullet shipped. No deferred release-note bullet was removed.
- Moved this completed list to `tasks/done/2026-11-02_tasks-release-v0.3.18.md`, repaired relative references, and updated the selective changelog. The containing scoped bookkeeping commit records these changes. Active follow-up tasks and existing installations remain untouched.
