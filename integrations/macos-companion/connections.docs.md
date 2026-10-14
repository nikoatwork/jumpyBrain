# Companion connection persistence

## Responsibilities

`connections.mjs` owns only companion profile metadata in a private support directory. Use `ConnectionStore.open({ directory, initialRoot?, credentials? })`; do not construct directly. `credentials` is an injected native Keychain seam with asynchronous `get(reference)`, `set(reference, key)`, and `delete(reference)`. No plaintext fallback exists.

- `snapshot()` returns a synchronous clone of `{ version: 1, revision, activeId, profiles }`; `get(id)` returns a cloned profile or `undefined`. Neither returns keys.
- `save({ id?, name, kind, root? , url?, key?, allowWrites? }, expectedRevision)` and `remove(id, expectedRevision)` require the current integer revision and return a snapshot. Supplying `id` updates an existing profile; callers cannot choose new IDs or credential references. Inputs must contain only the listed fields, not an entire persisted remote profile.
- `setActive(id)` serializes activation and returns a snapshot. Same-active selection is a no-op. Removing the active profile is refused; switch first.
- New local profiles allow writes by default; new remote profiles do not. An unchanged destination retains its existing permission when omitted; changing destination resets the default. Explicit `allowWrites: true` is target-specific approval, not authorization inferred from connectivity.

Profiles have UUID destination-identity IDs (a root/origin replacement allocates a new ID and updates the active ID when applicable, invalidating old browser links), trimmed names, `kind: local | remote`, `allowWrites`, and either an absolute `root` or normalized `url` plus opaque `credentialRef`. Remote URLs must be origins: HTTPS, or HTTP at literal `127.0.0.1`, `localhost`, or `[::1]`. A trailing slash/default port is normalized; paths, userinfo, query, fragment, backslashes, and alternate HTTP IP spellings are rejected. Local saves resolve real paths and require a regular, non-hardlinked `jumpybrain.json` marker, without reading/writing its contents. Duplicate destinations are refused.

First open exclusively seeds the configured local root as active (`Local brain`, revision 0), even if the root is missing. With no `initialRoot`, it creates an empty state; the first saved profile becomes active. Existing state ignores `initialRoot`, including invalid replacement values. Reload and activation never require a reachable root/server or unlocked Keychain; the last selected target remains selected offline. Other schema versions and malformed state fail closed, never trigger migration/default replacement.

Metadata lives in `connections.json`, mode `0600`, under a directory owned by the current user with mode `0700`. Missing directory components are created privately; existing unsafe permissions are not repaired. Storage components must not be symlinks or writable by other users (root-owned sticky temporary ancestors are allowed). Files must be regular, owned, and single-link. Canonicalize legitimate OS path aliases before opening, e.g. macOS `/var` temporary paths. JSON is bounded to 128 KiB, profiles to 64, names to 128 characters, paths to 4096, origins to 2048, and keys to 4096.

Mutations use a process-wide per-directory queue, compare the expected revision and persisted state, fsync an exclusive random private temporary file, and atomically rename at commit. Rename is authoritative; directory fsync is best effort so a post-commit fsync failure never causes deletion of a referenced credential. Multiple stale store instances fail with `REVISION_CONFLICT`; reopen to reload. Use the companion singleton for process ownership: this is not a cross-process lock or protection against a malicious process running as the same user. Power failure may lose the latest rename if directory fsync fails; valid schema is still required on restart.

New/changed keys receive new random Keychain references; old items are never overwritten. A changed remote URL requires key entry again rather than forwarding the old key to another host. Renaming an unchanged remote without a key checks its existing item. Keychain denial/unavailability yields `CREDENTIALS_UNAVAILABLE`; missing items yield `MISSING_CREDENTIAL`. Creating a remote without a key yields `MISSING_CREDENTIAL`. Failed sets/persistence attempt deletion of the new item. Successful commits delete superseded/removed items best effort. Denied cleanup or process death can leave an orphan item; no key or cleanup error is returned/logged, and no still-referenced old credential is deleted before commit. A native maintenance flow may reconcile prefixed orphan references separately.

Errors have static safe messages and a `code`; no filesystem/Keychain error cause is attached. Other useful codes: `INVALID_INPUT`, `INVALID_ROOT`, `INVALID_URL`, `DUPLICATE_DESTINATION`, `PROFILE_LIMIT`, `NOT_FOUND`, `ACTIVE_PROFILE`, `INVALID_STATE`, `UNSAFE_STORAGE`, `PERSISTENCE_FAILED`. Invalid files must be restored from a valid private backup explicitly; deleting the file to reseed is a deliberate recovery action, not automatic fallback.

## Non-responsibilities

No CLI/agent configuration, memory initialization/migration/indexing, connectivity checks, real Keychain implementation, browser/IPC authentication, server lifecycle, or all-tab save barrier. This low-level store does not authorize an activation or edit to an active profile's destination: orchestration must guard those actions through the same switch coordinator before committing. Do not expose credentials or unguarded `setActive` to browser callers.

Run disposable filesystem/fake-Keychain coverage with:

```sh
node --test test/macos-companion-connections.test.js
```
