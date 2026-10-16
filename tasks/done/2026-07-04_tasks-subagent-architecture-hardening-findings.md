# Subagent Architecture Hardening Findings

## Goal

Use the subagent review findings to tighten jumpyBrain's architecture, reduce code size/duplication, and keep module docs short enough for future agents to understand each area quickly. Preserve current behavior and tests unless a task explicitly calls for a public API decision.

## Completion Summary

Completed the subagent-driven architecture hardening pass: tightened runtime/core/app adapter exports, extracted shared frontmatter and HTTP protocol helpers, split CLI command/recipe handling, split HTTP server routing and processing ID-stamping modules, improved compact module docs, strengthened architecture/package tests, installed and smoked the packed CLI locally, ran a remote smoke check, and addressed independent subagent review feedback.

## Notes

- Investigation completed with isolated subagents for core, app, adapters/server, CLI/runtime, and cross-cutting architecture.
- Baseline `npm test` passed: 141/141.
- Baseline `npm run quality:report` captured current hotspots before refactoring.
- Overall verdict: architecture boundaries are healthy; improvement areas are mostly export hygiene, duplication, file-size hotspots, and doc/test guardrails.
- Prefer fewer lines, explicit barrels, small files, and compact co-located docs.
- Before finalizing: validate tests/package, install updated CLI locally if needed, run local CLI smoke, run a production/remote smoke check with owner-controlled credentials, and let the owner push after tests pass.

## Relevant Files

- `src/types.ts` - Broad shared type surface; includes core, app, overview, document, and QMD-ish fields.
- `src/core/index.ts` - Re-exports all shared types through the core barrel.
- `src/core/canonical/markdown-store.ts` - Large canonical file with many exports and duplicate helpers.
- `src/core/document-update.ts` - Duplicates frontmatter parsing/coercion helpers.
- `src/app/processing/processor.ts` - Large processing file mixing dispatch, lint, synthesis, and ID stamping.
- `src/app/writing/index.ts` and `src/runtime/index.ts` - Expose remote writer helpers through local runtime/package surface.
- `src/app/server-memory/index.ts` - Broad server-memory barrel and re-exports.
- `src/app/server-memory/auto-index.ts` - App layer owns console logging default.
- `src/adapters/http-server/index.ts` - Large route/protocol monolith.
- `src/adapters/http-client/index.ts` - Duplicates remote paths and reads API key from environment.
- `src/adapters/qmd/index.ts` - Adapter barrel exposes internals/test hooks.
- `src/cli/commands.ts` and `src/cli/recipes.ts` - Duplicate command/recipe behavior.
- `src/cli/targets.ts` and `src/cli/memory-target.ts` - Target/auth ownership is split.
- `src/app/writing/` - Missing co-located module docs.
- `test/architecture-boundaries.test.js` - Good existing guardrails; docs enforcement can be made recursive/tighter.
- `package.json` - Missing explicit package `main`, `types`, and/or `exports` metadata.

## Tasks

- [x] 1.0 Tighten public and internal export surfaces
  - [x] 1.1 Replace broad `src/core/index.ts` type re-export with a curated backend-agnostic core/public type surface.
  - [x] 1.2 Split or reorganize `src/types.ts` so QMD/app/transport-specific types do not leak through the core barrel by default. Done by curating core/runtime type barrels instead of a larger type-file split.
  - [x] 1.3 Replace `src/core/canonical/index.ts` wildcard exports with an explicit canonical API; keep scanner/update internals private where possible.
  - [x] 1.4 Split local and remote writing exports so local runtime/package entrypoints do not expose remote writer helpers accidentally.
  - [x] 1.5 Narrow `src/app/server-memory/index.ts` exports and replace star re-exports with deliberate public seams.
  - [x] 1.6 Narrow `src/adapters/qmd/index.ts` to the app-facing QMD seam; move test-only/internal helpers behind explicit internal imports.
  - [x] 1.7 Decide and encode explicit package entrypoints in `package.json` (`main`, `types`, and/or `exports`) plus pack/import contract tests.

- [x] 2.0 Reduce duplication and split large files
  - [x] 2.1 Extract one shared core frontmatter parsing/coercion helper used by canonical reads and document-update merge policy.
  - [x] 2.2 Replace duplicate canonical Markdown walking logic with one internal walker that preserves current filtering/sorting behavior.
  - [x] 2.3 Split `src/app/processing/processor.ts` into smaller mode modules such as lint, synthesize, ensure-ids, and shared source helpers. Done for `ensure-ids`; remaining lint/synthesis helpers stayed in one file because current size is improved and tests are stable.
  - [x] 2.4 Move pure ID/frontmatter stamping primitives from app processing into core writing/canonical policy if they remain backend-agnostic.
  - [x] 2.5 Split `src/adapters/http-server/index.ts` into smaller route/protocol/server-start modules while keeping `index.ts` as the adapter surface.
  - [x] 2.6 Extract shared remote protocol route constants/path builders for HTTP client and server so endpoint strings cannot drift.
  - [x] 2.7 Extract shared CLI memory command handlers so top-level commands and `jumpybrain run memory:*` recipes cannot drift.
  - [x] 2.8 Add contract tests comparing equivalent top-level command and recipe JSON/output where behavior should match.

- [x] 3.0 Tighten boundary ownership and side effects
  - [x] 3.1 Resolve remote URL and API key fully in CLI target selection; pass `apiKey` explicitly to the HTTP client adapter.
  - [x] 3.2 Keep the HTTP client adapter environment-free except for any explicitly documented compatibility wrapper.
  - [x] 3.3 Replace app-layer `defaultAutoIndexLogger` console side effects with no-op or injected logging; keep console/file logging defaults at server/adapter boundary.
  - [x] 3.4 Share local-only command handling for `process`/recipes and replace stale “remote not implemented yet” errors with command-specific V1 wording.
  - [x] 3.5 Either move target docs into CLI docs or create a real shared `src/targets/` implementation module; avoid orphaned target docs.
  - [x] 3.6 Tighten architecture boundary allowlists to current intended imports, especially avoiding future server-boundary coupling to runtime unless explicitly approved.

- [x] 4.0 Improve compact co-located docs and doc guardrails
  - [x] 4.1 Add `src/app/writing/writing.docs.md` with short responsibilities, non-responsibilities, and export guidance.
  - [x] 4.2 Update `src/app/local-memory/local-memory.docs.md` to mention `overviewMemory`, tree/overview summaries, and connection stats in one or two bullets.
  - [x] 4.3 Update `src/core/core.docs.md` or `src/core/canonical/canonical.docs.md` with a terse rule for public barrel/export hygiene.
  - [x] 4.4 Update `src/adapters/http-server/http-server.docs.md` with a compact endpoint table, safe logging contract, and split-file map after refactor.
  - [x] 4.5 Update `src/adapters/qmd/qmd.docs.md` to distinguish the app-facing seam from internal ranking/query/snippet helpers.
  - [x] 4.6 Update `src/runtime/runtime.docs.md` to list stable public runtime exports and explicitly exclude remote/server writer helpers if narrowed.
  - [x] 4.7 Add recursive architecture-docs enforcement for source directories containing `.ts`, with explicit exclusions for tiny/internal folders.
  - [x] 4.8 Remove stale text in `src/cli/overview.ts` that says document editing has not landed.

- [x] 5.0 Validate and record the hardening pass
  - [x] 5.1 Run `npm run quality:report` before and after refactors and confirm hotspot counts improve or remain justified. Improved hotspots: HTTP server index 550 → 100 lines, processing 473 → 357 lines, canonical store 361 → 276 lines.
  - [x] 5.2 Run `npm run validate` and `npm run cli:pack` after implementation.
  - [x] 5.3 Install the updated CLI locally when package output changes and run local CLI smoke checks against a temporary memory root.
  - [x] 5.4 Run or coordinate a production/remote smoke check before finalizing, without logging secrets or private memory bodies.
  - [x] 5.5 Run an independent subagent code review after implementation and address the actionable feedback.
  - [x] 5.6 Leave final push to the owner after validation passes; do not push from the agent.
  - [x] 5.7 Update `tasks/CHANGELOG.md` only when this hardening task is complete or archived.
  - [x] 5.8 Archive this task list to `tasks/done/` after implementation and validation.

## No-action Findings

- No major layer violations were found in the reviewed source.
- `src/cli.ts`, `src/index.ts`, and `src/server/index.ts` are already small boundaries.
- Logging and package-info adapters are already minimal.
- Existing architecture tests cover many important boundaries and should be preserved.
