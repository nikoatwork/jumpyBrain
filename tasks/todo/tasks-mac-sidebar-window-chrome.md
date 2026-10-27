# Integrated Mac sidebar and quiet window chrome

Status: planned from the user's 2026-10-27 request. Do not implement until asked.

## Goal

Move the Mac app toward T3 Code's compact, calm sidebar: native window controls integrated into the app surface, an easy-to-reach New note action and small, subtle `jumpyBrain` branding. Keep jumpyBrain's global search behavior.

## Reference and boundaries

- Inspected the running T3 Code (Beta) Mac app on 2026-10-27, alongside the user's screenshot. Its traffic lights, sidebar toggle and quiet app label share the upper sidebar area; a compact row below contains Search and the compose action. Use this hierarchy and spacing as inspiration while retaining jumpyBrain's Ember themes and writing surface.
- Search must continue to open the existing global note search, including notes absent from the sidebar. Do not add a sidebar filter or copy T3 Code's thread-search scope.
- Keep New note as a compact compose action inside the sidebar's upper controls, using the existing guarded creation flow and keyboard shortcut.
- Use the exact `jumpyBrain` spelling, small regular-weight type and a muted but readable color. Consolidate prominent/repeated branding, including the current brand/beta treatment, so the app name feels secondary to the notes.
- Integrate the real macOS close/minimize/full-screen traffic lights into the app surface rather than a separate visible title strip. Preserve native controls and their platform behavior; no drawn substitutes.
- Preserve the continuous pinned/attention note list, brain selector/status, footer actions, collapse preference and draft protection. This plan does not introduce T3's projects, thread cards or filters.
- Keep native window treatment scoped to the Mac host; hosted/browser sessions must have a usable layout without native-control gaps. The desktop shell currently uses the default `BrowserWindow` chrome, while shared navigation/branding live in `notes-browser.ts`.
- Coordinate utility-button geometry with [the update-indicator plan](tasks-update-indicator-shape.md) and reuse the shared hover/focus labels.
- Before editing, read `src/architecture.docs.md`, `integrations/electron/electron.docs.md`, `src/adapters/http-server/browser.docs.md` and `docs/design-system.md`.

## Relevant files

- `integrations/electron/window.mjs` — sandboxed editor window configuration and native window lifecycle.
- `src/adapters/http-server/notes-browser.ts` — sidebar, action row, branding and workspace toolbar markup/styles.
- `src/adapters/http-server/browser-sidebar.ts`, `browser-page-navigation.ts` — collapse preference and existing note navigation.
- `src/adapters/http-server/browser-design-system.ts`, `browser-theme.ts`, `browser-control-labels.ts` — shared type/spacing/shape, colors and tooltips.
- `scripts/sidebar-smoke.mjs`, `scripts/theme-smoke.mjs`, `scripts/companion-browser-smoke.mjs`, `integrations/electron/smoke-app.mjs` — existing layout/native fixtures to assess and reuse.

## Tasks

- [ ] 1. Establish the integrated header layout.
  - [ ] Compare the current app with the reference; choose precise traffic-light, toggle, brand and New note placement using existing spacing/type tokens.
  - [ ] Check the installed Electron/macOS support before choosing hidden/inset title-bar configuration and traffic-light positioning. Keep the existing sandbox and host boundary; avoid a new generic native bridge for styling.
  - [ ] Define expanded, collapsed, narrow and full-screen arrangements, including where native controls and drag space remain accessible. Record the layout decision here.
- [ ] 2. Integrate native Mac window chrome.
  - [ ] Use native traffic lights within the upper app surface, with adequate insets and a deliberate window-drag region.
  - [ ] Exclude interactive controls, inputs and tooltips from drag regions. Preserve close-to-background, reopen, minimize, zoom/full-screen and guarded close/quit behavior.
  - [ ] Scope desktop layout/insets through the existing host composition without reserving traffic-light space in ordinary browser sessions.
- [ ] 3. Refine sidebar hierarchy and branding.
  - [ ] Place the quiet `jumpyBrain` label and sidebar toggle coherently with the native header; remove redundant prominent branding as needed without losing Home access.
  - [ ] Make New note a compact, clearly named compose control in the upper sidebar action area, with hover/focus label and existing shortcut behavior.
  - [ ] Retain a clear entry to global search and its Cmd/Ctrl+K behavior; keep note-list navigation, selection and brain controls usable.
  - [ ] Use shared colors, typography and spacing in both themes; preserve useful contrast, keyboard focus, target sizes and long-title truncation.
- [ ] 4. Verify in the real Mac window and shared browser shell.
  - [ ] Inspect both themes across Home, note and graph views; expanded/collapsed sidebar, minimum supported Mac width, full-screen and restored window states.
  - [ ] Physically check dragging from the intended region and clicking controls beside it; verify native close/minimize/full-screen and reopening without lost drafts.
  - [ ] Verify New note and global search by pointer/keyboard, including finding a note absent from the sidebar, dirty-note navigation and visible focus/tooltips.
  - [ ] Run the build and relevant existing shell/native checks; inspect hosted desktop and 390/320px layouts without native-control gaps. Record screenshots, tested snapshot and any untested physical interactions honestly.
- [ ] 5. Finalize the implemented work.
  - [ ] Update owning browser/native docs and `docs/design-system.md` for the final layout, consolidate user-facing pending release notes, and apply the repository changelog gate to the implemented impact.
  - [ ] Follow [task completion](../../docs/task-workflow.md) to archive and commit scoped work after implementation and required checks are complete.
