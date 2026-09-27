# Search ranking: exact titles and recency

## Goal

Make memory search better reflect the user's intent: exact page-title matches should appear first, and recent relevant memories should rank more prominently than they do today. Apply improvements in the shared search pipeline so Cmd+K and CLI search benefit together, without duplicated frontend ranking logic.

## User problem / Desired outcomes

- Cmd+K is a convenient way to evaluate the shared search engine's usefulness, not a separate search implementation.
- Searching `entrepreneur` should put the corresponding `Entrepreneur` page first when it exists, rather than burying it below body-text mentions. Include the reported `entrepreneur.md` case when investigating title-versus-filename fallback.
- Page titles are a particularly strong relevance signal in a curated memory system, although they are not always accurate. Exact matches should receive priority; title relevance beyond exact matches should also be evaluated.
- Recency should have a stronger influence on otherwise relevant results. Fresh but unrelated content should not displace an exact title match or substantially more relevant evidence.

## Scope / Starting point

Planning capture only; investigation and implementation are deferred so the current conversation can stay focused on frontend changes. No ranking weights or date semantics are decided here.

The repository already has a shared QMD ranking layer and bounded temporal boosts in `qmd-ranking.ts`. Their current behavior, candidate coverage, title weighting, and date interpretation still need investigation; this task does not assume a larger numeric boost alone will solve the problem.

## Relevant Files

- `src/adapters/qmd/qmd.docs.md`, `qmd-ranking.ts`, `qmd-query.ts` — retrieval, candidate selection, and ranking contracts.
- `src/app/local-memory/index.ts` — shared search use case.
- `src/core/retrieval-policy/` — retrieval-depth policy and existing preferences.
- `src/adapters/http-server/notes-browser.ts` — Cmd+K result deduplication/display limits; avoid adding a separate ranking policy here.
- `src/cli/memory-commands.ts` — CLI parity checks.

## Tasks

- [ ] 1.0 Establish current behavior and reproduce the problem.
  - [ ] 1.1 Trace existing title/filename matching, temporal boosts, date sources, and candidate limits before ranking.
  - [ ] 1.2 Build a small reproducible fixture: exact `Entrepreneur` page, body-only mentions, recent relevant notes, older relevant notes, and recent unrelated notes.
  - [ ] 1.3 Record baseline shared-search ordering and Cmd+K presentation; distinguish missing candidates from insufficient ranking priority.
- [ ] 2.0 Define and implement shared ranking improvements.
  - [ ] 2.1 Define exact-title normalization, filename fallback, and deterministic handling of duplicate titles; ensure the exact page is retrieved and ranks first.
  - [ ] 2.2 Make recency meaningfully stronger while preserving relevance. Decide explicitly which dates count and how missing dates or metadata-only edits behave.
  - [ ] 2.3 Preserve intentional historical/date-scoped retrieval and account for existing depth/dream preferences rather than stacking conflicting boosts blindly.
- [ ] 3.0 Verify outcomes and document the policy.
  - [ ] 3.1 Add ordering regressions for exact titles, filename fallback, duplicates, newer relevant results, unrelated fresh content, missing dates, and historical intent.
  - [ ] 3.2 Compare CLI and Cmd+K with the same root/query/depth; account for display limits and document deduplication, not separate ranking rules.
  - [ ] 3.3 Record before/after examples and trade-offs here; update owning docs with the implemented policy.
