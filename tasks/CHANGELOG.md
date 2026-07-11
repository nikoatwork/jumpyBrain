# Task Changelog

## 2026-07-11 — Open-source security/docs audit and `0.1.0` release completed

- Revoked the historically published demo credential, verified it returns `401`, and validated authenticated status/tree/recall against the configured production global memory.
- Made public uninstall ownership fail closed, added manifest/path/memory-deletion regressions, and smoke-tested clean install/update/uninstall plus authenticated server recall.
- Split shared-memory onboarding from the protocol/API reference, corrected idempotency and source-boundary docs, and added a runtime `graphMemory` export guard.
- Replaced the public remote with one reviewed clean snapshot, deleted obsolete remote refs, and verified a fresh clone with zero Gitleaks findings, 195 tests, zero npm audit vulnerabilities, a clean `0.1.0` package, resolved documentation links, and the historical credential still invalid.
- Archived the completed audit as `tasks/done/2026-07-11_tasks-open-source-security-docs-audit.md`; retained a permission-restricted offline pre-rewrite bundle because external clones, forks, caches, and archives cannot be recalled.

## 2026-07-11 — Per-target CLI read-only policy completed

- Added strict schema-v1 device-local CLI policy keyed by normalized remote HTTP(S) origin, with an explicit retrieval allowlist and early rejection of canonical, derived-index, and dream-state mutations before credentials, inputs, preflight work, idempotency, or network transport.
- Added reversible installer flags (`--read-only-target` / `--allow-write-target`), managed-rerun and `jumpybrain update` preservation, custom-install shim config selection, fail-safe config updates, manifest ownership metadata, uninstall cleanup, and packed-CLI coverage.
- Added deterministic config, command-matrix, property, installer, architecture, and real loopback integration tests; documented the policy as advisory client safety rather than server authorization.
- Validated a fresh installed shim against two loopback servers: seven protected retrieval flows passed, eight mutation classes were blocked with no request/state changes, the unlisted target remained writable/editable/indexable, update preserved policy, and explicit reversal restored writes. `npm test` (184 tests), `npm run cli:pack`, and `git diff --check` pass.

## 2026-07-11 — Installer rerun ownership hardened

- Preserved recorded refs on managed reruns, made installer manifests fail closed, narrowed the README demo-host guard, and consolidated live credential rotation into the public-sandbox task; `npm test` passes (175 tests).

## 2026-07-10 — Existing installer reruns made app/CLI-only and fail-safe

- Made managed `install.sh` reruns app/CLI-only and fail-safe, preserving memory, configuration, indexes, and integrations while refusing unsafe layouts or setting changes and retaining the working CLI after failed updates.

## 2026-07-10 — Graph visual system overhaul

- Rebuilt `/graph` around a light, professional forest-green and cream visual system with reusable color, typography, spacing, radius, elevation, motion, control, and application-shell primitives.
- Reorganized the page into a product/context top bar, labeled exploration toolbar, calm knowledge canvas, compact legend and metrics, and a responsive reading panel with improved Markdown typography and metadata hierarchy.
- Improved dense-graph readability with a degree-aware elliptical spiral layout, persistent labels for the most connected memories, hover/focus labels for the rest, type-aware node colors, and clearer selected/unresolved states.
- Added explicit zoom/reset controls, Enter-to-search, keyboard-activatable graph nodes, reduced-motion support, responsive panel behavior, accessible status treatment, and cleaner loading/error feedback without adding dependencies.
- Added regression coverage for the design tokens, application hierarchy, graph control surface, and motion preference support; existing graph and Markdown renderer behavior remains covered.
- Validated with `npm test` (164 pass) plus browser QA at desktop and 390px mobile widths, including node selection, the reading panel, resize recentering, and zero browser console errors.

## 2026-07-09 — Graph note slide-in panel implemented

- Added a slide-in note reader to the `/graph` page: clicking a document node opens a 33vw panel (graph flexes to 67vw) and renders the node's `.md` note via an inline, dependency-free Markdown renderer; no new npm dependencies.
- Removed the fixed 20rem `<aside>` Details block entirely; the slide-in is now the only details surface. `#ready`/`#error`/`#status`/stats indicators moved into the header with `data-testid` attributes preserved, and `main` switched from a two-column grid to a flex layout where the graph section takes full width by default.
- Added `<aside id="note-panel">` markup starting closed (`data-closed`), with `data-testid` hooks `graph-note-panel`/`graph-note-close`/`graph-note-title`/`graph-note-content`. CSS uses a `body.panel-open` class to toggle the 33vw slide-in with a smooth transition and dark-theme tokens.
- Implemented `renderMarkdown(md)` in the page script (headings, ordered/unordered lists, fenced/inline code, bold/italic, links, blockquotes, horizontal rules, paragraphs). HTML is escaped before interpretation to prevent injection; fenced/inline code content stays uninterpreted. Frontmatter is rendered as a muted `<details>` metadata block above the body.
- Wired `selectNode` to the slide-in: unresolved nodes do not open the panel and set `#status` to "unresolved link: <title>"; document nodes fetch `GET /memories/all/documents/:id` (reusing the existing Bearer API key), show "loading…", then render `payload.content`. The panel persists across clicks and swaps content without close/reopen animation; a stale-fetch guard (`state.noteToken`) discards out-of-order responses. On non-2xx/fetch failure the panel closes and the error surfaces in `#status`/`#error`.
- Close via close button, Escape key (which also clears the active node selection), or re-clicking the active node. Opening the panel focuses the close button; the note content scrolls independently of the graph.
- Added unit tests in `test/graph.test.js` for the panel markup (fixed aside removed, panel scaffolded and closed by default), the click wiring (unresolved guard, re-click close, document fetch URL, Escape), and the inline renderer (escaping, headings, bold/italic/code, links, lists, fenced blocks, blockquote, hr, frontmatter). Added Playwright smoke coverage in `scripts/graph-ui-smoke.mjs` for open/close, Escape, re-click toggle, content swap while open, and the unresolved guard.
- Validated with `npm test` (163 pass). Frontend-only change; no `src/core`, `src/app`, or HTTP route/protocol changes.
- Archived the completed task list as `tasks/done/2026-07-09_tasks-graph-note-slidein.md`.

## 2026-07-09 — Core graph visualization implemented

- Added an Obsidian/Logseq-style networked-notes graph based on explicit Markdown wiki-links and Markdown links, not embeddings.
- Introduced graph data model in `src/types.ts`: `MemoryGraphNode` (document/unresolved/tag), `MemoryGraphEdge` (directed, resolved flag), `MemoryGraphResult`, and `MemoryGraphOptions` (focus, depth, edgeTypes, tags, type, path, query, includeUnresolved, includeOrphans, limit).
- Moved pure canonical link-target resolution from `src/app/local-memory/overview.ts` into reusable core helpers in `src/core/canonical/links.ts` (`buildCanonicalLinkTargetLookup`, `resolveCanonicalLinkTarget`, `normalizeCanonicalLinkLookupKey`, `canonicalDocumentLinkKeys`); overview now delegates to these.
- Added app-level graph assembly in `src/app/local-memory/graph.ts` (`graphMemory`) with deterministic derived nodes/edges, backlinks via reversed directed edges, unresolved virtual targets, local-graph focus/depth, and filters.
- Added server-memory remote-safe graph packet `graphServerMemory` / `RemoteMemoryGraphPacket` in `src/app/server-memory/index.ts`.
- Added HTTP routes: `GET /graph` (unauthenticated static HTML/JS page with pan/zoom, filters, click details, stable test IDs) and `GET /memories/all/graph.json` (authenticated JSON with query params).
- Added Playwright smoke script `scripts/graph-ui-smoke.mjs` and `npm run smoke:graph` for browser validation against a live server.
- Added unit tests for local graph extraction (aliases/anchors, duplicate basenames, sessions, orphans, backlinks) and HTTP graph JSON (auth, shape, unresolved, remote-safe, empty roots, limit truncation).
- Updated module and cloud-shared-memory docs for graph boundaries and routes.
- Validated against `/Users/monkey/.jumpybrain/memory` with Playwright; `npm test` (159 pass) and `npm run cli:pack` pass.
- Archived the completed task list as `tasks/done/2026-07-09_tasks-core-graph-visualization.md`.

## 2026-07-05 — Local/shared dreaming engine implemented

- Refactored dream internals into shared core/app seams: pure dream cursor/limit/path/truncation policy in `src/core/dream/` and local/remote state workflow in `src/app/dream/`.
- Added local `jumpybrain dream --root <memory-root>` support with status/create/resume/complete/abandon, `--json`, `--out`, force/cap flags, and target-independent `--apply-manifest`.
- Preserved remote dream HTTP/client behavior through a thin server-memory facade while keeping remote responses at `target: "remote"`, `memory: "all"`, and `root: "remote:all"`.
- Added local dream derived state under `.jumpybrain/dream/state.json` and `.jumpybrain/dream/batches/` with metadata-only storage and no AI/model/provider/scheduler behavior.
- Added local app, pure policy, CLI, packaging, and remote regression coverage for shared dreaming, local apply success/failure, unsafe manifest paths, cursor exclusion after completion, and boundary guardrails.
- Updated technical, memory-format, agent-workflow, cloud/shared-memory, and source module docs for the shared local/remote dream architecture.
- Validation passed with `npm run validate`, `npm run cli:pack`, a packed-tarball local dream end-to-end smoke, and a VPS remote dreaming smoke.
- Archived the completed task list as `tasks/done/2026-07-05_tasks-local-dreaming-shared-engine.md`.

## 2026-07-05 — Remote dreaming memory consolidation implemented

- Added remote-only `jumpybrain dream` CLI workflow for hosted/shared memory batch status, creation/resume, JSON/`--out` context export, completion, abandonment, and client-side apply-manifest orchestration.
- Added derived remote dream state under `.jumpybrain/remote/dream-state.json` and `.jumpybrain/remote/dream-batches/` with metadata-only storage, one-open-batch semantics, empty-batch no-op completion, and completion-only cursor advancement.
- Added authenticated dream HTTP routes and client methods for status/create/get/complete/abandon while keeping route logs and status responses free of memory bodies and server absolute paths.
- Added overflow-safe canonical Markdown selection from standard memory buckets with bounded content bytes, content hashes, remote-safe relative paths, and untrusted-context warnings.
- Updated technical, cloud/shared-memory, memory-format, agent-workflow, and module-boundary docs to state that remote dreaming has no server AI/model/provider/scheduler behavior.
- Added server-memory, HTTP, HTTP-client, and CLI coverage for dream batches, cursor behavior, redaction, stale-hash apply failure, and usage contract drift.
- Validation passed with `npm test -- --test-reporter=spec` and `npm run cli:pack`.
- Archived the completed task list as `tasks/done/2026-07-06_tasks-remote-dreaming-memory-consolidation.md`.

## 2026-07-04 — Subagent architecture hardening completed

- Ran isolated subagent reviews across core, app, adapters/server, CLI/runtime, and cross-cutting architecture.
- Tightened core/runtime/app adapter export surfaces and added explicit package entrypoints with package-resolution tests.
- Extracted shared frontmatter parsing, canonical Markdown walking, HTTP protocol route helpers, CLI memory command handlers, and core document ID-stamping policy.
- Split HTTP server routing from the server adapter surface and split processing `ensure-ids` behavior into a focused module.
- Moved remote API-key ownership to the CLI boundary, removed app-layer console logging side effects, and folded orphan target docs into CLI docs.
- Added recursive co-located docs enforcement and updated compact module docs for writing, local-memory overview, QMD, HTTP server, runtime, processing, and CLI seams.
- Validation passed with `npm run validate`, `npm run cli:pack`, local installed-CLI smoke, remote/production smoke, `git diff --check`, and independent subagent review feedback addressed.
- Archived the completed task list as `tasks/done/2026-07-04_tasks-subagent-architecture-hardening-findings.md`.

## 2026-07-04 — Memory document editing completed

- Implemented canonical file-level `mem_<uuid>` IDs for newly written notes, findings, decisions, preferences, sessions, and synthesized pages.
- Added explicit ID-stamping maintenance via `jumpybrain process --mode ensure-ids --apply` for canonical buckets.
- Added exact document read/update contracts, stable `sha256:<hex>` content hashes, protected frontmatter semantics, and optimistic concurrency errors.
- Added local runtime and CLI document editing with `jumpybrain show` and stdin-driven `jumpybrain update --if-match`.
- Added authenticated hosted/global document GET/PUT endpoints and remote CLI/client transports with safe metadata and stale-index behavior.
- Added deterministic unit/integration/smoke coverage for local and in-process remote edit loops plus command-help drift checks.
- Updated public architecture, memory-format, cloud/shared-memory, agent workflow, local build, and CLI usage documentation.
- Validation completed with `npm run validate`, `npm run cli:pack`, real local-memory editing, and deployed/global memory editing through the supported CLI workflow.
- Archived the completed task list as `tasks/done/2026-07-04-tasks-memory-document-editing.md`.

## 2026-07-04 — Memory overview tree completed

- Added local and remote `tree`/`overview` memory summaries for counts, buckets, recent files, tags/types, index freshness, and optional connection stats.
- Added remote overview/tree endpoint with safe metadata and no server absolute path leakage.
- Added CLI rendering and JSON support for overview/tree output.
- Added deterministic tests for overview behavior and remote HTTP coverage.
- Archived the completed task list as `tasks/done/2026-07-04_tasks-memory-overview-tree.md`.

## 2026-07-04 — CLI installer update command completed

- Added installer-backed `jumpybrain update` for public-installer installs.
- Preserved memory root, install root, scope, source/ref, and integration choices from the installer manifest.
- Added safe failure behavior for source/dev installs without an installer manifest.
- Updated install/local-build docs and installer tests.
- Archived the completed task list as `tasks/done/2026-07-04_tasks-cli-installer-update-command.md`.

## 2026-07-04 — Architecture pragmatic self-hosting decisions completed

- Closed remaining post-architecture-hardening follow-ups with pragmatic source/installer-first decisions.
- Kept the layered `cli`/`app`/`core`/`adapters`/`runtime`/`server` layout without adding premature npm/package complexity.
- Decided not to add a restrictive `package.json` exports map yet.
- Documented and preserved current CLI/runtime/server behavior and package validation expectations.
- Archived the completed task list as `tasks/done/2026-07-04_tasks-architecture-pragmatic-self-hosting-decisions.md`.

## 2026-07-04 — General file logging and checklogs completed

- Added compact file-backed server logging under `.jumpybrain/logs/` with secret/body redaction.
- Wired HTTP/server endpoints and auto-index events into reusable logging.
- Added deterministic logger/server tests and deployment docs.
- Added a local ignored checklogs helper for SSH/file inspection.
- Validation passed with `npm test`, `npm run cli:pack`, and a local server smoke test.
- Archived the completed task list as `tasks/done/2026-07-04_tasks-general-file-logging-and-checklogs.md`.

## 2026-07-04 — Repository architecture cleanup completed

- Removed benchmark ownership from the repository.
- Introduced layered architecture documentation and guardrails.
- Moved QMD, HTTP client/server, logging, and package metadata under `src/adapters/`.
- Moved local/server use cases under `src/app/`; kept canonical Markdown and writing policy under `src/core/`.
- Kept `src/cli.ts` as a shim with command behavior in focused `src/cli/` modules.
- Added architecture-boundary tests and package-shape checks.
- Validation passed with `npm test` and `npm run cli:pack`.
- Archived the completed task list as `tasks/done/2026-07-04_tasks-repository-architecture-cleanup.md`.

## 2026-07-04 — Server auto-index scheduler completed

- Added server-local auto-index scheduler enabled by default for `jumpybrain serve`.
- Added stale-only fixed 5-minute ticks, shared manual/scheduled index runner, overlap guards, and write/index race handling.
- Added deterministic tests and updated remote deployment docs.
- Validation passed with `npm test` and `npm run cli:pack`.
- Archived the completed task list as `tasks/done/2026-07-04_tasks-server-auto-index-scheduler.md`.

## 2026-07-03 — Cloud shared memory V1 completed

- Implemented lean self-hostable HTTP server for one shared remote memory namespace.
- Kept remote canonical state as Markdown files on server disk with derived/rebuildable indexing and support state.
- Added API-key authentication, remote status/index/search/recall/write/wrapup flows, idempotent create handling, and CLI remote target support.
- Documented deployment and remote workflow behavior.
- Archived the completed task list as `tasks/done/2026-07-03_tasks-10-cloud-shared-memory-v1.md`.

## 2026-07-03 — CLI/runtime modular refactor completed

- Refactored jumpyBrain toward internal runtime/app/server/CLI boundaries while keeping one source/installer-first package.
- Preserved CLI behavior as the compatibility surface.
- Encapsulated QMD behind adapter/runtime boundaries.
- Completed by Ralph loop and merged after validation.
- Archived the completed task list as `tasks/done/2026-07-03_tasks-monorepo-cli-runtime-split.md`.

## 2026-06-26 — Code quality tightening sprint completed

- Added stronger architecture drift tests, pure CLI arg parsing refactor, deterministic property/error/compatibility/processing tests, canonical Markdown fixtures, local pack manifest tightening, and an advisory quality report.
- Dogfooded manual CLI paths and ran final validation with `npm run validate` and `npm run cli:pack`.
- Archived the completed task list as `tasks/done/2026-06-26_tasks-code-quality-tightening-sprint.md`.

## 2026-06-26 — Architecture edge scan and property testing completed

- Added deterministic `fast-check` setup and bounded property tests for high-value architecture edges.
- Extracted shared source import-graph helpers.
- Documented property-test rules in `test/PROPERTY_TESTING.md`, `docs/technical.md`, and `AGENTS.md`.
- Validation passed with `npm run validate` and `npm run cli:pack`.
- Archived the completed task list as `tasks/done/2026-06-26_tasks-architecture-edges-property-testing.md`.

## 2026-06-26 — Easy installation and agent onboarding completed

- Added installer/uninstaller scripts, portable Codex/Claude skill, Pi extension, QMD binary resolution hardening, `jumpybrain doctor`, installer docs, README install prompt, and deterministic installer tests.
- Validation passed with `npm run validate`.
- Archived the completed task list as `tasks/done/2026-06-26_tasks-easy-installation.md`.

## 2026-06-24 — CLI remember/recall simplification completed

- Renamed write command from `note` to `remember` and centered retrieval docs on `recall`.
- Kept old note commands as migration errors.
- Made `remember` rebuild the derived index after writing.
- Updated docs/tests and validated with `npm test`.
- Archived the completed task list as `tasks/done/2026-06-24_tasks-cli-remember-recall.md`.

## 2026-06-23 — Open source readiness completed

- Prepared jumpyBrain for a public GitHub repository while keeping npm publication as a later follow-up.
- Added public repo hygiene, MIT license, public docs wording, safety scans, and task-history exclusion from public git history.
- Archived the completed task list as `tasks/done/2026-06-23_tasks-open-source-readiness.md`.
