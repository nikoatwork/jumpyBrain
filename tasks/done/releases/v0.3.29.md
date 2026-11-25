# Changes

- `jumpybrain update` works again on Macs that installed the app from a published release. It used to stop with "custom, pinned, or unowned CLI policy" and change nothing.
- `recall` and `search` given a bare phrase now say to pass it with `--query "…"`, instead of "Unexpected bounded-read argument". Starting `serve` while a background service owns the brain names the `jumpybrain backend stop --root …` command.
- The installer's size estimate for the search engine now says about 860 MB on Linux x64, which also gets GPU builds. About 205 MB on a Mac is unchanged.
- On a Mac with Homebrew Node, app updates now move the app off the versioned Node path that `brew upgrade` can break. Updates started from this version on move the CLI too. To fix both right away, rerun the installer with `--with-app`.
