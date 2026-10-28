# Selected design: B — The folding desk

All three independent judges selected B. Scores describe agent design judgment, not observed usability research; conceptual inspirations are not claims about the current interfaces of Linear, Coda or Notion.

| Proposal | Writer | Design | Engineering | Total / 150 |
| --- | ---: | ---: | ---: | ---: |
| B — Folding desk | 46 | 46 | 46 | 138 |
| C — Quiet page | 42 | 43 | 43 | 128 |
| A — Quiet desk | 41 | 41 | 40 | 122 |

## Implementation contract

- Improve the default page: an explicit Format disclosure replaces the permanently expanded strip. Keep it stable through typing/saves and reset it on document replacement.
- Keep one directly reachable Link action outside the fold, using existing insertion and permission guards.
- Give Page details a quiet, non-live section count from supported mounted headings. Keep its accessible action name stable; repeated headings count separately and code/literal headings do not count.
- Retain the existing single presentation-only writing hint and borderless serif document. Use existing theme/spacing/target tokens.
- Preserve editor DOM, selection, undo and draft bytes through presentation changes. Escape only closes Format from its trigger/controls when no higher-priority popup is active, then restores trigger focus.
- Keep save/retry/review/recovery and Copy draft outside disclosures. Preserve canonical Markdown, concurrency, remote permissions and native save barriers.
- Complete and test create → title/body → format → link → section jump → follow/search → Back → reopen, along with responsive themes, error/recovery and the production Electron window.

## Artifacts

- Proposals: [A](design-a.md), [B](design-b.md), [C](design-c.md).
- [Interactive concept comparison](comparison.html).
- Independent reviews: [writer](judge-writer.md), [design](judge-design.md), [engineering](judge-engineering.md).
