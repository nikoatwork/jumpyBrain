// Real HTTP/canonical editor regression for tables, quiet references and slash
// commands. Writes only this disposable root; uses the repository browser runner.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startJumpyBrainHttpServer } from '../dist/server/index.js';
import { loadPlaywrightChromium, launchPlaywrightChromium } from './playwright-runtime.mjs';
import { editorMarkdown as editorSource, replaceEditorText, selectEditorText, undoEditor, appendEditorText, openNoteFormatting } from './editor-smoke-helpers.mjs';
import { installCollaborationSmokeTransport } from './collaboration-smoke-transport.mjs';
// The live editor keeps the canonical source's newline style once it adopts a
// published snapshot; exact CRLF bytes are asserted on the file instead.
const editorMarkdown = async page => (await editorSource(page)).replace(/\r\n/g, '\n');
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
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // Editor saves publish over the live WebSocket; count mutating RPCs and inject failures there.
    const liveTransport = await installCollaborationSmokeTransport(page);
    const readOnlyMethods = new Set(['hello', 'ping', 'open', 'close', 'presence', 'resync', 'history.read', 'recovery.read']);
    const writes = () => liveTransport.observed.filter(message => !readOnlyMethods.has(message.method)).length;
    await page.goto(`${server.url}/?note=${id}#apiKey=${key}`);
    await liveReady(page);
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
    await page.waitForTimeout(850); assert.equal(writes(), 0, 'hydration/focus/themes have no save');
    assert.equal(await readFile(file, 'utf8'), (prefix + body).replace(/\n/g, '\r\n'));
    await appendEditorText(page, ' edited'); await saved(page);
    const savedSource = await readFile(file, 'utf8');
    assert.ok(savedSource.endsWith('---\r\n' + (body + ' edited').replace(/\n/g, '\r\n')), 'saves keep canonical CRLF body and no final newline');
    assert.match(savedSource, /^custom: "?retained"?\r$/m, 'unrelated frontmatter is retained');
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
    const beforeRefresh = writes();
    await page.locator('#note-name').blur();
    await writeFile(file, prefix + body.replace('42 |', '84 |'));
    await page.waitForFunction(value => richEditor.getMarkdown() === value, body.replace('42 |', '84 |'));
    assert.equal(await page.locator('table td').nth(1).textContent(), '84');
    assert.equal(writes(), beforeRefresh, 'external refresh does not echo a save');
    await page.reload(); await liveReady(page);
    assert.equal(await editorMarkdown(page), body.replace('42 |', '84 |'));
    // Reference title edit keeps canonical brackets, then reopens exactly.
    await pointIn(page, '[data-page-reference]', 'One', 3);
    await page.keyboard.type(' revised'); await saved(page);
    assert.ok((await editorMarkdown(page)).includes('[[One revised]] [[Two]] [[Missing]]'));
    await page.reload(); await liveReady(page);
    assert.equal(await page.locator('[data-page-reference]').first().textContent(), '[[One revised]]');

    for (const [alias, selector, expected] of [
      ['text', 'p', 'Content'], ['h1', 'h1', '# Content'], ['h2', 'h2', '## Content'], ['h3', 'h3', '### Content'],
      ['checkbox', '.markdown-task', '- [ ] Content'], ['code-block', '.markdown-code-block', '```\nContent\n```'],
    ]) {
      // Publish the typed text first: live Undo reverts one published edit, and input
      // within the 35 ms publish debounce would share the command's undo unit.
      await replaceEditorText(page, '/' + alias + 'Content'); await saved(page);
      await selectEditorText(page, alias.length + 1);
      await page.getByRole('listbox', { name: 'Formatting commands' }).waitFor({ state: 'visible' });
      await page.keyboard.press('Enter');
      await saved(page);
      assert.equal(await editorMarkdown(page), expected, alias + ' consumes only token and preserves suffix');
      assert.ok(await page.locator('#note-editor > ' + selector).count());
      // Live Undo is a server round trip; wait for it to settle before reading.
      await undoEditor(page); await page.waitForFunction(value => richEditor.getMarkdown() === value, '/' + alias + 'Content').catch(() => {});
      assert.equal(await editorMarkdown(page), '/' + alias + 'Content', 'command is one undo step');
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
    await page.waitForFunction(() => document.querySelector('.editor-slash-menu [aria-selected=true]')?.getAttribute('aria-label') === 'Heading 2');
    assert.equal(await menu.getByRole('option', { selected: true }).locator('.editor-slash-label').textContent(), 'Heading 2');
    for (const theme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: theme });
      const box = await menu.boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= width);
      await page.screenshot({ path: path.join(output, `${width}-${theme}-slash.png`), fullPage: true });
    }
    await page.keyboard.press('Enter'); await page.keyboard.type('Chosen'); await saved(page);
    assert.equal(await editorMarkdown(page), '## Chosen');
    await page.reload(); await liveReady(page);
    assert.equal(await page.locator('#note-editor h2').textContent(), 'Chosen');
    await replaceEditorText(page, '# /text'); await selectEditorText(page, 5);
    await menu.waitFor({ state: 'visible' });
    await menu.getByRole('option', { name: 'Text', exact: true }).click();
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
    // A formatting command still uses the guarded save controller after failure;
    // rejected live publication is recovered through explicit review.
    await replaceEditorText(page, '/h2'); await selectEditorText(page, 3); await menu.waitFor({ state: 'visible' });
    const failedEdit = liveTransport.rejectNext('edit', { code: 'fixture_failed', message: 'Save failed' });
    await page.keyboard.press('Enter'); await failedEdit.arrived; await page.keyboard.type('Retained draft');
    await page.waitForFunction(() => state.editor.state.saveStatus === 'failed');
    assert.equal(await editorMarkdown(page), '## Retained draft');
    assert.equal((await readFile(file, 'utf8')).endsWith('## Retained draft'), false, 'failed draft stays private');
    await page.getByRole('button', { name: 'Review changes', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('document-recovery').open && !document.getElementById('recovery-publish').disabled);
    await page.getByRole('button', { name: 'Keep my changes', exact: true }).click(); await saved(page);
    assert.ok((await readFile(file, 'utf8')).endsWith('## Retained draft'));
    assert.deepEqual(errors, []);
    await page.close(); console.log(`PASS editor feedback tables/references/slash/guarded save ${width}px`);
  }
  console.log(`Screenshots: ${output}`);
} finally { if (browser) await browser.close(); if (server) await server.close(); await rm(root, { recursive: true, force: true }); }
// Visibility is not editing-ready: the live open snapshot may still repaint the note.
async function liveReady(page) {
  await page.locator('#note-editor').waitFor({ state: 'visible' });
  await page.waitForFunction(() => state.editor?.collaboration?.state.status === 'saved' && document.querySelector('#note-editor')?.isContentEditable);
}
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
