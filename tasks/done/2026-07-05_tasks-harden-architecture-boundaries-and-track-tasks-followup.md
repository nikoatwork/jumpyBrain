# Harden Architecture Boundaries and Track Tasks Followup

## Goal

Address review findings from the last commit that are important enough to track: public-safe task history and a package-export decision that contradicts current architecture docs.

## Completion Summary

Completed on 2026-07-05. Public task history was scrubbed and guarded against high-confidence operational breadcrumbs; the restrictive package `exports` map was removed to preserve the documented source/installer-first package direction.

## Notes

- Review scope: last commit `Harden architecture boundaries and track tasks` only.
- Do not update `tasks/CHANGELOG.md` for merely creating this followup list.
- Prefer the smallest fix that preserves the source/installer-first architecture unless the package-export decision is intentionally being changed.

## Relevant Files

- `tasks/done/2026-07-03_tasks-10-cloud-shared-memory-v1.md` - Newly tracked archived task list includes live deployment identifiers and operational breadcrumbs.
- `.gitignore` - Last commit intentionally made task tracking committed, increasing the need for public-safe task-log hygiene.
- `scripts/precommit-guard.mjs` - Existing guard catches secrets but not the operational breadcrumbs observed in tracked task logs.
- `test/precommit-guard.test.js` - Regression coverage for any new guard rule.
- `package.json` - Last commit added a restrictive `exports` map for `.`, `./runtime`, and `./server`.
- `docs/technical.md` - Still says not to add a restrictive `package.json` exports map unless npm-package direction is explicitly decided.
- `tasks/done/2026-07-04_tasks-architecture-pragmatic-self-hosting-decisions.md` - Newly tracked decision record says not to add a restrictive `exports` map.
- `test/package-entrypoints.test.js` - New test encodes the restrictive export-map behavior.

## Tasks

- [x] 1.0 Scrub and guard public task history
  - [x] 1.1 Redact live VPS/IP, host label, `root@...`, personal SSH key path, and exact deployment breadcrumbs from `tasks/done/2026-07-03_tasks-10-cloud-shared-memory-v1.md`; use placeholders where operational examples are still useful.
  - [x] 1.2 Scan newly tracked `tasks/done/` and `tasks/todo/` files for similar public operational identifiers before keeping task tracking committed.
  - [x] 1.3 Add a focused precommit-guard rule for task logs that blocks high-confidence operational breadcrumbs such as `root@<public-ip>`, non-placeholder `~/.ssh/...` paths, and public IPv4 deployment notes while allowing documented placeholders and localhost examples.
  - [x] 1.4 Add or update guard tests in `test/precommit-guard.test.js` for the new task-log hygiene rule.
  - [x] 1.5 Document the task-log hygiene expectation near the guard or task workflow docs so future archived task lists are scrubbed before commit.

- [x] 2.0 Resolve the package export-map/documentation contradiction
  - [x] 2.1 Decide whether the new `package.json` `exports` map is intentional despite the recorded source/installer-first decision. Decision: not intentional; keep the source/installer-first guidance.
  - [x] 2.2 If not intentional, remove the restrictive `exports` map and rewrite `test/package-entrypoints.test.js` so it guards the intended installer/package behavior without blocking internal source-layout transparency.
  - [~] 2.3 If intentional, update `docs/technical.md` and add a clear superseding decision note explaining the supported import surfaces and why the previous “no restrictive exports map” guidance changed. Skipped: export map was removed, so existing docs remain correct.
  - [x] 2.4 Keep `scripts/local-pack-manifest.mjs` aligned with the final decision so local packaging validation and package entrypoint behavior do not drift. Verified with `npm run cli:pack`; no manifest change needed.
