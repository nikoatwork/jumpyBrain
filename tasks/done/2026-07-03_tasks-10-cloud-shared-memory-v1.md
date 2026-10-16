# Cloud Shared Memory V1

## Goal

Evaluate and implement a lean cloud/shared-memory architecture for jumpyBrain: a self-hostable HTTP server that keeps Markdown files canonical, owns remote indexing/search, and lets the CLI use local or remote targets with the same core experience.

## Notes

- Keep jumpyBrain local-first: local Markdown memory remains fully supported.
- Remote V1 uses one shared memory namespace, not team/project/repo hierarchies.
- Remote canonical state is still Markdown files on server disk; indexes, search state, and operation logs are derived/rebuildable or inspectable support state.
- Remote writes are append-only `create_file` operations with file-level IDs. Do not introduce block IDs, hidden Markdown comments, line-range patching, or collaborative editing in V1.
- The server owns remote indexing/search; the CLI hits HTTP endpoints and receives the same kind of recall/search packets it gets locally.
- Authentication is API-key based. Do not store API keys in committed config; prefer env vars or local uncommitted config.
- Deployment target is a small Node HTTP service in this repo/package, suitable for running on a VPS behind HTTPS/reverse proxy.
- Avoid automatic prompt injection by default. Remote recall remains explicit or visible workflow preflight.
- Validation must be deterministic and require no paid model calls.

## Decisions

- Remote memory uses the same canonical Markdown-file model as local jumpyBrain.
- V1 has one shared remote memory.
- CLI commands should be fully interchangeable across local and remote targets where practical: `status`, `index`, `search`, `recall`, `note`, and `wrapup`.
- Remote write primitive is append-only `create_file` with file-level IDs; edits/deletes/block-level conflict resolution are deferred.
- Backend is a small self-hostable HTTP server in this repo/package.
- Remote search/indexing runs on the server; the CLI does not sync/download a local mirror for normal remote retrieval.
- Remote target selection is URL-only in V1; do not introduce named target registries yet.
- Remote writes do not synchronously trigger indexing in V1; authenticated `POST /memories/all/index` is the reindex API and can be called by the CLI or cron.
- Idempotency is an early primitive for remote create requests via a CLI-generated `Idempotency-Key` HTTP header and server support state rather than canonical memory; users do not supply keys manually.
- Remote-created files do not need author/API-key-label metadata in V1.
- HTTP routes use a future-proof collection segment, e.g. `/memories/all/search`, with `all` as the V1 shared memory collection.

## CTO Decisions (2026-06-30)

- Server command is `jumpybrain serve`; no separate `jumpybrain-server` binary for V1. Use `--root`, `--host`, `--port`, and explicit `--init` for first-time root creation.
- Server startup should fail on a missing/incompatible memory root unless `--init` is supplied; do not silently create server state.
- Server env vars are `JUMPYBRAIN_SERVER_ROOT`, `JUMPYBRAIN_SERVER_HOST`, `JUMPYBRAIN_SERVER_PORT`, `JUMPYBRAIN_SERVER_API_KEYS`, optional `JUMPYBRAIN_PUBLIC_BASE_URL`, and normal `JUMPYBRAIN_QMD_BIN`.
- Client env var is `JUMPYBRAIN_API_KEY`; `--target-url` and `--remote-url` stay equivalent URL-only selectors.
- Auth header is `Authorization: Bearer <api-key>`; `/health` is unauthenticated and all `/memories/all/...` routes are authenticated.
- Do not expose the server's absolute filesystem root in remote status/search responses by default; use `root: "remote:all"` for CLI-compatible remote packets.
- Remote-created Markdown IDs use `crypto.randomUUID()` with a `mem_` prefix; filenames include the date, slug, and a short ID suffix.
- Remote-created frontmatter includes `id`, `type`, `title`, `source: "jumpybrain-remote"`, `created_at`, `updated_at`, `confidence`, and `tags`; no author/API-key labels in V1.
- Idempotency support state is per-key JSON under `.jumpybrain/remote/idempotency/<sha256-key>.json`; store key hash, request hash, method/path, result, and timestamp, never the raw key.
- Reusing the same idempotency key with the same request returns the original result; reusing it with a different request returns `409 idempotency_conflict`.
- Index stale state lives in `.jumpybrain/remote/index-state.json`; writes mark `stale: true`, and `POST /memories/all/index` marks it fresh after a successful rebuild.
- Related-memory preflight for wrapups remains a visible CLI workflow: remote CLI calls `/recall` first, then `/wrapups`; the write endpoint stores `recallTopic` but does not perform hidden recall.
- V1 server scaling assumption is one Node process over one local disk memory root; a tiny in-process mutex is acceptable for write-side support state.
- Error responses use `{ "error": { "code", "message", "details" } }` with stable codes documented in `docs/cloud-shared-memory.md`.

## Relevant Files

- `src/cli.ts` - Current CLI command composition; routes through local transport and rejects remote placeholders clearly.
- `src/cli/targets.ts` - URL-only local/remote target selection seam; remote is recognized but not implemented.
- `src/cli/local-transport.ts` - Existing local behavior adapter from CLI commands to runtime operations.
- `src/client/http-client.ts` - Remote HTTP client adapter used by CLI `--target-url`/`--remote-url` commands.
- `src/index.ts` - Package-level runtime surface; re-exports `src/runtime/index.ts` without CLI/server imports.
- `src/runtime/index.ts` - Local app surface composed from core plus QMD-backed retrieval/processing.
- `src/core/index.ts` - Backend-agnostic Markdown/setup/writing/types surface; must not export QMD-backed operations.
- `src/server/index.ts` - Server-local runtime boundary and server module barrel.
- `src/server/config.ts` - Server env/CLI config resolution for root, host, port, API keys, and public base URL.
- `src/server/http.ts` - Initial Node HTTP server with `/health`, authenticated `/memories/all/status`, `POST /memories/all/index`, `POST /memories/all/search`, `POST /memories/all/recall`, append-only `POST /memories/all/notes`, append-only `POST /memories/all/wrapups`, write mutex, and stable JSON errors.
- `src/server/state.ts` - Remote support-state helpers for index-stale state reading/writing, fresh-index marking, and stale-on-write marking.
- `src/server/idempotency.ts` - Remote create-request idempotency support state under `.jumpybrain/remote/idempotency/`.
- `src/setup/project-config.ts` - Existing `jumpybrain.json` config behavior and likely target-config extension point.
- `src/canonical/` - Markdown discovery/frontmatter/provenance primitives that server storage should reuse.
- `src/writing/` - Remember/wrapup Markdown creation, validation, safe filenames, atomic unique-file writes, and remote create-file writer helpers.
- `src/retrieval/retriever.ts` - Runtime index/search facade to reuse inside the server.
- `src/qmd/qmd-driver.ts` - QMD-derived state behavior the server must isolate under the remote memory root.
- `src/types.ts` - Shared local/remote command and response types.
- `src/targets/README.md` - Existing colocated architecture sketch, diagrams, decisions, rejected alternatives, and open questions.
- `test/architecture-boundaries.test.js` - Guardrails to extend so server/client modules do not collapse core boundaries.
- `test/cli-target-properties.test.js` - Deterministic target-selection property tests.
- `test/server-boundary.test.js` - Server-runtime boundary tests.
- `test/server-http.test.js` - Deterministic HTTP health/status/auth/index/search/recall/write/idempotency tests.
- `test/memory-cli.test.js` - Local CLI tests plus remote CLI smoke coverage against a spawned local server.
- `docs/agent-workflows.md` - Agent recall/wrapup workflow docs to update for remote targets.
- `docs/technical.md` - Technical CLI/indexing docs to update for target and server behavior.
- `docs/memory-format.md` - File-level ID/frontmatter documentation belongs here.
- `docs/cloud-shared-memory.md` - User-facing cloud/shared-memory overview, API contract, remote support-state contract, and deployment notes.
- `docs/coolify-deploy.md` - Lean Coolify deployment guide for Dockerfile builds, env vars, persistent storage, and cutover from manual systemd.
- `Dockerfile` - Coolify-ready Docker image build with Node 22, QMD, healthcheck, and `jumpybrain serve` startup.
- `.dockerignore` - Keeps local/build/task artifacts out of Coolify Docker builds.
- `tasks/CHANGELOG.md` - Update only when the cloud architecture decision or implementation milestone is completed.

## Investigation Findings (2026-06-30)

Scope: repository inspection only; no source/test/docs implementation changes were made. No matching durable memory entries were found for this cloud/shared-memory task.

Evidence inspected:

- `src/targets/README.md` contains the architecture sketch, local/remote flow diagram, remote recall sequence, remote append-only write sequence, accepted decisions, rejected alternatives, and open questions.
- `src/cli/targets.ts`, `src/cli/local-transport.ts`, and `src/cli.ts` show that URL-only remote target flags are recognized, but `requireLocalRoot` still throws an explicit "remote not implemented yet" placeholder.
- `src/server/index.ts` is a server-local runtime composition boundary only; it is not an HTTP daemon and has no auth, routes, request validation, idempotency, write queue, or stale-index state.
- `test/architecture-boundaries.test.js`, `test/server-boundary.test.js`, `test/cli-target-properties.test.js`, and `test/memory-cli.test.js` cover architecture seams, server-runtime composition, and remote-placeholder target selection.
- `docs/technical.md`, `docs/install.md`, and `docs/agent-workflows.md` mention the future hosted/shared/server path, but no user-facing cloud/shared-memory API or deployment guide was found.

What appears already done:

- Task 1 architecture-sparring work is mostly done in `src/targets/README.md`; the missing pieces are the public `docs/` overview and an explicit owner-review checkpoint before HTTP implementation.
- The CLI/runtime/server/QMD boundary refactor needed by this milestone is already in place: `src/core/`, `src/runtime/`, `src/qmd/`, `src/cli/local-transport.ts`, and `src/server/index.ts` are separated and guarded by tests.
- URL-only remote target selection exists as a placeholder via `--target-url` / `--remote-url`.
- A local transport adapter exists and preserves current local command behavior.
- A server runtime boundary exists for composing the local runtime against a server-local Markdown root.
- Local Markdown writes already use atomic unique file creation (`writeUniqueMarkdownFile` with `flag: "wx"`), which can be reused for remote append-only writes, but remote IDs/idempotency/stale-index behavior is not implemented.

What is partial or still needed:

- The remote architecture contract is only partially defined. Exact remote frontmatter fields, file IDs, `create_file` request/result shape, `.jumpybrain/remote/` idempotency records, stale-index response shape, and support-state layout still need a compact contract.
- The HTTP API is not implemented and not fully specified. Endpoint paths and some decisions exist, but request/response bodies, status/error codes, auth failure semantics, and API docs are still needed.
- There is no remote HTTP client adapter and no command path that actually executes `status`, `index`, `search`, `recall`, `remember`, or `wrapup` against a remote server.
- There is no runnable self-hostable HTTP server command or binary. `src/server/index.ts` is only a runtime composition module.
- Remote tests are not present for auth, HTTP routes, idempotency, concurrent writes, stale indexes, remote CLI smoke behavior, or rebuildability.
- Deployment/agent workflow documentation for a real remote target is still missing; `docs/cloud-shared-memory.md` does not exist.
- `tasks/strategy.md` is referenced by task 10.2 but was not present during inspection.

Working tree note: `git status --short` showed pre-existing changes in `scripts/local-pack-manifest.mjs`, `src/cli.ts`, `test/architecture-boundaries.test.js`, `test/local-pack-scripts.test.js`, plus untracked `src/cli/args.ts` and `test/wrapup-properties.test.js`. This investigation did not treat those as completed cloud/shared-memory work.

## Current Status

Closed on 2026-07-03. The Cloud Shared Memory V1 implementation is complete for repo-local code, deterministic tests, Coolify Docker deployment prep, VPS/Coolify public HTTP smoke testing, and docs sufficient for HTTPS deployment. HTTPS certificate handling and API-key rotation remain operational polish outside this archived milestone.

## Progress Log

- **2026-06-30:** CTO decisions recorded and compact remote contract created in `docs/cloud-shared-memory.md`. Implemented the first remote server slice: `jumpybrain serve` command shape, server config resolution, unauthenticated `GET /health`, authenticated `GET /memories/all/status`, stable JSON error shape, remote index-state read defaults, and deterministic HTTP auth/status tests. Validation: `npm test` passed (82 tests).
- **2026-06-30:** Implemented remote retrieval/index HTTP slice: authenticated `POST /memories/all/index`, `POST /memories/all/search`, and `POST /memories/all/recall`; search/recall return `root: "remote:all"` packets with index metadata and do not expose server filesystem roots; successful remote indexing writes `.jumpybrain/remote/index-state.json` as fresh. Added deterministic HTTP index/search/recall test. Validation: `npm test` passed (84 tests).
- **2026-06-30:** Implemented remote append-only write HTTP slice: `POST /memories/all/notes` and `POST /memories/all/wrapups` require `Idempotency-Key`, use an in-process write queue, create remote Markdown with `mem_` file IDs and `source: "jumpybrain-remote"`, store idempotency records under `.jumpybrain/remote/idempotency/`, replay matching duplicate requests, reject conflicting duplicates, and mark the remote index stale after writes. Added deterministic idempotency and concurrent wrapup-write tests. Validation: `npm test` passed (86 tests).
- **2026-06-30:** Implemented remote CLI client/routing: `status`, `index`, `search`, `recall`, `remember`, and `wrapup` now work with `--target-url`/`--remote-url` and `JUMPYBRAIN_API_KEY`; remote wrapup keeps visible recall preflight; remote `remember` does not index synchronously. Added remote CLI smoke test against a spawned local server, strengthened client architecture/package manifest tests, and updated technical, memory-format, and agent-workflow docs. Added server config tests and explicit remote delete/rebuild-from-Markdown coverage. Validation: `npm test` passed (88 tests) and `npm run cli:pack` passed.
- **2026-07-03:** Deployed the current working tree to a VPS under the jumpyBrain app directory, installed Node 22 and QMD 2.5.3, created the server-local memory root, configured the service environment and process unit, and started the service bound to `127.0.0.1:3787`. Smoke-tested remote CLI commands on the VPS (`status`, `remember`, `index`, `search`, `wrapup`, `recall`) and from the local machine through an SSH tunnel. Operational rough edge: public HTTPS is not configured because no domain/reverse-proxy hostname has been provided; keep the service localhost-only until then.
- **2026-07-03:** Prepared the app for lean Coolify deployment/autodeploy: added a Dockerfile with QMD installed and `/data/jumpybrain/memory` as the container memory root, added `.dockerignore`, documented Coolify settings in `docs/coolify-deploy.md`, and used a dedicated server-access SSH key for Coolify to reach the deployment server. Validation: `npm test` and `npm run cli:pack` passed.
- **2026-07-03:** Verified the Coolify-deployed public HTTP endpoint at the generated placeholder domain: `/health`, authenticated `/status`, remote note write, remote `index`, remote `recall`, and local CLI `--target-url` status/recall all worked. HTTPS currently fails certificate validation, so public HTTPS is remaining deployment polish.
- **2026-07-03:** Closed and archived the V1 milestone; HTTPS certificate handling and API-key rotation remain operational follow-ups outside this task list.

## Tasks

- [x] 1.0 Visualize the architecture and spar on details before implementation
  - [x] 1.1 Create a visual architecture sketch for local vs remote target flow, including CLI, HTTP client, server, canonical Markdown files, QMD-derived state, and recall/write paths.
  - [x] 1.2 Include at least one sequence diagram for remote `recall` and one for remote append-only `wrapup`/`note` commit.
  - [x] 1.3 Add a colocated design doc near the future implementation modules, e.g. `src/server/README.md`, `src/client/README.md`, or `src/targets/README.md`, so architectural intent stays beside the code.
  - [x] 1.4 Add or link a user-facing overview doc under `docs/` only after the architecture sketch is stable enough to explain externally.
  - [x] 1.5 Use the sketch to spar with the project owner on target selection, write/index timing, operation log necessity, auth shape, and deployment assumptions.
  - [x] 1.6 Capture accepted decisions and rejected alternatives in the colocated doc before coding against them.
  - [x] 1.7 Pause for owner review before starting the HTTP API/client/server implementation tasks. Owner delegated remaining architecture decisions to CTO on 2026-06-30.

- [x] 2.0 Define the remote architecture contract
  - [x] 2.1 Write a short design note for local target vs remote target data/control flow.
  - [x] 2.2 Define the remote canonical layout on disk: memory root, `notes/`, `sessions/`, derived `.jumpybrain/`, and any server support files.
  - [x] 2.3 Define the file-level ID/frontmatter fields for remotely created Markdown files, including `id`, `created_at`, and `source`; author/API-key metadata was rejected for V1.
  - [x] 2.4 Define the append-only operation shape for `create_file`, including CLI-generated `Idempotency-Key` header behavior, target directory/type, title, body, tags, created-at timestamp, and resulting path.
  - [x] 2.5 Decide the minimal idempotency support-state shape under `.jumpybrain/remote/`; avoid a broader canonical operation log unless retries/auditing prove it necessary.
  - [x] 2.6 Explicitly document deferred features: update/delete operations, block IDs, line/section patches, CRDT/OT, multi-memory namespaces, and client-side remote mirrors.

- [x] 3.0 Design the HTTP API
  - [x] 3.1 Define API-key auth header format and failure responses.
  - [x] 3.2 Define `GET /health` and `GET /memories/all/status` responses.
  - [x] 3.3 Define `POST /memories/all/index` semantics for remote targets: authenticated API-triggered rebuild of server-side derived QMD state, suitable for CLI/manual calls and cron, returning index metadata.
  - [x] 3.4 Define `POST /memories/all/search` and `POST /memories/all/recall` request/response bodies compatible with current CLI JSON output.
  - [x] 3.5 Define `POST /memories/all/notes` for append-only note creation, required `Idempotency-Key`, and stale-index marking without synchronous indexing.
  - [x] 3.6 Define `POST /memories/all/wrapups` for strict session wrapup validation, visible CLI related-memory preflight, append-only session file creation, required `Idempotency-Key`, and stale-index marking without synchronous indexing.
  - [x] 3.7 Define error codes for auth failure, validation failure, missing/duplicate/conflicting idempotency key, indexing/search failure, stale index warnings, and server misconfiguration.
  - [x] 3.8 Add a compact API contract doc under `docs/` before implementation.

- [x] 4.0 Add a remote target abstraction to the CLI
  - [x] 4.1 Introduce a small target interface used by CLI commands: `status`, `index`, `search`, `recall`, `remember`, and `wrapup`.
  - [x] 4.2 Implement the existing local behavior as the local target adapter without changing output shape.
  - [x] 4.3 Implement a remote HTTP client adapter that calls the server endpoints and maps responses/errors to existing CLI formats.
  - [x] 4.4 Implement URL-only remote selection for V1; avoid named target registries/default-target switching until dogfood usage proves the need.
  - [x] 4.5 Ensure remote API keys come from env vars or uncommitted local config, not committed `jumpybrain.json` secrets.
  - [x] 4.6 Keep `jumpybrain run memory:*` recipes working for local targets and add remote-target examples.

- [x] 5.0 Implement the self-hostable HTTP server
  - [x] 5.1 Add a server entrypoint under `src/server/` and package/build wiring for a runnable binary or command.
  - [x] 5.2 Load server config from env/CLI flags: memory root, host, port, API keys, and optional public base URL.
  - [x] 5.3 Reuse canonical/writing/retrieval modules instead of duplicating Markdown, wrapup, or search logic.
  - [x] 5.4 Implement API-key authentication and redact secrets from logs/errors.
  - [x] 5.5 Implement append-only create-file writes using unique IDs, atomic file creation, safe filenames, and no author metadata.
  - [x] 5.6 Add a small in-process write queue/mutex so concurrent create requests cannot corrupt support files, idempotency state, or derived state.
  - [x] 5.7 Mark the index stale after remote notes/wrapups and expose `POST /memories/all/index` as the cron/manual/CLI rebuild path; defer synchronous index-on-write and in-process background workers.
  - [x] 5.8 Ensure server-side QMD derived state remains under the remote memory root and is rebuildable.
  - [x] 5.9 Add structured JSON responses and human-debuggable logs without leaking API keys or memory content unnecessarily.

- [x] 6.0 Preserve architecture boundaries
  - [x] 6.1 Keep `src/canonical/`, `src/writing/`, and `src/retrieval/` independent from HTTP/server/client modules.
  - [x] 6.2 Place remote client/server orchestration in separate modules, e.g. `src/client/`, `src/server/`, and/or `src/targets/`.
  - [x] 6.3 Extend `test/architecture-boundaries.test.js` to prevent core layers from importing server/client code.
  - [x] 6.4 Keep server code from becoming the canonical source of memory semantics; Markdown/frontmatter remains the source of truth.

- [x] 7.0 Test remote behavior deterministically
  - [x] 7.1 Add unit tests for target selection and secret-free config handling.
  - [x] 7.2 Add HTTP auth tests for missing, invalid, and valid API keys.
  - [x] 7.3 Add create-file tests proving concurrent note/wrapup writes produce distinct Markdown files with file-level IDs.
  - [x] 7.4 Add idempotency or duplicate-request tests if idempotency keys are included in V1.
  - [x] 7.5 Add remote CLI smoke tests against a local test server for `status`, `remember`, `wrapup`, `index`, `search`, and `recall`.
  - [x] 7.6 Add a rebuild test proving remote search state can be deleted/rebuilt from canonical Markdown.
  - [x] 7.7 Keep all tests no-paid-call; use real QMD only where existing retrieval tests already require it or isolate QMD-dependent tests clearly.

- [x] 8.0 Document deployment and agent workflow
  - [x] 8.1 Document VPS/reverse-proxy deployment assumptions: server speaks HTTP locally; HTTPS is provided by the proxy.
  - [x] 8.2 Document env vars for memory root, API keys, host/port, and QMD availability.
  - [x] 8.3 Document cron examples that call `POST /memories/all/index` through the authenticated API.
  - [x] 8.4 Document backup/restore expectations for the canonical Markdown memory root.
  - [x] 8.5 Document CLI remote-target setup without committing secrets.
  - [x] 8.6 Update agent workflow docs with remote explicit recall and end-of-session remote wrapup examples.
  - [x] 8.7 Add security notes: API key grants read/write memory, do not memorize secrets, rotate keys by config change/restart unless a better key store is added later.

- [x] 9.0 Dogfood with one remote shared memory (done for local tests, VPS service, SSH tunnel, and Coolify public HTTP; HTTPS certificate polish deferred to operations)
  - [x] 9.1 Start the server locally against a temp or dogfood memory root.
  - [x] 9.2 Use the CLI remote target to write a note and wrapup.
  - [x] 9.3 Rebuild/index remotely and verify search/recall provenance points to canonical Markdown files.
  - [x] 9.4 Simulate two concurrent clients writing wrapups and verify append-only behavior.
  - [x] 9.5 Deploy on the VPS and repeat a minimal write/search/recall smoke test. Done for VPS service, SSH tunnel, and Coolify public HTTP endpoint; HTTPS certificate validation on the generated domain is deferred operational polish.
  - [x] 9.6 Capture operational rough edges as follow-up tasks rather than expanding V1 scope.

- [x] 10.0 Record and finalize the milestone
  - [x] 10.1 Update `tasks/CHANGELOG.md` with the completed cloud architecture decision and implementation status.
  - [~] 10.2 Update `tasks/strategy.md` if remote shared memory changes the north-star architecture diagram or key decisions. Skipped: `tasks/strategy.md` is not present in this repo checkout.
  - [x] 10.3 Archive this task list to `tasks/done/` when the remote V1 milestone is complete.

## Deferred Operational Follow-ups

- Fix/confirm public HTTPS for the Coolify deployment. Current generated HTTP domain works; HTTPS currently fails certificate validation.
  - Preferred path: create a real DNS record such as `memory.<domain>` pointing to the deployment server, set the Coolify application domain to `https://memory.<domain>`, keep the app's internal/exposed port as `3001`, and let Coolify request/manage the Let's Encrypt certificate through its proxy.
  - Make sure public ports `80` and `443` are reachable on the VPS and are owned by Coolify's proxy, not by the app container directly.
  - Do not add `https://` to the app unless DNS already resolves to the server; Let's Encrypt validation needs the domain to reach Coolify.
  - A generated HTTP domain is okay for smoke testing, but if HTTPS keeps failing issuer validation, use a real domain/subdomain rather than treating that generated cert as production-ready.
- Rotate the API key used during smoke testing before treating the deployment as durable.
- After HTTPS/API-key rotation is confirmed, archive this task list to `tasks/done/`.

## Completion Criteria

- Architecture diagrams and colocated design docs exist and have been reviewed before implementation.
- A small HTTP server in this repo can serve one shared Markdown memory over authenticated API endpoints.
- The CLI can target local or remote memory for the core commands with consistent output semantics.
- Remote writes are append-only new Markdown files with file-level IDs and no block-level Markdown pollution.
- Server-side indexes are derived/rebuildable from Markdown canonical state.
- Concurrent remote writes create separate files and do not corrupt Markdown, idempotency records, stale-index markers, indexes, or support state.
- Deployment and remote-agent workflow docs are sufficient to run the service behind HTTPS on a VPS.
- Tests cover auth, target routing, append-only writes, remote CLI smoke behavior, and rebuildability without paid model calls.
