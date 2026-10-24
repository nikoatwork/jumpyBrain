import { memoryDocumentPath } from "../dist/adapters/http-protocol.js";
import { createMapController, graphNodeTone } from "../dist/adapters/http-server/map-controller.js";
import { extractShellFunction as extractFunction } from "./browser-shell-helpers.js";
import * as documentController from "../dist/adapters/http-server/document-controller.js";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

import { graphMemory, initializeMemoryRoot } from "../dist/runtime/index.js";
import { graphPageHtml } from "../dist/adapters/http-server/graph-page.js";
import { createFeedbackDiagnostics } from "../dist/adapters/http-server/feedback.js";
import { startJumpyBrainHttpServer } from "../dist/server/index.js";

function pageScript() {
  return [...graphPageHtml("testnonce").matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
}

function loadGraphViewportRuntime({ scale = 1.5, pan = { x: 37, y: -24 }, rect = { left: 120, top: 80, width: 800, height: 600 } } = {}) {
  const script = pageScript();
  const listeners = new Map();
  const transforms = [];
  const control = (id) => ({
    addEventListener(type, callback, options) { listeners.set(id + ":" + type, { callback, options }); },
  });
  const elements = {
    graph: { ...control("graph"), getBoundingClientRect: () => rect },
    viewport: { setAttribute(name, value) { assert.equal(name, "transform"); transforms.push(value); } },
    "zoom-in": control("zoom-in"),
    "zoom-out": control("zoom-out"),
    "reset-view": control("reset-view"),
    ...Object.fromEntries(["reload", "query", "focus", "include-unresolved", "include-orphans"].map(id => [id, control(id)])),
  };
  const ctx = {
    state: { scale, pan: { ...pan } },
    $(id) { assert.ok(elements[id], "unexpected DOM dependency: " + id); return elements[id]; },
  };
  const map = createMapController({ state: ctx.state, element: ctx.$, document: { addEventListener() {} }, window: { addEventListener() {} } });
  map.connect();
  return { ...ctx, ...map, rect, listeners, transforms };
}

function assertClose(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} should be close to ${expected}`);
}

function graphPointAt(state, x, y) {
  return { x: (x - state.pan.x) / state.scale, y: (y - state.pan.y) / state.scale };
}

function loadPageEditorRuntime() { return documentController; }

function createManualClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map();
  return {
    setTimer(callback, delay) {
      const id = nextId++;
      timers.set(id, { callback, at: now + delay });
      return id;
    },
    clearTimer(id) { timers.delete(id); },
    advance(ms) {
      now += ms;
      const ready = [...timers.entries()].filter(([, timer]) => timer.at <= now).sort((a, b) => a[1].at - b[1].at);
      for (const [id, timer] of ready) {
        timers.delete(id);
        timer.callback();
      }
    },
    get pending() { return timers.size; },
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function createEditorHarness(overrides = {}) {
  const runtime = loadPageEditorRuntime();
  const clock = createManualClock();
  const writes = [];
  const reads = [];
  let current = true;
  const initialContent = overrides.content ?? '---\ntitle: "Alpha"\n---\n# Alpha\n';
  const editor = runtime.createDocumentEditor({
    generation: 1,
    nodeId: "pages/alpha.md",
    documentId: "mem_a0000000-0000-4000-8000-000000000001",
    debounceMs: 750,
    persistentEditing: overrides.persistentEditing,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    splitDocument: runtime.splitEditableDocument,
    composeDocument: runtime.composeEditableDocument,
    readDocument: async (id) => {
      reads.push(id);
      if (overrides.readDocument) return overrides.readDocument(id, reads.length);
      return { content: initialContent, contentHash: "sha256:reconciled" };
    },
    writeDocument: async (id, content, hash) => {
      writes.push({ id, content, hash });
      if (overrides.writeDocument) return overrides.writeDocument(id, content, hash, writes.length);
      return { newContentHash: "sha256:saved-" + writes.length };
    },
    isCurrent: () => current,
    onChange: () => undefined,
  });
  editor.hydrate({ content: initialContent, contentHash: "sha256:initial", title: "Alpha" });
  return { runtime, clock, editor, writes, reads, setCurrent(value) { current = value; } };
}

async function writeGraphFixture(root) {
  await writeFile(path.join(root, "pages", "alpha.md"), [
    "---",
    'id: "mem_a0000000-0000-4000-8000-000000000001"',
    'title: "Alpha"',
    'type: "page"',
    'tags: ["graph", "alpha"]',
    'created_at: "2026-07-04T00:00:00.000Z"',
    "---",
    "",
    "# Alpha",
    "",
    "Alpha links to [[Beta]] and [Gamma](../notes/gamma.md). Missing [[Missing Page]]. Secret graph body should stay bounded.",
  ].join("\n"));
  await writeFile(path.join(root, "notes", "beta.md"), [
    "---",
    'title: "Beta"',
    'type: "note"',
    'tags: ["graph"]',
    "---",
    "",
    "# Beta",
    "",
    "Beta links back to [[Alpha]].",
  ].join("\n"));
  await writeFile(path.join(root, "notes", "gamma.md"), [
    "---",
    'title: "Gamma"',
    'type: "note"',
    "---",
    "",
    "# Gamma",
  ].join("\n"));
  await writeFile(path.join(root, "notes", "orphan.md"), [
    "---",
    'title: "Orphan"',
    'type: "note"',
    "---",
    "",
    "# Orphan",
  ].join("\n"));
}

test("local graph derives document nodes, explicit link edges, unresolved targets, and backlinks from Markdown", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-graph-local-"));
  try {
    await initializeMemoryRoot(root);
    await writeGraphFixture(root);

    const graph = await graphMemory(root, { includeUnresolved: true });

    assert.equal(graph.documents, undefined);
    assert.equal(graph.stats.documents, 4);
    assert.equal(graph.stats.nodes, 5);
    assert.equal(graph.stats.edges, 4);
    assert.equal(graph.stats.markdownLinks, 1);
    assert.equal(graph.stats.wikiLinks, 3);
    assert.equal(graph.stats.unresolvedLinks, 1);
    assert.equal(graph.stats.orphans, 1);
    assert.deepEqual(graph.edges.map((edge) => [edge.source, edge.target, edge.kind, edge.resolved]), [
      ["notes/beta.md", "pages/alpha.md", "wiki-link", true],
      ["pages/alpha.md", "notes/beta.md", "wiki-link", true],
      ["pages/alpha.md", "notes/gamma.md", "markdown-link", true],
      ["pages/alpha.md", "unresolved:missing page", "wiki-link", false],
    ]);
    const alpha = graph.nodes.find((node) => node.id === "pages/alpha.md");
    assert.equal(alpha.id, "pages/alpha.md");
    assert.equal(alpha.title, "Alpha");
    assert.equal(alpha.documentId, "mem_a0000000-0000-4000-8000-000000000001");
    assert.equal(alpha.inDegree, 1);
    assert.equal(alpha.outDegree, 3);
    assert.match(alpha.snippet, /Alpha/);
    const beta = graph.nodes.find((node) => node.id === "notes/beta.md");
    assert.equal(beta.id, "notes/beta.md");
    assert.equal(beta.documentId, undefined);

    const focused = await graphMemory(root, { focus: "Alpha", depth: 1, includeUnresolved: false, includeOrphans: false });
    assert.deepEqual(focused.nodes.map((node) => node.id), ["notes/beta.md", "notes/gamma.md", "pages/alpha.md"]);
    assert.equal(focused.edges.length, 3);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("local graph handles aliases, anchors, duplicate basenames, and session docs", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-graph-edge-"));
  try {
    await initializeMemoryRoot(root);
    await writeFile(path.join(root, "pages", "topic.md"), [
      "---",
      'title: "Topic"',
      'type: "page"',
      "---",
      "",
      "Alias link [[Topic|Alias]] resolves to self; anchor [[Topic#Section]] also resolves to self.",
    ].join("\n"));
    await writeFile(path.join(root, "sessions", "session-1.md"), [
      "---",
      'session_id: "s-1"',
      'date: "2026-07-04"',
      "---",
      "",
      "# Session 1",
      "",
      "Session links to [[Topic]].",
    ].join("\n"));
    // Duplicate basename in two buckets
    await writeFile(path.join(root, "findings", "shared.md"), [
      "---",
      'title: "Shared Finding"',
    'type: "finding"',
      "---",
      "",
      "Finding links to [[Topic]].",
    ].join("\n"));
    await writeFile(path.join(root, "decisions", "shared.md"), [
      "---",
      'title: "Shared Decision"',
      'type: "decision"',
      "---",
      "",
      "Decision links to [[Topic]].",
    ].join("\n"));

    const graph = await graphMemory(root, { includeUnresolved: true, includeOrphans: false });

    assert.equal(graph.stats.documents, 4);
    // Duplicate basename "shared" must not cross-link findings/shared <-> decisions/shared.
    assert.equal(graph.edges.some((edge) => edge.source === "findings/shared.md" && edge.target === "decisions/shared.md"), false);
    assert.equal(graph.edges.some((edge) => edge.source === "decisions/shared.md" && edge.target === "findings/shared.md"), false);
    // Topic self-link via alias/anchor is skipped.
    assert.equal(graph.edges.some((edge) => edge.source === "pages/topic.md" && edge.target === "pages/topic.md"), false);
    // Sessions are included as document nodes.
    assert.equal(graph.nodes.some((node) => node.id === "sessions/session-1.md"), true);
    assert.equal(graph.nodes.find((node) => node.id === "sessions/session-1.md").type, "session");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("notes shell replaces the slide-in with an empty home and full-page raw editor", () => {
  const html = graphPageHtml("testnonce");
  assert.match(html, /<body data-view="home">/);
  assert.match(html, /id="home-search"[^>]*aria-label="Search notes"/);
  assert.match(html, /What's on your mind\?/);
  assert.match(html, /Search your memory/);
  assert.match(html, /<section id="note-panel"[^>]*hidden>/);
  for (const testid of ["graph-note-title", "graph-note-editor", "graph-note-save-state", "graph-note-retry"]) {
    assert.equal(html.includes(`data-testid="${testid}"`), true, `${testid} must be present`);
  }
  for (const obsolete of ["graph-note-close", "graph-note-content", "graph-note-edit\"", "panel-open", "panel-inner"]) {
    assert.equal(html.includes(obsolete), false, `${obsolete} must not remain`);
  }
  assert.match(html, /<header id="graph-header">[\s\S]*?data-testid="graph-ready"[\s\S]*?<\/header>/);
  assert.match(html, /id="note-search" aria-label="Search notes"/);
  assert.match(html, /role="combobox"[^>]*aria-controls="search-results"/);
  assert.match(html, /<ul id="search-results" role="listbox"/);
});

test("graph page uses quiet map controls with native filters and no depth UI", () => {
  const html = graphPageHtml("testnonce");
  assert.match(html, /color-scheme: light/);
  for (const token of ["--surface", "--control-fill", "--surface-hover", "--ink", "--ink-soft", "--focus-ring", "--radius-md", "--shadow-lg"]) {
    assert.equal(html.includes(token), true, `${token} design token must be present`);
  }
  assert.match(html, /class="toolbar" aria-label="Map controls"/);
  assert.match(html, /<h1>Memory map<\/h1>/);
  assert.match(html, /<details id="graph-filters">\s*<summary[^>]*aria-label="Filters"/);
  for (const id of ["include-orphans", "include-unresolved"]) {
    assert.match(html, new RegExp(`id="${id}"[^>]*type="checkbox"[^>]*checked`));
  }
  assert.doesNotMatch(html, /class="(?:topbar|legend)"|id="depth"|data-testid="graph-depth"/);
  assert.match(html, /class="canvas-tools" aria-label="Graph view controls"/);
  assert.match(html, /id="reset-view"/);
  assert.match(html, /prefers-reduced-motion/);
});

function graphNoticeHarness(options = {}) {
  const clock = createManualClock();
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, { textContent: "", hidden: true, children: [], setAttribute() {},
      replaceChildren() { this.children = []; }, append(child) { this.children.push(child); } });
    return elements.get(id);
  };
  const context = vm.createContext({
    systemMessages: { dispatch() {}, clear() {} },
    $: element, document: { createElement: () => ({ textContent: "" }) },
    state: { graphToken: 0, view: "graph", layoutTimer: null }, window: { setTimeout: clock.setTimer, clearTimeout: clock.clearTimer }, graphUrl: () => "/graph.json", render() {},
  });
  vm.runInContext(extractFunction(pageScript(), "setStatus"), context);
  context.state.view = "home"; // Notice/load tests do not need SVG layout.
  for (const id of ["query", "focus"]) element(id).value = "";
  Object.assign(context, createMapController({ state: context.state, element,
    document: context.document, window: context.window,
    fetchGraph: (url, signal) => context.graphJson(url, signal),
    searchNotes: (query, signal) => context.searchNotes(query, signal),
    onWarnings: warnings => { context.warnings = warnings; },
    setStatus: (...args) => context.setStatus(...args),
    onReady: ready => { context.window.__jumpyBrainGraphReady = ready; },
    ...options,
  }));
  context.warnings = [];
  return { context, element, clock };
}

function noticePacket(overrides = {}) {
  return { nodes: [{ nodeKind: "document" }, { nodeKind: "document" }, { nodeKind: "unresolved" }], edges: [],
    stats: { documents: 1636 }, options: { limit: 3 }, warnings: ["Graph response was limited to 3 nodes."], ...overrides };
}

test("map search passes shared matches as neighborhood seeds and removes generic incomplete warnings", async () => {
  const { context, element } = graphNoticeHarness();
  element("query").value = "health";
  const requests = [];
  context.searchNotes = async (query, signal) => {
    assert.equal(query, "health"); assert.equal(signal.aborted, false);
    return { files: ["notes/sleep & exercise.md"], warnings: ["Search results may be incomplete."], details: ["Recent edits are being indexed"] };
  };
  context.graphJson = async (url, signal) => {
    requests.push(new URL(url, "http://localhost")); assert.equal(signal.aborted, false);
    return noticePacket({ warnings: [], nodes: [{ nodeKind: "document", file: "notes/sleep & exercise.md" }] });
  };
  await context.loadGraph();
  assert.equal(context.hasCurrentGraph(), true);
  assert.equal(requests[0].searchParams.has("query"), false);
  assert.deepEqual(requests[0].searchParams.getAll("seeds"), ["", "notes/sleep & exercise.md"]);
  assert.equal(context.state.graph.nodes.length, 1);
  assert.match(element("reload").title, /Recent edits are being indexed/);
  assert.deepEqual(context.warnings, []);
  assert.equal(requests[0].searchParams.get("neighborLimit"), "0");
  assert.equal(requests[0].searchParams.has("files"), false);

  context.searchNotes = async () => ({ files: [], warnings: [] });
  await context.loadGraph();
  assert.deepEqual(requests[1].searchParams.getAll("seeds"), [""]);
  context.searchNotes = async () => { throw new Error("Search unavailable"); };
  await context.loadGraph();
  assert.equal(requests.length, 2, "failed search cannot fall back to a literal or unfiltered graph");
  assert.equal(element("error").hidden, false);
});

test("superseded and suspended map searches are aborted and cannot fetch or publish late graphs", async () => {
  const { context, element } = graphNoticeHarness();
  element("query").value = "health";
  const pending = deferred(); let signal; let calls = 0;
  context.searchNotes = (_query, requestedSignal) => { signal = requestedSignal; return pending.promise; };
  context.graphJson = async () => { calls++; return noticePacket(); };
  const first = context.loadGraph();
  element("query").value = "";
  await context.loadGraph();
  assert.equal(context.hasCurrentGraph(), true);
  assert.equal(signal.aborted, true);
  pending.resolve({ files: ["notes/old.md"], warnings: [] }); await first;
  assert.equal(calls, 1, "late search must not start a graph request");
  const second = deferred();
  element("query").value = "sleep";
  assert.equal(context.hasCurrentGraph(), false, "Back must refresh when the displayed packet belongs to older filters");
  context.searchNotes = (_query, requestedSignal) => { signal = requestedSignal; return second.promise; };
  const leaving = context.loadGraph();
  context.suspend();
  assert.equal(signal.aborted, true);
  second.resolve({ files: [], warnings: [] }); await leaving;
  assert.equal(calls, 1);
});

test("brain scope changes abort pending work and evict cached graph, camera and success identity", async () => {
  let scope = "brain-a";
  const h = graphNoticeHarness({ scope: () => scope });
  const pending = deferred(); let signal;
  h.context.graphJson = async () => noticePacket({ warnings: [] });
  await h.context.loadGraph();
  assert.equal(h.context.hasCurrentGraph(), true);
  h.context.state.pan = { x: 17, y: 22 }; h.context.state.scale = 2;
  h.context.graphJson = (_url, requestedSignal) => { signal = requestedSignal; return pending.promise; };
  const oldBrain = h.context.loadGraph();
  scope = "brain-b";
  assert.equal(h.context.hasCurrentGraph(), false);
  assert.equal(signal.aborted, true);
  assert.equal(h.context.state.graph, null);
  assert.deepEqual(h.context.state.pan, { x: 0, y: 0 });
  assert.equal(h.context.state.scale, 1);
  pending.resolve(noticePacket({ warnings: ["Previous brain warning"] }));
  await oldBrain;
  assert.equal(h.context.state.graph, null, "late old-brain packet cannot revive a graph");
  assert.deepEqual(h.context.warnings, []);
  assert.equal(h.clock.pending, 0, "settled aborted requests release delayed updating indicators");
});

test("graph shared-search seeds preserve rank and retain all qualifying matches without a display cap", async () => {
  const h = graphNoticeHarness();
  const files = Array.from({ length: 85 }, (_, index) => `notes/ranked-${index}.md`);
  h.element("query").value = "health";
  h.context.searchNotes = async () => ({ files, warnings: [] });
  let requested;
  h.context.graphJson = async url => { requested = new URL(url, "http://test"); return noticePacket({ nodes: [], warnings: [] }); };
  await h.context.loadGraph();
  assert.deepEqual(requested.searchParams.getAll("seeds"), ["", ...files]);
  assert.equal(requested.searchParams.get("neighborLimit"), "0");
  assert.equal(requested.searchParams.get("includeSnippets"), "0");
});

test("HTTP graph file selection applies before the node cap and empty selection returns no nodes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-graph-search-"));
  let server;
  try {
    await initializeMemoryRoot(root); await writeGraphFixture(root);
    server = await startJumpyBrainHttpServer({ root, apiKeys: ["fixture"], port: 0, autoIndex: false });
    const request = async params => {
      const response = await fetch(server.url + "/memories/all/graph.json?" + params, { headers: { Authorization: "Bearer fixture" } });
      assert.equal(response.status, 200); return response.json();
    };
    const unfiltered = await request("limit=1");
    const file = ["pages/alpha.md", "notes/beta.md", "notes/gamma.md", "notes/orphan.md"].find(file => file !== unfiltered.nodes[0].file);
    const selected = await request(new URLSearchParams({ limit: "1", files: file }));
    assert.deepEqual(selected.nodes.map(node => node.file), [file]);
    assert.equal(selected.stats.documents, 4);
    const connected = await request(new URLSearchParams([["files", "pages/alpha.md"], ["files", "notes/beta.md"]]));
    assert.equal(connected.nodes.length, 2); assert.equal(connected.edges.length, 2);
    const empty = await request("files=");
    assert.deepEqual(empty.nodes, []); assert.deepEqual(empty.edges, []);
    assert.equal((await request("files=..%2Foutside.md")).nodes.length, 0);
  } finally { if (server) await server.close(); await rm(root, { recursive: true, force: true }); }
});

test("map omits count summaries, node-limit warnings and narrowing hints", () => {
  const html = graphPageHtml("testnonce");
  assert.doesNotMatch(html, /id="graph-scope"|id="graph-limit-hint"/);
  const { context, element } = graphNoticeHarness();
  for (const packet of [noticePacket(), noticePacket({ warnings: [] }), noticePacket({ nodes: [] }), null]) {
    context.renderGraphNotice(packet);
    assert.deepEqual(context.warnings, []);
    assert.doesNotMatch(html, /id="graph-warnings"|id="graph-notice"/);
  }
});

test("map warnings remain text and tolerate missing/invalid optional metadata without inventing totals", () => {
  const { context, element } = graphNoticeHarness();
  const warning = '<img src=x onerror="alert(1)">';
  context.renderGraphNotice(noticePacket({ stats: { documents: "1636" }, options: {}, warnings: [warning, warning, null, 5, "  "] }));
  assert.deepEqual(context.warnings, [warning]);
  for (const stats of [undefined, { documents: -1 }, { documents: 1 }, { documents: 1.5 }]) {
    context.renderGraphNotice(noticePacket({ stats, warnings: undefined }));
    assert.deepEqual(context.warnings, []);
  }
  context.renderGraphNotice(null);
  assert.deepEqual(context.warnings, []);
});

test("map refresh clears old notices; failed refresh and stale responses cannot restore a success notice", async () => {
  const { context, element } = graphNoticeHarness();
  context.graphJson = async () => noticePacket({ warnings: ["Some linked targets are unavailable."] });
  await context.loadGraph();
  assert.deepEqual(context.warnings, ["Some linked targets are unavailable."]);
  const stale = deferred(), fresh = deferred();
  context.graphJson = () => stale.promise;
  const first = context.loadGraph();
  assert.deepEqual(context.warnings, [], "loading clears stale warnings");
  context.graphJson = () => fresh.promise;
  const second = context.loadGraph();
  fresh.resolve(noticePacket({ stats: { documents: 2 }, warnings: [] }));
  await second;
  stale.resolve(noticePacket({ warnings: ["Some linked targets are unavailable."] })); await first;
  assert.deepEqual(context.warnings, [], "outdated response cannot restore a notice");
  context.graphJson = async () => { throw new Error("Synthetic graph failure"); };
  await context.loadGraph();
  assert.deepEqual(context.warnings, []);
  assert.equal(element("ready").hidden, true);
  assert.equal(element("error").hidden, false);
  assert.equal(context.window.__jumpyBrainGraphReady, false);
});

test("all browser views share Ember surfaces and semantic controls", () => {
  const html = graphPageHtml("testnonce");
  const css = html.match(/<style[^>]*>([\s\S]*?)<\/style>/)[1];
  assert.match(css, /--surface: #e6dac4;/);
  assert.match(css, /--surface: #1c1b19;/);
  assert.match(css, /--control-fill: #d8ccb0;/);
  assert.match(css, /--surface-hover: #cec2a8;/);
  assert.doesNotMatch(css, /--(?:cream|forest|sage|gold|clay|white)\b/);
  for (const selector of ["body", "#graph-header", "#graph-wrap", ".map-options", "dialog", "#note-name", "#note-editor", "#dream-preview"]) {
    const rule = css.split("\n").find((line) => line.trimStart().startsWith(selector + " {"));
    assert.match(rule, /background: var\(--surface\)/, selector);
  }
  for (const selector of [".button-primary", ".quiet-button", ".icon-button", "#home-new"]) {
    const rule = css.split("\n").find((line) => line.trimStart().startsWith(selector + " {"));
    assert.match(rule, /background: var\(--control-fill\)/, selector);
  }
  const defined = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]));
  defined.add("--node-fill"); // Per-node inline override with a CSS fallback.
  for (const match of css.matchAll(/var\((--[\w-]+)/g)) {
    assert.ok(defined.has(match[1]), `undefined design token: ${match[1]}`);
  }
  for (const type of ["page", "decision", "finding", "preference", "session", "note", "unresolved"]) {
    assert.ok(defined.has(`--node-${type}`));
    assert.equal(graphNodeTone({ nodeKind: type === "unresolved" ? "unresolved" : "document", type }), type);
    assert.ok(html.includes(`stop-color="var(--node-${type})"`), `${type} glow uses the shared palette`);
  }
});

test("pointer zoom preserves the anchored graph point with nonzero pan and SVG rect offsets", () => {
  for (const rect of [
    { left: 120, top: 80, width: 800, height: 600 },
    { left: -40, top: 210, width: 800, height: 600 },
    { left: -240, top: -180, width: 800, height: 600 }, // Client coordinates of zero are valid anchors.
  ]) {
    const h = loadGraphViewportRuntime({ rect });
    const before = graphPointAt(h.state, 240, 180);
    h.zoomGraph(2, rect.left + 240, rect.top + 180);
    assert.equal(h.state.scale, 3);
    assert.equal(h.state.pan.x, -166);
    assert.equal(h.state.pan.y, -228);
    const after = graphPointAt(h.state, 240, 180);
    assertClose(after.x, before.x);
    assertClose(after.y, before.y);
    assert.deepEqual(h.transforms, ["translate(-166 -228) scale(3)"]);
  }
});

test("zoom buttons anchor to the SVG center and plus/minus are reversible", () => {
  const h = loadGraphViewportRuntime();
  const initial = { scale: h.state.scale, pan: { ...h.state.pan } };
  const center = { x: h.rect.width / 2, y: h.rect.height / 2 };
  const before = graphPointAt(h.state, center.x, center.y);
  for (let i = 0; i < 20; i++) {
    h.listeners.get("zoom-in:click").callback();
    assertClose(h.state.scale, initial.scale * 1.2);
    const after = graphPointAt(h.state, center.x, center.y);
    assertClose(after.x, before.x);
    assertClose(after.y, before.y);
    h.listeners.get("zoom-out:click").callback();
    assertClose(h.state.scale, initial.scale);
    assertClose(h.state.pan.x, initial.pan.x);
    assertClose(h.state.pan.y, initial.pan.y);
  }
  assert.equal(h.transforms.length, 40);
});

test("zoom uses the clamped ratio at both bounds and never drifts at a limit", () => {
  for (const { scale, factor, limit } of [
    { scale: 7.8, factor: 1.2, limit: 8 },
    { scale: .21, factor: .5, limit: .2 },
  ]) {
    const h = loadGraphViewportRuntime({ scale });
    const before = graphPointAt(h.state, 240, 180);
    const zoom = () => h.zoomGraph(factor, h.rect.left + 240, h.rect.top + 180);
    zoom();
    assert.equal(h.state.scale, limit);
    const after = graphPointAt(h.state, 240, 180);
    assertClose(after.x, before.x);
    assertClose(after.y, before.y);
    const limitedPan = { ...h.state.pan };
    for (let i = 0; i < 20; i++) zoom();
    assert.equal(h.state.scale, limit);
    assertClose(h.state.pan.x, limitedPan.x);
    assertClose(h.state.pan.y, limitedPan.y);
  }
});

test("wheel wiring is non-passive, ignores zero/horizontal scroll, and anchors nonzero scroll", () => {
  const h = loadGraphViewportRuntime();
  const wheel = h.listeners.get("graph:wheel");
  assert.equal(wheel.callback, h.onGraphWheel);
  assert.equal(wheel.options.passive, false);
  let prevented = 0;
  const event = { clientX: 360, clientY: 260, preventDefault() { prevented++; } };
  for (const deltaX of [0, -100, 100]) wheel.callback({ ...event, deltaX, deltaY: 0 });
  assert.equal(prevented, 0);
  assert.equal(h.transforms.length, 0);
  assert.equal(h.state.scale, 1.5);
  assert.deepEqual({ ...h.state.pan }, { x: 37, y: -24 });
  const before = graphPointAt(h.state, 240, 180);
  for (const deltaY of [-100, 100]) {
    const scale = h.state.scale;
    wheel.callback({ ...event, deltaX: 0, deltaY });
    assertClose(h.state.scale, scale * (deltaY < 0 ? 1.1 : .9));
    const after = graphPointAt(h.state, 240, 180);
    assertClose(after.x, before.x);
    assertClose(after.y, before.y);
  }
  assert.equal(prevented, 2);
  assert.equal(h.transforms.length, 2);
});

test("graph URL needs no depth control and retains inclusion defaults and encoded filters", () => {
  const controls = {
    query: { value: "  " }, focus: { value: "" },
    "include-unresolved": { checked: true }, "include-orphans": { checked: true },
  };
  const ctx = {
    URLSearchParams,
    $(id) { assert.ok(controls[id], "unexpected DOM dependency: " + id); return controls[id]; },
  };
  Object.assign(ctx, createMapController({ element: ctx.$ }));
  const defaults = new URL(ctx.graphUrl(), "http://localhost");
  assert.equal(defaults.pathname, "/memories/all/graph.json");
  assert.deepEqual(Object.fromEntries(defaults.searchParams), { includeUnresolved: "1", includeOrphans: "1", includeSnippets: "0", limit: "10000", edgeLimit: "20000" });
  controls.query.value = "  tag & title  ";
  controls.focus.value = "  pages/a b.md  ";
  controls["include-unresolved"].checked = false;
  controls["include-orphans"].checked = false;
  assert.deepEqual(Object.fromEntries(new URL(ctx.graphUrl(), "http://localhost").searchParams), {
    query: "tag & title", focus: "pages/a b.md", includeUnresolved: "0", includeOrphans: "0", includeSnippets: "0", limit: "10000", edgeLimit: "20000",
  });
});

function graphRenderHarness() {
  const focused = [], elements = new Map();
  function node(tag = "g") {
    const attributes = new Map();
    return { tag, children: [], style: { setProperty() {} }, classList: { add() {}, remove() {} },
      setAttribute(name, value) { attributes.set(name, value); }, getAttribute(name) { return attributes.get(name) ?? null; },
      append(...children) { this.children.push(...children); },
      insertBefore(child) { this.children.push(child); }, replaceChildren() { this.children = []; }, remove() {},
      querySelector(tag) { return this.children.find(child => child.tag === tag); },
      getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 600 }; },
      focus(options) { focused.push({ id: attributes.get("data-node-id") ?? "query", preventScroll: options.preventScroll }); },
    };
  }
  const element = id => { if (!elements.has(id)) elements.set(id, Object.assign(node(id), { value: "", checked: true })); return elements.get(id); };
  const state = { view: "graph", graphToken: 0, selected: null, pan: { x: 0, y: 0 }, scale: 1 };
  const map = createMapController({ state, element, document: { createElementNS(_namespace, tag) { return node(tag); } }, window: {} });
  return { map, state, focused, element };
}

test("graph focus restoration selects a rendered identity and falls back to the map filter", () => {
  const h = graphRenderHarness();
  const graph = { nodes: ["pages/a.md", "pages/b.md"].map(id => ({ id, title: id, nodeKind: "document", degree: 0 })), edges: [] };
  h.map.render(graph);
  h.map.focusGraphNode("pages/b.md");
  h.map.focusGraphNode("missing.md");
  h.map.focusGraphNode(null);
  assert.deepEqual(h.focused, [{ id: "pages/b.md", preventScroll: true }, { id: "query", preventScroll: true }, { id: "query", preventScroll: true }]);
});

test("graph reconciliation retains surviving node targets, camera and updated accessible titles", () => {
  const h = graphRenderHarness();
  const node = { id: "notes/health.md", title: "Health", nodeKind: "document", degree: 0 };
  h.map.render({ nodes: [node], edges: [] });
  const target = h.element("viewport").children.find(child => child.getAttribute("data-node-id") === node.id);
  h.state.pan = { x: 25, y: -30 }; h.state.scale = 1.75;
  h.map.render({ nodes: [{ ...node, title: "Health and sleep" }], edges: [] }, true);
  assert.equal(h.element("viewport").children.find(child => child.getAttribute("data-node-id") === node.id), target);
  assert.equal(target.getAttribute("aria-label"), "Health and sleep, memory note");
  assert.deepEqual(h.state.pan, { x: 25, y: -30 });
  assert.equal(h.state.scale, 1.75);
});

test("notes editing stays in the HTTP shell with persistent rich editing and native dialogs", () => {
  const html = graphPageHtml("testnonce");
  const script = pageScript();
  assert.match(script, /node\.nodeKind === "unresolved"/);
  assert.match(script, /navigation\.navigate\("\/\?note="/);
  assert.match(script, /requestEditorNavigation/);
  assert.match(script, /searchDialog\.addEventListener\("cancel"/);
  assert.match(script, /beforeunload/);
  assert.match(html, /id="note-save-state"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(html, /id="note-editor"[^>]*aria-label="Markdown note body"/);
  assert.match(html, /@media \(max-width: 680px\)[\s\S]*#note-editor/);
  assert.match(html, /id="open-connection"[^>]*aria-label="Connect · Connection settings"/);
  assert.match(html, /id="connection" aria-labelledby="connection-title"/);
  assert.match(script, /persistentEditing: true/);
  assert.doesNotMatch(script, /state\.editor\.setEditing\(false\)/);
  assert.match(html, /Scroll to zoom · Drag to move · Select a note to open/);
});

test("graph page keeps unresolved and missing-ID nodes non-editable and dispatches shared warnings", async () => {
  const script = pageScript(), messages = [], navigations = [];
  const ctx = {
    systemMessages: { dispatch: message => messages.push(message), clear() {} },
    navigation: { navigate: async url => { navigations.push(url); return true; } }, state: {},
  };
  vm.createContext(ctx);
  vm.runInContext(extractFunction(script, "isValidMemoryDocumentId"), ctx);
  vm.runInContext(extractFunction(script, "selectNode"), ctx);
  const documentId = "mem_a0000000-0000-4000-8000-000000000001";
  await ctx.selectNode({ nodeKind: "unresolved", title: "Missing" });
  await ctx.selectNode({ nodeKind: "document", documentId: "pages/alpha.md" });
  assert.equal(navigations.length, 0);
  assert.equal(messages.length, 2);
  assert.ok(messages.every(message => message.source === "graph-selection" && message.severity === "warning"));
  await ctx.selectNode({ id: "node", nodeKind: "document", documentId });
  assert.deepEqual(navigations, ["/?note=" + documentId]);
  assert.equal(ctx.state.selected, "node");
});

test("graph document transport centralizes optional Bearer auth and PUT preconditions", async () => {
  const script = pageScript();
  const requests = [];
  const ctx = {
    feedbackDiagnostics: createFeedbackDiagnostics(),
    browserActor: { kind: "human", id: "browser:fixture" },
    activeApiKey: "secret", credentialRevision: 0, connectionStatus: "checking",
    renderConnection: () => {},
    fetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, status: 200, json: async () => ({ newContentHash: "sha256:new" }) };
    },
  };
  ctx.memoryDocumentPath = memoryDocumentPath;
  vm.createContext(ctx);
  vm.runInContext([
    extractFunction(script, "graphFetch"),
    extractFunction(script, "graphJson"),
    extractFunction(script, "documentUrl"),
    extractFunction(script, "writeGraphDocument"),
  ].join("\n"), ctx);

  const documentId = "mem_a0000000-0000-4000-8000-000000000001";
  await ctx.writeGraphDocument(documentId, "# Changed\n", "sha256:old");
  assert.equal(requests[0].url, `/memories/all/documents/${documentId}`);
  assert.equal(requests[0].options.method, "PUT");
  assert.equal(requests[0].options.headers.Authorization, "Bearer secret");
  assert.equal(requests[0].options.headers["Content-Type"], "application/json");
  assert.equal(requests[0].options.headers["If-Match"], "sha256:old");
  assert.deepEqual(JSON.parse(requests[0].options.body), { content: "# Changed\n", actor: { kind: "human", id: "browser:fixture" } });

  ctx.activeApiKey = "";
  await ctx.graphFetch("/memories/all/graph.json");
  assert.equal("Authorization" in requests[1].options.headers, false);
});

test("graph editor document codec isolates read-only frontmatter and preserves body line structure", () => {
  const { splitEditableDocument, composeEditableDocument } = loadPageEditorRuntime();
  const exact = '---\r\ntitle: "Alpha"\r\n---\r\n\r\n# Alpha\r\n\r\n```text\r\n---\r\n```';
  const parts = splitEditableDocument(exact);
  assert.equal(parts.frontmatterPrefix, '---\r\ntitle: "Alpha"\r\n---\r\n');
  assert.equal(parts.body, '\n# Alpha\n\n```text\n---\n```');
  assert.equal(parts.newline, "\r\n");
  assert.equal(parts.trailingNewline, false);
  assert.equal(composeEditableDocument(parts.frontmatterPrefix, parts.body, parts.newline), exact);

  const trailing = splitEditableDocument("---\ntitle: T\n---\nbody\n\n");
  assert.equal(trailing.body, "body\n\n");
  assert.equal(trailing.trailingNewline, true);
  assert.equal(composeEditableDocument(trailing.frontmatterPrefix, trailing.body, trailing.newline), "---\ntitle: T\n---\nbody\n\n");
});

test("page renames serialize title metadata, preserve body, and retain duplicate drafts for correction", async () => {
  const h = createEditorHarness({
    writeDocument: async (_id, content, _hash, count) => {
      if (count === 1) throw Object.assign(new Error("Another memory document already uses this title. Choose a different title."), { status: 409, code: "duplicate_title" });
      return { newContentHash: "sha256:renamed" };
    },
  });
  h.editor.setEditing(true);
  h.editor.inputTitle("Taken");
  assert.equal(await h.editor.flush(), false);
  assert.equal(h.writes.length, 1, "duplicates must not enter the 412 overwrite retry");
  assert.equal(h.editor.state.title, "Taken");
  assert.match(h.editor.state.saveError, /already uses this title/);
  assert.equal(h.editor.hasPending(), true);
  assert.equal(h.editor.state.unconfirmedSave, false);
  h.editor.inputTitle('Unique "page"');
  assert.equal(await h.editor.flush(), true, "correcting the name resumes autosave");
  assert.match(h.writes[1].content, /title: "Unique \\"page\\""/);
  assert.equal(h.runtime.splitEditableDocument(h.writes[1].content).body, "# Alpha\n");
  assert.equal(h.editor.state.savedTitle, 'Unique "page"');
  h.editor.input("Updated body\n");
  await h.editor.flush();
  assert.ok(h.writes[2].content.includes('title: "Unique \\"page\\""'), "later body saves retain the renamed title");
});

test("a lost-response rename retains the draft until explicit reload", async () => {
  const h = createEditorHarness({
    readDocument: async () => ({ title: "Beta", content: '---\ntitle: "Beta"\n---\nSaved body', contentHash: "sha256:committed" }),
    writeDocument: async () => { throw new Error("Lost response after commit"); },
  });
  h.editor.inputTitle("Beta");
  assert.equal(await h.editor.flush(), false);
  h.editor.inputTitle("Alpha");
  assert.equal(h.editor.hasPending(), true);
  assert.equal(h.writes.length, 1);
  assert.equal(await h.editor.reloadSaved(), true);
  assert.equal(h.editor.state.title, "Beta");
  assert.equal(h.editor.state.draft, "Saved body");
  assert.equal(h.editor.hasPending(), false);
});

test("a body-only conflict never overwrites a concurrently renamed note", async () => {
  const h = createEditorHarness({ writeDocument: async () => { throw Object.assign(new Error("Stale hash"), { status: 412 }); } });
  h.editor.input("Updated body");
  assert.equal(await h.editor.flush(), false);
  assert.equal(h.writes.length, 1);
  assert.equal(h.reads.length, 0);
  assert.equal(h.editor.state.draft, "Updated body");
  assert.equal(h.editor.state.saveErrorCode, "precondition_failed");
});

test("empty page names never write, and undoing a rename is a no-op", async () => {
  const h = createEditorHarness();
  h.editor.setEditing(true);
  h.editor.inputTitle("Other");
  h.editor.inputTitle("Alpha");
  assert.equal(await h.editor.flush(), true);
  assert.equal(h.writes.length, 0);
  h.editor.inputTitle("  ");
  assert.equal(await h.editor.flush(), false);
  assert.equal(h.writes.length, 0);
  h.editor.inputTitle("Valid");
  assert.equal(await h.editor.flush(), true);
  assert.equal(h.writes.length, 1);
});

test("title codec safely replaces metadata while preserving newline style", () => {
  const { withEditableTitle } = loadPageEditorRuntime();
  assert.equal(withEditableTitle('---\r\nid: "id"\r\ntitle: "Old"\r\n---\r\n', "New", "\r\n"), '---\r\ntitle: "New"\r\nid: "id"\r\n---\r\n');
  assert.throws(() => withEditableTitle("", "bad\nname", "\n"), /page name/);
});

test("graph editor debounces a burst for 750 ms and sends only the newest body", async () => {
  const harness = createEditorHarness();
  harness.editor.setEditing(true);
  harness.editor.input("first");
  harness.editor.input("second");
  harness.editor.input("newest\n");
  assert.equal(harness.clock.pending, 1);
  harness.clock.advance(749);
  assert.equal(harness.writes.length, 0);
  harness.clock.advance(1);
  await harness.editor.flush();
  assert.equal(harness.writes.length, 1);
  assert.equal(harness.writes[0].hash, "sha256:initial");
  assert.match(harness.writes[0].content, /---\nnewest\n$/);
  assert.equal(harness.editor.state.contentHash, "sha256:saved-1");
  assert.equal(harness.editor.state.dirty, false);
});

test("graph editor skips unchanged content and reconciles canonical frontmatter after a save", async () => {
  const canonical = '---\ntitle: "Alpha"\nupdated_at: "canonical"\n---\nchanged body\n';
  const harness = createEditorHarness({ readDocument: async () => ({ content: canonical, contentHash: "sha256:canonical" }) });
  const originalBody = harness.editor.state.draft;
  harness.editor.input(originalBody);
  await harness.editor.flush();
  assert.equal(harness.writes.length, 0);

  harness.editor.setEditing(true);
  harness.editor.input("changed body\n");
  await harness.editor.startSave();
  harness.editor.setEditing(false);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.reads.length, 1);
  assert.match(harness.editor.state.frontmatterPrefix, /updated_at: "canonical"/);
  assert.equal(harness.editor.state.draft, "changed body\n");
  assert.equal(harness.editor.state.contentHash, "sha256:canonical");
});

test("persistent raw editing reconciles metadata without replacing concurrent body drafts", async () => {
  const pending = deferred();
  const harness = createEditorHarness({ persistentEditing: true, readDocument: () => pending.promise });
  harness.editor.setEditing(true);
  harness.editor.input("saved body");
  await harness.editor.startSave();
  assert.equal(harness.reads.length, 1, "persistent editing still reconciles after an idle save");
  harness.editor.input("newer local body");
  pending.resolve({ content: '---\nupdated_at: "canonical"\n---\nsaved body', contentHash: "sha256:canonical" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.editor.state.draft, "newer local body");
  assert.equal(harness.editor.state.contentHash, "sha256:saved-1");
  assert.equal(harness.editor.state.editing, true);

  const canonical = createEditorHarness({ persistentEditing: true, readDocument: async () => ({ content: '---\nupdated_at: "canonical"\n---\nsaved body', contentHash: "sha256:canonical" }) });
  canonical.editor.setEditing(true);
  canonical.editor.input("saved body");
  await canonical.editor.startSave();
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(canonical.editor.state.frontmatterPrefix, /canonical/);
  assert.equal(canonical.editor.state.contentHash, "sha256:canonical");
  assert.equal(canonical.editor.state.draft, "saved body");

  const remote = createEditorHarness({ persistentEditing: true, readDocument: async () => ({ content: "another writer changed the body", contentHash: "sha256:remote" }) });
  remote.editor.setEditing(true);
  remote.editor.input("saved body");
  await remote.editor.startSave();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(remote.editor.state.draft, "saved body", "keep active textarea body stable");
  assert.equal(remote.editor.state.contentHash, "sha256:saved-1", "different body must retain stale precondition for explicit conflict path");
});

test("graph editor serializes input during a save and advances successive content hashes", async () => {
  const first = deferred();
  const harness = createEditorHarness({
    writeDocument: async (_id, _content, _hash, count) => count === 1 ? first.promise : { newContentHash: "sha256:second" },
  });
  harness.editor.setEditing(true);
  harness.editor.input("draft one");
  const saving = harness.editor.startSave();
  assert.equal(harness.writes.length, 1);
  harness.editor.input("draft two");
  assert.equal(harness.writes.length, 1, "a second PUT must not run in parallel");
  first.resolve({ newContentHash: "sha256:first" });
  await saving;
  assert.equal(harness.writes.length, 2);
  assert.equal(harness.writes[1].hash, "sha256:first");
  assert.match(harness.writes[1].content, /draft two$/);
  assert.equal(harness.editor.state.draft, "draft two");
  assert.equal(harness.editor.state.dirty, false);
});

test("conflict recovery reloads the saved version only on explicit request and never writes", async () => {
  const h = createEditorHarness({
    readDocument: async () => ({ title: "Server title", content: "Saved body", contentHash: "sha256:latest" }),
    writeDocument: async () => { throw Object.assign(new Error("stale"), { status: 412 }); },
  });
  h.editor.input("Local draft");
  assert.equal(await h.editor.flush(), false);
  assert.equal(h.editor.state.draft, "Local draft");
  assert.equal(h.reads.length, 0);
  assert.equal(await h.editor.reloadSaved(), true);
  assert.equal(h.editor.state.draft, "Saved body");
  assert.equal(h.editor.state.title, "Server title");
  assert.equal(h.editor.state.contentHash, "sha256:latest");
  assert.equal(h.editor.hasPending(), false);
  assert.equal(h.writes.length, 1);
});

test("graph editor stops after save failures, retains drafts, and requires manual retry", async () => {
  for (const failure of [new Error("network down"), ...[401, 403, 413, 422, 429, 500].map((status) => Object.assign(new Error("HTTP " + status), { status }))]) {
    let failing = true;
    const harness = createEditorHarness({
      writeDocument: async () => {
        if (failing) throw failure;
        return { newContentHash: "sha256:retried" };
      },
    });
    harness.editor.setEditing(true);
    harness.editor.input("unsaved local draft");
    await harness.editor.startSave();
    assert.equal(harness.editor.state.saveStatus, "failed");
    assert.equal(harness.editor.state.dirty, true);
    harness.editor.input("newer unsaved local draft");
    harness.clock.advance(2000);
    assert.equal(harness.writes.length, 1, "failed saves must not auto-loop");
    failing = false;
    await harness.editor.retry();
    assert.equal(harness.writes.length, 2);
    assert.equal(harness.editor.state.saveStatus, "saved");
    assert.equal(harness.editor.state.dirty, false);
  }
});

test("undoing to the original body after an unconfirmed save stays retryable and guarded", async () => {
  let failing = true;
  const harness = createEditorHarness({ writeDocument: async () => {
    if (failing) throw new Error("response lost after a possibly committed write");
    return { newContentHash: "sha256:confirmed" };
  } });
  harness.editor.setEditing(true);
  const original = harness.editor.state.draft;
  harness.editor.input("attempted change");
  await harness.editor.startSave();
  harness.editor.input(original);
  assert.equal(harness.editor.hasPending(), true, "uncertain server state still needs unload protection");
  assert.equal(await harness.editor.flush(), false);
  failing = false;
  assert.equal(await harness.editor.retry(), true);
  assert.match(harness.writes.at(-1).content, /# Alpha\n$/);
  assert.equal(harness.editor.hasPending(), false);
  assert.equal(harness.editor.state.saveStatus, "saved");
  assert.equal(await harness.editor.flush(), true);
});

test("graph navigation waits for a save and keeps a failed draft reachable", async () => {
  const pending = deferred();
  const harness = createEditorHarness({ writeDocument: async () => pending.promise });
  harness.editor.input("pending navigation draft");
  const ctx = { documentActions: { isBusy: () => false }, state: { editor: harness.editor }, referenceAutocomplete: { dismiss() {} } };
  vm.createContext(ctx);
  vm.runInContext(extractFunction(pageScript(), "requestEditorNavigation"), ctx);
  let navigated = false;
  const firstNavigation = ctx.requestEditorNavigation(() => { navigated = true; });
  assert.equal(harness.editor.state.navigationPending, true);
  assert.equal(await ctx.requestEditorNavigation(() => { throw new Error("second navigation must be blocked"); }), false);
  pending.resolve({ newContentHash: "sha256:navigated" });
  assert.equal(await firstNavigation, true);
  assert.equal(navigated, true);

  const failed = createEditorHarness({ writeDocument: async () => { throw new Error("offline"); } });
  failed.editor.input("reachable failed draft");
  const failedCtx = { documentActions: { isBusy: () => false }, state: { editor: failed.editor }, referenceAutocomplete: { dismiss() {} } };
  vm.createContext(failedCtx);
  vm.runInContext(extractFunction(pageScript(), "requestEditorNavigation"), failedCtx);
  let failedNavigation = false;
  assert.equal(await failedCtx.requestEditorNavigation(() => { failedNavigation = true; }), false);
  assert.equal(failedNavigation, false);
  assert.equal(failed.editor.state.navigationPending, false);
  assert.equal(failed.editor.state.draft, "reachable failed draft");
  assert.equal(failed.editor.state.saveStatus, "failed");
});

test("graph page warns on unload only while a draft or save is pending", () => {
  let pending = false;
  const ctx = { state: { editor: { hasPending: () => pending } } };
  vm.createContext(ctx);
  vm.runInContext(extractFunction(pageScript(), "protectPendingEditorUnload"), ctx);
  const cleanEvent = { prevented: false, preventDefault() { this.prevented = true; } };
  ctx.protectPendingEditorUnload(cleanEvent);
  assert.equal(cleanEvent.prevented, false);
  assert.equal("returnValue" in cleanEvent, false);

  pending = true;
  const dirtyEvent = { prevented: false, preventDefault() { this.prevented = true; } };
  ctx.protectPendingEditorUnload(dirtyEvent);
  assert.equal(dirtyEvent.prevented, true);
  assert.equal(dirtyEvent.returnValue, "");
});

test("graph editor bounds repeated conflicts and ignores a late save after cancellation", async () => {
  const conflictHarness = createEditorHarness({
    readDocument: async () => ({ content: '---\ntitle: "Latest"\n---\nserver', contentHash: "sha256:latest" }),
    writeDocument: async () => { throw Object.assign(new Error("stale"), { status: 412 }); },
  });
  conflictHarness.editor.setEditing(true);
  conflictHarness.editor.input("local");
  await conflictHarness.editor.startSave();
  assert.equal(conflictHarness.writes.length, 1, "a conflict never silently retries");
  assert.equal(conflictHarness.editor.state.saveStatus, "failed");
  assert.equal(conflictHarness.editor.state.draft, "local");

  const pending = deferred();
  const staleHarness = createEditorHarness({ writeDocument: async () => pending.promise });
  staleHarness.editor.setEditing(true);
  staleHarness.editor.input("document A draft");
  const save = staleHarness.editor.startSave();
  staleHarness.editor.cancel();
  pending.resolve({ newContentHash: "sha256:late" });
  await save;
  assert.equal(staleHarness.editor.state.contentHash, "sha256:initial");
  assert.equal(staleHarness.editor.state.draft, "document A draft");
});

function mapFilterHarness() {
  const clock = createManualClock();
  const listeners = new Map(), elements = new Map(), requests = [];
  const state = { view: "graph", graphToken: 0 };
  const element = id => {
    if (!elements.has(id)) elements.set(id, { value: "", checked: true, setAttribute() {},
      replaceChildren() {},
      addEventListener(type, callback) { listeners.set(id + ":" + type, callback); },
    });
    return elements.get(id);
  };
  const pending = [];
  const map = createMapController({ state, element, document: { addEventListener() {} },
    window: { addEventListener() {}, setTimeout: clock.setTimer, clearTimeout: clock.clearTimer },
    fetchGraph(url) { requests.push(new URL(url, "http://localhost")); const request = deferred(); pending.push(request); return request.promise; },
    searchNotes: async () => ({ files: ["notes/body-match.md"], warnings: [] }),
    setStatus() {}, onReady() {},
  });
  map.connect();
  return { clock, state, element, requests, map,
    fire(id, type, event = {}) { listeners.get(id + ":" + type)(event); },
    async finish() {
      state.view = "home";
      for (const request of pending) request.resolve({ nodes: [], edges: [] });
      await Promise.resolve();
    },
  };
}

test("leaving graph releases SVG and pending timers while preserving bounded history state", () => {
  const h = mapFilterHarness();
  const graph = { nodes: [{ id: "notes/a.md" }], edges: [] };
  h.state.graph = graph; h.state.pan = { x: 42, y: 11 }; h.state.scale = 1.5;
  h.state.selected = "notes/a.md"; h.state.dragging = { x: 1, y: 2, pan: { x: 0, y: 0 } };
  let cleared = 0; h.element("viewport").replaceChildren = () => { cleared++; };
  h.element("query").value = "query"; h.fire("query", "input");
  h.map.queueGraphLayout(80);
  assert.equal(h.clock.pending, 2);
  h.state.view = "home"; h.map.suspend(); h.clock.advance(1000);
  assert.equal(h.clock.pending, 0); assert.equal(cleared, 1);
  assert.equal(h.state.layoutTimer, null); assert.equal(h.state.dragging, null);
  assert.equal(h.state.graph, graph); assert.deepEqual(h.state.pan, { x: 42, y: 11 });
  assert.equal(h.state.scale, 1.5); assert.equal(h.state.selected, "notes/a.md");
  assert.equal(h.element("query").value, "query"); assert.equal(h.requests.length, 0);
});

test("map typing supports every committed letter, debounces bursts, retains filters and refreshes on clear", async () => {
  const h = mapFilterHarness();
  h.element("query").value = "h";
  h.fire("query", "input");
  h.clock.advance(249);
  assert.equal(h.requests.length, 0);
  h.element("query").value = "he";
  h.fire("query", "input");
  h.clock.advance(249);
  assert.equal(h.requests.length, 0, "a newer letter replaces pending backend work");
  h.clock.advance(1);
  await Promise.resolve();
  assert.equal(h.requests.length, 1, "short committed queries reach shared search");
  h.element("query").value = "health";
  h.fire("query", "input");
  h.clock.advance(200);
  h.element("query").value = "health sleep";
  h.fire("query", "input");
  h.element("focus").value = "Selected note";
  h.element("include-orphans").checked = false;
  h.clock.advance(249);
  assert.equal(h.requests.length, 1);
  h.clock.advance(1);
  await Promise.resolve();
  assert.deepEqual(Object.fromEntries(h.requests[1].searchParams), {
    seeds: "notes/body-match.md", neighborLimit: "0", focus: "Selected note", includeUnresolved: "1", includeOrphans: "0",
    includeSnippets: "0", limit: "10000", edgeLimit: "20000",
  });
  h.fire("query", "change");
  assert.equal(h.requests.length, 2, "blur should not repeat the automatic request");
  h.element("query").value = "";
  h.fire("query", "input");
  h.clock.advance(250);
  assert.equal(h.requests.length, 3);
  assert.equal(h.requests[2].searchParams.has("query"), false);
  assert.equal(h.requests[2].searchParams.has("seeds"), false);
  await h.finish();
});

test("map focus typing handles composition, immediate search and canceled or hidden debounce", async () => {
  const h = mapFilterHarness();
  h.element("focus").value = "abc";
  h.fire("focus", "input");
  h.fire("focus", "compositionstart");
  h.fire("focus", "input", { isComposing: true });
  h.fire("focus", "keydown", { key: "Enter", isComposing: true });
  h.clock.advance(300);
  assert.equal(h.requests.length, 0);
  h.fire("focus", "compositionend");
  h.clock.advance(250);
  assert.equal(h.requests.length, 1);
  h.element("focus").value = "another";
  h.fire("focus", "input");
  h.element("focus").value = "an";
  h.fire("focus", "input");
  h.clock.advance(300);
  assert.equal(h.requests.length, 2, "shorter focus text replaces the pending request");
  assert.equal(h.requests[1].searchParams.get("focus"), "an");
  let prevented = false;
  h.fire("focus", "keydown", { key: "Enter", preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(h.requests[2].searchParams.get("focus"), "an");
  h.element("focus").value = "third";
  h.fire("focus", "input");
  h.fire("reload", "click");
  h.clock.advance(300);
  assert.equal(h.requests.length, 4, "refresh cancels the duplicate typing request");
  h.element("query").value = "next";
  h.fire("query", "input");
  h.state.view = "note";
  h.clock.advance(300);
  assert.equal(h.requests.length, 4, "queued typing stays inert after navigation");
  await h.finish();
});

test("map resize queues an 80ms guarded layout through the injected clock", () => {
  const callbacks = new Map(), timers = [];
  const state = { graph: { nodes: [] }, view: "graph" };
  const map = createMapController({ state, element: () => ({ addEventListener() {} }), document: { addEventListener() {} },
    window: { addEventListener: (name, callback) => callbacks.set(name, callback),
      setTimeout: (callback, delay) => { timers.push({ callback, delay }); return timers.length; }, clearTimeout() {} },
  });
  map.connect();
  callbacks.get("resize")();
  assert.equal(timers[0].delay, 80);
  state.view = "note";
  callbacks.get("resize")();
  assert.equal(timers.length, 1, "leaving map does not schedule another layout");
  timers[0].callback(); // A queued layout also remains inert after leaving.
  assert.equal(state.layoutTimer, null);
});
