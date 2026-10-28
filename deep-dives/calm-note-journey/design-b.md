# B — The folding desk

Conceptual inspiration: Coda's approachable canvas and contextual controls, translated into jumpyBrain's existing Markdown editor. This is a design proposal, not a claim about Coda's current interface.

## Idea

The note is a sheet on a quiet desk. Writing tools fold out when requested; navigation and provenance sit on a small desk tab beside the sheet. The distinctive quirk is that **Page details changes its small adjacent caption to “4 sections” when the current note has headings**. The count is useful orientation rather than a decorative badge. Clicking the same familiar control opens the existing outline and context. Empty notes simply say Page details.

Use the existing serif title/body, Ember/Ocean/Mono palettes, system-sans controls and 680px writing measure. No cover images, emoji chooser, blocks, templates, assistant presence or new document model.

## The resting page

- Keep native traffic lights, sidebar, workspace Back/Forward and the visible save/external-change feedback in their established places.
- In the upper-right workspace controls retain the labeled Copy draft and Page details actions. Add the derived section caption only when the count is nonzero; do not relabel the control on every keystroke or announce routine count updates.
- Give the title more uninterrupted breathing room. Immediately below the title place a quiet, left-aligned **Format** disclosure with an “Aa” glyph and **Link** action with a plus glyph. The expanded Format strip reuses the existing toolbar controls and groups; it is closed by default. Slash commands remain the fastest route while writing.
- The page body has no container border, surface card or persistent instruction paragraph. An empty writable body uses the existing presentation-only starter, shortened to “A thought to keep…” with a caption beneath it: “Type / for options.” Neither line is serialized.
- Page details remains closed initially. Its existing outline leads, followed by Related pages, saved-version facts, source checks/metadata and Delete. Sections are visually separated by space rather than nested cards.

The distinction from the current page is meaningful: the full formatting toolbar stops competing with the title/body at rest, while the heading count makes the existing outline discoverable before the user opens a generic metadata panel.

## Journey

1. **Open or find.** Open a sidebar note or use the existing labeled Search / Cmd+K. Search stays global; there is no second search input or duplicate quick switcher. Back/Forward remain reachable and named. The note opens with the sheet, save state and two small editing affordances, rather than a row of every formatting command.
2. **Create.** New note follows the current supported keyboard/action path and focuses its title. Enter enters the body. The starter gives permission to write without asking the user to choose a content type or template. A remote read-only brain shows its real permission state and no writable starter.
3. **Write.** Plain typing needs no tool choice. Type slash for the current supported actions, or open Format to discover them. Opening Format preserves the editor selection through the existing toolbar mechanism. Activating a formatting action leaves the strip open so a second action does not require rediscovery. Escape closes it and returns focus to its trigger; it does not undo text or close another active dialog.
4. **Navigate within a long note.** “Page details · 4 sections” provides a visible promise. Open it and choose an actual heading in On this page. The existing mounted-heading behavior scrolls and places the caret at that heading; repeated headings stay separate. A section count never includes literal/code headings. Closing details returns focus to its trigger.
5. **Connect and return.** Link uses the existing page-reference action and guarded navigation. Related pages remain in details. Opening another note uses the current save barrier; Back returns through the current bounded history. A new note resets its section count and the temporary Format disclosure so the old note's context cannot leak into the new sheet.
6. **Understand a problem.** Saving, failed save, conflict, read-only and external-change messages remain persistent and visible above the document. Retry / Review changes / Recover draft never move into Format or Page details. Copy draft stays labeled and available for loaded notes. Page details describes only the accepted saved revision; no live ownership or shared presence is implied.

## Interaction rules

- Format is a native button with `aria-expanded` / `aria-controls`. Hidden controls are actually hidden and leave tab order. Opening reveals existing controls without remounting the editor.
- Do not hide controls on a timer, pointer leave or typing. The fold is explicit and stable. The disclosure can remain open until the user closes it or changes notes.
- Section counts derive from the same mounted supported headings used by the outline. Count only changes when heading structure changes; prose edits must not rebuild the outline or disturb focus.
- Save status is never a celebratory animation or transient success toast. A saved state means the current accepted baseline is saved, using the existing controller semantics.
- Ctrl/Cmd+F continues to mean in-note find, Cmd+K global search, and slash formatting. No new shortcut competes with these.

## Responsive, theme and accessibility

- At wide desktop sizes keep the current 248px optional details rail. Use the existing title-width observation when the rail changes the available measure; preserve the document's scroll position and caret.
- Under the rail breakpoint use the current bounded in-flow details region. Keep it closed initially so opening a note presents writing immediately. Format's expanded groups wrap as units; 390/320px layouts use existing 40px targets. The section caption may wrap beside its trigger without producing horizontal overflow.
- Use the shared theme tokens in all built-in palettes. No new color and no pastel card system. Serif document / sans-serif controls provide sufficient personality.
- Text and icons keep their accessible names. Make Format's pressed/expanded state visible with the existing control-fill token and a chevron, not color alone. Maintain visible keyboard focus and ordinary DOM order.
- No opening animation is required. If a short opacity transition is used for the strip, honor Reduced Motion and do not animate the writing area's dimensions.

## Acceptance criteria

- Loaded existing notes rest with the formatting strip hidden, while Copy draft, Page details, save feedback and recovery actions remain reachable.
- Format can be opened, traversed, used and closed with pointer and keyboard; selection, text, undo history and draft bytes survive every presentation change.
- The section caption accurately follows heading add/remove/rename, excludes unsupported literal/code headings, resets per note and does not cause repeated live announcements.
- A user can create a note, type title/body, format a heading, insert/navigate a page reference, jump through details, go Back, and reopen the saved canonical Markdown.
- Empty/read-only notes, remote-write permissions, external refresh, failed save, conflict/recovery and exact draft copying preserve existing contracts.
- Light/dark desktop, 390px and 320px show no overflow, clipped toolbar controls or obscured recovery actions. Long titles remeasure correctly with details open.
- Test Format disclosure focus/selection behavior and section-count identity with meaningful browser assertions; run existing note-workspace, note-lifecycle, formatting, related-pages and production Electron smoke flows.

## Tradeoffs and risks

The closed Format strip reduces immediate discoverability of individual commands. The visible word Format and the existing slash starter compensate; first-run coaching or preference storage is unnecessary. A 4-section count describes document structure, not reading progress, completeness or word count. The details panel combines navigation and metadata, so some users still need a second glance to find Related pages. The benefit is fewer destinations and reuse of tested context/save boundaries. This is a modest evolution with a concrete calmness improvement, rather than a new canvas system.
