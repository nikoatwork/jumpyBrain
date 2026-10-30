// Shared production shell, disposable Markdown and no installed/personal app changes.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { initializeMemoryRoot } from '../dist/runtime/index.js';
import { stampMemoryActor } from '../dist/core/contribution.js';
import { startJumpyBrainHttpServer } from '../dist/server/index.js';
import { loadPlaywrightChromium, launchPlaywrightChromium } from './playwright-runtime.mjs';
import { appendEditorText, editorMarkdown, editorSelection, selectEditorText } from './editor-smoke-helpers.mjs';
const root = await mkdtemp(path.join(os.tmpdir(), 'jb-collaborative-sidebar-'));
const captures = '/tmp/jumpybrain-collaborative-sidebar-qa';
const id = n => `mem_ab000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const key = 'disposable-sidebar-key';
let server, browser;
try {
  await initializeMemoryRoot(root); await mkdir(captures, { recursive: true });
  const note = async (n, title, kind) => {
    const content = `---\nid: ${id(n)}\ntype: note\ntitle: ${JSON.stringify(title)}\nupdated_at: 2026-10-29T12:00:${String(n).padStart(2, '0')}Z\n---\nCollaborative page ${n}.\n`;
    await writeFile(path.join(root, 'notes', `${n}.md`), stampMemoryActor(content, kind ? { kind, name: kind === 'agent' ? 'Mistral' : 'Alex' } : undefined, true));
  };
  for (let n = 1; n <= 12; n++) await note(n, n === 1 ? 'Human draft' : n === 2 ? 'Agent contribution' : `Page ${n}`, n === 1 ? 'human' : n === 2 ? 'agent' : undefined);
  server = await startJumpyBrainHttpServer({ root, apiKeys: [key], port: 0, autoIndex: false });
  const json = async (url, options = {}) => {
    const response = await fetch(server.url + url, { ...options, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...options.headers } });
    assert.equal(response.status, 200, await response.clone().text()); return response.json();
  };
  const doc = n => `/memories/all/documents/${id(n)}`;
  const settle = async n => { const before = await json(doc(n)); return json(doc(n), { method: 'PATCH', headers: { 'If-Match': before.contentHash }, body: JSON.stringify({ action: 'settle' }) }); };
  await settle(2);
  browser = await launchPlaywrightChromium({ chromium: await loadPlaywrightChromium() });
  const context = await browser.newContext({ viewport: { width: 1280, height: 850 } });
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.clock.install();
  await page.goto(`${server.url}/?note=${id(1)}#apiKey=${key}`);
  await page.locator('#note-editor').waitFor();
  await page.waitForFunction(() => document.querySelectorAll('#sidebar-recent a').length === 8);
  assert.equal(await page.locator('#sidebar-settled-section').getAttribute('open'), null);
  assert.equal(await page.locator('#sidebar-settled a').count(), 0, 'collapsed shelf does not hydrate hidden rows');
  await page.locator('#sidebar-recent-more').click();
  await page.locator(`#sidebar-recent [data-page-link="${id(1)}"] [data-editor-kind="human"]`).waitFor();
  await page.locator(`#sidebar-recent [data-page-pin="${id(1)}"]`).focus(); await page.keyboard.press('Enter');
  await page.locator(`#sidebar-pinned [data-page-link="${id(1)}"]`).waitFor();
  assert.equal(await page.locator('.nav-library ul').first().getAttribute('id'), 'sidebar-pinned');
  await page.locator('#sidebar-settled-section summary').click();
  const agent = page.locator(`#sidebar-settled [data-page-link="${id(2)}"] [data-editor-kind="agent"]`); await agent.waitFor();
  assert.match(await agent.getAttribute('aria-label'), /agent.*Mistral/);
  await page.locator(`#sidebar-settled [data-page-link="${id(2)}"]`).focus();
  await page.locator(`#sidebar-settled [data-page-action="${id(2)}:reactivate"]`).focus(); await page.keyboard.press("Enter");
  await page.locator(`#sidebar-recent [data-page-link="${id(2)}"]`).waitFor();
  assert.equal((await json(doc(2))).frontmatter.attention_at, undefined);
  // Settle from the row; edit the canonical file without changing timestamps.
  await page.locator(`#sidebar-recent [data-page-link="${id(2)}"]`).focus();
  await page.locator(`#sidebar-recent [data-page-action="${id(2)}:settle"]`).focus(); await page.keyboard.press('Enter');
  await page.locator(`#sidebar-settled [data-page-link="${id(2)}"]`).waitFor();
  await selectEditorText(page, 4); const caret = await editorSelection(page); const body = await editorMarkdown(page);
  const original = await readFile(path.join(root, 'notes', '2.md'), 'utf8');
  await writeFile(path.join(root, 'notes', '2.md'), original.replace('Collaborative page 2.', 'Untracked external contribution.'));
  await note(13, 'New shared page', 'agent');
  const human = await json(doc(1));
  await json(doc(1), { method: 'PUT', headers: { 'If-Match': human.contentHash }, body: JSON.stringify({ content: human.content.replace('Human draft', 'Renamed shared draft'), actor: { kind: 'agent', name: 'Mistral' } }) });
  await page.clock.fastForward(16000);
  await page.locator(`#sidebar-recent [data-page-link="${id(13)}"]`).waitFor();
  await page.locator(`#sidebar-recent [data-page-link="${id(2)}"] [data-editor-kind="unknown"]`).waitFor();
  await page.locator(`#sidebar-pinned [data-page-link="${id(1)}"] [data-editor-kind="agent"]`).waitFor();
  assert.equal(await page.locator(`#sidebar-pinned [data-page-link="${id(1)}"] .sidebar-page-title`).textContent(), 'Renamed shared draft');
  assert.equal(await editorMarkdown(page), body, 'background sidebar updates preserve body');
  assert.deepEqual(await editorSelection(page), caret, 'background sidebar updates preserve caret');
  assert.equal(await readFile(path.join(root, 'notes', '2.md'), 'utf8'), original.replace('Collaborative page 2.', 'Untracked external contribution.'));
  // A browser content save reopens a settled page and records the human editor.
  await page.locator(`#sidebar-recent [data-page-link="${id(2)}"]`).click();
  await page.waitForFunction(id => state.editor?.state.documentId === id && state.editor.state.loaded, id(2));
  await page.locator(`#sidebar-recent [data-page-link="${id(2)}"]`).focus();
  await page.locator(`#sidebar-recent [data-page-action="${id(2)}:settle"]`).focus(); await page.keyboard.press('Enter');
  await page.waitForFunction(() => state.editor.state.frontmatterPrefix.includes('attention_at: null') && !state.editor.state.navigationPending);
  await appendEditorText(page, ' A human adds a thought.'); await page.clock.fastForward(1000);
  await page.waitForFunction(() => state.editor.state.saveStatus === 'saved' && !state.editor.state.dirty);
  await page.locator(`#sidebar-recent [data-page-link="${id(2)}"] [data-editor-kind="human"]`).waitFor();
  assert.equal((await json(doc(2))).frontmatter.attention_at, undefined);
  // Quiet polling retains row DOM and keyboard focus.
  const target = page.locator(`#sidebar-pinned [data-page-link="${id(1)}"]`);
  await target.focus(); const handle = await target.elementHandle();
  await page.clock.fastForward(16000);
  await page.waitForFunction(() => document.querySelector('#sidebar-recent-empty').hidden);
  assert.equal(await handle.evaluate(el => el.isConnected && document.activeElement === el), true);
  await settle(3); await page.clock.fastForward(16000);
  await page.locator(`#sidebar-settled [data-page-link="${id(3)}"]`).waitFor();
  for (const width of [1280, 390, 320]) for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width, height: 850 });
    await page.evaluate(value => colorTheme.setPreference(value), theme);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}/${theme} fits`);
    await page.locator('#sidebar-settled-section summary').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(captures, `sidebar-${width}-${theme}.png`) });
  }
  await page.setViewportSize({ width: 1280, height: 850 }); await page.reload();
  await page.locator('#sidebar-pinned .sidebar-page-editor[data-editor-kind="agent"]').waitFor();
  assert.equal(await page.locator('#sidebar-settled-section').getAttribute('open'), null);
  const shelf = await page.locator('#sidebar-settled-section summary').boundingBox();
  assert.ok(shelf.y >= 0 && shelf.y + shelf.height < 790, 'collapsed Settled stays visible below the scrolling Attention list');
  await page.screenshot({ path: path.join(captures, 'sidebar-default.png') });
  assert.deepEqual(errors, []);
  console.log('Collaborative sidebar smoke: PASS (sections, paging, actor icons, periodic create/edit refresh, raw and browser wake, caret/focus, six layouts).');
} finally {
  await browser?.close(); await server?.close(); await rm(root, { recursive: true, force: true });
}
