# Test local changes before releasing

Install a committed development build on your Mac and use your existing brain normally before publishing. Aim for roughly a day of writing, navigation, search and agent recall; shorter testing is an owner decision. Installation age is a reminder, not proof of use or a release approval.

From your development checkout:

```sh
npm run dogfood:install
npm run dogfood:status
```

The install command takes **committed HEAD in this checkout**, builds an isolated snapshot with locked dependencies, packages the Mac app, asks the running app to save all tabs and quit normally, and installs both `~/Applications/jumpyBrain.app` and the managed CLI at `~/.jumpybrain/bin/jumpybrain`. It verifies the native host, CLI doctor and component identity, then reopens the app. It requires an existing standard managed app/CLI installation. A failed save or another installer blocks replacement.

Commit or merge finished changes first. Uncommitted and untracked files are excluded, even if this checkout is dirty. There is no fetch: “latest” means the latest local committed work. To test a specific existing commit, use `npm run dogfood:install -- <commit>`. It does not bump the public version, push, publish, write sample memories, change agent integrations, or retarget the app or CLI. The base version stays unchanged; the exact commit is in the status report and installed runtime metadata. Existing source/ref policy remains intact, so ordinary published updates still work when explicitly applied.

No nightly job is enabled: automatic replacement would interrupt a useful test window. Run the command whenever you choose a new candidate. Each installation starts a fresh window, even when reinstalling the same commit. The app may still notify you of published releases; applying one can supersede your candidate. Status detects that it is no longer current.

## Recover the previous software

```sh
npm run dogfood:rollback
```

This saves/quits the app normally and restores the previous app, CLI runtime and install manifest from the last candidate transaction. It reopens the restored app. **Brain files, indexes and user settings are not rolled back.** This is software recovery, not a notes backup. Normal personal backup practices still apply.

Rollback checks the recorded file identities and refuses to overwrite a later replacement made by another installer. Interrupted transactions retain their evidence and, if recovery fails, the installer lock. Inspect the reported directory before attempting repairs; do not delete an active installer’s lock. A build failure before replacement leaves the existing installation intact. A startup failure after verified installation is reported separately; use rollback if needed.

Candidate builds and previous software are retained under `~/.jumpybrain/dogfood/`; the current receipt is `current.json`. These can consume substantial disk space. Keep the current receipt’s directory while rollback is wanted; older completed candidate directories can be removed manually once no install or recovery references them. There is no automatic pruning.

## Release decision

Before publishing, check status and compare the recorded commit with the intended release snapshot. Record what you actually tried, any failures, and untested changes. Normal use on the real brain complements the disposable-fixture checks in [release testing](release-testing.md); do not inject faults or run destructive smoke tests on personal notes.

About 24 hours is a guideline, not a hard gate. Fixes or behavior changes after the test window require another candidate or an explicit decision to shorten testing. Publishing remains a separate user-authorized [release workflow](releases.md).
