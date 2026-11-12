# Changes

- The Mac editor no longer gets stuck on "Your session ended" after the laptop sleeps or the connection drops briefly. It reconnects by itself (or when you return to the window) and keeps your work.
- Remote brain access keys are now saved in `~/.config/jumpybrain/.env` (readable only by you) instead of macOS Keychain, so app updates no longer ask for them again. The CLI uses the same key for that address automatically. After this update, re-enter each remote key once in Settings.
