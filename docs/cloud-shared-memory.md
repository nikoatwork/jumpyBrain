# Run your own shared brain

This quickstart runs one authenticated jumpyBrain server against a dedicated, persistent Markdown memory root. For route schemas, response shapes, idempotency, graph transport, dream windows/legacy state, and V1 constraints, use the [shared-memory protocol reference](shared-memory-protocol.md).

## Prerequisites

- Linux or macOS with a POSIX-compatible shell
- Node.js 22.12+, npm, Git, and `curl` or `wget`
- a persistent local filesystem for the server memory root
- a private API key stored in deployment-secret storage
- HTTPS termination before exposing the server beyond a trusted network

For a production-shaped deployment, choose the [VPS guide](vps-deploy.md) or [Coolify guide](coolify-deploy.md). The commands below are a local operator smoke test.

## 1. Install and build

```bash
git clone https://github.com/nikoatwork/jumpyBrain.git
cd jumpyBrain
npm ci
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

These configured bootstrap keys are **administrator** capabilities. Keep them
with the operator. Create a [named key in Settings → Access keys, the browser
or the CLI](collaboration.md#separate-access) for each person and agent; a reader
cannot write, while a writer can publish to this brain. There are no per-note
ACLs. Issuance returns a secret once: redirect it into a new private file with
`umask 077` or capture it in an approved secret manager, then deliver it through
an authenticated private channel. Do not paste it into a ticket, chat, URL,
shell argument, Git, build argument or image. Root filesystem access remains an
operator capability, regardless of protocol role.

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
# Local index commands may have started an on-demand owner. Drain it first.
node dist/cli.js backend stop --root "$JUMPYBRAIN_SERVER_ROOT"
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

Choose **New note** or press **Cmd+Enter** on macOS / **Ctrl+Enter** elsewhere. Cmd/Ctrl+N remains the browser's new-window shortcut. Creation saves a separate note immediately with a readable date title such as `September 27, 2026` (then `September 27, 2026 · 2`) and the heading **How is your day?**, then focuses the body beneath the prompt. The date comes from your browser; the server selects the next suffix from existing canonical titles, so two tabs using the same server queue receive different numbers. The shortcut does not create notes inside search, connection, or Dream dialogs or during text composition. No title or tag form is required. Double clicks are suppressed; **Retry new note** reuses the same request/key after a lost response while the tab remains open. Failed saves block creation from the current draft. Blank remote `note` creation is supported; findings, decisions, preferences, wrapups, and local CLI writes still require content.

Type **`[[`** and a title to get inline suggestions without leaving the editor. Up/Down chooses, Enter inserts literal `[[Exact Page Title]]`, and Escape closes without deleting your text; insertion participates in undo and autosave. Touch can scroll the list before tapping a result. **Insert page reference** opens the explicit modal picker; **Cmd/Ctrl+K** remains global search. Suggestions merge confirmed saves from the current tab with indexed title/body search; other tabs and external changes may need indexing. Unsafe/missing titles and duplicates visible in results are rejected, but suggestions cannot guarantee collection-wide uniqueness.

Click a page reference, or Tab to it and press Enter, to open its title match. Navigation saves the current draft first and resolves fresh canonical titles (Unicode-normalized, trimmed, case-insensitive), independently of the index. In the hosted browser, missing, ambiguous, ID-less, or unavailable targets leave the current draft in place with feedback. Drag selection and keyboard editing remain available; normal-click navigation takes precedence over double-click word selection. Titles are not stable-ID links: renaming can break references and later title reuse can retarget them. Browser navigation has no filename fallback or rename propagation; graph wiki links use the same eligible metadata titles before legacy filename/ID fallback.

In the **Mac app**, `@` also opens the page picker and inserts the same `[[Exact Page Title]]` links. On a writable connection, opening a missing reference creates a page under `pages/` and opens it. Newly completing a valid reference by typing or pasting creates its target after the source body is fully saved, while keeping you in the source note. New pages contain their title heading with no placeholder text. Existing title matches are reused; ambiguous or unopenable titles are refused. Opening an old note or receiving an external edit does not create its unresolved links. Read-only connections cannot create pages. If creation cannot be confirmed, use **Retry page creation** or edit/remove the reference before leaving the note; retry checks the fresh canonical title. Undoing a source edit does not delete an already created page.

Recognition deliberately stays conservative: references spanning formatting are inert; unfinished inline suggestions only open at logical block end. Code examples are excluded, and unsupported quoted/list/indented fences can suppress later references through the rest of the note. Use the explicit picker for intentional insertion elsewhere. Desktop and narrow touch Chromium are automated-tested; physical IME/mobile keyboards, assistive technology, OS clipboard, Safari/Firefox, and physical pinch zoom still require manual validation.

Write checklists with `- [ ] ` or `- [x] `, or use **Task checkbox**. Click a checkbox or focus it and press Space/Enter. Enter continues the checklist; Enter on an empty task returns to text, and Backspace at the start removes its checkbox. Nested tasks use two-space steps (up to six spaces) directly after another task. Ordinary lists and ambiguous imported task syntax stay literal.

Wrap inline code in matching backticks, or use **Inline code**. For a code block, type three backticks and an optional language such as `js`, then press Enter, or use **Code block**. Enter adds a newline, Tab inserts a tab, and Ctrl/Cmd+Enter continues below the block. Imported closed backtick fences at column zero support simple language labels; unsupported/unclosed fences stay literal. Code keeps tabs, blank lines and literal Markdown/HTML/page-reference text without executing it or creating linked pages. Edited supported lines may normalize delimiters; untouched source is preserved. Tables remain literal Markdown for now.

The writing surface uses white backgrounds, warm-grey controls, charcoal text, subtle borders, and visible focus/error states. Headings, bold, and italic render directly as you type, with small formatting controls and Cmd/Ctrl+B/I shortcuts—no preview mode. Files remain Markdown. Unsupported blocks stay visible as literal text without decorative underlines; choose Text or a heading control to explicitly convert a block. Pasted content is plain text, never executable HTML. Disconnected note drafts can persist in the originating browser profile, subject to storage availability and explicit recovery checks; see [drafts and recovery](collaboration.md#drafts-conflicts-and-files). Export them before migration or clearing browser data. Creation retry keys remain tab-local; do not reload a failed/unconfirmed creation before retrying. Server idempotency receipts are not transactionally coupled to canonical file creation, so server crashes between those writes are not covered by the ordinary lost-response retry guarantee.

`/graph` remains available as a secondary map of explicit links and strong related-note connections when semantic indexing is ready. Solid and dashed lines distinguish the two. Neither the almost-empty home nor the HTML shell embeds note content or credentials, and the Lexical editor is bundled locally with the Node package, with no CDN or separate frontend service.

From the memory-map toolbar, choose **Consolidate notes (Dream)…**, then **Copy prompt** and submit it to your existing agent. The dialog shows the server origin and today plus the previous two UTC evidence dates, frozen when opened; map filters do not define the scope. Submitting the prompt explicitly authorizes up to two useful dream-page creations/updates and indexing on that memory, without another approval step. Source notes remain untouched by instruction. It limits context to ten sources and bounds follow-up reads/time; a no-op is valid. These are agent instructions, not enforced write permissions or model-cost limits.

Nothing runs when you copy: the agent uses its own account and separately configured CLI/`JUMPYBRAIN_API_KEY`. Browser credentials and note bodies are not included. Missing credentials, unreachable targets (including a different machine's localhost), and read-only policies still block the workflow. If clipboard access fails, select and copy the visible prompt manually. Avoid editing affected dream pages in another tab while the agent works; refresh the map or reopen pages afterward. The browser does not track progress or completion.

Autosave and search indexing are separate. Confirmed saves from the current tab are immediately searchable in a bounded tab-local cache. Owned local and hosted engines coalesce incremental background work after writes (five-second quiet period, thirty-second maximum scheduling deferral) and reconcile external edits every five minutes. Work duration can be longer, especially for semantic indexing. The visible graph/search adopts a confirmed fresh generation automatically. **Refresh search index** remains a recovery action; hosted reads remain nonrepairing and remote client permissions do not change.

Conflicting saves retain your draft and never overwrite another writer automatically. Choose **Recover draft** to compare it with the saved note, copy your draft, or explicitly discard it and load the current saved version. **Copy draft** falls back to selectable text if clipboard access fails.

**Delete note…** saves pending edits and previews the selected title and known inbound links. Confirming permanently removes one Markdown file; there is no Trash or Undo. Keep your own backup/Git history. Existing links are not rewritten, and index refresh remains separate from successful removal. Read-only companion connections cannot delete.

## 5. Connect an installed CLI

Keep the client key in the CLI process environment and provide the server base URL:

```bash
export JUMPYBRAIN_API_KEY='<private-client-secret>'
jumpybrain status --target-url https://memory.example.com
jumpybrain recall --target-url https://memory.example.com --topic "current project decisions" --limit 5
```

`--target-url` and `--remote-url` are equivalent. The CLI uses `JUMPYBRAIN_API_KEY` from the environment first, then the key the Mac app saved for the same URL in `~/.config/jumpybrain/.env`, then `JUMPYBRAIN_API_KEY` written in that file ([details](cli-commands.md#remote-access-keys)). A shell/agent host can inject an issued key from its secret manager into `JUMPYBRAIN_API_KEY`.

An installer-created CLI can mark a remote origin read-only in device-local `cli-config.json`. That is accidental-write protection, not server authorization. Enforce access at the server or reverse proxy.

### When the server rejects the key

`status --target-url` prints which key it used (`Access key: JUMPYBRAIN_API_KEY from the environment (46 chars, ends …x9Qz), accepted`). On HTTP 401 every remote command names that source and fingerprint, lists other keys it found but did not use, and gives the recovery steps; keys themselves are never printed. A common cause is an old `export JUMPYBRAIN_API_KEY=...` in `~/.zshenv` or `~/.zshrc` that silently overrides the key saved in the app. To recover, have an admin issue a replacement (see [Rotate and revoke](#rotate-and-revoke-deliberately)), then update or unset that export, or re-enter the key in the app, and re-run `status`. The server's answer does not distinguish a mistyped key from a revoked one or one issued by a different server.

## 6. Verify the deployment

```bash
curl -fsS https://memory.example.com/health
JUMPYBRAIN_API_KEY='<private-client-secret>' jumpybrain status --target-url https://memory.example.com
JUMPYBRAIN_API_KEY='<private-client-secret>' jumpybrain tree --target-url https://memory.example.com --limit 20
```

The server requires one explicit memory root and one owner over one persistent
local disk. Authenticated status reports freshness separately from embedding
coverage and available retrieval modes, using stats rather than model inference.
Partial search fallback is labeled; total failure is not an empty result. Busy
cross-process search/index operations reject after five seconds rather than
serving reader snapshots. Markdown and `jumpybrain.json` policy survive removal
of specifically identified derived index state; stop operations first and retain
access/recovery data. Atomic publication recovery is not a power-loss guarantee;
retain canonical backups and follow the [recovery procedure](technical.md#readiness-and-recovery).

Search/index waits are nonblocking and admission-bounded; overload is HTTP 503 and backend deadlines are 504. Default deadlines are 60 seconds/search and 600 seconds/index, configurable on the host with `JUMPYBRAIN_SEARCH_TIMEOUT_MS` / `JUMPYBRAIN_INDEX_TIMEOUT_MS`. Match proxy/client timeouts for long indexing; these limits are not a VPS sizing promise. See [execution and capacity limits](vps-deploy.md#execution-and-capacity-limits).

## Rotate and revoke deliberately

For an issued credential, issue a replacement with the required reader/writer
role using [Separate access](collaboration.md#separate-access), deliver it
privately, and verify authenticated status and permitted operations with that
credential. Switch the intended clients, then revoke the **old credential ID**.
Check that the old key fails authenticated status with HTTP 401, the new key
still succeeds, and a reader's attempted mutation is denied with HTTP 403.
Public `/health` succeeding with an old key is expected and proves nothing about
revocation. Existing browser cookies and live sockets are revalidated; reconnect
with the replacement key. Revocation does not erase already downloaded notes or
save an offline private draft.

Configured bootstrap keys have no issued credential ID and cannot be revoked
through `access revoke`. To rotate one without locking yourself out, place old
and new keys in the comma-separated `JUMPYBRAIN_SERVER_API_KEYS` secret, recreate
or restart the **single** owner, and verify both against authenticated status.
Move operator clients to the new key. Remove the old key from deployment secrets,
recreate/restart again, and verify old-key 401 plus new-key success. A Docker
restart alone reuses its original environment; recreate the container to change
it. Remove old environment files, disabled service definitions and redeployment
secrets as well. Never start two server replicas over the same root during a
rotation. A compromised key should be revoked/removed promptly, accepting the
required client reconnects rather than extending an overlap window.

## Drain writers before migration or replacement

Inventory the canonical absolute root and every route that can write it:
systemd units/drop-ins, Docker/Coolify containers and replicas, automatic
redeployments, detached local backends, Mac app tabs, agents/CLI jobs, scheduled
imports/index jobs, library integrations, raw-file editors and sync/backup tools.
Include old hosts, retired volumes and old credentials that could restart a
writer later. A target URL is not a second synchronized copy of a personal brain.

1. Announce a maintenance window. Wait for Saved, resolve uncertain writes and
   save/export disconnected browser drafts. Pause agents and raw-file writers;
   closing a Mac window alone leaves its backend running.
2. Disable service/container restart and automatic deployment triggers. Stop the
   relevant manager before running the existing [coordinated upgrade
   helper](../README.md#upgrade-with-your-agent). Its `prepare` operation stops
   an authenticated root owner; it cannot stop unknown legacy services, remote
   machines or raw filesystem writers. Check the actual units/containers and
   root-owner status; never infer ownership from a port or PID alone.
3. Create and verify a private backup outside the brain, retain the previous
   software/image digest, and migrate storage only while all writers are paused.
   Never bring both the old and new mounts online as writable copies.
4. Upgrade the server runtime/image separately from each client CLI, app and
   agent integration. Updating a client does not update the server. Protocol 2
   requires coordinated compatible clients; verify the intended versions/builds
   before reconnecting. Container packaging changes require a rebuilt image.
5. Verify canonical bytes/policy/access state, ownership and mounted persistence;
   index and recall a known note. Test editing on a disposable copy, reconnect
   clients, then re-enable the one intended manager. Retire obsolete mounts,
   deployment definitions and bootstrap secrets after the retention decision.

## Backups and recovery

An installer replacement backup or a volume renamed during cutover is a
one-time rollback aid. It is not recurring off-host protection. Schedule private,
encrypted, retained off-host backups, monitor failures and periodically restore
them into an isolated fixture. Quiesce all writers or use a consistent storage
snapshot; copying files while edits continue is not a verified point-in-time
backup. Keep encryption keys recoverable outside the failed host.

Preserve canonical Markdown, `boards/` JSON, `jumpybrain.json` and other deliberate
brain files. `.jumpybrain/access.json` (hashed named credentials/revocations) and
`.jumpybrain/recovery/` (retained source copies) are unique private operational
data. Do not delete all of `.jumpybrain` as cache. Derived index/embedding state
can be rebuilt; backend leases/descriptors and live history should not be
reactivated from a backup. Browser drafts live in their original browser profile
and must be exported separately. Back up deployment secrets, service/proxy
configuration and provisioned GGUFs through their own private backup policy;
the brain helper does not copy them.

Use `scripts/multiplayer-upgrade.mjs` as documented in the README for private,
checksum-verified prepare/verify and missing-file restoration. It binds its
manifest to the **original absolute root**, omits derived state and refuses to
overwrite changed files or changed/revoked access state. It is not a general
cross-path migration tool. Exercise it on a disposable root first. For off-host
recovery, restore your verified snapshot to an isolated host at the expected
path, with no old service/client traffic, and re-issue/revoke credentials before
exposure if the snapshot predates revocations. Do not roll live access state
back to re-enable a retired key.

After restoration, verify checksums and private operational permissions, rebuild
the index with the intended service identity, check authenticated readiness and
nonempty recall, and compare canonical source bytes before admitting writers.
Health alone cannot establish recovery. The [container smoke](coolify-deploy.md#clean-context-container-gate)
exercises full loss/restore only on a disposable Linux root; it does not test
your off-host storage, encryption, reverse proxy or disaster recovery process.

## Next references

- [Shared-memory protocol and API reference](shared-memory-protocol.md)
- [VPS deployment](vps-deploy.md)
- [Coolify deployment](coolify-deploy.md)
- [CLI commands](cli-commands.md)
- [Installation and updates](install.md)
