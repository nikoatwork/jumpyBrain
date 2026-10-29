# Collaborative attention sidebar

## Outcome

Completed 2026-10-29: pins stay first, Attention scrolls independently, Settled stays collapsed at the bottom, declared-editor glyphs update from current revisions, and content edits reopen settled pages. Mistral review findings were assessed and selected fixes landed.

## Goal

Keep pinned pages first, current work visible, and settled pages in a collapsed bottom section. Show the declared last editor, refresh external changes, and reopen settled pages on edits.

## Decisions

- Reference: T3 Code `apps/web/src/components/Sidebar.tsx` (upstream main inspected 2026-10-29): pinned/active partition and initially collapsed Settled shelf. No Working status in this workspace.
- Pins remain device-local and independent of settlement; canonical Markdown owns attention and attribution.
- Use revision-checked declared human/agent provenance; unknown stays unknown.
- Content edits reopen settled pages. Snooze deadlines retain their existing meaning. New settlement records a content fingerprint so untracked file edits can reopen it without a read-side write; legacy null-only settlement cannot establish a past body revision.
- Refresh while visible, with cancellation/scope guards and bounded preview work.
- User requested Mistral review; root assesses findings and fixes warranted issues.

## Tasks

- [x] Inspect sidebar, canonical policy, prior decisions and T3 implementation.
- [x] Implement sections, editor glyphs, refresh and edit-driven reactivation.
- [x] Verify canonical lifecycle, polling/scope safety and real browser layout/editor behavior.
- [x] Have Mistral review, assess findings and address warranted changes.
- [x] Update owning docs/release notes and archive for the scoped completion commit.

## Verification

- Production build: 189,383 bytes gzip for the editor, within reviewed 190 KB gate; no dependencies added.
- 36 focused canonical/attention/navigation/bundle tests pass.
- Full suite: 1,490 passed, one skipped, one installer test cancelled by its 60-second timeout. The same installer test passed alone with a 180-second allowance in 44.7 seconds. Full-suite log: `/tmp/jumpybrain-collaborative-full-tests.log`; recheck: `/tmp/jumpybrain-sidebar-installer-recheck.log`.
- Production collaborative sidebar and existing sidebar smokes pass; inspected desktop and narrow light/dark screenshots under `/tmp/jumpybrain-collaborative-sidebar-qa`. Settled remains visible beneath the scrolling attention region.
- Existing attention smoke had outdated copy/delete/link assertions from the prior toolbar redesign; aligned them with the shipped icon-only controls and current accessible labels.
- Companion scope smoke's old zero-document-read assertion conflicts with the new background sidebar preview refresh. It now checks that a wrong-brain note URL redirects to the active brain's Home without creating an editor; existing registration/generation/write guards remain asserted.
- Concurrent local dogfooding changes landed separately as `a84ed87`; this task preserves that work.

## Remaining limits

- Declared editor metadata is not authentication. Legacy/untracked edits show unknown.
- Older `attention_at: null` files lack a historical revision; supported saves reopen them, while raw-file change detection starts after a new Settle. Snoozes remain explicit until due.
- Each shelf returns at most 100 entries; Show more expands the initial eight/ten rows, then Search reaches the remaining corpus. Canonical scan input is not bounded, and fingerprinted settled notes require body reads on misses in the bounded disposable stat-keyed digest cache.
- Physical assistive technology, real OS sleep and non-Chromium browsers are not exercised by these checks.

## Mistral review assessment

Mistral Large 4 reviewed the scoped diff without editing files. No hard blockers; root assessed each finding:

1. **Accepted:** unstable settled-file snapshots must not fail the whole list. Fall back to the current metadata classification for this cycle; skip files removed during the metadata scan. Added revision-reader failure/retry coverage.
2. **Accepted:** avoid rereading every unchanged settled body on every poll. Added a 1,024-entry disposable LRU of digests keyed by file identity, size and nanosecond mtime/ctime; misses recheck before/after stat identity. Tests cover unchanged hits, edits, eviction and failed reads.
3. **Declined:** comparing against the merged title is correct for the existing whole-document save contract: omitting a previously present title actually removes it. That content change should reactivate a settled page. No title-preservation policy change was requested.
4. **Declined:** hidden rows do not render icons; shown rows hydrate through bounded reads. Showing a person/agent from unchecked frontmatter would incorrectly attribute raw external edits. Unknown until revision validation is intentional.
5. **Accepted:** omit absent preview timestamps so a newer list date survives an older/partial document response.
6. **Accepted:** attention GET now explicitly uses `Cache-Control: no-store`, covered by the HTTP test.
7. **Accepted:** capped settled counts show the known unpinned count with `+`, avoiding a false exact total when pins fall outside the returned cap.
8. **Finalization:** repair the pending changelog link by archiving this task in the same commit.
9. **Retained:** raw edits without updated timestamps follow their canonical date rather than inventing an edit/discovery timestamp. Supported writers advance edit dates.

Also preserved saved-version recognition in confirmed attention PATCH responses so settling does not temporarily erase editor context.

## Final checks

- Final focused suite: **36 passed**; architecture, runtime/document, recognition and external-update regressions: **60 passed**.
- Production collaborative sidebar, existing sidebar, canonical attention lifecycle and companion browser smoke runners all passed. The latter retains wrong-brain rejection, registration/generation fencing, failed-save barriers, read-only behavior and session recovery.
- Reviewed the final desktop collapsed shelf and light/dark narrow captures; no horizontal overflow. The attention smoke targets the nonoverlapping upper-left part of rows when revealing hover actions at narrow widths.
- Final build and tests ran against the shared working snapshot based on `a84ed87` plus this task; a concurrent page-action styling task also edited separate regions of `notes-browser.ts`. Only this task's sidebar hunks are included in its commit; other work stays intact.
- No installed app, personal memory, remote memory, push or release changed.
