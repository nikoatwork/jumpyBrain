# Sidebar search order

## Goal

Move Search to the right of New note in the sidebar action row: Home, New note, Search. Match DOM/keyboard order to the visual order.

## Tasks

- [x] Reorder the shared sidebar actions and update the design contract.
- [x] Build and run the existing sidebar browser smoke.
- [x] Record verification, archive and commit the scoped change.

## Outcome and verification

Completed 2026-10-28 on parent `d20bac2` plus this scoped change. Shared sidebar DOM/keyboard order is now Home, New note, Search; Search retains its flexible width.

- `npm run build` — passed.
- Existing production sidebar browser smoke — passed, including both themes, narrow layout, persistence and save guards.
- Built hosted/desktop shells checked for the requested action order — passed.
- `git diff --check` — passed.

Presentation-only reorder; no new tests, installation or release.
