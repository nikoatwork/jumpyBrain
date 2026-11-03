# Core mission cards v1

Use the unique names/IDs from the private ledger. Text is fictional. Prefix every UI-created title with the run's `UX <run> ` prefix. Normal navigation, keyboard shortcuts and visible controls are allowed. Helpers may prepare agent-side inputs and verify canonical results, not complete human-side actions.

## J1 Capture and persistence

Create a new workshop-planning note in the Mac app. Replace any starter prompt, give it a run-prefixed title, and write two short paragraphs. Correct one phrase; Undo then Redo the correction. Navigate away and reopen. Identify/adopt the exact UI-created note and confirm the intended title/body through CLI. Capture initial typing/save feedback, final Saved and reopened content. Do not edit the initial personal note accidentally.

## J2 Agent-to-human handoff, search and links

Find the seeded workshop brief using ordinary global Search. Open it, append `Human review: accessibility first.` and verify that exact edit through CLI (destination proof). Add a reference to the seeded logistics note using the visible linking UI or documented reference typing. Continue writing after the reference, confirm save, activate the link, and navigate Back. Verify the canonical link and correct targets; loading agent text must not create missing pages. Search from a different note and separately verify indexed CLI discovery. A missing-target creation variant is optional and must ledger its new note.

## J3 Board round trip

Open the seeded workshop board. Move the brief from Ideas to Preparing using UI, open its card in the editor and navigate Back. Add the existing logistics note if not present, then remove its membership while keeping the note. Verify layout/IDs and note survival through CLI. If testing nested sidebar navigation, explicitly enable the board's default-off sidebar setting through UI and record that assistance/preference. Do not score an undisclosed preconfigured route as default discoverability.

## J4 Live coauthoring

Open the seeded draft, position the cursor in the human paragraph, and start the controlled real CLI producer. Capture activity before advancing. Advance its first chunk; observe new text while the producer remains active. Make a disjoint human edit, Undo and Redo it, checking agent text remains. Advance the second chunk, then finish input. Observe end-of-stream feedback, confirmed Saved and exact canonical combined content. Capture selection/focus stability; distinguish presence from a completion notification. Reopen once after finishing.

## J5 Agent works elsewhere

Stay in the brief (or its search view) while a supported CLI edit appends `Agent follow-up: reserve a quiet room.` to logistics. Observe current content/focus and feedback scope. Find/open logistics and inspect the update, then navigate Back. No background edit may redirect the current view. Record whether the change is discoverable and whether its actor/completion meaning is clear; do not assume a workspace-wide completion notice exists.

## P1 Producer interruption

Start a second controlled producer on the run-owned draft, advance one confirmed chunk, and explicitly cancel that stream. Inspect saved partial text, visible activity ending and the absence of a false completed-document claim. Record canonical receipts. This proves producer cancellation only. Record uncertain-human-save recovery separately as not_run/unverified unless a safe native-client mechanism genuinely reaches it. Never stop the VPS or corrupt its index.

## P2 Save and search readiness

After a normal run-owned write capture Saved and status before diagnostic search. Search from another note, then perform CLI search with the run prefix. Record automatic freshness and elapsed observation interval. If repair is necessary, first retain the failure; run explicit index only when separately permitted, and label subsequent success repair-assisted. A fresh final state cannot pass an unseen pending/stale transition. The recent-save cache in the editor is not sufficient indexed-search evidence.
