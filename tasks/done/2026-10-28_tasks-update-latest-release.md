# Update directly to the latest release

Status: completed 2026-10-28. Existing behavior already selects the highest published version directly; no runtime change was needed. Added regression coverage and clarified the selection/pinning contract.

## Goal

Verify that supported updates select the highest published version directly, even when multiple releases ahead of the installed version.

## Tasks

- [x] Inspect desktop and CLI selection, preparation and installer behavior.
- [x] Cover multi-version jumps and paginated discovery with focused regressions.
- [x] Clarify the existing selection contract, run checks and archive/commit the result.

## Findings

- Desktop and supported paired CLI updates share `update-release.mjs`: published numeric tags are sorted by version descending, including beta releases. No incremental upgrade chain exists.
- Discovery reads up to three pages of release history and fails if that bound is exceeded. A missing/unverifiable newest asset fails rather than silently choosing an older release.
- The release offered by the last check is pinned for preparation/restart. A later publication requires another check; active preparation/recovery retains its existing target.
- Standalone/legacy CLI updates rerun the installer against the recorded source/ref (default `master`), fetching that ref directly. Explicit pins/custom sources remain intentional exceptions to published-release selection.

## Verification

- Tested snapshot: `1353689` plus this task's test/documentation changes.
- `node --test test/desktop-updater.test.js`: 27 passed, zero failures/skips, including existing archive/recovery, ownership and paired-CLI checks.
- The production discovery/selection and preparation code, with mocked HTTP responses and worker spawning, selected `0.3.11` directly from installed `0.3.3` despite intervening `0.3.4`, `0.3.9` and `0.3.10`. Both managed-pair and pinned-CLI app-only requests retained the exact selected version; duplicate clicks prepared once.
- Paginated discovery selected the highest version on the second page even when an older version had a later publication date, excluding drafts and unpublished releases.
- `git diff --check` passed. Only tests, owning documentation and task history changed; no pending release note was added because product behavior is unchanged.
- Limits: disposable fixtures only. No live release download/install, user installation, publication or push was performed. This does not change the intentional last-check pinning or standalone CLI source/ref policy described above.
