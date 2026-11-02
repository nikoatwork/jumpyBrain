# Editor indicator lines

## Outcome

Implemented half-width heading rail marks with a visible thickness hierarchy: H1 is 4px tall, H2 is 3px, and H3–H6 are 2px. H1–H6 resting widths are 11/10/9/8/7/6px, exactly half the previous widths. The 32px navigation target, hover magnification, preview placement and existing interactions remain intact.

## Goal

Make the editor's heading indicator lines more compact and make heading levels easier to distinguish.

## Direction

- Reduce the visible horizontal width of the lines to roughly half their current size; tune the exact width visually.
- Make H1 indicators taller (greater vertical thickness) than H2 and H3 indicators. Start with H1 tallest, H2 medium and H3 smallest, and review the balance.
- Reference: the supplied screenshot of the left-hand heading rail with the “Strategic purpose” hover preview.
- Planned 2026-11-01; implementation authorized 2026-11-02.

## Relevant files

- `src/adapters/http-server/note-outline-view.ts` — heading rail presentation.
- `src/adapters/http-server/note-outline.ts` — heading rail behavior.
- `scripts/note-outline-smoke.mjs` — existing rail interaction checks.
- [Original section rail task](../done/2026-10-29_tasks-markdown-section-rail.md) — existing behavior and verification history.

## Tasks

- [x] 1.0 Refine indicator proportions.
  - [x] 1.1 Inspect the current normal, hovered and active indicator dimensions.
  - [x] 1.2 Reduce visible line widths by approximately 50%, preserving comfortable pointer targets.
  - [x] 1.3 Give H1 indicators greater vertical thickness than H2 and H3; tune the heading-level hierarchy, including a consistent treatment for H4–H6.
  - [x] 1.4 Keep the rail alignment, spacing, active-section highlight and hover preview coherent with the smaller lines.
- [x] 2.0 Verify the result.
  - [x] 2.1 Visually review a note containing mixed heading levels in light and dark themes, including normal, hovered and active states.
  - [x] 2.2 Confirm pointer and keyboard navigation, hover previews and scroll tracking still work; use the existing focused smoke checks where appropriate.
  - [x] 2.3 Record final dimensions, verification and any remaining limits; update owning docs and pending release notes as relevant, then finalize through `docs/task-workflow.md`.

## Acceptance

- Indicator lines look roughly half as wide as in the reference screenshot.
- H1 indicators are visibly taller than H2 and H3 indicators.
- The smaller visual marks remain easy to target, and existing rail interactions continue to work.

## Verification

- Tested `80bb7f5` plus this task's scoped implementation and smoke changes on 2026-11-02.
- `npm run build`: passed; editor bundle 663,978 bytes minified / 219,790 bytes gzip, within the existing 220 KB gate. The first build found missing installed `ws` dependencies; `npm ci --ignore-scripts` restored the locked dependencies without manifest/lockfile changes, then the build passed.
- Focused Node suite: 35 passed across architecture boundaries, editor bundle/CSP/size, browser themes and Markdown grammar.
- `npx --package=playwright node scripts/note-outline-smoke.mjs`: passed real hosted editor pointer/keyboard/scroll navigation, current-section tracking, duplicate headings and H1–H6, code/literal exclusion, safe previews, edit/undo/external refresh, read-only navigation, CRLF/caret preservation, lifecycle, 300 headings, and light/dark layouts at 1440/1280/900/681/390/320px. Added rendered dimension/target checks and resting/hover/focus screenshots. Updated the old LF-only Markdown assertion to require the source fixture's preserved CRLF line endings.
- Visually inspected resting light, hover dark, keyboard-focus light, and 681px dark screenshots under `.local-pack/desktop/note-outline/`; active H1 remains accented, heading thickness is distinguishable, and previews stay within the viewport.
- `git diff --check`: passed.

## Limits

- Focused checks only; no full-suite or release certification. No native Mac packaging/installation or physical assistive-technology checks were run. The shared Mac/browser rail code is covered through the real hosted shell.
- No push, installation, release or personal/shared memory writes. Unrelated contextual editor attribution planning remains untouched.
