# Search ranking: exact titles and recency

Completed and archived with approval on 2026-09-27: shared exact-title retrieval/ranking and relevance-gated recency implemented, with CLI/Cmd+K parity verified and all 396 tests passing.

## Goal

Make memory search better reflect the user's intent: exact page-title matches should appear first, and recent relevant memories should rank more prominently than they do today. Apply improvements in the shared search pipeline so Cmd+K and CLI search benefit together, without duplicated frontend ranking logic.

## User problem / Desired outcomes

- Cmd+K is a convenient way to evaluate the shared search engine's usefulness, not a separate search implementation.
- Searching `entrepreneur` should put the corresponding `Entrepreneur` page first when it exists, rather than burying it below body-text mentions. Include the reported `entrepreneur.md` case when investigating title-versus-filename fallback.
- Page titles are a particularly strong relevance signal in a curated memory system, although they are not always accurate. Exact matches should receive priority; title relevance beyond exact matches should also be evaluated.
- Recency should have a stronger influence on otherwise relevant results. Fresh but unrelated content should not displace an exact title match or substantially more relevant evidence.

## Scope / Starting point

Implemented, verified, and archived with approval. Ranking and bounded title-candidate supplementation live in the shared QMD adapter; the frontend keeps its existing presentation-only normalization. See the investigation and policy below.

## Relevant Files

- `src/adapters/qmd/qmd.docs.md`, `qmd-ranking.ts`, `qmd-query.ts` — retrieval, candidate selection, and ranking contracts.
- `src/app/local-memory/index.ts` — shared search use case.
- `src/core/retrieval-policy/` — retrieval-depth policy and existing preferences.
- `src/adapters/http-server/notes-browser.ts` — Cmd+K result deduplication/display limits; avoid adding a separate ranking policy here.
- `src/cli/memory-commands.ts` — CLI parity checks.
- `src/adapters/qmd/qmd-driver.ts`, `src/types.ts` — candidate supplementation and score breakdown.
- `test/search-ranking.test.js`, `test/search-ranking-parity.test.js` — deterministic ordering, candidate-cutoff, and CLI/HTTP/browser regressions.

## Tasks

- [x] 1.0 Establish current behavior and reproduce the problem.
  - [x] 1.1 Trace existing title/filename matching, temporal boosts, date sources, and candidate limits before ranking.
  - [x] 1.2 Build a small reproducible fixture: exact `Entrepreneur` page, body-only mentions, recent relevant notes, older relevant notes, and recent unrelated notes.
  - [x] 1.3 Record baseline shared-search ordering and Cmd+K presentation; distinguish missing candidates from insufficient ranking priority.
- [x] 2.0 Define and implement shared ranking improvements.
  - [x] 2.1 Define exact-title normalization, filename fallback, and deterministic handling of duplicate titles; ensure the exact page is retrieved and ranks first.
  - [x] 2.2 Make recency meaningfully stronger while preserving relevance. Decide explicitly which dates count and how missing dates or metadata-only edits behave.
  - [x] 2.3 Preserve intentional historical/date-scoped retrieval and account for existing depth/dream preferences rather than stacking conflicting boosts blindly.
- [x] 3.0 Verify outcomes and document the policy.
  - [x] 3.1 Add ordering regressions for exact titles, filename fallback, duplicates, newer relevant results, unrelated fresh content, missing dates, and historical intent.
  - [x] 3.2 Compare CLI and Cmd+K with the same root/query/depth; account for display limits and document deduplication, not separate ranking rules.
  - [x] 3.3 Record before/after examples and trade-offs here; update owning docs with the implemented policy.

## Investigation and baseline — 2026-09-27

- The canonical parser/index carries frontmatter titles unchanged; it does not derive them from headings or filenames. Previously the ranker matched the snippet and generic metadata, with no dedicated title or filename signal.
- Ordinary QMD retrieval runs up to eight lexical queries plus one structured query, with `min(160, max(limit * 8, 40))` rows and a merged cutoff. Dream supplements add at most 24 candidates afterward. A page excluded here cannot be rescued by a numeric boost alone.
- Plain `entrepreneur` previously received no temporal boost. Only explicit recent/old/before/after cues did, up to `0.12`. Dates previously used `date ?? updated_at ?? created_at`, except dreams required `date`.
- Canonical saves refresh `updated_at`, even for metadata-only edits; this is not evidence freshness. Search sees indexed metadata, while the home recent list scans fresh metadata separately.
- Disposable fake-QMD fixtures reproduce the reported behavior class, including a filename-only `entrepreneur.md`; the original private memory root was not inspected or changed. The baseline regressions were executed against the pre-change build before rebuilding.

| Fixture / query | Before | After |
| --- | --- | --- |
| Exact `Entrepreneur` page omitted by QMD; `entrepreneur`, normal/24, same CLI and HTTP root | Body-only `notes/legacy.md` first; target absent | `pages/entrepreneur.md` first in both backend responses and Cmd+K's navigable display |
| Filename-only `pages/entrepreneur.md` and an empty title-only note; no QMD hits | No results | Both returned; `entrepreneur.md` also finds the filename fallback |
| Relevant old QMD=1 vs newer QMD=0.95, plus undated and fresh unrelated notes | old → newer → undated → unrelated | newer → old → undated → unrelated; newer receives `0.18`, unrelated/undated receive zero |
| Relevant old QMD=1 vs newer QMD=0.7 | Old first | Old still first: the relevance gap exceeds the recency budget |

## Implemented policy and trade-offs

- Exact-title normalization: Unicode NFKC, whitespace trim/collapse, lowercase/NFC; punctuation stays significant. Nonblank string metadata titles win; otherwise use filename stem, accepting `.md` and hyphen/underscore word separators. No heading inference, aliasing, or filename override of a real title.
- Up to 24 missing exact matches are selected from the loaded manifest by canonical relative path, after QMD cutoffs. They use QMD score zero and bounded original-body repair; all candidates still total at most 208. Empty title-only notes may return empty snippets; stale missing files are skipped. No extra QMD calls, global body reads, or index migration.
- Exact title adds `4`, dominating all existing non-exact depth/dream combinations; partial query-token title coverage of at least half adds up to `0.2`. Breakdown exposes `titleMatchBoost`. Duplicate titles use final score, canonical path, line, then ID; existing map diversity remains. More than 24 omitted duplicate-title notes are not exhaustively recovered.
- Default recency is at most `0.18`, candidate-relative and gated by lexical coverage/QMD relevance using the existing dream relevance gate. It changes close relevance orderings, not the exact-title tier. Candidate outliers and coverage can affect its gradient; this is not wall-clock freshness or a broad benchmark calibration.
- Dates: explicit `date`, otherwise ordinary-note `created_at`; dreams require `date`. Edit timestamps, mtime, and filename dates do not count. Missing/invalid dates get no temporal credit; invalid/empty explicit dates do not fall through. This removes the old update-time fallback, so creation-less legacy notes need explicit dates for recency. Timestamp calendar validation also rejects rolled-over dates.
- Existing explicit recent/old/ISO before/after scoring stays bounded at `0.12`, replacing rather than stacking default recency. Source/historical/year queries and unresolved temporal scopes get no ordinary freshness bias. These are ranking hints, not hard date filters. Independent review added regressions for previous/past/old wording and invalid timestamp dates.
- CLI defaults to limit 10; Cmd+K requests normal/24, affecting candidate coverage. Parity uses normal/24 for both. Cmd+K keeps the first hit per valid ID (otherwise file/hit ID), moves unavailable ID-less notes after navigable ones, and caps display at 12. It does not rerank relevance. Thus ID-less exact matches can still display below usable notes.

## Verification

- `npm test`: **396 passed, 0 failed**, including existing real-QMD search tests.
- New deterministic regressions cover exact/partial titles, Unicode/whitespace/punctuation, filename fallback, candidate omission/cutoffs, all depths versus dreams, duplicate ordering/bounds, empty and stale notes, newer relevant/stronger older/fresh unrelated notes, date precedence and invalid dates, and historical intent.
- `test/search-ranking-parity.test.js` compares the entire local CLI and HTTP result arrays, then executes the shipped browser normalizer to verify first-hit deduplication, ID partitioning, and the 12-note cap. No separate frontend ranking logic was added.
- `git diff --check` passed. No installed runtime was updated, no live memory root was edited, and unrelated concurrent companion/task changes were left untouched.
