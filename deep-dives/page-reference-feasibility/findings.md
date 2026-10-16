# Page-reference feasibility results

Historical investigation below (baseline `fb22bc1`), not the current product contract. **Integration update, 2026-10-08:** production navigation/autocomplete are implemented and Chromium-tested; the disposable editor/plugin/scanner forks have been removed. Historical smoke entrypoints now forward to production regression runners. See the [completed integration](../../tasks/done/2026-10-08_tasks-page-reference-integration.md) for automated evidence and [manual QA follow-up](../../tasks/todo/tasks-page-reference-manual-qa.md) for remaining gates, and [HTTP adapter docs](../../src/adapters/http-server/http-server.docs.md) for implementation ownership.

## Recommendation

**Conditional go for a bounded implementation; no-go for shipping these prototypes unchanged.** Normal-click references and caret autocomplete work with vanilla Lexical and the existing search controller. Neither needs a framework, editor replacement, new search engine, or positioning dependency. The work is more than styling: reference recognition, source preservation, live insertion ranges, accessibility, and guarded app integration need explicit ownership.

At investigation time, production files were unchanged and `editor.ts` was a disposable fork. Baseline: repository commit `fb22bc1`, production editor blob `0f97c0543f4846e270985ee1ea7046a89aa405d4`. Those historical prototypes remain available in Git at `47f8754`; current code and regression runners use only the production editor.

## What was demonstrated

- **Navigation interaction:** 32 passing browser checks across 1280px and 390px Chromium, including baseline comparisons. Normal click/touch and Tab→Enter invoke a title callback in paragraphs, headings, bullets, nested bullets, and multiple references per line. Drag selection remains native; keyboard editing, bracket invalidation, title edits, picker insertion, paste, undo/redo, and navigation-lock suppression were exercised. Hydration/activation did not emit body changes. This callback does not yet resolve/open real notes.
- **Autocomplete:** 22 passing browser checks at the same widths, using the actual `createNoteSearch` controller extracted from the built shell, with a **stubbed transport**. Demonstrated empty-query hint/no request, continued typing, debounced search, keyboard/pointer/touch acceptance, exact range replacement, undo, Escape, delayed-result cancellation, session invalidation, inline auth/error/empty/stale feedback, synthetic composition guards, and scrolling/viewport bounds. Headings and nested bullets work even with code elsewhere in the note. Search relevance and real authenticated transport were not evaluated.
- **Title lookup:** 23 semantic/safety cases plus five benchmark assertions passed over temporary Markdown only. Uses real canonical scanning/document reads, no QMD: normalized exact titles, ambiguity including ID-less matches, invalid/duplicate IDs, editor-root isolation, unindexed rename/deletion, and no filename/path/fuzzy fallback. Tree/content snapshots were unchanged by lookup. The probe copies the private title normalizer only for research; production must share the core helper.
- **Conservative context follow-up:** 38 pure scanner regressions pass, including exact-length multiline backticks, unclosed delimiters, unsupported container/list-continuation fences, mixed inline/container contexts, and UTF-16 offsets. Browser regressions now assert the formerly printed `KNOWN GAP` cases, delimiter edit/undo/redo preservation, inert formatted cross-leaf references, no cross-leaf autocomplete requests, and cancellation when formatting invalidates an active query. Strict prototype TypeScript checking passed again.
- **Repository verification at finalization:** `npm test` rebuilt production and passed all 413 discovered tests; the isolated 38-test scanner probe and strict prototype typecheck passed separately. Initial investigation also passed the focused 46-test architecture/bundle/browser-controller selection. These checks do not validate feature integration: no real reference navigation or autocomplete has been wired into the app, and production browser smokes were not run for this prototype-only work.

## Important corrections found during testing

1. **Reference promotion is not a source edit.** A root transform that replaces ordinary text with reference nodes changes the existing structural preservation snapshot. Breaking a closing code fence initially changed an untouched `_italic_` to `*italic*`, including in what had become literal code. The prototype now snapshots semantic text runs, ignoring reference-only classes/splits and the internal code flag. A baseline/prototype regression verifies the original spelling survives. Preserve this test when porting; do not simply add node transforms to the current structural snapshot.
2. **Use a live editor seam, not a moving modal snapshot.** The prototype adds `autocompleteRange()` and `subscribeReferenceContext()` on the editor bridge. Context comes from current Lexical nodes; acceptance revalidates the live range and document/session. This removed an initial whole-document code exclusion and avoids a DOM MutationObserver. The existing stale-draft check remains intact.
3. **Walk ordered ranges once.** Filtering every reference for every leaf made the first navigation prototype quadratic. A monotonic range cursor materially reduced the large-note overhead without caches or new state. Full-document scanning still deserves production-scale testing.
4. **Same-leaf selection was not sufficient.** An opener in one leaf could replace only `[[al` while leaving a formatted `pha]]` sibling behind. The shared caret-derived range now rejects unfinished candidates unless the caret is at the logical block end. Completed replacements must contain both closing brackets in the same leaf. Browser fixtures construct real formatting splits through editing, not imported title punctuation, which is intentionally literal.

## Measurements (synthetic, local, not performance guarantees)

- Baseline production editor bundle: **137,274 bytes gzip**. Navigation/editor prototype after the conservative context follow-up: **139,473** (+2,199). Combined navigation + autocomplete prototype: **141,652 bytes gzip** (+4,378). No dependency/package changes. The combined fixture reuses the shell's existing search controller; its source is not duplicated in the editor bundle.
- Five fresh title resolutions over **1,000 × 1KB files**: one isolated run p50 **102.1ms**, p95 **109.9ms**; a later run alongside browser tests p50 **119.5ms**, p95 **175.6ms**. Fixture creation/snapshots warm filesystem caches. These include separate title and ID scans; not cold-cache, large-corpus, concurrency, or deployment measurements.
- Initial investigation's single-edit-to-next-frame samples (not rerun after the conservative context follow-up), five per case, Chromium desktop/Apple M3 Pro; includes automation/frame overhead:

| Fixture | Baseline hydration / edit p50 / p95 | Prototype hydration / edit p50 / p95 |
| --- | --- | --- |
| 100 lines / 300 references | 6.2 / 16.3 / 16.7 ms | 13.8 / 16.3 / 17.4 ms |
| 1,000 lines / 3,000 references | 18.6 / 15.9 / 16.2 ms | 52.5 / 16.0 / 33.4 ms |

Before the ordered scan change, the 1,000-line prototype measured 99.9ms hydration and 35.2/142.1ms edit p50/p95. Five samples are directional evidence, not a stable latency distribution or SLO. Autocomplete-active large-note performance was not benchmarked.

## Remaining gates / limitations

- **Conservative code-context policy (prototype only):** exact-length inline backtick spans now carry across lines; unclosed spans suppress references through EOF. Quote/list/indented fence-like openers, including detected indented list continuations, make the remaining document inert even after an apparent closer. This deliberately sacrifices later valid links/suggestions rather than guessing container boundaries. Ordinary top-level fences still resume recognition after a valid closer. The former known failures are assertions now, not waived gaps; this bounded recognizer is not a general Markdown parser or proof for every dialect. Accept or refine these false negatives before rollout.
- **Single-leaf fallback (tested):** cross-format references stay editable, with their formatting intact, but are not links. Autocomplete requires a single-leaf completed reference or an unfinished opener-to-caret span at the logical block end. It does not open for unfinished mid-block text or split openers/titles/closers, and formatting a live query cancels pending results. No merging or formatting removal is used. The explicit picker remains available for intentional insertion elsewhere.
- **Accessibility/touch:** popup ARIA is illustrative, not a complete editor/listbox/active-option relationship. Touch accepts on pointerdown and disables popup touch scrolling: production needs tap-versus-scroll handling. Native Tab→Enter is tested, not screen-reader-generated activation. Normal-click navigation also wins before a double-click text selection; keyboard editing and drag selection are the demonstrated editing paths.
- **Composition/geometry:** synthetic composition events and narrow touch-enabled Chromium are not physical IME/mobile keyboard, assistive technology, Safari/Firefox, pinch-zoom, or physical-device validation. Scroll/resize/clipping passed; mobile visual-viewport behavior remains unproven.
- **App integration:** no authenticated exact-title route exists yet; no real reference click has traversed the current save/history guard. Explicitly wire document/credential/modal/read-only transitions to popup cancellation and retain failed drafts. Verify stale search feedback after real autosaves, Cmd/Ctrl+K coexistence, repeated clicks, Back/Forward, and lost responses using the existing disposable server smokes.
- **Resolution races:** a scan followed by ID read is not atomic against external writers. The probe rejects a target whose title/path changes between its reads, but cannot guarantee collection-wide uniqueness stays unchanged afterward. Renames can break title links and later title reuse can retarget them.

## Reproduce

Current production successors, run from the repository root (localhost/fresh OS temporary fixtures only). These rerun regressions, not the historical baseline/prototype comparisons or their measurements:

```bash
npm run build
npx --package=playwright node scripts/page-reference-editor-smoke.mjs
npx --package=playwright node scripts/reference-autocomplete-smoke.mjs
JUMPYBRAIN_REFERENCE_SMOKE_BENCH=1 npx --package=playwright node scripts/page-reference-smoke.mjs
JUMPYBRAIN_REFERENCE_EDITOR_BENCH=1 npx --package=playwright node scripts/page-reference-editor-smoke.mjs
node --test test/reference-ranges.test.js test/canonical-title-resolution.test.js test/server-title-resolution.test.js
```

`npm run smoke:page-references` builds and runs all three production browser runners; the scanner regressions are now in normal test discovery. The remaining `resolve-probe.mjs` is historical evidence containing the original research resolver, not a supported runtime. No real memory roots, credentials, installation, or team memory are used. The [feasibility task is archived](../../tasks/done/2026-10-07_tasks-clickable-page-references.md); the completed integration records rollout status and the manual QA follow-up owns remaining gates.
