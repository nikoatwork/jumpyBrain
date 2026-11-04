# Changes

- Read-only notes hide writing invitations, including in manual-copy recovery; denied note creation explains when write access is needed.

- Abandoned generation now reports its confirmed interruption after lease expiry without requiring a status lookup; already saved output stays intact.

- Escape closes the focused formatting controls even while the editor selection remains highlighted.

- Search warnings stay with Search/graph and no longer obscure later note confirmations; uncertain freshness no longer claims all search is unavailable.

- Invalid search/recall depth options explain the allowed choices before engine setup or remote connection errors.

- A connected note quietly distinguishes confirmed generation finish, stop and interruption, without treating lost presence as completion.

- Keeping the current note after comparing retained versions quiets that notice for this tab; earlier versions stay accessible.

- If live editing cannot connect, loaded saved notes stay readable with a clear editing retry; connection status is consistent for screen readers.

- Opening notes and saving your own changes avoid false external-update notices; rapid peer edits keep their latest notice visible, and retained-version guidance invites comparison without implying text was removed.

- Unsuccessful @ page linking dismisses when you resume typing; smaller checkboxes support Tab/Shift+Tab nesting and preserve child tasks.

- Installers now prune superseded owned software automatically, share rollback references, protect live/recovery copies and provide a storage preview with retry guidance.
- Markdown links now show clickable labels in the editor and open in your browser, with preserved Markdown, editing and undo.

- Agents can list, settle, snooze and bring back notes through the CLI; the sidebar avoids repeated preview loads and gives Mac window controls more breathing room.
- Feedback can close with Escape while sending and retains its text through reconnects; backend health keeps the executing version and support logs distinguish editor recovery causes.
- Optional semantic setup verifies one portable local model; app/status/doctor explain readiness, and Mac ARM64 indexing uses a smaller embedding context pool.
- Mac updates can use verified release-built native helpers, avoiding Swift compilation on the supported current-worker path while retaining fallback and rollback.
