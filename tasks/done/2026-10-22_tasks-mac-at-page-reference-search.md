# Mac editor @ shortcut for page references

Status: implemented and verified on 2026-10-22. No installation or release performed.

## Goal

Let Mac app users type `@` to open inline page search, including semantic matches when available. Choosing a page replaces the trigger and query with the existing literal `[[Exact Page Title]]` syntax. Typing `[[` continues to work.

## Scope and constraints

- This is a Mac frontend input shortcut. Markdown page-link syntax, canonical link extraction, CLI behavior and graph semantics stay unchanged; `@` is not a stored link format.
- Reuse the existing inline reference picker, authenticated search transport, ranking, semantic readiness/fallback and title eligibility checks. Do not introduce a new search engine or promise semantic results when unavailable.
- Enable the shortcut through the companion editor configuration; ordinary hosted browser behavior remains unchanged.
- Selection inserts a reference into the current draft without navigating to or changing the target. Dismissing the picker leaves the typed text intact.
- Keep [missing-page creation](2026-10-22_tasks-create-missing-reference-pages.md) separate. This task selects existing search results.
- Preserve unrelated work already present in the shared editor files.

## Relevant files

- `src/adapters/http-server/lexical-editor.ts` — live trigger ranges, selection validation and undoable insertion.
- `src/adapters/http-server/reference-autocomplete.ts` — picker search, live-range acceptance, cancellation and accessibility.
- `src/adapters/http-server/graph-page.ts` — companion-specific editor configuration.
- `src/adapters/http-server/notes-browser.ts` — existing shared search wiring and reference controls.
- `src/adapters/http-server/reference-ranges.ts`, `reference-policy.ts` — conservative context recognition and exact-title eligibility.
- `scripts/reference-autocomplete-smoke.mjs`, `scripts/page-reference-editor-smoke.mjs`, `scripts/page-reference-smoke.mjs` — existing production editor regression runners.
- `src/architecture.docs.md`, `src/adapters/http-server/browser.docs.md` — source ownership and editor contract.

## Tasks

- [x] 1.0 Recognize `@` as an additional Mac editor search trigger.
  - [x] 1.1 Add a companion-only editor option while retaining the existing `[[` trigger.
  - [x] 1.2 Derive the replacement range from the live editor model and support multiword page queries. Define conservative word-boundary and caret-position rules consistent with existing reference recognition.
  - [x] 1.3 Leave email addresses, escaped markers, code/literal blocks, existing links and unsupported cross-format ranges inert. Reuse context validation rather than changing canonical Markdown parsing.
- [x] 2.0 Reuse inline search and insert canonical references.
  - [x] 2.1 Make picker validation account for both trigger lengths; reuse debounce, cancellation, matching-result retention and existing semantic availability behavior.
  - [x] 2.2 Replace only the live trigger/query with `[[Exact Page Title]]` in one undoable edit. Preserve surrounding text, focus and title safety/ambiguity checks.
  - [x] 2.3 Preserve Escape, keyboard/pointer acceptance, composition guards, read-only behavior and document/credential/navigation fencing. Late results must not reopen or insert into a dismissed or changed draft.
  - [x] 2.4 Add a concise Mac-only discoverability hint to the existing reference control using its established accessible label/tooltip pattern.
- [x] 3.0 Verify behavior and document the completed change.
  - [x] 3.1 Extend existing browser smokes for empty `@`, continued/multiword typing, keyboard and pointer selection, Escape, undo/redo, and saved/reloaded `[[…]]` output.
  - [x] 3.2 Cover email/code/escape exclusions, changed ranges, pending requests, composition and read-only transitions. Verify `[[` still works and hosted editors do not enable `@`.
  - [x] 3.3 Build and run focused editor/reference tests and production smokes against disposable fixtures. Check the companion configuration path; record any installed-Mac-app or physical-keyboard checks left unperformed.
  - [x] 3.4 Update the owning browser contract and add a short user-facing note to `tasks/todo/release-next.md` once implemented. Record results and limitations here; no release or installation is requested.

## Acceptance

- In the Mac app, `@` opens the existing inline page picker and a chosen result becomes `[[Exact Page Title]]`.
- Both shortcuts use the same search and insertion safeguards; semantic discovery follows existing index readiness.
- Canonical Markdown links remain `[[…]]`, ordinary email/code text stays literal, and existing `[[` behavior remains usable.
- No version bump, installation or publication is requested.

## Implementation notes

- `@` starts at a leaf/block boundary, after whitespace or `(`; a preceding leaf's final character is checked too, so formatting cannot turn an email into a trigger. Queries stay in one leaf at logical block end, matching the existing conservative unfinished-`[[` policy.
- Existing `[[…]]` editing takes priority, including titles containing `@`; only the normal full bracket range is replaced. The exact-title eligibility policy and canonical link parser are unchanged.
- `atReferenceTrigger: companionMode` enables the input shortcut; the existing reference control exposes a Mac-only tooltip hint.

## Verification

Tested the working-tree implementation over `640ae50` with disposable fixtures:

- `npm run build`: passed; editor bundle 164,558 bytes gzip, within the existing review gate.
- `node --test test/reference-ranges.test.js test/daily-notes-browser.test.js test/companion-browser.test.js test/notes-browser.test.js test/architecture-boundaries.test.js`: 151 passed, zero failed.
- `npx --package=playwright node scripts/reference-autocomplete-smoke.mjs`: all 36 scenarios passed at 1280/390px, including the new `@` flows, formatted-email exclusion and existing bracket regressions. The initial existing-title assertion was corrected to preserve bracket-picker editing of titles containing `@`.
- `npx --package=playwright node scripts/companion-browser-smoke.mjs`: passed, including `@` search across healthy polls/autosave, canonical saved brackets, hint wiring, switching and read-only behavior.
- `npx --package=playwright node scripts/page-reference-editor-smoke.mjs`: all 46 desktop/narrow editor scenarios passed.
- `npx --package=playwright node scripts/page-reference-smoke.mjs`: all 27 real-server/QMD integration scenarios passed, including search, reference persistence, navigation and cancellation.
- `git diff --check`: passed.

The isolated `@` search transport is stubbed; companion wiring/persistence uses the production shell with a disposable control fixture. Semantic model quality and availability were not independently exercised, since both triggers reuse the unchanged search path. No installed Mac app, physical IME/keyboard, assistive technology, Safari/Firefox or real remote brain was tested. Existing physical-device checks remain in [manual reference QA](../todo/tasks-page-reference-manual-qa.md). No personal/global memory writes, version bump, installation or publication.
