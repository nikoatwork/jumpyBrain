# Canonical collaboration sessions

## Responsibilities

Compose bounded source policy with canonical reads, optimistic publication and separate derived-index maintenance. Serialized commands fork source state; only a confirmed canonical publication commits the new model and emits Saved. Snapshots expose exact header/body, relative provenance and hashes. Sessions/presence/history are bounded; idle sessions are evicted and reopening creates a new epoch.

Periodic bounded file observation detects raw updates without depending on watcher delivery. Stable changes enter the versioned model, while missing, unsafe or unstable sources pause editing and preserve recovery data. Private recovery is unique data, never an index/cache.

## Non-responsibilities

No sockets, HTTP status selection, credentials, CLI parsing or model providers. Hosts supply authentication and their shared write queue. Noncooperating raw writers can still race the last filesystem check; this is not filesystem compare-and-swap.

## Live contracts and budgets

Protocol 2 snapshots contain `prefix` plus `body`, the exact canonical content hash, epoch/revision, saved state and scoped presence. Public operation receipts expose identity and coordinates; inserts over 8 KiB use `snapshotOnly:true` and rely on the complete snapshot. Removed text remains private in bounded undo history. Source bytes (2 MiB by default), the actual escaped snapshot (3 MiB minus envelope reserve), per-session history 8 MiB, aggregate history 32 MiB and 16 open sessions are checked explicitly. Gauges are available from `resourceUsage()` without source contents or credentials.

Edits, actor-local undo/redo, title publication and sequenced agent chunks share canonical publication. A new actor edit clears that actor's redo stack. Overlapping undo/redo rejects safely. `stream.finish` closes a completed stream; `stream.cancel` stops further output while preserving already saved chunks. Repeated finish/cancel does not change a retired stream's state. Epoch changes, expired receipts/history, gaps and unsafe source changes require a fresh snapshot and reconciliation; clients retain unconfirmed drafts.

## Stream leases and abandoned producers

An active stream has a 60-second inactivity lease. Successful start, chunk and status operations renew it; unrelated document presence does not. The periodic observer expires leases even when another human keeps the session open. Expiry retires the stream with `state: cancelled` and `reason: lease_expired`, releases its active slot, retains acknowledged Markdown and rejects late chunks. A transient disconnect can reconnect with the same authenticated principal/client/stream identity to inspect or continue the stream within that lease. Credentials that are revoked or downgraded retire their principal's active streams at the next authorization validation. Already admitted canonical publication is allowed to drain.

The shipped streaming CLI sends a status heartbeat every 15 seconds, with at most one outstanding heartbeat. SIGINT/SIGTERM, connection loss, or an owner-scoped status detecting cancellation/heartbeat failure stop stdin consumption. Terminal events from another actor cannot stop a producer that happens to use the same stream ID. The CLI attempts cancellation for at most two seconds before terminating its transport; interrupted/unconfirmed output is never reported as finished. Operators can inspect or cancel with `collaborate status|cancel --id … --client-id … --stream-id … --json`. Only an explicit successful EOF/finish marks completion.

## Destructive external replacements

Raw file writes carry no read token. Before accepting an observed body or frontmatter replacement/deletion, retain both the previous acknowledged canonical bytes (`base.md`) and the raw file (`external.md`) in private durable recovery. Then adopt the raw state without resurrecting text. The snapshot exposes `recovery.directory` relative to the brain and `recovery.code: external_destructive_replacement` for operator inspection. Pure insertions (including metadata additions), unchanged observations and the live publisher's own echoes do not create copies.

Recovery directories use the before/after content hashes. A completed identical transition is verified and reused across observations/restarts; unique recovery data has no automatic eviction. New copies are written and fsynced in a unique `.pending` directory before publishing the final directory by rename. Interrupted `.pending` recovery directories must be included in backups and inspected rather than treated as disposable cache. An external writer can overwrite bytes before the observer runs; this protects observed prior state and does not make arbitrary external filesystem writes transactional.
