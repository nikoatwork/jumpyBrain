# Inline desktop update icon

Status: completed and archived 2026-10-22. Implementation and verification are recorded below; see the combined sidebar/attention coordination archive for integration evidence.

## Goal

Make the normal update flow a single sidebar icon that changes from download to progress to relaunch, while the person keeps editing.

## Scope and ownership

- Read [coordination/contracts](2026-10-22_tasks-sidebar-attention-refresh.md), [coordinated updater](2026-10-22_tasks-unified-mac-cli-update-experience.md), `integrations/electron/electron.docs.md` and browser docs.
- Own desktop control injection/navigation/renderer capability in `integrations/electron/window.mjs`, the presentation wiring in `application.mjs`, and a focused inline-control module if needed. The backend track owns updater operations, worker/transaction, lifecycle and CLI alignment; agree the narrow `application.mjs` wiring hunk before editing it.
- Sidebar controls owns the utility-slot layout; typography owns shared styles. Do not restyle the entire sidebar or rewrite the installer.
- Current editor has no preload/IPC bridge; its update navigation opens a separate sandboxed window. Select and document a narrow host-to-renderer status/fixed-action seam instead of granting generic IPC or shell access. Hosted sessions must never acquire local installation capability.

## Tasks

- [x] 1.0 Agree read-only status fields and fixed actions with the updater backend, including busy/failed/recovery and explicit app-only policy. Use one operation for sidebar and native menu, with scope/sender/main-frame validation.
- [x] 2.0 Render download available, nonblocking preparation and ready-to-relaunch as one accessible icon control in the sidebar slot. Use a tooltip/accessibility label for state, an adjacent polite status only when needed, and disabled/busy behavior that prevents duplicate jobs.
- [x] 3.0 First activation starts preparation with no popup. A ready icon requests safe restart; working/deferring leaves the staged update ready. Do not say installed while only staged; show verified success after actual installation/startup and then return to a quiet current state.
- [x] 4.0 Provide inline retry/error details and explicit exceptional policy/recovery actions. Keep versions/release notes in About or on-demand details. Retain a recovery surface for startup failures that cannot display the editor; remove obsolete normal-flow window wiring only after the replacement works.
- [x] 5.0 Cover ordinary browser sessions, allowed native actions, navigation/scope changes, repeated clicks, polling cancellation and multiple windows. Status changes must preserve editing, selection and save state.
- [x] 6.0 Run focused production-code UI fixtures for all states, keyboard behavior and both themes; coordinate one disposable installed update with the backend track to verify save-blocked restart, successful relaunch, actual component versions and preserved Markdown/settings.
- [x] 7.0 Record results/limits and update native presentation docs; give browser contract/release-note wording to the integrator.

## Acceptance

- Available update is a singular download icon; preparation is visible; ready becomes relaunch. Normal use opens no update popup.
- Installed/prepared states remain truthful and failures retain actionable recovery. Hosted browser sessions cannot execute native update actions.

## Implementation and verification — 2026-10-22

- Implemented `update-inline.mjs`: one accessible download/progress/relaunch icon in `.nav-utilities`, same 32px target/16px glyph roles, quiet idle/current, transient verified success, inline policy/error/retry/log/cancel details. Routine preparation opens no separate window. Recovery retains the dedicated startup-only surface.
- Native status contract is `snapshot.actions` plus existing phase/detail/installed versions+CLI policy/available/notes/restartError. Fixed native actions: `check`, `update`, `app-only`, `cancel`, `restart`, `recover`, `log`. Main-frame gateway scope, exact URL shape and current action availability are checked before execution. Action generations invalidate earlier status polls; duplicate native requests share the existing operation. No generic renderer bridge was added.
- Startup/menu discovery is observational. A download uses the immutable release already offered. Prepared remains distinct from installed; the existing all-tab save barrier gates relaunch. Hosted sessions have no native injection or installation capability.
- `node --test test/desktop-updater.test.js test/desktop-lifecycle.test.js test/electron-host.test.js test/electron-setup.test.js`: **29 passed**, including fixed-action URL restrictions, offered-release reuse, startup fencing before first worker status, matching installed version reporting, ownership policy, all-tab failure and transaction recovery.
- Actual sandboxed Electron production-shell fixture `smoke-inline-updates.mjs`: **passed**, both themes, icon state accessibility, keyboard activation, ordinary no-popup flow, literal release notes, stale/argument/child-frame action rejection, focused unsaved text+selection preservation, 390/320px overflow. Artifacts: `.local-pack/update-inline-ui/`.
- Disposable installed GUI, open-app CLI and closed-app CLI old→new fixtures all passed as recorded below. No personal app, Markdown root, settings, CLI installation or release has been changed.

### Disposable installed result

- Tested worktree `feat/sidebar-attention-refresh`, base commit `9606d74ccf60660ea96a6589e7255f39b595989b`, with the uncommitted native/backend changes above and root-built runtime. `npm run desktop:pack` built/signed only `.local-pack/desktop/jumpyBrain.app`; it did not install it.
- `node scripts/desktop-update-smoke.mjs success`, `cli-open` and `cli-closed`: **all passed**. Each archives an immutable local release fixture, updates a disposable 0.3.3 app to 0.3.4, authenticates startup and verifies actual app/runtime/managed CLI all report 0.3.4. GUI and open-app CLI modes exercise failed-save blocking before explicit safe relaunch; GUI additionally verifies unresponsive-tab blocking; open CLI reports prepared/not installed. Closed CLI reports installed only after component/startup verification.
- Every mode verifies unchanged canonical Markdown, CLI targets/config, agent integration, login plist and private control key bytes. Artifacts: `.local-pack/update-smoke/{success,cli-open,cli-closed}/result.json`, ready/success screenshots, and `cli-open/cli-output.txt`. Disposable homes and processes were cleaned; no personal install or memory was changed.
- Final inert production Electron shell fixture also covers stale polling completed after a native action and repeated download clicks, preserving the resulting ready state and one operation. Both themes, 390/320px, keyboard and focused unsaved selection passed. Screenshots were inspected after compositor frame flush.
- The initial closed-CLI fixture exposed and fixed a test-only generated arrow-function object syntax error before any installation mutation; its corrected run passed. No live GitHub release, Intel hardware, notarization or historical Keychain identity claims follow from these local fixtures.

### Final merged updater verification — 2026-10-22

- Combined source updater/lifecycle/host/setup suite: **31 passed**. Actual sandboxed Electron icon UI smoke and artifact-only desktop packaging passed against the final graph/sidebar/attention build.
- Disposable `success`, `app-only` and `helper-crash` modes all passed. Paired success keeps actual app/runtime/CLI at fixture0.3.4; app-only preserves pinned CLI0.3.3 and explicitly reports it unchanged; killed-worker recovery restores/reopens the previous working installation.
- Paired success edited and saved the actual Markdown note while preparation ran and verified those exact saved bytes after relaunch. Failed/unresponsive saves blocked restart with inline feedback and no extra dialog. Protected Markdown/configuration/agent integration/login/private-key hashes stayed unchanged in all three scenarios.
- Evidence: `.local-pack/update-smoke/{success,app-only,helper-crash}/result.json` and `.local-pack/update-inline-ui/`. These are local immutable release fixtures, not a public release or a change to the personal installation.
