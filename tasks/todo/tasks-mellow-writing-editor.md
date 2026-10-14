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
