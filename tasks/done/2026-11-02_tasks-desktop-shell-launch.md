# Reliable packaged launch from agent shells

Completed 2026-11-02. Baseline `5dc25f3`, initially clean `master`. Follow-up to [runtime hygiene](2026-11-08_tasks-desktop-runtime-hygiene.md), tasks 3.4/4.3, and [existing-note deletion](2026-11-02_tasks-stale-note-editing.md).

## Outcome

The real packaged executable silently exited zero before Electron startup when it inherited `ELECTRON_RUN_AS_NODE=1`; this agent shell sets that variable. Clean direct and LaunchServices launches worked. The package now disables RunAsNode using pinned build-only `@electron/fuses` 2.1.3 before code signing, so that environment cannot bypass `main.mjs`, the window/tray or startup diagnostics.

The generic development Electron binary retains its defaults. Backends already run under configured system Node, and Electron main contains no `child_process.fork` dependency. Other fuses, credentials, runtime policy and login preference are unchanged. There is no wrapper around an installed user's app or automatic service registration.

## Completed tasks

- [x] Review selected launch/idle reports through the documented read-only API and inspect source/build boundaries.
- [x] Reproduce using a copied matching signed app with a unique identifier and private app data; compare inherited and clean environments.
- [x] Disable only packaged RunAsNode before signing; verify the actual fuse and package dependency boundary.
- [x] Exercise the actual executable, AppleScript Quit, LaunchServices open and a unique disposable loaded/unloaded LaunchAgent; require a registered second-instance editor.
- [x] Broaden packaged editing coverage after the user clarified that idle may not be involved. Reproduce/fix word/line deletion under its [own completed task](2026-11-02_tasks-stale-note-editing.md).
- [x] Run checks, document results/limits, update owning docs/release notes, archive and commit under [task completion](../../docs/task-workflow.md).

## Evidence and contract

- Read-only feedback check at 2026-11-02 13:18:08.650 UTC covered received non-spam messages since 2026-11-01 23:00 UTC (midnight Berlin): 17 scanned, complete, zero marked delivery tests. Read the selected launch and editor messages in full at 13:18:23 UTC; no sends, replies, attachment fetches or label changes. This was a targeted reproduction review, not a new full historical audit.
- [Launch report](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=771089e6-0aba-4bfd-b500-05d6acbb8580) describes direct/open failure after Quit on macOS 26, with LaunchAgent bootstrap recovering startup. It does not state its environment. Our inherited-variable case reproduces its silent direct-executable symptom; the full historical LaunchServices failure is not established.
- [Electron fuse contract](https://github.com/electron/electron/blob/main/docs/tutorial/fuses.md#runasnode): disabling RunAsNode makes the packaged app ignore this environment variable. Changing it after packaging and before signing follows the official helper's lifecycle; no hand-patched binary format.
- `scripts/desktop-launch-smoke.mjs` copies the app with `ditto`, sets a unique app identifier, uses disposable configuration/data/Markdown and a temporary LaunchAgent label, and resigns that fixture. It launches the actual packaged executable and main entrypoint. Only the fixture has a CDP port; the real app/LaunchAgent are untouched. Authenticated backend drain and PID/gateway exit checks precede fixture/runtime-pin removal; uncertain cleanup retains the fixture.
- The second-instance fixture initially mistook a short state-request timeout for service loss. Waiting for actual editor registration and subsequent gateway readiness passes. A separate early baseline invocation passed `--background` to Node-mode and correctly exited with bad-option status; the valid reproduction uses the reported direct no-argument launch and exits zero. Neither fixture error warranted an app lifecycle patch.

## Verification

macOS 15.7.7 ARM64, Node 26.7.0, Python 3.14.7, Electron 44.10.0. Package/runtime version stays 0.3.17; final runtime fingerprint `84b47efa01f765db`.

- Baseline `scripts/desktop-launch-smoke.mjs --app .local-pack/signed-runtime-pins/jumpyBrain.app --baseline --idle`: silent Node-mode exit zero reproduced; clean direct/open, AppleScript Quit, temporary loaded/unloaded service and second-instance editor checks pass. Existing selected/empty-block edits also pass after 35-second idle and 65-second CDP suspension. That baseline does not contain the new word/line fix.
- `node integrations/electron/install.mjs --output .local-pack/desktop-input-fixed`: fresh complete build, native preparation, fuse application, signing and deep/strict verification pass. `RunAsNode` reads disabled (`FuseState.DISABLE`, 48), while the unmodified baseline reads enabled (49). `app.asar` SHA-256 `15b90f5a05126823b81385f2f3098dca59d387fdca5ef12c9e7d4c0c12efb8ee`.
- `scripts/desktop-launch-smoke.mjs --app .local-pack/desktop-input-fixed/jumpyBrain.app --editing`: 17 checks pass. This includes inherited-variable launch, clean direct/open, normal Quit/reopen, temporary service loaded/unloaded, actual registered editor on second launch, signature preservation, and ten ordinary/word/line/formatted/repeated deletion variants saving and reloading. Input-type trace confirms the word/line command path bypasses `beforeinput` on this platform.
- ASAR inspection: 47 entries, zero `node_modules/@electron/fuses` entries. The helper adds one build-only dependency with no transitive packages; root runtime dependencies stay `esbuild` and `ws`.
- Final `npm test`: 1,848 tests, 1,846 passed, zero failures, two opt-in provisioned-QMD skips, 111.756 s. Final 40-case deletion matrix, fresh-note feedback and collaboration/editor suites pass; see the [editing verification](2026-11-02_tasks-stale-note-editing.md).
- Python desktop installation suite passes (11 tests). Syntax, package manifest/size, whitespace, new/updated local Markdown links and staged guard pass. Full output and sanitized launch reports remain ignored under `.local-pack/` and local temporary logs.
- An earlier full-suite run intermittently failed the existing uninstall `--delete-memory` assertion; isolated retry, unchanged full rerun and the final source run pass. No cause or unrelated uninstall repair is claimed.

## Limits

This establishes the inherited Node-mode defect and verifies supported launch/service paths on this Mac. It does not prove that variable caused the reporter's complete macOS 26 `open` sequence; [runtime hygiene](2026-11-08_tasks-desktop-runtime-hygiene.md) was finalized on 2026-11-08 with that explicit unverified limit and a recurrence-based reopening condition. Real OS sleep, physical keyboard/IME, Intel, public signing/notarization and a real published update remain untested here. No user app was installed, no actual login preference changed, no version bumped, no release/push/deployment or support message sent. Build-only fuse changes take effect in newly built packages, not already installed binaries.
