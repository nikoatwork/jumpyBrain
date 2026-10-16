# Memory Document Editing Task List

Status: complete and archived on 2026-07-04.

## Summary

Implemented ID-addressed, optimistic-concurrency whole-document editing for canonical Markdown memories across local runtime, CLI, HTTP server, and remote CLI transport. Validation covered deterministic unit/integration/smoke tests, package/architecture checks, local real-memory validation, and deployed/global memory validation.

## Completed tasks

- [x] Add shared backend-agnostic `mem_<uuid>` document ID helpers and stamp IDs on new local and remote writes.
- [x] Preserve and create IDs for synthesized `pages/` documents.
- [x] Add explicit `process --mode ensure-ids --apply` maintenance operation for local/server-side ID stamping.
- [x] Define document edit contract types, content-hash semantics, error codes, and public docs.
- [x] Implement canonical bucket-only document ID lookup and exact-content reads.
- [x] Implement protected whole-document replacement with optimistic metadata policy and atomic same-directory writes.
- [x] Expose local document read/update/stamp operations through app and runtime boundaries.
- [x] Add local CLI `show` and stdin-driven `update` commands.
- [x] Add authenticated remote document read endpoint.
- [x] Add authenticated remote document update endpoint with `If-Match` concurrency and stale-index behavior.
- [x] Wire remote HTTP client and CLI show/update transports.
- [x] Add deterministic local and in-process remote end-to-end edit-loop smoke tests.
- [x] Update architecture, memory-format, cloud/shared-memory, agent workflow, and CLI usage documentation.
- [x] Run package and architecture validation with `npm run validate` and `npm run cli:pack`.
- [x] Validate the just-built CLI against the agent local memory root without committing local-only artifacts.
- [x] Validate hosted/global memory editing through the supported CLI workflow without logging secrets, host details, private paths, or memory bodies.
- [x] Finalize task archive and changelog.

## Validation notes

- Deterministic repository tests passed through `npm run validate` after implementation and real-memory validation.
- `npm run cli:pack` passed and produced ignored local package artifacts under `.local-pack/` only.
- Local validation stamped missing IDs, edited one validation document by ID and hash, verified hash/content changes, stale-hash rejection, and indexed recall/search discoverability.
- Deployed/global validation stamped IDs through the operator path, edited one validation document by remote ID and `If-Match`, verified hash/content changes, stale-hash rejection, reindexing, and remote recall/search discoverability.

## Deferred non-goals

- Delete operations.
- Path-addressed editing.
- Collaborative editing, CRDT, or OT semantics.
- Browser UI and RBAC beyond the existing API-key authentication model.
