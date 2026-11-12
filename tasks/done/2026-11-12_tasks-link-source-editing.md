# Edit link paths in place

## Completed — 2026-11-12

Links render as their label only ([note link labels](2026-11-12_tasks-note-link-labels.md)). Now, as in Logseq and Obsidian's live preview, **the link at the caret shows its full Markdown `[label](path)` as editable text, and leaving it renders the label again.** This works for note links (`.md`) and web links. Owner request; built in one pass after the plan. Not released or installed.

## Behaviour

- **Per link:**
  - Only the link at the caret expands, when the caret is inside it or touching its edge from the neighbouring text.
  - Moving into it with arrow keys works naturally.
  - The caret keeps its place inside the label. At a label edge it goes to the edge of the source.
- **Clicking a label still opens the link**, and so does Tab then Enter. A pointer press on a link holds off the reveal until the next key or a press elsewhere, so following a link doesn't leave it expanded.
- **Collapse:**
  - Moving the caret away, or focus leaving the editor, re-parses the text.
  - Text typed just before or after the link becomes ordinary text beside it.
  - Source that no longer parses as a link stays literal, with its bytes kept exactly.
- **Exactness:**
  - Revealing and collapsing are applied only when the serialized Markdown is byte-identical, otherwise they're reverted. They're tagged `HISTORIC_TAG`, so they never save, publish or add an undo step.
  - One undo reverts a path edit and shows the original link.
- **Not revealed:** links whose label carries formatting, such as a bold heading link. They keep label-only editing.

## Changes

- `lexical-editor.ts`:
  - `$linkPreview(apply)` runs from an update listener, and from `focusout` without DOM selection sync, so it doesn't take focus back. It swaps the link for an `InertLinkNode` holding the export of the generic `externalLinks` transformer, and back through the `noteLinks`/`externalLinks` replace functions.
  - A `CONTROLLED_TEXT_INSERTION_COMMAND` handler splices a typed replacement of a selected range inside the revealed source. Without it, Lexical moves the rest of the source into a plain text node.
  - `pressedLink` is set by a pointer press on a link and cleared by any non-modifier key.
- `editor-source-map.ts`: a web link whose full source is visible maps verbatim, like relative links, so `_`/`*` in its URL no longer break caret mapping.
- Smokes:
  - `scripts/note-link-smoke.mjs`: new reveal/edit/collapse section.
  - `scripts/external-links-smoke.mjs`: typing `*[` inside a link now edits the revealed source verbatim, where it used to escape label text, and the reopened source stays literal.
  - `integrations/electron/smoke-external-links.mjs` and its runner:
    - Brought up to date with label-only note links. They were still expecting raw `[Earlier](…)` text.
    - Added native-key reveal, path edit and collapse.
    - Now compare the note body only, since an edit adds metadata.
- `browser.docs.md`: behaviour and verification.

## Verification

Snapshot: branch `feat/link-source-editing` from `4de4e893`. Gzip sizes are from `npm run build`.

- Editor bundle: **180,765 → 181,579 bytes gzip (+814)**, 549,810 → 551,753 minified, with 15 bundled packages. The 185,000 gate holds, so the budget is unchanged.
- **Unit tests:** `node --test` over the 41 editor/browser/reference/markdown/lexical/collaboration/paste/notes test files: **435 pass, 0 fail**. That includes a new source-map case: a revealed web link with `_`/`*` and a note link map verbatim, and the hidden form still needs link evidence.
- **`note-link-smoke`, 1280/390px: PASS.** It checks:
  - caret inside a label reveals only that link, with the caret kept, and no Markdown change;
  - replacing part of the path saves the exact new link;
  - leaving it collapses to the label with the new hover path;
  - undo restores the exact body and redo reapplies the edit;
  - the new target opens on click;
  - arrow keys reveal from outside and step through the source;
  - a web link with `_` reveals and collapses back to its `href`;
  - focusing the title field collapses it;
  - reveal and collapse never write the file.

  A screenshot of the revealed state was inspected.
- **Real Electron window** (`node scripts/external-links-electron-smoke.mjs`, native key events): **PASS**. It covers reveal from the arrow keys, collapse, a path edit via native typing that saves exactly, collapse with the new path, revert by Backspace, and the existing link-opening and frozen-session checks. The note body is unchanged at the end.
- **`external-links`, `markdown-bullets`, `lexical-editor` and `page-reference-editor` smokes: PASS.**
- **`collaboration-editor-smoke`:**
  - It fails at `runRestartIntentProof` (waiting for `conflict` after a restart), on this branch and **equally on the unchanged baseline**, so that failure isn't caused by this change.
  - With only that step skipped, the remaining proofs pass in 3 of 4 runs: two contexts, convergence, actor undo, IME, cursors, recovery and actor churn.
  - The very first skipped run errored without its output captured, and the 3 later runs passed.

## Limits

- I didn't check it in the installed packaged app. The real Electron window with native key events is the closest check.
- Links with a formatted label aren't revealed.
- Pressing Enter inside revealed source splits it like any text, and the halves stay literal.
- Physical IME is untested. Swaps are skipped while a composition is active.
- Typing punctuation inside a revealed link now writes raw Markdown. For example, `*[` in a label makes the source no longer a link, and it stays literal until fixed. Previously the label text was escaped.
