# Branch and worktree cleanup

Completed 2026-11-05. Removed all 25 local side branches and 17 additional worktrees; only `master` and the main checkout remain. No production source changes or new feature merges were needed.

## Verification and decisions

- [x] Audit every branch and worktree, including tracked/untracked files, ignored local configuration, stashes and process references. Sixteen extra branch worktrees were clean; the detached RAM-validation checkout had 26 modified/untracked files. No stash entries or running-process references to these worktrees were found.
- [x] Preserve deleted branch tips in a verified, self-contained Git bundle outside the repository. Archive all 26 RAM-validation files and their binary tracked-file patch; compare each archived regular file byte for byte before removal. Preserve the old Ralph worktree's ignored agent instructions and iteration state together.
- [x] Remove all additional worktrees with Git, delete all local side branches, and prune worktree administration. Recheck each checkout status and branch tip against the initial audit immediately before deletion.
- [x] Verify exactly one local branch and one registered checkout, all 17 removed checkout paths absent, and the master tip unchanged by cleanup. Remote master remains an ancestor. Verify all 25 deleted branch tips against the bundle's recorded refs after cleanup.
- [x] Finalize this archive and commit only it and the changelog entry.

Sixteen side-branch tips were already ancestors of master. The nine ancestry exceptions were resolved as follows:

| Deleted branch | Integration / retirement evidence |
| --- | --- |
| `feat/sidebar-attention-refresh` | Exact tree retained in master commit `2719e2b`. |
| `t3/contextual-indexing-evaluation` | Exact tree retained in `4af6aeb`; both branch patches already present. |
| `t3/living-topic-pages` | Implemented in `28a7669`; comparison differs only by the separately integrated contextual-indexing archive and related documentation. |
| `t3/editor-markdown-references-slash` | Integrated as `fec89d2`, documented in the [feedback integration archive](2026-10-27_tasks-feedback-integration.md). |
| `t3/note-search-session-ux` | Integrated as `f535ef4`, documented in the same archive. |
| `t3/related-pages-feedback-usability` | Integrated as `b0a108d`, documented in the same archive. |
| `fix/consolidation-maintenance` | Obsolete history predating the initial public `8eac9ad` snapshot; completed maintenance implementation and [archive](2026-10-10_tasks-consolidation-maintenance-reliability.md) are retained. |
| `ralph/cli-runtime-modular-refactor` | Obsolete pre-snapshot history; the delivered runtime/CLI split is retained and superseded by the layered architecture. |
| `ralph/repository-architecture-cleanup` | Obsolete pre-snapshot history; layered architecture and [completed cleanup archive](2026-07-04_tasks-repository-architecture-cleanup.md) are retained. |

The existing source threads were already settled; this cleanup performed no new source-thread merge. No threads were reopened or newly settled.

## Recovery and limits

Local recovery directory: `/Users/monkey/.local/share/jumpybrain-cleanup/2026-11-05T081036Z`. It contains `branches.bundle`, `manifest.json`, `removed-worktrees.json`, `dirty-validation-files.tar.gz`, `dirty-validation.patch`, and the ignored Ralph configuration archive. The bundle is approximately 7.8 MB; saved RAM files are approximately 117 KB compressed. Build products, dependency installations and disposable QA output in removed worktrees were not archived. The main checkout and its ignored files were retained.

Tested repository snapshot: `99a534094a73f6e8e0413a07c94d1df57f12089a`. Verification covered Git ancestry, tree/patch integration evidence, branch-tip preservation, tar contents and final filesystem/Git inventory. Runtime tests were unnecessary because runtime files did not change. No push, installation or release.

## Deleted branch tips

| Branch | Original tip |
| --- | --- |
| `feat/agent-installation` | `553d75e56e2df4121c8b7546730a09af5df16394` |
| `feat/executable-extensions` | `b534792b7ef97a3c073901001b22d5287d37f7ba` |
| `feat/mac-note-workspace` | `ec661bb51bfacf8895ff1e66c779df017875d01e` |
| `feat/sidebar-attention-refresh` | `ed2971747baed6d1cc32dbaa4c95fdcc538e8865` |
| `feat/sidebar-updates` | `3bbb0f272a9df2cc67b49a379e460a32e5e0a9cd` |
| `fix/consolidation-maintenance` | `1afb950b5fde12e3cdd7a55c81058b12eeee4e40` |
| `plan/multiplayer-memory-architecture` | `80bb7f5c42cc38a655ab2e0539d190b8bc30ba7b` |
| `ralph/cli-runtime-modular-refactor` | `f1df1ebd5f0b33df5165e22d0e9b18eb0373ec32` |
| `ralph/repository-architecture-cleanup` | `2071adb00fa8b88cde09a67e088b4ccc631942e6` |
| `refactor/recent-commit-cleanup` | `5513f9288194b4d80d45c20cff1dc54a54f87ddd` |
| `t3/cli-help-validation` | `b79f1e61c1149300981f7fa3d533ac721c5c763f` |
| `t3/connections-targeting` | `081b2fcc766e0d0f3339ddd84a9c3a66ba39b576` |
| `t3/contextual-indexing-evaluation` | `75e4b2cbf03abf226fb59c8d67a053395d5bbc33` |
| `t3/desktop-runtime-hygiene` | `a9c224716f1cd092be7d81bd32d5e0a6a4583046` |
| `t3/editor-markdown-references-slash` | `4a0b60185e3c16d2f690964ca350be24136d3620` |
| `t3/evaluate-task-feedback-proposals` | `36f93aa03b38b5e54107f21d3cdcf2db4b558306` |
| `t3/fix-hosted-docker-build` | `86c937bd91e197508909ef0ae6c4fd12353cf3ec` |
| `t3/instruction-lint-preview` | `3065cb75a34bd89f619ba0b726e98d3c4509f1b3` |
| `t3/living-topic-pages` | `a5a63f9e0c1cf39a58fcfcb30bc97201bbda77ff` |
| `t3/note-search-session-ux` | `cb1eaa3fd493e9d401bdef369a115d8704cb768b` |
| `t3/prepare-patch-release` | `4c0d4d70507b568b43ef3b08be60ce7b309c4e0c` |
| `t3/related-pages-feedback-usability` | `87304f4fceb392f356f9a7a59e76315945c1e873` |
| `t3/retrieval-readiness-diagnostics` | `e0f34c6207193038ab467d63fce1775a449e4bf9` |
| `t3/review-integrated-feedback` | `f535ef44dd21ec8cedc169dafbe402c7144f74ea` |
| `t3/stale-note-editing` | `06289035deda31a26e96613fe7889fa95820f5a5` |
