# Obsidian folder preservation

Keep familiar vault organization when importing Markdown into `notes/`.

Completed: confirmed the existing literal folder mapping, made it explicit in CLI summaries and the import guide, and added integration coverage for deep folders and duplicate basenames. No migration-engine change was required.

- [x] Confirm existing recursive discovery and literal path mapping; no storage redesign is needed.
- [x] Make folder preservation explicit in CLI output and import guidance.
- [x] Verify deep folders and duplicate note names survive preview, apply, canonical lookup and unchanged reruns.
- [x] Record verification and limits and archive this list with scoped changes for commit.

## Scope and limits

Preserve paths of imported Markdown, including vault-root notes. Empty folders, attachments and hidden support files are not imported. This task does not add a folder-tree browser, Obsidian plugin compatibility or link rewriting.

## Relevant files

- `src/cli/migrate.ts`
- `docs/obsidian-migration.md`
- `test/obsidian-migration.test.js`

## Verification

Tested snapshot: `cb09f3974bb800a78fa3eb28e4aef73bf36afb6c` plus this task's CLI wording, documentation and test changes; starting working tree was clean.

- `npm run build` passed.
- `node --test test/obsidian-migration.test.js test/logseq-migration-cli.test.js test/logseq-migration-policy.test.js test/logseq-migration-safety.test.js` passed: 49 tests, zero failures or skips.
- New coverage checks explicit expected paths, distinct stable note identities through unchanged reruns, ID/title reads, exact imported bodies, no source mutation, and omission of empty/attachment-only folders.
- `git diff --check` passed.

No browser, packaged-distribution or semantic-model smoke was run: this changes CLI copy/docs and adds coverage over existing migration behavior. No installation, release or push was performed.
