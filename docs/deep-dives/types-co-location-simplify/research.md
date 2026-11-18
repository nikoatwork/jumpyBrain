# Research: co-locating `src/types.ts` contracts with owning modules (task 1.0 deep dive)

Read-only research for [tasks/done/2026-11-18_tasks-types-co-location-simplify.md](../../../tasks/done/2026-11-18_tasks-types-co-location-simplify.md). No source, build, branch, or git state was changed. All counts below were measured directly from the repo (grep/ripgrep plus a small Node script that resolves every relative import specifier to a file), not taken from the proposal.

> **Review 2026-11-16:** an independent source check found that the pilot would change the public type surface, plus several count and layout errors. Section 11 records them and the corrected pilot; inline notes mark the affected claims.

## 1. Evidence verification: what the proposal claims vs. what I measured

| Proposal claim | Measured | Verdict |
| --- | --- | --- |
| `src/types.ts` is 836 lines | [src/types.ts](/Users/monkey/dev/jumpyBrain/src/types.ts) is exactly 836 lines | Confirmed |
| Imported by 79 source files | 78 files under `src/` import it (see breakdown below). No file under `test/`, `scripts/`, or `integrations/` imports `src/types.ts` | Off by one; 78, not 79 |
| Importers span "core, app, adapters, server, CLI" | core 19, app 27, adapters 23, cli 8, runtime 1 = 78. **Zero files under `src/server/` import it directly** (the server boundary goes through `src/app/server-memory/` and `src/adapters/http-server/`) | "server" layer is not a direct importer |
| It is a "cross-layer contract magnet" | True at the **type level only**. Every declaration in `src/types.ts` is `export type`/`export interface` — there are no value exports, so the emitted `dist/types.js` is an empty module. There is no runtime coupling; the coupling is compile-time (type-check) and organizational | Confirmed, with an important qualification: the magnet is type-only |

Measured import surface of [src/types.ts](/Users/monkey/dev/jumpyBrain/src/types.ts):

- 94 exported declarations (mix of `type` and `interface`), all type-only.
- 78 importing files under `src/`, containing ~93 static `import type`/`export type ... from ".../types.js"` statements plus **12 inline `import(".../types.js").Name` type queries in 6 files** *(review: 15; http-client has 7, server-memory 4; see 11.4)*: [src/app/server-memory/index.ts](/Users/monkey/dev/jumpyBrain/src/app/server-memory/index.ts) (3), [src/adapters/http-client/index.ts](/Users/monkey/dev/jumpyBrain/src/adapters/http-client/index.ts) (5), [src/cli/doctor.ts](/Users/monkey/dev/jumpyBrain/src/cli/doctor.ts), [src/core/canonical/markdown-store.ts](/Users/monkey/dev/jumpyBrain/src/core/canonical/markdown-store.ts), [src/app/local-memory/index.ts](/Users/monkey/dev/jumpyBrain/src/app/local-memory/index.ts), [src/adapters/http-server/browser-transport.ts](/Users/monkey/dev/jumpyBrain/src/adapters/http-server/browser-transport.ts). A migration must rewrite these too, not just `import` statements. The boundary scanner does track them (see §8).
- Re-export barrels that re-export from `types.js`: [src/core/index.ts](/Users/monkey/dev/jumpyBrain/src/core/index.ts) (21 names), [src/runtime/index.ts](/Users/monkey/dev/jumpyBrain/src/runtime/index.ts) (32 names in two `export type` blocks), [src/app/attention.ts](/Users/monkey/dev/jumpyBrain/src/app/attention.ts) (`MemoryAttentionNote`, `MemoryAttentionPacket`), [src/app/writing/local-writer.ts](/Users/monkey/dev/jumpyBrain/src/app/writing/local-writer.ts) (`WrapupWriteResult`).

Dominant types by importer count: `Frontmatter` (18 files), `MemoryActor` (12), `MemoryWriteResult` (11), `SearchRecognitionMetadata` (10), `MemoryDocumentReadResult` (10), `MarkdownDocument` (9), `IndexMemoryOptions` (9), `RetrievalReadiness` (9), `DreamWindowRequest` (9), `ExecutionOptions` (8), `TemporalQuery` (8). Six types have **zero direct importers** and are reachable only via barrels: `MemoryConnectionHub`, `MemoryGraphNodeKind`, `MemoryGraphStats`, `ProcessingLintIssueCode`, `ProcessingLintEvidence`, `DreamApplyManifest`.

## 2. Full classification of the 94 types (domain, importer layers, role)

"Layers" counts files per top-level `src/` dir that reference the type. "Domain" is my proposed owning domain (see §5 for the owner-file mapping). Role: **vocabulary** = plain shared data shape; **seam contract** = crosses a module/layer seam as an operation input/output.

| Type | types.ts | kind | importers | layers | domain | role |
| --- | --- | --- | --- | --- | --- | --- |
| Frontmatter | L3 | type | 18 | app:5 core:13 | frontmatter | vocabulary |
| MemoryActor | L40 | interface | 12 | adapters:4 app:4 core:3 runtime:1 | actor | seam contract (attribution) |
| MemoryWriteResult | L380 | interface | 11 | adapters:2 app:6 cli:2 core:1 | writing | seam contract |
| SearchRecognitionMetadata | L58 | interface | 10 | adapters:6 app:2 core:1 runtime:1 | search-recognition | seam contract |
| MemoryDocumentReadResult | L475 | interface | 10 | adapters:3 app:4 cli:1 core:2 | canonical-document | seam contract (wire) |
| MarkdownDocument | L5 | interface | 9 | adapters:3 app:4 core:2 | canonical-document | vocabulary |
| IndexMemoryOptions | L109 | interface | 9 | adapters:4 app:3 cli:1 runtime:1 | retrieval-policy | seam contract |
| RetrievalReadiness | L115 | interface | 9 | adapters:1 app:4 cli:2 core:1 runtime:1 | retrieval-policy | seam contract |
| DreamWindowRequest | L750 | interface | 9 | adapters:3 app:3 cli:1 core:1 runtime:1 | dream | seam contract |
| ExecutionOptions | L103 | interface | 8 | adapters:3 app:3 core:1 runtime:1 | retrieval-policy | vocabulary (cross-cutting) |
| TemporalQuery | L162 | interface | 8 | adapters:4 cli:1 core:2 runtime:1 | retrieval-policy | seam contract |
| IndexMemoryResult | L127 | interface | 7 | adapters:2 app:4 runtime:1 | retrieval-policy | seam contract |
| MemoryNoteType | L362 | type | 7 | app:3 core:4 | writing | vocabulary |
| MemoryDocumentContentHash | L473 | type | 7 | adapters:1 app:2 core:4 | canonical-document | vocabulary (precondition) |
| MemoryDocumentUpdateResult | L496 | interface | 7 | adapters:2 app:2 cli:1 core:2 | canonical-document | seam contract (wire) |
| DreamCreateRequest | L597 | interface | 7 | adapters:2 app:3 core:1 runtime:1 | dream | seam contract |
| DreamWindow | L811 | interface | 7 | adapters:2 app:3 cli:1 runtime:1 | dream | seam contract |
| RetrievalDepth | L23 | type | 6 | adapters:2 app:1 core:3 | retrieval-policy | vocabulary |
| SearchMemoryResult | L135 | interface | 6 | adapters:2 app:2 cli:1 runtime:1 | retrieval-policy | seam contract |
| MemoryOverviewOptions | L195 | interface | 6 | adapters:2 app:2 cli:1 runtime:1 | graph-overview | seam contract |
| MemoryGraphResult | L319 | interface | 6 | adapters:2 app:3 runtime:1 | graph-overview | seam contract |
| MemoryOverviewResult | L343 | interface | 6 | adapters:2 app:2 cli:1 runtime:1 | graph-overview | seam contract |
| MemoryNoteDraft | L368 | interface | 6 | adapters:2 app:3 core:1 | writing | seam contract |
| ProcessMemoryResult | L449 | interface | 6 | adapters:1 app:4 runtime:1 | processing | seam contract |
| MemoryDocumentDeletePreview | L510 | interface | 6 | adapters:3 app:2 runtime:1 | canonical-document | seam contract (wire) |
| MemoryDocumentDeleteResult | L515 | interface | 6 | adapters:3 app:1 core:1 runtime:1 | canonical-document | seam contract (wire) |
| DreamStatus | L549 | interface | 6 | adapters:2 app:3 runtime:1 | dream | seam contract |
| DreamBatch | L579 | interface | 6 | adapters:2 app:3 runtime:1 | dream | seam contract |
| DreamCompleteRequest | L604 | interface | 6 | adapters:2 app:3 runtime:1 | dream | seam contract |
| DreamCompleteResult | L612 | interface | 6 | adapters:2 app:3 runtime:1 | dream | seam contract |
| DreamAbandonResult | L623 | interface | 6 | adapters:2 app:3 runtime:1 | dream | seam contract |
| SearchRecognitionOptions | L47 | interface | 5 | adapters:2 app:1 core:1 runtime:1 | search-recognition | seam contract |
| SearchResult | L77 | interface | 5 | adapters:2 app:1 cli:1 runtime:1 | retrieval-policy | seam contract |
| RetrievalOutcome | L122 | interface | 5 | adapters:2 app:1 core:1 runtime:1 | retrieval-policy | seam contract |
| SearchMemoryOptions | L146 | interface | 5 | adapters:2 app:2 runtime:1 | retrieval-policy | seam contract |
| TemporalRetrieval | L190 | interface | 5 | adapters:2 app:1 core:1 runtime:1 | retrieval-policy | seam contract |
| MemoryRootStatus | L737 | interface | 5 | adapters:2 app:1 core:2 | memory-root | seam contract |
| FrontmatterValue | L1 | type | 4 | adapters:1 core:3 | frontmatter | vocabulary |
| IndexingPolicy | L92 | interface | 4 | adapters:3 core:1 | retrieval-policy | vocabulary (config) |
| EvidenceDate | L157 | type | 4 | adapters:1 core:2 runtime:1 | provenance | vocabulary |
| ProcessMemoryOptions | L403 | interface | 4 | adapters:1 app:2 runtime:1 | processing | seam contract |
| IndexedDocument | L693 | interface | 4 | adapters:3 core:1 | canonical-document | vocabulary |
| MemoryRootInitResult | L723 | interface | 4 | adapters:1 app:1 core:2 | memory-root | seam contract |
| Provenance | L12 | interface | 3 | cli:1 core:2 | provenance | vocabulary |
| SearchRecognitionScope | L66 | interface | 3 | adapters:1 app:1 runtime:1 | search-recognition | seam contract |
| TemporalResolution | L170 | interface | 3 | adapters:1 core:1 runtime:1 | retrieval-policy | seam contract |
| MemoryGraphOptions | L201 | interface | 3 | app:2 runtime:1 | graph-overview | seam contract |
| MemoryGraphNode | L275 | interface | 3 | adapters:2 app:1 | graph-overview | seam contract |
| MemoryDocumentTargetKind | L463 | type | 3 | app:1 core:2 | canonical-document | vocabulary (target) |
| DreamLimits | L527 | interface | 3 | app:1 core:2 | dream | vocabulary |
| MemoryDocumentEditErrorCode | L674 | type | 3 | app:1 core:2 | canonical-document | seam contract (error) |
| MemoryDocumentEditError | L687 | interface | 3 | app:1 core:2 | canonical-document | seam contract (error) |
| MemoryAttentionPacket | L832 | interface | 3 | adapters:2 app:1 | attention | seam contract |
| ScoreBreakdown | L25 | interface | 2 | adapters:1 core:1 | retrieval-policy | vocabulary |
| MemoryConnectionEdgeKind | L247 | type | 2 | app:1 core:1 | graph-overview | vocabulary |
| MemoryGraphEdgeKind | L248 | type | 2 | adapters:1 app:1 | graph-overview | vocabulary |
| MemoryGraphEdge | L296 | interface | 2 | app:2 | graph-overview | seam contract |
| MemoryConfidence | L364 | type | 2 | core:2 | writing | vocabulary |
| MemoryReviewStatus | L366 | type | 2 | core:2 | writing | vocabulary |
| WrapupWriteResult | L394 | interface | 2 | adapters:1 app:1 | writing | seam contract |
| ProcessingLintScope | L438 | interface | 2 | app:2 | processing | seam contract |
| MemoryDocumentTargetMetadata | L465 | interface | 2 | app:1 core:1 | canonical-document | vocabulary (target) |
| DreamCursor | L521 | interface | 2 | app:1 core:1 | dream | vocabulary |
| DreamBatchFileMetadata | L560 | interface | 2 | app:1 core:1 | dream | seam contract |
| DreamBatchMetadata | L631 | interface | 2 | app:1 core:1 | dream | seam contract |
| MemoryRootConfig | L709 | interface | 2 | core:2 | memory-root | vocabulary (config) |
| SemanticSetupStatus | L732 | interface | 2 | app:1 cli:1 | memory-root | seam contract |
| DreamWindowRange | L760 | interface | 2 | core:1 runtime:1 | dream | seam contract |
| DreamWindowFileDateBasis | L769 | type | 2 | core:1 runtime:1 | dream | vocabulary |
| DreamWindowFileContext | L791 | interface | 2 | app:1 runtime:1 | dream | seam contract |
| TemporalCoverage | L180 | interface | 1 | runtime:1 | retrieval-policy | seam contract |
| MemoryOverviewCount | L224 | interface | 1 | app:1 | graph-overview | seam contract |
| MemoryOverviewBucketSummary | L229 | interface | 1 | app:1 | graph-overview | seam contract |
| MemoryOverviewDocumentSummary | L236 | interface | 1 | app:1 | graph-overview | seam contract |
| MemoryConnectionEdge | L250 | interface | 1 | app:1 | graph-overview | seam contract |
| MemoryConnectionSummary | L262 | interface | 1 | app:1 | graph-overview | seam contract |
| MemoryOverviewIndexState | L334 | interface | 1 | app:1 | graph-overview | seam contract |
| ProcessMode | L401 | type | 1 | app:1 | processing | vocabulary |
| ProcessingLintIssue | L429 | interface | 1 | app:1 | processing | seam contract |
| MemoryDocumentIndexState | L488 | interface | 1 | core:1 | canonical-document | seam contract |
| DreamBatchStatus | L533 | type | 1 | app:1 | dream | vocabulary |
| DreamBatchSummary | L535 | interface | 1 | core:1 | dream | seam contract |
| DreamFileContext | L573 | interface | 1 | app:1 | dream | seam contract |
| DreamState | L651 | interface | 1 | app:1 | dream | seam contract |
| IndexManifest | L700 | interface | 1 | adapters:1 | canonical-document | vocabulary (derived index) |
| DreamWindowDateConfidence | L771 | type | 1 | core:1 | dream | vocabulary |
| DreamWindowDiagnostics | L773 | interface | 1 | app:1 | dream | seam contract |
| MemoryAttentionNote | L826 | interface | 1 | app:1 | attention | seam contract |
| MemoryConnectionHub | L257 | interface | 0 | re-export only | graph-overview | seam contract |
| MemoryGraphNodeKind | L273 | type | 0 | re-export only | graph-overview | vocabulary |
| MemoryGraphStats | L308 | interface | 0 | re-export only | graph-overview | seam contract |
| ProcessingLintIssueCode | L415 | type | 0 | re-export only | processing | vocabulary |
| ProcessingLintEvidence | L420 | interface | 0 | re-export only | processing | seam contract |
| DreamApplyManifest | L662 | interface | 0 | re-export only | dream | seam contract |

Note on the proposal's example domains: there are **no collaboration-specific types in `src/types.ts`** — [src/core/collaboration/](/Users/monkey/dev/jumpyBrain/src/core/collaboration) already owns its model (`model.ts`, `source.ts`, `errors.ts`, barrel `index.ts`). The only collaboration-adjacent type in the root file is `MemoryActor`, owned by [src/core/contribution.ts](/Users/monkey/dev/jumpyBrain/src/core/contribution.ts). The proposal's "collaboration types into core/collaboration/" example has no residents to move.

## 3. Public API exposure (subtask 1.3)

Chain: [package.json](/Users/monkey/dev/jumpyBrain/package.json) (`main: ./dist/index.js`, `types: ./dist/index.d.ts`, `bin: dist/cli.js`, **no `exports` field**, `private: true`) → [src/index.ts](/Users/monkey/dev/jumpyBrain/src/index.ts) (one line: `export * from "./runtime/index.js"`) → [src/runtime/index.ts](/Users/monkey/dev/jumpyBrain/src/runtime/index.ts).

What the published root surface re-exports from `types.js` today:

- Via [src/core/index.ts](/Users/monkey/dev/jumpyBrain/src/core/index.ts): `Frontmatter`, `FrontmatterValue`, `MarkdownDocument`, `MemoryConfidence`, `MemoryDocumentContentHash`, `MemoryDocumentEditError`, `MemoryDocumentEditErrorCode`, `MemoryDocumentIndexState`, `MemoryDocumentReadResult`, `MemoryDocumentTargetKind`, `MemoryDocumentTargetMetadata`, `MemoryDocumentUpdateResult`, `MemoryNoteDraft`, `MemoryNoteType`, `MemoryReviewStatus`, `MemoryRootConfig`, `MemoryRootInitResult`, `MemoryRootStatus`, `MemoryWriteResult`, `Provenance`, `RetrievalDepth` (21 names; runtime does `export * from "../core/index.js"`).
- Directly in [src/runtime/index.ts](/Users/monkey/dev/jumpyBrain/src/runtime/index.ts): 32 names (`DreamAbandonResult` … `SearchResult`, incl. `MemoryDocumentDeletePreview/Result` in a second block).
- Via [src/app/attention.ts](/Users/monkey/dev/jumpyBrain/src/app/attention.ts): `MemoryAttentionNote`, `MemoryAttentionPacket`.
- Via [src/app/writing/local-writer.ts](/Users/monkey/dev/jumpyBrain/src/app/writing/local-writer.ts) (re-exported through `app/writing/index.ts`): `WrapupWriteResult`.

So the package-root type surface is the union of those; a leaf-owner layout that keeps the same names re-exported from `src/runtime/index.ts` (now from the new owner paths instead of `../types.js`) **does not change the names exported from `jumpybrain` / `dist/index.d.ts`**. Only the internal `.d.ts` reference paths change. *(Review: false for the pilot target as proposed — `src/core/index.ts:32` re-exports the whole retrieval-policy barrel, so four internal types would become public; see 11.1.)*

Deep-path exposure (the compatibility risk):

- [test/package-entrypoints.test.js](/Users/monkey/dev/jumpyBrain/test/package-entrypoints.test.js) pins `packageJson.exports === undefined` ("package manifest stays source/installer-first without restrictive exports") and `private === true`. So the package is distributed as a tarball (release/pack scripts), and **deep imports like `jumpybrain/dist/types.js` / `dist/types.d.ts` work today and are a de-facto public surface**. `dist/` currently contains 309 `.js` + 285 `.d.ts` files including `dist/types.js` and `dist/types.d.ts`.
- In-repo consumers of type paths: **none**. Grepping `test/`, `scripts/`, `integrations/`, `deploy/`, `evals/`, `examples/`, `prototypes/` (excluding `node_modules` and `evals/**/.runs/**` snapshots) finds no import of `dist/types`, `jumpybrain/dist/*types`, or `src/types.ts`. The only `types.js` reference in `test/` is a scanner-fixture string inside [test/source-graph-contracts.test.js](/Users/monkey/dev/jumpyBrain/test/source-graph-contracts.test.js). The extension SDK surface ([extensions.d.ts](/Users/monkey/dev/jumpyBrain/extensions.d.ts) → `./dist/extensions/index.js`, [src/extensions/index.ts](/Users/monkey/dev/jumpyBrain/src/extensions/index.ts)) has no imports at all — it does not touch `types.ts`. The only in-repo references to `dist/types.d.ts` are historical eval artifacts: [evals/workspace-retrieval/reports/*.freeze.json](/Users/monkey/dev/jumpyBrain/evals/workspace-retrieval/reports) (freeze manifests, not a gate; `evals/workspace-retrieval/report.mjs` consumes them for reproducibility) and copied runtimes under `evals/**/.runs/`.
- Tests: 183 files in [test/](/Users/monkey/dev/jumpyBrain/test) import from `../dist/...`; exactly 1 imports from `../src/` (the fixture [test/fixtures/backend-operation-types.ts](/Users/monkey/dev/jumpyBrain/test/fixtures/backend-operation-types.ts)). **No test imports `dist/types.js` or `src/types.ts`**, so no test-file paths need to change under any migration strategy. `npm test` = `npm run build && node --test`, i.e. the suite runs against built `dist/`.

Would `test/package-entrypoints.test.js` catch a public-surface break? Only partially: it pins the manifest fields, not the exported names. The name-level surface is pinned implicitly by `tsc` (strict, `declaration: true`) plus consumers compiling against `dist/index.d.ts`; nothing in `node --test` enumerates the exported type names. If 2.0 wants a hard pin on the public type surface, that would be a new assertion (e.g. snapshot of `dist/index.d.ts` exports) — currently absent.

## 4. Hard constraint from the layer guard: who may import a type's home

[test/architecture-boundaries.test.js](/Users/monkey/dev/jumpyBrain/test/architecture-boundaries.test.js) classifies [src/types.ts](/Users/monkey/dev/jumpyBrain/src/types.ts) as `core-domain` (`sourceLayer()`: `if (file.startsWith("src/core/") || file === "src/types.ts") return "core-domain"`). From `approvedLayerImports` in that file, the layers that may **only** reach `core-domain` (besides themselves/special cases) are: `core-domain` itself, `backend-protocol` ([src/adapters/backend-protocol.ts](/Users/monkey/dev/jumpyBrain/src/adapters/backend-protocol.ts)), `qmd-adapter`, `http-client-adapter`, `http-protocol-adapter`, `infrastructure-adapter`, `websocket-transport`, `access-adapter`, `backend-adapter`/`backend-app`, `feedback-adapter`, `diagnostics-adapter`, `extension-*`, and `package-entrypoint` (only `runtime-app`).

Consequence, measured: **65 of the 94 types are consumed by at least one core-domain-only layer** (`src/core/*`, `backend-protocol.ts`, `src/adapters/qmd/*`, `src/adapters/http-client/*`) and therefore must live in (or be re-exported through) a core-domain file no matter what. Only **29 types can physically live in app-owned files** (`app/local-memory/graph.ts` etc.): `DreamApplyManifest`, `DreamBatchStatus`, `DreamFileContext`, `DreamState`, `DreamWindowDiagnostics`, `DreamWindowFileContext`, `MemoryAttentionNote`, `MemoryConnectionEdge/Hub/Summary`, `MemoryGraphEdge/EdgeKind/Node/NodeKind/Options/Result/Stats`, `MemoryOverviewBucketSummary/Count/DocumentSummary/IndexState`, `ProcessMode`, `ProcessingLintEvidence/Issue/IssueCode/Scope`, `SearchRecognitionScope`, `SemanticSetupStatus`, `TemporalCoverage` — but note several of those are nested inside types that must stay core-reachable (e.g. `MemoryOverviewResult` embeds `MemoryOverviewBucketSummary`), so in practice the movable-to-app set is smaller: essentially the graph/connection block minus `MemoryConnectionEdgeKind` (imported by [src/core/canonical/links.ts](/Users/monkey/dev/jumpyBrain/src/core/canonical/links.ts)).

Additionally, 14 types are imported **directly by `src/cli/*`** (`DreamWindow`, `DreamWindowRequest`, `IndexMemoryOptions`, `MemoryDocumentReadResult`, `MemoryDocumentUpdateResult`, `MemoryOverviewOptions`, `MemoryOverviewResult`, `MemoryWriteResult`, `Provenance`, `RetrievalReadiness`, `SearchMemoryResult`, `SearchResult`, `SemanticSetupStatus`, `TemporalQuery`), and `cli-boundary` may not import `app-use-case` directly — so those types must stay core-domain or be reached via `runtime-app` re-exports (a pattern CLI already uses, e.g. [src/cli/bounded-reads.ts](/Users/monkey/dev/jumpyBrain/src/cli/bounded-reads.ts) imports `type CompactRecallOptions` from `../runtime/index.js`).

The private agreement layer [src/adapters/backend-protocol.ts](/Users/monkey/dev/jumpyBrain/src/adapters/backend-protocol.ts) imports 28 types from `../types.js` *(review: 29)* and may only import core-domain — and it already imports co-located contract types from core submodules: `CompactRecallOptions/CompactRecallPacket` from [src/core/retrieval-policy/compact.ts](/Users/monkey/dev/jumpyBrain/src/core/retrieval-policy/compact.ts), `ExpansionOptions/ExpansionResult` from [src/core/canonical/expansion.ts](/Users/monkey/dev/jumpyBrain/src/core/canonical/expansion.ts), `SourceCheckRequest/Result` from [src/core/dream/source-references.ts](/Users/monkey/dev/jumpyBrain/src/core/dream/source-references.ts), `Logseq*/Obsidian*` from [src/core/migration/types.ts](/Users/monkey/dev/jumpyBrain/src/core/migration/types.ts) and `obsidian.ts`, `BoardList/BoardRecord` from [src/core/boards/model.ts](/Users/monkey/dev/jumpyBrain/src/core/boards/model.ts). It also defines purely local types (`WrapupDraft`, `DocumentUpdateOptions`, `BoardStatus`) instead of putting them in `types.ts`. **So the co-location pattern already exists and the guard already supports it; `src/types.ts` is the residue.** [src/core/core.docs.md](/Users/monkey/dev/jumpyBrain/src/core/core.docs.md) even documents that the core barrel re-exports "only curated core-safe shared types" — i.e. a small shared core type surface is sanctioned by the existing docs.

## 5. Proposed target layout (subtask 1.4)

Rule: a type moves to the file that owns its behavior, **as long as** every core-domain-only consumer can still reach it — which in practice means almost everything lands under `src/core/` (auto-classified `core-domain`, so **no changes to `sourceLayer()`/`approvedLayerImports` are needed** if no new root-level files are created). Only the graph/connection block can live in `app/local-memory/`. A small shared vocabulary file keeps the types that have no behavioral owner but are needed by core-domain-only consumers.

| Domain (types) | Proposed owner file |
| --- | --- |
| `FrontmatterValue`, `Frontmatter` | [src/core/frontmatter.ts](/Users/monkey/dev/jumpyBrain/src/core/frontmatter.ts) (already imports both; owns `parseFrontmatter`) |
| `Provenance`, `EvidenceDate` | [src/core/provenance.ts](/Users/monkey/dev/jumpyBrain/src/core/provenance.ts) |
| `MemoryActor` | [src/core/contribution.ts](/Users/monkey/dev/jumpyBrain/src/core/contribution.ts) (owns `normalizeMemoryActor`) |
| `MarkdownDocument`, `IndexedDocument`, `IndexManifest`, `MemoryDocumentContentHash`, `MemoryDocumentTargetKind/Metadata`, `MemoryDocumentReadResult`, `MemoryDocumentDeletePreview/Result`, `MemoryDocumentIndexState`, `MemoryConnectionEdgeKind` | [src/core/canonical/markdown-store.ts](/Users/monkey/dev/jumpyBrain/src/core/canonical/markdown-store.ts) (already imports all of these; owns canonical document read/delete + link kinds via `links.ts`) |
| `MemoryDocumentUpdateResult`, `MemoryDocumentEditError`, `MemoryDocumentEditErrorCode` | [src/core/document-update.ts](/Users/monkey/dev/jumpyBrain/src/core/document-update.ts) (owns guarded update merge) |
| `RetrievalDepth`, `ScoreBreakdown`, `SearchResult`, `SearchMemoryOptions/Result`, `RetrievalReadiness`, `RetrievalOutcome`, `IndexingPolicy`, `IndexMemoryOptions/Result`, `IndexedDocument`/`IndexManifest` (alt: markdown-store) | [src/core/retrieval-policy/index.ts](/Users/monkey/dev/jumpyBrain/src/core/retrieval-policy/index.ts) (already owns depth policy; `compact.ts` already hosts `CompactRecall*`) |
| `TemporalQuery`, `TemporalResolution`, `TemporalCoverage`, `TemporalRetrieval` | [src/core/retrieval-policy/temporal.ts](/Users/monkey/dev/jumpyBrain/src/core/retrieval-policy/temporal.ts) |
| `SearchRecognitionOptions/Metadata/Scope` | [src/core/search-recognition.ts](/Users/monkey/dev/jumpyBrain/src/core/search-recognition.ts) |
| `MemoryAttentionNote`, `MemoryAttentionPacket` | [src/core/attention.ts](/Users/monkey/dev/jumpyBrain/src/core/attention.ts) |
| `MemoryNoteType`, `MemoryConfidence`, `MemoryReviewStatus`, `MemoryNoteDraft` | [src/core/writing/metadata.ts](/Users/monkey/dev/jumpyBrain/src/core/writing/metadata.ts) |
| `MemoryWriteResult`; `WrapupWriteResult` | [src/core/writing/index.ts](/Users/monkey/dev/jumpyBrain/src/core/writing/index.ts); [src/core/writing/wrapup-policy.ts](/Users/monkey/dev/jumpyBrain/src/core/writing/wrapup-policy.ts) |
| `MemoryRootConfig`, `MemoryRootInitResult`, `MemoryRootStatus`, `SemanticSetupStatus`, `IndexingPolicy` (alt: retrieval-policy) | [src/core/memory-root/index.ts](/Users/monkey/dev/jumpyBrain/src/core/memory-root/index.ts) |
| `DreamCursor/Limits/BatchStatus/BatchSummary/Status/BatchFileMetadata/FileContext/Batch/CreateRequest/CompleteRequest/CompleteResult/AbandonResult/BatchMetadata/State/ApplyManifest` | [src/core/dream/index.ts](/Users/monkey/dev/jumpyBrain/src/core/dream/index.ts) |
| `DreamWindowRequest/Range/FileDateBasis/DateConfidence/Diagnostics/FileContext/Window` | [src/core/dream/window.ts](/Users/monkey/dev/jumpyBrain/src/core/dream/window.ts) |
| `MemoryGraphNodeKind/Node`, `MemoryGraphEdge(Kind)`, `MemoryGraphStats`, `MemoryGraphOptions/Result`, `MemoryConnectionEdge/Hub/Summary`, `MemoryGraphEdgeKind` | [src/app/local-memory/graph.ts](/Users/monkey/dev/jumpyBrain/src/app/local-memory/graph.ts) + [src/app/local-memory/connections.ts](/Users/monkey/dev/jumpyBrain/src/app/local-memory/connections.ts) — the one block that can live in app (no core-domain-only consumer), with `MemoryConnectionEdgeKind` staying in core `canonical/links.ts` and graph deriving `MemoryGraphEdgeKind` from it |
| Shared vocabulary with no behavioral owner but needed by core-domain-only consumers: `ExecutionOptions`, `MemoryOverviewOptions/Result` + `MemoryOverviewCount/BucketSummary/DocumentSummary/IndexState`, `ProcessMode`, `ProcessMemoryOptions/Result`, `ProcessingLintIssueCode/Evidence/Issue/Scope` | keep in a deliberately small [src/types.ts](/Users/monkey/dev/jumpyBrain/src/types.ts) (already classified `core-domain`, already special-cased in the migration test, already referenced by [src/adapters/http-client/http-client.docs.md](/Users/monkey/dev/jumpyBrain/src/adapters/http-client/http-client.docs.md)) — overview/processing *behavior* lives in `app/local-memory/overview.ts` and `app/processing/*`, but `backend-protocol.ts` and `http-client` reference those contracts and cannot import app. This matches core.docs.md's "curated core-safe shared types" |

Why keep the shared file at the root name `types.ts` rather than e.g. `src/core/shared-types.ts`: `sourceLayer()` in [test/architecture-boundaries.test.js](/Users/monkey/dev/jumpyBrain/test/architecture-boundaries.test.js) already classifies `src/types.ts` as core-domain and the migration test special-cases the literal `src/types.ts`; a new root-level file would fail the "classifies every source file" test until the test is edited. Under `src/core/` it would be auto-classified, so `src/core/shared-types.ts` is an equally valid home with zero guard churn; the difference is only whether `dist/types.d.ts` keeps existing (it does if the root file remains as shim/vocabulary).

## 6. Migration strategy, ranked by risk (subtask 1.4)

| Strategy | What it means | Diff across the 78 importers | Risk |
| --- | --- | --- | --- |
| A. Hard cutover | Delete `src/types.ts`; every importer (78 files, ~105 reference sites incl. 12 inline `import()` queries) switches to leaf paths in one change; `dist/types.js`/`dist/types.d.ts` disappear | One giant diff touching all 78 files; highest merge-conflict surface with active task lists; **breaks any external deep import of `jumpybrain/dist/types.js`** (allowed today because `exports` is pinned `undefined`); eval freeze artifacts referencing `dist/types.d.ts` go stale; the `src/types.ts` special-case in the migration guard test and the `http-client.docs.md` mention become dead | Highest. Requires a deliberate breaking release |
| B. Leaf-owner + root re-export shim kept indefinitely | Types move to owner files; `src/types.ts` becomes ~94 `export type { … } from "./core/…"` lines, kept forever | Initially zero importer churn (importers can migrate lazily or never); `dist/types.d.ts` keeps every name, so deep-path compat is preserved forever | Lowest risk, but the "magnet" file persists — the gain shrinks to ownership/docs clarity (see §9) |
| C. Leaf-owner + timed shim deprecation (recommended) | Same move as B, but internal importers are migrated domain-by-domain (pilot first), the shim is marked `@deprecated`, and removal is scheduled for a deliberate breaking release | Churn is spread across per-domain waves (pilot = 29 files, §7); each wave is independently reviewable and gateable; external deep-path compat holds until the announced removal | Medium-low. Recommended |

Under any strategy, moving type declarations into existing modules adds **zero new dist files** (only new source files would add 2 packed files each against the 780-file budget in [test/package-footprint.test.js](/Users/monkey/dev/jumpyBrain/test/package-footprint.test.js)). If `src/types.ts` stays as a pure type re-export shim, its emitted `dist/types.js` remains an empty module — runtime output is byte-identical for a type-only move.

## 7. Recommended pilot: retrieval-policy domain (subtask 1.5 prep)

Pilot set (16 types): `RetrievalDepth`, `ScoreBreakdown`, `SearchResult`, `SearchMemoryOptions`, `SearchMemoryResult`, `RetrievalReadiness`, `RetrievalOutcome`, `IndexingPolicy`, `IndexMemoryOptions`, `IndexMemoryResult`, `IndexedDocument`, `IndexManifest`, `TemporalQuery`, `TemporalResolution`, `TemporalCoverage`, `TemporalRetrieval` — moving to [src/core/retrieval-policy/index.ts](/Users/monkey/dev/jumpyBrain/src/core/retrieval-policy/index.ts) and [src/core/retrieval-policy/temporal.ts](/Users/monkey/dev/jumpyBrain/src/core/retrieval-policy/temporal.ts) (which already imports 4 of them from `types.js` *(review: 2)*). Leave `ExecutionOptions` and `EvidenceDate` for the shared-vocabulary/provenance waves.

Exact files whose imports change in the pilot (29 files; adapters 11, app 8, cli 4, core 5, runtime 1):

- adapters: [src/adapters/backend-protocol.ts](/Users/monkey/dev/jumpyBrain/src/adapters/backend-protocol.ts), [src/adapters/http-client/bounded-response.ts](/Users/monkey/dev/jumpyBrain/src/adapters/http-client/bounded-response.ts), [src/adapters/http-client/index.ts](/Users/monkey/dev/jumpyBrain/src/adapters/http-client/index.ts), [src/adapters/http-client/temporal-response.ts](/Users/monkey/dev/jumpyBrain/src/adapters/http-client/temporal-response.ts), [src/adapters/http-server/routes.ts](/Users/monkey/dev/jumpyBrain/src/adapters/http-server/routes.ts), [src/adapters/qmd/model-setup.ts](/Users/monkey/dev/jumpyBrain/src/adapters/qmd/model-setup.ts), [src/adapters/qmd/qmd-driver.ts](/Users/monkey/dev/jumpyBrain/src/adapters/qmd/qmd-driver.ts), [src/adapters/qmd/qmd-lifecycle.ts](/Users/monkey/dev/jumpyBrain/src/adapters/qmd/qmd-lifecycle.ts), [src/adapters/qmd/qmd-query.ts](/Users/monkey/dev/jumpyBrain/src/adapters/qmd/qmd-query.ts), [src/adapters/qmd/qmd-ranking.ts](/Users/monkey/dev/jumpyBrain/src/adapters/qmd/qmd-ranking.ts), [src/adapters/qmd/qmd-snippets.ts](/Users/monkey/dev/jumpyBrain/src/adapters/qmd/qmd-snippets.ts)
- app: [src/app/local-memory/freshness.ts](/Users/monkey/dev/jumpyBrain/src/app/local-memory/freshness.ts), [src/app/local-memory/index.ts](/Users/monkey/dev/jumpyBrain/src/app/local-memory/index.ts), [src/app/local-memory/overview.ts](/Users/monkey/dev/jumpyBrain/src/app/local-memory/overview.ts), [src/app/local-memory/search-recognition.ts](/Users/monkey/dev/jumpyBrain/src/app/local-memory/search-recognition.ts), [src/app/semantic-setup.ts](/Users/monkey/dev/jumpyBrain/src/app/semantic-setup.ts), [src/app/server-memory/auto-index.ts](/Users/monkey/dev/jumpyBrain/src/app/server-memory/auto-index.ts), [src/app/server-memory/index.ts](/Users/monkey/dev/jumpyBrain/src/app/server-memory/index.ts), [src/app/server-memory/state.ts](/Users/monkey/dev/jumpyBrain/src/app/server-memory/state.ts)
- cli: [src/cli/doctor.ts](/Users/monkey/dev/jumpyBrain/src/cli/doctor.ts), [src/cli/formatting.ts](/Users/monkey/dev/jumpyBrain/src/cli/formatting.ts), [src/cli/memory-commands.ts](/Users/monkey/dev/jumpyBrain/src/cli/memory-commands.ts), [src/cli/temporal.ts](/Users/monkey/dev/jumpyBrain/src/cli/temporal.ts)
- core: [src/core/index.ts](/Users/monkey/dev/jumpyBrain/src/core/index.ts), [src/core/memory-root/index.ts](/Users/monkey/dev/jumpyBrain/src/core/memory-root/index.ts), [src/core/retrieval-policy/compact.ts](/Users/monkey/dev/jumpyBrain/src/core/retrieval-policy/compact.ts), [src/core/retrieval-policy/index.ts](/Users/monkey/dev/jumpyBrain/src/core/retrieval-policy/index.ts), [src/core/retrieval-policy/temporal.ts](/Users/monkey/dev/jumpyBrain/src/core/retrieval-policy/temporal.ts)
- runtime: [src/runtime/index.ts](/Users/monkey/dev/jumpyBrain/src/runtime/index.ts)

Why this pilot: all 16 types have core-domain owners (so the guard is satisfied trivially), the owning module already exists and imports several of these types, the blast radius is one domain, and it exercises every tricky case — inline `import()` queries (http-client/index.ts) *(review: no inline query references a pilot type; see 11.3)*, re-export barrels (core/index.ts, runtime/index.ts), a core-domain-only consumer (backend-protocol.ts, qmd/*), and CLI direct importers (cli/* must keep importing from core-domain or runtime, never from app).

## 8. Verification / regression plan (subtask 1.5)

This is a type-only change, so the gates are compile + structure gates, per the [docs/testing.md](/Users/monkey/dev/jumpyBrain/docs/testing.md) selection-table row "Layer imports, runtime entrypoints or distribution contents → `test/architecture-boundaries.test.js`, `test/package-entrypoints.test.js`, `test/package-footprint.test.js`".

1. `npm run build` — defined in [package.json](/Users/monkey/dev/jumpyBrain/package.json) as `rm -rf dist && tsc -p tsconfig.json && node scripts/build-editor.mjs`. [tsconfig.json](/Users/monkey/dev/jumpyBrain/tsconfig.json) is `strict: true`, `declaration: true`, `rootDir: src`, `outDir: dist`, `include: src/**/*.ts` — so tsc is the full compile gate and the emitted `.d.ts` surface is checked too. Build once, then run checks against that build (per docs/testing.md: rebuilding during a check invalidates its evidence).
2. `node --test test/architecture-boundaries.test.js` — the layer guard. It matters here because (a) its scanner ([test/source-graph-helpers.js](/Users/monkey/dev/jumpyBrain/test/source-graph-helpers.js)) covers static, `import type`, `export … from`, and dynamic `import("...")` specifiers, so any missed inline `import("../types.js").T` path becomes a visible edge; (b) every source file must have an explicit layer classification — satisfied automatically if no new root-level files are created (anything under `src/core/` or `src/app/` is already classified); (c) the "private backend agreement" test asserts `backend-protocol.ts` imports only core-domain and only via erased `import type` — so any type it uses must stay core-domain-reachable; (d) the migration test's `edge.target !== "src/types.ts"` special-case should be reviewed if `types.ts` shrinks to vocabulary-only.
3. `node --test test/package-entrypoints.test.js` — pins `exports === undefined`, `main`/`types`/`bin`. Do **not** add an `exports` map to "fix" deep-path compat; that fails this test and changes distribution semantics.
4. `node --test test/package-footprint.test.js` — runs `npm pack --dry-run` and validates against [scripts/local-pack-manifest.mjs](/Users/monkey/dev/jumpyBrain/scripts/local-pack-manifest.mjs) (`requiredLocalPackFiles` — note `dist/types.js` is **not** required, so deleting it would not fail here; only the 780-file budget and required-module list apply) and the byte/file budgets in [scripts/package-budget.mjs](/Users/monkey/dev/jumpyBrain/scripts/package-budget.mjs). Moving types into existing files adds zero packed files; only newly created source files cost 2 files each.
5. `node --test test/source-graph-contracts.test.js test/core-boundary.test.js` — scanner fixtures and the dist/core import-graph gate (core must not reach CLI/QMD).
6. Test-suite impact: 183 test files import from `../dist/`, none import `dist/types.js` or `src/types.ts` (verified), and the change is type-only (all moved declarations are `export type`/`interface`, erased at emit; a re-export shim emits the same empty `dist/types.js`). So **no test files need path changes and no selected `node --test` rerun beyond the gates above is behaviorally required**; run the gates after `npm run build` per docs/testing.md and broaden only if a gate fails. The named smoke scripts in package.json (`smoke:semantic-index`, `smoke:hosted`, `smoke:graph`, etc.) exercise runtime CLI/server/browser behavior and are not indicated for a type-only change — docs/testing.md says to stop at the smallest passing selection.
7. Runtime-bundle check for the pilot record (task 4.2): diff `dist/` before/after — expect zero `.js` byte changes except an unchanged-empty `dist/types.js`; confirm no size delta so `check:package-size`/footprint budgets are unaffected. *(Review: `.d.ts` output grows slightly and is budgeted too; see 11.6.)*

## 9. Cost/benefit, reasons NOT to do it, and falsification (subtasks 1.1/1.4 wrap-up)

Cost:

- Full migration churn: 78 files, ~105 reference sites (including 12 inline `import()` type queries in 6 files). Pilot wave: 29 files.
- Guard/doc touch points even in the best layout: `sourceLayer()` needs no change if no new root files are created; the migration special-case and [src/adapters/http-client/http-client.docs.md:79](/Users/monkey/dev/jumpyBrain/src/adapters/http-client/http-client.docs.md) ("Shared packet types live in `types.ts`") need doc updates; [src/architecture.docs.md](/Users/monkey/dev/jumpyBrain/src/architecture.docs.md) calls `types.ts` "shared public types" in the layer diagram; owning module docs (`core.docs.md`, `retrieval-policy.docs.md`) should gain a line about type ownership (task 3.1).
- What the architecture-boundaries test would additionally pin if we want it (task 3.2): an explicit assertion that `src/types.ts` contains only the shared vocabulary (e.g. an export-name allowlist), so the residue cannot re-accumulate. Today nothing pins the *contents* of `types.ts`.

Benefit:

- Ownership clarity: each contract sits next to the behavior and the co-located `*docs.md` that owns it, matching the repo's existing pattern (`compact.ts`, `expansion.ts`, `source-references.ts`, `migration/types.ts`, `boards/model.ts`).
- `src/types.ts` shrinks from 836 lines / 94 types to a ~100-line vocabulary/shim.

Reasons NOT to do it (honest weigh-in):

1. The coupling is **type-only**. `dist/types.js` is an empty module; there is no runtime or bundle cost. The guard already prevents bad layer edges and already classifies `types.ts` as core-domain, so the "magnet" causes no *enforcement* failures — the cost is navigation/ownership, not architecture drift.
2. 65 of 94 types are pinned core-domain-reachable by existing consumers (`core/*`, `backend-protocol`, `qmd/*`, `http-client/*`), so most of the file can only move *within* the core layer; only the graph block can truly move to app. The "per-domain owner across layers" framing overstates the movable surface.
3. If the root shim is kept forever (strategy B), the file mostly stays and the gain shrinks to ownership clarity — against 78-file churn and merge-conflict risk with active task lists in [tasks/todo/](/Users/monkey/dev/jumpyBrain/tasks/todo). Strategy C only pays off if 2.0 commits to eventually removing the shim in a breaking release.
4. Deep-path compatibility is de-facto public (`exports` pinned `undefined`, tarball distribution), so a hard cutover is a breaking change for any consumer importing `jumpybrain/dist/types.js` — the package being `private: true` does not prevent tarball consumers from deep-importing.

Evidence that would **falsify** the proposal: (a) if the pilot shows no reduction in boundary-guard findings (there are currently zero violations attributable to `types.ts` — the guard passes today), i.e. the magnet causes no measurable enforcement or onboarding failure; (b) if after the pilot the remaining `types.ts` cannot shrink below a useful size because core-domain-only consumers force most types to stay core-reachable anyway (the 65/94 measurement already suggests the realistic end state is "core-internal co-location + small shared vocabulary", not "types scattered across all layers"); (c) if 2.0 decides external deep-path compatibility is not a hard requirement and accepts a breaking change, strategy A becomes viable and the calculus changes. Evidence that would **support** it: the existing co-location precedent (`compact.ts` etc.), core.docs.md's "curated core-safe shared types" language, and the fact that `backend-protocol.ts` already consumes owner-located contracts — the pattern is proven in-repo.

## 10. Answers to the subtask checklist

- 1.1 — Done: §2 classifies all 94 types by domain, importer set, layer, and vocabulary-vs-seam role; §1 gives the corrected importer counts.
- 1.2 — Done: §4/§5 identify the real owner per domain (existing behavioral owner + docs), including the correction that collaboration already has its own module and that `backend-protocol` precedent shows owner-located contracts are already imported cross-layer.
- 1.3 — Done: §3 — public surface is `dist/index.d.ts` via `src/index.ts` → `src/runtime/index.ts` (names listed); `exports` is pinned `undefined`, so `dist/types.d.ts` deep path is de-facto public; no in-repo script/test/integration imports type paths; `package-entrypoints.test.js` pins the manifest, not the exported names.
- 1.4 — Done: §5 target layout + shared vocabulary; §6 strategy ranking (C recommended).
- 1.5 — Done: §7 pilot (retrieval-policy, 16 types, 29 exact files); §8 verification plan tied to `npm run build` and the named gate tests.
- 1.6 — Done: this document plus the "Deep dive findings" section added to the task list.

## 11. Review corrections (2026-11-16)

An independent, source-checked review of sections 1-10 before the 2.0 go/no-go. Confirmed correct: 836 lines and 94 type-only exports (`dist/types.js` is `export {};`); 78 importers (core 19, app 27, adapters 23, cli 8, runtime 1) and none under `src/server/`; the 29-file pilot list matches a resolved import scan; spot-checked per-type importer counts; `exports`/`private` pinned; no test, script, Electron/macOS/pi integration or prototype imports a types path; the migration-purity rule (`architecture-boundaries.test.js:332`) allows `src/core/*`; every pilot target is core-domain, so the guard table needs no change; the `docs/testing.md:26` row is cited correctly.

### 11.1 The pilot changes the public type surface

[src/core/index.ts:32](/Users/monkey/dev/jumpyBrain/src/core/index.ts#L32) does `export * from "./retrieval-policy/index.js"` and [src/runtime/index.ts:1](/Users/monkey/dev/jumpyBrain/src/runtime/index.ts#L1) does `export * from "../core/index.js"`. Declaring the pilot types as exports of `retrieval-policy/index.ts` therefore makes `ScoreBreakdown`, `IndexingPolicy`, `IndexedDocument` and `IndexManifest` public names of `jumpybrain`; none of them is named by `src/index.ts`, `src/runtime/index.ts` or `src/core/index.ts` today. The change is additive (nothing breaks) but contradicts [core.docs.md:6](/Users/monkey/dev/jumpyBrain/src/core/core.docs.md#L6) ("only curated core-safe shared types") and no gate enumerates exported type names, so it would land silently. Fix: a `src/core/retrieval-policy/contracts.ts` that the barrel does not re-export (2 extra packed files against the 780 budget), or record the four names as a deliberate API addition.

### 11.2 Two-way type-only dependency

Pilot types depend on types that stay in `src/types.ts` (`SearchResult` uses `Provenance` and `SearchRecognitionMetadata`, types.ts:77-90; the two `*Options` extend `ExecutionOptions`; `IndexedDocument` uses `Frontmatter`), while `MemoryRootConfig.indexing` ([types.ts:715](/Users/monkey/dev/jumpyBrain/src/types.ts#L715)) and `MemoryRootStatus.readiness` ([types.ts:739](/Users/monkey/dev/jumpyBrain/src/types.ts#L739)) use moved types. So `types.ts` and the retrieval-policy module would import each other. TypeScript permits this and no test checks for cycles, but it should be an accepted, temporary step until the memory-root/provenance waves. Note: `export type { … } from` shim lines do not bring the names into scope inside `types.ts`; a separate `import type` is needed.

### 11.3 The pilot does not exercise inline `import()` queries

None of the 15 inline `import("…types.js").Name` queries references a pilot type, so the claim in section 7 that the pilot covers that case is false. That case remains untested until a later wave.

### 11.4 Count corrections

15 inline type queries, not 12 (`src/adapters/http-client/index.ts` 7, `src/app/server-memory/index.ts` 4); `temporal.ts` imports 2 pilot types, not 4; `backend-protocol.ts` imports 29 names from `types.ts`, not 28.

### 11.5 Double-listed owners

Section 5 places `IndexingPolicy` under both retrieval-policy and memory-root, and `IndexedDocument`/`IndexManifest` under both retrieval-policy and markdown-store. `IndexManifest` has a single consumer (`qmd-driver.ts`) and a `qmdCollection` field: it is a QMD index manifest, a poor fit for backend-agnostic retrieval policy. Pick one owner per type before migrating; deferring `IndexManifest` from the pilot is reasonable.

### 11.6 Size claim

`.js` output is byte-identical, but `scripts/package-budget.mjs` counts all of `dist/` including `.d.ts`, which grows by a few hundred bytes (shim plus new file). Harmless against the budget (~7.27 MB of 7.5 MB runtime) but the pilot record should state it.

### 11.7 Corrected pilot

- 12 non-temporal types into `src/core/retrieval-policy/contracts.ts`, not re-exported by the barrel (public names unchanged); 4 temporal types into `temporal.ts`; optionally defer `IndexManifest`.
- Shim in `src/types.ts` plus `import type` for names it still uses; accept the two-way dependency explicitly.
- Add a before/after diff of exported names in `dist/index.d.ts`, `dist/runtime/index.d.ts`, `dist/core/index.d.ts` to the verification plan.
