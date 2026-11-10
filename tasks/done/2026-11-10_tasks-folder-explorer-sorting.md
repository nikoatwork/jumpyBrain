# Folder explorer sorting

## Goal

Answer the November 10 feedback request for folder-view sorting/filtering ("by date or name") with the smallest useful change: sort notes in the existing Folders panel by name, last edited or created date. Text filtering by title/filename/path already existed and is kept. Requested by the user on 2026-11-10 as an 80/20 pass. [Feedback ledger](../feedback.md).

## Tasks

- [x] 1.0 Return presentation-only dates from `GET /memories/all/files` (`app/server-memory/folder-explorer.ts`): declared `created_at`/`createdAt` (never inferred) and declared `updated_at`/`updatedAt`, with file mtime only when a note declares neither. Reuses the attention date parser; no index, write or body exposure.
- [x] 2.0 Model (`folder-explorer-model.ts`): validate packet dates, add `name | edited | created` orders. Folders stay first and alphabetical; notes reorder newest first; undated notes follow in natural name order; deterministic ties. Edited falls back to created, matching the Pages list. Compact age captions reuse `resultEditContext`.
- [x] 3.0 Panel (`folder-explorer.ts`, `folder-explorer-view.ts`): quiet native **Sort notes** select beside search, muted per-note age in date orders with exact date in tooltip/accessible name, device-local `jumpybrain.folderExplorerSort` preference with storage-denial fallback, narrow focus trap includes the select. Sorting composes with search and keeps disclosure state without a new request.
- [x] 4.0 Docs: protocol fields, browser folder-explorer section, pending release note, feedback ledger.

## Verification

Snapshot: master `efc5dc8` plus this change, built once with `npm run build`.

- `node --test test/folder-explorer-model.test.js test/folder-explorer-data.test.js` — 14/14 pass. New cases: date orders inside folders with folders fixed, undated/invalid dates, edit→create fallback, captions, preference validation; server declared-date precedence, creation never from mtime, mtime fallback for undated notes, invalid dates.
- `scripts/folder-explorer-smoke.mjs` extended (fixture `updated_at` values, name→edited→name order, caption, accessible name, disclosure retained, search composition, stored preference, sort/search geometry at 1280/900/390/320 light/dark, sorted capture). Hosted and companion surfaces both pass every step up to the existing failed-save block.
- The script's pre-existing failed-save step (`saveStatus === 'failed'` after intercepting document `PUT`) times out on a clean `efc5dc8` worktree as well, so it is not caused by this change; title saves appear to no longer use the intercepted PUT after the live co-editing work. The full run was therefore made with that block removed from a temporary copy (deleted afterwards); the committed script keeps it. Screenshots reviewed: 1280 dark, 320 light, sorted 'Last edited' panel.

## Remaining limits

- A note edited while the panel is open keeps its cached date/position until the next explicit open or Refresh (existing no-rescan rule for autosaves).
- No date-range or property filters; those belong to [properties and saved views](../todo/tasks-properties-and-saved-views.md). Folders are not ordered by their newest descendant.
- Each row grows by up to two ISO dates; the companion gateway's existing 16 MiB response cap still applies to very large brains.
- Native Mac app (Electron) not separately exercised; the shared panel was verified in Chromium through the real companion gateway.
- The existing failed-save smoke block needs repair independently of this change.
