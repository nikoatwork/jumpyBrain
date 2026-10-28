# Fourth design — Quiet document, context on demand

## Decision

All three panelists ranked C first. Keep C's visible trust/handoff loop, A's document-first layout and empty guidance, and B's optional outline/context. Panel scores are expert judgments, not measured user outcomes. See [A](design-a.md), [B](design-b.md), [C](design-c.md) and [pain](review-user-pain.md), [delight](review-delight.md), [trust](review-trust.md) reviews.

## Implemented scope

- One stable workspace action area: truthful save/external-change status, existing retry/review/recovery, labeled Copy draft and Page details. A clean loaded baseline says Saved. Copy uses current title/body and existing clipboard/manual recovery; it grants no access and starts no agent.
- A quiet serif title/body with the existing tested formatting strip. Remove the separate copy/delete row from the writing path. Empty writable bodies show presentation-only starter guidance.
- Page details is closed by default and tab-local. On wide Mac windows it opens a contextual rail; intermediate/narrow windows use a bounded in-flow region. A reachable close control/Escape returns focus. No new persisted layout preference.
- Details contains On this page (actual mounted supported headings, including distinct duplicate headings), existing Related pages, saved-version last-editor/date/location, existing explicit source checks, advanced raw metadata, then Delete with the existing confirmation.
- Recognition follows accepted confirmed versions only. Label it Saved version, require exact browser actor identity for You, and describe names as declared by the writing tool. Missing/stale recognition means unknown. The draft is never attributed to the previous saved actor.

## Deliberate choices

Keep the current formatting controls: reviewers found that hiding familiar controls behind new menus could increase interaction cost and risk selection/undo bugs. Related pages keeps its existing name and conservative search/freshness behavior; suggestions are not promoted to citations/backlinks. Essential errors and recovery remain outside details. Preserve all canonical, remote-write, navigation, merge and uncertain-save guards.

This is useful cooperation over Markdown today. Live presence, comments, invitations, retained history and simultaneous cloud coediting require separate product/backend work.

## Acceptance

1. Confirmed load/save, editing, saving, failed/unconfirmed writes and conflicts always report truthful state. Recovery remains available with details closed.
2. Copy includes current title/body; opening/closing details and heading navigation never intentionally mutate Markdown. Existing save-on-blur/debounce policy remains in effect.
3. Outline handles duplicate headings and ignores heading-like code/literals; section activation places the caret in that actual section without recreating the editor. Editing/undo continues normally.
4. Accepted external changes refresh saved-version context; rejected/out-of-order/failed responses do not. Note/brain changes clear context and heading targets.
5. Empty guidance is absent from saved Markdown and hidden for read-only/literal/code content. Light/dark, long titles/paths, open/closed details at 1280/900/390/320px have no horizontal overflow or inaccessible recovery.
6. Verify the production Electron window, canonical editing and external-edit recovery using disposable data; do not install or publish this branch.

## Delivery

See the [completed task and verification](../../tasks/done/2026-10-28_tasks-mac-note-workspace.md) and [interactive design comparison](comparison.html). The agent panel judgments explain the design choice; the task record separates tested behavior from future collaboration capabilities.
