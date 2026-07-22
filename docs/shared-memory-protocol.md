# Shared-memory protocol and implementation reference

For operator setup, start with the [shared-memory quickstart](cloud-shared-memory.md). This document is the implementer reference for storage layout, HTTP routes, response shapes, idempotency, graph transport, dream state, errors, and V1 constraints.

Cloud/shared memory keeps the normal jumpyBrain model: Markdown files are canonical, and indexes/support state are rebuildable. The remote server is a small self-hostable HTTP process over one server-local memory root.

V1 is intentionally single-namespace: every remote request addresses `/memories/all/...`.

Remote create endpoints are append-only. Remote document read/update endpoints provide the optimistic-concurrency edit contract for ID-addressed canonical Markdown documents while keeping server filesystem paths private.

## Server command and configuration

The server command is:

```bash
JUMPYBRAIN_SERVER_API_KEYS=<private-host-secret> \
  jumpybrain serve --root /srv/jumpybrain/memory --host 127.0.0.1 --port 3787
```

Equivalent env vars:

```bash
JUMPYBRAIN_SERVER_ROOT=/srv/jumpybrain/memory
JUMPYBRAIN_SERVER_HOST=127.0.0.1
JUMPYBRAIN_SERVER_PORT=3787
JUMPYBRAIN_SERVER_API_KEYS=key-one,key-two
JUMPYBRAIN_PUBLIC_BASE_URL=https://memory.example.com # optional
JUMPYBRAIN_QMD_BIN=/path/to/qmd                     # optional
```

Server startup should fail if the memory root is missing or incompatible. Use an explicit one-time flag to create it:

```bash
jumpybrain serve --root /srv/jumpybrain/memory --init
```

Do not auto-initialize a server root without `--init`.

## Client target and API key

Remote CLI selection is URL-only in V1:

```bash
JUMPYBRAIN_API_KEY=client-key \
  jumpybrain recall --target-url https://memory.example.com --topic "release planning"
```

`--target-url` and `--remote-url` are equivalent. Do not store API keys in committed `jumpybrain.json` files.

An installer-created CLI may mark selected remote origins read-only in device-local `cli-config.json`. For a match, retrieval remains available while all canonical, derived-index, and dream support-state mutations are rejected before credentials, input files, or HTTP requests are touched. Direct commands and `run memory:*` recipes share the same classifier.

This policy is advisory accidental-write protection, not server authorization. A user can bypass it by changing local config, using a different CLI, or calling HTTP directly. Enforce actual access control at the server/proxy layer. Policy identity is the normalized HTTP(S) origin because V1 routes use absolute `/memories/all/...` paths; paths, queries, fragments, default ports, and trailing slashes collapse to the origin, while DNS aliases, redirects, alternate proxy origins, and non-default ports remain distinct.

## Auth

Authenticated endpoints use:

```http
Authorization: Bearer <api-key>
```

`GET /health` is unauthenticated and must not expose memory content or server filesystem paths. All `/memories/all/...` endpoints require auth.

## Canonical disk layout

```text
remote-memory/
  jumpybrain.json
  notes/
  sessions/
  findings/
  decisions/
  preferences/
  pages/
  .jumpybrain/
    qmd/                 # QMD/index/cache derived state when used
    remote/
      index-state.json
      dream-state.json
      dream-batches/
        dream_<uuid>.json
      idempotency/
        <sha256-key>.json
```

Only Markdown under canonical memory directories is memory. `.jumpybrain/remote/` is support/derived state and can be rebuilt or repaired from canonical Markdown where possible. Dream state stores metadata only; full memory bodies are returned only in bounded authenticated batch-context responses.

## Remote-created Markdown frontmatter

Remote-created files use the existing Markdown format plus a file-level `id`:

```md
---
id: "mem_550e8400-e29b-41d4-a716-446655440000"
type: "note"
title: "Example memory"
source: "jumpybrain-remote"
created_at: "2026-06-30T12:00:00.000Z"
updated_at: "2026-06-30T12:00:00.000Z"
confidence: "user-reviewed"
tags: ["example"]
---
```

Rules:

- Generate IDs with `crypto.randomUUID()` and prefix them with `mem_`.
- Include `id`, `type`, `title`, `source`, `created_at`, `updated_at`, `confidence`, and `tags`.
- Use `source: "jumpybrain-remote"` for remote-created notes and wrapups.
- Do not record author names, API-key labels, or secrets in frontmatter for V1.
- File names should be safe, human-readable, and collision-resistant, e.g. `notes/2026-06-30-example-memory-550e8400.md`.
- File creation must be atomic (`wx` semantics): never overwrite an existing Markdown file.

## Index stale state

Remote writes do not synchronously rebuild the index. After each successful remote write, mark the index stale in `.jumpybrain/remote/index-state.json`:

```json
{
  "version": 1,
  "stale": true,
  "lastWriteAt": "2026-06-30T12:00:00.000Z",
  "lastIndexedAt": "2026-06-30T11:30:00.000Z",
  "documents": 42,
  "qmdCollection": "jumpybrain"
}
```

The server auto-indexes stale remote memory every 5 minutes by default. The auto-indexer runs inside the server process, calls the same local runtime indexing code as the HTTP endpoint, and never requires a public self-call, OS cron, or Coolify scheduled job. If an auto-index attempt fails, the server keeps running and tries again on the next 5-minute tick while the state remains stale.

After either the auto-indexer or `POST /memories/all/index` succeeds, set `stale` to `false` and update `lastIndexedAt`, `documents`, and `qmdCollection`. Manual `POST /memories/all/index` remains available for immediate maintenance or diagnostics.

Search and recall responses should include index metadata so the CLI can warn when results may be stale.

## Idempotency

Remote create endpoints require:

```http
Idempotency-Key: <client-generated-key>
```

The CLI generates a new key for each create-command invocation. The current CLI has no automatic retry loop. The server can deduplicate repeated delivery of that same HTTP request and key, but a separately invoked manual retry receives a new key and is not deduplicated against the first invocation. Users do not provide idempotency keys manually.

Store records under `.jumpybrain/remote/idempotency/<sha256-key>.json` without storing the raw key:

```json
{
  "version": 1,
  "keyHash": "sha256:...",
  "requestHash": "sha256:...",
  "method": "POST",
  "path": "/memories/all/notes",
  "result": {
    "id": "mem_550e8400-e29b-41d4-a716-446655440000",
    "file": "notes/2026-06-30-example-memory-550e8400.md",
    "type": "note",
    "title": "Example memory"
  },
  "createdAt": "2026-06-30T12:00:00.000Z"
}
```

Behavior:

- Missing idempotency key: `400 idempotency_key_required`.
- Same key + same effective request: return the original create result.
- Same key + different effective request: `409 idempotency_conflict`.
- A tiny in-process write mutex is enough for V1; document V1 as one Node process over one local disk root.

## HTTP API

All JSON responses use either a success object or this error shape:

```json
{
  "error": {
    "code": "validation_failed",
    "message": "Human-readable message.",
    "details": {}
  }
}
```

### `GET /health`

Unauthenticated liveness check.

```json
{
  "ok": true,
  "service": "jumpybrain-server",
  "version": "0.1.0"
}
```

### `GET /memories/all/status`

Authenticated status for the shared memory.

```json
{
  "memory": "all",
  "canonical": "markdown",
  "initialized": true,
  "compatible": true,
  "index": {
    "stale": false,
    "lastIndexedAt": "2026-06-30T12:00:00.000Z",
    "documents": 42,
    "qmdCollection": "jumpybrain"
  }
}
```

Do not expose the server's absolute filesystem root by default.

### `POST /memories/all/index`

Authenticated rebuild of server-side derived search state.

Request body may be empty:

```json
{}
```

Response:

```json
{
  "memory": "all",
  "root": "remote:all",
  "documents": 42,
  "qmdCollection": "jumpybrain",
  "index": {
    "stale": false,
    "lastIndexedAt": "2026-06-30T12:00:00.000Z",
    "documents": 42,
    "qmdCollection": "jumpybrain"
  }
}
```

### `GET /memories/all/overview`

Authenticated memory overview for CLI `tree`/`overview` rendering. `GET /memories/all/tree` is an alias.

Query parameters:

- `showFiles=1` includes bounded file summaries with relative path, bucket, title, type, tags, timestamps, and indexed status.
- `limit=25` changes the file-summary limit when `showFiles` is enabled.
- `connections=1` includes explicit Markdown/wiki-link graph stats derived from canonical Markdown bodies without returning body snippets.

Response:

```json
{
  "memory": "all",
  "target": "remote",
  "root": "remote:all",
  "canonical": "markdown",
  "documents": 42,
  "buckets": [{ "bucket": "pages", "count": 3, "newest": "2026-07-04T12:00:00.000Z" }],
  "types": [{ "name": "finding", "count": 12 }],
  "tags": [{ "name": "architecture", "count": 4 }],
  "index": {
    "present": true,
    "stale": false,
    "indexedDocuments": 42,
    "qmdCollection": "jumpybrain",
    "unindexedDocuments": 0
  },
  "connections": {
    "nodes": 42,
    "edgeCount": 8,
    "markdownLinks": 3,
    "wikiLinks": 5,
    "unresolvedLinks": 1,
    "orphans": 34,
    "topHubs": [{ "file": "pages/remote-memory.md", "degree": 5 }],
    "edges": [{ "source": "pages/remote-memory.md", "target": "decisions/api.md", "kind": "wiki-link", "count": 1 }]
  },
  "warnings": []
}
```

Remote overview output must never expose the server's absolute filesystem root or memory body content. Connection stats are an explicit-link graph only; they are not marketed as an embedding mesh.

### `GET /graph`

Unauthenticated static browser shell for visualizing and editing graph notes. The page itself is content-free and prompts for an API key, then fetches graph/document data with `Authorization: Bearer <api-key>`. For local-only smoke testing, the API key can be supplied in the URL fragment as `/graph#apiKey=<key>`; fragments are not sent to the server.

Selecting an ID-bearing canonical document opens its rendered Markdown. Click the body or use **Edit Markdown** to edit the body in a plain-text textarea; leading frontmatter remains collapsed and read-only. The browser autosaves after 750 ms of inactivity and on blur, displays `Saving…`, `Saved`, or `Save failed`, and retains failed drafts for manual retry. Each save reconstructs the whole document and uses the existing authenticated `PUT /memories/all/documents/:id` contract with `If-Match`; no PATCH or block-storage model is involved. The backend may canonicalize protected frontmatter independently.

V1 uses a temporary last-write-wins policy: after one `412 precondition_failed`, the browser fetches the latest document, preserves its frontmatter, reapplies the local body, and retries once. A second conflict stops with `Save failed`; visible merge/conflict UX is deferred. Graph nodes, titles, and links remain the loaded snapshot after a body save, so use **Refresh map** to display body-derived graph changes.

The resettable public demo is intended to be a writable sandbox for anyone the deployment currently admits. Unauthenticated browser writes, rate limits, and reseeding are deployment hardening concerns rather than alternate editor or storage behavior.

### `GET /memories/all/graph.json`

Authenticated explicit Markdown/wiki-link graph data for the built-in browser view.

Query parameters:

- `focus=pages/topic.md` limits to a local graph around a file, title, or basename.
- `depth=2` controls local graph traversal depth when `focus` is set.
- `query=release`, `path=pages/`, `type=page`, and `tags=architecture,graph` filter nodes.
- `edgeTypes=wiki-link,markdown-link` filters explicit link edge kinds.
- `includeUnresolved=0` hides virtual unresolved-link targets.
- `includeOrphans=0` hides document nodes with no visible edges.
- `limit=500` caps rendered nodes.

Response nodes use root-relative file IDs for Markdown documents plus virtual `unresolved:<target>` IDs for missing link targets. Edges are directed explicit links; backlinks are derived by reversing these edges. This endpoint is intentionally not an embedding or semantic-similarity map.

### Graph UI smoke validation

`npm run smoke:graph` runs a Playwright browser smoke test against a live server's `/graph` page. It requires Playwright's Chromium (`npx playwright install chromium`) and two environment variables:

- `JUMPYBRAIN_GRAPH_SMOKE_URL` — base URL of the running jumpyBrain server (e.g. `http://localhost:5173`).
- `JUMPYBRAIN_GRAPH_SMOKE_API_KEY` — a valid server API key; passed to the page via the `#apiKey=` fragment (not sent to the server).

The script verifies the graph loads, renders SVG nodes/edges, and that a text-filter reload keeps the graph ready. It does not edit an arbitrary live note. On failure it writes `scripts/graph-ui-smoke-failure.png`.

`npm run smoke:graph-editor` starts an isolated server over a disposable memory root, edits one known ID-bearing fixture through desktop and mobile browser viewports, waits for autosave, and rereads the persisted Markdown. Use this smoke for writable editor validation; it never targets a live memory root.

### `POST /memories/all/search`

Authenticated search.

Request:

```json
{
  "query": "release notes",
  "limit": 10,
  "depth": "normal"
}
```

Response mirrors `SearchMemoryResult` and adds remote/index metadata:

```json
{
  "memory": "all",
  "target": "remote",
  "root": "remote:all",
  "query": "release notes",
  "depth": "normal",
  "index": { "stale": false },
  "results": []
}
```

### `POST /memories/all/recall`

Authenticated recall. `topic` and `query` are both accepted; `topic` is the normal recall wording.

Request:

```json
{
  "topic": "release planning",
  "limit": 5,
  "depth": "shallow"
}
```

Response mirrors search, with `mode: "recall"` for CLI JSON compatibility:

```json
{
  "memory": "all",
  "target": "remote",
  "root": "remote:all",
  "mode": "recall",
  "query": "release planning",
  "depth": "shallow",
  "index": { "stale": false },
  "results": []
}
```

### `POST /memories/all/notes`

Authenticated append-only `remember` write. Requires `Idempotency-Key`.

Request:

```json
{
  "type": "finding",
  "title": "Remote writes are append-only",
  "body": "Durable Markdown memory body.",
  "tags": ["cloud-memory"]
}
```

Allowed `type` values: `note`, `finding`, `decision`, and `preference`. Session files should be written through `/wrapups` in V1.

Response:

```json
{
  "memory": "all",
  "target": "remote",
  "id": "mem_550e8400-e29b-41d4-a716-446655440000",
  "file": "findings/2026-06-30-remote-writes-are-append-only-550e8400.md",
  "type": "finding",
  "title": "Remote writes are append-only",
  "index": { "stale": true }
}
```

### Remote dream consolidation

Dreaming is an explicit CLI-driven consolidation workflow for hosted/shared memory. The server uses the same app dream workflow as local `--root` dreaming, configured for remote-safe output and `.jumpybrain/remote/` state paths. The server does not run AI, call model providers, schedule dreaming, or apply generated edits. It tracks one open batch per memory root, chooses changed canonical Markdown from `notes/`, `sessions/`, `findings/`, `decisions/`, `preferences/`, and `pages/`, and returns bounded remote-safe contexts.

CLI flow:

```bash
JUMPYBRAIN_API_KEY=client-key jumpybrain dream --target-url https://memory.example.com --out dream-batch.json
# local agent reviews dream-batch.json, edits docs with show/update or --apply-manifest, then:
JUMPYBRAIN_API_KEY=client-key jumpybrain dream --target-url https://memory.example.com --complete dream_<uuid> --summary "Reviewed links and synthesis"
```

Cursor semantics are explicit: retrieving or resuming a batch does not advance the dream cursor. Completion advances to the selected batch high-water cursor; abandonment does not. When more files exist than the batch cap, the next batch starts after the completed high-water file so overflow files are not skipped.

Dream endpoints:

- `GET /memories/all/dream/status`
- `POST /memories/all/dream/batches` with optional `maxFiles`, `bytesPerFile`, `maxTotalBytes`, and `force`
- `GET /memories/all/dream/batches/:batchId`
- `POST /memories/all/dream/batches/:batchId/complete`
- `POST /memories/all/dream/batches/:batchId/abandon`

Batch/status responses use `root: "remote:all"`, relative files only, warnings that memory is untrusted context, and metadata such as IDs, hashes, mtimes, truncation flags, and cursors. Status and stored batch metadata do not include memory bodies.

### `POST /memories/all/wrapups`

Authenticated append-only session wrapup write. Requires `Idempotency-Key`.

Related-memory preflight remains a CLI workflow in V1: the remote CLI should call `/recall` first when `--topic` is supplied, show the results, then call `/wrapups`. The create endpoint stores `recallTopic` but does not perform hidden recall.

Request:

```json
{
  "title": "Cloud memory session wrapup",
  "body": "## Findings\n- ...\n\n## Decisions\n- ...\n\n## Conflicts / Corrections\n- None captured.\n\n## Open Questions\n- None captured.",
  "tags": ["cloud-memory"],
  "recallTopic": "cloud memory"
}
```

Response:

```json
{
  "memory": "all",
  "target": "remote",
  "id": "mem_550e8400-e29b-41d4-a716-446655440000",
  "file": "sessions/2026-06-30-cloud-memory-session-wrapup-550e8400.md",
  "title": "Cloud memory session wrapup",
  "recallTopic": "cloud memory",
  "validation": {
    "valid": true,
    "missingSections": [],
    "emptySections": []
  },
  "index": { "stale": true }
}
```

### `GET /memories/all/documents/:id`

Authenticated document read by file-level `mem_<uuid>` ID. The response contains safe remote metadata and must not expose the server's absolute filesystem root. `contentHash` is `sha256:<hex>` over the exact Markdown file bytes currently on disk.

Request:

```http
GET /memories/all/documents/mem_550e8400-e29b-41d4-a716-446655440000 HTTP/1.1
Authorization: Bearer <api-key>
```

Supported CLI workflow:

```bash
JUMPYBRAIN_API_KEY=client-key \
  jumpybrain show --target-url https://memory.example.com --id mem_550e8400-e29b-41d4-a716-446655440000
```

Response:

```json
{
  "memory": "all",
  "target": "remote",
  "root": "remote:all",
  "id": "mem_550e8400-e29b-41d4-a716-446655440000",
  "file": "findings/2026-06-30-remote-writes-are-append-only-550e8400.md",
  "type": "finding",
  "title": "Remote writes are append-only",
  "frontmatter": {
    "id": "mem_550e8400-e29b-41d4-a716-446655440000",
    "type": "finding",
    "title": "Remote writes are append-only",
    "source": "jumpybrain-remote",
    "created_at": "2026-06-30T12:00:00.000Z",
    "updated_at": "2026-06-30T12:00:00.000Z",
    "confidence": "user-reviewed",
    "tags": ["cloud-memory"]
  },
  "content": "---\nid: \"mem_550e8400-e29b-41d4-a716-446655440000\"\ntype: \"finding\"\n...\n---\n\n# Remote writes are append-only\n\nDurable Markdown memory body.\n",
  "contentHash": "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
}
```

Read failures use the shared error shape. Invalid IDs return `400 invalid_id`, unknown IDs return `404 missing_id`, and duplicate IDs return `409 duplicate_id` so operators can repair canonical Markdown instead of the server silently choosing one file.

### `PUT /memories/all/documents/:id`

Authenticated whole-document replacement by file-level `mem_<uuid>` ID. Requests must send JSON and must include `If-Match: <contentHash>` from a prior document read. The request body is intentionally small:

```http
PUT /memories/all/documents/mem_550e8400-e29b-41d4-a716-446655440000 HTTP/1.1
Authorization: Bearer <api-key>
Content-Type: application/json
If-Match: sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

```json
{
  "content": "---\nid: \"mem_550e8400-e29b-41d4-a716-446655440000\"\ntype: \"finding\"\ntitle: \"Edited title\"\n...\n---\n\n# Edited title\n\nRevised durable Markdown body.\n"
}
```

Supported CLI workflow:

```bash
cat revised.md | JUMPYBRAIN_API_KEY=client-key \
  jumpybrain update --target-url https://memory.example.com \
  --id mem_550e8400-e29b-41d4-a716-446655440000 \
  --if-match sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

Update semantics:

- Missing `If-Match` returns `428 precondition_required` with an actionable message to re-read the document before retrying.
- Stale `If-Match` returns `412 precondition_failed`; safe details may include `id`, root-relative `file`, and current `contentHash` but never memory body content.
- Non-JSON requests return `415 unsupported_media_type`; malformed JSON or missing/invalid `content` returns `400 bad_request` or `422 validation_failed` depending on parse versus validation failure.
- The server preserves protected metadata from the existing file (`id`, canonical `type`, `created_at`, `source`, and similar structural fields), refreshes `updated_at`, keeps the same root-relative `file`, writes atomically on the server-local filesystem, and marks the remote index stale.
- Remote update does not require `Idempotency-Key` in the MVP contract; concurrency is guarded by `If-Match`.

Successful response:

```json
{
  "memory": "all",
  "target": "remote",
  "root": "remote:all",
  "id": "mem_550e8400-e29b-41d4-a716-446655440000",
  "file": "findings/2026-06-30-remote-writes-are-append-only-550e8400.md",
  "oldContentHash": "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "newContentHash": "sha256:fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
  "updatedAt": "2026-06-30T12:30:00.000Z",
  "indexed": false,
  "index": { "stale": true }
}
```

## Error codes

| HTTP | Code | Meaning |
| --- | --- | --- |
| 400 | `bad_request` | Malformed JSON, invalid query/body shape, or invalid parameter. |
| 400 | `invalid_id` | Document ID is not shaped as `mem_<uuid>`. |
| 400 | `idempotency_key_required` | Create request omitted `Idempotency-Key`. |
| 401 | `auth_required` | Missing `Authorization: Bearer ...`. |
| 401 | `invalid_api_key` | API key is present but not accepted. |
| 404 | `not_found` | Unknown route or memory collection other than `all`. |
| 404 | `missing_id` | No canonical Markdown document has the requested document ID. |
| 405 | `method_not_allowed` | Known route with unsupported method. |
| 409 | `duplicate_id` | More than one canonical Markdown document has the requested document ID. |
| 409 | `idempotency_conflict` | Same idempotency key used for a different request. |
| 412 | `precondition_failed` | `If-Match` did not match the current document `contentHash`; re-read before retrying. |
| 415 | `unsupported_media_type` | Non-JSON body for JSON endpoint. |
| 422 | `validation_failed` | Valid JSON but invalid memory draft/wrapup/document content. |
| 428 | `precondition_required` | Document update omitted the required `If-Match` content hash. |
| 500 | `index_failed` | Server-side index rebuild failed. |
| 500 | `overview_failed` | Server-side overview/tree generation failed. |
| 500 | `search_failed` | Server-side search/recall failed. |
| 500 | `server_misconfigured` | Server root/API key/QMD configuration is invalid. |
| 500 | `update_failed` | Server-side document replacement failed after validation/precondition checks. |

Never include API keys or memory body content in error messages or logs.

## Deployment notes

Recommended deployment guides:

- [`vps-deploy.md`](vps-deploy.md) for direct systemd + reverse proxy hosting.
- [`coolify-deploy.md`](coolify-deploy.md) for Dockerized hosting with persistent storage.
- [`vercel-deploy.md`](vercel-deploy.md) documents why Vercel is not a supported production target for the V1 memory server.

Safety baseline:

- Run the server on localhost or a private interface; put HTTPS, compression, rate limits, and request-size limits at the reverse proxy.
- Keep API keys only in private host/provider secret storage; do not commit them, pass them in shell history/process arguments for production, or write them to memory Markdown.
- Back up the canonical Markdown memory root. `.jumpybrain/` is support/derived state but can be included in backups for faster recovery.
- Rotate API keys by editing server env/config and restarting the process.
- Run one server process against one local disk memory root for V1; do not horizontally scale this server yet.
- Server auto-indexing is enabled by default and checks stale remote memory every 5 minutes. Manual `POST /memories/all/index` is still useful when operators want an immediate rebuild.
- Server request and operation logs are written to `.jumpybrain/logs/server-YYYY-MM-DD.log` under the memory root. Logs are compact text lines with method/path/status/duration, write/index metadata, and stable error codes. Access logs over SSH or host filesystem tooling; V1 intentionally does not expose a developer logs HTTP endpoint.

## Deferred from V1

- Named target registries/default remote targets.
- Multiple memories, team/project/repo namespaces, RBAC, accounts, invitations, and dashboards.
- Delete operations, path-addressed editing, block IDs, hidden Markdown comments, line/section patches, CRDT/OT, and collaborative editing.
- Client-side remote mirrors or sync engines.
- Multi-process/horizontally scaled server semantics.
