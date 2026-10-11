# CLI command reference

This page lists the user-facing `jumpybrain` CLI commands and explains what each one does in plain language.

## Targets and common flags

Most memory commands work against either a local Markdown memory root or a hosted/shared jumpyBrain server.

| Flag / environment | Meaning |
| --- | --- |
| `--root <memory-root>` | Use a local Markdown memory directory. Top-level memory commands usually require this flag for local mode. |
| `--target-url <url>` | Use a remote jumpyBrain server instead of local files. |
| `--remote-url <url>` | Alias for `--target-url <url>`. |
| `JUMPYBRAIN_API_KEY` | API key required when using `--target-url` or `--remote-url`. |
| `JUMPYBRAIN_CLI_CONFIG` | Optional path to device-local CLI policy; defaults to `~/.jumpybrain/cli-config.json`. |
| `--json` | Print machine-readable JSON when the command supports it. |

The `jumpybrain run memory:*` recipe commands are mostly the same as the top-level memory commands, but they may discover a local memory root from the current working directory. They are useful for agent integrations and `npx jumpybrain` workflows.

### Protected remote targets

For a target marked read-only during installation, the CLI permits only this explicit retrieval allowlist:

| Allowed | Blocked |
| --- | --- |
| `status`, `tree`/`overview`, `search`, `recall`, `expand`, `show` | `index`, `remember`, `wrapup`, document `update`, and remote `process` |
| `dream` (stateless window read) | Deprecated batch mutation flags remain rejected |
| Matching `run memory:status/tree/overview/search/recall/expand/show` recipes | Matching mutation recipes and future unclassified remote operations |

Legacy dream flags fail with deprecation guidance; they cannot turn a window read into a batch mutation. Rejection occurs before credentials, stdin/files, wrapup recall, idempotency creation, or HTTP transport. Local roots and unlisted remote origins keep their existing behavior.

The error code is `JUMPYBRAIN_REMOTE_TARGET_READ_ONLY`. It describes a local advisory safety guard; server-side authorization is still required for security.

## Basic CLI commands

| Command | Human explanation |
| --- | --- |
| `jumpybrain` | Print CLI usage help. |
| `jumpybrain help` | Print CLI usage help. |
| `jumpybrain --help` | Print CLI usage help. |
| `jumpybrain --version` | Print the installed jumpyBrain version. |
| `jumpybrain version` | Print the installed jumpyBrain version. |
| `jumpybrain -v` | Print the installed jumpyBrain version. |
| `jumpybrain instructions` | Print copyable instructions that tell coding agents when to recall, remember, and wrap up memory. |
| `jumpybrain agent-hint` | Alias for `jumpybrain instructions`. |
| `jumpybrain doctor [--root <memory-root>] [--json]` | Check whether the CLI, Node, QMD, memory root, and installed agent integrations look healthy. |
| `jumpybrain update [--dry-run] [--install-root <path>]` | Refresh the managed runtime/CLI and its installed macOS companion from the recorded source/ref. Quit the companion after **Saved** first; reopen afterward. `--dry-run` previews without changes. |
| `jumpybrain serve --root <memory-root> --host <host> --port <port> [--api-key <key>] [--public-base-url <url>] [--init]` | Start a jumpyBrain HTTP server backed by a server-local Markdown memory root. Use `--init` to initialize the root before serving. |
| `jumpybrain run memory:<recipe> ...` | Run a memory recipe command, usually from an agent integration or workspace-discovered memory root. See the `run memory:*` section below. |

## Local memory setup and status

| Command | Human explanation |
| --- | --- |
| `jumpybrain init --root <memory-root> [--force] [--json]` | Create or refresh a local memory root with `jumpybrain.json`, standard memory folders, and ignored derived state. |
| `jumpybrain status --root <memory-root> [--json]` | Check whether a local memory root is initialized, compatible, and ready to use. |
| `jumpybrain status --target-url <url> [--json]` | Check whether a remote jumpyBrain server memory target is ready to use. Requires `JUMPYBRAIN_API_KEY`. |
| `jumpybrain index --root <memory-root> [--rebuild] [--semantic-model <absolute-local-gguf> \| --lexical] [--json]` | Update derived search state incrementally; persist explicit policy or request a rebuild. |
| `jumpybrain index --target-url <url> [--rebuild] [--json]` | Update server-derived search state using its persisted policy. Requires `JUMPYBRAIN_API_KEY`; model/policy flags are server-local only. |
| `jumpybrain tree --root <memory-root> [--connections] [--show-files] [--limit <n>] [--json]` | Show a map of a local memory root: buckets, document counts, tags, index freshness, and optionally file lists and Markdown/wiki-link connections. It does not print full memory bodies. |
| `jumpybrain tree --target-url <url> [--connections] [--show-files] [--limit <n>] [--json]` | Show the same memory overview for a hosted/shared memory server. Requires `JUMPYBRAIN_API_KEY`. |
| `jumpybrain overview ...` | Alias for `jumpybrain tree ...`. |

### Indexing policy and recovery

Install **@tobilu/qmd@2.8.3** (CLI and SDK together). New/unconfigured roots default to lexical indexing. To enable semantic retrieval, provision a local embedding GGUF first:

```bash
jumpybrain index --root <memory-root> --semantic-model /absolute/models/embedding.gguf
jumpybrain index --root <memory-root>                 # reuse persisted policy/vectors
jumpybrain index --root <memory-root> --lexical       # intentionally disable semantic retrieval
jumpybrain index --root <memory-root> --rebuild       # explicit regeneration
jumpybrain index --target-url <url> --rebuild          # uses server-local policy
```

`--lexical` and `--semantic-model` are mutually exclusive; `--lexical` and `--rebuild` are valueless booleans. Policy lives in root `jumpybrain.json`, not `.jumpybrain/`. Legacy unconfigured roots may explicitly migrate with truthy `JUMPYBRAIN_QMD_EMBED` plus an absolute local `QMD_EMBED_MODEL`; environment settings are ignored once configured. Changed models and older unidentified semantic vectors require `--rebuild`.

Status/doctor report freshness, available modes, embedding coverage, and safe failures without inference/download. Search/recall warn about partial fallback or stale/incomplete state; total backend failure is an error, not “no memories.” Index JSON adds work counts (`embedded` counts chunks). `/health` is only liveness. For interrupted publication, busy locks, physically corrupt SQLite, and safe derived-state deletion, see [recovery limits](technical.md#readiness-and-recovery); `--rebuild` does not repair corrupt SQLite.

## Logseq migration (local only)

```bash
jumpybrain migrate logseq --source <vault> --root <memory-root> [--apply] [--fail-on-conflict] [--json]
```

Default is a non-mutating dry-run. Import classic Logseq `pages/**/*.md` into `notes/` and `journals/**/*.md` into `sessions/`, preserving source body bytes under a new frontmatter envelope. `--apply` explicitly writes the destination; the source stays untouched. Reruns overwrite mapped destination edits by default and delete missing-source outputs owned by the prior manifest. `--fail-on-conflict` provides a conservative destination-conflict check, not a merge.

Both paths are required; booleans accept bare flags or explicit `true`/`false`, not arbitrary strings. Remote flags are rejected before policy/credentials/network. JSON returns the app plan/result (counts, relative mappings/hashes, warnings/errors, manifest, `dryRun`, `applied`, `indexed: false`) without bodies. After successful apply, ordinary local recall/search repairs derived state automatically; run `jumpybrain index --root <memory-root>` explicitly to index immediately or configure policy. See [Logseq migration](logseq-migration.md) for limitations, asset omissions, manifest ownership, and safe reruns.

## Reading and retrieving memory

Local recall/search (including compact output and recipes) automatically repair missing/stale derived indexes. Repair, query, and verification share the finite search deadline; concurrent external changes can still produce explicitly partial evidence. Fresh recall runs no indexing worker/models. Automatic repair preserves Markdown and `jumpybrain.json` bytes/absence, uses configured policy or lexical by default, ignores legacy environment migration, and never selects rebuild or downloads models. Provision dependencies/models explicitly; incompatible models require operator intervention.

Use `--no-refresh` to skip repair and pending-publication recovery (`refresh: false` in runtime rich/compact options). This is **not a zero-filesystem-write mode**: searches retain temporary PID-lock coordination. Missing indexes and pending publication are errors; stale published evidence is labeled partial. Status/show/expand never repair. Hosted reads always use the nonrepairing path; server maintenance checks actual canonical freshness every five minutes, including external/git-pull changes. Protected remote clients never send a hidden index command.

| Command | Human explanation |
| --- | --- |
| `jumpybrain recall --root <memory-root> --topic "..." [--limit <n>] [--depth shallow\|normal\|deep] [--json]` | Retrieve prior memories relevant to a current task/topic, with snippets and provenance. Default limit is 5. |
| `jumpybrain recall --root <memory-root> --query "..." [--limit <n>] [--depth shallow\|normal\|deep] [--json]` | Ask a specific memory question and retrieve matching snippets. Default limit is 5 for `recall`. |
| `jumpybrain recall --target-url <url> --topic "..." [--limit <n>] [--depth shallow\|normal\|deep] [--json]` | Retrieve relevant memory from a hosted/shared server. Requires `JUMPYBRAIN_API_KEY`. |
| `jumpybrain recall --target-url <url> --query "..." [--limit <n>] [--depth shallow\|normal\|deep] [--json]` | Ask a specific memory question against a hosted/shared server. Requires `JUMPYBRAIN_API_KEY`. |
| `jumpybrain search --root <memory-root> --query "..." [--limit <n>] [--depth shallow\|normal\|deep] [--json]` | Search memory for a given search term or question. Default limit is 10. |
| `jumpybrain search --target-url <url> --query "..." [--limit <n>] [--depth shallow\|normal\|deep] [--json]` | Search hosted/shared memory. Requires `JUMPYBRAIN_API_KEY`. |
| `jumpybrain expand --root <memory-root> --id <mem_id> --if-match sha256:<hash> [--start-line <n> --end-line <n> \| --section-line <n>] [--max-bytes <n>] [--json]` | Read hash-checked, byte-bounded source evidence. Always JSON. |
| `jumpybrain expand --target-url <url> --id <mem_id> --if-match sha256:<hash> [--start-line <n> --end-line <n> \| --section-line <n>] [--max-bytes <n>] [--json]` | The same bounded read on a hosted server; requires `JUMPYBRAIN_API_KEY`. |
| `jumpybrain show --root <memory-root> --id <mem_id> [--json]` | Read the full Markdown document for a specific memory ID, including its content hash for safe edits. |
| `jumpybrain show --target-url <url> --id <mem_id> [--json]` | Read a full memory document from a remote server by ID. Requires `JUMPYBRAIN_API_KEY`. |

Retrieval depth changes what kind of memory is favored:

- `--depth shallow` favors compressed/current memory such as pages and decisions.
- `--depth normal` balances current memory with evidence. Both normal and shallow prefer relevant `dream: true` maps, with a bounded supplemental lexical candidate collection; reindex to refresh it.
- `--depth deep` allows more raw session evidence to surface without the dream boost. Explicit source/historical queries also omit that boost. Unrelated dream pages must not dominate; roots without dream pages retain ordinary retrieval.

### Strict read-only retrieval

Add valueless `--read-only` to local/hosted recall/search, compact output or recipes (`readOnly:true` in runtime). Unlike `--no-refresh`, it performs **no derived-state writes**, including temporary locks/schema/cache. It uses the same pinned QMD engine's lexical functions on immutable read-only SQLite, not models. It requires an existing closed published generation and refuses locks (even abandoned ones), pending publication, nonempty WAL, corrupt/mismatched or concurrently changed indexes. Ask authorized maintenance to recover/checkpoint/rebuild outside strict mode; no fallback silently writes. It reports partial `read_only_index` and, on semantic-capable indexes, `read_only_lexical_fallback`. It is not a filesystem snapshot. Remote clients first inspect observational status capability; older servers require upgrade before retrieval is attempted.

Keyword fallback is likewise explicit: only successful strict discovery with no eligible candidates can use up to two meaningful lexical singleton queries in **spare** slots of the existing eight-call budget. Quotes, exclusions, paths/identifiers and Boolean constraints suppress relaxation, vector discovery and token-only temporal backfill; skipped semantic work reports `query_constraints_lexical_only`. `keyword_query_relaxed` marks partial-topic evidence, not a complete answer; unrelated partial matches/noise can still occur. Strict successful retrieval remains unchanged.

### Explicit temporal retrieval

Search, recall, and their `run memory:*` recipes accept these optional flags on local or remote targets, with either rich or compact output:

| Flag | Contract |
| --- | --- |
| `--from <date>` | Inclusive evidence-date lower bound. |
| `--to <date>` | Date-only upper bound includes the whole UTC day; timezone-explicit timestamp upper bound is exclusive. |
| `--reference-date <YYYY-MM-DD>` | Explicit UTC anchor required for any `t-Nd` bound; never inferred from the current clock. |
| `--order relevance\|chronological` | Default relevance within the scope; chronological orders evidence oldest first. Chronological alone is permitted. |

```bash
jumpybrain recall --root <memory-root> --query "release decision" --from t-7d --to t-0d --reference-date 2025-01-08 --order chronological
jumpybrain run memory:search --target-url <url> --query "release decision" --from 2025-01-01 --to 2025-01-08 --compact
```

Use real ISO calendar dates or timezone-explicit ISO timestamps with at most three fractional-second digits (millisecond precision). Natural-language dates in the query do not create filters. Any temporal flag enables strict parsing: malformed/missing values, unknown/repeated flags, and valued booleans fail before credentials. An empty/reversed resolved interval is invalid.

The scope is **document evidence time**, not fact-validity time or last modification. Valid explicit `date` wins; recognized dated session filenames are the conservative fallback. Invalid explicit dates are not replaced by filename/creation dates. Undated syntheses do not acquire dates from filenames; creation/import/mtime never establishes evidence time. Date-bounded retrieval excludes unknown dates; chronological-only retrieval can retain them. Inspect returned coverage and partial/stale warnings: bounded discovery and result limits are not exhaustive corpus coverage, and newest is not necessarily correct.

Rich JSON adds `temporal: { interval, coverage }` and evidence-date provenance. Plain output shows the resolved half-open UTC interval, evidence-date basis, explicit `conflicts_with`/`supersedes` declarations and warnings; declarations are not adjudicated truth. New clients reject servers that omit or mismatch the requested resolved interval, with upgrade guidance and no unfiltered fallback.

### Compact recall/search and conditional expansion

Add `--compact [--max-bytes <n>] [--diagnostics]` to any `recall` or `search` command, locally or remotely:

```bash
jumpybrain recall --root <memory-root> --query "<question>" --compact --max-bytes 8192
jumpybrain search --target-url <url> --query "<question>" --compact --diagnostics
```

Successful compact and `expand` output is always `JSON.stringify(packet) + "\n"`: one compact JSON object plus one LF, with no banners, even without `--json`. Legacy text and non-compact `--json` output are unchanged. `--compact` and `--diagnostics` take no value; search/recall reject `--max-bytes` or `--diagnostics` without `--compact`.

`--max-bytes` is an integer from **1024 to 65536**, default **8192**. It caps actual serialized UTF-8 bytes, not tokens, including the entire successful packet envelope, diagnostics, JSON escaping, and final LF. HTTP headers and error packets are outside this cap. Diagnostics compete with evidence for space; oversized recall passages are omitted rather than shortened.

Compact packets contain `passages`, citations, `readiness`, `retrieval` warnings, and candidate-relative `omitted` counts. Their `partial: true` means selected evidence, not a complete answer/document. The existing `date` describes only valid creation metadata (`basis: "written"`), otherwise `basis: "unknown"`. An explicit temporal request adds the resolved `temporal` envelope, separate passage `evidenceDate`, and optional declared `relationships`, all inside the same byte budget. Without temporal flags, these additions are absent. Changed source frontmatter/body-start coordinates or incomplete headers during verification cause candidate omission and a partial `source_changed` warning, including ID-less sources. Fix malformed headers, refresh the index and retry. See the [packet contract](shared-memory-protocol.md#post-memoriesallrecallcompact).

Answer from sufficient passages. For an evidence gap, narrow the query or expand the relevant lines/section on the **same target**, using an available passage's `expansion.id` and `expansion.expectedContentHash`, never a QMD hit ID:

```bash
jumpybrain expand --root <memory-root> --id <mem_id> --if-match sha256:<hash> --start-line 20 --end-line 40
jumpybrain expand --target-url <url> --id <mem_id> --if-match sha256:<hash> --section-line 25
```

Lines are inclusive, 1-based, and include frontmatter. Omitted start/end bounds default to the document's first/last line; no range requests the whole document scope, still byte-bounded. `--section-line` selects the body anchor's enclosing heading section (including subsections) and cannot combine with line bounds. `text` preserves exact whole lines; cite actual `startLine`/`endLine`, not requested bounds. `partial`/`omittedLines` concern only the requested scope. Continue a partial response with `--start-line <continuationLine> --end-line <requestedEndLine>` and the **same hash** (not `--section-line`). A bounded section prefix may not reach the anchor.

Stale hash/source means refresh recall and reassess evidence, not bypass the precondition. Missing/duplicate IDs never authorize stamping or repair during reads. Unavailable expansion can require a narrower query or an explicitly authorized source refresh; unsupported servers fail with upgrade guidance, **without full-document fallback**. A minimum envelope or first whole line that cannot fit is an error; increase the budget within its bounds or choose another range. `show` remains the explicit whole-document read for editing or broader context, with no range flags.

## Writing and editing memory

Creation JSON preserves existing fields and adds `saved:true`, canonical `id`/`file`, compatibility `indexed`, and `indexing.status: indexed | pending | failed`. Local remember uses nonpersisting freshness after publication and verifies the saved identity is covered; memories excluded by configured `indexRoot` remain pending with explicit scope guidance. Wrapup/hosted writes defer indexing. Saved/index-failed creation exits **0** with explicit partial-success diagnostics; repair indexing for the same root/target, never recreate the memory. Validation/publication errors still fail. Hosted late replay-storage failure also retains identity (`creation_replay_failed`) but warns that reusing the creation key may not be safe. Lost responses/crashes remain uncertain and are never automatically retried.

| Command | Human explanation |
| --- | --- |
| `cat memory.md \| jumpybrain remember --root <memory-root> --type <type> --title "..." [--tag <tag>] [--json]` | Store a new durable memory from stdin. Types include `note`, `finding`, `decision`, `preference`, and `page`; add `--dream` for a dream-marked page. Local writes are indexed automatically. |
| `cat memory.md \| jumpybrain remember --target-url <url> --type <type> --title "..." [--tag <tag>] [--json]` | Store a new durable memory on a hosted/shared server. Requires `JUMPYBRAIN_API_KEY`. Remote writes mark the server index stale until the next index run. |
| `cat wrapup.md \| jumpybrain wrapup --root <memory-root> --title "..." [--topic "..."] [--limit <n>] [--tag <tag>] [--json]` | Write an end-of-session wrapup from stdin. If `--topic` is provided, jumpyBrain first recalls related memory and prints it before writing. |
| `cat wrapup.md \| jumpybrain wrapup --target-url <url> --title "..." [--topic "..."] [--limit <n>] [--tag <tag>] [--json]` | Write an end-of-session wrapup to hosted/shared memory. Requires `JUMPYBRAIN_API_KEY`. |
| `cat revised.md \| jumpybrain update --root <memory-root> --id <mem_id> --if-match <contentHash> [--json]` | Replace a whole local memory document safely. Get `<contentHash>` from `jumpybrain show`; the update fails if someone changed the document in between. |
| `cat revised.md \| jumpybrain update --target-url <url> --id <mem_id> --if-match <contentHash> [--json]` | Replace a whole remote memory document safely. Requires `JUMPYBRAIN_API_KEY`. |

Deprecated forms:

| Deprecated command | Use instead |
| --- | --- |
| `jumpybrain note ...` | `jumpybrain remember ...` |
| `jumpybrain run memory:note ...` | `jumpybrain run memory:remember ...` |

## Retrieval execution limits

Local search/recall (including compact) defaults to a 60-second whole-operation deadline, local index to 600 seconds. Override using `JUMPYBRAIN_SEARCH_TIMEOUT_MS` / `JUMPYBRAIN_INDEX_TIMEOUT_MS` (positive integer milliseconds). `serve` uses the same server-owned environment controls; remote requests cannot set backend deadlines. Remote transport defaults to 70-second reads / 610-second indexing. Local index/search/compact SIGINT/SIGTERM cancels queued/active owned work before exiting. Depth still describes evidence shape, not effort. Overload/deadline errors are actionable failures, never “no memories”; see [all bounds and platform limits](technical.md#bounded-retrieval-execution).

## Processing and maintenance

| Command | Human explanation |
| --- | --- |
| `jumpybrain process --root <memory-root> --mode lint [--topic "..."] [--since <date\|Nd\|Nw>] [--limit <n>] --apply [--json]` | Write a unique support report of deterministic checks and evidence-bearing answer candidates, never question resolutions. |
| `jumpybrain process --root <memory-root> --mode synthesize --topic "..." [--since <date\|Nd\|Nw>] [--limit <n>] [--if-match <contentHash>] --apply [--json]` | Create or safely refresh an owned extractive source map under `pages/`; no model or reviewed semantic synthesis. |
| `jumpybrain process --root <memory-root> --mode ensure-ids --apply` | Stamp missing `mem_<uuid>` document IDs onto older canonical Markdown files so they can be edited safely by ID. |

`process` is local/server-side only. It is not exposed through the remote client CLI in remote V1. All modes require `--apply`, `--apply true`, or `--apply=true`; omitted/false apply refuses to run, rather than previewing. Malformed values and repeated `--apply` flags (including mixed spellings) fail.

Lint preserves each run under `.jumpybrain/reports/`. JSON includes `runId`, `issueCount` (zero when clean), structured `issues` with code/severity/evidence/rationale, and `scope`: total, eligible, inspected, candidate-document counts and invocation bounds. Topic/since/limit bound inspection, not the full-corpus comparisons or candidate search. Defaults are 100 inspected documents for lint and 8 sources for synthesis. `--since` uses metadata recency (`updated_at`, then `created_at`, then `date`), not inferred event dates. Provenance checks recognize canonical Markdown/reference/wiki links and ID targets regardless of source-section heading; valid links do not establish claim support. Answer candidates carry bounded passages and rationale; returning no candidate means abstention, not proof that a question is unanswered.

Synthesis cites topical source excerpts and original lines, excluding pages and boolean `dream: true` outputs as primary evidence. It refuses human/dream/user-reviewed or different-topic collisions. Updates require a process-owned page with matching topic, `type: page`, and a valid unique ID; existing metadata and creation time are retained. `--if-match` optionally checks the destination hash from `show`; even without it the operation snapshots and rechecks the destination. Unchanged excerpts and cited metadata return `applied: false`, `modifiedCount: 0`, and no files, preserving bytes/timestamps. No topical passage means no page write. Unsafe destinations are rejected; [canonical write safeguards](memory-format.md#document-edit-contract) are not locks against arbitrary external editors. Index separately after canonical changes.

## Dreaming / consolidation workflow

`dream` is a stateless, read-only request for bounded evidence, not an AI call, stored queue, or completion transaction. Use the optional [how-to-dream skill](../skills/how-to-dream/SKILL.md) for the review loop.

```bash
jumpybrain dream --root <memory-root> --from t-0d --days 3 --out packet.json
jumpybrain dream --root <memory-root> --from t-1d --days 3 --json
jumpybrain dream --root <memory-root> --from 2022-05-01 --days 3 --json
jumpybrain dream --target-url <url> --from t-0d --days 3 --json
```

| Flag | Meaning |
| --- | --- |
| `--from t-Nd\|YYYY-MM-DD` | Newest included UTC date; default `t-0d` (today). |
| `--days <n>` | Positive bounded number of inclusive calendar dates; default 3. `t-1d --days 3` means T-1, T-2, T-3. |
| `--date-basis evidence\|modified` | Default `evidence`: valid frontmatter `date`, dated journal filename, valid `created_at`/`createdAt`, then mtime. `modified` selects filesystem modification dates instead. |
| `--offset <n>` | Nonnegative request-local continuation offset; default 0. |
| `--max-files <n>` | Bound included files. |
| `--bytes-per-file <n>` | Bound each returned body. |
| `--max-total-bytes <n>` | Bound total returned body bytes. |
| `--out <path>` / `--json` | Write a JSON packet to a client-side file / print JSON. Keep private packets out of version control. |

Relative dates resolve once per request in UTC. Packet `window` contains `from` (oldest), `to` (newest), `timezone: "UTC"`, and `dateBasis`; CLI `--from` is the newest anchor, not packet `window.from`. For `nextOffset`, repeat the same bounds with `--offset` and use `window.to` as an absolute anchor. Concurrent edits may shift offsets: this is not a snapshot or exact coverage claim.

Inspect warnings, `diagnostics`, missing IDs/path provenance, truncation, and overflow. Each file's `dateConfidence` is `declared` (frontmatter date), `filename` (recognized journal date), `fallback` (creation/mtime), or `modified`; these describe provenance, not verified event dates. Returned-file diagnostics take priority; root-wide date issues are summarized by counts, including outside-window counts. The serialized warning array is capped at 16 KiB/100 entries, each string at 1 KiB, with omitted/truncated counts—not a total packet-size or scan-cost cap. See the [packet contract](shared-memory-protocol.md#get-memoriesalldreamwindow).

Inspect import bursts explicitly: page the evidence window with `nextOffset`, or choose `--date-basis modified --from <modification-UTC-day> --days 1`. Preserved mtimes may differ from import/creation dates. Do not infer event dates from ambiguous filenames or migration `updated_at`. Empty/narrowed windows and final offsets do not prove corpus coverage; historical windows cannot find every later edit. Dream-marked pages are excluded as primary sources; recall/search/show finds related pages outside the window. No source IDs or support state are written, and repeated calls may return the same evidence.

Confirm the target, allowed page writes/indexing, and budget; inspect relevant existing pages before choosing an update, new page, or useful no-op. After authorized review, create a page from **body only**, or show then update an existing dream page with **full Markdown**:

```bash
jumpybrain remember --root <memory-root> --type page --dream --title "Topic map" < body.md
jumpybrain show --root <memory-root> --id <mem_id> --json
jumpybrain update --root <memory-root> --id <mem_id> --if-match <contentHash> < revised.md
jumpybrain index --root <memory-root>
```

Updates preserve an omitted dream marker; explicit boolean `dream: false` removes it. Keep source/human-authored pages intact in ordinary dreaming (workflow guidance, not an ACL). Use the same `--target-url` for remote reads/writes/indexing and require explicit remote-write authorization.

**Legacy compatibility:** CLI `--status`, `--complete`, `--abandon`, `--force`, and `--apply-manifest` fail with deprecation guidance. There is no completion step. Legacy runtime/HTTP batch APIs remain for compatibility and old state is untouched, but default CLI dreaming ignores it. Servers lacking the window endpoint fail clearly; the client never falls back to batch creation.

## `run memory:*` recipe commands

These commands route to the same memory handlers as the top-level commands. They are convenient for installed agent skills/extensions because they can discover a local memory root from the current workspace.

| Command | Human explanation |
| --- | --- |
| `jumpybrain run memory:status [--root <memory-root>] [--json]` | Check memory root status. |
| `jumpybrain run memory:index [--root <memory-root>] [--rebuild]` | Update the derived index; same policy/rebuild options as top-level `index`. |
| `jumpybrain run memory:tree [--root <memory-root>] [--connections] [--show-files] [--limit <n>] [--json]` | Show a memory overview tree. |
| `jumpybrain run memory:overview ...` | Alias for `jumpybrain run memory:tree ...`. |
| `jumpybrain run memory:search --query "..." [--root <memory-root>] [--limit <n>] [--depth shallow\|normal\|deep] [--json]` | Search memories for a given query. |
| `jumpybrain run memory:recall --topic "..." [--root <memory-root>] [--limit <n>] [--depth shallow\|normal\|deep] [--json]` | Retrieve memories relevant to a current topic. |
| `jumpybrain run memory:recall --query "..." [--root <memory-root>] [--limit <n>] [--depth shallow\|normal\|deep] [--json]` | Retrieve memories for a specific question. |
| `jumpybrain run memory:expand --id <mem_id> --if-match sha256:<hash> [--root <memory-root>] [--target-url <url>] [--start-line <n> --end-line <n> \| --section-line <n>] [--max-bytes <n>] [--json]` | Read bounded source evidence; same contract as `expand`. |
| `jumpybrain run memory:show --id <mem_id> [--root <memory-root>] [--target-url <url>] [--json]` | Show a full memory document by ID. |
| `cat revised.md \| jumpybrain run memory:update --id <mem_id> --if-match <contentHash> [--root <memory-root>] [--target-url <url>] [--json]` | Safely replace a whole memory document by ID. |
| `jumpybrain run memory:process --mode lint\|synthesize\|ensure-ids [--topic "..."] [--root <memory-root>] [--since <date\|Nd\|Nw>] [--limit <n>] [--if-match <contentHash>] --apply [--json]` | Run local memory processing with the same mode-specific bounds and safeguards as `process`. |
| `cat memory.md \| jumpybrain run memory:remember --type <type> --title "..." [--root <memory-root>] [--tag <tag>] [--json]` | Store a new durable memory from stdin. |
| `cat wrapup.md \| jumpybrain run memory:wrapup --title "..." [--topic "..."] [--root <memory-root>] [--limit <n>] [--tag <tag>] [--json]` | Write an end-of-session wrapup from stdin. |

`memory:recall` and `memory:search` also accept `--compact [--max-bytes <n>] [--diagnostics]`.

Remote recipe commands also accept `--target-url <url>` where the underlying top-level command supports remote targets, and require `JUMPYBRAIN_API_KEY`.
