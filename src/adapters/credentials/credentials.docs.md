# Remote access keys

## Responsibilities

Store and resolve remote-brain access keys in one owner-only `.env` file shared by the Mac app and the CLI: `~/.config/jumpybrain/.env`. `JUMPYBRAIN_ENV_FILE` overrides the path for the CLI and tests only; the app's gateway runs with a scrubbed environment and always uses the default, so `XDG_CONFIG_HOME` is deliberately ignored.

- **App connections** (`createEnvFileCredentials`): the companion gateway's credential adapter. Each saved remote connection writes `JUMPYBRAIN_KEY_<REF>` and `JUMPYBRAIN_URL_<REF>`, where `<REF>` is the connection's opaque `credentialRef` UUID in upper case with underscores. Rotation replaces in place; removing a connection removes both lines. Writes are serialized, atomic (temp file + rename in the target's directory, following a symlinked file to its target), and leave the file `0600` in a `0700` directory. Unrelated lines and comments are preserved.
- **CLI targets** (`resolveRemoteKey`, `remoteKeyForUrl`): `JUMPYBRAIN_API_KEY` from the process environment wins (the file is then not read); otherwise the key saved for the same origin and path as `--target-url`; otherwise `JUMPYBRAIN_API_KEY` written in the file. `resolveRemoteKey` also returns the source (`environment`, `app-connection`, `env-file`), variable name and displayed file.
- **Diagnostics** (`remoteKeyCandidates`, `keyFingerprint`): after a rejection, list every key the CLI could use in precedence order, reporting an unreadable/insecure file as `fileProblem` instead of throwing. The fingerprint is the length plus the last four characters for keys of 16+ characters. CLI text lives in `src/cli/remote-credentials.ts`.
- **Safety**: reads refuse a file that group/other can access or that another user owns, with a `chmod 600` hint; a write repairs the mode. Errors name the file (home shown as `~`), never a key value.

## Non-responsibilities

No encryption, Keychain, OS secret store or cross-machine sync: the file is plaintext protected by file permissions, by owner decision (2026-11-12). Existing Keychain items are not migrated or read; users re-enter a key once. Loopback control tokens and local backend tokens are not stored here.

## Verification

`node --test test/env-file-credentials.test.js` (parser, permissions, atomic/serialized writes, symlinks, CLI precedence and sources, candidates, fingerprints, connection store against a real file) and the `.env` case in `test/macos-companion-gateway.test.js` (gateway save → file → authenticated request → restart → insecure-file refusal).
