# Client display identity

## Responsibilities

Persist a device-local display name in `~/.jumpybrain/identity.json` (or the explicit `JUMPYBRAIN_IDENTITY_FILE` override). Desktop onboarding, Settings and CLI setup share this preference; it never selects a brain. Names are optional, trimmed and bounded to 48 characters. Empty clears the preference. Atomic private-file replacement makes the last completed update win. Renaming affects future declarations, never historical Markdown.

Compose owner-prefixed declared agent names, for example `Alex · Codex`. Callers still validate the final actor using canonical actor policy. No name is guessed from the OS user, account credentials or client process.

## Non-responsibilities

No authentication, authorization, verified identity, client discovery, memory writes, retained block history or synchronization across machines. A corrupt preference is reported, never silently attributed to someone else.
