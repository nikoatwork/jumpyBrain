# Vercel deployment status

Vercel is not a supported production target for the current jumpyBrain shared-memory server.

The V1 server is intentionally local-first: it runs one long-lived Node process against one persistent server-local Markdown memory root, and QMD builds derived search state on disk. That model fits a VPS, Coolify, Fly/Render/Railway-style persistent services, or another host with durable writable storage. It does not fit Vercel serverless functions as-is.

## Why not deploy the memory server on Vercel?

- **No durable canonical filesystem:** jumpyBrain's canonical state is Markdown on disk. Vercel function filesystems are ephemeral and not suitable for the memory root.
- **No long-lived process contract:** `jumpybrain serve` is an HTTP daemon, not a serverless handler.
- **QMD/indexing needs local runtime state:** derived index/cache files live under `.jumpybrain/` and should be rebuilt on the same persistent memory root.
- **Remote writes must be append-only on one local disk:** V1 idempotency/write serialization is documented for one server process over one local filesystem.

## Safe Vercel uses today

Vercel can still be useful for adjacent pieces:

- static marketing/docs site;
- a future UI that talks to a VPS-hosted jumpyBrain API;
- a thin authenticated proxy only if it forwards to a real persistent jumpyBrain backend and does not store memory in Vercel's filesystem.

If you use Vercel for any adjacent app, keep API keys in Vercel Environment Variables and never commit them to the repository.

## Recommended deployment instead

Use one of these for the current server:

- [`docs/vps-deploy.md`](vps-deploy.md) for direct systemd + reverse proxy hosting;
- [`docs/coolify-deploy.md`](coolify-deploy.md) for Dockerized hosting with persistent storage.

## What would be needed for first-class Vercel support?

A Vercel-native deployment would need a different storage adapter and runtime shape, for example:

- canonical memory in an external durable store;
- a serverless-compatible retrieval/indexing backend;
- locking/idempotency semantics that work across concurrent function invocations;
- an explicit migration path that preserves Markdown as the canonical format.

Until those exist, do not present Vercel as a production memory-server deployment path.
