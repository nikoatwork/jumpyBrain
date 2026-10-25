# Search reference layout

Status: completed 2026-10-25. Search now follows the supplied reference layout.

## Goal

Match the supplied reference with a wider, uncluttered search dialog: left note icon, title/one-line preview/file location, and a separate right-aligned last-edit age. Remove visible filters, sorting, author and creation-date details.

## Tasks

- [x] Update result layout, simplify browser search controls, and remove unused presentation code.
- [x] Verify safe rendering, pagination, keyboard navigation, saved-note freshness and responsive dark/light layouts.
- [x] Update docs/release notes, record verification and limits, archive and commit scoped changes.

## Outcome

Widened search to 760px on desktop with responsive bounds. Rows have a decorative note icon, regular 16px title, single-line preview and file location, plus a separate vertically centered last-edit age column. Added a search glyph and a subtly separated footer. Removed the browser filter/sort row and its unused wiring, along with author and creation-date details in result text/tooltips. Search retains relevance ordering, explicit paging, coverage/status messages and guarded navigation. CLI/protocol filtering and canonical attribution remain available independently.

## Verification and limits

Tested snapshot: base `568a49d` plus this scoped change; package 0.3.8 unchanged.

- `npm run build` passed; editor bundle 175,046 bytes gzip.
- Focused search-recognition, notes-browser and graph tests: 123 passed. Checks include safe DOM rendering, stable selection targets, exact last-edit details and relative calendar ages.
- `npx --package=playwright node scripts/search-recognition-smoke.mjs` passed 1280/390/320px in both themes against disposable real Markdown/QMD/server state. Verified icon/content/age columns, centered right-hand age, one-line previews, absent filters/author metadata, unknown-date omission, paging, keyboard opening, unchanged canonical files on read and recent-save freshness.
- Production sidebar, theme, feedback and companion-browser smoke scripts passed through the repository Playwright runner.
- Visually inspected dark desktop and light 320px screenshots under `/tmp/jumpybrain-search-qa/`: no filter row, aligned result columns and no horizontal overflow.
- `git diff --check` passed. Full repository tests, physical native devices, assistive technology and other browsers were not checked. Unrelated active task lists are excluded; no personal memory, installed app, version, push or release changed.

## Relevant files

- `src/adapters/http-server/notes-browser.ts`, `browser-icons.ts`, `search-presentation.ts`, `browser-entry.ts` — result layout, simplified search and removed filter helper.
- Existing controller/date tests and search-recognition smoke — revised presentation and navigation checks.
- Browser contract, design system, pending release note and changelog — current layout and completed outcome.
