# Core retrieval-policy docs

## Responsibilities

- Normalize supported retrieval-depth values and expose deterministic depth-policy boosts.
- Classify canonical Markdown documents by frontmatter type or memory-directory bucket.
- Stay backend-agnostic so QMD-backed search and future retrieval adapters can apply the same policy.
- Own pure source-excerpt selection in `excerpts.ts`: supplied lines/window/query terms become bounded evidence and actual line citations, without I/O or backend knowledge.

## Non-responsibilities

- Do not call QMD, build indexes, read files, or execute search.
- Do not parse CLI arguments beyond validating the already-selected depth value.
- Do not depend on runtime, processing, server, or adapter modules.

## Evidence excerpts

Heading/fence recognition is shared with canonical evidence expansion via `core/canonical/markdown-structure.ts`; excerpt policy remains owned here.

Select a matching line within the supplied window, discounting repeated topic/title mentions relative to rarer requested detail. A heading at the first nonblank body line (ATX or setext, regardless of level) is the main title: exclude it and its setext underline from match candidates when another nonblank line exists in the window. Title-only windows/notes retain the fallback; do not search unrelated windows. The title can still appear as necessary ancestor context. Markdown link labels contribute to matching; original targets remain unchanged in the structured excerpt (CLI plain-display abbreviation is a separate concern). Normalize punctuation for matching only. This is excerpt selection, not a document relevance score or a generated claim.

Prefer the enclosing small heading section or a whole paragraph/list item/fenced block; retain nested list qualifications and bounded adjacent context. Heading names are never special-cased. Preserve ancestor scope when its contiguous span fits, otherwise explicitly label omitted ancestor context. Large units use a match-centered, explicitly partial excerpt. Returned ranges address the displayed canonical lines, not the whole retrieval window. Whitespace is compacted, so this is not a lossless Markdown rendering.

The initial per-passage bound is 1,000 characters, including omission markers. This is not a tokenizer contract or universally optimal size. Different sections can still contain relevant reasoning; absence of a partial marker never proves a complete answer. The adapter owns bounded source reads and backend-window fallback. Tests cover arbitrary headings, heading-free prose, long lines, nested lists, fences, scope, link identities, and malformed bracket input.

## Dream preference

- `isDreamDocument` is the shared strict classifier: only parsed `frontmatter.dream === true`, in any directory. Quoted scalars and `[[dream]]` links do not qualify.
- `dreamBoostFor` targets a total depth preference of `0.55` in normal and `1.0` in shallow retrieval, subtracting the existing bucket boost before applying relevance. For a fully relevant page, the additional contributions are `0.45` / `0.2`; this is not another full page bonus.
- The adapter supplies relevance in `[0,1]`. Deep retrieval and explicit source/detail/date queries receive no dream boost. `isSourceFocusedQuery` conservatively recognizes source/raw/journal/session terms, exact quotes, Markdown paths, and explicit years; it is a heuristic, not intent understanding.
- Classification is neither a truth guarantee nor independent corroboration. Canonical metadata, including historical evidence dates, remains attached to results.


## Temporal evidence policy

`temporal.ts` owns pure strict evidence-date selection and query validation, not discovery. `resolveTemporalQuery` accepts explicit lower/upper days or timezone-explicit timestamps (at most millisecond precision), rejects impossible/reversed/empty bounds and malformed types/unknown keys, and normalizes to a UTC half-open interval. Day upper bounds include that day. Relative `t-Nd` requires a supplied real `referenceDate`; there is no moving clock or inferred natural-language filter. `order: chronological` can stand alone without bounds.

`evidenceDate` returns `declared` from valid `date`, otherwise recognized journal `filename`, otherwise `unknown` with missing/invalid/synthesis reason. An invalid explicit date blocks fallbacks. Strict dream/process-owned syntheses without `date` never use filename/creation/modification dates. Unknowns do not satisfy date bounds but may participate in order-only retrieval. No date is asserted to verify events or fact validity; a multi-period synthesis's declared date cannot date every claim. Strict ISO-calendar validation is shared with canonical written dates and dream-window validation, while their fallback policies deliberately differ.

## Compact recall packets

`compact.ts` owns version-1 `kind: "recall"` evidence shapes and pure whole-passage packing. `packCompactRecall` consumes the existing search order: primary then additional passages for each result. It skips units that cannot fit and continues in order; it never slices their text or qualifications. `omitted.results` counts search rows with no represented passage, while `omitted.passages` includes budget omissions plus search's reported candidate-passage omissions. Neither counts unknown matches beyond search's limit/candidate pools.

The complete `serializeCompactRecall(packet)` output is compact JSON plus one LF. `core/serialized-budget.ts` owns UTF-8 accounting and integer budgets (1024–65536, default 8192); query, readiness, retrieval outcome, omission markers and opt-in diagnostics all count. An oversized minimum envelope throws `budget_too_small`. Transports must not wrap, pretty-print, or add fields after packing. Huge diagnostic metadata can exclude a whole passage, not bypass the cap. No token estimate or tokenizer guarantee.

Packet scope is `selected_passages`; passage scope is `excerpt`. Both explicitly have `partial: true`: bounded recall never asserts complete document/answer context. Existing excerpt omission markers remain unchanged. Dates use strictly validated `created_at`, otherwise `createdAt`, matching human recall's written-date precedence; absent/invalid dates have `basis: "unknown"`. They never infer an event date from `date`, modification times, or filenames.

The app verifies expansion identity and current source bytes; this policy module only compares supplied excerpt coordinates/text against supplied source, allowing existing whitespace compaction and explicit partial/ancestor/read-bound markers. Unmarked excerpts require the entire cited range to match; within-line partial slices must match the cited single line. Arbitrary frontmatter and QMD score/hit IDs are diagnostics-only.

### Compact temporal additions

Only an explicit temporal request adds the optional packet `temporal` interval/coverage and passage `evidenceDate`/`relationships`. Written `date` remains separate. Relationships contain only source-declared `conflicts_with`/`supersedes` strings or string arrays, never inferred resolution. All additions count toward the same whole-passage UTF-8 budget; oversized declarations omit the passage, not the qualifications. Without a temporal envelope the pure packer strips temporal passage additions, preserving legacy V1 output.
