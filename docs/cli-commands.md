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
| `dream --status` | Default dream create/resume, `--complete`, `--abandon`, and `--apply-manifest` |
| Matching `run memory:status/tree/overview/search/recall/show` recipes | Matching mutation recipes and future unclassified remote operations |

Mutation flags take precedence for policy classification, so adding `--status` does not make `dream --complete`, `--abandon`, or `--apply-manifest` writable. Rejection occurs before credentials, stdin/files, wrapup recall, idempotency creation, or HTTP transport. Local roots and unlisted remote origins keep their existing behavior.

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
| `jumpybrain update [--dry-run] [--install-root <path>]` | Refresh an installer-created jumpyBrain CLI install by rerunning the public installer. `--dry-run` prints the planned update without doing it. |
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
- `--depth normal` balances current memory with evidence.
- `--depth deep` allows more raw session evidence to surface.

## Writing and editing memory

| Command | Human explanation |
| --- | --- |
| `cat memory.md \| jumpybrain remember --root <memory-root> --type <type> --title "..." [--tag <tag>] [--json]` | Store a new durable memory from stdin. Common types are `note`, `finding`, `decision`, and `preference`. Local writes are indexed automatically. |
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

`dream` gives a local agent a bounded batch of changed memory documents to review, link, and consolidate. It does not call an AI provider by itself.

| Command | Human explanation |
| --- | --- |
| `jumpybrain dream --root <memory-root> [--out dream-batch.json] [--json]` | Create or resume a local dream batch of changed Markdown memory context. Use `--out` to write full context to a JSON file. |
| `jumpybrain dream --target-url <url> [--out dream-batch.json] [--json]` | Create or resume a dream batch from hosted/shared memory. Requires `JUMPYBRAIN_API_KEY`. |
| `jumpybrain dream --root <memory-root> --status [--json]` | Show local dream cursor and open-batch status. |
| `jumpybrain dream --target-url <url> --status [--json]` | Show remote dream status. Requires `JUMPYBRAIN_API_KEY`. |
| `jumpybrain dream --root <memory-root> --complete <batch-id> [--summary "..."] [--json]` | Mark a local dream batch complete after edits were applied or intentionally skipped; this advances the dream cursor. |
| `jumpybrain dream --target-url <url> --complete <batch-id> [--summary "..."] [--json]` | Mark a remote dream batch complete. Requires `JUMPYBRAIN_API_KEY`. |
| `jumpybrain dream --root <memory-root> --abandon <batch-id> [--summary "..."] [--json]` | Clear a local open dream batch without advancing the cursor. |
| `jumpybrain dream --target-url <url> --abandon <batch-id> [--summary "..."] [--json]` | Clear a remote open dream batch without advancing the cursor. Requires `JUMPYBRAIN_API_KEY`. |
| `jumpybrain dream --root <memory-root> --apply-manifest dream-manifest.json [--json]` | Apply a reviewed manifest of document updates, then complete the dream batch. |
| `jumpybrain dream --target-url <url> --apply-manifest dream-manifest.json [--json]` | Apply a reviewed dream manifest to hosted/shared memory, then complete the batch. Requires `JUMPYBRAIN_API_KEY`. |

Optional dream batch sizing flags:

| Flag | Meaning |
| --- | --- |
| `--max-files <n>` | Limit how many files are included in a batch. |
| `--bytes-per-file <n>` | Limit bytes of content per file in a batch. |
| `--max-total-bytes <n>` | Limit total content bytes in a batch. |
| `--force` | Force creation behavior where supported by the dream workflow. |

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
