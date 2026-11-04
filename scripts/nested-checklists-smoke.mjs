// Production editor and canonical saves over a disposable Markdown root.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startJumpyBrainHttpServer } from '../dist/server/index.js';
import { loadPlaywrightChromium, launchPlaywrightChromium } from './playwright-runtime.mjs';
import { editorMarkdown, undoEditor } from './editor-smoke-helpers.mjs';
const root = await mkdtemp(path.join(os.tmpdir(), 'jumpybrain-nested-tasks-'));
const id = 'mem_95000000-0000-4000-8000-000000000001', key = 'disposable-nested-tasks';
const prefix = `---\nid: ${id}\ntitle: Nested tasks\n---\n`;
const initial = '- [ ] Parent\n- [x] Child\n  - [ ] Grandchild\n- [ ] Sibling\n\nTail';
const nested = '- [ ] Parent\n  - [x] Child\n    - [ ] Grandchild\n- [ ] Sibling\n\nTail';
let server, browser;
async function caret(page, label, end = true) {
  await page.waitForFunction(() => document.querySelector('#note-editor')?.isContentEditable);
  await page.locator('#note-editor .markdown-task > span').filter({ hasText: new RegExp(`^${label}$`) }).evaluate((span, end) => {
    span.closest('[contenteditable]').focus();
    const range = document.createRange(); range.selectNodeContents(span); range.collapse(!end);
    getSelection().removeAllRanges(); getSelection().addRange(range);
  }, end);
  await page.waitForFunction(({ label, end }) => {
    const source = richEditor.getMarkdown(), caret = richEditor.collaborativeSelection();
    const expected = source.indexOf(label) + (end ? label.length : 0);
    return caret?.anchor === expected && caret.focus === expected;
  }, { label, end });
}
async function saved(page, source, file) {
  try { await page.waitForFunction(source => richEditor.getMarkdown() === source && state.editor?.collaboration?.state.status === 'saved', source); } catch (error) { console.error(await page.evaluate(() => ({markdown:richEditor.getMarkdown(), status:state.editor?.collaboration?.state, save:state.editor?.state.saveStatus}))); throw error; }
  assert.equal((await readFile(file, 'utf8')).split('---\n').at(-1), source);
}
try {
  await mkdir(path.join(root, 'notes'));
  server = await startJumpyBrainHttpServer({ root, apiKeys: [key], port: 0, autoIndex: false });
  browser = await launchPlaywrightChromium({ chromium: await loadPlaywrightChromium() });
  for (const width of [1280, 390, 320]) {
    const file = path.join(root, 'notes/tasks.md'); await writeFile(file, prefix + initial);
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${server.url}/?note=${id}#apiKey=${key}`);
    await saved(page, initial, file);
    const dimensions = await page.locator('#note-editor [data-task-toggle]').first().evaluate(button => {
      const style = getComputedStyle(button, '::before'), rect = button.getBoundingClientRect();
      return { size: rect.width, target: rect.width - parseFloat(style.left) - parseFloat(style.right) };
    });
    assert.ok(dimensions.size >= 16 && dimensions.size <= 17, JSON.stringify(dimensions));
    assert.ok(dimensions.target >= 24, 'smaller visual retains at least 24px hit area');
    await caret(page, 'Child'); await page.keyboard.press('Tab'); await saved(page, nested, file);
    assert.equal(await page.locator('#note-editor .markdown-task').nth(2).evaluate(row => row.style.paddingInlineStart), '4ch');
    await undoEditor(page); await saved(page, initial, file);
    await caret(page, 'Child'); await page.keyboard.press('Tab'); await saved(page, nested, file);
    await page.keyboard.press('Shift+Tab'); await saved(page, initial, file);
    await page.keyboard.press('Tab'); await saved(page, nested, file);
    await caret(page, 'Child', false); await page.keyboard.press('Backspace'); await saved(page, initial, file);
    await caret(page, 'Child'); await page.keyboard.press('Tab'); await saved(page, nested, file);
    await caret(page, 'Child', false);
    await page.locator('#note-editor').evaluate(element => element.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'deleteContentBackward' })));
    await saved(page, initial, file);
    await caret(page, 'Grandchild'); await page.keyboard.press('Tab');
    // Cannot skip a level: the preceding task is still at the root.
    assert.equal(await editorMarkdown(page), initial);
    await caret(page, 'Child'); await page.keyboard.press('Tab'); await saved(page, nested, file);
    await caret(page, 'Grandchild'); await page.keyboard.press('Enter');
    const continued = nested.replace('Grandchild\n', 'Grandchild\n    - [ ] \n');
    await saved(page, continued, file);
    // Native/mobile input arrives without a keyboard Enter event.
    await page.locator('#note-editor').evaluate(element => element.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertParagraph' })));
    const outdented = nested.replace('Grandchild\n', 'Grandchild\n  - [ ] \n');
    await saved(page, outdented, file);
    await page.keyboard.press('Enter'); await saved(page, nested.replace('Grandchild\n', 'Grandchild\n- [ ] \n'), file);
    await page.locator('#note-editor').evaluate(element => element.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertParagraph' })));
    const exited = nested.replace('Grandchild\n', 'Grandchild\n\n'); await saved(page, exited, file);
    await page.reload(); await saved(page, exited, file);
    assert.equal(await page.locator('#note-editor [data-task-toggle]').count(), 4);
    for (const theme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: theme });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    assert.deepEqual(errors, []); await context.close();
    console.log(`PASS nested checklist indentation/subtrees/undo/continuation/reopen/size ${width}px`);
  }
} finally { await browser?.close(); await server?.close(); await rm(root, { recursive: true, force: true }); }
