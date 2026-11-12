# Changes

- The Mac editor no longer gets stuck on "Your session ended" after the laptop sleeps or the connection drops briefly. It reconnects by itself (or when you return to the window) and keeps your work.
- Remote brain access keys are now saved in `~/.config/jumpybrain/.env` (readable only by you) instead of macOS Keychain, so app updates no longer ask for them again. The CLI uses the same key for that address automatically. After this update, re-enter each remote key once in Settings.
- Links to other notes written as Markdown file paths, like `[Plan](../pages/plan.md)`, now show as an underlined “Plan” in the editor, with the path on hover, and open that note when clicked.
- To change where a link points, move the cursor into it: the link shows its full Markdown, `[Plan](../pages/plan.md)`, so you can edit the path in place. Moving away shows just “Plan” again. Clicking a link still opens it.
- The editor downloads about a fifth less code (roughly 181 KB instead of 224 KB compressed), so notes open a little faster on slow connections.
- Settings now opens as a large card over the app instead of taking over the sidebar. Press Esc (or click outside) to close it, and Cmd+F to search all settings.
- Shared brains: admins can now create and revoke access keys for teammates and agents in Settings → Access keys, in the browser under Connection settings, or with `jumpybrain access … --target-url`. Each new key is shown once with a ready-to-send invite. Brains on your own Mac still need no keys.
