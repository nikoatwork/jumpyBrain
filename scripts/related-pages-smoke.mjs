// Production shell + real lexical retrieval, read-only edge fixtures and two real brains.
// Disposable Markdown/credentials only; uses the repository's installed Playwright runner.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { initializeMemoryRoot, indexMemory } from '../dist/runtime/index.js';
import { startJumpyBrainHttpServer } from '../dist/server/index.js';
import { startCompanionGateway } from '../integrations/macos-companion/gateway.mjs';
import { loadPlaywrightChromium, launchPlaywrightChromium } from './playwright-runtime.mjs';
import { appendEditorText } from './editor-smoke-helpers.mjs';

const temporary = await mkdtemp(path.join(os.tmpdir(), 'jb-related-pages-'));
const shots = process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR || '/tmp/jb-feedback-related-qa';
const key = 'related-pages-disposable-key', controlKey = 'c'.repeat(64);
const id = n => `mem_a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const root = path.join(temporary, 'a'), other = path.join(temporary, 'b');
const indexing = process.env.JUMPYBRAIN_RELATED_MODEL ? { mode: 'semantic', model: process.env.JUMPYBRAIN_RELATED_MODEL } : { mode: 'lexical' };
const hit = (n, score, title = `Paraphrase ${n}`) => ({ provenance: { metadata: { id: id(n), title } }, scoreBreakdown: { qmdScore: score } });
const errors = [], mutations = [], searches = [];
let server, otherServer, gateway, browser;
try {
  await mkdir(shots, { recursive: true });
  for (const [directory, name] of [[root, 'Sleep quality'], [other, 'Garden planning']]) {
    await initializeMemoryRoot(directory);
    for (let n = 1; n <= 8; n++) await writeFile(path.join(directory, 'notes', `${n}.md`), `---\nid: ${id(n)}\ntitle: ${n === 1 ? name : name + ' ' + n}\ntype: note\n---\n${name} improves with consistent habits.\n`);
    await indexMemory(directory, { indexing });
  }
  server = await startJumpyBrainHttpServer({ root, apiKeys: [key], port: 0, autoIndex: false });
  otherServer = await startJumpyBrainHttpServer({ root: other, apiKeys: [key], port: 0, autoIndex: false });
  for (const host of [server, otherServer]) {
    const indexed = await fetch(host.url + '/memories/all/index', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(indexed.status, 200, await indexed.text());
  }
  browser = await launchPlaywrightChromium({ chromium: await loadPlaywrightChromium() });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (new URL(request.url()).pathname === '/memories/all/search') searches.push(request.postDataJSON()); if (['PUT', 'PATCH', 'DELETE'].includes(request.method()) || /\/index$/.test(request.url())) mutations.push(request.method() + ' ' + new URL(request.url()).pathname); });
  const open = async (n = 1) => { await page.goto(`${server.url}/?note=${id(n)}#apiKey=${key}`); await page.locator('#note-editor').waitFor(); };
  const initialResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/memories/all/search' && response.status() === 200);
  await open();
  const initialPacket = await (await initialResponse).json();
  if (indexing.mode === 'semantic') {
    assert.ok(initialPacket.readiness?.modes.includes('semantic'));
    assert.ok(!initialPacket.retrieval?.warnings?.some(warning => /semantic_query_failed|query_constraints_lexical_only/.test(warning)), 'real vector branch must run successfully');
  }
  await page.waitForFunction(() => document.querySelectorAll('#related-pages-list a').length === 5);
  assert.ok((await page.locator('#related-pages-list a').evaluateAll(links => links.map(a => a.href))).every(url => !url.includes('note=' + id(1))));
  const preview = page.locator('#related-page-preview');
  const firstLink = page.locator('#related-pages-list a').first();
  await firstLink.scrollIntoViewIfNeeded();
  await firstLink.hover();
  await preview.waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelector('#related-page-preview').textContent.includes('improves with consistent habits'));
  assert.equal(await firstLink.getAttribute('aria-describedby'), 'related-page-preview');
  assert.equal(await preview.locator('img, script, a').count(), 0);
  await page.keyboard.press('Escape'); await preview.waitFor({ state: 'hidden' });
  await firstLink.focus(); await preview.waitFor({ state: 'visible' });
  await page.keyboard.press('Escape'); await preview.waitFor({ state: 'hidden' });
  await page.locator('#note-name').focus();
  for (const theme of ['light', 'dark']) for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    await page.locator('#related-pages').scrollIntoViewIfNeeded();
    assert.equal(await page.locator('#related-pages-list a').count(), 5);
    assert.ok(await page.locator('#related-pages').evaluate(el => el.getBoundingClientRect().right <= innerWidth));
    await page.locator('#related-pages-list a').first().focus();
    await preview.waitFor({ state: 'visible' });
    assert.ok(await preview.evaluate(el => { const box = el.getBoundingClientRect(); return box.x >= 0 && box.right <= innerWidth && box.y >= 0 && box.bottom <= innerHeight; }));
    assert.equal(await preview.locator('span').evaluate(el => getComputedStyle(el).webkitLineClamp), '2');
    await page.screenshot({ path: path.join(shots, `related-${theme}-${width}.png`) });
    await page.keyboard.press('Escape');
    await page.locator('#note-name').focus();
  }
  assert.deepEqual(mutations, [], 'automatic discovery never writes or indexes');
  // Edge evidence uses bounded read-response fixtures over the same production UI.
  let packet = { index: { stale: false }, results: [hit(1, 1), hit(2, .95, '<img src=x>'), hit(2, .95), hit(3, .9), hit(4, .7)] };
  await page.route('**/memories/all/search', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(packet) }));
  await open();
  await page.waitForFunction(() => document.querySelectorAll('#related-pages-list a').length === 3);
  assert.equal(await page.locator('#related-pages img').count(), 0);
  assert.equal(await page.locator('#related-pages-list a').first().textContent(), '<img src=x>');
  await page.route('**/memories/all/documents/' + id(3), route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: id(3), content: '# Preview\n\n**Readable** <img src=x onerror=alert(1)> ' + 'Long plain-text preview. '.repeat(30) }) }));
  await page.locator('#related-pages-list a').nth(1).focus();
  await page.waitForFunction(() => document.querySelector('#related-page-preview').textContent.includes('Readable <img'));
  assert.equal(await preview.locator('img, script').count(), 0, 'body preview is text, never active HTML');
  assert.ok(await preview.locator('span').evaluate(el => el.getBoundingClientRect().height <= 2 * parseFloat(getComputedStyle(el).lineHeight) + 1));
  await page.keyboard.press('Escape');
  await page.unroute('**/memories/all/documents/' + id(3));
  await page.route('**/memories/all/documents/' + id(2), route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await page.locator('#related-pages-list a').first().focus();
  await page.waitForFunction(() => document.querySelector('#related-page-preview').textContent === 'Preview unavailable.');
  await page.keyboard.press('Escape');
  await page.unroute('**/memories/all/documents/' + id(2));
  await page.setViewportSize({ width: 1280, height: 900 });
  let releasePreview;
  const heldPreview = new Promise(resolve => { releasePreview = resolve; });
  let previewStarted;
  const previewAdmitted = new Promise(resolve => { previewStarted = resolve; });
  await page.route('**/memories/all/documents/' + id(2), async route => {
    previewStarted(); await heldPreview;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: id(2), content: 'Late private preview' }) }).catch(() => {});
  });
  await page.locator('#note-name').focus();
  await page.locator('#related-pages-list a').first().focus(); await previewAdmitted;
  await page.locator('#home-link').click(); releasePreview();
  await page.waitForLoadState('networkidle');
  assert.equal(await preview.isVisible(), false);
  assert.equal(await preview.textContent(), '', 'late preview cannot survive navigation');
  await page.unroute('**/memories/all/documents/' + id(2));
  for (const value of [{ results: [] }, { index: { stale: true }, results: [hit(2, .99)] }]) {
    packet = value; await open(); await page.waitForLoadState('networkidle');
    assert.equal(await page.locator('#related-pages').isVisible(), false);
  }
  await page.unroute('**/memories/all/search');
  await page.route('**/memories/all/search', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await open(); await page.waitForLoadState('networkidle'); assert.equal(await page.locator('#related-pages').isVisible(), false);
  await page.unroute('**/memories/all/search');
  let release, started;
  const held = new Promise(resolve => { release = resolve; });
  const admitted = new Promise(resolve => { started = resolve; });
  await page.route('**/memories/all/search', async route => { started(); await held; await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ results: [hit(2, .99)] }) }).catch(() => {}); });
  await open(); await admitted; await page.setViewportSize({ width: 1280, height: 900 }); await page.locator('#home-link').click(); release();
  await page.waitForLoadState('networkidle'); assert.equal(await page.locator('#related-pages-list a').count(), 0, 'late result cannot revive a departed note');
  await page.unroute('**/memories/all/search');
  // Real live saves/deletions preserve both links and their DOM nodes.
  await open(); await page.locator('#related-pages-list a').first().waitFor();
  await page.evaluate(() => { window.relatedAnchor = document.querySelector('#related-pages-list a'); });
  const baselineRequests = mutations.length, baselineSearches = searches.length;
  for (let n = 0; n < 3; n++) {
    await appendEditorText(page, ' Temporary sentence.');
    await page.waitForFunction(() => state.editor.state.saveStatus === 'saved' && !state.editor.state.dirty);
    await page.keyboard.press('Backspace');
    await page.waitForFunction(() => state.editor.state.saveStatus === 'saved' && !state.editor.state.dirty);
    assert.equal(await page.evaluate(() => window.relatedAnchor === document.querySelector('#related-pages-list a')), true);
  }
  assert.equal(mutations.length, baselineRequests, 'live publication does not issue legacy PUT or index requests');
  assert.equal(searches.length, baselineSearches, 'typing does not search per saved revision');
  await new Promise(resolve => setTimeout(resolve, 12000));
  assert.equal(searches.length, baselineSearches + 1, 'changed saved content triggers one ten-second refresh');
  assert.match(searches.at(-1).query, /temporary sentence/);
  assert.equal(await page.evaluate(() => window.relatedAnchor === document.querySelector('#related-pages-list a')), true, 'stale-index refresh retains existing anchors');
  // An unfinished rename exercises the actual save/navigation barrier.
  await page.locator('#note-name').fill('');
  const target = await page.locator('#related-pages-list a').first().getAttribute('href');
  await page.locator('#related-pages-list a').first().click();
  assert.equal(new URL(page.url()).searchParams.get('note'), id(1));
  assert.equal(await page.locator('#note-name').inputValue(), '');
  await page.locator('#note-name').fill('Sleep quality');
  await page.waitForFunction(() => state.editor.state.saveStatus === 'saved' && !state.editor.state.dirty);
  await page.locator('#related-pages-list a').first().click();
  await page.waitForURL(url => url.searchParams.get('note') === new URL(target, server.url).searchParams.get('note'));
  assert.match(await readFile(path.join(root, 'notes/1.md'), 'utf8'), /Temporary sentence/);
  await page.close();

  // Two genuinely distinct read-only remote profiles, including same note IDs.
  const directory = path.join(temporary, 'support'); await mkdir(directory, { mode: 0o700 });
  const keys = new Map();
  gateway = await startCompanionGateway({ runtimeRoot: process.cwd(), directory, initialRoot: root, port: 0, controlKey,
    credentials: { get: async ref => keys.get(ref), set: async (ref, value) => keys.set(ref, value), delete: async ref => keys.delete(ref) } });
  await gateway.store.save({ kind: 'remote', name: 'Sleep fixture', url: server.url, allowWrites: false, key }, gateway.store.snapshot().revision);
  await gateway.store.save({ kind: 'remote', name: 'Garden fixture', url: otherServer.url, allowWrites: false, key }, gateway.store.snapshot().revision);
  const a = gateway.store.snapshot().profiles.find(p => p.name === 'Sleep fixture');
  const b = gateway.store.snapshot().profiles.find(p => p.name === 'Garden fixture');
  const response = await fetch(gateway.url + '/companion/switch', { method: 'POST', headers: { Authorization: 'Bearer ' + controlKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: a.id }) });
  assert.equal(response.status, 200, await response.text());
  const context = await browser.newContext();
  await context.request.post(gateway.url + '/companion/session', { data: { token: controlKey }, headers: { Origin: gateway.url } });
  const companion = await context.newPage(); companion.on('pageerror', error => errors.push(error.message));
  await companion.goto(`${gateway.url}/?note=${id(1)}&brain=${a.id}`);
  await companion.locator('#note-editor').waitFor({ state: 'visible' });
  // Earlier human save made A stale; explicit test setup publishes it now.
  assert.equal((await fetch(server.url + '/memories/all/index', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: '{}' })).status, 200);
  await companion.reload(); await companion.locator('#related-pages-list a').first().waitFor();
  await companion.locator('#related-pages-list a').first().scrollIntoViewIfNeeded();
  await companion.locator('#related-pages-list a').first().focus();
  await companion.waitForFunction(() => document.querySelector('#related-page-preview').textContent.includes('Sleep quality'));
  const oldLink = await companion.locator('#related-pages-list a').first().getAttribute('href');
  assert.ok(oldLink.includes('brain=' + a.id), 'links retain their brain identity');
  await companion.locator('select[aria-label="Switch brain"]').selectOption(b.id);
  await companion.waitForURL(url => url.searchParams.get('brain') === b.id && !url.searchParams.has('note'));
  assert.equal(await companion.locator('#related-pages-list a').count(), 0);
  await companion.goto(`${gateway.url}/?note=${id(1)}&brain=${b.id}`);
  await companion.locator('#related-pages-list a').first().waitFor();
  assert.ok((await companion.locator('#related-pages-list a').allTextContents()).every(title => title.startsWith('Garden planning')));
  await companion.locator('#related-pages-list a').first().scrollIntoViewIfNeeded();
  await companion.locator('#related-pages-list a').first().focus();
  await companion.waitForFunction(() => document.querySelector('#related-page-preview').textContent.includes('Garden planning'));
  assert.doesNotMatch(await companion.locator('#related-page-preview').innerText(), /Sleep quality/);
  assert.equal(await companion.locator('#note-name').getAttribute('readonly') !== null, true, 'discovery works on a read-only brain');
  await context.close();
  assert.deepEqual(errors, []);
  console.log(`Related pages smoke: PASS (real ${indexing.mode} discovery, 5-link cap, semantic/weak/duplicate/stale/unavailable fixtures, safe titles, both themes at 1280/390/320, delayed navigation, live saves/deletions and unfinished-rename navigation guard, real brain switch/read-only). Screenshots: ${shots}`);
} finally {
  await browser?.close(); await gateway?.close(); await server?.close(); await otherServer?.close(); await rm(temporary, { recursive: true, force: true });
}
