# Memory Overview Tree Endpoint and CLI Visualization

## Goal

Give users a fast, terminal-native overview of what a jumpyBrain memory root contains and whether its derived index is healthy. A CLI user should be able to run a `tree`/`overview` command against local or remote memory and see counts, buckets, recent files, tags/types, and index freshness without reading raw Markdown directories or knowing QMD internals.

## Notes

- User problem: agents can use memory over CLI, but humans have no quick map of what memories exist, how many are stored, how fresh the index is, or which buckets/tags dominate.
- Keep Markdown canonical. The overview should primarily scan canonical Markdown files plus derived index metadata/manifest; do not make QMD state canonical.
- Remote V1 should expose a JSON endpoint and let the CLI render the terminal tree. Do not return server absolute filesystem paths from remote endpoints.
- Prefer a simple tree/summary first. Embedding-network visualization is likely too complex/noisy for a terminal MVP and can be deferred to an export/graph follow-up.
- Add an honest connection summary only from signals jumpyBrain can actually derive today: Markdown links/wiki-links if present, tag/type/bucket co-occurrence, index coverage, orphan counts, and top hubs. Do not imply an embedding mesh unless a graph export explicitly says it is derived from the current index/similarity data.
- Keep this deterministic and no-paid-call: scan local files, parse frontmatter, read index metadata, and test with fixtures.
- Related but separate: full-file retrieval belongs in the document show/edit task (`show --id` returning exact Markdown), not in overview output. Overview can surface IDs/files/titles so an agent can choose what to show next.

## Firecrawl Research Notes

- Kiro CLI has `/knowledge show`, which displays all knowledge entries with creation dates, item counts, persistence status, and active background indexing progress/ETA. Useful pattern: one command that mixes stored-state summary with indexing health. Source: https://kiro.dev/docs/cli/experimental/knowledge-management/
- Obsidian Graph View represents notes as nodes and links as edges, supports filters, tags, groups, orphans, and local graph depth. Useful pattern: surface relationships/tags/orphans, but full graph interaction belongs outside a plain CLI MVP. Source: https://obsidian.md/help/plugins/graph
- InfraNodus imports Markdown PKM data and can combine explicit backlinks with semantic concept relationships. It models each file-to-link relation as an edge, can also connect backlinks used in the same context, and analyzes clusters, betweenness centrality, and gaps. Useful pattern: distinguish explicit author-created edges from computed semantic edges, and label graph metrics as analysis/export rather than canonical memory. Sources: https://support.noduslabs.com/hc/en-us/articles/6829955215634-How-Are-Backlinks-from-Roam-Research-Obsidian-Logseq-Converted-into-a-Network-Graph and https://infranodus.com/use-case/visualize-knowledge-graphs-pkm
- Smart Linker finds semantically related Obsidian notes by reading precomputed embeddings, cosine similarity, top-K/threshold settings, deduping chunked matches, and writing a non-destructive managed `Related` block. Useful pattern: if jumpyBrain later suggests relationships, make similarity threshold/top-K explicit and avoid hidden rewrites. Source: https://github.com/lemannrus/smart-linker
- Boris Smus's note linker compares paragraph embeddings across notes, ranks note pairs with evidence snippets, filters already-linked or graph-distance-2 pairs, and outputs a generated `Similar notes.md` rather than modifying source notes automatically. Useful pattern: for future semantic graph work, generated pages/exports are safer than auto-editing memories. Source: https://smus.com/ai-note-garden-linker/
- SemLink exposes a pipeline of ingest → embed → link → analyze → visualize, supports hard/wiki links plus semantic edges, Louvain community detection, SQLite incremental sync, D3/Pyvis/JSON exports, and link reasoning. Useful pattern: separate graph export/analysis from the overview command; include edge type/weight/reason in graph JSON if added later. Source: https://github.com/KreativeThinker/SemLink
- `tree` is a familiar terminal metaphor for quick structure discovery, with filters such as directories-only to avoid overwhelming output. Useful pattern: default compact hierarchy plus optional expansion. Sources: https://stackoverflow.com/questions/3455625/linux-command-to-print-directory-structure-in-the-form-of-a-tree and https://unix.stackexchange.com/questions/21838/how-to-make-tree-output-only-directories
- `kb`, a minimalist CLI knowledge base manager, emphasizes list/view/grep, metadata filtering by title/category/tags, and verbose listing. Useful pattern: overview should expose metadata slices, not only physical paths. Source: https://raw.githubusercontent.com/gnebbia/kb/main/README.md

## Proposed User Experience

```bash
jumpybrain tree --root memory
jumpybrain tree --root memory --show-files --limit 25
jumpybrain tree --target-url https://memory.example.com
jumpybrain tree --root memory --connections
jumpybrain tree --root memory --json
# Future, after overview stabilizes:
jumpybrain graph --root memory --format json|dot
```

Example human output shape:

```text
Memory root: /repo/memory
State: initialized, schema v1, index fresh, 42 indexed / 43 canonical docs

all memory (43 docs)
├── pages/ (3 docs, newest 2026-07-03)
├── decisions/ (8 docs, newest 2026-07-01)
├── findings/ (12 docs, newest 2026-07-03)
├── preferences/ (2 docs, newest 2026-06-28)
├── notes/ (9 docs, newest 2026-07-03)
└── sessions/ (9 docs, newest 2026-07-03)

Top tags: cli(7), remote-memory(5), architecture(4)
Connections: 43 nodes, 6 explicit Markdown links, 12 tag co-occurrences, 37 orphans by explicit-link graph
Top hubs: pages/remote-memory.md (5), decisions/architecture.md (3)
Index: qmd collection jumpybrain_abcd1234, stale=false, lastIndexedAt=...
Warnings: 1 canonical file is not in the latest index manifest; run `jumpybrain index`.
```

## Relevant Files

- `src/types.ts` - Add overview/tree result types.
- `src/core/canonical/markdown-store.ts` - Reuse canonical Markdown scanning/parsing and provenance-safe relative paths.
- `src/core/memory-root/index.ts` - Reuse memory dirs/config/status conventions.
- `src/core/canonical/` - If needed, add pure Markdown-link extraction helpers for explicit graph edges without exposing document bodies.
- `src/adapters/qmd/qmd-driver.ts` or existing index manifest helpers - Read derived index manifest without making QMD canonical.
- `src/app/local-memory/` and `src/runtime/index.ts` - Add/export local overview generation as an app/runtime operation.
- `src/cli/local-transport.ts` - Add local transport method for CLI command routing.
- `src/app/server-memory/` - Add remote-safe server-memory overview use case and index-state composition.
- `src/adapters/http-client/index.ts` - Add remote client method for the overview endpoint.
- `src/adapters/http-server/index.ts` - Add authenticated remote overview/tree endpoint as a thin route.
- `src/cli/commands.ts`, `src/cli/usage.ts`, `src/cli/recipes.ts` - Add `tree`/`overview` command, help, and `run memory:tree` recipe.
- `docs/cloud-shared-memory.md` - Document remote endpoint contract.
- `docs/agent-workflows.md` and/or `README.md` - Document human-facing memory overview command.
- `test/` - Add deterministic tests for local CLI output, JSON shape, remote endpoint, and no path leakage.

## Decisions

- Default MVP should be a compact tree/overview, not an embedding network graph.
- Endpoint should return machine-readable JSON; CLI owns terminal rendering.
- Overview should be safe for remote use: no absolute server root/path leakage and no memory body snippets by default.
- Connection metrics are allowed in overview only when they are explicitly labeled by source: `markdown-link`, `wiki-link`, `tag-cooccurrence`, `type/bucket`, or `index/similarity` if a later implementation can prove the derivation.
- Full-file retrieval should be delivered by document `show/read` commands from the editing task, with overview providing discovery metadata rather than bodies.

## Completion Summary

Completed on 2026-07-04. Added `jumpybrain tree`/`overview` for local and remote memory, with optional `--connections` stats derived honestly from explicit Markdown links and Obsidian-style wiki-links. The command reports canonical Markdown buckets, tags, index freshness, optional bounded file summaries, top hubs, unresolved links, and orphan counts without returning memory bodies. Remote support is exposed through authenticated `GET /memories/all/overview` and `/tree`, returning `root: "remote:all"` without server path leakage.

## Implementation Status

- 2026-07-04: Implementation started for V1 overview/tree with optional explicit Markdown/wiki-link connection stats. Scope includes local CLI, remote HTTP/client support, tests, and final local + VPS-hosted validation.
- 2026-07-04: Implementation, docs, tests, package validation, and local/VPS-hosted validation completed. Deployed updated Docker image to the existing VPS/Coolify-hosted memory service and verified remote overview through the configured CLI target.

## Validation

- `npm run validate` — passed, 114 tests.
- `npm run cli:pack` — passed, verified 80 required CLI/runtime files and rejected stale old-architecture paths.
- Local memory validation: updated the local installed app at `~/.jumpybrain/app`, then `~/.jumpybrain/bin/jumpybrain tree --root ~/.jumpybrain/memory --connections --json` returned 3 documents, fresh index, 3 explicit-link orphans, and no warnings.
- VPS-hosted validation: deployed current build to the existing VPS/Coolify-hosted service, then `node dist/cli.js tree --target-url <configured-remote-url> --connections --show-files --limit 5 --json` returned `root: "remote:all"`, 3 documents, fresh index, 3 explicit-link orphans, and no warnings.

## Tasks

- [x] 1.0 Define the overview data contract
  - [x] 1.1 **Clarify:** Final naming: `tree` and `overview` are both supported aliases; `tree` is the primary CLI verb.
  - [x] 1.2 Define `MemoryOverviewResult` with target identity, initialization/compatibility, canonical doc counts, bucket counts, type counts, tag counts, newest/oldest timestamps, index state, and warnings.
  - [x] 1.3 Define safe document summary fields: relative path, bucket, title, type, tags, created/updated timestamp, indexed/unindexed status; no body by default.
  - [x] 1.4 Decide endpoint path: implemented `GET /memories/all/overview` with `/tree` alias and `limit`, `showFiles`, `connections` query params.
  - [x] 1.5 Document remote redaction rules in implementation: remote overview returns `root: "remote:all"` and tests assert no server absolute path/body leakage.
  - [x] 1.6 Define optional `connections` summary fields: node count, explicit Markdown/wiki-link edge count, unresolved count, orphan count, top hubs, and per-edge source labels; exclude bodies/snippets.
  - [~] 1.7 Define graph export compatibility fields for a future `graph` command: deferred. V1 includes safe `connections.edges[]` for explicit-link overview JSON only; richer graph export fields belong in a later `graph --format json|dot` task.

- [x] 2.0 Implement local overview generation from canonical Markdown
  - [x] 2.1 Add a pure overview scanner that reads configured memory dirs and parses frontmatter deterministically.
  - [x] 2.2 Count canonical Markdown documents by memory dir/bucket and frontmatter `type`.
  - [x] 2.3 Aggregate tags and created/updated timestamps from frontmatter where available.
  - [x] 2.4 Read derived index metadata/manifest to report indexed document count and detect canonical-vs-index drift.
  - [x] 2.5 Produce warnings for stale/missing index, unindexed canonical files, empty memory dirs, invalid frontmatter, or unsupported schema.
  - [x] 2.6 Extract explicit Markdown links and wiki-links from canonical Markdown as graph edges without returning body content.
  - [~] 2.7 Compute deterministic metadata-derived relationship signals such as tag co-occurrence and orphan-by-explicit-link counts; V1 implemented orphan-by-explicit-link counts, while tag co-occurrence remains deferred to keep `--connections` focused on Obsidian-style explicit links.

- [x] 3.0 Add CLI terminal visualization
  - [x] 3.1 Add `jumpybrain tree` command for local and remote targets, plus `jumpybrain run memory:tree` discovery recipe.
  - [x] 3.2 Render a compact tree by default with counts and newest timestamps per bucket.
  - [x] 3.3 Add `--show-files`/`--limit` to expand representative files without flooding terminal output.
  - [x] 3.4 Add `--json` for tool-friendly output using the same data contract.
  - [x] 3.5 Keep command output content-safe: titles/paths/metadata only, no memory body snippets unless a future explicit flag is added.
  - [x] 3.6 Add `--connections` to show compact connection stats/top hubs without attempting an interactive graph.
  - [x] 3.7 In human output, point users to document `show/read` for full Markdown content rather than expanding bodies inside overview.

- [x] 4.0 Add remote endpoint and client support
  - [x] 4.1 Add authenticated `GET /memories/all/overview` and `GET /memories/all/tree` to `src/adapters/http-server/index.ts`.
  - [x] 4.2 Add remote client method in `src/adapters/http-client/index.ts` and route CLI remote target calls through it.
  - [x] 4.3 Ensure remote JSON uses `root: "remote:all"` or equivalent and never returns absolute server filesystem paths.
  - [~] 4.4 Include index stale/fresh metadata via overview index metadata; remote auto-index state is still reported by status/index but not duplicated in overview.
  - [x] 4.5 Return clear errors for failed overview requests without leaking private paths.

- [x] 5.0 Test deterministic behavior
  - [x] 5.1 Add fixture memory roots with notes, pages, tags, and missing/stale index cases for overview; broader bucket fixture coverage remains sufficient through existing CLI tests.
  - [x] 5.2 Test local overview JSON counts and warnings.
  - [x] 5.3 Test human tree rendering for stable targeted line assertions.
  - [x] 5.4 Test remote endpoint auth through existing auth tests and no server-root/path leakage through new overview endpoint test.
  - [x] 5.5 Test CLI local command routing and `run memory:tree` implementation; remote routing covered by shared remote transport/server tests.
  - [x] 5.6 Architecture boundary tests passed after new overview modules.
  - [~] 5.7 Test Markdown/wiki-link edge extraction, orphan counts, and top hubs with deterministic fixtures; tag co-occurrence is deferred with 2.7.
  - [x] 5.8 Test that connection summaries and remote JSON never include memory body snippets or server absolute paths.

- [x] 6.0 Document graph strategy and future visualization path
  - [x] 6.1 Update CLI help, README/docs, and agent workflow docs with overview/tree examples plus `--connections` examples.
  - [x] 6.2 Document that overview connection stats are derived from explicit links and metadata today; do not market them as an embedding brain mesh unless/until semantic graph export is implemented.
  - [x] 6.3 Add a future follow-up note for `jumpybrain graph --format json|dot` after the overview data contract stabilizes; Graphviz DOT and D3/Cytoscape-compatible JSON are better first exports than terminal force-directed rendering.
  - [x] 6.4 Document how `show/read --id` from the document editing task complements overview for full Markdown retrieval.
  - [x] 6.5 Validate installed/local memory overview and `--connections` against the agent's configured local memory root.
  - [x] 6.6 Validate VPS-hosted remote memory overview and `--connections` via the configured remote CLI/API target; if credentials/target are unavailable, record the blocker explicitly.
  - [x] 6.7 Update `tasks/CHANGELOG.md` when implementation is complete and archive this task list.

## Non-Tasks

- Do not build a browser UI.
- Do not add paid model calls or LLM summarization.
- Do not make embeddings/index files canonical.
- Do not expose raw memory body content in overview output.
- Do not implement a force-directed embedding graph in this MVP.
