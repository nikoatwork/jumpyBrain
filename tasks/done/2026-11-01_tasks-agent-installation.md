# Reliable end-to-end agent installation

## Goal

Implement the focused installer proposal in [portable installation](../todo/tasks-portable-installation-project-integration.md): one repeatable operation for local agents and optional Mac app, verified releases, private search dependencies, accurate machine-readable completion, and safe recovery. Work is isolated on `feat/agent-installation`. The owner subsequently authorized uninstall/reinstall of the personal CLI and Mac app, preserving notes/profiles, and optional integration into master. No push or release is authorized.

## Tasks

- [x] Replace implicit cwd bootstrap selection and add early preflight/JSON diagnostics.
- [x] Install the pinned local engine in an owned user prefix; align CLI/doctor/Desktop/update selection and preserve remote-only use.
- [x] Default fresh managed installs to verified published artifacts; preserve development source/ref policies.
- [x] Make failed fresh setup safely rerunnable without deleting memory or adopting unowned files.
- [x] Compose app + agents setup, root preservation and actual readiness verification.
- [x] Test failure/recovery and packaged local recall in disposable homes; document architecture/platform/signing limits.
- [x] Update owning docs and release notes; archive and commit completed scoped work.

## Limits to resolve

A source-built Mac app still requires native tools. Public signing/notarization needs operator credentials and publication remains outside this task. Inspect reusable prebuilt-helper work before making compiler-free claims.


## Implementation and verification

- Bootstrap helpers are resolved to one immutable GitHub commit, independent of cwd. Missing supported Node is downloaded privately from official Node archives with SHA-256 verification. Existing compatible tools are reused; no global npm installation or model download.
- The QMD prefix is platform/Node-ABI/lockfile specific. Installation owns its marker, stages `npm ci`, verifies matching CLI/SDK and publishes atomically. Replaceable app-local engines cannot become the persistent engine selection.
- Verified beta release archives are validated before extraction and install production dependencies from the distribution's runtime lock. Fresh setup records ownership before app publication; retries preserve canonical notes. Existing runtime candidates pass doctor/read-only recall before publication. The launcher is published atomically.
- Combined setup avoids rebuilding the root package twice, passes a checked owner token across native installation, preserves existing profiles, binds native Node/QMD to the managed manifest, completes fresh local onboarding, and authenticates the launched app. Alternate homes have independent Electron state/update sockets.
- JSON separates readiness, failure, blockers and pending integration reload. Doctor uses runtime CLI/SDK discovery; expected read-only recall warnings are distinguished from incomplete retrieval.
- Disposable packaged Mac arm64 run passed under a privately downloaded Node 24.22.2 with QMD 2.8.3: exact tarball digest verification, first install, all three integrations, nonempty synthetic recall, repeat installation with canonical preservation, app addition and authenticated shared-root launch. Tested archive SHA-256: `218424d9687ce3d01f5b204725577101b5535761adc8dd8c92f6f8b78a5521ba`. Release HTTP transport was a deterministic fixture, not a public upload.
- Authorized personal-machine test removed the managed CLI and Mac app, then used the candidate bootstrap and documented explicit-source installation with `--with-app --integrations auto --json`. Doctor, recall and authenticated Desktop checks passed. All 1,663 canonical files were byte-identical; both saved profiles were unchanged. No sample memory or model was added. Components were backed up privately before removal; backup locations and raw personal verification logs stay outside Git.
- Regression coverage includes broken first index/retry, live/dead locks, remote-only, unrelated cwd, rejected tar paths/links/duplicates, broken update candidate preservation, edited integration retention and engine retention for a dependent app. Native tests verify installer-lock handoff and configured engine selection.

## Remaining boundaries

- This is a local candidate, not a public release. Current v0.3.15 lacks `dist/runtime-package-lock.json`; the new default release path reports that incompatibility and does not silently build master. Publishing a compatible version and the bootstrap/docs is required before the GitHub-link-only journey delivers these changes. The real-machine test used the explicit-source exception transparently.
- macOS arm64 was exercised with a stripped PATH/private runtime in disposable homes and the owner's existing macOS account. No clean OS/VM, Intel Mac or Linux hardware run is claimed. Wrong tools/platforms and failure boundaries have deterministic coverage; that is not native hardware certification.
- Mac helper compilation still needs Python/Xcode tools, and bundles use local ad-hoc signing. Compiler-free/sign/notarized distributions remain coordinated with [prebuilt Desktop work](2026-11-03_tasks-desktop-update-30-seconds.md), not duplicated here. Private Node and engine provisioning remove separate Node/global npm setup, not Apple's native prerequisites.
- Agent integration files are installed; activating already-running agents requires reload. Existing profile/port conflicts remain explicit rather than silently switching brains. Private Node runtimes are retained on uninstall because native apps may still depend on them.

Concurrent disposable/personal packaging exposed Electron packager’s shared-temporary-directory deletion. `install.mjs` now passes its unique invocation directory as `tmpdir`; concurrent packaging is checked with the final installed smoke instead of relying on serial success.


## Completed outcome

Implemented and verified on the combined snapshot based on `2a319fe` (including the owner's committed folder explorer). Final implementation verification:

- `npm test` before integration: 1,534 passed, one existing skip; final integrated build plus `node --test`: 1,546 passed, one existing skip, zero failures.
- Native Python installer suite: 11 passed. Focused doctor/recovery suite: 16 passed.
- Final `npm run cli:pack`: 243 required assets verified; 1,260,831 compressed bytes, 3,847,184 unpacked bytes, 2,414,546 runtime bytes, 565 files, within the documented budgets.
- Final exact-artifact smoke, under private Node 24.22.2 and real private QMD 2.8.3, passed CLI install, nonempty recall, retry preservation, three integrations and authenticated Mac launch. Archive SHA-256: `5422526bbd55b58363ac3cdef2f87f71daadea6aa05e782c84379755562a4162` (before task-only finalization).
- The final packaged smoke and the personal installation update ran concurrently after temporary-directory isolation; both passed. The actual installed CLI doctor/recall and Mac root check passed again. Final comparison retained all 1,663 canonical files and the unchanged two-profile file. The personal app remains running.
- Live public v0.3.15 archive was downloaded and digest-verified; confirmed the runtime lock asset is absent. No public release, push or npm publication performed. The local candidate retains its explicit development-source provenance.

The archived task closes the implemented bootstrap/recovery/app orchestration increment. Public rollout, clean-OS/other-platform gates, compiler-free native distribution, npm consumers and project discovery remain in their existing active tasks. No memory-service writes or changes to the owner's unrelated work were made.
