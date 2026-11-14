// Disposable eight-note production-shell request accounting; no personal data.
// Counts every HTTP request the window issues (including ones the page aborts:
// those have usually reached a proxy already) by route and phase.
//   --idle-ms <n>   idle observation window (default 60000)
//   --trace         print the call stack of every attention read
//   --measure-only  report counts without asserting the request budget
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { initializeMemoryRoot } from '../dist/runtime/index.js';
import { startJumpyBrainHttpServer } from '../dist/server/index.js';
import { loadPlaywrightChromium, launchPlaywrightChromium } from './playwright-runtime.mjs';
import { appendEditorText } from './editor-smoke-helpers.mjs';

const flag = name => process.argv.includes(name);
const option = (name, fallback) => { const at = process.argv.indexOf(name); return at >= 0 ? Number(process.argv[at + 1]) : fallback; };
const idleMs = option('--idle-ms', 60_000), trace = flag('--trace'), measureOnly = flag('--measure-only');
const root = await mkdtemp(path.join(os.tmpdir(), 'jb-sidebar-counts-'));
let browser, server, phase = 'open';
const records = [], pending = new Set();
const route = pathname => pathname.replace(/\/documents\/[^/]+/, '/documents/:id');
try {
  await initializeMemoryRoot(root);
  const ids = Array.from({ length: 8 }, (_, n) => `mem_b0000000-0000-4000-8000-${String(n + 1).padStart(12, '0')}`);
  for (const [n, id] of ids.entries()) await writeFile(path.join(root, 'notes', `${n}.md`), `---\nid: ${id}\ntitle: Fixture ${n}\ntype: note\nupdated_at: 2026-10-01T00:00:00Z\n---\nPreview fixture ${n}.\n`);
  server = await startJumpyBrainHttpServer({ root, apiKeys: ['fixture-key'], port: 0, autoIndex: false });
  browser = await launchPlaywrightChromium({ chromium: await loadPlaywrightChromium() });
  const page = await browser.newPage();
  if (trace) await page.addInitScript(() => {
    const original = window.fetch;
    window.fetch = function (input, init) {
      if (String(input?.url ?? input).includes('/attention')) console.debug('attention-call ' + JSON.stringify({ at: Math.round(performance.now()), stack: String(new Error().stack).split('\n').slice(2, 9).map(line => line.trim().replace(/\(?https?:\/\/[^/]+/, '').slice(0, 110)) }));
      return original.call(this, input, init);
    };
  });
  const attentionCalls = [];
  page.on('console', message => { if (message.text().startsWith('attention-call ')) attentionCalls.push({ phase, ...JSON.parse(message.text().slice(15)) }); });
  const watch = target => target.on('request', request => {
    const url = new URL(request.url());
    if (url.origin !== server.url) return;
    const entry = { phase, method: request.method(), path: url.pathname, route: route(url.pathname), status: 0, aborted: false, bytes: 0 };
    records.push(entry);
    const task = request.response().then(async response => {
      if (!response) { entry.aborted = true; return; }
      entry.status = response.status();
      entry.bytes = (await response.body().catch(() => Buffer.alloc(0))).length;
    }).catch(() => { entry.aborted = true; }).finally(() => pending.delete(task));
    pending.add(task);
  });
  watch(page);
  const previews = (count, target = page) => target.waitForFunction(count => [...document.querySelectorAll('#sidebar-recent .sidebar-page-preview')].filter(e => e.textContent.includes('Preview fixture')).length === count, count);
  const saved = () => page.waitForFunction(() => document.querySelector('#note-save-state')?.textContent === 'Saved');

  // Open one window directly on a note, then let the post-load refresh timers run.
  await page.goto(server.url + '/?note=' + ids[0] + '#apiKey=fixture-key');
  await previews(8);
  await page.waitForFunction(() => document.querySelector('#note-editor')?.isContentEditable);
  await page.waitForTimeout(4000);

  phase = 'idle';
  await page.waitForTimeout(idleMs);

  phase = 'type';
  await appendEditorText(page, ' ');
  for (const character of 'A confirmed edit, typed one key at a time to count the requests a typing burst costs. '.padEnd(100, 'x')) await page.keyboard.type(character);
  await saved();
  await page.waitForFunction(id => document.querySelector(`[data-page-link="${id}"] .sidebar-page-preview`)?.textContent.includes('confirmed edit'), ids[0]);
  await page.waitForTimeout(4000);

  phase = 'navigate';
  await page.locator(`[data-page-link="${ids[2]}"]`).click();
  await page.waitForFunction(() => document.querySelector('#note-title')?.textContent?.includes('Fixture 2') && document.querySelector('#note-editor')?.isContentEditable);
  await page.waitForTimeout(4000);

  phase = 'external';
  const raw = path.join(root, 'notes', '1.md');
  await writeFile(raw, (await readFile(raw, 'utf8')).replace('Preview fixture 1.', 'Preview fixture 1. Raw external change.'));
  await page.waitForFunction(id => document.querySelector(`[data-page-link="${id}"] .sidebar-page-preview`)?.textContent.includes('Raw external change'), ids[1], { timeout: 40000 });

  phase = 'reconnect';
  await page.reload();
  await previews(8);
  await page.waitForTimeout(4000);

  // An older server sends no preview field: rows fall back to one bounded read each.
  phase = 'older-server';
  const legacy = await browser.newPage();
  watch(legacy);
  await legacy.route('**/memories/all/attention', async route => {
    const response = await route.fetch(), packet = await response.json();
    for (const note of [...packet.notes, ...(packet.settled ?? [])]) delete note.preview;
    await route.fulfill({ response, json: packet });
  });
  await legacy.goto(server.url + '/#apiKey=fixture-key');
  await previews(8, legacy);
  await legacy.close();
  await Promise.allSettled([...pending]);

  const phases = ['open', 'idle', 'type', 'navigate', 'external', 'reconnect', 'older-server'];
  const of = (name, test = () => true) => records.filter(r => r.phase === name && test(r));
  const attention = r => r.route.endsWith('/attention'), documents = r => r.method === 'GET' && r.route.endsWith('/documents/:id');
  const summary = Object.fromEntries(phases.map(name => {
    const routes = {};
    for (const r of of(name)) routes[r.method + ' ' + r.route] = (routes[r.method + ' ' + r.route] ?? 0) + 1;
    return [name, { requests: of(name).length, aborted: of(name, r => r.aborted).length, attention: of(name, attention).length, documentGets: of(name, documents).length,
      bytes: of(name).reduce((sum, r) => sum + r.bytes, 0), routes }];
  }));
  const report = { idleMs, summary, sidebar: await page.evaluate(() => [...document.querySelectorAll('#sidebar-recent .sidebar-page-link')].map(link => ({
    title: link.querySelector('.sidebar-page-title')?.textContent, preview: link.querySelector('.sidebar-page-preview')?.textContent, age: link.querySelector('.sidebar-page-age')?.textContent }))) };
  if (trace) report.attentionCalls = attentionCalls;
  console.log(JSON.stringify(report, null, 2));
  if (!measureOnly) {
    assert.equal(summary.open.attention, 1, 'opening a window reads attention once');
    assert.equal(summary.reconnect.attention, 1, 'reloading a window reads attention once');
    assert.equal(summary.open.documentGets, 1, 'only the open note is read; sidebar previews arrive with attention');
    assert.equal(summary.open.aborted, 0, 'no load-time request is started and then abandoned');
    assert.equal(summary.idle.documentGets, 0);
    assert.ok(summary.idle.attention <= Math.ceil(idleMs / 15_000), 'idle refresh stays at one attention read per 15 seconds');
    assert.equal(summary.type.documentGets, 0, 'typing sends no whole-note reads');
    assert.ok(summary.type.attention <= 2, 'a typing burst costs at most the debounced refresh and one timer tick');
    assert.equal(summary.navigate.documentGets, 1, 'navigation reads only the opened note');
    assert.equal(summary.external.documentGets, 0, 'an external change updates its sidebar preview from the attention list');
    assert.equal(summary['older-server'].documentGets, 8, 'without attention previews every visible row is read once');
  }
} finally { await browser?.close(); await server?.close(); await rm(root, { recursive: true, force: true }); }
