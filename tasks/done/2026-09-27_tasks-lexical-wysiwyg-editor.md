# Lexical WYSIWYG notes editor

Status: completed and archived 2026-09-27 with user approval.

Delivered vanilla Lexical WYSIWYG editing with Markdown preservation, autosave, and page references. Verified 349 tests, desktop/mobile browser flows, screenshots, and the extracted package. No local installation was changed.

## Goal

Replace the raw textarea with direct, formatted editing: headings/subheadings, bold and italic, without preview mode or a frontend framework. Keep Markdown canonical and preserve the existing capture, search, references, and autosave workflows.

## Decisions

- User approved Lexical and uninterrupted implementation; no clarification round needed.
- Use vanilla Lexical, locally bundled at build time; no CDN, React, or separate frontend service.
- Unsupported Markdown must remain visible as literal text, not disappear. Exact unchanged content should not be rewritten merely by opening a note.
- Keep frontmatter outside the rich editor and retain the existing serialized If-Match save controller.
- Browser checks use disposable memory only, never real local/team memory.

## Relevant Files

- `src/adapters/http-server/notes-browser.ts` — note UI, navigation, references.
- `src/adapters/http-server/graph-page.ts` — shell and existing save controller.
- `src/adapters/http-server/lexical-editor.ts` — new browser editor bridge and Markdown handling.
- `scripts/build-editor.mjs`, `package.json` — local browser bundle.
- `test/lexical-bundle.test.js` — bundle weight, CSP embedding, notices, dependency contract.
- `scripts/lexical-editor-smoke.mjs`, `scripts/editor-smoke-helpers.mjs` — rich editing/preservation checks and DOM selection helpers.
- `scripts/*smoke.mjs`, existing browser controller tests — capture/search/save/navigation regressions.
- `scripts/local-pack-manifest.mjs` — required bundled assets and notices.
- `src/adapters/http-server/http-server.docs.md`, `src/architecture.docs.md`, `docs/cloud-shared-memory.md`, `docs/shared-memory-protocol.md` — owning and user-facing contracts.

## Tasks

- [x] 1.0 Inspect architecture, editor lifecycle, tests, and packaging.
  - [x] 1.1 Read owning docs and identify textarea-specific selection/history assumptions.
  - [x] 1.2 Bounded memory recall attempted; no relevant prior editor decisions returned.
- [x] 2.0 Implement minimal, locally bundled Lexical editor.
  - [x] 2.1 Add pinned dependencies and production bundle with license notices/size measurement.
  - [x] 2.2 Add formatted typing, heading and emphasis controls, undo/redo, safe paste, and conservative Markdown preservation.
  - [x] 2.3 Integrate autosave, navigation locking, focus, and page-reference insertion with Lexical selection/history.
- [x] 3.0 Verify behavior and fix regressions.
  - [x] 3.1 Test Markdown preservation, no-op loads, formatting, unsupported content, and malicious text.
  - [x] 3.2 Run unit suite and browser checks for creation/edit/save/reload, undo, references, failed saves, navigation, and mobile layout.
  - [x] 3.3 Capture and inspect screenshots; measure bundle and verify packaged assets.
- [x] 4.0 Update owning contracts and record results/remaining limitations here; add significant user-facing changelog highlight.

## Verification / Results

- Implemented vanilla Lexical 0.51.0 with a locally inlined production bundle; no React/CDN or runtime npm dependency. Final measured bundle: 418,919 bytes minified / 137,251 bytes gzip (15 bundled packages, notices included). The direct Node shell does not itself enable gzip.
- `npm test`: 349 tests passed. Removed the obsolete textarea-range test and replaced its coverage with actual Lexical DOM selections in browser smokes; added bundle/CSP/license/size contracts.
- Final browser rerun: graph/editor regression PASS (including pointer clicks racing autosave and failed-save recovery); recent-notes PASS at 1280px/390px; daily capture PASS in all 15 scenarios. The `[[` trigger handles both controlled Lexical edits and native input events.
- `npm run cli:pack`: 124 required CLI/runtime files verified, including the browser bundle and license notices. Extracted `.local-pack/jumpybrain-0.1.0.tgz` outside the repo without installing any dependencies; full focused Lexical browser smoke passed against that extracted server at both widths. `git diff --check` passed.
- Focused browser checks pass at 1280px/390px: real note creation, heading/emphasis typing, toolbar formatting, save/reload/undo, literal-content edits, exact reference punctuation, safe paste, and cross-document history reset.
- Reviewed screenshots: `/tmp/jumpybrain-lexical-shots/lexical-1280.png` and `lexical-390.png` (disposable fixtures only; not committed).
- Independent review found and prompted fixes for formatting/shortcut stripping inside literal blocks, escaping underscores in exact reference titles, undo leaking between empty documents, and edits escaping unsupported delimiter syntax.
- Preservation boundary: unchanged source lines retain spelling/spacing; edited supported lines may normalize emphasis markers. The browser submits original newline style; the existing canonical server writer normalizes line endings on save. Unsupported blocks remain dotted-underlined literal text; use Text/heading controls to explicitly convert a block. No full CommonMark/GFM editing claim.
- Remaining QA/scope: Chromium desktop and emulated mobile were tested, not Safari/Firefox, physical mobile keyboards, or comprehensive IME interaction. Full tables/lists/code-block UI, rich HTML paste, clickable references, and offline/crash-safe drafts remain out of scope. Existing server autosave/conflict policy is unchanged.
- Changelog highlight added for the new direct-formatting workflow. No glossary term needed; WYSIWYG is standard editor terminology.
