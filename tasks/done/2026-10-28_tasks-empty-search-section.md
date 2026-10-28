# Empty search section

Completed 2026-10-28. Empty search now shows only the input row. Results and footer content reveal their own section and divider when present.

## Goal

Keep a newly opened empty search dialog compact; show results, status and actions only when they have visible content.

## Tasks

- [x] Collapse the empty results list and footer, including their divider lines.
- [x] Build, run relevant existing tests and check empty/populated/status/action layouts.
- [x] Record verification and limits, update release notes, archive and commit.

## Verification

Tested snapshot: `06b513f` plus this scoped CSS/documentation change.

- `npm run build` — passed.
- `node --test test/notes-browser.test.js test/graph.test.js test/browser-theme.test.js test/companion-browser.test.js test/lexical-bundle.test.js` — 147 passed, 0 failed.
- Temporary Playwright production-shell CSS check — passed at 1280/390/320px in light/dark: empty dialog contains only the input row and outer border; results/status/retry/connect/reference-help appear as needed; clearing content collapses the sections again; dialog fits the viewport.
- Inspected the desktop dark empty-search screenshot: blank bottom strip and divider lines are gone.
- `git diff --check` — passed.

No new permanent tests for this small CSS change. Render checks used the production shell with scripts removed and explicit DOM states; full live search/backend and installed native-app flows were not rerun. Existing controller tests cover search behavior. No installation, push or release.
