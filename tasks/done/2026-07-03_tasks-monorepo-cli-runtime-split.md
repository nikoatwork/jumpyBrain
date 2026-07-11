# CLI/Runtime Modular Refactor

## Goal

Refactor jumpyBrain so the repo has the right internal primitives for future local, hosted-client, and server install paths without prematurely publishing many npm packages. The immediate architecture should keep one runtime/app codebase that can run locally or on a VPS, and isolate the lean CLI command surface so it can later become the only user-facing npm package if desired.

## Completion Summary

Completed by Ralph loop on 2026-06-24 and merged into `master` at `e7c1590`. Final validation passed with `npm run validate`; Ralph artifacts remained under ignored `tasks/ralph/` and were not tracked.

## Notes

- Current product direction: Markdown memory files are canonical; indexes/QMD state are derived and rebuildable.
- Current hosted direction: server/shared memory is a deployment shape that runs the same memory app against a server-local memory root.
- Distribution direction clarified in planning:
  - Users should not manually install a `core` package.
  - The codebase may contain internal core/local/server modules, but those are implementation boundaries, not separate user-facing packages right now.
  - The only likely external npm package in the near term is the CLI.
  - Server install can be clone/script/deploy based for now.
  - Local install can be npm or install-script based later.
- QMD should be encapsulated behind a runtime/search adapter boundary. The CLI should not hardcode QMD process details.
- Do not update `tasks/CHANGELOG.md` for intermediate task-list progress. Update it only when this structural refactor is completed/archived.

## Proposed Shape

```text
jumpyBrain/
  package.json                    # private/dev root or runtime app package; not many public packages yet
  tsconfig.json                   # project references or root build config
  src/
    core/                         # internal business/domain logic
    runtime/                      # local runtime composition: core + QMD + filesystem
    server/                       # VPS/server entrypoint and server-local runtime wiring
    qmd/                          # QMD adapter/process/env/cache boundary
    cli-shared/                   # shared CLI formatting/contract helpers, if needed
  packages/
    cli/                          # lean CLI workspace/package boundary
      package.json
      src/
        cli.ts
        transport/
          local.ts                # local runtime invocation/discovery
          remote.ts               # future server target client
```

This is a planning shape, not a requirement to publish multiple packages.

## Relevant Files

- `package.json` - Current package metadata, `bin`, scripts, files list, and future workspace/root package decisions.
- `package-lock.json` - Must be regenerated after workspace/dependency changes.
- `tsconfig.json` - Current single-project config; likely needs project references or separate package configs.
- `src/cli.ts` - Current CLI command parser; should move behind the lean CLI boundary or be split into command parsing plus runtime calls.
- `src/index.ts` - Current public exports; should become internal runtime/core export surface or be replaced by clearer module exports.
- `src/package-info.ts` - Version resolution currently assumes single package; needs to work from CLI workspace and/or root runtime.
- `src/cli/formatting.ts` - CLI human output formatting; likely belongs with the CLI package or `src/cli-shared/`.
- `src/setup/index.ts` - Memory root setup API; likely internal core/runtime boundary.
- `src/setup/project-config.ts` - Memory root config/schema/version checks; core business logic.
- `src/canonical/index.ts` - Canonical Markdown layer export; core business logic.
- `src/canonical/markdown-store.ts` - Markdown discovery/frontmatter parsing; core business logic.
- `src/canonical/provenance.ts` - Provenance mapping; core business logic.
- `src/types.ts` - Shared domain types; likely split into `src/core/types.ts` or retained as core export.
- `src/writing/index.ts` - Memory write API; core/runtime boundary.
- `src/writing/remember-writer.ts` - `remember` write implementation; core business logic with filesystem effects.
- `src/writing/wrapup-writer.ts` - Wrapup validation/write implementation; core business logic with filesystem effects.
- `src/writing/markdown-file.ts` - Markdown file serialization helpers; core business logic.
- `src/writing/metadata.ts` - Metadata/frontmatter helpers; core business logic.
- `src/processing/index.ts` - Processing API; internal runtime export.
- `src/processing/processor.ts` - Synthesis/lint logic; core/runtime boundary.
- `src/retrieval/index.ts` - Retrieval API; should depend on an adapter boundary instead of leaking QMD to CLI.
- `src/retrieval/retriever.ts` - Search orchestration; likely runtime/core retrieval boundary.
- `src/retrieval/depth-policy.ts` - QMD-independent depth policy; core business logic.
- `src/retrieval/qmd-cli.ts` - QMD process invocation; should move to `src/qmd/` or equivalent adapter module.
- `src/retrieval/qmd-driver.ts` - QMD indexing/search driver; adapter-specific logic.
- `src/retrieval/qmd-query.ts` - Query generation for QMD; adapter/runtime logic, with deterministic tests preserved.
- `src/retrieval/qmd-ranking.ts` - QMD result ranking; adapter/runtime logic.
- `src/retrieval/qmd-snippets.ts` - QMD snippet shaping; adapter/runtime logic.
- `src/targets/README.md` - Existing target concept stub; likely place to define local vs remote target model or replace with implementation docs.
- `scripts/version-local.mjs` - Local version script; may need to target root runtime and/or CLI workspace.
- `scripts/pack-local.mjs` - Local pack script; may need to pack the CLI workspace or runtime install bundle.
- `scripts/install-local-cli.mjs` - Current local CLI install script; should be redesigned around new install paths.
- `docs/install.md` - Must describe local CLI/runtime install and hosted-client/server install paths without implying multiple public packages too early.
- `docs/local-cli-builds.md` - Must be updated for the workspace/package layout.
- `docs/technical.md` - Must document internal boundaries, QMD adapter ownership, and CLI/server contracts.
- `docs/agent-workflows.md` - Must keep commands accurate after CLI move/split.
- `README.md` - Must reflect the distribution mental model and not overpromise npm package splits.
- `test/memory-cli.test.js` - CLI integration tests; paths/imports will need updates after moving `dist/cli.js`.
- `test/architecture-boundaries.test.js` - Architecture boundary test; should be expanded for new module boundaries.
- `test/longmemeval-scaffold.test.js` - Benchmark scaffold imports/scripts may need path updates.
- `benchmarks/longmemeval/run-script.mjs` - TypeScript runner may need workspace-aware source resolution.
- `benchmarks/longmemeval/run-retrieval.ts` - Retrieval imports may need new runtime module paths.
- `benchmarks/longmemeval/run-memsearch.ts` - Baseline unaffected but validate scripts still run.
- `benchmarks/longmemeval/materialize.ts` - Memory format assumptions should stay stable.
- `benchmarks/longmemeval/score.ts` - Likely unaffected; include in validation.

## Decisions

- Use one repo for development.
- Do not create many user-facing npm packages now.
- Keep internal core business logic available to both local and server runtimes.
- Isolate the lean CLI as the primary future external package boundary.
- Encapsulate QMD behind an adapter/runtime module so the CLI does not directly shell out to QMD.

## Tasks

- [x] 1.0 Define the target architecture in-repo before moving code
  - [x] 1.1 Add an architecture note to `docs/technical.md` describing the two-artifact mental model: lean CLI boundary plus runtime app that can run locally or on a server.
  - [x] 1.2 Clarify in `docs/technical.md` that `core` is an internal module boundary, not a user-installed npm package.
  - [x] 1.3 Clarify in `docs/technical.md` that QMD is owned by the runtime/QMD adapter, not by the CLI command parser.
  - [x] 1.4 Update `README.md` “Current shape” and “Hosted/shared usage” language to avoid suggesting `@jumpybrain/core`, `@jumpybrain/qmd`, etc. as immediate public packages.
  - [x] 1.5 Update `docs/install.md` with three future install paths: local runtime install, thin client pointed at a server, and server deploy via clone/script.
  - [x] 1.6 Review `src/targets/README.md` and decide whether it remains a placeholder doc or becomes the start of a target config spec. Decision: keep it as a reviewed design sketch/start of the remote-target spec; defer target config implementation.

- [x] 2.0 Restructure source modules into internal runtime boundaries
  - [x] 2.1 Create `src/core/` as the internal home for backend-agnostic memory/domain logic.
  - [x] 2.2 Move `src/types.ts` to `src/core/types.ts` or create `src/core/index.ts` that re-exports the existing type surface.
  - [x] 2.3 Move/namespace `src/canonical/index.ts`, `src/canonical/markdown-store.ts`, and `src/canonical/provenance.ts` under the core boundary or explicitly mark them as core-owned.
  - [x] 2.4 Move/namespace QMD-independent setup logic from `src/setup/index.ts` and `src/setup/project-config.ts` into the core/runtime boundary.
  - [x] 2.5 Move/namespace QMD-independent writing logic from `src/writing/index.ts`, `src/writing/remember-writer.ts`, `src/writing/wrapup-writer.ts`, `src/writing/markdown-file.ts`, and `src/writing/metadata.ts` into the core/runtime boundary.
  - [x] 2.6 Move/namespace QMD-independent processing logic from `src/processing/index.ts` and `src/processing/processor.ts` into the internal runtime boundary.
  - [x] 2.7 Keep import paths intentional: domain/core files must not import `src/qmd/`, `src/server/`, or CLI-specific modules.

- [x] 3.0 Encapsulate QMD as a runtime adapter
  - [x] 3.1 Create `src/qmd/` for QMD-specific process, cache, query, ranking, and snippet logic.
  - [x] 3.2 Move `src/retrieval/qmd-cli.ts` to `src/qmd/qmd-cli.ts` or equivalent.
  - [x] 3.3 Move `src/retrieval/qmd-driver.ts` to `src/qmd/qmd-driver.ts` or equivalent.
  - [x] 3.4 Move `src/retrieval/qmd-query.ts`, `src/retrieval/qmd-ranking.ts`, and `src/retrieval/qmd-snippets.ts` to `src/qmd/` or equivalent.
  - [x] 3.5 Keep `src/retrieval/depth-policy.ts` outside the QMD adapter if it is backend-independent.
  - [x] 3.6 Define a small retrieval adapter interface in `src/core/` or `src/runtime/` for `index` and `search` operations.
  - [x] 3.7 Update `src/retrieval/retriever.ts` and `src/retrieval/index.ts` so they compose with the QMD adapter instead of being the adapter themselves.
  - [x] 3.8 Update the QMD missing-binary error in the adapter to mention runtime/server/local install context, not CLI internals.
  - [x] 3.9 Add a task/test note that future QMD dependency bundling can be done in the runtime package/install script without changing CLI command parsing.

- [x] 4.0 Separate the lean CLI boundary
  - [x] 4.1 Decide whether to create `packages/cli/` now or keep `src/cli/` plus documented boundaries for one more refactor step.
  - [x] 4.2 If using `packages/cli/`, add `packages/cli/package.json` with `private: true` for now and a `bin` named `jumpybrain`.
  - [x] 4.3 Move current `src/cli.ts` command parsing into `packages/cli/src/cli.ts` or split command parsing into `src/cli/commands.ts` first.
  - [x] 4.4 Move `src/cli/formatting.ts` into the CLI boundary unless shared server rendering is intentionally needed.
  - [x] 4.5 Keep CLI command parsing free of direct imports from `src/qmd/`.
  - [x] 4.6 Add a local transport/runtime invocation layer so CLI commands can call the local runtime without owning QMD details.
  - [x] 4.7 Add a placeholder remote transport shape for future `--target`/server usage, but do not build a full hosted API in this refactor unless necessary.
  - [x] 4.8 Update `src/package-info.ts` or replace it so `jumpybrain --version` reports the correct package version after the CLI boundary changes.
  - [x] 4.9 Preserve existing commands and aliases: `version`, `help`, `instructions`, `init`, `status`, `index`, `recall`, hidden/advanced `search`, `process`, `remember`, `wrapup`, and `run memory:*` recipes.

- [x] 5.0 Add a server runtime boundary without overbuilding the server
  - [x] 5.1 Create `src/server/` as a server/VPS entrypoint boundary.
  - [x] 5.2 Add a minimal `src/server/index.ts` exporting server-runtime composition helpers, even if no HTTP daemon is implemented yet.
  - [x] 5.3 Document that server mode runs the same runtime against a server-local Markdown memory root.
  - [x] 5.4 Keep server code dependent on runtime/core/QMD modules, not on CLI command parsing.
  - [x] 5.5 Add a placeholder server command or script only if it helps validate the boundary; otherwise defer daemon/API work.
  - [x] 5.6 Ensure future scheduled processing can call the same `processMemory` runtime API currently exposed through the CLI.

- [x] 6.0 Update package/build configuration for the chosen layout
  - [x] 6.1 Update root `package.json` scripts so `npm run build`, `npm test`, and `npm run validate` still work from repo root.
  - [x] 6.2 If `packages/cli/` is created, add npm workspace configuration to root `package.json` but keep non-CLI internals private/unpublished.
  - [x] 6.3 Update root `package.json` `files`, `bin`, `main`, `types`, and `exports` fields to match whether the root package or CLI workspace owns the executable.
  - [x] 6.4 Regenerate `package-lock.json` after package/workspace changes.
  - [x] 6.5 Update `tsconfig.json` and add package/module-specific `tsconfig.json` files if needed.
  - [x] 6.6 Verify generated `dist/` layout is coherent and does not expose stale paths from before the refactor.
  - [x] 6.7 Revisit `.gitignore` only if new build outputs, package outputs, or local workspace artifacts appear.

- [x] 7.0 Update local packaging and install scripts
  - [x] 7.1 Update `scripts/version-local.mjs` so local prerelease versions are applied to the package that owns the CLI binary.
  - [x] 7.2 Update `scripts/pack-local.mjs` so local tarballs package the correct CLI/runtime artifact.
  - [x] 7.3 Update `scripts/install-local-cli.mjs` so dogfooding another repo installs the correct artifact after the split.
  - [x] 7.4 Update `.local-pack/latest.json` behavior only if script output paths change.
  - [x] 7.5 Document whether QMD is still a prerequisite or will be bundled later; do not silently break current install instructions.

- [x] 8.0 Update tests for the new boundaries
  - [x] 8.1 Update `test/memory-cli.test.js` `cliPath` from `dist/cli.js` to the new CLI build output path.
  - [x] 8.2 Update imports in `test/memory-cli.test.js` from `../dist/canonical/markdown-store.js` and `../dist/retrieval/qmd-driver.js` to the new compiled module paths.
  - [x] 8.3 Expand `test/architecture-boundaries.test.js` to assert core modules do not import `qmd`, `server`, or CLI modules.
  - [x] 8.4 Expand `test/architecture-boundaries.test.js` to assert CLI modules do not import QMD adapter files directly.
  - [x] 8.5 Preserve deterministic tests for QMD query/ranking helper internals currently exposed through `qmdIndexInternalsForTests`.
  - [x] 8.6 Update `test/longmemeval-scaffold.test.js` if benchmark script paths or build outputs change.
  - [x] 8.7 Add at least one test that imports the local runtime API without going through the CLI.
  - [x] 8.8 Add at least one test that proves server boundary code can compose the runtime without importing CLI code.

- [x] 9.0 Update benchmark and dogfood paths
  - [x] 9.1 Update `benchmarks/longmemeval/run-retrieval.ts` imports to use the new runtime/core exports.
  - [x] 9.2 Update `benchmarks/longmemeval/run-script.mjs` only if workspace TypeScript resolution changes.
  - [x] 9.3 Run fixture benchmark scripts after refactor: `npm run benchmark:longmemeval:fixture`.
  - [x] 9.4 Verify dogfood commands still work against `.dogfood-memory/jumpybrain.json`.
  - [x] 9.5 Run `jumpybrain run memory:index` and `jumpybrain run memory:recall --topic "CLI runtime split" --limit 5` from a nested working directory after local install script changes.

- [x] 10.0 Update documentation and command examples after code moves
  - [x] 10.1 Update `README.md` Quick Start commands only if command names or installation wording changes.
  - [x] 10.2 Update `docs/install.md` to distinguish current source install, future local install, future thin client install, and server clone/script deploy.
  - [x] 10.3 Update `docs/local-cli-builds.md` with new local pack/install commands and output paths.
  - [x] 10.4 Update `docs/technical.md` with the finalized module diagram and boundary rules.
  - [x] 10.5 Update `docs/agent-workflows.md` if `run memory:*` behavior or discovery changes.
  - [x] 10.6 Update `docs/dogfood-memory.md` if dogfood memory root/indexing commands change.
  - [x] 10.7 Confirm `docs/memory-format.md` needs no changes because canonical Markdown format should remain stable.

- [x] 11.0 Validate and clean up
  - [x] 11.1 Run `npm run build`.
  - [x] 11.2 Run `npm test`.
  - [x] 11.3 Run `npm run validate`.
  - [x] 11.4 Run `npm pack --dry-run` or the updated local pack script to inspect package contents.
  - [x] 11.5 Check for stale imports with `rg "\.\./dist|src/retrieval/qmd|dist/cli|qmd-driver|canonical/markdown-store" test src packages benchmarks docs`.
  - [x] 11.6 Confirm no generated derived memory state, QMD cache, or local tarballs are accidentally staged.
  - [x] 11.7 When the refactor is complete, update `tasks/CHANGELOG.md` with a dated structural-change summary.
  - [x] 11.8 Archive this task list to `tasks/done/YYYY-MM-DD_tasks-monorepo-cli-runtime-split.md`.

## Blockers

- None. Deferred product work remains: QMD bundling strategy and full server HTTP/API implementation.
