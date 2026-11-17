# Direction C — A trustworthy working document

## Intent

Make the page answer three human questions without leaving the writing surface: “Is my work saved?”, “Did someone or an agent change this?”, and “How do I give an agent the document I mean?” Keep the body calm; show collaboration only through capabilities and evidence that exist today.

## Observed pains in the current app

- Save state and “Changes available” live in the workspace header beside navigation, while Copy draft and Delete sit in a separate row under the title. A writer must connect status, actions and the document across three locations.
- A newly loaded, unchanged note has an empty save label (`idle`), leaving no positive explanation of autosave. Dirty/saving/failed states are accurate, but the baseline is silent.
- External polling has careful draft/caret protection, quiet highlights and a four-second “Updated elsewhere” notice. The visible wording does not explain that another agent/app may be the writer. The transient notice cannot serve as a retained activity log.
- The GET/PUT document responses already provide revision-checked `recognition.editor` and edit dates; the note view hides this context in raw read-only frontmatter. Nontechnical writers cannot distinguish a declared agent update from their own browser edit.
- Copy draft is an unlabeled icon beside a destructive action. It is useful for agent handoff, but its content and purpose are not obvious.

## Layout

```text
App navigation                         [Page details]

Project launch plan
Saved · Last edited by an agent, today    [Copy draft]

[Text styles] [Inline styles] [Insert]

A quiet, full-width writing column…

Related pages…

On explicit Page details:
  Last edited   Agent: Alice • Oct 28, 14:32
  Attribution   Declared by the writing tool
  Location      pages/project-launch.md
  [Source versions, when present]
  [Raw metadata disclosure]
  [Delete note…]
```

Use an inline disclosure below the title or a bounded right-side inspector on wide windows, never a permanent second content rail. On narrow windows the same details expand in document flow. The reading column and title retain existing typography and theme tokens.

## Interactions

1. **Document-local reassurance.** Put canonical save state beside the note identity. On a loaded clean baseline say “Saved”; retain “Editing…”, “Saving…”, “Save failed” and explicit review states. This describes known canonical state only, never cloud sync or search indexing.
2. **Evidence-based editor context.** Display a compact “Last edited by you / a person / an agent” line and exact date in accessible detail using current response recognition. “You” requires exact local browser identity matching. Missing or invalidated declaration says “Editor unknown”. Do not parse raw `last_editor_*` fields in the browser or infer an agent from a source folder. Explain declared provenance in Details, without claiming authenticated coworkers.
3. **External changes stay visible where relevant.** Keep existing safe polling, merge limits and line highlights. Present “Changes available” by the document, and keep “Review changes” prominent when the controller requires review. Avoid adding a competing “load changes” action while automatic merge or writes are pending. Successful adoption can say “Updated elsewhere”; known current actor can provide context but never claim it was that actor for every changed block.
4. **Explicit handoff.** A labeled Copy draft button copies the current title and Markdown body through the existing clipboard/recovery path. Tooltip: “Copy this draft to work on it with an agent or coworker”. Success says “Draft copied”, not “Shared”. No clipboard write, network transmission or agent invocation occurs automatically.
5. **Progressive details.** Put file location, source checks, raw metadata and Delete behind Page details. Destructive confirmation and canonical preconditions remain unchanged. Essential save failures and recovery never hide inside Details.

## Finite implementation scope

- Recompose existing note/header markup and styles; preserve IDs where browser integrations rely on them.
- Add small presentation helpers for response recognition, keeping a confirmed metadata snapshot in document UI lifecycle state. Refresh only from accepted GET/PUT snapshots belonging to this document/scope; clear on navigation/brain switch. No provenance hydration from a watcher read rejected because the draft changed.
- Reuse document action copy/recovery and existing protected delete flow.
- Keep current Markdown, concurrency, remote write consent, autosave and external watcher behavior.

## Exclusions and limits

No real-time avatars/cursors, online status, comments, notifications, permission editor, invitations, revision browser, block attribution or automatic AI sidebar. No implied team sync. Last editor is latest declared provenance, not a contributor list or audit trail. A local copied draft is not an access-granting shared link. No new backend endpoints or CLI behavior.

## Accessibility and trust

Visible Copy draft and Page details labels, native disclosure semantics, explicit `aria-expanded`/`aria-controls` if a toggle is used, keyboard focus return, 32px desktop and 40px narrow targets, visible focus rings and no hover-only operations. Keep concise live save announcements; actor/date changes should not repeatedly interrupt typing. Reduced Motion preserves existing static update cues. All document text renders through `textContent`; names and paths wrap or truncate with complete accessible details. Loading/failed reads cannot show the prior page's actor or location.

## Acceptance criteria

1. A nontechnical writer can see a clean note is saved, copy the exact current title/body, and open details without deciphering an icon; copying never changes Markdown, triggers a save, or transmits content.
2. External changes during a dirty draft preserve the draft and canonical precondition; overlapping changes retain both versions and expose Review changes outside the disclosure. Accepted clean updates refresh actor/date context; rejected/stale reads never do.
3. At 1280px and 390px in light/dark themes, long titles/actor names/paths cause no horizontal page overflow, all controls remain keyboard reachable, and unknown provenance never becomes “You” or “Agent” through inference.

## Main tradeoff

This direction solves trust and handoff pains more directly than long-document navigation. The metadata lifecycle is easy to get subtly wrong; if implementation time is tight, ship document-local save/copy/details first and omit actor context until accepted-snapshot propagation is verified. A minimal truthful UI is preferable to stale attribution.
