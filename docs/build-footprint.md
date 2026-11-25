# Build and distribution footprint

Keep the local CLI/runtime distribution small. `npm test` checks the actual npm
manifest and byte budgets after building; `npm run cli:pack` applies the same
checks to its real tarball before recording successful package metadata.

## 2026-11-25 install profiles and smart search

Install profiles add `scripts/install-profiles.mjs` (also an install.sh helper)
and the `smart-search` CLI command with its plain-words search wording, two
JavaScript/declaration pairs. `npm pack --dry-run --json` measured 3,276,800 B
packed, 9,034,222 B unpacked, 7,365,011 B under `dist/` and 789 files on macOS
arm64 with Node 26.7.0. Raise the file-count ceiling from 788 to 796 for these
five files and the existing headroom; the byte ceilings stay unchanged and no
runtime dependency is added.

## 2026-11-20 integrated remote-feedback package

After integrating role-based app access, the access diagnostic, remote-only
installation and zero-hit guidance, `npm pack --dry-run --json` measured
3,271,076 B packed, 9,067,652 B unpacked, 7,431,504 B under `dist/`, and 784 files
on macOS arm64 with Node 26.7.0. The new zero-hit policy and access diagnostic
each contribute one JavaScript/declaration pair. Raise the manifest file-count
ceiling from 780 to 788 for these four files and four files of headroom; keep
the packed, unpacked and runtime byte ceilings unchanged. This is the existing
single package, with no added runtime dependencies.

## 2026-11-18 consumer install cost and advisories

Measured for the portable-installation work on macOS arm64, Node 26.7.0, npm
11.19.0, from snapshot `0677fdb9` (v0.3.26 contents). Observations on one
machine, not release guarantees.

- **CLI package:** 3,209,777 B packed, 8,871,911 B unpacked, 768 files; no
  source maps, tests or eval files. The largest parts are the served drawing
  editor (3.9 MiB) and editor bundle, `integrations/` (916 KiB, used by the
  installer and the Mac app's paired update) and `docs/` (572 KiB).
- **Consumer install** (`npm install <tarball> --omit=dev` in an empty
  project): 21,320 KiB of `node_modules`, half of it esbuild's platform binary.
  Dependencies are only jumpybrain, esbuild and ws; **no Electron package is
  installed**. Electron appears only as entries in the shipped
  `integrations/electron` lockfile, which lockfile scanners read; the Mac app's
  paired update is the only path that installs it.
- **Startup:** `--version`/`--help` 0.05 s wall and about 58 MiB RSS; importing
  the runtime 25–40 ms. Neither loads QMD, ws, esbuild or browser assets. esbuild
  is imported lazily, only for `extensions check/install/enable/reload`.
- **Engine:** `@tobilu/qmd@2.8.3` with its lockfile is about 204 MiB (154
  packages). This matches the reported footprint: the CLI is about a tenth of
  it, and the rest is QMD's hard dependencies (see the evaluation below).
- **Advisories** (`npm audit --omit=dev`): the CLI's runtime dependencies have
  none. The 17 root-lockfile advisories are all dev-only, through
  `@excalidraw/excalidraw`, which is bundled at build time and does not reach
  consumers (the shipped `runtime-package-lock.json` still lists them). The
  engine has 9 runtime-path advisories (2 critical, 7 high: simple-git via
  node-llama-cpp, QMD's MCP server, zod, fast-glob/micromatch/picomatch), all
  fixed by `@tobilu/qmd@2.9.0`.

Decisions: keep **one package**. The CLI is already small, and splitting off
`integrations/` or optional esbuild would save little while adding a release
matrix (optional dependencies install by default anyway). Remote-only use needs
no engine. The engine advisories are documented residual risk, not fixed here:
jumpyBrain never runs QMD's MCP server, never builds llama.cpp from git at
runtime, and passes only its own fixed glob patterns, so none of the flagged
paths is known to be reachable. Moving to QMD 2.9.0 changes the exact version
pin that installer, doctor, Desktop and the hosted image all check, so existing
2.8.3 engines would stop passing; it needs its own migration and retest task
before adoption. `npm audit fix --force` is not an acceptance criterion.

## 2026-11-17 hosted image QMD dependency evaluation

A hosted deployment asked whether the Docker image can shed QMD 2.8.3
dependencies a Markdown brain does not use (code grammars, QMD's own MCP server)
and the native build tools they need. This is a measured evaluation from the
pinned engine lockfile and npm metadata, not a change; no dependency surgery
was performed. Docker was unavailable during the initial evaluation; the
[2026-11-18 separate-volume verification](../tasks/done/2026-11-18_tasks-hosted-index-location.md#final-docker-verification-2026-11-18)
subsequently built and exercised the unchanged dependency graph on Linux ARM64.
No smaller-image claim or before/after size comparison is made.

`scripts/engine/package-lock.json` resolves **178 packages** for
`@tobilu/qmd@2.8.3`, matching the reporter's count. All of the candidates are
**hard `dependencies`** of the QMD package, so no `--omit` flag, optional
dependency or install switch can remove them; the published
`optionalDependencies` only cover `sqlite-vec` platform binaries.

| Candidate group (locked tree) | Packages | Published unpacked bytes (npm metadata) |
| --- | ---: | ---: |
| tree-sitter grammars (`go` 0.25.0, `javascript` 0.23.1, `python` 0.25.0, `rust` 0.24.0, `typescript` 0.23.2) + `web-tree-sitter` 0.26.12 | 6 | 75,562,371 |
| QMD MCP server 2.0.0 + `@modelcontextprotocol/core` 2.0.0 | 2 | 7,612,939 |
| `node-llama-cpp` 3.20.0 (semantic embeddings) + platform binaries | 15 | 38,502,605 (prebuild; compiled size larger) |
| `sqlite-vec` 0.1.9 core + 5 platform binaries | 6 | small loadable extensions |

A Markdown brain indexes only `.md` files and never serves QMD's MCP surface,
so grammars and the MCP server are unused weight in the hosted image. A clean
sandbox install also confirmed `node-llama-cpp` cannot prebuild llama.cpp
without the image's compiler toolchain, which is why the Dockerfile's
toolchain stage exists. Removing any of this needs an upstream change to
`@tobilu/qmd` (optional grammars/MCP or separate lexical/embedding packages);
npm overrides or lockfile edits against the supported version pin would be
fragile and are deliberately not attempted. An upstream ask is the recorded
path; measure the built image before and after in the hosted container gate
when a supported variant exists.


## Repeatable checks

- `npm run build` then `npm run check:package-size`: compressed download,
  unpacked files, compiled runtime and file count, plus indispensable installers.
- `npm run benchmark:build`: three sequential clean builds and machine metadata.
  Each build has a generous 10-second ceiling to catch runaway work; override
  with positive integer `JUMPYBRAIN_BUILD_MAX_MS` on slower machines. Run on an
  idle machine, separately from other builds and tests that consume `dist`.
- `npm audit` and `npm --prefix integrations/electron audit`: both lockfiles.

Budgets in `scripts/package-budget.mjs` are 3.3 MB compressed, 9.1 MB unpacked,
7.5 MB under `dist/`, and 780 files (decimal units). Existing editor tests retain
186.5 KB gzip for the shared editor and 6 KB gzip for the optional desktop
extension renderer; `test/drawings.test.js` holds the lazy drawing editor to
4.2 MB on disk and a 245 KB gzip entry. A budget increase needs a measured explanation and review;
do not increase it just to make an upgrade pass. Timing ceilings are outside the
normal concurrent test suite to avoid machine-load-dependent failures.

## 2026-11-10 built-in drawing editor

The user chose to build Excalidraw drawing support into the product rather than
ship it as an optional extension, accepting that CLI-only installations carry
the editor files. The estimate given before that decision was about 3.5 MB on
disk; the measured cost is higher and is recorded here so it can be revisited.

| Package metric | Before (`0ee8752` plus this task's non-editor source) | With the drawing editor |
| --- | --- | --- |
| Compressed archive | 1,478,898 | 3,178,969 |
| Unpacked | 4,688,406 | 8,768,322 |
| Runtime under `dist/` | 3,160,069 | 7,238,016 |
| Files | 684 | 737 |

The editor is 53 files and 3,946,275 bytes in
`dist/adapters/http-server/drawing-app/`: a 730,415-byte entry (227,665 gzip),
a 544 KB shared chunk, 145 KB of styles, about 560 KB of Latin canvas and
interface fonts, license notices, and a 1.83 MB lazily loaded WebAssembly chunk
that subsets fonts when a drawing is exported as SVG. That last chunk compresses
poorly and accounts for most of the difference from the estimate. It is kept so
SVG export stays complete; removing it is the main available saving (about
1.8 MB on disk, 0.75 MB compressed) if export fidelity is traded away later.

Left out deliberately: the 12 MB CJK handwriting font (CJK text in drawings
falls back to system fonts), 54 non-English locales (1.7 MB) and the Mermaid
importer. None of this is loaded until a drawing is opened: the note editor
bundle, its 223,250-byte gate and the shell's two inline scripts are unchanged
(674,742 minified / 222,923 gzip; the 59-byte growth is the shared drawing
route constant). Excalidraw, React and React DOM are exact-pinned development
dependencies bundled at build time; production dependencies are unchanged.

The reviewed limits are now **3,300,000 compressed bytes, 9,100,000 unpacked
bytes, 7,500,000 runtime bytes and 780 files**, replacing 1,500,000 /
4,800,000 / 3,200,000 / 700. This is an explicit decision for this feature,
not a baseline refresh. The opt-in multiplayer production contract pins the
previous `scripts/package-budget.mjs` digest and needs a deliberate re-capture
before that gate is used again.

## 2026-11-08 reviewed distribution ceiling refresh

The user explicitly approved resetting the distribution limits after the editor
session work. Snapshot `c612fef` measured 1,462,963 compressed / 4,625,618
unpacked / 3,097,281 runtime bytes and 666 packaged files. The compressed,
unpacked and file-count limits were already exceeded before that refactor;
its runtime shrank by 715 bytes and it added four compiled/declaration files.

The reviewed limits are **1,500,000 compressed bytes, 4,800,000 unpacked bytes,
3,200,000 runtime bytes and 700 files**. These rounded ceilings leave modest
headroom for the supported product and its documentation. They replace the
historical 1,450,000 / 4,600,000 / 3,100,000 / 660 limits; this is an explicit
budget decision, not an automatic baseline update. The exact budget assertion,
required-resource checks and fail-on-overage tests remain enforced. The editor
and optional extension-renderer gzip limits, dependencies and package contents
are unchanged by this decision. This does not substitute for release validation.

[Completion and final package measurement](../tasks/done/2026-11-08_tasks-distribution-budget-refresh.md).
Payload measurements and the one-package decision are in the
[portable installation task](../tasks/done/2026-11-18_tasks-portable-installation-project-integration.md#tasks).

## 2026-11-08 editor session ownership

The direct live-session composition removes the unused HTTP autosave controller
from the shipped browser exports while retaining its standalone implementation
and tests. Ordinary builds on the same checkout/dependencies measured 676,185
minified / 223,140 gzip bytes before this pilot and 671,081 / 221,862 after it
(15 bundled packages in both). These are actual builds with their own source
fingerprints, not a controlled fixed-fingerprint bundler benchmark. The existing
223,250-byte editor gate and all other budgets remain unchanged.
The new standalone session artifact uses the build's existing whitespace
compaction, and its declaration references the explicit interface. The tested
runtime measures 3,097,281 bytes, 715 below the source-matched pre-task runtime.
An additional full-package probe found inherited archive/unpacked/file-count
failures: pre-task `cd3c0b0` measured 1,462,694 compressed / 4,626,120 unpacked
bytes and 662 files against limits of 1,450,000 / 4,600,000 / 660. The editor
pilot does not raise those limits or claim a release-ready package. Its source
snapshot package measured 1,462,898 / 4,625,405 bytes and 666 files; final owning
documentation can change those archive/unpacked totals. No release is implied.


## 2026-11-04 checklist authoring and reference dismissal

A matched esbuild comparison with the same fixed build fingerprint, package pins
and production settings measures 221,435 gzip bytes at `38f8c86` and 221,976
with nested checklist editing and unsuccessful `@` lookup dismissal: +541 bytes
(0.24%). The actual production build measures 221,984 gzip bytes. This adds
subtree-preserving indentation with canonical source ranges and trigger-scoped
dismissal, without a new dependency; the bundle still contains 15 packages.
The shared-editor ceiling is 222,250 bytes. All distribution, runtime,
file-count and optional-renderer limits remain unchanged.

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

## 2026-11-04 UX feedback loop

A pristine `85512f0` build on Linux/Node 22.23.1 measured 222,420 editor gzip
bytes, already above the prior 222,250-byte guard. Matched production esbuild
runs with the same fixed build fingerprint measured 222,414 pristine and 223,009
with origin-aware own-edit feedback, retained-review acknowledgment and scoped
confirmed generation outcomes: +595 bytes (0.27%). The actual candidate measured
223,015 gzip bytes. The editor still bundles the same 15 packages; no dependency
or framework was added. The reviewed editor ceiling is 223,250 bytes, leaving
235 bytes over that measured candidate. This is a footprint review, not a change
to the native experience rubric or evidence requirements.

Distribution ceilings remain 1.45 MB compressed, 4.6 MB unpacked, 3.1 MB runtime
and 660 files. The candidate initially exceeded the archive/unpacked ceilings.
The build now applies its existing identifier-preserving whitespace compaction
to the changed collaboration application/editor and retained/generation feedback
modules. Source, declarations and license notices remain shipped; ordinary
browser bundle generation and runtime dependencies are unchanged. Compaction
reduces the collaboration app artifact alone from 53,953 to 34,157 bytes (its
standalone gzip from 10,994 to 8,507). Retained comparison and generation modules
also shrink. Full package and source-operation/stream checks protect the final
compiled artifacts; do not widen distribution ceilings to absorb UX work.

## 2026-11-11 live co-editing merge and folder sorting

v0.3.23 release preparation found the editor above its 223,250-byte gate. Matched
local builds (macOS ARM64, Node 26.7.0, same lockfile) measured 222,922 gzip bytes
at v0.3.22 (`28ebe9a^`), 223,450 after the total collaboration transform and the
client's sequential-transaction crossing (`28ebe9a`, +528) and 223,969 after the
folder-explorer sort select, compact ages and device-local preference (`a792ce4`,
+519). The release candidate measured 223,972 bytes. Both features are deliberate
browser behavior; the editor still bundles the same 15 packages and no dependency
or framework was added. The reviewed editor ceiling is 224,250 bytes, leaving 278
bytes over that candidate. Distribution ceilings are unchanged. Neither feature
task ran the full suite, so the overrun surfaced only in the release-owned
`npm test`; run `test/lexical-bundle.test.js` whenever browser code changes.

## 2026-11-12 tree-shaken Lexical in the editor bundle

The editor had 11 bytes left under its 224,250-byte gate. The cause was
resolution, not features: Lexical's default package entry re-exports every
symbol through a runtime development/production switch
(`const mod = … ? modDev : modProd; export const x = mod.x`), which a bundler
cannot see through, so every Lexical package was included whole. The editor
build now resolves the `production` export condition, importing the production
files directly, as the drawing build already did.

| Editor bundle (`aecb3da4`, macOS ARM64, Node 26.7.0) | Minified | Gzip |
| --- | --- | --- |
| Before | 678,655 | 224,239 |
| With the `production` condition | 549,810 | 180,765 |

That is 43,474 gzip bytes (19.4%) with no source or dependency change. Unused
package surface is now dropped: `@lexical/a11y` and `@lexical/dragon` leave the
output entirely, and `@lexical/html`, `@lexical/link`, `@lexical/list`,
`@lexical/utils`, `@lexical/selection` and `@lexical/code-core` shrink by half
or more. The licence notice file still lists all 15 resolved packages.

The reviewed editor ceiling is lowered to **185,000 bytes**, leaving 4,235
bytes for features while keeping the saving from being absorbed unnoticed.

The access-key controller (2026-11-12) adds 2,688 gzip bytes (183,453 total),
leaving 1,547 under the ceiling. Its markup and styles are server-rendered from
a separate module so the bundle does not carry them a second time.

Page backlinks (2026-11-18) add the "Linked from" controller and drop the graph
topic preview's transient linked-page context, a net 731 gzip bytes (185,577
total, 184,846 before, macOS ARM64, Node 26.7.0). The reviewed ceiling rises to
**186,000 bytes**, leaving 423. Markup and styles stay server-rendered.

Open-note attention outcome reporting (2026-11-18) adds receipt checks and reply
classification. Merged with page backlinks, the bundle is 185,861 gzip bytes,
leaving 139 under the 186,000 ceiling. The next editor addition needs its own
measured review.

Server-role access (2026-11-20) replaces the access-key controller's device
approval handling with the server's named capability sets and the Your access
summary: a net 492 gzip bytes (186,353 total, 185,861 before, macOS ARM64, Node
26.7.0). The three capability rows and their wording are server-rendered, which
saved 56 bytes; shorter wording saved another 56. The reviewed ceiling rises to
**186,500 bytes**, leaving 147. The next editor addition needs its own measured
review.

Blocked-action explanations (2026-11-20) keep the ceiling at 186,500. The shared
role guard is inline page script, which the gate does not count; the only
bundled change is the folder explorer's optional `denied(action)` hook, a
measured 13 to 14 gzip bytes (186,365 to 186,366 total across rebuilds, as
the embedded build ID changes; 186,352 before on the same machine, macOS ARM64,
Node 26.7.0), leaving 134. The companion-only explanation helpers
it replaces were inline as well, so the bundle carries no second copy. The guard
lives in the existing `access-keys-view.ts`, so the package gains no file.

Measured and not adopted: a newer syntax target (0 bytes), dropping `console`
calls (41), removing the in-bundle Lucide notice (559, needed for the licence)
and renaming `_`/`__` properties (871–1,511, with a real risk of breaking
Lexical internals). Remaining weight is Lexical core (181 KB minified, already
tree-shaken as far as its classes allow), the application's own browser code
(263 KB minified) and about 13 KB minified of Lexical's extension builder and
its signals library, which clipboard and HTML support reference at runtime.
Reducing those means deferring optional surfaces (map, feedback form, retained
versions) out of the inline script, which is an architecture change rather than
a build setting.

The v0.3.27 release check measured the editor at 186,912 gzip bytes. Rendering
the sidebar row and its glyphs as inert templates removes the bundled markup
and DOM construction code. The next local build measured 186,344 gzip bytes,
under the existing 186,500-byte ceiling. The complete hosted and companion
shells also compressed smaller with the templates included. The browser still
bundles the same 15 packages.
