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

Budgets in `scripts/package-budget.mjs` are 1.45 MB compressed, 4.6 MB unpacked,
3.1 MB under `dist/`, and 660 files (decimal units). Existing editor tests retain
221.5 KB gzip for the shared editor and 6 KB gzip for the optional desktop
extension renderer. A budget increase needs a measured explanation and review;
do not increase it just to make an upgrade pass. Timing ceilings are outside the
normal concurrent test suite to avoid machine-load-dependent failures.

## 2026-11-03 external Markdown links

A matched esbuild comparison against pre-change HEAD measured 220,216 gzip bytes
before and 221,169 after external-link rendering, exact source-label mapping and
keyboard/gesture activation: +953 bytes (0.43%). Both builds used the same pinned
packages, version, production settings and fixed build fingerprint. The final
read-only activation callback and editable escaped-label handling bring the
build to 221,233 gzip bytes, recorded in the [task archive](../tasks/done/2026-11-03_tasks-external-markdown-links.md).
`@lexical/link` is now declared directly at the existing 0.51.0 pin; it was
already transitive and the bundle still contains 15 packages. No production
runtime dependency or network request is added. The reviewed 221,500-byte ceiling
covers this user-facing capability while retaining an explicit bounded gate.

## 2026-11-02 native deletion correction

The actual packaged Mac editor reproduced a source-range failure on Option+Backspace:
Lexical handles word/line commands on keydown without `beforeinput`, while the
existing proof captured only a character. The bounded native-boundary observer
fixes ordinary editing while retaining default command behavior and exact splice
validation. It adds 167 gzip bytes to the 219,949-byte editor baseline: 220,116
bytes total, about 0.076% growth, with unchanged editor dependencies. Set the
shared-editor ceiling to 220,250 bytes (250 bytes above the prior ceiling) for
this demonstrated correctness fix. Review retains the original source-validation
checks rather than replacing them with size-driven rewrites. Archive, unpacked,
runtime, file-count and optional-renderer budgets remain unchanged. The separate
packaging-only `@electron/fuses` dev dependency is excluded from the shipped app
and CLI runtime dependency graph.

README artwork is served from the repository when viewing the README. It is not
part of the runtime download. User/install docs and notices remain packaged.
The internal `docs/design-system.md` renderer reference stays in the source
repository; it is not an installed user guide or required runtime resource.
Native smoke/tests, private configuration and build caches are excluded;
Swift/helper sources and desktop updater/build resources remain available.
CLI-only installs still do not include Electron or editor development packages.

The build removes emitted whitespace from CLI and backend-ownership
JavaScript modules with the existing esbuild dependency. Identifiers, syntax and
legal notices are retained; source and API declarations remain readable. This
keeps combined CLI capabilities inside the original package ceilings without
dropping commands, guidance or installed resources.

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
The [existing desktop-update measurements](../tasks/done/2026-11-03_tasks-desktop-update-30-seconds.md)
record a 34.187-second median fresh Swift compilation and keep release-built
helper work active. Do not confuse a 1.8-second TypeScript/editor build with a
complete Mac app build, dependency download, local model installation or update.

## 2026-11-01 installation assets

The private-engine lock adds 82,440 bytes; the root dependency lock now travels in `dist/runtime-package-lock.json` because npm omits the root lockfile. Installer/bootstrap/verification helpers also ship. The measured intermediate package reached 3,801,589 unpacked bytes, exceeding the prior 3.8 MB ceiling. Increase only the unpacked ceiling to 4.0 MB for these reproducibility and recovery assets; retain the 1.3 MB compressed, 2.5 MB runtime and 600-file caps. Native engines, Node binaries and Electron remain separate platform downloads, not bundled into the CLI tarball.

## 2026-11-01 collaboration review

The integrated production candidate measured 1,355,138 compressed bytes,
4,266,843 unpacked bytes, 2,808,097 runtime bytes and 604 files using
`npm pack --dry-run --json` on the same macOS/Node toolchain. The shared editor
measured 202,508 gzip bytes. These are an intermediate source snapshot; final
artifact measurements belong to the multiplayer verification record.

The increase delivers the backend ownership/authentication modules, bounded
source coordinator, scoped draft recovery, structural editor reconciliation,
upgrade helper and a self-contained 129,617-byte WebSocket server bundle.
Vendoring that transport is necessary because the packaged desktop runtime
does not carry arbitrary root production dependencies. Editor libraries remain
build-only dependencies. The revised ceilings retain approximately seven percent
compressed and runtime headroom; byte-growth checks and package-content checks
remain enforced. No models or Electron distribution are added to CLI installs.

## 2026-11-01 multiplayer correctness and cursor review

The Astra-fix preflight build `6e4b55ba677a2dfd` measured 1,403,975 archive
bytes, 4,458,902 unpacked bytes, 2,980,234 runtime bytes and 619 files. Those
remain below the existing package ceilings. Final artifact measurements belong
to the production verification record.

The editor measured 641,002 minified bytes and 212,237 gzip bytes, an increase
of 6,501 gzip bytes (3.16%) over the prior 205,736-byte production preflight.
That cost provides exact structural selection/cursor maps, granular edit
reconciliation and authenticated retained-version review. The 15 bundled editor
packages and production dependency set remain unchanged. Raise only the editor
ceiling from 210,000 to 220,000 gzip bytes, leaving 3.7% headroom over this
measurement; retain inline safety, licenses, dependency separation, package
ceilings and the fixed canonical latency/resource gates. This is an explicit
measured feature cost, not a replacement baseline or a claim about network
latency on every machine.

## 2026-11-01 actual operation provenance

Coordinated build `105f6c2b1ff1ec07` measures 663,268 minified editor bytes and
219,550 gzip bytes, with the same 15 bundled packages and unchanged 220,000-byte
editor ceiling. The package preflight measures 1,426,892 archive bytes,
4,547,385 unpacked bytes, 3,058,908 compiled runtime bytes and 621 files. Final
archive measurements may change with documentation; the runtime inventory is
independently matched across platforms and packaged artifacts by the final gate.

Actual editor ranges, source-origin composition, verified inverse ancestry,
bounded authoritative history and conservative raw-file ambiguity add 78,674
runtime bytes (2.64%) over the earlier 2,980,234-byte preflight. They address
reproduced wrong-edit and wrong-caret failures that text convergence missed.
The measured runtime exceeds the previous 3,000,000-byte ceiling by 58,908
bytes. Review that one ceiling to 3,100,000 bytes, leaving 1.34% headroom over
this build. Keep the compressed, unpacked, file-count and editor ceilings, all
dependencies, and canonical latency/RSS/history/queue limits unchanged.

The protected package test now asserts all four ceilings literally, and the
production contract pins the budget and package-manifest helpers. Future
helper-only budget relaxation cannot silently satisfy the original test. This
measured contract delta is independent of the immutable M0 baseline.


## 2026-11-02 finite editor histories

Build `fdc67474bfe9d94e` adds bounded active-aware Undo/Redo owner retirement
and an explicit expired-history notice. It measures 663,583 minified editor
bytes and 219,663 gzip bytes with the same 15 bundled packages. All package,
editor, dependency and canonical latency/resource ceilings remain unchanged;
the final verification report records package and runtime measurements.

Native menu routing in build `aa16b18047387a08` measures 663,948 minified editor
bytes and 219,783 gzip bytes, retaining all ceilings and 15 bundled packages.
The focused cancelable history event adds 120 gzip bytes over `fdc67474bfe9d94e`;
the native menu itself stays in the Electron shell.

## 2026-11-02 runtime hygiene lane

Runtime pins, bounded explicit backend inventory, shutdown diagnostics, managed
integration refresh and forward staging retention keep the original package gates.
Repository-only task-workflow and footprint developer references leave
the installed artifact; the Product vision document linked by README,
install/operator guidance and all executable assets stay. This reduces redundant distribution weight without removing features
or changing assertions. The active runtime-hygiene task records final metrics and
the independent lane's runtime delta; parent must evaluate the combined snapshot
with the guidance lane rather than infer budget compliance from either branch.

## 2026-11-03 installation retention

The shared ownership/rollback planner and storage command initially put the archive
at 1,457,123 bytes, above the unchanged 1,450,000-byte ceiling. Excluding co-located
`*docs.md` implementation references under Electron/native integrations removes
repository-only material from the download. User/operator guides, licenses, native
build sources and all executable maintenance helpers remain shipped. The measured
candidate is 1,434,772 archive bytes, 4,572,105 unpacked bytes, 3,075,643 runtime
bytes and 633 files; final measurements belong to the completed pruning task.
All four literal byte/file ceilings and editor/dependency gates stay unchanged.
The packaged CLI also discards completed Electron build dependencies, retaining
its pinned extension compiler; installed-footprint evidence is separate from npm
archive budgets and APFS free-space claims.

## Optional semantic setup packaging

Extend existing emitted-whitespace compaction to QMD, app/local-memory and app-root JavaScript before adding portable model setup. Three evaluator instrumentation seams (`qmd-query`, `qmd-driver`, local-memory `compact`) retain their emitted formatting. Source, declarations, identifiers, syntax and legal notices remain; esbuild was already a development dependency. This retains existing distribution byte ceilings rather than increasing them for the feature. Model weights and separate release-native helper assets stay outside the CLI package.
