# Changes

- Older managed CLI installations get one reliable upgrade route: `--source release` (with `--with-app` to add the matching Mac app) migrates them to a verified release, keeping the brain folder, settings, credentials and customized integrations, and retaining the previous runtime for recovery. A plain `--with-app` rerun no longer reuses an incompatible older CLI; it explains the installed version, the missing capability and the command to run.
- Installer readiness failures now say whether the runtime is too old to report readiness, failed to run, or found the brain not ready, instead of a generic search error.
- The CLI installer, its verification and the Mac app now always use the same search engine; an older `qmd` on `PATH` can no longer shadow the selected one. Uninstall never removes a config or integration file an older installer did not record.
