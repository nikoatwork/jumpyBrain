# Preserve signed app resources during backend startup

Priority: P0 follow-up to [desktop runtime hygiene](2026-11-08_tasks-desktop-runtime-hygiene.md), task 4.4. Completed 2026-11-02. Baseline: `2ea52ed`, clean `master`.

## Outcome and scope

Bundled backends publish their retention pins outside the signed app. Startup, shutdown, relaunch and cleanup previews preserve signature verification, while moved live runtime generations remain protected from retirement. Ordinary CLI runtime placement is unchanged.

This confirmed signature defect is separate from the unclassified Quit/open report and idle-edit investigation; resolving it does not close either report. The owning parent remains active for its outstanding launch evidence.

## Completed tasks

- [x] Move bundled-runtime pin/retirement state to private device-local storage keyed by the runtime directory generation; preserve ordinary CLI pin placement and reject unsafe state.
- [x] Make updater inspection agree with the runtime and conservatively retain legacy/unknown bundles.
- [x] Verify a matching disposable signed bundle before startup, during a real backend's lifetime and after shutdown; verify moved-generation retention, retirement fences and canonical byte preservation.
- [x] Run focused and required repository checks, document results/limits, update owning docs/release notes, archive and commit under [task completion](../../docs/task-workflow.md).

## Design and relevant files

- `src/adapters/backend-host/runtime-pins.ts` uses `~/.jumpybrain-runtime-pins/<device>-<inode>/` for the exact `*.app/Contents/Resources/runtime` layout. Private generation directories contain `.backend-pins` and `.retiring`; moving an app preserves this identity. Existing generation and publication identity checks remain enforced. Any retirement entry, including a dangling link, fences readiness.
- `integrations/electron/update-retention.py` recognizes the compiled `BUNDLE_PIN_PROTOCOL = 1` capability, uses the same state location, checks both external and legacy in-bundle pins, and rejects unsafe/unknown state. Older bundles without this capability remain ineligible for automatic retirement. No registry scan, new dependency or service.
- `test/bundle-runtime-pins.test.js` covers private permissions, linked/nonprivate state, old protocols, legacy pins/fences, stale runtime exchanges, both startup/retirement race orders and real backend signature/lifetime checks. Its optional `JUMPYBRAIN_SIGNED_APP` path checks an actual current packaged bundle without installing or launching its native UI.
- `integrations/electron/test_update_retention.py` covers combined CLI/bundle staging cleanup, live/invalid/legacy/nonprivate protection, earlier-sentinel unwind and eventual removal of a proven-dead generation.
- Owning backend/Electron docs, installation guidance, pending release notes and the selective changelog describe the retained behavior.

## Tested snapshot and verification

macOS 15.7.7 ARM64, Node 26.7.0, Python 3.14.7, package 0.3.17. Runtime-source fingerprint `b8e66d2e84809ada`; compiled pin module SHA-256 `2e467193dad4a1c2b61dfd688d3661fd054df4d42a9282ca7d6cc3d7cc0f2b05`. No dependency/version changes.

- `npm test`: passed, 1,848 tests / 1,846 passed / zero failures / two opt-in provisioned-QMD skips, 103.484 s. The skipped QMD CLI-parity and lexical-diagnostic suites require `JUMPYBRAIN_TEST_QMD_BIN`; no QMD behavior changed.
- Initial focused bundle/runtime-hygiene checks: 22 passed. Final standalone bundle suite: 12 passed. After the optional packaged-fixture copy adjustment, the packaged run below exercises that changed path; production source is unchanged from the full-suite snapshot.
- `python3 -B -m unittest discover -s integrations/electron -p 'test_update_retention.py'`: 5 passed. Companion `test_update.py`: 66 passed, including existing replacement and legacy-runtime behavior.
- `node integrations/electron/install.mjs --output .local-pack/signed-runtime-pins`: built a fresh, ad-hoc signed complete Electron 44.10.0 app; native preparation, outer signing and deep/strict verification passed. No installation. `app.asar` SHA-256 `10a2a73ace6695926a9cedb1da6ff183a8059e01bd88e042fefb16a3818d0899`.
- `JUMPYBRAIN_SIGNED_APP="$PWD/.local-pack/signed-runtime-pins/jumpyBrain.app" node --test --test-name-pattern='real bundled backends' test/bundle-runtime-pins.test.js`: passed in 4.130 s. The copied package's pin module/build identity match the tested compiled runtime. Deep/strict codesign verification passes before startup, while live, after rejected retirement, after an app move, after shutdown, after relaunch, and after dead-runtime retirement preview. Real readiness/authenticated stop and byte-identical canonical Markdown are asserted.
- The first complete-package fixture exceeded its 30-second timeout during Node recursive copying. Replaced that fixture copy with macOS `ditto` and a bounded 90-second optional-artifact budget; the final complete-package run passed. This was a harness failure, not runtime evidence.
- `node scripts/check-package-size.mjs`: passed unchanged ceilings: 1,443,537 archive bytes / 4,579,837 unpacked / 3,069,851 runtime / 632 files. Build/editor gzip remains 219,949 bytes. Syntax, whitespace, new/updated local links and staged guard passed. An unchanged pre-existing changelog link to `todo/tasks-page-reference-manual-qa.md` remains outside this fix.

## Remaining limits

- This verifies the production backend in both a minimal signed Mac fixture and a copied fresh complete app. It does not launch Finder/open, change LaunchAgent state, exercise Keychain, verify public signing/notarization, or reproduce the reporter's exact Quit/open or idle-edit sequence. Those parent gates remain open.
- Small private generation records remain outside update staging cleanup; unknown state requires explicit inspection. Foreign/frozen runtimes and old bundle protocols remain conservatively retained. No legacy in-bundle files are automatically removed or signatures repaired on already affected installations.
- No user installation, canonical personal/team memory, login preference, live support inbox or release was changed. No push or deployment. Full logs/build output remain ignored local artifacts, not shipped product files.
