# File explorer actions

## Outcome

Implemented file context menus, new empty folders, guarded file rename/move/deletion and scoped copy links. Explorer interactions remain in a dedicated browser module, filesystem rules in canonical core, orchestration in app/server-memory and thin authenticated transport seams. Required checks passed; the unrelated pre-existing tooltip smoke limitation is documented below.

## Goal
Add encapsulated right-click rename, copy file link, new folder and delete-file actions, plus drag-and-drop file moves in the right folder explorer. Preserve unrelated working-tree changes.

## Tasks
- [x] Inspect explorer boundaries and Zed project-panel implementation.
- [x] Add guarded canonical file moves and empty-folder discovery/creation behind app and authenticated transport seams.
- [x] Add scoped context menu, filename editing, delete confirmation and folder drop handling without moving filesystem policy into the shell.
- [x] Verify filesystem safety, HTTP/companion permissions, browser interactions and existing explorer behavior.
- [x] Update owning docs/release notes and archive scoped work; commit recorded by the task finalization.

## Decisions
- Reference: https://github.com/zed-industries/zed/blob/main/crates/project_panel/src/project_panel.rs (`deploy_context_menu`, `rename_impl`, `drag_onto`), inspected 2026-11-01. Adopt contextual selection, filename-stem selection, explicit delete confirmation, highlighted folder drop targets and a separate operation layer; no source copied.
- Canonical Markdown and IDs remain unchanged by filename rename/move. Existing title rename remains separate. No automatic backlink rewriting.
- Only canonical visible Markdown and directories within canonical buckets are managed; no root/bucket rename or recursive folder deletion.

## Verification
- Core/model/HTTP focused checks passed, including no-clobber writes, byte/ID/mtime preservation, stale hash/source path, source/destination locks, unsafe paths, hardlinks/symlinks, concurrent moves and empty-folder discovery.
- Companion transport checks passed for read-only local/remote profiles and generation draining/fencing.
- Existing folder explorer smoke passed on real hosted and companion transports (including failed-save retention, responsive light/dark layouts and canonical byte preservation).
- New hosted/companion action smoke passed: scoped clipboard links, empty-folder persistence, rename/stem selection/cancel, dirty-editor flush, keyboard move, collision preservation, real HTML drag, post-move save and independent-target delete/cancel. Isolated lifecycle checks passed for brain changes, late reads, confirmed results while closed and read-only controls.
- Final tested source snapshot: build `0b42bb1bdfbd9ea6` on base commit `1cc3b41`. `npm test` passed; after final permission/lifecycle refinements the complete `node --test` run passed 1,556 tests with one optional physical read-only QMD test skipped because `JUMPYBRAIN_TEST_QMD_BIN` was not provisioned. Final rebuild restored the identical tested source fingerprint after a discarded positioning experiment.
- Final action smoke passed on hosted and companion surfaces, including menu viewport geometry after layout settles, Home deletion without an editor, retained editor after deleting another target, and mutation affordances after navigation. Existing explorer smoke passed on both surfaces. Desktop/narrow menu and dialog captures were inspected; artifacts are under `/tmp/jumpybrain-explorer-actions-*` and `/tmp/jumpybrain-folder-explorer-qa`.
- Bundle: 195,384 gzip bytes (no new dependencies), within the reviewed 196,000-byte gate; base build measured 192,683 bytes. `git diff --check` passed.
- Broader optional `scripts/note-find-smoke.mjs` reaches delete cancel but fails on an unrelated tooltip `boundingBox()` returning null at line 86. Reproduced the same failure from an isolated clean archive of base commit `1cc3b41` (baseline passes both 1280px themes first). No tooltip fix is included in this task.

## Limits
- Individual visible canonical Markdown files with unique valid IDs only; no folder rename, recursive folder delete, arbitrary attachment import, multi-select or Undo/Trash. Filename references are not automatically rewritten.
- Link/unlink no-clobber publication has a brief duplicate-link window and can leave both paths after a crash. External writers ignoring locks retain the documented filesystem race limits. Cross-device/unsupported hardlinks fail closed.
- No installed app, personal memory, publication, push or release is part of this task. Native Electron packaging/physical accessibility checks are not claimed.
