import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, readdir, symlink, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { initializeMemoryRoot, graphMemory, listDrawings, readDrawing, createDrawing, saveDrawing, renameDrawing, deleteDrawing,
  isDrawingName, drawingNameFromReference } from '../dist/runtime/index.js';
import { startJumpyBrainHttpServer } from '../dist/server/index.js';
import { graphPageHtml } from '../dist/adapters/http-server/graph-page.js';
import { drawingStaticResponse, DRAWING_FRAME_CSP } from '../dist/adapters/http-server/drawing-assets.js';
import { startCompanionGateway } from '../integrations/macos-companion/gateway.mjs';
import { isDrawingFrameNavigation } from '../integrations/electron/host.mjs';

const scene = (elements = []) => ({ type: 'excalidraw', version: 2, source: 'test', elements, appState: { viewBackgroundColor: '#ffffff' }, files: {} });
const rectangle = (id) => ({ id, type: 'rectangle', x: 1, y: 2, width: 3, height: 4 });
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jb-drawings-'));
  await initializeMemoryRoot(root);
  if (!t.drawingRoots) {
    // Close hosts before removing the roots they still log into.
    t.drawingRoots = []; t.drawingHosts = [];
    t.after(async () => {
      for (const host of t.drawingHosts.reverse()) await host.close();
      for (const directory of t.drawingRoots) await rm(directory, { recursive: true, force: true });
    });
  }
  t.drawingRoots.push(root);
  return root;
}
const file = (root, name) => path.join(root, 'drawings', name + '.excalidraw');

test('drawing names are safe filenames and safe mention targets', () => {
  for (const name of ['Plan', 'System map 2', 'Über sketch', 'a.b']) assert.equal(isDrawingName(name), true, name);
  for (const name of ['', ' ', ' Plan', 'Plan ', '.hidden', 'trailing.', 'a/b', 'a\\b', 'a:b', 'a[b', 'a]b', 'a|b', 'a#b', 'a\nb', 'x'.repeat(101), 7, null]) {
    assert.equal(isDrawingName(name), false, String(name));
  }
  assert.equal(drawingNameFromReference('System map.excalidraw'), 'System map');
  assert.equal(drawingNameFromReference('System map.EXCALIDRAW'), 'System map');
  for (const target of ['System map', '.excalidraw', 'a/b.excalidraw', 'Plan.excalidraw.md', 42]) assert.equal(drawingNameFromReference(target), null, String(target));
});

test('canonical drawing files are hash-checked, atomic and never created by reads', async t => {
  const root = await fixture(t);
  assert.deepEqual(await listDrawings(root), { drawings: [], skipped: 0 });
  await assert.rejects(readDrawing(root, 'Plan'), e => e.code === 'drawing_missing');
  await assert.rejects(readdir(path.join(root, 'drawings')), 'reads never create the directory');

  const created = await createDrawing(root, 'Plan');
  assert.deepEqual(created.scene.elements, []);
  assert.equal(created.scene.type, 'excalidraw');
  assert.match(created.contentHash, /^sha256:[0-9a-f]{64}$/);
  await assert.rejects(createDrawing(root, 'Plan'), e => e.code === 'drawing_conflict');
  await assert.rejects(createDrawing(root, 'bad/name'), e => e.code === 'invalid_drawing');

  const saved = await saveDrawing(root, 'Plan', scene([rectangle('a')]), created.contentHash);
  assert.notEqual(saved.contentHash, created.contentHash);
  // The file stays portable Excalidraw JSON that other tools can open.
  assert.deepEqual(JSON.parse(await readFile(file(root, 'Plan'), 'utf8')), scene([rectangle('a')]));
  assert.deepEqual((await readDrawing(root, 'Plan')).scene, scene([rectangle('a')]));
  await assert.rejects(saveDrawing(root, 'Plan', scene(), created.contentHash), e => e.code === 'drawing_conflict');
  await assert.rejects(saveDrawing(root, 'Plan', scene(), 'nope'), e => e.code === 'invalid_drawing');
  await assert.rejects(saveDrawing(root, 'Plan', { elements: [] }, saved.contentHash), e => e.code === 'invalid_drawing');
  await assert.rejects(saveDrawing(root, 'Plan', { type: 'excalidraw', elements: [], files: [] }, saved.contentHash), e => e.code === 'invalid_drawing');
  await assert.rejects(saveDrawing(root, 'Plan', scene([{ id: 'big', text: 'x'.repeat(4 * 1024 * 1024) }]), saved.contentHash), e => e.code === 'invalid_drawing');
  assert.equal((await readDrawing(root, 'Plan')).contentHash, saved.contentHash, 'rejected saves leave the file unchanged');

  // An external writer (an agent or another tool) is detected by the next hash-checked write.
  await writeFile(file(root, 'Plan'), JSON.stringify(scene([rectangle('external')])));
  await assert.rejects(saveDrawing(root, 'Plan', scene(), saved.contentHash), e => e.code === 'drawing_conflict');
  const external = await readDrawing(root, 'Plan');
  assert.equal(external.scene.elements[0].id, 'external');

  await createDrawing(root, 'Other', scene([rectangle('o')]));
  await assert.rejects(renameDrawing(root, 'Plan', 'Other', external.contentHash), e => e.code === 'drawing_conflict');
  await assert.rejects(renameDrawing(root, 'Plan', 'no|pipe', external.contentHash), e => e.code === 'invalid_drawing');
  const renamed = await renameDrawing(root, 'Plan', 'Roadmap', external.contentHash);
  assert.equal(renamed.name, 'Roadmap');
  assert.equal(renamed.contentHash, external.contentHash, 'rename keeps exact bytes');
  await assert.rejects(readDrawing(root, 'Plan'), e => e.code === 'drawing_missing');
  assert.equal((await readDrawing(root, 'Other')).scene.elements[0].id, 'o', 'unrelated drawing never changed');
  assert.deepEqual((await listDrawings(root)).drawings.map(item => item.name).sort(), ['Other', 'Roadmap']);

  await assert.rejects(deleteDrawing(root, 'Roadmap', saved.contentHash), e => e.code === 'drawing_conflict');
  assert.deepEqual(await deleteDrawing(root, 'Roadmap', renamed.contentHash), { name: 'Roadmap', deleted: true, notesPreserved: true });
  assert.deepEqual((await readdir(path.join(root, 'drawings'))).sort(), ['Other.excalidraw'], 'no lock or temporary files remain');
});

test('unsupported, linked and corrupt drawing files are refused without repair', async t => {
  const root = await fixture(t), directory = path.join(root, 'drawings');
  await mkdir(directory);
  await writeFile(path.join(directory, 'Good.excalidraw'), JSON.stringify(scene()));
  await writeFile(path.join(directory, 'Broken.excalidraw'), '{nope');
  await writeFile(path.join(directory, 'Not a scene.excalidraw'), JSON.stringify({ type: 'other', elements: [] }));
  await writeFile(path.join(directory, 'bad#name.excalidraw'), JSON.stringify(scene()));
  await writeFile(path.join(directory, 'notes.txt'), 'ignored');
  const outside = path.join(root, 'outside.json');
  await writeFile(outside, JSON.stringify(scene([rectangle('secret')])));
  await symlink(outside, path.join(directory, 'Linked.excalidraw'));

  const listed = await listDrawings(root);
  assert.deepEqual(listed.drawings.map(item => item.name).sort(), ['Broken', 'Good', 'Not a scene']);
  assert.equal(listed.skipped, 2, 'the linked file and the unsafe name are counted, not listed');
  await assert.rejects(readDrawing(root, 'Broken'), e => e.code === 'invalid_drawing');
  await assert.rejects(readDrawing(root, 'Not a scene'), e => e.code === 'invalid_drawing');
  await assert.rejects(readDrawing(root, 'Linked'), e => e.code === 'drawing_unsafe');
  await assert.rejects(readDrawing(root, '../outside'), e => e.code === 'invalid_drawing');
  assert.equal(await readFile(path.join(directory, 'Broken.excalidraw'), 'utf8'), '{nope', 'corrupt files are never reset');
});

test('a crashed writer does not block later saves, while a live writer does', async t => {
  const root = await fixture(t);
  const created = await createDrawing(root, 'Plan');
  const lock = path.join(root, 'drawings', '.write.lock');
  await writeFile(lock, JSON.stringify({ pid: 2 ** 22 + 12345 }) + '\n');
  const saved = await saveDrawing(root, 'Plan', scene([rectangle('a')]), created.contentHash);
  await writeFile(lock, JSON.stringify({ pid: process.pid }) + '\n');
  await assert.rejects(saveDrawing(root, 'Plan', scene(), saved.contentHash), e => e.code === 'drawing_busy');
  await rm(lock);
  assert.equal((await readDrawing(root, 'Plan')).contentHash, saved.contentHash);
});

test('a drawing mention is not an unresolved note in the graph', async t => {
  const root = await fixture(t);
  await mkdir(path.join(root, 'notes'), { recursive: true });
  await writeFile(path.join(root, 'notes/a.md'), '---\nid: mem_00000000-0000-4000-8000-0000000000a1\ntype: note\ntitle: A\n---\n\nSee [[System map.excalidraw]] and [[Missing page]].\n');
  const graph = await graphMemory(root, { includeUnresolved: true });
  assert.deepEqual(graph.nodes.filter(node => node.nodeKind === 'unresolved').map(node => node.id), ['unresolved:missing page']);
});

test('HTTP drawing routes authenticate, require prior hashes and keep readers read-only', async t => {
  const root = await fixture(t);
  const server = await startJumpyBrainHttpServer({ root, apiKeys: ['fixture'], port: 0, host: '127.0.0.1', autoIndex: false });
  t.drawingHosts.push(server);
  const request = (route, method = 'GET', body, headers = {}) => fetch(server.url + route, { method,
    headers: { Authorization: 'Bearer fixture', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) });
  const json = async (response) => ({ status: response.status, body: await response.json() });

  assert.equal((await fetch(server.url + '/memories/all/drawings')).status, 401);
  assert.deepEqual((await json(await request('/memories/all/drawings'))).body, { drawings: [], skipped: 0 });
  const created = await json(await request('/memories/all/drawings', 'POST', { name: 'System map' }));
  assert.equal(created.status, 200);
  assert.equal((await json(await request('/memories/all/drawings', 'POST', { name: 'System map' }))).body.error.code, 'drawing_conflict');
  assert.equal((await request('/memories/all/drawings', 'POST', { name: 'a/b' })).status, 400);
  assert.equal((await request('/memories/all/drawings', 'POST', { name: 'X', extra: 1 })).status, 400);

  const route = '/memories/all/drawings/' + encodeURIComponent('System map');
  assert.equal((await json(await request(route))).body.contentHash, created.body.contentHash);
  assert.equal((await request(route, 'PUT', { scene: scene() })).status, 428, 'a save needs the prior hash');
  assert.equal((await request(route, 'PUT', { scene: scene(), name: 'x' }, { 'If-Match': created.body.contentHash })).status, 400);
  const saved = await json(await request(route, 'PUT', { scene: scene([rectangle('a')]) }, { 'If-Match': created.body.contentHash }));
  assert.equal(saved.status, 200);
  assert.equal((await request(route, 'PUT', { scene: scene() }, { 'If-Match': created.body.contentHash })).status, 409);
  // A scene larger than the ordinary 1 MiB JSON limit still saves, up to the drawing cap.
  const large = await json(await request(route, 'PUT', { scene: scene([{ id: 'image', data: 'x'.repeat(1_500_000) }]) }, { 'If-Match': saved.body.contentHash }));
  assert.equal(large.status, 200);
  // A reader credential can open drawings but not change them.
  const issued = await (await request('/access', 'POST', { name: 'Viewer', role: 'reader' })).json();
  const asReader = (path, method = 'GET', body, headers = {}) => fetch(server.url + path, { method, headers: { Authorization: 'Bearer ' + issued.token, 'Content-Type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  assert.equal((await asReader(route)).status, 200);
  assert.equal((await asReader('/memories/all/drawings')).status, 200);
  assert.equal((await asReader('/memories/all/drawings', 'POST', { name: 'Reader made' })).status, 403);
  assert.equal((await asReader(route, 'PUT', { scene: scene() }, { 'If-Match': large.body.contentHash })).status, 403);
  assert.equal((await asReader(route, 'DELETE', undefined, { 'If-Match': large.body.contentHash })).status, 403);

  const renamed = await json(await request(route, 'PATCH', { name: 'Roadmap' }, { 'If-Match': large.body.contentHash }));
  assert.equal(renamed.body.name, 'Roadmap');
  assert.equal((await request(route)).status, 404);
  assert.equal((await request('/memories/all/drawings/a/b')).status, 400);
  assert.equal((await request('/memories/all/drawings/%E0%A4%A')).status, 400);
  assert.equal((await request('/memories/all/drawings/Roadmap', 'POST', {})).status, 405);
  assert.equal((await request('/memories/all/drawings/Roadmap', 'DELETE')).status, 428);
  assert.deepEqual((await json(await request('/memories/all/drawings/Roadmap', 'DELETE', undefined, { 'If-Match': renamed.body.contentHash }))).body,
    { name: 'Roadmap', deleted: true, notesPreserved: true });
  assert.deepEqual(await listDrawings(root), { drawings: [], skipped: 0 });

  const last = await createDrawing(root, 'Last');
  // Beyond the cap the server stops reading; the client sees a 400 or a closed connection, never a save.
  const oversized = await request('/memories/all/drawings/Last', 'PUT', '{"scene":' + JSON.stringify(scene([{ id: 'huge', data: 'x'.repeat(5_500_000) }])) + '}', { 'If-Match': last.contentHash, Connection: 'close' }).then(response => response.status, () => 'closed');
  assert.ok(oversized === 400 || oversized === 'closed', String(oversized));
  assert.equal((await readDrawing(root, 'Last')).contentHash, last.contentHash, 'an oversized scene is never stored');
});

test('the drawing editor is a public, content-free frame served apart from the note editor', async t => {
  const root = await fixture(t);
  const server = await startJumpyBrainHttpServer({ root, apiKeys: ['fixture'], port: 0, host: '127.0.0.1', autoIndex: false });
  t.drawingHosts.push(server);

  const shell = await fetch(server.url + '/');
  assert.match(shell.headers.get('content-security-policy'), /frame-src 'self'/);
  assert.match(shell.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  const html = await shell.text();
  assert.doesNotMatch(html, /excalidraw@|roughjs|react-dom/i, 'the shell never embeds the drawing editor');
  assert.equal((html.match(/<script\b/g) || []).length, 2);
  assert.match(html, /id="new-drawing"/);
  assert.match(html, /id="drawing-view"[^>]*hidden/);
  assert.equal(graphPageHtml('n', 'home', { companion: true }).includes('id="new-drawing"'), true, 'the Mac shell offers drawings too');

  const frame = await fetch(server.url + '/drawing-frame');
  assert.equal(frame.status, 200);
  assert.equal(frame.headers.get('content-security-policy'), DRAWING_FRAME_CSP);
  assert.match(DRAWING_FRAME_CSP, /default-src 'none'/);
  assert.match(DRAWING_FRAME_CSP, /script-src 'self';/);
  assert.match(DRAWING_FRAME_CSP, /font-src 'self';/);
  assert.match(DRAWING_FRAME_CSP, /frame-ancestors 'self'/);
  assert.doesNotMatch(DRAWING_FRAME_CSP, /https?:|\*/, 'no external origin is ever allowed');
  const frameHtml = await frame.text();
  assert.doesNotMatch(frameHtml, /<script(?![^>]*\bsrc=)/, 'the frame has no inline script');
  assert.deepEqual([...frameHtml.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]),
    ['/favicon.svg', '/drawing-app/drawing.css', '/drawing-app/boot.js', '/drawing-app/drawing.js']);

  const entry = await fetch(server.url + '/drawing-app/drawing.js');
  assert.equal(entry.status, 200);
  assert.match(entry.headers.get('content-type'), /^text\/javascript/);
  assert.equal(entry.headers.get('cache-control'), 'no-cache');
  assert.equal(entry.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await fetch(server.url + '/drawing-app/drawing.js', { headers: { 'If-None-Match': entry.headers.get('etag') } })).status, 304);
  const fonts = (await readdir(new URL('../dist/adapters/http-server/drawing-app/fonts/Excalifont/', import.meta.url)));
  const font = await fetch(server.url + '/drawing-app/fonts/Excalifont/' + fonts[0]);
  assert.equal(font.headers.get('content-type'), 'font/woff2');
  assert.match(font.headers.get('cache-control'), /immutable/);
  assert.equal((await fetch(server.url + '/drawing-app/drawing.js', { method: 'POST' })).status, 405);
  for (const route of ['/drawing-app/nope.js', '/drawing-app/%2e%2e/routes.js', '/drawing-app/../graph-page.js', '/drawing-app/fonts/../../routes.js', '/drawing-app/']) {
    assert.equal(drawingStaticResponse('GET', new URL(route, 'http://x').pathname).status, 404, route);
    assert.equal(drawingStaticResponse('GET', route).status, 404, route);
  }
});

test('the lazy drawing bundle stays within its reviewed weight and never ships CJK or CDN fonts', async () => {
  const base = new URL('../dist/adapters/http-server/drawing-app/', import.meta.url);
  let bytes = 0;
  const names = await readdir(base, { recursive: true });
  for (const name of names) { const info = await stat(new URL(name, base)); if (info.isFile()) bytes += info.size; }
  // Measured 3.95 MB; see docs/build-footprint.md before raising.
  assert.ok(bytes < 4_200_000, 'review the drawing editor if its files exceed 4.2 MB');
  assert.ok(gzipSync(await readFile(new URL('drawing.js', base))).length < 245_000, 'review the drawing entry beyond 245 KB gzip');
  assert.equal(names.some(name => /Xiaolai/.test(name)), false);
  assert.equal(names.some(name => /locales/.test(name)), false);
  assert.match(await readFile(new URL('LICENSES.txt', base), 'utf8'), /node_modules\/@excalidraw\/excalidraw[\s\S]*MIT License/);
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  for (const name of ['@excalidraw/excalidraw', 'react', 'react-dom']) {
    assert.match(pkg.devDependencies[name], /^\d+\.\d+\.\d+$/, name + ' is pinned and bundled at build time');
    assert.equal(name in pkg.dependencies, false);
  }
});

test('the Mac gateway serves the frame, proxies drawings and enforces per-brain write approval', async t => {
  const root = await fixture(t), remoteRoot = await fixture(t), support = path.join(root, 'support');
  await mkdir(support, { mode: 0o700 });
  const server = await startJumpyBrainHttpServer({ root: remoteRoot, apiKeys: ['fixture'], port: 0, host: '127.0.0.1', autoIndex: false });
  const gateway = await startCompanionGateway({ runtimeRoot: path.resolve('.'), directory: support, initialRoot: root, port: 0, controlKey: 'b'.repeat(64),
    credentials: { get: async () => 'fixture', set: async () => {}, delete: async () => {} } });
  t.drawingHosts.push(server, gateway);
  const request = (route, method = 'GET', body, extra = {}) => fetch(gateway.url + route, { method,
    headers: { Authorization: 'Bearer ' + 'b'.repeat(64), 'X-Companion-Generation': String(gateway.state().generation), 'Content-Type': 'application/json', ...extra },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

  // Static editor files need no session, like the shell itself.
  const shell = await fetch(gateway.url + '/');
  assert.match(shell.headers.get('content-security-policy'), /frame-src 'self'/);
  const frame = await fetch(gateway.url + '/drawing-frame');
  assert.equal(frame.status, 200);
  assert.equal(frame.headers.get('content-security-policy'), DRAWING_FRAME_CSP);
  assert.equal((await fetch(gateway.url + '/drawing-app/drawing.js')).status, 200);
  assert.equal((await fetch(gateway.url + '/drawing-app/nope.js')).status, 404);
  assert.equal((await fetch(gateway.url + '/memories/all/drawings')).status, 401);

  const initial = gateway.state();
  const created = await request('/memories/all/drawings', 'POST', { name: 'Local sketch' });
  assert.equal(created.status, 200);
  const hash = (await created.json()).contentHash;
  const large = scene([{ id: 'image', data: 'x'.repeat(1_500_000) }]);
  const saved = await request('/memories/all/drawings/Local%20sketch', 'PUT', { scene: large }, { 'If-Match': hash });
  assert.equal(saved.status, 200, 'the gateway forwards scenes above its ordinary 1 MiB body limit');
  assert.deepEqual((await readDrawing(root, 'Local sketch')).scene, large);
  assert.equal((await request('/memories/all/drawings', 'GET', undefined, { 'X-Companion-Generation': String(initial.generation - 1) })).status, 409);
  assert.equal((await request('/memories/all/notes', 'POST', { type: 'note', body: 'x'.repeat(1_100_000) })).status, 413, 'other routes keep the ordinary limit');

  const added = await request('/companion/profiles', 'POST', { revision: initial.revision, profile: { name: 'Shared', kind: 'remote', url: server.url, key: 'fixture', allowWrites: false } });
  const profile = (await added.json()).profiles.find(item => item.kind === 'remote');
  await request('/companion/switch', 'POST', { id: profile.id });
  const remote = await createDrawing(remoteRoot, 'Remote sketch', scene([rectangle('r')]));
  assert.deepEqual((await (await request('/memories/all/drawings')).json()).drawings.map(item => item.name), ['Remote sketch']);
  assert.equal((await (await request('/memories/all/drawings/Remote%20sketch')).json()).contentHash, remote.contentHash);
  assert.equal((await request('/memories/all/drawings', 'POST', { name: 'Denied' })).status, 403);
  assert.equal((await request('/memories/all/drawings/Remote%20sketch', 'PUT', { scene: scene() }, { 'If-Match': remote.contentHash })).status, 403);
  assert.equal((await request('/memories/all/drawings/Remote%20sketch', 'PATCH', { name: 'Moved' }, { 'If-Match': remote.contentHash })).status, 403);
  assert.equal((await request('/memories/all/drawings/Remote%20sketch', 'DELETE', undefined, { 'If-Match': remote.contentHash })).status, 403);
  assert.equal((await readDrawing(remoteRoot, 'Remote sketch')).contentHash, remote.contentHash, 'a read-only brain is never changed');
});

test('the desktop window permits only its own drawing frame as a subframe', () => {
  const origin = 'http://127.0.0.1:3787';
  assert.equal(isDrawingFrameNavigation(origin + '/drawing-frame', origin), true);
  for (const value of [origin + '/drawing-frame?x=1', origin + '/drawing-frame#x', origin + '/drawing-frame/', origin + '/', origin + '/drawing-app/drawing.js',
    'http://127.0.0.1:3788/drawing-frame', 'https://127.0.0.1:3787/drawing-frame', 'http://user@127.0.0.1:3787/drawing-frame', 'https://excalidraw.com/', 'about:blank', 'nope']) {
    assert.equal(isDrawingFrameNavigation(value, origin), false, value);
  }
});
