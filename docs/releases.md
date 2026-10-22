# Releases

Use `npm run release` after committing the work to release. It defaults to a **patch** bump: `0.3.0 → 0.3.1`. Ordinary Git commits do not release automatically; this command owns the version commit, annotated tag, push, and GitHub release together.

## Batch release routine

Accumulate commits between releases. Default to **at most one published release per Europe/Berlin calendar day**, and skip days without worthwhile ready changes. Release only when the user asks to ship; a second release on the same day requires an explicit override, such as an urgent fix. This is an agent/manual convention, not a timer or a rate limit enforced by the script.

Keep [the pending release note](../tasks/todo/release-next.md) short: a `# Changes` heading and roughly 3–7 user-facing bullets. Add or consolidate a bullet when completed work changes user behavior; skip routine refactors, tests, and planning edits. Several commits can share one bullet. Do not reserve a version or bump manifests while accumulating work. Task lists retain implementation and test evidence; `tasks/CHANGELOG.md` remains the selective project history.

When asked to release:

1. Check published releases with `gh release list --limit 10 --json tagName,publishedAt,isDraft,isPrerelease`. Count beta prereleases too, ignore drafts, and compare publication dates in Europe/Berlin. If one shipped today, keep accumulating unless the user explicitly overrides the daily limit.
2. Fetch `origin/master` and tags. Review changes since the latest published numeric release, not just the version in this checkout. Reconcile divergent release history and version metadata before choosing the next patch; preserve unrelated unfinished work in a separate checkout. Do not discard published fixes or select an existing tag.
3. Review `tasks/todo/release-next.md` against the exact release snapshot. Keep only changes included in this release and retain deferred bullets in the original workspace if using a separate checkout. Exclude placeholders, internal operational notes, and unverified claims. Commit the curated note and all intended work before running the command.
4. Complete the [core-flow release tests](release-testing.md) on the agreed snapshot and record the result. Run `npm run release -- --dry-run`, then the full `npm run release` workflow below. The dry run checks local readiness only; it does not verify remote publication dates or authorization. Verify the published tag, notes, and distribution asset before marking the release shipped.
5. After successful verification, move the **exact published notes** into `tasks/done/releases/vX.Y.Z.md`, reset the pending file to `# Changes` plus any deferred bullets, and commit that bookkeeping separately. Do not overwrite an existing archive, archive failed publication, or clear notes for unshipped changes. An empty pending note means there is nothing queued; do not release its heading alone.

Historical notes in `docs/releases/` stay in place. New completed release notes live in `tasks/done/releases/`. GitHub's verified release and asset are the publication record; an archive file alone is not proof that a release shipped. There is no need to create an archive entry for every commit.

## Release command

- `npm run release -- --dry-run`: preview without modifying files or publishing.
- `npm run release`: patch release for normal fixes and incremental changes.
- `npm run release -- minor`: explicitly chosen larger feature release, such as `0.3.1 → 0.4.0`.
- Major changes, **especially 0.x → 1.0**, require the user's explicit involvement and approval. Only after that approval use `npm run release -- major --approve-major`. Agents must never supply this flag on their own or bypass the gate with `npm version` or an exact version. An exact version passed to the scripts is subject to the same gate.

All 0.x releases are beta GitHub prereleases. Numeric versions remain `major.minor.patch`; `(beta)` is shown in the browser brand and native App submenu. A 1.0 graduation must also deliberately review/remove these UI labels; crossing the major gate does not silently declare the app production-ready.

The release command requires a clean `master`, a writable `origin`, and `gh` authenticated as an account with write access to this repository (SSH push access alone is insufficient). Account permissions are checked before changing the version. It fetches remote tags, rejects remote divergence and existing version tags, bumps the root and Electron package.json/package-lock.json together, runs `npm test`, builds/validates the tarball, creates the release commit/tag, atomically pushes branch/tag, then publishes a GitHub release with the tarball. It uses the curated `tasks/todo/release-next.md` if present, otherwise legacy `docs/releases/vX.Y.Z.md`, otherwise generated GitHub notes. A present pending note must contain at least one bullet. No npm publication or machine-specific native app bundle is uploaded.

The CLI installer still tracks its recorded Git source/ref (normally master). The Mac GUI updater selects a published numeric release from the releases list, including 0.x prereleases; it never uses `/latest` or branch HEAD. The release must provide exactly one `jumpybrain-X.Y.Z.tgz` uploaded asset with a GitHub SHA-256 digest. Its compiled runtime, Electron sources/lockfile, updater, native build sources, and resources supply the entire update. Pack validation rejects missing desktop resources and nested Electron node_modules. No native auto-update feed is assumed.

GUI updates record the selected release/asset/digest in the managed CLI manifest but preserve its original source/ref policy. Subsequent explicit CLI updates still follow that policy. Local-source/pinned/unowned CLIs require the GUI's app-only choice. Distribution hashing authenticates bytes from the selected public GitHub release; it is not code signing or notarization.

## Default for release requests

When the user asks to “ship a new version”, “release”, or “bump a release”, complete the full `npm run release` workflow. Default to the next patch release unless the user specifies a minor release; major releases still require explicit approval.

- Bump the CLI/runtime and Mac app to the same version, including both package manifests and lockfiles.
- Validate the release snapshot, pack the distribution, commit the versions, create an annotated tag, push branch and tag, and publish the GitHub release with notes and its artifact.
- Verify the published release and artifact before reporting it shipped. A Git push, a CLI-only version bump, or a local install alone does not complete a release request.
- Use a clean checkout for the agreed release scope when unrelated work is uncommitted; preserve that work. Do not silently include unfinished features to satisfy the clean-tree check.
- Reserve `cli:version` and `cli:release:local` for explicitly requested local CLI/dogfood builds. Updating an installed app is a separate operation from publishing a release.

Ordinary commits and documentation updates still do not automatically trigger releases. This policy governs an explicit release request.

## Recovery

Failure stops subsequent steps and retains evidence; the script never resets commits, deletes tags, force-pushes, or retries publication automatically.

- Before the release commit: inspect the failure, fix it, and either complete validation/version commit deliberately or restore only the version metadata before rerunning. Do not blindly bump again.
- After a local commit/tag but before a successful push: resolve the remote/auth problem and push that same commit/tag atomically.
- After push but before GitHub publication: inspect `gh release view vX.Y.Z` first. If absent, create it for the existing tag with `--verify-tag`, the validated `.local-pack` tarball, release notes, and `--prerelease` for 0.x. Read the pending notes from that release tag, not a newer working copy. Never overwrite a published tag or recreate an existing release.
- After publication but before notes archival: verify the existing release, archive its exact published body, and remove only the shipped bullets from the pending note. This is bookkeeping; do not run another version bump.

`npm run cli:version` also defaults to patch and enforces the major gate, but only changes local version metadata. `npm run cli:release:local` bumps, validates, and packs without committing, tagging, pushing, or publishing.
