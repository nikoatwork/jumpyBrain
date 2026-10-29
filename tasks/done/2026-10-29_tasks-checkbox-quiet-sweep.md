# Quiet sweep checkbox completion

## Goal

Integrate selected variant 3: a subtle completion wash, filled tick and persistent fine success baseline across all built-in themes.

## Tasks

- [x] Integrate theme-aware styles and explicit completion feedback with editor lifecycle cleanup.
- [x] Verify pointer/keyboard, undo/redo, document replacement, read-only, canonical save, all six themes and Reduced Motion.
- [x] Update owning docs/release notes and finalize scoped changes for archive/commit.

## Scope

Selection follows the [three-variant exploration](../../deep-dives/checkbox-delight/findings.md). Preserve Markdown/history semantics and unrelated retrieval changes. No installation or release requested.

## Verification

Completed 2026-10-29. User selected Quiet sweep (variant 3). The production editor now gives a 780 ms label wash, 520 ms baseline reveal and 300 ms checkbox settle on deliberate completion. A filled tick and fine baseline persist with full-contrast words. Feedback is derived DOM state, excluded from Markdown/history, and cleared on uncheck, lock, replacement, navigation and destroy. Theme/history/external changes do not initiate it.

Tested snapshot: parent `20557d0` plus this scoped change. Concurrent named-source retrieval work was committed independently and preserved.

- `npm run build`: passed; editor bundle 186,561 bytes gzip, under the existing 187,000-byte gate, no new dependencies.
- Full `node --test`: 1,462 tests; 1,461 passed, one optional real-QMD test skipped because no provisioned binary was supplied; zero failures.
- `scripts/task-completion-smoke.mjs`: all six palette/scheme combinations, zero page errors. Real pointer/Space/Enter completion, rapid recheck, undo/redo without replay, canonical save, read-only/synthetic-click lock, theme/draft preservation, Reduced Motion, document replacement/external refresh and destroy cleanup passed. Actual sidebar navigation through the save guard while feedback was active, and return to saved checks without replay, passed.
- All six themes fit 1280/390/320 px; 24 screenshots retained at `/tmp/jumpybrain-task-completion-qa`. Representative Ember light animation and Mono dark 320 px success screenshots visually inspected. Colors use the selected prototype's already-verified semantic blends.
- `scripts/markdown-formatting-smoke.mjs`: passed at 1280/390/320 px, including canonical formatting/save/refresh/failure/conflict behavior.
- Focused Markdown/theme/bundle tests: 17 passed. `git diff --check` and smoke script syntax check passed.

## Relevant files

- `src/adapters/http-server/editor-task-presentation.ts` — completion styles and bounded disposable DOM feedback.
- `src/adapters/http-server/lexical-editor.ts` — explicit completion trigger and lifecycle cleanup.
- `src/adapters/http-server/notes-browser.ts` — production style composition.
- `scripts/task-completion-smoke.mjs` — real editor regression coverage and captures.
- `docs/design-system.md`, `src/adapters/http-server/browser.docs.md`, `tasks/todo/release-next.md` — owning docs and pending user-facing release note.

## Limits

Verified in Chromium with disposable notes, not physical macOS/Safari/Firefox or assistive technology. No installed-app update, push or release requested or performed. Pending release notes remain active.
