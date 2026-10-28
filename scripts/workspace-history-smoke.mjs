// Production shell, disposable Markdown; no installed app or personal brain.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { initializeMemoryRoot } from '../dist/runtime/index.js';
import { startJumpyBrainHttpServer } from '../dist/server/index.js';
import { loadPlaywrightChromium, launchPlaywrightChromium } from './playwright-runtime.mjs';
import { appendEditorText, editorMarkdown } from './editor-smoke-helpers.mjs';

const root = await mkdtemp(path.join(os.tmpdir(), 'jumpybrain-workspace-history-'));
const captures = '/tmp/jumpybrain-workspace-history-qa';
const key = 'disposable-workspace-history-key';
const ids = Array.from({ length: 8 }, (_, n) => `mem_a0000000-0000-4000-8000-${String(n + 1).padStart(12, '0')}`);
let browser, server;
try {
  await initializeMemoryRoot(root);
  await mkdir(captures, { recursive: true });
  for (const [n, id] of ids.entries()) await writeFile(path.join(root, `notes/fixture-${n}.md`),
    `---\nid: ${id}\ntype: note\ntitle: Fixture ${n}\n---\n\nBody ${n}. [[Fixture ${(n + 1) % ids.length}]]\n`);
  server = await startJumpyBrainHttpServer({ root, apiKeys: [key], port: 0, autoIndex: false });
  browser = await launchPlaywrightChromium({ chromium: await loadPlaywrightChromium() });
  const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${server.url}/#apiKey=${key}`);
  const back = page.locator('#navigate-back'), forward = page.locator('#navigate-forward');
  assert.equal(await back.isDisabled(), true);
  assert.equal(await forward.isDisabled(), true);
  await page.locator('#graph-link').click();
  await page.getByTestId('graph-ready').waitFor();
  await page.locator('#zoom-in').click();
  const graph = await page.evaluate(() => ({ scale: state.scale, pan: { ...state.pan }, count: state.graph.nodes.length }));
  const node = page.locator('[data-testid="graph-node"]').first();
  await node.dblclick({ force: true });
  await page.locator('#note-editor').waitFor();
  const noteUrl = page.url();
  await back.click();
  await page.waitForFunction(() => state.view === 'graph' && !navigation.isBusy());
  assert.deepEqual(await page.evaluate(() => ({ scale: state.scale, pan: { ...state.pan }, count: state.graph.nodes.length })), graph);
  await forward.click();
  await page.locator('#note-editor').waitFor();
  assert.equal(page.url(), noteUrl);

  // A failed save keeps both the draft and the graph destination for explicit retry.
  await page.route('**/memories/all/documents/*', route => route.request().method() === 'PUT'
    ? route.fulfill({ status: 500, json: { error: { message: 'Fixture failure' } } }) : route.continue());
  await appendEditorText(page, ' History draft.');
  await page.locator('#note-retry').waitFor();
  const draft = await editorMarkdown(page);
  await back.click();
  await page.waitForFunction(() => !navigation.isBusy());
  assert.equal(page.url(), noteUrl);
  assert.equal(await editorMarkdown(page), draft);
  assert.equal(await back.isEnabled(), true);
  await page.unroute('**/memories/all/documents/*');
  await page.locator('#note-retry').click();
  await page.waitForFunction(() => document.querySelector('#note-save-state').textContent === 'Saved');
  await back.click();
  await page.waitForFunction(() => state.view === 'graph' && !navigation.isBusy());

  for (const id of ids) {
    await page.evaluate(id => navigation.navigate('/?note=' + id), id);
    await page.waitForFunction(id => state.editor?.state.loaded && state.editor.state.documentId === id, id);
  }
  for (let n = 6; n >= 2; n--) {
    await back.click();
    await page.waitForFunction(id => !navigation.isBusy() && state.editor?.state.loaded && state.editor.state.documentId === id, ids[n]);
  }
  assert.equal(await back.isDisabled(), true);
  await forward.click();
  await page.waitForFunction(() => !navigation.isBusy());
  await page.locator('#graph-link').click();
  await page.waitForFunction(() => state.view === 'graph' && !navigation.isBusy());
  assert.equal(await forward.isDisabled(), true);
  await page.reload();
  await page.getByTestId('graph-ready').waitFor();
  assert.equal(await back.isDisabled(), true, 'reload starts a new tab trail');

  for (const theme of ['light', 'dark']) for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 850 });
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
    for (const collapsed of [false, true]) {
      if (await page.locator('#app-sidebar').isVisible() === collapsed) await page.locator('#toggle-sidebar').click();
      const history = await page.locator('.workspace-history').boundingBox();
      const sidebar = await page.locator('#app-sidebar').boundingBox();
      assert.ok(history.x >= 0 && history.x + history.width <= width);
      if (width === 1280) {
        assert.ok(history.y <= 12);
        if (sidebar) assert.ok(history.x >= sidebar.x + sidebar.width);
      }
      for (const control of [back, forward]) {
        const box = await control.boundingBox();
        assert.ok(box.width >= (width <= 680 ? 40 : 32));
      }
      await page.screenshot({ path: path.join(captures, `${theme}-${width}-${collapsed ? 'collapsed' : 'expanded'}.png`) });
    }
  }
  assert.deepEqual(errors, []);
  console.log(`workspace history smoke: PASS; captures ${captures}`);
} finally {
  await browser?.close();
  await server?.close();
  await rm(root, { recursive: true, force: true });
}
