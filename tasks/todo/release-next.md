# Changes

- CLI help supports `--help`, `-h` and `help <command>` for commands, namespaces and recipes without running operations. Root help is shorter; plain retrieval and other operational commands reject misspelled, missing and repeated flags.

- Clearing a fresh note through its empty heading and blank lines saves reliably; editor failures use plain-language, dismissible recovery toasts.

- Editor section indicators are half as wide, with thicker H1 and H2 marks to make heading levels easier to distinguish.
- Editor attribution moves from sidebar icons to a floating saved-note hint when selecting text; unavailable section history stays explicit.
- Set your display name during Mac onboarding or in Settings, shared with CLI identity setup; agent writes can show owner-prefixed client labels such as Alex · Codex.
