# Escape stays with the focused UI

Increment of the [four-hour UX loop](../todo/tasks-ux-four-hour-loop.md), authorized 2026-11-04.

- [x] Reproduce real toolbar failure with preserved editor selection: document-capture attribution handler already prevented Escape before the toolbar could close.
- [x] Restrict the passive attribution hint's Escape ownership to the editor body and avoid consuming composition Escape.
- [x] Verify toolbar close/focus return, editor dismissal, composition/find/search ownership and unchanged canonical text at 1280/390px.
- [x] Run contextual-attribution and writing-workspace neighbors.
- [x] Record evidence, limits, archive and commit.

Before-fix targeted browser probe fails “toolbar Escape owns its close despite a preserved editor selection.” Existing full writing probe caught the same failure after its own outdated confirmation/fault-injection assumptions were repaired. Proposed effect and protected neighbors were recorded before source edit. Native Mac/physical IME scoring remains not observed.

Outcome: keep. Six targeted desktop/mobile cases passed, plus the contextual-attribution journey and the full writing-workspace journey on the combined candidate with search-warning scoping. The editor/toolbar/find/search checks leave canonical bytes unchanged; the full neighbor checks formatting/Undo, actual reference/Back/search navigation, reviewed-save recovery, private draft copy, read-only and 1280/1180/900/390/320px layouts plus 18 expanded palettes. Main production editor: 223,043 gzip bytes for the combined candidate, below the reviewed 223,250 ceiling. Native/physical IME evidence remains unobserved.
