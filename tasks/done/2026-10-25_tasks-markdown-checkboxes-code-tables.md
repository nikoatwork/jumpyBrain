# Reliable Markdown checkboxes and code

## Completed outcome — 2026-10-25

Delivered task checkboxes, inline backtick code and closed fenced code blocks through the existing shared editor, without adding dependencies. Tables were explicitly deferred and remain literal source. Source snapshots preserve untouched rows/blocks; code stays inert; task/code edits use ordinary guarded autosave and history. Added toolbar actions, keyboard continuation/exit and source-line-aware external caret restoration. No push, install or release.

## Verification and limits

- Tested shared checkout now based on `826c875`, production editor build `4154b3e5b34bd4cf` (version `0.3.8`). Unrelated Obsidian import work was committed independently as `826c875` during validation; this task commits only editor implementation, tests, guidance and its archive.
- `npm run validate`: 1,393 tests, 1,392 passed, zero failed, one skipped. Focused Markdown grammar, canonical links/properties, browser/controller and bundle suites: 91/91 passed.
- `scripts/page-reference-editor-smoke.mjs`: passed all original/adapted and new task/code checks at 1280/390px, including source preservation, typed/pasted creation, pointer/Space/Enter, continuation/exit, Backspace, undo/redo, language/tabs/blank lines, longer fences, literal HTML/Unicode/references, unsupported fallback and cross-block edits. Existing fence-delimiter editing tests now use unsupported tilde fences because supported backtick delimiters are no longer visible editor text.
- `scripts/lexical-editor-smoke.mjs`: passed 1280/390px production canonical persistence/security/CRLF and note-transition checks. Repaired its stale reference-search fixture to include recognition metadata and query URLs.
- `scripts/markdown-formatting-smoke.mjs`: passed 1280/390/320px in light/dark, CRLF/no-final-newline source preservation, exact task-only writes, save/reopen/undo, code caret preservation after external insertion, two-tab checkbox updates with no echoed writes, failed/lost-response saves, explicit recovery, canonical conflict protection and readonly guards. Lost-response retry deliberately requires review under the existing hash/save contract; it does not silently overwrite or claim confirmation.
- `scripts/external-document-updates-smoke.mjs`: passed desktop/narrow CLI/filesystem/two-user updates, selections, scroll, undo baselines, safe merge and conflict/recovery/deletion/navigation.
- `scripts/companion-browser-smoke.mjs`: passed existing two-tab freeze/flush and switch/conflict/session barriers, now including mixed task/code drafts and disabled readonly/frozen task buttons. Existing native/gateway deterministic checks passed in repository validation; physical app quit/switch was not manually exercised.
- Bundle: 536,354 bytes minified / 177,416 bytes gzip, below the unchanged 178,000-byte gate. No package or lockfile changes. A final large-code regression verifies that fence serialization cannot overflow the JavaScript argument stack. Screenshots inspected at desktop/narrow sizes in both themes; code overflow stays inside the block. Physical IME, OS clipboard, assistive technology, Safari/Firefox and real mobile devices remain untested. No claim of full CommonMark/GFM round-tripping, table editing, highlighting, attachments or execution.

## Goal

Make everyday checklists and code snippets useful in the existing editor while keeping Markdown files readable, portable and safe to edit alongside agents. Extend the current conservative editor rather than replacing canonical text with a block/document database.

## Scope and decisions

- **2026-10-25 scope update:** user explicitly deferred tables. Deliver checkboxes and inline/fenced backtick code only; existing table source remains literal. No table implementation is required to complete this task.
- Grammar: dash tasks at column zero; nested tasks at 2/4/6 spaces immediately following a task at the same, deeper or immediately preceding level. Other lists/tasks remain literal. Inline code uses matching backtick runs on one line; closed column-zero backtick fences accept a simple optional language token. Unsupported fences stay literal. Edited rich lines may normalize inline delimiters; edited tasks use lowercase `x`; edited code chooses a safe fence length. No dependencies added.

- Requested on 2026-10-24; implemented on 2026-10-25 with the updated scope.
- Include Markdown task checkboxes, inline code and fenced code blocks. Tables were deferred. These are document-body features, distinct from [properties and saved views](../todo/tasks-properties-and-saved-views.md); neither list requires the other to ship first.
- Images, file attachments, uploads, embedded assets and binary storage are explicitly excluded at the user's request because of storage growth. Do not fetch referenced assets, download a pasted URL or embed clipboard image/HTML data.
- Preserve the existing browser/desktop UI, vanilla Lexical integration, guarded Markdown saves, external refresh, undo history and save/switch/quit barriers. Use supported capabilities of the pinned editor packages when suitable; justify dependency/bundle growth before adding packages.
- No spreadsheet engine, formulas, cell properties, table databases, executable code cells, code execution service or broad document-format rewrite. Syntax highlighting is optional follow-up, not required for reliable code editing.
- Untouched source remains byte-preserved through the established save contract. Edited supported blocks may normalize only their documented syntax. Unsupported or ambiguous constructs remain editable literal Markdown; never silently discard or flatten them.

## Acceptance criteria

- A user can create/toggle `- [ ]` and `- [x]` tasks using pointer and keyboard, save/reopen and undo/redo without duplicate actions or unrelated source changes. Define supported nesting and ordinary-list behavior explicitly.
- Inline code and multi-line fenced code render/edit as code. Language labels, indentation, blank lines and literal Markdown/page-reference text survive edits; code is never executed or interpreted as active references/HTML. Unsupported fence forms remain literal without data loss.
- Table creation/editing is deferred; existing table source stays literal and unchanged.
- No save occurs merely from loading, selecting, rendering, changing themes or switching display modes. Frontmatter, unrelated blocks, line endings and final-newline behavior retain the existing preservation contract.
- Local and hosted notes use the same editor/Markdown behavior. Dirty or conflicting drafts survive external updates, failed saves, navigation and companion transitions; read-only/frozen states cannot toggle or modify content.
- Checkboxes have accessible names/focus behavior; code remains usable at narrow widths without expanding the whole page horizontally. Unsupported browser/device/IME behavior is recorded honestly.

## Tasks

- [x] 1.0 Define supported Markdown and editor behavior before extending conversion.
  - [x] 1.1 Read architecture and browser/editor co-located docs. Inspect current literal-block recognition, line/source preservation, Lexical transforms, reference scanning, selection/history and external line reconciliation; collect representative supported and unsupported fixtures.
  - [x] 1.2 Specify task-list syntax and nesting, inline backticks, fenced code delimiters/language labels grammar (tables deferred). Define ambiguous/unclosed constructs, paste behavior, escaping and normalization of edited blocks; keep recognition shared where existing source/link scanners need it.
  - [x] 1.3 Choose the smallest compatible Lexical nodes/transforms and UI actions. Check pinned package compatibility, existing bundle gate and accessibility needs; record any required dependency/size change rather than importing a general editor framework or highlighting stack.

- [x] 2.0 Add reliable task checkboxes.
  - [x] 2.1 Parse/render/create supported checkbox items and serialize state to ordinary Markdown. Preserve labels, supported indentation/list context and untouched neighboring source.
  - [x] 2.2 Implement accessible pointer/keyboard toggling, predictable Enter/Backspace behavior and one undoable action per state change. Apply existing read-only/frozen/navigation guards and route changes through ordinary autosave.
  - [x] 2.3 Cover checked/unchecked variants, supported nesting, plain-text paste, repeated toggles, undo/redo, save/reopen and failed/conflicting saves. Preserve unsupported imported task syntax literally.

- [x] 3.0 Add reliable inline and fenced code.
  - [x] 3.1 Implement code spans/blocks with safe text rendering, language-label preservation and documented delimiter behavior. Never activate links/page references, formatting shortcuts or missing-page creation inside code.
  - [x] 3.2 Support code insertion/editing, newlines, indentation and a clear keyboard route out of the block. Preserve caret/scroll and undo/redo through autosaves; retain literal fallback for unsupported or malformed code syntax.
  - [x] 3.3 Verify blank lines, tabs, multiple backticks/fence lengths, Unicode, literal HTML, `[[references]]`, `@` text, pasted Markdown and external agent edits. Assert that opening or modifying a neighboring block cannot rewrite code.

- [~] 4.0 Add simple Markdown tables. Deferred by user on 2026-10-25, including all subtasks below.
  - [~] 4.1 Implement conservative pipe-table detection and rendering with a source-preserving import/export path. Cover header delimiters, alignment, empty cells, escaped pipes and code-span content; keep unsupported structures literal.
  - [~] 4.2 Add minimal table creation, cell editing, keyboard navigation and row/column actions. Define focus and undo behavior for structural edits and a safe way to leave a table; do not add spreadsheet interactions or a table-design settings system.
  - [~] 4.3 Keep table overflow inside its own region at narrow widths. Preserve labels, selection, ordinary text safety and existing page-reference policy; ensure a checkbox-looking string in a cell does not accidentally toggle a separate task.
  - [~] 4.4 Verify cell and structural edits, paste, undo/redo, save/reopen, external updates and malformed/unsupported tables without dropping text or normalizing untouched rows/blocks unnecessarily.

- [x] 5.0 Validate the combined document and finalize.
  - [x] 5.1 Add focused deterministic conversion/preservation regressions and real-editor interactions for mixed notes containing headings, emphasis, references, checklists, code, tables and unsupported Markdown. Include CRLF/final-newline cases and edits crossing block boundaries.
  - [x] 5.2 Extend the existing disposable-root editor/browser smoke workflows for desktop and narrow layouts. Exercise two-tab external edits/conflicts, failed/unconfirmed saves, note changes, read-only/frozen states and companion save/switch barriers. Keep physical IME/device/assistive-technology coverage separate from synthetic events.
  - [x] 5.3 Run relevant checks and required repository validation; review bundle/dependency change against the existing gate. Record the tested snapshot, actual results, preservation/normalization guarantees and untested limits; do not claim full CommonMark/GFM round-tripping.
  - [x] 5.4 Update owning browser/editor docs, user-facing formatting guidance, supported-format statements and pending release notes for delivered behavior. Remove duplicate conversion/scanner helpers and unused experiments; use shared existing boundaries where appropriate.
  - [x] 5.5 Once required implementation/checks are complete, archive and commit scoped work under [the task workflow](../../docs/task-workflow.md); update `tasks/CHANGELOG.md` for the completed result. Finalized and archived with this scoped commit. No push, installation or release is implied.

## Relevant files

- [Architecture](../../src/architecture.docs.md), [browser/editor contract](../../src/adapters/http-server/browser.docs.md), [design system](../../docs/design-system.md) — ownership, preservation and interaction rules.
- `src/adapters/http-server/lexical-editor.ts`, `document-controller.ts`, `notes-browser.ts`, `external-document-updates.ts`, `reference-ranges.ts`, `reference-creation.ts` — editing, conversion, guarded saves and inert code/reference behavior.
- `src/core/canonical/markdown-structure.ts`, `src/core/canonical/links.ts` and affected co-located docs — inspect existing structural/source handling; adjust only where the supported syntax changes their behavior.
- `scripts/markdown-formatting-smoke.mjs`, `test/editor-markdown.test.js`, `src/adapters/http-server/editor-markdown.ts`, `editor-markdown-nodes.ts`, `scripts/page-reference-editor-smoke.mjs`, `scripts/lexical-editor-smoke.mjs`, `scripts/editor-smoke-helpers.mjs`, `scripts/external-document-updates-smoke.mjs`, `scripts/companion-browser-smoke.mjs` and related browser tests — extend actual interaction coverage.
- `test/lexical-bundle.test.js`, `test/notes-browser.test.js`, `test/canonical-links.test.js`, `test/markdown-properties.test.js`, `scripts/build-editor.mjs`, `package.json` and lockfile — bundle/format regressions and dependency review where needed.
- [Shared-memory guide](../../docs/cloud-shared-memory.md), [README](../../README.md) — update supported editor behavior without advertising attachment support.
