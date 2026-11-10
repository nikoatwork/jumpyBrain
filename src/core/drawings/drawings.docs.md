# Canonical drawing files

## Responsibilities

Own `drawings/<Name>.excalidraw` persistence at the canonical memory root, independent of retrieval `indexRoot`. A drawing's name is its filename: 1–100 characters without control characters, slashes, brackets, colons, `#` or `|`, and no leading or trailing dot or space, so `[[Name.excalidraw]]` is always a safe mention. Files stay standard Excalidraw JSON and remain openable in other Excalidraw tools. Only the portable envelope is validated (`type: "excalidraw"`, an `elements` list, optional object `appState`/`files`); element semantics belong to the editor. Limits are 4 MiB per file and 1000 listed drawings.

Listing reads file metadata only and counts unsupported entries as `skipped` without repairing or removing them. Reads refuse links and nonregular or oversized files and never create directories. Writes share an exclusive `drawings/.write.lock`; a lock whose recorded process no longer exists on this machine is replaced so an autosaving editor is not blocked by a crash. Save, rename and delete require the hash of the prior exact file bytes; creation refuses an existing name. Publication fsyncs a private temporary file and atomically renames it. Rename never overwrites another drawing; a case-only rename addresses the same file on case-insensitive volumes.

## Non-responsibilities

No indexing, search, note-content writes, rendering or Markdown conversion. Drawings are human workspace files beside canonical Markdown memory, not recallable memory: agents read meaning from the notes that mention them. No merge of concurrent edits and no hostile-filesystem guarantee: external writers that ignore the lock can still race publication, and are detected only by the next hash-checked write.
