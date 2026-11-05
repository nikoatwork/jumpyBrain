# Checkbox alignment and completed text

Completed 2026-11-05. The shared editor centers task boxes on the first writing line and uses 80% opacity for the entire checked label. The partial underline and its animation are removed; the brief whole-label wash and checkbox feedback remain.

## Goal

Center task checkboxes on the first text line in the shared Mac/browser editor and replace the partial completion underline with 80% label opacity.

## Tasks

- [x] Update shared task layout and completed-label styling.
- [x] Verify alignment, complete-label opacity, keyboard/history/save behavior and Reduced Motion across themes and viewport widths.
- [x] Update owning docs and pending release notes, record checks and limits, archive and commit the scoped change.

## Relevant files

- `src/adapters/http-server/notes-browser.ts` — shared editor layout.
- `src/adapters/http-server/editor-task-presentation.ts` — task completion presentation.
- `scripts/task-completion-smoke.mjs` — production editor smoke.
- `scripts/lexical-editor-smoke.mjs` — canonical formatting/preservation check; use supported keyboard actions when the narrow sidebar is collapsed.
- `src/adapters/http-server/browser.docs.md` and `docs/design-system.md` — presentation contract.

## Notes

- The Mac renderer uses the same browser/editor styles.
- Existing task completion animation and Markdown semantics remain unchanged apart from removing the baseline animation.
- Bounded local memory recall found no relevant passages.

## Verification

Tested snapshot: base `a9f8cd242bfd0176ca7eef94abf6ccdd07d16036` plus this scoped change. Compiled notes shell SHA-256 `1e2b930c7cfbd87f469d6b68e6c4aecce31e1e99035293584dfda36453287770`; task presentation SHA-256 `6a520b78386a95b545e75ee99655d63512947f89528994c9690aa15cf6fd691a`.

- `npm run build` passed.
- `node --test test/editor-markdown.test.js test/editor-source-map.test.js test/graph.test.js`: 54 passed, none skipped or failed.
- `npx --package=playwright node scripts/task-completion-smoke.mjs`: all eight palette/scheme combinations passed at 1280/390/320 px, with zero page errors. Measured first-line box centers within 0.75px, complete-label 80% opacity, no added underline, wrapped/nested/formatted labels, unchanged geometry, canonical saves, undo/redo, pointer/Space/Enter, permission locks, external hydration, document replacement and Reduced Motion.
- `npx --package=playwright node scripts/nested-checklists-smoke.mjs`: passed at 1280/390/320 px, including subtree indentation, undo, continuation, reopening, box size and pointer target.
- `npx --package=playwright node scripts/lexical-editor-smoke.mjs`: passed at 1280/390 px. Initial runs exposed stale narrow-sidebar clicks on Search and New note; switched these to the existing keyboard shortcuts and verified that Search opens before dismissal.
- Visually inspected production captures for Ember light desktop and Mono dark 320px; wrapped labels retain first-line alignment and no completion underline.
- `git diff --check` passed.

## Limits

- Native Electron validation remains unverified: two disposable probes produced no result before their 45-second and 30-second process deadlines. Browser checks exercise the same shared editor CSS used by the Mac renderer, but do not certify native window behavior.
- No installed app update, private brain changes, push or release. No full repository test-suite claim; validation is scoped to shared editor rendering and canonical formatting.
