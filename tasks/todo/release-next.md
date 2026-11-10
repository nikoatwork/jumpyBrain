# Changes

- The editor uses a smaller bundle and one live editing session, with clearer offline retry, draft recovery and generation outcomes while preserving private drafts and Undo.
- Saved agent edits appear quietly; retained versions stay available for comparison. Related pages remain visible while typing, and renaming recovers normally after clearing a title.
- Ordinary Markdown bullets render emphasis and safe web links. Task checkboxes align with their text, and narrow layouts keep the selected note visible.
- Exact-title search stops using stale tab overlays once indexing is verified fresh. Search warnings stay on search surfaces instead of covering later note confirmations.
- The graph shows dashed inferred connections when local semantic indexing is ready; imported-note relevance still needs improvement.
- Failed update checks no longer revive outdated install offers. Invalid remote save receipts remain unconfirmed, and invalid live operation fields are rejected without replaying writes.
- Agent guidance supports authorized concurrent editing through source-range edits and resync, without asking the user to stop typing.
