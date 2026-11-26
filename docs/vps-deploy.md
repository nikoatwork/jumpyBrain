# Deploy jumpyBrain on a VPS

This is the recommended self-hosted path for a shared jumpyBrain memory server. Run one Node process against one persistent Markdown memory root, bind it to localhost, and put HTTPS/auth-adjacent controls at a reverse proxy.

Read the [shared-memory quickstart](cloud-shared-memory.md) first. Route schemas and server internals live in the separate [protocol/API reference](shared-memory-protocol.md).

## What this gives you

- Canonical memory stored as Markdown under `/srv/jumpybrain/memory`.
- Derived QMD/index state **and private access/recovery data** under `/srv/jumpybrain/memory/.jumpybrain/`. Optionally, the rebuildable index alone can live on a separate local disk through `JUMPYBRAIN_INDEX_DIR` while access/recovery and other root-owned state stay put.
- A local HTTP server on `127.0.0.1:3787`.
- Public HTTPS through nginx/Caddy/another reverse proxy.
- CLI access from agents with `--target-url` and `JUMPYBRAIN_API_KEY`.
- Optionally, more independent brains on the same host, one service and HTTPS hostname each ([section 10](#10-run-another-brain-on-the-same-vps)).

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
    limit_req_status 429;
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

### Request-rate limits belong to your proxy

jumpyBrain has no per-minute request quota of its own. The `limit_req` numbers above are an example, not a product default or a recommendation for your traffic. Every CLI command, agent and open editor window sends requests, and nginx keys this example by client IP address, so people and agents behind one shared NAT, VPN or office network share one budget. Size `rate`/`burst` for that combined traffic, or key on something narrower if your proxy can do so safely.

Keep `limit_req_status 429;`: nginx otherwise refuses with **503**, which clients cannot tell apart from an unavailable service. The CLI reports a 429 as `rate_limited` and a code-less 503 as `service_unavailable`, includes a delay only when the response carries a valid `Retry-After` header, and never retries automatically ([CLI errors](cli-commands.md#failure-output-and-json-errors)). To see which limit refused a request, check the proxy's error log (nginx logs `limiting requests, excess: … by zone "jumpybrain", client: …`) and its access log status codes. A refusal there never reached jumpyBrain, so the server log has no matching entry. Backend **503 `execution_overloaded`** is different: the shared search/index queue described above is full.

### Public writable sandbox

jumpyBrain has no anonymous mode: every memory route needs a key. A public demo publishes one disposable key and puts the safety controls in front of the server:

- **Dedicated root.** Use a disposable root containing only fictional seed Markdown, never a private brain.
- **Least-privilege key.** Keys in `JUMPYBRAIN_SERVER_API_KEYS` act as **admin**, so publishing one makes the proxy the only boundary. Prefer a published `writer` key from `jumpybrain access issue --role writer` ([roles](collaboration.md#separate-access)), and keep an admin key private. Issued keys live in `.jumpybrain/access.json` under the root, so a reset must keep that file or the published key changes.
- **Proxy allowlist.** Writers can still edit and delete notes. Allow the public key only the routes you mean to offer, for example status, overview, tree, graph, document `GET`, recent, search, recall/expand and note creation. Reject everything else, including document `PUT`/`DELETE`, files, boards, drawings, index, wrapups and `dream/*`. Add a per-IP rate limit with `limit_req_status 429` and a small request-body cap.
- **Scheduled reset.** Replace the root's Markdown with the seed copy and rebuild the index. A reset removes junk notes and returns derived state to a known point. It does not bound traffic between resets, and logs under the root are deleted with it unless you copy them out first. Rate limits slow floods but cannot stop low-volume spam. Rotate the public key if abuse continues between resets.

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

## 10. Run another brain on the same VPS

Each brain is a separate server process with its own canonical root, bootstrap
key, loopback port, HTTPS hostname, access keys, browser sessions, index and
backups. One process serves exactly one root. Nothing is shared between brains
except the installed release, the reverse proxy and the host's CPU, memory
and disk.

```text
https://memory.example.com   -> 127.0.0.1:3787 -> jumpybrain.service          -> /srv/jumpybrain/memory
https://product.example.com  -> 127.0.0.1:3788 -> jumpybrain-brain@product    -> /srv/jumpybrain/brains/product/memory
https://it.example.com       -> 127.0.0.1:3789 -> jumpybrain-brain@it         -> /srv/jumpybrain/brains/it/memory
```

The brain from sections 1–9 keeps its `jumpybrain.service`, user, root, env
file, port, hostname and keys. Its clients, browser sessions and links keep
working while you add a service. If you later replace the original service
definition, preserve its canonical root and public hostname and follow the
[drained replacement procedure](cloud-shared-memory.md#drain-writers-before-migration-or-replacement).

Before you start:

- Choose a short brain name of lowercase letters, digits and hyphens, for example
  `product`. It becomes the systemd instance, user, path and env file name.
- Pick an unused loopback port (`ss -ltn` lists ports in use) and a DNS
  hostname that already points at this VPS.
- Use the same verified release in `/opt/jumpybrain/current`, or check that the
  new brain and its clients work with it. All brains on that symlink upgrade
  together when it switches, so drain every brain for an upgrade (section 9).

### Add the per-brain service template once

Create `/etc/systemd/system/jumpybrain-brain@.service`. `%i` is the brain name.
It runs a dedicated user per brain, so one brain's process cannot read another
brain's files. The root path is fixed by the instance name, so an env file
cannot point two services at the same root.

```ini
[Unit]
Description=jumpyBrain shared memory server (%i)
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=300
StartLimitBurst=5

[Service]
Type=simple
User=jumpybrain-%i
Group=jumpybrain-%i
WorkingDirectory=/opt/jumpybrain/current
StateDirectory=jumpybrain-%i
StateDirectoryMode=0700
Environment=HOME=/var/lib/jumpybrain-%i
Environment=PATH=/usr/local/bin:/usr/bin:/bin
EnvironmentFile=/etc/jumpybrain/brains/%i.env
ExecStart=/usr/bin/env node /opt/jumpybrain/current/dist/cli.js serve --root /srv/jumpybrain/brains/%i/memory
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
KillMode=control-group
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=/srv/jumpybrain/brains/%i/memory
MemoryHigh=1536M
MemoryMax=2G
CPUQuota=200%
TasksMax=256
LimitNOFILE=4096

[Install]
WantedBy=multi-user.target
```

`StartLimitBurst` stops a brain that keeps crashing instead of restarting it
indefinitely. `StateDirectory` gives each brain its own private home. Add a
drop-in (`systemctl edit jumpybrain-brain@<name>`) to change one brain's limits.
Do not edit the template for a single brain.

### Provision one brain

Run in a private administrator shell with the name and port filled in:

```bash
set -eu
BRAIN='product'
PORT='3788'
if ! [[ "$BRAIN" =~ ^[a-z0-9][a-z0-9-]{0,20}$ ]]; then
  echo 'Use 1–21 lowercase letters, digits or hyphens, starting with a letter or digit.' >&2
  exit 1
fi
ROOT="/srv/jumpybrain/brains/$BRAIN/memory"
ENV_FILE="/etc/jumpybrain/brains/$BRAIN.env"
test ! -e "$ROOT"
test ! -e "$ENV_FILE"
if ss -ltnH "sport = :$PORT" | grep -q .; then echo "port $PORT is in use" >&2; exit 1; fi

useradd --system --no-create-home --home-dir "/var/lib/jumpybrain-$BRAIN" \
  --shell /usr/sbin/nologin "jumpybrain-$BRAIN"
install -d -o "jumpybrain-$BRAIN" -g "jumpybrain-$BRAIN" -m 0700 "/var/lib/jumpybrain-$BRAIN"
install -d -o root -g root -m 0755 /srv/jumpybrain/brains
install -d -o "jumpybrain-$BRAIN" -g "jumpybrain-$BRAIN" -m 0700 \
  "/srv/jumpybrain/brains/$BRAIN" "$ROOT"
install -d -o root -g root -m 0700 /etc/jumpybrain/brains
install -m 0600 -o root -g root /dev/null "$ENV_FILE"
```

Edit `$ENV_FILE` with `sudoedit`. Use a new bootstrap key from your secret
store. Never reuse another brain's key.

```bash
JUMPYBRAIN_SERVER_HOST=127.0.0.1
JUMPYBRAIN_SERVER_PORT=3788
# Replace ... through private secret storage; unique to this brain.
JUMPYBRAIN_SERVER_API_KEYS=...
JUMPYBRAIN_QMD_BIN=/opt/jumpybrain/current/scripts/engine/node_modules/.bin/qmd
```

Leave `JUMPYBRAIN_SERVER_ROOT` out because the unit passes `--root`. If you use
`JUMPYBRAIN_INDEX_DIR`, give each brain its own directory that its user can
write, and add it to that brain's `ReadWritePaths` with a drop-in.

Initialize and index the empty root as that brain's user, then start the service:

```bash
CLI=/opt/jumpybrain/current/dist/cli.js
QMD=/opt/jumpybrain/current/scripts/engine/node_modules/.bin/qmd
sudo -H -u "jumpybrain-$BRAIN" -- node "$CLI" init --root "$ROOT"
sudo -H -u "jumpybrain-$BRAIN" -- env JUMPYBRAIN_QMD_BIN="$QMD" \
  node "$CLI" index --root "$ROOT"
sudo -H -u "jumpybrain-$BRAIN" -- node "$CLI" backend stop --root "$ROOT"
systemctl daemon-reload
systemctl enable --now "jumpybrain-brain@$BRAIN"
systemctl status "jumpybrain-brain@$BRAIN"
curl -fsS "http://127.0.0.1:$PORT/health"
```

As in section 2, stop the on-demand owner that `index` started before the
service claims the root. For semantic retrieval, give this brain's user read
access to the GGUF and pass `--semantic-model` to its own `index` command.

Each `serve` process also uses a private loopback control listener on an
ephemeral port. Keep only the proxy public. If the proxy runs in a container,
bind the backend to the private bridge interface and restrict access to that
proxy on the brain's specific port. Test connectivity from the proxy network
before adding the route.

### Route the hostname

Add one `server` block per brain to the nginx configuration from section 5.
Keep the single `map` from section 5; nginx rejects a duplicate `map` for the
same variable. Give each brain its own `limit_req_zone` so traffic on one brain
cannot use up another brain's request budget:

```nginx
# http context, next to the existing zone and map
limit_req_zone $binary_remote_addr zone=jumpybrain_product:10m rate=30r/m;

server {
  listen 443 ssl http2;
  server_name product.example.com;
  # ssl_certificate / ssl_certificate_key from your TLS automation

  client_max_body_size 1m;

  location / {
    limit_req zone=jumpybrain_product burst=20 nodelay;
    limit_req_status 429;
    proxy_pass http://127.0.0.1:3788;
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

Copy the `location` settings exactly. WebSocket upgrade headers are required
for live editing, and `Host` must be the public hostname. Browser mutations
check the exact Origin, and session cookies are host-only, so each brain needs
its own hostname. A path prefix such as `/product` on a shared hostname is not
supported. Issue the certificate first, then run `nginx -t` before
`systemctl reload nginx`. A failed `nginx -t` leaves the running configuration
unchanged. Caddy users add one site block per hostname with
`reverse_proxy 127.0.0.1:<port>`, which forwards WebSocket upgrades by default.

### Check before sharing it

Run these from a client machine, keeping each brain's key in its own variable.
`JUMPYBRAIN_API_KEY` is one value per command, so set it per invocation:

```bash
ORIGINAL=https://memory.example.com
NEW=https://product.example.com

JUMPYBRAIN_API_KEY="$ORIGINAL_KEY" jumpybrain status --target-url "$ORIGINAL"
JUMPYBRAIN_API_KEY="$NEW_KEY" jumpybrain status --target-url "$NEW"
# Cross-key denial: each command must fail with an authentication error.
JUMPYBRAIN_API_KEY="$NEW_KEY" jumpybrain status --target-url "$ORIGINAL"
JUMPYBRAIN_API_KEY="$ORIGINAL_KEY" jumpybrain status --target-url "$NEW"
```

Then, on the new origin:

1. Issue a named admin key for yourself and stop using the bootstrap key
   ([separate access](collaboration.md#separate-access)).
2. Write, index and recall a test note, as in section 6.
3. Sign in from a browser, open a note and edit it from two windows to check
   live editing over WebSockets through the proxy.
4. Create an invite, accept it in a private window, then revoke it and check
   that the session stops working.

Open the original origin in the same browser and verify its existing session
still reads a note.

The Mac app adds the new hostname as a separate connection with its own key.
The CLI selects a brain with `--target-url` plus that brain's key. Named CLI
brain targets are not available yet.

### Roll back a new brain

Rolling back touches only the new brain:

```bash
# 1. Remove the new server block and zone, then validate and reload nginx.
# 2. Stop the new service once the proxy reload succeeds.
nginx -t && systemctl reload nginx && systemctl disable --now "jumpybrain-brain@$BRAIN"
# 3. Check the original brain.
curl -fsS http://127.0.0.1:3787/health
JUMPYBRAIN_API_KEY="$ORIGINAL_KEY" jumpybrain status --target-url https://memory.example.com
```

Keep `/srv/jumpybrain/brains/$BRAIN`, its env file and user until you decide
the data is no longer needed. Restarting the service and restoring the server
block brings the brain back with its notes, keys and sessions. Delete the root
only after a verified backup and an explicit decision. Reusing the name later
then starts an empty brain.

Check that the original brain stays reachable while you add the new one, if the
new service fails to start or crash-loops, and after you stop it. A stopped or
failing brain returns 502 from the proxy on its own hostname only.

### Resource boundaries

Per-unit `MemoryHigh`, `MemoryMax`, `CPUQuota`, `TasksMax` and `LimitNOFILE`
cap each brain on its own. Search and index admission allows one active
operation per root, with a separate process-wide ceiling. Independent brains
can index at the same time, so size the host for overlapping work. The
example sets a 2 GiB hard memory limit per brain. Lower per-brain limits with drop-ins,
or put all brains in one slice with a total cap
(`Slice=jumpybrain.slice` in a drop-in, plus a
`/etc/systemd/system/jumpybrain.slice` with `MemoryMax=`). A cap can delay or
stop work on that brain. Size against your own corpus and model, and monitor
authenticated readiness per brain. Each root grows independently on the
host's shared disk.

### Back up and restart one brain

Every brain has its own private backup, access state and recovery files.
Follow section 9 per root:

```bash
install -d -o root -g root -m 0755 /var/backups/jumpybrain
install -d -o "jumpybrain-$BRAIN" -g "jumpybrain-$BRAIN" -m 0700 \
  "/var/backups/jumpybrain/$BRAIN"
systemctl stop "jumpybrain-brain@$BRAIN"
sudo -H -u "jumpybrain-$BRAIN" -- \
  node /opt/jumpybrain/current/scripts/multiplayer-upgrade.mjs \
  --root "/srv/jumpybrain/brains/$BRAIN/memory" --mode prepare \
  --backup "/var/backups/jumpybrain/$BRAIN/$(date +%F)" --apply
systemctl start "jumpybrain-brain@$BRAIN"
```

Each brain's backups stay private to its own user. Keep one backup set per
brain. Never restore
one brain's `.jumpybrain/access.json` or recovery files into another root.
Recurring encrypted off-host backups must include every root under
`/srv/jumpybrain/brains/` as well as `/srv/jumpybrain/memory`. Back up
`/etc/jumpybrain/brains/` and the proxy configuration through your private
secret/config backups.

`systemctl restart jumpybrain-brain@<name>` restarts one brain. Open editors on
that brain lose their connection until it is back. Other brains are not
affected.

### Coolify equivalent

On Coolify, run one application per brain, each with its own volume, secret and
domain. Never attach one volume to two applications. See [add another brain on
the same server](coolify-deploy.md#add-another-brain-on-the-same-server).

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
- `JUMPYBRAIN_INDEX_DIR` may move only the rebuildable index to another local disk. The memory root must stay on a supported local filesystem: canonical writes use exclusive lock files, `link()`-based moves and atomic rename, and collaboration recovery depends on them. Those guarantees are unverified on SMB/NFS/Azure Files, so network storage for the memory root remains unsupported even with a separate index location.
