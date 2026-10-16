# Repository Architecture Cleanup and Documentation

## Goal

Make the repository easier to understand, extend, and maintain while it is still early enough to make larger structural improvements. The work should first produce a reviewable target architecture draft, then remove stale benchmark material, simplify module boundaries, and add co-located module documentation plus discoverable agent guidance.

## Notes

- User direction: benchmarking is not part of this repository. Remove benchmark harnesses, tracked benchmark summaries, benchmark scripts, benchmark fixtures, and benchmark-specific package/test/docs hooks rather than consolidating them here.
- Preserve the CLI behavior as the stable public contract. The internal/package API can change freely if a cleaner architecture results.
- Larger source-layout refactors are allowed when they materially improve encapsulation, separation of concerns, or future extensibility.
- Prefer an explicit layered architecture with clear encapsulation, shorter files, fewer mixed responsibilities, and fewer import paths that bypass module seams.
- Avoid planning around individual function names. Focus on layers, module responsibilities, data/control flow, public surfaces, and allowed dependency directions.
- Start with a draft stage for user review before broad code moves.
- Every refactor batch should have a machine-verifiable checkpoint: build/tests, import-boundary tests, packaging checks where relevant, and end-to-end CLI smoke tests proving commands still behave the same.
- Current scan found tracked benchmark code under `benchmarks/`, ignored benchmark data/output folders (`benchdata/`, `bench-results/`, `.bench-tmp/`), benchmark scripts in `package.json`, benchmark references in tests/scripts/docs, and one co-located module sketch named `src/targets/README.md` that does not match the desired module-docs convention.

## Relevant Files

- `AGENTS.md` - Root agent guidance; should teach agents how to discover module-local architecture docs and boundary rules.
- `src/` - Main source tree to audit and potentially reorganize by architectural layer and adapter boundary.
- `src/core/`, `src/runtime/`, `src/cli/`, `src/client/`, `src/server/`, `src/qmd/`, `src/retrieval/`, `src/processing/`, `src/writing/`, `src/canonical/`, `src/setup/` - Current module areas to map, validate, document, and possibly reshape.
- `src/targets/README.md` - Existing co-located architecture sketch to either migrate into the new module-docs convention or delete if obsolete.
- `docs/technical.md` - Current architecture overview; should either link to the target architecture and module docs or be reduced to stable external-facing technical concepts.
- `package.json` - Remove benchmark commands and align scripts with the final repository shape.
- `.gitignore` - Remove or adjust benchmark ignores after benchmark material is removed from the repo.
- `scripts/` - Remove benchmark-specific exclusions and make remaining repository hygiene checks match the new structure.
- `test/` - Remove benchmark-specific tests and strengthen architecture-boundary tests around the new layout.
- `benchmarks/`, `benchdata/`, `bench-results/`, `.bench-tmp/` - Benchmark-related areas to remove from tracked repo concerns and clean from the working tree as appropriate.
- `tasks/CHANGELOG.md` - Update only after completed structural changes are finalized/archived, not during draft/planning churn.

## Decisions

- Benchmarking is out of scope for this repository.
- CLI behavior is the compatibility surface to preserve during cleanup.
- Internal TypeScript package/API boundaries may change to achieve a cleaner architecture.
- The cleanup should include co-located module docs using a canonical `*.docs.md`-style convention rather than per-module `README.md` files.
- The cleanup should include stronger agent instructions for progressive discovery: root guidance first, module-local docs next, then nested module guidance where present.
- Adopt a layered target architecture direction, likely `cli`/`app`/`core`/`adapters` plus integrations and scripts, as long as the draft validates that it fits the repository's actual flows.
- CLI command behavior is the primary compatibility contract and should be protected with end-to-end smoke tests before and after each meaningful refactor batch.

## Execution Batches and Verification Gates

- **Batch 0 — Baseline contract:** before moving code, capture current CLI behavior with automated smoke tests for init/status/remember/recall/wrapup/process and remote/server routes where practical.
- **Batch 1 — Benchmark removal:** remove benchmark-owned repo surface, then prove normal build/test/pack/install paths do not reference benchmarks.
- **Batch 2 — Layer skeleton:** introduce approved layered directories and module docs with compatibility re-export shims where useful, then prove import-boundary tests still pass.
- **Batch 3 — CLI/app split:** shrink CLI entrypoint and move orchestration into app/use-case modules, then prove CLI end-to-end behavior is unchanged.
- **Batch 4 — Server/client/adapters split:** separate HTTP/auth/route details from server-local memory use cases and adapter code, then prove remote/local CLI and HTTP tests still pass.
- **Batch 5 — Docs/agent guidance:** finish co-located docs and root agent discovery rules, then prove docs references and module-doc checks pass.
- **Final gate:** full `npm run validate`, package/local pack checks, quality report review, and public-doc reference scan.

## Ralph Fan-out

- Local reusable helper created outside the repo: `~/.local/bin/jumpy-ralph`.
- Dedicated worktree created: `/Users/monkey/dev/jumpyBrain-repository-architecture-cleanup-ralph`.
- Ralph branch: `ralph/repository-architecture-cleanup`.
- Ralph state is ignored and local-only under `.ralph/` in the worktree.
- Ralph execution source: `.ralph/prd.json` with 11 verifiable stories.
- Collapse workflow should use a squash merge back to `master` so Ralph loop files and iteration commits do not appear in the public branch history.

## Tasks

- [x] 1.0 Create a reviewable target architecture draft before refactoring
  - [x] 1.1 Inventory the current repository at a module/layer level: source modules, CLI/server/client boundaries, adapter boundaries, tests, scripts, docs, generated outputs, and private task/memory folders.
  - [x] 1.2 Draw the current high-level flow from agent/human CLI input through target selection, runtime composition, canonical Markdown, derived index state, remote server, and integrations. Current flow mapped and reviewed in chat.
  - [x] 1.3 Propose a layered target architecture that separates stable CLI interface, application/use-case orchestration, domain/core Markdown concepts, infrastructure adapters, server/client boundaries, integrations, scripts, and tests.
  - [x] 1.4 Define allowed dependency directions between layers and modules in prose plus a simple diagram, including which layers may import inward and which adapter calls must flow through app/runtime seams.
  - [x] 1.5 Call out which current directories should stay, move, merge, split, or be deleted, including a clear recommendation for each benchmark-related directory.
  - [x] 1.6 Propose the co-located module docs naming convention, likely `module.docs.md` or `<module>.docs.md`, and show where docs should live in the target tree.
  - [x] 1.7 Review the architecture draft in chat first; only create a durable MD artifact later if the user asks for it or if implementation needs it.
  - [x] 1.8 Define the baseline CLI compatibility smoke-test matrix to protect unchanged command behavior before refactoring.
  - [x] 1.9 **Checkpoint:** Pause for user review before any broad source moves or benchmark deletion. User approved layered direction and Ralph fan-out.

- [x] 2.0 Capture baseline behavior before structural changes
  - [x] 2.1 Add or identify deterministic end-to-end CLI smoke tests for local `init`, `status`, `remember`, `recall`, `wrapup`, and `process` flows using temporary memory roots.
  - [x] 2.2 Add or identify remote/server smoke coverage for `serve`-equivalent HTTP status/index/search/recall/write flows without depending on external network services.
  - [x] 2.3 Add a small command-help/usage contract check so command names and important flags do not drift silently.
  - [x] 2.4 Run the baseline validation suite and record the command/test set in the architecture draft.
  - [x] 2.5 Only proceed with source moves after the baseline contract is green or explicitly adjusted.

- [x] 3.0 Remove benchmark ownership from this repository
  - [x] 3.1 Delete tracked benchmark harnesses, fixtures, scripts, and curated benchmark result summaries from the repository.
  - [x] 3.2 Remove benchmark npm scripts and any benchmark-specific test fixtures or scaffold tests.
  - [x] 3.3 Remove benchmark-specific references from public docs unless they are historical notes that should be rewritten as general retrieval/testing guidance.
  - [x] 3.4 Remove benchmark-specific exclusions from packaging, precommit, source scanning, and canonical Markdown scanning scripts where they are no longer needed.
  - [x] 3.5 Decide whether ignored local benchmark folders should simply disappear from `.gitignore` or remain temporarily as local cleanup safety; prefer removal once the working tree is clean.
  - [x] 3.6 Validate that normal build, test, pack, install, and quality-report paths do not depend on benchmark files.

- [x] 4.0 Reorganize source layout around composable architecture boundaries
  - [x] 4.1 Compare the approved target architecture to the current `src/` layout and identify low-risk moves, merges, splits, and obsolete placeholders.
  - [x] 4.2 Keep the CLI as a thin interface layer: argument handling, target selection, stdin/stdout, command help, and transport choice only.
  - [x] 4.3 Keep local application/runtime composition independent of CLI command parsing and independent of remote HTTP details.
  - [x] 4.4 Keep domain/core Markdown concepts backend-agnostic: canonical files, metadata, setup/status, write validation, provenance, and policy primitives.
  - [x] 4.5 Keep infrastructure adapters explicit and replaceable: local indexing/search adapter, HTTP client, HTTP server, logging, file-system packaging/install helpers, and integrations.
  - [x] 4.6 Separate remote/server composition from HTTP route handling so server-local memory operations remain testable without a network server.
  - [x] 4.7 Keep refactor batches small enough that each batch ends with a green build, import-boundary checks, and relevant CLI smoke tests.
  - [x] 4.8 Remove or migrate stale design-only directories that no longer correspond to implemented architecture.
  - [x] 4.9 Update import paths, package entrypoints, and build outputs after any moves.

- [x] 5.0 Strengthen architecture tests and repository hygiene checks
  - [x] 5.1 Update import-boundary tests to enforce the approved layer graph rather than only the historical post-refactor boundaries.
  - [x] 5.2 Add checks that CLI, server, client, runtime/app, domain/core, and infrastructure adapters do not bypass their intended seams.
  - [x] 5.3 Add a check that every major source module has its co-located `*.docs.md` file once the convention is adopted.
  - [x] 5.4 Update packaging/manifest tests to reflect the stable CLI contract and intentionally unstable internal API.
  - [x] 5.5 Add or maintain end-to-end CLI behavior tests that must pass after each structural batch.
  - [x] 5.6 Remove any hygiene rule that exists only to manage in-repo benchmarks.

- [x] 6.0 Add co-located module documentation
  - [x] 6.1 Create a short module-doc template covering purpose, responsibilities, non-responsibilities, inputs/outputs, allowed imports, exported surface, extension points, and testing expectations.
  - [x] 6.2 Add module docs to each major source area using the approved `*.docs.md` naming convention.
  - [x] 6.3 Keep each module doc short and local; link upward/downward instead of duplicating the whole architecture in every file.
  - [x] 6.4 Convert the existing `src/targets/README.md` sketch into the new convention if the target concept remains, or move useful content into the architecture draft and delete the placeholder.
  - [x] 6.5 Update `docs/technical.md` to point to the maintained architecture map and module docs rather than becoming a stale duplicate.

- [x] 7.0 Improve agent discoverability and repository ways of working
  - [x] 7.1 Update root `AGENTS.md` with the final architecture map, dependency-direction rules, and the module-doc discovery convention.
  - [x] 7.2 Add guidance that agents should read the nearest module docs before editing a module, then read nested docs if they exist.
  - [x] 7.3 Add guidance for when to update module docs: structural changes, boundary changes, new adapter seams, new public CLI behavior, or new testing conventions.
  - [x] 7.4 Add guidance for what not to document locally: transient implementation details, secrets, raw chat noise, or one-off task status.
  - [x] 7.5 Ensure task/changelog hygiene remains clear: active planning lives in `tasks/todo/`, completed structural decisions are summarized in `tasks/CHANGELOG.md` when finalized.

- [x] 8.0 Validate, summarize, and archive
  - [x] 8.1 Run the final validation suite after cleanup and fix architectural drift found by tests.
  - [x] 8.2 Run packaging/local install checks relevant to the CLI contract.
  - [x] 8.3 Review public docs and package file lists to ensure removed benchmark material is not referenced.
  - [x] 8.4 Compare before/after quality report hotspots and confirm large mixed-responsibility files were reduced or intentionally documented.
  - [x] 8.5 Add a dated `tasks/CHANGELOG.md` entry summarizing the approved architecture, benchmark removal, docs convention, and validation results.
  - [x] 8.6 Archive this task list to `tasks/done/` with a date prefix after completion.

## Completion Note

Completed via Ralph branch `ralph/repository-architecture-cleanup` and squash-merged to `master` as `85ebb58 Refactor repository architecture` on 2026-07-04. Final validation passed with `npm test` and `npm run cli:pack`; tracked diff was 113 files changed, 1,939 insertions and 3,278 deletions.

## Non-Tasks

- Do not preserve an in-repo benchmark harness.
- Do not optimize retrieval quality as part of this cleanup.
- Do not change canonical Markdown memory semantics unless the approved architecture draft identifies a structural reason.
- Do not stabilize the internal TypeScript API beyond what is needed for the CLI and repository architecture.
- Do not update `tasks/CHANGELOG.md` for draft-only iterations or minor task-list edits.
