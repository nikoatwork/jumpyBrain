# Repository root cleanup

## Goal

Reduce the GitHub root listing by grouping reference material under docs and container definitions under deploy, preserving public installation and SDK paths.

## Outcome

Completed 2026-11-17 against working-tree changes based on `950fd6a710478b5907eba9274b354fee394372d4`. The tracked GitHub root listing shrank from 27 to 23 entries. Public installer/SDK paths and standard project entrypoints remain stable. Updated relative links, research-script imports, benchmark paths, the production-verifier default, npm exclusions and container build commands. Existing Coolify applications need the documented Dockerfile path update.

## Decisions

- Move `glossary.md` to `docs/glossary.md` and `deep-dives/` to `docs/deep-dives/`.
- Move both Dockerfiles to `deploy/`; build context remains the repository root.
- Keep standard Node/TypeScript files, README, LICENSE, public install scripts and SDK entrypoints at root.
- Leave ignored personal/local files untouched; they do not affect GitHub's listing.
- Keep historical JSON evidence and frozen contract pins byte-identical; their recorded original paths remain historical. Update the policy document's example command only.
- Exclude relocated research and glossary from npm downloads. Add the feedback relay script to Docker's explicit context allowlist so its relocated Dockerfile can build.

## Tasks

- [x] Move files and repair links, imports, script paths and deployment instructions.
  - Proof: audited 558 moved/updated Markdown links with zero new missing targets; all nine relocated research-script imports resolve. Both Dockerfiles retain their exact original bytes.
- [x] Verify moved references and the focused container/distribution boundary; reread the diff.
  - Proof: `npm run build`; `node --test --test-name-pattern="supported distribution entrypoints" test/install-scripts.test.js` (1 pass); `node --test test/package-footprint.test.js test/multiplayer-production-gate.test.js` (15 passes); `git diff --cached --check`. Reviewed the complete content diff separately from pure renames.
  - Proof: `npm run smoke:hosted` passed on Linux/arm64, Node v22.23.5, QMD 2.8.3: context privacy, real lexical index/recall, scoped credentials/rotation, graceful replacement, exact-byte backup/loss/restore. Final input digest `2ca3d2a2a9d3a088ba1b9f33352e3bb3b45ea517a4c6d7b7338bce6677c08a61`; image `sha256:a7b063c18f49116e467b04f03c17e45111854cea2a031b592de009729650452d`.
  - Proof: `docker build -f deploy/Dockerfile.feedback -t jumpybrain-feedback-layout-check .` and a disposable container health check passed with `deliveryConfigured:false`; no feedback was sent. Temporary images/containers were removed.
- [x] Record results and limits, update the changelog, archive and commit.
  - Proof: archived this list, added the structural changelog entry and pending deployment migration note; committed together with scoped changes (commit reported in the final response).

## Relevant files

- `docs/glossary.md`, `docs/deep-dives/**` — relocated reference material.
- `deploy/Dockerfile`, `deploy/Dockerfile.feedback`, `.dockerignore` — container definitions and context allowlist.
- `scripts/hosted-container-smoke.mjs`, benchmark/verification scripts, affected tests — moved path consumers.
- README, affected documentation/task links and `tasks/CHANGELOG.md`.

## Limits

No live deployment, installation, push or release was performed. Full browser/product suites, semantic retrieval and historical performance benchmarks were not rerun: this change moves support material and paths without changing application behavior. Original production contracts/evidence were not regenerated; no new production equivalence attestation is claimed. Docker Desktop was started to run the disposable container checks.
