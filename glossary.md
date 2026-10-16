# Glossary

## Brain connection

A named, companion-only destination profile for an existing local Markdown root or remote memory origin. One profile is active across companion editor tabs; switching does not sync memory or change CLI/agent targets. Destination replacement receives a new profile identity so old note links cannot open on a different brain. Remote connectivity and explicit editing/index permission are separate.

## Saved memory outcome

`Saved` means canonical Markdown publication completed and its document ID/path remain usable. `Indexed`, `pending`, and `failed` describe separate derived-index/bookkeeping outcomes; a failed index is not a failed creation. Repair indexing rather than recreating a saved memory. Abrupt crash/lost-response uncertainty is not resolved by this result vocabulary.

## Dream page

A topical synthesis marked with the YAML boolean `dream: true`, normally under `pages/`. It connects and condenses source evidence, can evolve across dreaming runs, and receives a relevance-aware preference in normal/shallow retrieval. The marker is neither a truth guarantee nor a write permission; `[[dream]]` alone does not classify a document.

## Extractive source map

A process-owned page produced by deterministic `process --mode synthesize`: bounded topic-relevant source excerpts with original citations, not reviewed semantic synthesis or resolved truth. Unlike ordinary dream updates, extraction refuses human/dream destinations and leaves unchanged output byte-identical.

## Recall passage

A bounded source excerpt with its own file/line provenance, not a generated or independently verified claim. Normal/shallow recall groups passages by canonical file before applying the result limit; deep/source-focused recall retains chunk-level limits. A legacy file-level hit contains at most two passages and may report omitted candidate passages. Opt-in compact recall packs the same excerpts (each bounded at 1,000 characters) under an aggregate serialized UTF-8 byte cap; raising it does not lengthen individual excerpts. Bounded does not mean universally smaller: metadata can exceed text at small result counts, and bytes are not tokens. Text citations alone are not verified expansion handles; in compact, each carries explicit partial scope and either a unique canonical ID/hash expansion token or an unavailability reason. QMD hit IDs are not document IDs.

## Evidence expansion

A read-only, content-hash-guarded line range or enclosing section from canonical Markdown. Returned citations cover only actual whole source lines; budget truncation reports a continuation line. A first requested line too large for the maximum packet space is an error, not a substring or recoverable continuation. Available compact ID/hash handles supply guarded-read preconditions only on the same root/target; local file-tool range reads are not hash-checked expansion. Stale hashes require refreshed evidence, never automatic full-document fallback. Byte caps are not token budgets.

## Evidence date

Declared document-level `date`, or a conservatively recognized journal filename date in explicit temporal retrieval. It is separate from writing/import time (`created_at`/`createdAt`), edit time (`updated_at`/mtime), and fact validity (when a particular claim is true, not inferred by retrieval). Multi-period synthesis does not gain a single event date from its creation time. Date-bounded recall excludes unknown/invalid evidence dates; dream import-review windows intentionally retain labeled fallback dates.

## Temporal recall interval

An explicitly requested, resolved UTC half-open evidence interval: inclusive lower bound, exclusive upper bound. A date-only upper input includes its entire day; timestamp uppers are exclusive. Relative bounds require a pinned reference date. Relevance selects a bounded evidence set; chronological order only presents that set and does not establish truth, supersession, or exhaustive coverage.

## Dream window

A stateless, bounded context request over inclusive UTC calendar dates. `--from` selects the newest day and `--days` counts backward: `--from t-1d --days 3` covers T-1 through T-3. Overlap and revisits are intentional; retrieval records no dreamed/completed status. Evidence dates and filesystem modification dates are separate selection modes.
