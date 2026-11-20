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

An exclusive hard link publishes an already complete lock candidate, so a killed writer leaves a recoverable PID/nonce rather than an empty lock. Confirmed dead locks are recovered under a generation-specific reaper guard. An interruption inside the short reaper critical section fails closed and requires operator inspection of that generation's guard; a second writer never guesses that an uncertain live owner is dead.

## Non-responsibilities

No HTTP routing, CLI parsing, per-note ACLs, canonical memory writes or verified author attribution. Local filesystem ownership remains more powerful than protocol roles. This operational state must survive index/cache rebuilds and upgrades.

## Management surfaces

The same store is reached by `jumpybrain access --root` on the host, and by admin principals through the HTTP `/access` routes used by `access --target-url`, the hosted browser dialog and desktop Settings. No surface records last use or expiry.
