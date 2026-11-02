# Changes

- Edit notes live with other people and streaming agents, with named cursors, selections and editor-specific Undo/Redo.
- The app and CLI share one on-demand backend per local brain; VPS collaborators can use separately revocable reader/writer credentials.
- Recover disconnected drafts explicitly, and review retained versions after observed conflicting file edits.
- Upgrade app, CLI, server and agent integrations together using the [backup and verification guide](https://github.com/nikoatwork/jumpyBrain/blob/v0.3.17/README.md#upgrade-with-your-agent). This changes the live protocol; existing Markdown needs no conversion.
- Folders supports right-click rename, copy link and guarded deletion, new empty folders, and drag-and-drop moves with a keyboard Move to option.
- Search hides the page you are viewing. Page actions can copy a local file path and show board memberships, with compact Add to board and More info controls.
- Sidebar toolbar actions use compact icons; Home keeps a border while active.
