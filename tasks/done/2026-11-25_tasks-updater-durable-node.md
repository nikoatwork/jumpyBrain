# Updates move existing installs to the stable Homebrew Node link

Owner request (2026-11-25): fix the updater so existing installs stop pinning a versioned Homebrew `Cellar` Node path. v0.3.28 only fixed this for installer runs (`durableNode` in `integrations/electron/install-shim.mjs`). The GUI update and `jumpybrain update` keep the app's `Configuration.json` Node, the CLI launcher and `install-manifest.json.node`. The owner's Mac showed this after its 0.3.27 → 0.3.28 update. The next `brew upgrade` can then stop the app and CLI from starting. Found during [v0.3.28 real use](../done/2026-11-25_tasks-v0.3.28-real-use-fixes.md); this replaces the P1 item in [the follow-ups](2026-11-27_tasks-v0.3.28-real-use-follow-ups.md).

## Constraint: mixed versions during one update

During an update from version A to version B:

- **From A (installed app):** `updater.mjs`, `update-worker.mjs`, `update-transaction.py`, `update-policy.mjs` and `install-shim.mjs`. The updater copies its own files into the update directory.
- **From B (downloaded release):** `install.mjs` with `desktop-install.py prepare`, which builds the new app and seals `Configuration.json` into the native helper, plus `desktop-install.py` as imported by the transaction (`installer.configuration()` and `running_apps`).

So:

- A change in `prepare()` reaches the app on the first update to B.
- A change in the transaction reaches the CLI only on updates that start from B or later.
- `configuration(home)` must keep returning the installed value unchanged: the transaction compares it with A's `request.configuration`, and a normalized value would fail every A → B update with "App configuration changed during preparation".

## Tasks

- [x] **1. New app builds pin the stable link.** In `desktop-install.py prepare()`, set `config['node']` to the Homebrew `opt` link when it resolves to the same executable (the Python twin of `durableNode`). `configuration()` stays unchanged. Covers GUI updates, `jumpybrain update`, `desktop:setup` and installer app builds.
- [x] **2. The update transaction migrates the CLI launcher.** In `updater.mjs`, when the managed CLI's launcher is exactly the current `cliShim` for `manifest.node` and `durableNode(manifest.node)` differs, put the regenerated launcher and target Node into the request. In `update-transaction.py publish`, write the new launcher (0755, nlink 1) and `manifest.node`. Both go in as journaled exchanges next to the runtime and manifest exchanges, so rollback restores the old launcher. If the launcher is a legacy or other shape, leave it alone. The worker also runs the migrated launcher (`--version`) before reporting success; a failure rolls everything back.
- [x] **3. The backend starts with the path it was launched by.** `spawnRootBackend` uses `process.execPath`, which Node resolves to the `Cellar` path even when it was started through the `opt` link. Use `process.argv0` when it is absolute and resolves to the same executable. This also keeps the gateway and CLI from starting a backend via a path a `brew upgrade` deleted.
- [x] **4. Tests.**
  - `test/desktop-updater.test.js`: the request carries the migration only for an exact current launcher whose Node has an `opt` link. A non-Homebrew, legacy or customized launcher stays untouched.
  - Transaction: publish writes the launcher and manifest, and rollback restores them.
  - Python unit test for the `prepare` helper.
  - Backend spawn path test.
  - One `node scripts/desktop-update-smoke.mjs success` on this Mac.
- [x] **5. Docs and notes.** `docs/install.md` (repair section), `integrations/electron/electron.docs.md`, `src/adapters/backend-host/backend-host.docs.md` and the pending release note. Say plainly that the CLI part arrives one update later, and that rerunning the installer fixes everything at once.

## Outcome (2026-11-25)

- Task 1: `durable_node()` in `integrations/electron/desktop-install.py`; `prepare()` seals it into `Configuration.json`, and `configuration()` is unchanged.
- Task 2: `update-policy.mjs` reports `shimForm: 'pinned' | 'legacy'` and, for pinned launchers, the recorded `node`/`qmd`. `cliNodeMigration()` in `updater.mjs` adds `request.cliNode`. `update-transaction.py` checks that the manifest Node is still `from` and that `to` resolves to the same file. It then writes `new-launcher` (0755) and `manifest.node`, and exchanges the launcher after the runtime and manifest. `update-worker.mjs` runs the new launcher after publishing.
- Task 3: `launchedNode()` in `src/adapters/backend-host/index.ts`, used by `spawnRootBackend`.
- `scripts/desktop-update-smoke.mjs`: plain `success` now models a Homebrew `Cellar` Node for the app and a pinned CLI launcher. The new `success --client-v0.3.28` runs the published v0.3.28 updater files in the old app.

## Verification

All on macOS 15.7.7 arm64, Node 26.7.0. `npm run build` and `npm run desktop:pack` ran first.

- Python: `python3 -B -m unittest discover -p 'test_*.py'` in `integrations/electron`, 49 tests OK. New: `DurableNodeTests` (the helper, plus `prepare` sealing the stable link without changing `configuration()`), and the transaction tests for launcher migration publish and rollback, failure at each of the four exchanges, and refusal of a changed Node.
- JS: `node --test test/desktop-*.test.js test/backend-host.test.js test/installer-*.test.js test/installation-storage.test.js`, 135 pass, 0 fail. New: launcher migration eligibility in `test/desktop-updater.test.js` and `launchedNode` in `test/backend-host.test.js`.
- `node scripts/desktop-update-smoke.mjs success`: PASS, `homebrewNode: app+cli`. The app `Configuration.json`, `manifest.node` and the launcher end on `brew/opt/node/bin/node`, and the installed CLI runs. No smoke processes were left behind.
- `success --client-v0.3.28`: PASS, `homebrewNode: app`. The app moved; the CLI launcher stayed on its working `Cellar` path, unchanged.
- `success --client-v0.3.7`: PASS. The historical worker is still compatible.

## Limits

- Not yet run through a real published release. The first real case is the update to the next release.
- A real `brew upgrade` was not simulated; the fixture uses symlinks to the running Node.
- An update started by v0.3.28 or older moves only the app. The CLI moves on the following update, or right away with an installer rerun.
- Intel Macs are untested.

## Not in scope

- Non-Homebrew Node managers (nvm, asdf, Volta): their paths are already stable, or are the user's choice.
- A major Node upgrade can still need native QMD dependencies rebuilt. The installer rerun stays the repair for that.
