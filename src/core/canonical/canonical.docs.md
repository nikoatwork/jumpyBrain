# Core canonical Markdown docs

## Responsibilities

- Discover, normalize, parse, and read canonical Markdown memory documents from a memory root.
- Extract Markdown links and wiki links, normalize link targets and lookup keys, construct canonical-document lookups, and resolve targets without depending on graph presentation or transport code.
- ID-addressed document lookup scans only canonical memory buckets (`notes`, `findings`, `decisions`, `preferences`, `sessions`, `pages`) and returns exact file content plus a `sha256:<hex>` hash over current file bytes.
- ID-addressed document replacement keeps the root-relative file path stable, uses core protected-metadata merge policy, writes a same-directory temp file, fsyncs when practical, then renames over the canonical Markdown file.
- Keep Markdown files as the durable source of truth while derived indexes and caches remain rebuildable.
- Provide backend-agnostic helpers for app use cases and compatibility barrels.

## Non-responsibilities

- Do not write memory note or wrapup files.
- Do not import retrieval, QMD, CLI, server, HTTP, logging, or package metadata adapters.
- Do not treat derived state under `.jumpybrain/` as canonical memory.
- Do not assemble graph nodes/edges, filter graph views, or own runtime/server/HTTP graph packets.
