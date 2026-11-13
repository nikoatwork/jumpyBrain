# Changes

- Access keys appears last in the Settings navigation.
- Access keys in the Mac app now says that you are managing the server's keys from this device, and that the keys are kept on the server.
- Drawings opens a compact, expandable list of existing drawings; create a new drawing explicitly from that list.
- Task checkboxes now render for agent-written lines with symbols like `->`, `[P1]` or `~`, for `*`/`+` tasks, tasks under a bullet, and nested lists imported from Obsidian; checking a box changes only that box in your Markdown.
- When a remote brain rejects your access key, the CLI now says which key it used (where it came from and its last four characters, never the key itself), any other keys it found, and how to fix it; `jumpybrain status --target-url` shows which key was accepted.
- Notes written by agents no longer repeat their title as a heading at the top of the body; the title appears once.
