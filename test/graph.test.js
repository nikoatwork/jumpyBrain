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

function loadPageDocumentOpener(fetchImpl, panelOpen = false) {
  const html = graphPageHtml("testnonce");
  const script = html.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];
  const elements = new Map();
  const fetches = [];
  const statuses = [];
  let opened = false;
  let closed = false;
  const ctx = {
    state: { noteToken: 0 },
    document: { body: { classList: { contains: () => panelOpen } } },
    $: (id) => {
      if (!elements.has(id)) elements.set(id, { textContent: "", innerHTML: "" });
      return elements.get(id);
    },
    apiKeyInput: { value: "secret" },
    openPanel: () => { opened = true; },
    closePanel: () => { closed = true; },
    setStatus: (...args) => { statuses.push(args); },
    renderMarkdown: (content) => `rendered:${content}`,
    fetch: async (url, options) => {
      fetches.push({ url, options });
      return fetchImpl(url, options);
    },
  };
  vm.createContext(ctx);
  vm.runInContext([
    extractFunction(script, "isValidMemoryDocumentId"),
    extractFunction(script, "openPanelForNode"),
  ].join("\n"), ctx);
  return {
    openPanelForNode: ctx.openPanelForNode,
    fetches,
    statuses,
    get opened() { return opened; },
    get closed() { return closed; },
  };
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
  for (const testid of ["graph-note-close", "graph-note-title", "graph-note-content"]) {
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

test("graph page wires node click to slide-in: unresolved guard, re-click close, document fetch URL", () => {
  const html = graphPageHtml("testnonce");
  const script = html.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];
  // Unresolved nodes do not open the panel.
  assert.match(script, /node\.nodeKind === "unresolved"/);
  assert.match(script, /unresolved link:/);
  // Re-clicking the active node while open closes the panel.
  assert.match(script, /state\.selected === node\.id/);
  assert.match(script, /closePanel\(\)/);
  // Document fetch uses only documentId (the mem_<uuid>) and reuses the Bearer header.
  assert.match(script, /const docId = node\.documentId/);
  assert.match(script, /\/memories\/all\/documents\/" \+ encodeURIComponent\(docId\)/);
  assert.match(script, /Authorization: "Bearer " \+ apiKey/);
  // Loading + error handling present.
  assert.match(script, /loading/);
  assert.match(script, /setStatus\("error"/);
  // Escape closes the panel.
  assert.match(script, /event\.key === "Escape"/);
});

test("graph page fetches a document by valid documentId while the graph node id remains a filepath", async () => {
  const documentId = "mem_a0000000-0000-4000-8000-000000000001";
  const opener = loadPageDocumentOpener(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ title: "Alpha", file: "pages/alpha.md", content: "# Alpha" }),
  }));

  await opener.openPanelForNode({
    id: "pages/alpha.md",
    documentId,
    nodeKind: "document",
    title: "Alpha",
    file: "pages/alpha.md",
  });

  assert.equal(opener.fetches.length, 1);
  assert.equal(opener.fetches[0].url, `/memories/all/documents/${documentId}`);
  assert.equal(opener.fetches[0].options.headers.Authorization, "Bearer secret");
  assert.equal(opener.opened, true);
  assert.deepEqual(opener.statuses.map(([status]) => status), ["loading", "loaded"]);
});

test("graph page reports missing or invalid documentId without fetching the document", async () => {
  for (const documentId of [undefined, "pages/alpha.md", "mem_not-a-uuid"]) {
    const opener = loadPageDocumentOpener(async () => {
      throw new Error("fetch must not be called");
    }, true);

    await opener.openPanelForNode({
      id: "pages/alpha.md",
      documentId,
      nodeKind: "document",
      title: "Alpha",
      file: "pages/alpha.md",
    });

    assert.equal(opener.fetches.length, 0);
    assert.equal(opener.opened, false);
    assert.equal(opener.closed, true);
    assert.deepEqual(opener.statuses, [["This document is missing a valid memory ID."]]);
  }
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
  assert.match(fm, /^<details class="frontmatter"><summary>frontmatter<\/summary><pre>title: &quot;T&quot;<\/pre><\/details><h1>H<\/h1>$/);
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
