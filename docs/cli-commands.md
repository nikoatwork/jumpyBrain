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
| `status`, `tree`/`overview`, `search`, `recall`, `show` | `index`, `remember`, `wrapup`, document `update`, and remote `process` |
| `dream` (stateless window read) | Deprecated batch mutation flags remain rejected |
| Matching `run memory:status/tree/overview/search/recall/show` recipes | Matching mutation recipes and future unclassified remote operations |

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
| `jumpybrain index --root <memory-root>` | Rebuild the derived search index from canonical Markdown memory files. Run this after manual Markdown edits or document updates when you need fresh recall/search. |
| `jumpybrain index --target-url <url>` | Ask a remote server to rebuild its derived search index. Requires `JUMPYBRAIN_API_KEY`. |
| `jumpybrain tree --root <memory-root> [--connections] [--show-files] [--limit <n>] [--json]` | Show a map of a local memory root: buckets, document counts, tags, index freshness, and optionally file lists and Markdown/wiki-link connections. It does not print full memory bodies. |
| `jumpybrain tree --target-url <url> [--connections] [--show-files] [--limit <n>] [--json]` | Show the same memory overview for a hosted/shared memory server. Requires `JUMPYBRAIN_API_KEY`. |
| `jumpybrain overview ...` | Alias for `jumpybrain tree ...`. |

## Logseq migration (local only)

```bash
jumpybrain migrate logseq --source <vault> --root <memory-root> [--apply] [--fail-on-conflict] [--json]
```

Default is a non-mutating dry-run. Import classic Logseq `pages/**/*.md` into `notes/` and `journals/**/*.md` into `sessions/`, preserving source body bytes under a new frontmatter envelope. `--apply` explicitly writes the destination; the source stays untouched. Reruns overwrite mapped destination edits by default and delete missing-source outputs owned by the prior manifest. `--fail-on-conflict` provides a conservative destination-conflict check, not a merge.

Both paths are required; booleans accept bare flags or explicit `true`/`false`, not arbitrary strings. Remote flags are rejected before policy/credentials/network. JSON returns the app plan/result (counts, relative mappings/hashes, warnings/errors, manifest, `dryRun`, `applied`, `indexed: false`) without bodies. After successful apply, run `jumpybrain index --root <memory-root>` separately. See [Logseq migration](logseq-migration.md) for limitations, asset omissions, manifest ownership, and safe reruns.

## Reading and retrieving memory

| Command | Human explanation |
| --- | --- |
| `jumpybrain recall --root <memory-root> --topic "..." [--limit <n>] [--depth shallow\|normal\|deep] [--json]` | Retrieve prior memories relevant to a current task/topic, with compact snippets and provenance. Default limit is 5. |
| `jumpybrain recall --root <memory-root> --query "..." [--limit <n>] [--depth shallow\|normal\|deep] [--json]` | Ask a specific memory question and retrieve matching snippets. Default limit is 5 for `recall`. |
| `jumpybrain recall --target-url <url> --topic "..." [--limit <n>] [--depth shallow\|normal\|deep] [--json]` | Retrieve relevant memory from a hosted/shared server. Requires `JUMPYBRAIN_API_KEY`. |
| `jumpybrain recall --target-url <url> --query "..." [--limit <n>] [--depth shallow\|normal\|deep] [--json]` | Ask a specific memory question against a hosted/shared server. Requires `JUMPYBRAIN_API_KEY`. |
| `jumpybrain search --root <memory-root> --query "..." [--limit <n>] [--depth shallow\|normal\|deep] [--json]` | Search memory for a given search term or question. Default limit is 10. |
| `jumpybrain search --target-url <url> --query "..." [--limit <n>] [--depth shallow\|normal\|deep] [--json]` | Search hosted/shared memory. Requires `JUMPYBRAIN_API_KEY`. |
| `jumpybrain show --root <memory-root> --id <mem_id> [--json]` | Read the full Markdown document for a specific memory ID, including its content hash for safe edits. |
| `jumpybrain show --target-url <url> --id <mem_id> [--json]` | Read a full memory document from a remote server by ID. Requires `JUMPYBRAIN_API_KEY`. |

Retrieval depth changes what kind of memory is favored:

- `--depth shallow` favors compressed/current memory such as pages and decisions.
- `--depth normal` balances current memory with evidence. Both normal and shallow prefer relevant `dream: true` maps, with a bounded supplemental lexical candidate collection; reindex to refresh it.
- `--depth deep` allows more raw session evidence to surface without the dream boost. Explicit source/historical queries also omit that boost. Unrelated dream pages must not dominate; roots without dream pages retain ordinary retrieval.

## Writing and editing memory

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

## Processing and maintenance

| Command | Human explanation |
| --- | --- |
| `jumpybrain process --root <memory-root> --mode lint [--topic "..."] --apply` | Run deterministic memory checks and write a support report for issues such as stale pages, missing provenance, duplicates, conflicts, and answered open questions. |
| `jumpybrain process --root <memory-root> --mode synthesize --topic "..." --apply` | Create or update a topical synthesized page under `pages/` from existing canonical memory. |
| `jumpybrain process --root <memory-root> --mode ensure-ids --apply` | Stamp missing `mem_<uuid>` document IDs onto older canonical Markdown files so they can be edited safely by ID. |

`process` is local/server-side only. It is not exposed through the remote client CLI in remote V1.

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

Inspect warnings, fallback date bases, missing IDs/path provenance, truncation, and overflow. Empty windows are valid; historical windows cannot find every later edit. Migration `updated_at` is not used as an evidence date. Dream-marked pages are excluded as primary sources; recall/search/show finds related pages outside the window. No source IDs or support state are written, and repeated calls may return the same evidence.

After authorized review, create a page from **body only**, or show then update an existing dream page with **full Markdown**:

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
| `jumpybrain run memory:index [--root <memory-root>]` | Rebuild the derived search index. |
| `jumpybrain run memory:tree [--root <memory-root>] [--connections] [--show-files] [--limit <n>] [--json]` | Show a memory overview tree. |
| `jumpybrain run memory:overview ...` | Alias for `jumpybrain run memory:tree ...`. |
| `jumpybrain run memory:search --query "..." [--root <memory-root>] [--limit <n>] [--depth shallow\|normal\|deep] [--json]` | Search memories for a given query. |
| `jumpybrain run memory:recall --topic "..." [--root <memory-root>] [--limit <n>] [--depth shallow\|normal\|deep] [--json]` | Retrieve memories relevant to a current topic. |
| `jumpybrain run memory:recall --query "..." [--root <memory-root>] [--limit <n>] [--depth shallow\|normal\|deep] [--json]` | Retrieve memories for a specific question. |
| `jumpybrain run memory:show --id <mem_id> [--root <memory-root>] [--target-url <url>] [--json]` | Show a full memory document by ID. |
| `cat revised.md \| jumpybrain run memory:update --id <mem_id> --if-match <contentHash> [--root <memory-root>] [--target-url <url>] [--json]` | Safely replace a whole memory document by ID. |
| `jumpybrain run memory:process --mode lint\|synthesize\|ensure-ids [--topic "..."] [--root <memory-root>] --apply` | Run local memory processing. |
| `cat memory.md \| jumpybrain run memory:remember --type <type> --title "..." [--root <memory-root>] [--tag <tag>] [--json]` | Store a new durable memory from stdin. |
| `cat wrapup.md \| jumpybrain run memory:wrapup --title "..." [--topic "..."] [--root <memory-root>] [--limit <n>] [--tag <tag>] [--json]` | Write an end-of-session wrapup from stdin. |

Remote recipe commands also accept `--target-url <url>` where the underlying top-level command supports remote targets, and require `JUMPYBRAIN_API_KEY`.
