# Build and distribution footprint

Keep the local CLI/runtime distribution small. `npm test` checks the actual npm
manifest and byte budgets after building; `npm run cli:pack` applies the same
checks to its real tarball before recording successful package metadata.

## Repeatable checks

- `npm run build` then `npm run check:package-size`: compressed download,
  unpacked files, compiled runtime and file count, plus indispensable installers.
- `npm run benchmark:build`: three sequential clean builds and machine metadata.
  Each build has a generous 10-second ceiling to catch runaway work; override
  with positive integer `JUMPYBRAIN_BUILD_MAX_MS` on slower machines. Run on an
  idle machine, separately from other builds and tests that consume `dist`.
- `npm audit` and `npm --prefix integrations/electron audit`: both lockfiles.

Budgets in `scripts/package-budget.mjs` are 1.3 MB compressed, 3.8 MB unpacked,
2.5 MB under `dist/`, and 600 files (decimal units). Existing editor tests retain
187 KB gzip for the shared editor and 6 KB gzip for the optional desktop
extension renderer. A budget increase needs a measured explanation and review;
do not increase it just to make an upgrade pass. Timing ceilings are outside the
normal concurrent test suite to avoid machine-load-dependent failures.

README artwork is served from the repository when viewing the README. It is not
part of the runtime download. User/install docs and notices remain packaged.
Native smoke/tests, private configuration and build caches are excluded;
Swift/helper sources and desktop updater/build resources remain available.
CLI-only installs still do not include Electron or editor development packages.

## 2026-10-29 review

macOS 15.7.7 arm64, Node 26.7.0, npm 11.19.0. Three sequential clean builds per
snapshot using `git archive`, the same installed TypeScript 6.0.3/Lexical 0.51.0
dependencies, and `npm pack --dry-run --json`; no network/dependency-install
time is included. Repeated builds warm filesystem caches. These are one-machine
measurements, not population latency guarantees.

| Snapshot | Median build | Archive bytes | Unpacked bytes | Editor gzip bytes |
| --- | ---: | ---: | ---: | ---: |
| v0.3.7 (`c64032d`) | 1.535 s | 2,754,099 | 4,632,106 | 170,876 |
| v0.3.10 (`5aee7b0`) | 1.743 s | 2,908,712 | 5,175,528 | 181,733 |
| v0.3.11 (`09932b8`) | 1.745 s | 2,914,734 | 5,205,053 | 181,744 |
| Review HEAD (`740a1df`) | 1.766 s | 2,939,093 | 5,281,435 | 186,561 |

Since v0.3.11, build time grew 1.2%, archive size 0.8%, and editor gzip 2.7%.
Since v0.3.7, the increases are 15.0%, 6.7%, and 9.2%, respectively. Recent
growth is modest, but the editor is close to its limit. Packaging unnecessarily
included 1,780,073 bytes of artwork and 93,037 bytes of native test/smoke code.
Excluding those files removes roughly 61% of the compressed download without
changing runtime behavior. Final measurements and checks are recorded in the
[completed task](../tasks/done/2026-10-29_tasks-lean-build-and-dependencies.md).

Electron 44.8.0 was affected by the upstream [compromised-intermediate certificate
advisory](https://github.com/advisories/GHSA-jr5w-w6x2-84p9). Update to 44.10.0
within the existing major line. Update fast-check to 4.10.2, Node 25 types to
25.9.9 and the compatible transitive signals-core patch to 1.14.5. esbuild,
Electron packager and downloader are already current as checked on this date.

The tested Lexical 0.53.0 candidate compiled but increased the shared editor to
196,654 bytes gzip, exceeding the unchanged 187,000-byte gate; retain aligned
0.51.0 pins. Upstream also lists [breaking changes and Markdown export
changes](https://github.com/meta/lexical/releases/tag/v0.53.0), so a future upgrade
needs editor/preservation validation and a measured weight reduction. TypeScript
7 replaces the compiler with a native implementation and [does not ship its old
JavaScript API](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6-0); this repository still
uses the TypeScript JavaScript `transpileModule` API in guidance tests. Retain
6.0.3 pending that migration. Node 26 types and Electron 45 are separate major
upgrades, unnecessary for the identified security fix.

This review does not establish installed Mac bundle growth or update latency.
The [existing desktop-update measurements](../tasks/todo/tasks-desktop-update-30-seconds.md)
record a 34.187-second median fresh Swift compilation and keep release-built
helper work active. Do not confuse a 1.8-second TypeScript/editor build with a
complete Mac app build, dependency download, local model installation or update.
