# jumpyBrain Memory Format

Markdown is canonical. You can write these files manually in Obsidian or any code editor.

## Suggested root layout

```text
memory-root/
  jumpybrain.json     # committed setup/schema metadata
  notes/
  sessions/
  findings/
  decisions/
  preferences/
  pages/              # topical/current-state synthesized memory
  .jumpybrain/        # derived/rebuildable; do not edit
```

Create this layout with:

```bash
jumpybrain init --root ./memory
```

`jumpybrain.json` lets future CLIs detect incompatible memory-root schema changes before writing or indexing. Markdown files remain the canonical memory content. Derived state under `.jumpybrain/`, including remote index state and legacy dream batch metadata, is operational support data rather than memory. Stateless dream windows do not create or modify dream state.

For repo dogfooding, `jumpybrain.json` may include an optional relative `indexRoot`, such as `".."`, so the derived recall index can cover workspace Markdown while new memories are still written under `memory/`.

## Frontmatter

Supported fields are intentionally simple. A typical canonical jumpyBrain document uses:

```md
---
id: "mem_550e8400-e29b-41d4-a716-446655440000"
type: "finding"
title: "QMD should be the first index primitive"
source: "manual"
session_id: "optional-session-id"
created_at: "2026-06-02T12:00:00.000Z"
updated_at: "2026-06-02T12:00:00.000Z"
confidence: "user-reviewed"
tags: ["memory", "qmd"]
---

# QMD should be the first index primitive

Durable memory text here.
```

Useful `type` values: `note`, `session`, `finding`, `decision`, `preference`, `page`. `note` remains a memory type; the CLI write command is `remember`.

Schema notes:

- Every canonical memory document in `notes/`, `findings/`, `decisions/`, `preferences/`, `sessions/`, and `pages/` should include a file-level `id`, e.g. `id: "mem_<uuid>"`. Local writers, remote writers, synthesized pages, wrapups, and ID-stamping maintenance all use `crypto.randomUUID()` with the `mem_` prefix for new IDs. The ID belongs to the whole Markdown file, not to blocks or line ranges.
- `session_id` is the canonical session identifier field. `sessionId` is accepted as a compatibility alias during provenance mapping.
- `confidence` is a small string status for writer provenance: `user-reviewed` for manual memories and `agent-drafted` for wrapups. Older imported/manual files may still contain numeric confidence; retrieval treats that as a legacy strength hint.
- `review` is optional and currently uses `user-review-recommended` for agent-drafted wrapups.
- `tags` should be a simple string array.
- The frontmatter parser is intentionally tiny; prefer JSON-style arrays and quoted strings over broad YAML features.

## Evidence, writing, and validity dates

Create backfilled evidence with `jumpybrain remember --root ./memory --type finding --title "Historical observation" --date 2024-02-29 < body.md` (or use an explicitly authorized `--target-url`). The local/runtime and hosted creation drafts accept the same optional string `date`. Shared strict ISO validation rejects ambiguous/impossible dates before publication; date-only values and explicit offsets remain unchanged. Writing timestamps and filename prefixes still use the current time. Omitting the field adds no evidence date, and leading frontmatter in stdin remains body text.

- `date` is an explicitly declared **document evidence date**, not an automatically verified event date or a validity interval. Use a real `YYYY-MM-DD` or timezone-explicit ISO timestamp. A multi-period map may have a declared synthesis/observation date, but that does not date every event in its body; preserve event periods and source citations in the text.
- `created_at` / legacy `createdAt` describe writing/import time. `updated_at` and filesystem mtime describe edits. Neither becomes evidence time in strict temporal recall.
- Explicit temporal search/recall uses valid `date`, otherwise a recognized `YYYY-MM-DD` / `YYYY_MM_DD` journal basename (optionally followed by a hyphen/underscore/space suffix), only under `sessions/` or `type: session`. Invalid explicit dates block fallback. Strict dreams and process-owned maps without `date` stay undated regardless of filename. Other missing/invalid dates are excluded from date-bounded recall with diagnostics; chronological-only output can retain them last.
- These strict search semantics deliberately differ from dream import-review windows (which warn while falling back through creation/mtime) and unfiltered ranking's legacy creation-date preference. No body-wide event extraction or inferred fact-validity interval is supported. See [temporal CLI options](cli-commands.md#explicit-temporal-retrieval).
- Optional `conflicts_with` and `supersedes` are string/string-array declarations referring to source IDs, paths, or titles. Preserve existing reviewed declarations rather than inferring new ones. Retrieval displays them verbatim as unreconciled metadata, does not validate their truth, and never hides older evidence because a newer note claims supersession. `conflicts_with` is also inspected by processing lint; `supersedes` is descriptive, not an automatic invalidation rule.

## Structure for selective retrieval

Use real Markdown headings (`## Scope`, for example), blank-line-separated paragraphs, and ordinary lists where useful. An inline label such as `Scope:` within a long paragraph is prose, not a heading/section boundary. No domain-specific labels or general memory template are required; strict session wrapup sections remain a separate command contract.

Keep important qualifications close to the claims they govern, and make paragraphs independently useful by stating their scope, dates, uncertainty, and source references where needed. Avoid packing unrelated claims and caveats into one giant paragraph or source line. Structure helps bounded extraction but does not guarantee that every qualification or ancestor section is returned.

Recall excerpts remain bounded at 1,000 characters; a larger compact aggregate byte budget does not lengthen them. Conditional expansion returns exact **whole lines** or a bounded prefix of a heading section, not substrings. Its envelope/JSON escaping also consume space. A first requested line too large for the maximum 65536-byte packet cannot be recovered by continuation; a section prefix may stop before the anchor. Prefer manageable source lines and meaningful paragraph/section boundaries for selective follow-ups. These are authoring recommendations, not automatic rewrites or a reason to modify imported sources during reads. See [CLI bounds](cli-commands.md#compact-recallsearch-and-conditional-expansion).

## Imported Logseq documents

[`migrate logseq`](logseq-migration.md) maps classic Logseq `pages/<relative>.md` to `notes/<relative>.md` (`type: "note"`) and `journals/<relative>.md` to `sessions/<relative>.md` (`type: "session"`). Imported journals are not wrapup documents and do not require wrapup sections. Imported Logseq pages are not synthesized jumpyBrain pages.

A new frontmatter envelope supplies file identity, filename-derived title, `source: "logseq-migration"`, source-relative provenance, timestamps, and an optional supported journal date. The complete original file is then preserved as exact body bytes, including any source frontmatter, Logseq block properties/IDs, macros, links, line endings, and final-newline state. No imported content is asserted to be user-reviewed. Assets are omitted and textual links are not rewritten.

Manifest-backed reimports preserve valid mapped document IDs and creation timestamps, but **replace destination-only edits** by default and remove exact tracked outputs for disappeared sources. This is separate from the optimistic document-edit contract below. The checksum manifest is operational ownership/audit data, not canonical memory; retain it for safe removal reconciliation. Unlike a rebuildable index, deleting it loses prior-import ownership history and cannot safely authorize deletion of arbitrary earlier imports.

## Topical pages

`pages/*.md` files hold topical maps or synthesis over lower-level memories such as sessions, findings, and decisions. They offer a starting point before raw evidence, not a guarantee of reviewed or current conclusions.

`process --mode synthesize` writes a deterministic extractive source map, not reviewed semantic synthesis or current truth. New maps use `id`, `type: "page"`, `source: "jumpybrain-process"`, `topic`, timestamps, `confidence: "agent-drafted"`, and original source links/line ranges. Only matching-topic process-owned, non-dream, non-user-reviewed pages with valid unique IDs can be refreshed; existing metadata and creation time are retained. Unchanged excerpts and cited metadata leave bytes/timestamps untouched. Source selection applies `--since` before limits to both direct and QMD-nominated sources, excludes strict dream outputs anywhere, and preserves date/confidence/relationship metadata beside bounded structural quotes. Missing/invalid selected recency metadata does not pass `--since`. Pages are canonical Markdown and are indexed like other memory files.

Provenance checks recognize inline Markdown links, full/collapsed/shortcut reference links with same-document definitions, and wiki links. Canonical targets may be relative paths (including URL-encoded Markdown paths) or valid unique file-level memory IDs; duplicate IDs stay ambiguous. A `Sources`/`Sources and continuity` heading need not match a generated template. Unused definitions, undefined shortcuts, images/embeds, and external URLs are not canonical source links. This is a lightweight recognizer, not full CommonMark validation. Missing, broken/ambiguous, and context-only references differ; even a valid source link does not establish claim entailment or independent corroboration.

### Dream pages

Dream outputs normally live in `pages/` with `type: "page"` and the strict YAML boolean `dream: true`. Classification is independent of directory; strings such as `"true"`/`"false"` and ordinary `[[dream]]` navigation links do not activate it. The marker is neither an ACL nor a truth guarantee.

Create with `jumpybrain remember --root <memory-root> --type page --dream --title "Topic map" < body.md` (body only). New dream outputs carry `confidence: "agent-drafted"` and `review: "user-review-recommended"`, not an assertion of user review. Later use `show --id ... --json` and `update --id ... --if-match ...` with full Markdown. Stable IDs and normal timestamps stay intact; updates preserve an omitted dream marker, while explicit boolean `dream: false` removes classification. Index after edits to refresh retrieval, including its bounded lexical dream-candidate collection.

Keep pages concise, with dated claims, uncertainty/contradictions, and readable source IDs/relative links. A simple body line such as `Evidence period: 2022-04-29 … 2022-05-01 (UTC)` records evidence age without changing creation time. Preserve prior useful evidence; a summary does not independently corroborate its sources. Source notes/journals and non-dream human-authored pages should remain untouched during ordinary dreaming, by workflow convention rather than new write restrictions.

Normal/shallow retrieval prefers relevant dream maps; deep and explicit source/historical queries omit the dream boost. New page timestamps must not make old claims appear current. Roots without dream pages still retrieve ordinary pages and source evidence.

Dream source windows exclude dream-marked pages; use recall/show for related context outside the window. Default evidence dates prefer valid frontmatter `date`, a recognized dated journal filename, valid `created_at`/`createdAt`, then mtime with fallback warnings—not migration `updated_at`. Modified-date windows explicitly select mtime instead. Packet-only `dateConfidence` (`declared`, `filename`, `fallback`, or `modified`) describes that provenance, not verified event dates or new canonical metadata. Inspect fallback-dated imports explicitly; do not invent dates from ambiguous filenames. Missing-ID sources are returned with paths without stamping IDs; editing still requires normal document identity checks.

## Document edit contract

Document editing is ID-addressed. A document ID identifies the stable Markdown file; it is not a block ID, line ID, title slug, or path alias. Existing canonical files that predate IDs can be stamped by the explicit `process --mode ensure-ids --apply` maintenance operation.

Concurrency tokens are `sha256:<hex>` content hashes computed over the exact Markdown file bytes as read from disk, including frontmatter delimiters, frontmatter order, body text, whitespace, and final newline state. Agents should treat the hash as opaque and refresh it with a read/show operation before retrying a failed update.

The edit model is whole-document replacement of exact Markdown content. Protected structural metadata from the existing file wins over submitted content during updates: `id`, canonical `type`, `created_at`, `source`, and similar writer-owned identity/provenance fields stay stable. `updated_at` is refreshed only after a successful content update or explicit ID-stamping modification. User-editable fields such as `title`, `tags`, and body text may change when accepted by validation. An omitted `date` or `dream` preserves the existing value, including during body-only edits. Explicit submitted values replace them; `date: ""` marks evidence time unknown to temporal retrieval. Existing/imported metadata is not newly validated by editing.

Updates keep the file path stable even when the title or frontmatter changes. The ID-addressed edit API does not rename files, move memories between buckets, delete files, patch line ranges, or merge concurrent edits.

Canonical note/page/wrapup creation stages and fsyncs complete bytes before exclusive same-directory hardlink publication: readers do not see a partial final file, and existing files are never overwritten. Filesystems without hardlink support fail closed. ID-addressed updates stage/fsync then atomically rename, rechecking original bytes, ID, single-link regular-file identity, and non-symlink ancestors. Updates serialize per real root in-process; an exclusive `.<filename>.replace.lock` guards final validation/publication among cooperating processes and fails on contention. These safeguards are not filesystem compare-and-swap or protection against external writers ignoring locks; title uniqueness is not locked across processes. Quiesce concurrent filesystem writers. Directory fsync is best-effort, and crashes can leave hidden staging/locks; remove a stale lock only after confirming no writer is active.

## Session wrapup format

`jumpybrain wrapup` writes one editable `sessions/*.md` file with `type: "session"` and `source: "jumpybrain-wrapup"`. The body must contain these strict sections:

```md
## Findings
- Specific durable findings from the visible session.

## Decisions
- Decisions and rationale that should be easy to recall later.

## Conflicts / Corrections
- Duplicates, superseded assumptions, or conflicts noticed during recall.
- Use `- None captured.` if intentionally empty.

## Open Questions
- Follow-up questions or unresolved choices.
```

Wrapup files are agent-drafted and user-reviewable. `recall_topic` is included in frontmatter when `jumpybrain wrapup --topic "..."` is used.

Remote wrapups use the same strict body sections and add remote file metadata (`id` plus `source: "jumpybrain-remote"`). Remote V1 still writes a new session Markdown file; it does not patch existing files.

## Rules

- Do not put secrets, credentials, tokens, or transient chat noise in memory.
- Derived QMD/index files under `.jumpybrain/` can be rebuilt. Legacy batch APIs retain metadata-only state under `.jumpybrain/dream/` (local) or `.jumpybrain/remote/` (remote); new dream windows ignore and leave it untouched. No dreamed flags, completion ledger, or exact-coverage record is added to Markdown.
- Provenance comes from file path, line ranges, session id, and frontmatter.

## Permanent removal and recovery

Use the CLI's ID/hash-guarded `delete` preview, then explicitly apply removal of the selected document. There is no Trash, cascade, bulk delete, or automatic backlink rewrite. Preserve backups or Git history yourself: derived indexes cannot restore canonical Markdown. Restore the intended file from your backup without overwriting a newer owner, check its ID for uniqueness, then index the same root/target.

Removal returns a separate pending/failed indexing outcome; reconcile indexing without retrying deletion. An index racing removal can publish an explicitly stale generation; after successful incremental reconciliation the removed file is absent from ordinary, dream, and temporal retrieval. Surviving links remain unchanged and may become broken provenance. Lost responses require inspection of current canonical state before deciding what happened. Cooperating locks protect mutation, but identical-ID/content recreation between reads and external writers ignoring locks remain limitations.
