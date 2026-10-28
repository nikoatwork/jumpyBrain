# A — Quiet desk

A Linear-inspired writing desk: one clean command strip, a beautiful document, and a deliberate way to put the surrounding workspace away. The distinctive quirk is a **Focus** switch that changes the room around the note without changing the note. It is explicit, reversible and honest about unsaved work.

This is a conceptual product inspiration, not a claim about Linear's current implementation. It follows the existing Ember/Ocean/Mono themes, Charter writing surface and system-sans controls.

## What changes

The ordinary view keeps today's useful sidebar and guarded navigation. Recompose the note's upper chrome as one quiet strip: Back/Forward on the left; note save state and exceptional recovery actions in the flexible middle; Search, Focus, Copy draft and Page details on the right. Existing native Mac drag space stays intact. At normal desktop width, content begins below generous whitespace with the title and one restrained formatting row. No new cards, document border, title icon or decorative cover.

**Focus** hides the navigation sidebar, formatting row and Page details rail for the current writing session. The document expands only until its existing comfortable maximum measure; it never becomes a full-width text slab. The same header remains, including Back/Forward, globally reachable Search, a labeled **Exit focus**, Copy draft, and all save/error/recovery states. Focus is session-local and does not overwrite the user's independent collapsed-sidebar preference. Exiting restores the exact prior sidebar and Page details state. Changing notes through Search or Back retains Focus until explicitly exited; switching brain or reloading returns to the ordinary view.

The small delight: entering Focus removes structure with a short, quiet opacity transition, leaving the writing column steady. It feels like clearing a desk. No animated caret, writing score, word-count target, clock, motivational copy or auto-hiding controls.

## Full user journey

1. **Arrive.** Home's existing New note/Search and recent activity remain familiar. Open a note to a readable title, quiet Saved state and body. No onboarding interruption.
2. **Find.** Sidebar Search and the header's Search action open the same existing global search dialog. Keep its existing keyboard shortcut. In Focus, Search remains visible so quick navigation never requires first restoring navigation.
3. **Create.** Existing New note creates through the same guarded operation, focuses the title and presents the current presentation-only body hint. Empty text says simply “Start writing. Use / for commands.” It disappears upon real content and never reaches Markdown. Enter/Tab follows the editor's existing title/body behavior rather than inventing a new creation flow.
4. **Write.** Format through the regular row, keyboard shortcuts or existing slash commands. Choose Focus for sustained writing. The live editor DOM, caret, selection and undo stack remain mounted throughout. The top save state stays still and legible. No timer reacts to typing to hide or move controls.
5. **Move within a note.** Exit Focus and open Page details for the existing outline, or use existing Cmd/Ctrl+F. The outline stays a secondary, explicit aid; it does not become a permanent third column.
6. **Follow a thought and return.** Use a page reference, Search or Back/Forward. Existing navigation flushes a draft before departure. Focus stays available at the destination; Back returns through the same supported history. Do not promise restored scroll/caret across notes unless the current editor already guarantees it.
7. **Save trouble.** Saving failures, uncertainty, remote read-only state and Review changes remain visible in every layout, with existing retry/recovery actions and Copy draft. A failed save blocks switching exactly as today. Focus never suppresses errors, bypasses locks, creates writes, or changes permission.
8. **Leave.** Exit Focus restores the surrounding desk. Native close/quit retains existing all-tab save guards. No additional confirmation or implicit discard.

## Concrete interaction and accessibility

- Use a real button with visible Focus / Exit focus label and `aria-pressed`; no icon-only mystery or hover-only discovery.
- Hide regions using the existing presentation layer. Never remount Lexical or serialize/reparse the document for layout changes.
- If entry hides a region containing keyboard focus, move focus to the existing editor without changing its selection; exiting leaves the user's writing focus intact. If no valid stored editor selection exists, focus the editor without manufacturing a write.
- Do not use bare Escape as a global Focus exit: Escape already belongs to slash menus, search, Page details, find and dialogs. The explicit Exit focus button remains reachable by Tab; an optional documented chord can be added only after checking existing native/browser bindings.
- Expose the active mode in the button state, not a repeated live announcement. Keep disabled reasons and tooltip labels from the shared controls.
- Existing read-only mode still permits Focus and Search, but body/format actions follow current permissions.
- Reduced Motion removes the entry transition. Use the shared focus ring, 32px desktop targets and 40px narrow targets.

## Narrow windows and dark mode

Below the existing narrow breakpoint, retain a two-row header when required: history/Search/Focus on the first row; save/recovery/Copy draft/Page details on the second. Never squeeze failure text into ellipsis or create horizontal scrolling. Focus's main value here is removing the sidebar footprint; the document preserves 18px body text and current narrow padding. Details continues using the current bounded in-flow layout outside Focus.

Dark and light use the existing semantic surfaces and accent. Focus uses the same background as the note; a theatrical black canvas or separate palette would weaken continuity. Check all three built-in palettes and long titles.

## Why this direction

The current page already solves outline and save-context needs. Adding another permanent rail would not solve the user's request for calm. Quiet desk makes the largest meaningful simplification available while keeping fast navigation, visible trust and the existing sophisticated editor. It has one new concept and one new state, with a reversible escape.

## Tradeoffs and risks

- Formatting discovery decreases in Focus; the mode is opt-in, slash commands already exist, and Exit focus is explicit.
- Additional header Search duplicates a sidebar entry in ordinary mode. Render it only when sidebar is unavailable (collapsed or Focus), while retaining the same accessible action.
- Hiding Page details can surprise users if its state is lost. Snapshot and restore it; do not write a new global preference.
- CSS-only hiding without focus handling can strand keyboard users. Test actual focus and selection, not just screenshots.
- Session mode adds lifecycle state. Reset/fence it on brain changes and pagehide; do not let stale state reopen details from another document.

## Acceptance criteria

- [ ] One explicit Focus action gives a centered, borderless writing surface; Exit focus restores prior layout.
- [ ] Search, Back/Forward, Copy draft and every save/recovery state remain reachable while focused.
- [ ] Toggling changes no canonical bytes and sends no PUT; caret, draft, undo and editor node identity survive.
- [ ] Dirty navigation, failed/uncertain/conflicting saves and remote read-only locks retain existing behavior in Focus.
- [ ] Search and page references can navigate and return without leaving Focus or accidentally restoring another note's details.
- [ ] Title wrapping and document measure remain correct expanded/collapsed, details open/closed and focused.
- [ ] Keyboard-only journey, 1280/900/390/320px, both schemes, all palettes and Reduced Motion pass visual/behavioral checks.
- [ ] Production Electron verifies native chrome, Search, typing/autosave, Focus transitions and close/quit protection using disposable data.
