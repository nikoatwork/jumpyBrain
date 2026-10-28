// Real HTTP/canonical editor regression for tables, quiet references and slash
// commands. Writes only this disposable root; uses the repository browser runner.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startJumpyBrainHttpServer } from '../dist/server/index.js';
import { loadPlaywrightChromium, launchPlaywrightChromium } from './playwright-runtime.mjs';
import { editorMarkdown, replaceEditorText, selectEditorText, undoEditor, appendEditorText, openNoteFormatting } from './editor-smoke-helpers.mjs';
const root = await mkdtemp(path.join(os.tmpdir(), 'jumpybrain-editor-feedback-'));
const output = process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR || '/tmp/jumpybrain-editor-feedback-qa';
const id = 'mem_96000000-0000-4000-8000-000000000001', key = 'disposable-editor-feedback';
const prefix = `---\nid: ${id}\ntitle: Editor feedback\ncustom: retained\n---\n`;
const table = '| Name | Value |\n| :--- | ---: |\n| café | 42 |\n| a\\|b | `x|y` |\n| Long sample | ' + 'wide'.repeat(60) + ' |\n| [[One]] | [link](https://example.test) |';
const body = '# Editor examples\n\nStandard **bold** and __also bold__.\n** spaced bold **\n**trailing space **\n** leading space**\n\n[[One]] [[Two]] [[Missing]]\n\n' + table + '\n\n`[[Code]] /h1`\n\n```md\n| inert | table |\n| --- | --- |\n/h1 [[Code]]\n```\n\n| Bad | Shape |\n| --- | --- |\n| one | two | three |\n\nTail';
let server, browser;
try {
  await mkdir(path.join(root, 'notes')); await mkdir(output, { recursive: true });
  server = await startJumpyBrainHttpServer({ root, apiKeys: [key], port: 0, autoIndex: false });
  browser = await launchPlaywrightChromium({ chromium: await loadPlaywrightChromium() });
  for (const width of [1280, 390, 320]) {
    const file = path.join(root, 'notes/feedback.md');
    await writeFile(file, (prefix + body).replace(/\n/g, '\r\n'));
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    page.setDefaultTimeout(8000);
    const errors = [], puts = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.method() === 'PUT') puts.push(request.postDataJSON()); });
    await page.goto(`${server.url}/?note=${id}#apiKey=${key}`);
    await page.locator('#note-editor').waitFor({ state: 'visible' });
    assert.equal(await editorMarkdown(page), body);
    assert.equal(await page.locator('#note-editor .editor-bold').count(), 2, 'valid bold renders; spaced delimiters stay literal');
    assert.equal(await page.locator('#note-editor table').count(), 1, 'only supported table renders');
    assert.equal(await page.locator('table th').count(), 2);
    assert.equal(await page.locator('table td').nth(2).textContent(), 'a|b');
    assert.equal(await page.locator('table td').nth(3).textContent(), '`x|y`');
    assert.equal(await page.locator('#note-editor [data-page-reference]').count(), 3, 'code and table preview stay inert');
    for (const theme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: theme });
      await page.locator('#note-name').focus();
      await page.waitForFunction(() => document.querySelector('#note-editor.reference-markers-ready'));
      const brackets = () => page.locator('[data-page-reference]').first().evaluate(e => {
        const range = document.createRange(); range.setStart(e.firstChild, 0); range.setEnd(e.firstChild, 2);
        return range.getBoundingClientRect().width;
      });
      assert.equal(await brackets(), 0, 'reading brackets leave no gap');
      await pointIn(page, '[data-page-reference]', 'One', 1);
      assert.ok(await brackets() > 0, 'editing the reference block restores brackets');
      await pointIn(page, 'h1', 'Editor', 1);
      assert.equal(await brackets(), 0, 'editing another block leaves reference brackets collapsed');
      await page.locator('#note-name').focus();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await page.locator('.markdown-table-preview').evaluate(e => e.scrollWidth > e.clientWidth), true, 'wide cells scroll inside table');
      await page.screenshot({ path: path.join(output, `${width}-${theme}-reading.png`), fullPage: true });
    }
    await page.waitForTimeout(850); assert.equal(puts.length, 0, 'hydration/focus/themes have no save');
    assert.equal(await readFile(file, 'utf8'), (prefix + body).replace(/\n/g, '\r\n'));
    await appendEditorText(page, ' edited'); await saved(page);
    assert.ok(puts.at(-1).content.endsWith((body + ' edited').replace(/\n/g, '\r\n')));
    assert.equal(puts.at(-1).content.endsWith('\n'), false);
    await undoEditor(page); await saved(page); assert.equal(await editorMarkdown(page), body);
    await page.locator('.markdown-table summary').click();
    await pointIn(page, '.markdown-table pre', '42', 2);
    await page.keyboard.type('0'); await saved(page);
    const tableEdited = body.replace('42 |', '420 |');
    assert.equal(await editorMarkdown(page), tableEdited);
    assert.equal(await page.locator('table td').nth(1).textContent(), '420');
    await undoEditor(page); await saved(page); assert.equal(await editorMarkdown(page), body);
    await pointIn(page, '.markdown-table pre', '42 |', 4);
    await page.keyboard.type(' extra |'); await saved(page);
    assert.equal(await editorMarkdown(page), body.replace('42 |', '42 | extra |'), 'invalid table edit keeps every source character');
    assert.equal(await page.locator('.markdown-table table').count(), 0);
    assert.equal(await page.locator('.markdown-table details').evaluate(e => e.open), true);
    await undoEditor(page); await saved(page); assert.equal(await editorMarkdown(page), body);
    // External table revision is accepted without echo-saving or stale undo.
    const beforeRefresh = puts.length;
    await page.locator('#note-name').blur();
    await writeFile(file, prefix + body.replace('42 |', '84 |'));
    await page.waitForFunction(value => richEditor.getMarkdown() === value, body.replace('42 |', '84 |'));
    assert.equal(await page.locator('table td').nth(1).textContent(), '84');
    assert.equal(puts.length, beforeRefresh);
    await page.reload(); await page.locator('#note-editor').waitFor({ state: 'visible' });
    assert.equal(await editorMarkdown(page), body.replace('42 |', '84 |'));
    // Reference title edit keeps canonical brackets, then reopens exactly.
    await pointIn(page, '[data-page-reference]', 'One', 3);
    await page.keyboard.type(' revised'); await saved(page);
    assert.ok((await editorMarkdown(page)).includes('[[One revised]] [[Two]] [[Missing]]'));
    await page.reload(); await page.locator('#note-editor').waitFor({ state: 'visible' });
    assert.equal(await page.locator('[data-page-reference]').first().textContent(), '[[One revised]]');

    for (const [alias, selector, expected] of [
      ['text', 'p', 'Content'], ['h1', 'h1', '# Content'], ['h2', 'h2', '## Content'], ['h3', 'h3', '### Content'],
      ['checkbox', '.markdown-task', '- [ ] Content'], ['code-block', '.markdown-code-block', '```\nContent\n```'],
    ]) {
      await replaceEditorText(page, '/' + alias + 'Content');
      await selectEditorText(page, alias.length + 1);
      await page.getByRole('listbox', { name: 'Formatting commands' }).waitFor({ state: 'visible' });
      await page.keyboard.press('Enter');
      await saved(page);
      assert.equal(await editorMarkdown(page), expected, alias + ' consumes only token and preserves suffix');
      assert.ok(await page.locator('#note-editor > ' + selector).count());
      await undoEditor(page); assert.equal(await editorMarkdown(page), '/' + alias + 'Content', 'command is one undo step');
      await saved(page);
    }
    for (const [alias, marker] of [['bold', '**'], ['italic', '*'], ['code', '`']]) {
      await replaceEditorText(page, '/' + alias);
      await selectEditorText(page, alias.length + 1);
      await page.getByRole('listbox', { name: 'Formatting commands' }).waitFor({ state: 'visible' });
      await page.keyboard.press('Enter'); await page.keyboard.type('formatted'); await saved(page);
      assert.equal(await editorMarkdown(page), marker + 'formatted' + marker);
    }
    await replaceEditorText(page, '/h'); await selectEditorText(page, 2);
    const menu = page.getByRole('listbox', { name: 'Formatting commands' });
    await menu.waitFor({ state: 'visible' });
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(() => document.querySelector('.editor-slash-menu [aria-selected=true]')?.textContent === 'Heading 2  /h2');
    assert.equal(await menu.getByRole('option', { selected: true }).textContent(), 'Heading 2  /h2');
    for (const theme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: theme });
      const box = await menu.boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= width);
      await page.screenshot({ path: path.join(output, `${width}-${theme}-slash.png`), fullPage: true });
    }
    await page.keyboard.press('Enter'); await page.keyboard.type('Chosen'); await saved(page);
    assert.equal(await editorMarkdown(page), '## Chosen');
    await page.reload(); await page.locator('#note-editor').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#note-editor h2').textContent(), 'Chosen');
    await replaceEditorText(page, '# /text'); await selectEditorText(page, 5);
    await menu.waitFor({ state: 'visible' });
    await menu.getByRole('option', { name: 'Text /text' }).click();
    await saved(page); assert.equal(await editorMarkdown(page), '', 'Text converts an empty heading by pointer');
    await replaceEditorText(page, '/h1'); await selectEditorText(page, 3);
    await menu.waitFor({ state: 'visible' }); await page.keyboard.press('Escape');
    assert.equal(await menu.isVisible(), false); assert.equal(await editorMarkdown(page), '/h1');
    await page.keyboard.type(' literal'); await saved(page); assert.equal(await editorMarkdown(page), '/h1 literal');
    for (const source of ['https://example.test/h1', 'path/h1', '`/h1`', '```\n/h1\n```', '- /h1']) {
      // Explicitly leave the previous code block before replacing this fixture.
      await openNoteFormatting(page);
      await page.getByRole('button', { name: 'Normal text', exact: true }).click();
      await replaceEditorText(page, source); await selectEditorText(page, (await page.locator('#note-editor').textContent()).length);
      await page.waitForTimeout(40); assert.equal(await menu.isVisible(), false, source);
      assert.equal(await editorMarkdown(page), source);
    }
    await replaceEditorText(page, '/h1'); await selectEditorText(page, 3); await menu.waitFor({ state: 'visible' });
    await page.locator('#note-editor').dispatchEvent('compositionstart');
    assert.equal(await menu.isVisible(), false);
    await page.keyboard.press('Enter'); assert.ok((await editorMarkdown(page)).startsWith('/h1'));
    await page.locator('#note-editor').dispatchEvent('compositionend');
    await replaceEditorText(page, '/h1'); await selectEditorText(page, 3); await menu.waitFor({ state: 'visible' });
    await saved(page);
    assert.equal(await page.evaluate(() => { richEditor.setReadOnly(true); richEditor.format('h2'); return richEditor.getMarkdown(); }), '/h1');
    assert.equal(await menu.isVisible(), false);
    await page.evaluate(() => richEditor.setReadOnly(false));
    // A formatting command still uses the guarded save controller after failure.
    await replaceEditorText(page, '/h2'); await selectEditorText(page, 3); await menu.waitFor({ state: 'visible' });
    await page.route('**/documents/' + id, route => route.request().method() === 'PUT'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'fixture_failed', message: 'Save failed' } }) }) : route.continue());
    await page.keyboard.press('Enter'); await page.keyboard.type('Retained draft');
    await page.waitForFunction(() => state.editor.state.saveStatus === 'failed');
    assert.equal(await editorMarkdown(page), '## Retained draft');
    await page.unroute('**/documents/' + id);
    await page.getByRole('button', { name: 'Retry save', exact: true }).click(); await saved(page);
    assert.ok((await readFile(file, 'utf8')).endsWith('## Retained draft'));
    assert.deepEqual(errors, []);
    await page.close(); console.log(`PASS editor feedback tables/references/slash/guarded save ${width}px`);
  }
  console.log(`Screenshots: ${output}`);
} finally { if (browser) await browser.close(); if (server) await server.close(); await rm(root, { recursive: true, force: true }); }
async function saved(page) { await page.waitForFunction(() => document.querySelector('#note-save-state').textContent === 'Saved'); }
async function pointIn(page, selector, needle, offset) {
  await page.locator('#note-editor ' + selector).first().evaluate((element, { needle, offset }) => {
    element.closest('[contenteditable]').focus();
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT); let node;
    while ((node = walker.nextNode())) if (node.textContent.includes(needle)) break;
    if (!node) throw new Error('Missing selection text: ' + needle);
    const range = document.createRange(); range.setStart(node, node.textContent.indexOf(needle) + offset); range.collapse(true);
    getSelection().removeAllRanges(); getSelection().addRange(range);
  }, { needle, offset });
  await page.evaluate(() => new Promise(requestAnimationFrame));
}
