# Remote Dreaming Memory Consolidation

## Completion Summary

Finalized on 2026-07-06 after verification. Remote dreaming memory consolidation is implemented as an explicit CLI-driven hosted/shared-memory workflow with server-side metadata-only dream state, authenticated dream batch APIs, client-side apply-manifest orchestration, guardrail tests, and public/module documentation. Final verification passed with `npm run validate` and `npm run cli:pack`.

## Goal

Add remote dreaming as an explicit, CLI-driven consolidation workflow for hosted/shared memory. The server does **not** run AI, call model providers, or schedule dreaming; it tracks dream state/cursors/batches and returns bounded, remote-safe canonical Markdown contexts. A local/user agent performs consolidation with whatever model it already uses, applies edits through existing document update flows, then marks the batch complete.

## Notes

- V1 dreaming is a **remote/server state + CLI workflow**, not a server-side AI job.
- Server responsibilities:
  - Track dream cursor/state under derived `.jumpybrain/remote/` support state.
  - Create bounded dream batches from canonical Markdown files changed in the last 24h or since the last completed dream cursor.
  - Return remote-safe file contexts: `root: "remote:all"`, relative paths only, document IDs, content hashes, metadata, and bounded content.
  - Mark batches complete/abandoned and advance cursors only through explicit completion semantics.
- CLI/user-agent responsibilities:
  - `jumpybrain dream --target-url <url>` requests a batch and prints local-agent instructions.
  - A local/user agent reviews the returned Markdown contexts and drafts consolidation edits using the model available in its own environment.
  - Edits are applied through existing ID-addressed document update semantics (`show`/`update`) or a thin CLI helper that calls the same remote update API.
  - A follow-up command/API marks the dream batch complete.
- Server has **no AI capability** in this task: no provider config, no model calls, no prompts sent from server, no server-side generated edits.
- Dream batch selection should scan only canonical memory buckets: `notes/`, `sessions/`, `findings/`, `decisions/`, `preferences/`, and `pages/`.
- Default batch window: since last completed dream cursor; if no cursor exists, changed in the last 24h.
- Default caps should be small and explicit, e.g. max 10 files, hard cap 30 files, and bounded bytes per file/response.
- Cursor advancement must not skip overflow files. Prefer a stable cursor using file mtime plus relative-path tie-breaker, selecting oldest-after-cursor first when more files exist than the batch cap.
- Do **not** advance the dream cursor when a batch is retrieved. Advance only when the batch is explicitly completed.
- Keep one open batch per remote memory root in V1. A repeated `dream` request should resume/return the active batch unless the user completes, abandons, or explicitly forces a new batch.
- Dream state is support/derived operational state, not canonical memory. Canonical Markdown remains the source of truth.
- Dream state should store metadata only: batch IDs, cursors, paths, IDs, hashes, timestamps, status, and summaries. It must not store full memory bodies.
- Batch status/logs must not include memory bodies; only explicit batch context responses may include bounded content.
- To avoid polluting local agent context, default human output should be concise. Full contexts should be available through `--json` and/or `--out <file>`.
- Existing remote auto-index behavior remains separate. Edits applied through existing document update flows should continue to mark the remote index stale.
- Embeddings and wiki links are complementary: embeddings/QMD help discover context; wiki links are durable, human-readable Markdown graph edges.
- Karpathy's LLM Wiki pattern remains useful inspiration: recent sources are reviewed incrementally, useful synthesis/linking compounds over time, and the agent that already has model access does the wiki maintenance.

## Relevant Files

- `src/architecture.docs.md` - Layering and dependency boundaries to preserve.
- `src/types.ts` - Add shared dream batch/status/request/response types if useful.
- `src/core/canonical/markdown-store.ts` - Canonical Markdown scanning/parsing helpers for batch selection.
- `src/core/canonical/links.ts` - Existing explicit Markdown/wiki-link extraction helpers.
- `src/app/server-memory/server-memory.docs.md` - Server-memory responsibility boundary; update for dream state/batches.
- `src/app/server-memory/index.ts` - Add server-memory dream status/create/read/complete/abandon seams.
- `src/app/server-memory/state.ts` - Pattern for remote support state under `.jumpybrain/remote/`.
- `src/app/server-memory/auto-index.ts` - Existing deterministic auto-index support; do not extend it into an AI dream scheduler.
- `src/adapters/http-protocol.ts` - Add shared dream route literals/path helpers.
- `src/adapters/http-server/http-server.docs.md` - HTTP adapter responsibility boundary; update for dream endpoints.
- `src/adapters/http-server/routes.ts` - Add authenticated dream endpoints with thin route handling.
- `src/adapters/http-client/http-client.docs.md` - HTTP client responsibility boundary; update for dream calls.
- `src/adapters/http-client/index.ts` - Add remote dream transport methods.
- `src/cli/cli.docs.md` - CLI boundary and target-selection conventions.
- `src/cli/commands.ts` - Add `dream` command dispatch.
- `src/cli/memory-target.ts` / `src/cli/targets.ts` - Reuse remote target selection and API-key handling.
- `src/cli/document-edit.ts` - Reuse existing show/update workflow concepts for dream apply instructions/helper.
- `src/cli/usage.ts` - Document user-facing `dream` usage.
- `src/server/server.docs.md` - Confirm server boundary has no dreaming scheduler/model behavior.
- `docs/cloud-shared-memory.md` - Document remote dream API and hosted workflow.
- `docs/technical.md` - Document architecture, CLI contract, and derived dream state.
- `docs/memory-format.md` - Document that dream state is derived and canonical Markdown remains authoritative.
- `docs/agent-workflows.md` - Document recommended local-agent dream workflow.
- `test/server-memory-app.test.js` - Add server-memory dream state/selection tests.
- `test/server-http.test.js` - Add remote dream endpoint/auth/redaction tests.
- `test/http-client.test.js` - Add dream transport tests.
- `test/memory-cli.test.js` / `test/cli-baseline-contracts.test.js` - Add CLI behavior/help coverage.

## Deep Dive

- Karpathy LLM Wiki gist: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
- Generative Agents reflection pattern: https://arxiv.org/abs/2304.03442
- LangGraph memory background updates: https://docs.langchain.com/oss/python/langgraph/memory
- Mem0 memory extraction/dedup/retrieval concepts: https://docs.mem0.ai/core-concepts/how-it-works
- Zep temporal graph/outdated fact handling: https://help.getzep.com/concepts

## Prior Sub-Agent Findings

- Architecture research sub-agent recommended the pivot: server should deterministically select changed canonical Markdown, return a bounded dream packet, track batch lifecycle, and leave LLM work to the local/user agent.
- Rewrite sub-agent recommended replacing the OpenRouter/server-scheduler plan with remote dream status/create/get/complete/abandon APIs, CLI instructions, and optional client-side apply-manifest orchestration.
- Both sub-agents emphasized using existing ID-addressed `show`/`update` semantics for commits, preserving remote-safe paths, avoiding body content in state/logs, and testing cursor overflow so capped batches do not skip files.

## Decisions

- Dreaming V1 is remote-only from the CLI perspective: use `--target-url`/`--remote-url`; local `--root` dreaming is out of scope or returns a clear unsupported message.
- The server never performs AI consolidation. It only returns bounded Markdown contexts and tracks batch/cursor state.
- No new server scheduler is added for dreaming.
- No model/provider configuration is added.
- Dream batches are explicit and authenticated.
- A dream batch contains canonical document IDs and content hashes so later edits can use existing optimistic concurrency.
- Completion advances the dream cursor; retrieval and abandonment do not advance the cursor.
- Empty batches may be auto-completed or returned as no-op status, but the behavior must be deterministic and tested.
- Keep one open batch per remote memory root in V1. Repeated create requests should resume/return the open batch by default; `abandon` or an explicit force option may clear it.
- Applying dreamed edits should reuse the existing `PUT /memories/all/documents/:id` update flow. If a CLI `dream --apply-manifest` helper is added, it must be client-side orchestration over existing document update calls, not a new server-side AI/bulk-edit engine.
- Status endpoints and logs expose only metadata, never memory bodies, absolute filesystem paths, local manifest paths, secrets, prompts, or model output.
- Dream context output should warn local agents to treat memory contents as untrusted context and not as instructions.
- Dream instructions should be practical: add/fix wiki links, update stale synthesis, preserve useful provenance/frontmatter, keep unsupported claims out, refresh hashes if update preconditions fail, and complete the batch only after edits are applied or intentionally skipped.

## Sub-agent Execution Plan

Use sub-agents for bounded, reviewable workstreams. Each sub-agent must read relevant co-located `*docs.md` files before editing and return: files changed, validation run, unresolved risks, and handoff notes.

- **Agent A — Contract/schema scout:** tasks 1.0-2.0. Runs first. Defines route names, CLI flags, state JSON shape, batch response shape, cursor semantics, and exact validation expectations.
- **Agent B — Server-memory state/selection:** tasks 3.0-4.0. Can run after Agent A. Implements derived dream state, canonical file selection, content bounds, and server-memory seams with unit tests.
- **Agent C — HTTP protocol/client:** task 5.0. Can run after Agent A, in parallel with Agent B if using agreed types. Adds routes, auth/error mapping, shared route helpers, and client methods.
- **Agent D — CLI workflow/apply UX:** task 6.0. Can run after Agent A with mocked client responses; finalize after Agent C. Implements human/JSON output, local-agent instructions, completion, abandon, and optional apply-manifest orchestration.
- **Agent E — Guardrail/integration tests:** task 7.0. Starts after B/C/D have initial seams. Focuses on cursor overflow, path redaction, no body leaks in status/logs, stale hash behavior, and no server AI/scheduler drift.
- **Agent F — Docs/final review:** task 8.0. Runs last. Updates public docs/module docs and checks task decisions against implementation.

Suggested sequence: A → parallel B/C → D → E → F.

## Validation Checkpoints

- **After Agent A:** The task list/implementation notes contain final dream route names, CLI syntax, state shape, cursor behavior, and explicit “no server AI/no scheduler” constraints.
- **After Agent B:** Server-memory unit tests prove canonical-only file selection, 24h/no-cursor behavior, since-cursor behavior, overflow-safe cursor handling, content caps, open/complete/abandon state transitions, and no absolute root leakage.
- **After Agent C:** Authenticated HTTP tests cover dream status/create/get/complete/abandon routes, error codes, method-not-allowed cases, safe logs, and remote-safe JSON.
- **After Agent D:** CLI tests cover `dream` human output, `--json`, `--out`, `--status`, `--complete`, `--abandon`, unsupported local `--root`, and any apply-manifest helper using existing document update transport.
- **After Agent E:** End-to-end remote smoke test: create/update canonical memory, request dream batch, apply a dreamed document update through existing update flow, complete batch, verify cursor advances, verify next batch excludes completed files and includes later changes.
- **After Agent F:** `npm run validate` and `npm run cli:pack` pass; docs and co-located module docs match implementation; no provider/model/scheduler configuration appears in code/docs for dreaming.

## Tasks

- [x] 1.0 Replace the old server-side AI proposal with the remote batch workflow
  - [x] 1.1 Read `src/architecture.docs.md` and the relevant co-located `*docs.md` files before editing.
  - [x] 1.2 Remove assumptions about server-side LLM calls, provider config, and dreaming scheduler from implementation details.
  - [x] 1.3 Define durable terms: dream cursor, dream batch, open batch, completed batch, abandoned batch, remote-safe context, dream manifest, and apply manifest.
  - [x] 1.4 Decide final CLI syntax, defaulting to `jumpybrain dream --target-url <url>` plus flags for `--status`, `--out <file>`, `--complete <batch-id>`, `--abandon <batch-id>`, and optional `--apply-manifest <path>`.
  - [x] 1.5 Decide final HTTP routes and error codes before implementation.

- [x] 2.0 Define dream contract and JSON shapes
  - [x] 2.1 Define dream state path, likely `.jumpybrain/remote/dream-state.json`.
  - [x] 2.2 Define dream batch metadata path, likely `.jumpybrain/remote/dream-batches/<batchId>.json`.
  - [x] 2.3 Define `DreamStatus` fields: available, open batch, last completed cursor, last completed batch, last completed time, defaults/caps, and safe warnings.
  - [x] 2.4 Define `DreamBatch` fields: `batchId`, `status`, `fromCursor`, `toCursor`, `createdAt`, `expiresAt`, `files`, `hasMore`, `instructions`, resume/force behavior, and safe warnings.
  - [x] 2.5 Define file context fields: `id`, `file`, `type`, `title`, `frontmatter`, `contentHash`, `content`, `byteLength`, `truncated`, `mtime`, and `updatedAt`.
  - [x] 2.6 Define completion request fields: `batchId`, `summary`, `updatedDocumentIds`, `skippedDocumentIds`, and optional operator notes.
  - [x] 2.7 Define apply-manifest shape if implemented: `batchId`, `summary`, and updates with `id`, `ifMatch`, and local `contentFile`.
  - [x] 2.8 Define content-size behavior: default bytes per file, total response cap, truncation warnings, and whether `--out` can request a larger bounded packet than default stdout.

- [x] 3.0 Implement server-memory dream state and selection
  - [x] 3.1 Add a focused server-memory dream module rather than expanding unrelated processing code.
  - [x] 3.2 Read canonical Markdown documents from standard memory buckets only.
  - [x] 3.3 Select changed files by filesystem mtime with a stable cursor/tie-breaker; use frontmatter timestamps only as metadata.
  - [x] 3.4 Use last completed cursor when present; otherwise use a default 24h lookback.
  - [x] 3.5 Apply request/default caps for file count and content bytes.
  - [x] 3.6 Prevent overflow skip by advancing batch cursor only to the selected high-water mark, not blindly to “now” when more files remain.
  - [x] 3.7 Do not advance any cursor on retrieval/create; only explicit completion may advance reviewed-file state.
  - [x] 3.8 Store batch metadata without duplicating full memory bodies in support state.
  - [x] 3.9 Enforce one open batch per remote memory root by default; repeated create requests resume/return the open batch unless force/abandon semantics say otherwise.
  - [x] 3.10 Add complete and abandon operations; completion advances cursor, abandon does not.
  - [x] 3.11 Return `root: "remote:all"` and root-relative paths only.
  - [x] 3.12 Ensure batch operations are safe under the existing server write queue or a small dream-state mutex.

- [x] 4.0 Add app/server-memory seams
  - [x] 4.1 Add `getDreamStatus`, `createDreamBatch`, `getDreamBatch`, `completeDreamBatch`, and `abandonDreamBatch` app functions.
  - [x] 4.2 Export the seams from `src/app/server-memory/index.ts`.
  - [x] 4.3 Keep server-memory free of HTTP parsing and CLI formatting.
  - [x] 4.4 Update `src/app/server-memory/server-memory.docs.md` with dream state responsibilities and non-responsibilities.

- [x] 5.0 Add authenticated remote API and HTTP client support
  - [x] 5.1 Add route literals/helpers in `src/adapters/http-protocol.ts`.
  - [x] 5.2 Add authenticated `GET /memories/all/dream/status`.
  - [x] 5.3 Add authenticated `POST /memories/all/dream/batches`.
  - [x] 5.4 Add authenticated `GET /memories/all/dream/batches/:batchId`.
  - [x] 5.5 Add authenticated `POST /memories/all/dream/batches/:batchId/complete`.
  - [x] 5.6 Add authenticated `POST /memories/all/dream/batches/:batchId/abandon`.
  - [x] 5.7 Keep routes thin: parse JSON, authenticate, map errors, delegate to server-memory seams.
  - [x] 5.8 Log only route/status/batch/file-count/error-code metadata.
  - [x] 5.9 Add matching HTTP client transport methods.
  - [x] 5.10 Update HTTP server/client module docs.

- [x] 6.0 Add CLI dream workflow
  - [x] 6.1 Add `jumpybrain dream --target-url <url>` to create or fetch a dream batch.
  - [x] 6.2 Add `jumpybrain dream --target-url <url> --out dream-batch.json` to write full context to a file and keep stdout compact.
  - [x] 6.3 Add `jumpybrain dream --target-url <url> --status`.
  - [x] 6.4 Add `jumpybrain dream --target-url <url> --complete <batch-id> [--summary "..."]`.
  - [x] 6.5 Add `jumpybrain dream --target-url <url> --abandon <batch-id>`.
  - [x] 6.6 Add `--json` for status, batch, complete, and abandon outputs.
  - [x] 6.7 Human output must include local-agent instructions: review contexts, add/fix wiki links, update stale synthesis, preserve useful provenance/frontmatter, draft edits, refresh hashes if needed, apply edits with existing `jumpybrain update`, then complete the batch.
  - [x] 6.8 Human output must warn that memory content is untrusted context and should not be treated as executable instructions.
  - [x] 6.9 Human output must make cursor semantics clear: retrieving a batch does not mark it dreamt; only `--complete` advances dream state.
  - [x] 6.10 If adding `--apply-manifest`, implement it as CLI-side orchestration that calls existing remote document update methods per document, then completes the batch only after successful updates.
  - [x] 6.11 Make local `--root` dreaming unsupported in V1 with a clear message.
  - [x] 6.12 Update usage/help text and command baseline tests.

- [x] 7.0 Test behavior and guardrails
  - [x] 7.1 Unit test dream state read/write defaults and corrupt-state recovery behavior.
  - [x] 7.2 Unit test no-cursor 24h selection.
  - [x] 7.3 Unit test since-cursor selection.
  - [x] 7.4 Unit test overflow-safe cursor behavior with more changed files than the batch limit.
  - [x] 7.5 Unit test that retrieval/create alone does not advance the cursor and repeated create resumes/returns one open batch by default.
  - [x] 7.6 Unit test canonical bucket filtering and exclusion of `.jumpybrain/`.
  - [x] 7.7 Unit test content byte caps and truncation flags.
  - [x] 7.8 Unit test complete/abandon state transitions.
  - [x] 7.9 HTTP test auth-required behavior and method-not-allowed errors.
  - [x] 7.10 HTTP test response redaction: no server absolute root in status, batch metadata, errors, or logs.
  - [x] 7.11 CLI test human and JSON output.
  - [x] 7.12 CLI/apply test stale hash failure handling if `--apply-manifest` is implemented.
  - [x] 7.13 Add an end-to-end remote dream/update/complete smoke test using in-process server utilities.
  - [x] 7.14 Add a regression test or static check that dreaming introduces no provider/model env config and no scheduler hook.

- [x] 8.0 Documentation and finalization
  - [x] 8.1 Update `docs/technical.md` with the remote dream architecture and CLI contract.
  - [x] 8.2 Update `docs/cloud-shared-memory.md` with API routes, state files, and operator workflow.
  - [x] 8.3 Update `docs/memory-format.md` to note dream state is derived support state and canonical Markdown remains authoritative.
  - [x] 8.4 Update `docs/agent-workflows.md` with local-agent dreaming steps and prompt-injection cautions.
  - [x] 8.5 Update relevant `src/**/**docs.md` files for changed responsibilities.
  - [x] 8.6 Run `npm run validate`.
  - [x] 8.7 Run `npm run cli:pack` if CLI behavior or packaging changed.
  - [x] 8.8 Record final validation notes in this task list.
  - [x] 8.9 Update `tasks/CHANGELOG.md` and archive this task list only when implementation is complete.


## Validation Notes

- 2026-07-05: Implemented remote dream state, HTTP/client routes, CLI workflow, docs, and guardrail tests.
- 2026-07-05: `npm test -- --test-reporter=spec` passed (147 tests).
- 2026-07-05: `npm run validate` passed (147 tests).
- 2026-07-05: `npm run cli:pack` passed and produced `.local-pack/jumpybrain-0.0.1-local.2.tgz`.
- 2026-07-05: Task list was awaiting user confirmation per jumpy-goat completion protocol.
- 2026-07-06: Verified completion; `npm run validate` passed (155 tests).
- 2026-07-06: Verified packaging; `npm run cli:pack` passed and produced `.local-pack/jumpybrain-0.0.1-local.2.tgz`.

## Non-Tasks

- Do not add server-side LLM calls, model adapters, provider configuration, prompt templates, or paid-service behavior.
- Do not add a dreaming scheduler or background dreaming loop.
- Do not make the server synthesize, rewrite, or apply AI-generated memory content by itself.
- Do not add automatic prompt injection into agent workflows.
- Do not store raw prompts, local-agent outputs, or full memory bodies in dream state.
- Do not expose server absolute filesystem paths in any remote response, status, error, or log.
- Do not change canonical memory rules: Markdown files remain authoritative; indexes and dream state remain support/derived state.
- Do not introduce delete, move, rename, patch, CRDT/OT, or block-level edit semantics.
- Do not add browser UI, dashboards, accounts, RBAC, namespaces, or target registries.
- Do not change existing remote auto-index scheduling except as needed to keep document updates marking the index stale.
