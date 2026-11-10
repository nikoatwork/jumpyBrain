# Drawing operations

## Responsibilities

Expose canonical drawing file list/read/create/save/rename/delete to the local runtime and to server-memory under use-case names. Local and hosted hosts run the same operations against their own memory root.

## Non-responsibilities

No CLI flags, HTTP routing, editor bundle, indexing or implicit shared write authorization. Markdown stays canonical for memory; a drawing is a workspace file that notes may mention.
