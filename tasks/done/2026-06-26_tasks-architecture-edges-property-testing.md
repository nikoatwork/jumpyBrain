# Architecture Edge Scan and Property Testing

## Goal

Scan the TypeScript architecture edges for unnecessary complexity, brittle boundaries, and high-value property-testing opportunities. Add `fast-check` to the normal `npm test` path and implement a **small, vital** set of deterministic property tests where generated coverage is materially better than example-by-example unit tests.

This task list is intended to be workable by a fresh agent. Preserve findings and decisions in this file as work proceeds; do not rely on prior chat context.

## Progress Summary

- 2026-06-26: Implemented deterministic `fast-check` setup and bounded property tests for the selected architecture edges; extracted shared source import-graph helpers; documented property-test rules in `test/PROPERTY_TESTING.md`, `docs/technical.md`, and `AGENTS.md`; validation passed with `npm run validate` and `npm run cli:pack`.

## Answer: is property testing a good idea here?

Yes, selectively. jumpyBrain has several small pure or mostly-pure functions that define important invariants at architecture edges: Markdown/frontmatter parsing, slug/file naming, retrieval-depth policy, CLI target selection, path normalization, QMD virtual path conversion, and package manifest validation. Those are good property-test targets because bugs are likely to appear in odd strings, path separators, repeated flags, quoting, and generated metadata combinations.

It is **not** a good idea to property-test the whole QMD/indexing pipeline directly in `npm test`: that would be slower, depend on external process behavior, and produce low-signal failures. Keep property tests bounded, seeded, and deterministic. Use them to protect edge contracts; keep integration tests for actual QMD behavior.

## Notes

- Property tests should run in normal `npm test`.
- Keep generated case counts modest so the test suite remains fast and deterministic.
- Prefer properties that express durable invariants over fuzzing everything.
- Keep scope vital: property-test architecture-edge contracts, not every helper.
- If a generated edge reveals undesirable behavior, first decide whether it is a bug or an intentionally narrow parser/contract before changing production code.
- Document each meaningful scan finding in `## Findings Log` below before or alongside code changes.
- Add colocated docs for property testing so future agents know when and how to add these tests.
- Do not change canonical Markdown memory format unless a property test exposes a real correctness bug.
- Current source boundaries of interest:
  - `src/core/index.ts` backend-agnostic barrel
  - `src/runtime/index.ts` local runtime composition
  - `src/qmd/` QMD adapter internals
  - `src/cli/targets.ts` CLI local/remote target selection seam
  - `src/server/index.ts` server-local runtime boundary

## Handoff Context for New Agents

The repository currently has a modular TypeScript layout:

```text
src/core/       backend-agnostic Markdown/setup/writing/types barrel
src/runtime/    local runtime composition, re-exported by src/index.ts
src/qmd/        QMD adapter internals; do not call from CLI directly
src/cli/        CLI parsing plus target/local transport seams
src/server/     minimal server-local runtime composition boundary
```

Recent validation before creating this task list:

- `npm run validate` passed with 35 tests.
- `npm run cli:pack` passed.
- `git status --short --untracked-files=all` was clean.
- Active/private task lists live under ignored `tasks/`.

The previous follow-up task added `src/cli/targets.ts` and remote placeholder behavior. If this task is resumed later, first check `git status`, `npm run validate`, and the current state of `tasks/todo/tasks-post-ralph-architecture-hardening.md`.

## Relevant Files

- `package.json` - Add `fast-check` as a dev dependency; keep property tests in `npm test` through existing `node --test`.
- `package-lock.json` - Regenerate after adding `fast-check`.
- `src/canonical/markdown-store.ts` - `parseFrontmatter`, `normalizeRelative`, Markdown discovery ignores.
- `src/writing/markdown-file.ts` - `renderMarkdownDocument`, `slug`, `writeUniqueMarkdownFile`.
- `src/retrieval/depth-policy.ts` - `normalizeRetrievalDepth`, depth/bucket boost invariants.
- `src/cli/targets.ts` - local/remote target resolution and placeholder behavior.
- `src/qmd/qmd-cli.ts` - `qmdVirtualPathToRelative`, `normalizeQmdLookupPath`; avoid invoking QMD in property tests.
- `src/qmd/qmd-ranking.ts` - score/ranking helpers; good later target if exported test seam is justified.
- `scripts/local-pack-manifest.mjs` - package-content validation invariants.
- `test/memory-cli.test.js` - Existing example tests for CLI and QMD helpers; do not overload with all property tests.
- `test/architecture-boundaries.test.js` - Existing static import-boundary tests; use as scan baseline, not property testing.
- `test/core-boundary.test.js` - Existing core export checks.
- `test/local-pack-scripts.test.js` - Candidate for manifest property tests or a dedicated property test file.
- `test/property-helpers.js` - Shared deterministic fast-check settings and common arbitraries.
- `test/PROPERTY_TESTING.md` - Colocated doc explaining deterministic property-test rules for this repo.
- `test/markdown-properties.test.js` - Markdown/frontmatter edge contract properties.
- `test/slug-path-properties.test.js` - Slug and relative path normalization properties.
- `test/cli-target-properties.test.js` - CLI local/remote target selection properties.
- `test/depth-policy-properties.test.js` - Retrieval depth-policy properties.
- `test/qmd-helper-properties.test.js` - Pure QMD path helper properties without spawning QMD.
- `test/local-pack-properties.test.js` - Local pack manifest validation properties.
- `test/source-graph-helpers.js` - Shared import graph helper extracted from boundary tests.
- `docs/technical.md` - Documents property-test scope and architecture edge rules.
- `AGENTS.md` - Adds concise durable property-testing guidance.

## Findings Log

Add dated findings here as the scan progresses. Keep entries concrete and risk-ranked. Example format:

```text
- 2026-06-24 — Medium — `src/cli/targets.ts`: remote flag precedence should be property-tested because future hosted-client work depends on it.
```

Current initial findings:

- 2026-06-24 — Medium — Property testing is valuable for pure architecture-edge contracts, but should stay bounded; full QMD process/indexing property tests would be too slow and brittle for normal `npm test`.
- 2026-06-24 — Medium — Highest-value property-test targets are frontmatter/render roundtrips, CLI target selection, depth policy, slug/path normalization, pure QMD path helpers, and package manifest validation.
- 2026-06-24 — Low — Duplicated import-graph helper code exists across boundary tests; worth scanning for fat after property coverage lands, but not urgent enough to block setup.
- 2026-06-26 — Medium — `renderMarkdownDocument` intentionally inserts a blank separator after the closing frontmatter fence; `parseFrontmatter` returns that separator as a leading body newline, so property tests encode current parser/render behavior rather than changing canonical Markdown output.
- 2026-06-26 — Medium — `fast-check` `stringMatching` requires anchored regexes for constrained generators; helper arbitraries now anchor key/path segment patterns and exclude `.`/`..` path segments for filesystem normalization tests.
- 2026-06-26 — Low — `test/memory-cli.test.js` still carries useful end-to-end CLI examples even where property tests cover pure helper invariants; no removals made.
- 2026-06-26 — Low — Source import-graph helpers were duplicated across boundary tests; extracted `test/source-graph-helpers.js` to keep architecture boundary assertions consistent.
- 2026-06-26 — Low — Barrel review found QMD test helper imports can remain direct/internal; no public API expansion was needed for property tests.
- 2026-06-26 — Low — `src/cli.ts` has repeated output blocks, but formatter extraction was skipped because it was outside the high-value property-test scope and risked obscuring CLI command behavior.

## Architecture Edge Scan Questions

Use this checklist before and during implementation:

- Which modules are public-by-accident versus intentionally imported by consumers?
- Which barrels add clarity, and which only hide unclear ownership?
- Are pure helper functions colocated with runtime code that makes them hard to test without QMD or filesystem effects?
- Does a boundary have two names for the same concept, e.g. root/target/runtime/server root?
- Are tests asserting implementation strings instead of observable contract/invariants?
- Are there functions where examples are endless but invariants are simple?
- Are generated test failures easy to minimize and understand?

## Tasks

- [x] 1.0 Add property-testing setup to normal tests
  - [x] 1.1 Add `fast-check` as a dev dependency in `package.json`.
  - [x] 1.2 Regenerate `package-lock.json`.
  - [x] 1.3 Create `test/property-helpers.js` with shared deterministic settings, e.g. bounded `numRuns`, fixed seed, and common arbitraries.
  - [x] 1.4 Create colocated docs at `test/PROPERTY_TESTING.md` explaining repo-specific property-test rules: deterministic seed, modest `numRuns`, pure edge contracts only, no external QMD process calls.
  - [x] 1.5 Ensure property tests run under existing `npm test` / `node --test` with no separate command.
  - [x] 1.6 Add documentation comments in the helper pointing future agents to `test/PROPERTY_TESTING.md`.

- [x] 2.0 Property-test Markdown/frontmatter edge contracts (vital)
  - [x] 2.1 Create `test/markdown-properties.test.js`.
  - [x] 2.2 Generate safe frontmatter fields with keys matching `[A-Za-z0-9_-]+` and supported values: strings, numbers, booleans, and string arrays.
  - [x] 2.3 Assert `renderMarkdownDocument(fields, body)` followed by `parseFrontmatter` preserves supported field values after the current parser's documented coercions.
  - [x] 2.4 Assert parsed body matches the original body modulo intentional `trimEnd` behavior from `renderMarkdownDocument`.
  - [x] 2.5 Generate content without a valid opening/closing frontmatter fence and assert `parseFrontmatter` returns empty metadata and `bodyStartLine: 1`.
  - [x] 2.6 Critically evaluate any failure before changing production parser behavior; document intentional limitations.

- [x] 3.0 Property-test slug and path normalization invariants (vital)
  - [x] 3.1 Add generated tests for `slug(value, fallback)`.
  - [x] 3.2 Assert slugs are non-empty, at most 80 chars, lowercase, and contain only `[a-z0-9._-]` when input has sluggable characters.
  - [x] 3.3 Assert fallback is returned for all-whitespace or all-unsluggable input.
  - [x] 3.4 Add generated tests for `normalizeRelative(root, absolutePath)` using platform path joins; assert output uses `/` separators and remains relative for children.
  - [x] 3.5 Avoid brittle assumptions for paths outside the root unless the production contract explicitly requires rejecting them.

- [x] 4.0 Property-test CLI target selection invariants (vital)
  - [x] 4.1 Create `test/cli-target-properties.test.js` or add focused generated tests near existing CLI target tests.
  - [x] 4.2 Generate non-empty URL/root strings and assert remote flags win over `--root` when both are present.
  - [x] 4.3 Assert `target-url` and `remote-url` are equivalent remote selectors.
  - [x] 4.4 Assert empty string, whitespace string, boolean, and empty array values fail with clear `--flag` errors.
  - [x] 4.5 Assert `allowDiscovery` returns a local target with no root only when no remote flag/root is present.

- [x] 5.0 Property-test retrieval depth policy invariants (vital)
  - [x] 5.1 Create `test/depth-policy-properties.test.js`.
  - [x] 5.2 Generate valid and invalid depth strings; assert valid values round-trip and invalid values throw with the allowed-depth message.
  - [x] 5.3 Generate documents with both frontmatter `type` and path buckets; assert frontmatter `type` takes precedence over path bucket.
  - [x] 5.4 Assert shallow boosts pages/decisions above sessions for generated documents.
  - [x] 5.5 Assert `depthPolicyFor(document, depth)` always returns the requested depth, a non-empty bucket, and a finite numeric boost.

- [x] 6.0 Property-test QMD pure helper invariants without invoking QMD (vital but small)
  - [x] 6.1 Use only pure helpers from `src/qmd/qmd-cli.ts` or the existing test internals; do not spawn `qmd`.
  - [x] 6.2 Generate URL-safe relative paths and assert `qmdVirtualPathToRelative('qmd://jumpybrain/' + encodeURIComponent(path))` decodes to the original path.
  - [x] 6.3 Assert non-`qmd://jumpybrain/` prefixes return `undefined`.
  - [x] 6.4 Generate mixed-case/underscore paths and assert `normalizeQmdLookupPath` is lowercase and has no underscores.
  - [x] 6.5 Decide whether these helpers should be exported through a test-only seam or direct module import; avoid making them public API by accident.

- [x] 7.0 Property-test package manifest validation (vital for install confidence)
  - [x] 7.1 Extend `test/local-pack-scripts.test.js` or create `test/local-pack-properties.test.js`.
  - [x] 7.2 Generate supersets of `requiredLocalPackFiles` and assert validation succeeds when no forbidden files are present.
  - [x] 7.3 Generate lists missing one required file and assert validation fails with that missing file named.
  - [x] 7.4 Generate lists containing one forbidden stale file and assert validation fails with that stale file named.
  - [x] 7.5 Keep file-list generation small and deterministic.

- [x] 8.0 Scan for fat and brittle tests after property coverage lands
  - [x] 8.1 Review `test/memory-cli.test.js` for examples now superseded by property tests; remove only if coverage is clearly redundant. No removals: examples still cover CLI/integration behavior.
  - [x] 8.2 Review duplicated source import-graph helpers across `test/architecture-boundaries.test.js`, `test/core-boundary.test.js`, `test/runtime-boundary.test.js`, and `test/server-boundary.test.js`.
  - [x] 8.3 If useful, extract shared import-graph helpers to `test/source-graph-helpers.js`.
  - [x] 8.4 Review barrels (`src/core/index.ts`, `src/runtime/index.ts`, `src/qmd/index.ts`) for exports that are only used by tests and consider narrowing or marking as test-only. No property-test-driven public API expansion was needed.
  - [~] 8.5 Review `src/cli.ts` for repeated command output blocks that could be formatter helpers without obscuring command behavior. Skipped extraction: lower value than property coverage and could obscure command behavior.
  - [x] 8.6 Record concrete fat-cut findings in `## Findings Log` before implementing removals.
  - [x] 8.7 Skip any cleanup whose risk outweighs maintenance benefit; noted skipped CLI formatter cleanup in `## Findings Log`.

- [x] 9.0 Validate and document property-test strategy
  - [x] 9.1 Run `npm run validate` and confirm property tests do not make normal test runtime unreasonable.
  - [x] 9.2 Run `npm run cli:pack` if property-test setup changes package contents or dev dependencies in a way that could affect local packaging.
  - [x] 9.3 Ensure `test/PROPERTY_TESTING.md` accurately reflects the implemented helper/settings and vital-only scope.
  - [x] 9.4 Update `AGENTS.md` with concise property-testing guidance if the pattern is durable.
  - [x] 9.5 Update `docs/technical.md` only if the architecture edge scan changes documented boundaries or public/private API decisions.
  - [x] 9.6 Mark this task list complete and update `tasks/CHANGELOG.md` only after implementation is done.

## Non-Tasks

- Do not property-test external QMD process behavior in normal `npm test`.
- Do not add randomized non-deterministic CI behavior; use fixed seeds/settings.
- Do not replace existing integration tests that verify real CLI/QMD behavior.
- Do not expand package/public API just to make internals easier to test.
