import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

import { graphMemory, initializeMemoryRoot } from "../dist/runtime/index.js";
import { graphPageHtml } from "../dist/adapters/http-server/graph-page.js";

function extractFunction(src, name) {
  let start = src.indexOf("function " + name + "(");
  if (start < 0) throw new Error("function " + name + " not found in graph page script");
  if (src.slice(Math.max(0, start - 6), start) === "async ") start -= 6;
  let i = src.indexOf("{", start);
  let depth = 0;
  let j = i;
  for (; j < src.length; j++) {
    const c = src[j];
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) { j++; break; } }
  }
  return src.slice(start, j);
}

function pageScript() {
  return graphPageHtml("testnonce").match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];
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
  };
  const ctx = {
    state: { scale, pan: { ...pan } },
    $(id) { assert.ok(elements[id], "unexpected DOM dependency: " + id); return elements[id]; },
  };
  vm.createContext(ctx);
  vm.runInContext([
    extractFunction(script, "zoomGraph"),
    extractFunction(script, "onGraphWheel"),
    extractFunction(script, "updateViewport"),
    script.slice(script.indexOf('const svg = $("graph");\nsvg.addEventListener("wheel"'), script.indexOf('window.addEventListener("resize"')),
  ].join("\n"), ctx);
  return { ...ctx, rect, listeners, transforms };
}

function assertClose(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} should be close to ${expected}`);
}

function graphPointAt(state, x, y) {
  return { x: (x - state.pan.x) / state.scale, y: (y - state.pan.y) / state.scale };
}

function loadPageEditorRuntime() {
  const script = pageScript();
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext([
    extractFunction(script, "withEditableTitle"),
    extractFunction(script, "createDocumentEditor"),
    extractFunction(script, "splitEditableDocument"),
    extractFunction(script, "composeEditableDocument"),
  ].join("\n"), ctx);
  return ctx;
}

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
  assert.match(html, /<details id="graph-filters">\s*<summary[^>]*>Filters<\/summary>/);
  for (const id of ["include-orphans", "include-unresolved"]) {
    assert.match(html, new RegExp(`id="${id}"[^>]*type="checkbox"[^>]*checked`));
  }
  assert.doesNotMatch(html, /class="(?:topbar|legend)"|radial-gradient|id="depth"|data-testid="graph-depth"/);
  assert.match(html, /class="canvas-tools" aria-label="Graph view controls"/);
  assert.match(html, /id="reset-view"/);
  assert.match(html, /window\.addEventListener\("resize", \(\) => queueGraphLayout\(80\)/);
  assert.match(html, /prefers-reduced-motion/);
});

test("all browser views share white surfaces and warm-grey semantic controls", () => {
  const html = graphPageHtml("testnonce");
  const css = html.match(/<style[^>]*>([\s\S]*?)<\/style>/)[1];
  assert.match(css, /--surface: #ffffff;/);
  assert.match(css, /--control-fill: #f1f0ee;/);
  assert.match(css, /--surface-hover: #e7e5e2;/);
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
    assert.ok(html.includes(`"var(--node-${type})"`), `${type} node uses the shared palette`);
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
    { scale: 3.8, factor: 1.2, limit: 4 },
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
  vm.createContext(ctx);
  vm.runInContext(extractFunction(pageScript(), "graphUrl"), ctx);
  const defaults = new URL(ctx.graphUrl(), "http://localhost");
  assert.equal(defaults.pathname, "/memories/all/graph.json");
  assert.deepEqual(Object.fromEntries(defaults.searchParams), { includeUnresolved: "1", includeOrphans: "1" });
  controls.query.value = "  tag & title  ";
  controls.focus.value = "  pages/a b.md  ";
  controls["include-unresolved"].checked = false;
  controls["include-orphans"].checked = false;
  assert.deepEqual(Object.fromEntries(new URL(ctx.graphUrl(), "http://localhost").searchParams), {
    query: "tag & title", focus: "pages/a b.md", includeUnresolved: "0", includeOrphans: "0",
  });
});

test("graph focus restoration selects the matching node or falls back to the map filter", () => {
  const focused = [];
  const node = (id) => ({
    getAttribute(name) { assert.equal(name, "data-node-id"); return id; },
    focus(options) { focused.push({ id, preventScroll: options.preventScroll }); },
  });
  const controls = { viewport: { children: [node(null), node("pages/a.md"), node("pages/b.md")] }, query: node("query") };
  const ctx = { $: (id) => controls[id] };
  vm.createContext(ctx);
  vm.runInContext(extractFunction(pageScript(), "focusGraphNode"), ctx);
  ctx.focusGraphNode("pages/b.md");
  ctx.focusGraphNode("missing.md");
  ctx.focusGraphNode(null);
  assert.deepEqual(focused, [{ id: "pages/b.md", preventScroll: true }, { id: "query", preventScroll: true }, { id: "query", preventScroll: true }]);
});

test("notes editing stays in the HTTP shell with persistent rich editing and native dialogs", () => {
  const html = graphPageHtml("testnonce");
  const script = pageScript();
  assert.match(script, /node\.nodeKind === "unresolved"/);
  assert.match(script, /navigation\.navigate\("\/\?note="/);
  assert.match(script, /requestEditorNavigation/);
  assert.match(script, /searchDialog\.addEventListener\("cancel"/);
  assert.match(script, /beforeunload/);
  assert.match(script, /temporary last-write-wins/);
  assert.match(html, /id="note-save-state"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(html, /id="note-editor"[^>]*aria-label="Markdown note body"/);
  assert.match(html, /@media \(max-width: 680px\)[\s\S]*#note-editor/);
  assert.match(html, /id="open-connection"[^>]*aria-label="Connect · Connection settings"/);
  assert.match(html, /id="connection" aria-labelledby="connection-title"/);
  assert.match(script, /persistentEditing: true/);
  assert.doesNotMatch(script, /state\.editor\.setEditing\(false\)/);
  assert.match(html, /Scroll to zoom · Drag to move · Select a note to open/);
});

test("graph page keeps unresolved and missing-ID nodes non-editable", () => {
  const script = pageScript();
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(extractFunction(script, "isValidMemoryDocumentId"), ctx);
  assert.equal(ctx.isValidMemoryDocumentId("mem_a0000000-0000-4000-8000-000000000001"), true);
  for (const value of [undefined, "pages/alpha.md", "mem_not-a-uuid"]) assert.equal(ctx.isValidMemoryDocumentId(value), false);
  assert.match(script, /if \(node\.nodeKind === "unresolved"\)[\s\S]*setStatus\("This linked note doesn't exist yet:/);
  assert.match(script, /if \(!isValidMemoryDocumentId\(node\.documentId\)\)[\s\S]*missing a valid memory ID/);
});

test("graph document transport centralizes optional Bearer auth and PUT preconditions", async () => {
  const script = pageScript();
  const requests = [];
  const ctx = {
    activeApiKey: "secret", credentialRevision: 0, connectionStatus: "checking",
    renderConnection: () => {},
    fetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, status: 200, json: async () => ({ newContentHash: "sha256:new" }) };
    },
  };
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
  assert.deepEqual(JSON.parse(requests[0].options.body), { content: "# Changed\n" });

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

test("undoing a rename after a lost response restores the title through a conflict retry", async () => {
  const h = createEditorHarness({
    readDocument: async () => ({ title: "Beta", content: '---\ntitle: "Beta"\n---\n# Alpha\n', contentHash: "sha256:committed-beta" }),
    writeDocument: async (_id, _content, _hash, count) => {
      if (count === 1) throw new Error("Lost response after commit");
      if (count === 2) throw Object.assign(new Error("Stale hash"), { status: 412 });
      return { newContentHash: "sha256:restored-alpha" };
    },
  });
  h.editor.setEditing(true);
  h.editor.inputTitle("Beta");
  assert.equal(await h.editor.flush(), false);
  h.editor.inputTitle("Alpha");
  assert.equal(h.editor.hasPending(), true);
  assert.equal(await h.editor.retry(), true);
  assert.match(h.writes[2].content, /title: "Alpha"/);
  assert.equal(h.writes[2].hash, "sha256:committed-beta");
  assert.equal(h.editor.state.savedTitle, "Alpha");
  assert.equal(h.editor.hasPending(), false);
});

test("a body-only conflict retry preserves a concurrently renamed title", async () => {
  const h = createEditorHarness({
    readDocument: async () => ({ title: "Remote title", content: '---\ntitle: "Remote title"\n---\n# Alpha\n', contentHash: "sha256:remote" }),
    writeDocument: async (_id, _content, _hash, count) => {
      if (count === 1) throw Object.assign(new Error("Stale hash"), { status: 412 });
      return { newContentHash: "sha256:merged" };
    },
  });
  h.editor.setEditing(true);
  h.editor.input("Updated body");
  assert.equal(await h.editor.flush(), true);
  assert.match(h.writes[1].content, /title: "Remote title"/);
  assert.equal(h.editor.state.title, "Remote title");
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

test("graph editor performs one temporary last-write-wins retry with latest frontmatter", async () => {
  const latest = '---\ntitle: "Server title"\nupdated_at: "later"\n---\nserver body\n';
  const harness = createEditorHarness({
    readDocument: async () => ({ content: latest, contentHash: "sha256:latest" }),
    writeDocument: async (_id, _content, _hash, count) => {
      if (count === 1) throw Object.assign(new Error("stale"), { status: 412 });
      return { newContentHash: "sha256:retried" };
    },
  });
  harness.editor.setEditing(true);
  harness.editor.input("local body\n");
  await harness.editor.startSave();
  assert.equal(harness.writes.length, 2);
  assert.equal(harness.writes[1].hash, "sha256:latest");
  assert.match(harness.writes[1].content, /^---\ntitle: "Server title"\nupdated_at: "later"\n---\nlocal body\n$/);
  assert.equal(harness.editor.state.contentHash, "sha256:retried");
  assert.equal(harness.editor.state.dirty, false);
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
  const ctx = { state: { editor: harness.editor }, referenceAutocomplete: { dismiss() {} } };
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
  const failedCtx = { state: { editor: failed.editor }, referenceAutocomplete: { dismiss() {} } };
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
  assert.equal(conflictHarness.writes.length, 2, "only the initial PUT and one retry are allowed");
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
