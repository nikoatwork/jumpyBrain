# Deploy jumpyBrain on a VPS

This is the recommended self-hosted path for a shared jumpyBrain memory server. Run one Node process against one persistent Markdown memory root, bind it to localhost, and put HTTPS/auth-adjacent controls at a reverse proxy.

Read the [shared-memory quickstart](cloud-shared-memory.md) first. Route schemas and server internals live in the separate [protocol/API reference](shared-memory-protocol.md).

## What this gives you

- Canonical memory stored as Markdown under `/srv/jumpybrain/memory`.
- Derived QMD/index state **and private access/recovery data** under `/srv/jumpybrain/memory/.jumpybrain/`.
- A local HTTP server on `127.0.0.1:3787`.
- Public HTTPS through nginx/Caddy/another reverse proxy.
- CLI access from agents with `--target-url` and `JUMPYBRAIN_API_KEY`.

## Prerequisites

- A Linux VPS with SSH access.
- A DNS name such as `memory.example.com` pointing to the VPS.
- Node.js 22.12+ and npm at known absolute paths.
- A reverse proxy with TLS, for example nginx + certbot or Caddy.
- A firewall that permits public access only to the proxy, not the backend port.

The release extraction, locked dependencies and service command can be checked
in a disposable Debian container; that does not prove systemd boot/restart or
your proxy/firewall. Treat the unit below as an operator example until those
checks pass on your intended Linux host. The resource limits are lexical-test
defaults, not semantic-model sizing guarantees.

## 1. Create a service user and directories

```bash
sudo useradd --system --create-home --home-dir /var/lib/jumpybrain --shell /usr/sbin/nologin jumpybrain
sudo install -d -o root -g root -m 0755 /opt/jumpybrain/releases
sudo install -d -o jumpybrain -g jumpybrain -m 0700 /srv/jumpybrain/memory /var/lib/jumpybrain
```

## 2. Install an explicit verified release

Choose an already published release asset and copy its reviewed SHA-256 digest
from trusted release metadata. Do not use a moving `master` checkout or calculate
the expected checksum from the same unverified download. Run the following as
the installation administrator, before admitting clients. Replace both
placeholders; no particular version is implied to contain unreleased fixes.
Keep each release directory immutable to the service user.

```bash
# In a private administrator shell (sudo -i), with Node/npm provisioned:
set -eu
RELEASE='<published-version>'
ARCHIVE_SHA256='<reviewed-64-hex-sha256>'
RELEASE_DIR="/opt/jumpybrain/releases/$RELEASE"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
curl --proto '=https' --tlsv1.2 -fL \
  "https://github.com/nikoatwork/jumpyBrain/releases/download/v$RELEASE/jumpybrain-$RELEASE.tgz" \
  -o "$work/release.tgz"
printf '%s  %s\n' "$ARCHIVE_SHA256" "$work/release.tgz" | sha256sum -c -
test ! -e "$RELEASE_DIR"
mkdir "$RELEASE_DIR"
tar -xzf "$work/release.tgz" -C "$RELEASE_DIR" --strip-components=1 --no-same-owner
cd "$RELEASE_DIR"
# npm excludes the root lockfile; the compiled release carries the exact copy.
cp dist/runtime-package-lock.json package-lock.json
npm ci --omit=dev
# Debian/Ubuntu: native QMD grammar/SQLite compilation needs these tools.
apt-get update
apt-get install -y --no-install-recommends python3 make g++ cmake libgomp1
npm --prefix scripts/engine ci --omit=dev
node scripts/qmd-install-check.mjs "$RELEASE_DIR/scripts/engine/node_modules/.bin/qmd"
# Only switch this symlink during a drained maintenance window for upgrades.
ln -sfn "$RELEASE_DIR" /opt/jumpybrain/current
```

The locked engine package includes QMD 2.8.3's CLI, SDK, native SQLite/vector
modules and their dependencies. A bare executable shim is insufficient. No
semantic model download is implied. Initialize the memory root once (lexical
default), selecting the absolute engine path for local maintenance as well:

```bash
sudo -H -u jumpybrain -- node /opt/jumpybrain/current/dist/cli.js init --root /srv/jumpybrain/memory
sudo -H -u jumpybrain -- env \
  JUMPYBRAIN_QMD_BIN=/opt/jumpybrain/current/scripts/engine/node_modules/.bin/qmd \
  node /opt/jumpybrain/current/dist/cli.js index --root /srv/jumpybrain/memory
sudo -H -u jumpybrain -- node /opt/jumpybrain/current/dist/cli.js backend stop --root /srv/jumpybrain/memory
```

Local indexing starts an on-demand owner; stop it before starting foreground
`serve`. For later maintenance, a compatible local CLI can join the foreground
owner. Never delete leases to force a second process to claim the root.

For semantic retrieval, provision a service-readable local GGUF and run the same local index command with `--semantic-model /absolute/models/embedding.gguf`. This persists policy in `jumpybrain.json`; no per-run embedding environment flag is needed. Changed models or older semantic vectors require `--rebuild`. See [policy and recovery](technical.md#indexing).

## 3. Create a private environment file

Create `/etc/jumpybrain.env`:

```bash
sudo install -m 0600 -o root -g root /dev/null /etc/jumpybrain.env
sudoedit /etc/jumpybrain.env
```

Example contents:

```bash
JUMPYBRAIN_SERVER_ROOT=/srv/jumpybrain/memory
JUMPYBRAIN_SERVER_HOST=127.0.0.1
JUMPYBRAIN_SERVER_PORT=3787
# Replace ... through private secret storage; this is a bootstrap admin key.
JUMPYBRAIN_SERVER_API_KEYS=...
JUMPYBRAIN_QMD_BIN=/opt/jumpybrain/current/scripts/engine/node_modules/.bin/qmd
```

Do not commit this file or put API keys in `jumpybrain.json`. Systemd reads this
root-only file before changing user. It is not a shell script: do not use command
substitution or trailing inline comments in values. Supply a long random key
from your secret store. This is the setup key: connect with it once, then give
yourself and each collaborator a [named key from Settings → Access keys, the
browser or the CLI](collaboration.md#separate-access), and follow the [rotation and
writer-drain procedure](cloud-shared-memory.md#rotate-and-revoke-deliberately).

## 4. Install a systemd service

Create `/etc/systemd/system/jumpybrain.service`:

```ini
[Unit]
Description=jumpyBrain shared memory server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=jumpybrain
Group=jumpybrain
WorkingDirectory=/opt/jumpybrain/current
Environment=HOME=/var/lib/jumpybrain
Environment=PATH=/usr/local/bin:/usr/bin:/bin
EnvironmentFile=/etc/jumpybrain.env
ExecStart=/usr/bin/env node /opt/jumpybrain/current/dist/cli.js serve
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
KillMode=control-group
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=/srv/jumpybrain/memory /var/lib/jumpybrain
MemoryHigh=1536M
MemoryMax=2G
CPUQuota=200%
TasksMax=256
LimitNOFILE=4096

[Install]
WantedBy=multi-user.target
```

Start it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now jumpybrain
sudo systemctl status jumpybrain
curl -fsS http://127.0.0.1:3787/health
```

## 5. Put HTTPS in front

Merge this example with your existing working TLS automation and firewall;
it is not a complete nginx installation. `map` and `limit_req_zone` belong in
the nginx `http` context. WebSocket upgrade is required by protocol 2:

```nginx
limit_req_zone $binary_remote_addr zone=jumpybrain:10m rate=30r/m;
map $http_upgrade $connection_upgrade {
  default upgrade;
  '' close;
}

server {
  listen 443 ssl http2;
  server_name memory.example.com;

  client_max_body_size 1m;

  location / {
    limit_req zone=jumpybrain burst=20 nodelay;
    proxy_pass http://127.0.0.1:3787;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_read_timeout 610s;
    proxy_send_timeout 610s;
    proxy_buffering off;
  }
}
```

Use your normal TLS automation, for example certbot or Caddy. The jumpyBrain process itself should stay bound to localhost unless you have a private network in front of it.

## 6. Smoke test from a client machine

```bash
export JUMPYBRAIN_API_KEY='<issued-writer-secret>'

jumpybrain status --target-url https://memory.example.com
printf 'VPS remote smoke body\n' | jumpybrain remember --target-url https://memory.example.com --type finding --title 'VPS remote smoke'
jumpybrain index --target-url https://memory.example.com
jumpybrain recall --target-url https://memory.example.com --topic 'VPS remote smoke' --limit 5
```

## 7. Automatic indexing

Remote creates and document updates mark the index stale. Hosted maintenance
coalesces writes after five seconds of quiet (thirty-second maximum scheduling
deferral) and reconciles external changes every five minutes; work can take
longer. No extra cron or systemd timer is required. Manual indexing remains
available when you want an immediate incremental update:

```bash
jumpybrain index --target-url https://memory.example.com
```

Add `--rebuild` for explicit vector regeneration; routine and automatic runs reuse unchanged hashes/vectors. Inspect authenticated `status --json` readiness separately from public health. Physically corrupt SQLite requires stopping operations and removing derived state, not just `--rebuild`; follow the [recovery procedure](technical.md#readiness-and-recovery).

## Execution and capacity limits

Search/index children are asynchronous, with one active operation per root, two process-wide and sixteen queued; saturation returns 503, deadline exhaustion 504. Default search/compact deadline is 60 seconds (30 seconds per query command), index 600 seconds. Optional `JUMPYBRAIN_SEARCH_TIMEOUT_MS` / `JUMPYBRAIN_INDEX_TIMEOUT_MS` are positive integer milliseconds. Keep reverse-proxy/client timeouts consistent with long indexing; remote CLI defaults to 610 seconds/index and 70 seconds/read. For example, nginx's default read timeout can expire before a healthy long index; set `proxy_read_timeout 610s;` when accepting the default index deadline.

An invocation may contain a QMD wrapper plus worker and semantic model memory. Neither the concurrency bound nor laptop lexical results establish a minimum VPS RAM/CPU size. Size against your actual model/corpus/concurrent workload, retain OS/service resource limits, and monitor safe overload/readiness. Health remains serviceable during subprocess waits, but unbounded canonical input scans, synchronous parsing and OS-uninterruptible work are not an SLA. One server process per local filesystem/root remains required. See [execution contract](technical.md#bounded-retrieval-execution) for cancellation, output caps and tested-platform limits. This is backend admission, not a replacement for reverse-proxy IP rate limits.

## 8. Logs

Server logs are written under the memory root at `.jumpybrain/logs/server-YYYY-MM-DD.log`. Inspect them over SSH:

```bash
sudo tail -n 200 /srv/jumpybrain/memory/.jumpybrain/logs/server-$(date +%F).log
```

V1 intentionally does not expose a developer logs HTTP endpoint; keep log access on the host side.

## 9. Backups and upgrades

Follow the shared [writer inventory/drain](cloud-shared-memory.md#drain-writers-before-migration-or-replacement)
and [backup/restore](cloud-shared-memory.md#backups-and-recovery) procedures.
Disable restart/redeploy triggers, stop the service and every other writer,
then run the coordinated upgrade helper as the service user with a private
backup destination outside the brain. Keep `/etc/jumpybrain.env` and proxy/unit
configuration in separate private backups. The helper does not copy them.

Install a new verified asset into a new release directory as above. Switch
`/opt/jumpybrain/current` only while drained, verify the backup/build, start the
single service and test authenticated status, known-note recall and access
revocation before admitting clients. A server upgrade does not update remote
CLI/app clients. Keep the previous release and backup until verification passes;
never restore an older access file over newer revocations. A one-time upgrade
backup does not replace recurring encrypted off-host backups.

## Safety checklist

- Keep `JUMPYBRAIN_SERVER_API_KEYS` only in private host/provider secrets, not in committed files or production command-line arguments.
- Bind the Node process to `127.0.0.1` or a private interface.
- Terminate HTTPS at the reverse proxy.
- Match route-specific body/frame limits; the general HTTP JSON limit is 1 MiB,
  live canonical notes are bounded at 2 MiB and live frames at 3 MiB. Verify `/ws`
  through your actual proxy rather than inferring it from public health. HTTP
  request-body limits do not bound WebSocket frames after a successful upgrade.
- Add basic rate limiting at the reverse proxy.
- Back up `/srv/jumpybrain/memory` regularly.
- Run one server process against one local disk memory root for V1; do not horizontally scale this server yet.
