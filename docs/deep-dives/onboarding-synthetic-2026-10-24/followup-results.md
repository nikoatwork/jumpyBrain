# Onboarding follow-up results

Completed 2026-10-24 from base `695bae9`, following `85dd4b9`. The final working source includes the changes in this report. Three delegated tracks and parent validation attempted the remaining gaps, fixed reproduced failures, and preserved the original persona reports as historical evidence.

## Outcome

**Real authenticated Claude Code passed the improved three-conversation journey.** Native chooser/onboarding, app/CLI roundtrip, diagnostic recovery, source install/update/uninstall, semantic retrieval, consumer artifact and protected remote CLI checks passed within the scopes below. Linux and unavailable device/distribution gates remain explicitly untested.

### Fixes

- Added strict `doctor --check` while preserving legacy default exit behavior, bounded its probes, labeled global/project integration-file scope, and kept host activation a separate check.
- Added executable same-root initialization hints and QMD override correction/unset advice; malformed config, permission denial and missing index source remain distinct. Reads never initialize a root.
- Added read-only Desktop prerequisite checks with aggregated missing requirements and actual macOS/Node/Python minimum-version validation.
- Made uninstall previews truthful, including optional memory-deletion previews; actual note-preserving uninstall is unchanged.
- Clarified personal-local capture, explicit shared-destination authorization and separately authorized wrapups across skill, CLI and Pi guidance.
- Fixed actual Desktop startup to use the same public/existing-install repair instructions as welcome, without raw filesystem errors. Early failures now notify before quitting; overlong Unix socket paths fail actionably before binding.
- Fixed a real-model temporal failure: Claude had guessed a missing event year from note creation time. Guidance now explicitly forbids that estimate, preserves unspecified years, and avoids injecting an unsupplied “stated on” date into captured facts.

## Authenticated model evidence after the temporal fix

Actual Claude Code **2.1.310**, model **claude-opus-5-5**, actual installer-generated project skill, three separate `claude -p` processes, provisioned QMD **2.8.3**. User completed local authentication; the harness used the default account normally without reading/copying credentials. Temporary settings disabled hooks/auto-memory; strict empty MCP, scoped tools, no session persistence and no permission-bypass flags. Every observed memory command selected the temporary personal root and disposable subprocess HOME.

1. **Readiness:** model discovered and invoked `Skill(jumpybrain-memory)`, then ran strict JSON doctor and bounded recall. Healthy/empty result; zero canonical memories.
2. **Remember:** exact user prompt “Remember that the community event is on 18 November.” A new model process activated the skill and wrote exactly one note, without redundant consent or an extra summary. Body: `The community event is on 18 November (year not specified).`
3. **Fresh recall:** exact user prompt “When is the community event?” New process activated the skill and used compact recall. Exact final answer:

   > The community event is on **18 November**. Your memory doesn't give a year.
   >
   > Source: `notes/2026-10-24-community-event-date.md`, lines 12–14 of your personal local memory. The note was written on 2026-10-24, but that's only when it was saved, not the event year.

All eleven behavioral/evidence checks passed: real completion, discovery/activation in all three processes, no setup sample, one saved note, unchanged canonical bytes after recall, correct citation/day/month, explicit unknown year and no speculative event year. Sanitized evidence: `/tmp/jb-claude-authenticated-evidence-v5.json`. Parent inspected actual tool calls, canonical text and the answer; command output alone was not treated as proof.

The first post-fix harness exit was 1 because its citation regex rejected the valid `file`, lines 12–14 format. Accepting that equivalent citation and revalidating **the same retained evidence**, without another model call, passed. The temporal failure before this fix remains documented in [authenticated Claude follow-up](claude-authenticated-followup.md). This single controlled before/after is not a guarantee of model compliance for every date or question.

Final skill template SHA-256: `155a5e219f33a9c124d637b4148aa892106c0191ce28caa680d3b1dfcacce8f8`; generated temporary skill SHA-256: `d26d77c5f95671f3b51c941cbb83ec497458251a9df9625c4ceed2f2678c7ca1`. The harness uses a positive source-copy allowlist and deletes the disposable runtime/brain afterward. It does not audit all automatic host account bookkeeping or provide an OS sandbox.

## Verification

- `npm run build` passed. Full post-native-fix suite: **1,368 tests, 1,367 passed, one skipped, zero failed**. After the final temporal guidance change, rebuilt and ran **24 focused guidance/formatting/installer tests**, all passed; no retrieval/storage semantics changed afterward.
- [Diagnostics](diagnostics-followup.md): eight new regression cases, 63 worker focused checks, real QMD bad-override/unset recovery; merged source covered by parent full suite.
- [Installer/platform](platform-followup.md): live GitHub bootstrap/help, exact-candidate HTTP bootstrap and nine-phase install/save/recall/expand/update/preview/uninstall lifecycle; actual read-only Desktop preflight; **28 bounded tests on Node 22.12.0**; real existing semantic model with network/downloads blocked; isolated local consumer artifact and remote-only client without QMD; read-only shared-target CLI enforcement.
- [Desktop](desktop-followup.md): fresh archived `695bae9` candidate compiled native helper and exercised real OS chooser cancel/invalid/A/B, light/dark/narrow and keyboard routes. Chooser UI/selection behavior was unchanged by later fixes.
- Parent repackaged current merged JS/runtime, reusing only a native executable whose unchanged build inputs were verified by the supported packer. Final packaged `app.asar` + real isolated helper passed native app/CLI roundtrip, A/B switching, relaunch, settings isolation, removed-helper public recovery, restored-helper retry, and overlong-socket notice before controlled quit. Artifacts: `/private/tmp/jb-onboarding-smoke-GfSHLU`. Unified Desktop `normal`, `crash`, `recovery` passed too. Actual installed app/CLI settings remained unchanged in the exercised checks.
- `git diff --check` passed. Runtime/code fingerprints are retained in [verification-snapshot.json](verification-snapshot.json); generated artifacts and model evidence are test outputs, not a release.

## Remaining external gates

Linux was attempted but Docker's daemon was unavailable; no Linux pass is claimed. Node 22.12 used a fake QMD fixture, so native engine installation/ABI behavior there remains untested. No clean macOS 13/Intel machine, quarantined/notarized Finder first launch, physical login/history-dependent Keychain, live VPS/public upgrade or real Pi-host conversation was established. Existing tooling and local models were reused. These are environment/distribution limits, not passing results or newly implemented capabilities. No user installation replacement, real feedback submission, version bump, release or push was performed. Existing installed integrations require explicit refresh to adopt new guidance.
