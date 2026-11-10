# Seamless live co-editing

Status: complete; merged into `master` (fast-forward of `b31d944`); not pushed or released.

## Request

Check the hosted brain with several users and an agent writing to one note, and
move from "separate read/save modes" to several people editing a note at once.
Block-level locking was offered as an acceptable constraint; it was not needed.

## What was wrong (reproduced on the hosted v0.3.22 brain and locally)

Live editing, peer carets and agent streams already worked for edits in
different places. The gaps were:

- Overlapping edits threw one writer into **Changes need review**: two people
  backspacing the same text, or one replacing a paragraph while another typed
  inside it. The core transform rejected any overlap.
- Two people typing at one position interleaved letters (`22211112 1112221`).
- Renaming conflicted with a simultaneous rename, could be rejected while
  someone typed in the body, and lost a space typed before a pause
  (`Hello ` … `world` became `Helloworld`).
- Every keystroke made every connected window re-read the whole note over HTTP
  for its sidebar preview. Behind the hosted proxy's per-address limit this
  returned 429 and showed "Could not load notes" and failed searches.
- A 429 while opening a note left it at "Editing unavailable" until a manual retry.

## Changes

- `src/core/collaboration/source.ts`: `rebaseSourceSplices` is now a total
  transform (shared removals once, deletions never consume another writer's
  insertion, replacements keep their place, later publication first at one
  gap). `sourceSplicesOverlap` plus `rejectOverlap` keep rejection available.
- `src/core/collaboration/model.ts`: ordinary edits use that transform; a fully
  merged edit is an acknowledged empty transaction without an Undo step;
  `reduceCausalSourceHistory` exposes the sequential transactions a transform
  crosses.
- `src/app/collaboration/index.ts`: `overlap: "reject"` on `edit`; renames are
  last-writer-wins and independent of body revisions; peer carets stay before
  text inserted at their position, with the other side used where an inferred
  raw-file change proves only that.
- `src/cli/collaborate.ts`: positional `collaborate edit` asks for overlap
  rejection, preserving the agent contract.
- Browser: the client crosses the same sequential transactions as the backend;
  collapsed carets stay before remote insertions; the name field is not
  replaced while typing and keeps typed whitespace; the open note's sidebar
  preview comes from the live snapshot; passing list failures keep rows; note
  opening retries 429/502/503/504 briefly.

## Verification (branch tip, one build, 2026-11-10)

- Randomized transform check: 300,000 pairs and 100,000 three-way cases for
  convergence, valid splices, union of removals, survival of every insertion,
  and identical client/server results (scratch script, not retained).
- `node --test` on `test/collaboration-*.test.js`, `test/editor-*.test.js`,
  `live-wire-contracts`, `note-attention-browser`, `browser-attention`,
  `browser-page-navigation`, `browser-sidebar`, `architecture-boundaries`,
  `package-footprint`, `package-entrypoints`: 244 passed, 0 failed.
- New `scripts/collaboration-overlap-smoke.mjs`: passed twice.
- `ux-update-feedback-smoke`, `external-document-updates-smoke`,
  `browser-session-smoke`, `ux-generation-feedback-smoke`,
  `ux-editor-availability-smoke`, `ux-uncertain-save-smoke --kind accepted-body
  --width 1280`: see the results line below.
- Three-writer randomized browser editing (typing, deleting, replacing, Enter,
  Undo at random positions) on a disposable local brain: every seed converged
  with all writers Saved and the file equal to the editors.
- Hosted shared brain (dev build of this branch, three separate
  test credentials plus a CLI agent stream): same-position typing, shared
  deletion, replacement versus typing inside it, agent stream with two
  typists, concurrent renames, offline overlap and three-writer randomized
  editing all converged with everyone Saved.

Results: all six listed runners exited 0; local three-writer seeds 41, 42 and 43 (80 rounds each) converged; hosted seed 32 (80 rounds) converged.

## Limits and open points

- `scripts/collaboration-editor-smoke.mjs` stops at the restart proof
  (`runRestartIntentProof` waiting for `conflict`) and
  `scripts/collaborative-sidebar-smoke.mjs` at a settled-shelf scroll. Both
  fail the same way on unmodified `master` (checked in a separate worktree), so
  later steps of those two runners are unverified here.
- Text typed offline exactly at the end of a passage that another writer
  replaced can land after the first replaced characters. It is lossless and
  keeps a live caret beside a replaced word from jumping.
- A direct raw-file overwrite of a passage someone is editing still uses the
  existing review/recovery path; file writes carry no positions to merge.
- Chromium only; the Mac app shares the editor but was not run. Older clients
  against a newer backend (or the reverse) were not tested; equal-gap order
  changed, so client and backend should be upgraded together.
- The hosted proxy limits each address to 120 requests per minute (burst 30).
  The app now uses far fewer requests and recovers from a refusal, but several
  people behind one office address can still be throttled. The limit was left
  unchanged.
- The hosted shared brain is running this branch's build as a side-by-side
  dev release that still reports version 0.3.22; the published release
  directory is intact for rollback. Deployment details stay in private notes.
