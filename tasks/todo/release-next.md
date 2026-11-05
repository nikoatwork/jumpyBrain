# Changes

- Agent guidance now treats authorized concurrent editing as normal, with source-range edits and resync instead of asking the user to stop typing.

- Task checkboxes align with the first text line; checked labels use 80% opacity instead of a partial underline in the Mac and browser editors.

- Search stops hiding externally renamed notes behind an old tab save once the searched index is verified fresh, including after CLI indexing.

- Saved agent edits no longer ask for version review; earlier versions stay under More info. Recovery shows what was added or removed, with two clear choices and full-version tools tucked under More options. A clean note whose old caret cannot follow an external edit loads the saved text and waits for a fresh click, while unsaved drafts keep their recovery safeguards.

- Related pages stay visible while typing and deleting; changed saved text refreshes about every ten seconds, with quieter minute-long refreshes when unchanged.

- Clearing a page name while renaming keeps the editor usable; typing a replacement saves normally without needing conflict recovery.

- Narrow note links and resizing leave room for the selected note, using temporary sidebar collapse that preserves the desktop preference.

- Read-only notes hide writing invitations, including in manual-copy recovery; denied note creation explains when write access is needed.

- Abandoned generation now reports its confirmed interruption after lease expiry without requiring a status lookup; already saved output stays intact.

- Escape closes the focused formatting controls even while the editor selection remains highlighted.

- Search warnings stay with Search/graph and no longer obscure later note confirmations; uncertain freshness no longer claims all search is unavailable.

- Invalid search/recall depth options explain the allowed choices before engine setup or remote connection errors.

- A connected note quietly distinguishes confirmed generation finish, stop and interruption, without treating lost presence as completion.

- Keeping the current note after comparing retained versions quiets that notice for this tab; earlier versions stay accessible.

- If live editing cannot connect, loaded saved notes stay readable with a clear editing retry; connection status is consistent for screen readers.

- Opening notes and saving your own changes avoid false external-update notices; rapid peer edits keep their latest notice visible, and retained-version guidance invites comparison without implying text was removed.
