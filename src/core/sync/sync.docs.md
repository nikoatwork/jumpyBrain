# Brain comparison

## Responsibilities

Pure comparison of two canonical inventories, a local root and a shared server (`compareInventories`), and the local → server migration plan (`planRemoteMigration`).

- Notes match by memory ID; a path match is used only when neither note has a usable ID, so a different note at the same path stays separate. A matched note with different paths is reported as `moved`.
- Status: `same` (identical bytes), `metadata` (identical body after the frontmatter), `local-newer` / `remote-newer` (bodies differ and declared edit dates order them), `differs` (bodies differ without an order), `local-only`, `remote-only`. Only declared `updated_at` (else creation date) orders notes; file times are not trusted across machines or checkouts.
- Drawings match by name and compare by parsed scene, so compact versus pretty JSON is not a difference. Differing drawings are `differs`: they have no declared edit date.
- The plan copies notes and drawings missing on the server, and pushes local note edits that are newer than the server's, guarded by the server's content hash. It skips everything else with a reason: remote-only, remote-newer, unordered, notes without an ID, and paths the server already uses for another note. It never deletes or moves.

## Non-responsibilities

No I/O, HTTP, CLI flags or writes. Collecting inventories and applying the plan belong to `app/sync`.
