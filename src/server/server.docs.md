# Server module docs

## Responsibilities

- Compose server-local memory operations, including remote dream state/batch workflows, through the `src/app/server-memory/` use-case seam against one configured Markdown memory root.
- Re-export the HTTP server adapter and server-memory helpers for compatibility while keeping route parsing/auth implementation under `src/adapters/http-server/`.
- Preserve remote JSON shapes and avoid leaking server filesystem paths to remote clients.

Server config accepts `searchTimeoutMs`/`indexTimeoutMs`, also read from `JUMPYBRAIN_SEARCH_TIMEOUT_MS`/`JUMPYBRAIN_INDEX_TIMEOUT_MS`; validation occurs at bootstrap. HTTP close propagates cancellation to its own app work and index runner. Admission and child lifecycle stay in the QMD adapter, not server protocol code.

## Non-responsibilities

- Do not import CLI command parsing or CLI helper modules.
- Do not implement HTTP routes directly in the server boundary when the HTTP server adapter can own protocol details.
- Do not require users to start a server manually; local CLI/app entry points start a shared headless owner on demand.
- Do not add dreaming schedulers, AI provider configuration, or server-side model calls; remote dreaming is a CLI/local-agent workflow over server-tracked batches.

## Owned headless lifetime

`daemon.ts` starts a detached, discoverable loopback root owner for local app/CLI
use. Foreground `serve` claims the same root lease before binding; compatible
local clients join that host. Readiness proves nonce/root/build/runtime identity.
Window closure does not stop the owner; explicit shutdown drains work. Missing
roots/lost leases stop detached fixture owners. Lazy maintenance starts after
writes and retains canonical Saved separately from indexing.

### Detached owner watchdog

A detached owner must never outlive its ownership. On 2026-11-25 a v0.3.27 daemon
recorded its shutdown and released its lease during an `upgradeOlder` handoff,
then stayed alive without a listener for hours; any handle left after the drain
(timer, socket, child, pending I/O) keeps Node running and its runtime
generation pinned. `serveDetachedBackend` therefore always exits explicitly
once `runBackendDaemon` returns or fails, logging the resource types that would
have kept it alive. `BACKEND_DAEMON_TIMINGS` bound the rest:

| State | Action |
| --- | --- |
| Lost the startup race | Exit at once (no lease, nothing served). |
| Lease held, not ready within `startupMs` (30 s) | Stop; forced exit after `graceMs` while no descriptor names it (no client work can be in flight), otherwise after `drainMs`. |
| Ready: lease names another owner/PID, or the root is gone | Stop at the next `checkMs` (1 s) check. |
| Ready: listener closed, lease unreadable, or a check that does not finish | Stop after `graceMs` (5 s) of consecutive such ticks. A healthy result resets it; an event-loop stall yields one late tick, not a stop. The connection descriptor is not checked: a tampered one fails closed for clients rather than making the owner restart over it. |
| Any stop | Normal drain first (requests, canonical writes, hub, owned children). Forced exit only if the drain exceeds `drainMs` (30 s); a lease it still holds names a dead PID and is reclaimed by the next owner. |

Long-lived children owned by the backend must be shut down by the HTTP server
close (drain). A forced exit cannot run asynchronous cleanup, so such children
should also watch their owner PID or stdin. Losing startup candidates and the
authenticated `upgradeOlder` stop keep their existing behavior; the watchdog
starts only after the descriptor is published.
