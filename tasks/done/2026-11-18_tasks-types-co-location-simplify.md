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

- [x] 1.0 Research deep dive on type co-location feasibility (delegated to a Mistral Large sub-agent; read-only research plus writing its deep-dive doc)
  - [x] 1.1 Classify every type in `src/types.ts` by domain, importer set (core/app/adapters/server/CLI/scripts), and whether each importer uses it as vocabulary vs. contract across a seam
  - [x] 1.2 Identify the real owner per domain: which module already owns its behavior (e.g., search-recognition vs. retrieval-policy vs. local-memory), where docs say the contract belongs, and where the type is only used via re-exports
  - [x] 1.3 Determine the public-API exposure: what `src/index.ts`/`src/runtime/index.ts` re-export from `types.ts` today, what external consumers (including any scripts importing `dist/` or `integrations/`) rely on, and whether `test/package-entrypoints.test.js` would catch a break there
  - [x] 1.4 Propose the target layout: which types move, which stay in a deliberately small shared vocabulary file (and its naming), and the migration strategy (leaf-owner modules or re-export shims at old paths) ranked by risk
  - [x] 1.5 Define the verification plan: since this is type-only, behavior verification is mostly pinned by `npm run build` (tsc full check), the architecture and package gates above, plus scanning scripts/smokes for any runtime-type assumptions broken by the move
  - [x] 1.6 Deliverable: `docs/deep-dives/types-co-location-simplify/research.md` and an updated "Deep dive findings" section in this list
  - [x] 1.7 Independent source-checked review of the research (2026-11-16): corrections in research.md section 11 and under "Review corrections" below; pilot corrected accordingly
- [x] 2.0 **Clarify:** Go/no-go and scope (owner: user, with research doc in hand). Decide:
  - [x] 2.1 **Declined.** Approve the corrected pilot (3.0): move the retrieval-policy types next to their owner with a compatibility shim at the old path. Developer-facing ownership clarity only; no user-visible behaviour, speed or size change
  - [x] 2.2 Not applicable (pilot declined); exported type names stay as today. Public type names: keep the package's exported type names exactly as today (recommended, via a non-re-exported `contracts.ts`), or accept four newly public names (`ScoreBreakdown`, `IndexingPolicy`, `IndexedDocument`, `IndexManifest`) as an explicit decision
  - [x] 2.3 Not applicable (pilot declined). Accept the temporary two-way type-only dependency between `src/types.ts` and `src/core/retrieval-policy/` until the memory-root/provenance waves, or widen the pilot to remove it
  - [x] 2.4 Not decided; only relevant if a migration is reopened. Is external type-path compatibility (`jumpybrain/dist/types.js` deep imports) a hard requirement? It decides whether the shim is timed or permanent
- [-] 3.0 Proposal execution phase 1 (only after 2.0 approves): migrate the retrieval-policy pilot with a re-export shim at `src/types.ts`
  - [-] 3.1 Move the 12 non-temporal pilot types into a new `src/core/retrieval-policy/contracts.ts` that `retrieval-policy/index.ts` does **not** re-export (keeps public names unchanged; adds 2 packed files, `.js` + `.d.ts`, against the 780-file budget). Move the 4 temporal types into `temporal.ts`. Optionally defer `IndexManifest`: its only consumer is `qmd-driver.ts` and its `qmdCollection` field makes it QMD-specific
  - [-] 3.2 In `src/types.ts`, add the `export type { … } from` shim lines **and** a separate `import type` for the moved names still used inside `types.ts` (`MemoryRootConfig.indexing`, `MemoryRootStatus.readiness`); the shim alone does not bring them into scope
  - [-] 3.3 Rewrite the importers in the 29-file pilot list; none of the 15 inline `import("…types.js")` queries references a pilot type, so none needs rewriting in this pilot
  - [-] 3.4 Update `src/core/retrieval-policy/retrieval-policy.docs.md` (and `src/core/core.docs.md` if the barrel policy wording changes) so the new type ownership is documented
  - [-] 3.5 No `test/architecture-boundaries.test.js` change is expected (every target is core-domain); edit it only if the run shows a new edge
- [-] 4.0 Verify pilot migration with zero-regression evidence and record it in this list
  - [-] 4.1 `npm run build`, then `node --test test/architecture-boundaries.test.js test/source-graph-contracts.test.js test/core-boundary.test.js test/package-entrypoints.test.js test/package-footprint.test.js`
  - [-] 4.2 Exported type names: diff the exported names of `dist/index.d.ts`, `dist/runtime/index.d.ts` and `dist/core/index.d.ts` before/after; expect no change (or exactly the four names if 2.2 chose that)
  - [-] 4.3 Output size: `.js` output byte-identical (`dist/types.js` stays `export {};`); `.d.ts` output grows by a few hundred bytes for the shim and new file. Record `node scripts/check-package-size.mjs` and accept the churn explicitly or reject the direction
- [-] 5.0 Proposal execution phase 2 (only after 4.0 evidence is accepted): decide the remaining-domain roll-out order, or if the pilot evidence argues against it, record the decision and archive

## Outcome

Decided 2026-11-18 by the owner: **no-go on migrating existing types.** No source changed; tasks 3.0–5.0 are cancelled (marked `[-]`).

- Why: `src/types.ts` is type-only (`dist/types.js` is empty), so the gain is ownership clarity. The pilot rewrites imports in 29 files and brings a compatibility shim, a temporary two-way type dependency and a public-name decision; the full move touches 78 files.
- Rule adopted instead, recorded in [core module docs](../../src/core/core.docs.md): declare new contract types next to the module that owns them (as `core/boards/model.ts` and `core/migration/types.ts` already do) and do not add new types to `src/types.ts`. Move an existing type only when its domain is being changed anyway, keeping layer rules and exported type names unchanged.
- Verification: documentation-only; links reviewed and `git diff --check` run.
- Revisit if `src/types.ts` keeps growing despite the rule, or before a deliberate breaking release that could drop the deep `dist/types.js` path.

## Deep Dive

- Delegated research doc: [docs/deep-dives/types-co-location-simplify/research.md](/Users/monkey/dev/jumpyBrain/docs/deep-dives/types-co-location-simplify/research.md)

### Deep dive findings

Full evidence and per-type tables are in [docs/deep-dives/types-co-location-simplify/research.md](/Users/monkey/dev/jumpyBrain/docs/deep-dives/types-co-location-simplify/research.md). Conclusions:

- Evidence mostly confirmed with corrections: `src/types.ts` is 836 lines and 94 type-only exports (no runtime exports, so `dist/types.js` is an empty module — the "cross-layer magnet" is compile-time only). Importers are 78 files under `src/` (core 19, app 27, adapters 23, cli 8, runtime 1), not 79, and `src/server/` has zero direct importers. There are ~105 reference sites, including 12 inline `import("../types.js").T` type queries in 6 files that a migration must also rewrite (review: 15, none in the pilot).
- Public surface: `src/index.ts` -> `src/runtime/index.ts` re-exports 32 types from `types.js` directly plus 21 via `src/core/index.ts`, plus attention/writing re-exports; `package.json` has no `exports` map (pinned `undefined` by `test/package-entrypoints.test.js`), so `dist/types.d.ts` is a de-facto deep-importable surface. No in-repo test/script/integration imports any type path (183 test files import from `dist/`, none from `dist/types.js` or `src/types.ts`), so no test files need path changes.
- Constraint discovered: 65 of 94 types are consumed by core-domain-only layers (`core/*`, `adapters/backend-protocol.ts`, `adapters/qmd/*`, `adapters/http-client/*` per the guard's `approvedLayerImports`), so they must stay core-domain-reachable; only the graph/connection block can live in `app/local-memory/`. 14 types are imported directly by `src/cli/*`, which may not import app modules directly.
- Target layout: per-domain owners mostly inside `src/core/` (frontmatter, provenance, contribution, canonical/markdown-store + document-update, retrieval-policy/index + temporal, search-recognition, attention, writing/metadata + wrapup-policy, memory-root, dream/index + window), graph block in `app/local-memory/`, and a deliberately small shared vocabulary kept in `src/types.ts` (ExecutionOptions, MemoryOverview*, Process*/ProcessingLint*) because backend-protocol/http-client reference those contracts and cannot import app. Co-location is already the repo pattern (`core/retrieval-policy/compact.ts`, `core/canonical/expansion.ts`, `core/dream/source-references.ts`, `core/migration/types.ts`, `core/boards/model.ts`). Note: there are no collaboration types in `types.ts` — `core/collaboration/` already owns its model.
- Migration strategy ranked: hard cutover = highest risk (78-file one-shot diff, breaks deep `dist/types.js` importers); leaf-owner + indefinite root shim = lowest risk but the file persists and the gain shrinks to ownership clarity; recommended = leaf-owner + timed shim deprecation, migrating importers per domain with the shim kept until a deliberate breaking release.
- Pilot: retrieval-policy domain (16 types into `core/retrieval-policy/{index,temporal}.ts`), changing imports in exactly 29 files (adapters 11, app 8, cli 4, core 5, runtime 1 — listed in the research doc).
- Verification: `npm run build` (strict tsc + declarations) is the compile gate, then `node --test test/architecture-boundaries.test.js test/package-entrypoints.test.js test/package-footprint.test.js` (plus `test/source-graph-contracts.test.js`, `test/core-boundary.test.js`) per the docs/testing.md "layer imports / entrypoints / distribution" row; the boundary scanner also catches inline `import()` edges. Type-only moves emit identical JS, so no selected `node --test` rerun beyond the gates is behaviorally required and no smoke script is indicated.
- Honest cost/benefit: churn is 78 files total; if the shim is kept forever the gain is ownership clarity only; falsification evidence and reasons-not-to are in research.md section 9.

### Review corrections (2026-11-16)

Independent source-checked review; details in research.md section 11. Verified correct: 836 lines, 94 type-only exports, `dist/types.js` is `export {};`, 78 importers by layer, zero direct `src/server/` importers, the 29-file pilot list, `exports`/`private` pinned, no test/script/integration importing a types path, every pilot target core-domain (no guard-table change needed).

1. The public type surface would change, contrary to research §3. `src/core/index.ts:32` re-exports `./retrieval-policy/index.js` and `src/runtime/index.ts:1` re-exports all of core, so declaring the pilot types in `retrieval-policy/index.ts` makes `ScoreBreakdown`, `IndexingPolicy`, `IndexedDocument` and `IndexManifest` newly public (none is exported today). Additive, but against `src/core/core.docs.md:6` ("only curated core-safe shared types"), and no gate lists exported type names.
2. A two-way type-only dependency appears: pilot types use `Provenance`, `SearchRecognitionMetadata`, `ExecutionOptions`, `Frontmatter` (staying in `types.ts`), while `MemoryRootConfig.indexing` (`types.ts:715`) and `MemoryRootStatus.readiness` (`types.ts:739`) use moved types. Legal and unguarded, but unplanned; the shim's `export type … from` lines do not bring names into scope inside `types.ts`.
3. The pilot does not exercise inline `import()` type queries (research §7 says it does): none of the 15 queries references a pilot type.
4. Counts: 15 inline queries, not 12 (http-client 7, server-memory 4); `temporal.ts` imports 2 pilot types, not 4; `backend-protocol.ts` imports 29 names from `types.ts`, not 28.
5. Double-listed owners in the target layout: `IndexingPolicy` (retrieval-policy and memory-root), `IndexedDocument`/`IndexManifest` (retrieval-policy and markdown-store). `IndexManifest` has one consumer (`qmd-driver.ts`) and a `qmdCollection` field, a poor fit for backend-agnostic retrieval policy.
6. "No size change" holds only for `.js`; `scripts/package-budget.mjs` counts all of `dist/` including `.d.ts`. Harmless (~7.27 MB of 7.5 MB runtime budget) but the record should say so.
