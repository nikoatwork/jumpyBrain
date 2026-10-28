// Production editor shell and disposable Markdown only. The Electron smoke
// separately verifies the native window; this runner covers the document journey.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { initializeMemoryRoot } from '../dist/runtime/index.js';
import { startJumpyBrainHttpServer } from '../dist/server/index.js';
import { stampMemoryActor } from '../dist/core/contribution.js';
import { startCompanionGateway } from '../integrations/macos-companion/gateway.mjs';
import { loadPlaywrightChromium, launchPlaywrightChromium } from './playwright-runtime.mjs';
import { editorMarkdown, replaceEditorText, undoEditor } from './editor-smoke-helpers.mjs';

const temporary = await mkdtemp(path.join(os.tmpdir(), 'jumpybrain-note-workspace-'));
const root = path.join(temporary, 'memory');
const output = process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR || path.resolve('.local-pack/desktop/note-workspace');
const key = 'disposable-note-workspace-key';
const id = n => `mem_d7100000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const title = 'Launch plan — a shared working document for the product, research and customer experience teams';
const location = 'pages/projects/' + 'research-and-planning-'.repeat(6) + 'brief.md';
const file = path.join(root, location);
const body = [
  '## The goal', '',
  'Build a focused place where people and their agents can keep useful knowledge together. The first version should make writing, reviewing and returning to a document feel effortless.', '',
  '## Decisions', '',
  'Keep the first release small. The document stays readable while tools help maintain context. Every accepted edit remains in ordinary Markdown.', '',
  '### What matters', '',
  'A writer should know what is saved, reach the right section, and copy a useful draft without learning a new workflow.', '',
  '## Review plan', '',
  '- [ ] Review the customer language', '- [ ] Confirm the first release scope', '',
  '```md', '# This is code, not an outline heading', '```', '',
  '> ## This quoted text is literal, not a supported heading', '',
  '## Decisions', '',
  'The second decision section records the follow-up discussion. Repeated headings must remain distinct navigation targets.', '',
  '### Open questions', '',
  'Which details help a newcomer feel confident? Keep unanswered questions visible rather than suggesting every draft is final.', '',
  '## Next steps', '',
  'Ask a coworker to review the wording. Give an agent the current draft when extra context would help, and compare changes before accepting conflicting edits.', '',
  '## Sources', '',
  'The customer interview notes and release discussion provide the evidence. Related suggestions can help discovery, but do not prove a claim.',
].join('\n');
const prefix = (n, name) => `---\nid: ${id(n)}\ntitle: ${JSON.stringify(name)}\ntype: note\ncreated_at: 2026-10-27T10:00:00.000Z\nupdated_at: 2026-10-28T12:00:00.000Z\n---\n`;
const source = stampMemoryActor(prefix(1, title) + body, { kind: 'agent', name: 'Research assistant' });
const errors = [], mutations = [];
let browser, server, gateway;
const saved = page => page.waitForFunction(() => state.editor?.state.saveStatus === 'saved' && !state.editor.state.dirty && !state.editor.state.saveInFlight);
try {
  await initializeMemoryRoot(root);
  await mkdir(path.dirname(file), { recursive: true });
  await mkdir(output, { recursive: true });
  await writeFile(file, source);
  await writeFile(path.join(root, 'notes/empty.md'), prefix(2, 'A fresh document'));
  await writeFile(path.join(root, 'notes/second.md'), prefix(3, 'Coworker review') + '## Coworker review\n\nA separate document with independent context.\n');
  server = await startJumpyBrainHttpServer({ root, apiKeys: [key], port: 0, autoIndex: false });
  browser = await launchPlaywrightChromium({ chromium: await loadPlaywrightChromium() });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => {
    window.fixtureClipboard = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.fixtureClipboard.push(text); } } });
  });
  const page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (['PUT', 'PATCH', 'DELETE'].includes(request.method()) && /\/documents\//.test(request.url())) mutations.push(request.method());
  });
  const open = async n => {
    await page.goto(`${server.url}/?note=${id(n)}#apiKey=${key}`);
    await page.locator('#note-editor').waitFor({ state: 'visible' });
  };
  await open(1);
  assert.equal(await page.locator('#note-save-state').textContent(), 'Saved', 'a confirmed loaded baseline is visibly saved');
  assert.equal(await page.locator('#copy-note-draft').innerText(), 'Copy draft');
  assert.equal(await page.locator('#page-details').isHidden(), true);
  assert.equal(await page.locator('#delete-note').isVisible(), false);
  await page.evaluate(() => { window.fixtureEditorRoot = document.getElementById('note-editor'); });
  await page.locator('#toggle-page-details').click();
  await page.locator('#note-outline-list button').first().waitFor();
  const headings = await page.locator('#note-editor > :is(h1,h2,h3,h4,h5,h6)').allTextContents();
  assert.equal(headings.length, 8);
  assert.deepEqual(await page.locator('#note-outline-list button').allTextContents(), headings);
  assert.equal(await page.locator('#saved-version-editor').innerText(), 'Agent · Research assistant');
  assert.equal(await page.locator('#note-file').innerText(), location);
  assert.equal(await page.locator('#note-editor-hint').isHidden(), true);
  assert.equal(await page.locator('#saved-version-editor img').count(), 0);

  const duplicates = headings.flatMap((name, index) => name === 'Decisions' ? [index] : []);
  for (const index of duplicates) {
    await page.locator('#note-outline-list button').nth(index).click();
    await page.waitForFunction(index => {
      const selection = getSelection();
      let node = selection?.anchorNode;
      if (node?.nodeType === Node.TEXT_NODE) node = node.parentElement;
      return node?.closest?.('h1,h2,h3,h4,h5,h6') === document.querySelectorAll('#note-editor > :is(h1,h2,h3,h4,h5,h6)')[index];
    }, index);
  }
  assert.equal(await page.evaluate(() => fixtureEditorRoot === document.getElementById('note-editor')), true);
  assert.equal(await editorMarkdown(page), body);
  assert.equal(await readFile(file, 'utf8'), source);
  assert.deepEqual(mutations, [], 'context and section navigation never write canonical Markdown');

  // A useful navigation action puts subsequent typing in the selected section.
  await page.keyboard.insertText('Refined ');
  const refined = body.replace('## Decisions\n\nThe second', '## Refined Decisions\n\nThe second');
  await page.waitForFunction(expected => richEditor.getMarkdown() === expected, refined);
  await saved(page);
  await undoEditor(page);
  await page.waitForFunction(expected => richEditor.getMarkdown() === expected, body);
  await saved(page);

  await page.locator('#close-page-details').click();
  assert.equal(await page.locator('#page-details').isHidden(), true);
  assert.equal(await page.locator('#toggle-page-details').evaluate(element => element === document.activeElement), true);
  await page.locator('#toggle-page-details').click();
  await page.locator('#close-page-details').focus();
  await page.keyboard.press('Escape');
  await page.locator('#page-details').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#toggle-page-details').evaluate(element => element === document.activeElement), true);

  for (const width of [1280, 1180, 900, 390, 320]) for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; document.getElementById('note-panel').scrollTop = 0; }, theme);
    for (const expanded of [false, true]) {
      const current = await page.locator('#toggle-page-details').getAttribute('aria-expanded') === 'true';
      if (current !== expanded) await page.locator('#toggle-page-details').click();
      await page.evaluate(() => { document.getElementById('note-panel').scrollTop = 0; });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}px ${theme}, details ${expanded}: no document overflow`);
      assert.equal(await page.locator('#copy-note-draft').isVisible(), true);
      await page.waitForFunction(() => {
        const title = document.getElementById('note-name');
        return title.scrollHeight <= title.clientHeight + 1;
      });
      assert.equal(await page.locator('#note-name').evaluate(element => element.scrollHeight <= element.clientHeight + 1), true, 'long title grows after rail changes its writing width');
      if (expanded) {
        assert.equal(await page.locator('#page-details').evaluate(element => element.scrollWidth <= element.clientWidth + 1), true, 'long location wraps within details');
      }
      await page.screenshot({ path: path.join(output, `workspace-${width}-${theme}-${expanded ? 'context' : 'writing'}.png`) });
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('#close-page-details').click();

  // Dispatch supported DOM input and the copy click in one task, before the
  // ordinary 750ms debounce. Copy itself must not initiate a save or transmit.
  const beforeCopy = mutations.length;
  await page.evaluate(() => {
    const title = document.getElementById('note-name');
    title.value = 'Unsaved working copy'; title.dispatchEvent(new Event('input', { bubbles: true }));
    const editor = document.getElementById('note-editor'); editor.focus();
    const range = document.createRange(); range.selectNodeContents(editor); range.collapse(false);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
  });
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await page.keyboard.insertText(' A draft addition for review.');
  await page.evaluate(() => document.getElementById('copy-note-draft').click());
  await page.waitForFunction(() => fixtureClipboard.length === 1);
  const copied = await page.evaluate(() => ({ text: fixtureClipboard[0], title: state.editor.state.title, body: richEditor.getMarkdown(), dirty: state.editor.state.dirty }));
  assert.equal(copied.dirty, true);
  assert.equal(copied.text, copied.title + '\n\n' + copied.body);
  assert.match(copied.text, /A draft addition for review/);
  assert.equal(mutations.length, beforeCopy, 'copy adds no explicit save request');
  await page.locator('#toast-message').filter({ hasText: 'Draft copied' }).waitFor();
  await page.evaluate(() => state.editor.flush()); await saved(page);
  assert.doesNotMatch(await readFile(file, 'utf8'), /Start writing, or type/);

  await open(2);
  await page.locator('#note-editor-hint').waitFor({ state: 'visible' });
  await replaceEditorText(page, 'A first sentence.');
  await page.locator('#note-editor-hint').waitFor({ state: 'hidden' });
  await undoEditor(page);
  await page.locator('#note-editor-hint').waitFor({ state: 'visible' });
  await replaceEditorText(page, '```md\n# Not a page heading\n```');
  await page.locator('#note-editor-hint').waitFor({ state: 'hidden' });
  await undoEditor(page); await page.locator('#note-editor-hint').waitFor({ state: 'visible' });
  await page.evaluate(() => state.editor.flush());
  await page.locator('#toggle-page-details').click();
  assert.equal(await page.locator('#note-outline').isHidden(), true, 'empty document does not reserve an empty outline');
  await page.locator(`.sidebar-page-link[href*="${id(3)}"]`).first().click();
  await page.waitForURL(url => url.searchParams.get('note') === id(3));
  await page.locator('#note-editor').filter({ hasText: 'independent context' }).waitFor();
  assert.equal(await page.locator('#page-details').isHidden(), true, 'new note resets details');
  assert.equal(await page.locator('#note-outline-list button').count(), 0);
  await page.locator('#toggle-page-details').click();
  assert.deepEqual(await page.locator('#note-outline-list button').allTextContents(), ['Coworker review']);
  assert.equal(await page.locator('#saved-version-editor').innerText(), 'Editor unknown');
  assert.equal(await page.locator('#note-file').innerText(), 'notes/second.md');
  assert.doesNotMatch(await readFile(path.join(root, 'notes/empty.md'), 'utf8'), /Start writing, or type/);
  await context.close();

  // A real read-only remote brain keeps useful context/copy while empty-state
  // guidance never invites an edit the selected connection cannot perform.
  const directory = path.join(temporary, 'support'); await mkdir(directory, { mode: 0o700 });
  const controlKey = 'd'.repeat(64), keys = new Map();
  gateway = await startCompanionGateway({ runtimeRoot: process.cwd(), directory, initialRoot: root, port: 0, controlKey,
    credentials: { get: async ref => keys.get(ref), set: async (ref, value) => keys.set(ref, value), delete: async ref => keys.delete(ref) } });
  await gateway.store.save({ kind: 'remote', name: 'Review-only workspace', url: server.url, allowWrites: false, key }, gateway.store.snapshot().revision);
  const profile = gateway.store.snapshot().profiles.find(profile => profile.name === 'Review-only workspace');
  const switched = await fetch(gateway.url + '/companion/switch', { method: 'POST', headers: { Authorization: 'Bearer ' + controlKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: profile.id }) });
  assert.equal(switched.status, 200);
  const readonlyContext = await browser.newContext({ viewport: { width: 900, height: 900 } });
  await readonlyContext.request.post(gateway.url + '/companion/session', { data: { token: controlKey }, headers: { Origin: gateway.url } });
  const readonly = await readonlyContext.newPage(); readonly.on('pageerror', error => errors.push(error.message));
  await readonly.goto(`${gateway.url}/?note=${id(2)}&brain=${profile.id}`);
  await readonly.locator('#note-editor').waitFor({ state: 'visible' });
  assert.equal(await readonly.locator('#note-editor').getAttribute('aria-readonly'), 'true');
  assert.equal(await readonly.locator('#note-editor-hint').isHidden(), true);
  assert.equal(await readonly.locator('#copy-note-draft').isVisible(), true);
  await readonly.locator('#toggle-page-details').click();
  assert.equal(await readonly.locator('#delete-note').isDisabled(), true);
  await readonlyContext.close();
  assert.deepEqual(errors, []);
  console.log('PASS note workspace: loaded Saved, labeled copy, distinct live heading navigation/caret/edit/undo, code/literal exclusion, immutable clean context, accepted saved-version facts, focus/Escape, empty hint/undo/code/read-only, note scoping, current unsaved draft copy, 1280/1180/900/390/320px light/dark open/closed layouts. Screenshots: ' + output);
} finally {
  await browser?.close(); await gateway?.close(); await server?.close(); await rm(temporary, { recursive: true, force: true });
}
