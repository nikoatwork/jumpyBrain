# Narrow note entry space

Increment of the [four-hour UX loop](2026-11-05_tasks-ux-four-hour-loop.md).

- [x] Reproduce expanded navigation on direct narrow note entry/breakpoint.
- [x] Reuse transient sidebar dismissal for selected note destinations and narrow breakpoint entry.
- [x] Verify direct links, responsive transitions, toggle, desktop preference, Home/Settings, failed navigation and canonical text.
- [x] Run sidebar and writing/board neighbors; record limits, archive and commit.

Pre-fix direct 320px entry failed: navigation stayed expanded. Receipt
`/tmp/jumpybrain-ux-narrow-entry-before.log`; original image remains
`.local-pack/ux-narrow-entry/320-direct.png`. Subsequent runs use unique
subdirectories to retain this failed visual observation. Candidate uses existing
transient dismissal on note routes and when entering the narrow note breakpoint.

Initial candidate passed the two direct-entry/resize/failure cases and 114 focused
tests. The writing journey printed all passed assertions but exited SIGTERM
(143) during fixture teardown, so it is not a clean process result. A sequential
signal-traced run will inspect that outcome. The board layout probe expected
navigation to stay expanded after resizing; its geometry read met a hidden tree.
Keep that attempt and explicitly open navigation for its layout-only inspection,
retaining all geometry/focus/preservation assertions. Intended tradeoff: entering
a narrow selected note now requires a toggle to inspect navigation; desktop and
initial Home remain expanded according to preference.

The sequential signal-traced writing journey completed all assertions and exited
0. Trace `/tmp/jumpybrain-ux-workspace-narrow-signals.trace` shows normal owned
child termination and a clean parent exit. The original parallel-run exit 143
remains an unexplained failed teardown, not erased or attributed to this policy.

Narrow route tradeoff is explicit: global navigation tools now require reopening
the sidebar, as they already did after selecting a narrow sidebar destination.
Affected diagnostic journeys perform that visible toggle through `showSidebar`
before requesting Home/Search/connection. This is disclosed fixture assistance,
not a discoverability pass; no functional assertion is weakened.

Outcome: keep, build `02721429af82d5af`. Both 320/390 direct-link cases pass
with initial body text in the viewport and more than 70% height for the note
panel. Breakpoint entry, explicit reopen, desktop preference, initial Home and
failed-departure canonical/draft checks pass; Settings behavior is retained by
the sidebar tests and board journey. The 114 focused sidebar/navigation/browser/
architecture/bundle tests pass. Full writing and nested-board journeys complete
cleanly, with the earlier failed teardown/layout attempt retained above.

All eight protected-browser suites pass after the disclosed navigation toggle:
reader/manual copy (4 cases), capability failures/delay (9), uncertain save with
peer (6), credential changes (2), generation feedback (8), retained review (10),
search warning scope (6) and Escape ownership (6). Their logs use the
`/tmp/jumpybrain-ux-narrow-` prefix. The credential probe began in the extended
stability tranche; its checked-in implementation lands here with the note-route
policy and shared visible-navigation helper it exercises.

Package: 1,448,759 compressed bytes, 4,565,122 unpacked, 3,051,136 runtime,
646 files. Editor 223,115 gzip bytes, same 15 packages. No ceiling/dependency
change. Existing screenshot failure is preserved separately from unique candidate
captures. Native Mac, physical touch/assistive technology and independent human
discoverability remain unobserved. The older 90-minute runtime stays frozen and
does not establish this route policy. Final broad checks belong to the parent.
