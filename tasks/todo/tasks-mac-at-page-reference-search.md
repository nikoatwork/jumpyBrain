# Mac editor @ shortcut for page references

Status: planned; implementation not started.

## Goal

Let Mac app users type `@` to open inline page search, including semantic matches when available. Choosing a page replaces the trigger and query with the existing literal `[[Exact Page Title]]` syntax. Typing `[[` continues to work.

## Scope and constraints

- This is a Mac frontend input shortcut. Markdown page-link syntax, canonical link extraction, CLI behavior and graph semantics stay unchanged; `@` is not a stored link format.
- Reuse the existing inline reference picker, authenticated search transport, ranking, semantic readiness/fallback and title eligibility checks. Do not introduce a new search engine or promise semantic results when unavailable.
- Enable the shortcut through the companion editor configuration; ordinary hosted browser behavior remains unchanged.
- Selection inserts a reference into the current draft without navigating to or changing the target. Dismissing the picker leaves the typed text intact.
- Keep [missing-page creation](tasks-create-missing-reference-pages.md) separate. This task selects existing search results.
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

- [ ] 1.0 Recognize `@` as an additional Mac editor search trigger.
  - [ ] 1.1 Add a companion-only editor option while retaining the existing `[[` trigger.
  - [ ] 1.2 Derive the replacement range from the live editor model and support multiword page queries. Define conservative word-boundary and caret-position rules consistent with existing reference recognition.
  - [ ] 1.3 Leave email addresses, escaped markers, code/literal blocks, existing links and unsupported cross-format ranges inert. Reuse context validation rather than changing canonical Markdown parsing.
- [ ] 2.0 Reuse inline search and insert canonical references.
  - [ ] 2.1 Make picker validation account for both trigger lengths; reuse debounce, cancellation, matching-result retention and existing semantic availability behavior.
  - [ ] 2.2 Replace only the live trigger/query with `[[Exact Page Title]]` in one undoable edit. Preserve surrounding text, focus and title safety/ambiguity checks.
  - [ ] 2.3 Preserve Escape, keyboard/pointer acceptance, composition guards, read-only behavior and document/credential/navigation fencing. Late results must not reopen or insert into a dismissed or changed draft.
  - [ ] 2.4 Add a concise Mac-only discoverability hint to the existing reference control using its established accessible label/tooltip pattern.
- [ ] 3.0 Verify behavior and document the completed change.
  - [ ] 3.1 Extend existing browser smokes for empty `@`, continued/multiword typing, keyboard and pointer selection, Escape, undo/redo, and saved/reloaded `[[…]]` output.
  - [ ] 3.2 Cover email/code/escape exclusions, changed ranges, pending requests, composition and read-only transitions. Verify `[[` still works and hosted editors do not enable `@`.
  - [ ] 3.3 Build and run focused editor/reference tests and production smokes against disposable fixtures. Check the companion configuration path; record any installed-Mac-app or physical-keyboard checks left unperformed.
  - [ ] 3.4 Update the owning browser contract and add a short user-facing note to `tasks/todo/release-next.md` once implemented. Record results and limitations here; no release or installation is requested.

## Acceptance

- In the Mac app, `@` opens the existing inline page picker and a chosen result becomes `[[Exact Page Title]]`.
- Both shortcuts use the same search and insertion safeguards; semantic discovery follows existing index readiness.
- Canonical Markdown links remain `[[…]]`, ordinary email/code text stays literal, and existing `[[` behavior remains usable.
- This planning change introduces no implementation, version bump, installation or publication.
