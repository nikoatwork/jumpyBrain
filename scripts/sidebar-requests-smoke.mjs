// Disposable eight-note production-shell request accounting; no personal data.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { initializeMemoryRoot } from '../dist/runtime/index.js';
import { startJumpyBrainHttpServer } from '../dist/server/index.js';
import { loadPlaywrightChromium, launchPlaywrightChromium } from './playwright-runtime.mjs';
import { appendEditorText } from './editor-smoke-helpers.mjs';
const root = await mkdtemp(path.join(os.tmpdir(), 'jb-sidebar-counts-'));
let browser, server, phase = 'cold';
const records = [], pending = new Set();
try {
  await initializeMemoryRoot(root);
  const ids = Array.from({ length: 8 }, (_, n) => `mem_b0000000-0000-4000-8000-${String(n + 1).padStart(12, '0')}`);
  for (const [n, id] of ids.entries()) await writeFile(path.join(root, 'notes', `${n}.md`), `---\nid: ${id}\ntitle: Fixture ${n}\ntype: note\nupdated_at: 2026-10-01T00:00:00Z\n---\nPreview fixture ${n}.\n`);
  server = await startJumpyBrainHttpServer({ root, apiKeys: ['fixture-key'], port: 0, autoIndex: false });
  browser = await launchPlaywrightChromium({ chromium: await loadPlaywrightChromium() });
  const page = await browser.newPage();
  page.on('response', response => {
    const pathname = new URL(response.url()).pathname;
    if (!pathname.startsWith('/memories/')) return;
    const entry = { phase, path: pathname, method: response.request().method(), bytes: 0 };
    records.push(entry);
    const task = response.body().then(bytes => { entry.bytes = bytes.length; }).catch(() => {}).finally(() => pending.delete(task));
    pending.add(task);
  });
  await page.goto(server.url + '/#apiKey=fixture-key');
  await page.waitForFunction(() => [...document.querySelectorAll('#sidebar-recent .sidebar-page-preview')].filter(e => e.textContent.includes('Preview fixture')).length === 8);
  await page.waitForTimeout(300);
  phase = 'idle';
  await page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/attention'), { timeout: 20000 });
  await page.waitForTimeout(800);
  phase = 'edit';
  await page.locator(`[data-page-link="${ids[0]}"]`).click();
  await appendEditorText(page, ' A confirmed edit.');
  await page.waitForFunction(() => document.querySelector('#note-save-state')?.textContent === 'Saved');
  await page.waitForFunction(id => document.querySelector(`[data-page-link="${id}"] .sidebar-page-preview`)?.textContent.includes('confirmed edit'), ids[0]);
  assert.match(await page.locator(`[data-page-link="${ids[0]}"] .sidebar-page-preview`).textContent(), /confirmed edit/);
  phase = 'external';
  const raw = path.join(root, 'notes', '1.md');
  await page.route('**/documents/' + ids[1], async route => { await new Promise(resolve => setTimeout(resolve, 150)); await route.continue(); });
  await writeFile(raw, (await readFile(raw, 'utf8')).replace('Preview fixture 1.', 'Preview fixture 1. Raw external change.'));
  await page.waitForFunction(id => document.querySelector(`[data-page-link="${id}"] .sidebar-page-preview`)?.textContent.includes('Raw external change'), ids[1], { timeout: 20000 });
  await page.unroute('**/documents/' + ids[1]);
  phase = 'reconnect';
  await page.reload();
  await page.waitForFunction(() => [...document.querySelectorAll('#sidebar-recent .sidebar-page-preview')].filter(e => e.textContent.includes('Preview fixture')).length === 8);
  await Promise.allSettled([...pending]);
  const summary = Object.fromEntries(['cold', 'idle', 'edit', 'external', 'reconnect'].map(name => [name, {
    requests: records.filter(r => r.phase === name).length,
    documentGets: records.filter(r => r.phase === name && r.method === 'GET' && r.path.includes('/documents/')).length,
    bytes: records.filter(r => r.phase === name).reduce((sum, r) => sum + r.bytes, 0),
  }]));
  assert.equal(summary.idle.documentGets, 0);
  assert.equal(records.filter(r => r.phase === 'external' && r.method === 'GET' && r.path.endsWith(ids[1])).length, 1, 'Only the changed sidebar preview reloads once; the open editor keeps its separate source observation');
  console.log(JSON.stringify({ summary, records }, null, 2));
} finally { await browser?.close(); await server?.close(); await rm(root, { recursive: true, force: true }); }
