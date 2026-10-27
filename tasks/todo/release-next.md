# Changes

- Faster Mac update preparation by reusing verified, unchanged native helpers and removing repeated SDK scans, with fresh-build fallback and private phase timings.
- Notes show up to five related pages from bounded shared search, with conservative relevance filtering and guarded, brain-scoped navigation.
- Confirmed feedback submissions close the dialog and show a shared thank-you toast; failed or unconfirmed submissions retain the draft for retry.
- Installation guidance now matches the sidebar update icon and dedicated startup recovery surface.
- Find text in the current note with Command-F, highlighted matches and next/previous navigation, without changing Markdown or undo history.
- Simplified note deletion and expired-session recovery, added shared hover/focus action labels, and kept Command-K results in one compact list.
- Editor: readable pipe tables with an editable Markdown disclosure and exact source preservation; valid bold already renders, while ambiguous spaced delimiters stay literal. [Details](../done/2026-10-27_tasks-markdown-bold-tables.md).
- Page references hide brackets while reading and reveal faint markers while editing, preserving canonical Markdown and navigation. [Details](../done/2026-10-27_tasks-quiet-page-references.md).
- Formatting slash commands offer Text, H1–H3, bold, italic, checkbox, inline code and code block through existing history/save operations. [Details](../done/2026-10-27_tasks-editor-slash-commands.md).
