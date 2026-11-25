# v0.3.28 real-use follow-ups

Open problems found on 2026-11-25 while using published v0.3.28 on the owner's Mac and in a throwaway Linux install on the VPS. The fixes made the same day are in [the real-use fixes](../done/2026-11-25_tasks-v0.3.28-real-use-fixes.md), which also records the test runs.

## Open

- [ ] **P1 — App and CLI updates keep the versioned Homebrew Node path.** v0.3.28 makes the *installer* pin `/opt/homebrew/opt/node/bin/node`, but the Mac app update (GUI or `jumpybrain update`) reuses the Node recorded in the app's `Configuration.json` and leaves the CLI shim and `install-manifest.json` unchanged. Observed: after updating the owner's Mac from 0.3.27 to 0.3.28 the shim, manifest and app configuration still point to `/opt/homebrew/Cellar/node/26.7.0/bin/node`. So existing users get the fix only after a `brew upgrade` has already broken them and they rerun the installer.
  - Design to evaluate: in `integrations/electron/updater.mjs`, derive the target Node with `durableNode(native.node)` (same-executable check only). Build the new app with that Node. In `update-transaction.py publish`, write the regenerated shim (`cliShim`) and `manifest.node` as journaled exchanges, so rollback restores them. `installer.configuration()` equality must then compare against the pre-update value, not the migrated one.
  - Check: `test/desktop-updater.test.js` (shim/manifest migration and rollback), one `node scripts/desktop-update-smoke.mjs success`, plus a fixture whose Cellar path is a link target of `opt`.
  - Until then, the repair is to rerun the installer (`… install.sh | bash -s -- --with-app`), which records the stable link.

- [ ] **P2 — Smart search loads the model for every query.** On the VPS (2 vCPU x64, Ubuntu 24.04, Node 22.23.1) every smart search took 6.6–7.1 s, keyword-only about 1.2 s. The search engine runs as a fresh QMD child process per query (see `src/adapters/qmd/qmd.docs.md`), so the 334 MB model is loaded each time; the backend daemon stays at about 80 MB. Measure the Mac (Metal) cost too, then decide between keeping one warm QMD process per root in the backend and documenting the latency in the smart-search explanation.

- [ ] **P2 — Backend from a previous update kept running.** On the owner's Mac a v0.3.27 `daemon.js` (started 2026-11-22 23:28 with the v0.3.27 update) was still alive on 2026-11-25 with no listening socket, no lease and 0 % CPU; the current owner was a different process. It was stopped by hand. Not reproduced on v0.3.28: an idle daemon exits on SIGTERM, and one that served a search and a save exits after losing its lease. Watch for it after the next update (`pgrep -fl dist/server/daemon.js`, compare with `.jumpybrain/backend/owner.json`). A leaked process keeps its runtime generation pinned, which blocks retiring that app version's files.

- [ ] **P3 — Test runs leave backends running.** Found still running: a `scripts/install-smoke` home from 2026-11-22 (`/private/tmp/jb-smoke-*`, listening on loopback) and the v0.3.28 release's disposable `personal` install (both stopped by hand), plus a worktree's scratch brain. Smoke scripts and the release routine that install into a disposable home should run `jumpybrain backend stop --root <root>` (or stop the owner from `owner.json`) before removing or abandoning the home.

- [ ] **P3 — Remote status suggests a local-only command.** `status --target-url` prints "Optional: index --setup-semantic with the same local root…", which cannot apply to a remote brain; the local wording elsewhere is now `smart-search on`. Show nothing (or a server-operator hint) for remote targets.

## Not done here

- Safari and the 400-day cookie: still untested (no Safari on the test machine).
- Intel Mac: still untested. Linux x64 was tested on the VPS.
- Upgrading the shared VPS brain (still 0.3.23) was not part of this run.
