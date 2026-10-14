# Mellow daily writing editor

Status: complete; design accepted. Installed runtime unchanged.

## Direction

Keep the clean white page; make daily writing feel more inviting with literary typography, a comfortable measure, generous breathing room, and quieter formatting controls. Keep the existing Markdown and autosave behavior.

## Relevant files

- `src/adapters/http-server/notes-browser.ts` — editor typography and layout.
- `src/adapters/http-server/http-server.docs.md` — browser presentation contract.
- `test/notes-browser.test.js` — existing presentation assertion.
- `scripts/lexical-editor-smoke.mjs` — real-browser wrapping-title and Enter/save/reload regression coverage.
- `scripts/page-reference-smoke.mjs` — native drag uses measured character positions across fonts.
- `tasks/CHANGELOG.md` — writing experience highlight.
- `src/app/{server-memory,writing}/` — readable daily title allocation and the separate writing-prompt heading.
- `src/adapters/http-server/reference-autocomplete.ts` — stable inline suggestions during typing.
- `test/server-daily-note.test.js` and `scripts/{daily-capture,reference-autocomplete}-smoke.mjs` — capture and autocomplete regression coverage.
- `README.md`, `docs/{cloud-shared-memory,shared-memory-protocol}.md`, and `docs/assets/jumpybrain-{writing,memory-map}.webp` — current behavior and product screenshots.

## Tasks

- [x] 1. Refine the writing page, respecting the in-progress companion changes already in the working tree.
- [x] 2. Review empty and populated pages on desktop/mobile and at enlarged text size; run the build and relevant existing browser/editing checks.
- [x] 3. Record results and leave the completed design ready for user review.

## Notes

- CSS must respect the editor's line-preserving Markdown model: each source line is a block, including intentional blank lines. Avoid paragraph margins that turn single line breaks into paragraph gaps.
- No remote fonts, extra settings, or decorative UI are needed for this pass.
- Long titles now use an automatically sized textarea with visual wrapping, preserving the previous single-line title contract. Enter moves into the body; composition Enter is left to the IME.
- The installed companion/runtime and personal memory were not updated; previews and browser checks use disposable local memory roots.

## Verification

- `npm run build` passed.
- 121 relevant Node tests passed across notes, daily capture, companion browser, graph, and Lexical bundle suites.
- Visually reviewed empty/populated desktop and 390px mobile screenshots. Disposable real-server checks at 1440/720/390px confirmed no horizontal overflow, unchanged Markdown on load, and reachable content with enlarged text.
- Screenshot previews are stored outside the repository under the current Codex visualization directory.
- Lexical WYSIWYG/preservation/security smoke passed at 1280px and 390px, including long-title wrapping, Enter-to-body, metadata persistence, and body preservation. The first extended run hit the fixture's duplicate-title guard across viewports; fixture titles now include viewport size.
- Companion browser smoke passed, including read-only, freeze/flush, conflict, and navigation flows.
- A fixed-pixel reference drag check was unreliable with the new serif geometry. Changed it to measured character carets and an exact selected-text assertion. Full real-QMD reference integration smoke passed all 27 desktop/narrow-touch scenarios, including native drag, clipboard events, keyboard navigation, persistence, autocomplete, and tap-versus-scroll.
- `git diff --check` passed. Physical devices, physical IME, assistive technology, and Safari/Firefox were not tested in this pass.
- Commit preparation: isolated the editor hunks from shared companion files and verified an exported staged snapshot independently: build and all 111 applicable Node tests passed. The snapshot used copied dependencies because symlinked dependencies omit the bundler's license discovery paths.

## Follow-up — friendlier capture and reliable references

- [x] Replace technical daily titles with a readable date and use “How is your day?” as the initial body heading. Preserve existing notes and the daily sequence across old/new titles.
- [x] Reproduce and fix flickering/missing `[[` suggestions in the browser on this machine; verify typing, keyboard/pointer acceptance, undo, and autosave.
- [x] Record targeted regression and visible-browser evidence.
- [x] Update the README with fresh writer and graph screenshots captured in Chrome from fictional Markdown notes.

### Follow-up verification

- Build and 196 targeted Node tests passed, covering capture allocation, old/new title normalization, idempotency, explicit-title compatibility, search request cancellation/retention, writing/HTTP seams, reference ranges, and browser state guards.
- Reproduced the empty-list/loading flash in the local in-app browser before the fix. Matching options now remain rendered during new queries; row identity is reused, selection is retained, status space is reserved, and printable keydown no longer refreshes against a pre-input caret.
- Completed visible Chrome checks on this Mac against the real built editor and a disposable indexed Markdown brain: suggestions stayed visible for each letter of `[[d` → `[[daily wr`, including backspace, spaces, and narrowing. Keyboard acceptance, undo, clicking an option, autosave, and reload all passed.
- Visible in-app browser checks also confirmed the readable date title and separate “How is your day?” heading. Existing notes were not migrated.
- Refreshed `README.md` with actual Chrome captures of the writer and current full-page graph (24 fictional notes, 66 connections). The writer WebP crops to the complete writing column for legibility, while the graph preserves the full app viewport; no personal memory or credentials appear in them.
- Extended the existing isolated autocomplete smoke with held-response/row-continuity checks and updated daily-capture smoke expectations; these browser runners were not rerun in this pass. Chrome verification used the live browser controls instead.
- Installed runtime remains unchanged. Source changes are ready for review; unrelated companion updater work remains separate.

## Follow-up — ambient memory map

- [x] Commit the approved writing, autocomplete, daily defaults, and README work separately (`ab0ccb8`).
- [x] Add a restrained blue/lavender/sage wash, shaded nodes, soft halos, and gently colored connections to the graph canvas. Give connections a rounded strand profile with a lit rim and opposite shaded rim. Keep layout and radius/connection meaning unchanged; visible labels now open their note too.
- [x] Verify the graph in Chrome, including zoom, filters, node opening, and return navigation; update the README graph capture.
- [x] Record checks and prepare the graph refinement for its separate commit.

### Ambient map verification

- Build and all 111 applicable Node tests passed (graph, notes browser, companion browser, and Lexical bundle); `git diff --check` passed.
- Verified the real built graph in Chrome on this Mac with 24 fictional notes and 66 connections: zoom/reset, drag-to-pan, filter/refresh, clicking a visible label to open the writer, and Back restoring the prior zoom/pan all passed.
- Replaced the README graph image with the verified ambient graph capture, including the shaded strands. Decorative layers remain inert, and connection statistics count only the original edges.
- Installed runtime and personal memory remain unchanged. Unrelated companion updater work is excluded from these commits.
