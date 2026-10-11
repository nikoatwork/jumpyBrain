# Run your own shared brain

This quickstart runs one authenticated jumpyBrain server against a dedicated, persistent Markdown memory root. For route schemas, response shapes, idempotency, graph transport, dream windows/legacy state, and V1 constraints, use the [shared-memory protocol reference](shared-memory-protocol.md).

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
npm install -g @tobilu/qmd@2.8.3
node scripts/qmd-install-check.mjs qmd
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

QMD must include both the CLI and SDK from the pinned package. Initialize the dedicated root once (lexical by default):

```bash
node dist/cli.js init --root "$JUMPYBRAIN_SERVER_ROOT"
node dist/cli.js index --root "$JUMPYBRAIN_SERVER_ROOT"
```

For semantic retrieval, provision an embedding GGUF readable by the service user and persist the policy **on the server** before starting:

```bash
node dist/cli.js index --root "$JUMPYBRAIN_SERVER_ROOT" --semantic-model /absolute/models/embedding.gguf
```

Later routine/manual/auto-index runs reuse this policy and unchanged vectors. Remote `index --rebuild` is supported; remote clients cannot set model paths or policy. Older semantic vectors or model changes require explicit rebuild. No implicit model download is part of setup/recall. See [index policy and recovery](technical.md#indexing) before deleting derived state or migrating legacy environment configuration.

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

`GET /health` is intentionally unauthenticated, content-free, and liveness-only; it does not establish retrieval readiness. Every `/memories/all/...` endpoint requires a bearer key.

## 4. Use the minimal web editor

Open the server root in a browser:

```text
https://memory.example.com/
```

Home puts **New note** first, with **Search your memory** as the secondary action and recent notes below. Press **Cmd+K** on macOS or **Ctrl+K** elsewhere (or choose Search), enter the same private API key when prompted, and search indexed note titles and bodies. Choosing a result opens a reloadable `/?note=mem_<uuid>` URL with a full-page WYSIWYG Markdown editor. Page names and body changes autosave through the authenticated document `GET`/`PUT` protocol; renamed titles must be unique (ignoring case and surrounding whitespace). Other metadata and frontmatter remain read-only. Never put the API key in the note query string or a shared link.

Choose **New note** or press **Cmd+Enter** on macOS / **Ctrl+Enter** elsewhere. Cmd/Ctrl+N remains the browser's new-window shortcut. Creation saves a separate note immediately with a readable title and heading such as `2026-09-27_note_1`, then focuses the body after that heading. The date comes from your browser; the server selects the next suffix from existing canonical titles, so two tabs using the same server queue receive different numbers. The shortcut does not create notes inside search, connection, or Dream dialogs or during text composition. No title or tag form is required. Double clicks are suppressed; **Retry new note** reuses the same request/key after a lost response while the tab remains open. Failed saves block creation from the current draft. Blank remote `note` creation is supported; findings, decisions, preferences, wrapups, and local CLI writes still require content.

Type **`[[`** and a title to get inline suggestions without leaving the editor. Up/Down chooses, Enter inserts literal `[[Exact Page Title]]`, and Escape closes without deleting your text; insertion participates in undo and autosave. Touch can scroll the list before tapping a result. **Insert page reference** opens the explicit modal picker; **Cmd/Ctrl+K** remains global search. Suggestions use the existing indexed title/body search, so saved changes may be absent until indexing succeeds. Unsafe/missing titles and duplicates visible in results are rejected, but suggestions cannot guarantee collection-wide uniqueness.

Click an underlined reference, or Tab to it and press Enter, to open its title match. Navigation saves the current draft first and resolves fresh canonical titles (Unicode-normalized, trimmed, case-insensitive), independently of the index. Missing, ambiguous, ID-less, or unavailable targets leave the current draft in place with feedback. Drag selection and keyboard editing remain available; normal-click navigation takes precedence over double-click word selection. Titles are not stable-ID links: renaming can break references and later title reuse can retarget them. No filename fallback, target creation, or rename propagation is performed; graph links still resolve by filename.

Recognition deliberately stays conservative: references spanning formatting are inert; unfinished inline suggestions only open at logical block end. Code examples are excluded, and unsupported quoted/list/indented fences can suppress later references through the rest of the note. Use the explicit picker for intentional insertion elsewhere. Desktop and narrow touch Chromium are automated-tested; physical IME/mobile keyboards, assistive technology, OS clipboard, Safari/Firefox, and physical pinch zoom still require manual validation.

The writing surface uses white backgrounds, warm-grey controls, charcoal text, subtle borders, and visible focus/error states. Headings, bold, and italic render directly as you type, with small formatting controls and Cmd/Ctrl+B/I shortcuts—no preview mode. Files remain Markdown. Unsupported blocks stay visible as dotted-underlined literal text; choose Text or a heading control to explicitly convert a block. Pasted content is plain text, never executable HTML. Unsaved drafts and creation retry keys are held in the current tab, not an offline or crash-recovery store; do not reload a failed/unconfirmed creation before retrying. Server idempotency receipts are not transactionally coupled to canonical file creation, so server crashes between those writes are not covered by the ordinary lost-response retry guarantee.

`/graph` remains available as a secondary explicit-link map. Neither the almost-empty home nor the HTML shell embeds note content or credentials, and the Lexical editor is bundled locally with the Node package, with no CDN or separate frontend service.

From the memory-map toolbar, choose **Consolidate notes (Dream)…**, then **Copy prompt** and submit it to your existing agent. The dialog shows the server origin and today plus the previous two UTC evidence dates, frozen when opened; map filters do not define the scope. Submitting the prompt explicitly authorizes up to two useful dream-page creations/updates and indexing on that memory, without another approval step. Source notes remain untouched by instruction. It limits context to ten sources and bounds follow-up reads/time; a no-op is valid. These are agent instructions, not enforced write permissions or model-cost limits.

Nothing runs when you copy: the agent uses its own account and separately configured CLI/`JUMPYBRAIN_API_KEY`. Browser credentials and note bodies are not included. Missing credentials, unreachable targets (including a different machine's localhost), and read-only policies still block the workflow. If clipboard access fails, select and copy the visible prompt manually. Avoid editing affected dream pages in another tab while the agent works; refresh the map or reopen pages afterward. The browser does not track progress or completion.

Autosave and search indexing are separate: a saved document marks the derived index stale, and new text may not appear in search until indexing succeeds (joined canonical freshness checks run every five minutes by default, including external/git-pull changes even when legacy state says fresh; hosted reads remain nonrepairing and label stale evidence, not a freshness guarantee). The current conflict behavior is intentionally bounded last-write-wins debt: after one stale-hash response the browser reapplies the local body over fresh protected frontmatter and retries once; another conflict stops and requires an explicit retry.

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

The server requires one explicit memory root and one process over one persistent local disk in V1. Authenticated status reports freshness separately from embedding coverage and available retrieval modes, using stats rather than model inference. Partial search fallback is labeled; total failure is not an empty result. Busy cross-process search/index operations reject after five seconds rather than serving reader snapshots. Markdown and `jumpybrain.json` policy survive derived-state deletion; stop operations first. Atomic publication recovery is not a power-loss guarantee; retain canonical backups and follow the [recovery procedure](technical.md#readiness-and-recovery).

Search/index waits are nonblocking and admission-bounded; overload is HTTP 503 and backend deadlines are 504. Default deadlines are 60 seconds/search and 600 seconds/index, configurable on the host with `JUMPYBRAIN_SEARCH_TIMEOUT_MS` / `JUMPYBRAIN_INDEX_TIMEOUT_MS`. Match proxy/client timeouts for long indexing; these limits are not a VPS sizing promise. See [execution and capacity limits](vps-deploy.md#execution-and-capacity-limits).

## Next references

- [Shared-memory protocol and API reference](shared-memory-protocol.md)
- [VPS deployment](vps-deploy.md)
- [Coolify deployment](coolify-deploy.md)
- [CLI commands](cli-commands.md)
- [Installation and updates](install.md)
