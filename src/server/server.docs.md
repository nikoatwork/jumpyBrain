# Server module docs

## Responsibilities

- Compose server-local memory operations, including remote dream state/batch workflows, through the `src/app/server-memory/` use-case seam against one configured Markdown memory root.
- Re-export the HTTP server adapter and server-memory helpers for compatibility while keeping route parsing/auth implementation under `src/adapters/http-server/`.
- Preserve remote JSON shapes and avoid leaking server filesystem paths to remote clients.

Server config accepts `searchTimeoutMs`/`indexTimeoutMs`, also read from `JUMPYBRAIN_SEARCH_TIMEOUT_MS`/`JUMPYBRAIN_INDEX_TIMEOUT_MS`; validation occurs at bootstrap, as it does for `JUMPYBRAIN_SMART_SEARCH_IDLE_MS`. HTTP close propagates cancellation to its own app work and index runner. Admission and child lifecycle stay in the QMD adapter, not server protocol code.

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
writes and retains canonical Saved separately from indexing. Both the daemon and
foreground `serve` are long-lived search hosts: they keep the root's
[warm smart-search worker](../adapters/qmd/qmd.docs.md#warm-smart-search) and
pre-warm it in the background when smart search is ready.
