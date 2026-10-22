# Compact sidebar controls

Status: completed and archived 2026-10-22. Implementation and verification are recorded below; see the combined sidebar/attention coordination archive for integration evidence.

## Goal

Give the sidebar one compact Search/New note row, an icon theme toggle and consistent navigation, with no empty-Pinned helper text.

## Scope and ownership

- Read [coordination/contracts](2026-10-22_tasks-sidebar-attention-refresh.md), `src/architecture.docs.md`, `src/adapters/http-server/browser.docs.md` and `docs/design-system.md` first.
- Own navigation markup/layout in `src/adapters/http-server/notes-browser.ts`, theme behavior/markup in `browser-theme.ts`, relevant `browser-sidebar.ts` behavior and focused sidebar/theme checks.
- Typography track owns tokens/font declarations. Attention UI owns list controller/rendering and Settle/Snooze actions. Updater UI owns its injected control; expose a stable footer utility slot for it rather than implementing updater behavior here.
- Keep current IDs/handlers where possible, and preserve sidebar collapse, navigation guards, draft/caret stability and narrow layouts.

## Tasks

- [x] 1.0 Replace sidebar Search and New note text controls with recognisable magnifier and compose/plus icons on one row. Keep accessible names, keyboard shortcuts, tooltips and adequate hit targets; Home's existing primary actions are separate.
- [x] 2.0 Replace the full-width theme selector with one sun/moon icon toggle. Preserve initial System preference behavior until explicit activation, persist Light/Dark and synchronize tabs. Label the action (for example “Switch to light theme”) and keep visible keyboard focus.
- [x] 3.0 Remove `sidebar-pinned-empty` helper copy and safely update any controller assumptions about that element. Keep Pinned quiet when empty. Leave attention data/renaming to its owning track.
- [x] 4.0 Apply the agreed navigation role equally to Graph, Settings/Connect and Feedback. Align the theme/update utility slots and responsive rows using shared spacing/control tokens.
- [x] 5.0 Verify existing create/search shortcuts, collapse/expand, pinning, current-page focus and theme persistence with existing tests/smokes. Inspect 1280/390/320px in light/dark with long titles and both present/absent desktop updater controls.
- [x] 6.0 Record results and provide browser contract wording to the integrator. No update installation is needed for this layout task.

## Acceptance

- Search and create occupy a single row of icons; theme is sun/moon only; helper copy is gone.
- Ordinary sidebar destinations share the same typography. Controls work by keyboard/touch and switching theme does not recreate the editor.

## Implementation and verification — 2026-10-22

- Search/New note are SVG-only buttons on one shared row, retaining IDs, accessible names and existing shortcut hooks. The empty Pinned helper element is removed; page-navigation owns tolerating its absence.
- Theme uses a direct sun/moon button with the next action as its accessible name/title. Existing System preferences are preserved until activated; Light/Dark choices persist and storage changes synchronize tabs without editor replacement.
- `.nav-utilities` is the stable shared footer row for theme and the optional native updater child. Ordinary navigation explicitly uses regular 400, 13px/1.5 system sans.
- `npx tsc -p tsconfig.json --noEmit`, changed-script syntax checks, source theme behavioral checks (System/toggle/persistence/cross-tab reset), and `git diff --check` passed. Production build and browser smokes are coordinated by the integrator after all concurrent tracks settle; results still need recording for tasks 5–6.
- Expanded theme smoke covers 1280/390/320px, both themes, equal computed destination typography, icon-only actions, same-row targets, Pinned helper absence and theme focus/action glyphs. Existing companion/sidebar smokes now use the button instead of the removed selector.
- Browser contract wording for integration: retain a stored System theme until the first direct icon toggle; preserve existing search/create IDs and guarded navigation; inject the optional native update child into `.nav-utilities`; do not show empty-Pinned helper copy.

### Coordinated theme/browser QA

- Production build passed (integrator); `node --test test/browser-theme.test.js`: 5/5 passed.
- `JUMPYBRAIN_SMOKE_SCREENSHOT_DIR=/tmp/jumpybrain-sidebar-attention-qa npx --package=playwright node scripts/theme-smoke.mjs`: passed. Checked 1280/390/320px in both palettes; matching computed ordinary navigation fonts; same-row icon-only Search/New note; empty-Pinned helper absence; sun/moon visibility, action labels and keyboard focus; System/manual/reload/cross-tab/blocked-storage behavior; preserved draft, caret, dialog and map.
- Visually inspected desktop dark and 320px light screenshots. No overflow or clipped controls. Smoke palette assertions now move the pointer away after a toggle so hover colors do not masquerade as resting-color regressions.
- Pin/collapse/save-navigation and native updater-present coverage remain with the integrator's updated sidebar/updater smoke suites. Physical devices, assistive technology and non-Chromium browsers were not tested.

- Final integration sidebar smoke passed with canonical attention order, pins, rename, reload/cross-tab behavior, failed-save guards, theme/narrow layout and added collapse/reload/editor-instance preservation checks. The native production-shell updater smoke passed updater-present 390/320px layouts. This completes task5; final browser/module wording is integrated in `browser.docs.md`.
