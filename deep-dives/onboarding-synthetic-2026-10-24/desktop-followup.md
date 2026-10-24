# Desktop onboarding follow-up

Date: 2026-10-24. Test agent scope: fresh disposable Mac candidate, native folder selection, production lifecycle, visual/keyboard checks. The [original Desktop persona](user-2-desktop.md) and [judgment](judgment.md) remain historical evidence and were not rewritten.

## Result

**PASS for the exercised fresh-build, real native-helper, local folder-selection, save/recall, switching and lifecycle flows. Actual macOS folder chooser selection/cancellation also passed. One recovery-copy defect remains for the parent to fix.** These results do not establish a clean-machine installation, human usability, public signed distribution, physical login, or Keychain-history pass.

Only two new test entrypoints and this report belong to this agent:

- `scripts/desktop-onboarding-smoke.mjs`
- `integrations/electron/smoke-onboarding.mjs`
- this report

No production source/docs, task list, changelog, pending release note, installed jumpyBrain app or installed CLI was changed by this agent. No commit, push, release, global install, agent integration, real feedback, personal/team/global note write, Gatekeeper bypass or credential copying. Parent owns production fixes and finalization. Other agents' ongoing edits were preserved. Shared `dist` was never rebuilt.

## Tested candidate and isolation

- Snapshot: **`695bae9ef15f9bc7bd2408ee14651a37f27d0639`**, archived with `git archive HEAD` into a separate temporary source tree. This excludes concurrent uncommitted follow-up changes; it is not validation of the eventual parent commit.
- macOS **15.7.7 / 24G720**, arm64; Node **v26.7.0**; QMD **2.8.3 (facd35e)**; Electron **44.8.0**. Existing root/Electron dependency installations were linked into the temporary checkout. Prerequisites and dependency downloads on a clean machine were not tested.
- Fresh `npm run build`, then supported **`npm run desktop:pack`**, ran in that archived source. Native build explicitly printed **“Compiling native companion (Swift; a fresh module cache can take a while)…”**; no old packaged native binary was reused. Packaging included deep/strict codesign verification. The output stayed in the temporary source's `.local-pack/desktop`, never Applications.
- Build HOME was a private fixture with a minimal recognized install manifest pointing to a fictional default `~/.jumpybrain/memory`. It was sufficient for the supported pack command; it is not a real installer-flow pass.
- Tests copied the fresh native helper to private resources, changed only its support/root/port configuration, and ad-hoc signed that test copy through the repository's documented native workflow. Packaged runtime was referenced from the fresh candidate. Random local capabilities were generated for fixtures and never printed.
- Final automated run imported production Electron modules directly from the candidate **`app.asar`**. Physical chooser runs used the archived production source; seven relevant Electron/onboarding modules were separately verified byte-identical to the packaged copies.
- A separate `jumpyBrain Onboarding QA.app` identity was packaged for physical automation so CUA could target it unambiguously without operating the user's running jumpyBrain app. Its entrypoint calls the real `startDesktopApplication` with explicit private resources, HOME/updater home and user data. This is a fixture entrypoint around production app lifecycle, not Finder first launch of an unmodified installed bundle.
- Local profiles only. No remote Keychain credentials were read/copied or configured by the harness. No login preference was changed. Existing app and CLI settings were read only for SHA-256 comparison: CLI policy, install manifest, companion connections and Desktop setup marker. Their bytes/existence were unchanged before/after passing custom runs. This checks those four files, not all OS/Electron preference stores.
- Native chooser state is partly OS-global: an isolated Electron HOME does not guarantee an isolated initial chooser directory/history. Only fictional absolute paths were selected; no personal file was opened. Reports/screenshots retained in the repository contain no private directory listings. Physical input is CUA automation, not a human usability result.

Candidate source:

```text
/private/var/folders/wg/nj9x33kx7q984kv_sb31z5hr0000gn/T/jb-onboarding-candidate-mrq7e92l/source
```

Fresh artifact fingerprints:

| Artifact | SHA-256 |
| --- | --- |
| `app.asar` | `5d3fa07a5e7abd928f022a761dc931e2a8b47b2680c38f5be5c05b25c8167919` |
| `runtime/dist/cli.js` | `c7f140475299559b647d454c5bbf47381315267a1f3d5a999149b92cd167c797` |
| native helper executable, original fresh candidate | `5d1652df9655e7043b13d3fee603d3c12eb1aef6e27190bd7b1f8a49bc871881` |

Runtime build metadata: version `0.3.8`, build `502e16b6ce06cce8`. The package command emitted a nonfatal `.icon`-format warning and a Swift Keychain deprecation warning. The actual bundled `electron.icns` was present and byte-identical to the supplied app icon, so the warning did not demonstrate a missing app icon.

## Exact commands and outcomes

Commands used the temporary source above. In the commands below, `CANDIDATE_SOURCE` abbreviates that exact directory and `BUILD_HOME` is its sibling `home`; these names are explanatory placeholders, not shell state required by the tests.

```sh
# In CANDIDATE_SOURCE, isolated build output only:
npm run build
env HOME="$BUILD_HOME" npm run desktop:pack
npm run smoke:desktop
env HOME="$BUILD_HOME" npm run smoke:electron

# In the shared checkout; no shared dist write:
node scripts/desktop-onboarding-smoke.mjs \
  "$CANDIDATE_SOURCE/.local-pack/desktop/jumpyBrain.app/Contents/Resources" \
  "$CANDIDATE_SOURCE" fixture
node scripts/desktop-onboarding-smoke.mjs \
  "$CANDIDATE_SOURCE/.local-pack/desktop/jumpyBrain.app/Contents/Resources" \
  "$CANDIDATE_SOURCE" physical
node --check scripts/desktop-onboarding-smoke.mjs
node --check integrations/electron/smoke-onboarding.mjs
```

- **PASS — fresh build/package.** Fresh compiled JS/editor/runtime/native helper and complete candidate bundle. No install-over-live-app step.
- **PASS — existing unified Desktop smoke.** `normal`, `crash`, `recovery`: background startup with tray/no editor, one startup update check against an inert fixture, blocked quit on a failed tab acknowledgement, warning in the editor, last-window close retains service, native-menu reopening, Settings and packaged extensions, successful save-barrier quit, parent-crash watchdog cleanup, recovery/relaunch. Each test checks that its owned gateway stops. Real native helper instantiated.
- **PASS — existing Electron smoke.** Existing/new/canceled/invalid folder flows, unchanged existing note before deliberate editing, same-root activation, sandbox/navigation restrictions, settings/graph, edit/autosave, keep/discard close protection and tab cleanup. Its feedback sender is a local injected receiver; it sends no real feedback. This smoke retains the picker seam and in-process gateway rather than proving physical chooser/native-host behavior by itself.
- **PASS — fresh packaged-module custom fixture.** Production `app.asar` modules + private real native helper/runtime: initial canceled and invalid folder responses, actionable rejection preserving unrelated file bytes, existing A, exact selected-path visibility, existing-brain action, app edit saved to canonical Markdown, close/reopen with native service retained, explicit empty B initialization/switch, A note absent from B, Settings path visibility, explicit quit/relaunch preserves B without welcome.
- **PASS — physical macOS chooser.** CUA targeted only the separately named QA candidate. Actual `NSOpenPanel` canceled; ⌘⇧G navigated to an unrelated fictional folder and selecting it produced the expected safe rejection. Then actual chooser selected the fictional hidden CLI root A; the welcome showed the identical absolute root and **Open my local brain →**. A subsequent physical run selected A and empty B, and the real app created/switched to B, then quit/relaunched into B. The B confirmation button was invoked by the fixture after actual native selection; A confirmation was clicked through native automation. Real OS menu/keyboard/path entry were exercised, not an injected picker result.
- **PASS — CLI ↔ app.** Fresh candidate CLI `remember --root A --type note --title … --json` read fictional body from stdin. The app found that note, opened it, appended **“Saved from candidate Desktop.”** via contenteditable input and waited for actual **Saved**. Fresh candidate CLI `recall --root A --query 'cobalt heron' --json` found the new text. `recall --compact` supplied the real expansion ID/hash; `expand --root A --id … --if-match … --json` retained both the Desktop edit and **“Year unspecified.”** No invented hash or plain-text citation was used as an expansion handle.
- **PASS — independent targets/settings.** B creation did not change the temporary CLI policy. Explicit CLI A still read A after app switched to B. Settings visibly listed both exact roots and active B. The four actual settings-file fingerprints remained unchanged. This proves the exercised explicit-root CLI behavior; there is no claim that Desktop retargets an installed agent.
- **PASS — actual missing helper fails safely and restoration permits retry; UX FAIL below.** After normal native startup, only the private helper executable was temporarily renamed. Actual production `openEditor()` surfaced a startup failure and produced no false success. It used an injected message presenter to capture the production notice; native alert rendering itself was not inspected. The helper was restored. The separate production `createOnboardingWindow(null)` recovery surface was rendered/inspected in both themes; that surface has the improved copy, but actual startup does not reach it. A final retry through `application.openEditor()` started the real helper and returned to the editor, clearing its startup error.

The test runner has bounded process/condition timeouts, requires nonempty completed behavioral checks, verifies owned gateway shutdown, and keeps raw child stderr in private temporary files rather than echoing bootstrap URLs. Artifacts remain disposable and are not intended for release distribution.

## Visual and keyboard evidence

Final packaged-module evidence directory:

```text
/private/tmp/jb-onboarding-smoke-eO1olR/screenshots
```

Inspected `selected-light-960.png`, `selected-dark-680.png`, `selected-B-settings.png`, and missing-helper recovery images; earlier light 680 and dark recovery screenshots were also inspected. Both 960×720 and minimum 680×620 welcome windows were captured in light/dark modes. DOM bounds checks passed for horizontal overflow and for the primary/Continue actions being inside the viewport. At 680×620 the content viewport height was 592 px, primary bottom **536.02 px**, Continue bottom **570.02 px**. At 960×720 they were **629 px / 663 px** within **692 px**. The small window scrolls lower decorative ownership text, while its actions remain usable. No clipped actionable control was observed in these states.

Final runner rerun, including helper restoration/retry and explicit private CLI policy environment, passed at **`/private/tmp/jb-onboarding-smoke-VlU3dK`**. It retains `report-first.json`, `report-reopen.json`, `report-missing.json`, `summary.json`, the same screenshot set and private stderr. `summary.json` records four real settings files unchanged, private CLI policy unchanged, and successful recall/guarded expansion. `node --check` passed for both new entrypoints; `git diff --check` also passed.

`keyboard-focus-primary.png` records native Electron Tab input moving focus from **Change folder…** to the primary action, with the visible focus ring. Actual OS ⌘⇧G, path entry, Return, cancellation and chooser confirmation also worked. These are bounded keyboard routes, not a complete accessibility audit.

Physical chooser run artifacts:

```text
/private/tmp/jb-onboarding-smoke-IjHzBi
/private/tmp/jb-onboarding-smoke-mlGWRu
```

The first run covered physical invalid/cancel/existing A and CLI roundtrip. The second covered native cancel/A/B, Settings, explicit quit/relaunch, CLI roundtrip and settings fingerprints. A CUA screenshot of the actual chooser at fictional A was inspected in tool history. CUA did not provide a durable local screenshot path for that OS sheet; renderer screenshots are saved separately. The earlier physical-run editor screenshots contain a fixture-generated update warning because that harness version returned `null` from its inert release discovery stub. It was a test stub contract error, corrected to a same-version release; final packaged-module screenshots have no such warning. It is not evidence of a real update-discovery failure.

## Concrete fixes for the parent

1. **P2 — real missing-helper startup bypasses improved onboarding recovery. Reproduced.** `application.mjs` catches the missing executable during `ensureHost()` before it creates a welcome window. The production notice says **“Run npm run desktop:setup from your checkout to repair the installation.”**, followed by a raw `ENOENT` path. The separately tested welcome recovery is helpful, but users encountering actual missing native resources do not see it. Reuse the public/existing-install repair instructions on this real startup path, and replace the raw filesystem exception with a short user-facing reason. Keep technical paths in private diagnostics. Validate actual removed private helper through production application startup, then retry after restoration. Do not merely assert the standalone null-connection welcome string.

2. **P3 — very long home/update socket paths can quit the app without useful guidance. Observed incidental boundary.** An early test used the normal macOS temporary directory and generated a **107-byte** `home/.jumpybrain/u.sock` path. `serveDesktopUpdates()` could not bind it; the top-level startup catch quit the app before any onboarding assertion, with empty stderr. Shortening fixture HOME to `/private/tmp/...` fixed the harness. The relevant production catch suppresses the reason. This is an unusual-home/support-path reliability issue, not a common default-home onboarding failure. Consider a bounded/hashed short socket location or actionable startup failure; a follow-up can reproduce socket bind failure directly. No change made here.

No additional UI change is justified by the tested light/dark/narrow folder screens. Existing path help and agent-target copy worked at the tested sizes. Do not treat the whole-native-helper recovery journey as fixed until item 1 is addressed on the actual startup route.

## Remaining limits and parent handoff

- Parent's concurrent production changes and final merged snapshot require coordinated fresh build/retest. These smokes deliberately did not rebuild shared `dist` or assert that concurrent source edits are covered by the archived candidate.
- Finder first launch of the unmodified installed bundle, installation over an existing app, Gatekeeper/quarantine/notarization, Intel, clean-machine prerequisites/dependency bootstrap, physical login and historical Keychain acceptance/denial remain untested. No release was attempted. Default native/helper service identity is exercised, but local-only profiles do not test remote credential access.
- Actual human first-time comprehension, fresh Claude skill activation, physical mouse/trackpad gestures, semantic model retrieval, live public update delivery and real feedback are outside this test pass.
- No broad claim of complete console cleanliness: the onboarding assertions/rendered results and the final packaged-module runs passed, and private stderr is retained. No exhaustive renderer-console audit or long-run resource budget was performed.
- Harness-only failures were corrected: stdin syntax for `remember`, real ID/hash guard for `expand`, Electron top-level readiness deadlock, excessively long temporary socket path, packaged fixture's absolute `main` path, and invalid `null` discovery stub. None counts as a product flow pass or failure. The runner now uses local `main.mjs`, a short real temporary HOME and a valid inert release.
- Test services exited through the save-barrier flow (or their own bounded failure cleanup). The pre-existing installed jumpyBrain processes were not signaled/restarted. Temporary candidate artifacts remain for parent inspection; no repository binary artifact was added.

New test files are ready for the parent's scoped commit. This agent intentionally did not archive/commit tasks because the user explicitly assigned finalization to the parent.
