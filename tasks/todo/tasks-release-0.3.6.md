# Release 0.3.6 — QA and publication

## Scope

Release the committed changes through `9b8b6d0` since published `v0.3.5`, using the next patch version for CLI/runtime and Mac app together. The user requests publication, finalized task work and commits, and considers the completed testing sufficient. Preserve unfinished task lists and personal/installed app data.

## Tasks

- [x] Review published release dates, fetch origin/master and tags, and verify the release branch is clean and contains remote master.
- [x] Review the exact snapshot and consolidate pending notes into five user-facing bullets; the Mac Back task is already finalized at `tasks/done/2026-10-22_tasks-mac-back-navigation.md` and committed in `9b8b6d0`.
- [x] Reuse completed test evidence; record skipped/untested coverage rather than expanding the smoke matrix.
- [ ] Run the release dry run and establish publication eligibility under the Berlin daily rule.
- [ ] Run full `npm run release`, keeping all four manifests/lockfiles aligned; validate the distribution and publish the annotated tag and asset.
- [ ] Verify the published tag, body, versions and downloaded asset SHA-256.
- [ ] Archive the exact published body and this QA report, reset only shipped pending notes, and commit/push bookkeeping.

## Snapshot and existing validation

- Base source: `9b8b6d0cbe844634444a59c6fb866b319cbfee42`; remote master is an ancestor, with no divergent remote work. This preparation changes only release notes/QA, followed by the release command's four version files.
- macOS 15.7.7 (24G720), arm64, Node 26.7.0, Electron 44.8.0. No dependency or architecture change is required for this release.
- Final `npm run build` then `node --test`: 1,158 passed, one optional real-QMD 2.8.3 test skipped, zero failed. Final runtime/editor build before the bump: see the finalized Back-navigation task's source fingerprints. These results cover the entire release source snapshot; release-note-only preparation does not alter code.
- Passed final production-window Back-navigation, existing Electron onboarding/auth/sandbox/editor/close, and companion browser search/reference/settings/freeze/switch smoke tests. Three interleaved prior/current window comparisons found bounded six-entry history and no meaningful added-memory regression in the disposable fixture.
- Earlier committed task archives record shared graph search, attention, sidebar/update controls, `@` references and missing-reference creation verification. No new manual or broad smoke suite is requested; reuse this evidence and let the release workflow run its required automated validation and pack checks.
- Logs for this turn remain ignored under `.local-pack/release-0.3.6/`; navigation evidence remains under `.local-pack/back-navigation/`.

## Limits and authorization

- Physical mouse/trackpad emission, standard two-finger swipe, Intel, physical Keychain/login/clipboard/accessibility, real published-release upgrade and additional large-corpus/model/RAM acceptance are untested. These are not claimed passed. No installed app/CLI update or memory write is part of publication.
- Published `v0.3.5` timestamp: 2026-10-22T16:20:03Z (18:20:03 Europe/Berlin). At preparation, local time is still 2026-10-22. `docs/releases.md` requires an explicit override for another publication on that Berlin day; recheck the day and latest release before starting publication. Do not infer a same-day override from a generic release request.
