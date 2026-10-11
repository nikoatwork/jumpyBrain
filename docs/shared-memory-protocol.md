# Shared-memory protocol and implementation reference

For operator setup, start with the [shared-memory quickstart](cloud-shared-memory.md). This document is the implementer reference for storage layout, HTTP routes, response shapes, idempotency, graph transport, dream windows/legacy state, errors, and V1 constraints.

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

An installer-created CLI may mark selected remote origins read-only in device-local `cli-config.json`. For a match, retrieval remains available while all canonical, derived-index, and dream support-state mutations are rejected before credentials, input files, or HTTP requests are touched. The read allowlist includes compact recall/search and `expand`, including `run memory:expand`. Direct commands and `run memory:*` recipes share the same classifier.

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
    index.json           # published generation manifest
    qmd-cache/qmd/       # transactional QMD SQLite state
    qmd-config/          # derived CLI collection/model configuration
    remote/
      index-state.json
      dream-state.json   # legacy batch APIs only
      dream-batches/     # legacy batch APIs only
        dream_<uuid>.json
      idempotency/
        <sha256-key>.json
```

Only Markdown under canonical memory directories is memory. `.jumpybrain/remote/` is support/derived state and can be rebuilt or repaired from canonical Markdown where possible. Legacy dream state stores metadata only. Stateless dream window reads ignore it and do not create or modify support state; bounded authenticated context responses carry bodies.

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
- File creation stages and fsyncs complete bytes, then publishes with an exclusive same-directory hardlink: never expose a partial final Markdown file or overwrite an existing one. Unsupported hardlinks fail closed. Directory identities are rechecked; directory fsync is best-effort. Crashes can leave hidden staging, and external ancestor swaps remain outside this guarantee.

## Backend execution limits

Index/search/recall/compact recall share bounded async backend admission: one active operation per root, two process-wide, sixteen queued. Queue saturation/cross-process busy returns **503 `execution_overloaded`**, total deadline exhaustion **504 `execution_timeout`**, connected cancellation **499 `execution_aborted`**. Failed backend operations remain errors, not empty results; independently successful query branches may retain the existing labeled fallback. Disconnect/shutdown cancels owned work; an individual joined index caller does not cancel peers. Interrupted jobs leave readiness/remote freshness stale. No query bodies, credentials, stderr or server paths appear in these diagnostics.

Deadlines are server-local configuration, not request JSON fields: search/compact 60 seconds, index 600 seconds by default; query commands additionally 30 seconds. Body/header receipt has a separate 30-second Node timeout. See [technical execution contract](technical.md#bounded-retrieval-execution) for capture caps, shutdown/process-group portability and non-preemptible input-work limits.

## Creation outcomes and strict observational reads

Append-only notes/wrapups preserve old fields and add `saved:true`, canonical `id`/`file`, `indexed:false`, and `indexing.status: pending | failed` (hosted indexing is deferred). Post-save derived-index bookkeeping or replay-record persistence failure returns the saved identity with safe diagnostics and HTTP success, never a misleading creation failure. `creation_replay_failed` warns that repeating creation/reusing its key may not be safe. Canonical errors and pre-save replay lookup errors still fail; this does not make Markdown and replay storage a transaction or resolve abrupt crash/lost-response uncertainty.

Rich search/recall and compact recall accept optional boolean `readOnly`. Authenticated status advertises `readOnlyRetrieval: "lexical-immutable-v1"`; supported clients preflight it before querying, within their existing deadline. Strict retrieval never acquires/reaps locks, initializes schema/cache, recovers publication or runs models. It uses pinned QMD lexical APIs with immutable read-only SQLite and refuses any nonempty WAL, lock, pending marker, missing/mismatched/corrupt or changed generation. This is change detection, not a snapshot. Successful warnings include `read_only_index` and semantic omission when applicable; no ordinary fallback. Safe `read_only_busy`/`read_only_changed` errors use 503, other prerequisite errors 409.

Unconstrained successful empty discovery may use at most two meaningful singleton lexical queries in spare slots of the existing eight-call budget; partial `keyword_query_relaxed` reports topic relaxation, never full-answer completeness. Strict matches/constraints/depth/root/temporal policy remain intact; token-only temporal backfill is suppressed for constrained queries.

## Index stale state

Remote writes do not synchronously update the index. After each successful remote write, mark the index stale in `.jumpybrain/remote/index-state.json`:

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

After either the auto-indexer or `POST /memories/all/index` succeeds, update `lastIndexedAt`, `documents`, and `qmdCollection`. Clear `stale` only if covered: writes during the run or stale local readiness keep it true. Failure never marks a generation fresh. Manual indexing remains available for immediate maintenance.

Status/index/search retain legacy `index` metadata and add safe `readiness`: `freshness` (`missing|fresh|stale|unknown`), `modes` (available `lexical`/`semantic`), `embedding` (`disabled|complete|incomplete|unknown`), and optional `lastFailure: { code, at }` (`index_failed` or `interrupted_update`). No model paths/hashes, credentials, backend stderr, or server roots are included. Status scans file/manifest stats without model inference/download; it is not a DB-integrity probe.

Search/recall also add `retrieval: { status: "complete" | "partial", warnings: string[] }`. Warnings can include `index_not_fresh`, `semantic_coverage_incomplete`, `lexical_query_failed`, `semantic_query_failed_lexical_fallback`, or `dream_query_failed`. Intentional lexical mode is not an outage. Total ordinary-backend failure is HTTP 500 `search_failed`, not an empty `results` array; title supplements cannot conceal it. Index results add `work: { added, updated, unchanged, removed, embedded }`, with embeddings counted as chunks.

The same [local lifecycle/recovery rules](technical.md#indexing) govern remote work: persistent server-local policy, transactional reuse/rollback, pending publication recovery on next search/index, and a five-second busy PID lock rather than cross-process reader snapshots. One server process per root remains the deployment boundary.

## Idempotency

Remote create endpoints require:

```http
Idempotency-Key: <client-generated-key>
```

The browser's New note flow retains the exact request and key for retries of an unconfirmed creation within the current tab. This does not provide reload/crash recovery. Canonical creation and idempotency-receipt persistence are separate writes; a server crash between them can still permit a duplicate on retry.

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

Authenticated incremental update of server-derived state using its persisted `jumpybrain.json` policy. Request body may be empty or `{}`; `{ "rebuild": true }` explicitly regenerates vectors/query cache in-place. `rebuild` must be boolean. All other fields, including model paths/indexing policy, are rejected with 400; configure policy on the server-local root. Rebuild is not SQLite corruption repair.

Default request:

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

### `GET /` and `GET /graph`

These unauthenticated browser entrypoints serve the same content-free, nonce-CSP-protected HTML shell. The shell contains no API key, filesystem path, note title, metadata, or body. The Node package serves HTML, CSS, and locally bundled vanilla Lexical JavaScript under the nonce; no React, CDN, separate frontend service, or asset deployment is required.

`/` is the primary entrance. A prominent **New note** action (Cmd/Ctrl+Enter) sits above secondary **Search your memory** (Cmd/Ctrl+K), followed by recent notes. Typing a non-empty query sends a debounced, authenticated `POST /memories/all/search` across the indexed canonical collection, including notes, pages, and sessions. Search can match titles or bodies. Result navigation must use the validated canonical document ID in `provenance.metadata.id`, not the distinct QMD search-hit `id`.

The **New note** buttons on home/editor create a separate dated note using the existing authenticated idempotent notes POST. Cmd/Ctrl+Enter invokes the same guarded creation flow before the rich editor handles Enter; browser New Window/Tab chords remain untouched. Repeated keydown, composition, shifted/Alt chords, and creation inside dialogs are ignored. The browser sends its local `dailyDate`; the server allocates a readable `YYYY-MM-DD_note_N` title, also emitted as a heading by the app writer. Creation is immediate and the editor focuses after that heading. A failed current save blocks creation. Double clicks are suppressed, and unconfirmed creates retain the same request/key for Retry new note within the tab. Reload recovery and crash-atomic receipt storage are not guaranteed.

Selecting a result opens `/?note=mem_<uuid>` as a reloadable, full-page WYSIWYG Markdown editor. The page name is editable, other document metadata is read-only, leading frontmatter remains outside the rich editor, and the browser uses authenticated `GET` and `PUT /memories/all/documents/:id` requests. API keys must never appear in `?note=` or other query parameters or generated note links. The shell prompts for the API key and reuses it only for authenticated data requests; for local-only smoke testing it may be supplied in the URL fragment as `/#apiKey=<key>` or `/graph#apiKey=<key>`, because fragments are not sent to the server.

Typing `[[` opens caret-anchored inline suggestions, using independent `createNoteSearch` state over the same authenticated indexed search transport; **Insert page reference** retains the explicit modal picker and Cmd/Ctrl+K retains global navigation search. Both insertion flows preserve exact title punctuation, use Lexical undo, never mutate/navigate targets, and reject unsafe/missing or visibly duplicate titles. Inline acceptance revalidates the current single-leaf range and document/credential session; Escape is non-destructive. Modal/document/credential/read-only transitions cancel pending suggestions; actual saves mark their index feedback stale. Listbox relationships/live announcements and tap-versus-scroll keep the editor focused.

Normal-click or keyboard-activated references pass the save/history guard, then POST to canonical title lookup and prefetch the ID-addressed target. Only a validated target payload replaces the editor; missing/ambiguous/unopenable outcomes, auth/GET failures, or changed targets retain the source draft. Repeated activation is suppressed and modal/credential/history changes invalidate delayed responses. Target prefetch is reused on route apply, not fetched again. Renames/title reuse can break or retarget title links; the existing graph resolver remains filename-based. Drag selection/copy and keyboard editing remain supported; double-click word selection loses to the first normal navigation click.

The bounded recognizer excludes code, escaped/nested/alias/path references and formatted cross-leaf spans from activation. Unfinished autocomplete requires logical block end; explicit insertion can fall back to a collapsed caret without consuming partial formatted siblings. Unclosed inline backticks and unsupported quote/list/indented fence contexts suppress the remaining document. Inert references still retain literal serialization: eligibility cannot add escapes to graph targets. These conservative false negatives are intentional, not full Markdown-dialect support.

Home/editor/dialogs share white surfaces and warm-grey controls, with a borderless proportional-font editor and visible navigation focus/error feedback. Production automated validation covers Chromium desktop/narrow touch, synthetic composition, editor clipboard events, touch scrolling, wrapped-line/scroll/clipping and simulated visual-viewport zoom. Physical IME, mobile keyboard, OS clipboard, real assistive technology, Safari/Firefox and physical pinch zoom remain manual rollout gates.

The editor autosaves after 750 ms of inactivity and on blur, displays understated `Saving…`, `Saved`, `Save failed`, or retry feedback, and retains failed drafts for manual retry. Each save reconstructs the whole document and uses `If-Match`; there is no separate PATCH or block-storage model. Page-name changes update title metadata without rewriting filenames, headings, or references. Renames are checked against canonical Markdown (not the search index), with case/whitespace/Unicode-equivalent duplicate names rejected as `409 duplicate_title`. Existing duplicate names can still receive body-only edits. Correcting a rejected name resumes autosave without losing the draft. A successful save marks the derived search index stale rather than synchronously rebuilding it, so recently saved body content may remain absent from search until indexing succeeds (the default check interval is five minutes, not a freshness guarantee). Search responses expose index freshness; confirmed local writes also mark the open palette stale, so an older search response cannot imply that `Saved` means indexed.

V1 retains the bounded temporary last-write-wins debt: after one `412 precondition_failed`, the browser fetches the latest document, preserves its frontmatter, reapplies the local body, and retries once. A second conflict stops with `Save failed`; visible merge/conflict UX is deferred.

`/graph` and `/graph/` remain compatible secondary entrypoints for the optional explicit-link map. Graph nodes, titles, and links are a loaded snapshot after a body save, so refresh the map to display body-derived graph changes. The graph is not fetched or laid out merely by arriving at the almost-empty home or directly opening a note URL.

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

`npm run smoke:page-references` builds and runs production editor preservation/context regressions, isolated autocomplete/controller checks with stub transport, and real disposable-root/QMD/server integration (navigation, save failures, cancellation, history, search freshness, insertion and touch scrolling). Set `JUMPYBRAIN_REFERENCE_SMOKE_BENCH=1` for small/large-note app timings, or `JUMPYBRAIN_REFERENCE_EDITOR_BENCH=1` for isolated editor timings. Historical feasibility entrypoints forward to these production runners; no second editor is maintained.

`npm run smoke:lexical` checks formatted heading/emphasis editing, toolbar undo, Markdown preservation (including edits within unsupported blocks), exact reference titles, empty-document history isolation, safe paste, and desktop/mobile layout in a disposable root. It needs no QMD index. Set `JUMPYBRAIN_SMOKE_SCREENSHOT_DIR` to retain screenshots. Unsupported syntax stays literal; edited supported lines may normalize delimiters. This is a deliberately small Markdown subset, not a general rich-document conversion guarantee.

`npm run smoke:daily-capture` runs disposable-root Chromium desktop/mobile checks for dated creation, auth, lost-response retries, duplicate suppression, reference insertion/editor undo, autosave failures, and saved-note discovery after explicit indexing. `JUMPYBRAIN_SMOKE_SCREENSHOT_DIR` optionally retains screenshots. Automated key events verify app handling, not delivery by every headed browser/OS; Safari, Firefox, physical devices, and OS-level shortcut reservations require separate QA.

`npm run smoke:graph` runs a Playwright browser smoke test against a live server's `/graph` page. It requires Playwright's Chromium (`npx playwright install chromium`) and two environment variables:

- `JUMPYBRAIN_GRAPH_SMOKE_URL` — base URL of the running jumpyBrain server (e.g. `http://localhost:5173`).
- `JUMPYBRAIN_GRAPH_SMOKE_API_KEY` — a valid server API key; passed to the page via the `#apiKey=` fragment (not sent to the server).

The script verifies the graph loads, renders SVG nodes/edges, filters metadata, and opens a valid canonical node full-page without writing. Optional `JUMPYBRAIN_GRAPH_SMOKE_NODE_ID` chooses a specific root-relative graph node. On failure it writes `scripts/graph-ui-smoke-failure.png`.

`npm run smoke:graph-editor` starts an isolated server over a disposable memory root and real QMD index. Desktop and mobile flows exercise empty-home entry, title/body search, full-page editing, persistence, caret/scroll stability, modal focus, durable URLs, Back/Forward, stale-index feedback, failed-save/undo recovery, and mobile authentication recovery. It also runs the read-only graph smoke against that same fixture server. It never writes to a live memory root. Set `JUMPYBRAIN_SMOKE_SCREENSHOT_DIR` to an output directory to retain fixture screenshots for visual review.

Browser Back/Forward restores the current history entry before a pending-save flush and replays the traversal only on success. Failed drafts remain reachable with Retry. After an unconfirmed write, even undoing to the previously saved body still requires Retry: a failed network response may hide a committed server write. Closing search preserves rich-editor focus, caret, and scroll; title/frontmatter are never interpreted as browser HTML.

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
  "results": [
    {
      "id": "qmd-c2VhcmNoLWhpdC1pZGVudGl0eQ",
      "score": 0.82,
      "snippet": "Release notes are stored in the canonical page.",
      "provenance": {
        "file": "pages/releases.md",
        "lineStart": 10,
        "lineEnd": 10,
        "metadata": {
          "id": "mem_550e8400-e29b-41d4-a716-446655440000",
          "title": "Release notes"
        }
      }
    }
  ]
}
```

Search runs against the real derived index across every canonical memory bucket; retrieval depth shapes ranking rather than limiting search to graph nodes or `notes/`. Indexed frontmatter enables title-only matches, while canonical Markdown enables body matches. A result's top-level `id` identifies the QMD hit and may represent a passage, so it is deliberately distinct from the canonical document ID. Document readers/editors must validate and use `provenance.metadata.id`; if that field is absent or invalid, the result is searchable evidence but cannot safely become an ID-addressed editor link.

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

### Temporal retrieval options

Rich `/search`, `/recall`, and `/recall/compact` accept optional `temporal: { from?, to?, referenceDate?, order? }`. Values are real ISO dates or timezone-explicit timestamps with at most three fractional-second digits (millisecond precision); `t-Nd` bounds require an explicit `referenceDate` UTC date. `order` is `relevance` (default) or `chronological`; a bound or chronological order is required. Unknown temporal keys, malformed dates/types, and empty/reversed intervals return static safe **400 `invalid_temporal`** errors before search.

An explicit temporal response includes:

```json
{
  "temporal": {
    "interval": { "basis": "evidence", "timezone": "UTC", "from": "2025-01-01T00:00:00.000Z", "toExclusive": "2025-01-09T00:00:00.000Z", "order": "chronological" },
    "coverage": { "eligibleDocuments": 12, "excludedUndated": 2, "excludedInvalid": 1, "backfillBudget": 10, "backfilledDocuments": 3, "unvisitedDocuments": 0 }
  }
}
```

Bounds resolve to a half-open UTC interval. Date-only `to` includes its entire day; timestamp `to` is exclusive. `referenceDate` is echoed when supplied; absent bounds remain absent. Evidence provenance is `{ basis: "declared" | "filename", value }` or `{ basis: "unknown", reason: "missing" | "invalid" | "synthesis" }`, never creation/mtime or inferred fact-validity. Coverage counts describe bounded manifest discovery, not matching claims or guaranteed complete answers; honor `retrieval` partial warnings and readiness.

New rich and compact clients validate returned interval fields against local `resolveTemporalQuery`, including order/reference date. A missing or mismatched scope is unsupported, with upgrade guidance and **no unfiltered fallback**, including old servers that silently ignore the request field. Compact schemas additionally reject unsolicited temporal additions and validate evidence dates against the requested interval.

### `POST /memories/all/recall/compact`

Authenticated, additive read endpoint for CLI `recall --compact` and `search --compact`. Existing `/recall`, `/search`, text, and rich JSON contracts are unchanged. Agents use the CLI, not HTTP directly.

Request fields (unknown fields, including caller-supplied roots, are rejected):

```json
{ "query": "release planning", "limit": 5, "depth": "normal", "maxBytes": 8192, "diagnostics": false }
```

`query` is required (not `topic`); optional `limit` is a positive integer, `depth` is `shallow|normal|deep`, `diagnostics` is boolean, optional boolean `readOnly` follows the strict observational contract, and optional `temporal` follows the contract above. The CLI maps recall topics to `query`; its defaults remain 5 recall results and 10 search results.

Both bounded endpoints return their version-1 packet directly, **without a remote wrapper**, using `JSON.stringify(packet) + "\n"` and `Cache-Control: no-store`. `maxBytes` is an integer **1024–65536**, default **8192**, capping actual serialized UTF-8 bytes, not tokens. The entire successful envelope, JSON escaping, diagnostics, and trailing LF count; HTTP headers and error packets do not. Compact CLI stdout uses the same framing even without `--json`, with no banners.

Compact packet fields:

| Field | Contract |
| --- | --- |
| `version`, `kind` | `1`, `"recall"` for both compact recall and search. |
| `query`, `depth`, `maxBytes` | Effective request and byte cap. |
| `scope`, `partial` | `"selected_passages"`, `true`: never a complete-document/answer assertion. |
| `readiness`, `retrieval` | Safe readiness and retrieval status/warnings, as above. |
| `temporal` | Only for an explicit temporal request: resolved `interval` and `coverage` above. |
| `passages` | Ordered selected evidence units; oversized units are skipped, not shortened by the packer. |
| `omitted` | `{ results, passages }`: candidate-relative omissions, including upstream passage omissions, not unseen corpus coverage. |
| `diagnostics` | Opt-in `{ candidateResults, candidatePassages, budgetOmittedPassages }`; consumes the same budget. |

Each passage contains:

- `filePath`, `pathBasis: "canonical_root" | "index_root"`, inclusive 1-based `startLine`/`endLine`, `text`, `scope: "excerpt"`, and `partial: true`. Paths are relative to the stated basis, never server absolute roots.
- `date: { basis: "written", value, field: "created_at" | "createdAt" }` from valid creation metadata, otherwise `{ basis: "unknown" }`. This written date never falls back to evidence-date, filename, or mtime.
- Only for an explicit temporal request: `evidenceDate` as above and optional `relationships: { conflicts_with?: string | string[], supersedes?: string | string[] }`. Preserve source declarations verbatim; never infer or resolve relations. Temporal candidate verification omits changed frontmatter/body-start coordinates and incomplete headers (including ID-less sources) with a partial `source_changed` warning; compact hash verification additionally rejects newly changed evidence. These fields count toward the same budget; oversized declarations can omit the entire passage.
- Optional `documentId` validated against the current unique canonical source; this alone does not imply expansion is available.
- `expansion: { available: true, id, expectedContentHash, startLine, endLine }` only when current source identity and cited excerpt match. Use these ID/hash fields, **never a QMD hit ID**, for expansion.
- Otherwise `expansion: { available: false, reason }`, where reason is `missing_id`, `invalid_id`, `duplicate_id`, `source_unavailable`, `source_changed`, `source_mismatch`, `invalid_utf8`, or `outside_canonical_root`. Reads never stamp or repair IDs.
- Opt-in `diagnostics: { hitId, score, scoreBreakdown?, metadata? }`, inside the same cap. Diagnostics are not additional evidence or truth guarantees.

A budget that cannot fit the query/readiness/minimum envelope fails with `422 budget_too_small`; an empty passage list may instead mean all candidate units were omitted. Preserve warnings and omission counts rather than treating either outcome as proof that memory is absent.

### `POST /memories/all/expand`

Authenticated, read-only canonical source expansion. No idempotency key, write queue, index update, ID stamping, or support-state mutation. Both bounded endpoints use existing read authentication; HTTP POST does not make them writes.

```json
{ "id": "mem_550e8400-e29b-41d4-a716-446655440000", "expectedContentHash": "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", "startLine": 20, "endLine": 40, "maxBytes": 8192 }
```

`id` and `expectedContentHash` are required. The hash is SHA-256 over exact full-file bytes from available compact expansion metadata or a prior document read; unlike document PUT, it is a **JSON body field**, not an `If-Match` header. CLI exposes it as `--if-match`. Unknown fields are rejected.

Optional positive integer `startLine`/`endLine` select inclusive 1-based lines including frontmatter, defaulting to first/last document lines. Alternatively `sectionLine` is a body-line anchor for the innermost enclosing heading section, including subsections; it cannot combine with line bounds. A pre-heading anchor selects the body preamble. No bounds selects whole-document scope, still byte-bounded.

Response fields:

| Field | Contract |
| --- | --- |
| `version`, `kind` | `1`, `"expansion"`. |
| `id`, `filePath`, `contentHash` | Canonical ID, root-relative path, and matched full-file hash. |
| `scope` | `"lines"` or `"section"`. |
| `requestedStartLine`, `requestedEndLine` | Resolved requested scope. |
| `startLine`, `endLine`, `totalLines` | Actual returned citation and source line count. |
| `text` | Exact whole source lines, retaining CRLF/whitespace/final-newline presence. |
| `partial`, `omittedLines` | Budget truncation within the requested scope only, not whole-document or answer completeness. |
| `continuationLine` | Present only when partial; next unread line (`endLine + 1`). |
| `maxBytes` | Effective serialized byte cap, with the same framing as compact recall. |

Continue partial evidence with `startLine: continuationLine`, `endLine: requestedEndLine`, and the **same hash**, omitting `sectionLine`. Cite actual returned bounds: a bounded section prefix may not reach its anchor. Missing hash is 428; stale hash or changed identity is 412 and requires refreshed recall/source evidence, not precondition bypass. Missing/duplicate IDs are 404/409 and never authorize read-time mutations. Invalid range/hash/budget is 400; an unfit envelope/first whole line or invalid UTF-8 is 422. Lines are never silently cut to fit.

New clients validate packet version/kind/shape, declared budget, and serialized size. Unsupported endpoints (404/405/501) or malformed bounded packets fail with upgrade guidance, **without automatic full-document fallback**; expansion `404 missing_id` remains a document error. Explicit CLI `show` remains the whole-document editing/broader-context workflow, not an expansion retry strategy.

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

For browser quick capture, send `{ "type": "note", "body": "", "dailyDate": "2026-09-27" }` without `title`. `dailyDate` must be a real `YYYY-MM-DD` date and is only valid with a blank string body and `type: "note"`; conflicting explicit titles are rejected. Inside the existing idempotency callback and server write queue, fresh canonical frontmatter titles determine `2026-09-27_note_1`, then `_2`, and so on (maximum matching suffix plus one; no index/counter). Titles across all canonical buckets count, including ID-less records and case/whitespace/Unicode-equivalent matches. Replay keeps the original title/ID; changing the request under the same key conflicts. This is a single-server-queue guarantee, not a lock against external writers or multiple server processes. Existing notes are not renamed, and explicit-title requests without `dailyDate` remain unchanged.

Allowed `type` values: `note`, `finding`, `decision`, `preference`, and `page`. An optional boolean `dream: true` in the request marks a dream output (the CLI uses `remember --type page --dream` with body-only stdin). Strings are not boolean markers. Session files should be written through `/wrapups` in V1. Remote `note` creation accepts an empty/whitespace-only body for quick capture; the canonical writer still emits a title heading. Findings, decisions, preferences, wrapups, and local CLI note writes retain non-empty-content validation.

Response:

```json
{
  "memory": "all",
  "target": "remote",
  "id": "mem_550e8400-e29b-41d4-a716-446655440000",
  "file": "findings/2026-06-30-remote-writes-are-append-only-550e8400.md",
  "type": "finding",
  "title": "Remote writes are append-only",
  "saved": true,
  "indexed": false,
  "indexing": { "status": "pending" },
  "index": { "stale": true }
}
```

### `GET /memories/all/dream/window`

Authenticated, stateless, read-only UTC calendar-window context. The same app operation serves local roots and remote targets; it neither writes source IDs nor creates/updates dream support state. It does not call models, schedule dreaming, or apply edits. Agents use the CLI rather than HTTP directly:

```bash
JUMPYBRAIN_API_KEY=client-key jumpybrain dream --target-url https://memory.example.com --from t-1d --days 3 --out packet.json
```

Query parameters:

| Parameter | Meaning |
| --- | --- |
| `from` | Newest inclusive UTC date: `t-Nd` or `YYYY-MM-DD`; default `t-0d`. |
| `days` | Positive bounded calendar-day count; default 3. `t-1d` with 3 means T-1, T-2, T-3. |
| `dateBasis` | `evidence` (default) or `modified`. |
| `offset` | Nonnegative request-local file offset; default 0. |
| `maxFiles`, `bytesPerFile`, `maxTotalBytes` | Bounded file/content budgets, shared with local selection; not total JSON wire bytes. Frontmatter is separately capped at 4 KiB per file, IDs at 512 bytes, titles at 1 KiB; oversized fields are omitted with warnings. |

Relative dates resolve once per request in UTC. Evidence dates prefer valid frontmatter `date`, a recognized dated journal filename, valid `created_at`/`createdAt`, then mtime. Return fallback/malformed-date warnings; migration `updated_at` is not evidence age. Modified mode selects filesystem mtime. Dream-marked pages are excluded from primary sources; recall/show can retrieve related dream context outside the window.

Responses use `root: "remote:all"` and relative file paths, never server filesystem roots. `window` contains resolved `from` (oldest), `to` (newest), `timezone: "UTC"`, and `dateBasis`. Files include optional IDs, full-file content hashes, selected dates/date bases, bounded content, byte counts, and truncation flags. Additive `dateConfidence` is the string union `declared` (frontmatter date), `filename` (recognized journal filename), `fallback` (creation/mtime), or `modified`. It describes date provenance, not a probability or verified event date. Missing IDs remain path-addressed evidence without implicit stamping.

Additive `diagnostics` contains counts: `scannedFiles` (successfully read non-dream files), `unreadableFiles`, `fallbackFiles`, `outsideWindowFallbackFiles`, `dateDiagnosticFiles`, `outsideWindowDateDiagnosticFiles`, `omittedFiles` (matching files changed/unreadable during hydration), `truncatedFiles`, `metadataOmittedFiles`, `omittedWarnings`, and `truncatedWarnings`. Date counts follow the requested basis; modified mode does not audit historical metadata. Packet omissions and returned-file warnings take priority; unselected/outside-window paths are withheld in favor of aggregate counts. The serialized `warnings` array is capped at 16 KiB/100 entries, each serialized string at 1 KiB, including omission/clipping feedback. Aggregate counts and per-file flags remain available. These are diagnostic bounds, not total JSON packet or filesystem scan-cost bounds.

Creation/mtime fallback can reflect import bursts. Deliberately page the evidence window, or request `dateBasis=modified`, `from=<modification-UTC-day>`, `days=1`; preserved mtimes may differ from creation dates. Do not infer dates from ambiguous filenames. Pagination advances files, not truncated bytes; hydration-omitted files have already been passed and require repeating the window. Narrowing or reaching the final offset never proves corpus coverage.

The packet also includes `offset`, `totalFiles`, `hasMore`, optional `nextOffset`, limits, warnings, and instructions; there is no `complete` field or acknowledgment step. `totalFiles` describes matching evidence in this scan, not reviewed coverage. Empty windows are valid. Continue with the same bounds and an absolute anchor from `window.to`; concurrent edits can shift offsets, so packets are not snapshots or exact coverage proofs. Historical windows cannot discover every later edit.

Create outputs via the normal notes endpoint (`type: "page"`, boolean `dream: true`) or use optimistic document updates. Require explicit permission for global/team/remote writes, including indexing; use the same CLI target throughout. Leave source/human-authored pages intact by workflow convention, not new ACLs. Index after edits to refresh ordinary retrieval and the bounded lexical dream-candidate collection.

Servers without this endpoint fail clearly in new clients. There is no automatic fallback to batch creation or other support-state writes.

### Legacy dream batch compatibility

Legacy runtime/HTTP APIs remain available for existing callers, with unchanged metadata-only state under `.jumpybrain/remote/`:

- `GET /memories/all/dream/status`
- `POST /memories/all/dream/batches` with optional `maxFiles`, `bytesPerFile`, `maxTotalBytes`, and `force`
- `GET /memories/all/dream/batches/:batchId`
- `POST /memories/all/dream/batches/:batchId/complete`
- `POST /memories/all/dream/batches/:batchId/abandon`

These retain open-batch/cursor semantics: retrieval does not advance the cursor, completion advances the batch high-water cursor, and abandonment does not. Batch/status responses use remote-safe roots and relative files; stored metadata never includes full bodies. Window reads ignore and leave all legacy state untouched.

The new CLI no longer invokes these workflows: `--status`, `--complete`, `--abandon`, `--force`, and `--apply-manifest` fail with deprecation guidance. Use window reads and explicit create/update/index commands instead.

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

### `POST /memories/all/resolve-title`

Authenticated, read-only exact-title lookup used by editor reference navigation. Request: `{ "title": "Exact Page Title" }`. POST keeps titles out of request URLs; no idempotency key is needed. Responses use `Cache-Control: no-store`:

- `200 { "status": "found", "id": "mem_<uuid>" }` — one title match with an openable unique canonical ID.
- `200 { "status": "missing" }` — no title match (including blank input).
- `200 { "status": "ambiguous" }` — multiple matching titles, even when a match lacks a valid ID.
- `200 { "status": "unopenable" }` — unique match lacks a valid/unique ID, fails a reread, or the canonical scan/read fails.

Matching shares rename normalization: NFKC, trim, lowercase, NFC. Each lookup scans canonical Markdown at the editor memory root, not retrieval `indexRoot` or indexed search. There is no filename, heading, path, or fuzzy fallback, no target creation, and no ID stamping. Responses never include candidate lists, titles, paths, bodies, or index state.

Authentication is required before method/body validation. Missing/non-string titles or invalid JSON return 400; unsupported media types return 415; other methods return 405. Root/configuration failures return a generic 500 `resolve_title_failed`, without filesystem diagnostics.

Title scan, ID scan, final read, and later editor GET are separate operations, not an atomic uniqueness guarantee against concurrent writes. Target file/ID/title changes detected during reread produce `unopenable`, but existing scanner policy can skip disappearing directories. Renames can break title references; later title reuse can retarget them. Graph resolution remains filename-based. The browser uses this endpoint only for activation; inline suggestions remain potentially stale indexed search and do not imply canonical title uniqueness.

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
- Replacement stages/fsyncs complete bytes before rename and rechecks original bytes, ID, single-link regular-file identity, and non-symlink directory identities. Updates serialize per real root in-process; an exclusive `.<filename>.replace.lock` guards final validation/publication among cooperating processes, failing closed on contention. This is not filesystem compare-and-swap: external writers ignoring locks or swapping ancestors can still race, and title uniqueness is not locked across processes. Directory fsync is best-effort. Handled failures clean owned staging/locks; after a crash, remove a stale lock only after confirming no writer is active. These guards do not expand V1 beyond one server process per local root.
- Omitted dream markers are preserved; explicit boolean `dream: false` removes classification. The marker does not change authorization or protected identity metadata.
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
| 400 | `invalid_budget` | Bounded-read byte budget is not an integer from 1024 to 65536. |
| 400 | `invalid_expansion` | Invalid expansion hash or line/section bounds. |
| 400 | `invalid_id` | Document ID is not shaped as `mem_<uuid>`. |
| 400 | `idempotency_key_required` | Create request omitted `Idempotency-Key`. |
| 401 | `auth_required` | Missing `Authorization: Bearer ...`. |
| 401 | `invalid_api_key` | API key is present but not accepted. |
| 404 | `not_found` | Unknown route or memory collection other than `all`. |
| 404 | `missing_id` | No canonical Markdown document has the requested document ID. |
| 405 | `method_not_allowed` | Known route with unsupported method. |
| 409 | `duplicate_id` | More than one canonical Markdown document has the requested document ID. |
| 409 | `idempotency_conflict` | Same idempotency key used for a different request. |
| 412 | `precondition_failed` | Update `If-Match` or expansion `expectedContentHash` is stale, or source identity changed; refresh evidence before retrying. |
| 415 | `unsupported_media_type` | Non-JSON body for JSON endpoint. |
| 422 | `budget_too_small` | Minimum bounded packet envelope cannot fit. |
| 422 | `line_too_large` | First requested whole source line cannot fit; increase budget or choose another range. |
| 422 | `invalid_utf8` | Exact expansion is unavailable for invalid UTF-8 source. |
| 422 | `validation_failed` | Valid JSON but invalid memory draft/wrapup/document content. |
| 428 | `precondition_required` | Update omitted `If-Match`, or expansion omitted `expectedContentHash`. |
| 500 | `index_failed` | Server-side index update/rebuild failed. |
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
- Server auto-indexing is enabled by default and checks stale remote memory every 5 minutes. Manual `POST /memories/all/index` is still useful when operators want an immediate update.
- Server request and operation logs are written to `.jumpybrain/logs/server-YYYY-MM-DD.log` under the memory root. Logs are compact text lines with method/path/status/duration, write/index metadata, and stable error codes. Access logs over SSH or host filesystem tooling; V1 intentionally does not expose a developer logs HTTP endpoint.

## Deferred from V1

- Named target registries/default remote targets.
- Multiple memories, team/project/repo namespaces, RBAC, accounts, invitations, and dashboards.
- Delete operations, path-addressed editing, block IDs, hidden Markdown comments, line/section patches, CRDT/OT, and collaborative editing.
- Client-side remote mirrors or sync engines.
- Multi-process/horizontally scaled server semantics.
