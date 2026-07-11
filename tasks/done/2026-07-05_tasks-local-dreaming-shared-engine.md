# Local Dreaming Shared Engine

## Completion Summary

Completed on 2026-07-05. Local and remote dreaming now share core/app dream policy and workflow seams. Local `jumpybrain dream --root` supports status, create/resume, JSON/`--out`, complete, abandon, caps/force flags, and safe `--apply-manifest`; remote dreaming remains route-compatible and remote-safe. Validation passed with `npm run validate`, `npm run cli:pack`, packed-tarball local E2E, and VPS remote dreaming smoke.

## Goal

Extend `jumpybrain dream` to work for local memory roots while refactoring the current remote-only implementation into a clean shared dream engine. Local and remote dreaming should mirror functionality and CLI flags, with target-specific differences encapsulated behind app/runtime/transport seams.

## Notes

- Reusability and encapsulation are the priority: avoid duplicating local and remote dream logic.
- Shared/pure policy belongs in core where practical: cursor comparison, canonical candidate metadata shaping, limit normalization, content truncation policy, and safe relative-path handling.
- Stateful workflows belong in app: dream state read/write, create/resume/get/complete/abandon, batch hydration, and apply-manifest orchestration seams.
- Remote HTTP should stay a thin protocol layer over the shared app/server-memory dream workflow.
- Local CLI/runtime should call the same app workflow directly for `--root`.
- Local dream state should live under `.jumpybrain/dream/`:
  - `.jumpybrain/dream/state.json`
  - `.jumpybrain/dream/batches/<batchId>.json`
- Remote/server dream state may keep its remote operational paths unless the refactor finds a cleaner compatible shape:
  - `.jumpybrain/remote/dream-state.json`
  - `.jumpybrain/remote/dream-batches/<batchId>.json`
- Local dream batch output should follow local document conventions:
  - `target: "local"`
  - `root: <absolute memory root>`
  - root-relative `file` paths
- End state must include a real local end-to-end validation: update a local installed/dev instance, create a local memory change, run `jumpybrain dream --root <root>`, apply a local dreamed update, complete the batch, and verify the next local dream run excludes completed files.
- Remote dream output remains remote-safe:
  - `target: "remote"`
  - `memory: "all"`
  - `root: "remote:all"`
- No backwards compatibility guarantee is required for the just-added remote dream internals/API if reshaping improves architecture.
- No server-side AI/model/provider/scheduler behavior should be introduced.

## Relevant Files

- `src/architecture.docs.md` - Layering and dependency boundaries to preserve.
- `src/types.ts` - Shared/local/remote dream response and request types.
- `src/core/canonical/markdown-store.ts` - Canonical Markdown scanning/parsing helpers.
- `src/core/canonical/canonical.docs.md` - Core canonical boundary docs to update if shared dream policy lands in core.
- `src/core/` - Candidate home for pure dream cursor/limits/truncation/candidate policy.
- `src/core/dream/index.ts` - Shared backend-agnostic dream cursor, limits, relative-path, memory-type, and truncation policy.
- `src/core/dream/dream.docs.md` - Core dream boundary docs.
- `src/app/app.docs.md` - App responsibility docs to update if adding shared dream workflow.
- `src/app/dream/index.ts` - Shared local/remote dream state, selection, hydration, completion, and target-shaping workflow.
- `src/app/dream/dream.docs.md` - App dream workflow boundary docs.
- `src/app/server-memory/dream.ts` - Current remote/server dream implementation to refactor.
- `src/app/server-memory/index.ts` - Server-memory dream seams should delegate to shared app code.
- `src/app/server-memory/server-memory.docs.md` - Update after remote-specific responsibilities shrink.
- `src/runtime/index.ts` - Add local runtime dream seams if needed.
- `src/runtime/runtime.docs.md` - Document local runtime dream surface.
- `src/cli/dream.ts` - Current remote-only CLI workflow to generalize across local/remote targets.
- `src/cli/local-transport.ts` - Add local dream transport methods if CLI keeps a target-transport abstraction.
- `src/cli/memory-target.ts` / `src/cli/targets.ts` - Ensure local/remote target selection works for dream.
- `src/cli/document-edit.ts` - Reuse local/remote update concepts for apply-manifest behavior.
- `src/adapters/http-server/routes.ts` - Keep dream routes thin over server-memory seams.
- `src/adapters/http-client/index.ts` - Keep remote dream transport methods aligned with shared types.
- `docs/technical.md` - Document shared dream architecture and local CLI contract.
- `docs/memory-format.md` - Document local dream support state as derived.
- `docs/agent-workflows.md` - Document local and remote dream workflows.
- `docs/cloud-shared-memory.md` - Update if remote JSON/routes are reshaped during the refactor.
- `test/server-memory-app.test.js` - Existing remote dream app tests to keep passing or reshape.
- `test/dream-app.test.js` - Local app dream workflow coverage for state paths, canonical filtering, caps, resume, complete, abandon, and corrupt state.
- `test/dream-policy.test.js` - Pure core dream policy tests for cursors, caps, and safe relative paths.
- `test/runtime-document-operations.test.js` / `test/memory-cli.test.js` - Add local dream runtime/CLI tests.
- `test/server-http.test.js` / `test/http-client.test.js` - Keep remote dream route/transport coverage.
- `test/architecture-boundaries.test.js` / `test/core-boundary.test.js` / `test/runtime-boundary.test.js` - Boundary guardrails for the refactor.
- `scripts/local-pack-manifest.mjs` - Local package manifest updated for new dream modules.

## Decisions

- Local dreaming should mirror remote functionality rather than being a reduced feature set.
- The same CLI command and flags should work for local and remote targets:
  - `jumpybrain dream --root <root>`
  - `jumpybrain dream --target-url <url>`
  - `--status`, `--out`, `--json`, `--complete`, `--abandon`, `--apply-manifest`, and caps/force flags where supported.
- `--apply-manifest` should work locally and remotely, using the matching document update path and completing only after successful updates.
- Refactor first for clean architecture; do not bolt local support onto a remote-specific module.
- Local outputs may expose the selected local root, matching existing local runtime/CLI document behavior.
- Remote dream compatibility may be adjusted if needed because the current remote dream work has not been released as a stable API.

## Tasks

- [x] 1.0 Establish the shared dream architecture
  - [x] 1.1 Read `src/architecture.docs.md` and co-located docs for each source area before editing.
  - [x] 1.2 Identify which current `src/app/server-memory/dream.ts` logic is pure policy, stateful workflow, remote target shaping, or CLI/protocol formatting.
  - [x] 1.3 Define the final module split for shared dream code, e.g. core dream policy plus app dream workflow.
  - [x] 1.4 Decide final local state file names under `.jumpybrain/dream/`.
  - [x] 1.5 Decide whether existing remote dream state paths/types remain as-is or are reshaped during the refactor.
  - [x] 1.6 Update implementation notes in this task list if discoveries change the planned split.

- [x] 2.0 Extract pure dream policy into core
  - [x] 2.1 Add a focused core dream module only for backend-agnostic policy.
  - [x] 2.2 Move cursor shape/comparison and stable mtime-plus-path ordering into core.
  - [x] 2.3 Move limit defaults/caps normalization into core, keeping validation behavior deterministic.
  - [x] 2.4 Move canonical bucket candidate metadata shaping where it can stay HTTP/CLI/server-free.
  - [x] 2.5 Move bounded content truncation policy into a reusable helper.
  - [x] 2.6 Ensure core dream code imports no CLI, app, server, HTTP, logging, package-info, or QMD internals.
  - [x] 2.7 Add pure unit/property tests for cursor ordering, overflow-safe high-water marks, caps, and truncation.
  - [x] 2.8 Update core docs if a new core dream module is added.

- [x] 3.0 Create a shared app dream workflow
  - [x] 3.1 Add an app-level dream workflow module that composes core dream policy with filesystem state.
  - [x] 3.2 Parameterize target behavior: state directory, root label, target kind, memory namespace, and redaction expectations.
  - [x] 3.3 Implement state operations for status/create/get/complete/abandon once, usable by both local and remote.
  - [x] 3.4 Preserve one-open-batch semantics, force/abandon handling, no-op empty batch behavior, and completion-only cursor advancement.
  - [x] 3.5 Ensure batch metadata state stores no full memory bodies.
  - [x] 3.6 Ensure local state lives under `.jumpybrain/dream/` and remote server state remains under approved remote support state paths.
  - [x] 3.7 Add corrupt-state recovery behavior for local and remote state where safe.
  - [x] 3.8 Keep app dream workflow free of HTTP parsing, CLI formatting, API-key handling, logging concerns, and model/provider code.

- [x] 4.0 Rewire remote dreaming to the shared workflow
  - [x] 4.1 Replace remote-specific server dream internals with calls into the shared app dream workflow.
  - [x] 4.2 Keep `src/app/server-memory/index.ts` as the server-memory seam for remote status/create/get/complete/abandon.
  - [x] 4.3 Keep HTTP dream routes thin: parse JSON, authenticate, enqueue state transitions, map errors, and log safe metadata only.
  - [x] 4.4 Keep HTTP client methods aligned with the final shared types/routes.
  - [x] 4.5 Preserve or intentionally update remote tests for auth, redaction, method handling, completion, and stale apply behavior.
  - [x] 4.6 Confirm remote responses still use `root: "remote:all"`, relative paths only, and no memory bodies in status/log/state.

- [x] 5.0 Add local runtime and CLI dream support
  - [x] 5.1 Add local runtime/app seams for dream status/create/get/complete/abandon.
  - [x] 5.2 Add local dream methods to `src/cli/local-transport.ts` or an equivalent CLI target abstraction.
  - [x] 5.3 Generalize `src/cli/dream.ts` so `--root` and `--target-url` share formatting, JSON, `--out`, completion, abandonment, and caps handling.
  - [x] 5.4 Remove the current local `--root` unsupported error.
  - [x] 5.5 Ensure human output stays compact by default and recommends `--out` for full contexts.
  - [x] 5.6 Ensure local output clearly states that retrieved memory content is untrusted context and completion advances dream state.
  - [x] 5.7 Ensure local dream batches use `target: "local"`, the resolved local root, and root-relative files.
  - [x] 5.8 Update usage/help text and baseline command tests for local dream examples.

- [x] 6.0 Mirror apply-manifest locally and keep it safe
  - [x] 6.1 Define a target-independent apply-manifest helper in CLI/app code that can call local or remote document update methods.
  - [x] 6.2 Keep manifest shape compatible across local and remote: `batchId`, `summary`, updates with `id`, `ifMatch`, and relative `contentFile`, plus skipped IDs.
  - [x] 6.3 Reject absolute `contentFile` paths and `..` traversal for local and remote apply-manifest.
  - [x] 6.4 For local apply-manifest, call local document update with existing `ifMatch` semantics.
  - [x] 6.5 Complete the local batch only after all updates succeed.
  - [x] 6.6 Leave the batch open when any local or remote update fails with stale hash or validation errors.
  - [x] 6.7 Add tests for successful local apply, stale local hash failure, unsafe manifest paths, and completion-after-success only.

- [x] 7.0 Test local/remote parity and guardrails
  - [x] 7.1 Add local app/runtime tests for no-cursor 24h selection, since-cursor selection, and overflow-safe cursor behavior.
  - [x] 7.2 Add local tests for canonical bucket filtering and exclusion of `.jumpybrain/`.
  - [x] 7.3 Add local tests for content caps, truncation flags, and metadata-only state.
  - [x] 7.4 Add local tests for repeated create resume behavior, force behavior, complete, abandon, and empty no-op batches.
  - [x] 7.5 Add CLI tests for `dream --root`, `--json`, `--out`, `--status`, `--complete`, `--abandon`, and local `--apply-manifest`.
  - [x] 7.6 Keep remote HTTP/client tests passing after the refactor.
  - [x] 7.7 Add or preserve static guardrails proving no AI provider config, model calls, prompt templates, or dream scheduler hooks were introduced.
  - [x] 7.8 Add architecture-boundary assertions if new core/app modules create new import-risk surfaces.
  - [x] 7.9 Add a deterministic CLI smoke test that creates/updates local memory, runs `dream --root`, applies a local dreamed edit, completes the batch, and verifies the next batch excludes completed files.

- [x] 8.0 Documentation and finalization
  - [x] 8.1 Update `docs/technical.md` with the shared local/remote dream architecture and CLI contract.
  - [x] 8.2 Update `docs/memory-format.md` to document `.jumpybrain/dream/` as derived local dream state.
  - [x] 8.3 Update `docs/agent-workflows.md` with local and remote dream steps.
  - [x] 8.4 Update `docs/cloud-shared-memory.md` if remote routes/types/state paths changed.
  - [x] 8.5 Update relevant `src/**/**docs.md` files for changed responsibilities.
  - [x] 8.6 Run `npm run validate`.
  - [x] 8.7 Run `npm run cli:pack`.
  - [x] 8.8 Run a manual/local-installed end-to-end validation: install or update the local dev package/CLI, initialize or use a local memory root, write/update a memory, run local dreaming, apply a local dreamed update, complete the batch, and verify subsequent local dreaming cursor behavior.
  - [x] 8.9 Record automated and manual validation notes in this task list, including exact commands used for the local end-to-end smoke.
  - [x] 8.10 Update `tasks/CHANGELOG.md` and archive this task list only when implementation is complete. Changelog updated and task archived.

## Non-Tasks

- Do not add server-side or local automatic AI/model/provider calls.
- Do not add a dream scheduler or background dreaming loop.
- Do not make dream create/get synthesize or apply memory content by itself.
- Do not store full memory bodies, prompts, or model output in dream state.
- Do not add patch/block-level edit semantics, deletes, moves, renames, CRDT/OT, or browser UI.
- Do not duplicate local and remote dream implementations when a shared workflow can express both.
- Do not expose server absolute filesystem paths in remote responses, errors, logs, or state.

## Implementation Notes

- Final split:
  - `src/core/dream/index.ts` owns pure dream policy: cursor construction/comparison, stable ordering, limits/caps, safe canonical relative paths, memory-type/date shaping, and content truncation bounds.
  - `src/app/dream/index.ts` owns shared stateful dream workflow and parameterizes local vs remote support paths, target kind, root label, and memory namespace.
  - `src/app/server-memory/dream.ts` is a thin remote facade configured with `target: "remote"`, `memory: "all"`, `root: "remote:all"`, `.jumpybrain/remote/dream-state.json`, and `.jumpybrain/remote/dream-batches/`.
  - Local runtime/CLI calls the same shared app workflow with `target: "local"`, resolved local root labels, `.jumpybrain/dream/state.json`, and `.jumpybrain/dream/batches/`.
- Completion keeps the global batch cursor at the selected batch high-water mark and records per-file completion cursors so edited completed files stay out of later batches without skipping overflow files.
- `--apply-manifest` is target-independent in the CLI and only completes a batch after all listed document updates succeed; stale hashes and unsafe content paths leave the batch open.
- Remote HTTP routes/client methods stayed route-compatible and remote-safe; no AI/model/provider/scheduler behavior was introduced.

## Validation Notes

- `npm run validate` — passed (153 tests).
- `npm run cli:pack` — passed; packed `.local-pack/jumpybrain-0.0.1-local.2.tgz` and verified 98 required CLI/runtime files.
- Focused smoke during development: `npm run build && node --test test/dream-app.test.js test/memory-cli.test.js test/dream-policy.test.js` — passed.
- Manual/local-installed end-to-end validation against the packed tarball — passed. Exact flow used:

```bash
TMP=$(mktemp -d)
ROOT_DIR="$PWD"
cd "$TMP"
npm init -y >/dev/null
npm install -D "$ROOT_DIR/.local-pack/jumpybrain-0.0.1-local.2.tgz" >/dev/null
CLI="$TMP/node_modules/.bin/jumpybrain"
MEM="$TMP/memory"
"$CLI" init --root "$MEM"
printf 'Manual local dream should update the kiwi note.\n' | "$CLI" remember --root "$MEM" --type finding --title "Manual local dream" --json
"$CLI" dream --root "$MEM" --out "$TMP/dream.json" --json
"$CLI" show --root "$MEM" --id <mem_id> --json
# wrote revised.md and manifest.json with batchId, id, ifMatch, and relative contentFile
"$CLI" dream --root "$MEM" --apply-manifest "$TMP/manifest.json" --json
"$CLI" dream --root "$MEM" --json
```

- Manual run result: apply-manifest completed a local batch (`status: "completed"`, `target: "local"`), and the next local dream run returned `status: "completed"` with the edited document excluded.
- VPS remote dream smoke passed after deployment: remote status/create/`--out` worked with `target: "remote"`, `root: "remote:all"`; smoke batch was abandoned and final status had no open batch.
