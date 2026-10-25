# Release v0.3.9

Status: **Complete — published and verified 2026-10-25T16:35:38Z**. Release/tag commit `43fd89d60117a6caca466081e2722ed0828c4501`. The next patch beta was prepared at the user's explicit release request on 2026-10-25. All previously unstaged/untracked work was committed separately as `5038bf9` at the user's request; the properties/saved-views file remains an implementation plan, not a shipped feature.

- [x] Read release, lean-beta, release-testing and task guidance; inspect published history and fetch master/tags.
- [x] Select all completed changes since published v0.3.8; preserve the exact snapshot in an independent clean master checkout and consolidate notes to seven user-facing bullets.
- [x] Verify the selected core/package/new-feature gates under the owner's reduced scope; record reused evidence and results.
- [x] Commit preparation/verification, run release dry-run and recheck daily cadence/remote state.
- [x] Run the full `npm run release` patch workflow and verify tag, aligned versions, exact notes, asset and SHA-256 digest.
- [x] Archive exact published notes plus QA, reset only shipped pending notes, finalize this list and commit bookkeeping. Reconcile published master into the original checkout without overwriting new work.

## Snapshot and verification plan

- Original head: `5038bf9`; latest published v0.3.8 is `54f1410`, published 2026-10-24T17:36:32Z. Initial query found no 2026-10-25 publication (Europe/Berlin). Remote master `f44594e` is an ancestor of the selected source; no remote-only changes or v0.3.9 tag.
- Independent release checkout: `/tmp/jumpybrain-release-v0.3.9-20261025`; original repository remains available for unrelated work. Root/Electron locked dependencies copied from the provisioned checkout; not a clean-machine dependency install.
- Environment: Node v26.7.0, QMD 2.8.3 (facd35e) at `/opt/homebrew/bin/qmd`, macOS 15.7.7 (24G720), arm64. Logs/artifacts under `.local-pack/release-0.3.9/` in the release checkout; native updater mode results remain under `.local-pack/update-smoke/`.
- Reuse the latest unchanged implementation's `npm run validate` result from [checkbox/code completion](2026-10-25_tasks-markdown-checkboxes-code-tables.md): 1,392 passed, one opt-in QMD skip. All commits after `024e78d` before release preparation are planning/notes only. The release command still runs a fresh mandatory full suite on aligned v0.3.9 metadata.
- Build fresh CLI and desktop packages. The initial broad matrix was stopped at the owner's explicit request to reduce release testing by at least half. Keep passed core/native/update evidence, finish only short Markdown-formatting and Obsidian-import gates, then rely on the full release-owned deterministic suite/package checks. Remaining broad integration and real-model gates are omitted, not claimed passed. Direct smoke scripts reuse the preceding build and run sequentially when sharing generated outputs.
- Imported/native sample evidence and feature-specific visual checks remain in their completed task records. New release source/browser/package checks do not imply Intel, physical IME/accessibility, real OS clipboard/Keychain history, personal-vault/plugin compatibility, live feedback transmission or a live public-release upgrade. No update of the user's installed app is part of publication.

## Owner-directed reduction — 2026-10-25

The user stopped the oversized release matrix and asked to cut it by at least half. Updated `docs/release-testing.md` and `docs/lean-beta-releases.md`: routine preparation is build → fresh desktop pack → one core note smoke, followed by the full release command. No separate pre-release full-suite/CLI-pack pass, automatic updater failure matrix or entire browser permutation group is required. Selected changed-behavior checks remain available; fix actual failures and retain publication verification.

For this release the 31-command integration matrix is reduced to the nine completed gates plus two short new-feature checks (11 total, over 60% fewer selected commands). The full `npm run release` validation remains required. This count is not a measured time-savings claim. The running disposable child at matrix cancellation is not a selected gate unless it separately completed with recorded evidence.

## Completed preparation gates

- Passed `npm run cli:pack` (2.9 s), log `.local-pack/release-0.3.9/cli-pack.log`.
- Passed `npm run desktop:pack` (57.4 s), log `.local-pack/release-0.3.9/desktop-pack.log`.
- Passed `npx --package=playwright node scripts/note-lifecycle-smoke.mjs` (6.5 s), log `.local-pack/release-0.3.9/note-lifecycle.log`.
- Passed `npm run smoke:electron` (5 s), log `.local-pack/release-0.3.9/electron.log`.
- Passed `npm run smoke:desktop` (11.2 s), log `.local-pack/release-0.3.9/desktop.log`.
- Passed `node scripts/desktop-update-smoke.mjs success` (107.5 s), log `.local-pack/release-0.3.9/update-success.log`.
- Passed `node scripts/desktop-update-smoke.mjs app-only` (84.6 s), log `.local-pack/release-0.3.9/update-app-only.log`.
- Passed `node scripts/desktop-update-smoke.mjs relaunch-failure` (83.6 s), log `.local-pack/release-0.3.9/update-relaunch-failure.log`.
- Passed `node scripts/desktop-update-smoke.mjs helper-crash` (86.3 s), log `.local-pack/release-0.3.9/update-helper-crash.log`.
- Passed `npx --package=playwright node scripts/markdown-formatting-smoke.mjs` at 1280/390/320 px, covering canonical source preservation, save/reopen, failed/conflicting saves, external edits and readonly behavior.
- Passed `npx --package=playwright node scripts/obsidian-import-smoke.mjs`: two documents, preserved bodies/YAML, lexical recall, ID show/expansion, browser save, conflict guard, stable source-wins reruns and unchanged source-tree hashes.
- Initial prepared source `b3e007b` has no implementation difference from the latest tested `024e78d`; later changes only reduce testing guidance and record evidence. Fresh CLI pack verifies 231 required files. Fresh arm64 desktop package builds/signs/verifies successfully. Pre-release integration artifacts carry 0.3.8 metadata; final aligned 0.3.9 distribution is validated by the release command and public-asset verification.
- Core browser lifecycle, production Electron window and packaged normal/crash/recovery lifecycle passed. Installed updater success, app-only, relaunch-failure and helper-crash gates passed; success observed two extension activations and preserved paired versions/state. Fixture versions are deliberately 0.3.3 → 0.3.4, not a live published 0.3.9 upgrade.
- The owner canceled the remaining automatic matrix. No results are claimed for its unselected app-crash, legacy-worker, onboarding, full reference/theme/search/connection/extension, semantic-model or opt-in real-QMD gates in this release. Earlier completed-feature evidence remains historical context, not a new release pass. No observed test failure drove the reduction.

## Completed outcome

Published and downloaded/verified [v0.3.9 beta](https://github.com/nikoatwork/jumpyBrain/releases/tag/v0.3.9) through the full release workflow. The release-owned suite passed 1,392 tests, zero failures, one opt-in skip. CLI/runtime and Electron manifests/lockfiles agree on 0.3.9; the public asset matches the local candidate and GitHub SHA-256. Exact notes are archived and only shipped pending bullets cleared. [Final QA and limits](releases/v0.3.9.qa.md) records the reduced test selection and publication evidence. Original workspace was fast-forwarded to the published snapshot; archival bookkeeping is committed/pushed separately. No installed app/CLI or personal memory changed.
