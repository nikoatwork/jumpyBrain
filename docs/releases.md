# Releases

Use `npm run release` after committing the work to release. It defaults to a **patch** bump: `0.3.0 → 0.3.1`. Ordinary Git commits do not release automatically; this command owns the version commit, annotated tag, push, and GitHub release together.

- `npm run release -- --dry-run`: preview without modifying files or publishing.
- `npm run release`: patch release for normal fixes and incremental changes.
- `npm run release -- minor`: explicitly chosen larger feature release, such as `0.3.1 → 0.4.0`.
- Major changes, **especially 0.x → 1.0**, require the user's explicit involvement and approval. Only after that approval use `npm run release -- major --approve-major`. Agents must never supply this flag on their own or bypass the gate with `npm version` or an exact version. An exact version passed to the scripts is subject to the same gate.

All 0.x releases are beta GitHub prereleases. Numeric versions remain `major.minor.patch`; `(beta)` is shown in the browser brand and native App submenu. A 1.0 graduation must also deliberately review/remove these UI labels; crossing the major gate does not silently declare the app production-ready.

The release command requires a clean `master`, a writable `origin`, and `gh` authenticated as an account with write access to this repository (SSH push access alone is insufficient). Account permissions are checked before changing the version. It fetches remote tags, rejects remote divergence and existing version tags, bumps the root and Electron package.json/package-lock.json together, runs `npm test`, builds/validates the tarball, creates the release commit/tag, atomically pushes branch/tag, then publishes a GitHub release with the tarball. It uses `docs/releases/vX.Y.Z.md` if present, otherwise generated GitHub notes. No npm publication or machine-specific native app bundle is uploaded.

The CLI installer still tracks its recorded Git source/ref (normally master), not GitHub release assets. The desktop sidebar updater uses the published `jumpybrain-X.Y.Z.tgz` asset and its GitHub SHA-256 digest, including numeric 0.x beta releases. It builds the app locally, then offers an explicit save-protected restart. Keep the complete Electron packaging sources, lockfile, native helper sources, and compiled runtime in that distribution; no portable Mac binary feed is implied. Tags and release notes provide stable checkpoints. Local-source installations stay local-source installations until explicitly changed.

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
- After push but before GitHub publication: inspect `gh release view vX.Y.Z` first. If absent, create it for the existing tag with `--verify-tag`, the validated `.local-pack` tarball, release notes, and `--prerelease` for 0.x. Never overwrite a published tag or recreate an existing release.

`npm run cli:version` also defaults to patch and enforces the major gate, but only changes local version metadata. `npm run cli:release:local` bumps, validates, and packs without committing, tagging, pushing, or publishing.
