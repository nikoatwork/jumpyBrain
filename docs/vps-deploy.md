# Deploy jumpyBrain on a VPS

This is the recommended self-hosted path for a shared jumpyBrain memory server. Run one Node process against one persistent Markdown memory root, bind it to localhost, and put HTTPS/auth-adjacent controls at a reverse proxy.

Read the [shared-memory quickstart](cloud-shared-memory.md) first. Route schemas and server internals live in the separate [protocol/API reference](shared-memory-protocol.md).

## What this gives you

- Canonical memory stored as Markdown under `/srv/jumpybrain/memory`.
- Derived QMD/index state under `/srv/jumpybrain/memory/.jumpybrain/`.
- A local HTTP server on `127.0.0.1:3787`.
- Public HTTPS through nginx/Caddy/another reverse proxy.
- CLI access from agents with `--target-url` and `JUMPYBRAIN_API_KEY`.

## Prerequisites

- A Linux VPS with SSH access.
- A DNS name such as `memory.example.com` pointing to the VPS.
- Node.js 22+ and npm.
- A reverse proxy with TLS, for example nginx + certbot or Caddy.

## 1. Create a service user and directories

```bash
sudo useradd --system --create-home --home-dir /srv/jumpybrain --shell /usr/sbin/nologin jumpybrain
sudo mkdir -p /srv/jumpybrain/app /srv/jumpybrain/memory
sudo chown -R jumpybrain:jumpybrain /srv/jumpybrain
```

## 2. Install the app and QMD

```bash
sudo -H -u jumpybrain -- git clone https://github.com/nikoatwork/jumpyBrain.git /srv/jumpybrain/app
sudo -H -u jumpybrain -- sh -lc 'cd /srv/jumpybrain/app && npm ci && npm run build'
sudo npm install -g @tobilu/qmd
command -v qmd
```

Initialize the memory root once:

```bash
sudo -H -u jumpybrain -- node /srv/jumpybrain/app/dist/cli.js init --root /srv/jumpybrain/memory
sudo -H -u jumpybrain -- node /srv/jumpybrain/app/dist/cli.js index --root /srv/jumpybrain/memory
```

## 3. Create a private environment file

Generate a long random API key:

```bash
openssl rand -base64 48
```

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
JUMPYBRAIN_SERVER_API_KEYS=... # replace from private secret storage
JUMPYBRAIN_QMD_BIN=qmd
```

If `qmd` is outside systemd's default `PATH`, set `JUMPYBRAIN_QMD_BIN` to the absolute path printed by `command -v qmd`.

Do not commit this file or put API keys in `jumpybrain.json`.

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
WorkingDirectory=/srv/jumpybrain/app
EnvironmentFile=/etc/jumpybrain.env
ExecStart=/usr/bin/env node /srv/jumpybrain/app/dist/cli.js serve
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ReadWritePaths=/srv/jumpybrain/memory

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

Example nginx server block:

```nginx
limit_req_zone $binary_remote_addr zone=jumpybrain:10m rate=30r/m;

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
  }
}
```

Use your normal TLS automation, for example certbot or Caddy. The jumpyBrain process itself should stay bound to localhost unless you have a private network in front of it.

## 6. Smoke test from a client machine

```bash
export JUMPYBRAIN_API_KEY='<same-secret-as-JUMPYBRAIN_SERVER_API_KEYS>'

jumpybrain status --target-url https://memory.example.com
printf 'VPS remote smoke body\n' | jumpybrain remember --target-url https://memory.example.com --type finding --title 'VPS remote smoke'
jumpybrain index --target-url https://memory.example.com
jumpybrain recall --target-url https://memory.example.com --topic 'VPS remote smoke' --limit 5
```

## 7. Automatic indexing

Remote writes are append-only and mark the index stale. The server auto-indexes stale memory every 5 minutes by default, so no cron or systemd timer is required. Manual indexing remains available when you want an immediate rebuild:

```bash
jumpybrain index --target-url https://memory.example.com
```

## 8. Logs

Server logs are written under the memory root at `.jumpybrain/logs/server-YYYY-MM-DD.log`. Inspect them over SSH:

```bash
sudo tail -n 200 /srv/jumpybrain/memory/.jumpybrain/logs/server-$(date +%F).log
```

V1 intentionally does not expose a developer logs HTTP endpoint; keep log access on the host side.

## 9. Backups and upgrades

Back up the canonical Markdown root:

```bash
sudo tar -C /srv/jumpybrain -czf jumpybrain-memory-$(date +%Y%m%d).tgz memory
```

Upgrade from the repo:

```bash
cd /srv/jumpybrain/app
sudo -H -u jumpybrain -- git pull --ff-only
sudo -H -u jumpybrain -- sh -lc 'cd /srv/jumpybrain/app && npm ci && npm run build'
sudo systemctl restart jumpybrain
```

## Safety checklist

- Keep `JUMPYBRAIN_SERVER_API_KEYS` only in private host/provider secrets, not in committed files or production command-line arguments.
- Bind the Node process to `127.0.0.1` or a private interface.
- Terminate HTTPS at the reverse proxy.
- Keep reverse-proxy request-size limits at or below the server's 1 MiB JSON body limit.
- Add basic rate limiting at the reverse proxy.
- Back up `/srv/jumpybrain/memory` regularly.
- Run one server process against one local disk memory root for V1; do not horizontally scale this server yet.
