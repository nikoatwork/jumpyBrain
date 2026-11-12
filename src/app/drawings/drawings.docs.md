# Drawing operations

## Responsibilities

Expose canonical drawing file list/read/create/save/rename/delete to the local runtime and to server-memory under use-case names. Local and hosted hosts run the same operations against their own memory root.

`renameDrawingAndMentions` renames the file (authoritative, hash-checked), then rewrites mentions in each visible, uniquely identified note that contains one. Each note is a separate hash-checked canonical publication; optional `beforeNoteWrite`/`afterNoteWrite` hooks let a host settle and refresh live editing sessions. A note that cannot be written is reported in `mentions.failed` with its ID, title and error code; the rename is not rolled back. Callers serialize the whole operation in their write queue. `app/server-memory/drawings.ts` wraps it and marks the derived index stale when notes changed.

## Non-responsibilities

No CLI flags, HTTP routing, editor bundle, indexing or implicit shared write authorization. Renames do not update Markdown-link (`[x](drawings/…)`) or frontmatter mentions. Markdown stays canonical for memory; a drawing is a workspace file that notes may mention.
