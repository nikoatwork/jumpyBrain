// Real companion/Markdown graph clicks and optional page creation. Disposable roots only.
// npm run build && npx --package=playwright node scripts/graph-linked-topic-smoke.mjs
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { initializeMemoryRoot } from '../dist/runtime/index.js';
import { startCompanionGateway } from '../integrations/macos-companion/gateway.mjs';
import { launchPlaywrightChromium } from './playwright-runtime.mjs';
const temporary = await realpath(await mkdtemp(path.join(os.tmpdir(), 'jb-graph-linked-topic-')));
const root = path.join(temporary, 'memory'), directory = path.join(temporary, 'support');
const token = randomBytes(32).toString('hex');
const id = n => `mem_a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let gateway, browser;
try {
  await initializeMemoryRoot(root); await mkdir(directory, { mode: 0o700 });
  await writeFile(path.join(root, 'notes', 'daily.md'), `---\nid: ${id(1)}\ntitle: Daily log\n---\nNotes on [[fasting]] and [[pages/missing.md]].\n`);
  await writeFile(path.join(root, 'notes', 'food.md'), `---\nid: ${id(2)}\ntitle: Food journal\n---\nMore [[fasting]] observations.\n`);
  gateway = await startCompanionGateway({ runtimeRoot: process.cwd(), directory, initialRoot: root, port: 0, controlKey: token,
    credentials: { get: async () => null, set: async () => {}, delete: async () => {} } });
  browser = await launchPlaywrightChromium();
  for (const width of [1280, 390, 320]) {
    for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height: 844 } });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(theme => localStorage.setItem('jumpybrain.theme', theme), theme);
      // Search failure must never hide the graph's explicit connections.
      await page.route('**/memories/all/search*', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Disposable search unavailable' } }) }));
      await page.goto(gateway.url + '/graph#companion=' + token);
      await page.getByTestId('graph-ready').waitFor({ state: 'visible' });
      const openTopic = async target => {
        const node = page.locator('g[data-node-id="unresolved:' + target + '"]');
        await node.focus(); await page.keyboard.press('Enter');
        await page.locator('#graph-topic').waitFor({ state: 'visible' });
      };
      await openTopic('fasting');
      assert.equal(await page.locator('#graph-topic-title').textContent(), 'fasting');
      assert.equal(await page.locator('#graph-topic-links a').count(), 2);
      await page.waitForFunction(() => document.getElementById('graph-topic-status').textContent.includes('unavailable'));
      assert.equal((await readdir(path.join(root, 'pages'))).filter(name => name.endsWith('.md')).length, 0, 'preview creates no Markdown');
      const box = await page.locator('#graph-topic').boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width + 1, 'preview fits viewport');
      assert.equal(await page.locator('#graph-topic').evaluate(el => el.scrollWidth <= el.clientWidth), true);
      await page.keyboard.press('Escape');
      await openTopic('pages/missing.md');
      assert.equal(await page.locator('#graph-topic-create').isVisible(), false, 'path targets cannot become title pages');
      await page.locator('#graph-topic-close').click();
      await openTopic('fasting');
      await page.locator('#graph-topic-links a').filter({ hasText: 'Daily log' }).click();
      await page.waitForURL(url => url.searchParams.get('note') === id(1));
      await page.waitForFunction(() => document.querySelector('#note-name').value === 'Daily log');
      await page.goBack(); await page.getByTestId('graph-ready').waitFor({ state: 'visible' });
      await openTopic('fasting');
      // Verify failures keep preview/context reachable, then retry the actual route.
      const failCreate = route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Disposable failure' } }) });
      await page.route('**/memories/all/ensure-title', failCreate);
      await page.locator('#graph-topic-create').click();
      await page.waitForFunction(() => document.getElementById('graph-topic-status').textContent.includes('could not be confirmed'));
      assert.equal(await page.locator('#graph-topic-links a').count(), 2);
      await page.unroute('**/memories/all/ensure-title', failCreate);
      await page.locator('#graph-topic-create').click();
      await page.waitForURL(url => url.searchParams.has('note'));
      await page.waitForFunction(() => document.querySelector('#note-name').value === 'fasting');
      await page.locator('#related-pages').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#related-pages-list a').count(), 2, 'new page retains linked notes even with unavailable search');
      const pages = (await readdir(path.join(root, 'pages'))).filter(name => name.endsWith('.md'));
      assert.equal(pages.length, 1);
      assert.match(await readFile(path.join(root, 'pages', pages[0]), 'utf8'), /# fasting/);
      assert.deepEqual(errors, []);
      // Each layout starts with the same genuinely missing target.
      await context.close();
      await rm(path.join(root, 'pages', pages[0]));
      console.log(`PASS ${width}px ${theme}: preview, linked navigation, safe targets, no implicit write, failed creation/retry, saved-page context`);
    }
  }
} finally {
  await browser?.close(); await gateway?.close(); await rm(temporary, { recursive: true, force: true });
}
