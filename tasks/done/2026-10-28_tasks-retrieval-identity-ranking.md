# Cheap canonical-identity ranking follow-up

Status: completed 2026-10-28 — rejected after both fresh confirmation sets failed to improve. [Final report](../../evals/workspace-retrieval/reports/2026-10-28-identity-v4.md).

## Goal and gates

Recover useful same-subject evidence using canonical names/aliases already present in metadata, with no model, new candidate discovery or context increase. Follow [the frozen identity contract](../../evals/workspace-retrieval/IDENTITY-EXPERIMENT.md): +5 points on affected support, >=2 improved fresh reserved tasks, no overall/protected evidence loss, <=5% interaction tokens, <=10% quiet-window warm p95 and <=50 MiB extra RSS. Names are relevance hints, never truth or approval.

## Work

- [x] Inspect failure mechanism and write a pure metadata-only prototype without corpus-specific names.
- [x] Freeze fresh Selkie ferry and Tamar water-maintenance workflows, queries, source rubrics and numeric gates before output inspection. Earlier v1/v2 questions are seen controls.
- [x] Run unchanged-runtime v3 baseline (195 pages / 112 tasks), then independent identity arm, with all source verification and original bounded interaction policy.
- [x] Review changed packets for subject, scope, applicable time and actual supporting sources; separate mechanical coverage from same-author judgments and unmeasured answer accuracy.
- [x] Measure quiet-window paired retrieval/RSS if quality passes. Verify exact navigation, constraints, ambiguity, temporal scope and local/hosted parity.
- [x] Adopt only if every gate passes; otherwise retain reproducible no-adoption evidence and no production machinery.
- [x] Run required checks; record exact artifacts/results/remaining limits; update owning docs/release notes for adopted behavior; archive, repair links, update changelog and commit scoped work to master under the repository task workflow.

## Pilot and confirmation extension

- V3 pilot: 195 pages / 112 tasks, unchanged lexical runtime 53 complete required-span tasks versus identity 69; affected slice 7/46 → 21/46 (+30.43 points), no unit/task regressions, +0.625% full interaction tokens, zero provenance/budget failures. The eight new Selkie/Tamar tasks had 7/8 baseline completion and no improvements; this does not pass the fresh-confirmation gate. Keep the policy provisional.
- Separate quiet-window local probe: 20 paired calls after warming six representative queries, alternating arm order. Baseline p95 1299.24 ms versus identity 1307.20 ms (+0.613%); peak sampled process-tree RSS +1.063 MiB, within the declared limits. GPU/model work absent. [Raw compact timing](../../evals/workspace-retrieval/reports/2026-10-28-identity-timing.json).
- [Final fixed-policy confirmation](../../evals/workspace-retrieval/IDENTITY-CONFIRMATION.md): three new authored workflow families / 15 pages / 12 reserved tasks added before outputs. Retain all previous tasks and exact policy bytes; no threshold relaxation or policy tuning. Run the unchanged 210-page / 124-task baseline first, then identity. No further extension in this investigation. Same-author/repeated-confirmation limits stay explicit.

## Final decision

- Final isolated v4 comparison: 60/124 → 77/124 complete required-span interactions; affected slice 13/55 → 27/55, no task/unit losses, +1.007% interaction tokens. Nevertheless the 12 fresh tasks remain 9/12 in both arms; the two-improved-fresh-task gate fails at zero. The earlier eight-task confirmation also remains 7/8. No threshold was relaxed or further extension attempted.
- The fresh orientation briefs are absent from all 38 grouped candidates (40 raw); purpose and named owner are therefore not displayed. Reordering cannot repair discovery. Same-author source inspection confirms this missing support, independent of phrase-scoring limitations.
- Candidate source integration, its adoption-only tests and interrupted product verification were removed/stopped. No runtime change is adopted; final source diff is empty. Pure eval policy and frozen comparisons remain reproducible. Candidate validation and the earlier timing probe are diagnostic history, not adoption evidence.
- Final adoption-specific performance/combined-arm/release updates are skipped after fresh-quality failure. No pending release note is warranted for evaluation-only work.

## Final verification and archive

- Completed 2026-10-28 on `master`. No production-source changes remain; all rejected candidate machinery was removed from `src/`. No version bump, default dependency, memory write, install, push or release.
- Final clean snapshot: production source at `46fa41f` plus the scoped eval tooling/inputs and seven pure eval regressions. `npm test`: 1,444 tests, 1,443 passed, 0 failed, 1 opt-in skip, 53.954 s. Eight real QMD 2.8.3 runtime/local-CLI/hosted-CLI and edit/rename/delete/rebuild checks passed with non-loopback network denied.
- Package dry run: 514 files; all 231 required installable paths validated; zero eval files shipped. `git diff --check` and all experiment task/report Markdown references pass. A pre-existing changelog link to the absent `todo/tasks-page-reference-manual-qa.md` remains outside this scope.
- Raw archive: `/Users/monkey/dev/jumpyBrain-retrieval-evaluation/workspace-experiments-2026-10-28/2026-10-28-experiments-v2-v4.tar.gz`; 12,439,767 bytes; SHA-256 `365705392392a41555cc2c5a45927c14c6202c282ed21bd1ab424f815bef82d7`. Contains exact accepted freeze/packet/score/log artifacts, original source/compiled runtime, tooling snapshots, model-cost probes and final checks; excludes rebuildable roots/indexes/dependencies. Failed-freeze and stopped candidate attempts remain explicitly excluded from accepted results.
- Limits: same-author synthetic judgments, no evaluated answer agent or independently adjudicated aggregate, no semantic experiment replication or Linux/VPS/browser study. Adoption-only checks not reached are not passing results. Further named-subject work should test candidate generation before final-pool ranking, with new scenario families.
- Archived and committed together with scoped evaluation inputs, tests and reports under the repository task workflow. Broader workspace evaluation remains active.
