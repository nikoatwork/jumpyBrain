# Local CLI builds and versioning

This is a maintainer/dogfood workflow. New users should use the installer in [`install.md`](install.md). Use local tarball installs for dogfooding instead of relying only on `npm link`. Each tarball has a package version, and the test repo can pin that exact CLI in its lockfile until you intentionally upgrade.

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

This creates `.local-pack/jumpybrain-<version>.tgz` and `.local-pack/latest.json`. The pack script runs `npm pack --json`, inspects the actual tarball with `tar -tf`, and verifies the built package contains the CLI plus current modular runtime files, including:

- `dist/cli.js`
- `dist/cli/local-transport.js`
- `dist/core/index.js`
- `dist/runtime/index.js`
- `dist/qmd/index.js`
- `dist/server/index.js`

It also rejects stale pre-refactor files such as `dist/retrieval/qmd-driver.js`.

## Install into a dogfood repo

From the jumpyBrain repo:

```bash
npm run cli:install:local -- /path/to/first-repo
```

The install script reads `.local-pack/latest.json`, installs the verified tarball as a dev dependency, and checks that `node_modules/.bin/jumpybrain` plus the required runtime files were installed.

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

Avoid reusing the same package version for different tarball contents; npm and lockfiles behave better when every dogfood build has a unique version. Generated `.local-pack/` tarballs and metadata are local build artifacts and should not be committed.
