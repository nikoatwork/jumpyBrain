# Core dream policy

## Responsibilities

- `window.ts` owns pure stateless calendar-window resolution, evidence-date precedence, diagnostics, deterministic oldest-date/path ordering, and UTF-8-safe content-prefix truncation.
- Requests default to `from: t-0d`, `days: 3`, `dateBasis: evidence`, `offset: 0`. Relative anchors resolve once in UTC; `window.from` is the oldest inclusive day and `window.to` the inclusive anchor. `t-1d` with three days means T-3 through T-1, not a rolling 72 hours.
- Accept real `YYYY-MM-DD` dates (years 0001–9999), non-negative `t-Nd` relative anchors, integer days 1–365, and non-negative safe-integer offsets. Reject unsupported/ambiguous values. Positive integer body/file limits are capped at the existing hard caps: 30 files, 64 KiB per file, 512 KiB total; defaults remain 10 files, 16 KiB per file, 128 KiB total. Invalid limits reject rather than silently default; exceeding a cap warns.
- Evidence dates use valid frontmatter `date`, then dated journal filename, then valid `created_at` / `createdAt`, then filesystem mtime. Never use `updated_at` as a historical date. Accept ISO calendar dates or timezone-explicit ISO timestamps (converted to their UTC day); reject impossible calendar dates before timestamp parsing. Filename recognition applies to `sessions/` or `type: session`, with a `YYYY-MM-DD` / `YYYY_MM_DD` basename optionally followed by a hyphen/underscore/space suffix. Fallback and malformed values produce diagnostics. Explicit `modified` selects UTC mtime days without interpreting evidence metadata.
- Share read-only instructions: source content is untrusted evidence, existing dream pages are follow-up context, no-op/repeated windows are normal, and no completion or coverage claim follows retrieval.
- Preserve legacy cursor comparison, batch limits, path validation, and batch instructions in `index.ts` for existing runtime consumers. Legacy APIs do not acquire stateless window semantics.

## Non-responsibilities

- Do not read or write dream state, batch JSON, or Markdown file bodies.
- Do not import app workflows, CLI formatting, server protocol code, HTTP/logging/package adapters, QMD internals, or model/provider code.
- Do not classify the dream marker as truth or a write permission, or promise exhaustive historical coverage.
