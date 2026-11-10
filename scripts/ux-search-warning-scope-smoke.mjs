// Production-shell fault probes: freshness stays quiet; explicit failures stay actionable.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startJumpyBrainHttpServer } from '../dist/server/index.js';
import { loadPlaywrightChromium, launchPlaywrightChromium } from './playwright-runtime.mjs';
import { installCollaborationSmokeTransport } from './collaboration-smoke-transport.mjs';
import { showSidebar, appendEditorText } from './editor-smoke-helpers.mjs';

const root = await mkdtemp(path.join(os.tmpdir(), 'jb-ux-search-warning-'));
const id = 'mem_42222222-2222-4222-8222-222222222222';
const targetId = 'mem_43333333-3333-4333-8333-333333333333';
const token = 'disposable-search-warning-key';
const content = `---\nid: ${id}\ntype: note\ntitle: Search warning scope\n---\nSaved source.\n`;
const targetContent = `---\nid: ${targetId}\ntype: note\ntitle: Search target\n---\nA useful result remains openable.\n`;
let server, browser;
const results = [];
try {
  await mkdir(path.join(root, 'notes'));
  await writeFile(path.join(root, 'notes/scope.md'), content);
  await writeFile(path.join(root, 'notes/target.md'), targetContent);
  server = await startJumpyBrainHttpServer({ root, apiKeys: [token], port: 0, autoIndex: false });
  browser = await launchPlaywrightChromium({ chromium: await loadPlaywrightChromium() });
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, permissions: ['clipboard-write', 'clipboard-read'] });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const transport = await installCollaborationSmokeTransport(page);
    let mode = 'stale', searchFailure = 0, resultFresh = false, indexRequests = 0;
    const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    await page.route('**/memories/all/status', route => {
      if (mode === 'unreachable') return json(route, { error: { code: 'unavailable' } }, 503);
      return json(route, {
        index: { stale: mode !== 'fresh', lastIndexedAt: mode === 'fresh' ? 'fresh-generation' : 'old-generation' },
        readiness: { freshness: mode === 'fresh' ? 'fresh' : 'stale' },
        maintenance: { enabled: mode === 'updating', indexing: mode === 'updating', failed: mode === 'failed' },
        semanticSetup: { state: 'lexical' },
      });
    });
    await page.route('**/memories/all/search', route => searchFailure
      ? json(route, { error: { code: 'index_unavailable' } }, searchFailure)
      : json(route, {
        results: [{ snippet: 'A useful result remains openable.', provenance: { file: 'notes/target.md', metadata: { id: targetId, title: 'Search target' } } }],
        index: { stale: !resultFresh }, readiness: { freshness: resultFresh ? 'fresh' : 'stale' },
        recognition: { version: 1, candidates: 1, matched: 1, metadataUnavailable: 0, partial: true },
      }));
    await page.route('**/memories/all/index', route => {
      indexRequests++;
      return json(route, { error: { code: 'index_unavailable' } }, 503);
    });
    await page.goto(`${server.url}/?note=${id}#apiKey=${token}`);
    await page.waitForFunction(() => state.editor?.collaboration?.state.status === 'saved');

    const openSearch = async () => {
      await showSidebar(page);
      await page.locator('#open-search').click();
      await page.locator('#note-search-input').waitFor({ state: 'visible' });
      await page.evaluate(() => searchMaintenance.check());
    };
    const closeSearch = async () => {
      await page.keyboard.press('Escape');
      await page.locator('#note-search-input').waitFor({ state: 'hidden' });
    };
    const assertQuiet = async description => {
      assert.notEqual(await page.locator('#app-toast').getAttribute('data-source'), 'search-maintenance', description);
      assert.equal(await page.locator('#note-search-input').evaluate(element => element === document.activeElement), true, 'maintenance must not move search focus');
    };

    for (mode of ['stale', 'failed', 'unreachable', 'updating']) {
      await openSearch();
      await assertQuiet(`${mode}: opening Search does not announce routine index status`);
      assert.equal(await page.locator('#graph-index-state').evaluate(element => element.hidden), mode === 'updating', `${mode}: quiet recovery indicator retains the observed state`);
      if (mode !== 'updating') {
        assert.match(await page.locator('#graph-index-state').getAttribute('aria-label'), mode === 'failed' ? /could not update/ : /may be out of date/);
      }
      await page.locator('#note-search-input').fill('Search target');
      await page.locator('#search-results li').waitFor();
      assert.equal(await page.locator('#search-refresh-index').isVisible(), true, 'stale results retain an explicit recovery action');
      assert.equal(await page.locator('#search-refresh-index').getAttribute('aria-label'), 'Reindex memory');
      await closeSearch();
      assert.equal(await page.locator('#graph-index-state').evaluate(element => element.hidden), true, 'inactive search releases its recovery indicator');
      await openSearch();
      await assertQuiet(`${mode}: the same state stays quiet on repeated Search entry`);
      await closeSearch();
      results.push(`${width}: ${mode} search/reentry is quiet with scoped recovery`);
    }
    assert.equal(indexRequests, 0, 'opening, typing and observing Search never initiate indexing');

    await page.locator('#toggle-page-details').click();
    await page.locator('#copy-note-draft').click();
    await page.waitForFunction(() => document.querySelector('#toast-message').textContent === 'Draft copied.');
    await openSearch();
    assert.equal(await page.locator('#toast-message').innerText(), 'Draft copied.', 'maintenance does not replace a copy confirmation');
    for (searchFailure of [500, 503]) {
      await page.locator('#note-search-input').fill('Unavailable query ' + searchFailure);
      await page.locator('#search-retry').waitFor({ state: 'visible' });
      assert.match(await page.locator('#search-message').innerText(), searchFailure === 500 ? /Search is unavailable/ : /Search failed/);
      searchFailure = 0;
      await page.locator('#search-retry').click();
      await page.locator('#search-results li').waitFor();
    }
    await page.locator('#search-refresh-index').click();
    await page.waitForFunction(() => document.querySelector('#search-message').textContent.includes('Index refresh could not be confirmed'));
    assert.equal(indexRequests, 1, 'only the explicit recovery action requests an index mutation');
    results.push(`${width}: copy confirmation, query Retry and explicit reindex failure remain actionable`);

    mode = 'fresh';
    resultFresh = true;
    await page.evaluate(() => searchMaintenance.check());
    await page.locator('#search-refresh-index').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#graph-index-state').evaluate(element => element.hidden), true, 'confirmed fresh publication clears the quiet recovery indicator');
    await page.locator('#search-results li').click();
    await page.waitForFunction(targetId => state.editor?.state.documentId === targetId && state.editor?.collaboration?.state.status === 'saved', targetId);
    assert.equal(await page.locator('#note-name').inputValue(), 'Search target', 'useful results remain openable after background recovery');
    await page.goBack();
    await page.waitForFunction(id => state.editor?.state.documentId === id && state.editor?.collaboration?.state.status === 'saved', id);
    results.push(`${width}: fresh publication reruns search and preserves result navigation`);

    const failed = transport.rejectNext('edit', { code: 'source_unavailable' });
    await appendEditorText(page, ' Private unsaved text.');
    await failed.arrived;
    await page.waitForFunction(() => document.querySelector('#app-toast').dataset.source === 'editor-save');
    mode = 'failed';
    await openSearch();
    await closeSearch();
    assert.equal(await page.locator('#app-toast').getAttribute('data-source'), 'editor-save', 'opening/closing Search cannot hide a genuine save error');
    assert.match(await page.locator('#toast-message').innerText(), /haven't been saved/);
    assert.equal(await readFile(path.join(root, 'notes/scope.md'), 'utf8'), content);
    assert.equal(await readFile(path.join(root, 'notes/target.md'), 'utf8'), targetContent);
    results.push(`${width}: save-error priority and both canonical sources preserved`);
    await context.close();
  }
  console.log(JSON.stringify({ passed: true, results, limitations: ['Real HTTP/WebSocket editor shell with controlled search/status/index responses; no real index repair, native UX score or historical-cause claim.'] }));
} finally {
  await browser?.close();
  await server?.close();
  await rm(root, { recursive: true, force: true });
}
