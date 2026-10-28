# Judge — writer and user journey

Independent assessment of proposals A, B and C. Scores are design judgments, not observed usability results. All five criteria carry equal weight.

| Rank | Proposal | Calm writing | Navigation | Beauty / simplicity | Accessibility / trust | Feasibility | Total |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | B — The folding desk | 9 | 9 | 9 | 9 | 10 | 46 / 50 |
| 2 | C — The quiet page | 10 | 9 | 8 | 8 | 7 | 42 / 50 |
| 3 | A — Quiet desk | 8 | 8 | 8 | 9 | 8 | 41 / 50 |

## Winner: B — The folding desk

B improves the page every time it opens. The writer sees their title, one small tool disclosure, and their sentence; they do not need to discover and enter another mode to get the promised calm. The library remains useful when consulting another note. The section count gives a specific reason to open Page details, which currently sounds like a metadata destination. This is a small, coherent journey improvement with an understandable cost: one explicit click when the writer wants mouse formatting.

The decisive scenario is write → consult another note → return → continue. B keeps the same navigation landmarks throughout, retains a direct Link action, and folds the tools again when entering a different note. Its distinctive detail helps movement rather than adding decoration. It has the clearest path to a complete, dependable implementation.

## A — strengths and objections

Focus offers the largest optional clearing of visual noise and correctly protects save/recovery visibility. Session-local state and a labeled exit are sound. But the ordinary page retains the full formatting strip, so the first experience is barely calmer. Requiring exit from Focus to reach the outline interrupts the long-note writer who needs concentration and section movement together. Adding conditional header Search and layout restoration introduces another state without improving the default first sentence.

## C — strengths and objections

C combines the best default page treatment with a powerful deeper writing state. It is the strongest static concentration canvas. Its cost is a larger journey contract: ordinary versus writing navigation, panel snapshots, focus restoration, Settings detours, note transitions and brain boundaries. Those details can become subtle surprises, especially if a page opens with a remembered mode but its tools are unavailable. The proposal also describes Writing view as a named icon in the ordinary header, reducing discovery of the feature that earns this complexity. It is a credible later extension if actual use shows sidebar distraction remains a problem after the default page is simplified.

## Required refinements for B

1. Keep the visible **Page details** label stable and append a quiet “N sections” caption only when useful. The accessible name must still make the action clear; count changes should not become live announcements.
2. Preserve the actual editor selection when Format opens and an operation is activated. Test keyboard and pointer routes, including noncollapsed text selection, undo, and closing the strip. Do not settle for unchanged serialized text as proof of selection preservation.
3. Keep Link directly reachable while the formatting strip is folded, using the existing reference insertion operation and guards. Do not accidentally bury the primary linking journey inside Format.
4. Use a short, plain writing hint. “A thought to keep…” is pleasant, but a separate instructional caption may add noise. The existing single-line slash hint is sufficient if it remains legible and presentation-only.
5. On narrow screens, test actual usable controls and note text after the header wraps. A no-overflow assertion alone does not prove that the editor gets enough space or that the section caption remains understandable.
6. Keep Format's open state stable during edits and saves, reset it only at the documented note boundary, and restore sensible focus if closing would hide the active control. No automatic disappearing tools.

## Acceptance emphasis

The winning implementation should prove a real create → title/body → format heading → insert link → follow → Back → continue writing journey, plus section jumping in a long note. Check the saved Markdown and reopening behavior, failed-save navigation blocking, read-only controls and actual Electron keyboard behavior. Compare screenshots of realistic populated notes as well as empty pages in both schemes and narrow layouts. Keep all existing save uncertainty and recovery behavior visible.
