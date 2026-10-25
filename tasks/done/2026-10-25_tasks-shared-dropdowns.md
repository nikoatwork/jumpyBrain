# Shared dropdowns and Settings cleanup

Completed 2026-10-25. Settings and brain switching now share a themed native dropdown component. Menus follow the control width, long option labels wrap, and long selections truncate while retaining the arrow. The existing lean Settings layout is confirmed.

## Scope

Keep the existing lean Settings cleanup (the screenshot's standalone Search index section is already removed). Replace individually styled dropdowns with one shared design-system component whose picker follows the control width and parent layout. Preserve native select semantics, existing value/change flows, form validation and guarded brain switching.

## Work

- [x] Centralize dropdown control/picker styles and apply the component to connection type, brain switching, extension palette and command placement.
- [x] Verify native keyboard/pointer selection, disabled state, long labels, overflow and viewport-edge placement in desktop/390px/320px light/dark layouts; confirm the current Settings cleanup.
- [x] Run the build and relevant browser/companion/extension checks, update owning docs and pending release notes, archive and commit scoped work.

## Relevant files

- `src/adapters/http-server/browser-dropdown.ts`
- `src/adapters/http-server/browser-entry.ts`
- `scripts/dropdown-smoke.mjs`
- `src/adapters/http-server/graph-page.ts`
- `src/adapters/http-server/companion-browser.ts`
- `src/adapters/http-server/extensions-view.ts`
- `src/adapters/http-server/extensions-browser.ts`
- `docs/design-system.md`
- `src/adapters/http-server/browser.docs.md`

## Notes

- Base snapshot: `4e8cda7`. Unrelated editor, migration and task-list work remains untouched.
- Use progressive CSS enhancement (`appearance: base-select`); unsupported hosted browsers retain a styled native select and their platform picker.
- Existing Settings cleanup is recorded in `tasks/done/2026-10-24_tasks-settings-cleanup.md`; this task does not install or release the app.

## Verification

Tested `4e8cda7` plus the exact scoped implementation in an isolated temporary source copy, excluding concurrent unfinished editor/migration work. Source files and the new smoke script were byte-compared with the working tree after verification.

- `npm run build`: passed for the scoped snapshot. The helper adds about 125 gzip bytes to the shared editor bundle and about 103 gzip bytes to the optional extension bundle; dropdown CSS stays in the shell instead of duplicating into browser bundles.
- Focused companion, extension-browser, browser-theme and architecture-boundary tests: all 46 passed.
- New `scripts/dropdown-smoke.mjs`: passed native keyboard/pointer selection, Escape cancellation, disabled fieldsets, change events, idempotent preparation, selected-label space for the arrow, long option wrapping, parent/viewport bounds and bottom-edge flipping at 1280/390/320px in light/dark.
- Production companion, sidebar, theme, feedback and extension-controller browser smokes: passed, including guarded switching, stable focus across polls, read-only controls, form/session behavior, theme switching and extension palette handling.
- Visually reviewed the Settings and open-menu screenshots. Local artifacts are in `/tmp/jumpybrain-dropdown-final` and `/tmp/jumpybrain-settings-dropdown-final`.
- `git diff --check`: passed.

## Limits

No app installation, release, native Mac window or assistive-technology testing. Unsupported hosted browsers retain their platform picker; cross-browser native fallback rendering was not separately exercised. The combined unfinished working tree was not validated: an earlier main-checkout build encountered an unrelated in-progress `ElementDOMSlot` export error in the editor work, so verification used the isolated scoped snapshot. Temporary validation bundles are not distribution artifacts.
