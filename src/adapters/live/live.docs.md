# Live RPC transport

## Responsibilities


`createLiveServer` attaches protocol 2 at `/ws` to an existing HTTP server. Authentication is the first JSON `hello` frame; tokens never enter URLs. Every request revalidates the credential, and an idle timer disconnects revoked sockets. Browser origins are exact-host checked unless the host supplies an explicit origin policy. Native clients may omit Origin.

Each connection has one ordered request queue, bounded frames, subscriptions, connection count and outgoing buffered bytes. Slow or oversized clients disconnect and must reopen from a canonical snapshot. No mutation is blindly replayed on reconnect. The hub atomically opens a subscription and snapshot, publishes before acknowledging, and keeps document policy independent from this adapter.

The shared third-party implementation lives in `../websocket/`; this module owns live protocol policy. The CLI and native gateway consume that transport directly and do not import this server adapter for library access.

Requests are `{id,method,params}`, replies `{id,ok,result}` or `{id,ok:false,error:{code,message}}`. Document events contain `{event:"document",documentId,snapshot}`. See the application collaboration module for snapshot and edit contracts. Closing the adapter terminates its sockets; closing an app window does not stop its host backend.

## Non-responsibilities

This adapter does not parse Markdown, publish files, choose conflict policy, own service lifetime, or parse CLI commands. It delegates document operations to the collaboration application and keeps secrets out of URLs.

Incoming queued bytes are bounded independently from frame size (6 MiB per connection, 32 MiB aggregate by default), with at most 32 pending requests per connection. Outgoing buffered bytes are limited to6 MiB per connection. Resource gauges expose connection and queued byte counts. A write that would exceed the default serialized snapshot budget is rejected before publication by the hub.

When a fresh credential check detects revocation or a writer downgrade, the adapter closes that connection and asks the hub to retire that principal's streams. A normal network disconnect preserves streams only within the hub's bounded inactivity lease. The CLI and native adapters must keep stdin/producer lifetimes tied to transport and heartbeat failures; socket closure alone is not cancellation.

An observed lease expiry or principal retirement sends the ordinary document
snapshot once, followed by small `{event:"stream",documentId,epoch,saved,stream}`
notices to that document's authenticated subscribers. The stream descriptor is
public identity/state only, never source, offsets or private drafts. Multiple
retirements use multiple bounded metadata frames, not repeated whole-note
snapshots. Existing frame, outgoing-buffer and subscription authorization
budgets remain in force. Older clients may ignore this additive event.
