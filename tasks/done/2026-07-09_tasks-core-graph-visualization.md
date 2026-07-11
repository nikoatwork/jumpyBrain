# Core Graph Visualization

## Goal

Make jumpyBrain more visual by adding a built-in browser view for local/server memory roots. The first version should feel closer to an Obsidian/Logseq graph than an admin table: nodes are Markdown memories/pages, edges show explicit wiki/Markdown-link relationships, and search/recall context can be explored visually.

## Notes

- Decision from planning: graph visualization is core jumpyBrain functionality and belongs in this repo/package.
- Keep Markdown files canonical; graph data is derived/rebuildable.
- Prefer a dependency-light first version. Avoid making a hosted/demo-specific UI part of the core feature.
- Respect architecture boundaries: core can expose pure canonical graph primitives; app composes memory-root graph data; HTTP routes stay thin.
- Embedding/vector visualization is out of scope for this task; ship an explicit Markdown-link networked-notes graph first.

## Research Findings

- Obsidian's graph is centered on notes as nodes and internal links as edges, with global graph and local graph modes, local depth, filters for tags/path/query/orphans/unresolved targets, and display controls such as arrows, labels, node sizing, pan/zoom, hover, and click-to-open.
- Obsidian backlinks are a derived reverse view of explicit links; non-existing linked notes can appear or be hidden via an existing-files-only style filter.
- Logseq's graph is similarly page-node/link-edge oriented, with global and page-focused graph views; `[[page]]` and `#tag` behave as page references, while unlinked references are a discovery/conversion workflow rather than default graph edges.
- For jumpyBrain v1, prefer document nodes plus directed explicit `wiki-link`/`markdown-link` edges; derive backlinks by reversing those edges. Treat unresolved targets as optional virtual nodes, tags as filters or an optional later layer, and unlinked mentions/block-level graphing as out of scope.
- Repo check: `src/core/canonical/links.ts` already exposes `extractCanonicalLinks`, and `src/app/local-memory/overview.ts` already derives connection stats including unresolved links and orphans. Graph work should reuse/extend this behavior rather than invent a separate parser.
- Sources: Obsidian graph/internal-link/backlink/tag docs (`https://help.obsidian.md/plugins/graph`, `https://help.obsidian.md/links`, `https://help.obsidian.md/plugins/backlinks`, `https://help.obsidian.md/tags`); Logseq graph/reference docs (`https://github.com/logseq/handbooks/blob/master/docs/3.Features/graph-view_general.md`, `https://github.com/logseq/handbooks/blob/master/docs/3.Features/graph-view_page.md`, `https://github.com/logseq/handbooks/blob/master/docs/1.Getting-Started/5.link-your-notes-with-page-and-block-references.md`).

## Relevant Files

- `src/architecture.docs.md` - Architecture guardrails to read before implementation.
- `src/core/canonical/canonical.docs.md` - Canonical Markdown parsing/link behavior.
- `src/app/local-memory/local-memory.docs.md` - Local memory orchestration boundaries.
- `src/app/server-memory/server-memory.docs.md` - Server-local memory behavior.
- `src/adapters/http-server/http-server.docs.md` - HTTP route/server adapter boundary.
- `src/cli/serve.ts` - Existing server command entry point.
- `src/core/canonical/links.ts` - Existing canonical wiki/Markdown-link extraction helper.
- `src/app/local-memory/overview.ts` - Existing derived connection stats for unresolved links, orphans, and edge counts.
- `docs/cloud-shared-memory.md` - Current shared-memory server behavior to document alongside graph view.
- `package.json` - Validation/dev scripts; update if adding a Playwright smoke-test script.

## Tasks

- [x] 1.0 Define the graph data model
  - [x] 1.1 Read the relevant `*docs.md` files before changing source modules.
  - [x] 1.2 Define node fields: `id`, root-relative `file`, title, bucket/type/category, tags, timestamps when available, short snippet, `nodeKind` (`document`, `unresolved`, optional `tag`), and existence/indexed flags.
  - [x] 1.3 Define directed edge types for explicit `wiki-link` and `markdown-link`; derive backlinks by reversing these edges. Treat tag edges and unlinked mentions as optional later layers, not v1 defaults.
  - [x] 1.4 Represent missing/ambiguous targets as virtual unresolved nodes with a show/hide filter; never create or mutate Markdown to resolve them.
  - [x] 1.5 Define global graph vs local graph semantics: focus node, incoming/outgoing links, depth, orphans, unresolved targets, and max render limits.

- [x] 2.0 Implement derived graph extraction
  - [x] 2.1 Reuse and extend existing `extractCanonicalLinks` and overview connection logic for graph extraction; preserve deterministic output.
  - [x] 2.2 Add app-level graph assembly for a memory root using canonical Markdown scan results.
  - [x] 2.3 Keep graph output deterministic and rebuildable from Markdown files.
  - [x] 2.4 Add unit tests with fixtures for pages, decisions, findings, raw sessions, duplicate basenames, unresolved wiki links, aliases/anchors, tag frontmatter, orphans, and reverse backlinks.

- [x] 3.0 Add graph API endpoints to the server
  - [x] 3.1 Add thin JSON endpoints such as `GET /graph.json` and local/focused graph query params (`focus`, `depth`, `edgeTypes`, `tags`, `type`, `path`, `includeUnresolved`, `includeOrphans`).
  - [x] 3.2 Keep auth/rate-limit behavior consistent with existing server policy.
  - [x] 3.3 Add tests for endpoint shape, errors, empty memory roots, and large roots.

- [x] 4.0 Add a built-in visual graph page
  - [x] 4.1 Serve a dependency-light static HTML/JS graph view from the existing web server.
  - [x] 4.2 Render nodes and edges with pan/zoom, hover details, and click-to-open/search context.
  - [x] 4.3 Add filters for text search, path/bucket, memory type, tags, edge type, unresolved/existing-only, orphans, and local-graph depth.
  - [x] 4.4 Make the page useful for demos without requiring a build step or separate frontend app.
  - [x] 4.5 Add a Playwright-friendly smoke-test target/state for the graph page, including stable selectors or test IDs for graph loaded, node count, edge count, filters, and error state.

- [x] 5.0 Explicitly defer non-link visualization
  - [x] 5.1 Document that vector/embedding/similarity maps are out of scope for this task.
  - [x] 5.2 Ensure API/UI labels do not market the graph as semantic similarity or embedding-based.
  - [x] 5.3 Record follow-up ideas separately only after the explicit-link graph is stable.

- [x] 6.0 Document and validate
  - [x] 6.1 Document how to run the graph view locally and against a server memory root.
  - [~] 6.2 Add screenshots or a short demo script once stable. - Skipped: not yet stable for screenshot; smoke script exists.
  - [x] 6.3 During implementation self-validation, build/start the local dev server against a fixture or sample memory root, open the graph route, and verify the page fetches graph JSON successfully.
  - [x] 6.4 Validate the browser UI with Playwright: load the graph route, wait for graph-ready state, assert expected nodes/edges render, exercise at least one filter/local-depth interaction, and capture/debug failures with screenshots or traces.
  - [x] 6.5 Run `npm test` and `npm run cli:pack`.

## Decisions

- Graph visualization is core functionality in the open source package.
- Start with an Obsidian/Logseq-style networked-notes graph based on explicit wiki/Markdown links, not embeddings.
- Backlinks are derived by reversing explicit directed link edges rather than stored as a separate canonical relationship.
- Tags are v1 filters first; tag nodes/edges can be an optional later layer.
- Browser validation is required for this feature: run the dev server locally and use Playwright to verify the graph page, not only JSON/unit tests.

## Changelog

- Update `tasks/CHANGELOG.md` when this task list is completed and archived.

## Implementation Notes

- Graph data model lives in `src/types.ts` (`MemoryGraphNode`, `MemoryGraphEdge`, `MemoryGraphResult`, `MemoryGraphOptions`).
- Core pure link helpers moved to `src/core/canonical/links.ts` (`buildCanonicalLinkTargetLookup`, `resolveCanonicalLinkTarget`, `normalizeCanonicalLinkLookupKey`, `canonicalDocumentLinkKeys`) and re-exported from `src/core/canonical/index.ts`; `src/app/local-memory/overview.ts` now delegates to these.
- App graph assembly lives in `src/app/local-memory/graph.ts` (`graphMemory`), re-exported from the local-memory barrel and `src/runtime/index.ts`.
- Server-memory remote-safe packet: `graphServerMemory` / `RemoteMemoryGraphPacket` in `src/app/server-memory/index.ts`.
- HTTP routes: `GET /graph` (unauthenticated static HTML shell from `src/adapters/http-server/graph-page.ts`) and `GET /memories/all/graph.json` (authenticated JSON, filtered via query params). Route literal `graphJson` in `src/adapters/http-protocol.ts`.
- Playwright smoke: `scripts/graph-ui-smoke.mjs` (standalone Node script, no test-runner dependency). Run via `npm run smoke:graph` with `JUMPYBRAIN_GRAPH_SMOKE_URL` and `JUMPYBRAIN_GRAPH_SMOKE_API_KEY` env vars.
- Validated against `/Users/monkey/.jumpybrain/memory` (4 docs, 0 edges, 4 orphans) — graph renders, filters work, smoke passes.
- Unit tests: `test/graph.test.js` (local graph extraction, local-graph focus/depth, aliases/anchors, duplicate basenames, session docs), `test/server-http.test.js` (HTTP graph JSON auth/shape/unresolved/remote-safe, empty roots, limit truncation).
