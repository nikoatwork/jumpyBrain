# Connection usability on this Mac

Completed 2026-10-24. Tested the installed app's real local connection flow, then improved and retested the shared UI in a sandboxed Mac window with real engines. One brain stays a quiet label; multiple brains get a direct sidebar switcher. Destination-first forms infer optional names, retain validation failures inline and offer an explicit Switch after saving. Active-brain removal is disabled.

## Work

- [x] Test the installed native app flow and record concrete usability issues.
- [x] Improve compact connection selection and management based on findings.
- [x] Verify local/local and local/remote flows with real gateways/engines and the desktop renderer.
- [x] Update owning docs/release notes and repository changelog; archive and commit scoped changes.

## Installed-app review

The installed app was running the older verbose Settings shell, rather than this checkout. Used native accessibility/mouse/keyboard input to:

- Add two disposable initialized local brains, one through the real Swift NSOpenPanel and one by typing its path.
- Switch personal → test A → test B → personal; rename B and test connectivity.
- Inspect and cancel the active-brain Remove confirmation: the UI offered an operation the server would refuse.
- Confirm removal of both inactive test connections and verify the original sole Local brain was active again.

No personal Markdown was edited or removed. Test folders under `/tmp/jumpybrain-connection-ux-local-a` and `-b` remain disposable and contain only generated initialization files. The CLI target and installed app bundle were unchanged. Native picker keyboard automation needed direct path-field assignment; this did not establish a product failure.

## Improvements

- Static name/status for one brain, native sidebar selector for two or more. Options and focus survive healthy polling. Every path uses the same existing all-tab save/switch barrier; a requested destination never appears selected before commitment.
- Sidebar read-only/failure status sits below the selector, avoiding cramped wrapping.
- Destination before optional Name; infer folder basename or hostname, trim typed local paths and validate only the applicable fields.
- Keep server errors inline and preserve entered values on failed saves. Clear password on success, Cancel and pagehide; retain blank-key edit semantics and per-brain write approval.
- Save preserves current selection and offers an explicit scoped Switch action. Returning from Save/Cancel focuses Add connection.
- Disable active-brain removal with an explanatory tooltip. Removing a connection still requires confirmation and never removes Markdown.

## Verification

Tested base `6542b27` plus this scoped change on this Mac.

- `npm run build`: passed; browser bundle 175,590 bytes gzip; optional extension bundle 5,600 bytes gzip.
- Full `node --test`: 1,329 passed, one skipped. Final focused companion/architecture suites passed all 36 tests after the final UI adjustments, including the new guarded-selector regression.
- `node scripts/connection-usability-smoke.mjs`: passed in an actual sandboxed Electron window against real local Markdown engines and a real loopback HTTP memory server. Covered empty/invalid/duplicate folders, inferred names, Save/Switch, rename, connectivity, sidebar switching from Home, saving a dirty Work note before switching, remote default read-only, correction of invalid remote origins without retyping a key, blank-key edits, removal cancel/confirm and return to single-brain UI. Checked surviving Markdown and credential cleanup.
- Manual native inspection of the updated isolated desktop window: added Work without a name, selected it and returned through the native sidebar menu, confirmed removal and observed the switcher disappear.
- `scripts/companion-gateway-smoke.mjs`: 14 production gateway/browser checks passed, including two-tab save/conflict protection, read-only remote access, credential repair, destination identity, restart and fencing. Repaired old smoke selectors and opened the collapsed Add form before filling it.
- `scripts/companion-browser-smoke.mjs`: passed, including stable selector focus across polls, narrow layouts, auth/key handling, generation reload, pending writes, stale links and session recovery.
- Reviewed real native screenshots at 1200/480px and browser 1280/390/320px in both themes. Captures are local under `/tmp/jumpybrain-connection-flow-qa` and `/tmp/jumpybrain-connection-browser-qa`.
- `git diff --check` and staged-content guard: passed.

## Limits

The installed app's real Swift folder picker was tested; automated improved-desktop tests inject picker return values and credential storage. Remote testing used a disposable server on this machine, not an external deployment or real remote Keychain credential. Local folders still must already be initialized brains; no automatic folder creation, migration or implicit remote-write approval was added. No installation, release, physical-device or assistive-technology parity claim. The installed app remains on its prior build.

## Relevant files

- `src/adapters/http-server/companion-browser.ts`
- `test/companion-browser.test.js`
- `scripts/connection-usability-smoke.mjs`
- `integrations/electron/smoke-connections.mjs`
- `scripts/companion-browser-smoke.mjs`
- `scripts/companion-gateway-smoke.mjs`
- `docs/design-system.md`
- `src/adapters/http-server/browser.docs.md`
- `integrations/electron/electron.docs.md`
- `tasks/todo/release-next.md`
- `tasks/CHANGELOG.md`
