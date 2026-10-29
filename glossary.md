# Glossary

## System message

Tab-local app feedback dispatched with a stable source key through one shared component. Severity controls priority; repeated outcomes are deduplicated, and brain scope fences stale messages/actions. Desktop installation/host results explicitly use app scope. Messages do not own canonical save state, form validation or authorization. See [the browser contract](src/adapters/http-server/browser.docs.md#system-messages).

## Extension

An explicitly installed, trusted local TS/JS package that registers optional commands, events, panels or themes through the public jumpyBrain API. The desktop gateway owns executable activation; browser contributions have separate mount/dispose lifetimes. A package's capabilities are supported-operation declarations, not a sandbox. Memory semantics and write authorization remain core/app/target-owned. See [authoring](docs/extensions.md).

## Extension host

The desktop-composed app service that activates one factory per enabled package revision and owns registrations, scoped invocation and cleanup across browser tabs. Ordinary CLI memory commands and hosted servers do not construct it. Package manifests, linked source paths, compiled caches and namespaced state live outside canonical memory and the replaceable app bundle.

## Brain connection

A named, Mac-app destination profile (called a companion profile in the internal protocol) for an existing local Markdown root or remote memory origin. One profile is active across companion editor tabs; switching does not sync memory or change CLI/agent targets. Destination replacement receives a new profile identity so old note links cannot open on a different brain. Remote connectivity and explicit editing/index permission are separate.

## Note attention

The sidebar's canonical resurfacing state, stored in Markdown `attention_at`: absent follows edit/creation recency, a future timestamp snoozes until due, and explicit YAML null settles indefinitely. Bring back removes the override. Attention changes preserve content edit dates and do not hide notes from search, graph or direct links. Pins are separate local navigation preferences and remain visible. Home Recent activity continues to describe content edits.

## Graph search

A map selection made from shared authenticated search and normalized results, including recent confirmed saves. The map requests a larger bounded candidate set than the global search list, then applies a conservative display gate and keeps all qualifying direct matches without an additional display-count cap. Existing retrieval and graph safety budgets still bound coverage. Full-query title/body matches and strong base-score semantic matches can select notes. Nonmatching neighbors stay out of search; only canonical Markdown links between retained notes form edges. Focus/orphan filters may narrow the view further. This reuses shared ranking; its base-score cutoff is a display heuristic, not a calibrated similarity distance.

## Background search maintenance

Host-owned incremental indexing of derived state after quiet writes and on periodic canonical reconciliation. Canonical saves complete separately. Browser status observation adopts a confirmed fresh generation without starting an index mutation or expanding remote permissions. Quiet scheduling bounds when work starts, not completion time or model memory.

## Recent activity

A read-only home view of up to eight current Markdown files ordered by their latest valid update or creation metadata, with one entry per file. It retains no change history, block attribution, or unread state. Evidence dates and filesystem copy times do not establish edit recency. See [activity-feed scope](tasks/done/2026-10-18_tasks-knowledge-activity-feed.md).

## Contribution actor

Optional declared human/agent provenance for a supported write, with an optional actor ID/name. Canonical Markdown retains creator and latest editor; a revision digest invalidates stale last-editor claims after untracked content changes. It is not verified identity, a permission or a retained contributor history. The app's “You” label requires the same browser-local identity. Legacy/external unknowns stay unknown. See [memory format](docs/memory-format.md#declared-creator-and-last-editor).

## Support diagnostic report

A bounded, inspectable feedback attachment built from allowlisted operational events across available browser/local host sources. It states missing evidence and omissions, replaces correlation IDs with report-local references, and excludes memory content, credentials, paths, raw logs and crash dumps. It is disposable troubleshooting evidence, not canonical memory or proof that an unconfirmed write failed to save.

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

## Source version check

An explicit observational comparison of current canonical file bytes with a fingerprint stored in a claim-adjacent Markdown link title on a Dream page. Changed/missing/ambiguous/not-checked outcomes and partial coverage remain visible. Checked time is transient, distinct from synthesis/evidence dates and truth; no old bytes or multi-file snapshot are retained. See [living topic pages](docs/living-topic-pages.md).

### Personal board

An app-only collection of ordinary Markdown page IDs arranged into three named columns. Membership and positions belong to local application configuration, scoped to a brain connection; they do not change page metadata or memory retrieval. Settling a board archives it until restored from Settings → Boards.
