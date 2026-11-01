# Canonical collaboration sessions

## Responsibilities

Compose bounded source policy with canonical reads, optimistic publication and separate derived-index maintenance. Serialized commands fork source state; only a confirmed canonical publication commits the new model and emits Saved. Snapshots expose exact header/body, relative provenance and hashes. Sessions/presence/history are bounded; idle sessions are evicted and reopening creates a new epoch.

Periodic bounded file observation detects raw updates without depending on watcher delivery. Stable changes enter the versioned model, while missing, unsafe or unstable sources pause editing and preserve recovery data. Private recovery is unique data, never an index/cache.

## Non-responsibilities

No sockets, HTTP status selection, credentials, CLI parsing or model providers. Hosts supply authentication and their shared write queue. Noncooperating raw writers can still race the last filesystem check; this is not filesystem compare-and-swap.

## Live contracts and budgets

Protocol 2 snapshots contain `prefix` plus `body`, the exact canonical content hash, epoch/revision, saved state and scoped presence. Public operation receipts expose identity and coordinates; inserts over 8 KiB use `snapshotOnly:true` and rely on the complete snapshot. Removed text remains private in bounded undo history. Source bytes (2 MiB by default), the actual escaped snapshot (3 MiB minus envelope reserve), per-session history 8 MiB, aggregate history 32 MiB and 16 open sessions are checked explicitly. Gauges are available from `resourceUsage()` without source contents or credentials.

Edits, actor-local undo/redo, title publication and sequenced agent chunks share canonical publication. A new actor edit clears that actor's redo stack. Overlapping undo/redo rejects safely. `stream.finish` closes a completed stream; `stream.cancel` stops further output while preserving already saved chunks. Repeated finish/cancel does not change a retired stream's state. Epoch changes, expired receipts/history, gaps and unsafe source changes require a fresh snapshot and reconciliation; clients retain unconfirmed drafts.
