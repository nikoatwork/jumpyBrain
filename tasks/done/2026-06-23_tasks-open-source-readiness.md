# Open Source Readiness

## Goal

Prepare jumpyBrain for a public GitHub repository now, while keeping npm publication as a later follow-up. Remove internal task history from public history, complete basic release hygiene, and run a deliberate screening pass before publishing.

## Notes

- Decision: public GitHub repo first; npm release later.
- Decision: keep `AGENTS.md` public.
- Decision: add a standard MIT `LICENSE` file matching `package.json`.
- Decision: `tasks/` should be gitignored and removed from public git history, not merely deleted in a later commit.
- Pause before destructive history rewrite or force-push steps.
- Current smoke checks already run: `npm test` passes; tracked-tree secret grep found no obvious real secrets; `npm pack --dry-run` includes expected npm package files after build.

## Relevant Files

- `.gitignore` - Public repo exclusion rules for tasks/local/generated data.
- `package.json` - Package metadata and future npm readiness.
- `README.md` - Public-facing positioning and quick start.
- `docs/install.md` - Install guidance should match public repo / later npm shape.
- `AGENTS.md` - Public agent/contributor guidance to keep.
- `tasks/` - Internal planning history to remove from public history.

## Tasks

- [x] 1.0 Complete non-destructive public repo hygiene
  - [x] 1.1 Add standard MIT `LICENSE` file.
  - [x] 1.2 Review `README.md` and install docs for public GitHub wording; keep npm release framed as future if needed.
  - [x] 1.3 Review `package.json` metadata for public repo readiness; defer npm-only changes where repo URL/package scope is unknown.
  - [x] 1.4 Keep `tasks/` ignored and verify generated/local/private-ish paths remain ignored.

- [x] 2.0 Screen current tree for public safety
  - [x] 2.1 Run deterministic secret-ish grep over tracked files and review matches.
  - [x] 2.2 Run a full-tree scan excluding dependencies/build/cache to catch accidental local files.
  - [x] 2.3 Review tracked files for internal references that are easy to remove outside `tasks/`.
  - [x] 2.4 Run `npm test` and `npm pack --dry-run` as release-shape checks.

- [x] 3.0 Plan and execute task-history removal safely
  - [x] 3.1 Confirm preferred history rewrite tool/flow available locally (`git filter-repo`, BFG, or fresh public branch export).
  - [~] 3.2 Back up current branch/tag before rewriting history - Skipped per user: no need to split away from `master`.
  - [x] 3.3 Remove `tasks/` from git history and keep it ignored going forward.
  - [x] 3.4 Re-run public safety scans after history cleanup.
  - [x] 3.5 Document required remote publish/force-push steps without executing them unless explicitly approved.

- [x] 4.0 Final publication checkpoint
  - [x] 4.1 Summarize remaining risks and any files intentionally kept public.
  - [~] 4.2 Add a completion entry to `tasks/CHANGELOG.md` before `tasks/` is removed from public history, if useful for private continuity - Skipped: `tasks/` is now private/ignored and removed from public history.
  - [x] 4.3 Ask for approval before archiving this task list or performing irreversible git operations.

## Findings

- `npm test` passes: 21/21.
- `npm pack --dry-run` includes `LICENSE`, `README.md`, `dist/`, and docs after build.
- No obvious real secrets found in deterministic grep results; matches are expected code/docs uses of token/secret words.
- No easy internal `jumpyGoat`/local-user references found outside `tasks/`.
- `git filter-repo`/BFG are not installed; used `git filter-branch` for an in-place history rewrite.
- `tasks/` is ignored and no longer tracked; `git log --all --name-only` shows no `tasks/` paths after cleanup.
- Committed public hygiene changes on `master`; after history rewrite the public tip is `b6c1d75` (`Prepare repo for public source release`).
- Removed `refs/original`, expired reflogs, and ran `git gc --prune=now --aggressive` so local backup refs do not retain task history.
- Post-cleanup `npm test` passes: 21/21.
- Post-cleanup `npm pack --dry-run` includes expected package files and `LICENSE`.
- Post-cleanup tracked-tree scans still show only expected token/secret wording in code/docs, not obvious real secrets.

## Publish Notes

- For a new public GitHub repo: add the new remote and push `master` normally, e.g. `git remote add origin <url>` then `git push -u origin master`.
- If publishing over an existing remote with old history, use a force push only after confirming collaborators/consumers are ready, e.g. `git push --force-with-lease origin master`.
- Do not push ignored local directories: `tasks/`, `.dogfood-memory/`, `.local-pack/`, `benchdata/`, `bench-results/`, `.bench-tmp/`, `dist/`, or `node_modules/`.

## Completion Summary

Completed public repo readiness cleanup: added MIT license, updated source-install docs, verified tests/package shape/scans, removed `tasks/` from public git history, cleaned local rewrite backup refs/reflogs, and documented publish notes.

## Blockers

- None.
