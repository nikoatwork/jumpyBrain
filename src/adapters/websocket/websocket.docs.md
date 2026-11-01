# Shared WebSocket transport

## Responsibilities

Expose the third-party `ws` transport to the CLI, live RPC adapter and native gateway without coupling clients to server policy. The build bundles this module once as `dist/adapters/websocket/index.js`, with its matching declaration and `ws-LICENSE.txt`. Packaged desktop runtimes use the same JavaScript implementation without installing root dependencies or optional native accelerators.

## Non-responsibilities

No application, document, authentication, origin, retry, stream, lifecycle or backend-ownership policy. Those remain with the calling boundary and application use cases. Source imports in this module are restricted to the external `ws` library.
