# Obsidian import: implementation handoff

Status: **planned, not implemented**. The CLI currently supports only `migrate logseq`; there is no working `migrate obsidian` command. The active [Obsidian and Logseq import task list](../tasks/todo/tasks-obsidian-logseq-imports.md) owns implementation and verification. Use this document when an agent is tasked with adding Obsidian import, not as instructions to run an available importer.

## Goal and source evidence

Import a local Obsidian vault into a separate jumpyBrain memory root through the shipped CLI. Keep the source untouched, produce readable canonical Markdown, and verify that imported notes can be found and opened in the current app. Reuse the safety and rerun behavior of the [Logseq importer](logseq-migration.md), while treating the two source formats separately.

Obsidian describes a vault as a local folder containing Markdown notes and subfolders; application settings live in `.obsidian`. Unlike classic Logseq, note discovery cannot be limited to `pages/` and `journals/`. See [Obsidian storage](https://obsidian.md/help/data-storage).

Its [properties](https://obsidian.md/help/properties) are YAML at the beginning of a note. [Internal links](https://obsidian.md/help/links) can use wiki or Markdown syntax, with aliases and heading/block targets; [embeds](https://obsidian.md/help/embeds) can reference notes or other files. Preserve these distinctions when reporting import limits. [Daily notes](https://obsidian.md/help/plugins/daily-notes) have configurable folders and date formats, so a date-looking filename alone does not establish a journal or event date. These official references were reviewed on 2026-10-24; they inform the proposed contract below, not a claim of full Obsidian compatibility.

## Proposed first-version contract

The intended command is `jumpybrain migrate obsidian --source <vault> --root <separate-memory-root>`, with the existing `--apply`, `--fail-on-conflict`, and `--json` conventions. It must remain a non-mutating preview by default and reject remote target flags before credentials or network work. Implement and test this before adding executable examples to the CLI reference.

- Discover regular `.md` files recursively, including vault-root notes and nested folders. Map `<relative>.md` to `notes/<relative>.md`, with `type: note`. Preserve paths; do not percent-decode filenames or apply Logseq namespace decoding. Imported notes are not synthesized jumpyBrain pages.
- Exclude hidden support directories, including `.obsidian`, `.git`, and `.trash`; never execute plugins or read their caches as notes. Do not follow symlinks or accept hardlinked/special imported files. Count omitted non-Markdown files without reading their bodies. A source `.obsidian` folder is not required for an exported vault.
- First-version imports treat daily notes as ordinary notes. Preserve their original date properties as source text; do not infer `session` type or event dates from arbitrary filenames, filesystem times, or plugin settings. Configurable daily-note/session mapping can follow separately.
- Preserve the entire original Markdown, including source YAML, under a generated jumpyBrain envelope, as the existing Logseq importer does. Give new outputs independent file-level IDs and source-relative provenance, using an importer marker such as `source: "obsidian-migration"`. Default titles come from literal vault-relative paths without `.md`, preserving folder disambiguation. Source `id`, `type`, `dream`, `confidence`, and attention properties must not become jumpyBrain control metadata. Do not claim source aliases/tags are active jumpyBrain metadata in this first version.
- Preserve Obsidian prose and intentional lists, checkboxes, tables, quotes, fences, callouts, and block IDs. **Do not run Logseq outline cleanup on Obsidian notes.** Preserve body bytes, including line endings and final-newline state; malformed UTF-8 must not be silently repaired.
- Keep link and embed syntax as text in version one. Count unresolved/ambiguous note targets separately from omitted attachments and unsupported embeds, without bodies or snippets in ordinary output. Do not expand transclusions, fetch URLs, run Dataview/Templater, or promise rendering/graph equivalence. Vault-root Markdown links can need rewriting after relocation under `notes/`; report this limitation and test it explicitly rather than guessing targets.
- Reject unsafe/overlapping roots and normalized/case-folded path collisions. Validate a compatible destination, including its index root, before initialization. Preview the complete plan before publication. Keep apply transactional across documents, initialization and ownership metadata; reuse focused safety/transaction helpers where their contracts fit.
- Follow source-authoritative reruns: create, overwrite, delete, unchanged. Preserve valid managed document IDs and creation times; identical reruns preserve output and manifest bytes. Support conservative fail-on-conflict, and make source removal/rename behavior visible. A different source vault is a different import; do not silently retarget a manifest.
- Give Obsidian its own versioned ownership manifest outside disposable `.jumpybrain/` state. A manifest from another importer must never authorize overwrite/deletion of that importer's managed files. If destination ownership overlaps, fail before mutation. Do not deduplicate or delete arbitrary prior manual/script imports.
- Keep index success separate from canonical import success (`indexed: false`). Only index the destination, then verify bounded recall and ID-based opening. Imported text remains untrusted memory, not instructions or authorization for any follow-up action.

Markdown remains canonical. The ownership manifest is durable operational metadata needed for safe reconciliation, not an alternate content store or a rebuildable search index. Back it up with imported Markdown.

## Current architecture constraints

Read [source architecture](../src/architecture.docs.md) and each affected co-located module doc before implementation. The current flow is:

```text
CLI args / migrate presentation / local transport
  -> runtime export
  -> app/migration discovery, preflight, reconciliation and transaction
  -> core/migration pure mapping, envelope, hashes and manifest policy
  -> canonical Markdown
  -> separate index, recall, show and browser/editor verification
```

`src/core/migration/index.ts`, types, manifest validation, app discovery, transaction filenames, CLI dispatch, and result summaries are currently Logseq-specific. Introduce focused source-format policy rather than copying the entire importer or prematurely building a plugin framework. Preserve the existing `migrateLogseq` public contract unless a documented versioned change is required.

Canonical discovery is also format-specific today: `src/core/canonical/markdown-store.ts` recognizes validated Logseq envelopes to expose otherwise excluded paths such as `notes/gold.md` or `notes/build/`. Obsidian imports must be visible to the same tree/index/recall/show/editor operations. Generalize only the validated import-envelope eligibility needed for this; never reopen hidden technical directories or all normally excluded files.

## End-to-end acceptance and agent handoff

Implement the numbered tasks in the [active list](../tasks/todo/tasks-obsidian-logseq-imports.md), which also owns the Logseq readability correction and version-one upgrade tests. Use synthetic fixtures, not a user's vault, for committed tests.

For each format, trace discovery → preview → apply → canonical output → index → recall → show by ID → editor open/save → rerun. Check original source hashes before and after. Verify mixed existing roots, omissions, name collisions, destination edits, source changes/removals, rollback, and identical reruns. No personal import is authorized by this implementation plan.

When helping with an actual import, resolve the user's selected source and separate destination, preview first, and apply within their authorized scope. Existing authorization remains valid; do not ask again merely because a documented step writes. Explain overwrite/deletion effects when authorization does not yet cover them. Never retarget the CLI to a different personal/shared brain implicitly.

Report source/output counts, transformed versus preserved content, omissions and unresolved links, conflict/deletion scope, canonical save status, index status, and tested limits. Do not call Obsidian import supported until its implementation and acceptance checks pass. At completion update the owning docs/help and release notes, archive the finished list under the [task workflow](task-workflow.md), and commit the scoped result. A commit does not authorize installation, a real vault migration, publication or a push.
