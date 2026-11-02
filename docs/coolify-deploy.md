# Deploy jumpyBrain with Coolify

This is the lean Coolify path for the shared-memory server. The app runs as a Dockerized Node service, while Markdown memory is kept on persistent storage.

Read the [shared-memory quickstart](cloud-shared-memory.md) first. Route schemas and server internals live in the separate [protocol/API reference](shared-memory-protocol.md).

## Prerequisites

- Coolify can SSH to the target server.
- The repository is connected to Coolify at the reviewed release commit.
- A DNS name points to the server if public HTTPS is wanted.

## Application settings

Create a new Coolify application from:

```text
git@github.com:nikoatwork/jumpyBrain.git
```

Recommended build/deploy settings:

```text
Build Pack: Dockerfile
Source: reviewed release commit/tag
Dockerfile path: ./Dockerfile
Port / Exposed port: 3001
Auto Deploy: disabled during maintenance; promote reviewed builds deliberately
```

The Dockerfile installs QMD 2.8.3 through the existing engine lockfile and checks
its CLI plus SDK together. Linux native dependencies compile in a separate
toolchain stage; runtime retains the production packages and native libraries.
It runs as `node` (UID/GID 1000), with an absolute QMD path. `exec` in the default
command lets the server receive shutdown signals. Use the platform's init and
stop timeout controls, one replica and a stop-before-start replacement strategy;
a rolling overlap cannot share the root safely.

Lexical indexing is the default; for semantic retrieval, mount a provisioned GGUF
readable by UID 1000 at a stable absolute container path and configure
`index --semantic-model` on the server-local root. Policy persists in
`jumpybrain.json`, not container environment toggles. No model is downloaded by
the build/smoke. See [policy and recovery](technical.md#indexing).

## Clean-context container gate

Before promoting a changed Dockerfile, build input, runtime dependency or hosted
packaging setting, run:

```sh
npm run smoke:hosted
```

Docker with a running Linux daemon and network access to image, Debian and npm
registries is required. Failure or unavailable Docker leaves this gate open;
the command does not silently skip. It copies only declared source/lock/build
inputs to a temporary context, checks `.dockerignore` against private sentinel
files, builds the image and creates a disposable volume with no published port.
The fixture checks generated editor/license/feedback assets, production
dependencies, QMD CLI/SDK, authenticated CLI write/index/nonempty lexical recall,
reader denial, named credential and cookie revocation, bootstrap-key rotation,
graceful shutdown, persistence across replacement, and stopped-root backup/full
loss/restore/index rebuilding. Temporary containers, volume and image are removed.

Complete build inputs are `package.json`, root `package-lock.json`,
`tsconfig.json`, `src/**/*.ts`, `scripts/build-editor.mjs`, its
`scripts/feedback-config.mjs` import, `scripts/engine/package{,-lock}.json`,
`scripts/qmd-install-check.mjs` and `scripts/multiplayer-upgrade.mjs`.
The root lock supplies TypeScript, esbuild, Lexical and license files at build
time. Generated `dist/` includes the ordinary editor, optional extension bundle,
licenses, public feedback configuration, diagnostics build metadata, bundled
WebSocket transport and runtime lockfile. The final image keeps root production
dependencies (including esbuild and its platform binary), the locked full QMD
CLI/SDK dependency tree (including native SQLite/vector/grammar modules), Node's
system libraries and `libgomp1`; it excludes the compiler toolchain and root dev
dependencies. `.dockerignore` allows only declared inputs, excluding local
credentials/state, memory, evals and desktop installations.

Record the source commit/dirty status, image ID/digest, Linux architecture,
Node/QMD versions and results. The `node:22-slim` base and Debian repository are
moving inputs; dependency locks do not promise bit-identical images. Promote the
tested image digest when your registry/deployment workflow supports it. This
gate verifies the local Linux container, not a Coolify deployment, public TLS,
systemd, semantic models or cross-architecture support. Test those where used.

## Environment variables

Set these in Coolify as application environment variables. Store secrets only in Coolify's private environment/secret UI, not in the repository.

```bash
JUMPYBRAIN_SERVER_ROOT=/data/jumpybrain/memory
JUMPYBRAIN_SERVER_HOST=0.0.0.0
JUMPYBRAIN_SERVER_PORT=3001
# Replace ... through Coolify's private secret UI.
JUMPYBRAIN_SERVER_API_KEYS=...
JUMPYBRAIN_QMD_BIN=/usr/local/bin/qmd
```

The configured key is a bootstrap administrator secret. Give ordinary clients
separate [issued reader/writer credentials](collaboration.md#separate-access)
and inject the intended key as `JUMPYBRAIN_API_KEY`. See [rotation and
revocation](cloud-shared-memory.md#rotate-and-revoke-deliberately); changing a
secret requires recreating the container, not just restarting its old environment.

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

For existing bind mounts, grant the intended service UID/GID 1000 access before
cutover; do not make private access/recovery files world-readable. Use a dedicated
directory, take a backup and inspect current ownership before changing it. A new
Docker named volume inherits the image directory's ownership; existing volumes
retain their prior ownership. Set CPU, memory and process limits for your actual
corpus/model (the lexical smoke uses two CPUs, 2 GiB and 256 processes).

## Domains and HTTPS

In Coolify, attach a domain such as:

```text
https://memory.example.com
```

Coolify should route external HTTPS traffic to the container's internal port `3001`. You do not need to publish host port `3001` manually when using a Coolify domain/proxy; the important setting is that Coolify knows the app listens on container port `3001`. Verify same-origin WSS `/ws` upgrade, the public Host, forwarded HTTPS scheme and suitable idle timeouts through the actual proxy; public health does not check live editing. Keep the backend port private with the host firewall.

## Cutover from the temporary systemd deployment

A temporary `systemd` service may already be running on the VPS from manual smoke
testing. First follow the complete [writer inventory and
drain](cloud-shared-memory.md#drain-writers-before-migration-or-replacement).
Disabling one service alone cannot stop agents, raw-file writers or another
container. For the known unit, an administrator can then run:

```bash
systemctl disable --now jumpybrain
```

Keep `/srv/jumpybrain/memory` unless you intentionally want a clean memory root. To start clean while retaining a backup:

```bash
mv /srv/jumpybrain/memory /srv/jumpybrain/memory.pre-coolify-backup.$(date +%Y%m%d%H%M%S)
install -d -o 1000 -g 1000 -m 0700 /srv/jumpybrain/memory
```

Keep the renamed root private and offline. It is a one-time rollback copy, not a
recurring off-host backup. Do not launch an old automatic deployment against it.
The [backup and recovery procedure](cloud-shared-memory.md#backups-and-recovery)
includes access/recovery state and browser-draft limits.

## Smoke test

After Coolify deploys:

```bash
export JUMPYBRAIN_API_KEY='<issued-writer-secret>'

jumpybrain status --target-url https://memory.example.com
printf 'Coolify remote smoke body\n' | jumpybrain remember --target-url https://memory.example.com --type finding --title 'Coolify remote smoke'
# Optional immediate incremental update; background maintenance is separate.
jumpybrain index --target-url https://memory.example.com
jumpybrain recall --target-url https://memory.example.com --topic 'Coolify remote smoke' --limit 5
```

Remote creates and document updates mark the index stale. Hosted maintenance
coalesces writes after five seconds of quiet (thirty-second maximum scheduling
deferral) and reconciles external changes every five minutes. Work can take
longer. No Coolify scheduled job or external cron is required. Keep
`jumpybrain index --target-url ...` for immediate maintenance or diagnostics.

Server logs are stored inside the mounted memory root at `.jumpybrain/logs/server-YYYY-MM-DD.log`. With the recommended host mount, inspect them over SSH at:

```bash
tail -n 200 /srv/jumpybrain/memory/.jumpybrain/logs/server-$(date +%F).log
```

Do not expose a public logs endpoint in V1; use SSH/Coolify host access for production debugging.

Default servers also keep sanitized schema diagnostics in `.jumpybrain/logs/diagnostics/`, capped at seven days and 10 MiB per store with continuous segment rotation. These record operation/error categories, timing and opaque request correlation without memory content or raw exception/provider text. Hosted browser Feedback only includes browser evidence; remote server files stay behind administrator access. Legacy text logs can contain IDs/relative paths, so inspect/redact them deliberately rather than attaching whole files. Diagnostics are disposable and never repair or alter memory/index state.

## Safety checklist

- Keep the API key only in Coolify secrets and client-side environment variables, not in committed files or production command-line arguments.
- Use HTTPS at the Coolify proxy/domain.
- Keep persistent storage mounted at `/data/jumpybrain/memory`.
- Back up the host volume, especially before redeploying or moving servers.
- Run one container/process against this memory root for V1; do not scale replicas horizontally.

For direct VPS/systemd hosting, see [`vps-deploy.md`](vps-deploy.md). Vercel is not a supported production target for the V1 memory server; see [`vercel-deploy.md`](vercel-deploy.md).
