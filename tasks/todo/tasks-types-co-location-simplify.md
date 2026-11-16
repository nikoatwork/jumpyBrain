# Proposal: Simplify src/types.ts by co-locating contracts with owning modules

## Goal

Stop `src/types.ts` (836 lines, currently imported by 79 files across every layer) from being the single cross-layer contract magnet. Move each contract next to the module that owns its domain (e.g., frontmatter types into `core/frontmatter.ts`, retrieval/depth types into `core/retrieval-policy/`, collaboration types into `core/collaboration/`), keeping the public SDK surface stable. This is a proposal, not a decision: the outcome of task 1.0 decides whether and how this proceeds.

## Notes

- This is a hypothesis to validate, not an agreed refactor. Do not move any types before 1.0 completes and 2.0 makes an explicit go/no-go call.
- Evidence collected so far (from the architecture review):
  - `src/types.ts` is 836 lines and imported by 79 source files spanning core, app, adapters, server and CLI — every layer routes cross-boundary contracts through this one root file.
  - The repo has a strong co-located-docs discipline (`src/core/core.docs.md`, `src/app/app.docs.md`, module `*docs.md`), but the type contracts are not owned by any of those docs; they accrete in the root file instead.
  - Layering rules in `AGENTS.md` forbid core from importing app/CLI/HTTP; the code respects that, but the root types file transitively couples every layer to one namespace.
- Uncertainties (why we are not confident yet):
  - The root file may be a deliberate single entry point for the published SDK (`src/index.ts` re-exports the runtime surface and consumers type against it); splitting into per-domain files changes the import surface, which is a compatibility question for anything consuming `jumpybrain` as a package, including the CLI install and extensions in this very repo.
  - Some types are genuinely shared vocabulary (IDs, frontmatter, provenance) and may be better left in a small shared file; the boundary between "domain-owned" and "shared vocabulary" needs a proposal with actual usage evidence, not taste.
  - Type-only moves are low-risk code-wise but touch 79 files; churn cost vs. benefit needs the research to say.
  - External consumers (even in-repo scripts importing `dist/`) rely on specific import paths; move strategy must pick re-export shims vs. hard cutover.

## Relevant Files

- `src/types.ts` - the contract magnet this proposal is about.
- `src/core/frontmatter.ts` - candidate owner for frontmatter types.
- `src/core/retrieval-policy/` - candidate owner for retrieval/depth/score types.
- `src/core/collaboration/` and `src/app/collaboration/` - candidate owners for collaboration contract types.
- `src/core/contribution.ts`, `src/core/provenance.ts` - candidate owners for provenance/actor vocabulary.

- `src/index.ts` and `src/runtime/index.ts` - public runtime surface; re-export stability question lives here.
- `test/package-entrypoints.test.js` - gate that pins the published entrypoints/exports.
- `test/architecture-boundaries.test.js` - gate for layer import rules; new import shapes must pass it.
- `src/architecture.docs.md` - subsystem ownership map; must be updated if ownership moves.

## Tasks

- [ ] 1.0 Research deep dive on type co-location feasibility (delegated to a Mistral Large sub-agent; read-only research plus writing its deep-dive doc)
  - [x] 1.1 Classify every type in `src/types.ts` by domain, importer set (core/app/adapters/server/CLI/scripts), and whether each importer uses it as vocabulary vs. contract across a seam
  - [x] 1.2 Identify the real owner per domain: which module already owns its behavior (e.g., search-recognition vs. retrieval-policy vs. local-memory), where docs say the contract belongs, and where the type is only used via re-exports
  - [x] 1.3 Determine the public-API exposure: what `src/index.ts`/`src/runtime/index.ts` re-export from `types.ts` today, what external consumers (including any scripts importing `dist/` or `integrations/`) rely on, and whether `test/package-entrypoints.test.js` would catch a break there
  - [x] 1.4 Propose the target layout: which types move, which stay in a deliberately small shared vocabulary file (and its naming), and the migration strategy (leaf-owner modules or re-export shims at old paths) ranked by risk
  - [x] 1.5 Define the verification plan: since this is type-only, behavior verification is mostly pinned by `npm run build` (tsc full check), the architecture and package gates above, plus scanning scripts/smokes for any runtime-type assumptions broken by the move
  - [x] 1.6 Deliverable: `deep-dives/types-co-location-simplify/research.md` and an updated "Deep dive findings" section in this list
- [ ] 2.0 **Clarify:** Go/no-go and scope after 1.0 lands — approve the target layout and migration strategy? Is external type-path compatibility a hard requirement? (owner: user, with research doc in hand)
- [ ] 3.0 Proposal execution phase 1 (only after 2.0 approves): migrate one domain (e.g., retrieval-policy types) as a pilot, including re-export shims if 2.0 chose that strategy
  - [ ] 3.1 Update `src/core/core.docs.md` or the owning module docs so the new type ownership is documented
  - [ ] 3.2 Update `test/architecture-boundaries.test.js` if new import edges need pinning/guarding
- [ ] 4.0 Verify pilot migration with zero-regression evidence and record it in this list
  - [ ] 4.1 Full `npm run build` clean, then the put-backed gates: `test/architecture-boundaries.test.js`, `test/package-entrypoints.test.js`; selected tests from `docs/testing.md` for any domain whose moved types changed import surface
  - [ ] 4.2 Confirm no runtime/main-bundle size change from tsc output alone; record and accept the diff-churn cost explicitly or reject the direction
- [ ] 5.0 Proposal execution phase 2 (only after 4.0 evidence is accepted): decide the remaining-domain roll-out order, or if the pilot evidence argues against it, record the decision and archive

## Blockers

- Research (1.0) is dispatched and in flight; 2.0 cannot proceed until its findings are recorded here.

## Deep Dive

- Delegated research doc: [deep-dives/types-co-location-simplify/research.md](/Users/monkey/dev/jumpyBrain/deep-dives/types-co-location-simplify/research.md)

### Deep dive findings

Full evidence and per-type tables are in [deep-dives/types-co-location-simplify/research.md](/Users/monkey/dev/jumpyBrain/deep-dives/types-co-location-simplify/research.md). Conclusions:

- Evidence mostly confirmed with corrections: `src/types.ts` is 836 lines and 94 type-only exports (no runtime exports, so `dist/types.js` is an empty module — the "cross-layer magnet" is compile-time only). Importers are 78 files under `src/` (core 19, app 27, adapters 23, cli 8, runtime 1), not 79, and `src/server/` has zero direct importers. There are ~105 reference sites, including 12 inline `import("../types.js").T` type queries in 6 files that a migration must also rewrite.
- Public surface: `src/index.ts` -> `src/runtime/index.ts` re-exports 32 types from `types.js` directly plus 21 via `src/core/index.ts`, plus attention/writing re-exports; `package.json` has no `exports` map (pinned `undefined` by `test/package-entrypoints.test.js`), so `dist/types.d.ts` is a de-facto deep-importable surface. No in-repo test/script/integration imports any type path (183 test files import from `dist/`, none from `dist/types.js` or `src/types.ts`), so no test files need path changes.
- Constraint discovered: 65 of 94 types are consumed by core-domain-only layers (`core/*`, `adapters/backend-protocol.ts`, `adapters/qmd/*`, `adapters/http-client/*` per the guard's `approvedLayerImports`), so they must stay core-domain-reachable; only the graph/connection block can live in `app/local-memory/`. 14 types are imported directly by `src/cli/*`, which may not import app modules directly.
- Target layout: per-domain owners mostly inside `src/core/` (frontmatter, provenance, contribution, canonical/markdown-store + document-update, retrieval-policy/index + temporal, search-recognition, attention, writing/metadata + wrapup-policy, memory-root, dream/index + window), graph block in `app/local-memory/`, and a deliberately small shared vocabulary kept in `src/types.ts` (ExecutionOptions, MemoryOverview*, Process*/ProcessingLint*) because backend-protocol/http-client reference those contracts and cannot import app. Co-location is already the repo pattern (`core/retrieval-policy/compact.ts`, `core/canonical/expansion.ts`, `core/dream/source-references.ts`, `core/migration/types.ts`, `core/boards/model.ts`). Note: there are no collaboration types in `types.ts` — `core/collaboration/` already owns its model.
- Migration strategy ranked: hard cutover = highest risk (78-file one-shot diff, breaks deep `dist/types.js` importers); leaf-owner + indefinite root shim = lowest risk but the file persists and the gain shrinks to ownership clarity; recommended = leaf-owner + timed shim deprecation, migrating importers per domain with the shim kept until a deliberate breaking release.
- Pilot: retrieval-policy domain (16 types into `core/retrieval-policy/{index,temporal}.ts`), changing imports in exactly 29 files (adapters 11, app 8, cli 4, core 5, runtime 1 — listed in the research doc).
- Verification: `npm run build` (strict tsc + declarations) is the compile gate, then `node --test test/architecture-boundaries.test.js test/package-entrypoints.test.js test/package-footprint.test.js` (plus `test/source-graph-contracts.test.js`, `test/core-boundary.test.js`) per the docs/testing.md "layer imports / entrypoints / distribution" row; the boundary scanner also catches inline `import()` edges. Type-only moves emit identical JS, so no selected `node --test` rerun beyond the gates is behaviorally required and no smoke script is indicated.
- Honest cost/benefit: churn is 78 files total; if the shim is kept forever the gain is ownership clarity only; falsification evidence and reasons-not-to are in research.md section 9.
