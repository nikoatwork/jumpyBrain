# Feedback Markdown rendering

Parent feedback: f5a9885c-11cd-48ce-b491-7272749ebed6 (2026-11-05). Completed 2026-11-05 using fictional disposable fixtures only.

## Outcome

The CLI's ordinary Markdown was valid. The editor previously made every non-task bullet literal; its unsupported-relative-link check independently made the whole mixed-link line literal. Bold and HTTP(S) links already existed but could not render inside either fallback. The production baseline showed zero rendered bullets, bold labels or anchors for the fictional reproduction.

Basic top-level `- `, `+ ` and `* ` rows now render their existing inline grammar. Plain relative links remain visible, editable, noninteractive Markdown within rich text, so their HTTPS neighbor and bold label can render. No canonical link policy, local navigation, graph resolution, dependency or budget changed. Enter continuation/empty exit and Backspace marker removal publish explicit source edits and remain undoable. The conservative reference scanner retains hidden list context, including opaque continuation-fence suppression.

## Scope and ownership

- [x] Reproduce CLI-authored ordinary bullets and mixed relative/external links in the production shell.
- [x] Implement bounded ordinary bullet rendering and inert relative-link source, retaining canonical spelling and existing security/fallback policy.
- [x] Verify editing, caret mapping, undo, remote hydration, reopen and unsupported/security neighbors at desktop/mobile sizes; retain caps.
- [x] Document supported grammar, outcomes and limits; archive and commit scoped lane.

Shared feedback/session/follow-up/release/changelog files belong to parent and were not edited. Source-guidance changes remain the separate lane's responsibility. Recommendation for that lane: describe the actual bounded renderer support and inert relative paths; do not ban ordinary Markdown bullets or require alternate authoring templates.

## Relevant files

- `src/adapters/http-server/editor-markdown.ts`: basic marker recognition and conservative inert relative grammar.
- `src/adapters/http-server/editor-markdown-nodes.ts`: ordinary source-line bullet node and native list presentation.
- `src/adapters/http-server/lexical-editor.ts`: import/export, inert inline source, explicit structural editing, maps and list context.
- `src/adapters/http-server/editor-source-map.ts`: literal relative-token offsets beside rendered formatting/links.
- `src/adapters/http-server/reference-ranges.ts`: optional rendered list-position evidence without changing offsets.
- `src/adapters/http-server/notes-browser.ts`: bounded bullet indentation.
- `src/adapters/http-server/browser.docs.md`: support, source and security contract.
- `test/{editor-markdown,editor-source-map,reference-ranges}.test.js`: focused grammar/mapping/fence regressions.
- `scripts/markdown-bullets-smoke.mjs`: actual CLI creation, hash-checked updates and production-shell live editing.
- `scripts/page-reference-editor-smoke.mjs`: replace old literal-bullet caret offsets with rendered offsets; retain unsupported whole-block paste via a quote fixture.

## Evidence and verification

Tested base `181e2301207021a79157789482d1cb18c01119f6` plus this lane's changes. No AGENTS.md exists in this checkout or ancestors. Product vision, task workflow, source architecture, HTTP/browser owning docs and glossary read. Locked development dependencies installed locally with `npm ci --ignore-scripts`; no user installation.

- `npm run build`: passes. Final editor is 674,971 bytes minified / 222,776 bytes gzip, below the unchanged 223,250-byte gate (474 bytes remaining). Optional extension UI unchanged at 5,669 gzip.
- `node --test test/editor-markdown.test.js test/editor-source-map.test.js test/lexical-bundle.test.js test/collaboration-editor.test.js test/reference-ranges.test.js`: 76/76 pass on final source.
- `npx --yes --package=playwright node scripts/markdown-bullets-smoke.mjs`: passes at 1280px and 390px with narrow touch context. Actual `remember`, `show` and hash-checked `update` execute against a disposable authenticated production host. Assertions cover rendered markers/bold/external links, literal security/unsupported neighbors, exact full body/CRLF and untouched hydration bytes, rich-label and inert-path edits/undo, remote update with live caret preservation and subsequent edit, saved reopen, Markdown paste/undo, continuation, marker removal/undo and empty Enter exit. No editor page errors, external requests or whole-document editor PUTs.
- `npx --yes --package=playwright node scripts/lexical-editor-smoke.mjs`: existing production preservation/security smoke passes at both widths.
- `npx --yes --package=playwright node scripts/page-reference-editor-smoke.mjs`: all 72 cases pass after fixing hidden-list fence context and adjusting caret fixtures. After the final structural-edit change, `JUMPYBRAIN_EDITOR_CHECK=task npx --yes --package=playwright node scripts/page-reference-editor-smoke.mjs` passes all four task cases at both widths.
- Shared preview inspected the real baseline and fixed production shell, including narrow layout: baseline literal syntax versus rendered bullet/bold/HTTPS anchor, inert relative spelling and identical canonical body. Preview tab closed and disposable servers/fixtures removed.
- `npm run check:package-size`: final pass, 1,446,329 archive bytes / 4,574,494 unpacked / 3,067,227 runtime / 648 files. Existing caps unchanged; archive headroom is 3,671 bytes. An initial attempt during an in-progress build saw missing artifacts; final sequential check passes.
- `git diff --check`: clean. Combined full suite intentionally belongs to parent.

## Intentional limits

This is bounded line rendering, not a full CommonMark list tree. Nested/ordered lists, extra indentation/spacing, ambiguous tasks, malformed emphasis and unsupported inline/container structures retain editable literal fallback. Bullets render on load/paste and continue with Enter; there is no new as-you-type bullet shortcut. Relative links require plain labels and simple `./` or `../` destinations, stay visibly literal and never navigate; richer relative forms retain whole-line fallback. Existing supported-line formatting normalization and conservative unpublished-draft behavior remain.

Evidence uses localhost Chromium and browser desktop/mobile sizes. Physical mobile keyboards/IME, Safari/Firefox, assistive technologies, packaged native Mac execution and a deployed VPS were not exercised. Search indexing was explicitly disabled/deferred; canonical creation/update/save receipts and source bytes, rather than retrieval readiness, establish success. No private notes, remote memory, inbox or support endpoint was touched. No push, PR or release.
