# Changes

- The Mac editor now reconnects automatically after a dropped request instead of getting stuck on "Your session ended", keeping your work in the same tab.
- Remote brain access keys are now saved in `~/.config/jumpybrain/.env` (readable only by you) instead of macOS Keychain, so app updates no longer ask for them again. The CLI uses the same key for that address automatically. After this update, re-enter each remote key once in Settings.
- Markdown links to other notes, like `[Plan](../pages/plan.md)`, show an underlined “Plan” and open that note when clicked. Move the cursor into a link to reveal its Markdown and edit the path; moving away shows the label again.
- The editor downloads about a fifth less code (roughly 184 KB instead of 224 KB compressed), reducing its download size on slow connections.
- Settings now opens as a large card over the app instead of taking over the sidebar. Press Esc (or click outside) to close it, and Cmd+F to search all settings.
- Shared brains: admins can now create and revoke access keys for teammates and agents in Settings → Access keys, in the browser under Connection settings, or with `jumpybrain access … --target-url`. Each new key is shown once with a ready-to-send invite. Brains on your own Mac still need no keys.
- Renaming a drawing now updates `[[Name.excalidraw]]` mentions in your notes, and drawing names show up when you type `[[` (or `@` on the Mac) in a note.
