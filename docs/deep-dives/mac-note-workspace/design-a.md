# Direction A — Quiet writing desk

## Intent

Make the page feel like a document you can immediately write in. A nontechnical person should understand where to type, whether the work is safe, and where supporting context lives without learning Markdown or agent terminology.

## Current pain, grounded in the app

- `notes-browser.ts` places a large title, then a separate Copy/Delete row, then ten formatting/insertion controls before the document. The controls command more attention than the writing; Delete is unusually prominent in a creation task.
- Save and external-change feedback live in the distant workspace toolbar, while title errors appear inside the column. Users must connect separate locations to know whether the page is safe.
- Related pages and raw metadata sit after an editor with a 55vh minimum height. These are useful secondary context, but long docs make finding them costly.
- A new page has no visible starter affordance in the empty body. The rich editor already supports task blocks, headings, Markdown paste and slash commands; beginners need an obvious first step, not more modes.
- The app already protects drafts, merges disjoint external changes, highlights changed blocks and offers conflict review. The redesign should make those existing guarantees easier to understand instead of inventing live presence.

## Layout

```text
[sidebar] | [Back][Forward]                       [Saved] [Page details]
          |
          |             Project brief
          |             [Text ▾] [B] [I] [Insert +]
          |
          |             The document starts here.
          |             Type / for headings, tasks and more.   ← empty only
          |
          |             ## Scope
          |             A generous, readable column ...
          |
          |             [Related page] [Related page]
```

Opening Page details reveals a quiet disclosure beside or above the footer, with the file location, existing read-only metadata, source checks and Copy draft / Delete note. It must not narrow the reading column unexpectedly on small windows. A sheet or in-flow disclosure is sufficient; a permanent inspector is unnecessary.

## Key interactions

1. Open a note and type directly into the existing title/body. Keep the serif document surface, existing column width and all save/navigation safeguards.
2. Show a restrained, one-line formatting strip. Consolidate Text/H1/H2/H3 into a native style picker, keep Bold and Italic immediately visible, and group task/code/reference insertion behind a labeled Insert affordance. Preserve selected text and Lexical history when using controls; expose current format through accessible selected/pressed state.
3. Add a real empty-body placeholder: “Start writing, or type / for options”. It is presentation only, never canonical document content. It disappears after the first nonempty input and returns after undo to empty. Do not overlay a nonempty literal/code block.
4. Put save feedback in a consistent top-right location beside Page details. A loaded unchanged note should say “Saved” rather than look unexplained. Keep failures/review states and Retry/Recover accessible; never infer a successful save from having no request in flight.
5. Move destructive Delete out of the main writing path into Page details, retaining its existing confirmation. Copy draft stays reachable there and in recovery.
6. External updates retain truthful “Updated elsewhere” language. When there is a conflict, the existing Review changes action becomes the obvious next step; preserve the local draft until explicit resolution. No fabricated authors, online dots, avatars or agent chat.

## Feasible implementation

Confine behavior to the browser presentation of the Mac app's existing document controller. Main work is markup/CSS in `notes-browser.ts` plus a small browser controller for the details disclosure/placeholder/style picker if needed. Reuse existing formatting commands, clipboard/deletion actions, related-page fetches, living sources and save state. Use the established theme/type/control tokens and keep hosted shared-shell compatibility. No persistence schema, CLI behavior, backend API, cloud sync or engine changes.

The leanest slice is: empty-state guidance; a quieter top action area; Page details containing current Copy/Delete/metadata; and coherent loaded/save/error presentation. Style-picker consolidation is secondary if selection preservation makes it materially riskier than the current toolbar.

## Accessibility and trust

- Every control has a visible label or the shared focus/hover tooltip, plus an accessible name. Keep at least existing 32px desktop / 40px narrow targets, native keyboard interaction and theme contrast.
- Page details uses native `details`/`summary` or an accessible button/disclosure; Escape closes custom popovers and restores focus. Never require hover to discover recovery or destructive actions.
- The placeholder is not the textbox's only accessible label; retain `aria-label`, and avoid announcing helper copy on each keystroke.
- Focus remains in the document after formatting; opening details must not save or alter canonical content. Read-only brains retain copy and details while write controls stay disabled.
- Distinguish confirmed saved state, editing, saving, failed and unconfirmed writes. “Saved” is valid for the loaded baseline because it came from canonical storage, but no edited/unconfirmed draft may receive that label.
- External changes indicate observed file changes, not verified identity or retained revision history. Cloud coworking remains product direction, not UI theatre.

## Three measurable acceptance criteria

1. At 1280px and 390px widths, a loaded note exposes one coherent writing toolbar, with no horizontal overflow and no always-visible Delete action in the document column. Text/heading, Bold/Italic and Insert functionality remain keyboard reachable.
2. Creating an empty note shows one starter hint; entering, undoing and redoing text toggles it correctly, and saved Markdown never includes hint text. Title/body round trips and formatting undo retain existing behavior.
3. A scenario covering normal save, failed save, disjoint external edit and overlapping conflict always exposes the truthful state plus the necessary action. Failed/conflicting navigation cannot lose the local draft; details opening/closing produces zero document-write requests.

## Tradeoff

This direction offers the fastest improvement to writing comfort and beginner confidence, but deliberately adds little collaboration discovery. Pair it with a carefully bounded “what changed” or document-context idea from another direction only when that idea uses real existing information.
