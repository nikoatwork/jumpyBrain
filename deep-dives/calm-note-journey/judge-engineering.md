# Independent engineering and accessibility judgment

Reviewed proposals A, B and C plus the existing `note-workspace.ts` controller. Scores are design judgments, not observed usability evidence. Each criterion has equal weight; 10 is strongest.

| Proposal | Calm writing | Navigation | Beauty / simplicity | Accessibility / trust | Feasibility | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A — Quiet desk | 8 | 8 | 8 | 8 | 8 | 40 / 50 |
| B — The folding desk | 9 | 9 | 9 | 9 | 10 | 46 / 50 |
| C — The quiet page | 10 | 9 | 9 | 8 | 7 | 43 / 50 |

## Ranking

1. **B — The folding desk.** Best balance: improves the default page immediately and makes existing section navigation easier to discover, with one small explicit disclosure rather than another workspace mode.
2. **C — The quiet page.** Strongest concentration surface, but combines a new disclosure with a mode that needs duplicated navigation and careful lifecycle restoration. More opportunities for inaccessible hidden focus, stale panel state and crowded narrow headers.
3. **A — Quiet desk.** A reversible mode is coherent, but the default writing surface still has the full formatting row. Writers must discover and enter a mode before getting the primary calmness benefit. Requiring Focus exit before section navigation also slows a common consult-and-return journey.

## Review of each

### A

The visible exit, unmodified sidebar preference and preserved save/recovery controls are sound. Session-local state avoids metadata pollution. However, full panel restoration becomes ambiguous after changing notes: the old note's details state must never reappear on another document. Focus also hides the brand/brain context, requiring care around connection errors and Settings. Its gentle transition is optional; an animation is not worth selection/scroll instability.

### B

A visible Format button preserves discoverability and ordinary keyboard order while removing a permanent tool strip. The section caption helps users understand what Page details contains before opening it. Existing detail navigation already places the caret in actual mounted headings; it is sensible to reuse that behavior and Markdown policy. There is no alternate document mode to coordinate with Settings, native chrome or brain switching.

The caption itself must remain subordinate: do not turn it into a prominent badge or announce changes after every heading edit. The proposed two-line starter should also remain light; reducing toolbar clutter only to add persistent instruction text would be a poor trade. Prefer one concise presentation-only starter.

### C

Explicit Writing view is attractive and keeps New/Search/Back available, which is stronger navigation than A. Its folded default also solves the default-page problem. The engineering burden is nevertheless materially higher: mode state, panel snapshots, note transitions, Settings detours, brain reset, focus restoration and narrow-screen header wrapping all require meaningful end-to-end coverage. The icon entry has weaker discoverability than a text label. It should win only if the mode itself is central to the requested outcome; here the simpler default already addresses most of it.

## Required refinements for B

- Keep Format and a direct page-reference action visible for loaded writable notes. Use real controls, `aria-expanded` / `aria-controls`, a visible expanded cue and existing semantic tokens. Read-only/frozen states must follow the current permission guard.
- Opening or closing Format must preserve the active editor selection, undo stack, draft and editor DOM. Pointer focus prevention must not block keyboard activation. If closing hides the focused descendant, return focus to Format. Escape should be scoped to the disclosure, never steal it from slash/search/reference dialogs.
- Reset the disclosure on note identity/generation changes. A save-status update must not close it. Avoid preference persistence and automatic typing/hover timers.
- Compute section count from the exact supported mounted heading query used by the outline, even while details is closed. Exclude code and literal headings. Update the caption without rebuilding unchanged outline rows or moving keyboard focus; no live region for the count.
- Keep Copy draft, saving/error/retry/review/recovery visible outside either disclosure. Page details still describes only an accepted saved revision. No fold action should send a save, index request or metadata mutation.
- Test a real create → title → body → Format heading → link/reference → section jump → another note → Back → reopen journey. Also verify selection formatting + undo, zero writes from folding/count updates, repeated headings, read-only remote, save failure/conflict and stale-note reset.
- Inspect 1280/900/390/320px light/dark captures and actual Electron behavior. Long titles, expanded groups and recovery actions must stay reachable without horizontal document overflow. Assertions alone do not establish beauty or assistive-technology usability.

## Decision

Implement B end to end. Defer the additional concentration mode; it is a separate product decision rather than a prerequisite for a calm default note page.
