# Zero-hit keyword guidance

Status: done 2026-11-20. Child of [remote feedback implementation](2026-11-20_tasks-remote-feedback-implementation.md), task 4. Branch `t3/zero-hit-guidance`.

## Problem

A long text query such as `SAP C4C CRM step setup chat` returned nothing while `SAP C4C` found the note, and the empty result gave no reason. The owner chose a concise fewer-keywords hint for empty lexical results, with no broadened queries, retries, ranking or search-semantics changes.

## Tasks

- [x] Investigate the retrieval warning path, compact packet budget and HTTP schema.
- [x] Add one static advisory code and a pure decision in core; wire it in the app without touching retrieval status.
- [x] Keep compact byte budgets and hosted parity; present the hint once in CLI text.
- [x] Focused behavior tests, owning docs, archive and commit.

## Contract

- Code: `no_matches_try_fewer_keywords`, appended to the existing `retrieval.warnings` string list of rich search/recall results and compact recall packets. No new field, route, option or packet version.
- It is added only when all of these hold: the backend returned no rows for a requested count of at least 1; the query has at least two keywords as the lexical backend counts them (stopwords dropped, an identifier or path is one keyword); discovery was lexical-only (index has no semantic mode, or `--read-only`, or `query_constraints_lexical_only`); and every other warning is one of `query_constraints_lexical_only`, `keyword_query_relaxed`, `read_only_index`, `read_only_lexical_fallback`.
- It never changes `retrieval.status`. A complete empty search stays `complete`.
- Not added for: any result; single-keyword queries; semantic discovery that ran (hit or empty); `lexical_query_failed`, `semantic_query_failed_lexical_fallback`, total backend failure (still an error); `index_not_fresh`; `semantic_coverage_incomplete`; temporal requests; `source_changed`; evidence omitted by the compact byte budget; any unknown future warning.
- Compact: the code counts toward `maxBytes`. If the minimum envelope fits only without it, the packet is returned without the hint, so `budget_too_small` triggers at the same query size as before.
- CLI text: `No memory matches found. Try fewer keywords; text search needs them to appear together.` printed once, not as a `Warning:` line. `--json` and `--compact` are unchanged serializations.

## Decisions

- No existing warning code means "nothing matched", so a new code in the existing list was the smallest additive contract. `keyword_query_relaxed` reports that singleton fallback ran and marks retrieval partial; reusing it would have misreported both.
- The warnings list is the only channel the closed compact version-1 client schema leaves open, so older clients and servers interoperate without an upgrade. A new packet field would have been rejected by existing clients.
- The decision lives in `searchMemory` (app) because freshness, read-only and readiness are known there; the pure rule is in `core/retrieval-policy/zero-hit.ts`; the keyword count reuses the QMD adapter's tokenizer so it matches what the lexical query actually conjoined.
- An allowlist of compatible warnings, not a denylist, so a future warning suppresses the hint by default.
- Existing singleton relaxation is untouched. When it also finds nothing, the result carries both `keyword_query_relaxed` and the hint.

## Files

- `src/core/retrieval-policy/zero-hit.ts` (new), `src/adapters/qmd/qmd-query.ts` + `index.ts` (`queryKeywordCount`), `src/app/local-memory/index.ts`, `src/app/local-memory/compact.ts`, `src/cli/formatting.ts`, `src/cli/memory-commands.ts`.
- `test/zero-hit-guidance.test.js` (new).
- Docs: `src/core/retrieval-policy/retrieval-policy.docs.md`, `src/app/local-memory/local-memory.docs.md`, `src/adapters/qmd/qmd.docs.md`, `src/adapters/http-client/http-client.docs.md`, `src/cli/cli.docs.md`, `docs/cli-commands.md`, `docs/shared-memory-protocol.md`, `docs/technical.md`.
- No HTTP client or server code changed: the client already validates warnings as an open string list.

## Overlaps for the parent

- `src/cli/memory-commands.ts`: three small edits in the search/recall text branch and `printRetrievalWarnings` (import, one option on `formatHumanResults`, one `warnings.delete`). `src/cli/formatting.ts`: one exported constant and one option. No change to command dispatch, backend commands, installer scripts or app permission UI.
- `scripts/install-compatibility.mjs` (not edited) accepts a read-only recall only when its warnings are exactly the two read-only codes. The installer's topic `installation check` is one keyword, so the hint is never added there; the new test runs that exact command and asserts `classifyVerification` still returns `ready`. A multi-keyword verification topic would need the installer's allowlist to include the new code.
- Not edited, left to the parent: `tasks/CHANGELOG.md`, `tasks/todo/release-next.md`, `tasks/feedback.md`, `tasks/todo/tasks-feedback-follow-ups.md`, the parent task list, agent instructions (`src/cli/instructions.ts`) and `skills/jumpybrain-memory/SKILL.md`.

## Verification

Snapshot: working tree on `94b77fc5` plus this change; `npm run build` once (dependencies linked from the main checkout, same lockfile), then:

- `node --test test/zero-hit-guidance.test.js` (new) — 9/9 pass. Covers the pure policy table; keyword counting; a lexical miss with exactly one backend call and unchanged `complete` status; the two-keyword hit; single-keyword and `installation check` misses without the hint; unchanged relaxation call list; zero limit; failed, total-failure, temporal and stale empties; a semantic-ready index (vector discovery ran, paraphrase hit, constrained lexical miss, failed vector branch); compact budgets 1024/8192/65536, the exact-fit and hint-dropped boundary and the unchanged `budget_too_small` threshold; budget-omitted evidence; hosted rich and compact parity including raw wire bytes; built CLI text, `--json` and `--compact` output for `recall`, `search` and `run memory:recall` against local and hosted targets; strict read-only on a semantic-capable index and the installer verification command.
- Negative-control check: with the built policy temporarily loosened to ignore warnings and modes, the policy, failed/stale/temporal and semantic tests failed (3 of 9); the build output was restored and the file re-ran 9/9.
- `node --test` on `keyword-relaxation`, `compact-recall`, `bounded-retrieval-http`, `bounded-retrieval-cli`, `qmd-read-only`, `semantic-index-lifecycle`, `recall-formatting`, `semantic-index-seams`, `architecture-boundaries`, `source-graph-contracts`, `temporal-retrieval`, `search-recognition`, `named-discovery-ranking`, `temporal-transport`, `cli-retrieval-validation` — 165/165 pass.
- `node --test` on `recall-guidance`, `dream-skill-distribution`, `cli-doctor-followup`, `http-client` — 37/37 pass (after the doc edits; no source change since the build).
- `git diff --check` clean.

## Limits

- All retrieval checks use fake QMD backends (AND-faithful lexical, canned vector rows, the read-only store fixture). Real QMD 2.8.3, a real embedding model and `scripts/semantic-index-smoke.mjs` were not run; the change makes no semantic-quality claim.
- Not run: full `npm test`, browser or Mac app checks, installer suites, packaged or installed CLI, any real brain or shared server.
- The browser search and Mac app ignore unknown warning codes, so they show no hint. `doctor --probe-query` with a multi-keyword miss now lists the code among probe warnings.
- "Lexical-only" is decided from readiness modes and existing warnings. A semantic-capable index whose vector branch was skipped for a reason without a warning gets no hint (conservative miss).
- The hint says keywords must appear together. Strict discovery uses adjacent and salient keyword pairs plus the full set, so this is a description of typical behavior, not a guarantee that any shorter query will match.
- Agent instructions and the distributed skill do not mention the code; agents rely on its wording.
