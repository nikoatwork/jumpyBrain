# Brain comparison and migration

## Responsibilities

Collect a brain's inventory through an `InventorySource` (canonical file listing with content/body hashes and declared edit dates, plus drawings read once each for their scene), compare two sources with `core/sync`, and apply a local → server migration plan through a `MigrationTarget`.

- `localInventorySource(root)` reuses the server-memory file listing over a local root, so local and hosted listings hash identically.
- `applyRemoteMigration` re-reads each local note or drawing and skips it if it changed since planning. Server writes carry the planned `If-Match` (updates) or are exact no-clobber copies (`copy-in`, drawing create), so concurrent server changes are refused rather than overwritten. A 401/403 stops the run; other failures are reported per action. Nothing is retried.

## Non-responsibilities

No transport, credentials, CLI presentation or read-only policy (the CLI's `diff` and `migrate remote` own those). Never writes the local root, deletes server notes, merges bodies or reindexes; the server marks its index stale after copies.
