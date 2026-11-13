# Render Markdown task checkboxes in the editor

## Completed — 2026-11-13

Task lines now show a clickable checkbox in more cases. If the label contains syntax the editor cannot format, the row still gets its checkbox and only the label is shown as plain editable source. Rows using `*` or `+` and tasks nested under an ordinary bullet also render, and nested tasks imported from Obsidian (tab or four-space indentation) keep their hierarchy. Clicking a checkbox or pressing Space/Enter on it changes only the `[ ]`/`[x]` byte in the Markdown file, through the normal save path, and Undo restores it. The labels, indentation, bullet and an uppercase `X` stay exact. Not released or installed.

## Goal

Answer the [November 13 feedback](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=37afc713-3035-4beb-acc8-f02cee4104b5) ([index](../feedback.md)): an agent-written task line such as

    - [ ] Shape Vicky Calls You as the next Agent initiative: second and later calls, recurring-call triggers. Start in the product brain note "Open (PM to plan): Vicky …"

shows as literal source in the Mac app instead of a checkbox. The user suggests treating `- [ ]` / `- [x]` like links: keep the Markdown source canonical and render it as a pretty, clickable checkbox. Also covers the open [nested checkboxes after Obsidian import](../todo/tasks-feedback-follow-ups.md) item.

## Findings

- Checkbox rendering already existed (`taskMarker`, `TaskMarkdownNode`): `- [ ]`/`- [x]`/`- [X]` with two-space nesting under another task. It was conservative: any unsupported syntax in the label made the **whole row** literal source.
- Chromium reproduction on a disposable brain (pre-change build): the reported text as quoted renders as a checkbox at the top level — colons, quotes, parentheses, `…`, length, `[[references]]`, inline code and `.md` links are all supported. The quote in the email is truncated (`"Open (PM to plan): Vicky `) and the original note was not available, so the exact trigger is not proven. The rows that fell back to literal were:
  - labels with `<`, `>`, `~`, `\`, unpaired `[`/`]` (for example `[P1]`) or backticks, or a lone `*`/`_`. Agent text often has these: `->`, `~2d`, `[P1]`, `<placeholder>`;
  - task rows nested under an ordinary bullet (`- Topic` then `  - [ ] Step`);
  - `* [ ]` and `+ [ ]` markers, and ordered `1. [ ]`;
  - tab or four-space nesting (Obsidian's default is tabs), and indented tasks with no parent.
- The most likely cause is the remainder of the reported line (after the quote ends) containing one of those characters, or the row being nested under a bullet. Both shapes now render.
- Obsidian import is always-preserve: source bytes are kept exactly (`test/obsidian-migration.test.js`: "preserves literal paths, all source bytes"). Nested checkboxes were lost in the editor, not in the import or the canonical Markdown: tab-indented children fell back to literal lines.

## Changes

- `editor-markdown.ts`: `taskMarker(line, previousIndent, unit)` accepts `-`/`*`/`+`, exact whole-unit nesting at most one level deeper, and returns a `marker` (unit, bullet and checked spelling). `taskUnit(value)` takes the note's nesting unit from its first one-level nested task: two to four spaces or a tab, otherwise two spaces.
- `editor-markdown-nodes.ts`: `LiteralMarkdownNode` moved here unchanged. `TaskMarkdownNode` gains `__marker`, `__literal` and `prefix()`. A literal row gets the `markdown-literal` class (prose font via existing CSS); Enter continues it as a literal row, and Backspace at the start of a root literal row (`collapseAtStart`) turns it into a literal line.
- `lexical-editor.ts`:
  - **Parse:** a task whose label is unsupported becomes a literal-label task instead of a whole-line literal. An ordinary bullet can parent a nested task.
  - **Export and toggle:** export uses `prefix()`. The preserve exporter matches the row's source snapshot with the checked state flipped and replaces only the checkbox byte. The toggle intent range comes from the row's real source.
  - **Literal labels:** text in a literal label is forced to code format, so formatting shortcuts do not apply. Backspace at the start of a non-empty root literal row unwraps it instead of merging it into the previous block as inline code.
- New `scripts/task-checkbox-smoke.mjs`; `test/editor-markdown.test.js` covers the new grammar and unit cases.
- `browser.docs.md` documents the grammar, literal labels, exact-byte toggles and the smoke.

## Verification

Snapshot: branch `worktree-agent-ac61ef4bf10015f7f` from `811591f2`. `npm run build` with cloned `node_modules`: editor 560,304 minified / **184,682 gzip** (`test/lexical-bundle.test.js` ceiling 185,000; baseline 184,354; +328 bytes, 318 headroom).

- `node --test test/editor-markdown.test.js test/editor-source-map.test.js test/lexical-bundle.test.js test/collaboration-editor.test.js`: **43 pass, 0 fail**. `node --test test/obsidian-migration.test.js`: pass (byte preservation evidence).
- New `npx --package=playwright node scripts/task-checkbox-smoke.mjs` at 1280 and 390px: **PASS**. It covers:
  - rendering of the reported line, a literal label, `* [X]`, a task under a bullet, and an ordered `1. [ ]` kept as one literal line;
  - click toggle with Undo; Space/Enter keyboard toggle;
  - `X` unchecked, saved, then Undo restoring `X`, and uncheck/recheck restoring `X`;
  - a nested toggle;
  - a literal label edit (typing `*now*` stays literal), Enter continuation with Undo, Backspace to a literal line with Undo;
  - reopen with exact bytes and no horizontal scroll;
  - tab nesting (levels, a toggle, Tab indent writes a tab, Undo, reopen) and four-space nesting (levels, a toggle, Tab writes four spaces).

  File bytes were checked after every save. Screenshots at both widths were inspected: checkboxes are aligned, the literal label is in prose font, and the nested row under the bullet is indented.
- Existing `nested-checklists-smoke` (1280/390/320), `markdown-bullets-smoke` (1280/390) and `note-link-smoke` (1280/390): **PASS**.
- `collaboration-editor-smoke`: the positional-intent proofs, including "Markdown shortcuts, task editing, slash command and paste", pass for both the isolated and shipped bindings. The run then fails at the restart-intent proof (`collaboration-editor-smoke.mjs:338`, TimeoutError) **identically on the unmodified baseline build**.
- `task-completion-smoke` fails intermittently at line 167 ("returning to saved checks" click feedback) on both baseline and this build, after a varying number of passing theme combinations (two on baseline, three to six here). `editor-feedback-smoke` fails at line 59 (TypeError) identically on baseline. These are pre-existing and not caused by this change; not fixed here.
- `npm run check:package-size`: pass. `git diff --check`: clean.

## Limits

- **Nesting unit:** one unit per note, taken from the first one-level nested task. Notes that mix tabs and spaces, or two- and four-space nesting, keep the other style as literal lines (unchanged bytes). Rows created by typing `- [ ] ` or the Task control (not Enter continuation, which inherits the row's unit) use two spaces when later indented.
- **Not supported:** ordered `1. [ ]` tasks, ordinary bullets nested under tasks or bullets, and tasks below a nested ordinary bullet stay literal lines.
- **Literal labels:** formatting, links and `[[references]]` inside a literal label are shown as source and are not active. Editing a rich (non-literal) label may still normalize inline delimiters, as before.
- **Not tested:** packaged Mac app, Safari/WebKit and assistive technology.
- **Original note unavailable:** the exact fallback trigger of the reported line is inferred, not proven.

## Tasks

- [x] Reproduce in the browser editor (Chromium, disposable brain) with the exact shape above plus: `- [x]`, `* [ ]`, checkbox with inline code/emphasis/links/quotes/colons/parentheses, nested checkbox lists (2–3 levels, mixed checked state, Obsidian-style tab/2/4-space indentation), and ordered `1. [ ]`. Record which render, which fall back to literal source, and why.
- [x] Render task items as checkboxes whose state lives in the source `[ ]`/`[x]`; toggling (click, keyboard) changes exactly those bytes and goes through the normal save/live path with Undo. Inline content renders as on ordinary bullets.
- [x] Nested task items keep hierarchy and state; preserve source bytes (indent style, `x` vs `X`) on round-trip. If a construct stays unsupported, it must stay as editable literal source, never silently altered.
- [x] Keep the editor bundle under its gzip ceiling (`npm run build`, `npm run check:package-size`).
- [x] Tests: relevant `test/editor-markdown*.test.js` / source-map cases; one Chromium smoke at 1280 and 390px covering render, toggle, Undo, reopen exact bytes.
- [x] Update `src/adapters/http-server/browser.docs.md` and finalize per `docs/task-workflow.md`. The release note, the nested-checkbox follow-up mark and the feedback index rows are left to the coordinator, who owns `tasks/todo/release-next.md`, `tasks/todo/tasks-feedback-follow-ups.md` and `tasks/feedback.md`.
