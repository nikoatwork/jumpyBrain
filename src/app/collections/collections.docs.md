# Personal collections

## Responsibilities

Validate the small board contract: stable board identity, name, archived flag, three named ordered columns and unique canonical page IDs within each board. One page may belong to several boards. Limits: 100 boards per scope, 100 pages per column, 100-character names. No note titles or content are persisted here.

`operations.ts` owns exact ID/name resolution (ambiguous names fail), revision-checked board changes and a bounded observational status packet. A host-supplied reader returns fresh canonical documents; status keeps source IDs/hashes/whole-line citations and explicit unavailable, omitted and truncated evidence. It never interprets arbitrary columns as completion. The CLI composes this through the explicit `runtime/boards.ts` seam, supplying the existing companion transport.

## Non-responsibilities

No Markdown changes, canonical note status, query engine, indexing, shared boards, remote writes or CLI parsing. Collections are durable personal application organization, not rebuildable memory state.
