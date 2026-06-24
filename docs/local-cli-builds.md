# Local CLI builds and versioning

Use local tarball installs for dogfooding instead of relying only on `npm link`. Each tarball has a package version, and the test repo can pin that exact CLI in its lockfile until you intentionally upgrade.

## Build a versioned local CLI

From the jumpyBrain repo:

```bash
npm run cli:version -- prerelease --preid local
npm run validate
npm run cli:pack
```

Or do all three:

```bash
npm run cli:release:local
```

This creates `.local-pack/jumpybrain-<version>.tgz` and `.local-pack/latest.json`.

## Install into a dogfood repo

From the jumpyBrain repo:

```bash
npm run cli:install:local -- /path/to/first-repo
```

Or from the target repo, use the command printed by `cli:pack`:

```bash
npm install -D /path/to/jumpyBrain/.local-pack/jumpybrain-<version>.tgz
npx jumpybrain --version
```

Repos with a `memory/jumpybrain.json` can use recipe commands without repeating `--root`:

```bash
npx jumpybrain run memory:status
echo "Durable project memory." | npx jumpybrain run memory:remember --type finding --title "<short title>"
npx jumpybrain run memory:recall --topic "<current task/topic>" --limit 5
```

`run` discovers `memory/` by walking up from the current directory, so it also works from nested workspaces when the CLI is available.

## Upgrade flow

1. Make jumpyBrain changes.
2. Run `npm run cli:release:local` to bump to a new local prerelease and pack a new tarball.
3. In the dogfood repo, install the new tarball.
4. Run `npx jumpybrain status --root <memory-root>` before writing or recalling memory.

Avoid reusing the same package version for different tarball contents; npm and lockfiles behave better when every dogfood build has a unique version.
