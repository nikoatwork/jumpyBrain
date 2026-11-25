# Backend access control

## Responsibilities

Persist separately revocable, named reader/writer/admin credentials as hashes in private operational access.json. Authenticate against freshly read state so another process's revocation takes effect. Explicit host bootstrap keys are operator capabilities; they are not inferred human identities and remain usable for administrative recovery when root/access state is unavailable. Root resolution is lazy so constructing a host does not create an unhandled filesystem rejection. Issue returns the secret once; lists and persisted state contain no raw tokens.

Roles are three fixed, named capability sets; there are no custom roles and no per-credential overrides:

| Role | Capabilities |
| --- | --- |
| `reader` | `read` |
| `writer` | `read`, `write` |
| `admin` | `read`, `write`, `manage_access` |

`ROLE_CAPABILITIES`, `roleCapabilities(role)` and `hasCapability(principal, capability)` are the single definition, used by the HTTP server for enforcement and published in `GET /capabilities`. An unknown or missing role has no capabilities. `read` covers every observational route; `write` every mutation of notes, boards, drawings, files, attention and the index; `manage_access` listing, issuing and revoking keys. Private `/_backend/` operation still requires the `admin` role itself.

Serialize cooperating mutations and atomically publish fsynced private state. Malformed, unsupported, public-permission, symlinked or oversized state fails closed. A nonpersistent change observer lets hosts invalidate idle sessions; every operation still authenticates current state.

`state-files.ts` holds the shared private-state helpers (`withPrivateStateLock`, `publishPrivateState`, `privateStateDirectory`) used by both stores. An exclusive hard link publishes an already complete lock candidate, so a killed writer leaves a recoverable PID/nonce rather than an empty lock. Confirmed dead locks are recovered under a generation-specific reaper guard. An interruption inside the short reaper critical section fails closed and requires operator inspection of that generation's guard; a second writer never guesses that an uncertain live owner is dead.

## Browser sessions and invites

`sessions.ts` (`BrowserSessionStore`) persists hosted-browser sign-in in private `.jumpybrain/sessions.json` with its own lock: per session the SHA-256 of an opaque `jbs_` secret, the key ID, role, a short device label and created/last-used times; per invite only the hash of a single-use `jbi_` code, its key ID and a 7-day expiry. Raw secrets are returned once and never stored. A session authorizes nothing by itself: hosts resolve it and then call `AccessStore.authenticateId(keyId)`, which re-reads `access.json` (or matches a bootstrap/owner key), so revocation ends sessions immediately. Last use is written at most once a day (`SESSION_RENEW_MS`); a session unused for `SESSION_INACTIVITY_MS` (400 days, the cookie lifetime) ends; there is no other cap. Redeeming an invite deletes it and re-checks the key inside the same locked change. At the session limit, sessions of keys that no longer authenticate (for example revoked on the host) give way first. Writes prune inactive sessions and expired invites and are skipped when nothing changed; unknown or spent codes are refused on the read path. The store is bounded: 32 sessions per key (that key's least recently used goes first, never another key's), 4096 in all (`session_limit`), 1024 open invites. Reads reuse a parse while the file's inode/size/mtime are unchanged. Malformed, public-permission or symlinked state fails closed. `test/browser-session.test.js` covers it with an injected clock.

Owner decisions 2026-11-25: sessions last as long as browsers allow and renew on use; invite links are single-use, expire after 7 days and are tied to one personal key (one key per person, no shared multi-reader links).

Threats and answers:

- **Stolen cookie.** It carries a session, not the key: it cannot be used as a bearer key, sign-out or admin sign-out ends it server-side, and revoking the key ends it. Until then it works for up to 400 days of use, as any long-lived session would. HttpOnly keeps it from page scripts.
- **Forwarded invite link.** Whoever opens it first in a browser that is not signed in gets a session for that key (a signed-in browser never switches identity from a link); it works once and for 7 days. The admin sees the extra browser under the key and can sign it out or revoke the key. Send links privately.
- **Lost device.** An admin uses **Sign out** on that browser, **Sign out everywhere** for the key, or revokes the key.
- **Revoked key.** Every HTTP request and live-socket revalidation re-reads the key, so its sessions and sockets end at once; revoke also deletes its sessions and open invites.

## Non-responsibilities

No HTTP routing, CLI parsing, per-note ACLs, canonical memory writes or verified author attribution. Local filesystem ownership remains more powerful than protocol roles. This operational state must survive index/cache rebuilds and upgrades.

## Management surfaces

The same store is reached by `jumpybrain access --root` on the host, and by admin principals through the HTTP `/access` routes used by `access --target-url`, the hosted browser dialog and desktop Settings. Keys never expire and record no last use; browser sessions record last use (at most daily) for the admin session list.
