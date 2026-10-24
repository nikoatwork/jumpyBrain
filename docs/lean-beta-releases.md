# Lean beta releases

Read this when preparing a beta release through [the release process](releases.md). It records the standing direction for keeping releases practical during the small beta. [Release testing](release-testing.md) owns the current commands and required checks; this document does not replace those gates or imply that the proposed automation below exists.

## Before each release

- Choose the exact release snapshot and review the pending notes. Preserve unrelated work in a separate checkout. Release only when requested, following the current publication cadence and major-version approval rules in the release process.
- Plan verification around core outcomes: write and reopen canonical Markdown, recall and expand with provenance, protect stale/failed-save drafts, and validate the actual distribution and aligned component versions. Follow the current required commands in release testing.
- Reuse passing evidence for unchanged source/artifacts where the workflow permits it. Run builds and checks sequentially when they share generated output; never overlap a destructive build with tests consuming it. The current release command still runs its own validation.
- Choose additional checks for changed behavior or known regressions. Keep broader browser permutations, updater failure scenarios, semantic/model exercises and manual device coverage scoped by the testing guide. Do not silently grow routine beta checks into an exhaustive matrix.
- Stop for demonstrated data loss/overwrite, false Saved/update success, broken core retrieval, or a broken/mismatched distribution, and resolve failures of applicable required gates. Record untested areas honestly.
- Verify the published tag, notes, asset version and digest. Archive the exact shipped notes and clear only shipped pending bullets. Publication and updating this Mac are separate outcomes.

Keep evidence concise: snapshot/environment, required checks and outcomes, extra checks and reasons, known limits, release link and verified artifact. Follow the testing guide's current QA archive requirement; avoid duplicating the same report across files.

## Efficiency direction and current limits

Aim for one deterministic suite/build, one compact core-flow smoke, and artifact/version validation, with deeper checks available when warranted. Preserve useful tests and recovery paths. Reuse existing commands rather than adding a risk-scoring framework, testing service or release matrix.

The automation has not yet reached that target:

- `scripts/release.mjs` runs `npm test`, then `cli:pack`; `scripts/pack-local.mjs` builds again. The documented pre-release checks also overlap release-owned validation. Removing this duplication needs a separate tooling change that validates the final versioned candidate and packs the tested output.
- There is no release-command lean/thorough mode. Existing comprehensive checks remain callable; do not assume an undocumented flag exists.
- Failed-core-check publication blocking and pushed-but-unpublished recovery still need focused workflow-fixture verification for any new lean automation. Use the existing documented recovery procedure without another version bump.
- Roughly 80% less routine verification time/operator effort is a target, not a measured result. A comparable fresh run must separate builds, tests, publication, retries and local installation before claiming that reduction. It is not a benchmark to rerun as a prerequisite to every release.
- The one-release-per-day convention remains in force. The original proposal to revisit it did not change publication authorization.

## Why this guidance exists

On 2026-10-22 the owner asked for frequent small releases with less operator effort. The v0.3.5 QA record contained 21 packaging/smoke commands totaling about 768 seconds beyond the full test suite and publication workflow; five installed-updater scenarios accounted for about 417 seconds. These are historical observations from one machine, not a universal timing baseline or promise.

Repeated builds, duplicate suite runs and stale fixture assertions added avoidable work. Keep assertions tied to user outcomes and repair fixtures when behavior intentionally changes.

Broader testing remains in [the deferred scale-up plan](../tasks/todo/tasks-release-testing-at-scale.md), activated by owner judgment about observed bugs or a review at roughly 200+ downloads. Downloads are not unique users. The [superseded planning list](../tasks/done/2026-10-24_tasks-lean-beta-releases.md) preserves the original proposals; it is not a per-release checklist.
