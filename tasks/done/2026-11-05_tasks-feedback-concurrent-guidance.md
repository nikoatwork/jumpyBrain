# Authorized concurrent-edit guidance

Feedback: ID610d7191-6712-4453-b92d-cd512de5ad8d (2026-11-05).

Scope: CLI instructions/help, managed memory skill, recommended agent guidance,
focused regressions and a disposable production browser/CLI proof. Preserve
canonical Markdown, destination authorization, actual read-base coordinates,
stable client identity, uncertain outcomes and existing size budgets. No editor
or updater changes; no personal/global integration or shared ledger writes.

## Outcome

Completed: initial CLI/skill/recommended AGENTS guidance now treats authorized
human/agent concurrency as normal, without new approval solely because the
editor is active. The write topic and help prefer source operations and preserve
actual read-base coordinates, client identity, destination scope, conflict
reconciliation and uncertain-write safeguards. Intentional whole-note
replacement remains hash-guarded. Corrected the companion guide's obsolete
wait/handover/reload advice. Existing user instructions/integrations stay intact.

## Required work

- [x] Reproduce missing entry-point concurrency guidance and whole-replacement-first advice.
- [x] Prefer authorized collaboration without another permission round solely because an editor is active; retain guarded intentional whole-note replacement.
- [x] Verify actual CLI output and rendered integration/recommended AGENTS text in disposable fixtures.
- [x] Exercise production browser typing alongside CLI positioned insertion and resync; verify exact canonical source.
- [x] Record tested snapshot, limits and scoped commit; archive only when required checks pass.

## Initial evidence

No AGENTS.md exists in this checkout or its filesystem ancestor directories.
Read product vision, task workflow, architecture and CLI/collaboration module docs.
`src/cli/instructions.ts` excludes its last collaboration rule from the initial
packet and places unconditional show/update advice earlier in the write topic.
`docs/agent-workflows.md` recommends an AGENTS hint with no concurrency route.
Existing read-base tests cover CLI/HTTP changes, but not the requested browser
plus CLI open/edit/resync path. Parent owns shared task/release bookkeeping.

## Validation and tested snapshot

- Baseline regression: after a clean build, the new entry-point test failed on
  missing authorized-concurrency advice; the two original instruction tests
  passed. The old write topic recommended generic show/update before collaboration.
- Dependencies: checkout-local `npm ci --ignore-scripts` (27 packages, zero
  reported vulnerabilities); no user CLI/app/integration installation.
- `npm run build` passed. Version 0.3.20, build `aa683a744853dffa`, source base
  `0cef4151522972920488aced7c54492ecfe54282`; instructions source SHA-256
  `b85322358065258c2728a38f7acec6d75ff2006fd0130971e5a0b826ab5ae461`.
- `node --test test/instructions-topics.test.js test/collaboration-cli-read-base.test.js`:
  8 passed. CLI instructions/agent-hint topics, actual initial/write stdout and
  collaboration help, recommended AGENTS hint, fictional rendered skill,
  stale-base transforms, true overlap rejection, positioned stream, epoch restart
  and required read flags all verified.
- Public installer selected test (`public installer installs global memory and
  detected integrations without npm publish` in `test/install-scripts.test.js`):
  1 passed. Actual Codex and Claude skills rendered into disposable fake-home
  fixtures contain concurrency and replacement guidance with resolved paths;
  the existing Pi installation fixture also succeeds. No Pi editing tool changes.
- `node --test test/instructions-topics.test.js test/collaboration-cli.test.js`:
  10 passed (the 3 guidance tests repeated after strengthening assertions plus
  7 real CLI stream/cancellation/identity regressions).
- `node --test test/cli-help-validation.test.js`: 5 passed, including all command
  help paths under negative side-effect sentinels. 21 unique focused tests passed.
- Entry instructions: 3,440 bytes (<4,000). Skill source: 5,461 bytes (<5,500).
  Build retained ordinary editor 672,540 bytes minified / 222,231 gzip. No ceilings changed.
- `npm run check:package-size` passed: archive 1,446,451 / 1,450,000 bytes;
  unpacked 4,570,936 / 4,600,000; runtime 3,059,897 / 3,100,000; 648 / 660 files.
- `git diff --check` passed. Combined full suite is parent-owned and was not run.

## Real production browser + CLI proof (2026-11-05)

Used the freshly built production shell served by a real disposable root backend,
with a separately issued fictional writer credential in an isolated browser
profile. Browser actions used the shared preview browser, actual contenteditable
keyboard input and Saved status; no mocked editor, injected source changes or
HTTP document-write stand-ins. CLI commands ran `dist/cli.js` through real
WebSocket collaboration with stable `--client-id guidance-agent` and a disposable
CLI config. The fixture used this body (no final newline):

```markdown
# Fictional concurrency

Human: alpha 🧠

Agent anchor: baseline

Tail: preserved
```

1. CLI `collaborate open --json` returned revision 0. Retained that exact body's
   epoch/revision and computed UTF-16 insertion offset 56 before `baseline`.
2. The browser typed ` typing-one` at the end of the Human paragraph, shifting
   the agent insertion location in the current source.
3. CLI `collaborate edit --start 56 --delete 0 --epoch <actual-read-epoch>
   --base-revision 0` inserted `AGENT insertion ` using the original read base.
   Result: saved true, revision 2; the insertion appeared at the intended anchor.
4. Without reloading or leaving the browser editor, typing continued with
   ` typing-two`. CLI resync returned saved revision 3 with both authors' changes.
5. Typing continued with ` typing-three` across the resync. Browser reached
   Saved, and final CLI resync returned saved revision 4, the same client ID and
   the exact browser/canonical body:

```markdown
# Fictional concurrency

Human: alpha 🧠 typing-one typing-two typing-three

Agent anchor: AGENT insertion baseline

Tail: preserved
```

Assertions compared full canonical body to this expected result, and preserved
note identity plus custom frontmatter `custom: retain-me`. Browser selection
remained in the Human paragraph. The tab was closed, backend stopped and the
fictional root removed. No personal note, remote memory, inbox or support write.

## Limits and integration handoff

Browser typing was automated in the human role, not a physical-user/IME/OS-input
study. The end-to-end proof covered loopback production browser plus local CLI;
it does not establish public VPS/TLS, arbitrary raw-writer compare-and-swap,
semantic indexing, or model behavior. Existing focused tests cover rejected
stale overlap and positioned streams separately. This lane changes guidance,
not collaboration/editor mechanics or enforced permissions. Actual contradictory
user-authored instructions still need deliberate review; no automatic overwrite
or personal/global integration refresh was performed. Parent owns shared feedback,
release/changelog bookkeeping and combined validation. No push, PR or release.
