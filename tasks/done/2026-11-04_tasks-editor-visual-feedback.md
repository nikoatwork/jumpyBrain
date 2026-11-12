# Editor visual feedback

Completed: unsuccessful `@` linking dismisses when writing resumes; 30% smaller checkboxes retain a forgiving pointer target and support nested authoring with canonical save/undo. External Markdown links were already fixed and passed browser/native verification. Three subagents implemented and reviewed independent areas.

Tested source baseline: `38f8c86`, product version 0.3.19; final runtime fingerprint `3e82659d56f4bddf`. Scoped implementation, regression fixtures, documentation and this archive are finalized together.

## Tasks

- [x] Dismiss unsuccessful `@` page-link suggestions when writing resumes, including stale asynchronous responses.
- [x] Reduce checkbox glyphs by approximately 30% and make nested checklists practical to author, preserving canonical Markdown and undo.
- [x] Verify external Markdown link rendering against the already implemented November 3 fix; repair any demonstrated remaining issue.
- [x] Run integrated build, focused editor regressions and applicable source/unit checks.
- [x] Record outcomes and limits, update owning docs/release notes, archive and commit scoped changes.

## Scope and evidence

- User supplied a complete inbox scan summary checked November 4 at 19:53 UTC; this task does not claim a fresh inbox check.
- Update readiness and board-loading reports are outside this requested visual/editor scope.
- External links already have an implementation and pending release note: [prior task](2026-11-03_tasks-external-markdown-links.md); verification required no runtime changes.
- No release, installation or push is requested.

## Verification

- External links: 14 grammar/source-map/native tests, production browser journeys at 1280/390px and real Electron external-opener smoke passed against the baseline build. Existing runtime fix is already committed in `a7a7346` and awaiting release. The smoke now waits for live Saved hydration before asserting exact CRLF source; all preservation assertions remain intact.
- Full suite on the first integrated build: 1,906 tests, 1,904 passed, zero failures, two skips (88.4 seconds).
- Reference autocomplete and page-reference editor regressions passed at 1280/390px, including failed/stale/auth lookups, continued typing, new triggers, delayed responses, paste and synthetic composition.
- Lexical preservation/security passed at 1280/390px; canonical formatting/save/refresh/failure/conflict passed at 1280/390/320px.
- The new checklist journey exposed an existing live-publication conflict when Enter exits an empty root task. Explicit row source intent repairs the exit. Intermediate build `35f58aa1e1bfdc7d` passes 49 focused grammar/source-map/collaboration/architecture/bundle tests and the canonical formatting journey again at all three widths.
- Matched bundle comparison: 221,435 to 221,976 gzip bytes (+541, 0.24%); production output 221,984 bytes, same 15 bundled packages. The bounded editor ceiling is reviewed at 222,250 bytes in `docs/build-footprint.md`; distribution/runtime limits and dependencies stay unchanged.
- Final build `3e82659d56f4bddf`: checklist journeys passed at 1280/390/320px, including exact canonical subtree edits/undo/reopen, hardware Enter/Backspace and native `beforeinput` paragraph/backward-delete. Independent review caught the input-path discrepancy; shared paragraph/delete commands now own these semantics.
- Completion feedback passed all six palette/scheme combinations with responsive captures, keyboard toggles/history/locks/Reduced Motion/navigation/replacement and zero page errors. Desktop and 320px screenshots were visually inspected; smaller glyphs remain aligned, nested rows and wrapped labels fit.
- Final full suite: 1,906 tests, **1,904 passed, zero failures, two skips** (91.7 seconds). Final shared-command page-reference editor regression passed at 1280/390px. JavaScript syntax checks, whitespace checks and the staged private-data guard passed.

## Remaining limits

- No installed-app change or publication; external links were already fixed in source and pending release.
- Chromium automation and synthetic composition do not establish physical IME, assistive technology or Safari/Firefox behavior.
- Updater readiness and board-loading diagnostics were not investigated in this editor task.

## Relevant files

- `src/adapters/http-server/{reference-autocomplete,editor-markdown,editor-markdown-nodes,editor-task-presentation,lexical-editor,notes-browser}.ts` and owning browser contract.
- `scripts/{reference-autocomplete,nested-checklists,task-completion,external-links}-smoke.mjs`.
- `test/{editor-markdown,lexical-bundle}.test.js`, `docs/build-footprint.md`, changelog and pending release notes.
