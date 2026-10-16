# Page-reference navigation and inline autocomplete — integration

Status: finalized 2026-10-08. Canonical lookup, guarded navigation, and inline autocomplete are implemented and enabled; 539 tests and the affected Chromium browser smokes passed. The user approved finalizing, committing, and pushing the implementation. Unverified gates from 2.3 and 3.4 moved to [manual QA follow-up](../todo/tasks-page-reference-manual-qa.md); partial markers below preserve historical validation status, not unfinished implementation or claims of completed manual QA.

## Context and scope

- [Archived feasibility task](../done/2026-10-07_tasks-clickable-page-references.md) — agreed behavior, boundaries, inspection findings, and historical verification.
- [Feasibility findings](../../deep-dives/page-reference-feasibility/findings.md) — reproducible prototypes, measured tradeoffs, and limitations.
- Carry forward the agreed scope: normal-click title-only navigation through existing save/history protection; missing/ambiguous/unopenable targets retain the current draft. No target creation, filename fallback, graph-semantic changes, stable-ID links, or rename propagation.
- Inline suggestions reuse existing indexed search/ranking; Cmd/Ctrl+K remains global search. Suggestions insert literal exact-title references, never navigate or mutate targets. Fresh canonical resolution is separate from potentially stale indexed search.
- No new framework, parser/positioning dependency, editor replacement, or DOM-rewriting overlay. Read architecture and co-located module docs before source changes.

## Relevant Files

- `deep-dives/page-reference-feasibility/` — historical evidence and forwarding smoke entrypoints; editor/autocomplete/scanner forks removed.
- `src/adapters/http-server/{lexical-editor,reference-ranges,reference-autocomplete}.ts` — literal preservation, conservative recognition, live selection/range/history, popup accessibility/touch/geometry and cancellation.
- `src/adapters/http-server/notes-browser.ts`, `src/adapters/http-server/graph-page.ts` — search presentation/transport, guarded navigation, and save/session lifecycle.
- `src/core/canonical/markdown-store.ts`, `src/core/canonical/links.ts` — title normalization/document identity and intentionally separate graph semantics.
- `src/app/server-memory/`, `src/adapters/http-server/routes.ts`, `src/adapters/http-protocol.ts` — canonical lookup orchestration and authenticated protocol.
- `scripts/{lexical-editor,graph-editor,daily-capture,page-reference}-smoke.mjs` — real app browser regression fixtures.
- `scripts/{page-reference-editor,reference-autocomplete}-smoke.mjs`, `test/reference-ranges.test.js` — isolated production editor/controller and pure recognition regressions; no second editor.
- `test/canonical-document-{read,update}.test.js`, `test/server-http.test.js`, `test/lexical-bundle.test.js` — existing identity/protocol/bundle contracts.
- `src/app/server-memory/resolve-title.ts`, `test/canonical-title-resolution.test.js`, `test/server-title-resolution.test.js` — integrated canonical lookup seam and semantic/protocol/privacy regressions.
- Affected co-located `*docs.md`, `docs/cloud-shared-memory.md`, `docs/shared-memory-protocol.md` — owning implementation/user contracts.

## Tasks

- [x] 1.0 Implement the canonical title lookup seam (feasibility 3.1).
  - [x] 1.1 Share rename's title normalization; resolve from fresh canonical Markdown at the editor root, independent of the index. Port tests for missing/duplicate titles, ID-less matches, invalid/duplicate IDs, renamed/unindexed/deleted pages, scan errors, and root isolation.
  - [x] 1.2 Add the server-memory use case and thin authenticated HTTP route with minimal remote-safe found/missing/ambiguous/unopenable results. Preserve explicit scan/read race limitations; do not imply atomic uniqueness against external writers.
- [/] 2.0 Port reviewed navigation behavior and prove app integration (feasibility 2.2–2.3, 3.2); manual clipboard gate remains.
  - [x] 2.1 Accept or refine conservative fallbacks before porting: unsupported quote/list/indented fences suppress the remaining document; cross-format references stay inert; unfinished autocomplete only operates at logical block end. Preserve exact-Markdown and delimiter-reclassification regressions.
  - [x] 2.2 Wire live title activation into existing guarded ID navigation; verify authenticated lookup, save failure/retry, delayed responses, repeated clicks, target deletion, and Back/Forward. Never lose the current draft on resolution/save failure.
  - [/] 2.3 Verify real save/reload after typed, pasted, picker-inserted, and edited references in paragraphs/headings/bullets; editing/copying/drag selection, undo/redo, keyboard activation, and no-change hydration/click preservation. Check double-click selection tradeoffs and OS clipboard behavior. Automated persistence/editing/DOM-copy/drag/undo/keyboard/no-change and double-click checks passed; OS clipboard/physical editing validation remains unverified.
- [/] 3.0 Integrate autocomplete and its lifecycle (feasibility 4.1–4.4); manual validation gate remains.
  - [x] 3.1 Reuse independent search-controller state and authenticated transport; evaluate real indexed partial-query relevance, empty/loading/auth/error feedback, and freshness after actual autosaves. Do not add a new fuzzy engine.
  - [x] 3.2 Port the live range/update seam with acceptance-time revalidation and undoable exact replacement. Explicitly cancel on document/credential/modal/read-only transitions; verify stale responses cannot reopen or insert in another draft and Cmd/Ctrl+K coexists.
  - [x] 3.3 Complete editor/listbox/active-option ARIA and accessible announcements; implement tap-versus-scroll rather than accepting immediately on touch pointerdown. Keep editor focus, Escape non-destructive, and ordinary Enter/editing intact outside popup ownership.
  - [/] 3.4 Validate physical IME, assistive technology, touch scrolling, mobile keyboard/visual viewport, zoom, wrapped-line/scroll/edge geometry, and Safari/Firefox. Synthetic composition and narrow Chromium are not substitutes; explicitly document any blocked validation. Chromium touch scrolling, wrapped-line/scroll/edge geometry and simulated visual-viewport zoom passed; physical IME/AT/mobile keyboards/pinch zoom and Safari/Firefox remain unverified.
- [x] 4.0 Verify and document actual shipped behavior within the automated-tested scope (feasibility 5.3).
  - [x] 4.1 Run affected unit/boundary/bundle tests and disposable-root Lexical, graph-editor, and daily-capture integration smokes. Recheck large-note recognition/autocomplete performance; existing benchmark numbers predate conservative context changes.
  - [x] 4.2 Update owning docs for title matching/outcomes, graph differences, rename/title-reuse limitations, inline suggestions versus global search, and index freshness. Remove the prototype editor fork rather than maintaining two editors.
  - [x] 4.3 Record separate navigation/autocomplete rollout decisions and remaining limitations; only describe validated, integrated behavior as shipped.

## Implementation notes

- Task 1.0: `resolveCanonicalMemoryDocumentByTitle` shares `normalizedDocumentTitle` with rename and daily capture. `src/app/server-memory/resolve-title.ts` owns editor-root compatibility/orchestration; authenticated POST `/memories/all/resolve-title` returns only status plus a found ID. Lookup does not use QMD, write state, or enqueue a write.
- `test/canonical-title-resolution.test.js` ports the 23 probe cases plus scanner scope/read-only tests. `test/server-title-resolution.test.js` covers protocol/auth/privacy, configured index-root isolation, real create/save/delete freshness, and generic failures.
- Review found a pre-existing shared JSON parser discriminator collision: request `statusCode`/`body` fields could impersonate parser errors and leak user data into response/log error fields. Replaced structural detection with an internal class and added a production-server log regression.
- Navigation uses existing save/history serialization, authenticated fresh lookup, and a validated target prefetch before switching editors. Delayed/repeated activations, modal/credential/history cancellation, failed PUT retry, unavailable/deleted target GET, and Back/Forward retain source drafts. Prefetched content is reused on route apply to avoid a second failure window.
- Autocomplete uses independent `createNoteSearch` state, authenticated search, actual-write staleness, acceptance-time range/session revalidation, separate status/listbox/active-option ARIA, and touch tap-versus-scroll. Cmd/Ctrl+K and explicit modal insertion coexist; ordinary Enter/Escape/editor undo remain intact.
- Conservative fallbacks are retained intentionally: unsupported quote/list/indented fences suppress the suffix, formatted cross-leaf spans remain inert, and unfinished inline queries require block end. Explicit insertion now has a safe caret-only fallback rather than becoming a silent no-op mid-block. No new framework/parser/positioner/fuzzy-search dependency.
- Review/browser regressions caught and fixed reference code-flag leakage on title replacement and escaping of inert filename/alias references when surrounding text changed. Literal serialization is independent from activation state. Click-only accessible activation is supported alongside pointer/Tab guards (synthetic check, not real AT certification).
- Separate scans/read rechecks are not atomic against concurrent server or external writes. Existing missing-directory scan behavior is preserved and documented; renames/title reuse remain non-stable links.

## Verification (2026-10-08)

- `npm test`: **539/539 pass**, including 38 scanner regressions, canonical/auth/protocol/privacy tests, save/history lifecycle tests and bundle/architecture boundaries.
- New production browser runners: **38 editor checks**, **24 isolated autocomplete checks**, and **27 real-app integration scenarios + 2 performance scenarios** passed across 1280px desktop and 390px touch Chromium. Real-app fixtures use temporary Markdown, real QMD and authenticated server calls; isolated autocomplete transport is deliberately stubbed.
- Existing disposable-root Lexical, graph-editor (including graph/Dream), and daily-capture smokes all pass. No live memory roots, installation, or remote/team memory writes.
- Real indexed `luminous` query returns the intended exact-reference fixture plus related titles/body evidence; ranking is reused unchanged, not a new fuzzy engine. Actual autosaves expose stale feedback while canonical lookup sees fresh titles.
- Production editor bundle: **142,978 bytes gzip** (baseline 137,274; +5,704), below the 160 KB review gate.
- Isolated production editor, 5 edit-to-frame samples: 300 references hydration **15.4 ms**, p50/p95 **15.7/16.3 ms**; 3,000 references hydration **60.2 ms**, p50/p95 **15.5/31.3 ms**. Real-app warm reload for 3,000 references **145–158 ms**; typing `[[luminous` through suggestions **655–1,196 ms** across three samples/viewport (includes typing, debounce, QMD/server and automation). Small fixture timings were not monotonically faster; these are local observations, not SLOs or a stable latency distribution.

## Rollout decisions

- **Navigation:** enabled for the conservative supported contexts, with save/resolve/read failures retaining the draft and no target creation/rename propagation. Automated Chromium scope is validated; OS clipboard/physical editing/real AT/cross-browser certification is not claimed. First click navigates before double-click word selection; drag/keyboard remain editing paths.
- **Autocomplete:** enabled with the existing indexed-search ranking and freshness limitations, live-range revalidation, explicit lifecycle cancellation, accessibility relationships and scroll-safe touch handling. Physical-device/IME/AT and Safari/Firefox checks remain release-validation gates, not silently waived by emulation.
- Owning HTTP/user/protocol docs updated. Production fork replacements and historical runner redirects are complete. Finalized the implementation on user request, with unverified manual gates explicitly retained in the active follow-up rather than marked complete or waived.

## Blockers

- **Manual QA unavailable in this run:** physical IME, screen reader/assistive technology, OS clipboard, mobile virtual keyboard/visual viewport and pinch zoom. Synthetic event/CDP checks are not substitutes.
- **Cross-browser unverified:** only Chromium executables are installed in this environment; Safari and Firefox have not been exercised. No claim of browser parity.
- No remaining implementation blocker. The [manual QA follow-up](../todo/tasks-page-reference-manual-qa.md) now owns these outstanding validation gates.
