# Unified installed updates

## Goal / decisions

One managed installed runtime serves the CLI and optional macOS companion. Development checkout and canonical memory stay separate. `jumpybrain update` refreshes both installed components from the recorded source/ref. No automatic quitting: wait for Saved, quit the companion, update, reopen. Legacy snapshot companions migrate on the default installation only; other runtime bindings are not adopted.

## Tasks

- [x] Implement shared-runtime companion configuration, staged native build, ownership checks, singleton locking, and rollback of paired runtime/app replacement.
- [x] Wire installer/CLI update detection, read-only preview, preflight, and staged paired commit.
- [x] Test no-companion, legacy migration, managed/custom roots, running-app refusal, build failure and rollback; validate disposable native lifecycle.
- [x] Document initial setup, unified updates, one-time migration, dependencies and failure boundaries. Shortened setup/app docs and added visible macOS app (beta) links without changing the README's opening copy.
- [x] User-requested personal installation update: after save/quit confirmation, deployed the verified packaged local build and migrated the companion; future update source remains GitHub master.

## Relevant files

- `scripts/public-install.mjs`, `scripts/macos-companion.mjs`, `scripts/public-uninstall.mjs`, `install.sh`
- `package.json`, `scripts/local-pack-manifest.mjs`
- `src/cli/update.ts`, `src/cli/cli.docs.md`
- `integrations/macos-companion/` — lifecycle, installation, update transaction, tests, docs
- `test/install-scripts.test.js`, `test/macos-companion-update.test.js`
- `README.md`, `docs/install.md`, `docs/cli-commands.md`

## Verification / boundaries

- Existing unrelated working-tree changes are preserved.
- Live installed app/runtime were not replaced or restarted during implementation. After explicit update authorization and quit confirmation, both installed components were updated. The companion was left stopped for the user to reopen.
- Native build requires macOS/Xcode tools, Python, and existing Node/QMD; no downloadable binary distribution added.
- Catchable paired-swap errors roll back; power-loss/SIGKILL during replacement still requires manual recovery from retained transaction directories.
- Independent review found concurrent staging deletion, reserved-path data deletion, and older-ref bootstrap dependency issues. Fixed with an installation-wide lock, uniquely owned scratch paths, and separate installer/runtime ref selection; regression coverage added.
- Final verification: build/package validation passed (118 required files), all 285 Node tests passed (includes 31 Python transaction tests), real disposable native build/lifecycle smoke passed, and `git diff --check` passed.
- Publication verification: an isolated staged snapshot passed all 284 tests without the unrelated uncommitted search-click regression; the publication guard passed across all 71 outgoing files.

## Deployment note

The first deployment used the new installer against the verified compiled local package because GitHub does not yet contain the working-tree change. Restored the original manifest source/ref after this one-time local-source install, leaving future updates on GitHub master and retaining original installer options. Verified companion configuration points to the shared installed runtime, the old snapshot is absent, code signing validates, installed `update --dry-run` includes the companion and GitHub source, canonical Markdown/config checksums are unchanged, and key/remote-policy/login settings are unchanged. Temporary deployment/recovery files were removed after successful verification. This first local deployment preceded publication; subsequent updates use GitHub master.
