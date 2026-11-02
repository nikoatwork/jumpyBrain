# Root-owned backend operations

## Responsibilities

Ensure or discover one authenticated service per canonical real root. The app and CLI can use identical builds from different installation paths. Readiness binds protocol, root hash, PID, instance nonce, build and executable digest; a busy port is never proof of identity. Concurrent callers may start competing candidates, but only the exclusive root lease winner may listen.

Explicit stop uses the registered private capability and verifies ownership before requesting drain. Cancelling a client's wait does not kill the shared backend. Status never returns its token. No memory root is initialized or retargeted during discovery.

Foreground serve claims the same root lease and publishes a private loopback control alias. Its identity names the compiled service runtime bootstrap, so a matching app/CLI can adopt that runtime regardless of the foreground command used to launch it. The detached daemon stops if its root disappears or ownership changes, keeping disposable brains bounded while preserving normal window-independent lifetime.

## Non-responsibilities

No CLI parsing, server route implementation, canonical memory policy, GUI lifetime or provider calls. A different-build live owner fails with update/stop guidance rather than spawning a competing writer.

Both foreground claims and detached daemons pin their runtime before serving.
`backendStatus(root, true)` additionally exposes a redacted historical descriptor
for explicit inventory when the process has stopped; its default packet is unchanged.
