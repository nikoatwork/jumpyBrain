# Live updates over WebSockets

Stack: `/ws` carries JSON RPC protocol 2 over WebSockets. Node hosts and CLI
clients use the shared [`ws` adapter](../websocket/websocket.docs.md); the editor
uses the browser's native `WebSocket`. Start with the
[architecture map](../../architecture.docs.md#find-a-subsystem) for adjacent owners.

For transport/editor changes, [select the matching WebSocket failure/recovery checks](../../../docs/testing.md#live-editing-and-websocket-scenarios).

## Responsibilities


`createLiveServer` attaches protocol 2 at `/ws` to an existing HTTP server. Authentication is the first JSON `hello` frame; tokens never enter URLs. Every request revalidates the credential, and an idle timer disconnects revoked sockets. Browser origins are exact-host checked unless the host supplies an explicit origin policy. Native clients may omit Origin.

Each connection has one ordered request queue, bounded frames, subscriptions, connection count and outgoing buffered bytes. Slow or oversized clients disconnect and must reopen from a canonical snapshot. No mutation is blindly replayed on reconnect. The hub atomically opens a subscription and snapshot, publishes before acknowledging, and keeps document policy independent from this adapter.

The shared third-party implementation lives in `../websocket/`; this module owns live protocol policy. The CLI and native gateway consume that transport directly and do not import this server adapter for library access.

Requests are `{id,method,params}`, replies `{id,ok,result}` or `{id,ok:false,error:{code,message}}`. Document events contain `{event:"document",documentId,snapshot}`. See the application collaboration module for snapshot and edit contracts. Closing the adapter terminates its sockets; closing an app window does not stop its host backend.

## Editor connection lifecycle

The existing [editor client supervisor](../http-server/collaboration-client.ts)
owns these explicit states; they describe connectivity separately from save,
draft, permission and agent-stream state.

| State | Entry and next transition |
| --- | --- |
| `offline` | Initial state or transient connection loss. With listeners, a connection attempt enters `connecting`; retries use bounded exponential backoff with jitter. Unconfirmed requests reject. |
| `connecting` | Open the socket and authenticate with `hello`. A valid protocol/principal/brain response enters `ready`; transient failure returns to `offline`; denied access, incompatible protocol or changed brain enters `blocked`. |
| `ready` | Authenticated RPC and scoped document/stream events may flow. Socket loss returns to `offline`; policy or document-size closure enters `blocked`. |
| `blocked` | Automatic reconnect stops. The caller must resolve access, compatibility, destination or size before establishing a new session. |
| `closed` | Last listener removed: cancel retries, reject pending requests and close the socket. This supervisor is retired. |

Reconnect never blindly replays a mutation. The
[editor binding](../http-server/browser.docs.md) reconciles private drafts with
canonical snapshots before publication; the
[collaboration app](../../app/collaboration/collaboration.docs.md) owns confirmed
publication and agent stream finish/cancel/expiry. The
[desktop bridge](../../../integrations/macos-companion/gateway.docs.md#shared-root-owners-and-websockets)
adds profile/tab/generation admission. The CLI has its own producer lifecycle in
[`collaborate.ts`](../../cli/collaborate.ts).

For UX evaluation, use the [observable state model](../../../evals/workspace-experience/state-model.md)
and [missions](../../../evals/workspace-experience/journeys/core.md): socket readiness,
canonical save and confirmed agent completion need separate evidence. This
connection table documents the implementation; it does not establish eval coverage.

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
