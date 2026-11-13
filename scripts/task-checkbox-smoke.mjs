// Task checkbox rendering and exact-byte toggles over disposable Markdown.
// Optional: --screenshots DIR writes one screenshot per width.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startJumpyBrainHttpServer } from '../dist/server/index.js';
import { loadPlaywrightChromium, launchPlaywrightChromium } from './playwright-runtime.mjs';
import { undoEditor } from './editor-smoke-helpers.mjs';

const shots = process.argv.includes('--screenshots') ? process.argv[process.argv.indexOf('--screenshots') + 1] : null;
const root = await mkdtemp(path.join(os.tmpdir(), 'jumpybrain-task-checkboxes-'));
const key = 'disposable-task-checkboxes';
const reported = '- [ ] Shape Vicky Calls You as the next Agent initiative: second and later calls, recurring-call triggers. Start in the product brain note "Open (PM to plan): Vicky Calls You"';
const notes = {
  agent: ['## Next', reported, '- [ ] Ship <beta> -> owners [P1] ~2d', '* [X] Upper-case done', '- Topic bullet', '  - [ ] Step under bullet', '1. [ ] ordered stays literal', '', 'Tail'].join('\n'),
  tabs: ['- [ ] Imported parent', '\t- [x] Child done', '\t\t- [ ] Grandchild', '\t- [ ] Second child', '- [ ] Next root'].join('\n'),
  spaces: ['- [ ] Four parent', '    - [ ] Four child', '        - [x] Four grandchild', '- [ ] Four root'].join('\n'),
};
const ids = { agent: 'mem_96000000-0000-4000-8000-000000000001', tabs: 'mem_96000000-0000-4000-8000-000000000002', spaces: 'mem_96000000-0000-4000-8000-000000000003' };
const file = name => path.join(root, `notes/${name}.md`);
const prefix = name => `---\nid: ${ids[name]}\ntitle: Tasks ${name}\n---\n`;
let server, browser;

async function saved(page, name, source) {
  try {
    await page.waitForFunction(source => richEditor.getMarkdown() === source && state.editor?.collaboration?.state.status === 'saved', source);
  } catch (error) { console.error(JSON.stringify(await page.evaluate(() => richEditor.getMarkdown()))); throw error; }
  assert.equal((await readFile(file(name), 'utf8')).replace(/^---\n[\s\S]*?\n---\n/, ''), source);
}
const toggle = (page, index) => page.locator('#note-editor [data-task-toggle]').nth(index);
async function caretAtEnd(page, label, start = false) {
  await page.waitForFunction(() => document.querySelector('#note-editor')?.isContentEditable);
  await page.locator('#note-editor .markdown-task > span').filter({ hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).evaluate((span, start) => {
    span.closest('[contenteditable]').focus();
    const range = document.createRange(); range.selectNodeContents(span); range.collapse(start);
    getSelection().removeAllRanges(); getSelection().addRange(range);
  }, start);
  await page.waitForTimeout(50);
}
async function open(context, name) {
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${server.url}/?note=${ids[name]}#apiKey=${key}`);
  await page.waitForFunction(() => document.querySelector('#note-editor')?.isContentEditable);
  await saved(page, name, notes[name]);
  return { page, errors };
}
const rows = page => page.locator('#note-editor .markdown-task').evaluateAll(rows => rows.map(row => ({
  text: row.lastElementChild.textContent, pad: row.style.paddingInlineStart, checked: row.firstElementChild.getAttribute('aria-checked'), literal: row.classList.contains('markdown-literal'),
})));

try {
  await mkdir(path.join(root, 'notes'));
  server = await startJumpyBrainHttpServer({ root, apiKeys: [key], port: 0, autoIndex: false });
  browser = await launchPlaywrightChromium({ chromium: await loadPlaywrightChromium() });
  for (const width of [1280, 390]) {
    for (const name of Object.keys(notes)) await writeFile(file(name), prefix(name) + notes[name]);
    const context = await browser.newContext({ viewport: { width, height: 900 } });

    // Agent-written shapes: the reported line, an unsupported label kept literal, `*`/`X`, a task under a bullet.
    let { page, errors } = await open(context, 'agent');
    assert.deepEqual(await rows(page), [
      { text: reported.slice(6), pad: '0ch', checked: 'false', literal: false },
      { text: 'Ship <beta> -> owners [P1] ~2d', pad: '0ch', checked: 'false', literal: true },
      { text: 'Upper-case done', pad: '0ch', checked: 'true', literal: false },
      { text: 'Step under bullet', pad: '2ch', checked: 'false', literal: false },
    ]);
    assert.equal(await page.locator('#note-editor > .markdown-literal:not(.markdown-task)').count(), 1, 'ordered task stays one literal line');
    const agent = notes.agent;
    await toggle(page, 0).click(); await saved(page, 'agent', agent.replace(reported, reported.replace('[ ]', '[x]')));
    assert.equal(await toggle(page, 0).getAttribute('aria-checked'), 'true');
    await undoEditor(page); await saved(page, 'agent', agent);
    await toggle(page, 1).focus(); await page.keyboard.press('Space');
    await saved(page, 'agent', agent.replace('- [ ] Ship', '- [x] Ship'));
    await page.keyboard.press('Enter'); await saved(page, 'agent', agent);
    // Unchecking `X` writes one byte; after the save is acknowledged, Undo restores `X`.
    await toggle(page, 2).click(); await saved(page, 'agent', agent.replace('* [X]', '* [ ]'));
    await undoEditor(page); await saved(page, 'agent', agent);
    await toggle(page, 2).click(); await saved(page, 'agent', agent.replace('* [X]', '* [ ]'));
    await toggle(page, 2).click(); await saved(page, 'agent', agent);
    await toggle(page, 3).click(); await saved(page, 'agent', agent.replace('  - [ ] Step', '  - [x] Step'));
    await undoEditor(page); await saved(page, 'agent', agent);
    // The literal label stays literal source when edited.
    await caretAtEnd(page, 'Ship <beta> -> owners [P1] ~2d'); await page.keyboard.type(' *now*');
    await saved(page, 'agent', agent.replace('~2d', '~2d *now*'));
    assert.equal(await page.locator('#note-editor .markdown-task.markdown-literal .editor-italic').count(), 0);
    await undoEditor(page); await saved(page, 'agent', agent);
    // Enter continues with another literal task; Backspace at the start keeps the label as a literal line.
    await caretAtEnd(page, 'Ship <beta> -> owners [P1] ~2d'); await page.keyboard.press('Enter'); await page.keyboard.type('a_b <c>');
    await saved(page, 'agent', agent.replace('~2d', '~2d\n- [ ] a_b <c>'));
    await undoEditor(page); await saved(page, 'agent', agent);
    await caretAtEnd(page, 'Ship <beta> -> owners [P1] ~2d', true); await page.keyboard.press('Backspace');
    await saved(page, 'agent', agent.replace('- [ ] Ship', 'Ship'));
    await undoEditor(page); await saved(page, 'agent', agent);
    await page.reload(); await page.waitForFunction(() => document.querySelector('#note-editor')?.isContentEditable); await saved(page, 'agent', agent);
    assert.equal(await page.locator('#note-editor [data-task-toggle]').count(), 4);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal page scroll');
    if (shots) await page.screenshot({ path: path.join(shots, `task-checkboxes-${width}.png`) });
    assert.deepEqual(errors, []); await page.close();

    // Obsidian-style tab nesting keeps hierarchy, toggles and Tab indentation in tabs.
    ({ page, errors } = await open(context, 'tabs'));
    assert.deepEqual((await rows(page)).map(row => row.pad + row.checked), ['0chfalse', '2chtrue', '4chfalse', '2chfalse', '0chfalse']);
    await toggle(page, 2).click(); await saved(page, 'tabs', notes.tabs.replace('\t\t- [ ]', '\t\t- [x]'));
    await undoEditor(page); await saved(page, 'tabs', notes.tabs);
    await caretAtEnd(page, 'Next root'); await page.keyboard.press('Tab');
    await saved(page, 'tabs', notes.tabs.replace('- [ ] Next root', '\t- [ ] Next root'));
    await undoEditor(page); await saved(page, 'tabs', notes.tabs);
    await page.reload(); await page.waitForFunction(() => document.querySelector('#note-editor')?.isContentEditable); await saved(page, 'tabs', notes.tabs);
    assert.deepEqual(errors, []); await page.close();

    // Four-space nesting is recognized as one level per four spaces.
    ({ page, errors } = await open(context, 'spaces'));
    assert.deepEqual((await rows(page)).map(row => row.pad + row.checked), ['0chfalse', '2chfalse', '4chtrue', '0chfalse']);
    await toggle(page, 1).click(); await saved(page, 'spaces', notes.spaces.replace('    - [ ] Four child', '    - [x] Four child'));
    await caretAtEnd(page, 'Four root'); await page.keyboard.press('Tab');
    await saved(page, 'spaces', notes.spaces.replace('    - [ ] Four child', '    - [x] Four child').replace('- [ ] Four root', '    - [ ] Four root'));
    assert.deepEqual(errors, []); await page.close();
    await context.close();
    console.log(`PASS task checkbox render/click/keyboard/undo/literal label/nesting/reopen ${width}px`);
  }
} finally { await browser?.close(); await server?.close(); await rm(root, { recursive: true, force: true }); }
