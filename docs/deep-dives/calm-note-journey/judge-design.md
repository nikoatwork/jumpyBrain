# Independent design judge

Perspective: visual hierarchy, interaction simplicity and complete product behavior. Read proposals A, B and C plus the current note layout/styles; did not read other judges. Scores are design judgments, not observed usability research.

## Scores

Each criterion has equal weight; higher is better.

| Proposal | Calm writing | Navigation | Beauty / simplicity | Accessibility / trust | Feasibility | Total / 50 | Rank |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A — Quiet desk | 8 | 8 | 8 | 9 | 8 | 41 | 3 |
| B — The folding desk | 9 | 9 | 9 | 9 | 10 | 46 | 1 |
| C — The quiet page | 10 | 9 | 8 | 9 | 7 | 43 | 2 |

## Winner: B — The folding desk

B improves the page every time someone opens a note. Folding the formatting strip makes the existing serif title and prose the clear hierarchy without requiring a person to discover and enter a second mode. The ordinary library, Search, Back, brain identity and save actions keep their familiar positions. This best balances the user's four priorities: calm, quick navigation, beauty and simplicity.

Its section-count quirk gives Page details a visible navigation purpose before it is opened. That is useful personality rather than ornament. It also reuses a real, already-supported outline instead of adding another permanent rail. Its visual distinction should come from whitespace, typography and the folded controls, rather than adding a surface card or more controls.

## Assessment of every proposal

**A:** Focus has an understandable purpose and a clear exit. It preserves important save truth and uses the existing reading measure well. Its principal weakness is that the default page retains the present formatting row: the main simplification needs an additional action. It adds a focused header, conditional Search, panel restoration and lifecycle state while asking the user to leave Focus for ordinary section navigation. It is a reasonable optional future enhancement but a weaker first response to the current default-page friction.

**B:** The strongest economy of change. A visible Format disclosure is easy to understand and useful immediately, while the heading count makes an existing feature easier to find. The cost is one extra click for mouse formatting. Its main risks are retaining the exact editor selection across disclosure interaction, letting hidden controls leave the tab order, and making the count feel like another badge. These are bounded implementation problems and do not require a new application mode.

**C:** Best pure concentration state and the most ambitious complete journey. The folded default toolbar is excellent. Writing view, however, adds another mode plus duplicated navigation actions, restoration across document changes, a Settings exception and focus/scroll responsibilities. Those rules are substantial product complexity for an experience intended to be simple. Its focused-header inventory also needs to explicitly include Copy draft: the later trust promise says it remains reachable, while the header description omits it. If selected, ship its whole focus journey rather than quietly deferring the mode.

## Required refinements for B

1. Keep Format visibly labeled, with a simple chevron and a real expanded state. Do not turn it into an unlabeled Aa icon. Keep the expanded tools open after use; no auto-hide timer or selection-only affordance.
2. Reuse the existing page-reference insertion action. There must be one visible Link/Insert reference control at rest, with its established permission and navigation guards, rather than two copies with different behavior.
3. Put the section caption inside or immediately beside the existing Page details action, with sufficient room for wrapping at 320px. Keep the stable accessible action name and expose the count as supporting information. Do not repeatedly announce the count or animate it. Count mounted supported headings, including repeated headings as separate targets; exclude literal/code text.
4. Preserve the present direct empty hint, or shorten it to one useful sentence. “A thought to keep…” plus a second caption adds editorial decoration without improving the first-action instruction. The starter must remain presentation-only and absent on read-only pages.
5. Scope Escape to the open formatting region or its trigger. It must not intercept Search, slash commands, find, dialogs or ordinary writing Escape. Closing must restore focus to the disclosure; pointer formatting must retain the editor selection and undo.
6. Reset the fold and count on real document/scope replacement. Ordinary saves, theme changes and companion polls must preserve open controls and focused targets. Do not recreate the editor or outline for unrelated prose edits.
7. Verify both folded and expanded states in real Electron and browser layouts, including a long title, open details, read-only brain, save failure and 320px width. Assert actual canonical bytes, caret/selection and undo preservation. A still screenshot alone cannot validate the design.

## Implementation recommendation

Implement B as the complete selected design, with the refinements above. Keep the visual surface borderless, preserve all existing save/recovery ownership, and evaluate the real create → write → format → link → consult → return journey. A focus mode can be considered separately if user testing establishes that the folded default still leaves too much surrounding UI.
