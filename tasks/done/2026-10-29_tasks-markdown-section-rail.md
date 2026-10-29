# Markdown section rail

## Outcome

Implemented a T3-inspired floating heading rail in the shared Mac/browser Markdown editor. Hover shows a heading and opening text; pointer or keyboard activation jumps to that section. Ticks show heading depth and the current scroll section, including short final sections at the scroll limit. Navigation preserves canonical Markdown and pointer editing selection.

## Decisions

- Inspected the installed T3 Code Beta `app.asar`, client `useTimelineFollow-krXlnyvk.js`: evenly spaced ticks, nearest-pointer selection, hover magnification, text preview and Arrow/Home/End/Enter/Space navigation. Adapted the pattern without adding its React implementation.
- Derive destinations from rendered top-level H1–H6 elements, retaining duplicate labels as distinct destinations. Code/literal text is excluded. Preview text never becomes HTML.
- Show the rail for two or more headings above 680px, outside the writing column. Respect Reduced Motion and read-only notes. No canonical IDs, Markdown changes, network, storage or new dependency.
- Coalesce mutation/resize/scroll work through animation frames; reset on navigation and disconnect on pagehide.

## Completed work

- [x] Inspect reference implementation, editor ownership and design conventions.
- [x] Implement rail, live heading updates, scroll tracking, hover preview and keyboard navigation.
- [x] Verify real editor navigation, Markdown/caret preservation, heading edits/undo, lifecycle, dense documents, themes and responsive layout.
- [x] Update owning docs/release notes, archive and commit scoped work.

## Verification

- Started from clean `1c99836`; final verification ran over `708eadb` plus this implementation and concurrent onboarding work. Unrelated changes are excluded from this task's commit.
- `npm run build`: passed; editor bundle 568,735 bytes / 188,296 bytes gzip. Reviewed the roughly 2 KB rail cost and raised the existing gzip review gate to 189 KB; no dependencies added.
- Focused Node suite: **181 passed**, covering graph/shell, editor workspace, bundle/CSP, architecture boundaries, Markdown, external updates and themes. Corrected the existing design-token test to recognize the sidebar's persisted inline width override, matching its existing node-color exception.
- `npx --package=playwright node scripts/note-outline-smoke.mjs`: passed pointer/keyboard/scroll tracking; duplicate headings and H1–H6; literal/code exclusion; safe live heading text; editing/undo and external refresh; read-only behavior; exact CRLF bytes and caret preservation; departure cleanup; 300 headings; light/dark and 1440/1280/900/681/390/320px layouts. Screenshots visually inspected under `.local-pack/desktop/note-outline/`.
- `npx --package=playwright node scripts/note-workspace-smoke.mjs`: passed existing editing, formatting/undo, references, navigation, failed-save recovery, copy, read-only, palettes and responsive journeys.
- `node scripts/electron-smoke.mjs`: passed production sandboxed window/gateway, native heading keyboard jumps, short-final-section highlight, canonical byte preservation, Find, themes, editing/autosave and close guards. The fixture disables background throttling so animation-frame observers and smooth scrolling advance when the test window is occluded; production window behavior is unchanged.
- `git diff --check`: passed.

## Limits

- The broad `node --test` attempt was interrupted during unrelated installer tests after identifying the theme-token assertion above. The focused suite including that corrected assertion passed; this is not a full-suite or release certification.
- Unsupported Markdown stays literal according to the existing editor grammar. Narrow layouts hide the rail. Physical assistive technology and non-Chromium browsers were not exercised.
- No installation, release, push or personal/shared memory changes.
