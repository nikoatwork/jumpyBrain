# Changes

- Several people can now type in the same passage at once without anyone being stopped by "Changes need review": overlapping edits merge, and two people typing at one spot no longer interleave letters.
- Renaming a note works while others are typing and no longer loses a space typed before a pause; simultaneous renames settle on the last one.
- Shared brains make far fewer requests while people type, so the sidebar and search stay available behind a rate-limiting proxy, and opening a note recovers by itself from a briefly busy server.
