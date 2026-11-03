# Installation storage and rollback

New installs register their disposable software in a private, versioned
`<install-root>/software-retention.json` ledger. After verified completion,
normal installation and managed Mac app startup remove superseded owned copies.
They preserve the installed software, one rollback copy of each replaced
component, live runtimes and unfinished recovery. No scheduled service is added.

## Inspect or retry cleanup

From a checkout:

```sh
npm run storage -- --preview
npm run storage -- --apply
```

From the default installed CLI package:

```sh
node "$HOME/.jumpybrain/app/scripts/installation-storage.mjs" --preview
node "$HOME/.jumpybrain/app/scripts/installation-storage.mjs" --apply
```

`--preview` is the default and writes no files, pins or retirement markers.
`--apply` takes the same installer lock as installation, then replans and checks
identities and references before deletion. An active/unknown installer lock
defers cleanup; the command never removes it. For isolated/custom installations,
pass `--home <home>` and/or `--install-root <root>`. Python 3.9+ with `fcntl` and
descriptor-relative filesystem operations is required for maintenance. Missing
Python defers cleanup without invalidating an otherwise verified CLI install.

The JSON report identifies current software, rollback paths and versions,
eligible/protected entries, unknown ownership, incomplete size coverage, the last
cleanup result and retry guidance. It contains no note bodies or credentials.
Logical bytes sum `lstat` sizes, including directory entries; allocated bytes sum
`st_blocks * 512`, without following symlinks. These are file accounting values,
not measured free-space recovery. APFS clones, compression and hardlinks affect
physical storage; unknown historical trees are unmeasured.

## What stays

The soft budget is **2 GiB of retained software/history**, excluding the current
installation, models and user data. It is guidance, not a hard application-size
cap. A representative arm64 packaged app is about 317 MB of logical files;
keeping its app/CLI predecessor fits comfortably below this allowance. Protected
references can exceed it. The report names the reason and next retry; cleanup
does not stop a backend to meet the budget.

Rollback references are shared across installers. A combined updater/dogfood
operation publishes app and CLI references together. A partial replacement
changes only the replaced component's reference; the other component stays
available. Components can therefore refer to two receipts without retaining a
separate full rollback for every installer. The new references become durable
before predecessors are retired. A superseded dogfood receipt loses its obsolete
directory pointer before cleanup. Rollback refreshes the retained generation's
identities; a lost completion response cannot reselect a stale predecessor.

| Producer | Owned software | Completion and retry |
| --- | --- | --- |
| Published updater | `jumpyBrain Updates/update-*` | Verified success/recovery; later managed app startup or install |
| Desktop/combined setup | `jumpyBrain Backups/before-*.tar.gz`, hidden app transaction | Verified archive and publication; later startup/install |
| Source/CLI-only installer | `app.previous-*` under that install root | Outer CLI verification; later install or explicit apply |
| Dogfood | `dogfood/candidate-*` | Verified install/rollback; later startup/install |
| Managed legacy companion update | `.companion-runtime-*`, `.companion-app-*` | Outer installer verification; later install/apply |

Terminal downloads and invocation scratch are removed when no recovery needs
them. Completed Electron build dependencies are discarded before publication;
the CLI retains the pinned lazy extension compiler. Source/dogfood installs prune
root development dependencies after building. Explicit build-only output and
immutable package/evaluation artifacts belong to their caller and are excluded.
The fixed default desktop build output uses a nonblocking artifact lock and
checks the old app/runtime generation and pins before replacement; a busy, legacy
or unsafe artifact is retained, with guidance to choose an empty output path.

Live PID pins, uncertain pins, old runtimes without the pin protocol, active
workers/children and incomplete journals prevent retirement. App-bundle fences
stay outside signed resources. Failed cleanup retains an identity-bound deletion
record and runtime fences for a later retry. Changed/missing fences or unsafe
trees require inspection. At most 256 generation receipts and 20 compact terminal
outcome receipts are admitted; the ledger is limited to 1 MiB, each payload scan
to 200,000 entries/64 levels, archive hash verification to 2 GiB per file and each
runtime to 256 pins. Reaching a bound defers
cleanup visibly. Full failed software/log trees disappear after their worker
exits; compact outcomes remain. Recovery records are never aged out.

## Ownership and recovery limits

Only exact paths registered by a producer, with installation/generation and
device/inode identities, are eligible. Filenames and age do not grant ownership.
Historical unmarked backups, manually copied apps, source checkouts and saved
evaluation runs are reported or excluded, never adopted automatically. Damaged
metadata, foreign ownership, hardlinked payload files and external symlinks retain
software for inspection. Internal bundle/npm symlinks can be unlinked safely.

Markdown, boards, indexes, models, credentials, profiles, drafts and note recovery
are outside this software policy. The installer lock precedes the advisory
cleanup lock; a verified live owner handoff avoids reacquiring its own lock.
Descriptor-relative deletion rejects linked/replaced directories. These guards
coordinate cooperating local installers, not malicious code running as the user.

Use **Recover previous installation** for an interrupted GUI update and
`npm run dogfood:rollback` for the current dogfood candidate. Source CLI rollback
receipts include the old runtime and manifest; desktop receipts identify the
verified tar archive of previous app/login files. Inspect those exact paths before
manual recovery, stop the app normally and preserve current user settings. This
command does not perform a new automatic cross-installer restore or restore notes.
