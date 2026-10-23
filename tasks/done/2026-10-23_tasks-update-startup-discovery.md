# Update discovery after a completed update

Status: completed and archived 2026-10-23. Startup now discovers newer releases after persisted success/recovery; regression and production Electron checks passed. Queued for the next release.

## Goal and reproduced failure

The installed Mac app restored an old successful-update record and showed “Update installed and verified” on launch without discovering the newly published release. The native Check for updates menu immediately exposed Download update. Startup only admitted idle/current/canceled states, excluding persisted success/recovered states.

## Tasks

- [x] Reproduce the installed behavior with computer use and trace startup discovery.
- [x] Fix startup discovery for completed updates while preserving active jobs and recovery/failure actions.
- [x] Verify persisted-state regression cases and actual Electron startup/sidebar discovery with disposable fixtures.
- [x] Update desktop contract and pending release note, archive this task and commit the scoped fix.

## Scope

One observational release check at app launch after a completed update. Keep explicit download/restart, pending updates and recovery intact. Periodic discovery, publication and installation are outside this fix.

## Relevant files

- `integrations/electron/{application,updater,smoke-unified-app}.mjs`
- `scripts/unified-desktop-smoke.mjs`
- `test/desktop-updater.test.js`
- `integrations/electron/electron.docs.md`
- `tasks/todo/release-next.md`

## Verification

- Base snapshot: `6c59372` plus this scoped fix; macOS 15.7.7 arm64, Node 26.7.0, Electron 44.8.0.
- Before the fix, the production Electron fixture timed out at “discover release after completed update”, reproducing the persisted-success startup failure. Log: `.local-pack/update-startup/regression-before.log`.
- After the fix, `npm run smoke:desktop` passed normal, crash and recovery modes. Each process discovered the synthetic newer release once from persisted success without manual menu interaction, opened the sidebar update control and preserved lifecycle/save barriers. The existing native host/runtime resources were reused; the changed application/updater modules ran directly from this checkout. Log: `.local-pack/update-startup/regression-after.log`.
- `node --test test/desktop-updater.test.js`: 26 passed, zero failed. Persisted success/recovered records discover newer releases without preparing software or altering transaction files; preparing/ready/updating, failed preparation and interrupted recovery retain their state/actions. Cold startup and a simultaneous manual check share the same operation.
- Visually inspected `.local-pack/update-startup/startup-update.png`: newer target and sidebar update control visible. The fixture has no managed CLI, so it correctly offers the app-only scope.
- Full `npm test`: 1,207 tests, 1,206 passed, one optional real-QMD test skipped, zero failures. Includes the final cold-start/simultaneous-manual-check regression. Log: `.local-pack/update-startup/npm-test.log`.
- `git diff --check` passed; scoped staged guard passed before commit.

## Outcome and limits

- Startup policy lives in the updater's `checkOnStartup()` operation; application startup calls it once. Completed success/recovered records no longer permanently suppress discovery. Pending jobs and actionable failures/recovery remain intact. Checking remains observational; explicit download/restart is unchanged.
- All new checks use temporary app resources, homes, profiles and synthetic release discovery; no personal installation/history/notes were changed. Native hardware/real public-release upgrade coverage is not claimed. This fix is queued for the next release; no publication or installation is part of this task.
