# Panel review — Everyday Mac writing and delight

These are design judgments from proposal and implementation review, not measured user research. Scores run from 1 (little value or substantial weakness) to 5 (strong value with a credible path). “Delight” means friction removed during real writing, not visual novelty.

| Direction | Pain solved | Delight | Simplicity | Trust | Implementation value |
| --- | ---: | ---: | ---: | ---: | ---: |
| A — Quiet writing desk | 4 | 4 | 5 | 4 | 5 |
| B — Document with bearings | 4 | 4 | 3 | 4 | 3 |
| C — Trustworthy document | 5 | 4 | 4 | 5 | 4 |

## Ranking

**C, then A, then B** for this user's core journey. C directly addresses the uncertainty of working on the same document as an agent. A supplies the strongest everyday writing foundation. B becomes especially valuable after documents grow, but should not define the default surface.

## Critique of each

### A — Quiet writing desk

The strongest immediate improvement is removing the conspicuous destructive row and making the page feel writable. An empty-state hint and an affirmative Saved state make first use comprehensible. The document should visibly remain the product.

**Objection:** moving Copy draft entirely into Details sacrifices the most useful bridge to the user's existing agent workflow. Keep a visible labeled Copy draft action. Toolbar consolidation is sensible only if it retains selected text, format state and keyboard behavior; a tiny clean toolbar that loses selections is worse than the existing strip. Do not introduce a new nested Insert menu just for visual symmetry if existing slash commands already meet advanced needs.

### B — Document with bearings

A heading outline is meaningful delight for reviewing long agent-produced docs: one action replaces repeated scrolling and Find guesses. Bringing related pages within reach also helps the user keep context.

**Objection:** “Page details” is a weak label for an outline, related pages, source checks and metadata all together. This risks turning a minimal editor into an inspector full of implementation concepts. Keep the rail opt-in, make its leading section “On this page”, omit empty sections, and avoid simultaneously introducing multiple persistent view preferences. At intermediate widths, a rail must yield to the writing rather than leave a cramped column. An inline region that expands before the body should stay bounded so opening context does not bury the document on a phone-size window.

### C — Trustworthy document

The best source of confidence is a stable, document-local answer to “Is my work safe?” plus explicit draft copying. Plain language and truthful external-update states are more valuable than simulated collaboration chrome.

**Objection:** latest-editor attribution adds metadata complexity and can dominate the actual task. Show it quietly in Details, or as a single secondary line only when current evidence exists. Do not repeat Saved, edited age, actor, update notice and raw attribution in several places. The four-second update notice is not history; no visual treatment should suggest otherwise. A copy tooltip should say exactly what is copied and should never imply an agent has received it.

## Fourth solution — Quiet document, context on demand

Use A's document-first composition, C's visible trust/handoff, and a bounded slice of B:

1. Keep one restrained top action area: confirmed save/review state, **Copy draft**, and **Page details**. Remove Delete from the writing path. Essential retry/recovery stays outside Details.
2. Keep the title and body visually contiguous, with one concise formatting strip. Preserve current reliable controls unless consolidation is proven to preserve selection and undo.
3. Show an empty-body starter hint that never enters Markdown. It must disappear in read-only mode or explain reading rather than invite editing.
4. Details opens an optional context area with **On this page**, current related pages, document facts/source checks and a secondary Delete action. Show only relevant sections. On narrow windows use one bounded in-flow region with a reachable close control.
5. Include current latest-editor context only if accepted-snapshot lifecycle tests pass. “Declared by the writing tool” belongs beside attribution in Details, not as an alarming permanent disclaimer above the document. Missing context remains unknown.
6. Reuse the existing external-update, merge and review behavior. Give these states clear placement; add no new presence, history or agent-execution concept.

The result should feel like a document that knows where you are and keeps your work safe. The default view must not become a dashboard.

## Critical acceptance tests

- A new nontechnical user sees where to type, sees Saved after a confirmed load/save, and can discover Copy draft and Page details without hovering. Failures and overlapping edits retain visible recovery actions.
- Keyboard formatting preserves the selected range; undo/redo remains correct. Opening context and navigating headings produce no canonical write and do not replace the editor DOM.
- Copy includes the exact current title/body, including an unsaved draft. Success says Draft copied; denied clipboard access retains manual recovery. Nothing is sent automatically.
- Empty-state hint never appears in canonical bytes, including empty, whitespace-only, undo/redo, literal and code-block cases.
- Details does not expose the prior page's outline, file or actor while loading another note or after a brain change. Long names, titles and paths wrap safely.
- At desktop, intermediate and 390/320px widths in both themes, the writing and recovery controls remain reachable without horizontal scrolling. Closing Details from within restores focus. Reduced Motion does not animate heading navigation.
