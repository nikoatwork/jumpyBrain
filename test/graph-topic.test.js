import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, rename } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { graphMemory, initializeMemoryRoot } from "../dist/runtime/index.js";
import { startJumpyBrainHttpServer } from "../dist/server/index.js";
import { graphServerMemory } from "../dist/app/server-memory/index.js";
import { collectConnections } from "../dist/app/local-memory/connections.js";
import { graphRecordWireBytes } from "../dist/app/local-memory/graph.js";

async function withFixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-graph-topic-"));
  try {
    await initializeMemoryRoot(root);
    const ids = new Map();
    const write = async (file, title, body = "", metadata = "") => {
      if (!ids.has(file)) ids.set(file, `mem_00000000-0000-4000-8000-${String(ids.size + 1).padStart(12, "0")}`);
      await writeFile(path.join(root, file), `---\nid: ${ids.get(file)}\ntitle: ${JSON.stringify(title)}\n${metadata}---\n${body}\n`);
    };
    await write("pages/hub.md", "Health", "[[Context A]] [[Context B]] [[Context C]] [[Missing]]", "tags: [health]\n");
    await write("pages/other.md", "Sleep", "[[Context D]]");
    await write("notes/a.md", "Context A", "[[Two hops]]");
    await write("notes/b.md", "Context B");
    await write("notes/c.md", "Context C");
    await write("notes/d.md", "Context D");
    await write("notes/two.md", "Two hops");
    await write("notes/inbound.md", "Inbound", "[[Health]]");
    await write("sessions/orphan.md", "Unlinked topic", "Body-only health evidence");
    await run(root, write);
  } finally { await rm(root, { recursive: true, force: true }); }
}

test("topic graph preserves seed rank, disconnected matches and incoming/outgoing one-hop context", async () => {
  await withFixture(async root => {
    const graph = await graphMemory(root, { seeds: ["sessions/orphan.md", "pages/hub.md", "pages/hub.md"], includeSnippets: false });
    assert.deepEqual(graph.nodes.filter(node => node.match === "direct").map(node => node.id), ["sessions/orphan.md", "pages/hub.md"]);
    assert.deepEqual(new Set(graph.nodes.filter(node => node.match === "context").map(node => node.id)), new Set(["notes/a.md", "notes/b.md", "notes/c.md", "notes/inbound.md", "unresolved:missing"]));
    assert.equal(graph.nodes.some(node => node.id === "notes/two.md"), false, "one hop does not accidentally expand a context note");
    const missing = graph.nodes.find(node => node.id === "unresolved:missing");
    assert.equal(missing.exists, false);
    assert.equal(missing.file, undefined);
    assert.equal(missing.documentId, undefined);
    assert.equal(graph.nodes.find(node => node.id === "sessions/orphan.md").degree, 0);
    assert.equal(graph.edges.every(edge => graph.nodes.some(node => node.id === edge.source) && graph.nodes.some(node => node.id === edge.target)), true);
    const capped = await graphMemory(root, { seeds: ["sessions/orphan.md", "pages/hub.md"], limit: 1 });
    assert.deepEqual(capped.nodes.map(node => node.id), ["sessions/orphan.md"]);
    assert.deepEqual(capped.truncation, { nodes: true, edges: false, bytes: false });
  });
});

test("context budget is shared fairly across ranked seeds and can be disabled", async () => {
  await withFixture(async root => {
    const graph = await graphMemory(root, { seeds: ["pages/hub.md", "pages/other.md"], neighborLimit: 2 });
    assert.deepEqual(graph.nodes.map(node => [node.id, node.match]), [["pages/hub.md", "direct"], ["pages/other.md", "direct"], ["notes/inbound.md", "context"], ["notes/d.md", "context"]]);
    const directOnly = await graphMemory(root, { seeds: ["pages/hub.md"], neighborLimit: 0 });
    assert.deepEqual(directOnly.nodes.map(node => node.id), ["pages/hub.md"]);
    assert.deepEqual(directOnly.edges, []);
    const filtered = await graphMemory(root, { seeds: ["pages/hub.md"], path: "pages/", includeUnresolved: false });
    assert.deepEqual(filtered.nodes.map(node => node.id), ["pages/hub.md"]);
    assert.equal(filtered.warnings.some(warning => warning.includes("limited")), false);
  });
});

test("empty/missing/unsafe seeds select no saved or virtual notes; exact files retain existing semantics", async () => {
  await withFixture(async root => {
    for (const seeds of [[], ["../outside.md"], ["Health"], ["unresolved:missing"]]) {
      const graph = await graphMemory(root, { seeds });
      assert.deepEqual(graph.nodes, []);
      assert.deepEqual(graph.edges, []);
    }
    const exact = await graphMemory(root, { files: ["pages/hub.md"] });
    assert.deepEqual(exact.nodes.map(node => node.id), ["pages/hub.md"]);
    assert.equal(exact.nodes[0].match, undefined);
    assert.deepEqual(exact.edges, []);
    const intersection = await graphMemory(root, { seeds: ["pages/hub.md"], files: ["pages/hub.md", "notes/a.md"] });
    assert.deepEqual(intersection.nodes.map(node => node.id), ["pages/hub.md", "notes/a.md"]);
  });
});

test("lean packets omit snippets/stat fallback, enforce visible-edge budgets, and preserve node metadata", async () => {
  await withFixture(async root => {
    const normal = await graphMemory(root, { files: ["pages/hub.md"] });
    assert.match(normal.nodes[0].snippet, /Context A/);
    assert.ok(normal.nodes[0].updatedAt);
    const lean = await graphMemory(root, { seeds: ["pages/hub.md"], includeSnippets: false, edgeLimit: 1, limit: 50_000 });
    assert.equal(lean.options.limit, 10_000);
    assert.equal(lean.edges.length, 1);
    assert.deepEqual(lean.truncation, { nodes: false, edges: true, bytes: false });
    assert.equal(lean.nodes.every(node => node.snippet === undefined && node.updatedAt === undefined), true);
    assert.equal(lean.nodes[0].title, "Health");
    assert.deepEqual(lean.nodes[0].tags, ["health"]);
    assert.equal((await graphMemory(root, { includeSnippets: false, edgeLimit: 0 })).edges.length, 0);
    assert.equal((await graphMemory(root, { includeSnippets: false, edgeLimit: 90_000 })).options.edgeLimit, 20_000);
  });
});

test("authoritative graph loads re-read external link edits, renames and deletion without a persistent cache", async () => {
  await withFixture(async (root, write) => {
    await graphMemory(root, { seeds: ["pages/hub.md"], includeSnippets: false });
    await write("pages/hub.md", "Health", "[[Context D]]");
    let graph = await graphMemory(root, { seeds: ["pages/hub.md"], includeSnippets: false });
    assert.deepEqual(new Set(graph.nodes.map(node => node.id)), new Set(["pages/hub.md", "notes/d.md", "notes/inbound.md"]));
    await rename(path.join(root, "notes/d.md"), path.join(root, "notes/renamed.md"));
    graph = await graphMemory(root, { seeds: ["pages/hub.md"], includeSnippets: false });
    assert.equal(graph.nodes.some(node => node.file === "notes/renamed.md"), true);
    assert.equal(graph.nodes.some(node => node.file === "notes/d.md"), false);
    await rm(path.join(root, "notes/renamed.md"));
    graph = await graphMemory(root, { seeds: ["pages/hub.md"], includeSnippets: false });
    assert.equal(graph.nodes.some(node => node.id === "unresolved:context d" && !node.exists), true);
  });
});

test("lean byte budget omits whole records rather than shortening meaningful titles", async () => {
  await withFixture(async (root, write) => {
    const title = "x".repeat(6 * 1024 * 1024);
    await write("notes/huge-a.md", title);
    await write("notes/huge-b.md", title);
    const graph = await graphMemory(root, { includeSnippets: false, limit: 10_000 });
    assert.equal(graph.truncation?.bytes, true);
    assert.equal(graph.nodes.filter(node => node.title === title).length, 1);
    assert.ok(Buffer.byteLength(JSON.stringify(graph)) < 12 * 1024 * 1024);
  });
});

test("HTTP graph exposes ranked seeds, lean flags and safe explicit budgets without a local root", async () => {
  await withFixture(async root => {
    const server = await startJumpyBrainHttpServer({ root, apiKeys: ["fixture"], port: 0, autoIndex: false });
    try {
      const request = async params => fetch(`${server.url}/memories/all/graph.json?${params}`, { headers: { Authorization: "Bearer fixture" } });
      const params = new URLSearchParams([["seeds", "sessions/orphan.md"], ["seeds", "pages/hub.md"], ["neighborLimit", "1"], ["edgeLimit", "1"], ["includeSnippets", "0"], ["limit", "10000"]]);
      const response = await request(params);
      assert.equal(response.status, 200);
      const graph = await response.json();
      assert.equal(graph.root, "remote:all");
      assert.deepEqual(graph.nodes.map(node => node.match), ["direct", "direct", "context"]);
      assert.equal(graph.nodes.every(node => node.snippet === undefined), true);
      assert.deepEqual((await (await request("seeds=")).json()).nodes, []);
      for (const bad of ["neighborLimit=-1", "neighborLimit=1.5", "edgeLimit=NaN", "edgeLimit=-1"]) assert.equal((await request(bad)).status, 400);
    } finally { await server.close(); }
  });
});

test("graph cancellation rejects before root access and propagates through server-memory", async () => {
  const controller = new AbortController(), reason = new Error("graph_cancelled");
  controller.abort(reason);
  const root = path.join(os.tmpdir(), "jumpybrain-never-create-cancelled-graph");
  await assert.rejects(graphMemory(root, {}, { signal: controller.signal }), error => error === reason);
  await assert.rejects(graphServerMemory({ root, graph: {}, signal: controller.signal }), error => error === reason);
});

test("cancellation interrupts a live connection file read and stops before later documents", async () => {
  await withFixture(async root => {
    const file = path.join(root, "notes", "large.md");
    await writeFile(file, "large body ".repeat(800_000));
    const document = { absolutePath: file, relativePath: "notes/large.md", frontmatter: {}, bodyStartLine: 1 };
    const controller = new AbortController();
    const pending = collectConnections([document], undefined, { signal: controller.signal });
    setImmediate(() => controller.abort());
    await assert.rejects(pending, error => error.name === "AbortError");
    const between = new AbortController(), reason = new Error("stop_after_first_document");
    let visited = 0;
    await assert.rejects(collectConnections([document, { ...document, absolutePath: file + ".missing" }], async () => {
      visited++; between.abort(reason);
    }, { signal: between.signal }), error => error === reason);
    assert.equal(visited, 1);
    const recovered = await graphMemory(root, { files: ["pages/hub.md"], includeSnippets: false });
    assert.equal(recovered.nodes.length, 1, "cancellation leaves no persistent graph state or lock");
    assert.equal(Object.hasOwn(recovered.options, "signal"), false);
  });
});

test("wire accounting covers HTTP pretty indentation and UTF-8 tag-array inflation", async () => {
  await withFixture(async (root, write) => {
    const tags = Array.from({ length: 1000 }, (_, index) => "🌱" + index);
    await write("notes/tags.md", "Unicode 🧠", "", "tags: " + JSON.stringify(tags) + "\n");
    const server = await startJumpyBrainHttpServer({ root, apiKeys: ["fixture"], port: 0, autoIndex: false });
    try {
      const response = await fetch(server.url + "/memories/all/graph.json?files=notes%2Ftags.md&includeSnippets=0", { headers: { Authorization: "Bearer fixture" } });
      assert.equal(response.status, 200);
      const wire = await response.text(), packet = JSON.parse(wire), node = packet.nodes[0];
      const emptyWire = JSON.stringify({ ...packet, nodes: [] }, null, 2) + "\n";
      const actualIncrement = Buffer.byteLength(wire) - Buffer.byteLength(emptyWire);
      assert.ok(graphRecordWireBytes(node) >= actualIncrement, "budget must cover the actual HTTP record representation");
      assert.ok(actualIncrement > Buffer.byteLength(JSON.stringify(node)) + 5000, "short tag arrays materially expand on the real pretty-printed wire");
      assert.deepEqual(node.tags.length, 1000);
    } finally { await server.close(); }
  });
});
