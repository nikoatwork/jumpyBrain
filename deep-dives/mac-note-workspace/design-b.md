# Direction B — A document with its bearings

## Primary pain solved

A useful note is currently an island while writing. The sidebar lists other notes, but it does not explain the structure of the current document. Related pages are buried after an editor whose minimum height is 55vh and whose column has substantial bottom padding. The only document details disclosure is labeled `Metadata · read only` and exposes raw frontmatter. A person reviewing an agent-produced doc needs quick answers to “where is the section I need?”, “what is connected to this?”, and “what did I actually save?” without opening the graph or learning YAML.

## The design

Keep the writing column as the primary surface. Add one labeled **Page details** toggle in the note's top action row. It opens a quiet contextual rail on wide windows, or a disclosure above the body on narrow windows. Opening it is a local view preference; it never writes a note or changes permission.

The rail contains:

1. **On this page** — a live outline of actual supported headings in the draft. Selecting one scrolls and focuses the existing heading without replacing editor DOM or changing its text. Distinguish repeated headings by position. Unsupported literal blocks must not become fake headings.
2. **Connected pages** — the existing bounded related-page results, with explicit canonical links labeled separately from suggestions where the controller can distinguish them. Preserve current freshness abstention, save navigation guard, scope fences and native modified-click behavior. No empty suggestions filler.
3. **Page details** — plain-text location and a link/disclosure to existing raw metadata for advanced readers. Show only existing trustworthy facts; do not infer current collaborators from stored actors.
4. **Sources** on Dream pages — reuse the existing explicit source-version check disclosure. The action remains disabled while dirty and retains partial-coverage language.

The outline and links become useful at the point of work without adding a second workspace, project tree or database UI. The rail closes with the same button, and Escape may close it only when focus is inside it and no higher-priority modal owns Escape. Opening does not move the caret; keyboard activation can move focus to the rail heading. Closing from within returns focus to Page details.

## Wireframe

```text
[ Back Forward ]                                      [Saved]

                  [Page details]             [Copy] [More…]
                  Product launch plan         ┌──────────────────┐
                                              │ On this page     │
                  [Text  H1  B I ...]          │ Overview         │
                                              │ Launch checklist │
                  Overview                    │ Open questions   │
                  We are preparing...         │                  │
                                              │ Connected pages  │
                  Launch checklist            │ Messaging        │
                  ...                         │ Release decision │
                                              │                  │
                                              │ Page details ▸   │
                                              └──────────────────┘
```

Narrow window: the same rail becomes an inline region between title controls and formatting, with its own heading and ordinary scrolling. Never squeeze the writing column into an unusable side-by-side layout.

## Feasible first implementation

- Framework-free controller in the existing browser adapter, exported by browser-entry.ts, installed by notes-browser.ts.
- Derive outline from the mounted rich editor's actual supported heading elements, not a second Markdown parser. Associate transient targets with DOM identity and rebuild only when the heading signature changes. Listen to normal editor changes and fence/reset on document navigation.
- Move existing related-pages and source/metadata DOM into the contextual container, keeping IDs/controller ownership unchanged. Initial implementation may retain `Related pages` as one group rather than invent proof of backlinks from search results.
- Keep this independent of canonical writes, CLI commands, search indexing and any cloud API.

## Exclusions and risks

No invented real-time coworker presence, comments, change history, block attribution, agent runs or task assignments. No implication that related suggestions are citations. No automatic source check, agent request or shared-memory write. A persistent right rail costs writing width, so it must be opt-in and collapse below a generous width breakpoint. If the implementation budget is tight, prioritize the outline plus a compact existing-related-links section and leave raw metadata at the bottom rather than create a large information architecture rewrite.

## Accessibility and trust

Use a real button with aria-expanded and aria-controls; a named complementary region on desktop and a named section on narrow layouts. Outline is a list of buttons/links with visible keyboard focus and descriptive labels. Heading activation must not trigger autosave. Reduced Motion disables smooth scrolling. Keep save failures and external-change/review affordances outside the collapsible rail so trust-critical state cannot disappear. Use existing palette/type/spacing tokens and minimum touch targets.

## Acceptance criteria

1. With a 3,000-word doc containing eight supported headings, a keyboard user reaches and returns from any section through Page details without opening global Search or altering canonical Markdown; repeated headings navigate to distinct correct targets.
2. At 1280px, a closed rail retains today's full writing width. At 390px and 320px, opening details produces no horizontal scrolling, clipped controls or hidden save/review feedback, in both built-in light and dark themes.
3. Switching notes or brains while outline/related work is pending never exposes the former note's heading targets or related links. Following a related link with an unsaved/conflicting draft uses the existing save barrier and preserves the draft on failure.
