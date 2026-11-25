# November 23–24 feedback fixes

Work from the [feedback index](../feedback.md) on a disposable local install and hosted browser fixture.

- [x] **P1 — Recover the managed CLI and Mac app after a Homebrew Node upgrade.** New and repaired installs keep the stable Homebrew formula link when it resolves to the Node running the installer. Desktop setup, startup and update preparation report the installer repair when the recorded Node fails a launch probe. A stale Desktop updater lock with proven ownership and a dead worker can be reclaimed. Unknown owners, active work and interrupted publication retain their locks.
  - Proof: disposable Homebrew fixtures cover a stable repin, loader failure and successful CLI invocation after the opt link changes. All 138 selected installer, updater, lifecycle and package tests passed after supplying the native configuration in the lock-test fixture. A fresh arm64 Mac package passed normal, crash and recovery lifecycle smoke. `node scripts/desktop-update-smoke.mjs success` updated a disposable installed app and CLI and verified restart.
- [x] **P2 — Connect from a shared note link in the browser.** The hosted note error offers Connect on 401 and opens the original URL after authentication. A 403 offers Use another key, while 404 and transport errors retain Retry. The flow reuses the existing brain-scoped 24-hour HttpOnly browser session. Longer retention was left outside this fix.
  - Proof: independent Chromium run on the integration checkout at 1280 and 390 px against a real disposable server, including cancel, invalid key, reader/writer access, cookie reuse across tabs, fresh-profile isolation, 404 and injected 403. Browser-session, graph-editor and editor-availability smokes and all 108 selected browser/companion tests passed.
- [x] Review and independently test the integrated fixes. The tested tree integrates the shared-note and installer changes based on `48a8f673`, plus the lock recheck, preflight ordering and fixture adjustments. The build and `git diff --check` passed. The disposable home, package and browser fixtures were cleaned up. Independent review approved the code and prompted narrower guidance on major Node upgrades.

## Remaining limits

- A real Homebrew upgrade and QMD compatibility across Node major versions were outside the fixture. Existing Cellar-pinned installs need an installer rerun to adopt the stable path. Unverifiable locks still require manual inspection. An interrupted publication requires recovery with a working runtime.
- The browser retains the existing 24-hour session for the same brain and profile. Longer login retention needs a separate design. The 403 response was injected because hosted roles can all read notes. The browser fix was exercised against a disposable server. The feedback diagnostics attachment was not needed to reproduce it.

## Baseline at `48a8f673`

- A disposable managed shim still executed the broken Cellar Node even with a working stable Node on PATH. The broken executable simulated the reported dynamic loader failure.
- A fresh Chromium context against a disposable hosted server reproduced the key-required note error with no inline connection action.
- `npm run build` passed. Installer and recovery tests passed (41). Notes browser, browser access and browser session tests passed (84). The existing Chromium browser-session smoke passed, including remembered sessions and cross-tab draft fencing.
