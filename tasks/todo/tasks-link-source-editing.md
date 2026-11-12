# Edit link paths in place

## Goal

Links now render as their label only ([note link labels](../done/2026-11-12_tasks-note-link-labels.md)), so the hidden `](path)` can't be edited in the Mac app. Owner request (2026-11-12): be able to change a link's path inline. Keep it pragmatic, like Logseq and Obsidian's live preview: **when the caret is inside a link, show its full raw Markdown `[label](path)` as editable text. When the caret leaves, render the label again.**

Applies to both note links (`.md`) and web links (`https://…`), since they share `ExternalLinkNode`.

## Proposed behaviour (confirm in 1.1)

- **Reveal per link, not per line.** Only the link that holds the caret expands. The rest of the line stays rendered, so the text doesn't jump around much.
- **How the caret gets in:**
  - Arrow keys into or across a link reveal it.
  - A click just beside the label, or a click that places the caret at the label's edge, reveals it.
  - Clicking the label itself keeps opening the link, as it does today. Tab then Enter also still opens it.
  - Optional fallback, only if edge clicks feel unreliable: an "Edit" action in the hover state, or Alt+click to reveal.
- **Collapse:**
  - When the caret leaves the raw span, re-parse it. If it is still a valid link, render the label again.
  - If the user broke the syntax (for example by deleting `)`), keep it as plain text, like any other typed text today.
- **Exactness:** reveal and collapse must not change the saved Markdown unless the user actually typed something. Undo must work across a reveal/edit/collapse cycle, ideally as one step per edit, never as an extra "reveal" step.

## Evidence and boundaries

- Current pieces:
  - `noteLinks`/`externalLinks` transformers and `ExternalLinkNode` live in `src/adapters/http-server/lexical-editor.ts`.
  - The raw↔rendered caret mapping lives in `editor-source-map.ts`, and the grammars in `editor-markdown.ts`.
  - Typing `)` already converts raw text into a link. Collapse can probably reuse that transformer path.
- Likely approach: listen for selection changes. When a collapsed selection lands in or at the edge of a link node, swap the node for a text node `[label](url)` and keep the caret at the mapped offset. When the selection leaves, run the link transformers on that text node.
  - Tag both swaps so they are skipped by history, collaboration-change detection and dirty or save state.
  - Check how this interacts with live collaboration: a revealed link is only local view state and must never be broadcast as a different document.
- **Bundle budget is the main risk.** The editor has 12 bytes of gzip headroom (224,238 / 224,250). This feature needs a measured budget review per `docs/build-footprint.md` before or alongside implementation.
- Out of scope: wiki/page references `[[…]]` (they have their own model), images, and autocomplete for paths.

## Tasks

- [ ] 1.0 Design.
  - [ ] 1.1 Confirm the behaviour with the owner: per-link reveal, edge click versus label click, and whether a hover "Edit" affordance is also wanted.
  - [ ] 1.2 Spike the selection-driven swap. Check history, collaboration, save/dirty tagging, the source map, and IME/composition safety.
  - [ ] 1.3 Measure the bundle cost and agree on the budget change in `docs/build-footprint.md`.
- [ ] 2.0 Implement.
  - [ ] 2.1 Reveal on caret entry (keyboard and edge click), with the caret kept at the matching raw offset.
  - [ ] 2.2 Collapse on caret exit, with re-parse through the existing transformers. Invalid syntax stays as text.
  - [ ] 2.3 Keep label click, Tab+Enter and the hover title working for collapsed links.
- [ ] 3.0 Verify.
  - [ ] 3.1 Unit tests: reveal/collapse round trips keep the Markdown byte-identical; the path edit saves exactly; undo works; broken syntax is preserved.
  - [ ] 3.2 Chromium smoke at 1280/390px, extending `scripts/note-link-smoke.mjs`:
    - arrow into a note link and a web link, edit the path, and arrow out;
    - the saved Markdown matches;
    - the new target opens on click;
    - collaboration or live-edit does not see a phantom change.
  - [ ] 3.3 Check it in the packaged Mac app.
- [ ] 4.0 Docs (`browser.docs.md`), release note, changelog, archive and commit.
