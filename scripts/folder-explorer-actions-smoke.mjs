// Real hosted/companion writes against disposable Markdown; never touches an installed brain.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { folderExplorerMarkup } from '../dist/adapters/http-server/folder-explorer-view.js';
import { initializeMemoryRoot } from '../dist/runtime/index.js';
import { startJumpyBrainHttpServer } from '../dist/server/index.js';
import { startCompanionGateway } from '../integrations/macos-companion/gateway.mjs';
import { loadPlaywrightChromium, launchPlaywrightChromium } from './playwright-runtime.mjs';
const temporary = await mkdtemp(path.join(os.tmpdir(), 'jb-explorer-actions-'));
const root = path.join(temporary, 'memory');
const key = 'explorer-actions-test', controlKey = 'a'.repeat(64);
const id = n => 'mem_fd000000-0000-4000-8000-' + String(n).padStart(12, '0');
let server, gateway, browser;
async function checkLifecycle(page) {
  const result = await page.evaluate(async ({ markup, id }) => {
    const frame = document.createElement('iframe'); document.body.append(frame);
    const doc = frame.contentDocument, win = frame.contentWindow;
    doc.body.innerHTML = '<button id="toggle-folders">Folders</button>' + markup;
    let scope = 'first', writable = true, changed = 0, finishRead, finishWrite;
    const writes = [], files = [{ id, file: 'notes/source.md' }];
    const controller = JumpyBrainBrowser.installFolderExplorer({
      document: doc, window: win, scope: () => scope, enabled: () => true,
      fetch: async () => ({ files, folders: ['notes', 'notes/empty'] }), navigate: async () => true,
      operations: {
        writable: () => writable, link: () => '/?note=' + id, deleteFile: async () => {}, guard: operation => operation(), changed: () => { changed++; },
        json: (url, init) => init ? new Promise(resolve => { writes.push(JSON.parse(init.body)); finishWrite = resolve; }) : new Promise(resolve => { finishRead = resolve; }),
      },
    });
    const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
    const open = async () => { doc.getElementById('toggle-folders').click(); await settle(); doc.getElementById('folder-explorer-search').value = 'source'; doc.getElementById('folder-explorer-search').dispatchEvent(new win.Event('input')); };
    const rename = () => {
      doc.querySelector('[data-file-path]').dispatchEvent(new win.MouseEvent('contextmenu', { bubbles: true, clientX: 20, clientY: 20 }));
      [...doc.querySelectorAll('[role=menuitem]')].find(button => button.textContent === 'Rename…').click();
      doc.getElementById('folder-explorer-name').value = 'renamed.md'; doc.querySelector('#folder-explorer-edit form').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
    };
    try {
      await open(); rename(); await settle();
      scope = 'second'; controller.sync();
      const scopeCleared = !doc.getElementById('folder-explorer-edit').open && !doc.getElementById('folder-explorer-name').value;
      finishRead({ id, file: 'notes/source.md', contentHash: 'sha256:' + '0'.repeat(64) }); await settle();
      const noStaleWrite = writes.length === 0 && changed === 0 && !controller.isBusy();
      await open(); rename(); await settle(); finishRead({ id, file: 'notes/source.md', contentHash: 'sha256:' + '0'.repeat(64) }); await settle();
      const busy = controller.isBusy(); controller.close();
      finishWrite({ id, file: 'notes/renamed.md', moved: true }); await settle();
      const confirmedWhileClosed = changed === 1 && !controller.isBusy() && !controller.isOpen();
      writable = false; await open();
      const row = doc.querySelector('[data-file-path]'); row.dispatchEvent(new win.MouseEvent('contextmenu', { bubbles: true, clientX: 20, clientY: 20 }));
      const items = [...doc.querySelectorAll('[role=menuitem]')];
      const readOnly = !row.draggable && doc.getElementById('folder-explorer-new').disabled && items.find(button => button.textContent === 'Rename…').disabled && !items.find(button => button.textContent === 'Copy link to file').disabled;
      return { scopeCleared, noStaleWrite, busy, confirmedWhileClosed, readOnly };
    } finally { controller.close(false); frame.remove(); }
  }, { markup: folderExplorerMarkup, id: id(90) });
  assert.deepEqual(result, { scopeCleared: true, noStaleWrite: true, busy: true, confirmedWhileClosed: true, readOnly: true });
}

async function check(name, url, number) {
  const base = `notes/${name}`;
  await mkdir(path.join(root, base, 'alpha'), { recursive: true });
  await mkdir(path.join(root, base, 'beta'), { recursive: true });
  const content = `---\nid: ${id(number)}\ntitle: Explorer ${name}\ncustom: keep\n---\n\nKeep this note.\n`;
  await writeFile(path.join(root, base, 'alpha/original.md'), content);
  const keep = `---\nid: ${id(number + 1)}\ntitle: Survivor ${name}\n---\nSurvives deletion.\n`;
  await writeFile(path.join(root, base, 'beta/survivor.md'), keep);
  const context = await browser.newContext({ viewport: { width: 1280, height: 850 }, reducedMotion: 'reduce' });
  const page = await context.newPage(); page.setDefaultTimeout(12000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const tree = page.locator('#folder-explorer-tree'), menu = page.locator('#folder-explorer-menu'), dialog = page.locator('#folder-explorer-edit');
  const row = file => tree.locator(`[data-explorer-path=${JSON.stringify(file)}]`);
  const search = page.locator('#folder-explorer-search');
  const open = async () => { if (!await page.locator('#folder-explorer').isVisible()) await page.locator('#toggle-folders').click(); await page.locator('#folder-explorer').waitFor(); };
  const show = async file => { await open(); await search.fill(file); await row(file).waitFor(); };
  const action = async (file, label) => { await show(file); await row(file).click({ button: 'right' }); await menu.getByRole('menuitem', { name: label, exact: true }).click(); };
  try {
    await page.goto(url);
    await page.locator('#toggle-folders').waitFor();
    if (name === 'hosted') { await checkLifecycle(page); assert.deepEqual(errors, [], 'lifecycle runtime errors'); }
    await open(); await show(base + '/alpha/original.md');
    await row(base + '/alpha/original.md').click();
    await page.waitForFunction(expected => state.editor?.state.loaded && state.editor.state.documentId === expected, id(number));
    assert.equal(await row(base + '/alpha/original.md').getAttribute('draggable'), 'true', 'navigation leaves file dragging available');
    assert.equal(await page.locator('#folder-explorer-new').isDisabled(), false, 'navigation leaves folder creation available');
    // Capture the real clipboard call while avoiding platform-specific clipboard permissions in CI.
    await page.evaluate(() => { window.__explorerClipboard = ''; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.__explorerClipboard = text; } } }); });
    await action(base + '/alpha/original.md', 'Copy link to file');
    const copied = new URL(await page.evaluate(() => window.__explorerClipboard));
    assert.equal(copied.searchParams.get('note'), id(number));
    if (name === 'companion') assert.ok(copied.searchParams.has('brain'), 'copied links retain brain scope');
    assert.equal(copied.hash, '', 'no credentials in copied links');

    await action(base + '/alpha', 'New folder…');
    await page.locator('#folder-explorer-name').fill('Empty destination');
    await page.locator('#folder-explorer-save').click(); await dialog.waitFor({ state: 'hidden' });
    assert.ok((await stat(path.join(root, base, 'alpha/Empty destination'))).isDirectory());
    await show(base + '/alpha/Empty destination'); await page.locator('#folder-explorer-refresh').click();
    await row(base + '/alpha/Empty destination').waitFor();

    await action(base + '/alpha/original.md', 'Rename…');
    assert.deepEqual(await page.locator('#folder-explorer-name').evaluate(input => [input.selectionStart, input.selectionEnd]), [0, 8], 'filename stem selected');
    await page.locator('#folder-explorer-name').fill('cancelled.md');
    await page.locator('#folder-explorer-name').press('Escape'); await dialog.waitFor({ state: 'hidden' });
    assert.equal(await readFile(path.join(root, base, 'alpha/original.md'), 'utf8'), content);
    // A pending editor draft is flushed before the file operation; future saves use the new path.
    await page.locator('#folder-explorer-close').click();
    await page.locator('#note-name').fill('Edited before rename ' + name);
    await action(base + '/alpha/original.md', 'Rename…');
    await page.locator('#folder-explorer-name').fill('renamed.md');
    await page.locator('#folder-explorer-save').click(); await dialog.waitFor({ state: 'hidden' });
    const saved = await readFile(path.join(root, base, 'alpha/renamed.md'), 'utf8');
    assert.ok(saved.includes('Edited before rename ' + name)); assert.match(saved, /custom:\s*"?keep/);
    assert.equal(await page.evaluate(() => state.editor.state.file), base + '/alpha/renamed.md');
    await assert.rejects(readFile(path.join(root, base, 'alpha/original.md')));

    await show(base + '/alpha/renamed.md');
    await row(base + '/alpha/renamed.md').focus(); await row(base + '/alpha/renamed.md').press('Shift+F10');
    await menu.getByRole('menuitem', { name: 'Move to…', exact: true }).click();
    await page.locator('#folder-explorer-destination').selectOption(base + '/beta');
    await page.locator('#folder-explorer-save').click(); await dialog.waitFor({ state: 'hidden' });
    assert.equal(await readFile(path.join(root, base, 'beta/renamed.md'), 'utf8'), saved);
    // No-clobber collision leaves the source and existing destination untouched.
    await action(base + '/beta/renamed.md', 'Rename…');
    await page.locator('#folder-explorer-name').fill('survivor.md'); await page.locator('#folder-explorer-save').click();
    await page.locator('#folder-explorer-edit-error').filter({ hasText: 'already exists' }).waitFor();
    assert.equal(await readFile(path.join(root, base, 'beta/survivor.md'), 'utf8'), keep);
    await page.locator('#folder-explorer-cancel').click();

    await search.fill(name);
    // Folder-match search reveals both source and empty destination for a real HTML drag.
    await row(base + '/beta/renamed.md').waitFor(); await row(base + '/alpha/Empty destination').waitFor();
    await row(base + '/beta/renamed.md').dragTo(row(base + '/alpha/Empty destination'));
    await page.waitForFunction(expected => state.editor?.state.file === expected, base + '/alpha/Empty destination/renamed.md');
    assert.equal(await readFile(path.join(root, base, 'alpha/Empty destination/renamed.md'), 'utf8'), saved);
    await page.locator('#folder-explorer-close').click();
    await page.locator('#note-name').fill('After drag ' + name);
    await page.waitForFunction(() => state.editor?.state.saveStatus === 'saved');
    assert.ok((await readFile(path.join(root, base, 'alpha/Empty destination/renamed.md'), 'utf8')).includes('After drag ' + name));

    // Delete operates on the context target even when a different note is open.
    await action(base + '/beta/survivor.md', 'Delete file…');
    await page.locator('#document-delete').waitFor(); await page.locator('#delete-confirm').waitFor({ state: 'visible' });
    await page.locator('#delete-cancel').click();
    assert.equal(await readFile(path.join(root, base, 'beta/survivor.md'), 'utf8'), keep);
    assert.equal(await page.evaluate(() => state.editor.state.documentId), id(number), 'delete preview keeps the current editor');
    await action(base + '/beta/survivor.md', 'Delete file…');
    await page.locator('#delete-confirm').click(); await page.locator('#document-delete').waitFor({ state: 'hidden' });
    await assert.rejects(readFile(path.join(root, base, 'beta/survivor.md')));
    assert.equal(await page.evaluate(() => state.editor.state.documentId), id(number), 'deleting another file keeps the current editor');
    assert.ok((await readFile(path.join(root, base, 'alpha/Empty destination/renamed.md'), 'utf8')).includes('After drag ' + name));

    await show(base + '/alpha/Empty destination/renamed.md');
    for (const width of [1280, 390, 320]) for (const theme of ['light', 'dark']) {
      await page.setViewportSize({ width, height: 850 }); await page.evaluate(theme => colorTheme.setPreference(theme), theme);
      await show(base + '/alpha/Empty destination/renamed.md');
      await row(base + '/alpha/Empty destination/renamed.md').click({ button: 'right' });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const menuBounds = await menu.boundingBox();
      assert.ok(menuBounds.x >= 7 && menuBounds.x + menuBounds.width <= width - 7 && menuBounds.y >= 7 && menuBounds.y + menuBounds.height <= 851, 'menu fits ' + width + ': ' + JSON.stringify(menuBounds));
      await page.screenshot({ path: `/tmp/jumpybrain-explorer-actions-${name}-${width}-${theme}-menu.png` });
      await menu.getByRole('menuitem', { name: 'Rename…', exact: true }).click();
      const bounds = await dialog.boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1, 'dialog fits ' + width);
      await page.screenshot({ path: `/tmp/jumpybrain-explorer-actions-${name}-${width}-${theme}.png` });
      await page.locator('#folder-explorer-cancel').click();
    }
    await page.setViewportSize({ width: 1280, height: 850 });
    await page.locator('#folder-explorer-close').click();
    await page.locator('#notes-link').click();
    await page.waitForFunction(() => state.view === 'home' && !state.editor);
    await action(base + '/alpha/Empty destination/renamed.md', 'Delete file…');
    await page.locator('#delete-confirm').click();
    await page.locator('#document-delete').waitFor({ state: 'hidden' });
    await assert.rejects(readFile(path.join(root, base, 'alpha/Empty destination/renamed.md')));
    assert.equal(await page.evaluate(() => state.view), 'home', 'delete works without an active editor');
    assert.deepEqual(errors, [], 'no browser runtime errors');
    console.log('PASS ' + name + ': scoped links, empty folders, rename/stem selection/cancel, draft flush, keyboard move, collision safety, drag, post-move save, target delete/cancel, responsive themes.');
  } finally { await context.close(); }
}
try {
  await initializeMemoryRoot(root); await mkdir(path.join(temporary, 'support'), { mode: 0o700 });
  server = await startJumpyBrainHttpServer({ root, apiKeys: [key], port: 0, autoIndex: false });
  gateway = await startCompanionGateway({ runtimeRoot: path.resolve('.'), directory: path.join(temporary, 'support'), initialRoot: root, port: 0, controlKey, credentials: { get: async () => null, set: async () => {}, delete: async () => {} } });
  browser = await launchPlaywrightChromium({ chromium: await loadPlaywrightChromium() });
  await check('hosted', server.url + '/#apiKey=' + key, 1);
  await check('companion', gateway.url + '/#companion=' + controlKey, 3);
} finally { await browser?.close(); await gateway?.close(); await server?.close(); await rm(temporary, { recursive: true, force: true }); }
