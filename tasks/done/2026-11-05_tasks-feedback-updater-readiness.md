# Feedback: updater readiness

Status: complete, 2026-11-05. Reproduced and fixed stale preparation availability after failed discovery; production UI/bridge, packaged success/preservation and forced-relaunch rollback passed. Historical report cause remains unproven. Parent owns shared feedback/release bookkeeping.

## Scope

Feedback `IDc1ab1000-e6a0-4e83-84f7-f09339a21cf3`, November 4: checking changed the icon to rotating arrows; clicking returned “Check for a newer published release first.” Network trouble was the reporter's speculation. The bounded attachment inspected during v0.3.20 preparation has no updater events; historical cause remains unknown.

Use only this prepared checkout and disposable fictional homes/app copies. Preserve canonical Markdown, scopes, uncertainty, original size budgets, transaction rollback and ownership fences. No public update/install, user installation, personal notes, remote memory, inbox mutation, support send, push or PR. No shared task/release/changelog edits.

## Required work

- [x] Reproduce readiness inconsistencies before source changes, including persisted transaction state and failed/current publication checks.
- [x] Retain only independently demonstrated fixes, with meaningful focused regressions.
- [x] Exercise production updater UI/window/bridge check, failure, retry, preparation and install handoff; verify restored readiness and serialized operations on disposable fixtures.
- [x] Verify real packaged replacement/preservation/rollback as needed, without live publication.
- [x] Document exact results/limits, archive completed lane and commit scoped work with this record.

## Relevant files

- `integrations/electron/updater.mjs`, `update-window.mjs`, `update-renderer.js`, `update-inline.mjs`, `window.mjs`: production updater state and native surfaces.
- `integrations/electron/electron.docs.md`: updater ownership/verification contract.
- `test/desktop-updater-readiness.test.js`, `integrations/electron/smoke-updater-readiness.mjs`: new focused regression and production UI/bridge flow evidence.
- Existing `test/desktop-updater.test.js` and `scripts/desktop-update-smoke.mjs`: reused worker/transaction/installed replacement/preservation/rollback verification, unchanged.

## Initial investigation

Baseline `181e2301207021a79157789482d1cb18c01119f6`. No applicable `AGENTS.md` found in checkout or ancestor directories. Read product vision, task workflow, source architecture, Electron docs, release v0.3.20 record and previous updater records.

## Reproduction and retained change

- Before source edits, new deterministic regressions failed: both same-version and newer persisted requests yielded `canPrepare: true` after failed manual discovery.
- The production sandboxed sidebar, `window.mjs` navigation bridge and actual `createDesktopUpdater` independently reproduced the exact rejection. Restored a fictional completed `0.3.20` transaction with `0.3.20` installed and missing CLI; clicked the up-to-date checkmark, injected failed discovery, observed the app-only preparation icon/action, clicked it, and received “Check for a newer published release first.” No worker launched. Log: `/tmp/jb-updater-readiness-baseline.log`.
- Cause in this controlled fixture: manual check clears the in-memory release; failure changes phase to `failed`; snapshot reloads the old transaction request; `canPrepare` formerly treated any selected release as preparable, even if already installed. The managed-CLI route has the same faulty availability; final deterministic coverage includes both CLI policies.
- Failed discovery now blocks restoration of that old offer. Preparation availability requires a newer target under the existing app/runtime/managed-CLI version policy. Incomplete installed-version metadata keeps status available and offers no preparation; an explicit check retains repair guidance. Stale `prepare`/`app-only` requests return current state instead of trying to launch an unavailable update.
- Live prepared workers keep their verified pinned target without another publication check. A dead worker loses relaunch readiness; same/older targets cannot reappear as preparation retries. Background polling still preserves its last successful offer on network failure. No worker, transaction, signing, rollback, canonical-memory or size-ceiling code changed.
- This reproduces a concrete readiness bug with the same message, **not the reporter's historical sequence**. Network trouble remains unproven; the original attachment provides no updater operation evidence.

## Verification

Environment: macOS 15.7.7 ARM64, Node 26.7.0. Tested snapshot is the baseline above plus this scoped implementation; the containing commit identifies final sources. Dependencies/build/app copies stayed inside the checkout or disposable homes.

- `npm run build`: pass; editor **222,231 gzip bytes**, optional extension UI **5,669 gzip bytes**. No source/editor ceilings raised.
- `node --test test/desktop-updater.test.js test/desktop-updater-readiness.test.js test/desktop-lifecycle.test.js test/desktop-startup-recovery.test.js test/electron-live-network.test.js`: **62 passed, zero failures/skips**, including 16 readiness cases; existing Python archive/exchange recovery runs within this selection. Covers stale available/failed state, same/older/newer targets, manual discovery retry for managed/app-only CLI, preserved transaction bytes, live/dead ready restoration, missing version metadata, actual worker disk/prerequisite/corrupt-download/offline failures, install locks/ownership, recovery/startup fences, save-barrier/handoff order and native URL/network restrictions. Log: `/tmp/jb-updater-readiness-regressions.log`.
- `JUMPYBRAIN_SMOKE_NODE="$(command -v node)" env -u ELECTRON_RUN_AS_NODE integrations/electron/node_modules/.bin/electron integrations/electron/smoke-updater-readiness.mjs`: final-source pass. Real updater, sandboxed production editor/sidebar and recovery window/IPC, real loopback HTTP discovery with dropped connections, HTTP 429, empty publication list, current/new releases, retry and concurrent checks. Also controlled worker failure/retry, one preparation per duplicate click, restored ready target, native restart acknowledgement/cancellation, no renderer Node bridge and unsupported IPC rejection. Worker protocol is explicitly simulated in this smoke; it does not install software. Log: `/tmp/jb-updater-readiness-ui-final.log`, including expected denied-IPC/cache-cleanup diagnostics; this is not an inert screenshot assertion.
- Fresh signed outer app built with `node integrations/electron/install.mjs --output .local-pack/updater-readiness-baseline`; no user installation. Existing packaged runner rebuilds fixture ASAR from its immutable source package, so baseline native/Electron bytes do not substitute for the candidate updater code.
- Final-source `node scripts/desktop-update-smoke.mjs success --baseline .local-pack/updater-readiness-baseline/jumpyBrain.app`: pass, synthetic `0.3.3 → 0.3.4` over a digest-verified loopback archive. Real packaged sidebar → production worker → save barrier → replacement → authenticated relaunch, paired app/runtime/CLI `0.3.4`, all nine protected files, source policy/config/integration/login/API-key bytes, frozen v1 extensions, profile preferences, real extension activation only on ordinary launch/relaunch, installed-CLI extension compilation and saved work bytes preserved. Raw immutable package/trial/result: `.local-pack/update-smoke/success/2026-11-05T12-22-49.012Z-Px9Q8c/`; log `/tmp/jb-updater-readiness-installed-success-final.log`. Application stages 38.726 s, excluding download and fixture save-test/user wait; this is not a timing guarantee.
- Final-source `node scripts/desktop-update-smoke.mjs relaunch-failure --baseline .local-pack/updater-readiness-baseline/jumpyBrain.app`: pass, real replacement followed by controlled failed new-app relaunch, journaled rollback and verified old-app reopening. All nine protected files/preferences/source policy/extensions retained. Evidence `.local-pack/update-smoke/relaunch-failure/2026-11-05T12-24-10.145Z-pqaefX/`; log `/tmp/jb-updater-readiness-rollback-final.log`. Earlier passing success/rollback trials remain retained too.
- `node scripts/check-package-size.mjs`: pass, **1,444,840 packed / 4,566,091 unpacked / 3,058,522 runtime bytes, 648 files**, original ceilings retained. New smoke/module docs are excluded by the existing packaging policy. Syntax and whitespace checks pass.

## Limits and integration handoff

No historical network diagnosis, live public release download/install, Intel/macOS 26 execution, physical sleep/accessibility/Keychain-history proof, broad signing overhaul or personal-use window. HTTP failure/publication responses and worker protocol events are controlled; real replacement/rollback is verified separately through the existing production-worker packaged runner. No full suite rerun: parent owns combined suite and shared task/release/changelog bookkeeping. Installed user app/CLI and personal notes stayed untouched; no inbox/memory mutation, feedback send, push or PR.

Parent-facing release description if selected: failed update checks no longer revive a stale install offer; preparation requires a newer target while existing ready work/recovery remains protected. Do not describe the November 4 report's historical cause as resolved.

Harness development limits retained honestly: the first UI runner waited for Electron readiness at top-level and was stopped by its exact fixture PID; moving execution into an async function fixed that harness deadlock. Two preparation trials stopped on a fixture Updates directory with default permissions; making that disposable parent private fixed the setup. These were not product failures or passing validation trials. One malformed extra-argument packaging invocation rejected usage before running; the explicit valid output command above passed. No failed product regression was suppressed.
