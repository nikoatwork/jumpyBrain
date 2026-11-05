# Shared backends and live editing

The app, CLI and agents share one backend for each brain directory. Markdown is
the saved document; a WebSocket session holds bounded, rebuildable edit history.
The local backend starts on demand without opening a window. Closing a window
keeps it available. `jumpybrain backend stop --root /path/to/brain` explicitly
drains it. Starting `serve` requires stopping an existing owner first.

## Local and hosted use

Ordinary local commands retain their existing output and indexing behavior.
Canonical mutations and repairing retrieval use the shared backend. Pure
inspection, expansion, Dream windows, migration previews and strict read-only
retrieval remain observational and need no daemon. A first import into a new
directory can bootstrap its files before a service exists. The library runtime
remains an engine for explicit embedding; independent library/filesystem writers
are observed external inputs, rather than a second registered backend.

The desktop gateway joins the same local owner. It keeps brain credentials in
the native credential boundary and pins every live operation to the selected
brain and tab generation. A failed or unconfirmed save blocks switching brains,
changing an active connection, navigation and quitting. An upstream disconnect
with outstanding admissions may require reopening the app after retaining drafts;
the gateway refuses to guess whether those writes completed.

For a VPS, run `jumpybrain serve --root /srv/brain --host 127.0.0.1 --port 3787`
with the operator key supplied through the existing server configuration. Use a
TLS reverse proxy for remote access, including WebSocket upgrade at `/ws`.
Preserve the public `Host` and set `X-Forwarded-Proto: https`; forward Upgrade and
Connection headers and use an idle timeout appropriate for persistent sessions.
HTTPS/WSS must use the same browser origin. The backend and foreground server
share the same root lease; a local CLI can join a compatible foreground host.

## Separate access

The machine operator issues and revokes credentials:

```sh
jumpybrain access issue --root /srv/brain --name Alice --role writer --json
jumpybrain access issue --root /srv/brain --name Research-agent --role writer --json
jumpybrain access issue --root /srv/brain --name Reviewer --role reader --json
jumpybrain access list --root /srv/brain --json
jumpybrain access revoke --root /srv/brain --id CREDENTIAL_ID --json
```

Issuance prints a secret once. Give each person and agent their own credential.
Readers cannot publish documents or streams. Revocation is checked on every
request/frame and while a socket is idle. There are no per-note permissions.
Configured bootstrap keys and private local-owner credentials are administrative
capabilities, including local backend RPC; distribute reader/writer credentials
to ordinary collaborators instead.

Hosted browser authentication uses a brain-scoped HttpOnly, SameSite=Strict cookie
with a 24-hour lifetime. The key is removed from the URL after entry and is not
stored in JavaScript storage. Credential revocation applies to the cookie too.
Cookie-authenticated mutations require the exact browser origin. Disconnect
clears this browser's cookie. The desktop continues to use its gateway session
and native credential storage.

## Streaming agents

```sh
# Use a stable ID for this agent's undo history across invocations.
export JUMPYBRAIN_CLIENT_ID=research-agent
jumpybrain collaborate open --root /path/to/brain --id NOTE_ID --json
generate-markdown | jumpybrain collaborate stream --root /path/to/brain --id NOTE_ID --json
jumpybrain collaborate undo --root /path/to/brain --id NOTE_ID --json
```

For a hosted brain, replace `--root` with `--target-url https://brain.example`
and provide that agent's `JUMPYBRAIN_API_KEY`. `--client-id` overrides the
environment setting. Without either, each invocation gets a fresh identity,
returned in its result. UTF-8 input is decoded incrementally and sent as bounded
source operations with backpressure; changes reach Markdown before input ends.
Successful EOF finishes the stream. A lost reply is never blindly retried.

`collaborate edit --start OFFSET --delete COUNT --epoch READ_EPOCH
--base-revision READ_REVISION` reads an insertion from stdin. First use
`collaborate open --json`, calculate UTF-16 offsets against that returned body,
and pass its epoch/revision to the write. The backend transforms the edit from
that actual read state or rejects an expired/overlapping base; a new internal
open never reassigns old offsets to newer text. A positioned
`stream --start OFFSET` requires the same read flags. A stream without `--start`
explicitly appends to the latest saved document; `--delete` belongs to `edit`.
`watch` subscribes to confirmed snapshots;
`undo` affects that principal/client's edits, preserving other writers. `resync`
is an explicit return to current saved state. `status|cancel|finish --stream-id STREAM_ID` controls a stream owned by the same
credential and client ID. Supply `stream --stream-id STREAM_ID` when another
invocation must control it; stopping a stream retains already committed output.
Cancellation does not undo another writer or claim that partial output completed.

An active stream has a 60-second inactivity lease. The CLI checks its status
every 15 seconds while waiting for generated input, keeping a connected producer
alive during pauses. A disconnected or dead producer eventually releases its
stream capacity; revoked access retires it immediately. Expiry and interruption
retain confirmed chunks. Inspect the note and stream status before continuing
after a lost connection.

## Drafts, conflicts and files

Connected edits are shown as Saved only after the canonical publisher confirms
them. Indexing is separate and can remain pending or fail without losing a saved
note. Local service maintenance begins after a write or explicit app attachment;
status/doctor do not start inference. Derived index work does not block the canonical edit queue.

Disconnected typing stays a private browser draft until reconnecting. Drafts are
scoped to brain, principal, document and tab, and include pending titles and
uncertain publication state. Reload preserves them when browser storage is
available; a new page offers older tab drafts for explicit recovery. Recovery shows saved and draft versions, allows copying, and requires
an explicit choice before publishing uncertain work. A changed comparison hash
requires another review. Older tab drafts are selectable in recovery. Older tab recovery records remain available in that browser profile, including
after copying one into a new tab. Browser storage is not encrypted independently of the browser profile; clearing site data
removes private drafts. Storage denial/quota failures are visible and require
keeping the window open or copying the draft.

Selecting an older recovery version first preserves a unique current draft,
including its title and uncertain publication information. Both versions remain
available for review. If storage cannot retain the current version, selection
fails visibly and leaves it in place.

Direct `.md` writes remain supported. Stable observed changes enter the same
source model; safe disjoint edits can merge. Overlaps, unstable/partial files,
invalid identities, unsafe files and deletion retain recovery information and
stop unsafe publication. Rename lookup follows a unique ID. No portable watcher
or filesystem rename provides compare-and-swap against an arbitrary external
writer: unobserved overwrite windows cannot be reconstructed. Keep normal
backups/Git history and prefer collaborative writes for active notes.

An observed replacement that removes saved source retains the previous and
observed canonical versions under `.jumpybrain/recovery/`; a live snapshot names
that relative recovery directory. The raw file remains authoritative. Retention
does not infer whether its writer intended to remove another person's changes.
Saved external edits need no version-review acknowledgement. **More info →
Earlier versions** offers optional history. It shows added/removed passages with
**Keep current note** and **Use earlier version**; full copies, copy tools and
version selection stay under **More options**. A successful choice returns to
the note. Restoration rechecks the saved hash and preserves any private draft
first. Readers can see changes and copy, while changing brains or credentials
clears the comparison.

When an external edit makes only a clean saved note's caret position ambiguous,
the note still updates; that caret clears and the editor waits for a fresh click.
Unpublished or unconfirmed edits retain their separate draft-recovery safeguards.

## Limits and recovery

Default limits are 2 MiB canonical source per live note, 16 active note sessions,
64 sockets per host, 3 MiB JSON frames, 6 MiB outgoing buffered data per socket,
6 MiB incoming queued data per socket, and 32 MiB combined queued payloads and
32 MiB combined retained source history. Escaped JSON or metadata can reduce the
effective note limit; admission rejects oversized publication before writing.
Live identity discovery is bounded to 10,000 filesystem entries and 64 KiB
metadata headers. Larger existing notes remain files and retain ordinary engine
operations. Slow consumers reconnect from saved snapshots; expired history,
overlapping transformations and restart epochs require resynchronization.

Source-preserving reconciliation retains unaffected editor nodes and selections.
Presence is scoped to the authenticated note session. Carets/selections are
projected only where the source spelling maps unambiguously to rendered text;
unsupported inline formatting keeps awareness without a guessed cursor. IME
preedit is deferred until composition completes. Undo/redo is actor-specific.

Each live note retains at most 64 Undo/Redo owners, independently of the 128
recent source operations used for revision transforms. Retention prefers editors
with live writer connections, presence or streams, then retires the least recently
used history; even an all-active cache remains finite and admits new edits.
Disconnecting does not immediately discard recent history: a stable client ID can
reconnect and Undo while its history remains cached. Retirement never removes
saved Markdown or prevents new people/agents from editing. Expired Undo/Redo
returns `history_expired`; the app shows a notice and allows continued editing.
Resync reads current saved source; it cannot recreate retired Undo history.

`.jumpybrain/access.json`, `.jumpybrain/recovery/` and browser drafts are unique
operational data. Back them up; do not delete all of `.jumpybrain` as cache.
Backend leases/descriptors are private coordination state. A malformed lease or
an interrupted stale-owner cleanup can fail closed and require operator
inspection; never kill/adopt a process based on a port or stale PID alone.
See the README coordinated upgrade procedure before replacing the app/runtime.

Protocol 2 is a coordinated client upgrade. It rejects obsolete WebSocket
handshakes; it does not emulate mixed client generations. The T3 inspiration is
server ownership, scoped contracts, subscriptions and lifecycle, not MCP as the
browser transport or an event database replacing Markdown.

### Client display names

Use `jumpybrain identity --name 'Alex'` (also configurable in Mac onboarding/Settings) and set `JUMPYBRAIN_CLIENT_NAME=Codex` in the agent host to label future CLI collaboration writes `Alex · Codex`. Browser live saves use the configured human display name. Validated `declaredActor` values describe provenance and presence only; authenticated principals and client IDs continue to control authorization, Undo, drafts and streams. Older servers/clients must be upgraded to support these declarations. This does not retain block-level attribution history.

In a connected open note, an observed generation shows a quiet **Generation
finished**, **Generation stopped** or **Generation interrupted** cue when its
corresponding confirmed terminal event arrives. This describes the stream, not
whether an agent completed its broader task. It does not move focus or announce
work in other notes. A lost connection or disappearing presence is not a finish;
missed/historical events are not replayed when reopening. Older servers without
stream actor identity retain active presence without an inferred outcome cue.
