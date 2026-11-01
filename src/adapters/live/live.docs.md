# Live RPC transport

## Responsibilities


`createLiveServer` attaches protocol 2 at `/ws` to an existing HTTP server. Authentication is the first JSON `hello` frame; tokens never enter URLs. Every request revalidates the credential, and an idle timer disconnects revoked sockets. Browser origins are exact-host checked unless the host supplies an explicit origin policy. Native clients may omit Origin.

Each connection has one ordered request queue, bounded frames, subscriptions, connection count and outgoing buffered bytes. Slow or oversized clients disconnect and must reopen from a canonical snapshot. No mutation is blindly replayed on reconnect. The hub atomically opens a subscription and snapshot, publishes before acknowledging, and keeps document policy independent from this adapter.

Requests are `{id,method,params}`, replies `{id,ok,result}` or `{id,ok:false,error:{code,message}}`. Document events contain `{event:"document",documentId,snapshot}`. See the application collaboration module for snapshot and edit contracts. Closing the adapter terminates its sockets; closing an app window does not stop its host backend.

## Non-responsibilities

This adapter does not parse Markdown, publish files, choose conflict policy, own service lifetime, or parse CLI commands. It delegates document operations to the collaboration application and keeps secrets out of URLs.

Incoming queued bytes are bounded independently from frame size (6 MiB per connection, 32 MiB aggregate by default), with at most 32 pending requests per connection. Outgoing buffered bytes are limited to6 MiB per connection. Resource gauges expose connection and queued byte counts. A write that would exceed the default serialized snapshot budget is rejected before publication by the hub.
