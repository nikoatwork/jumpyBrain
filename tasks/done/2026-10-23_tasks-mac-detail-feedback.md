# Mac note detail feedback and controls

Status: completed 2026-10-23. Temporary feedback now expires automatically and note detail uses compact accessible controls.

## Goal

Dismiss temporary confirmations automatically and simplify the shared note detail controls used by the Mac app.

## Tasks

- [x] Add bounded, dismissible toast feedback for attention/Undo, copying and deletion; preserve save/recovery errors and active dialog instructions.
- [x] Keep pin/snooze/settle in sidebar rows, remove the top-right duplicates, and use accessible icons for Copy draft, Delete note and Insert page reference.
- [x] Verify timed dismissal, replacement, interaction/Undo, sidebar actions, draft preservation and desktop/narrow layouts; update owning docs and release notes.
- [x] Record results/limits, archive and commit scoped changes.

## Verification and limits

- Build passed; focused controller tests passed. Full `node --test`: 1,213 passed, one skipped, zero failed (working-tree build based on `adcbd33`; unrelated feedback work was present and is excluded from this task's commit).
- Sidebar smoke passed after replacing toolbar-based setup with sidebar controls; pinned rows retain all three actions and reload safely without reading lifecycle guards before initialization.
- Attention smoke passed canonical PATCH/hash/body/caret, presets/custom time, deadline wake, Undo and failed-save guards in both themes at 1280/390/320px. Expanded real-time Snooze/Copy expiry and icon/layout checks passed. Visually inspected dark desktop and light 320px screenshots; toast copy wraps and Undo/Close remain reachable.
- Note lifecycle smoke passed real capture/search/graph, two-tab recovery, deletion cancel/apply and retained backlinks. Reference navigation smoke passed 27 scenarios at desktop/touch widths.
- `git diff --check` and focused toast/navigation tests passed. Test screenshots/logs are disposable local artifacts and are not committed.
- No installed app, personal memory, release version, push or publication was changed. Physical macOS/assistive technology checks remain untested; production shared renderer is exercised with disposable roots.
