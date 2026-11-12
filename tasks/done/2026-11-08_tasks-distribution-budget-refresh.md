# Refresh reviewed distribution limits

Status: complete. User-authorized distribution ceilings refreshed; package size and retained enforcement checks pass.

## Goal

Restore useful distribution headroom for the current product while retaining
measured limits and negative overage controls. No push, installation or release.

## Decisions

- Starting source: `c612fef`, clean `master`. User explicitly authorized raising the distribution limits and committing the result.
- New limits: 1,500,000 compressed bytes; 4,800,000 unpacked bytes; 3,200,000 runtime bytes; 700 files. Shared-editor and optional-renderer gzip limits stay unchanged.
- Previous ceilings: 1,450,000 / 4,600,000 / 3,100,000 bytes / 660 files. Current product snapshot measured 1,462,963 / 4,625,618 / 3,097,281 bytes / 666 files. These are npm package metrics, not installed app/model disk usage.
- Preserve exact budget assertions, indispensable resource checks and one-byte/one-file overage rejection. Do not remove content or add dependencies merely for this reset.
- Create the focused live-metadata attention follow-up. Keep broad package trimming with the existing portable-installation list rather than duplicate that scope.

## Tasks

- [x] 1.0 Adjust the four explicit limits and their exact test assertion; document the measured authorization and headroom decision.
- [x] 2.0 Verify the actual package plus footprint/manifest regression tests; record final metrics and runtime-build provenance.
- [x] 3.0 Create the actionable follow-up, finalize this record, archive and commit scoped changes through [task completion](../../docs/task-workflow.md).

## Relevant files

- `scripts/package-budget.mjs`, `test/package-footprint.test.js` — limits and retained enforcement.
- [Footprint guide](../../docs/build-footprint.md) — owning budget policy and rationale.
- [Live metadata follow-up](../todo/tasks-live-note-attention.md) — supported current-note attention across live/HTTP publication.

## Verification and outcome

- `node --test test/package-footprint.test.js`: **4/4 passed**. Exact reviewed limit assertion, actual package/resources, npm exclusions, all four over-limit rejection cases and malformed-metric checks remain enforced. Only expected ceiling values changed; no negative assertion was relaxed or removed.
- `npm run check:package-size`: **passed**, actual package **1,462,963 archive / 4,625,618 unpacked / 3,097,281 runtime bytes / 666 files**. Remaining capacity: **37,037 / 174,382 / 102,719 bytes / 34 files**. The footprint guide is excluded from the package, and this task/follow-up are repository-only, so these final documentation changes do not alter the measured artifact.
- `node --test test/local-pack-scripts.test.js test/local-pack-properties.test.js`: **31/31 passed**, including required runtime/installer resources, stale/forbidden files and omission controls.
- Reused the already-built editor/runtime from the preceding session pilot, source `bc754a441f5b18240568e1923668ef6b79d4a15a` integrated by `c612fef`. Verified all **267** TypeScript/build/package inputs against its pinned manifest; none changed. Only the directly loaded budget script/test and repository docs/planning changed, so rebuilding or repeating Chromium would not exercise an affected runtime boundary.
- Created [current-note live attention](../todo/tasks-live-note-attention.md) as the next scoped editor follow-up. It starts with a failing reproduction and requires revision-aware publication, private-draft/Undo/caret preservation and real Chromium attention actions. General payload trimming remains with [portable installation](../todo/tasks-portable-installation-project-integration.md). The new list stays active because implementation was not requested in this turn.
- Owning footprint documentation and the completed budget decision in the changelog are updated. No user-facing release note is needed for packaging policy/planning alone. Relative links and `git diff --check` are verified before commit.
- Limits: these are npm artifact policy checks, not native installation, published release, semantic quality or app behavior validation. Prior full frozen editor evidence is unchanged. No version bump, push, installation or release was performed.
