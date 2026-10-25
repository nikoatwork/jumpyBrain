# Release v0.3.9

Status: preparing the next patch beta at the user's explicit release request on 2026-10-25. All previously unstaged/untracked work was committed separately as `5038bf9` at the user's request; the properties/saved-views file remains an implementation plan, not a shipped feature.

- [x] Read release, lean-beta, release-testing and task guidance; inspect published history and fetch master/tags.
- [x] Select all completed changes since published v0.3.8; preserve the exact snapshot in an independent clean master checkout and consolidate notes to seven user-facing bullets.
- [ ] Verify required core flows, package/native/update gates and applicable changed areas; record reused evidence and results.
- [ ] Commit preparation/verification, run release dry-run and recheck daily cadence/remote state.
- [ ] Run the full `npm run release` patch workflow and verify tag, aligned versions, exact notes, asset and SHA-256 digest.
- [ ] Archive exact published notes plus QA, reset only shipped pending notes, finalize this list and commit bookkeeping. Reconcile published master into the original checkout without overwriting new work.

## Snapshot and verification plan

- Original head: `5038bf9`; latest published v0.3.8 is `54f1410`, published 2026-10-24T17:36:32Z. Initial query found no 2026-10-25 publication (Europe/Berlin). Remote master `f44594e` is an ancestor of the selected source; no remote-only changes or v0.3.9 tag.
- Independent release checkout: `/tmp/jumpybrain-release-v0.3.9-20261025`; original repository remains available for unrelated work. Root/Electron locked dependencies copied from the provisioned checkout; not a clean-machine dependency install.
- Environment: Node v26.7.0, QMD 2.8.3 (facd35e) at `/opt/homebrew/bin/qmd`, macOS 15.7.7 (24G720), arm64. Logs/artifacts under `.local-pack/release-0.3.9/` in the release checkout; native updater mode results remain under `.local-pack/update-smoke/`.
- Reuse the latest unchanged implementation's `npm run validate` result from [checkbox/code completion](../done/2026-10-25_tasks-markdown-checkboxes-code-tables.md): 1,392 passed, one opt-in QMD skip. All commits after `024e78d` before release preparation are planning/notes only. The release command still runs a fresh mandatory full suite on aligned v0.3.9 metadata.
- Build fresh CLI and desktop packages. Run note lifecycle, Electron and packaged desktop smokes, all five installed updater modes and the pinned v0.3.7-worker compatibility gate; then relevant current editor/reference/import/extension/onboarding/connection smokes and real semantic retrieval using the existing model. Direct smoke scripts reuse the preceding build and run sequentially when sharing generated outputs.
- Imported/native sample evidence and feature-specific visual checks remain in their completed task records. New release source/browser/package checks do not imply Intel, physical IME/accessibility, real OS clipboard/Keychain history, personal-vault/plugin compatibility, live feedback transmission or a live public-release upgrade. No update of the user's installed app is part of publication.
