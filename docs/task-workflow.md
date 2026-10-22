# Task completion

`tasks/todo/` holds active work. Once all required work and checks for a task list are complete, finalize it in the same turn:

1. Record the completed outcome, tested snapshot, verification results and remaining limits. Do not mark required unfinished validation complete merely to archive a list.
2. Move the list to `tasks/done/YYYY-MM-DD_tasks-[topic].md` and repair references to and from it.
3. Update owning docs and pending release notes where relevant. Follow the repository's selective changelog rules.
4. Commit the task's implementation, tests, documentation and archived list together. Stage only scoped work and preserve unrelated changes.
5. Report the archive location and commit hash. If archiving or committing is blocked, report the exact blocker and do not claim the work is committed.

Do not request separate archive or commit approval unless the user explicitly opts out. This overrides a task skill's default confirmation step. Completed task lists must not remain in `tasks/todo/`.

A task commit does not authorize a push, installation or release. Aggregate pending release notes stay in `tasks/todo/release-next.md` until the release workflow completes. Incomplete task lists remain active with their outstanding work clearly marked.
