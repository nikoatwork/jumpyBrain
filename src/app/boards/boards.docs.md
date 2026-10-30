# Board operations

## Responsibilities

Compose canonical board file CRUD and bounded status evidence for local runtime and server-memory. Resolve exact names or stable IDs, reject ambiguous names, and apply organization changes without modifying notes. Status reads fresh canonical note bodies with ID/hash and line provenance, explicit missing/omitted/truncated evidence and a final board-hash recheck. It never infers completion from arbitrary columns.

## Non-responsibilities

No CLI flags, HTTP routing, app-support store, automatic indexing, migration or implicit shared write authorization. Markdown is canonical for notes; JSON is canonical for board organization. No transactional snapshot across notes.
