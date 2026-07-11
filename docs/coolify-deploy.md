# Deploy jumpyBrain with Coolify

This is the lean Coolify path for the shared-memory server. The app runs as a Dockerized Node service, while Markdown memory is kept on persistent storage.

Read the [shared-memory quickstart](cloud-shared-memory.md) first. Route schemas and server internals live in the separate [protocol/API reference](shared-memory-protocol.md).

## Prerequisites

- Coolify can SSH to the target server.
- The repository is connected to Coolify, preferably through the Coolify GitHub App so pushes to `master` trigger deployments.
- A DNS name points to the server if public HTTPS is wanted.

## Application settings

Create a new Coolify application from:

```text
git@github.com:nikoatwork/jumpyBrain.git
```

Recommended build/deploy settings:

```text
Build Pack: Dockerfile
Branch: master
Dockerfile path: ./Dockerfile
Port / Exposed port: 3001
Auto Deploy: enabled for master
```

## Environment variables

Set these in Coolify as application environment variables. Store secrets only in Coolify's private environment/secret UI, not in the repository.

```bash
JUMPYBRAIN_SERVER_ROOT=/data/jumpybrain/memory
JUMPYBRAIN_SERVER_HOST=0.0.0.0
JUMPYBRAIN_SERVER_PORT=3001
JUMPYBRAIN_SERVER_API_KEYS=... # replace in Coolify's private secret UI
JUMPYBRAIN_QMD_BIN=qmd
```

For local CLI access, use the same API key as `JUMPYBRAIN_API_KEY` on the client machine.

## Persistent storage

Mount persistent storage at:

```text
/data/jumpybrain/memory
```

If you want to reuse an existing host memory root, mount the host path:

```text
/srv/jumpybrain/memory -> /data/jumpybrain/memory
```

Do not use ephemeral container storage for this path. Markdown files are canonical memory state. If the persistent mount is missing, a container can appear healthy while writing to throwaway storage, so verify the mount before storing real team memory.

## Domains and HTTPS

In Coolify, attach a domain such as:

```text
https://memory.example.com
```

Coolify should route external HTTPS traffic to the container's internal port `3001`. You do not need to publish host port `3001` manually when using a Coolify domain/proxy; the important setting is that Coolify knows the app listens on container port `3001`.

## Cutover from the temporary systemd deployment

A temporary `systemd` service may already be running on the VPS from manual smoke testing. Before deploying through Coolify, stop it so Coolify owns the process lifecycle:

```bash
ssh -i ~/.ssh/<server-admin-key> root@<server-ip>
systemctl disable --now jumpybrain
```

Keep `/srv/jumpybrain/memory` unless you intentionally want a clean memory root. To start clean while retaining a backup:

```bash
mv /srv/jumpybrain/memory /srv/jumpybrain/memory.pre-coolify-backup.$(date +%Y%m%d%H%M%S)
mkdir -p /srv/jumpybrain/memory
```

## Smoke test

After Coolify deploys:

```bash
export JUMPYBRAIN_API_KEY=<same-secret-as-JUMPYBRAIN_SERVER_API_KEYS>

jumpybrain status --target-url https://memory.example.com
printf 'Coolify remote smoke body\n' | jumpybrain remember --target-url https://memory.example.com --type finding --title 'Coolify remote smoke'
# Optional immediate rebuild; the server also auto-indexes stale memory every 5 minutes.
jumpybrain index --target-url https://memory.example.com
jumpybrain recall --target-url https://memory.example.com --topic 'Coolify remote smoke' --limit 5
```

Remote writes are append-only and mark the index stale. The server auto-indexes stale memory every 5 minutes by default, so no Coolify scheduled job or external cron is required. Keep `jumpybrain index --target-url ...` for immediate maintenance or diagnostics.

Server logs are stored inside the mounted memory root at `.jumpybrain/logs/server-YYYY-MM-DD.log`. With the recommended host mount, inspect them over SSH at:

```bash
tail -n 200 /srv/jumpybrain/memory/.jumpybrain/logs/server-$(date +%F).log
```

Do not expose a public logs endpoint in V1; use SSH/Coolify host access for production debugging.

## Safety checklist

- Keep the API key only in Coolify secrets and client-side environment variables, not in committed files or production command-line arguments.
- Use HTTPS at the Coolify proxy/domain.
- Keep persistent storage mounted at `/data/jumpybrain/memory`.
- Back up the host volume, especially before redeploying or moving servers.
- Run one container/process against this memory root for V1; do not scale replicas horizontally.

For direct VPS/systemd hosting, see [`vps-deploy.md`](vps-deploy.md). Vercel is not a supported production target for the V1 memory server; see [`vercel-deploy.md`](vercel-deploy.md).
