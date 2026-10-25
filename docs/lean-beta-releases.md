# Lean beta releases

Follow [the release process](releases.md) and the current [testing guide](release-testing.md). This is a small beta: keep the routine gate proportional and spend additional verification on changed behavior or observed failures.

## Current routine

- Choose the exact snapshot, review pending notes and preserve unrelated work. Release only when requested; the daily cadence and major-version approval rules still apply.
- Prepare with a build, fresh desktop package and one core note-lifecycle smoke. Reuse passing evidence for unchanged inputs. The full `npm run release` owns the mandatory versioned deterministic suite, CLI packaging, version commit/tag/push and GitHub publication.
- Select a focused additional check when a changed area needs integration evidence. The browser and installed-updater suites remain available, but neither a normal package change nor a routine beta release triggers the entire matrix. Choose extra rollback/compatibility modes only for the path being changed or a concrete unresolved concern.
- Stop for demonstrated data loss, false Saved/update success, broken core retrieval or a broken distribution. Fix failures and rerun affected checks; do not remove assertions to make publication pass.
- Verify the published tag, exact notes, aligned component versions, asset and digest. Archive only shipped notes and record the selected checks/limits. Publication and installation on this Mac are separate actions.

The owner explicitly asked on 2026-10-25 to cut release testing by at least half after the v0.3.9 preparation started an oversized matrix. The testing guide now makes three preparation commands the default, followed by the full release workflow, replacing the previous seven preparation commands and automatic broad change-area matrices. This is a workflow reduction, not a measured wall-clock performance claim.

## Remaining automation limits

`scripts/release.mjs` still runs `npm test` and then `cli:pack`, which builds again. There is no release-command lean/thorough flag and no need to add a new framework for the current routine. Removing those internal duplicate builds can be a separate tooling change that preserves final-candidate validation and pushed-but-unpublished recovery.

The one-release-per-Europe/Berlin-day convention remains, with an explicit override for a second release. No automatic publication or timer was introduced. Wider scale-up testing remains deferred in [the scale-up plan](../tasks/todo/tasks-release-testing-at-scale.md), subject to owner judgment about observed bugs or growth. Downloads are not unique users.

## History

On 2026-10-22 the owner asked for more practical small releases. The v0.3.5 QA record contained 21 packaging/smoke commands totaling about 768 seconds beyond the full suite/publication; five updater scenarios accounted for about 417 seconds. The [original lean-beta task](../tasks/done/2026-10-24_tasks-lean-beta-releases.md) records that earlier proposal. The 2026-10-25 direction turns the smaller verification selection into the current guide while keeping the full publication workflow and honest evidence requirements.
