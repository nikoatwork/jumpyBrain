# C — The quiet page

Conceptual inspiration: Notion’s readable page and progressive disclosure. This is a design proposal, not a claim about any product’s current interface. The distinctive jumpyBrain quirk is a reversible **Writing view**: one action turns the workspace into a calm sheet, while keeping navigation and save truth within reach.

## The pain this solves

The current note has a good serif measure, but it asks the writer to look past permanent formatting controls, the library, history, copy, details and occasional status before reaching their sentence. Opening details can also change the writing column’s width. The proposed default keeps the existing library for orientation but gives the page one visual hierarchy: title, prose, then optional tools. Writing view is an explicit deeper concentration state, never something triggered automatically by typing.

## The page

- Preserve the existing 224px sidebar and native 48px header/traffic-light treatment. Retain Home/New/Search, current-page state, brain identity and all existing guarded navigation.
- In the note header, keep Back/Forward on the left. On the right show save truth, a small named **Writing view** icon, **Copy draft**, and **Page details**. These use existing token sizes and theme colors. Saving and errors occupy a stable area; saving never moves the title or steals focus.
- Center the existing flexible 680px reading measure. Use the current Charter/Georgia writing face, generous title-to-prose gap, and quiet surface without a card outline, cover image, emoji picker or decorative page icon.
- Replace the always-expanded formatting row with a named **Format** button directly below the title. Its short row opens in place, uses all existing operations and shows a chevron/expanded state. The row is closed by default on note entry; opening it is deliberate. The existing slash menu and keyboard shortcuts continue to work while it is folded. The button remains in the keyboard order and is never hover-only. Preserve the active selection before pointer formatting.
- **Page details** remains optional and closed on note entry. Existing outline, related pages, saved facts, source checks, metadata and Delete stay together. Do not invent verified author identity, history, sharing or presence.

## The quirk: Writing view

Writing view hides the sidebar, expanded formatting and details by presentation only. It keeps one quiet top line containing **Back**, **Search**, **New note**, save/recovery state and an explicit labeled **Exit writing view** action. The sheet stays at the same readable width and left/right balance. It does not increase body size or enter OS fullscreen.

The transition remembers which panels were open and restores that exact layout on exit. Entering it never writes Markdown, flushes as a side effect, recreates Lexical, resets selection or changes the brain. It is scoped to the current app session, not canonical note metadata. Switching notes remains in writing view; entering Settings temporarily uses the ordinary Settings surface and returning restores the session’s writing preference. No new shortcut is required for this first version; an explicit discoverable button is sufficient.

The rewarding detail is the page becoming visually still with a single click, while **Exit writing view** stays legible at all times. This is an intentional concentration tool, not a hidden gesture or an automatic chrome fade.

## Journey

1. **Arrive and orient.** Home retains New note, Search and recent notes. Opening a note keeps the library’s current-page highlight and a visible accepted-save state. No focus is stolen from a user opening a note to read.
2. **Find.** Global Search remains one click from the library and one click from writing view. Existing Cmd/Ctrl+K behavior works. Search returns to the original editor selection and scroll when canceled. Opening a result uses the current save/navigation barrier.
3. **Create.** New note uses existing idempotent capture, places focus in the title as today, and shows the empty-body hint: “Start writing, or type / for options…” only while empty. Tab or Enter reaches the body using existing title behavior. No template-choice screen precedes the first sentence.
4. **Write.** The ordinary page shows title and prose with a single Format disclosure. Slash commands provide quick structure; mouse and keyboard users can open the same full formatting tools. Writing view is available whenever they want a quieter canvas.
5. **Consult and link.** Existing reference insertion and page-link activation remain unchanged. Page details exposes headings and related pages. A user can navigate a section or related note and return using the existing history. No split editor or second draft is introduced.
6. **Return.** Back saves through the existing guard, then restores the actual destination state. Closing search or details restores the relevant originating control/selection. Exiting Writing view restores sidebar/details/format state rather than presenting a fresh layout.
7. **Trust.** Failed or unconfirmed saves remain visible in either view, with Retry/Review/Recover and Copy draft reachable. The concentrated canvas never conceals an unsafe save state. Read-only or frozen documents retain copying, searching and readable content but cannot invoke mutations. Brain switching continues to use the all-tab barrier.

## Accessibility, narrow screens and themes

- Format has `aria-expanded` and `aria-controls`; Writing view has an explicit pressed state/name, and its exit has visible text. Hidden panels are removed from tab order with native hidden semantics. Focus moves only when the active control would otherwise become hidden; exit restores the invoking control when connected.
- All actions keep native buttons, existing focus rings, labeled tooltips and 32px targets, growing to 40px on narrow screens. No instruction depends on hover, color, animation or a specific shortcut.
- At 390/320px, use the same current collapsed navigation behavior; Writing view still has Search and Exit, with Back/New represented by named icon buttons. Status wraps to its own line when needed, never truncating a recovery action. Format groups wrap together without horizontal page scrolling.
- Details remains in flow at narrow widths; opening it is user initiated and must not cover the active caret. At desktop widths the existing rail can stay, but Writing view always closes it and restores on exit.
- Ember, Ocean and Mono light/dark inherit existing semantic surfaces; no new hard-coded page palette. Reduced Motion removes the optional short opacity transition. Avoid animated pane widths because they complicate caret/scroll preservation.

## Tradeoffs

- Folding Format adds a click for mouse-based formatting. The visible button and unchanged slash/keyboard access mitigate this; do not remove the button or make it selection-only.
- Writing view adds a mode and duplicated entry points. It earns that complexity only if its minimal header makes Search/New/Back/save recovery as reachable as the ordinary layout. If time is limited, ship the folded toolbar first and defer the mode rather than release a navigation dead end.
- This proposal is the most visually quiet direction but not necessarily the fastest for a person switching notes every few seconds. Its value should be judged on a real write–consult–return scenario, not a static empty-page screenshot.

## Implementation acceptance criteria

- Both ordinary and Writing views support create → title/body edit → autosave → reference/search navigation → Back → continued writing, using the same editor/controller instance and canonical transport.
- Folding Format does not alter Markdown, save, undo history, selection or permission state. Existing formatting operations remain callable and correctly disabled.
- Enter/exit Writing view preserves document identity, unsaved draft, selection, scroll and actual sidebar/details/format preferences; no hidden focus remains.
- Search/New/Back/Exit and all required save/recovery actions are reachable by pointer and keyboard in Writing view at 1280/900/390/320px, light/dark. Long title and save-error fixtures produce no overflow.
- Test an empty note, long prose with headings/code/tables, reference navigation, canceled search, formatting+undo, failed save, conflicting external update, remote read-only, brain switch and app close barrier. Use disposable Markdown and production Electron for native verification.
- No new dependency, persisted note field, author/presence claim, automatic index action or alternate Markdown parser is introduced.
