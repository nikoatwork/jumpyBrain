# Panel review — Collaboration and trust

These scores are design judgments from the current implementation and proposals, not observed user research. Scale: 1 weak, 3 useful with material compromises, 5 directly resolves the core problem with little extra burden.

| Direction | Pain solved | Delight | Simplicity | Trust | Implementation value |
| --- | ---: | ---: | ---: | ---: | ---: |
| A — Quiet writing desk | 4 | 4 | 5 | 4 | 5 |
| B — A document with its bearings | 4 | 4 | 3 | 4 | 4 |
| C — A trustworthy working document | 5 | 3 | 4 | 5 | 5 |

## Ranking

1. **C** best serves working alongside agents: visible save state, honest external-update signals and explicit draft handoff address the uncertainty at the center of that journey.
2. **A** offers the strongest everyday simplicity. Its removal of destructive chrome and empty-state guidance should become the visual foundation.
3. **B** makes long documents substantially easier to review, but an information rail must earn its width. A permanent inspector would undermine the minimal brief; opt-in outline/navigation is valuable.

## Objections

### A

Moving Copy into details weakens the very practical handoff loop. Keep a labeled Copy draft directly reachable. Consolidated native style/Insert controls may introduce selection bugs: retaining a reliable small toolbar is preferable to shipping a cleaner-looking control that formats the wrong text. Empty guidance must be presentation only and must not cover nonempty whitespace/code/literal content incorrectly.

### B

Related recommendations are not proof of canonical connections, citations or relevance. Retain the existing Related pages label until the controller can distinguish explicit links from suggestions. A live outline must be derived from actual editor headings, never a parallel Markdown parser that mistakes fenced code for a section. Opening the rail should not move the caret or trigger writes. On small windows avoid placing a large context block between the title and the user's first line.

### C

Latest editor attribution can look like verified coworker identity. Qualify it as declared provenance in details and label it as the **saved version** while a local draft differs. Do not show an old actor as the author of the current unsaved text. Current response recognition must travel with accepted content/hash transitions, not with every successful network read. Rejected watcher responses, out-of-order requests and failed saves must never relabel the visible saved baseline. An unknown actor should stay unknown. Copy draft is an explicit clipboard action, not sharing or granting access.

## Recommended fourth design — Quiet document, context on demand

- Use A's calm serif document, empty-body hint and removal of Delete from the writing path.
- Use C's coherent visible Saved/Editing/Saving/Failed/Review state, labeled Copy draft, and truthful current saved-version details. Essential errors and Review changes stay outside any disclosure.
- Use one labeled Page details toggle. Combine B's live outline and existing related-page navigation with C's plain location/editor context, source checks and advanced raw metadata. Open it only on request; use a wide-screen rail and an in-flow or bounded disclosure on narrow screens without squeezing the editor.
- Keep formatting discoverable and reliable. Toolbar simplification is welcome only with explicit caret/selection/undo verification; it is secondary to trust and document navigation.
- No presence, comments, retained revision history, notifications, cloud sync indicators or automatic agent execution. Existing polling/merge/recovery already provides useful cooperation over canonical Markdown.

## Acceptance tests that matter

1. Loaded confirmed note says Saved. Type, trigger a failed save and overlapping external edit: the visible state never says Saved, Review changes stays reachable with details closed, and both versions remain available. Details/copy/outline alone produce no canonical writes.
2. Put agent recognition on a clean accepted revision, then deliver delayed recognition after typing or navigating to another document/brain. The displayed editor must follow only the accepted revision. Missing/invalidated attribution becomes unknown; only exact local actor identity becomes You.
3. Copy with an unsaved draft must copy exactly the current title/body, including text not yet saved, and say Draft copied. It must not imply remote access or send the text to an agent. Clipboard failure retains the existing selectable recovery fallback.
4. Navigate a long document with repeated supported headings and a code block containing heading-like text. Each outline action reaches its distinct actual heading without changing content, selection unexpectedly or canonical Markdown. Related links still pass through save guards.
5. Verify details closed/open, long names/paths, readonly brain and a conflict at wide and 390/320px light/dark layouts. No horizontal overflow; no hidden recovery action; keyboard focus returns predictably when details closes.
