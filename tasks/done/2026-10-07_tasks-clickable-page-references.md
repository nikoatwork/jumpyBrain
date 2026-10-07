# Clickable page references and inline autocomplete — feasibility first

Status: feasibility investigation finalized and archived on 2026-10-07. Conditional go for a bounded implementation; no-go for shipping the prototypes unchanged. Production source is unchanged.

## Completion summary

- Prototyped navigation, fresh canonical title lookup, and caret autocomplete without new dependencies or a frontend rewrite.
- Closed the identified code-context and cross-leaf replacement gaps with conservative fallbacks; latest verification passed 38 scanner tests, 32 navigation/baseline checks, 22 autocomplete checks, and strict prototype typechecking.
- Finalization verification: `npm test` rebuilt production and passed 413 tests; the renamed standalone scanner probe passed 38 tests and strict prototype typechecking passed again. Renamed the probe to keep it outside default Node test discovery.
- Remaining implementation, integration, accessibility/device validation, and tradeoff decisions moved to [page-reference integration](../todo/tasks-page-reference-integration.md). Historical partial/unchecked items below are retained as evidence, not claims of completion or an active task queue.

## Goal

Make related notes easier to navigate by following `[[Page Title]]` references directly in the Markdown editor, and easier to insert through suggestions beside the caret while typing `[[query`. First prove that both interactions fit the existing Lexical editor without fragile frontend workarounds or a substantial increase in complexity.

## Deep Dive

- [Page-reference feasibility findings](../../deep-dives/page-reference-feasibility/findings.md) — prototype results, measurements, remaining gates, and reproduction commands.

## Decisions

- Include references in ordinary paragraphs, headings, and bullet lists in the feasibility prototype.
- A normal click follows the reference; do not require Cmd/Ctrl-click.
- Missing or ambiguous targets leave the user on the current note with a small visible explanation. Never guess a match or create a page.
- Resolve by page title only for v1, not filename/path fallback.
- Investigate inline autocomplete in this same ticket: typing `[[` should show suggestions where the user is typing, with query text entered directly in the document rather than the Cmd/Ctrl+K dialog. Include bullet lists.
- Reuse the existing search algorithm/endpoint and ranking; leave Cmd/Ctrl+K as the global search dialog. “Fuzzy autocomplete” describes the desired interaction, not a commitment to add a new typo-tolerant matching engine. Record any limitations of existing partial-query results.
- No further clarification round is needed. Record remaining technical tradeoffs and recommendations in this ticket.
- Keep this feasibility-first: a prototype is evidence, not approval to expand into a full reference-management system.

## Findings from code inspection

- **Existing extension point:** `src/adapters/http-server/lexical-editor.ts` already defines `PageReferenceNode` and Markdown transformers for literal `[[…]]` spans. References preserve punctuation and participate in insertion/undo; they currently have no navigation behavior.
- **Main frontend uncertainty:** bullet lines and other unsupported Markdown are `LiteralMarkdownNode` blocks containing plain text. References there are not dedicated reference nodes, and insertion into those blocks also inserts plain text. Extending existing reference spans alone would miss bullets. Paste likewise inserts plain text, so typed, inserted, pasted, and loaded references need coverage.
- **Navigation is reusable:** `src/adapters/http-server/notes-browser.ts` already routes to `/?note=<canonical-id>` through a shared save/history guard. `graph-page.ts` owns the existing save controller. Reference activation must use these, not assign `location` or add a second history stack.
- **No authoritative title-resolution API exists:** document GET is ID-addressed. Search is ranked/index-dependent, recent notes are capped, and graph data is filtered/capped with a potentially different root. None is a safe title directory.
- **Canonical lookup differs:** `src/core/canonical/links.ts` resolves graph links by filename/path, not frontmatter title. Browser title navigation will intentionally differ for now; do not silently change graph semantics in this ticket.
- **Matching policy can be shared:** `markdown-store.ts` has a private title normalizer used for rename uniqueness (`NFKC → trim → lowercase → NFC`). Legacy duplicate titles remain possible; ID-less documents can also make a title ambiguous. A matched document needs a valid, unique canonical ID to be openable.
- **Initial assessment (inspection):** ordinary reference spans looked straightforward; bullet preservation, plain-text recognition, and click-versus-selection were the meaningful frontend risks. The tested results below refine that assessment, including a source-preservation regression and scan overhead found and repaired in the isolated prototype.

## Proposed minimal approach

1. Keep reference recognition/rendering inside the Lexical adapter. Investigate splitting eligible literal bullet text into reference nodes while preserving the literal block's exact Markdown export. Do not introduce rich list editing just to make links clickable.
2. Expose a reference-activation callback to browser orchestration. Read the current node text through Lexical rather than retaining a stale title in DOM state. Support normal click/tap and a keyboard-accessible activation path without breaking selection or editing.
3. Resolve only on activation through a thin authenticated HTTP route → server-memory use case → canonical title lookup. Use fresh canonical Markdown at the editor's memory root, independent of QMD/index freshness. Share title normalization with rename validation rather than duplicating it in the browser.
4. Return only minimal remote-safe resolution data or explicit missing/ambiguous/unopenable outcomes. Validate unique document identity and reuse the existing guarded ID navigation and document GET. Handle late responses, repeated activation, authentication errors, and failed saves without losing the current draft.

## Inline autocomplete feasibility

- **Reusable search:** `createNoteSearch` in `notes-browser.ts` already owns a 180 ms debounce, abort/generation guards, result normalization, selection, and index-freshness feedback. Reuse its logic and authenticated search transport; separate presentation/session state from the global search modal. Do not fetch a full title directory or implement browser-side ranking.
- **Not just modal positioning:** current insertion captures a frozen Lexical selection and Markdown snapshot, then rejects changed drafts. Inline typing necessarily changes that snapshot. Track and revalidate a live trigger range plus document/session identity; do not simply remove stale-draft checks. Reuse exact-title validation and undoable insertion, replacing only the active `[[query` span (and its closing brackets when present).
- **Bullet insertion already has a path:** `insertReference` supports literal Markdown blocks as plain text. Autocomplete itself does not require rich-list rendering or clickable spans, so its feasibility can be assessed separately from clickable bullet references. Code-format flags alone cannot identify code examples because literal bullet text also uses them.
- **Caret anchoring is new but bounded work to test:** keep trigger/range/geometry ownership in the Lexical adapter, with search transport and suggestion presentation in the browser layer. Investigate a small non-modal popup anchored with supported selection/DOM Range geometry, without inserting measurement characters or rewriting editor DOM. Handle wrapped lines, the scrolling note panel, viewport-edge flipping/clamping, resize/zoom, and mobile keyboard/visual-viewport changes. Missing/offscreen geometry should dismiss safely, not corrupt the selection.
- **Editor focus stays put:** use arrows/Enter to choose and insert, Escape to dismiss without deleting typed text, and pointer/touch selection without losing the insertion range. Consume keys only while the popup owns the interaction; preserve ordinary editing, IME composition, and accessible suggestion announcements. Avoid reopening the same dismissed trigger on every update.
- **Lifecycle matters more than styling:** recompute eligibility after query edits, backspace, caret movement, paste, undo, and composition completion. Invalidate requests on dismissal, document/credential changes, and modal entry; preserve autosave freshness feedback. No stale response may reopen a closed popup or insert into a different draft.
- **Search versus resolution remains distinct:** autocomplete uses existing indexed title/body search and may be stale; opening a completed reference uses fresh canonical title resolution. Selecting a suggestion inserts literal `[[Exact Page Title]]`, never navigates or mutates the target. Keep unsafe/missing-title and visible-duplicate checks without claiming global uniqueness.
- **Proposed bounded defaults:** show a “Type to search” hint for an empty query, retaining current no-empty-search behavior. Keep the explicit Insert page reference dialog available as a fallback during the prototype. If anchoring or live-range handling is brittle, report that separately; do not block an otherwise sound clickable-reference result or add a framework to rescue positioning.

## Scope limits

- No editor replacement, frontend framework, new parser dependency by default, DOM-rewriting overlay, second Markdown renderer, or whole-document reload after each edit/save.
- No target creation, backlinks, graph redesign, persistent link index, aliases, heading/block navigation, filename fallback, or automatic rename propagation.
- Title links are not stable-ID links: renaming a target can leave old references unresolved; later title reuse can retarget them. Do not imply rename-safe identity.
- Keep canonical Markdown unchanged by rendering/resolution/navigation. Exclude escaped references and code examples from activation; do not turn every bracket-like string into a link.
- Normal-click navigation must not make reference text impossible to edit or copy. If maintaining this alongside literal bullets requires brittle selection hacks, report that as a no-go rather than expanding the editor.

## Handoff at closure

- [Page-reference integration](../todo/tasks-page-reference-integration.md) now owns the remaining work for both features, not a frontend rewrite. Neither isolated prototype is approved for rollout as-is.
- Conservative code-context handling and the single-leaf fallback now have passing regressions (2.4), including source preservation. The prototype intentionally suppresses the remainder of a document after unsupported container fences and only autocompletes unfinished triggers at block end. Accept or refine these false-negative tradeoffs before porting the editor pieces; do not imply full Markdown parsing.
- Next add the shared canonical lookup/authenticated app seam (3.1), then run real save/history integration tests (3.2).
- Autocomplete can progress independently through complete ARIA, tap-versus-scroll handling, and mandatory editor/session lifecycle wiring. Keep real indexed partial-query quality and physical IME/mobile testing explicit rather than treating stubbed browser checks as completion.

## Relevant Files

- `deep-dives/page-reference-feasibility/findings.md` — reproducible evidence, separate recommendations, measurements, and known gaps.
- `deep-dives/page-reference-feasibility/{editor,reference-ranges,autocomplete}.ts` — isolated browser prototypes, not production modules; port only reviewed pieces and remove the editor fork if implementation proceeds.
- `deep-dives/page-reference-feasibility/{smoke,autocomplete-smoke,resolve-probe}.mjs` — disposable browser/controller and canonical-lookup probes.
- `deep-dives/page-reference-feasibility/reference-ranges-probe.mjs` — pure scanner regressions for multiline code and conservative unsupported-context handling.
- `src/architecture.docs.md` and affected modules' co-located `*docs.md` — boundaries to read before source changes.
- `src/adapters/http-server/lexical-editor.ts` — reference nodes, literal blocks, transforms, paste, selection/history.
- `src/adapters/http-server/notes-browser.ts` — note navigation, dialogs, shared search controller, reference insertion, suggestion presentation/feedback.
- `src/adapters/http-server/graph-page.ts` — transport composition and save protection.
- `src/core/canonical/markdown-store.ts`, `src/core/canonical/links.ts` — canonical document identity, title normalization, existing graph semantics.
- `src/app/server-memory/`, `src/adapters/http-server/routes.ts`, `src/adapters/http-protocol.ts` — proposed lookup orchestration/protocol seams.
- `scripts/lexical-editor-smoke.mjs`, `scripts/graph-editor-smoke.mjs`, `scripts/daily-capture-smoke.mjs` — disposable-root browser regression fixtures.
- `test/canonical-document-read.test.js`, `test/canonical-document-update.test.js`, `test/server-http.test.js`, `test/lexical-bundle.test.js` — existing identity, protocol, and bundle contracts.

## Tasks

- [x] 1.0 Inspect existing editor, navigation, resolution, and architecture contracts; record the agreed interaction/scope above.
- [/] 2.0 Prototype the risky editor interaction using disposable fixtures.
  - [x] 2.1 Prove normal-click/tap activation in paragraphs, headings, and bullet lists, including nested bullets and multiple references on one line, without converting lists into rich list blocks. Demonstrated as title callbacks, not real note navigation.
  - [/] 2.2 Cover picker insertion, typing, paste, reload, edits within a reference, malformed brackets, punctuation/Unicode, escaped text, and code exclusions. Core fixture paths and the formerly failing multiline inline-code/quote-fence exclusions pass under 2.4's conservative policy. Cross-leaf references intentionally stay inert. Real app save/reload is pending.
  - [/] 2.3 Verify editing/copying/drag selection, keyboard activation, undo/redo, focus, and exact unchanged Markdown preservation. Fixture editing, drag selection, Tab→Enter, history, no-change hydration/click, and preservation regression pass; OS clipboard/AT and actual save integration remain unverified.
  - [x] 2.4 Define and test the conservative context/single-leaf fallback without production rollout. Exact-length backticks carry across lines; unmatched spans and unsupported quote/list/indented fences fail closed. Same-leaf range checks now reject partial replacements across formatted siblings; unfinished autocomplete is limited to logical block end. Verification: 38 pure scanner tests, 32 navigation/baseline and 22 autocomplete browser checks at 1280px/390px, plus strict prototype typecheck. Includes delimiter reclassification/undo/redo source preservation, split opener/title/closer fixtures, and stale-result cancellation after formatting an active query. Existing application suites and lookup benchmark were not rerun for this prototype-only chunk.
- [/] 3.0 Validate the smallest canonical title lookup and guarded navigation flow.
  - [/] 3.1 Reuse title normalization and fresh canonical scans; test missing/duplicate titles, ID-less matches, invalid/duplicate IDs, and recently renamed/unindexed pages. The disposable probe passes 23 cases using real canonical scans/ID reads. Production helper sharing and authenticated lookup are not implemented; the research-only normalizer is explicitly duplicated.
  - [ ] 3.2 Exercise authenticated lookup followed by existing ID navigation, save failure/retry, delayed responses, repeated clicks, target deletion, and Back/Forward. Retain the current note on failed resolution/save.
  - [x] 3.3 Measure activation-time lookup on a representative fixture corpus; avoid per-reference scans during render/typing. Five fresh lookups over 1,000 synthetic 1KB files measured approximately 102ms p50/110ms p95 in an isolated run. Cache-warm, local, tiny sample; no production-scale claim. Detailed measurements and contention rerun are in findings.
- [/] 4.0 Prototype caret-anchored reference autocomplete using the same search as Cmd/Ctrl+K.
  - [/] 4.1 Reuse the existing controller/transport with independent popup lifecycle; verify partial-query usefulness, debounce/cancellation, empty/loading/no-result/auth/error feedback, and index-staleness reporting. Existing controller and feedback/cancellation pass with stub transport. Real indexed partial-query relevance and authenticated transport remain untested; no new fuzzy-search engine.
  - [/] 4.2 Track the live `[[query` range while typing in paragraphs, headings, and bullets. Prototype revalidates through `autocompleteRange()` plus an editor update subscription and retains existing insertion safety/undo. Replacement, continued typing, headings/nested bullets, caret movement, undo and synthetic composition guards pass. Conservative code-context/cross-leaf fallbacks pass (2.4); physical IME remains open.
  - [/] 4.3 Prove caret positioning across wrapping, note-panel/window scroll, viewport edges, zoom/resize, and mobile keyboard changes without DOM mutation or caret jumps. Fixture scroll/clipping and viewport resize/bounds pass with native Range geometry. Zoom/physical mobile keyboard/visual-viewport QA remains open.
  - [/] 4.4 Verify keyboard and pointer/touch selection with editor focus preserved, accessible popup feedback, non-destructive Escape/dismissal, and no accidental newline/navigation. Fixture focus/selection/Escape, delayed responses and session invalidation pass. Complete ARIA/AT, touch scrolling, autosave/modal/session integration, and Cmd/Ctrl+K coexistence remain open.
- [/] 5.0 Report separate navigation and autocomplete go/no-go assessments before production rollout.
  - [x] 5.1 Record prototype results, changed components, dependency/bundle impact, browser coverage, and unresolved risks. Commands/results are in findings: initial build, 23 lookup cases, and 46 existing unit/boundary tests; latest follow-up strict prototype typecheck, 38 scanner tests, 32 navigation/baseline and 22 autocomplete browser checks. App-level Lexical/navigation/capture smokes still belong to the pending integration gate in 3.2; do not imply they ran against this feature.
  - [x] 5.2 Record separate recommendations: navigation is feasible through supported Lexical APIs with a small canonical lookup seam, but not ready to ship until conservative code-context tradeoffs are accepted and save/history integration passes. Autocomplete is feasible with a live editor-range/update seam and native caret geometry, but not ready to ship until ARIA/touch/real-IME and app-lifecycle gates pass. No framework, new search engine, positioning dependency, or editor replacement was needed in either prototype.
  - [ ] 5.3 If implementation proceeds, update HTTP adapter/canonical/server-memory owning docs plus `docs/cloud-shared-memory.md` and `docs/shared-memory-protocol.md` for actual behavior, inline suggestions versus Cmd/Ctrl+K, search freshness, title matching, error outcomes, graph differences, and rename limitations. Do not describe either feature as shipped during feasibility work.
