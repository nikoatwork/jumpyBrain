# Code Quality Tightening Sprint

## Goal

Run a focused end-to-end code-quality sprint that tightens jumpyBrain’s architecture boundaries, tests, CLI UX contracts, canonical Markdown compatibility, processing/lint behavior, install/package integrity, and code complexity. Production refactors are allowed when they are low-risk, validated, and documented.

## Completion Summary

- 2026-06-26: Completed the sprint with stronger architecture drift tests, pure CLI arg parsing refactor, deterministic property/error/compatibility/processing tests, canonical Markdown fixtures, local pack manifest tightening, an advisory quality report, manual CLI dogfooding, and final validation passing (`npm run validate`, `npm run cli:pack`).

## Notes

- This is one focused sprint, not opportunistic cleanup.
- Prefer measurable tightening: deterministic tests, smaller seams, clearer contracts, documented public/private boundaries, and self-validation evidence.
- Production refactors are in scope, but document the reason, behavior-preservation strategy, and validation in this task list before marking them complete.
- Keep Markdown memory canonical; indexes, QMD cache, package artifacts, and reports remain derived/rebuildable.
- Do not add model-paid or nondeterministic validation to normal tests.
- Use local dogfooding where useful: a coding agent should be able to self-validate changes with repo commands and a local jumpyBrain instance/memory root.
- End with one coherent commit containing only intentional sprint changes.

## Relevant Files

- `AGENTS.md` - Durable coding/testing/architecture guidance for future agents.
- `docs/technical.md` - Architecture, CLI, retrieval, processing, indexing, and testing strategy docs.
- `docs/install.md` - Install/runtime expectations that must match package and CLI behavior.
- `package.json` - Test/build scripts, package file list, dependencies.
- `scripts/local-pack-manifest.mjs` - Local pack required/forbidden file contract.
- `src/core/index.ts` - Backend-agnostic public-ish core barrel.
- `src/runtime/index.ts` - Local runtime composition surface.
- `src/qmd/index.ts` - QMD adapter barrel and public/internal seam.
- `src/cli.ts` - CLI command parsing, output, and error UX.
- `src/cli/` - CLI target and local transport boundaries.
- `src/server/index.ts` - Server-local runtime boundary.
- `src/canonical/` - Canonical Markdown discovery/parsing.
- `src/writing/` - Memory rendering/writing, wrapup validation, metadata normalization.
- `src/retrieval/` - QMD-independent retrieval policy and retrieval composition.
- `src/processing/` - Deterministic lint/synthesis processing behavior.
- `src/qmd/` - QMD adapter internals and pure ranking/path helpers.
- `test/` - Deterministic unit, property, integration, packaging, and architecture tests.
- `test/PROPERTY_TESTING.md` - Property-test scope and deterministic fast-check guidance.
- `tasks/CHANGELOG.md` - Final sprint completion summary.

## Decisions

- One task list for the full sprint.
- Work mode is focused end-to-end.
- Production refactors are allowed, but must be documented and validated.
- Validation must include `npm run validate`, `npm run cli:pack`, and manual coding-agent self-validation/dogfooding with a local jumpyBrain instance when applicable.
- Finalize with a single commit containing only intentional sprint changes.

## Tasks

- [x] 1.0 Establish sprint baseline and guardrails
  - [x] 1.1 Capture current `git status --short --untracked-files=all`; identify unrelated pre-existing changes to avoid staging.
  - [x] 1.2 Run `npm run validate` and record pass/fail plus runtime in `## Sprint Log`.
  - [x] 1.3 Run `npm run cli:pack` and record pass/fail in `## Sprint Log`.
  - [x] 1.4 Review `AGENTS.md`, `docs/technical.md`, and `tasks/CHANGELOG.md` for current architecture/testing constraints.
  - [x] 1.5 Add a `## Sprint Log` entry describing baseline state, known unrelated changes, and initial validation status.

- [x] 2.0 Tighten architecture boundary drift detection
  - [x] 2.1 Review import-boundary tests and `test/source-graph-helpers.js` for coverage gaps around `core`, `runtime`, `server`, `cli`, `qmd`, `targets`, and package entrypoints.
  - [x] 2.2 Add or improve deterministic tests for accidental import paths, stale pre-refactor modules, dynamic imports, and package entrypoint graph reachability.
  - [x] 2.3 Audit `src/core/index.ts`, `src/runtime/index.ts`, `src/qmd/index.ts`, and `src/index.ts` for exports that are public by accident.
  - [x] 2.4 Refactor or document any public/internal seam changes; avoid public API expansion solely for tests.
  - [x] 2.5 Record concrete boundary findings and any refactor rationale in `## Sprint Log`.

- [x] 3.0 Expand vital-only property and contract tests
  - [x] 3.1 Review current property tests for gaps in pure architecture-edge contracts.
  - [x] 3.2 Add property/contract tests for wrapup section validation and memory type/tag/metadata normalization if they provide higher signal than examples.
  - [x] 3.3 Add property/contract tests for CLI argument normalization where behavior is pure and stable.
  - [x] 3.4 Add property/contract tests for pure QMD ranking/path helpers only if reachable without spawning QMD or broadening public API unintentionally.
  - [x] 3.5 Keep generated case counts modest and deterministic via `test/property-helpers.js`; update `test/PROPERTY_TESTING.md` if patterns change.

- [x] 4.0 Tighten CLI UX and error contracts
  - [x] 4.1 Inventory high-value CLI failure modes: missing QMD, incompatible schema, bad `--depth`, bad `--type`, bad `--mode`, empty stdin, remote placeholder, missing root/discovery failure.
  - [x] 4.2 Standardize error shape where useful: flag/cause/fix, with clear stderr and exit behavior.
  - [x] 4.3 Add deterministic tests for important human and JSON output/error contracts without over-snapshotting incidental wording.
  - [x] 4.4 Refactor repeated CLI output formatting into helpers only where it reduces complexity without hiding command behavior.
  - [x] 4.5 Document any user-visible CLI wording or behavior changes in `docs/technical.md`, `docs/install.md`, or `tasks/CHANGELOG.md` as appropriate.

- [x] 5.0 Build canonical Markdown compatibility coverage
  - [x] 5.1 Create or extend fixtures for representative Markdown memory files: pages, decisions, findings, preferences, sessions, manual notes, odd frontmatter, empty bodies, repeated titles, and unusual filenames.
  - [x] 5.2 Add tests proving old/manual canonical Markdown parses, writes, indexes, and reports provenance consistently after refactors.
  - [x] 5.3 Add fixture tests for intentional frontmatter/parser limitations without changing canonical format unless a real correctness bug is found.
  - [x] 5.4 Document compatibility assumptions and limitations in `docs/technical.md` if they become durable contract.

- [x] 6.0 Harden deterministic processing and lint behavior
  - [x] 6.1 Review `src/processing/` for unclear ownership between canonical Markdown, QMD expansion, support reports, and generated pages.
  - [x] 6.2 Add or improve deterministic tests for stale pages, duplicate decisions/findings, unresolved conflicts, open questions, missing provenance, and report path behavior.
  - [x] 6.3 Refactor processing helpers if it makes lint/synthesis rules smaller, purer, or easier to test.
  - [x] 6.4 Ensure processing reports remain derived/support artifacts unless a change intentionally creates canonical memory.
  - [x] 6.5 Record processing rule changes and compatibility implications in `## Sprint Log`.

- [x] 7.0 Strengthen install/package integrity
  - [x] 7.1 Review `package.json` `files`, `scripts/local-pack-manifest.mjs`, installer scripts, integration templates, and docs for mismatch.
  - [x] 7.2 Add deterministic tests for package file inclusion/exclusion and installer/uninstaller safety where gaps exist.
  - [x] 7.3 Ensure stale dist paths, missing runtime entrypoints, installer-owned paths, and unsafe memory deletion remain guarded.
  - [x] 7.4 Run `npm run cli:pack` after package/install changes and record result.

- [x] 8.0 Add advisory code-size and complexity checks
  - [x] 8.1 Create a lightweight script or test helper to report largest source files/functions, exported symbol counts, duplicate test helpers, or simple dependency cycles.
  - [x] 8.2 Keep the report advisory unless a clear low-risk threshold is agreed; do not fail CI for noisy metrics by default.
  - [x] 8.3 Use the report to identify one or two small production refactors with clear payoff.
  - [x] 8.4 Implement only low-risk refactors with tests; skip anything whose risk outweighs maintenance benefit and note why.
  - [x] 8.5 Document how to run/read the advisory report if it remains useful.

- [x] 9.0 Manual self-validation and dogfooding
  - [x] 9.1 Create a temporary local memory root or use a clearly identified local dogfood root; do not touch unrelated user memory unless intentional.
  - [x] 9.2 Exercise core CLI flows as a coding agent can self-check them: `init`, `doctor`, `remember`, `index`, `recall`, `process lint`, `process synthesize`, and `wrapup` where applicable.
  - [x] 9.3 If integrations or installer behavior changed, test the local installer path in a temp HOME/project and verify generated skill/extension files.
  - [x] 9.4 Record commands run, root paths used, and results in `## Sprint Log`.
  - [x] 9.5 Clean up temporary dogfood roots/artifacts unless they are intentionally retained and documented.

- [x] 10.0 Final validation, docs, and commit
  - [x] 10.1 Run `npm run validate`; record result and runtime.
  - [x] 10.2 Run `npm run cli:pack`; record result.
  - [x] 10.3 Re-run any targeted manual dogfood checks affected by late changes.
  - [x] 10.4 Update `AGENTS.md`, `docs/technical.md`, `docs/install.md`, or other docs only for durable conventions or user-visible behavior changes.
  - [x] 10.5 Update `tasks/CHANGELOG.md` with a dated completion summary.
  - [x] 10.6 Add a completion summary near the top of this file.
  - [x] 10.7 Move this task list to `tasks/done/YYYY-MM-DD_tasks-code-quality-tightening-sprint.md` when all parent tasks are complete.
  - [x] 10.8 Stage only intentional sprint changes; verify with `git diff --cached --stat` and `git status --short --untracked-files=all`.
  - [x] 10.9 Create one commit for the completed sprint and record the commit hash/status.

## Sprint Log

Add dated entries here as work proceeds. Include validation results, production refactor rationale, skipped cleanup, dogfood commands, and any user-visible behavior decisions.

- 2026-06-26 — Baseline: `git status --short --untracked-files=all` was clean before sprint work. Reviewed `AGENTS.md`, `docs/technical.md`, and `tasks/CHANGELOG.md`; current constraints emphasize canonical Markdown, rebuildable derived state, explicit recall, strict architecture seams, deterministic tests, and local pack manifest validation.
- 2026-06-26 — Baseline validation: `npm run validate` passed with 62 tests in ~13s; `npm run cli:pack` passed in ~1s and verified 14 required CLI/runtime files with stale QMD retrieval paths rejected.
- 2026-06-26 — Architecture boundary scan: added deterministic coverage that package entrypoint `src/index.ts` reaches runtime without CLI/server code and that stale `src/retrieval/qmd-*` modules stay absent and unreferenced. Barrel audit found current core/runtime/qmd exports intentional enough for this sprint; no production API refactor needed.
- 2026-06-26 — Property/contract expansion: extracted CLI arg parsing helpers from `src/cli.ts` into `src/cli/args.ts` so pure CLI argument behavior can be property-tested without CLI side effects. Added generated tests for CLI positional/repeated/boolean flags, string/list/number argument helpers, and wrapup required/missing/empty section validation. Updated local pack manifest to require `dist/cli/args.js`. Skipped new QMD ranking properties because current pure helper coverage was adequate and adding more would risk test-seam/API churn.
- 2026-06-26 — CLI UX/error contracts: inventoried key failures and added `test/cli-error-contracts.test.js` for missing `--root`, remote placeholder, invalid `--depth`, invalid `--mode`, invalid `--type`, empty stdin, and missing QMD fix guidance. Failures are asserted to emit on stderr with actionable flag/fix text. No user-visible wording changes were needed beyond preserving existing contract.
- 2026-06-26 — Canonical Markdown compatibility: added fixture memories under `test/fixtures/canonical-memory/` plus `test/canonical-compatibility.test.js` to verify manual/old-style Markdown parses with stable metadata/body locations, writer output remains parseable canonical Markdown, and fixtures can be indexed/recalled with provenance. No canonical format changes were made.
- 2026-06-26 — Processing/lint hardening: reviewed `src/processing/processor.ts`; ownership is still appropriate: canonical Markdown is read from memory roots, QMD expansion is only used for synthesize source expansion, lint reports are derived under `.jumpybrain/reports/`, and synthesized pages are canonical under `pages/`. Added `test/processing-lint.test.js` for stale pages, duplicate finding/decision titles, missing conflict targets, no-findings reports, and derived report paths. No production refactor was needed.
- 2026-06-26 — Install/package integrity: reviewed package file list, local pack manifest, installer/uninstaller tests, and integration template coverage. Added `dist/cli/args.js` to `scripts/local-pack-manifest.mjs` and asserted it in local pack tests after extracting CLI arg helpers. `npm run cli:pack` passed and now verifies 15 required CLI/runtime files while rejecting stale QMD retrieval paths.
- 2026-06-26 — Advisory code-quality report: added `scripts/code-quality-report.mjs` and `npm run quality:report` to print largest files and exported-symbol hotspots without failing validation. Report highlighted `src/cli.ts` and `src/processing/processor.ts`; the low-risk production refactor taken was extracting pure CLI arg helpers to `src/cli/args.ts` with property/error tests. Larger CLI/processing splits were skipped for now because they need more behavior-design work than this sprint requires. Documented the report in `docs/technical.md`.
- 2026-06-26 — Manual dogfood: created temp root `/tmp/jumpybrain-dogfood-2KcjD9`, then exercised `init`, `doctor`, `remember`, `index`, `recall`, `process --mode lint`, `process --mode synthesize`, and `wrapup` through `dist/cli.js`. Parsed JSON outputs to assert compatible doctor status, recall hit for `dogfood-otter-contract`, lint/synthesize modes, and session wrapup file. Cleaned up the temp root and temporary output files. Installer/integration dogfood was skipped because this sprint did not change installer/integration behavior beyond package manifest coverage for the new CLI args module.
- 2026-06-26 — Final validation: `npm run validate` passed with 79 tests in ~13s; `npm run cli:pack` passed in ~1s and verified 15 required CLI/runtime files. `README.md` showed an unstaged change not made for this sprint, so it was intentionally left out of the sprint commit.
- 2026-06-26 — Commit: created single sprint commit `2de970a` (`Tighten code quality validation`) with only intentional sprint changes staged.

## Blockers

- None currently.
