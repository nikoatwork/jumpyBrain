// Production canonical saves and external edits; disposable notes only.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startJumpyBrainHttpServer } from '../dist/server/index.js';
import { loadPlaywrightChromium, launchPlaywrightChromium } from './playwright-runtime.mjs';
import { editorMarkdown, undoEditor } from './editor-smoke-helpers.mjs';
const root = await mkdtemp(path.join(os.tmpdir(), 'jumpybrain-markdown-formatting-'));
const id = 'mem_95000000-0000-4000-8000-000000000001', key = 'disposable-markdown-key';
const prefix = `---\nid: ${id}\ntitle: Markdown formatting\ncustom: retained\n---\n`;
const body = '# Everyday notes\n\n- [ ] Save this task\n  - [X] Nested task\n\nInline `[[Inert]] <b> @title` and ``a ` b``.\n\n````js\n\tconst sample = "[[Inert]]";\n\n```\n' + 'a'.repeat(260) + '\n````\n\n| Literal | Table |\n| --- | --- |\n\nTail';
let server, browser;
try {
  await mkdir(path.join(root, 'notes'));
  server = await startJumpyBrainHttpServer({ root, apiKeys: [key], port: 0, autoIndex: false });
  browser = await launchPlaywrightChromium({ chromium: await loadPlaywrightChromium() });
  for (const width of [1280, 390, 320]) {
    const file = path.join(root, 'notes/formatting.md');
    await writeFile(file, (prefix + body).replace(/\n/g, '\r\n'));
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage(), errors = [], puts = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.method() === 'PUT') puts.push(request.postDataJSON()); });
    await page.goto(`${server.url}/?note=${id}#apiKey=${key}`);
    await page.locator('#note-editor').waitFor({ state: 'visible' });
    assert.equal(await editorMarkdown(page), body);
    assert.equal(await page.getByRole('checkbox').count(), 2);
    assert.equal(await page.locator('#note-editor [role=link]').count(), 0);
    assert.equal(await page.locator('#note-editor table').count(), 1);
    for (const theme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: theme });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await page.locator('#note-editor pre[data-language]').evaluate(e => e.scrollWidth > e.clientWidth), true);
      await mkdir('/tmp/jumpybrain-markdown-qa', { recursive: true });
      await page.screenshot({ path: `/tmp/jumpybrain-markdown-qa/${width}-${theme}.png`, fullPage: true });
    }
    await page.waitForTimeout(850);
    assert.equal(puts.length, 0, 'opening and themes do not save');
    assert.equal(await readFile(file, 'utf8'), (prefix + body).replace(/\n/g, '\r\n'));
    await page.getByRole('checkbox').first().click(); await saved(page);
    const checked = body.replace('- [ ] Save', '- [x] Save');
    assert.equal(await editorMarkdown(page), checked);
    assert.ok(puts.at(-1).content.endsWith(checked.replace(/\n/g, '\r\n')));
    assert.equal(puts.at(-1).content.endsWith('\n'), false, 'no final newline added');
    await undoEditor(page); await saved(page); assert.equal(await editorMarkdown(page), body);
    await page.reload(); await page.locator('#note-editor').waitFor({ state: 'visible' });
    assert.equal(await editorMarkdown(page), body);

    await page.locator('#note-editor pre[data-language]').evaluate(element => {
      element.closest('[contenteditable]').focus();
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let node; while ((node = walker.nextNode())) if (node.textContent.includes('const sample')) break;
      const range = document.createRange(); range.setStart(node, 5); range.collapse(true);
      getSelection().removeAllRanges(); getSelection().addRange(range);
    });
    await page.evaluate(() => new Promise(requestAnimationFrame));
    let remote = '# Added externally\n' + body;
    await writeFile(file, prefix + remote);
    await page.waitForFunction(value => richEditor.getMarkdown() === value, remote);
    assert.equal(await page.evaluate(() => getSelection().anchorOffset), 5);
    assert.ok(await page.evaluate(() => getSelection().anchorNode.parentElement.closest('pre') !== null));
    assert.equal(await page.locator('#note-editor > .external-change').count(), 1);
    const writesBeforeRefresh = puts.length;
    const second = await context.newPage();
    await second.goto(`${server.url}/?note=${id}#apiKey=${key}`);
    await second.locator('#note-editor').waitFor({ state: 'visible' });
    await second.getByRole('checkbox').nth(1).click(); await saved(second);
    remote = remote.replace('  - [X] Nested', '  - [ ] Nested');
    await page.waitForFunction(value => richEditor.getMarkdown() === value, remote);
    assert.equal(puts.length, writesBeforeRefresh, 'two-tab refresh does not echo a save');
    await second.close();
    const first = page.getByRole('checkbox').first();

    // Server acceptance followed by a lost response retains an unconfirmed draft.
    await page.route('**/documents/' + id, async route => {
      if (route.request().method() !== 'PUT') return route.continue();
      await route.fetch(); await route.abort('failed');
    });
    await first.click();
    await page.waitForFunction(() => state.editor.state.saveStatus === 'failed');
    assert.equal(await page.evaluate(() => state.editor.state.unconfirmedSave), true);
    assert.equal(await editorMarkdown(page), remote.replace('- [ ] Save', '- [x] Save'));
    await page.unroute('**/documents/' + id);
    await page.getByRole('button', { name: 'Retry save', exact: true }).click();
    await page.waitForFunction(() => state.editor.state.saveErrorCode === 'precondition_failed');
    const acceptedDraft = remote.replace('- [ ] Save', '- [x] Save');
    assert.equal(await editorMarkdown(page), acceptedDraft);
    await page.locator('#note-recover').click();
    await page.waitForFunction(() => document.getElementById('recovery-saved').value.includes('- [x] Save this task'));
    assert.ok((await page.locator('#recovery-draft').inputValue()).includes(acceptedDraft));
    await page.locator('#recovery-reload').click();
    await page.waitForFunction(() => !document.getElementById('document-recovery').open && !state.editor.state.dirty && state.editor.state.saveStatus !== 'failed');
    assert.equal(await editorMarkdown(page), acceptedDraft);
    await first.click(); await saved(page);
    assert.equal(await editorMarkdown(page), remote);

    await page.route('**/documents/' + id, route => route.request().method() === 'PUT'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'fixture_failed', message: 'Save failed' } }) }) : route.continue());
    await first.click();
    await page.waitForFunction(() => state.editor.state.saveStatus === 'failed');
    const dirty = await editorMarkdown(page);
    assert.equal(dirty, remote.replace('- [ ] Save', '- [x] Save'));
    await page.evaluate(() => richEditor.setReadOnly(true));
    assert.equal(await first.isDisabled(), true);
    await first.dispatchEvent('click'); assert.equal(await editorMarkdown(page), dirty);
    await page.evaluate(() => richEditor.setReadOnly(false));
    await page.unroute('**/documents/' + id);
    await writeFile(file, prefix + remote + '\nExternal writer');
    await page.getByRole('button', { name: 'Retry save', exact: true }).click();
    await page.waitForFunction(() => state.editor.state.saveStatus === 'failed' && state.editor.state.saveErrorCode === 'precondition_failed');
    assert.equal(await editorMarkdown(page), dirty);
    assert.ok((await readFile(file, 'utf8')).endsWith('External writer'));
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`PASS canonical formatting/save/refresh/failure/conflict ${width}px`);
  }
} finally { if (browser) await browser.close(); if (server) await server.close(); await rm(root, { recursive: true, force: true }); }
async function saved(page) { await page.waitForFunction(() => document.querySelector('#note-save-state').textContent === 'Saved'); }
