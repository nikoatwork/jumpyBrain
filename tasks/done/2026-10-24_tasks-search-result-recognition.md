# Recognizing the right note in search

## Goal

Help a person recognize a specific note without opening several lookalikes: “I edited it yesterday myself; it wasn't an agent's note.” Give each result a readable preview and useful time, editor and location cues, then offer explicit ways to narrow the results.

## Status and scope

- Implemented and verified on 2026-10-24 from the `mistral` search-dialog proposal. Global/reference search now provides readable previews, dates, declared editor context and bounded date/editor filtering with paging. No installation, push or release was performed.
- Start with global search and the explicit page-reference modal, which share result rendering. Reuse display helpers in inline reference suggestions where space permits; keep that picker compact.
- Preserve shared retrieval/ranking, keyboard navigation, draft-safe opening, reference eligibility, read-only access and brain isolation. This is not a new search engine.
- Markdown stays canonical. Index/cache metadata must be rebuildable. No note writes or indexing just to display a result.
- Related [properties and saved views](../todo/tasks-properties-and-saved-views.md) may supply reusable controls later. Search recognition must not depend on building that entire system; protected attribution is not an ordinary editable custom property.

## What helps me choose

Recommended row hierarchy:

1. **Title** — strongest cue; retain room for meaningful titles and distinguish duplicate titles with location.
2. **Readable excerpt** — one or two lines that explain the note or show the matching passage. Remove presentation syntax, avoid repeating the title, and highlight literal query matches without inventing semantic matches.
3. **Edit context** — `Edited yesterday, 16:42 · You`, `Edited Oct 20 · Agent`, or honest missing-data labels. Exact dates belong in accessible details as well as hover text.
4. **Location** — a quieter brain-relative folder/path. Optional existing type or explicit source can help distinguish a personal note, synthesis and raw session; show only useful, supported values.

Creation time is useful secondary information in result details, particularly for a note that has since changed. Do not crowd every row with tags, word counts, scores, IDs, multiple dates or every frontmatter field. Keep “created,” “last edited,” and the date the content describes separate.

## Current evidence and limits

- `normalizeNoteResults` in `src/adapters/http-server/notes-browser.ts` currently reduces a hit to identity, title, reference title, raw snippet and path. `renderNoteSearch` displays title/snippet/path with `textContent`.
- Home Recent activity already distinguishes update, creation and unknown metadata dates. Search should reuse its semantics, with stricter shared validation where needed; do not silently treat an evidence date or filesystem copy time as a content edit.
- The tab-local confirmed-write overlay in `recent-write-search.ts` currently carries only ID/title/file/body. Enriching indexed results alone would leave newly saved results inconsistent.
- [Contribution actor in the glossary](../../glossary.md) is explicitly deferred. The [recent-activity decision](2026-10-18_tasks-knowledge-activity-feed.md) implemented latest-file metadata without editor identity or history. Existing `source` values do not establish who last edited a note.
- Memory recall for this topic returned no matches. Repository contracts above are the basis of this proposal.

## Tasks

- [x] 1.0 Define the result display contract and time semantics.
  - [x] 1.1 Read architecture and affected co-located docs before implementation; trace canonical metadata through local/hosted search, normalization and the confirmed-write overlay.
  - [x] 1.2 Define optional validated creation/edit dates and their provenance. Missing or invalid edit dates show `Edit date unknown`; a valid creation date can appear separately as `Created …`, never relabeled as an edit. Do not infer dates from a filename or use `date` as edit time.
  - [x] 1.3 Specify local-calendar `Today`/`Yesterday`, older absolute dates, exact accessible timestamps and date-only handling without timezone shifts or invented hours. Preserve offset-aware instants and reject impossible dates.
  - [x] 1.4 Make metadata freshness explicit: reuse existing stale-result state; refresh/enrich only bounded visible results through approved app operations when needed. Avoid per-row full-document requests or a full-root rescan on every keystroke. Missing metadata must not block opening a valid hit.

- [x] 2.0 Make previews readable and discriminating.
  - [x] 2.1 Add a bounded Markdown-to-display-text helper at the appropriate shared presentation boundary. Remove recognized heading/list/quote/task markers and emphasis/code delimiters; retain link labels, page-reference titles, task wording and useful code content. Omit frontmatter, fence markers, reference definitions and decorative-only lines when they are actually present in the source excerpt.
  - [x] 2.2 Preserve meaningful punctuation such as `C#`, `C++`, hashtags, negative numbers and literal syntax/code. Use conservative syntax-aware rules rather than deleting every `#`, `*`, bracket or underscore. Never modify canonical Markdown or agent recall evidence to clean up the UI.
  - [x] 2.3 Prefer an available matching passage for a query; otherwise show the first meaningful body text. Skip a redundant leading title heading. Avoid using a generic heading such as “Current status” as the entire preview; use explicit empty-preview behavior for an empty note.
  - [x] 2.4 Clean up before applying the display limit, retaining useful two-line excerpts and an honest ellipsis. Highlight literal matches using safe text nodes; never inject excerpt HTML or manufacture a match for a semantic-only result.

- [x] 3.0 Deliver the first useful result rows with existing metadata.
  - [x] 3.1 Render title, cleaned excerpt, edit/creation context and secondary path with clear visual priority. Retain existing optional type/source only where it improves recognition, without claiming it identifies the last editor.
  - [x] 3.2 Carry the same optional dates through fresh indexed results and confirmed recent saves. Preserve unknown values and stale-state behavior instead of filling gaps with the current time.
  - [x] 3.3 Keep global and explicit reference-search presentation consistent, and apply compact preview cleanup to inline suggestions. Preserve stable click targets, selection, focus restoration, eligibility messages and narrow-screen readability.
  - [x] 3.4 Review realistic lookalikes from the screenshot: short filename title, long title, duplicate titles in different folders, personal note, agent synthesis, raw session, undated import and freshly edited note. Confirm the row helps choose without opening each result.

- [x] 4.0 Add truthful last-editor attribution as a separate metadata capability.
  - [x] 4.1 Specify the smallest forward-looking canonical attribution contract: creator versus last content editor; human, agent and unknown; optional declared actor/source identity; and which supported write paths can supply each value. Define when the UI may say `You` rather than merely `Human`. Do not require a contributor-history service or block-level blame.
  - [x] 4.2 Cover app editing, CLI/agent writes, processing/dream output, imports and external file edits. Document declared versus authenticated identity; credentials or `source: manual` alone do not prove human authorship. Do not backfill historical ownership from folders, wording or note titles.
  - [x] 4.3 Bind attribution to the content revision it describes so an untracked external edit cannot keep a stale `You` badge. Define conservative unknown/stale behavior when revision evidence is missing or mismatched. Metadata-only attention/pin operations and unchanged saves must not become content edits.
  - [x] 4.4 Carry supported attribution through the same local/hosted app and CLI seams, guarded save responses, indexes and recent-write results. Preserve unrelated metadata and concurrency checks; prevent a body-only save from accidentally retaining obsolete attribution.
  - [x] 4.5 Show a compact last-editor label only with supporting metadata; use `Editor unknown` for legacy/untracked results where the distinction matters. Optional agent identity can appear in details. Avoid unverified named-person claims on shared brains.

- [x] 5.0 Let the user narrow the remembered clue explicitly.
  - [x] 5.1 Add compact controls for **Last edited** (Today, Yesterday, Last 7 days, custom dates), **Last editor** (You where supported, Human, Agent, Unknown) and **Sort** (Relevance, Recently edited). Keep relevance as the default; show active controls and Clear filters.
  - [x] 5.2 Apply filters before candidate limits, or explicitly expose a partial-results limitation. Do not silently filter only the existing top 24 hits and claim no matching notes exist. Define bounded retrieval, continuation, tie-breaking and unknown-date/editor behavior through the existing search seam.
  - [x] 5.3 Define date ranges in the user's displayed timezone and match labels to their actual predicate. A separate creation-date criterion can address “written yesterday”; do not reinterpret that as “edited yesterday.” Keep query text intact when controls change.
  - [x] 5.4 Keep `last edited by me` distinct from `I edited it yesterday, then an agent edited it`. The latter requires retained last-human-edit metadata or history and is deferred from the initial last-editor scope; document this limit rather than making the filters imply historical coverage.

- [x] 6.0 Verify the behavior and document delivered scope.
  - [x] 6.1 Add focused fixtures for Markdown cleanup, literal punctuation, unsafe markup, title repetition, empty/heading-only/code-heavy excerpts and truncation. Verify previews remain plain display text and canonical content stays unchanged.
  - [x] 6.2 Verify invalid/missing dates, local midnight/DST boundaries, date-only values, historical evidence dates, conflicting/stale metadata and saved-result overlays. For attribution, cover legacy notes, human then agent edits, untracked external changes and no-op/metadata-only writes.
  - [x] 6.3 Verify filter/sort behavior beyond the default candidate limit, unknown metadata, semantic-unavailable fallback and consistent local/hosted behavior without expanded write permissions.
  - [x] 6.4 Run relevant controller/server tests, build/architecture gates and production browser smokes for keyboard/mouse selection, draft-safe navigation, reference insertion, cancellation, stale responses, brain switches, read-only access and desktop/narrow layouts. Inspect representative rows visually; record tested snapshot and remaining device/browser limits.
  - [x] 6.5 Update browser/metadata/protocol docs and the deferred glossary term only as behavior lands. Add pending release notes for delivered changes; no release is implied by this proposal. Once all required work/checks are complete, record the outcome, archive this list and commit scoped changes under [the task workflow](../../docs/task-workflow.md), including its changelog requirement.

## Completion and verification — 2026-10-24

Implemented the complete scoped list. Rows show cleaned previews and literal match highlights, declared edit/creation dates with exact accessible details, revision-checked human/agent/unknown attribution, and secondary paths. Global/explicit-reference search share date-field/range/editor/sort controls, clear filters and 24-row paging. Inline suggestions reuse compact previews and retain title-only insertion/eligibility semantics. Existing paths carry human app declarations, explicit CLI/agent declarations, automated wrapup/processing declarations, guarded updates and recent saves consistently.

Decisions: keep folder/path as the location/type cue instead of adding more badges. Creator and latest editor are canonical metadata; no history or retrospective actor inference. App You uses a random browser-local identity, with Human fallback when storage is unavailable. Actor declarations do not establish authenticated identity or confer write access. Legacy/untracked revisions remain unknown. Updates without an explicit actor clear last-editor attribution, while exact no-ops and attention publication preserve it. Dream-writing callers explicitly pass an agent actor.

Filtering uses up to 120 shared ranked candidates, targeted current-source enrichment, then date/editor predicates and sorting before page limits. The UI persistently explains partial coverage, including empty filtered results, and merges confirmed tab-local writes before paging. Reads are limited to 1 MiB/source and 8 MiB aggregate; missing/changed/oversized/unreadable current metadata stays unavailable. Existing semantic/lexical ranking and graph short snippets remain intact. Display cleanup never rewrites canonical Markdown or cited agent evidence.

Tested snapshot: base commit `6ac91d3` plus this scoped implementation; production browser build `0d6e12953d092d2b`, package version unchanged at 0.3.7. Final browser bundle is 175,589 bytes gzip; reviewed gate is 178,000, with no new dependency. Verification:

- `npm run build` passed. Full `node --test` passed 1,328 tests, with one provisioned-QMD test skipped by default. After final UI error/layout refinements, the focused source-boundary/runtime/server/browser/search/HTTP/concurrency suite passed all 173 tests.
- The skipped test was run explicitly with `JUMPYBRAIN_TEST_QMD_BIN=/opt/homebrew/bin/qmd node --test test/qmd-read-only-real.test.js`: passed against QMD 2.8.3, including physical read-only success and WAL fail-closed behavior.
- New focused fixtures cover Markdown syntax/literal punctuation/unsafe markup/truncation, revision invalidation, protected creator fields, no-op/attention behavior, missing/invalid dates, local day/DST handling, candidates beyond the first screen, deterministic paging, local/HTTP/client/CLI parity, explicit actor flags, recent-save metadata and unsupported-server acknowledgement rejection.
- `npx --package=playwright node scripts/search-recognition-smoke.mjs` passed over real disposable Markdown/QMD/server at 1280/390/320px, both themes. Includes immutable read-only search, Yesterday/You, Created versus Edited, custom-date validation, recent sorting, unknown metadata, paging, literal safe previews and a confirmed human save before reindexing. It asserts paging controls remain inside the dialog and the viewport has no horizontal overflow. Desktop and narrow screenshots inspected under `/tmp/jumpybrain-search-qa/`.
- Production isolated editor smoke passed 54 scenarios plus its completion gate; isolated autocomplete smoke passed 36 scenarios plus its completion gate. Reference app integration passed 26 scenarios initially; its touch expectation was updated to read the title separately from the new preview, and that scenario passed. The final change-specific production integration rerun passed 11 desktop/touch scenarios covering save failure/retry, real inline query/insertion/undo, stale/error/auth, modal/credential/document cancellation, read-only/save guards and tap-versus-scroll.
- `git diff --check` passed. Owning docs, glossary, CLI usage and pending release notes updated. The collaborative preview opened, but snapshots twice failed with `Preview automation snapshot timed out after 15000ms.` Visual QA used the repository's production browser screenshots; the disposable preview was closed.

Remaining limits: recognition is explicitly partial over bounded ranked candidates, not exhaustive structured enumeration. Date metadata remains declared and external tools must update it to establish new edit recency; no mtime/copy-time inference. Provenance is declared and forgeable, not a verified person or device-wide login. Browser identity does not migrate across profiles/origins/cleared storage. No last-human-edit history, block blame or authorship backfill. Cleanup is conservative presentation grammar, not complete CommonMark rendering. Physical IME/touch devices, assistive technology, Safari/Firefox and arbitrary-agent behavior were not validated. No real user brain was modified, and no installation/release is included.

## Relevant files

- `src/core/contribution.ts`, `src/core/search-recognition.ts`, `src/app/local-memory/search-recognition.ts`, `src/cli/recognition.ts` — declared provenance, calendar/editor predicates, bounded enrichment and CLI options.
- `src/adapters/http-server/search-presentation.ts`, `scripts/search-recognition-smoke.mjs`, `test/search-recognition.test.js` — shared display helpers and focused production verification.

- `src/adapters/http-server/notes-browser.ts`, `reference-autocomplete.ts`, `recent-write-search.ts`, `browser-transport.ts`, `browser.docs.md` — normalization, result UI, shared transport and confirmed saves.
- `src/app/server-memory/recent.ts`, `src/app/server-memory/`, `src/app/writing/` — current metadata/date behavior and local/hosted use-case ownership.
- `src/core/document-update.ts`, `src/core/frontmatter.ts`, `src/core/canonical/`, `src/types.ts` — canonical metadata and guarded content updates; inspect ownership docs before changing contracts.
- `test/notes-browser.test.js`, `test/recent-write-search.test.js`, `test/server-recent.test.js`, existing search tests and `scripts/page-reference-smoke.mjs` — extend existing focused verification.
- `docs/memory-format.md`, `docs/shared-memory-protocol.md`, `glossary.md` — date, identity, provenance and freshness semantics.
