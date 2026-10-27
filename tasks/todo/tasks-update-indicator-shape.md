# Update indicator follows the button shape

Status: planned from the user's 2026-10-27 request. Do not implement until asked.

## Goal

Make the Mac app's download-available and ready-to-relaunch indicators follow the shape of their button. The current circular halo around a rounded-square button looks mismatched.

## Notes

- The user accepts either circular buttons or a glow that follows the existing button border. Leave the final shape choice open until visual comparison during implementation.
- The supplied close-up shows the mismatch. Source inspection confirms `update-inline.mjs` gives the readiness pseudo-element `border-radius: 50%`, independently of the shared button radius, and rotates it around the stationary glyph.
- Build on the [existing readiness halo](../done/2026-10-25_tasks-update-attention-halo.md). Coordinate any shared control-shape changes with [the sidebar/window plan](tasks-mac-sidebar-window-chrome.md).
- This is a presentation fix. Preserve the updater's state/action authority, download and relaunch actions, draft-save barrier, app-only policy, error/retry states and hidden idle/success states.
- Before editing, read `src/architecture.docs.md`, `integrations/electron/electron.docs.md`, the affected browser module docs and `docs/design-system.md`.

## Relevant files

- `integrations/electron/update-inline.mjs` — native-injected button, readiness glow/halo and working spinner.
- `integrations/electron/smoke-inline-updates.mjs` — production sandboxed Electron fixture and state/motion screenshots.
- `src/adapters/http-server/browser-design-system.ts`, `browser-theme.ts`, `notes-browser.ts` — shared control shape, theme and footer layout.
- `integrations/electron/electron.docs.md`, `docs/design-system.md` — owning presentation contracts.

## Tasks

- [ ] 1. Choose a coherent button/indicator shape.
  - [ ] Compare circular utility buttons with a border-following rounded-square glow in both themes; choose the smallest consistent change and record the decision here.
  - [ ] Keep the theme/update controls visually consistent if their shared shape changes; avoid a global button redesign for this fix.
- [ ] 2. Apply the chosen outline to both readiness states.
  - [ ] Make the visible glow/halo follow the button perimeter throughout its animation. Simply rotating a rounded-square outline is insufficient if it swings outside the stationary button border.
  - [ ] Keep the download/relaunch glyph stationary, the working spinner distinct, and the decorative effect outside pointer/focus handling. Preserve a static readiness indication under Reduced Motion.
  - [ ] Retain shared target sizes, focus rings and tooltip/accessibility labels without layout shifts or clipping at the sidebar edge.
- [ ] 3. Verify the visual and interaction result.
  - [ ] Reuse the existing Electron fixture for available, app-only available, ready, working, failure/retry and hidden states; inspect both themes and Reduced Motion.
  - [ ] Capture/inspect the animated outline at multiple points, including corners; check adjacent theme control, keyboard activation, focus visibility and narrow layouts.
  - [ ] Run the build and relevant existing updater checks. Update assertions only where the chosen shape/motion changes their contract; record the tested snapshot and remaining limits.
- [ ] 4. Finalize the implemented work.
  - [ ] Update owning docs and pending release notes where relevant; follow [task completion](../../docs/task-workflow.md) to archive and commit scoped work once implementation and required checks are complete.
