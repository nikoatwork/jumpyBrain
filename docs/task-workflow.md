# Task completion

`tasks/todo/` holds active work. Once all required work and checks for a task list are complete, finalize it in the same turn:

1. Record the completed outcome, tested snapshot, verification results and remaining limits. Do not mark required unfinished validation complete merely to archive a list.
2. Move the list to `tasks/done/YYYY-MM-DD_tasks-[topic].md` and repair references to and from it.
3. Update owning docs and pending release notes where relevant. Follow the repository's selective changelog rules.
4. Commit the task's implementation, tests, documentation and archived list together. Stage only scoped work and preserve unrelated changes.
5. Report the archive location and commit hash. If archiving or committing is blocked, report the exact blocker and do not claim the work is committed.

Do not request separate archive or commit approval unless the user explicitly opts out. This overrides a task skill's default confirmation step. Completed task lists must not remain in `tasks/todo/`.

A task commit does not authorize a push, installation or release. Aggregate pending release notes stay in `tasks/todo/release-next.md` until the release workflow completes. Incomplete task lists remain active with their outstanding work clearly marked.

## T3 threads after local merges

Direct local merges into `master` are supported without a PR. After completing an authorized merge:

1. Verify that the completed task is integrated into `master`. For an ordinary merge or fast-forward, use `git merge-base --is-ancestor <source-tip> master`; for a squash or cherry-pick, verify the equivalent changes and record the resulting commit.
2. Finish the task's required checks and finalization, and report the integration commit and any remaining limits. Keep a thread active if it still owns unfinished work.
3. Settle the completed source T3 thread with `t3_thread_organize({ action: "settle" })` when working in that thread. Settlement applies at turn end; a failed turn or queued message keeps it active.
4. When integrating work from another thread, read that source thread first, confirm its task is complete, then call `t3_thread_organize({ action: "settle", threadId: "<source-thread-id>" })`. Keep an integration thread active while it owns more work, and reference source threads using their returned links.

Settlement is part of the authorized merge workflow and needs no separate approval. A feature-branch commit alone does not trigger settlement. If the T3 tool is unavailable or rejects the action, report the exact blocker without claiming the thread was settled.

This is an agent workflow rule, not a Git hook: a merge performed manually outside an agent turn needs to be reported to the agent before it can verify and settle the source thread. PR-linked automatic settlement remains available for PR workflows.
