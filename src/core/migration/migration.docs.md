# Core Logseq migration policy

## Responsibilities

- Own pure fixed mappings (`pages/` → `notes/`, `journals/` → `sessions/`), bounded filename/title decoding, valid journal dates, metadata, hashes, reference-count diagnostics, manifest validation, and source-authoritative action planning.
- Export migration result/manifest/entry types here, not through shared transport types. Public entries contain relative mappings and metadata/hashes only, never bodies.
- Render an import-only **Buffer envelope**: UTF-8 frontmatter followed immediately by the exact source bytes. Source frontmatter, block `id::` properties, CRLF, invalid UTF-8, tabs, and final-newline state remain body bytes. Verify using `parseLogseqEnvelope`, not the general string parser (which normalizes body line endings).
- Assign new `mem_<uuid>` file identities without interpreting Logseq block IDs. Overwrites preserve valid existing destination IDs/creation times, otherwise prior import identity, otherwise new identity. Imported documents make no user-reviewed confidence claim.
- Validate the versioned `.logseq-migration-manifest.json`. Markdown remains canonical content; this manifest is **durable ownership metadata**, not a rebuildable index/cache. It authorizes identity-checked deletion of exact previously mapped paths. Back it up with Markdown; do not store it under disposable `.jumpybrain/` or delete it during index rebuilds.

## Contract

Dry-run is the default. Source wins on explicit apply: create/overwrite/delete/unchanged, with optional fail-on-conflict. Identical reruns preserve output and manifest bytes/timestamps. Source removal authorizes deletion only through a validated prior manifest plus matching destination document ID. Missing outputs are reconciled idempotently. A changed ID at a still-active path is preserved as the current document identity; a changed/missing ID at a deletion target blocks the run.

Decode percent escapes once and Logseq triple-lowbar namespaces for titles only, never destination paths. Invalid percent encodings remain literal. Unicode-normalized, case-folded mappings must be unique. Reference diagnostics are advisory counts, not graph resolution: wiki aliases/fragments are handled, but arbitrary Logseq macros, property references, Org syntax and full Markdown grammar are not interpreted.

## Non-responsibilities

No filesystem discovery/mutation, CLI parsing, app orchestration, QMD, logging, automatic indexing, asset copying, block splitting, journal append, source cleanup, reverse conversion, merging, or live/bidirectional synchronization. App must apply the safety and transaction contract before using pure planned outputs.
