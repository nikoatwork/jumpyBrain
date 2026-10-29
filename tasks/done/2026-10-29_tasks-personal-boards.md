# Personal boards

## Scope

Mac-only personal collections stored in application support, scoped by brain profile. Ordinary Markdown pages are cards; no Markdown changes for organization. Active boards precede notes in the sidebar. Settle archives; Settings → Boards lists all and restores archived boards. Three renamable columns, existing/new pages, drag and accessible moves. Linear-inspired restraint, existing theme tokens. No shared boards, properties, filters or hierarchy.

## Tasks

- [x] Implement versioned durable store, validation and guarded companion routes.
- [x] Implement board, sidebar and Settings flows with save/scope protection.
- [x] Test persistence, conflicts, isolation, archive/restore and native rendering.
- [x] Update docs, archive and commit.

## Architecture and verification notes

- Configuration is `<application support>/collections.json`, versioned and scoped by profile ID, kind and destination. It is durable user configuration, not memory or a rebuildable index. No public memory protocol or CLI changes.
- The board controller reuses guarded note navigation, canonical IDs, indexed search and existing idempotent note creation. Moves/archive/restore only change configuration. Cards retain membership when a page is missing or unavailable.
- Authentication, browser origin checks, generation/tab admission and explicit target identity guard the companion route. Revision conflicts never overwrite the other window. The companion switch barrier waits for board saves and page creation.
- Personal board edits are allowed for read-only remote profiles because they only change local organization; page creation retains the normal target write gate.
- Visual direction: compact columns/counts, quiet cards and hover controls, informed by https://linear.app/docs/board-layout, using existing jumpyBrain theme tokens. Narrow layouts stack the columns and expose card controls.
- Store/gateway tests and native Electron smoke passed. Real browser smoke passed with indexed existing-page selection, creation, drag/select movement, editor/Back, archive/restore, restart and canonical-byte preservation. Final full suite passed after updating the companion test dialog fixture.

## Limits

Mac personal boards only; three renamable columns. No shared/synced boards, nested organization, general properties or filtered views. Application-support backup is required to preserve board layout separately from the vault. Existing 32 KiB request bounds apply. Cross-window refresh occurs on focus/navigation and stale saves conflict. The host is the sole file writer; external concurrent edits are not coordinated. Cancelling an uncertain page-creation dialog can leave a normal page outside the board, never a deleted note. Physical assistive technology and installed-release migration remain untested.

## Completion — 2026-10-29

Implemented against `03aa596` plus this scoped diff; no installation, push or release. Preserved the separately committed Settings indicator change.

- Final TypeScript/editor build passed; ordinary editor bundle size remained unchanged by the companion-only board script.
- Final full `node --test` on that build: 1,479 passed, 1 skipped, 0 failed (1,480 tests). Earlier validation identified two outdated companion dialog mocks; fixed the fixture and reran the entire suite successfully.
- `node --test test/companion-browser.test.js test/collections.test.js`: 22 passed, including the actual authenticated gateway, read-only remote organization, stale scope/revision rejection and corrupt-store preservation.
- `npx --package=playwright node scripts/boards-smoke.mjs`: passed against a disposable real gateway, indexed existing pages and canonical writes. Tested search selection, new-page creation, drag and accessible movement, editor/Back, settle/Settings restore, reload and unchanged existing Markdown bytes.
- `node scripts/electron-smoke.mjs`: passed, including native board create/three-column/sidebar-settle flow and existing editor, starter, sandbox, feedback fixture and save/close regressions.
- Inspected captures in `/tmp/jumpybrain-boards-qa/` at 1280/390 light/dark and `.local-pack/desktop/board-native.png`; no horizontal overflow, quiet headers/counts and readable cards. No personal app/data changed.
- Staged privacy guard and whitespace checks passed.
