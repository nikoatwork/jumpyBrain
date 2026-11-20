# Blocked actions explain themselves

Status: done 2026-11-20. Branch `t3/explain-blocked-actions`, on `029b414c`; not merged, pushed, installed or released.

Source: task 2 of the [remote feedback implementation plan](2026-11-20_tasks-remote-feedback-implementation.md), closing the UI limits recorded in [server roles decide app access](2026-11-20_tasks-server-role-access.md). Owner decisions applied: access details live only in Settings; an action the key's role does not allow stays visible and explains itself with a Settings action; no access banner or role label in the workspace.

## Gaps taken from the previous record

- Folder moves and renames, board card edits, attention changes and formatting stayed disabled under a role restriction with no message.
- The hosted browser's blocked actions had no Settings action. The hosted page did not know its key's role at all, so it sent every change to the server and showed a 403 as a rejected key ("disconnected").
- In a browser-only session a role lost on the server stayed unknown to the page until a reload.

## Tasks

- [x] **One shared guard for both hosts.** `accessGuardScript` (in `src/adapters/http-server/access-keys-view.ts`, inline page script). `accessOffered()` decides whether a control for a change is shown as usable: when the change works, or when the role is the only obstacle. The code that starts a change calls `accessDenied(action)`; under a role restriction it shows one explanation with **Open Settings** and stops. Settings is Settings → Access keys in the app and the Access keys dialog when hosted. The app-only helpers from the previous change (`companionDenied`, `companionExplainAccess`, `companionAccessExplanation`) are replaced by it.
- [x] **Hosted role.** The hosted page keeps what `/capabilities` last said about its key (`hostedAccess`): read after sign-in and on every later read of that route (opening a note, a drawing or Access keys). Not known yet means nothing is blocked in the page and the server answers, as before.
- [x] **Applied.** Folders: New folder, Rename, Move (menu, F2, drag) and Delete. Sidebar attention: Snooze, Settle, Bring back. Open note: formatting (Format stays visible), task checkboxes, Delete, typing (as before). Boards: create, rename board and column, add, remove, move (buttons, drag, Alt+arrows), settle, restore and delete in the board, the sidebar and Settings → Boards, and Add to board. Drawings: create (as before), delete, rename. Map: Create page. Search: Reindex. Dream handoff and extension commands use the same sentence.
- [x] **Busy, transient and nothing-selected states are separate.** A frozen, failed, unregistered or disconnected session, a busy operation and a missing selection keep plainly disabled controls and are never described as an access problem.
- [x] **Inside a modal dialog** the toast is behind the dialog (found in Chromium for map Create page and search Reindex). `accessDeniedIn(status, action)` also writes the explanation into the dialog's status line, with the way to Settings in words.
- [x] **Role lost while a page is open.** A 403 `read_only`, `admin_required` or `access_unconfirmed` no longer marks the connection as disconnected. The page re-reads the role (hosted: `/capabilities`; app: `GET /companion/state`, where the gateway re-checks health and role), then explains with what it now knows; if the role still reads as allowed, it says only that the server refused. A rejected key (401) in the app triggers the same re-check, so a browser-only session notices without a reload. Automatic re-checks are at least five seconds apart; opening Access keys always re-checks. No polling was added.
- [x] **Docs.** Browser contract (new Role-restricted actions section; access keys, Format, folder explorer, boards, drawings and map paragraphs), build footprint.

## Decisions

- **Offer, then deny, in the page script.** Bundled controllers keep their `writable()` option and now receive `accessOffered()`, so they needed no change. Only the folder explorer gained a hook, `denied(action)`, because its dialogs and drags start inside the bundled module before any host callback: 14 gzip bytes. The alternative of intercepting its DOM events from the page would have cost nothing in the bundle but tied the guard to menu labels.
- **Nothing is granted.** `accessOffered()` only changes what is shown. A change still needs the gateway's early check and the server's authorization. Chromium counted the change requests leaving a reader's page across all attempts: none, in both hosts.
- **A hosted page with an unknown role blocks nothing itself.** Refusing locally before the server has spoken could hold back a key that is allowed to write.
- **The explanation after a refusal claims no role it has not just read.** The gateway may remember a confirmed role for up to 30 seconds, so right after a downgrade the app text is "The server refused it for your current key." rather than a role name.
- **Format stays visible for a reader**, which reverses what four existing smokes asserted (Format hidden, or the hosted New note request sent and refused). Their assertions were updated to the new behaviour; the hosted smoke keeps its server-refusal check for the case where the role is not yet known. The empty-note hint stays hidden for any read-only note through one CSS rule, so no controller can bring it back.
- **The guard lives in the existing access view module** rather than a new file: the package is already 2 files over its 780-file budget on `029b414c`, and a new source file would have added 2 more.
- "Open Settings" is the action label in both hosts. Hosted has no page called Settings; the action opens the Access keys dialog, which holds Your access.

## Verification

Snapshot: working tree on `029b414c` plus this change; `npm ci`, `npm run build`, then the checks below against that build. No source file changed after the build.

- **Bundle.** Editor bundle 186,365 gzip bytes (186,366 on another rebuild; the embedded build ID moves it by a byte), 186,352 before on the same machine. Gate unchanged at 186,500. Package file count unchanged at 782.
- **Unit**, 28 files chosen for the changed modules and boundaries: 323 tests, 322 pass, 1 fail. The failure is `test/package-footprint.test.js` "files = 782, limit 780"; `npm pack --dry-run` on an export of `029b414c` built the same way also reports 782, so it predates this change and belongs to the integration.
  - New `test/browser-access.test.js` 5/5: hosted unknown role blocks nothing, a known reader is stopped with the explanation and Settings action, the modal variant, malformed packets grant nothing; `/capabilities` updates the role for the current key only; a refusal re-checks then explains, spaced out, with the neutral text when the role still reads as allowed; app controls are offered under a role restriction only; a role refusal keeps the connection state and a rejected key asks for a re-check.
  - `test/companion-browser.test.js` 24/24 and `test/notes-browser.test.js` 78/78 after moving to the shared names; the hosted connection test now covers the three role-refusal codes.
- **Chromium, new:** `npx --package=playwright node scripts/blocked-action-explanations-smoke.mjs` PASS, 12 stages, four consecutive runs. Real server and gateway, disposable roots and keys.
  - App with a reader key: folder New folder, Rename, Move, Delete, F2 and drag; sidebar Settle and Snooze; task checkbox, Format commands, Delete and New note; search Reindex (explained inside the dialog); board card remove, move up, Alt+arrow, drag, board and column rename, add, sidebar settle, New board, Add to board, and Rename, Settle and Delete in Settings → Boards; drawing delete and rename; map Create page (explained inside the dialog). Each stays enabled, shows the explanation with Open Settings and opens nothing. The action lands on Settings → Access keys showing Reader. No change request left the page; files, note and board on the server were byte-identical afterwards.
  - Frozen session: New note, New folder, Delete, Format commands and attention buttons are plainly disabled, with no explanation.
  - App with writer and admin keys: folder creation, formatting, settle, card removal and board rename reach the server; no explanation appears.
  - Hosted with a reader key: the same folder, attention, checkbox, formatting, delete, New note and Reindex attempts explain themselves; the action opens the Access keys dialog above the note; no change request left the page and the connection stays "connected". Writer and admin keys create folders.
  - Role lost: a key downgraded in the server's access file while the page still shows writer. App and hosted: the folder request is sent once, refused, explained with Open Settings, nothing is created, the connection is not shown as lost, and Settings then shows Reader; hosted re-reads the role and stops the next attempt itself. App: after the key is revoked the page itself brings the app to "access key rejected" and explains "paused", with no app-shell poll or reload. Hosted while typing: nothing from the downgraded key reaches the server; where the editor still accepted typing (the path the reviewed run took) the text stays in the open note as a draft with Review changes offered; and opening Access keys re-reads the role without reloading or altering the note.
- **Chromium, existing, same build:** PASS `server-role-access-smoke` (6), `access-keys-smoke`, `folder-explorer-actions-smoke`, `note-attention-smoke`, `note-workspace-smoke`, `ux-readonly-affordances-smoke`, `ux-creation-permission-smoke`, `board-settings-smoke`, `board-sidebar-smoke`, `boards-smoke`, `graph-linked-topic-smoke`, `companion-browser-smoke`, `ux-credential-draft-smoke`, `task-checkbox-smoke`.
- Screenshots of the board, hosted formatting and hosted Access keys states were reviewed by eye: the toast carries the text and Open Settings, Format stays visible, and the dialog sits above a note that still shows its draft.
- `git diff --check` clean.

### The three smokes the previous change could not confirm

Each was run on three builds: `94b77fc5` (before the permissions change), `029b414c` (with it) and this tree. All three fail on all three builds at the same assertion, so neither change introduced the failure:

| Smoke | Fails at | Message |
| --- | --- | --- |
| `remote-boards-compatibility-smoke` | line 74 | "ordinary note editing remains available" |
| `drawings-smoke` | line 318 | page errors: Chromium "Permissions policy violation: unload is not allowed in this document" |
| `contextual-attribution-smoke` | line 61 | popup bounds |

What follows each failure point is still unexercised by those scripts. One assertion there was updated without a run: `drawings-smoke` line 394 (Delete drawing is now available to a reader and explains). The behaviour itself is covered by the new smoke.

## Limits

- Not run: Electron smokes (Electron is not installed in this worktree). `integrations/electron/smoke-boards.mjs` asserted disabled board controls for a reader, including New board, which had already changed in `dc500396`; its assertions were updated to the new behaviour without a run. No full `npm test`, eval, installed app, real brain or shared server.
- `scripts/companion-gateway-smoke.mjs` still drives the `#companion-writes` checkbox removed in `dc500396` (lines 127–345) and cannot pass since then. Not run and not changed here.
- A more severe message outranks the explanation: when the server closes an open note's editing session after a downgrade, "Reopen this note to continue." or "Changes need review" is shown first and the role explanation follows once that is dismissed or expires.
- An explanation raised by a refused request while a modal dialog is open sits behind that dialog until it closes; the dialog shows the server's own message meanwhile.
- A task checkbox press is explained only where the browser reports presses on disabled controls (Chromium and so the Mac app; not verified elsewhere). A drawing's canvas is a plain view; trying to draw says nothing.
- Right after a downgrade the app may still show the old role for up to 30 seconds (the gateway's role memory); attempts are refused and explained without naming a role during that time.
- The note header still reads "Read only" for a reader in both hosts. It is the editor's save state from before this work, not something added here; whether it counts as a role label is the owner's call.
- The hosted page learns its role from `/capabilities` after sign-in; a change started before that answer arrives goes to the server and is explained from its refusal.
