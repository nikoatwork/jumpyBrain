# Page card actions and context

Completed 2026-11-01.

## Outcome

- A chain-link icon beside Copy/Delete copies the literal absolute path of the loaded local companion note. Spaces and Unicode remain literal. Success/failure use the shared system messages; late clipboard feedback is fenced by editor and brain scope. Hosted/remote brains hide the action because they expose no usable local absolute path.
- Add to board now uses an intrinsic-width plus-and-label control. Existing board memberships appear above it as guarded navigation buttons, including settled memberships with a Settled suffix. They reuse the existing scoped board packet, update after membership changes and clear for the next note/brain.
- More info replaces Saved version as the disclosure label. The underlying accepted-revision metadata and save policy are unchanged.

## Tasks

- [x] Add the accessible icon action, scoped local-path resolution and clipboard feedback.
- [x] Compact Add to board, expose navigable memberships and rename the disclosure to More info.
- [x] Verify exact paths, navigation/brain scoping, remote availability, clipboard failure and narrow layouts using disposable fixtures.
- [x] Update owning docs, pending release notes and changelog; archive this list and commit the scoped change.

## Verification

Tested the final source/smoke-script bytes in an isolated temporary snapshot; byte equality with the working implementation was checked before finalization. The snapshot includes the concurrent sidebar presentation integrated as `03cd368`, without changing or staging that task's implementation.

- `npm run build` passed; the final editor bundle remains below its existing size gate (582,375 bytes minified, 192,683 bytes gzip).
- Focused note workspace/browser/companion/board tests passed: 108 tests.
- The initial shared-tree full test run was interrupted by another task rebuilding `dist`; its missing-module failures were not treated as product failures or a passing suite.
- Isolated `npm run validate`: 1,546 passed, two failed and one skipped out of 1,549. Both failures came from snapshot dependency setup: a symlinked root dependency folder produced empty editor license notices, and the Electron compiler dependencies were omitted. After copying actual dependencies and rebuilding, both affected files passed all 11 tests (`test/desktop-lifecycle.test.js`, `test/lexical-bundle.test.js`). No unresolved test failures remain; the full suite was not repeated after these targeted successful reruns.
- `scripts/boards-smoke.mjs` passed on the final isolated build: exact absolute paths with spaces/Unicode, copy denial feedback, late completion after navigation, current-note path changes, remote hiding, membership navigation and updates, settled membership labels, unchanged note bytes and preserved unsaved drafts. Its page-card checks cover 1820/1280/1180/900/390/320px in light/dark plus collapsed navigation. Desktop and 320px screenshots were inspected.
- `scripts/note-workspace-smoke.mjs` passed: create/edit/save/reopen, formatting/selection, references, failed-save guards, hosted/remote hiding and existing responsive/palette coverage.
- `git diff --check` passed.

## Limits

Clipboard behavior uses a deterministic browser clipboard fixture; OS clipboard permissions and the installed Mac app were not exercised. No installation, push or release was requested. Hosted/remote absolute paths remain unavailable. Existing browser smoke limits for native Keychain/folder UI, physical IME and other browsers apply.
