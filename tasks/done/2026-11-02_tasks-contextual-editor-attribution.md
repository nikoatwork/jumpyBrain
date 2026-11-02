# Contextual editor attribution and client naming

Completed 2026-11-02: removed sidebar actor glyphs, added explicitly scoped selection attribution, and delivered shared Mac/CLI owner naming through HTTP and live saves.

## Outcome

Keep the note sidebar focused on navigation. Make it easy to discover who last edited relevant text inside a note, and distinguish my own edits from edits by my agents.

## Direction

- Remove the editor/actor indicator from sidebar note rows (the human/robot/unknown icons shown in the supplied screenshot).
- Original placement proposal (resolved below): selecting a text block reveals a nearby floating attribution hint, similar to git blame, showing who last edited that section. This is a UX idea, not a decision to use Git or a commitment to block-level history.
- Include identity setup: let me enter my name during Mac app onboarding and change it in Settings. Give agent clients an owner-prefixed label so I can recognize “my agent” versus myself or someone else's agent; for example, `Alex · Codex`.
- Captured 2026-11-01; implementation authorized 2026-11-02.

## Tasks

- [x] Remove editor attribution from sidebar note rows.
- [x] Decide where and how attribution is revealed inside a note; evaluate the selected-block floating hint and clarify whether attribution describes the note or the selected section.
- [x] Define and deliver naming across Mac onboarding, Settings and agent-client setup, including owner prefixes and clear human/agent distinction.
- [x] Verify the agreed experience and document what attribution can actually establish, including unknown or externally edited content.

## Decisions

- Selection reveals a nearby, viewport-clamped **Saved note · last editor** hint, including keyboard/read-only selection. Escape preserves selection; collapse, dialogs and navigation hide the hint. More info retains an alternative route to the saved-note facts.
- Existing hash-checked metadata proves a declared last editor for the whole saved note, not each block. The hint explicitly states that section history is unavailable and warns when selection may include unsaved edits. No Git dependency or retained block-history store was introduced.
- Optional device-local owner naming is shared by Mac onboarding, Settings → Your name and `jumpybrain identity --name`. Each agent host supplies `JUMPYBRAIN_CLIENT_NAME`, or ordinary writes pass `--actor agent --actor-name`. Names become `Alex · Codex` (or `Alex · Agent` for an unnamed client with an owner). Without an owner, client names stay unprefixed; absent/unknown actors stay unknown.
- Renaming affects future declarations. Existing Markdown is not backfilled. Live saves/presence accept validated declared actors separately from authenticated principal/client ownership, preserving access, Undo, streams and drafts.

## Remaining limits

- This delivers truthful note-level discovery, not section-level git blame. Retaining trustworthy block history remains future work.
- Display names are declarations, not authenticated people. Preferences are local to each machine and do not synchronize. Older remote clients/servers need compatible upgrades for live declared names.
- No installation, publication or release is part of this implementation. Physical assistive technology, other browser engines, real Keychain prompts and packaged fresh installation are not certified by the disposable checks.

## Acceptance

- Sidebar rows no longer show editor/actor indicators.
- The chosen in-note interaction makes last-editor information discoverable and clearly states its scope; unavailable attribution stays unknown.
- My name is configurable during onboarding and in Mac Settings, and agent labels visibly identify their owner and agent client.


## Verification

Tested the scoped working tree based on `3c4348c`, with no dependency or version changes.

- `npm run build` — passed; browser bundle 219,938 bytes gzip, within the unchanged 220,000-byte gate. Removed unused actor icon code; no new dependency.
- `node --test` — 1,791 passed, one skipped, zero failures (1,792 total). The earlier full attempt exposed the bundle ceiling and one uninstall failure; after removing unused glyph code, the final full run passed. The uninstall case also passed in isolation.
- `npx --package=playwright node scripts/contextual-attribution-smoke.mjs` — passed against the production shell and real HTTP/WS publication: selection, Escape retaining selection, collapse, saved/draft scope with an intentionally held live write, read-only selection, raw-edit unknowns, light/dark at 1280/390px, Settings rename, human live saves, CLI setup and guarded owner-prefixed agent writes. Captures are ignored under `.local-pack/contextual-attribution/`.
- `node scripts/simple-onboarding-smoke.mjs` — passed with the production sandboxed Electron welcome, isolated display preference, name persistence, local/remote setup and 960/680px light/dark captures. The new name field initially overflowed the small welcome; the compact row fixed it without hiding actions.
- `npx --package=playwright node scripts/collaborative-sidebar-smoke.mjs` — passed: no actor glyphs, paging, periodic/raw/browser refresh, caret/focus and six responsive/theme layouts. The idle-focus assertion now drains the live publisher's debounced sidebar refresh before measuring quiet polling.
- `git diff --check` — passed.

The older broad `note-workspace-smoke.mjs` attempt stopped at its immediate Saved assertion while live attachment still said Connecting. The new attribution runner waits for the live state and verifies the changed flows; a full successful run of that legacy journey is not claimed.

## Finalization

Owning docs, setup guidance, glossary and pending release notes updated. Archived under the repository task workflow; the scoped commit does not authorize installation, push or release.
