# Run your own shared brain

This quickstart runs one authenticated jumpyBrain server against a dedicated, persistent Markdown memory root. For route schemas, response shapes, idempotency, graph transport, dream state, and V1 constraints, use the [shared-memory protocol reference](shared-memory-protocol.md).

## Prerequisites

- Linux or macOS with a POSIX-compatible shell
- Node.js 22+, npm, Git, and `curl` or `wget`
- a persistent local filesystem for the server memory root
- a private API key stored in deployment-secret storage
- HTTPS termination before exposing the server beyond a trusted network

For a production-shaped deployment, choose the [VPS guide](vps-deploy.md) or [Coolify guide](coolify-deploy.md). The commands below are a local operator smoke test.

## 1. Install and build

```bash
git clone https://github.com/nikoatwork/jumpyBrain.git
cd jumpyBrain
npm install
npm run build
```

## 2. Create a private server environment

Generate a long random key and save it only in your shell's secret environment or deployment provider. Do not commit it, put it in `jumpybrain.json`, or pass it as a command-line argument.

```bash
export JUMPYBRAIN_SERVER_ROOT="$PWD/.local/server-memory"
export JUMPYBRAIN_SERVER_HOST=127.0.0.1
export JUMPYBRAIN_SERVER_PORT=3787
export JUMPYBRAIN_SERVER_API_KEYS="$(openssl rand -hex 32)"
export JUMPYBRAIN_API_KEY="$JUMPYBRAIN_SERVER_API_KEYS"
```

Initialize the dedicated root once:

```bash
node dist/cli.js init --root "$JUMPYBRAIN_SERVER_ROOT"
node dist/cli.js index --root "$JUMPYBRAIN_SERVER_ROOT"
```

## 3. Start the server

```bash
node dist/cli.js serve
```

Leave that process running. In a second shell, export the same client key from your secret store, then verify health and perform the first authenticated recall:

```bash
curl -fsS http://127.0.0.1:3787/health
JUMPYBRAIN_API_KEY='<same-private-secret>' \
  node dist/cli.js recall --target-url http://127.0.0.1:3787 --topic "what should I remember?" --limit 5
```

`GET /health` is intentionally unauthenticated and contains no memory content. Every `/memories/all/...` endpoint requires a bearer key.

## 4. Use the minimal web editor

Open the server root in a browser:

```text
https://memory.example.com/
```

The home is intentionally almost empty. Press **Cmd+K** on macOS or **Ctrl+K** elsewhere (or use the visible search invitation on touch devices), enter the same private API key when prompted, and search indexed note titles and bodies. Choosing a result opens a reloadable `/?note=mem_<uuid>` URL with a full-page raw Markdown body editor. Page names and body changes autosave through the authenticated document `GET`/`PUT` protocol; renamed titles must be unique (ignoring case and surrounding whitespace). Other metadata and frontmatter remain read-only. Never put the API key in the note query string or a shared link.

Choose the **New note** button on home or in the editor. Note creation is button-only; Cmd/Ctrl+N remains the browser's new-window shortcut. Creation saves a separate note immediately with a browser-local `YYYY-MM-DD HH:mm:ss.SSS` title/date heading, then focuses the body after that heading. No title or tag form is required. Double clicks are suppressed; **Retry new note** reuses the same request/key after a lost response while the tab remains open. Failed saves block creation from the current draft. Blank remote `note` creation is supported; findings, decisions, preferences, wrapups, and local CLI writes still require content.

To reference another document, type **`[[`** or choose **Insert page reference**, search using the same title/body picker, and select a result to insert literal `[[Exact Page Title]]` text without navigating away. Escape preserves your draft; insertion participates in native undo and autosave. The picker rejects unsafe/missing titles and duplicate titles visible in its results. It cannot guarantee collection-wide uniqueness: title references are plain Markdown, not unique-ID links, and the existing graph resolver still matches filenames rather than frontmatter titles. Target creation, title editing, rename propagation, and clickable reference navigation are deferred.

The writing surface uses neutral cream backgrounds, charcoal text, subtle borders, and visible focus/error states. It remains raw Markdown, not a rich/block editor. Unsaved drafts and creation retry keys are held in the current tab, not an offline or crash-recovery store; do not reload a failed/unconfirmed creation before retrying. Server idempotency receipts are not transactionally coupled to canonical file creation, so server crashes between those writes are not covered by the ordinary lost-response retry guarantee.

`/graph` remains available as a secondary explicit-link map. Neither the almost-empty home nor the HTML shell embeds note content or credentials, and the browser UI adds no frontend runtime dependency or separate deployment service.

Autosave and search indexing are separate: a saved document marks the derived index stale, and new text may not appear in search until indexing succeeds (checks run every five minutes by default; that is not a freshness guarantee). The current conflict behavior is intentionally bounded last-write-wins debt: after one stale-hash response the browser reapplies the local body over fresh protected frontmatter and retries once; another conflict stops and requires an explicit retry.

## 5. Connect an installed CLI

Keep the client key in the CLI process environment and provide the server base URL:

```bash
export JUMPYBRAIN_API_KEY='<private-client-secret>'
jumpybrain status --target-url https://memory.example.com
jumpybrain recall --target-url https://memory.example.com --topic "current project decisions" --limit 5
```

`--target-url` and `--remote-url` are equivalent. API keys currently come only from `JUMPYBRAIN_API_KEY` in the CLI environment; there is no local-config fallback.

An installer-created CLI can mark a remote origin read-only in device-local `cli-config.json`. That is accidental-write protection, not server authorization. Enforce access at the server or reverse proxy.

## 6. Verify the deployment

```bash
curl -fsS https://memory.example.com/health
JUMPYBRAIN_API_KEY='<private-client-secret>' jumpybrain status --target-url https://memory.example.com
JUMPYBRAIN_API_KEY='<private-client-secret>' jumpybrain tree --target-url https://memory.example.com --limit 20
```

The server requires one explicit memory root and is designed for one process over one persistent local disk in V1. Markdown is canonical; indexes and `.jumpybrain/` support state are derived or rebuildable.

## Next references

- [Shared-memory protocol and API reference](shared-memory-protocol.md)
- [VPS deployment](vps-deploy.md)
- [Coolify deployment](coolify-deploy.md)
- [CLI commands](cli-commands.md)
- [Installation and updates](install.md)
