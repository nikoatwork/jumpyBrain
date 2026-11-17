# Panel review — Nontechnical writing and long-document pain

## Judgment basis

Review of all three proposals against the current note page, not usability research. Scale: 1 = little practical value or serious friction; 3 = useful improvement with a meaningful tradeoff; 5 = directly resolves a frequent, important pain. Scores describe proposed value, not measured outcomes.

| Direction | Pain solved | Delight | Simplicity | Trust | Implementation value |
| --- | ---: | ---: | ---: | ---: | ---: |
| A — Quiet writing desk | 4 | 4 | 5 | 4 | 5 |
| B — Document with bearings | 5 | 4 | 3 | 4 | 4 |
| C — Trustworthy document | 5 | 3 | 4 | 5 | 4 |

## Ranking

1. **C** addresses the highest-consequence uncertainty when people and agents touch the same document: whether work is safe and which saved version is being described. Labeled copy makes the existing handoff useful to a beginner.
2. **B** produces the largest workflow improvement for long agent-produced documents. Jumping straight to a section and seeing related pages avoids repeated scrolling and opening a separate graph. It should be optional, since a permanent rail burdens short notes.
3. **A** is the best baseline for every note. It removes intimidation and destructive-action prominence, but its visual simplification alone does less for the stated collaborative-document journey.

## Critical objections

- **A:** A style picker plus Insert menu can make formatting harder to discover and can lose text selection. Fewer visible controls are not automatically less work. Retain familiar, tested controls unless the consolidated version preserves keyboard selection, undo and format state. Do not hide Copy draft deep inside details: it is part of the primary agent/coworker journey.
- **B:** Avoid turning Page details into a kitchen-sink sidebar. An outline is useful only with actual supported headings; show a concise empty state or omit that group on short notes. Related suggestions are not proven citations or backlinks. The rail must not squeeze a normal writing column or cause a large layout jump at ordinary Mac window sizes.
- **C:** Attribution describes the confirmed saved revision, not all text currently visible in a dirty draft and not live activity. Name it accordingly. Unknown editor is an acceptable result. A transient external-update notice is not a retained change log. Shipping stale attribution would cause more pain than omitting it.
- **All:** These are reasoned design judgments; no interviews or observed nontechnical user task runs establish the delight scores.

## Recommended fourth design

Use **A's calm writing surface**, **C's explicit safety and handoff**, and **B's optional navigation**:

1. Keep the large editable title and readable serif body. Add an empty-body starter hint that never enters Markdown.
2. Present Saved / Saving / Editing / failed / review state consistently. Keep all failed-save and Review changes actions outside collapsible details.
3. Put a visibly labeled **Copy draft** and **Page details** in a compact note action area. Put Delete inside details with the existing confirmation.
4. Page details contains On this page, existing Related pages, a readable file location, accepted saved-version editor/date context, source checks when applicable, and raw metadata as a nested advanced disclosure. No presence, comments, history or share/invite affordances.
5. Keep details closed by default. Opening is reversible local UI state, no save or network write. Use a rail only when the writing area remains comfortable; otherwise expand in flow. Close/escape preserves or restores meaningful focus.
6. Prefer a safe modest toolbar cleanup over a full new formatting interaction system in this slice.

## Acceptance tests that represent user pain

- **Safety without guessing:** On load, a clean canonical note says Saved. Typing, failed PUT, uncertain response and overlap conflict never falsely say Saved. Review changes remains reachable with details closed.
- **Handoff:** With an unsaved draft, Copy draft yields exactly the current title and Markdown body, says Draft copied, and performs no save/transmission. Clipboard failure retains the existing selectable draft recovery path.
- **Long-doc navigation:** With eight headings including duplicate names, each outline item targets the correct mounted heading. Navigation does not alter canonical bytes or recreate the editor; typing and undo still work afterward.
- **Context correctness:** Rejected late GETs cannot update saved editor/date. Accepted external versions can. Unknown provenance never becomes You or Agent through guesswork.
- **Calm at every size:** Details closed and open at 1280, 900, 390 and 320px in light and dark themes, with long titles and paths: no horizontal page overflow, clipped actions or hidden recovery controls.
- **Scope changes:** Navigate notes and switch brains with details open and reads pending; no previous note outline, location, attribution or related links survives into the next document.
