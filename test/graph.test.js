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

function loadPageRenderer() {
  const html = graphPageHtml("testnonce");
  const script = html.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];
  const src = [
    extractFunction(script, "escapeHtml"),
    extractFunction(script, "inline"),
    extractFunction(script, "renderMarkdown"),
  ].join("\n");
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx.renderMarkdown;
}

function pageScript() {
  return graphPageHtml("testnonce").match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];
}

function loadPageEditorRuntime() {
  const script = pageScript();
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext([
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
  editor.hydrate({ content: initialContent, contentHash: "sha256:initial" });
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

test("graph page slide-in panel markup: fixed aside removed, panel scaffolded and closed by default", () => {
  const html = graphPageHtml("testnonce");
  // Fixed aside (Details/stats/ready/error/details) is gone entirely.
  assert.equal(html.includes("graph-details"), false, "graph-details fixed aside must be removed");
  assert.equal(html.includes("<h2>Details</h2>"), false, "Details aside heading must be removed");
  // Slide-in panel exists and starts closed.
  assert.match(html, /<aside id="note-panel"[^>]*data-closed[^>]*data-testid="graph-note-panel"/);
  // Required testids present.
  for (const testid of ["graph-note-close", "graph-note-title", "graph-note-content", "graph-note-edit", "graph-note-editor", "graph-note-save-state", "graph-note-retry"]) {
    assert.equal(html.includes(`data-testid="${testid}"`), true, `${testid} must be present`);
  }
  // Indicators moved into header (not in a removed aside).
  assert.match(html, /<header>[\s\S]*?data-testid="graph-ready"[\s\S]*?<\/header>/);
  assert.match(html, /<header>[\s\S]*?data-testid="graph-error"[\s\S]*?<\/header>/);
  // Panel is not in the open state by default.
  assert.equal(html.includes('class="panel-open"'), false, "body must not start with panel-open");
  assert.equal(html.includes("body.panel-open #note-panel"), true, "panel-open CSS rule must exist");
  // Graph section takes full width by default (no fixed 20rem right column).
  assert.equal(html.includes("grid-template-columns: minmax(0, 1fr) 20rem"), false, "fixed 20rem grid column must be removed");
});

test("graph page uses the light forest design system and structured exploration controls", () => {
  const html = graphPageHtml("testnonce");
  assert.match(html, /color-scheme: light/);
  for (const token of ["--forest-950", "--sage-100", "--cream-50", "--ink-soft", "--radius-md", "--shadow-lg"]) {
    assert.equal(html.includes(token), true, `${token} design token must be present`);
  }
  assert.match(html, /class="topbar"/);
  assert.match(html, /class="toolbar" aria-label="Graph filters"/);
  assert.match(html, /class="canvas-tools" aria-label="Graph view controls"/);
  assert.match(html, /class="legend" aria-label="Graph legend"/);
  assert.match(html, /id="reset-view"/);
  assert.match(html, /window\.addEventListener\("resize", \(\) => queueGraphLayout\(80\)\)/);
  assert.match(html, /prefers-reduced-motion/);
});

test("graph page keeps editing in the HTTP shell with accessible reader/editor transitions", () => {
  const html = graphPageHtml("testnonce");
  const script = pageScript();
  assert.match(script, /node\.nodeKind === "unresolved"/);
  assert.match(script, /state\.selected === node\.id/);
  assert.match(script, /requestEditorNavigation/);
  assert.match(script, /event\.key === "Escape"/);
  assert.match(script, /beforeunload/);
  assert.match(script, /temporary last-write-wins/);
  assert.match(html, /id="note-save-state"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(html, /id="note-editor"[^>]*aria-label="Markdown note body"/);
  assert.match(html, /@media \(max-width: 680px\)[\s\S]*#note-editor/);
  assert.match(html, /@media \(max-width: 680px\)[\s\S]*\.key-field input \{ width: 124px/);
  assert.doesNotMatch(html, /\.product-name, \.key-field \{ display: none/);
  assert.match(script, /keydown[\s\S]*event\.target\.closest\("a, button, summary, details, input, textarea"\)/);
  assert.match(html, /Select a node to read or edit its Markdown/);
});

test("graph page keeps unresolved and missing-ID nodes non-editable", () => {
  const script = pageScript();
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(extractFunction(script, "isValidMemoryDocumentId"), ctx);
  assert.equal(ctx.isValidMemoryDocumentId("mem_a0000000-0000-4000-8000-000000000001"), true);
  for (const value of [undefined, "pages/alpha.md", "mem_not-a-uuid"]) assert.equal(ctx.isValidMemoryDocumentId(value), false);
  assert.match(script, /if \(node\.nodeKind === "unresolved"\)[\s\S]*setStatus\("unresolved link:/);
  assert.match(script, /if \(!isValidMemoryDocumentId\(node\.documentId\)\)[\s\S]*missing a valid memory ID/);
});

test("graph document transport centralizes optional Bearer auth and PUT preconditions", async () => {
  const script = pageScript();
  const requests = [];
  const ctx = {
    apiKeyInput: { value: "secret" },
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

  ctx.apiKeyInput.value = "";
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

test("graph navigation waits for a save and keeps a failed draft reachable", async () => {
  const pending = deferred();
  const harness = createEditorHarness({ writeDocument: async () => pending.promise });
  harness.editor.input("pending navigation draft");
  const ctx = { state: { editor: harness.editor } };
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
  const failedCtx = { state: { editor: failed.editor } };
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

test("inline dependency-free Markdown renderer escapes HTML and renders the core subset", () => {
  const renderMarkdown = loadPageRenderer();
  // HTML is escaped (no injection).
  assert.equal(renderMarkdown("<script>alert(1)</script>"), "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
  assert.equal(renderMarkdown("a < b & c"), "<p>a &lt; b &amp; c</p>");
  // Headings.
  assert.equal(renderMarkdown("# T\n## S\n### U"), "<h1>T</h1><h2>S</h2><h3>U</h3>");
  // Bold / italic / inline code.
  assert.equal(renderMarkdown("**b** and _i_ and `c`"), "<p><strong>b</strong> and <em>i</em> and <code>c</code></p>");
  // Links.
  assert.equal(renderMarkdown("[ex](https://example.com)"), '<p><a href="https://example.com" rel="noopener noreferrer">ex</a></p>');
  // Lists.
  assert.equal(renderMarkdown("- a\n- b\n1. x\n2. y"), "<ul><li>a</li><li>b</li></ul><ol><li>x</li><li>y</li></ol>");
  // Fenced code block (raw content escaped).
  assert.equal(renderMarkdown("```js\nvar a = 1;\n```"), '<pre><code class="language-js">var a = 1;\n</code></pre>');
  assert.equal(renderMarkdown("```\n<b>raw</b>\n```"), "<pre><code>&lt;b&gt;raw&lt;/b&gt;\n</code></pre>");
  // Blockquote + horizontal rule.
  assert.equal(renderMarkdown("> quoted"), "<blockquote>quoted</blockquote>");
  assert.equal(renderMarkdown("a\n---\nb"), "<p>a</p><hr/><p>b</p>");
  // Frontmatter rendered as a muted metadata block above the body.
  const fm = renderMarkdown('---\ntitle: "T"\n---\n# H');
  assert.match(fm, /^<details class="note-frontmatter"><summary>frontmatter<\/summary><pre>title: &quot;T&quot;<\/pre><\/details><h1>H<\/h1>$/);
});

test("inline Markdown renderer keeps code-block content uninterpreted and inline code safe", () => {
  const renderMarkdown = loadPageRenderer();
  // Markdown syntax inside a fenced block is not interpreted.
  assert.equal(renderMarkdown("```\n# not a heading\n**not bold**\n```"), "<pre><code># not a heading\n**not bold**\n</code></pre>");
  // Inline code content is escaped, not interpreted.
  assert.equal(renderMarkdown("use `<b>` tag"), "<p>use <code>&lt;b&gt;</code> tag</p>");
  // Empty content yields empty string.
  assert.equal(renderMarkdown(""), "");
  // Body without frontmatter produces no frontmatter block.
  assert.equal(renderMarkdown("# Just a heading").includes("frontmatter"), false);
});
