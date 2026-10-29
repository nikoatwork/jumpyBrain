# App writing module docs

## Responsibilities

- Local and remote note creation share `MemoryNoteDraft`, including optional `date`. Both render it through core evidence-date validation before publication; omission adds no date. Filename prefixes and creation/edit timestamps retain current writing time; body frontmatter is never metadata input.

- Own local filesystem write workflows for notes and session wrapups.
- Compose core Markdown rendering, metadata policy, memory-root compatibility, and safe file creation.
- `writeUniqueMarkdownFile` exclusively stages/fsyncs complete bytes in the destination directory, then publishes via an exclusive same-directory hardlink and removes staging. Readers never see a partially written final Markdown file; existing files (including symlink filenames) are never overwritten. Preserve the unsuffixed name plus 20 timestamp/index collision retries. Unsupported hardlinks fail closed, never fall back to copy or overwrite-capable rename. Directory fsync is best-effort.
- Callers resolve the memory root first. Creation rejects symlink/special directory components, creates missing directories one at a time, and rechecks their identities before publication; base names must be single filename components. Handled failures clean owned staging when paths remain accessible. Crashes can leave hidden staging (or a complete published file); hostile external ancestor swaps can evade final checks/cleanup. This is not a sandbox or a perfect filesystem CAS.
- Local and remote note drafts accept optional boolean `dream`; both can create `type: page` in `pages/`. Render the marker as a YAML boolean, omit it when absent, and reject nonboolean API values rather than coercing them. IDs and timestamps remain writer-owned. New dream-marked outputs use agent-drafted confidence and recommend review; agent synthesis must not silently claim user review.
- CLI creation uses body-only stdin: `jumpybrain remember --root <root> --type page --dream --title "Topic map" < body.md`. `note` is the retired command name, and leading frontmatter in stdin is body text, not creation metadata. Remote callers use the same draft through the notes POST route.
- Creation returns canonical `id`/root-relative `file`, `saved: true`, compatibility `indexed`, and shared `indexing.status: indexed | pending | failed`. App writers publish only and return `pending`; local CLI `remember` attempts the nonpersisting shared freshness workflow, while wrapup/hosted creation defer it. Post-publication derived-index/bookkeeping failure becomes `failed` partial success; a stale concurrent generation is `pending`, not misleading `indexed` success; validation/publication errors still throw. Safe diagnostics exclude arbitrary backend messages and advise indexing the same root/target, never recreating the saved memory. No canonical retry or durable indexing queue is added; later shared freshness/maintenance can recover.
- Local/remote document updates leave derived state stale. After edits, run `jumpybrain index` for the selected root/target or let local ordinary recall repair automatically; there is no dream completion transaction.
- Keep remote append-only server writes in `remote-writer.ts`; import them directly from server-memory, not through the local writing barrel.
- Allow blank (including whitespace-only) bodies only for remote `note` creation, supporting browser quick capture through the existing POST workflow. The caller supplies the title (server-memory allocates numbered daily titles for browser quick capture); the writer creates a title heading by default, with an internal heading override for the daily capture writing prompt, plus a unique document ID and normal metadata. This override is not a caller-supplied HTTP draft field. Findings, decisions, preferences, session wrapups, and local CLI writes retain their existing body validation.
- The server-memory reference find-or-create operation can opt into a blank remote `page` through the internal `emptyReferencePage` writer option. It retains the requested safe literal title, heading and standard metadata under `pages/`. Ordinary notes POST drafts do not expose this option and still reject blank page bodies.

## Non-responsibilities

- Do not parse CLI flags, HTTP requests, or idempotency headers.
- Do not implement pure Markdown/frontmatter policy that belongs in core writing.
- Do not expose remote writer helpers through the local runtime/package surface.

## Declared actors

Note creation accepts optional `{kind:"human"|"agent",id?,name?}` `actor`; omission means unknown, regardless of CLI, source, confidence or folder. Both writers stamp canonical creator/last-editor declarations and revision digest before atomic publication. Session wrapup records an agent declaration for the automated session-writing operation; deterministic process output declares the processing agent. Dream callers should explicitly declare their agent on remember/update. Imported historical files are not backfilled. See [memory format](../../../docs/memory-format.md#declared-creator-and-last-editor).

- `createFocusStarterPage` is a narrow explicit desktop onboarding writer, exported through runtime. It uses the existing exclusive Markdown publication helper, normal IDs/timestamps and core rendering to create a settled Today page with 10/5/5 checkboxes. It does not initialize a root, index, schedule, discover existing starters, or own pins. The desktop caller limits it to fresh local-brain creation; this is not a template registry or a CLI initialization default.
