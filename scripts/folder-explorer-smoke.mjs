// Real hosted and companion transports; all canonical notes are disposable fixtures.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { initializeMemoryRoot } from '../dist/runtime/index.js';
import { startJumpyBrainHttpServer } from '../dist/server/index.js';
import { startCompanionGateway } from '../integrations/macos-companion/gateway.mjs';
import { loadPlaywrightChromium, launchPlaywrightChromium } from './playwright-runtime.mjs';
import { folderExplorerMarkup } from '../dist/adapters/http-server/folder-explorer-view.js';

const temp = await mkdtemp(path.join(os.tmpdir(), 'jumpybrain-folders-'));
const root = path.join(temp, 'memory');
const captures = process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR || '/tmp/jumpybrain-folder-explorer-qa';
const key = 'disposable-folder-explorer-key', controlKey = 'f'.repeat(64);
const id = number => 'mem_fb000000-0000-4000-8000-' + String(number).padStart(12, '0');
const fixtures = [
  { file: 'notes/projects/alpha/shared.md', title: 'Orchard architecture', id: id(1) },
  { file: 'notes/projects/beta/shared.md', title: 'Harbour navigation', id: id(2) },
  { file: 'notes/projects/beta/step2.md', title: 'A second step', id: id(3) },
  { file: 'notes/projects/beta/step10.md', title: 'A tenth step', id: id(4) },
  { file: 'notes/personal/travel/ideas.md', title: 'Quiet holiday ideas', id: id(5) },
  { file: 'notes/loose.md', title: 'An unfiled note', id: id(6) },
  { file: 'decisions/infrastructure/hosting.md', title: 'A deliberately long hosting decision title that needs to fit inside a narrow explorer', id: id(7) },
];
const originals = new Map();
let server, gateway, browser;

async function writeFixture(note) {
  const filename = path.join(root, note.file);
  const content = `---\nid: ${note.id}\ntitle: ${note.title}\ntype: note\ncustom: preserved\n---\n\nEvidence for ${note.title}.\n`;
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, content);
  originals.set(filename, content);
}

async function checkReadLifecycle(page) {
  const result = await page.evaluate(async ({ markup, noteId }) => {
    const frame = document.createElement('iframe'); document.body.append(frame);
    const doc = frame.contentDocument;
    doc.body.innerHTML = '<button id="toggle-folders">Folders</button>' + markup;
    let scope = 'first';
    const pending = [];
    const controller = JumpyBrainBrowser.installFolderExplorer({
      document: doc, window: frame.contentWindow, scope: () => scope, enabled: () => true,
      fetch: signal => new Promise(resolve => pending.push({ resolve, signal })), navigate: async () => true,
    });
    const toggle = doc.getElementById('toggle-folders');
    const tree = doc.getElementById('folder-explorer-tree');
    const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
    try {
      toggle.click(); controller.close();
      const closedAborted = pending[0].signal.aborted;
      pending[0].resolve({ files: [{ id: noteId, file: 'notes/closed.md' }] }); await settle();
      const closedEmpty = !tree.textContent && !controller.isOpen();
      toggle.click(); scope = 'second'; controller.sync();
      const scopeAborted = pending[1].signal.aborted;
      toggle.click();
      pending[2].resolve({ files: [{ id: noteId, file: 'pages/current.md' }] }); await settle();
      pending[1].resolve({ files: [{ id: noteId, file: 'notes/stale.md' }] }); await settle();
      const currentOnly = tree.textContent === 'pages';
      controller.rename(noteId, 'Renamed locally');
      const search = doc.getElementById('folder-explorer-search');
      search.value = 'Renamed locally'; search.dispatchEvent(new Event('input'));
      return { closedAborted, closedEmpty, scopeAborted,
        currentOnly, open: controller.isOpen(),
        localRename: tree.textContent.includes('current') && pending.length === 3 };
    } finally { controller.close(false); frame.remove(); }
  }, { markup: folderExplorerMarkup, noteId: id(90) });
  assert.deepEqual(result, { closedAborted: true, closedEmpty: true, scopeAborted: true, currentOnly: true, open: true, localRename: true },
    'close and brain changes abort reads; even a transport ignoring abort cannot restore stale rows');
}

async function checkSurface(name, url) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 850 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [], writes = [], reads = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith('/memories/all/files')) reads.push(request.url());
    if (/\/memories\/all\/documents\//.test(pathname) && request.method() !== 'GET') writes.push(request);
  });
  const panel = page.locator('#folder-explorer');
  const search = page.locator('#folder-explorer-search');
  const tree = page.locator('#folder-explorer-tree');
  const toggle = page.locator('#toggle-folders');
  const refresh = page.locator('#folder-explorer-refresh');
  const fileRow = file => tree.locator('[data-file-path=' + JSON.stringify(file) + ']');
  const folderRow = file => tree.locator('[data-folder-path=' + JSON.stringify(file) + ']');
  const focused = locator => locator.evaluate(element => element === document.activeElement);
  const open = async () => {
    if (!await panel.isVisible()) await toggle.click();
    await panel.waitFor();
  };
  const expandTo = async file => {
    for (let attempt = 0; attempt < 15 && !await fileRow(file).isVisible(); attempt++) {
      const ancestor = await tree.locator('[data-folder-path][aria-expanded=false]').evaluateAll((rows, target) => rows
        .map(row => row.getAttribute('data-folder-path'))
        .filter(folder => target.startsWith(folder + '/'))
        .sort((a, b) => a.length - b.length)[0], file);
      assert.ok(ancestor, 'a visible expandable ancestor exists for ' + file);
      await folderRow(ancestor).click();
    }
    await fileRow(file).waitFor();
  };
  try {
    await page.goto(url);
    await toggle.waitFor();
    await checkReadLifecycle(page);
    assert.equal(await panel.isVisible(), false, 'explorer starts closed');
    assert.equal(reads.length, 0, 'closed explorer does not load the file catalogue');
    await open();
    assert.equal(await focused(search), true, 'opening prefocuses search');
    await folderRow('notes').waitFor();
    assert.equal(await tree.getAttribute('role'), 'tree');

    await expandTo(fixtures[0].file);
    await expandTo(fixtures[1].file);
    assert.equal(await fileRow(fixtures[0].file).count(), 1);
    assert.equal(await fileRow(fixtures[1].file).count(), 1, 'duplicate basenames retain separate paths');
    const beta = folderRow('notes/projects/beta');
    await beta.click();
    assert.equal(await beta.getAttribute('aria-expanded'), 'false');
    assert.equal(await fileRow(fixtures[1].file).isVisible(), false, 'mouse collapse hides descendants');

    await search.fill('Harbour navigation');
    await fileRow(fixtures[1].file).waitFor();
    assert.equal(await fileRow(fixtures[0].file).isVisible(), false, 'title filtering removes unrelated notes');
    await search.fill('notes/projects/alpha');
    await fileRow(fixtures[0].file).waitFor();
    assert.equal(await fileRow(fixtures[1].file).isVisible(), false, 'path filtering distinguishes duplicate basenames');
    await search.fill('no-fixture-note-matches-this');
    await page.locator('#folder-explorer-message').filter({ hasText: /no|match/i }).waitFor();
    await search.fill('');
    assert.equal(await beta.getAttribute('aria-expanded'), 'false', 'clearing search restores manual branch state');
    assert.equal(await fileRow(fixtures[1].file).isVisible(), false);

    await beta.focus();
    await beta.press('ArrowRight');
    assert.equal(await beta.getAttribute('aria-expanded'), 'true', 'right arrow expands a folder');
    await beta.press('ArrowRight');
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('role')), 'treeitem', 'right arrow enters the branch');
    assert.equal(await focused(beta), false);
    await page.keyboard.press('ArrowLeft');
    assert.equal(await focused(beta), true, 'left arrow returns to parent');
    await beta.press('ArrowLeft');
    assert.equal(await beta.getAttribute('aria-expanded'), 'false');
    await search.focus();
    await search.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('role')), 'treeitem', 'down arrow enters tree from search');
    await page.keyboard.press('End');
    await page.keyboard.press('Home');
    assert.equal(await tree.locator('[role=treeitem]').first().evaluate(element => element === document.activeElement), true);

    await search.fill('Orchard architecture');
    await fileRow(fixtures[0].file).click();
    await page.waitForFunction(expected => state.editor?.state.loaded && new URL(location.href).searchParams.get('note') === expected, id(1));
    assert.equal(await page.locator('#note-name').inputValue(), fixtures[0].title);
    await open();
    await search.fill('Harbour navigation');
    await fileRow(fixtures[1].file).click();
    await page.waitForFunction(expected => state.editor?.state.loaded && new URL(location.href).searchParams.get('note') === expected, id(2));
    assert.equal(await page.locator('#note-name').inputValue(), fixtures[1].title, 'same basename opens the correct canonical document');
    assert.equal(writes.length, 0, 'browsing and opening notes issue no document writes');
    for (const [filename, content] of originals) assert.equal(await readFile(filename, 'utf8'), content, 'browsing preserves canonical bytes');

    await open();
    await search.fill('');
    let failCatalogue = true;
    await page.route('**/memories/all/files', route => failCatalogue
      ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Fixture catalogue temporarily unavailable' } }) })
      : route.continue());
    await refresh.click();
    await page.locator('#folder-explorer-message').filter({ hasText: /unavailable|unable|failed|retry|error|could not/i }).waitFor();
    failCatalogue = false;
    await refresh.click();
    await folderRow('notes').waitFor();
    await page.unroute('**/memories/all/files');

    const external = { file: 'notes/external/new-' + name + '.md', title: 'External arrival ' + name, id: id(name === 'hosted' ? 20 : 21) };
    await writeFixture(external);
    await search.fill(external.title);
    assert.equal(await fileRow(external.file).count(), 0, 'new external file is absent before refresh');
    await refresh.click();
    await fileRow(external.file).waitFor();

    await search.press('Escape');
    assert.equal(await search.inputValue(), '', 'Escape clears active search first');
    assert.equal(await panel.isVisible(), true);
    await search.press('Escape');
    await panel.waitFor({ state: 'hidden' });
    assert.equal(await focused(toggle), true, 'closing restores toggle focus');
    const closedReads = reads.length;
    await page.evaluate(async () => {
      folderExplorer.sync();
      await folderExplorer.refresh();
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(reads.length, closedReads, 'closed explorer ignores visibility/focus refresh signals');

    await open();
    await search.fill('');
    await expandTo(fixtures[1].file);
    for (const width of [1280, 900, 390, 320]) for (const theme of ['light', 'dark']) {
      await page.setViewportSize({ width, height: 850 });
      await page.evaluate(theme => colorTheme.setPreference(theme), theme);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.waitForFunction(() => {
        const panel = document.getElementById('folder-explorer').getBoundingClientRect();
        return Math.abs(panel.right - innerWidth) <= 1 && (innerWidth > 680 || Math.abs(panel.width - innerWidth) <= 1);
      });
      const geometry = await panel.evaluate(element => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width, viewport: innerWidth, height: innerHeight, fits: document.documentElement.scrollWidth <= innerWidth };
      });
      assert.ok(geometry.fits, 'no horizontal page overflow at ' + width);
      assert.ok(geometry.left >= -1 && geometry.right <= geometry.viewport + 1 && geometry.bottom <= geometry.height + 1, 'panel stays inside viewport');
      assert.ok(geometry.width >= Math.min(280, width), 'usable explorer width');
      const searchBox = await search.boundingBox(), closeBox = await page.locator('#folder-explorer-close').boundingBox();
      assert.ok(searchBox.x >= geometry.left && searchBox.x + searchBox.width <= geometry.right + 1, 'search fits panel: ' + JSON.stringify({width, geometry, searchBox}));
      assert.ok(closeBox.x >= 0 && closeBox.x + closeBox.width <= width + 1, 'close remains reachable');
      await page.screenshot({ path: path.join(captures, name + '-' + width + '-' + theme + '.png') });
    }

    // A medium-width overlay also yields to its chosen note.
    await page.setViewportSize({ width: 900, height: 850 });
    await fileRow(fixtures[1].file).click();
    await panel.waitFor({ state: 'hidden' });
    await open();
    await page.setViewportSize({ width: 320, height: 850 });
    // Narrow navigation gives the chosen note the viewport and retains the browsing context.
    await beta.click();
    assert.equal(await beta.getAttribute('aria-expanded'), 'false');
    await search.fill('Orchard architecture');
    await fileRow(fixtures[0].file).click();
    await page.waitForFunction(expected => state.editor?.state.loaded && new URL(location.href).searchParams.get('note') === expected, id(1));
    await panel.waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#note-name').inputValue(), fixtures[0].title);
    await open();
    assert.equal(await focused(search), true, 'reopening after narrow navigation focuses search');
    assert.equal(await search.inputValue(), 'Orchard architecture', 'narrow navigation retains search text');
    await search.fill('');
    assert.equal(await beta.getAttribute('aria-expanded'), 'false', 'reopening retains unrelated collapsed branches');
    await search.fill('Harbour navigation');
    await fileRow(fixtures[1].file).click();
    await page.waitForFunction(expected => state.editor?.state.loaded && new URL(location.href).searchParams.get('note') === expected, id(2));
    await panel.waitFor({ state: 'hidden' });
    await page.screenshot({ path: path.join(captures, name + '-narrow-selected-note.png') });
    await open();
    assert.equal(await search.inputValue(), 'Harbour navigation');
    await search.fill('');

    // A failed save must retain the old note and draft when the explorer asks to navigate.
    await page.setViewportSize({ width: 1280, height: 850 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.route('**/memories/all/documents/**', route => route.request().method() === 'PUT'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Fixture save failed' } }) })
      : route.continue());
    await page.locator('#folder-explorer-close').click();
    await page.locator('#note-name').fill('Unsaved explorer draft');
    await open();
    await search.fill('Orchard architecture');
    await fileRow(fixtures[0].file).click();
    await page.waitForFunction(() => state.editor?.state.saveStatus === 'failed');
    assert.equal(new URL(page.url()).searchParams.get('note'), id(2), 'failed save prevents explorer navigation');
    assert.equal(await page.locator('#note-name').inputValue(), 'Unsaved explorer draft');
    assert.equal(await panel.isVisible(), true, 'failed navigation keeps explorer available');
    for (const [filename, content] of originals) assert.equal(await readFile(filename, 'utf8'), content, 'failed guarded navigation preserves canonical bytes');
    assert.deepEqual(errors, [], 'no browser runtime errors');
    console.log('PASS ' + name + ': lazy metadata, focused search, folder navigation, path/title filtering, duplicate basenames, keyboard, canonical preservation, retry, external refresh, guarded saves and responsive themes.');
  } finally {
    await context.close();
  }
}

try {
  await initializeMemoryRoot(root);
  await mkdir(captures, { recursive: true });
  await mkdir(path.join(temp, 'support'), { mode: 0o700 });
  for (const note of fixtures) await writeFixture(note);
  server = await startJumpyBrainHttpServer({ root, apiKeys: [key], port: 0, autoIndex: false });
  gateway = await startCompanionGateway({ runtimeRoot: path.resolve('.'), directory: path.join(temp, 'support'), initialRoot: root, port: 0, controlKey, credentials: { get: async () => null, set: async () => {}, delete: async () => {} } });
  browser = await launchPlaywrightChromium({ chromium: await loadPlaywrightChromium() });
  await checkSurface('hosted', server.url + '/#apiKey=' + key);
  await checkSurface('companion', gateway.url + '/#companion=' + controlKey);
  console.log('Folder explorer captures: ' + captures);
} finally {
  await browser?.close();
  await gateway?.close();
  await server?.close();
  await rm(temp, { recursive: true, force: true });
}
