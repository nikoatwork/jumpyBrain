// Opt-in provisioned-model and Chromium check; only disposable Markdown/indexes.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { databasePath, resolveQmdSdk } from '../dist/adapters/qmd/qmd-cli.js';
import { meanDocumentVector } from '../dist/core/retrieval-policy/semantic-links.js';
import { initializeMemoryRoot, indexMemory, graphMemory } from '../dist/runtime/index.js';
import { startJumpyBrainHttpServer } from '../dist/server/index.js';
import { launchPlaywrightChromium } from './playwright-runtime.mjs';
const model = process.env.JUMPYBRAIN_SMOKE_MODEL;
assert.ok(path.isAbsolute(model ?? '') && path.isAbsolute(process.env.JUMPYBRAIN_QMD_BIN ?? ''), 'Provision absolute QMD and model paths first');
const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'jb-semantic-graph-')));
const token = randomUUID();
let browser, server;
const body = {
  'positioning.md': 'Our product strategy focuses on independent consultants. We differentiate through private local storage and simple workflows, rather than competing on enterprise integrations. Pricing should reflect the time saved for solo professionals.',
  'direction.md': 'We will target solo consultants with a private, locally stored workspace. The competitive advantage is simplicity for independent professionals. Charge based on the hours they save; enterprise integrations are outside our initial focus.',
  'garden.md': 'Tomato seedlings need warm soil, sunlight and regular watering. Add compost to the vegetable beds and protect young plants from frost.',
  'circuit.md': 'Copper wire conducts electrical current. A resistor limits current through an LED circuit and prevents the diode from overheating.',
  'reference.md': 'An explicit reference to [[Circuit]].',
};
const source = (file, text) => `---\nid: mem_a0000000-0000-4000-8000-${String(Object.keys(body).indexOf(file) + 1).padStart(12, '0')}\ntitle: ${file === 'circuit.md' ? 'Circuit' : file.replace('.md', '')}\n---\n${text}\n`;
const files = Object.keys(body).map(file => `notes/${file}`);
const started = performance.now();
try {
  await initializeMemoryRoot(root);
  for (const [file, text] of Object.entries(body)) await writeFile(path.join(root, 'notes', file), source(file, text));
  await indexMemory(root, { indexing: { mode: 'semantic', model } });
  // Record raw document-cosine separation; retrieval's ranked scores are not cosine.
  const require = createRequire(resolveQmdSdk());
  const Database = require('better-sqlite3');
  const db = new Database(databasePath(root), { readonly: true, fileMustExist: true });
  require('sqlite-vec').load(db);
  try {
    const vectors = db.prepare("SELECT path, hash FROM documents WHERE active = 1 AND collection = 'jumpybrain' ORDER BY path").all().map(row => {
      const parts = db.prepare('SELECT seq FROM content_vectors WHERE hash = ? ORDER BY seq').all(row.hash).map(part =>
        new Float32Array(Uint8Array.from(db.prepare('SELECT embedding FROM vectors_vec WHERE hash_seq = ?').get(`${row.hash}_${part.seq}`).embedding).buffer));
      return { file: row.path, vector: meanDocumentVector(parts) };
    });
    console.log(JSON.stringify({ cosine: vectors.flatMap((a, i) => vectors.slice(i + 1).map(b => ({ a: a.file, b: b.file, score: a.vector.reduce((sum, value, j) => sum + value * b.vector[j], 0) }))) }));
  } finally { db.close(); }
  const before = await Promise.all(files.map(file => readFile(path.join(root, file), 'utf8')));
  const dbBefore = await readFile(databasePath(root));
  const graph = await graphMemory(root, { includeSnippets: false });
  console.log(JSON.stringify({ semantic: graph.semantic, edges: graph.edges, ms: Math.round(performance.now() - started) }));
  assert.equal(graph.semantic.state, 'ready');
  assert.deepEqual(graph.edges.filter(edge => edge.kind === 'semantic-link').map(edge => [edge.source, edge.target]), [['notes/direction.md', 'notes/positioning.md']]);
  assert.ok(graph.edges.some(edge => edge.kind === 'wiki-link' && edge.target === 'notes/circuit.md'));
  assert.equal(graph.nodes.find(node => node.id === 'notes/direction.md').degree, 1);
  assert.equal(graph.nodes.find(node => node.id === 'notes/direction.md').inDegree, 0);
  const focused = await graphMemory(root, { focus: 'direction', includeOrphans: false });
  assert.equal(focused.nodes.length, 2);
  const seeded = await graphMemory(root, { seeds: ['notes/direction.md'] });
  assert.deepEqual(seeded.nodes.map(node => [node.id, node.match]), [['notes/direction.md', 'direct'], ['notes/positioning.md', 'context']]);
  assert.equal((await graphMemory(root, { edgeLimit: 1 })).edges[0].kind, 'wiki-link');
  const explicit = await graphMemory(root, { edgeTypes: ['wiki-link', 'markdown-link'] });
  assert.equal(explicit.edges.length, 1); assert.equal(explicit.semantic, undefined);
  assert.deepEqual(await Promise.all(files.map(file => readFile(path.join(root, file), 'utf8'))), before);
  assert.deepEqual(await readFile(databasePath(root)), dbBefore, 'graph does not change the vector database');
  const lock = path.join(root, '.jumpybrain/index.lock');
  await writeFile(lock, 'fixture');
  const busy = await graphMemory(root);
  assert.equal(busy.semantic.state, 'unavailable'); assert.equal(busy.stats.wikiLinks, 1);
  await rm(lock);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(graphMemory(root, {}, { signal: controller.signal }));

  server = await startJumpyBrainHttpServer({ root, apiKeys: [token], host: '127.0.0.1', port: 0, autoIndex: false });
  const response = await fetch(`${server.url}/memories/all/graph.json?edgeTypes=semantic-link`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(response.status, 200);
  const remote = await response.json();
  assert.equal(remote.root, 'remote:all'); assert.equal(remote.edges.length, 1); assert.equal(remote.edges[0].kind, 'semantic-link');
  browser = await launchPlaywrightChromium();
  const errors = [];
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 820 } });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${server.url}/graph#apiKey=${token}`);
    await page.getByTestId('graph-ready').waitFor({ state: 'visible' });
    const edge = page.locator('line.semantic-link');
    assert.equal(await edge.count(), 1);
    assert.notEqual(await edge.evaluate(el => getComputedStyle(el).strokeDasharray), 'none');
    assert.equal(await page.locator('line.wiki-link').evaluate(el => getComputedStyle(el).strokeDasharray), 'none');
    assert.ok(await page.getByText('Solid lines: explicit links', { exact: false }).isVisible());
    const node = page.locator('g[data-node-id="notes/direction.md"]');
    await node.focus(); await page.keyboard.press('Enter');
    await page.locator('#note-panel').waitFor({ state: 'visible' });
    await page.close();
  }
  // Dense renderer consumes the same real edges; synthetic isolates only select canvas mode.
  const dense = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  dense.on('pageerror', error => errors.push(error.message));
  await dense.addInitScript(() => {
    window.graphDashCalls = [];
    const original = CanvasRenderingContext2D.prototype.setLineDash;
    CanvasRenderingContext2D.prototype.setLineDash = function(values) { window.graphDashCalls.push([...values]); return original.call(this, values); };
  });
  await dense.route('**/memories/all/graph.json?*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...graph,
    nodes: [...graph.nodes, ...Array.from({ length: 1000 }, (_, i) => ({ id: `isolate-${i}`, title: `Isolate ${i}`, nodeKind: 'document', exists: true, tags: [], degree: 0, inDegree: 0, outDegree: 0 }))],
  }) }));
  await dense.goto(`${server.url}/graph#apiKey=${token}`);
  await dense.getByTestId('graph-ready').waitFor({ state: 'visible' });
  await dense.locator('#graph-canvas').waitFor({ state: 'visible' });
  await dense.waitForFunction(() => window.graphDashCalls.some(values => values.length === 2));
  assert.ok(await dense.evaluate(() => window.graphDashCalls.some(values => values.length === 0)));
  await dense.close();
  assert.deepEqual(errors, []);
  await browser.close(); browser = undefined;
  await server.close(); server = undefined;

  // Corrupt/incomplete vector metadata must not fabricate an inferred graph.
  const damaged = new Database(databasePath(root));
  const saved = damaged.prepare('SELECT hash, seq, total_chunks FROM content_vectors LIMIT 1').get();
  damaged.prepare('UPDATE content_vectors SET total_chunks = 999 WHERE hash = ? AND seq = ?').run(saved.hash, saved.seq);
  damaged.close();
  assert.equal((await graphMemory(root)).semantic.state, 'unavailable');
  const restored = new Database(databasePath(root));
  restored.prepare('UPDATE content_vectors SET total_chunks = ? WHERE hash = ? AND seq = ?').run(saved.total_chunks, saved.hash, saved.seq);
  restored.close();
  assert.equal((await graphMemory(root)).stats.semanticLinks, 1);

  // Explicit references win over a semantic pair after ordinary reindexing.
  await writeFile(path.join(root, 'notes/direction.md'), before[1] + '\n[[positioning]]\n');
  const stale = await graphMemory(root);
  assert.equal(stale.semantic.state, 'stale'); assert.equal(stale.stats.semanticLinks, 0);
  assert.ok(stale.edges.some(edge => edge.kind === 'wiki-link' && edge.target === 'notes/positioning.md'));
  await indexMemory(root);
  assert.equal((await graphMemory(root)).stats.semanticLinks, 0);
  // Rename/delete must never leave semantic references to an old path.
  await rename(path.join(root, 'notes/positioning.md'), path.join(root, 'notes/renamed.md'));
  assert.equal((await graphMemory(root)).stats.semanticLinks, 0);
  await rm(path.join(root, 'notes/renamed.md'));
  await indexMemory(root);
  assert.equal((await graphMemory(root)).stats.semanticLinks, 0);
  await indexMemory(root, { indexing: { mode: 'lexical' } });
  assert.equal((await graphMemory(root)).semantic.state, 'disabled');
  console.log('semantic graph smoke: PASS (real embeddings, graph lifecycle, desktop/narrow Chromium)');
} finally {
  await browser?.close(); await server?.close(); await rm(root, { recursive: true, force: true });
}
